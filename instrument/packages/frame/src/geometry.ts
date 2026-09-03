/**
 * Chain-level geometry helpers for the frame ops. Everything here is
 * deterministic: fixed iteration counts, no wall clock, transcendentals
 * only through @car/num.
 */

import type { CubicSeg, CurveChain, Pt3 } from "@car/schema";
import { add3, dist3, lerp, nfloor, reverseChain, scale3, splitCubic, sub3 } from "@car/num";

/** Positional coincidence tolerance, mm. Constructed junctions are exact;
 *  this only absorbs float noise from equivalent arithmetic orderings. */
export const COINCIDENT_EPS = 1e-6;

/** Parameter-space tolerance for degenerate sub-ranges. */
export const PARAM_EPS = 1e-9;

export const samePt = (a: Pt3, b: Pt3): boolean => dist3(a, b) <= COINCIDENT_EPS;

/** Global chain param -> (segment index, local param) under uniform parameterization. */
export function segAtCount(segCount: number, t: number): { i: number; u: number } {
  const tt = t < 0 ? 0 : t > 1 ? 1 : t;
  const scaled = tt * segCount;
  let i = nfloor(scaled);
  if (i >= segCount) i = segCount - 1;
  return { i, u: scaled - i };
}

export function segAt(ch: CurveChain, t: number): { i: number; u: number } {
  return segAtCount(ch.segs.length, t);
}

/**
 * Extract the exact sub-chain covering global params [t0,t1] (t0 < t1),
 * optionally reversed. Works segment-wise so multi-segment chains keep
 * their shape exactly (splitCubic is de Casteljau — shape-preserving).
 */
export function subChain(ch: CurveChain, t0: number, t1: number, reversed: boolean): CurveChain {
  let segs: CubicSeg[];
  if (t0 <= PARAM_EPS && t1 >= 1 - PARAM_EPS) {
    segs = [...ch.segs];
  } else {
    const a = segAt(ch, t0);
    const b = segAt(ch, t1);
    // normalize "at a seam" to the earlier segment's u=1 end
    if (b.u <= PARAM_EPS && b.i > 0) {
      b.i -= 1;
      b.u = 1;
    }
    if (a.u >= 1 - PARAM_EPS && a.i < ch.segs.length - 1) {
      a.i += 1;
      a.u = 0;
    }
    if (a.i === b.i) {
      const seg = ch.segs[a.i];
      if (!seg) throw new Error("subChain: segment out of range");
      const right = splitCubic(seg, a.u)[1];
      const local = a.u >= 1 - PARAM_EPS ? 1 : (b.u - a.u) / (1 - a.u);
      segs = [splitCubic(right, local)[0]];
    } else {
      segs = [];
      const first = ch.segs[a.i];
      if (!first) throw new Error("subChain: segment out of range");
      if (a.u < 1 - PARAM_EPS) segs.push(splitCubic(first, a.u)[1]);
      for (let i = a.i + 1; i < b.i; i++) {
        const s = ch.segs[i];
        if (!s) throw new Error("subChain: segment out of range");
        segs.push(s);
      }
      const last = ch.segs[b.i];
      if (!last) throw new Error("subChain: segment out of range");
      if (b.u > PARAM_EPS) segs.push(splitCubic(last, b.u)[0]);
    }
  }
  const out: CurveChain = { segs };
  return reversed ? reverseChain(out) : out;
}

/** All control points of a chain, flattened xyz — the evaluated-buffer shape. */
export function chainControlBuffer(ch: CurveChain): Float64Array {
  const out = new Float64Array(ch.segs.length * 12);
  let k = 0;
  for (const s of ch.segs) {
    for (const p of [s.p0, s.p1, s.p2, s.p3]) {
      out[k++] = p[0];
      out[k++] = p[1];
      out[k++] = p[2];
    }
  }
  return out;
}

/** Chain-fraction of each control point under uniform parameterization. */
function ctrlFraction(segIndex: number, cpIndex: number, segCount: number): number {
  return (segIndex + cpIndex / 3) / segCount;
}

/**
 * Drag one chain end by `delta`, weighting every control point linearly by
 * its chain fraction (1 at the dragged end, 0 at the far end). This is the
 * stretch that keeps straight edges exactly straight when an endpoint moves,
 * and two-end drags compose to a rigid translate.
 */
export function dragChainEnd(ch: CurveChain, end: "start" | "end", delta: Pt3): CurveChain {
  const n = ch.segs.length;
  const segs = ch.segs.map((s, si) => {
    const move = (p: Pt3, ci: number): Pt3 => {
      const u = ctrlFraction(si, ci, n);
      const w = end === "start" ? 1 - u : u;
      return add3(p, scale3(delta, w));
    };
    return { p0: move(s.p0, 0), p1: move(s.p1, 1), p2: move(s.p2, 2), p3: move(s.p3, 3) };
  });
  return { segs };
}

/** Scale every control point toward a fixed center (taper mechanism). */
export function scaleChainToward(ch: CurveChain, center: Pt3, scale: number): CurveChain {
  const f = (p: Pt3): Pt3 => add3(center, scale3(sub3(p, center), scale));
  return { segs: ch.segs.map((s) => ({ p0: f(s.p0), p1: f(s.p1), p2: f(s.p2), p3: f(s.p3) })) };
}

/**
 * Remap a global chain param recorded against an n-seg chain after inserting
 * a subdivision inside segment `segIndex` at local `tLoc` (placePoint).
 */
export function remapParamAfterInsert(
  t: number,
  segCount: number,
  segIndex: number,
  tLoc: number,
): number {
  const { i, u } = segAtCount(segCount, t);
  const nNew = segCount + 1;
  if (i < segIndex) return (i + u) / nNew;
  if (i > segIndex) return (i + 1 + u) / nNew;
  if (u <= tLoc) return (i + (tLoc <= PARAM_EPS ? 0 : u / tLoc)) / nNew;
  return (i + 1 + (u - tLoc) / (1 - tLoc)) / nNew;
}

/** Linear interpolation in side space -> curve param space for a trim range. */
export function sideParamToCurveParam(
  t0: number,
  t1: number,
  reversed: boolean,
  u: number,
): number {
  return reversed ? lerp(t1, t0, u) : lerp(t0, t1, u);
}
