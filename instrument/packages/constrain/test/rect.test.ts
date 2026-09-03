import { describe, expect, it } from "vitest";
import { constrainRect, rectFromCorners } from "@car/constrain";

describe("rectFromCorners", () => {
  it("builds loop-order corners with the anchor first", () => {
    const r = rectFromCorners([10, 20], [110, 80]);
    expect(r.corners).toEqual([
      [10, 20],
      [110, 20],
      [110, 80],
      [10, 80],
    ]);
  });
});

describe("constrainRect", () => {
  it("honors a typed width exactly, preserving drag direction", () => {
    const seed = rectFromCorners([10, 20], [-150, 80]);
    const r = constrainRect(seed, { width: 200 });
    expect(r.corners[0]).toEqual([10, 20]);
    expect(r.corners[1]).toEqual([-190, 20]); // anchor − 200, exact
    expect(r.corners[2]).toEqual([-190, 80]); // untyped height keeps its span
    expect(r.corners[3]).toEqual([10, 80]);
  });

  it("honors typed width and height exactly even off-grid (clause 8: never a rounding)", () => {
    const seed = rectFromCorners([10.5, -3], [50, 40]);
    const r = constrainRect(seed, { width: 187.3, height: 42.1 });
    // exact constructed arithmetic — identical bits to the same expression here
    expect(Object.is(r.corners[2][0], 10.5 + 187.3)).toBe(true);
    expect(Object.is(r.corners[2][1], -3 + 42.1)).toBe(true);
    expect(r.corners[0]).toEqual([10.5, -3]);
  });

  it("squares up a skewed seed quad to the exact axis-aligned rectangle", () => {
    const skewed = {
      corners: [
        [0, 0],
        [99.2, 1.3],
        [101.1, 59.4],
        [-0.7, 60.2],
      ],
    } as const;
    const r = constrainRect(skewed, { width: 100, height: 60 });
    expect(r.corners).toEqual([
      [0, 0],
      [100, 0],
      [100, 60],
      [0, 60],
    ]);
  });

  it("keeps current spans when nothing is typed", () => {
    const seed = rectFromCorners([0, 0], [-30, -40]);
    const r = constrainRect(seed, {});
    expect(r.corners).toEqual([
      [0, 0],
      [-30, 0],
      [-30, -40],
      [0, -40],
    ]);
  });

  it("defaults direction to positive on a degenerate seed", () => {
    const seed = rectFromCorners([5, 5], [5, 5]);
    const r = constrainRect(seed, { width: 50, height: 20 });
    expect(r.corners).toEqual([
      [5, 5],
      [55, 5],
      [55, 25],
      [5, 25],
    ]);
  });

  it("rejects non-positive typed dimensions", () => {
    const seed = rectFromCorners([0, 0], [10, 10]);
    expect(() => constrainRect(seed, { width: 0 })).toThrow(/width/);
    expect(() => constrainRect(seed, { height: -4 })).toThrow(/height/);
    expect(() => constrainRect(seed, { width: Number.NaN })).toThrow(/width/);
  });
});
