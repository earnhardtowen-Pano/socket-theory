/**
 * @car/num · exact polynomial algebra in the Bernstein and B-spline bases.
 *
 * Everything here is EXACT in the algebraic sense: no fitting, no tolerance,
 * no iteration. Degree elevation, the product rule and knot insertion all
 * return a different representation of the SAME polynomial, so a surface
 * assembled with them is the surface the probe measured — not an
 * approximation of it to some number of digits.
 *
 * That distinction is the whole reason this module exists. The surfacing
 * construction is a sum of products of splines:
 *
 *     S = S0 + Phi + Psi,  Phi = g(v)·D0(u) + …,  Psi = q(v)·D2_0(u) + …
 *
 * Every one of those terms is a polynomial in u and v. Read the terms into a
 * common degree with `elevateBezier`, multiply them with `multiplyBezier`,
 * add them with `addBezier`, and the result is a tensor-product patch that
 * agrees with `boundaryCoonsPoint` to the last bit. The alternative — sample
 * the finished patch and least-squares a chosen degree back through it — is
 * what every other kernel does, and it trades the by-construction guarantee
 * for the export. This module is how we decline that trade.
 *
 * On conditioning: the elevation operator is a convex combination and the
 * product formula has positive coefficients summing to one, so both are
 * backward-stable on [0,1]. Nothing here cancels.
 */

import { nfloor } from "./index.js";

/** Pascal's triangle to `n`, built with integer adds. Exact to n = 56. */
function pascal(n: number): number[][] {
  const rows: number[][] = [[1]];
  for (let i = 1; i <= n; i++) {
    const prev = rows[i - 1]!;
    const row = new Array<number>(i + 1).fill(0);
    row[0] = 1;
    row[i] = 1;
    for (let k = 1; k < i; k++) row[k] = prev[k - 1]! + prev[k]!;
    rows.push(row);
  }
  return rows;
}

/**
 * Binomial coefficient, by Pascal rather than factorials.
 *
 * `50!` overflows a double's exact-integer range at 2^53 long before C(50,25)
 * does, so the factorial formula loses digits on inputs this routine handles
 * exactly. The table is rebuilt per call, which is nothing at these degrees
 * and keeps the function free of mutable module state — the determinism rule
 * applies to caches too.
 */
export function binomial(n: number, k: number): number {
  const N = nfloor(n), K = nfloor(k);
  if (K < 0 || K > N || N < 0) return 0;
  return pascal(N)[N]![K]!;
}

/** Degree of a Bézier coefficient list. */
export const bezierDegree = (coeffs: readonly unknown[]): number => coeffs.length - 1;

/**
 * Raise a Bézier by one degree, exactly.
 *
 *     c'_i = (i/(n+1))·c_{i-1} + (1 - i/(n+1))·c_i
 *
 * A convex combination of neighbours, so the new control polygon lies inside
 * the old one's hull and the curve does not move by a single unit in the last
 * place beyond rounding of the two multiplies.
 */
export function elevateBezier(coeffs: readonly number[]): number[] {
  const n = bezierDegree(coeffs);
  if (n < 0) throw new Error("elevate: empty coefficients");
  const out = new Array<number>(n + 2).fill(0);
  out[0] = coeffs[0]!;
  out[n + 1] = coeffs[n]!;
  for (let i = 1; i <= n; i++) {
    const a = i / (n + 1);
    out[i] = a * coeffs[i - 1]! + (1 - a) * coeffs[i]!;
  }
  return out;
}

/** Elevate to exactly `degree`. Lowering is not defined and throws. */
export function elevateBezierTo(coeffs: readonly number[], degree: number): number[] {
  const target = nfloor(degree);
  let c = [...coeffs];
  if (bezierDegree(c) > target) {
    throw new Error(`elevate: degree ${bezierDegree(c)} cannot be lowered to ${target}`);
  }
  while (bezierDegree(c) < target) c = elevateBezier(c);
  return c;
}

/**
 * The product of two Béziers, exactly, in the Bernstein basis of the sum
 * degree:
 *
 *     c_k = SUM_{i+j=k} [ C(m,i)·C(n,j) / C(m+n,k) ] · a_i · b_j
 *
 * The bracket is a set of positive weights summing to one for each k, so this
 * is a weighted average of the products a_i·b_j and cannot amplify error.
 */
export function multiplyBezier(a: readonly number[], b: readonly number[]): number[] {
  const m = bezierDegree(a), n = bezierDegree(b);
  if (m < 0 || n < 0) throw new Error("multiply: empty coefficients");
  const out = new Array<number>(m + n + 1).fill(0);
  for (let k = 0; k <= m + n; k++) {
    const denom = binomial(m + n, k);
    let acc = 0;
    const lo = k - n < 0 ? 0 : k - n;
    const hi = k < m ? k : m;
    for (let i = lo; i <= hi; i++) {
      acc += binomial(m, i) * binomial(n, k - i) * a[i]! * b[k - i]!;
    }
    out[k] = acc / denom;
  }
  return out;
}

/** Sum of two Béziers, elevated to the common degree first. */
export function addBezier(a: readonly number[], b: readonly number[]): number[] {
  const d = bezierDegree(a) > bezierDegree(b) ? bezierDegree(a) : bezierDegree(b);
  const A = elevateBezierTo(a, d), B = elevateBezierTo(b, d);
  return A.map((v, i) => v + B[i]!);
}

/** Scalar multiple of a Bézier. */
export const scaleBezier = (a: readonly number[], s: number): number[] => a.map((v) => v * s);

/**
 * Derivative of a Bézier: degree n-1 with c'_i = n·(c_{i+1} - c_i).
 *
 * A constant returns the zero polynomial of degree 0 rather than an empty
 * list, so the result is always evaluable.
 */
export function derivBezier(coeffs: readonly number[]): number[] {
  const n = bezierDegree(coeffs);
  if (n <= 0) return [0];
  const out = new Array<number>(n).fill(0);
  for (let i = 0; i < n; i++) out[i] = n * (coeffs[i + 1]! - coeffs[i]!);
  return out;
}

/** The monomial 1 as a degree-0 Bézier, for building blend functions up. */
export const oneBezier = (): number[] => [1];

/** The monomial x on [0,1] as a degree-1 Bézier. */
export const xBezier = (): number[] => [0, 1];

/** The monomial (1-x) on [0,1] as a degree-1 Bézier. */
export const oneMinusXBezier = (): number[] => [1, 0];

/**
 * Bézier coefficients of a power of x on [0,1], exactly: x^k has
 * B-coefficients C(i,k)/C(n,k) at degree n = k.
 *
 * Built by repeated multiplication rather than by the closed form so there is
 * one product routine to trust rather than two.
 */
export function powerBezier(k: number): number[] {
  let c = oneBezier();
  for (let i = 0; i < nfloor(k); i++) c = multiplyBezier(c, xBezier());
  return c;
}

// ── vector-valued Béziers ────────────────────────────────────────────────
// The control points of a space curve or a patch row. Kept as parallel scalar
// operations rather than a Pt3 abstraction so every routine above is reused
// verbatim and there is no second implementation to drift.

export type Vec3Bezier = readonly (readonly [number, number, number])[];

const column = (c: Vec3Bezier, axis: 0 | 1 | 2): number[] => c.map((p) => p[axis]!);
const weave = (x: readonly number[], y: readonly number[], z: readonly number[]) =>
  x.map((v, i) => [v, y[i]!, z[i]!] as readonly [number, number, number]);

/** Elevate a vector Bézier to `degree`. */
export function elevateBezier3(c: Vec3Bezier, degree: number): Vec3Bezier {
  return weave(
    elevateBezierTo(column(c, 0), degree),
    elevateBezierTo(column(c, 1), degree),
    elevateBezierTo(column(c, 2), degree),
  );
}

/** Sum of two vector Béziers. */
export function addBezier3(a: Vec3Bezier, b: Vec3Bezier): Vec3Bezier {
  const d = a.length > b.length ? a.length - 1 : b.length - 1;
  const A = elevateBezier3(a, d), B = elevateBezier3(b, d);
  return A.map((p, i) => [p[0] + B[i]![0], p[1] + B[i]![1], p[2] + B[i]![2]] as const);
}

/** A scalar Bézier times a vector Bézier — the shape every blend term takes. */
export function scaleBezier3(s: readonly number[], c: Vec3Bezier): Vec3Bezier {
  return weave(
    multiplyBezier(s, column(c, 0)),
    multiplyBezier(s, column(c, 1)),
    multiplyBezier(s, column(c, 2)),
  );
}

/** Derivative of a vector Bézier. */
export function derivBezier3(c: Vec3Bezier): Vec3Bezier {
  return weave(derivBezier(column(c, 0)), derivBezier(column(c, 1)), derivBezier(column(c, 2)));
}

/**
 * Cross product of two vector Béziers, exactly — degree m+n.
 *
 * This is what makes `M* = C' × D*` a polynomial rather than a sampled field,
 * and with it the second-order correction is exact algebra all the way down.
 */
export function crossBezier3(a: Vec3Bezier, b: Vec3Bezier): Vec3Bezier {
  const [ax, ay, az] = [column(a, 0), column(a, 1), column(a, 2)];
  const [bx, by, bz] = [column(b, 0), column(b, 1), column(b, 2)];
  const sub = (p: readonly number[], q: readonly number[]) => addBezier(p, scaleBezier(q, -1));
  return weave(
    sub(multiplyBezier(ay, bz), multiplyBezier(az, by)),
    sub(multiplyBezier(az, bx), multiplyBezier(ax, bz)),
    sub(multiplyBezier(ax, by), multiplyBezier(ay, bx)),
  );
}

/** Dot product of two vector Béziers — a scalar Bézier of degree m+n. */
export function dotBezier3(a: Vec3Bezier, b: Vec3Bezier): number[] {
  return addBezier(
    addBezier(
      multiplyBezier(column(a, 0), column(b, 0)),
      multiplyBezier(column(a, 1), column(b, 1)),
    ),
    multiplyBezier(column(a, 2), column(b, 2)),
  );
}

// ── B-spline refinement ──────────────────────────────────────────────────

/**
 * Boehm knot insertion: add `x` to the knot vector once, exactly.
 *
 * The curve does not move. `degree - multiplicity` control points are
 * replaced by `degree - multiplicity + 1` new ones, each a convex combination
 * of two old neighbours, and everything outside the affected window is copied
 * across untouched.
 */
export function insertKnot(
  degree: number,
  knots: readonly number[],
  coeffs: readonly number[],
  x: number,
): { knots: number[]; coeffs: number[] } {
  const p = nfloor(degree);
  const n = knots.length - p - 2;                    // last control index
  if (coeffs.length !== n + 1) throw new Error("insert: control count does not match knots");
  if (x <= knots[p]! || x >= knots[n + 1]!) throw new Error("insert: knot outside the open interval");

  let k = p;
  while (k < n && x >= knots[k + 1]!) k++;
  let mult = 0;
  for (let i = k; i >= 0 && knots[i]! === x; i--) mult++;
  if (mult >= p) throw new Error("insert: knot already at full multiplicity");

  const out = new Array<number>(coeffs.length + 1).fill(0);
  for (let i = 0; i <= k - p; i++) out[i] = coeffs[i]!;
  for (let i = k - mult; i <= n; i++) out[i + 1] = coeffs[i]!;
  for (let i = k - p + 1; i <= k - mult; i++) {
    const span = knots[i + p]! - knots[i]!;
    const a = span === 0 ? 0 : (x - knots[i]!) / span;
    out[i] = (1 - a) * coeffs[i - 1]! + a * coeffs[i]!;
  }

  const nk = [...knots];
  nk.splice(k + 1, 0, x);
  return { knots: nk, coeffs: out };
}

/**
 * Split a B-spline into its Bézier pieces, exactly.
 *
 * Every interior knot is raised to multiplicity `degree` by repeated
 * insertion, at which point the control points partition into consecutive
 * blocks of `degree + 1` that ARE the Bézier coefficients of each span. This
 * is the bridge between the fitted fields (splines, adaptive knots) and the
 * exact patch algebra above (Bézier, one span at a time).
 */
export function bezierSegments(
  degree: number,
  knots: readonly number[],
  coeffs: readonly number[],
): { breaks: number[]; segments: number[][] } {
  const p = nfloor(degree);
  let K: readonly number[] = knots, C: readonly number[] = coeffs;
  const interior = [...new Set(knots.slice(p + 1, knots.length - p - 1))].sort((a, b) => a - b);
  for (const x of interior) {
    let mult = K.reduce((m, u) => (u === x ? m + 1 : m), 0);
    while (mult < p) {
      const step = insertKnot(p, K, C, x);
      K = step.knots; C = step.coeffs; mult++;
    }
  }
  const breaks = [K[p]!, ...interior, K[K.length - p - 1]!];
  const segments: number[][] = [];
  for (let s = 0; s < breaks.length - 1; s++) segments.push(C.slice(s * p, s * p + p + 1));
  return { breaks, segments };
}

/** `bezierSegments` for a vector-valued spline. */
export function bezierSegments3(
  degree: number,
  knots: readonly number[],
  coeffs: Vec3Bezier,
): { breaks: number[]; segments: Vec3Bezier[] } {
  const x = bezierSegments(degree, knots, column(coeffs, 0));
  const y = bezierSegments(degree, knots, column(coeffs, 1));
  const z = bezierSegments(degree, knots, column(coeffs, 2));
  return {
    breaks: x.breaks,
    segments: x.segments.map((seg, i) => weave(seg, y.segments[i]!, z.segments[i]!)),
  };
}

/**
 * Reparametrise a Bézier onto the sub-interval [a,b] of its own domain,
 * exactly, by de Casteljau subdivision twice.
 *
 * Needed because a cell's side is a TRIM of a shared curve: the patch wants
 * the piece of the chain the trim covers, in the patch's own [0,1], with no
 * resampling anywhere.
 */
export function restrictBezier(coeffs: readonly number[], a: number, b: number): number[] {
  if (!(b > a)) throw new Error("restrict: empty interval");
  const right = deCasteljauRight(coeffs, a);
  const t = b === 1 ? 1 : (b - a) / (1 - a);
  return deCasteljauLeft(right, t);
}

/** The [0,t] half of a Bézier after de Casteljau subdivision at t. */
export function deCasteljauLeft(coeffs: readonly number[], t: number): number[] {
  const work = [...coeffs];
  const out: number[] = [work[0]!];
  for (let k = 1; k < work.length; k++) {
    for (let i = 0; i < work.length - k; i++) work[i] = (1 - t) * work[i]! + t * work[i + 1]!;
    out.push(work[0]!);
  }
  return out;
}

/** The [t,1] half of a Bézier after de Casteljau subdivision at t. */
export function deCasteljauRight(coeffs: readonly number[], t: number): number[] {
  const work = [...coeffs];
  const n = work.length - 1;
  const out: number[] = [work[n]!];
  for (let k = 1; k <= n; k++) {
    for (let i = 0; i < work.length - k; i++) work[i] = (1 - t) * work[i]! + t * work[i + 1]!;
    out.push(work[n - k]!);
  }
  return out.reverse();
}

/** `restrictBezier` for a vector Bézier. */
export function restrictBezier3(c: Vec3Bezier, a: number, b: number): Vec3Bezier {
  return weave(
    restrictBezier(column(c, 0), a, b),
    restrictBezier(column(c, 1), a, b),
    restrictBezier(column(c, 2), a, b),
  );
}
