/**
 * Variable-radius blends — the claims, checked one at a time.
 *
 * SYNTHETIC THROUGHOUT. The fixture is a roof: two flat half-planes meeting
 * along one straight ridge at an angle this file chooses, so every quantity
 * here is arithmetic and nothing depends on a car. The cars are witnesses.
 *
 * The claims, in the order they have to hold:
 *
 *   1. The bump's contract. t(0)=0, t′(0)=1 — same boundary behaviour as the
 *      cubic already in the file, so swapping one for the other cannot move a
 *      point or rotate a tangent plane — and t, t′, t″ all zero at the band's
 *      end, so the correction joins the untouched interior with curvature
 *      continuity and is identically zero beyond it.
 *   2. Nothing happens when nothing is asked for.
 *   3. The edge stays exactly on the curve, at every radius.
 *   4. The radius asked for is the radius a section finds.
 *   5. A radius that runs out along the line produces a line that runs out.
 *   6. A knife edge is still available and is still a knife edge.
 */

import { describe, expect, it } from "vitest";
import type { Id, Pt3, QuiltSpec } from "@car/schema";
import { makeAllocator } from "@car/schema";
import { dist3, lineChain } from "@car/num";
import {
  blendProbe, boundaryCoonsNormal, boundaryCoonsPoint, cellBoundary, MIN_BAND,
  q5, quiltAdjacency, sideParamOf, tangentField, tightBasis, tightPrime,
  tightPrime2, uvOnSide,
} from "../src/index.js";

// ── the fixture: a roof with a ridge ───────────────────────────────────────

const RIDGE = 400;   // how long the shared edge is
const SLOPE = 300;   // how far each half-plane runs from it

/**
 * Two flat panels meeting along the x axis, each tilted `halfDeg` out of the
 * ground plane, so the ridge between them breaks by twice that.
 *
 * Flat panels on purpose: a Coons patch of four straight lines is bilinear and
 * exactly planar, so the only curvature anywhere in the fixture is the
 * curvature the blend puts in. A fitted circle therefore measures the blend
 * and nothing else.
 */
function roofQuilt(halfDeg: number, soften?: { start: number; end?: number }): {
  quilt: QuiltSpec; ridge: Id;
} {
  const alloc = makeAllocator();
  const rad = (halfDeg * Math.PI) / 180;
  const dy = Math.cos(rad) * SLOPE, dz = Math.sin(rad) * SLOPE;
  const A: Pt3 = [0, 0, 0], B: Pt3 = [RIDGE, 0, 0];
  const curves = new Map<Id, ReturnType<typeof lineChain>>();
  const id = (): Id => alloc.next("curve");
  const ridge = id();
  curves.set(ridge, lineChain(A, B));
  // North panel: +y, rising. South panel: -y, rising.
  const nE = id(), nN = id(), nW = id();
  const nFar0: Pt3 = [RIDGE, dy, dz], nFar1: Pt3 = [0, dy, dz];
  curves.set(nE, lineChain(B, nFar0));
  curves.set(nN, lineChain(nFar0, nFar1));
  curves.set(nW, lineChain(nFar1, A));
  const sS = id(), sE = id(), sW = id();
  const sFar0: Pt3 = [0, -dy, dz], sFar1: Pt3 = [RIDGE, -dy, dz];
  curves.set(sS, lineChain(sFar0, sFar1));
  curves.set(sE, lineChain(sFar1, B));
  curves.set(sW, lineChain(A, sFar0));

  const s = (curveId: Id, reversed: boolean) => ({ curveId, t0: 0, t1: 1, reversed });
  const north = alloc.next("cell"), south = alloc.next("cell");
  return {
    ridge,
    quilt: {
      cells: [
        { id: north, sides: [s(ridge, false), s(nE, false), s(nN, false), s(nW, false)] },
        { id: south, sides: [s(sS, false), s(sE, false), s(ridge, true), s(sW, false)] },
      ],
      curves,
      creases: new Set<Id>([ridge]),
      gaps: new Set<Id>(),
      fullness: new Map<Id, number>(),
      softening: soften ? new Map([[ridge, soften]]) : new Map(),
    },
  };
}

/**
 * Break still standing at the ridge, degrees — measured off the built surface.
 *
 * NOT `continuityProbe`, and the first version of this helper was. That probe
 * reports the joins the field was asked to hold, and it SKIPS creased ones by
 * design — so it answered 0.000° for a fixture with a 40° knife edge in it and
 * three tests passed on the strength of it. A helper that cannot see the thing
 * under test is worse than no helper.
 */
function ridgeBreak(quilt: QuiltSpec, ridge: Id): number {
  const adj = quiltAdjacency(quilt);
  const cross = tangentField(quilt, { breakAngleDeg: 179 });
  const e = adj.edges.find((x) => x.curveId === ridge);
  if (!e) throw new Error("no ridge in the fixture");
  const bA = cellBoundary(quilt.cells.find((c) => c.id === e.a.cellId)!, quilt, cross);
  const bB = cellBoundary(quilt.cells.find((c) => c.id === e.b.cellId)!, quilt, cross);
  let worst = 0;
  for (const f of [0.25, 0.5, 0.75]) {
    const t = e.lo + (e.hi - e.lo) * f;
    const [ua, va] = uvOnSide(e.a.k, sideParamOf(bA.sides[e.a.k]!, t));
    const [ub, vb] = uvOnSide(e.b.k, sideParamOf(bB.sides[e.b.k]!, t));
    const nA = boundaryCoonsNormal(bA, ua, va);
    const nB = boundaryCoonsNormal(bB, ub, vb);
    const dot = nA[0] * nB[0] + nA[1] * nB[1] + nA[2] * nB[2];
    const cx = [
      nA[1] * nB[2] - nA[2] * nB[1],
      nA[2] * nB[0] - nA[0] * nB[2],
      nA[0] * nB[1] - nA[1] * nB[0],
    ];
    const mag = Math.hypot(cx[0]!, cx[1]!, cx[2]!);
    worst = Math.max(worst, (Math.atan2(mag, dot) * 180) / Math.PI);
  }
  return worst;
}

// ── 1. the bump's contract ────────────────────────────────────────────────

describe("the tight bump", () => {
  it("meets the boundary exactly as the cubic it replaces does", () => {
    for (const band of [0.05, 0.2, 0.5, 1]) {
      expect(tightBasis(0, band)).toBe(0);
      // t′(0) = 1 is the whole reason a mix of the two bumps delivers the
      // prescribed cross-derivative at ANY mix. Without it the boundary would
      // depend on the radius, and G1 would depend on the styling.
      expect(tightPrime(0, band)).toBeCloseTo(1, 12);
    }
  });

  it("vanishes to second order where the band ends, and stays there", () => {
    for (const band of [0.05, 0.2, 0.5]) {
      const eps = band * 1e-6;
      expect(Math.abs(tightBasis(band - eps, band))).toBeLessThan(1e-10);
      expect(Math.abs(tightPrime(band - eps, band))).toBeLessThan(1e-8);
      expect(Math.abs(tightPrime2(band - eps, band))).toBeLessThan(1e-3);
      // Beyond it, identically zero — not small. That is what lets the
      // opposite edge of a patch be untouched to every order rather than to
      // first order, which the cubic cannot say (g″(1) = 2).
      for (const x of [band, band + 0.01, 0.9, 1]) {
        expect(tightBasis(x, band)).toBe(0);
        expect(tightPrime(x, band)).toBe(0);
        expect(tightPrime2(x, band)).toBe(0);
      }
    }
  });

  it("is the quintic it says it is", () => {
    expect(q5(0)).toBe(0);
    expect(q5(1)).toBe(0);
    // Six conditions pinned six coefficients; a typo in any of them shows here.
    expect(q5(0.5)).toBeCloseTo(0.5 - 6 * 0.125 + 8 * 0.0625 - 3 * 0.03125, 12);
  });
});

// ── 2, 3. nothing asked, nothing done; and the seam never moves ───────────

describe("a body with no softening authored", () => {
  it("carries no tight share and no band", () => {
    const { quilt } = roofQuilt(20);
    const cross = tangentField(quilt, { breakAngleDeg: 179 });
    for (const cell of quilt.cells) {
      for (let k = 0; k < 4; k++) {
        expect(cross.band(cell.id, k)).toBe(0);
        for (const s of [0.1, 0.5, 0.9]) {
          expect(cross.tightShare(cell.id, k, s)).toBe(0);
          expect(cross.tightShareDeriv(cell.id, k, s)).toBe(0);
        }
      }
    }
    expect(cross.blends).toHaveLength(0);
  });
});

describe("the seam", () => {
  it("stays exactly on the shared curve at every radius", () => {
    for (const r of [0, 2, 8, 40, 400]) {
      const { quilt } = roofQuilt(20, { start: r });
      const cross = tangentField(quilt, { breakAngleDeg: 179 });
      for (const cell of quilt.cells) {
        const b = cellBoundary(cell, quilt, cross);
        for (const s of [0, 0.13, 0.5, 0.87, 1]) {
          for (let k = 0; k < 4; k++) {
            const side = b.sides[k]!;
            const uv: [number, number] =
              k === 0 ? [s, 0] : k === 1 ? [1, s] : k === 2 ? [1 - s, 1] : [0, 1 - s];
            const got = boundaryCoonsPoint(b, uv[0], uv[1]);
            expect(dist3(got, side.point(s))).toBeLessThan(1e-9);
          }
        }
      }
    }
  });
});

// ── 4. the radius asked for is the radius a section finds ────────────────

describe("a softened ridge", () => {
  it("rounds a break that a crease would have left as a knife edge", () => {
    const sharp = roofQuilt(20);
    const soft = roofQuilt(20, { start: 30 });
    // The fixture's two panels are tilted 20 degrees each way, so the ridge
    // between them breaks by 40. Creased, that survives to the surface intact.
    expect(ridgeBreak(sharp.quilt, sharp.ridge)).toBeCloseTo(40, 6);
    // Softened, the curve is tangent-continuous and the turn is in the band.
    expect(ridgeBreak(soft.quilt, soft.ridge)).toBeLessThan(1e-6);
  });

  it("delivers the radius it was asked for, at every radius and every break", () => {
    // FIVE PER CENT, with no fitted constant anywhere in the chain. The band
    // comes out of a closed form and this is a section of the built surface
    // measured from positions alone, so agreement at this level is the two
    // meeting rather than one being tuned to the other.
    // Radii inside what the fixture can carry. The widest a 600 mm panel with
    // a 40 degree ridge can be is 215 mm, so 300 would be capped — that is the
    // cap working and it is checked below, not here.
    for (const halfDeg of [5, 10, 20]) {
      for (const r of [4, 20, 80]) {
        const { quilt } = roofQuilt(halfDeg, { start: r });
        const report = blendProbe(quilt, { stations: 3, samples: 150 });
        expect(report.edges).toBe(1);
        expect(report.stations).toBe(3);
        expect(
          report.worstRelative,
          `${2 * halfDeg} degree break at R${r}`,
        ).toBeLessThan(0.05);
      }
    }
  });

  it("drifts with the break angle, and only with the break angle", () => {
    // The closed form drops an |S_ξ|³ term, so the agreement above loosens as
    // the break opens: 1.5% at 40 degrees, 10% at 90. A fold is not a feature
    // line and this is stated rather than corrected. What must NOT drift is
    // the radius: if the ratio moved with the ask, the form would be wrong.
    for (const halfDeg of [5, 20, 30]) {
      const ratios: number[] = [];
      for (const r of [4, 20, 80]) {
        const { quilt } = roofQuilt(halfDeg, { start: r });
        const rep = blendProbe(quilt, { stations: 1, samples: 150 });
        ratios.push(rep.readings[0]!.achieved / r);
      }
      const spread = Math.max(...ratios) - Math.min(...ratios);
      expect(spread, `${2 * halfDeg} degree break`).toBeLessThan(0.005);
    }
    // And the drift with the break really is there, in the direction stated.
    const soft = blendProbe(roofQuilt(5, { start: 20 }).quilt, { stations: 1, samples: 150 });
    const hard = blendProbe(roofQuilt(45, { start: 20 }).quilt, { stations: 1, samples: 150 });
    expect(soft.readings[0]!.achieved / 20).toBeGreaterThan(hard.readings[0]!.achieved / 20);
    expect(soft.readings[0]!.achieved / 20).toBeLessThan(1.05);
  });

  it("publishes how far it stands from a rolling ball", () => {
    const { quilt } = roofQuilt(20, { start: 40 });
    const report = blendProbe(quilt, { stations: 3, samples: 80 });
    // Positive and small: the edge is pinned to the curve and a true fillet
    // would cut the corner off by the arc's sagitta. It is a real difference
    // and this is the number, not an assurance that it is negligible.
    expect(report.worstOffset).toBeGreaterThan(0);
    expect(report.worstOffset).toBeLessThan(0.05 * 40);
  });
});

// ── 5. the run-out ────────────────────────────────────────────────────────

describe("a radius that runs out along the line", () => {
  it("opens from one end to the other", () => {
    // 15 to 80 is inside the six-to-one a side's two bumps can span, so every
    // station is delivered rather than capped and the run is strictly monotone.
    const { quilt } = roofQuilt(20, { start: 15, end: 80 });
    const report = blendProbe(quilt, { stations: 7, samples: 120 });
    const byT = [...report.readings].sort((a, b) => a.t - b.t);
    expect(byT.length).toBe(7);
    const first = byT[0]!, last = byT[byT.length - 1]!;
    // Stations sit inside the edge, not at its ends, so the asked ratio is
    // a little under the authored 80/15.
    expect(last.asked / first.asked).toBeGreaterThan(4);
    // What the surface did about it: monotone at every step, and by a real
    // factor rather than a hair. This is the whole feature — a line crisp at
    // one end and soft at the other, with nothing terminating anywhere.
    expect(last.achieved / first.achieved).toBeGreaterThan(3);
    // Monotone within 5%, not to the last digit. The soft end of the run sits
    // near where the pair of bumps saturates, the mix is nearly flat there,
    // and a radius read off a section of a nearly straight curve carries a few
    // percent. What must not happen is the line getting CRISPER as it runs
    // out, and that is what this catches.
    for (let i = 1; i < byT.length; i++) {
      expect(byT[i]!.achieved).toBeGreaterThan(byT[i - 1]!.achieved * 0.95);
    }
    expect(byT[3]!.achieved).toBeGreaterThan(byT[0]!.achieved * 1.5);
  });

  it("caps beyond six to one, and says so", () => {
    // A side's band is a knot and cannot move along the edge, so the pair of
    // bumps spans a fixed ratio of radii. Ask for more and the soft end
    // saturates — which is reported, not hidden. The answer for a wider run is
    // `split-curve` (A13): two pieces, two bands, two ratios end to end.
    const { quilt } = roofQuilt(20, { start: 15, end: 400 });
    const field = tangentField(quilt, { breakAngleDeg: 179 });
    expect(field.blends[0]!.plans[0]!.cappedWide).toBeGreaterThan(0);
    const report = blendProbe(quilt, { stations: 7, samples: 120 });
    const byT = [...report.readings].sort((a, b) => a.t - b.t);
    const first = byT[0]!, last = byT[byT.length - 1]!;
    // Still opens by most of the ratio it can carry, and never runs backwards
    // by more than the measurement's own noise.
    expect(last.achieved / first.achieved).toBeGreaterThan(4);
    expect(last.achieved).toBeLessThan(last.asked);
  });

  it("never lets go of the seam while it does it", () => {
    const { quilt } = roofQuilt(20, { start: 15, end: 200 });
    const report = blendProbe(quilt, { stations: 7, samples: 60 });
    // A run-out that opened a tangent break somewhere along its length would
    // be a defect wearing a feature's name.
    expect(report.worstResidualDeg).toBeLessThan(1e-6);
  });
});

// ── 6. the knife edge is still there ─────────────────────────────────────

describe("radius zero", () => {
  it("is the same instruction as a plain crease", () => {
    const plain = roofQuilt(20);
    const zero = roofQuilt(20, { start: 0 });
    expect(ridgeBreak(zero.quilt, zero.ridge)).toBeCloseTo(
      ridgeBreak(plain.quilt, plain.ridge), 9,
    );
  });

  it("leaves the field with nothing to do", () => {
    const { quilt } = roofQuilt(20, { start: 0 });
    const cross = tangentField(quilt, { breakAngleDeg: 179 });
    expect(cross.blends).toHaveLength(0);
    expect(cross.stats.creasedEdges).toBe(1);
  });
});

// ── the band floor ────────────────────────────────────────────────────────

describe("an ask the panel cannot carry", () => {
  it("is capped rather than faked, at both ends", () => {
    // Tighter than the band's numerical floor: the band bottoms out, the plan
    // says so, and the delivered radius is honestly larger than the ask.
    const tight = roofQuilt(20, { start: 0.05 });
    const tf = tangentField(tight.quilt, { breakAngleDeg: 179 });
    expect(tf.blends).toHaveLength(1);
    expect(tf.blends[0]!.plans[0]!.band).toBeCloseTo(MIN_BAND, 9);
    expect(tf.blends[0]!.plans[0]!.cappedTight).toBeGreaterThan(0);
    const got = blendProbe(tight.quilt, { stations: 1, samples: 150 }).readings[0]!;
    expect(got.achieved).toBeGreaterThan(got.asked);

    // Softer than a panel this size can be: all wide, and reported.
    const wide = roofQuilt(20, { start: 1e5 });
    const wf = tangentField(wide.quilt, { breakAngleDeg: 179 });
    expect(wf.blends[0]!.plans[0]!.cappedWide).toBeGreaterThan(0);
    expect(wf.blends[0]!.plans[0]!.mix[1]).toBe(0);
  });
});
