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
