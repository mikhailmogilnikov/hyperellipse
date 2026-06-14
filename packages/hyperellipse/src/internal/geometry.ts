/**
 * Superellipse corner geometry per css-borders-4 (§3.9.4).
 * Each corner arc is parameterized as x = T^K, y = (1 - T)^K where K = 0.5^|s|,
 * and s is the `superellipse()` argument (squircle = 2, round = 1, bevel = 0,
 * scoop = -1, notch = -Infinity, square = Infinity).
 */

const HALF = 0.5;
const COORD_PRECISION = 100;
const MIN_CORNER_SEGMENTS = 4;
const MAX_CORNER_SEGMENTS = 26;
const SEGMENTS_PER_PIXEL = 0.4;

/** Superellipse parameter s (accepts ±Infinity). */
export type CornerShapeParam = number;

/** Corner shapes in clockwise order: [topLeft, topRight, bottomRight, bottomLeft]. */
export type CornerShapeList = [
  CornerShapeParam,
  CornerShapeParam,
  CornerShapeParam,
  CornerShapeParam,
];

export interface ResolvedCorner {
  rx: number;
  ry: number;
  shape: CornerShapeParam;
}

export type ResolvedCorners = [
  ResolvedCorner,
  ResolvedCorner,
  ResolvedCorner,
  ResolvedCorner,
];

/** Axis-aligned rectangle in local coordinates. */
export interface ShapeBox {
  height: number;
  width: number;
  x: number;
  y: number;
}

interface Point {
  x: number;
  y: number;
}

const fmt = (value: number): string =>
  String(Math.round(value * COORD_PRECISION) / COORD_PRECISION);

/** Cosine spacing — clusters samples near arc endpoints where curvature is highest. */
const cosineSpaced = (t: number): number => (1 - Math.cos(Math.PI * t)) * HALF;

const segmentCount = (corner: ResolvedCorner): number => {
  if (corner.shape === 0) {
    return 1;
  }
  const size = Math.max(corner.rx, corner.ry);
  return Math.min(
    MAX_CORNER_SEGMENTS,
    Math.max(MIN_CORNER_SEGMENTS, Math.ceil(size * SEGMENTS_PER_PIXEL))
  );
};

/** Inner corner center for convex arcs (reflection of outer corner across the chord). */
const innerCenter = (start: Point, end: Point, outer: Point): Point => ({
  x: start.x + end.x - outer.x,
  y: start.y + end.y - outer.y,
});

/**
 * Samples one corner arc from `start` to `end` clockwise.
 * `start` — end of the incoming edge, `end` — start of the outgoing edge,
 * `outer` — the box corner vertex.
 */
const cornerPoints = (
  start: Point,
  end: Point,
  outer: Point,
  corner: ResolvedCorner
): Point[] => {
  if (
    corner.rx <= 0 ||
    corner.ry <= 0 ||
    corner.shape === Number.POSITIVE_INFINITY
  ) {
    return [outer];
  }
  if (corner.shape === Number.NEGATIVE_INFINITY) {
    return [start, innerCenter(start, end, outer), end];
  }

  const exponent = HALF ** Math.abs(corner.shape);
  const center = corner.shape < 0 ? outer : innerCenter(start, end, outer);
  const points: Point[] = [start];
  const segments = segmentCount(corner);

  for (let i = 1; i < segments; i += 1) {
    const t = cosineSpaced(i / segments);
    const fx = t ** exponent;
    const fy = (1 - t) ** exponent;
    points.push({
      x: center.x + (end.x - center.x) * fx + (start.x - center.x) * fy,
      y: center.y + (end.y - center.y) * fx + (start.y - center.y) * fy,
    });
  }
  points.push(end);
  return points;
};

/** Builds an SVG path `d` attribute for a shaped box. */
export const buildShapePath = (
  box: ShapeBox,
  corners: ResolvedCorners
): string => {
  const left = box.x;
  const top = box.y;
  const right = box.x + box.width;
  const bottom = box.y + box.height;
  const [tl, tr, br, bl] = corners;

  const arcs = [
    cornerPoints(
      { x: right - tr.rx, y: top },
      { x: right, y: top + tr.ry },
      { x: right, y: top },
      tr
    ),
    cornerPoints(
      { x: right, y: bottom - br.ry },
      { x: right - br.rx, y: bottom },
      { x: right, y: bottom },
      br
    ),
    cornerPoints(
      { x: left + bl.rx, y: bottom },
      { x: left, y: bottom - bl.ry },
      { x: left, y: bottom },
      bl
    ),
    cornerPoints(
      { x: left, y: top + tl.ry },
      { x: left + tl.rx, y: top },
      { x: left, y: top },
      tl
    ),
  ];

  const tlArc = arcs[3];
  const startPoint = tlArc?.at(-1) ?? { x: left, y: top };
  const segments: string[] = [`M ${fmt(startPoint.x)} ${fmt(startPoint.y)}`];
  for (const arc of arcs) {
    for (const point of arc) {
      segments.push(`L ${fmt(point.x)} ${fmt(point.y)}`);
    }
  }
  segments.push("Z");
  return segments.join(" ");
};

/**
 * Offsets corner radii inward/outward. `delta < 0` — inset (inner stroke path),
 * `delta > 0` — outset (outline). Zero radii stay sharp.
 *
 * Axis-aligned expansion per css-borders-4: radii grow by the offset while the
 * shape parameter stays the same. Use for `box-shadow` spread.
 */
export const offsetCorners = (
  corners: ResolvedCorners,
  delta: number
): ResolvedCorners =>
  corners.map((corner) => ({
    shape: corner.shape,
    rx: corner.rx > 0 ? Math.max(corner.rx + delta, 0) : 0,
    ry: corner.ry > 0 ? Math.max(corner.ry + delta, 0) : 0,
  })) as ResolvedCorners;

const SHAPE_FRACTION_EPSILON = 1e-6;

/**
 * Solves the shape parameter for a curve-following offset contour.
 *
 * A superellipse grown to radius `r + delta` with the same parameter drifts
 * away from the source curve at the corner diagonal (~19% of the offset for
 * `squircle`), producing visible gaps between outline and border. Per
 * css-borders-4 §3.9.4 borders and outlines must follow the curve at constant
 * distance, so we pick a new parameter whose curve passes through the
 * diagonal point exactly `delta` away from the source curve. `round` (s = 1)
 * is a fixed point of this formula: a concentric circle is already an exact
 * offset curve.
 */
const alignedShape = (corner: ResolvedCorner, delta: number): number => {
  const { shape } = corner;
  if (delta === 0 || shape === 0 || !Number.isFinite(shape)) {
    return shape;
  }
  const radius = (corner.rx + corner.ry) * HALF;
  if (radius <= 0 || radius + delta <= 0) {
    return shape;
  }
  // Diagonal fraction: at t = 0.5 the corner curve sits at `f × R√2` from its
  // arc center (convex) or vertex (concave), where f = 0.5^(0.5^|s|).
  const sourceFraction = HALF ** (HALF ** Math.abs(shape));
  // Projection of the offset onto the corner diagonal differs for convex
  // (shared arc center) and concave (vertex-anchored) curves.
  const diagonalShare = shape < 0 ? 1 - Math.SQRT1_2 : Math.SQRT1_2;
  const targetFraction =
    (sourceFraction * radius + delta * diagonalShare) / (radius + delta);
  const clamped = Math.min(
    Math.max(targetFraction, HALF + SHAPE_FRACTION_EPSILON),
    1 - SHAPE_FRACTION_EPSILON
  );
  const exponent = Math.log(clamped) / Math.log(HALF);
  const magnitude = Math.log(exponent) / Math.log(HALF);
  return shape < 0 ? -magnitude : magnitude;
};

/**
 * Curve-following offset per css-borders-4 §3.9.4: radii grow by the offset
 * and the shape parameter is adjusted to keep a constant distance from the
 * source curve. Use for border strokes and outlines.
 */
export const offsetCornersAligned = (
  corners: ResolvedCorners,
  delta: number
): ResolvedCorners =>
  corners.map((corner) => ({
    shape: alignedShape(corner, delta),
    rx: corner.rx > 0 ? Math.max(corner.rx + delta, 0) : 0,
    ry: corner.ry > 0 ? Math.max(corner.ry + delta, 0) : 0,
  })) as ResolvedCorners;

const clampUnit = (value: number): number => Math.min(Math.max(value, -1), 1);

/**
 * css-borders-4 §3.9.6: maps a superellipse parameter to its normalized half
 * corner in [0, 1]. Drives the quadratic control point used to align an offset
 * contour's endpoints to the source curve.
 */
const normalizedHalfCorner = (shape: CornerShapeParam): number => {
  if (shape === Number.NEGATIVE_INFINITY) {
    return 0;
  }
  if (shape === Number.POSITIVE_INFINITY) {
    return 1;
  }
  const k = HALF ** Math.abs(shape);
  const convex = HALF ** k;
  return shape < 0 ? 1 - convex : convex;
};

/** Rotates a point clockwise by `90° × steps` (screen coordinates, y-down). */
const rotate90 = (point: Point, steps: number): Point => {
  let { x, y } = point;
  const turns = ((steps % 4) + 4) % 4;
  for (let i = 0; i < turns; i += 1) {
    const nextX = -y;
    y = x;
    x = nextX;
  }
  return { x, y };
};

/**
 * css-borders-4 §3.9.4 "aligned corner point": shifts a corner-rect vertex by
 * `thickness` along the offset's normal, keeping the contour at a constant
 * distance from the source curve as the target edge moves inward.
 */
const alignedCornerPoint = (
  origin: Point,
  offset: Point,
  thickness: number,
  orientation: number
): Point => {
  const length = Math.hypot(offset.x, offset.y) || 1;
  const rotated = rotate90(offset, orientation);
  return {
    x: origin.x + (rotated.x / length) * thickness,
    y: origin.y + (rotated.y / length) * thickness,
  };
};

const clockwiseQuad = (box: ShapeBox): [Point, Point, Point, Point] => [
  { x: box.x, y: box.y },
  { x: box.x + box.width, y: box.y },
  { x: box.x + box.width, y: box.y + box.height },
  { x: box.x, y: box.y + box.height },
];

/** Projects a normalized superellipse point into a corner rect, rotated per corner. */
const projectCornerPoint = (
  normalized: Point,
  rect: ShapeBox,
  orientation: number
): Point => {
  const centered = rotate90(
    { x: normalized.x - HALF, y: normalized.y - HALF },
    orientation
  );
  return {
    x: rect.x + (centered.x + HALF) * rect.width,
    y: rect.y + (centered.y + HALF) * rect.height,
  };
};

/** One corner's untrimmed contour points, from incoming edge to outgoing edge. */
const contourCornerPoints = (
  cornerRect: ShapeBox,
  orientation: number,
  startThickness: number,
  endThickness: number,
  shape: CornerShapeParam
): Point[] => {
  const quad = clockwiseQuad(cornerRect);
  const vertex = quad[(orientation + 1) % 4] as Point;
  if (
    cornerRect.width <= 0 ||
    cornerRect.height <= 0 ||
    shape === Number.POSITIVE_INFINITY
  ) {
    return [vertex];
  }

  const half = normalizedHalfCorner(clampUnit(shape));
  const control = half * 2 - HALF;
  const start = alignedCornerPoint(
    quad[orientation] as Point,
    { x: control, y: 1 - control },
    startThickness,
    orientation + 1
  );
  const end = alignedCornerPoint(
    quad[(orientation + 2) % 4] as Point,
    { x: control - 1, y: -control },
    endThickness,
    orientation + 3
  );

  if (shape === Number.NEGATIVE_INFINITY) {
    return [
      start,
      { x: start.x + end.x - vertex.x, y: start.y + end.y - vertex.y },
      end,
    ];
  }

  const rect: ShapeBox = {
    x: Math.min(start.x, end.x),
    y: Math.min(start.y, end.y),
    width: Math.abs(end.x - start.x),
    height: Math.abs(end.y - start.y),
  };
  const exponent = HALF ** Math.abs(shape);
  const segments = segmentCount({
    rx: rect.width,
    ry: rect.height,
    shape,
  });
  const points: Point[] = [];
  for (let i = 0; i <= segments; i += 1) {
    const t = cosineSpaced(i / segments);
    const a = t ** exponent;
    const b = 1 - (1 - t) ** exponent;
    const normalized = shape > 0 ? { x: a, y: b } : { x: b, y: a };
    points.push(projectCornerPoint(normalized, rect, orientation));
  }
  return points;
};

const CLIP_EPSILON = 1e-4;

const interpolate = (a: Point, b: Point, t: number): Point => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
});

/** Sutherland–Hodgman clip of a closed polygon against an axis-aligned rect. */
const clipPolygonToRect = (polygon: Point[], rect: ShapeBox): Point[] => {
  const left = rect.x;
  const right = rect.x + rect.width;
  const top = rect.y;
  const bottom = rect.y + rect.height;
  const edges: {
    inside: (point: Point) => boolean;
    intersect: (a: Point, b: Point) => Point;
  }[] = [
    {
      inside: (p) => p.x >= left - CLIP_EPSILON,
      intersect: (a, b) => interpolate(a, b, (left - a.x) / (b.x - a.x)),
    },
    {
      inside: (p) => p.x <= right + CLIP_EPSILON,
      intersect: (a, b) => interpolate(a, b, (right - a.x) / (b.x - a.x)),
    },
    {
      inside: (p) => p.y >= top - CLIP_EPSILON,
      intersect: (a, b) => interpolate(a, b, (top - a.y) / (b.y - a.y)),
    },
    {
      inside: (p) => p.y <= bottom + CLIP_EPSILON,
      intersect: (a, b) => interpolate(a, b, (bottom - a.y) / (b.y - a.y)),
    },
  ];

  let output = polygon;
  for (const edge of edges) {
    if (output.length === 0) {
      break;
    }
    const input = output;
    output = [];
    for (let i = 0; i < input.length; i += 1) {
      const current = input[i] as Point;
      const previous = input[(i + input.length - 1) % input.length] as Point;
      const currentInside = edge.inside(current);
      const previousInside = edge.inside(previous);
      if (currentInside) {
        if (!previousInside) {
          output.push(edge.intersect(previous, current));
        }
        output.push(current);
      } else if (previousInside) {
        output.push(edge.intersect(previous, current));
      }
    }
  }
  return output;
};

const polygonToPath = (points: Point[]): string => {
  if (points.length === 0) {
    return "";
  }
  const first = points[0] as Point;
  const segments = [`M ${fmt(first.x)} ${fmt(first.y)}`];
  for (let i = 1; i < points.length; i += 1) {
    const point = points[i] as Point;
    segments.push(`L ${fmt(point.x)} ${fmt(point.y)}`);
  }
  segments.push("Z");
  return segments.join(" ");
};

/**
 * Curve-aligned offset contour per css-borders-4 §3.9.4. The corner curves are
 * anchored to `outerBox` (with the border-edge radii) and their endpoints are
 * shifted toward `target` by the per-side thickness, then the whole contour is
 * trimmed to `target`. For concave corners (scoop, notch) the trim produces the
 * sharp inner joins that a uniform stroke cannot, matching native rendering.
 *
 * `target === outerBox` yields the plain shape. An inset target draws the inner
 * (padding-edge) contour of a border; an outset `outerBox` with an inset target
 * draws an outline contour.
 */
export const contourPath = (
  outerBox: ShapeBox,
  corners: ResolvedCorners,
  target: ShapeBox
): string => {
  const left = outerBox.x;
  const top = outerBox.y;
  const right = outerBox.x + outerBox.width;
  const bottom = outerBox.y + outerBox.height;
  const targetLeft = target.x;
  const targetTop = target.y;
  const targetRight = target.x + target.width;
  const targetBottom = target.y + target.height;
  const [tl, tr, br, bl] = corners;

  const points: Point[] = [
    ...contourCornerPoints(
      { x: right - tr.rx, y: top, width: tr.rx, height: tr.ry },
      0,
      targetTop - top,
      right - targetRight,
      tr.shape
    ),
    ...contourCornerPoints(
      { x: right - br.rx, y: bottom - br.ry, width: br.rx, height: br.ry },
      1,
      right - targetRight,
      bottom - targetBottom,
      br.shape
    ),
    ...contourCornerPoints(
      { x: left, y: bottom - bl.ry, width: bl.rx, height: bl.ry },
      2,
      bottom - targetBottom,
      targetLeft - left,
      bl.shape
    ),
    ...contourCornerPoints(
      { x: left, y: top, width: tl.rx, height: tl.ry },
      3,
      targetLeft - left,
      targetTop - top,
      tl.shape
    ),
  ];

  return polygonToPath(clipPolygonToRect(points, target));
};
