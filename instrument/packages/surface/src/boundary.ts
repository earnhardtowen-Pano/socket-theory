/**
 * Cell boundary extraction — the four oriented boundary functions of a cell.
 *
 * Loop law (frame statute): sides in loop order, counter-clockwise seen from
 * outside; the end of side k coincides with the start of side k+1. Each side
 * traverses a sub-range [t0,t1] of ONE shared curve chain, `reversed` meaning
 * the loop runs t1 down to t0.
 *
 * Watertightness mechanism, restated at this seam:
 *  - corners are evaluated ONCE per cell (corner k = loop start of side k)
 *    and shared by reference between adjacent sides — corner agreement is
 *    exact by construction, not by tolerance;
 *  - every boundary evaluation routes through the one shared CurveChain
 *    object, so two cells sampling the same curve parameter get bit-identical
 *    points (`atCurveParam`), and grid sampling maps side params to curve
 *    params through one shared arithmetic form (`gridParam`) so matched grid
 *    indices of welded neighbors land on bit-identical parameters.
 */

import type { CurveChain, Id, Pt3, QuiltSpec } from "@car/schema";
import { chainDeriv, evalChain, scale3 } from "@car/num";
import { FrameState } from "@car/frame";

/** Sub-range claim on a shared curve — the shape both SideRef and QuiltSide satisfy. */
export interface SideRange {
  readonly curveId: Id;
  readonly t0: number;
  readonly t1: number;
  readonly reversed: boolean;
}

/** The shape both a frame Cell and a QuiltCell satisfy. */
export interface CellLike {
  readonly id: Id;
  readonly sides: readonly [SideRange, SideRange, SideRange, SideRange];
}

export type ChainSource = (curveId: Id) => CurveChain;

/** Anything boundaries can be extracted against. FrameState resolves weld
 *  aliases; a QuiltSpec arrives pre-resolved (mirror twins included). */
export type ChainLookup = FrameState | QuiltSpec | ChainSource;

export function chainsOf(source: ChainLookup): ChainSource {
  if (typeof source === "function") return source;
  if (source instanceof FrameState) {
    return (id: Id): CurveChain => {
      const c = source.curves.get(source.resolveCurve(id));
      if (!c) throw new Error(`surface: unknown curve ${id}`);
      return c.chain;
    };
  }
  return (id: Id): CurveChain => {
    const ch = source.curves.get(id);
    if (!ch) throw new Error(`surface: unknown curve ${id}`);
    return ch;
  };
}

function resolverOf(source: ChainLookup): (id: Id) => Id {
  if (source instanceof FrameState) return (id: Id): Id => source.resolveCurve(id);
  return (id: Id): Id => id;
}

/**
 * One oriented boundary function. `point(s)` runs in loop direction over
 * s ∈ [0,1]; s=0 and s=1 return the cell's shared corner references exactly.
 */
export interface BoundarySide {
  /** Resolved curve id — identical for every owner of the shared curve. */
  readonly curveId: Id;
  /** The ONE shared chain object (never a copy). */
  readonly chain: CurveChain;
  readonly t0: number;
  readonly t1: number;
  readonly reversed: boolean;
  /** Corner at s=0 — the same reference as the previous side's `end`. */
  readonly start: Pt3;
  /** Corner at s=1 — the same reference as the next side's `start`. */
  readonly end: Pt3;
  /** Loop param -> global curve param; exact at the endpoints. */
  curveParam(s: number): number;
  /** Curve param at loop grid index i of n. One arithmetic form across all
   *  owners: matched indices of equal-range neighbors are bit-identical. */
  gridParam(i: number, n: number): number;
  point(s: number): Pt3;
  /** Grid sample: i=0 / i=n return the exact corner references. */
  gridPoint(i: number, n: number): Pt3;
  /** Raw evalChain on the shared chain — bit-identical across all owners. */
  atCurveParam(t: number): Pt3;
  /** d(point)/ds in loop direction. */
  deriv(s: number): Pt3;
  gridDeriv(i: number, n: number): Pt3;
}

export interface CellBoundary {
  readonly cellId: Id;
  readonly sides: readonly [BoundarySide, BoundarySide, BoundarySide, BoundarySide];
  /** Corner k = loop start of side k. In Coons terms:
   *  P00=corners[0], P10=corners[1], P11=corners[2], P01=corners[3]. */
  readonly corners: readonly [Pt3, Pt3, Pt3, Pt3];
}

function makeSide(
  curveId: Id,
  chain: CurveChain,
  t0: number,
  t1: number,
  reversed: boolean,
  start: Pt3,
  end: Pt3,
): BoundarySide {
  const dtds = reversed ? t0 - t1 : t1 - t0;
  const curveParam = (s: number): number => {
    if (s === 0) return reversed ? t1 : t0;
    if (s === 1) return reversed ? t0 : t1;
    return reversed ? t1 + s * (t0 - t1) : t0 + s * (t1 - t0);
  };
  const gridParam = (i: number, n: number): number => {
    const k = reversed ? n - i : i;
    if (k === 0) return t0;
    if (k === n) return t1;
    return t0 + (k / n) * (t1 - t0);
  };
  return {
    curveId, chain, t0, t1, reversed, start, end,
    curveParam,
    gridParam,
    point: (s: number): Pt3 =>
      s === 0 ? start : s === 1 ? end : evalChain(chain, curveParam(s)),
    gridPoint: (i: number, n: number): Pt3 =>
      i === 0 ? start : i === n ? end : evalChain(chain, gridParam(i, n)),
    atCurveParam: (t: number): Pt3 => evalChain(chain, t),
    deriv: (s: number): Pt3 => scale3(chainDeriv(chain, curveParam(s)), dtds),
    gridDeriv: (i: number, n: number): Pt3 => scale3(chainDeriv(chain, gridParam(i, n)), dtds),
  };
}

/** Extract the four oriented boundary functions of a cell. */
export function cellBoundary(cell: CellLike, source: ChainLookup): CellBoundary {
  const chainOf = chainsOf(source);
  const resolve = resolverOf(source);

  const resolved: SideRange[] = [];
  const chains: CurveChain[] = [];
  for (const s of cell.sides) {
    const curveId = resolve(s.curveId);
    resolved.push({ curveId, t0: s.t0, t1: s.t1, reversed: s.reversed });
    chains.push(chainOf(curveId));
  }

  const corners: Pt3[] = [];
  for (let k = 0; k < 4; k++) {
    const s = resolved[k];
    const ch = chains[k];
    if (!s || !ch) throw new Error(`surface: cell ${cell.id} has fewer than four sides`);
    corners.push(evalChain(ch, s.reversed ? s.t1 : s.t0));
  }

  const sides: BoundarySide[] = [];
  for (let k = 0; k < 4; k++) {
    const s = resolved[k];
    const ch = chains[k];
    const start = corners[k];
    const end = corners[(k + 1) % 4];
    if (!s || !ch || !start || !end) throw new Error(`surface: cell ${cell.id} boundary incomplete`);
    sides.push(makeSide(s.curveId, ch, s.t0, s.t1, s.reversed, start, end));
  }

  return {
    cellId: cell.id,
    sides: sides as unknown as CellBoundary["sides"],
    corners: corners as unknown as CellBoundary["corners"],
  };
}
