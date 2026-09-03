/**
 * The G3 probe's claims, checked against a fixture whose answer is arithmetic.
 *
 * SYNTHETIC THROUGHOUT. Two panels meet along a straight seam at y = 0 and
 * each carries the profile z = a·s³ in its own inward direction s = |y|. A
 * Coons patch with two straight rails and two identical cubic cross curves
 * reproduces that profile EXACTLY (the ruled and bilinear terms cancel), so
 * the fixture's curvature rate at the seam is not an approximation:
 *
 *   κ(s) = 6as / (1 + 9a²s⁴)^(3/2)   ⇒   κ(0) = 0,  dκ/ds(0) = 6a, exactly.
 *
 * Both tangent planes at the seam are horizontal (z′(0) = 0 on both sides),
 * so the join is genuinely G1 and G2 — only the third order varies, which is
 * the one thing the probe under test claims to read. The claims:
 *
 *   1. Flat panels read a zero rate mismatch.
 *   2. A globally C³ profile (south = −north) reads as G3: the inward slopes
 *      cancel.
 *   3. A one-sided cubic against a flat panel reads |6a|, the known answer.
 *   4. A symmetric pagoda (both sides bending up) reads 12a and FAILS the
 *      gate — the same shape a G2 probe calls perfect.
 *   5. A creased seam is excluded, not graded.
 *   6. The report is deterministic.
 */

import { describe, expect, it } from "vitest";
import type { CubicSeg, CurveChain, Id, Pt3, QuiltSpec } from "@car/schema";
import { makeAllocator } from "@car/schema";
import { lineChain } from "@car/num";
import { curvatureRateProbe } from "../src/index.js";

const L = 400;   // seam length
const W = 300;   // panel depth

/** One cubic segment for c(t) = [x, W·t, a·(W·t)³], exactly, as a Bezier. */
function cubicRail(x: number, a: number, sign: 1 | -1): CurveChain {
  const zFar = a * W * W * W;
  const seg: CubicSeg = {
    p0: [x, 0, 0],
    p1: [x, (sign * W) / 3, 0],
    p2: [x, (sign * 2 * W) / 3, 0],
    p3: [x, sign * W, zFar],
  };
  return { segs: [seg] };
}

/** Two panels along the seam y = 0: north bends by aN, south by aS, each in
 *  its own inward direction. */
function cubicQuilt(aN: number, aS: number, creased = false): { quilt: QuiltSpec; seam: Id } {
  const alloc = makeAllocator();
  const curves = new Map<Id, CurveChain>();
  const id = (): Id => alloc.next("curve");
  const seam = id();
  const A: Pt3 = [0, 0, 0], B: Pt3 = [L, 0, 0];
  curves.set(seam, lineChain(A, B));

  const nE = id(), nN = id(), nW = id();
  curves.set(nE, cubicRail(L, aN, 1));
  curves.set(nN, lineChain([L, W, aN * W ** 3], [0, W, aN * W ** 3]));
  curves.set(nW, { segs: [...cubicRail(0, aN, 1).segs].map((s) => ({
    p0: s.p3, p1: s.p2, p2: s.p1, p3: s.p0 })) });

  const sS = id(), sE = id(), sW = id();
  curves.set(sS, lineChain([0, -W, aS * W ** 3], [L, -W, aS * W ** 3]));
  curves.set(sE, { segs: [...cubicRail(L, aS, -1).segs].map((s) => ({
    p0: s.p3, p1: s.p2, p2: s.p1, p3: s.p0 })) });
  curves.set(sW, cubicRail(0, aS, -1));

  const s = (curveId: Id, reversed: boolean) => ({ curveId, t0: 0, t1: 1, reversed });
  const north = alloc.next("cell"), south = alloc.next("cell");
  return {
    seam,
    quilt: {
      cells: [
        { id: north, sides: [s(seam, false), s(nE, false), s(nN, false), s(nW, false)] },
        { id: south, sides: [s(sS, false), s(sE, false), s(seam, true), s(sW, false)] },
      ],
      curves,
      creases: new Set<Id>(creased ? [seam] : []),
      gaps: new Set<Id>(),
      fullness: new Map<Id, number>(),
      softening: new Map(),
    },
  };
}

const A3 = 2e-6;   // 1/mm² — z(W) = 54 mm over a 300 mm panel; gentle slopes

describe("curvatureRateProbe", () => {
  it("reads a zero mismatch on flat panels, and calls the join G3", () => {
    const { quilt } = cubicQuilt(0, 0);
    const r = curvatureRateProbe(quilt);
    expect(r.joins).toBe(1);
    expect(r.samples).toBeGreaterThan(0);
    expect(r.worstGap).toBeLessThan(1e-12);
    expect(r.g3Joins).toBe(1);
  });

  it("reads a globally C³ profile as G3 — the inward slopes cancel", () => {
    const { quilt } = cubicQuilt(A3, -A3);
    const r = curvatureRateProbe(quilt);
    expect(r.joins).toBe(1);
    // The mismatch should be small against the 6a slope both sides carry.
    expect(r.worstGap).toBeLessThan(0.02 * 6 * A3);
    expect(r.g3Joins).toBe(1);
  });

  it("reads |6a| against a flat panel — the known answer", () => {
    const { quilt } = cubicQuilt(A3, 0);
    const r = curvatureRateProbe(quilt);
    expect(r.joins).toBe(1);
    expect(r.medianGap).toBeGreaterThan(0.97 * 6 * A3);
    expect(r.medianGap).toBeLessThan(1.03 * 6 * A3);
    expect(r.g3Joins).toBe(0);
  });

  it("fails the pagoda a G2 probe calls perfect", () => {
    const { quilt } = cubicQuilt(A3, A3);
    const r = curvatureRateProbe(quilt);
    expect(r.medianGap).toBeGreaterThan(0.97 * 12 * A3);
    expect(r.medianGap).toBeLessThan(1.03 * 12 * A3);
    expect(r.g3Joins).toBe(0);
    // And the relative form is 2: the gap is twice either side's own rate.
    expect(r.medianRelative).toBeGreaterThan(1.9);
  });

  it("excludes a creased seam rather than grading it", () => {
    const { quilt } = cubicQuilt(A3, A3, true);
    const r = curvatureRateProbe(quilt);
    expect(r.joins).toBe(0);
    expect(r.creased).toBe(1);
  });

  it("is deterministic", () => {
    const { quilt } = cubicQuilt(A3, -A3 / 2);
    const a = curvatureRateProbe(quilt);
    const b = curvatureRateProbe(quilt);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});
