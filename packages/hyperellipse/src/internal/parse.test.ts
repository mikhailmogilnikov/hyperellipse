import { describe, expect, it } from "vitest";
import {
  type CornerRadiusList,
  expandLayerList,
  isTransparentColor,
  parseBoxShadow,
  parseCornerShape,
  parseRadiusLonghand,
  resolveRadii,
  splitTopLevel,
} from "./parse";

describe("parseCornerShape", () => {
  it("parses keywords", () => {
    expect(parseCornerShape("squircle")).toEqual([2, 2, 2, 2]);
    expect(parseCornerShape("round")).toEqual([1, 1, 1, 1]);
    expect(parseCornerShape("bevel")).toEqual([0, 0, 0, 0]);
  });

  it("parses superellipse()", () => {
    expect(parseCornerShape("superellipse(4)")).toEqual([4, 4, 4, 4]);
    expect(parseCornerShape("superellipse(infinity)")).toEqual([
      Number.POSITIVE_INFINITY,
      Number.POSITIVE_INFINITY,
      Number.POSITIVE_INFINITY,
      Number.POSITIVE_INFINITY,
    ]);
  });

  it("expands 2–4 value shorthand", () => {
    expect(parseCornerShape("squircle bevel")).toEqual([2, 0, 2, 0]);
    expect(parseCornerShape("squircle bevel scoop notch")).toEqual([
      2,
      0,
      -1,
      Number.NEGATIVE_INFINITY,
    ]);
  });

  it("returns null for empty input", () => {
    expect(parseCornerShape("")).toBeNull();
    expect(parseCornerShape("   ")).toBeNull();
  });
});

describe("parseRadiusLonghand", () => {
  it("parses px and percent values", () => {
    expect(parseRadiusLonghand("45px")).toEqual({
      x: { value: 45, isPercent: false },
      y: { value: 45, isPercent: false },
    });
    expect(parseRadiusLonghand("10% 20px")).toEqual({
      x: { value: 10, isPercent: true },
      y: { value: 20, isPercent: false },
    });
  });
});

describe("resolveRadii", () => {
  it("resolves percentages against box size", () => {
    const radii: CornerRadiusList = [
      parseRadiusLonghand("50%"),
      parseRadiusLonghand("50%"),
      parseRadiusLonghand("50%"),
      parseRadiusLonghand("50%"),
    ];
    const [tl, tr, br, bl] = resolveRadii(radii, 200, 100);
    expect(tl.rx).toBe(100);
    expect(tl.ry).toBe(50);
    expect(tr.rx).toBe(100);
    expect(br.ry).toBe(50);
    expect(bl.rx).toBe(100);
  });

  it("scales down when radii overflow", () => {
    const radii: CornerRadiusList = [
      parseRadiusLonghand("80px"),
      parseRadiusLonghand("80px"),
      parseRadiusLonghand("80px"),
      parseRadiusLonghand("80px"),
    ];
    const [tl, tr] = resolveRadii(radii, 100, 100);
    expect(tl.rx + tr.rx).toBeLessThanOrEqual(100);
  });
});

describe("splitTopLevel", () => {
  it("splits at top-level commas only", () => {
    expect(splitTopLevel("a, b, c", ",")).toEqual(["a", "b", "c"]);
    expect(splitTopLevel("rgb(0, 0, 0) 2px, 4px", ",")).toEqual([
      "rgb(0, 0, 0) 2px",
      "4px",
    ]);
  });
});

describe("parseBoxShadow", () => {
  it("parses outer shadows", () => {
    const [shadow] = parseBoxShadow("2px 4px 8px 1px rgba(0,0,0,0.5)");
    expect(shadow).toEqual({
      x: 2,
      y: 4,
      blur: 8,
      spread: 1,
      color: "rgba(0,0,0,0.5)",
    });
  });

  it("drops inset shadows", () => {
    expect(parseBoxShadow("inset 2px 2px 4px black")).toEqual([]);
  });

  it("returns empty for none", () => {
    expect(parseBoxShadow("none")).toEqual([]);
  });
});

describe("expandLayerList", () => {
  it("repeats values to match layer count", () => {
    expect(expandLayerList("a, b", 3)).toEqual(["a", "b", "a"]);
  });
});

describe("isTransparentColor", () => {
  it("detects transparent colors", () => {
    expect(isTransparentColor("transparent")).toBe(true);
    expect(isTransparentColor("rgba(0, 0, 0, 0)")).toBe(true);
    expect(isTransparentColor("#fff")).toBe(false);
  });
});
