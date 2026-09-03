import { describe, expect, it } from "vitest";
import { closedMeshCheck, engraveGrooves } from "@car/mesh";
import type { Pt3 } from "@car/schema";

/** A closed box, n×n per face, welded corner to corner. */
function box(sx: number, sy: number, sz: number, n: number) {
  const key = new Map<string, number>();
  const pos: number[] = [];
  const idx: number[] = [];
  const at = (x: number, y: number, z: number): number => {
    const k = `${x.toFixed(6)},${y.toFixed(6)},${z.toFixed(6)}`;
    const seen = key.get(k);
    if (seen !== undefined) return seen;
    pos.push(x, y, z);
    const i = pos.length / 3 - 1;
    key.set(k, i);
    return i;
  };
  const face = (o: Pt3, u: Pt3, v: Pt3) => {
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const p = (a: number, b: number) => at(
          o[0] + (u[0] * a) / n + (v[0] * b) / n,
          o[1] + (u[1] * a) / n + (v[1] * b) / n,
          o[2] + (u[2] * a) / n + (v[2] * b) / n,
        );
        idx.push(p(i, j), p(i + 1, j), p(i + 1, j + 1));
        idx.push(p(i, j), p(i + 1, j + 1), p(i, j + 1));
      }
    }
  };
  face([0, 0, 0], [0, sy, 0], [sx, 0, 0]);
  face([0, 0, sz], [sx, 0, 0], [0, sy, 0]);
  face([0, 0, 0], [sx, 0, 0], [0, 0, sz]);
  face([0, sy, 0], [0, 0, sz], [sx, 0, 0]);
  face([0, 0, 0], [0, 0, sz], [0, sy, 0]);
  face([sx, 0, 0], [0, sy, 0], [0, 0, sz]);
  return { positions: new Float64Array(pos), indices: new Uint32Array(idx) };
}

const OPTS = { scaleDenominator: 24, minPrintedFeatureMm: 0.4 };

describe("shutline grooves (charge §10)", () => {
  const m = box(4000, 1800, 1200, 24);
  // A vertical shutline across the +Y flank at x = 2000.
  const line: Pt3[] = [];
  for (let k = 0; k <= 240; k++) line.push([2000, 1800, (1200 * k) / 240]);

  it("sizes the groove from the nozzle and back-scales it, both stated", () => {
    const g = engraveGrooves(m, line, OPTS);
    // Two nozzle widths at the print: 0.8 mm in the hand, 19.2 mm on the car.
    expect(g.printedWidthMm).toBeCloseTo(0.8, 9);
    expect(g.halfWidthMm * 2).toBeCloseTo(19.2, 9);
    expect(g.depthMm / g.printedDepthMm).toBeCloseTo(24, 9);
    expect(g.note).toContain("NOT scaled down");
  });

  it("moves vertices near the shutline and nothing else", () => {
    const g = engraveGrooves(m, line, OPTS);
    expect(g.moved).toBeGreaterThan(0);
    for (let v = 0; v < m.positions.length / 3; v++) {
      const before: Pt3 = [m.positions[v * 3]!, m.positions[v * 3 + 1]!, m.positions[v * 3 + 2]!];
      const after: Pt3 = [g.positions[v * 3]!, g.positions[v * 3 + 1]!, g.positions[v * 3 + 2]!];
      const shift = Math.hypot(after[0] - before[0], after[1] - before[1], after[2] - before[2]);
      if (shift === 0) continue;
      let near = Infinity;
      for (const p of line) near = Math.min(near, Math.hypot(before[0] - p[0], before[1] - p[1], before[2] - p[2]));
      expect(near).toBeLessThan(g.halfWidthMm);
      expect(shift).toBeLessThanOrEqual(g.depthMm + 1e-9);
    }
  });

  it("sinks INTO the body, never out of it", () => {
    const g = engraveGrooves(m, line, OPTS);
    // The +Y flank sits at y = 1800; a groove there must reduce y.
    for (let v = 0; v < m.positions.length / 3; v++) {
      if (m.positions[v * 3 + 1]! !== 1800) continue;
      expect(g.positions[v * 3 + 1]!).toBeLessThanOrEqual(1800 + 1e-9);
    }
  });

  it("leaves the mesh closed — topology is never touched", () => {
    expect(closedMeshCheck(m).closed).toBe(true);
    const g = engraveGrooves(m, line, OPTS);
    expect(g.positions.length).toBe(m.positions.length);
    expect(closedMeshCheck({ positions: g.positions, indices: m.indices }).closed).toBe(true);
  });

  it("does nothing, safely, when there are no shutlines", () => {
    const g = engraveGrooves(m, [], OPTS);
    expect(g.moved).toBe(0);
    expect(Array.from(g.positions)).toEqual(Array.from(m.positions));
    expect(g.note).toContain("no shutlines");
  });

  it("is deterministic", () => {
    expect(Array.from(engraveGrooves(m, line, OPTS).positions))
      .toEqual(Array.from(engraveGrooves(m, line, OPTS).positions));
  });
});
