/**
 * Quilt adjacency — which two patches actually meet along which stretch of
 * which curve.
 *
 * WHY IT IS ITS OWN FILE. Two things need this walk and they must not be
 * allowed to disagree: `continuityProbe`, which measures the G1 defect on a
 * join, and `tangentField`, which removes it. If one of them counted a pair
 * of patches as neighbours and the other did not, the probe would be
 * measuring a different surface from the one being built — which is exactly
 * the class of mistake that produced the "G1 and not G2" overclaim. So the
 * walk exists once and both import it.
 *
 * THE RULE, restated. A curve in this quilt is a master line: a shoulder runs
 * the length of the car and a dozen cells sit on it, most of them nowhere
 * near each other. Being on the same curve is not adjacency. Two owners are
 * neighbours only where their TRIM RANGES OVERLAP over a real interval —
 * T-junctions are legal, so the ranges need not be equal, but a single
 * touching point is a corner, not a shared edge.
 *
 * ORDER. Cells are visited in ID order and curves in ID order, so the edge
 * list is a deterministic function of the quilt and nothing else.
 */

import type { Id, Pt3, QuiltSpec } from "@car/schema";
import { cross3, dot3, len3, natan2 } from "@car/num";
import { idCompare } from "@car/frame";
import { cellBoundary, type CellBoundary } from "./boundary.js";
import { boundaryCoonsNormal } from "./coons.js";

/** One owner of a shared curve: a cell and which of its four sides sits on it. */
export interface EdgeOwner {
  readonly cellId: Id;
  /** Loop side index 0..3 (0 = v=0, 1 = u=1, 2 = v=1, 3 = u=0). */
  readonly k: number;
}

/** Two patches meeting along a stretch of one curve. */
export interface SharedEdge {
  readonly curveId: Id;
  readonly a: EdgeOwner;
  readonly b: EdgeOwner;
  /** Global curve parameters bounding the overlap, lo < hi. */
  readonly lo: number;
  readonly hi: number;
  /** The curve is an authored tangent break; neighbours here are meant to disagree. */
  readonly creased: boolean;
}

export interface QuiltAdjacency {
  /** Uncorrected boundaries, one per cell, built once and shared. */
  readonly boundaries: ReadonlyMap<Id, CellBoundary>;
  /** The quilt the walk read, so a caller can rebuild a boundary WITH a
   *  prescription attached without re-deriving the adjacency. */
  readonly quilt: QuiltSpec;
  /** Every overlapping owner pair, creased ones included and flagged. */
  readonly edges: readonly SharedEdge[];
  /** Owner pairs on the same curve whose trims do not overlap. */
  readonly disjointPairs: number;
  /** Sides that ended up with more than one neighbour over the same stretch —
   *  non-manifold, and worth knowing about rather than silently resolving. */
  readonly ambiguous: number;
}

/** (u,v) on the unit square for loop parameter s along side k. */
export function uvOnSide(k: number, s: number): [number, number] {
  if (k === 0) return [s, 0];
  if (k === 1) return [1, s];
  if (k === 2) return [1 - s, 1];
  return [0, 1 - s];
}

/** Loop parameter s of a side, from a global curve parameter t. */
export function sideParamOf(
  side: { readonly t0: number; readonly t1: number; readonly reversed: boolean },
  t: number,
): number {
  const span = side.reversed ? side.t0 - side.t1 : side.t1 - side.t0;
  if (span === 0) return 0;
  const base = side.reversed ? side.t1 : side.t0;
  return (t - base) / span;
}

/** Walk the quilt and pair up every genuinely adjacent (cell, side). */
export function quiltAdjacency(quilt: QuiltSpec): QuiltAdjacency {
  const boundaries = new Map<Id, CellBoundary>();
  const bySide = new Map<Id, EdgeOwner[]>();

  const cells = [...quilt.cells].sort((a, b) => idCompare(a.id, b.id));
  for (const cell of cells) {
    const b = cellBoundary(cell, quilt);
    boundaries.set(cell.id, b);
    for (let k = 0; k < 4; k++) {
      const side = b.sides[k]!;
      const list = bySide.get(side.curveId);
      if (list) list.push({ cellId: cell.id, k });
      else bySide.set(side.curveId, [{ cellId: cell.id, k }]);
    }
  }

  const edges: SharedEdge[] = [];
  let disjointPairs = 0;
  // Count of edges already claimed per (cell, side, overlap) — a third owner
  // over the same stretch means the quilt is non-manifold there.
  const claimed = new Map<string, number>();
  let ambiguous = 0;

  for (const curveId of [...bySide.keys()].sort(idCompare)) {
    const owners = bySide.get(curveId)!;
    const creased = quilt.creases.has(curveId);
    for (let i = 0; i < owners.length; i++) {
      for (let j = i + 1; j < owners.length; j++) {
        const A = owners[i]!, B = owners[j]!;
        const sA = boundaries.get(A.cellId)!.sides[A.k]!;
        const sB = boundaries.get(B.cellId)!.sides[B.k]!;
        const lo = Math.max(Math.min(sA.t0, sA.t1), Math.min(sB.t0, sB.t1));
        const hi = Math.min(Math.max(sA.t0, sA.t1), Math.max(sB.t0, sB.t1));
        if (hi - lo <= 0) { disjointPairs++; continue; }
        const kA = `${A.cellId}#${A.k}`;
        const kB = `${B.cellId}#${B.k}`;
        const nA = claimed.get(kA) ?? 0;
        const nB = claimed.get(kB) ?? 0;
        claimed.set(kA, nA + 1);
        claimed.set(kB, nB + 1);
        edges.push({ curveId, a: A, b: B, lo, hi, creased });
      }
    }
  }

  // A side legitimately carries several neighbours when they tile it (a
  // T-junction: one long side against two short ones). It is ambiguous only
  // when two of its neighbours overlap EACH OTHER — then the same stretch of
  // surface has two different opposite numbers.
  const bySideEdges = new Map<string, SharedEdge[]>();
  for (const e of edges) {
    for (const o of [e.a, e.b]) {
      const key = `${o.cellId}#${o.k}`;
      const list = bySideEdges.get(key);
      if (list) list.push(e);
      else bySideEdges.set(key, [e]);
    }
  }
  for (const list of bySideEdges.values()) {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const p = list[i]!, q = list[j]!;
        if (Math.min(p.hi, q.hi) - Math.max(p.lo, q.lo) > 0) ambiguous++;
      }
    }
  }

  return { boundaries, quilt, edges, disjointPairs, ambiguous };
}

/**
 * The natural (uncorrected) tangent-plane defect along one shared edge, in
 * degrees, at `samples` interior stations.
 *
 * This is the measurement BOTH the probe and the field key off — the probe to
 * report a join, the field to decide whether the join is a feature it must
 * leave alone. It reads the uncorrected boundaries on purpose: whether a join
 * is an authored break is a property of the design, and must not change the
 * moment a correction is applied to it.
 */
export function edgeDefectProfile(
  adj: QuiltAdjacency,
  edge: SharedEdge,
  samples: number,
): number[] {
  const bA = adj.boundaries.get(edge.a.cellId);
  const bB = adj.boundaries.get(edge.b.cellId);
  if (!bA || !bB) return [];
  const sA = bA.sides[edge.a.k]!;
  const sB = bB.sides[edge.b.k]!;
  const out: number[] = [];
  for (let m = 1; m <= samples; m++) {
    const t = edge.lo + ((edge.hi - edge.lo) * m) / (samples + 1);
    const [ua, va] = uvOnSide(edge.a.k, sideParamOf(sA, t));
    const [ub, vb] = uvOnSide(edge.b.k, sideParamOf(sB, t));
    const nA = boundaryCoonsNormal(bA, ua, va);
    const nB = boundaryCoonsNormal(bB, ub, vb);
    if (isZero(nA) || isZero(nB)) continue;
    // atan2 form, not acos — see the note in continuity.ts. A classification
    // that reads an exact join as 1.2e-6 degrees is harmless; one that reads
    // the instrument's own arithmetic as the body's residual is not.
    out.push((natan2(len3(cross3(nA, nB)), dot3(nA, nB)) * 180) / Math.PI);
  }
  return out;
}

const isZero = (v: Pt3): boolean => v[0] === 0 && v[1] === 0 && v[2] === 0;

/** Median of a defect profile; 0 for an empty one. */
export function medianOf(xs: readonly number[]): number {
  if (xs.length === 0) return 0;
  const a = [...xs].sort((x, y) => x - y);
  return a[Math.floor(a.length / 2)]!;
}
