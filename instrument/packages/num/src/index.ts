/**
 * @car/num — deterministic math kernel.
 *
 * The only sanctioned home for transcendentals below the render seam:
 * engine Math.sin/cos/atan2/pow are implementation-defined across engines,
 * so every call site routes through here and the CI runner pins one engine.
 * No Date, no random, no wall clock anywhere in this cone.
 */

import type { CubicSeg, CurveChain, Pt2, Pt3 } from "@car/schema";

// ---------------------------------------------------------------------------
// Sanctioned transcendentals and helpers
// ---------------------------------------------------------------------------

export const nsin = (x: number): number => Math.sin(x);
export const ncos = (x: number): number => Math.cos(x);
export const ntan = (x: number): number => Math.tan(x);
export const natan2 = (y: number, x: number): number => Math.atan2(y, x);
export const nacos = (x: number): number => Math.acos(x);
export const nasin = (x: number): number => Math.asin(x);
export const npow = (b: number, e: number): number => Math.pow(b, e);
export const nexp = (x: number): number => Math.exp(x);
export const nlog = (x: number): number => Math.log(x);
export const nsqrt = (x: number): number => Math.sqrt(x); // IEEE-deterministic; wrapped for uniformity
/**
 * Length of a 2-vector. `Math.hypot` is NOT IEEE-pinned — it is allowed to be
 * more accurate than the naive form and implementations differ in how — so it
 * is written out here rather than wrapped, and every caller in the model cone
 * gets the same bits on every engine.
 */
export const nhypot2 = (x: number, y: number): number => nsqrt(x * x + y * y);
export const nabs = (x: number): number => Math.abs(x);
export const nmin = (a: number, b: number): number => Math.min(a, b);
export const nmax = (a: number, b: number): number => Math.max(a, b);
export const nfloor = (x: number): number => Math.floor(x);
export const nceil = (x: number): number => Math.ceil(x);
export const nround = (x: number): number => Math.round(x);
export const PI = Math.PI;
export const TAU = 2 * Math.PI;
export const DEG = Math.PI / 180;

export const clamp = (x: number, lo: number, hi: number): number =>
  x < lo ? lo : x > hi ? hi : x;

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

// ---------------------------------------------------------------------------
// Vectors
// ---------------------------------------------------------------------------

export const v2 = (x: number, y: number): Pt2 => [x, y];
export const v3 = (x: number, y: number, z: number): Pt3 => [x, y, z];

export const add3 = (a: Pt3, b: Pt3): Pt3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub3 = (a: Pt3, b: Pt3): Pt3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale3 = (a: Pt3, s: number): Pt3 => [a[0] * s, a[1] * s, a[2] * s];
export const dot3 = (a: Pt3, b: Pt3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross3 = (a: Pt3, b: Pt3): Pt3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
export const len3 = (a: Pt3): number => nsqrt(dot3(a, a));
export const dist3 = (a: Pt3, b: Pt3): number => len3(sub3(a, b));
export const norm3 = (a: Pt3): Pt3 => {
  const l = len3(a);
  return l === 0 ? [0, 0, 0] : scale3(a, 1 / l);
};
export const lerp3 = (a: Pt3, b: Pt3, t: number): Pt3 => [
  lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t),
];
export const mid3 = (a: Pt3, b: Pt3): Pt3 => lerp3(a, b, 0.5);

export const add2 = (a: Pt2, b: Pt2): Pt2 => [a[0] + b[0], a[1] + b[1]];
export const sub2 = (a: Pt2, b: Pt2): Pt2 => [a[0] - b[0], a[1] - b[1]];
export const dot2 = (a: Pt2, b: Pt2): number => a[0] * b[0] + a[1] * b[1];
export const len2 = (a: Pt2): number => nsqrt(dot2(a, a));

/** Rotate a point about an axis through origin (Rodrigues). Axis must be unit. */
export function rotate3(p: Pt3, axis: Pt3, angleRad: number): Pt3 {
  const c = ncos(angleRad);
  const s = nsin(angleRad);
  const term1 = scale3(p, c);
  const term2 = scale3(cross3(axis, p), s);
  const term3 = scale3(axis, dot3(axis, p) * (1 - c));
  return add3(add3(term1, term2), term3);
}

export const mirrorY = (p: Pt3): Pt3 => [p[0], -p[1], p[2]];

// ---------------------------------------------------------------------------
// Cubic Bézier — the single curve wire format
// ---------------------------------------------------------------------------

export const lineCubic = (a: Pt3, b: Pt3): CubicSeg => ({
  p0: a,
  p1: lerp3(a, b, 1 / 3),
  p2: lerp3(a, b, 2 / 3),
  p3: b,
});

export function evalCubic(c: CubicSeg, t: number): Pt3 {
  const u = 1 - t;
  const w0 = u * u * u;
  const w1 = 3 * u * u * t;
  const w2 = 3 * u * t * t;
  const w3 = t * t * t;
  return [
    w0 * c.p0[0] + w1 * c.p1[0] + w2 * c.p2[0] + w3 * c.p3[0],
    w0 * c.p0[1] + w1 * c.p1[1] + w2 * c.p2[1] + w3 * c.p3[1],
    w0 * c.p0[2] + w1 * c.p1[2] + w2 * c.p2[2] + w3 * c.p3[2],
  ];
}

export function cubicDeriv(c: CubicSeg, t: number): Pt3 {
  const u = 1 - t;
  const d0 = scale3(sub3(c.p1, c.p0), 3);
  const d1 = scale3(sub3(c.p2, c.p1), 3);
  const d2 = scale3(sub3(c.p3, c.p2), 3);
  return [
    u * u * d0[0] + 2 * u * t * d1[0] + t * t * d2[0],
    u * u * d0[1] + 2 * u * t * d1[1] + t * t * d2[1],
    u * u * d0[2] + 2 * u * t * d1[2] + t * t * d2[2],
  ];
}

/**
 * Second derivative of a cubic Bezier: 6(1-t)(p2 - 2p1 + p0) + 6t(p3 - 2p2 + p1).
 *
 * Needed for curvature continuity. A cubic's second derivative is linear in t
 * and its two endpoint values are the second differences of the control
 * polygon — which is why a G2 join is a statement about the control points
 * near the seam and not only about where the curve goes.
 */
export function cubicDeriv2(c: CubicSeg, t: number): Pt3 {
  const u = 1 - t;
  const a: Pt3 = [
    6 * (c.p2[0] - 2 * c.p1[0] + c.p0[0]),
    6 * (c.p2[1] - 2 * c.p1[1] + c.p0[1]),
    6 * (c.p2[2] - 2 * c.p1[2] + c.p0[2]),
  ];
  const b: Pt3 = [
    6 * (c.p3[0] - 2 * c.p2[0] + c.p1[0]),
    6 * (c.p3[1] - 2 * c.p2[1] + c.p1[1]),
    6 * (c.p3[2] - 2 * c.p2[2] + c.p1[2]),
  ];
  return [u * a[0] + t * b[0], u * a[1] + t * b[1], u * a[2] + t * b[2]];
}

/** de Casteljau split at t → two cubics covering [0,t] and [t,1]. */
export function splitCubic(c: CubicSeg, t: number): [CubicSeg, CubicSeg] {
  const p01 = lerp3(c.p0, c.p1, t);
  const p12 = lerp3(c.p1, c.p2, t);
  const p23 = lerp3(c.p2, c.p3, t);
  const p012 = lerp3(p01, p12, t);
  const p123 = lerp3(p12, p23, t);
  const p = lerp3(p012, p123, t);
  return [
    { p0: c.p0, p1: p01, p2: p012, p3: p },
    { p0: p, p1: p123, p2: p23, p3: c.p3 },
  ];
}

export const chainOf = (...segs: CubicSeg[]): CurveChain => ({ segs });
export const lineChain = (a: Pt3, b: Pt3): CurveChain => chainOf(lineCubic(a, b));

/** Evaluate a chain at t ∈ [0,1], uniform across segments. */
export function evalChain(ch: CurveChain, t: number): Pt3 {
  const n = ch.segs.length;
  if (n === 0) throw new Error("empty chain");
  const tt = clamp(t, 0, 1);
  const scaled = tt * n;
  let i = nfloor(scaled);
  if (i >= n) i = n - 1;
  const seg = ch.segs[i];
  if (!seg) throw new Error("chain index out of range");
  return evalCubic(seg, scaled - i);
}

export function chainDeriv(ch: CurveChain, t: number): Pt3 {
  const n = ch.segs.length;
  const tt = clamp(t, 0, 1);
  const scaled = tt * n;
  let i = nfloor(scaled);
  if (i >= n) i = n - 1;
  const seg = ch.segs[i];
  if (!seg) throw new Error("chain index out of range");
  return scale3(cubicDeriv(seg, scaled - i), n);
}

/**
 * Second derivative of a chain at t ∈ [0,1].
 *
 * The chain parameter runs uniformly across n segments, so the chain rule
 * brings n² — the same n that chainDeriv brings once. At a segment JOINT this
 * is one-sided: a chain of cubics is C¹ where the control polygon makes it so
 * and generally not C², and this returns the value from the segment the
 * parameter falls in rather than pretending the two sides agree.
 */
export function chainDeriv2(ch: CurveChain, t: number): Pt3 {
  const n = ch.segs.length;
  const tt = clamp(t, 0, 1);
  const scaled = tt * n;
  let i = nfloor(scaled);
  if (i >= n) i = n - 1;
  const seg = ch.segs[i];
  if (!seg) throw new Error("chain index out of range");
  return scale3(cubicDeriv2(seg, scaled - i), n * n);
}

export const chainStart = (ch: CurveChain): Pt3 => evalChain(ch, 0);
export const chainEnd = (ch: CurveChain): Pt3 => evalChain(ch, 1);

export function reverseChain(ch: CurveChain): CurveChain {
  return {
    segs: [...ch.segs].reverse().map((s) => ({ p0: s.p3, p1: s.p2, p2: s.p1, p3: s.p0 })),
  };
}

export function translateChain(ch: CurveChain, d: Pt3): CurveChain {
  return {
    segs: ch.segs.map((s) => ({
      p0: add3(s.p0, d), p1: add3(s.p1, d), p2: add3(s.p2, d), p3: add3(s.p3, d),
    })),
  };
}

export function mapChain(ch: CurveChain, f: (p: Pt3) => Pt3): CurveChain {
  return {
    segs: ch.segs.map((s) => ({ p0: f(s.p0), p1: f(s.p1), p2: f(s.p2), p3: f(s.p3) })),
  };
}

/** Sample a chain at explicit parameters (the global sample table feeds these). */
export function sampleChain(ch: CurveChain, params: readonly number[]): Pt3[] {
  return params.map((t) => evalChain(ch, t));
}

/** Split a chain at parameter t into two chains (for tape splits and trims). */
export function splitChain(ch: CurveChain, t: number): [CurveChain, CurveChain] {
  const n = ch.segs.length;
  const tt = clamp(t, 0, 1);
  const scaled = tt * n;
  let i = nfloor(scaled);
  if (i >= n) i = n - 1;
  const seg = ch.segs[i];
  if (!seg) throw new Error("chain index out of range");
  const local = scaled - i;
  const [a, b] = splitCubic(seg, local);
  return [
    { segs: [...ch.segs.slice(0, i), a] },
    { segs: [b, ...ch.segs.slice(i + 1)] },
  ];
}

// ---------------------------------------------------------------------------
// Orthogonal least-squares line fit (through-line datum, amendment A3).
// Deterministic: fixed-iteration power method on the 3×3 scatter matrix.
// ---------------------------------------------------------------------------

export interface FitLine {
  readonly point: Pt3;      // centroid
  readonly dir: Pt3;        // unit direction
  readonly rms: number;     // rms orthogonal residual
}

const POWER_ITERATIONS = 64; // fixed count — determinism over convergence noise

export function fitLineOrtho(points: readonly Pt3[]): FitLine {
  if (points.length < 2) throw new Error("through-line needs at least 2 points");
  let cx = 0, cy = 0, cz = 0;
  for (const p of points) { cx += p[0]; cy += p[1]; cz += p[2]; }
  const n = points.length;
  const c: Pt3 = [cx / n, cy / n, cz / n];

  // scatter matrix
  let sxx = 0, sxy = 0, sxz = 0, syy = 0, syz = 0, szz = 0;
  for (const p of points) {
    const dx = p[0] - c[0], dy = p[1] - c[1], dz = p[2] - c[2];
    sxx += dx * dx; sxy += dx * dy; sxz += dx * dz;
    syy += dy * dy; syz += dy * dz; szz += dz * dz;
  }

  // power iteration for the dominant eigenvector, deterministic start
  let v: Pt3 = [1, 1, 1];
  const start = norm3([sxx + 1, syy + 1, szz + 1]);
  if (len3(start) > 0) v = start;
  for (let i = 0; i < POWER_ITERATIONS; i++) {
    const nv: Pt3 = [
      sxx * v[0] + sxy * v[1] + sxz * v[2],
      sxy * v[0] + syy * v[1] + syz * v[2],
      sxz * v[0] + syz * v[1] + szz * v[2],
    ];
    const l = len3(nv);
    if (l === 0) break; // degenerate (all points coincident with centroid axis)
    v = scale3(nv, 1 / l);
  }
  // canonical orientation: first nonzero component positive
  if (v[0] < 0 || (v[0] === 0 && (v[1] < 0 || (v[1] === 0 && v[2] < 0)))) {
    v = scale3(v, -1);
  }

  let ss = 0;
  for (const p of points) {
    const d = sub3(p, c);
    const along = dot3(d, v);
    const perp2 = dot3(d, d) - along * along;
    ss += perp2 > 0 ? perp2 : 0;
  }
  return { point: c, dir: v, rms: nsqrt(ss / n) };
}

// ---------------------------------------------------------------------------
// Small solvers' shared pieces
// ---------------------------------------------------------------------------

/** Solve a small dense linear system via Gaussian elimination with partial pivoting. */
export function solveLinear(a: number[][], b: number[]): number[] {
  const n = b.length;
  const m = a.map((row, i) => [...row, b[i] ?? 0]);
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) {
      if (nabs(m[r]![col]!) > nabs(m[piv]![col]!)) piv = r;
    }
    if (nabs(m[piv]![col]!) < 1e-12) throw new Error("singular system");
    if (piv !== col) { const t = m[col]!; m[col] = m[piv]!; m[piv] = t; }
    const prow = m[col]!;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = m[r]![col]! / prow[col]!;
      if (f === 0) continue;
      const row = m[r]!;
      for (let cidx = col; cidx <= n; cidx++) row[cidx]! -= f * prow[cidx]!;
    }
  }
  return m.map((row, i) => row[n]! / m[i]![i]!);
}

// ---------------------------------------------------------------------------
// Bernstein basis, and small least squares over it
// ---------------------------------------------------------------------------
//
// Why Bernstein rather than the monomials. Everything above the seam that will
// ever want these coefficients wants them as a Bézier control net — the export
// route is a B-spline surface, and a Bernstein coefficient IS a control point.
// Fitting in the monomial basis and converting afterwards would throw away
// digits at exactly the step that decides whether the exported surface is the
// surface we measured. The basis is also far better conditioned on [0,1]: the
// monomial Gram matrix of degree 5 has a condition number in the millions
// before the data is even looked at.

/**
 * The degree+1 Bernstein basis values at x, by the de Casteljau recurrence.
 *
 * No factorials and no powers: B(i,n) = (1-x)·B(i,n-1) + x·B(i-1,n-1) built up
 * one degree at a time. Every intermediate is a convex combination of numbers
 * in [0,1] for x in [0,1], so nothing cancels and nothing overflows.
 */
export function bernsteinBasis(degree: number, x: number): number[] {
  const n = degree < 0 ? 0 : nfloor(degree);
  const b = new Array<number>(n + 1).fill(0);
  b[0] = 1;
  for (let k = 1; k <= n; k++) {
    let carried = 0;
    for (let i = 0; i < k; i++) {
      const term = b[i]!;
      b[i] = carried + (1 - x) * term;
      carried = x * term;
    }
    b[k] = carried;
  }
  return b;
}

/** d/dx of the same basis, from B(i,n)' = n·(B(i-1,n-1) - B(i,n-1)). */
export function bernsteinBasisDeriv(degree: number, x: number): number[] {
  const n = degree < 0 ? 0 : nfloor(degree);
  if (n === 0) return [0];
  const lower = bernsteinBasis(n - 1, x);
  const out = new Array<number>(n + 1).fill(0);
  for (let i = 0; i <= n; i++) {
    out[i] = n * ((i > 0 ? lower[i - 1]! : 0) - (i < n ? lower[i]! : 0));
  }
  return out;
}

/** Value of a scalar Bernstein polynomial from its coefficients. */
export function bernsteinAt(coeffs: readonly number[], x: number): number {
  if (coeffs.length === 0) return 0;
  const b = bernsteinBasis(coeffs.length - 1, x);
  let sum = 0;
  for (let i = 0; i < coeffs.length; i++) sum += coeffs[i]! * b[i]!;
  return sum;
}

/** Derivative of the same. */
export function bernsteinDerivAt(coeffs: readonly number[], x: number): number {
  if (coeffs.length === 0) return 0;
  const b = bernsteinBasisDeriv(coeffs.length - 1, x);
  let sum = 0;
  for (let i = 0; i < coeffs.length; i++) sum += coeffs[i]! * b[i]!;
  return sum;
}

/** Value of a vector Bernstein polynomial — a Bézier curve in its own right. */
export function bernsteinAt3(coeffs: readonly Pt3[], x: number): Pt3 {
  if (coeffs.length === 0) return [0, 0, 0];
  const b = bernsteinBasis(coeffs.length - 1, x);
  let px = 0, py = 0, pz = 0;
  for (let i = 0; i < coeffs.length; i++) {
    const w = b[i]!, c = coeffs[i]!;
    px += w * c[0]; py += w * c[1]; pz += w * c[2];
  }
  return [px, py, pz];
}

/** Derivative of the same. */
export function bernsteinDerivAt3(coeffs: readonly Pt3[], x: number): Pt3 {
  if (coeffs.length === 0) return [0, 0, 0];
  const b = bernsteinBasisDeriv(coeffs.length - 1, x);
  let px = 0, py = 0, pz = 0;
  for (let i = 0; i < coeffs.length; i++) {
    const w = b[i]!, c = coeffs[i]!;
    px += w * c[0]; py += w * c[1]; pz += w * c[2];
  }
  return [px, py, pz];
}

/**
 * A relative Tikhonov term on the equilibrated normal matrix.
 *
 * After column equilibration every diagonal entry of AᵀA is exactly 1, so this
 * is a RELATIVE 1e-12 — a thousand times below the point where a double's
 * mantissa runs out, invisible to any system with an answer, and the
 * difference between a rescue and a thrown exception for one that has a whole
 * family of them. It is a fixed constant rather than a tuned one on purpose:
 * a solver whose regularisation depends on the data is a solver whose output
 * is not a function of the document.
 */
const LS_RIDGE = 1e-12;

/**
 * Least squares for a small dense overdetermined system, by normal equations
 * on column-equilibrated data.
 *
 * Normal equations square the condition number, which is the standard reason
 * not to use them — and the standard reason is about ill-conditioned design
 * matrices. Equilibration removes the part of the conditioning that comes from
 * columns living at wildly different scales, which here is all of it: one
 * block of columns carries a curve derivative in mm per unit parameter (order
 * 10³) and the other carries a unit direction (order 1). Scaled, the Bernstein
 * Gram matrix at the degrees this tool uses is benign.
 *
 * Deterministic: fixed pivoting order inside `solveLinear`, fixed ridge, and
 * no iteration.
 */
export function solveLeastSquares(
  rows: readonly (readonly number[])[],
  rhs: readonly number[],
): number[] {
  const m = rows.length;
  if (m === 0) throw new Error("least squares: no rows");
  if (rhs.length !== m) throw new Error("least squares: row and rhs counts differ");
  const n = rows[0]!.length;
  if (n === 0) throw new Error("least squares: no unknowns");
  if (m < n) throw new Error(`least squares: ${m} rows for ${n} unknowns`);

  const scale = new Array<number>(n).fill(0);
  for (const r of rows) {
    if (r.length !== n) throw new Error("least squares: ragged design matrix");
    for (let j = 0; j < n; j++) scale[j]! += r[j]! * r[j]!;
  }
  for (let j = 0; j < n; j++) {
    const s = nsqrt(scale[j]!);
    scale[j] = s > 0 ? 1 / s : 1;
  }

  const ata: number[][] = [];
  for (let i = 0; i < n; i++) ata.push(new Array<number>(n).fill(0));
  const atb = new Array<number>(n).fill(0);
  for (let r = 0; r < m; r++) {
    const row = rows[r]!;
    const y = rhs[r]!;
    for (let i = 0; i < n; i++) {
      const ai = row[i]! * scale[i]!;
      atb[i]! += ai * y;
      for (let j = i; j < n; j++) ata[i]![j]! += ai * (row[j]! * scale[j]!);
    }
  }
  for (let i = 0; i < n; i++) {
    ata[i]![i]! += LS_RIDGE;
    for (let j = 0; j < i; j++) ata[i]![j] = ata[j]![i]!;
  }

  const y = solveLinear(ata, atb);
  return y.map((v, j) => v * scale[j]!);
}

// ---------------------------------------------------------------------------
// B-spline basis
// ---------------------------------------------------------------------------
//
// Why a spline and not a higher-degree polynomial. A cross-boundary field on a
// join that turns hard is a badly behaved function of one variable: a curve
// whose speed swings four to one, a bisector that rotates fifty degrees over
// the middle of an edge. Raising the degree of a single Bezier chases that
// with global freedom and converges like a stone — degree 11 still leaves
// three per cent on the P1's worst join. Two interior knots at degree 3 beat
// it outright, because the trouble is local and so is the fix.
//
// It is also the shape the export wants: B_SPLINE_SURFACE_WITH_KNOTS is a
// degree, a knot vector and a control net, and interior knots cost a few more
// control points and nothing else.

/**
 * Clamped uniform knot vector on [0,1] for `spans` polynomial pieces:
 * degree+1 zeros, spans-1 evenly spaced interior knots, degree+1 ones.
 */
export function uniformKnots(degree: number, spans: number): number[] {
  const p = degree < 1 ? 1 : nfloor(degree);
  const s = spans < 1 ? 1 : nfloor(spans);
  const knots: number[] = [];
  for (let i = 0; i <= p; i++) knots.push(0);
  for (let i = 1; i < s; i++) knots.push(i / s);
  for (let i = 0; i <= p; i++) knots.push(1);
  return knots;
}

/** Control-point count implied by a degree and knot vector. */
export const bsplineCount = (degree: number, knots: readonly number[]): number =>
  knots.length - degree - 1;

/**
 * The knot span containing x, clamped into the valid range.
 *
 * Linear rather than bisecting: the vectors here are at most a couple of dozen
 * knots and a loop that is obviously correct is worth more than one that is
 * obviously fast.
 */
export function knotSpan(degree: number, knots: readonly number[], x: number): number {
  const n = bsplineCount(degree, knots) - 1;
  if (x >= knots[n + 1]!) return n;
  if (x <= knots[degree]!) return degree;
  let i = degree;
  while (i < n && x >= knots[i + 1]!) i++;
  return i;
}

/** The degree+1 basis functions that are nonzero on the span, Cox-de Boor. */
function basisFuns(span: number, x: number, degree: number, knots: readonly number[]): number[] {
  const N = new Array<number>(degree + 1).fill(0);
  const left = new Array<number>(degree + 1).fill(0);
  const right = new Array<number>(degree + 1).fill(0);
  N[0] = 1;
  for (let j = 1; j <= degree; j++) {
    left[j] = x - knots[span + 1 - j]!;
    right[j] = knots[span + j]! - x;
    let saved = 0;
    for (let r = 0; r < j; r++) {
      const denom = right[r + 1]! + left[j - r]!;
      const temp = denom === 0 ? 0 : N[r]! / denom;
      N[r] = saved + right[r + 1]! * temp;
      saved = left[j - r]! * temp;
    }
    N[j] = saved;
  }
  return N;
}

/** All basis values at x, as a full coefficient-length array. */
export function bsplineBasis(degree: number, knots: readonly number[], x: number): number[] {
  const count = bsplineCount(degree, knots);
  const out = new Array<number>(count).fill(0);
  const span = knotSpan(degree, knots, x);
  const N = basisFuns(span, x, degree, knots);
  for (let j = 0; j <= degree; j++) out[span - degree + j] = N[j]!;
  return out;
}

/**
 * d/dx of the same, from N′(i,p) = p·N(i,p-1)/(U[i+p]-U[i]) - p·N(i+1,p-1)/(U[i+p+1]-U[i+1]).
 *
 * The degree-(p-1) basis is evaluated on the SAME knot vector, which has one
 * more knot at each end than that degree needs; the extra basis functions it
 * implies are exactly the ones the formula never asks for.
 */
export function bsplineBasisDeriv(degree: number, knots: readonly number[], x: number): number[] {
  const count = bsplineCount(degree, knots);
  const out = new Array<number>(count).fill(0);
  if (degree < 1) return out;
  const span = knotSpan(degree, knots, x);
  const lower = basisFuns(span, x, degree - 1, knots);
  // lower[j] is N(span-(degree-1)+j, degree-1); index it back into full length.
  const low = new Array<number>(count + 1).fill(0);
  for (let j = 0; j <= degree - 1; j++) low[span - degree + 1 + j] = lower[j]!;
  for (let i = 0; i < count; i++) {
    const dA = knots[i + degree]! - knots[i]!;
    const dB = knots[i + degree + 1]! - knots[i + 1]!;
    const a = dA === 0 ? 0 : (degree * low[i]!) / dA;
    const b = dB === 0 ? 0 : (degree * low[i + 1]!) / dB;
    out[i] = a - b;
  }
  return out;
}

/** Value of a scalar B-spline from its coefficients. */
export function bsplineAt(
  coeffs: readonly number[], degree: number, knots: readonly number[], x: number,
): number {
  const span = knotSpan(degree, knots, x);
  const N = basisFuns(span, x, degree, knots);
  let sum = 0;
  for (let j = 0; j <= degree; j++) sum += N[j]! * (coeffs[span - degree + j] ?? 0);
  return sum;
}

/** Derivative of the same. */
export function bsplineDerivAt(
  coeffs: readonly number[], degree: number, knots: readonly number[], x: number,
): number {
  const b = bsplineBasisDeriv(degree, knots, x);
  let sum = 0;
  for (let i = 0; i < coeffs.length; i++) sum += b[i]! * coeffs[i]!;
  return sum;
}

/** Value of a vector B-spline — a B-spline curve. */
export function bsplineAt3(
  coeffs: readonly Pt3[], degree: number, knots: readonly number[], x: number,
): Pt3 {
  const span = knotSpan(degree, knots, x);
  const N = basisFuns(span, x, degree, knots);
  let px = 0, py = 0, pz = 0;
  for (let j = 0; j <= degree; j++) {
    const c = coeffs[span - degree + j];
    if (!c) continue;
    const w = N[j]!;
    px += w * c[0]; py += w * c[1]; pz += w * c[2];
  }
  return [px, py, pz];
}

/** Derivative of the same. */
export function bsplineDerivAt3(
  coeffs: readonly Pt3[], degree: number, knots: readonly number[], x: number,
): Pt3 {
  const b = bsplineBasisDeriv(degree, knots, x);
  let px = 0, py = 0, pz = 0;
  for (let i = 0; i < coeffs.length; i++) {
    const c = coeffs[i];
    if (!c) continue;
    const w = b[i]!;
    px += w * c[0]; py += w * c[1]; pz += w * c[2];
  }
  return [px, py, pz];
}

// Exact polynomial algebra — degree elevation, the Bernstein product rule,
// knot insertion and Bézier extraction. Kept in its own file because it is a
// different kind of thing from the rest of this package: nothing in it
// approximates anything.
export * from "./poly.js";
