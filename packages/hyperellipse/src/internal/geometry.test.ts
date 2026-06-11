import { describe, expect, it } from "vitest";
import type { ResolvedCorners } from "./geometry";
import { buildShapePath, offsetCorners } from "./geometry";

const squircleCorners = (
  rx: number,
  ry: number,
  shape = 2
): ResolvedCorners => [
  { rx, ry, shape },
  { rx, ry, shape },
  { rx, ry, shape },
  { rx, ry, shape },
];

describe("buildShapePath", () => {
  it("returns a closed SVG path", () => {
    const path = buildShapePath(
      { x: 0, y: 0, width: 100, height: 80 },
      squircleCorners(20, 20)
    );
    expect(path.startsWith("M ")).toBe(true);
    expect(path.endsWith(" Z")).toBe(true);
    expect(path).toContain("L ");
  });

  it("produces a sharp corner for square shape", () => {
    const path = buildShapePath(
      { x: 0, y: 0, width: 100, height: 80 },
      squircleCorners(20, 20, Number.POSITIVE_INFINITY)
    );
    expect(path).toContain("L 100 0");
  });

  it("produces three points for notch corners", () => {
    const path = buildShapePath(
      { x: 0, y: 0, width: 100, height: 80 },
      squircleCorners(20, 20, Number.NEGATIVE_INFINITY)
    );
    expect(path.split("L ").length).toBeGreaterThan(4);
  });
});

describe("offsetCorners", () => {
  it("insets radii by delta", () => {
    const inset = offsetCorners(squircleCorners(20, 24), -4);
    expect(inset[0]).toEqual({ shape: 2, rx: 16, ry: 20 });
  });

  it("clamps inset radii at zero", () => {
    const inset = offsetCorners(squircleCorners(2, 2), -10);
    expect(inset[0]?.rx).toBe(0);
    expect(inset[0]?.ry).toBe(0);
  });
});
