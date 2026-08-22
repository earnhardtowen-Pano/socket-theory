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
export const npow = (b: number, e: number): number => Math.pow(b, e);
export const nexp = (x: number): number => Math.exp(x);
export const nlog = (x: number): number => Math.log(x);
export const nsqrt = (x: number): number => Math.sqrt(x); // IEEE-deterministic; wrapped for uniformity
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
