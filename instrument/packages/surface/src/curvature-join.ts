/**
 * Cross-boundary CURVATURE continuity — the G2 probe.
 *
 * `continuityProbe` asks whether two patches share a tangent plane. This asks
 * the next question: given that they do, do they bend the same way as you
 * cross the seam? That is the difference between a body that looks smooth and
 * a body whose reflections do not break — the thing Class-A surfacing is
 * actually about, and the thing a highlight finds instantly.
 *
 * WHAT IS MEASURED, AND WHY IT IS ONE NUMBER
 *
 * The second fundamental form of a surface at a point is three coefficients.
 * Along a shared curve, with a shared normal field (which G1 delivers), two of
 * the three are not free:
 *
 *   II(T,T)  is the normal curvature of the SHARED CURVE against the SHARED
 *            normal. Both patches contain that curve and agree on that normal,
 *            so both get the same number, exactly, with nobody trying.
 *   II(T,ê)  is -⟨ê, ∇_T N⟩ — how the shared normal field rotates as you walk
 *            along the shared curve. Again a property of two shared objects.
 *
 * What is left is II(ê,ê), the normal curvature ACROSS the join. That is each
 * patch's own, and its mismatch is the whole G2 defect. So this reports one
 * scalar per station, in 1/mm, plus the relative form a curvature comb shows.
 *
 * The first two being free is not an assumption made to simplify the report —
 * it is checked. `tangentAgreement` reports the largest disagreement in
 * II(T,T) found across all the joins measured; if G1 is genuinely holding it
 * comes back at roundoff, and if it does not the G2 numbers below are being
 * read in a frame the two patches do not actually share.
 *
 * SIGN. II(ê,ê) is even in ê, so the two owners' opposite transverse
 * directions need no bookkeeping: they report comparable numbers.
 *
 * Deterministic: the same ID-ordered adjacency walk as everything else.
 */

import type { Id, Pt3, QuiltSpec } from "@car/schema";
import { dot3, len3, nabs, norm3, cross3, scale3, sub3 } from "@car/num";
import { cellBoundary, type CellBoundary, type CrossPrescription } from "./boundary.js";
import { boundaryCoonsEdgeJet, inwardOf, normalCurvatureAt } from "./coons.js";
import {
  edgeDefectProfile, medianOf, quiltAdjacency, sideParamOf, uvOnSide,
} from "./adjacency.js";
import { joinStations } from "./continuity.js";
import { DEFAULT_CREASE_ANGLE } from "./crease-angle.js";

export interface CurvatureStation {
  readonly curveId: Id;
  readonly cellA: Id;
  readonly cellB: Id;
  readonly t: number;
  readonly at: Pt3;
  /** Cross-join normal curvature of each side, 1/mm. */
  readonly curvA: number;
  readonly curvB: number;
  /** |curvA - curvB|, 1/mm. */
  readonly gap: number;
  /** gap / max(|curvA|, |curvB|), as a fraction. 0 where both are flat. */
  readonly relative: number;
}

export interface CurvatureJoinReport {
  readonly joins: number;
  readonly creased: number;
  readonly sharp: number;
  readonly samples: number;
  /** Absolute cross-curvature gap, 1/mm. */
  readonly medianGap: number;
  readonly p90Gap: number;
  /** Worst anywhere on a join INCLUDING its corners, where the curvature
   *  correction is required to vanish and the mismatch is the raw one. */
  readonly worstGap: number;
  /** Relative gap — what a curvature comb shows — as a fraction. */
  readonly medianRelative: number;
  readonly p90Relative: number;
  readonly worstRelative: number;
  /** Joins whose worst relative gap ALONG THEIR LENGTH is under
   *  `g2Tolerance`. Corners are excluded — see the note where it is counted. */
  readonly g2Joins: number;
  readonly worst: CurvatureStation | null;
  /**
   * Largest disagreement found in II(T,T), the coefficient that G1 is
   * supposed to make free. Roundoff means the frame is genuinely shared.
   */
  readonly tangentAgreement: number;
  readonly note: string;
}

export interface CurvatureJoinOptions {
  readonly samplesPerJoin?: number;
  /** A join whose relative gap stays under this counts as G2. Default 0.01. */
  readonly g2Tolerance?: number;
  readonly breakAngleDeg?: number;
  readonly cross?: CrossPrescription;
}

const DEFAULT_SAMPLES = 9;
const DEFAULT_G2_TOL = 0.01;

interface SideRead {
  readonly curv: number;
  readonly along: number;
  readonly nHat: Pt3;
}

export function curvatureJoinProbe(
  quilt: QuiltSpec,
  opts: CurvatureJoinOptions = {},
): CurvatureJoinReport {
  const n = opts.samplesPerJoin ?? DEFAULT_SAMPLES;
  const tol = opts.g2Tolerance ?? DEFAULT_G2_TOL;
  const breakAngle = opts.breakAngleDeg ?? DEFAULT_CREASE_ANGLE;
  const adj = quiltAdjacency(quilt);
  const { uniform, all: stations } = joinStations(n);
  const spread = new Set(uniform);

  const cellsById = new Map<Id, (typeof quilt.cells)[number]>();
  for (const c of quilt.cells) cellsById.set(c.id, c);
  const built = new Map<Id, CellBoundary>();
  const boundaryOf = (id: Id): CellBoundary => {
    if (!opts.cross) return adj.boundaries.get(id)!;
    const hit = built.get(id);
    if (hit) return hit;
    const b = cellBoundary(cellsById.get(id)!, quilt, opts.cross);
    built.set(id, b);
    return b;
  };

  /** One owner's cross-join and along-join normal curvature at a station. */
  const read = (cellId: Id, k: number, s: number, tHat: Pt3): SideRead | null => {
    const b = boundaryOf(cellId);
    const [u, v] = uvOnSide(k, s);
    const jet = boundaryCoonsEdgeJet(b, u, v);
    const nHat = norm3(cross3(jet.su, jet.sv));
    if (nHat[0] === 0 && nHat[1] === 0 && nHat[2] === 0) return null;
    const inward = inwardOf(jet, k);
    const perp = sub3(inward, scale3(tHat, dot3(inward, tHat)));
    const pLen = len3(perp);
    if (pLen === 0) return null;
    const across = normalCurvatureAt(jet, nHat, scale3(perp, 1 / pLen));
    const along = normalCurvatureAt(jet, nHat, tHat);
    if (across === null || along === null) return null;
    if (!Number.isFinite(across) || !Number.isFinite(along)) return null;
    return { curv: across, along, nHat };
  };

  const gaps: number[] = [];
  const rels: number[] = [];
  let worst: CurvatureStation | null = null;
  let joins = 0, creased = 0, sharp = 0, g2Joins = 0;
  let tangentAgreement = 0;
  let worstGapAny = 0, worstRelAny = 0;

  for (const edge of adj.edges) {
    if (edge.creased) { creased++; continue; }
    if (medianOf(edgeDefectProfile(adj, edge, n)) > breakAngle) { sharp++; continue; }

    const bA = boundaryOf(edge.a.cellId);
    const bB = boundaryOf(edge.b.cellId);
    const sA = bA.sides[edge.a.k]!;
    const sB = bB.sides[edge.b.k]!;
    joins++;
    let worstRel = 0;
    for (const f of stations) {
      const t = edge.lo + (edge.hi - edge.lo) * f;
      const tHat = norm3(sA.deriv(sideParamOf(sA, t)));
      if (tHat[0] === 0 && tHat[1] === 0 && tHat[2] === 0) continue;
      const A = read(edge.a.cellId, edge.a.k, sideParamOf(sA, t), tHat);
      const B = read(edge.b.cellId, edge.b.k, sideParamOf(sB, t), tHat);
      if (!A || !B) continue;
      tangentAgreement = Math.max(tangentAgreement, nabs(A.along - B.along));
      const gap = nabs(A.curv - B.curv);
      const scale = Math.max(nabs(A.curv), nabs(B.curv));
      const rel = scale > 0 ? gap / scale : 0;
      // Distribution from the evenly spaced stations, extremes from all of
      // them — see the note on `joinStations`. A median taken over two dozen
      // stations crammed into the last thousandth of an edge describes the
      // corner, not the join.
      if (spread.has(f)) { gaps.push(gap); rels.push(rel); }
      // `worstRel` decides whether this JOIN counts as G2, and it is read over
      // the join's length. The corner stations are excluded from it on purpose
      // and reported separately: at a corner the curvature correction must
      // vanish — Ψ has to, or it leaks onto the neighbouring side — so every
      // corner on every body is G1 and not G2, whatever the network does. A
      // count that folds that in says only "this body has corners".
      if (spread.has(f) && rel > worstRel) worstRel = rel;
      if (gap > worstGapAny) worstGapAny = gap;
      if (rel > worstRelAny) worstRelAny = rel;
      if (worst === null || gap > worst.gap) {
        worst = {
          curveId: edge.curveId, cellA: edge.a.cellId, cellB: edge.b.cellId,
          t, at: sA.atCurveParam(t), curvA: A.curv, curvB: B.curv, gap, relative: rel,
        };
      }
    }
    if (worstRel <= tol) g2Joins++;
  }

  const pct = (xs: readonly number[], f: number): number => {
    if (xs.length === 0) return 0;
    const a = [...xs].sort((x, y) => x - y);
    return a[Math.min(a.length - 1, Math.floor(f * a.length))]!;
  };

  return {
    joins, creased, sharp,
    samples: gaps.length,
    medianGap: pct(gaps, 0.5), p90Gap: pct(gaps, 0.9),
    worstGap: worstGapAny,
    medianRelative: pct(rels, 0.5), p90Relative: pct(rels, 0.9),
    worstRelative: worstRelAny,
    g2Joins, worst, tangentAgreement,
    note:
      "Cross-join normal curvature II(ê,ê), 1/mm, compared between the two " +
      "patches on each shared curve. The along-join and mixed coefficients are " +
      "shared for free once G1 holds; `tangentAgreement` is the check on that.",
  };
}
