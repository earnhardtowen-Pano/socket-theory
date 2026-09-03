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
import { chainDeriv, chainDeriv2, evalChain, scale3 } from "@car/num";
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
  /** d²(point)/ds² in loop direction. The trim scale enters SQUARED, and
   *  the sign of a reversed side cancels — a second derivative does not care
   *  which way round the loop runs. */
  deriv2(s: number): Pt3;
}

/**
 * One claim's field, as coefficients rather than as a sampler.
 *
 * `defect` and friends answer "what is Δ at this station". This answers "what
 * IS Δ" — the same numbers the sampler reads, handed over so a caller can do
 * exact algebra with them instead of sampling. Nothing here is computed on
 * demand; it is a view of what the fit already produced.
 */
export interface FieldPiece {
  /** The stretch of the side's loop parameter this claim covers. */
  readonly s0: number;
  readonly s1: number;
  /** The claim's own range in the shared curve's global parameter. τ = (t−lo)/(hi−lo). */
  readonly lo: number;
  readonly hi: number;
  readonly degree: number;
  readonly knots: readonly number[];
  /** Shared with the neighbour BY REFERENCE — that is the G1 mechanism. */
  readonly dStar: readonly Pt3[];
  /** a(τ): the C′ component. Reparameterisation; invisible to the plane. */
  readonly along: readonly number[];
  /** λ(τ): the D* component. */
  readonly across: readonly number[];
  /** μ(τ) for the G2 magnitude; empty at order 1. */
  readonly second: readonly number[];
  /** μ's own degree and knots — it has its own span ladder, so these are
   *  generally NOT `degree` and `knots` above. */
  readonly secondDegree: number;
  readonly secondKnots: readonly number[];
}

/** Everything needed to write one side's correction down as a polynomial. */
export interface SideField {
  /** The two corner-fade widths, in the side's own loop parameter. */
  readonly fade: readonly [number, number];
  /** Empty in bisector form — there the field is not polynomial at all. */
  readonly pieces: readonly FieldPiece[];
}

/**
 * A prescribed cross-boundary derivative correction, keyed by cell and side.
 * Structural on purpose: `tangentField` in `tangent-field.ts` satisfies this,
 * and stating it here rather than importing it keeps the dependency running
 * one way — the field is DERIVED from uncorrected boundaries, so it cannot be
 * a prerequisite for building one.
 */
export interface CrossPrescription {
  /** Δ_k(s): what to add to side k's inward cross-boundary derivative. */
  defect(cellId: Id, k: number, s: number): Pt3;
  /** Δ_k′(s), along the edge. Exactly zero at s = 0 and s = 1. */
  defectDeriv(cellId: Id, k: number, s: number): Pt3;
  /** Δ²_k(s): the curvature correction. Absent for a G1-only prescription. */
  secondDefect?(cellId: Id, k: number, s: number): Pt3;
  /** The same field as coefficients, for callers doing exact algebra. Absent
   *  when the prescription was not built in polynomial form. */
  sideField?(cellId: Id, k: number): SideField | null;
  /**
   * α_k(s) ∈ [0,1]: how much of this side's correction rides the TIGHT bump
   * rather than the panel-wide one — see `blend.ts`. Absent, or zero, is the
   * behaviour every car in this repository had before softening existed.
   */
  tightShare?(cellId: Id, k: number, s: number): number;
  /** dα_k/ds along the edge. Zero at s = 0 and s = 1, like everything else. */
  tightShareDeriv?(cellId: Id, k: number, s: number): number;
  /** Width of side k's tight bump, in that side's inward parameter. */
  band?(cellId: Id, k: number): number;
  /** Width of side k's WIDE bump; zero means the panel-wide cubic. */
  wideBand?(cellId: Id, k: number): number;
}

/** The same thing, already bound to one cell. */
export interface CrossDefects {
  value(k: number, s: number): Pt3;
  deriv(k: number, s: number): Pt3;
  second?(k: number, s: number): Pt3;
  tightShare?(k: number, s: number): number;
  tightShareDeriv?(k: number, s: number): number;
  band?(k: number): number;
  wideBand?(k: number): number;
}

export interface CellBoundary {
  readonly cellId: Id;
  readonly sides: readonly [BoundarySide, BoundarySide, BoundarySide, BoundarySide];
  /** Corner k = loop start of side k. In Coons terms:
   *  P00=corners[0], P10=corners[1], P11=corners[2], P01=corners[3]. */
  readonly corners: readonly [Pt3, Pt3, Pt3, Pt3];
  /** Tangent-plane prescription for this cell, or null for the plain G0 blend. */
  readonly cross: CrossDefects | null;
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
    deriv2: (s: number): Pt3 => scale3(chainDeriv2(chain, curveParam(s)), dtds * dtds),
  };
}

/** Extract the four oriented boundary functions of a cell. */
export function cellBoundary(
  cell: CellLike,
  source: ChainLookup,
  cross?: CrossPrescription,
): CellBoundary {
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
    cross: cross
      ? {
          value: (k: number, s: number): Pt3 => cross.defect(cell.id, k, s),
          deriv: (k: number, s: number): Pt3 => cross.defectDeriv(cell.id, k, s),
          ...(cross.secondDefect
            ? { second: (k: number, s: number): Pt3 => cross.secondDefect!(cell.id, k, s) }
            : {}),
          ...(cross.tightShare
            ? {
                tightShare: (k: number, s: number): number => cross.tightShare!(cell.id, k, s),
                tightShareDeriv: (k: number, s: number): number =>
                  cross.tightShareDeriv ? cross.tightShareDeriv(cell.id, k, s) : 0,
                band: (k: number): number => (cross.band ? cross.band(cell.id, k) : 0),
                wideBand: (k: number): number =>
                  cross.wideBand ? cross.wideBand(cell.id, k) : 0,
              }
            : {}),
        }
      : null,
  };
}
