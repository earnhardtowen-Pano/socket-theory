/**
 * GlobalSampleTable — charge §10, the conforming mesher's foundation.
 *
 * Every shared curve is sampled ONCE, globally: per curveId the parameter list
 * is the union of a uniform base lattice with EVERY trim endpoint (t0/t1) of
 * every side that references the curve. One vertex per (curveId, param),
 * evaluated exactly once; every cell that touches the curve consumes those
 * vertex indices. Watertightness is index sharing, never coordinate matching.
 *
 * Corner identity is structural, not metric: the quilt's loop law ("the end of
 * side k coincides exactly with the start of side k+1") lets a union-find weld
 * the endpoint samples of adjacent sides into one mesh vertex — across cells,
 * because both cells name the same (curveId, param) keys. No coordinates are
 * compared to establish identity; positions are only read to detect a side
 * tapered to a point (its two trim-end evaluations bitwise coincide), which
 * collapses that side's samples to the single lowest-param vertex.
 */

import type { CurveChain, Id, Pt3, QuiltSide, QuiltSpec } from "@car/schema";
import { clamp, evalChain } from "@car/num";
import { compareId, sortedIds } from "./ids.js";

export interface SideSamples {
  /** True when the side's two trim-end vertices coincide (or t0 === t1). */
  readonly collapsed: boolean;
  /** Table vertex indices in LOOP order (loop start → loop end); one entry when collapsed. */
  readonly verts: readonly number[];
  /** Loop-local parameters in [0,1], ascending, parallel to `verts`; [0] when collapsed. */
  readonly s: readonly number[];
}

export type CellSides = readonly [SideSamples, SideSamples, SideSamples, SideSamples];

export interface GlobalSampleTable {
  /** Curve ids in stable-ID order — the traversal order that assigned vertices. */
  readonly curveIds: readonly Id[];
  /** Welded table vertex count (corner samples of adjacent sides share one index). */
  readonly vertexCount: number;
  /** xyz per table vertex, mm, Float64 — 3 * vertexCount entries. */
  readonly positions: Float64Array;
  /** The sorted global parameter list of a curve (base lattice ∪ all trim endpoints). */
  paramsOf(curveId: Id): readonly number[];
  /** The welded vertex index for an exact (curveId, param) table entry. */
  vertexAt(curveId: Id, param: number): number;
  /** Per-cell, loop-ordered side samples (indices into `positions`). */
  sidesOf(cellId: Id): CellSides;
  /** Position of a table vertex. */
  posOf(vertex: number): Pt3;
}

interface RawSample {
  readonly curveId: Id;
  readonly param: number;
  readonly pos: Pt3;
}

const samePos = (a: Pt3, b: Pt3): boolean =>
  a[0] === b[0] && a[1] === b[1] && a[2] === b[2];

/** Union-find with path compression; deterministic (indices only). */
class Weld {
  private readonly parent: number[];
  constructor(n: number) {
    this.parent = Array.from({ length: n }, (_, i) => i);
  }
  find(i: number): number {
    let r = i;
    while (this.parent[r] !== r) r = this.parent[r]!;
    let c = i;
    while (this.parent[c] !== c) {
      const next = this.parent[c]!;
      this.parent[c] = r;
      c = next;
    }
    return r;
  }
  union(a: number, b: number): void {
    const ra = this.find(a);
    const rb = this.find(b);
    // canonical: smaller raw index wins the root, so class representatives
    // (and therefore vertex order and positions) are input-order deterministic
    if (ra === rb) return;
    if (ra < rb) this.parent[rb] = ra;
    else this.parent[ra] = rb;
  }
}

function chainOrThrow(quilt: QuiltSpec, curveId: Id): CurveChain {
  const ch = quilt.curves.get(curveId);
  if (!ch) throw new Error(`quilt side references unknown curve ${curveId}`);
  return ch;
}

/**
 * Build the per-curve global parameter lists.
 *
 * THE UNION STEP (charge §10, T-junction law): base lattice params are joined
 * with every referencing side's t0 and t1. A neighbor holding a whole trim
 * over a curve that another pair of cells split at t therefore samples t too —
 * the T vertex exists once and all three cells consume the same index. Meshing
 * per-cell instead of per-curve would drop exactly this step and open a crack
 * at every T point.
 */
function buildParams(quilt: QuiltSpec, baseDensity: number): Map<Id, number[]> {
  const density = Math.max(1, Math.floor(baseDensity));
  const trimEnds = new Map<Id, number[]>();
  for (const cell of quilt.cells) {
    for (const side of cell.sides) {
      chainOrThrow(quilt, side.curveId);
      const list = trimEnds.get(side.curveId) ?? [];
      list.push(clamp(side.t0, 0, 1), clamp(side.t1, 0, 1));
      trimEnds.set(side.curveId, list);
    }
  }
  const out = new Map<Id, number[]>();
  for (const curveId of sortedIds(quilt.curves.keys())) {
    const ch = chainOrThrow(quilt, curveId);
    const n = Math.max(1, ch.segs.length) * density;
    const params: number[] = [];
    for (let k = 0; k <= n; k++) params.push(k / n);
    params.push(...(trimEnds.get(curveId) ?? []));
    params.sort((a, b) => a - b);
    const dedup: number[] = [];
    for (const p of params) {
      if (dedup.length === 0 || dedup[dedup.length - 1] !== p) dedup.push(p);
    }
    out.set(curveId, dedup);
  }
  return out;
}

interface SideTrim {
  readonly lo: number;
  readonly hi: number;
  readonly reversed: boolean;
}

const trimOf = (side: QuiltSide): SideTrim => {
  const a = clamp(side.t0, 0, 1);
  const b = clamp(side.t1, 0, 1);
  // schema promises t0 <= t1; normalize defensively rather than fail
  return { lo: Math.min(a, b), hi: Math.max(a, b), reversed: side.reversed };
};

export function buildSampleTable(quilt: QuiltSpec, baseDensity: number): GlobalSampleTable {
  const paramsByCurve = buildParams(quilt, baseDensity);
  const curveIds = sortedIds(paramsByCurve.keys());

  // one evaluation per (curveId, param) — raw vertex order is (curve, param) sorted
  const raw: RawSample[] = [];
  const rawIndex = new Map<Id, Map<number, number>>();
  for (const curveId of curveIds) {
    const ch = chainOrThrow(quilt, curveId);
    const perParam = new Map<number, number>();
    for (const t of paramsByCurve.get(curveId)!) {
      perParam.set(t, raw.length);
      raw.push({ curveId, param: t, pos: evalChain(ch, t) });
    }
    rawIndex.set(curveId, perParam);
  }
  const rawAt = (curveId: Id, t: number): number => {
    const i = rawIndex.get(curveId)?.get(t);
    if (i === undefined) throw new Error(`no table sample at (${curveId}, ${t})`);
    return i;
  };

  // a side's loop endpoints as raw samples; collapse-aware
  const sideEnds = (side: QuiltSide): { start: number; end: number; collapsed: boolean } => {
    const { lo, hi, reversed } = trimOf(side);
    const iLo = rawAt(side.curveId, lo);
    const iHi = rawAt(side.curveId, hi);
    const collapsed = lo === hi || samePos(raw[iLo]!.pos, raw[iHi]!.pos);
    if (collapsed) return { start: iLo, end: iLo, collapsed: true };
    return reversed
      ? { start: iHi, end: iLo, collapsed: false }
      : { start: iLo, end: iHi, collapsed: false };
  };

  // weld corners by loop adjacency — structural identity, no coordinate matching
  const weld = new Weld(raw.length);
  const cells = [...quilt.cells].sort((a, b) => compareId(a.id, b.id));
  for (const cell of cells) {
    for (let k = 0; k < 4; k++) {
      const here = sideEnds(cell.sides[k]!);
      const next = sideEnds(cell.sides[(k + 1) % 4]!);
      weld.union(here.end, next.start);
    }
  }

  // final vertices: classes ordered by smallest raw member; representative position
  const finalOfRoot = new Map<number, number>();
  const finalOfRaw = new Array<number>(raw.length);
  const finalPos: number[] = [];
  for (let i = 0; i < raw.length; i++) {
    const root = weld.find(i);
    let f = finalOfRoot.get(root);
    if (f === undefined) {
      f = finalOfRoot.size;
      finalOfRoot.set(root, f);
      const p = raw[i]!.pos;
      finalPos.push(p[0], p[1], p[2]);
    }
    finalOfRaw[i] = f;
  }
  const positions = new Float64Array(finalPos);
  const vertexCount = positions.length / 3;

  const vertexAt = (curveId: Id, param: number): number => {
    return finalOfRaw[rawAt(curveId, param)]!;
  };
  const posOf = (v: number): Pt3 =>
    [positions[3 * v]!, positions[3 * v + 1]!, positions[3 * v + 2]!];

  // per-cell loop-ordered side samples
  const buildSide = (side: QuiltSide): SideSamples => {
    const { lo, hi, reversed } = trimOf(side);
    const ends = sideEnds(side);
    if (ends.collapsed) {
      return { collapsed: true, verts: [finalOfRaw[ends.start]!], s: [0] };
    }
    const span = hi - lo;
    const all = paramsByCurve.get(side.curveId)!;
    const entries: { s: number; v: number }[] = [];
    for (const t of all) {
      if (t < lo || t > hi) continue;
      // exact 0 and 1 at the trim ends: (lo-lo)/span = 0, (hi-lo)/span = 1
      const s = reversed ? (hi - t) / span : (t - lo) / span;
      entries.push({ s, v: vertexAt(side.curveId, t) });
    }
    entries.sort((a, b) => a.s - b.s);
    return {
      collapsed: false,
      verts: entries.map((e) => e.v),
      s: entries.map((e) => e.s),
    };
  };
  const sidesByCell = new Map<Id, CellSides>();
  for (const cell of cells) {
    sidesByCell.set(cell.id, [
      buildSide(cell.sides[0]!),
      buildSide(cell.sides[1]!),
      buildSide(cell.sides[2]!),
      buildSide(cell.sides[3]!),
    ]);
  }

  return {
    curveIds,
    vertexCount,
    positions,
    paramsOf: (curveId) => {
      const p = paramsByCurve.get(curveId);
      if (!p) throw new Error(`unknown curve ${curveId}`);
      return p;
    },
    vertexAt,
    sidesOf: (cellId) => {
      const s = sidesByCell.get(cellId);
      if (!s) throw new Error(`unknown cell ${cellId}`);
      return s;
    },
    posOf,
  };
}
