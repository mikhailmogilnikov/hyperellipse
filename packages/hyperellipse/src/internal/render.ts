import {
  buildShapePath,
  type CornerShapeList,
  offsetCorners,
  type ResolvedCorners,
} from "./geometry";
import {
  type CornerRadiusList,
  expandLayerList,
  isTransparentColor,
  type ParsedShadow,
  parseBoxShadow,
  parseCornerShape,
  parseRadiusLonghand,
  resolveRadii,
  splitTopLevel,
} from "./parse";
import { CORNER_SHAPE_VAR } from "./scan";

/** Native `round` — no fallback needed when all corners use this shape. */
const ROUND_SHAPE = 1;
const HALF = 0.5;
/** CSS box-shadow blur radius = 2 × Gaussian `stdDeviation` (per spec). */
const BLUR_STD_DEV_RATIO = 0.5;

const RADIUS_LONGHANDS = [
  "border-top-left-radius",
  "border-top-right-radius",
  "border-bottom-right-radius",
  "border-bottom-left-radius",
] as const;

export interface SourceBorder {
  color: string;
  visible: boolean;
  width: number;
}

export interface SourceOutline {
  color: string;
  offset: number;
  width: number;
}

export interface SourceBackground {
  attachment: string;
  clip: string;
  color: string;
  image: string;
  origin: string;
  position: string;
  repeat: string;
  size: string;
}

/** Snapshot of author styles read before applying fallback overrides. */
export interface SourceStyles {
  background: SourceBackground;
  border: SourceBorder;
  outline: SourceOutline | null;
  position: string;
  radii: CornerRadiusList;
  shadows: ParsedShadow[];
  shapes: CornerShapeList;
}

const readBorder = (cs: CSSStyleDeclaration): SourceBorder => {
  const width = Number.parseFloat(cs.borderTopWidth) || 0;
  const style = cs.borderTopStyle;
  const color = cs.borderTopColor;
  const visible =
    width > 0 &&
    style !== "none" &&
    style !== "hidden" &&
    !isTransparentColor(color);
  return { width, color, visible };
};

const readOutline = (cs: CSSStyleDeclaration): SourceOutline | null => {
  const style = cs.outlineStyle;
  const width = Number.parseFloat(cs.outlineWidth) || 0;
  if (style === "none" || width <= 0 || isTransparentColor(cs.outlineColor)) {
    return null;
  }
  return {
    width,
    color: cs.outlineColor,
    offset: Number.parseFloat(cs.outlineOffset) || 0,
  };
};

const readShapes = (
  element: Element,
  cs: CSSStyleDeclaration
): CornerShapeList | null => {
  const attrValue = element.getAttribute("data-corner-shape");
  const raw = attrValue?.trim()
    ? attrValue
    : cs.getPropertyValue(CORNER_SHAPE_VAR);
  const shapes = parseCornerShape(raw);
  if (!shapes) {
    return null;
  }
  // All corners `round` — native `border-radius` is sufficient.
  if (shapes.every((shape) => shape === ROUND_SHAPE)) {
    return null;
  }
  return shapes;
};

/**
 * Reads original (not yet overridden) computed styles for an element.
 * Must be called only after our own inline properties have been cleared.
 */
export const readSource = (element: Element): SourceStyles | null => {
  const view = element.ownerDocument.defaultView;
  if (!view) {
    return null;
  }
  const cs = view.getComputedStyle(element);
  const shapes = readShapes(element, cs);
  if (!shapes) {
    return null;
  }

  return {
    shapes,
    radii: RADIUS_LONGHANDS.map((prop) =>
      parseRadiusLonghand(cs.getPropertyValue(prop))
    ) as CornerRadiusList,
    border: readBorder(cs),
    shadows: parseBoxShadow(cs.boxShadow),
    outline: readOutline(cs),
    background: {
      color: cs.backgroundColor,
      image: cs.backgroundImage,
      position: cs.backgroundPosition,
      size: cs.backgroundSize,
      repeat: cs.backgroundRepeat,
      origin: cs.backgroundOrigin,
      clip: cs.backgroundClip,
      attachment: cs.backgroundAttachment,
    },
    position: cs.position,
  };
};

export interface RenderTarget {
  /** `data-hyperellipse-host` tokens: `""`, `"layer"`, `"layer outline"`. */
  hostAttr: string;
  key: string;
  styles: Record<string, string>;
}

export const CLEAR_TARGET: RenderTarget = {
  key: "",
  styles: {},
  hostAttr: "",
};

const svgDataUri = (width: number, height: number, body: string): string => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${body}</svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
};

/** Border ring: stroke centered on the path, inside a `width×height` box. */
const ringPathMarkup = (
  x: number,
  y: number,
  width: number,
  height: number,
  corners: ResolvedCorners,
  border: SourceBorder
): string => {
  const inset = border.width * HALF;
  const path = buildShapePath(
    {
      x: x + inset,
      y: y + inset,
      width: width - border.width,
      height: height - border.width,
    },
    offsetCorners(corners, -inset)
  );
  return `<path d="${path}" fill="none" stroke="${border.color}" stroke-width="${border.width}"/>`;
};

const buildRingSvg = (
  width: number,
  height: number,
  corners: ResolvedCorners,
  border: SourceBorder
): string =>
  svgDataUri(
    width,
    height,
    ringPathMarkup(0, 0, width, height, corners, border)
  );

const buildOutlineSvg = (
  width: number,
  height: number,
  corners: ResolvedCorners,
  outline: SourceOutline
): { image: string; extent: number } => {
  const extent = outline.offset + outline.width;
  const canvasWidth = width + extent * 2;
  const canvasHeight = height + extent * 2;
  const inset = outline.width * HALF;
  const path = buildShapePath(
    {
      x: inset,
      y: inset,
      width: canvasWidth - outline.width,
      height: canvasHeight - outline.width,
    },
    offsetCorners(corners, outline.offset + inset)
  );
  const body = `<path d="${path}" fill="none" stroke="${outline.color}" stroke-width="${outline.width}"/>`;
  return { image: svgDataUri(canvasWidth, canvasHeight, body), extent };
};

/** Per-side padding for the shadow canvas (blur + spread + offset). */
interface ShadowMargins {
  bottom: number;
  left: number;
  right: number;
  top: number;
}

const shadowMargins = (shadows: ParsedShadow[]): ShadowMargins => {
  const margins: ShadowMargins = { top: 0, right: 0, bottom: 0, left: 0 };
  for (const shadow of shadows) {
    const reach = shadow.blur + Math.max(shadow.spread, 0);
    margins.left = Math.max(margins.left, reach - shadow.x);
    margins.right = Math.max(margins.right, reach + shadow.x);
    margins.top = Math.max(margins.top, reach - shadow.y);
    margins.bottom = Math.max(margins.bottom, reach + shadow.y);
  }
  return margins;
};

const shadowMarkup = (
  shadow: ParsedShadow,
  index: number,
  margins: ShadowMargins,
  width: number,
  height: number,
  canvasWidth: number,
  canvasHeight: number,
  corners: ResolvedCorners
): { def: string; body: string } | null => {
  const box = {
    x: margins.left + shadow.x - shadow.spread,
    y: margins.top + shadow.y - shadow.spread,
    width: width + shadow.spread * 2,
    height: height + shadow.spread * 2,
  };
  if (box.width <= 0 || box.height <= 0) {
    return null;
  }
  const path = buildShapePath(box, offsetCorners(corners, shadow.spread));
  if (shadow.blur <= 0) {
    return { def: "", body: `<path d="${path}" fill="${shadow.color}"/>` };
  }
  // Explicit filter region over the full canvas — default 110% clips the blur.
  const id = `b${index}`;
  const def = `<filter id="${id}" filterUnits="userSpaceOnUse" x="0" y="0" width="${canvasWidth}" height="${canvasHeight}"><feGaussianBlur stdDeviation="${shadow.blur * BLUR_STD_DEV_RATIO}"/></filter>`;
  const body = `<path d="${path}" fill="${shadow.color}" filter="url(#${id})"/>`;
  return { def, body };
};

interface LayerSvg {
  image: string;
  /** `inset` value for the `::before` pseudo: negative margins for shadow bleed. */
  inset: string;
}

/**
 * Single SVG layer for `::before`: shadows (exact Gaussian blur + spread,
 * baked into a static vector image — no live CSS filter that Safari clips and
 * recomputes on zoom), fill, and border stroke.
 */
const buildLayerSvg = (
  width: number,
  height: number,
  corners: ResolvedCorners,
  source: SourceStyles
): LayerSvg => {
  const margins = shadowMargins(source.shadows);
  const canvasWidth = width + margins.left + margins.right;
  const canvasHeight = height + margins.top + margins.bottom;
  const defs: string[] = [];
  const body: string[] = [];

  // First shadow in the list paints on top — iterate in reverse for SVG paint order.
  for (let i = source.shadows.length - 1; i >= 0; i -= 1) {
    const shadow = source.shadows[i];
    if (!shadow) {
      continue;
    }
    const markup = shadowMarkup(
      shadow,
      i,
      margins,
      width,
      height,
      canvasWidth,
      canvasHeight,
      corners
    );
    if (markup) {
      if (markup.def) {
        defs.push(markup.def);
      }
      body.push(markup.body);
    }
  }

  const fillPath = buildShapePath(
    { x: margins.left, y: margins.top, width, height },
    corners
  );
  body.push(`<path d="${fillPath}" fill="${source.background.color}"/>`);

  if (source.border.visible) {
    body.push(
      ringPathMarkup(
        margins.left,
        margins.top,
        width,
        height,
        corners,
        source.border
      )
    );
  }

  const defsMarkup = defs.length > 0 ? `<defs>${defs.join("")}</defs>` : "";
  return {
    image: svgDataUri(canvasWidth, canvasHeight, defsMarkup + body.join("")),
    inset: `${-margins.top}px ${-margins.right}px ${-margins.bottom}px ${-margins.left}px`,
  };
};

type BackgroundLayers = Record<string, string>;

/** Prepends our SVG layer above the element's existing `background-image` layers. */
const composeBackground = (
  background: SourceBackground,
  layer: string
): BackgroundLayers => {
  const hasImages = background.image !== "none";
  const layerCount = hasImages
    ? splitTopLevel(background.image, ",").length
    : 0;

  const compose = (own: string, existing: string): string => {
    if (layerCount === 0) {
      return own;
    }
    return `${own}, ${expandLayerList(existing, layerCount).join(", ")}`;
  };

  return {
    "background-image": compose(layer, background.image),
    "background-position": compose("0px 0px", background.position),
    "background-size": compose("100% 100%", background.size),
    "background-repeat": compose("no-repeat", background.repeat),
    "background-origin": compose("border-box", background.origin),
    "background-clip": compose("border-box", background.clip),
    "background-attachment": compose("scroll", background.attachment),
  };
};

/** Clip mode: `clip-path` on the element; optional border as top background layer. */
const computeClipTarget = (
  source: SourceStyles,
  width: number,
  height: number,
  corners: ResolvedCorners
): RenderTarget => {
  const path = buildShapePath({ x: 0, y: 0, width, height }, corners);
  const clip = `path("${path}")`;
  const styles: Record<string, string> = {
    "clip-path": clip,
    "-webkit-clip-path": clip,
    "border-radius": "0px",
  };
  if (source.border.visible) {
    const ring = buildRingSvg(width, height, corners, source.border);
    Object.assign(styles, composeBackground(source.background, ring));
    styles["border-color"] = "transparent";
  }
  return {
    key: `clip|${clip}|${styles["background-image"] ?? ""}`,
    styles,
    hostAttr: "",
  };
};

/**
 * Layer mode (shadow and/or outline): background, border, and shadows are
 * painted by one SVG on `::before` (`z-index: -1`); outline on `::after`.
 * `isolation: isolate` keeps the pseudo-layer from painting behind ancestors.
 */
const computeLayerTarget = (
  source: SourceStyles,
  width: number,
  height: number,
  corners: ResolvedCorners
): RenderTarget => {
  const layer = buildLayerSvg(width, height, corners, source);
  const styles: Record<string, string> = {
    "border-radius": "0px",
    "background-color": "transparent",
    isolation: "isolate",
    "--hyperellipse-layer-image": layer.image,
    "--hyperellipse-layer-inset": layer.inset,
  };
  if (source.position === "static") {
    styles.position = "relative";
  }
  if (source.border.visible) {
    styles["border-color"] = "transparent";
  }
  if (source.shadows.length > 0) {
    styles["box-shadow"] = "none";
  }

  let hostAttr = "layer";
  if (source.outline) {
    const { image, extent } = buildOutlineSvg(
      width,
      height,
      corners,
      source.outline
    );
    styles["--hyperellipse-outline-image"] = image;
    styles["--hyperellipse-outline-inset"] = `${-extent}px`;
    styles["outline-color"] = "transparent";
    hostAttr = "layer outline";
  }

  return {
    key: `layer|${layer.image}|${styles["--hyperellipse-outline-image"] ?? ""}`,
    styles,
    hostAttr,
  };
};

/** Pure function: source styles + box size → target inline styles. */
export const computeTarget = (
  source: SourceStyles,
  width: number,
  height: number
): RenderTarget => {
  const resolved = resolveRadii(source.radii, width, height);
  const corners = resolved.map((radius, index) => ({
    rx: radius.rx,
    ry: radius.ry,
    shape: source.shapes[index] ?? ROUND_SHAPE,
  })) as ResolvedCorners;

  // All radii zero — corners are sharp regardless of shape; skip fallback.
  if (corners.every((corner) => corner.rx <= 0 || corner.ry <= 0)) {
    return CLEAR_TARGET;
  }

  const needsLayerMode = source.shadows.length > 0 || source.outline !== null;
  return needsLayerMode
    ? computeLayerTarget(source, width, height, corners)
    : computeClipTarget(source, width, height, corners);
};

/** Base CSS for pseudo-elements: `::before` — fill/border/shadows, `::after` — outline. */
export const PSEUDO_BASE_CSS = `[data-hyperellipse-host~="layer"]::before{content:"";position:absolute;inset:var(--hyperellipse-layer-inset,0);z-index:-1;background-image:var(--hyperellipse-layer-image,none);background-size:100% 100%;background-repeat:no-repeat;background-origin:border-box;pointer-events:none;}
[data-hyperellipse-host~="outline"]::after{content:"";position:absolute;inset:var(--hyperellipse-outline-inset,0);background-image:var(--hyperellipse-outline-image,none);background-size:100% 100%;background-repeat:no-repeat;background-origin:border-box;pointer-events:none;}`;

/** Attribute toggled on elements under fallback control. */
export const HOST_ATTR = "data-hyperellipse-host";
