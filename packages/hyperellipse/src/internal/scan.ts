/**
 * CSSOM scanner. Browsers without `corner-shape` discard the native property
 * during parsing, so element selectors are discovered via the custom property
 * `--corner-shape`, which survives in the stylesheet object model.
 */

export const CORNER_SHAPE_VAR = "--corner-shape";

/**
 * Global radius multiplier for the SSR CSS fallback. Authors write
 * `border-radius: calc(45px * var(--corner-scale, 1))` and activate
 * `--corner-scale: 0.6` on `:root` via `@supports not (corner-shape: ...)`.
 * See `hyperellipse/css` and the README for the full snippet.
 */
export const CORNER_SCALE_VAR = "--corner-scale";

// Longhands only — the `border-radius` shorthand is always expanded in CSSOM.
const RADIUS_PROPS = [
  "border-top-left-radius",
  "border-top-right-radius",
  "border-bottom-right-radius",
  "border-bottom-left-radius",
] as const;

export interface PendingRadiusRule {
  /** Wrapper chain, e.g. `@media (...)`, `@supports (...)`. */
  conditions: string[];
  declarations: [string, string][];
  selector: string;
}

export interface ScanResult {
  pendingRules: PendingRadiusRule[];
  selectors: string[];
}

interface RuleEntry {
  conditions: string[];
  selector: string;
  style: CSSStyleDeclaration;
}

const readRules = (sheet: CSSStyleSheet | null): CSSRuleList | null => {
  if (!sheet) {
    return null;
  }
  try {
    return sheet.cssRules;
  } catch {
    // Cross-origin stylesheet — skip (use `options.selector` as escape hatch).
    return null;
  }
};

const collectEntries = (
  rules: CSSRuleList,
  conditions: string[],
  entries: RuleEntry[]
): void => {
  for (const rule of rules) {
    if (rule instanceof CSSStyleRule) {
      entries.push({
        selector: rule.selectorText,
        style: rule.style,
        conditions,
      });
      continue;
    }
    if (rule instanceof CSSImportRule) {
      const imported = readRules(rule.styleSheet);
      if (imported) {
        const media = rule.media.mediaText;
        const next = media ? [...conditions, `@media ${media}`] : conditions;
        collectEntries(imported, next, entries);
      }
      continue;
    }
    if (rule instanceof CSSMediaRule) {
      collectEntries(
        rule.cssRules,
        [...conditions, `@media ${rule.conditionText}`],
        entries
      );
      continue;
    }
    if (rule instanceof CSSSupportsRule) {
      collectEntries(
        rule.cssRules,
        [...conditions, `@supports ${rule.conditionText}`],
        entries
      );
      continue;
    }
    // @layer and other grouping rules: descend without wrapping — our pending
    // sheet is unlayered and wins the cascade over layered author rules.
    const grouping = rule as Partial<CSSGroupingRule>;
    if (grouping.cssRules) {
      collectEntries(grouping.cssRules, conditions, entries);
    }
  }
};

const collectRadiusDeclarations = (
  style: CSSStyleDeclaration
): [string, string][] => {
  const declarations: [string, string][] = [];
  for (const prop of RADIUS_PROPS) {
    const value = style.getPropertyValue(prop).trim();
    if (value && style.getPropertyPriority(prop) !== "important") {
      declarations.push([prop, value]);
    }
  }
  return declarations;
};

/**
 * Finds selectors of rules declaring `--corner-shape` and collects radius
 * declarations from matching rules (same selector) for automatic pending reduction.
 */
export const scanDocument = (doc: Document): ScanResult => {
  const entries: RuleEntry[] = [];
  for (const sheet of doc.styleSheets) {
    const ownerNode = sheet.ownerNode;
    if (
      ownerNode instanceof Element &&
      ownerNode.hasAttribute("data-hyperellipse")
    ) {
      continue;
    }
    const rules = readRules(sheet as CSSStyleSheet);
    if (rules) {
      collectEntries(rules, [], entries);
    }
  }

  const selectorSet = new Set<string>();
  for (const entry of entries) {
    if (entry.style.getPropertyValue(CORNER_SHAPE_VAR).trim()) {
      selectorSet.add(entry.selector);
    }
  }

  const pendingRules: PendingRadiusRule[] = [];
  for (const entry of entries) {
    if (!selectorSet.has(entry.selector)) {
      continue;
    }
    const declarations = collectRadiusDeclarations(entry.style);
    if (declarations.length > 0) {
      pendingRules.push({
        selector: entry.selector,
        conditions: entry.conditions,
        declarations,
      });
    }
  }

  return { selectors: [...selectorSet], pendingRules };
};
