/**
 * Геометрия суперэллипса по алгоритму из css-borders-4 (§3.9.4):
 * кривая угла параметризуется как x = T^K, y = (1 - T)^K, где K = 0.5^|s|,
 * s — параметр superellipse() (squircle = 2, round = 1, bevel = 0,
 * scoop = -1, notch = -Infinity, square = Infinity).
 */

const HALF = 0.5;
const COORD_PRECISION = 100;
const MIN_CORNER_SEGMENTS = 4;
const MAX_CORNER_SEGMENTS = 26;
const SEGMENTS_PER_PIXEL = 0.4;

/** Параметр суперэллипса s (допускает ±Infinity). */
export type CornerShapeParam = number;

/** [topLeft, topRight, bottomRight, bottomLeft] */
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

/** Кластеризует сэмплы у концов дуги, где сосредоточена кривизна. */
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

const innerCenter = (start: Point, end: Point, outer: Point): Point => ({
  x: start.x + end.x - outer.x,
  y: start.y + end.y - outer.y,
});

/**
 * Точки дуги одного угла от start к end (по часовой стрелке).
 * start — конец входящего ребра, end — начало исходящего, outer — внешний угол бокса.
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

/** SVG path данных бокса с фигурными углами. */
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
 * Смещает радиусы внутрь/наружу (delta < 0 — внутрь для inner-обводки,
 * delta > 0 — наружу для outline). Нулевые радиусы остаются острыми.
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
