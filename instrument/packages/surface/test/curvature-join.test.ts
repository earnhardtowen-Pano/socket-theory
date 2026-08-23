/**
 * Curvature continuity across a join — the G2 layer's laws.
 *
 * The claim being tested is stronger than "the number got smaller": with a
 * shared normal field, the along-join and mixed coefficients of the second
 * fundamental form are shared for free, so matching the one remaining
 * coefficient makes the join exactly G2. The tests check the freeness as well
 * as the match, because the whole construction rests on it.
 */

import { describe, expect, it } from "vitest";
import { len3 } from "@car/num";
import {
  boundaryCoonsPoint,
  cellBoundary,
  continuityProbe,
  curvatureJoinProbe,
  networkObstruction,
  tangentField,
} from "@car/surface";
import { boxQuilt, foldedPairQuilt, pyramidQuilt } from "../../mesh/test/fixtures.js";

const SMOOTH_EVERYTHING = { breakAngleDeg: 179 } as const;
const G2 = { ...SMOOTH_EVERYTHING, order: 2 } as const;
/** No corner window: the fixture's own corners are where the fade would bite. */
const G2_FULL = { ...G2, cornerFade: 0 } as const;

describe("G2: the second fundamental form across a join", () => {
  it("leaves the along-join coefficient alone — G1 already shares it", () => {
    const { quilt } = foldedPairQuilt();
    const r = curvatureJoinProbe(quilt, {
      breakAngleDeg: 179,
      cross: tangentField(quilt, G2_FULL),
    });
    // II(T,T) is the shared curve's own normal curvature against the shared
    // normal. If this is not roundoff, the frame is not actually shared and
    // every other number here is being read in the wrong basis.
    expect(r.tangentAgreement).toBeLessThan(1e-12);
  });

  it("collapses the cross-join curvature gap to machine zero", () => {
    const { quilt } = foldedPairQuilt();
    const g1 = curvatureJoinProbe(quilt, {
      breakAngleDeg: 179, cross: tangentField(quilt, { ...SMOOTH_EVERYTHING, cornerFade: 0 }),
    });
    const g2 = curvatureJoinProbe(quilt, {
      breakAngleDeg: 179, cross: tangentField(quilt, G2_FULL),
    });
    expect(g1.worstGap).toBeGreaterThan(1e-9);
    expect(g2.worstGap).toBeLessThan(1e-12);
    expect(g2.g2Joins).toBe(g2.joins);
  });

  it("does not disturb G0 — every boundary point is still bit-identical", () => {
    const { quilt } = foldedPairQuilt();
    const field = tangentField(quilt, G2);
    for (const cell of quilt.cells) {
      const plain = cellBoundary(cell, quilt);
      const fixed = cellBoundary(cell, quilt, field);
      for (let i = 0; i <= 10; i++) {
        const s = i / 10;
        for (const [u, v] of [[s, 0], [1, s], [s, 1], [0, s]] as const) {
          expect(boundaryCoonsPoint(fixed, u, v)).toEqual(boundaryCoonsPoint(plain, u, v));
        }
      }
    }
  });

  it("does not disturb G1 — adding curvature does not cost the tangent plane", () => {
    const { quilt } = foldedPairQuilt();
    const one = continuityProbe(quilt, {
      breakAngleDeg: 179, cross: tangentField(quilt, SMOOTH_EVERYTHING),
    });
    const two = continuityProbe(quilt, {
      breakAngleDeg: 179, cross: tangentField(quilt, G2),
    });
    expect(two.worstDeg).toBeLessThanOrEqual(one.worstDeg + 1e-12);
    expect(two.medianDeg).toBeLessThan(1e-10);
  });

  it("leaves a sharp break alone at order 2 as well", () => {
    const { quilt } = boxQuilt();
    const field = tangentField(quilt, { order: 2 });   // default break angle
    expect(field.stats.order).toBe(2);
    expect(field.stats.edges).toBe(0);
    for (const cell of quilt.cells) {
      for (let k = 0; k < 4; k++) {
        expect(len3(field.secondDefect(cell.id, k, 0.5))).toBe(0);
      }
    }
  });

  it("vanishes at the corners, like everything else that rides on an edge", () => {
    const { quilt } = foldedPairQuilt();
    const field = tangentField(quilt, G2);
    for (const cell of quilt.cells) {
      for (let k = 0; k < 4; k++) {
        expect(len3(field.secondDefect(cell.id, k, 0))).toBe(0);
        expect(len3(field.secondDefect(cell.id, k, 1))).toBe(0);
      }
    }
  });

  it("produces no NaN on a tapered cell", () => {
    const { quilt } = pyramidQuilt();
    const field = tangentField(quilt, G2);
    for (const cell of quilt.cells) {
      for (let k = 0; k < 4; k++) {
        for (const s of [0.2, 0.5, 0.8]) {
          const d = field.secondDefect(cell.id, k, s);
          expect(Number.isFinite(d[0] + d[1] + d[2])).toBe(true);
        }
        const p = boundaryCoonsPoint(cellBoundary(cell, quilt, field), 0.5, 0.5);
        expect(Number.isFinite(p[0] + p[1] + p[2])).toBe(true);
      }
    }
  });

  it("is deterministic", () => {
    const { quilt } = foldedPairQuilt();
    const a = tangentField(quilt, G2);
    const b = tangentField(quilt, G2);
    for (const cell of quilt.cells) {
      for (let k = 0; k < 4; k++) {
        for (let i = 0; i <= 6; i++) {
          expect(a.secondDefect(cell.id, k, i / 6)).toEqual(b.secondDefect(cell.id, k, i / 6));
        }
      }
    }
  });
});

describe("the corner obstruction is a property of the curves", () => {
  it("reports a finite obstruction on an open sheet", () => {
    // The folded pair's shared curve ends on the quilt boundary, where each
    // patch's corner is spanned by curves the other cell does not touch.
    const r = networkObstruction(foldedPairQuilt().quilt, { breakAngleDeg: 179 });
    expect(r.corners).toBeGreaterThan(0);
    expect(Number.isFinite(r.worstDeg)).toBe(true);
  });

  it("survives a degenerate corner without inventing a number", () => {
    const r = networkObstruction(pyramidQuilt().quilt, { breakAngleDeg: 179 });
    expect(Number.isFinite(r.medianDeg)).toBe(true);
    expect(Number.isFinite(r.worstDeg)).toBe(true);
  });
});
