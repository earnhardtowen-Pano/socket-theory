/**
 * Corner fairing — the plan, not the edit.
 *
 * WHAT IT IS FOR. A patch that interpolates its four boundary curves has no
 * freedom at a corner: its tangent plane there is spanned by the two curves
 * meeting at the vertex, so two patches across a shared curve agree at that
 * corner only if the NETWORK turns it cleanly. `networkObstruction` measures
 * where it does not. This works out what it would take to fix, and returns it
 * as a list of moves rather than making them — because moving a curve is
 * authoring, and authoring belongs in a verb, in the history, where it can be
 * seen and undone.
 *
 * MINIMAL, NOT TIDY. The fix rotates each adjacent curve's end tangent only far
 * enough to bring the two tangent planes into ONE plane. It does not make the
 * two curves tangent to each other. That distinction is the whole difference
 * between a fix and a restyle: on the P1 the junctions break by about 15° as
 * authored and straightening them would change the car, while coplanarity needs
 * about 1.6° and is invisible. Coplanarity is what the surfacing needs;
 * tangency is a stronger condition nobody asked for.
 *
 * WHAT IT WILL NOT TOUCH:
 *  - corners turning sharper than the break angle — those are features, and the
 *    same constant that stops the tangent field rounding off a wheel box stops
 *    this straightening a feature line;
 *  - corners already coplanar — no move, rather than a move of zero;
 *  - a corner where the adjacent curve does NOT end at the vertex (a T-junction
 *    landing mid-curve). Rotating an end tangent cannot change the direction at
 *    a point in the middle, so those are counted and left;
 *  - mirror twins. A twin is regenerated from its master every evaluation; the
 *    move belongs on the master and the twin follows.
 *
 * ONE CONTROL POINT PER MOVE. The endpoint never moves, so every weld holds
 * and the quilt stays watertight by exactly the mechanism it always did.
 *
 * Deterministic: the same ID-ordered adjacency walk as everything else, and
 * requests against one curve end are accumulated in that order.
 */

import type { Id, Pt3, QuiltSpec } from "@car/schema";
import { add3, cross3, dot3, len3, natan2, norm3, scale3, sub3 } from "@car/num";
import { isMirrorId } from "@car/frame";
import type { CellBoundary } from "./boundary.js";
import { boundaryCoonsNormal, boundaryCoonsPartials } from "./coons.js";
import {
  edgeDefectProfile, medianOf, quiltAdjacency, sideParamOf, uvOnSide,
} from "./adjacency.js";
import { DEFAULT_CREASE_ANGLE } from "./crease-angle.js";

/** Point one chain end's tangent in a new direction. */
export interface TangentMove {
  readonly curveId: Id;
  /** Which end of the chain: 0 is t=0, 1 is t=1. */
  readonly chainEnd: 0 | 1;
  /** Target unit direction, OUTGOING from that endpoint into the chain. */
  readonly direction: Pt3;
  /** How far the tangent swings to get there, degrees. The price. */
  readonly swingDeg: number;
}

export interface FairingPlan {
  /** ID-sorted, one per (curve, end); several requests are averaged. */
  readonly moves: readonly TangentMove[];
  /** Corners that were not already coplanar. */
  readonly open: number;
  /** Of those, corners this plan actually closes. */
  readonly fairable: number;
  /** Skipped as features — sharper than the break angle. */
  readonly features: number;
  /** Skipped because the adjacent curve does not end at the vertex. */
  readonly midCurve: number;
  /** Skipped because the adjacent curve is a mirror twin. */
  readonly mirrored: number;
  readonly worstSwingDeg: number;
  readonly medianSwingDeg: number;
  readonly toleranceDeg: number;
  readonly breakAngleDeg: number;
}

export interface FairingOptions {
  /** Corners turning sharper than this are features. Default: the break angle. */
  readonly breakAngleDeg?: number;
  /** A corner this close to coplanar is left alone. */
  readonly toleranceDeg?: number;
  /** How close to the corner to read. Not 0: a corner can be degenerate. */
  readonly epsilon?: number;
  readonly samplesPerJoin?: number;
}

const DEFAULT_TOLERANCE_DEG = 1;
const DEFAULT_EPSILON = 1e-5;
const DEFAULT_SAMPLES = 9;

const angleDeg = (a: Pt3, b: Pt3): number =>
  (natan2(len3(cross3(a, b)), dot3(a, b)) * 180) / Math.PI;

const isZero = (v: Pt3): boolean => v[0] === 0 && v[1] === 0 && v[2] === 0;

/** Inward cross-boundary direction of side k at (u,v). */
function inwardAt(b: CellBoundary, k: number, u: number, v: number): Pt3 {
  const { su, sv } = boundaryCoonsPartials(b, u, v);
  if (k === 0) return sv;
  if (k === 1) return scale3(su, -1);
  if (k === 2) return scale3(sv, -1);
  return su;
}

/**
 * The adjacent side at one end of side k, and where that side meets the vertex
 * in its own CHAIN's parameter.
 *
 * At the s=0 corner the previous side runs INTO the vertex, so its loop
 * parameter there is 1; at s=1 the next side runs out of it, so 0.
 */
function adjacentAt(b: CellBoundary, k: number, atLoopStart: boolean):
  { curveId: Id; chainParam: number } {
  const side = b.sides[atLoopStart ? (k + 3) % 4 : (k + 1) % 4]!;
  return { curveId: side.curveId, chainParam: side.curveParam(atLoopStart ? 1 : 0) };
}

export function cornerFairing(quilt: QuiltSpec, opts: FairingOptions = {}): FairingPlan {
  const breakAngle = opts.breakAngleDeg ?? DEFAULT_CREASE_ANGLE;
  const tol = opts.toleranceDeg ?? DEFAULT_TOLERANCE_DEG;
  const eps = opts.epsilon ?? DEFAULT_EPSILON;
  const n = opts.samplesPerJoin ?? DEFAULT_SAMPLES;
  const adj = quiltAdjacency(quilt);

  // Requests against one chain end, accumulated then averaged.
  const asks = new Map<string, { curveId: Id; chainEnd: 0 | 1; sum: Pt3; from: Pt3 }>();
  let open = 0, fairable = 0, features = 0, midCurve = 0, mirrored = 0;

  const request = (
    b: CellBoundary, k: number, atLoopStart: boolean, nStar: Pt3,
    u: number, v: number,
  ): boolean => {
    const adjacent = adjacentAt(b, k, atLoopStart);
    if (isMirrorId(adjacent.curveId)) { mirrored++; return false; }
    const chainEnd: 0 | 1 | null =
      adjacent.chainParam === 0 ? 0 : adjacent.chainParam === 1 ? 1 : null;
    if (chainEnd === null) { midCurve++; return false; }

    // The direction into the patch along that adjacent curve IS this patch's
    // inward cross-derivative at the corner — that is the Coons property the
    // whole obstruction rests on, so read it rather than re-deriving it.
    const inward = inwardAt(b, k, u, v);
    if (len3(inward) === 0) return false;
    const from = norm3(inward);
    const flat = sub3(from, scale3(nStar, dot3(from, nStar)));
    if (len3(flat) === 0) return false;
    const to = norm3(flat);

    const key = `${adjacent.curveId}#${chainEnd}`;
    const hit = asks.get(key);
    if (hit) hit.sum = add3(hit.sum, to);
    else asks.set(key, { curveId: adjacent.curveId, chainEnd, sum: to, from });
    return true;
  };

  for (const edge of adj.edges) {
    if (edge.creased) continue;
    if (medianOf(edgeDefectProfile(adj, edge, n)) > breakAngle) continue;
    const bA = adj.boundaries.get(edge.a.cellId)!;
    const bB = adj.boundaries.get(edge.b.cellId)!;
    const sA = bA.sides[edge.a.k]!;
    const sB = bB.sides[edge.b.k]!;

    for (const end of [0, 1] as const) {
      const t = edge.lo + (edge.hi - edge.lo) * (end === 0 ? eps : 1 - eps);
      const saLoop = sideParamOf(sA, t);
      const sbLoop = sideParamOf(sB, t);
      const [ua, va] = uvOnSide(edge.a.k, saLoop);
      const [ub, vb] = uvOnSide(edge.b.k, sbLoop);
      const nA = boundaryCoonsNormal(bA, ua, va);
      const nB = boundaryCoonsNormal(bB, ub, vb);
      if (isZero(nA) || isZero(nB)) continue;
      const gap = angleDeg(nA, nB);
      if (gap <= tol) continue;                 // already coplanar
      open++;
      if (gap > breakAngle) { features++; continue; }

      // The plane both should share: the one whose normal bisects theirs.
      const nStar = norm3(dot3(nA, nB) >= 0 ? add3(nA, nB) : sub3(nA, nB));
      if (isZero(nStar)) continue;

      // `end` is a parameter end of the SHARED curve; which loop end of each
      // side that is depends on the side's own direction, so ask rather than
      // assume. A reversed side runs the other way round the loop.
      const okA = request(bA, edge.a.k, saLoop < 0.5, nStar, ua, va);
      const okB = request(bB, edge.b.k, sbLoop < 0.5, nStar, ub, vb);
      if (okA && okB) fairable++;
    }
  }

  const moves: TangentMove[] = [];
  for (const key of [...asks.keys()].sort()) {
    const ask = asks.get(key)!;
    if (len3(ask.sum) === 0) continue;
    const direction = norm3(ask.sum);
    moves.push({
      curveId: ask.curveId,
      chainEnd: ask.chainEnd,
      direction,
      swingDeg: angleDeg(ask.from, direction),
    });
  }

  const swings = moves.map((m) => m.swingDeg).sort((a, b) => a - b);
  return {
    moves,
    open, fairable, features, midCurve, mirrored,
    worstSwingDeg: swings.length === 0 ? 0 : swings[swings.length - 1]!,
    medianSwingDeg: swings.length === 0 ? 0 : swings[Math.floor(swings.length / 2)]!,
    toleranceDeg: tol,
    breakAngleDeg: breakAngle,
  };
}
