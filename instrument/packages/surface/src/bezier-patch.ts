/**
 * The control net — the corrected patch written down as tensor-product Bézier
 * tiles rather than sampled.
 *
 * `boundaryCoonsPoint` ANSWERS "where is the surface at (u,v)". This module
 * answers "what IS the surface", by rebuilding
 *
 *     S = S₀ + Φ + Ψ
 *
 * out of exact polynomial algebra: `@car/num/poly` for products, sums,
 * elevation and restriction, and `sideField` for the fitted coefficients the
 * evaluator reads at run time. Nothing is fitted here and nothing is sampled.
 * The gate is that the two agree to the last bit the arithmetic can carry.
 *
 * WHY TILES. Three things make the patch piecewise, and none of them is
 * negotiable:
 *
 *   - a boundary is a CHAIN of cubics, so a side breaks at every segment
 *     boundary the trim crosses;
 *   - a field is a B-spline with adaptive knots, so it breaks at every knot;
 *   - the corner window is piecewise by construction — smootherstep in, one
 *     across the middle, smootherstep out.
 *
 * So the natural object is a B-spline surface, and its Bézier form is a grid
 * of tiles over the union of all three breakpoint sets. That grid IS the
 * knot vector: a caller writing `B_SPLINE_SURFACE_WITH_KNOTS` reads the
 * breaks as interior knots at full multiplicity, and a caller writing a
 * `GEOMETRIC_SET` writes one untrimmed surface per tile.
 *
 * WHAT IT COSTS. A tile is bidegree (13,13) wherever a corner window is
 * active and (8,8) where it is not, which `scripts/patch-degree.ts` derives
 * from the construction rather than from a guess. The tile COUNT is the real
 * expense: a cell with a 32-span field on one side carries thirty-odd
 * breakpoints in that direction. `cellBezier` reports both so neither is a
 * surprise.
 */

import type { Id, Pt3 } from "@car/schema";
import {
  addBezier, addBezier3, bezierSegments, bezierSegments3, crossBezier3, derivBezier3,
  elevateBezier3,
  elevateBezierTo, multiplyBezier, powerBezier, restrictBezier3, scaleBezier,
  scaleBezier3, type Vec3Bezier,
} from "@car/num";
import type { CellBoundary, FieldPiece, SideField } from "./boundary.js";
import type { CrossField } from "./tangent-field.js";

/** One tensor-product Bézier tile. `ctrl[i][j]`: i runs over u, j over v. */
export interface BezierTile {
  readonly degreeU: number;
  readonly degreeV: number;
  readonly ctrl: readonly (readonly Pt3[])[];
}

/**
 * A cell as a grid of tiles over its own [0,1]².
 *
 * `breaksU` has `tiles.length + 1` entries and `breaksV` has
 * `tiles[0].length + 1`; tile (i,j) covers
 * `[breaksU[i], breaksU[i+1]] × [breaksV[j], breaksV[j+1]]` in the cell's
 * parameters, and is written in its own local [0,1]² inside that box.
 */
export interface CellNet {
  readonly cellId: Id;
  readonly breaksU: readonly number[];
  readonly breaksV: readonly number[];
  readonly tiles: readonly (readonly BezierTile[])[];
  /** Worst bidegree over all tiles — what a single-degree writer must use. */
  readonly degreeU: number;
  readonly degreeV: number;
  /** How many control points the whole cell costs at that worst degree. */
  readonly controlPoints: number;
}

// ── one-dimensional pieces ────────────────────────────────────────────────

/** A vector polynomial on [a,b], written in its own local parameter. */
interface Piece {
  readonly a: number;
  readonly b: number;
  readonly c: Vec3Bezier;
}

const ZERO3: Pt3 = [0, 0, 0];
const constPiece = (a: number, b: number, p: Pt3): Piece => ({ a, b, c: [p] });
const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);
const isZero = (c: Vec3Bezier): boolean =>
  c.every((p) => p[0] === 0 && p[1] === 0 && p[2] === 0);

/** Numerically distinct breakpoints, sorted, spanning [0,1]. */
function breakpoints(values: readonly number[]): number[] {
  const out = [0, 1];
  for (const v of values) if (v > TOL_BREAK && v < 1 - TOL_BREAK) out.push(v);
  out.sort((x, y) => x - y);
  const kept: number[] = [];
  for (const v of out) {
    const last = kept[kept.length - 1];
    if (last === undefined || v - last > TOL_BREAK) kept.push(v);
  }
  if (kept[kept.length - 1] !== 1) kept.push(1);
  return kept;
}

/**
 * Breakpoints closer than this are one breakpoint.
 *
 * Not a tolerance on the geometry — the pieces either side of a break agree
 * there by construction, so merging two that are a nanometre of parameter
 * apart changes nothing and keeps a zero-width tile out of the net. The same
 * reasoning, and the same failure mode, as the near-duplicate grid columns
 * that were spreading zero-area quads across the mesh.
 */
const TOL_BREAK = 1e-12;

/** Restrict a piecewise function onto a finer set of breaks. */
function refine(pieces: readonly Piece[], breaks: readonly number[]): Piece[] {
  const out: Piece[] = [];
  for (let i = 0; i < breaks.length - 1; i++) {
    const a = breaks[i]!, b = breaks[i + 1]!;
    const mid = 0.5 * (a + b);
    let host = pieces.find((p) => mid >= p.a && mid <= p.b);
    if (!host) host = mid < pieces[0]!.a ? pieces[0]! : pieces[pieces.length - 1]!;
    const span = host.b - host.a;
    if (span <= 0) { out.push({ a, b, c: host.c }); continue; }
    const lo = (a - host.a) / span, hi = (b - host.a) / span;
    out.push({ a, b, c: restrictBezier3(host.c, lo, hi) });
  }
  return out;
}

/** f(1−x) as a piecewise function: reverse the order and each polynomial. */
function flip(pieces: readonly Piece[]): Piece[] {
  return pieces
    .map((p) => ({ a: 1 - p.b, b: 1 - p.a, c: [...p.c].reverse() as Vec3Bezier }))
    .sort((x, y) => x.a - y.a);
}

const scalePieces = (x: readonly Piece[], k: number): Piece[] =>
  x.map((p) => ({ a: p.a, b: p.b, c: p.c.map((q) => [q[0] * k, q[1] * k, q[2] * k] as Pt3) }));

/** d/ds of a piecewise function — the chain rule on each local parameter. */
const derivPieces = (x: readonly Piece[]): Piece[] =>
  x.map((p) => ({
    a: p.a, b: p.b,
    c: scaleBezier3([1 / (p.b - p.a)], derivBezier3(p.c)),
  }));

// ── the boundary, as pieces ───────────────────────────────────────────────

/**
 * One side of the cell as a piecewise cubic in its own loop parameter.
 *
 * The chain is uniform over [0,1] across its segments, so a trim crossing a
 * segment boundary breaks there and nowhere else. Each piece is the segment's
 * own four control points restricted to the stretch the trim covers — exact,
 * by de Casteljau, with no resampling anywhere.
 */
function sidePieces(b: CellBoundary, k: number): Piece[] {
  const side = b.sides[k]!;
  const segs = side.chain.segs;
  const n = segs.length;
  const tA = side.curveParam(0), tB = side.curveParam(1);
  const dt = tB - tA;

  const cuts: number[] = [];
  if (dt !== 0) {
    for (let j = 1; j < n; j++) {
      const s = (j / n - tA) / dt;
      if (s > TOL_BREAK && s < 1 - TOL_BREAK) cuts.push(s);
    }
  }
  const breaks = breakpoints(cuts);

  const out: Piece[] = [];
  for (let i = 0; i < breaks.length - 1; i++) {
    const sa = breaks[i]!, sb = breaks[i + 1]!;
    const ta = tA + sa * dt, tb = tA + sb * dt;
    const mid = 0.5 * (ta + tb);
    let j = Math.floor(mid * n);
    if (j < 0) j = 0;
    if (j > n - 1) j = n - 1;
    const seg = segs[j]!;
    const ctrl: Vec3Bezier = [seg.p0, seg.p1, seg.p2, seg.p3];
    // A reversed side runs the segment BACKWARDS, so its window in the
    // segment's own parameter is [xb, xa] and the piece has to be reversed
    // after restriction. Getting this wrong returns the forward curve and
    // every corner of the patch lands on the wrong one.
    const xa = clamp01(n * ta - j), xb = clamp01(n * tb - j);
    const lo = Math.min(xa, xb), hi = Math.max(xa, xb);
    const window = hi > lo ? restrictBezier3(ctrl, lo, hi) : ctrl;
    out.push({ a: sa, b: sb, c: xb < xa ? ([...window].reverse() as Vec3Bezier) : window });
  }
  return out;
}

// ── the corner window, as pieces ──────────────────────────────────────────

/** smootherstep(z) = 6z⁵ − 15z⁴ + 10z³, in the Bernstein basis of degree 5. */
function smootherstepBezier(): number[] {
  const z3 = elevateBezierTo(powerBezier(3), 5);
  const z4 = elevateBezierTo(powerBezier(4), 5);
  const z5 = powerBezier(5);
  return addBezier(addBezier(scaleBezier(z3, 10), scaleBezier(z4, -15)), scaleBezier(z5, 6));
}

/** A scalar piecewise function — the window and the magnitude splines. */
interface ScalarPiece { readonly a: number; readonly b: number; readonly c: readonly number[] }

/**
 * ρ(s), the corner window, exactly as `cornerWindow` computes it: smootherstep
 * in over the first fade, one across the middle, smootherstep out over the
 * last. Piecewise by construction, which is where two of the tile breaks come
 * from.
 */
function windowPieces(fade: readonly [number, number]): { pieces: ScalarPiece[]; cuts: number[] } {
  const a = Math.min(fade[0], 0.5), b = Math.min(fade[1], 0.5);
  const S = smootherstepBezier();
  const cuts: number[] = [];
  const pieces: ScalarPiece[] = [];
  let at = 0;
  if (a > 0) {
    pieces.push({ a: 0, b: a, c: S });
    cuts.push(a);
    at = a;
  }
  const end = b > 0 ? 1 - b : 1;
  if (end > at) pieces.push({ a: at, b: end, c: [1] });
  if (b > 0) {
    // z = (1−s)/b runs backwards, so the same quintic with its coefficients
    // reversed. Exact: reversal is what f(1−x) does to a Bernstein list.
    pieces.push({ a: end, b: 1, c: [...S].reverse() });
    cuts.push(end);
  }
  return { pieces, cuts };
}

// ── the correction fields, as pieces ──────────────────────────────────────

/** A magnitude spline restricted to one claim, as Bézier pieces in s. */
function splinePieces(
  coeffs: readonly number[], degree: number, knots: readonly number[],
  toS: (tau: number) => number,
): { pieces: ScalarPiece[]; cuts: number[] } {
  if (coeffs.length === 0) return { pieces: [], cuts: [] };
  const { breaks, segments } = bezierSegments(degree, knots, coeffs);
  const pieces: ScalarPiece[] = [];
  for (let i = 0; i < segments.length; i++) {
    const s0 = toS(breaks[i]!), s1 = toS(breaks[i + 1]!);
    const lo = Math.min(s0, s1), hi = Math.max(s0, s1);
    pieces.push({ a: lo, b: hi, c: s1 < s0 ? [...segments[i]!].reverse() : segments[i]! });
  }
  pieces.sort((x, y) => x.a - y.a);
  // The INTERIOR knot images, read off the knots rather than off the pieces:
  // a reversed side runs τ backwards, so "the low end of segment i" is the
  // wrong cut for half the sides in the quilt and the one it misses is the
  // one the extrapolation then hides.
  const cuts = breaks.slice(1, -1).map(toS);
  return { pieces, cuts };
}

/** The same for the vector-valued D*. */
function vectorPieces(
  coeffs: readonly Pt3[], piece: FieldPiece, toS: (tau: number) => number,
): Piece[] {
  const { breaks, segments } = bezierSegments3(piece.degree, piece.knots, coeffs);
  const out: Piece[] = [];
  for (let i = 0; i < segments.length; i++) {
    const s0 = toS(breaks[i]!), s1 = toS(breaks[i + 1]!);
    const lo = Math.min(s0, s1), hi = Math.max(s0, s1);
    out.push({ a: lo, b: hi, c: s1 < s0 ? ([...segments[i]!].reverse() as Vec3Bezier) : segments[i]! });
  }
  return out;
}

/** Look up the piece of a scalar piecewise function covering [a,b]. */
function scalarOn(pieces: readonly ScalarPiece[], a: number, b: number): number[] {
  const mid = 0.5 * (a + b);
  const host = pieces.find((p) => mid >= p.a && mid <= p.b) ?? pieces[pieces.length - 1];
  if (!host) return [0];
  straddle(host.a, host.b, a, b, "scalar");
  const span = host.b - host.a;
  if (span <= 0) return [...host.c];
  const lo = (a - host.a) / span, hi = (b - host.a) / span;
  return restrictScalar(host.c, lo, hi);
}

/**
 * A tile that reaches past its host piece is not a small error; it is a cubic
 * evaluated outside the span it was fitted on, which is how a missing
 * breakpoint hides as a fifth of a millimetre. Every break the construction
 * has is supposed to be in the tile grid, so this can only fire on a bug in
 * the break set — and firing loudly is the whole point.
 */
function straddle(ha: number, hb: number, a: number, b: number, what: string): void {
  const slack = 1e-9;
  if (a < ha - slack || b > hb + slack) {
    throw new Error(
      `bezier-patch: a ${what} tile [${a}, ${b}] reaches outside its piece [${ha}, ${hb}] — ` +
      "a breakpoint is missing from the net");
  }
}

/** `restrictBezier` on a scalar, routed through the vector form so there is
 *  one subdivision implementation rather than two. */
function restrictScalar(c: readonly number[], lo: number, hi: number): number[] {
  const asVec: Vec3Bezier = c.map((v) => [v, 0, 0] as Pt3);
  return restrictBezier3(asVec, lo, hi).map((p) => p[0]);
}

export interface CellNetOptions {
  /** Include the order-2 term. Default: on when the field carries one. */
  readonly order?: 1 | 2;
}

/**
 * Why a cell could not be written down, when it could not.
 *
 * A refusal is information: bisector form is genuinely not polynomial, and a
 * side with no claim genuinely has no field. Returning null with a reason
 * beats returning a net that is quietly wrong.
 */
export class NotPolynomial extends Error {}

/**
 * Assemble one cell's control net.
 *
 * Throws `NotPolynomial` if any side's field is in bisector form — there the
 * surface contains a square root and no control net exists. Build the field
 * with `polynomial: true` (the default) and this cannot happen.
 */
export function cellBezier(
  b: CellBoundary, cross?: CrossField, opts: CellNetOptions = {},
): CellNet {
  // ── the four sides, in the cell's own u and v ──────────────────────────
  const raw = [0, 1, 2, 3].map((k) => sidePieces(b, k));
  const bottom = raw[0]!;            // v = 0, running with u
  const right = raw[1]!;             // u = 1, running with v
  const top = flip(raw[2]!);         // v = 1, side 2 runs against u
  const left = flip(raw[3]!);        // u = 0, side 3 runs against v

  const [P00, P10, P11, P01] = b.corners;

  // ── the fields, in each side's own loop parameter ──────────────────────
  const fields: (SideField | null)[] = [0, 1, 2, 3].map((k) =>
    cross?.sideField ? cross.sideField(b.cellId, k) : null);
  for (const f of fields) {
    if (f && f.pieces.length === 0) {
      throw new NotPolynomial(
        `cell ${b.cellId}: the field is in bisector form, which contains a square root`);
    }
  }
  const order = opts.order ?? 2;

  const first: Piece[][] = [];       // Δ_k(s), side k's own parameter
  const second: Piece[][] = [];      // Δ²_k(s)
  const fieldCuts: number[][] = [[], [], [], []];
  for (let k = 0; k < 4; k++) {
    const built = deltaPieces(b, k, raw[k]!, fields[k] ?? null, order);
    first.push(built.first);
    second.push(built.second);
    fieldCuts[k] = built.cuts;
  }

  // ── the common break sets ─────────────────────────────────────────────
  const uCuts = [
    ...bottom.map((p) => p.a), ...top.map((p) => p.a),
    ...fieldCuts[0]!, ...fieldCuts[2]!.map((s) => 1 - s),
  ];
  const vCuts = [
    ...right.map((p) => p.a), ...left.map((p) => p.a),
    ...fieldCuts[1]!, ...fieldCuts[3]!.map((s) => 1 - s),
  ];
  const breaksU = breakpoints(uCuts);
  const breaksV = breakpoints(vCuts);

  // Everything onto the common breaks, in the cell's own parameters.
  const Eb = refine(bottom, breaksU);
  const Et = refine(top, breaksU);
  const Er = refine(right, breaksV);
  const El = refine(left, breaksV);
  const F0 = refine(first[0]!, breaksU);
  const F1 = refine(first[1]!, breaksV);
  const F2 = refine(flip(first[2]!), breaksU);
  const F3 = refine(flip(first[3]!), breaksV);
  const G0 = refine(second[0]!, breaksU);
  const G1 = refine(second[1]!, breaksV);
  const G2 = refine(flip(second[2]!), breaksU);
  const G3 = refine(flip(second[3]!), breaksV);

  // ── the natural cross-derivatives, as 1-D polynomials ─────────────────
  // Exactly `coonsSu` and `coonsSv`, written in the same order, restricted to
  // the edge each side reads. Deriving them from the same boundary pieces the
  // patch is built from is the point: there is no second version to drift.
  const dEb = derivPieces(Eb), dEt = derivPieces(Et);
  const dEr = derivPieces(Er), dEl = derivPieces(El);
  const at = (p: readonly Piece[], x: 0 | 1): Pt3 => {
    const host = x === 0 ? p[0]! : p[p.length - 1]!;
    const c = x === 0 ? host.c[0]! : host.c[host.c.length - 1]!;
    return c;
  };
  const sub = (x: Pt3, y: Pt3): Pt3 => [x[0] - y[0], x[1] - y[1], x[2] - y[2]];

  // Sv(u,v) = (Et − Eb) + (1−u)(El′(v) − (P01−P00)) + u(Er′(v) − (P11−P10))
  const svAt = (v: 0 | 1): Piece[] => {
    const dl = sub(at(dEl, v), sub(P01, P00));
    const dr = sub(at(dEr, v), sub(P11, P10));
    return breaksU.slice(0, -1).map((a, i) => {
      const bEnd = breaksU[i + 1]!;
      const diff = addBezier3(Et[i]!.c, scaleBezier3([-1], Eb[i]!.c));
      const lin = ([[dl[0], dl[1], dl[2]], [dr[0], dr[1], dr[2]]] as Vec3Bezier);
      const ramp = restrictBezier3(lin, a, bEnd);   // (1−u)dl + u·dr, on this tile
      return { a, b: bEnd, c: addBezier3(diff, ramp) };
    });
  };
  // Su(u,v) = (1−v)Eb′(u) + v·Et′(u) + (Er − b1(v)) − (El − b0(v))
  const suAt = (u: 0 | 1): Piece[] => {
    const db = at(dEb, u), dt = at(dEt, u);
    return breaksV.slice(0, -1).map((a, j) => {
      const bEnd = breaksV[j + 1]!;
      const lin = ([[db[0], db[1], db[2]], [dt[0], dt[1], dt[2]]] as Vec3Bezier);
      const ramp = restrictBezier3(lin, a, bEnd);
      const b0: Vec3Bezier = [P00, P01];
      const b1: Vec3Bezier = [P10, P11];
      const edge = addBezier3(
        addBezier3(Er[j]!.c, scaleBezier3([-1], restrictBezier3(b1, a, bEnd))),
        scaleBezier3([-1], addBezier3(El[j]!.c, scaleBezier3([-1], restrictBezier3(b0, a, bEnd)))),
      );
      return { a, b: bEnd, c: addBezier3(ramp, edge) };
    });
  };
  const N0 = svAt(0);
  const N1 = scalePieces(suAt(1), -1);
  const N2 = scalePieces(svAt(1), -1);
  const N3 = suAt(0);

  // Δ = ρ·(E − N). The fields carry ρ·E; the natural part needs the window too.
  const win = [0, 1, 2, 3].map((k) => fields[k] ? windowPieces(fields[k]!.fade) : null);
  const windowOn = (k: number, breaks: readonly number[], flipped: boolean) =>
    breaks.slice(0, -1).map((a, i) => {
      const bEnd = breaks[i + 1]!;
      const w = win[k];
      if (!w) return [0];
      return flipped ? scalarOn(w.pieces, 1 - bEnd, 1 - a).reverse() : scalarOn(w.pieces, a, bEnd);
    });
  const wU0 = windowOn(0, breaksU, false);
  const wV1 = windowOn(1, breaksV, false);
  const wU2 = windowOn(2, breaksU, true);
  const wV3 = windowOn(3, breaksV, true);

  const minus = (E: readonly Piece[], N: readonly Piece[], w: number[][]): Piece[] =>
    E.map((p, i) => ({
      a: p.a, b: p.b,
      c: addBezier3(p.c, scaleBezier3(scaleBezier(w[i]!, -1), N[i]!.c)),
    }));
  const D0 = minus(F0, N0, wU0);
  const D1 = minus(F1, N1, wV1);
  const D2 = minus(F2, N2, wU2);
  const D3 = minus(F3, N3, wV3);

  // ── the blends, exactly ───────────────────────────────────────────────
  const x: number[] = [0, 1], omx: number[] = [1, 0];
  const gB = multiplyBezier(x, multiplyBezier(omx, omx));                  // x(1−x)²
  const hB = multiplyBezier(multiplyBezier(x, x), omx);                    // x²(1−x)
  const qB = scaleBezier(multiplyBezier(multiplyBezier(x, x),
    multiplyBezier(omx, multiplyBezier(omx, omx))), 0.5);                  // ½x²(1−x)³
  const rB = scaleBezier(multiplyBezier(multiplyBezier(x, multiplyBezier(x, x)),
    multiplyBezier(omx, omx)), 0.5);                                       // ½x³(1−x)²

  // ── the tiles ─────────────────────────────────────────────────────────
  const tiles: BezierTile[][] = [];
  let worstU = 0, worstV = 0;
  for (let i = 0; i < breaksU.length - 1; i++) {
    const row: BezierTile[] = [];
    const ua = breaksU[i]!, ub = breaksU[i + 1]!;
    const uRamp: number[] = [ua, ub];                 //   u   on this tile
    const uDown: number[] = [1 - ua, 1 - ub];         // (1−u) on this tile
    const gu = restrictScalar(gB, ua, ub), hu = restrictScalar(hB, ua, ub);
    const qu = restrictScalar(qB, ua, ub), ru = restrictScalar(rB, ua, ub);
    for (let j = 0; j < breaksV.length - 1; j++) {
      const va = breaksV[j]!, vb = breaksV[j + 1]!;
      const vRamp: number[] = [va, vb];
      const vDown: number[] = [1 - va, 1 - vb];
      const gv = restrictScalar(gB, va, vb), hv = restrictScalar(hB, va, vb);
      const qv = restrictScalar(qB, va, vb), rv = restrictScalar(rB, va, vb);

      // S₀ — coonsBlend, term for term.
      const b0: Vec3Bezier = restrictBezier3([P00, P01], va, vb);
      const b1: Vec3Bezier = restrictBezier3([P10, P11], va, vb);
      let T = tensorUV(Eb[i]!.c, vDown);
      T = addTensor(T, tensorUV(Et[i]!.c, vRamp));
      T = addTensor(T, tensorVU(uDown, addBezier3(El[j]!.c, scaleBezier3([-1], b0))));
      T = addTensor(T, tensorVU(uRamp, addBezier3(Er[j]!.c, scaleBezier3([-1], b1))));

      // Φ — the G1 layer.
      if (!isZero(D0[i]!.c)) T = addTensor(T, tensorUV(D0[i]!.c, gv));
      if (!isZero(D1[j]!.c)) T = addTensor(T, tensorVU(hu, D1[j]!.c));
      if (!isZero(D2[i]!.c)) T = addTensor(T, tensorUV(D2[i]!.c, hv));
      if (!isZero(D3[j]!.c)) T = addTensor(T, tensorVU(gu, D3[j]!.c));

      // Ψ — the G2 layer.
      if (order >= 2) {
        if (!isZero(G0[i]!.c)) T = addTensor(T, tensorUV(G0[i]!.c, qv));
        if (!isZero(G1[j]!.c)) T = addTensor(T, tensorVU(ru, G1[j]!.c));
        if (!isZero(G2[i]!.c)) T = addTensor(T, tensorUV(G2[i]!.c, rv));
        if (!isZero(G3[j]!.c)) T = addTensor(T, tensorVU(qu, G3[j]!.c));
      }

      const tile: BezierTile = {
        degreeU: T.length - 1, degreeV: T[0]!.length - 1, ctrl: T,
      };
      if (tile.degreeU > worstU) worstU = tile.degreeU;
      if (tile.degreeV > worstV) worstV = tile.degreeV;
      row.push(tile);
    }
    tiles.push(row);
  }

  return {
    cellId: b.cellId, breaksU, breaksV, tiles,
    degreeU: worstU, degreeV: worstV,
    controlPoints: tiles.length * (tiles[0]?.length ?? 0) * (worstU + 1) * (worstV + 1),
  };
}

/**
 * Δ_k and Δ²_k for one side, in that side's own loop parameter, as the window
 * times the fitted field — which is exactly what `rawDefect` and `rawSecond`
 * compute at a station, written as coefficients instead.
 *
 * The natural term is NOT subtracted here: it lives in the cell's parameters,
 * not the side's, and subtracting it after the flip saves reversing it twice.
 */
function deltaPieces(
  b: CellBoundary, k: number, curve: readonly Piece[], field: SideField | null, order: number,
): { first: Piece[]; second: Piece[]; cuts: number[] } {
  const zero = (breaks: readonly number[]): Piece[] =>
    breaks.slice(0, -1).map((a, i) => constPiece(a, breaks[i + 1]!, ZERO3));
  if (!field || field.pieces.length === 0) {
    const breaks = breakpoints(curve.map((p) => p.a));
    return { first: zero(breaks), second: zero(breaks), cuts: [] };
  }

  const side = b.sides[k]!;
  const dtds = side.reversed ? side.t0 - side.t1 : side.t1 - side.t0;
  const win = windowPieces(field.fade);

  // Every break the field itself introduces, in the side's parameter.
  const cuts: number[] = [...win.cuts];
  const magnitude: ScalarPiece[][] = [];
  const across: ScalarPiece[][] = [];
  const dStar: Piece[][] = [];
  const second: ScalarPiece[][] = [];
  for (const piece of field.pieces) {
    const span = piece.hi - piece.lo;
    // τ ∈ [0,1] over [lo,hi] in the curve's global t; s is affine in t.
    const toS = (tau: number): number => {
      const t = piece.lo + tau * span;
      return (t - side.curveParam(0)) / dtds;
    };
    const a = splinePieces(piece.along, piece.degree, piece.knots, toS);
    const l = splinePieces(piece.across, piece.degree, piece.knots, toS);
    // μ rides its OWN knots. Reading it on the G1 field's would evaluate a
    // cubic outside the span it was fitted on — which is exactly the class of
    // bug the straddle guard was added for, so it would throw rather than
    // quietly disagree, but it would still be wrong.
    const m = order >= 2
      ? splinePieces(piece.second, piece.secondDegree, piece.secondKnots, toS)
      : { pieces: [], cuts: [] };
    magnitude.push(a.pieces);
    across.push(l.pieces);
    second.push(m.pieces);
    dStar.push(vectorPieces(piece.dStar, piece, toS));
    cuts.push(...a.cuts, ...m.cuts, piece.s0, piece.s1);
  }

  const breaks = breakpoints([...cuts, ...curve.map((p) => p.a)]);
  const curveR = refine(curve, breaks);
  const dCurve = derivPieces(curveR);

  const firstOut: Piece[] = [];
  const secondOut: Piece[] = [];
  for (let i = 0; i < breaks.length - 1; i++) {
    const a = breaks[i]!, bEnd = breaks[i + 1]!;
    const mid = 0.5 * (a + bEnd);
    const idx = field.pieces.findIndex((p) => mid >= p.s0 && mid <= p.s1);
    if (idx < 0) {
      firstOut.push(constPiece(a, bEnd, ZERO3));
      secondOut.push(constPiece(a, bEnd, ZERO3));
      continue;
    }
    const w = scalarOn(win.pieces, a, bEnd);
    // The field is written per unit of the GLOBAL curve parameter, so the
    // side's own derivative has to be divided by dt/ds to match `evalOwner`.
    const cp = scaleBezier3([1 / dtds], dCurve[i]!.c);
    const aC = scalarOn(magnitude[idx]!, a, bEnd);
    const lC = scalarOn(across[idx]!, a, bEnd);
    const dC = restrictOn(dStar[idx]!, a, bEnd);
    const E = addBezier3(scaleBezier3(aC, cp), scaleBezier3(lC, dC));
    firstOut.push({ a, b: bEnd, c: scaleBezier3(w, E) });

    if (order >= 2 && second[idx]!.length > 0) {
      const mC = scalarOn(second[idx]!, a, bEnd);
      const M = crossBezier3(cp, dC);
      secondOut.push({ a, b: bEnd, c: scaleBezier3(multiplyBezier(w, mC), M) });
    } else {
      secondOut.push(constPiece(a, bEnd, ZERO3));
    }
  }
  return { first: firstOut, second: secondOut, cuts: breaks.slice(1, -1) };
}

/** Restrict a vector piecewise function to one interval. */
function restrictOn(pieces: readonly Piece[], a: number, b: number): Vec3Bezier {
  const mid = 0.5 * (a + b);
  const host = pieces.find((p) => mid >= p.a && mid <= p.b) ?? pieces[pieces.length - 1];
  if (!host) return [ZERO3];
  straddle(host.a, host.b, a, b, "vector");
  const span = host.b - host.a;
  if (span <= 0) return host.c;
  return restrictBezier3(host.c, (a - host.a) / span, (b - host.a) / span);
}

// ── tensor helpers ────────────────────────────────────────────────────────

type Tensor = Pt3[][];

/** f(u)·g(v) with f vector and g scalar. */
function tensorUV(f: Vec3Bezier, g: readonly number[]): Tensor {
  return f.map((p) => g.map((s) => [p[0] * s, p[1] * s, p[2] * s] as Pt3));
}

/** f(u)·g(v) with f scalar and g vector — the other separable orientation. */
function tensorVU(f: readonly number[], g: Vec3Bezier): Tensor {
  return f.map((s) => g.map((p) => [p[0] * s, p[1] * s, p[2] * s] as Pt3));
}

/** Elevate a tensor to a target bidegree: columns in u, then rows in v. */
function elevateTensor(t: Tensor, pu: number, pv: number): Tensor {
  let out = t;
  if (out.length - 1 < pu) {
    const cols = out[0]!.length;
    const raised: Pt3[][] = [];
    for (let j = 0; j < cols; j++) {
      const col = elevateBezier3(out.map((row) => row[j]!), pu);
      for (let i = 0; i < col.length; i++) {
        (raised[i] ??= [])[j] = col[i]! as Pt3;
      }
    }
    out = raised;
  }
  if (out[0]!.length - 1 < pv) out = out.map((row) => elevateBezier3(row, pv) as Pt3[]);
  return out;
}

/** Sum of two tensors, elevated to their common bidegree first. */
function addTensor(a: Tensor, b: Tensor): Tensor {
  const pu = Math.max(a.length, b.length) - 1;
  const pv = Math.max(a[0]!.length, b[0]!.length) - 1;
  const A = elevateTensor(a, pu, pv), B = elevateTensor(b, pu, pv);
  return A.map((row, i) => row.map((p, j) => {
    const q = B[i]![j]!;
    return [p[0] + q[0], p[1] + q[1], p[2] + q[2]] as Pt3;
  }));
}

/** Evaluate a tile at its own local (x,y) — the check side of the gate. */
export function tileAt(tile: BezierTile, x: number, y: number): Pt3 {
  const rows = tile.ctrl.map((row) => bezierPoint(row, y));
  return bezierPoint(rows, x);
}

/** de Casteljau on a control list — no basis evaluation, no cancellation. */
function bezierPoint(pts: readonly Pt3[], t: number): Pt3 {
  const work = pts.map((p) => [p[0], p[1], p[2]] as [number, number, number]);
  for (let k = 1; k < work.length; k++) {
    for (let i = 0; i < work.length - k; i++) {
      const p = work[i]!, q = work[i + 1]!;
      work[i] = [
        p[0] + (q[0] - p[0]) * t,
        p[1] + (q[1] - p[1]) * t,
        p[2] + (q[2] - p[2]) * t,
      ];
    }
  }
  return work[0]!;
}

/** Evaluate a whole cell net at (u,v), by locating the tile. */
export function netAt(net: CellNet, u: number, v: number): Pt3 {
  let i = 0;
  while (i < net.tiles.length - 1 && u >= net.breaksU[i + 1]!) i++;
  let j = 0;
  while (j < net.tiles[0]!.length - 1 && v >= net.breaksV[j + 1]!) j++;
  const ua = net.breaksU[i]!, ub = net.breaksU[i + 1]!;
  const va = net.breaksV[j]!, vb = net.breaksV[j + 1]!;
  return tileAt(net.tiles[i]![j]!, (u - ua) / (ub - ua), (v - va) / (vb - va));
}
