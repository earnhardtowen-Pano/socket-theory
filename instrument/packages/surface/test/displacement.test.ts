/**
 * The displacement report — the instrument that was missing.
 *
 * Every other probe in this package measures agreement at a seam. This one
 * measures where the surface went, which is the question that caught a
 * curvature correction inflating one of the P1's cells by eighty-nine
 * millimetres while every continuity number read perfect.
 */

import { describe, expect, it } from "vitest";
import { boundaryCoonsPoint, cellBoundary, fieldDisplacement, tangentField } from "@car/surface";
import { dist3 } from "@car/num";
import { boxQuilt, foldedPairQuilt } from "../../mesh/test/fixtures.js";

const SMOOTH_EVERYTHING = { breakAngleDeg: 179 } as const;

describe("field displacement", () => {
  it("reads zero when the correction is measured against itself", () => {
    const { quilt } = foldedPairQuilt();
    const cross = tangentField(quilt, SMOOTH_EVERYTHING);
    const r = fieldDisplacement(quilt, { cross, against: cross });
    expect(r.worst).toBe(0);
    expect(r.median).toBe(0);
    expect(r.overMillimetre).toBe(0);
  });

  it("sees the correction the tangent field applies", () => {
    const { quilt } = foldedPairQuilt();
    const r = fieldDisplacement(quilt, { cross: tangentField(quilt, SMOOTH_EVERYTHING) });
    expect(r.worst).toBeGreaterThan(0.1);
    expect(r.worstCell).not.toBeNull();
  });

  it("agrees with a direct evaluation at the worst cell", () => {
    const { quilt } = boxQuilt();
    const cross = tangentField(quilt, SMOOTH_EVERYTHING);
    const r = fieldDisplacement(quilt, { cross, grid: 8 });
    const cell = quilt.cells.find((c) => c.id === r.worstCell)!;
    const plain = cellBoundary(cell, quilt);
    const fixed = cellBoundary(cell, quilt, cross);
    let worst = 0;
    for (let i = 1; i < 8; i++) {
      for (let j = 1; j < 8; j++) {
        worst = Math.max(worst, dist3(
          boundaryCoonsPoint(plain, i / 8, j / 8), boundaryCoonsPoint(fixed, i / 8, j / 8),
        ));
      }
    }
    expect(r.worst).toBe(worst);
    expect(r.samplesPerCell).toBe(49);
  });

  it("ranks worst first and covers every cell exactly once", () => {
    const { quilt } = boxQuilt();
    const r = fieldDisplacement(quilt, { cross: tangentField(quilt, SMOOTH_EVERYTHING) });
    expect(r.cells.length).toBe(quilt.cells.length);
    expect(new Set(r.cells.map((c) => c.cellId)).size).toBe(quilt.cells.length);
    for (let i = 1; i < r.cells.length; i++) {
      expect(r.cells[i]!.mm).toBeLessThanOrEqual(r.cells[i - 1]!.mm);
    }
    expect(r.worst).toBe(r.cells[0]!.mm);
  });

  it("separates the curvature term from the tangent-plane term", () => {
    const { quilt } = foldedPairQuilt();
    const g1 = tangentField(quilt, { ...SMOOTH_EVERYTHING, order: 1 });
    const g2 = tangentField(quilt, { ...SMOOTH_EVERYTHING, order: 2 });
    const phi = fieldDisplacement(quilt, { cross: g1 });
    const psi = fieldDisplacement(quilt, { cross: g2, against: g1 });
    expect(phi.worst).toBeGreaterThan(0);
    expect(psi.worst).toBeGreaterThan(0);
    // Ψ is a refinement of Φ on this fixture, not a bigger move than it.
    expect(psi.worst).toBeLessThan(phi.worst);
  });
});
