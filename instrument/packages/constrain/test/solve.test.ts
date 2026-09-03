import { describe, expect, it } from "vitest";
import { DEG, natan2 } from "@car/num";
import {
  angle,
  coincident,
  distance,
  onGrid,
  parallel,
  perpendicular,
  solve,
  symmetric,
  type Constraint,
  type Sketch,
} from "@car/constrain";

const dist = (a: readonly number[], b: readonly number[]): number =>
  Math.sqrt((a[0]! - b[0]!) ** 2 + (a[1]! - b[1]!) ** 2);

describe("solve — square from distance + perpendicular", () => {
  it("lands the free corners exactly with two anchors", () => {
    const sketch: Sketch = {
      points: { p0: [0, 0], p1: [100, 0], p2: [105, 95], p3: [-8, 103] },
    };
    const cs: Constraint[] = [
      distance("p1", "p2", 100),
      distance("p2", "p3", 100),
      distance("p3", "p0", 100),
      perpendicular("p0", "p1", "p1", "p2"),
      perpendicular("p1", "p2", "p2", "p3"),
    ];
    const r = solve(sketch, cs, { fixed: ["p0", "p1"] });
    expect(r.converged).toBe(true);
    expect(r.points.p2![0]).toBeCloseTo(100, 8);
    expect(r.points.p2![1]).toBeCloseTo(100, 8);
    expect(r.points.p3![0]).toBeCloseTo(0, 8);
    expect(r.points.p3![1]).toBeCloseTo(100, 8);
    expect(r.diagnostics.overConstrained).toBe(false);
    expect(r.diagnostics.underConstrained).toBe(false);
    expect(r.diagnostics.note).toContain("well-constrained");
    // anchors never move
    expect(r.points.p0).toEqual([0, 0]);
    expect(r.points.p1).toEqual([100, 0]);
  });

  it("closes an exact square shape with one anchor (rotation DOF reported)", () => {
    const sketch: Sketch = {
      points: { p0: [0, 0], p1: [96, 5], p2: [103, 98], p3: [-4, 101] },
    };
    const cs: Constraint[] = [
      distance("p0", "p1", 100),
      distance("p1", "p2", 100),
      distance("p2", "p3", 100),
      distance("p3", "p0", 100),
      perpendicular("p0", "p1", "p1", "p2"),
      perpendicular("p1", "p2", "p2", "p3"),
    ];
    const r = solve(sketch, cs, { fixed: ["p0"] });
    expect(r.converged).toBe(true);
    expect(dist(r.points.p0!, r.points.p1!)).toBeCloseTo(100, 8);
    expect(dist(r.points.p1!, r.points.p2!)).toBeCloseTo(100, 8);
    expect(dist(r.points.p2!, r.points.p3!)).toBeCloseTo(100, 8);
    expect(dist(r.points.p3!, r.points.p0!)).toBeCloseTo(100, 8);
    expect(dist(r.points.p0!, r.points.p2!)).toBeCloseTo(100 * Math.SQRT2, 7);
    // the whole square can still spin about p0 — the ledger must hear it
    expect(r.diagnostics.underConstrained).toBe(true);
    expect(r.diagnostics.note).toContain("under-constrained");
    expect(r.diagnostics.note).toContain("1 free degree");
  });
});

describe("solve — symmetric", () => {
  it("mirrors a point across a 45-degree line", () => {
    const sketch: Sketch = {
      points: { p: [0, 0], q: [100, 100], a: [30, 10], b: [5, 25] },
    };
    const r = solve(sketch, [symmetric("a", "b", "p", "q")], { fixed: ["p", "q", "a"] });
    expect(r.converged).toBe(true);
    // mirror across y = x swaps coordinates
    expect(r.points.b![0]).toBeCloseTo(10, 8);
    expect(r.points.b![1]).toBeCloseTo(30, 8);
    expect(r.diagnostics.underConstrained).toBe(false);
    expect(r.diagnostics.overConstrained).toBe(false);
  });
});

describe("solve — angle", () => {
  it("drives the angle at vertex b to 30 degrees", () => {
    const sketch: Sketch = {
      points: { a: [100, 0], b: [0, 0], c: [80, 60] },
    };
    const r = solve(sketch, [angle("a", "b", "c", 30)], { fixed: ["a", "b"] });
    expect(r.converged).toBe(true);
    const c = r.points.c!;
    const theta = natan2(100 * c[1] - 0 * c[0], 100 * c[0] + 0 * c[1]);
    expect(theta).toBeCloseTo(30 * DEG, 9);
    // the leg length stays free — reported, not hidden
    expect(r.diagnostics.underConstrained).toBe(true);
  });
});

describe("solve — parallel and coincident", () => {
  it("makes cd parallel to a fixed ab", () => {
    const sketch: Sketch = {
      points: { a: [0, 0], b: [100, 10], c: [0, 50], d: [100, 80] },
    };
    const r = solve(sketch, [parallel("a", "b", "c", "d")], { fixed: ["a", "b", "c"] });
    expect(r.converged).toBe(true);
    const d = r.points.d!;
    const cross = 100 * (d[1] - 50) - 10 * (d[0] - 0);
    expect(cross / 100).toBeCloseTo(0, 8);
  });

  it("lands a coincident point on its fixed partner", () => {
    const sketch: Sketch = { points: { a: [5, 7], b: [42.5, -13.25] } };
    const r = solve(sketch, [coincident("a", "b")], { fixed: ["b"] });
    expect(r.converged).toBe(true);
    expect(r.points.a![0]).toBeCloseTo(42.5, 10);
    expect(r.points.a![1]).toBeCloseTo(-13.25, 10);
  });
});

describe("solve — onGrid quantization pre-pass", () => {
  it("snaps a free point to the pitch before solving (bit-exact when nothing else acts)", () => {
    const sketch: Sketch = { points: { a: [103.2, 96.7] } };
    const r = solve(sketch, [onGrid("a", 25)]);
    expect(r.points.a).toEqual([100, 100]);
    expect(Object.is(r.points.a![0], 100)).toBe(true);
    expect(Object.is(r.points.a![1], 100)).toBe(true);
    expect(r.converged).toBe(true);
    expect(r.iterations).toBe(0); // no residual rows — nothing to iterate
  });

  it("quantizes BEFORE the solve, and the solved result is never re-rounded", () => {
    const sketch: Sketch = { points: { p: [0, 0], q: [97, 2] } };
    const r = solve(sketch, [onGrid("q", 10), distance("p", "q", 123.4)], { fixed: ["p"] });
    expect(r.converged).toBe(true);
    // snap ran first: (97,2) → (100,0), so the solve moves q along +x only;
    // had the snap not run, q would finish with y ≈ 2.5, not 0.
    expect(r.points.q![1]).toBeCloseTo(0, 10);
    // off-grid typed distance lands exactly — the grid never rounds output
    expect(r.points.q![0]).toBeCloseTo(123.4, 8);
  });

  it("never moves an anchored point", () => {
    const sketch: Sketch = { points: { a: [103.2, 96.7] } };
    const r = solve(sketch, [onGrid("a", 25)], { fixed: ["a"] });
    expect(r.points.a).toEqual([103.2, 96.7]);
  });
});

describe("solve — determinism", () => {
  const fixture = (): { sketch: Sketch; cs: Constraint[] } => ({
    sketch: {
      points: { p0: [0, 0], p1: [96, 5], p2: [103.7, 98.1], p3: [-4.3, 101.9], m: [51.2, 47.9] },
    },
    cs: [
      distance("p0", "p1", 100),
      distance("p1", "p2", 100),
      distance("p2", "p3", 100),
      distance("p3", "p0", 100),
      perpendicular("p0", "p1", "p1", "p2"),
      onGrid("m", 5),
      symmetric("p1", "p3", "p0", "p2"),
      angle("p1", "p0", "p3", 90),
    ],
  });

  it("two runs on identical inputs are bit-identical", () => {
    const a = fixture();
    const b = fixture();
    const ra = solve(a.sketch, a.cs, { fixed: ["p0"] });
    const rb = solve(b.sketch, b.cs, { fixed: ["p0"] });
    expect(Object.is(ra.residual, rb.residual)).toBe(true);
    expect(ra.iterations).toBe(rb.iterations);
    expect(ra.converged).toBe(rb.converged);
    expect(Object.keys(ra.points)).toEqual(Object.keys(rb.points));
    for (const id of Object.keys(ra.points)) {
      expect(Object.is(ra.points[id]![0], rb.points[id]![0])).toBe(true);
      expect(Object.is(ra.points[id]![1], rb.points[id]![1])).toBe(true);
    }
  });

  it("runs exactly the fixed iteration cap — no convergence-noise termination", () => {
    const a = fixture();
    const r = solve(a.sketch, a.cs, { fixed: ["p0"] });
    expect(r.iterations).toBe(64);
    const r2 = solve(fixture().sketch, fixture().cs, { fixed: ["p0"], maxIterations: 7 });
    expect(r2.iterations).toBe(7);
  });
});

describe("solve — over-constrained diagnostics", () => {
  it("reports a conflict, stays finite, and does not oscillate", () => {
    const sketch: Sketch = { points: { p0: [0, 0], p1: [90, 10] } };
    const cs: Constraint[] = [distance("p0", "p1", 100), distance("p0", "p1", 150)];
    const r = solve(sketch, cs, { fixed: ["p0"] });
    expect(r.converged).toBe(false);
    expect(r.diagnostics.overConstrained).toBe(true);
    expect(r.diagnostics.note).toContain("over-constrained");
    expect(r.iterations).toBe(64);
    // least-squares compromise: |p1| = 125, residual = 25·√2
    expect(dist(r.points.p0!, r.points.p1!)).toBeCloseTo(125, 6);
    expect(r.residual).toBeCloseTo(25 * Math.SQRT2, 6);
    expect(Number.isFinite(r.points.p1![0])).toBe(true);
    expect(Number.isFinite(r.points.p1![1])).toBe(true);
    // doubling the cap changes nothing: the compromise is stable, not oscillating
    const r128 = solve(sketch, cs, { fixed: ["p0"], maxIterations: 128 });
    expect(r128.residual).toBeCloseTo(r.residual, 9);
  });

  it("reports conflict between anchors with zero variables", () => {
    const sketch: Sketch = { points: { a: [0, 0], b: [100, 0] } };
    const r = solve(sketch, [distance("a", "b", 150)], { fixed: ["a", "b"] });
    expect(r.iterations).toBe(0);
    expect(r.converged).toBe(false);
    expect(r.diagnostics.overConstrained).toBe(true);
    expect(r.residual).toBeCloseTo(50, 10);
  });
});

describe("solve — under-constrained diagnostics", () => {
  it("reports free DOF for an unconstrained sketch", () => {
    const r = solve({ points: { a: [1, 2], b: [3, 4] } }, []);
    expect(r.converged).toBe(true);
    expect(r.diagnostics.underConstrained).toBe(true);
    expect(r.diagnostics.note).toContain("4 free degree(s)");
  });

  it("stays quiet when everything is anchored and satisfied", () => {
    const r = solve({ points: { a: [0, 0], b: [100, 0] } }, [distance("a", "b", 100)], {
      fixed: ["a", "b"],
    });
    expect(r.converged).toBe(true);
    expect(r.diagnostics.underConstrained).toBe(false);
    expect(r.diagnostics.overConstrained).toBe(false);
    expect(r.diagnostics.note).toContain("fully anchored");
  });
});

describe("solve — authored-input validation", () => {
  it("throws on an unknown point in a constraint", () => {
    expect(() => solve({ points: { a: [0, 0] } }, [distance("a", "zz", 10)])).toThrow(
      /unknown point "zz"/,
    );
  });

  it("throws on an unknown anchor id", () => {
    expect(() => solve({ points: { a: [0, 0] } }, [], { fixed: ["zz"] })).toThrow(
      /unknown point "zz"/,
    );
  });

  it("throws on a non-positive grid pitch", () => {
    expect(() => solve({ points: { a: [0, 0] } }, [onGrid("a", 0)])).toThrow(/pitch/);
    expect(() => solve({ points: { a: [0, 0] } }, [onGrid("a", -5)])).toThrow(/pitch/);
  });

  it("throws on a negative typed distance", () => {
    expect(() => solve({ points: { a: [0, 0], b: [1, 1] } }, [distance("a", "b", -1)])).toThrow(
      /non-negative/,
    );
  });

  it("throws on a bad iteration cap", () => {
    expect(() => solve({ points: { a: [0, 0] } }, [], { maxIterations: 2.5 })).toThrow(
      /maxIterations/,
    );
  });
});
