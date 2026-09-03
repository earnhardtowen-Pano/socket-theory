/**
 * The spline cross-boundary field — the exportable form, and its one claim.
 *
 * The claim is not "close to the bisector field". It is that the two patches
 * on a shared curve end up in ONE plane, exactly, because both of them build
 * their cross-derivative out of the same two spanning vectors: the curve's own
 * derivative C′, which is bit-identical for both owners, and a shared spline
 * direction D*. Everything else here — how many pieces an edge needs, how far
 * the spline body sits from the bisector body — is a shape question with a
 * tolerance. This one is not, and it is tested as a determinant rather than as
 * an angle, because an angle read through two normalisations can be small for
 * reasons that have nothing to do with the surface.
 */

import { describe, expect, it } from "vitest";
import type { Id, Pt3, QuiltSpec } from "@car/schema";
import { cross3, dot3, len3, norm3, scale3, sub3, chainDeriv } from "@car/num";
import {
  boundaryCoonsPartials,
  cellBoundary,
  continuityProbe,
  fieldDisplacement,
  quiltAdjacency,
  sideParamOf,
  tangentField,
  uvOnSide,
  type CrossField,
} from "@car/surface";
import { boxQuilt, foldedPairQuilt, splitTopBoxQuilt } from "../../mesh/test/fixtures.js";

const SMOOTH_EVERYTHING = { breakAngleDeg: 179 } as const;
/** No corner window: inside the fade the patches are deliberately NOT G1, and
 *  the exactness claim is about where the correction is at full strength. */
const FULL = { ...SMOOTH_EVERYTHING, cornerFade: 0 } as const;

/** Inward cross-boundary derivative of a corrected patch on side k. */
function inward(quilt: QuiltSpec, cellId: Id, k: number, s: number, cross: CrossField): Pt3 {
  const cell = quilt.cells.find((c) => c.id === cellId)!;
  const b = cellBoundary(cell, quilt, cross);
  const [u, v] = uvOnSide(k, s);
  const { su, sv } = boundaryCoonsPartials(b, u, v);
  if (k === 0) return sv;
  if (k === 1) return scale3(su, -1);
  if (k === 2) return scale3(sv, -1);
  return su;
}

/**
 * How far the two owners' cross-derivatives are from being coplanar with the
 * curve, as a normalised triple product. Zero is the whole claim.
 */
function planeGap(quilt: QuiltSpec, cross: CrossField, stations = 9): number {
  const adj = quiltAdjacency(quilt);
  let worst = 0;
  for (const e of adj.edges) {
    const sA = adj.boundaries.get(e.a.cellId)!.sides[e.a.k]!;
    const sB = adj.boundaries.get(e.b.cellId)!.sides[e.b.k]!;
    for (let m = 1; m <= stations; m++) {
      const t = e.lo + ((e.hi - e.lo) * m) / (stations + 1);
      const cp = chainDeriv(sA.chain, t);
      const eA = inward(quilt, e.a.cellId, e.a.k, sideParamOf(sA, t), cross);
      const eB = inward(quilt, e.b.cellId, e.b.k, sideParamOf(sB, t), cross);
      const scale = len3(cp) * len3(eA) * len3(eB);
      if (scale === 0) continue;
      worst = Math.max(worst, Math.abs(dot3(cp, cross3(eA, eB))) / scale);
    }
  }
  return worst;
}

describe("the spline field puts both patches in one plane", () => {
  it("drives the triple product to machine zero on a folded pair", () => {
    const { quilt } = foldedPairQuilt();
    const before = planeGap(quilt, tangentField(quilt, { ...FULL, order: 1, polynomial: false }));
    expect(planeGap(quilt, tangentField(quilt, FULL))).toBeLessThan(1e-14);
    // Sanity: the measurement can see a real defect. The bisector field also
    // closes it, so compare against the uncorrected quilt instead.
    expect(before).toBeLessThan(1e-14);
  });

  it("does not close it by accident — an uncorrected quilt fails the same test", () => {
    const { quilt } = foldedPairQuilt();
    const none = { defect: (): Pt3 => [0, 0, 0], defectDeriv: (): Pt3 => [0, 0, 0] };
    expect(planeGap(quilt, none as unknown as CrossField)).toBeGreaterThan(1e-3);
  });

  it("holds on a box, where every join turns ninety degrees", () => {
    const { quilt } = boxQuilt();
    expect(planeGap(quilt, tangentField(quilt, FULL))).toBeLessThan(1e-14);
  });

  it("holds across a T-junction, where the two sides run at different rates", () => {
    const { quilt } = splitTopBoxQuilt();
    expect(planeGap(quilt, tangentField(quilt, FULL))).toBeLessThan(1e-14);
  });

  it("holds at order 2 — adding curvature does not cost the plane", () => {
    const { quilt } = foldedPairQuilt();
    expect(planeGap(quilt, tangentField(quilt, { ...FULL, order: 2 }))).toBeLessThan(1e-14);
  });
});

describe("the spline field against the bisector field", () => {
  it("reads the same tangent planes, to the same precision", () => {
    const { quilt } = foldedPairQuilt();
    const spline = continuityProbe(quilt, {
      ...SMOOTH_EVERYTHING, cross: tangentField(quilt, FULL),
    });
    const bisector = continuityProbe(quilt, {
      ...SMOOTH_EVERYTHING, cross: tangentField(quilt, { ...FULL, polynomial: false }),
    });
    expect(spline.g1Joins).toBe(bisector.g1Joins);
    expect(spline.worstDeg).toBeLessThan(1e-12);
  });

  it("builds the same body at order 1, to the tolerance it was asked for", () => {
    const { quilt } = foldedPairQuilt();
    const moved = fieldDisplacement(quilt, {
      cross: tangentField(quilt, SMOOTH_EVERYTHING),
      against: tangentField(quilt, { ...SMOOTH_EVERYTHING, polynomial: false }),
    });
    // The fit tolerance is on the cross-derivative; Φ's Hermite basis g(x) =
    // x(1-x)² scales it down by at most 4/27 on the way into the body, so the
    // tolerance IS a bound on how far the spline body can move.
    expect(moved.worst).toBeLessThan(0.05 * (4 / 27));
  });

  /**
   * Order 2 gets no such bound, and saying so is the point of this test.
   *
   * Δ² is a vector along the SHARED normal with only its magnitude fitted, so
   * where the two patches have not converged on a normal — inside a corner
   * window, which on a two-cell fixture is most of it — the model is
   * approximating something outside itself. On the P1 the order-2 spline body
   * is within 0.004 mm of the bisector body at the median and 0.04 mm at the
   * ninetieth percentile, with one cell at 1.1 mm; on this deliberately
   * hostile pair it is most of the curvature term.
   *
   * What CAN be claimed everywhere is that the fitted term is never worse than
   * not applying it: the disagreement does not exceed the correction itself.
   */
  it("never disagrees with the bisector field by more than the term it is fitting", () => {
    const { quilt } = foldedPairQuilt();
    const g1 = tangentField(quilt, { ...SMOOTH_EVERYTHING, order: 1 });
    const g2 = tangentField(quilt, { ...SMOOTH_EVERYTHING, order: 2 });
    const term = fieldDisplacement(quilt, { cross: g2, against: g1 });
    const differ = fieldDisplacement(quilt, {
      cross: g2,
      against: tangentField(quilt, { ...SMOOTH_EVERYTHING, order: 2, polynomial: false }),
    });
    expect(term.worst).toBeGreaterThan(0);
    expect(differ.worst).toBeLessThanOrEqual(term.worst);
  });
});

describe("the adaptive fit", () => {
  it("reports the pieces it used, and asking for less accuracy uses fewer", () => {
    const { quilt } = foldedPairQuilt();
    const tight = tangentField(quilt, { ...SMOOTH_EVERYTHING, fitTolerance: 1e-4 }).stats;
    const loose = tangentField(quilt, { ...SMOOTH_EVERYTHING, fitTolerance: 1 }).stats;
    expect(tight.worstSpans).toBeGreaterThan(loose.worstSpans);
    expect(loose.worstSpans).toBe(1);
    expect(tight.fits.length).toBe(tight.edges);
  });

  it("reaches the tolerance it reports as reached", () => {
    const { quilt } = foldedPairQuilt();
    const stats = tangentField(quilt, { ...SMOOTH_EVERYTHING, fitTolerance: 1e-3 }).stats;
    for (const f of stats.fits) {
      if (f.converged) expect(f.worst).toBeLessThanOrEqual(1e-3);
    }
    expect(stats.fitWorstAbs).toBe(Math.max(...stats.fits.map((f) => f.worst)));
  });

  it("says when it did not get there rather than pretending", () => {
    const { quilt } = foldedPairQuilt();
    // Unreachable tolerance with one piece allowed: the field is still built,
    // still exactly G1, and honest about the residual.
    const cross = tangentField(quilt, { ...FULL, fitTolerance: 1e-30, maxSpans: 1 });
    expect(cross.stats.unconverged).toBeGreaterThan(0);
    expect(cross.stats.worstSpans).toBe(1);
    expect(cross.stats.fitWorstAbs).toBeGreaterThan(0);
    expect(planeGap(quilt, cross)).toBeLessThan(1e-14);
  });

  it("is a pure function of the quilt — same input, same coefficients", () => {
    const { quilt } = foldedPairQuilt();
    const a = tangentField(quilt, { ...SMOOTH_EVERYTHING, order: 2 });
    const b = tangentField(quilt, { ...SMOOTH_EVERYTHING, order: 2 });
    expect(a.stats.fits).toEqual(b.stats.fits);
    for (const cell of quilt.cells) {
      for (let k = 0; k < 4; k++) {
        for (let m = 1; m < 8; m++) {
          const s = m / 8;
          expect(a.defect(cell.id, k, s)).toEqual(b.defect(cell.id, k, s));
          expect(a.defectDeriv(cell.id, k, s)).toEqual(b.defectDeriv(cell.id, k, s));
          expect(a.secondDefect(cell.id, k, s)).toEqual(b.secondDefect(cell.id, k, s));
        }
      }
    }
  });
});

describe("the along-edge derivative", () => {
  /**
   * The spline form differentiates its own coefficients instead of taking a
   * central difference. The two must agree, or the Φ term is carrying a
   * derivative that does not belong to the field it is built from.
   */
  it("matches a central difference of the field it differentiates", () => {
    const { quilt } = foldedPairQuilt();
    const cross = tangentField(quilt, SMOOTH_EVERYTHING);
    const h = 1e-6;
    let worst = 0;
    for (const cell of quilt.cells) {
      for (let k = 0; k < 4; k++) {
        for (let m = 1; m < 20; m++) {
          const s = m / 20;
          const fd = scale3(
            sub3(cross.defect(cell.id, k, s + h), cross.defect(cell.id, k, s - h)),
            1 / (2 * h),
          );
          const an = cross.defectDeriv(cell.id, k, s);
          if (len3(an) === 0 && len3(fd) === 0) continue;
          worst = Math.max(worst, len3(sub3(fd, an)) / (1 + len3(an)));
        }
      }
    }
    expect(worst).toBeLessThan(1e-5);
  });

  it("is exactly zero at both ends of every side", () => {
    const { quilt } = foldedPairQuilt();
    const cross = tangentField(quilt, { ...SMOOTH_EVERYTHING, order: 2 });
    for (const cell of quilt.cells) {
      for (let k = 0; k < 4; k++) {
        for (const s of [0, 1]) {
          expect(cross.defect(cell.id, k, s)).toEqual([0, 0, 0]);
          expect(cross.defectDeriv(cell.id, k, s)).toEqual([0, 0, 0]);
          expect(cross.secondDefect(cell.id, k, s)).toEqual([0, 0, 0]);
        }
      }
    }
  });
});
