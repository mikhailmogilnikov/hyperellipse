/**
 * Сканирование CSSOM: в браузерах без corner-shape само свойство
 * выбрасывается парсером, поэтому селекторы элементов находим по
 * кастомному свойству `--corner-shape`, которое доживает до CSSOM.
 */

export const CORNER_SHAPE_VAR = "--corner-shape";

/**
 * Глобальный множитель радиуса для SSR-фоллбека: пользователь пишет
 * `border-radius: calc(45px * var(--corner-scale, 1))` и активирует
 * `--corner-scale: 0.6` на :root через `@supports not (corner-shape: ...)`.
 */
export const CORNER_SCALE_VAR = "--corner-scale";

// Только longhands: shorthand border-radius в CSSOM всегда развёрнут в них.
const RADIUS_PROPS = [
  "border-top-left-radius",
  "border-top-right-radius",
  "border-bottom-right-radius",
  "border-bottom-left-radius",
] as const;

export interface PendingRadiusRule {
  /** Цепочка обёрток вида "@media (...)", "@supports (...)". */
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
    // Cross-origin стайлшит — пропускаем (есть option.selector как escape hatch).
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
    // @layer и прочие группирующие правила: спускаемся без обёртки —
    // наш pending-шит не слоёный и выигрывает каскад у слоёных правил.
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
 * Находит селекторы правил с `--corner-shape` и декларации радиусов
 * (из этих же или других правил с теми же селекторами) для pending-редукции.
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
