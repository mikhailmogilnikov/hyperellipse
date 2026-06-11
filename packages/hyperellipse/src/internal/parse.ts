import type { CornerShapeList, CornerShapeParam } from "./geometry";

/** Maps `corner-shape` keywords to their `superellipse()` parameter. */
const SHAPE_KEYWORDS: Record<string, CornerShapeParam> = {
  round: 1,
  squircle: 2,
  square: Number.POSITIVE_INFINITY,
  bevel: 0,
  scoop: -1,
  notch: Number.NEGATIVE_INFINITY,
};

const SHAPE_TOKEN_PATTERN =
  /superellipse\(\s*(-?infinity|-?\d*\.?\d+(?:e[+-]?\d+)?)\s*\)|round|squircle|square|bevel|scoop|notch/gi;

const PERCENT = 100;
const MAX_SHAPE_VALUES = 4;

const parseSuperellipseArg = (raw: string): CornerShapeParam => {
  const lower = raw.toLowerCase();
  if (lower === "infinity") {
    return Number.POSITIVE_INFINITY;
  }
  if (lower === "-infinity") {
    return Number.NEGATIVE_INFINITY;
  }
  return Number.parseFloat(raw);
};

/** Expands 1–4 shape values using the same shorthand rules as `corner-shape`. */
const expandShapes = (values: CornerShapeParam[]): CornerShapeList | null => {
  const [a, b, c, d] = values;
  if (a === undefined) {
    return null;
  }
  if (b === undefined) {
    return [a, a, a, a];
  }
  if (c === undefined) {
    return [a, b, a, b];
  }
  if (d === undefined) {
    return [a, b, c, b];
  }
  return [a, b, c, d];
};

/**
 * Parses a `--corner-shape` value (1–4 values, same shorthand as native):
 * keywords or `superellipse(K)`.
 */
export const parseCornerShape = (value: string): CornerShapeList | null => {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const values: CornerShapeParam[] = [];
  SHAPE_TOKEN_PATTERN.lastIndex = 0;
  let match = SHAPE_TOKEN_PATTERN.exec(trimmed);
  while (match !== null && values.length < MAX_SHAPE_VALUES) {
    const arg = match[1];
    if (arg === undefined) {
      const keyword = SHAPE_KEYWORDS[match[0].toLowerCase()];
      if (keyword !== undefined) {
        values.push(keyword);
      }
    } else {
      const parsed = parseSuperellipseArg(arg);
      if (!Number.isNaN(parsed)) {
        values.push(parsed);
      }
    }
    match = SHAPE_TOKEN_PATTERN.exec(trimmed);
  }
  return expandShapes(values);
};

export interface RadiusComponent {
  isPercent: boolean;
  value: number;
}

/** Elliptical corner radius: separate horizontal (x) and vertical (y) components. */
export interface CornerRadius {
  x: RadiusComponent;
  y: RadiusComponent;
}

export type CornerRadiusList = [
  CornerRadius,
  CornerRadius,
  CornerRadius,
  CornerRadius,
];

const ZERO_COMPONENT: RadiusComponent = { value: 0, isPercent: false };

const WHITESPACE_PATTERN = /\s+/;

const parseRadiusComponent = (raw: string | undefined): RadiusComponent => {
  if (!raw) {
    return ZERO_COMPONENT;
  }
  const value = Number.parseFloat(raw);
  if (Number.isNaN(value)) {
    return ZERO_COMPONENT;
  }
  return { value, isPercent: raw.includes("%") };
};

/** Parses a computed longhand radius: `"45px"`, `"10% 20px"`, etc. */
export const parseRadiusLonghand = (value: string): CornerRadius => {
  const parts = value.trim().split(WHITESPACE_PATTERN);
  const x = parseRadiusComponent(parts[0]);
  const y = parts.length > 1 ? parseRadiusComponent(parts[1]) : x;
  return { x, y };
};

const resolveComponent = (component: RadiusComponent, basis: number): number =>
  component.isPercent ? (component.value / PERCENT) * basis : component.value;

interface ResolvedRadius {
  rx: number;
  ry: number;
}

/**
 * Resolves percentages against box dimensions and applies the standard
 * CSS corner-radius overlap constraint (proportional scale-down).
 */
export const resolveRadii = (
  radii: CornerRadiusList,
  width: number,
  height: number
): [ResolvedRadius, ResolvedRadius, ResolvedRadius, ResolvedRadius] => {
  const resolved = radii.map((radius) => ({
    rx: Math.max(resolveComponent(radius.x, width), 0),
    ry: Math.max(resolveComponent(radius.y, height), 0),
  })) as [ResolvedRadius, ResolvedRadius, ResolvedRadius, ResolvedRadius];

  const [tl, tr, br, bl] = resolved;
  const ratios = [
    width / (tl.rx + tr.rx || 1),
    height / (tr.ry + br.ry || 1),
    width / (br.rx + bl.rx || 1),
    height / (bl.ry + tl.ry || 1),
  ];
  const scale = Math.min(1, ...ratios);
  if (scale < 1) {
    for (const radius of resolved) {
      radius.rx *= scale;
      radius.ry *= scale;
    }
  }
  return resolved;
};

/** Splits a value by `separator` at the top level only (outside parentheses). */
export const splitTopLevel = (value: string, separator: string): string[] => {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (const char of value) {
    if (char === "(") {
      depth += 1;
    } else if (char === ")") {
      depth -= 1;
    }
    if (char === separator && depth === 0) {
      parts.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  if (current.trim()) {
    parts.push(current.trim());
  }
  return parts;
};

export interface ParsedShadow {
  blur: number;
  color: string;
  spread: number;
  x: number;
  y: number;
}

const LENGTH_PATTERN = /-?\d*\.?\d+px/g;
const DEFAULT_SHADOW_COLOR = "rgba(0,0,0,0.35)";

const parseSingleShadow = (raw: string): ParsedShadow | null => {
  if (raw.includes("inset")) {
    return null;
  }
  LENGTH_PATTERN.lastIndex = 0;
  const lengths = raw.match(LENGTH_PATTERN) ?? [];
  const [x = "0px", y = "0px", blur = "0px", spread = "0px"] = lengths;
  const color = raw.replace(LENGTH_PATTERN, "").trim() || DEFAULT_SHADOW_COLOR;
  return {
    x: Number.parseFloat(x),
    y: Number.parseFloat(y),
    blur: Number.parseFloat(blur),
    spread: Number.parseFloat(spread),
    color,
  };
};

/** Parses computed `box-shadow`; inset shadows are dropped (not reproduced). */
export const parseBoxShadow = (value: string): ParsedShadow[] => {
  if (!value || value === "none") {
    return [];
  }
  const shadows: ParsedShadow[] = [];
  for (const part of splitTopLevel(value, ",")) {
    const shadow = parseSingleShadow(part);
    if (shadow) {
      shadows.push(shadow);
    }
  }
  return shadows;
};

/** Repeats a comma-separated background sub-property list to match `background-image` layer count. */
export const expandLayerList = (value: string, count: number): string[] => {
  const parts = splitTopLevel(value, ",");
  if (parts.length === 0) {
    return [];
  }
  const expanded: string[] = [];
  for (let i = 0; i < count; i += 1) {
    expanded.push(parts[i % parts.length] ?? "");
  }
  return expanded;
};

const TRANSPARENT_PATTERN =
  /^(?:transparent|rgba?\(\s*0\s*,\s*0\s*,\s*0\s*,\s*0\s*\)|rgba?\(0,\s*0,\s*0,\s*0\))$/i;

export const isTransparentColor = (color: string): boolean =>
  TRANSPARENT_PATTERN.test(color.trim());
