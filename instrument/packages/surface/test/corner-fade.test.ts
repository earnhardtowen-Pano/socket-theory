/**
 * The corner fade, and the fact that the fade band IS the defect.
 *
 * A join can only fail to be G1 inside the band next to a corner, because that
 * is the only place the correction is not fully applied. Everything here is a
 * consequence of that one sentence:
 *
 *  - the two ends of a side are sized separately, because they are different
 *    corners and one may be closed while the other is not;
 *  - the residual is proportional to the width, so narrowing the band removes
 *    the break rather than hiding it;
 *  - and a probe that does not sample inside the band cannot see any of it.
 *
 * The last one is why these tests exist at all. Nine evenly spaced stations
 * start at a tenth of an edge and read 2.3e-14° on a body whose real worst was
 * eight degrees, one twentieth of an edge from a corner.
 */

import { describe, expect, it } from "vitest";
import type { QuiltSpec } from "@car/schema";
import { cross3, dot3, len3, natan2 } from "@car/num";
import {
  type CrossPrescription,
  boundaryCoonsNormal, cellBoundary, continuityProbe, cornerWindow, cornerWindowDeriv,
  joinStations, networkObstruction, quiltAdjacency, sideParamOf, tangentField, uvOnSide,
} from "@car/surface";
import { boxQuilt, foldedPairQuilt } from "../../mesh/test/fixtures.js";

const SMOOTH_EVERYTHING = { breakAngleDeg: 179 } as const;

/** Worst tangent-plane defect at ONE fraction along every join. */
function probeAt(quilt: QuiltSpec, cross: CrossPrescription, f: number): number {
  const adj = quiltAdjacency(quilt);
  let worst = 0;
  for (const e of adj.edges) {
    const cellA = quilt.cells.find((c) => c.id === e.a.cellId)!;
    const cellB = quilt.cells.find((c) => c.id === e.b.cellId)!;
    const bA = cellBoundary(cellA, quilt, cross);
    const bB = cellBoundary(cellB, quilt, cross);
    const t = e.lo + (e.hi - e.lo) * f;
    const [ua, va] = uvOnSide(e.a.k, sideParamOf(bA.sides[e.a.k]!, t));
    const [ub, vb] = uvOnSide(e.b.k, sideParamOf(bB.sides[e.b.k]!, t));
    const nA = boundaryCoonsNormal(bA, ua, va);
    const nB = boundaryCoonsNormal(bB, ub, vb);
    if (len3(nA) === 0 || len3(nB) === 0) continue;
    worst = Math.max(worst, (natan2(len3(cross3(nA, nB)), dot3(nA, nB)) * 180) / Math.PI);
  }
  return worst;
}

describe("the window", () => {
  it("is zero at both ends, one across the middle, whatever the two widths", () => {
    for (const [lo, hi] of [[0.1, 0.1], [0.3, 0.01], [0.001, 0.4]] as const) {
      expect(cornerWindow(0, lo, hi)).toBe(0);
      expect(cornerWindow(1, lo, hi)).toBe(0);
      expect(cornerWindow(0.5, lo, hi)).toBe(1);
      // Just inside each band it is partly on; just outside, fully on.
      expect(cornerWindow(lo / 2, lo, hi)).toBeGreaterThan(0);
      expect(cornerWindow(lo / 2, lo, hi)).toBeLessThan(1);
      expect(cornerWindow(lo * 1.5, lo, hi)).toBe(1);
      expect(cornerWindow(1 - hi / 2, lo, hi)).toBeLessThan(1);
    }
  });

  it("sizes its two ends independently — the whole point of the change", () => {
    // Wide at the start, narrow at the end: a quarter in is still ramping,
    // while the mirror of it is long since at full strength.
    expect(cornerWindow(0.25, 0.4, 0.01)).toBeLessThan(1);
    expect(cornerWindow(0.75, 0.4, 0.01)).toBe(1);
  });

  it("leaves and arrives flat — C¹ at both ends, and C² by smootherstep", () => {
    for (const [lo, hi] of [[0.2, 0.05], [0.05, 0.2]] as const) {
      expect(cornerWindowDeriv(0, lo, hi)).toBe(0);
      expect(cornerWindowDeriv(1, lo, hi)).toBe(0);
      const h = 1e-7;
      for (const s of [lo / 3, lo * 0.9, 0.5, 1 - hi * 0.9, 1 - hi / 3]) {
        const fd = (cornerWindow(s + h, lo, hi) - cornerWindow(s - h, lo, hi)) / (2 * h);
        expect(cornerWindowDeriv(s, lo, hi)).toBeCloseTo(fd, 4);
      }
    }
  });
});

describe("the probe looks where the defect can be", () => {
  it("crowds both corners, down to a millionth of an edge", () => {
    const { uniform, all } = joinStations(9);
    expect(uniform.length).toBe(9);
    expect(Math.min(...uniform)).toBeCloseTo(0.1, 12);
    expect(Math.min(...all)).toBeLessThanOrEqual(1e-6);
    expect(Math.max(...all)).toBeGreaterThanOrEqual(1 - 1e-6);
    // Symmetric, and the uniform set is a subset of it.
    for (const f of uniform) expect(all).toContain(f);
    for (const f of all) expect(all.some((g) => Math.abs(g - (1 - f)) < 1e-15)).toBe(true);
  });

  it("sees a defect that evenly spaced stations cannot", () => {
    const { quilt } = foldedPairQuilt();
    const cross = tangentField(quilt, { ...SMOOTH_EVERYTHING, cornerFade: 0.05 });
    const blind = continuityProbe(quilt, { ...SMOOTH_EVERYTHING, cross, samplesPerJoin: 9 });
    // The median is read from the evenly spaced stations and is machine zero;
    // the worst is read from all of them and is not. Both numbers are true and
    // they are about different questions.
    expect(blind.medianDeg).toBeLessThan(1e-10);
    expect(blind.worstDeg).toBeGreaterThan(1e-3);
  });
});

describe("what the band can and cannot do", () => {
  /**
   * The vertex enclosure problem, as a test. At a corner the correction is
   * REQUIRED to vanish — Δ has to, or Φ moves the neighbouring edge and G0 is
   * gone — so whatever the two patches disagree about at that vertex, they
   * still disagree about after the field runs. Narrowing the band does not
   * touch it.
   */
  it("cannot close an open corner, however narrow the band", () => {
    const { quilt } = boxQuilt();
    const obstruction = networkObstruction(quilt, {
      toleranceDeg: 1, breakAngleDeg: 179,
    }).worstDeg;
    expect(obstruction).toBeGreaterThan(45);       // a box's corners are as open as they come
    for (const cornerFade of [0.2, 0.02, 0.002]) {
      const worst = continuityProbe(quilt, {
        ...SMOOTH_EVERYTHING,
        cross: tangentField(quilt, { ...SMOOTH_EVERYTHING, cornerFade }),
      }).worstDeg;
      expect(worst).toBeCloseTo(obstruction, 3);
    }
  });

  /**
   * What it CAN do is decide how fast the join heals. That is the whole reason
   * to size each end by its own corner: a band wide enough for a 90° vertex is
   * a band of defect a coplanar one never needed.
   */
  it("decides how fast the join heals away from the corner", () => {
    const { quilt } = boxQuilt();
    const readAt = (cornerFade: number, f: number): number =>
      probeAt(quilt, tangentField(quilt, { ...SMOOTH_EVERYTHING, cornerFade }), f);
    // A station well inside a wide band and well outside a narrow one.
    expect(readAt(0.2, 0.01)).toBeGreaterThan(1);
    expect(readAt(0.002, 0.01)).toBeLessThan(1e-9);
  });

  it("leaves the middle of every join untouched whatever the widths", () => {
    const { quilt } = boxQuilt();
    for (const cornerFade of [0.2, 0.02, 0.002]) {
      const c = continuityProbe(quilt, {
        ...SMOOTH_EVERYTHING,
        cross: tangentField(quilt, { ...SMOOTH_EVERYTHING, cornerFade }),
      });
      expect(c.medianDeg).toBeLessThan(1e-10);
    }
  });
});
