import { splitTopLevel } from "./parse";
import { CORNER_SCALE_VAR, type PendingRadiusRule } from "./scan";

/**
 * Pending-редукция: пока фоллбек не применил clip-path, элементы
 * показываются с уменьшенным border-radius — сквиркл визуально
 * скругляется слабее круга, так «прыжок» формы куда менее заметен.
 * После применения инлайновый `border-radius: 0` элемента
 * перекрывает это правило.
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
    // Радиусы на var(--corner-scale) уже уменьшены чистым CSS — не дублируем.
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
  /** Переносит шит в конец head, чтобы выигрывать у позже добавленных стилей. */
  bump: () => void;
  remove: () => void;
  setDisabled: (disabled: boolean) => void;
  update: (css: string) => void;
}

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
