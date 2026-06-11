import { splitTopLevel } from "./parse";
import { CORNER_SCALE_VAR, type PendingRadiusRule } from "./scan";

/**
 * Automatic pending radius reduction (secondary to the CSS `--corner-scale`
 * snippet). Until the fallback applies `clip-path`, matched elements show a
 * scaled-down `border-radius` — squircles visually round less than circles, so
 * the shape jump is softer. Per-element `border-radius: 0` overrides this once
 * applied. Only runs after JS loads; does not cover the SSR-to-bundle gap.
 */

const WHITESPACE_PATTERN = /\s+/;

const scaleRadiusValue = (value: string, scale: number): string => {
  const sides = splitTopLevel(value, "/");
  const scaledSides = sides.map((side) =>
    side
      .split(WHITESPACE_PATTERN)
      .filter(Boolean)
      .map((token) => `calc((${token}) * ${scale})`)
      .join(" ")
  );
  return scaledSides.join(" / ");
};

const wrapConditions = (body: string, conditions: string[]): string => {
  let wrapped = body;
  for (let i = conditions.length - 1; i >= 0; i -= 1) {
    wrapped = `${conditions[i]}{${wrapped}}`;
  }
  return wrapped;
};

export const buildPendingCss = (
  rules: PendingRadiusRule[],
  scale: number
): string => {
  const chunks: string[] = [];
  for (const rule of rules) {
    // Radii already scaled via `var(--corner-scale)` in author CSS — skip.
    const declarations = rule.declarations
      .filter(([, value]) => !value.includes(CORNER_SCALE_VAR))
      .map(([prop, value]) => `${prop}:${scaleRadiusValue(value, scale)};`)
      .join("");
    if (declarations) {
      chunks.push(
        wrapConditions(`${rule.selector}{${declarations}}`, rule.conditions)
      );
    }
  }
  return chunks.join("\n");
};

export interface ManagedSheet {
  /** Moves the sheet to the end of `<head>` so it wins over later-added styles. */
  bump: () => void;
  remove: () => void;
  setDisabled: (disabled: boolean) => void;
  update: (css: string) => void;
}

/** Creates an injectable `<style data-hyperellipse="…">` managed by the engine. */
export const createManagedSheet = (
  doc: Document,
  marker: string
): ManagedSheet => {
  const style = doc.createElement("style");
  style.setAttribute("data-hyperellipse", marker);
  doc.head.appendChild(style);

  return {
    update: (css: string) => {
      if (style.textContent !== css) {
        style.textContent = css;
      }
    },
    bump: () => {
      if (doc.head.lastElementChild !== style) {
        doc.head.appendChild(style);
      }
    },
    setDisabled: (disabled: boolean) => {
      if (style.sheet) {
        style.sheet.disabled = disabled;
      }
    },
    remove: () => {
      style.remove();
    },
  };
};
