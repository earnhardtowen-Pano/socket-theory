import { add, lerp, normalize, scale, sub, v3, type V3 } from './vec.js';

/**
 * Cubic B-splines, written out rather than vendored.
 *
 * The surface needs three things from a curve and no more: a point at a
 * parameter, a tangent at a parameter, and an interpolation that passes
 * through given points. A NURBS library carries rational weights, trimming,
 * and surface intersection — none of which this tool has any use for, all of
 * which is code we would own the bugs in.
 *
 * Degree is fixed at three. Lower is visibly faceted on a car body; higher
 * buys nothing you can see and makes the interpolation matrix worse behaved.
 */

const DEGREE = 3;

export interface Curve {
  /** Point at parameter u, clamped to [0, 1]. */
  at(u: number): V3;
  /** Unit tangent at u. Falls back to a finite difference at the ends. */
  tangentAt(u: number): V3;
  /** Sample n+1 evenly spaced points, endpoints included. */
  sample(n: number): V3[];
}

/**
 * A clamped uniform knot vector: the curve starts at the first control point
 * and ends at the last, which is what makes a rail meet the nose and the tail
 * instead of floating short of them.
 */
export function clampedKnots(controlCount: number): number[] {
  const n = controlCount - 1;
  const m = n + DEGREE + 1;
  const knots: number[] = [];
  for (let i = 0; i <= m; i += 1) {
    if (i <= DEGREE) knots.push(0);
    else if (i >= m - DEGREE) knots.push(1);
    else knots.push((i - DEGREE) / (n - DEGREE + 1));
  }
  return knots;
}

/** The knot span containing u, as de Boor needs it. */
function spanOf(knots: readonly number[], controlCount: number, u: number): number {
  const n = controlCount - 1;
  if (u >= (knots[n + 1] ?? 1)) return n;
  let lo = DEGREE;
  let hi = n + 1;
  let mid = Math.floor((lo + hi) / 2);
  while (u < (knots[mid] ?? 0) || u >= (knots[mid + 1] ?? 1)) {
    if (u < (knots[mid] ?? 0)) hi = mid;
    else lo = mid;
    mid = Math.floor((lo + hi) / 2);
    if (mid <= DEGREE) return DEGREE;
    if (mid >= n) return n;
  }
  return mid;
}

/** de Boor's algorithm — repeated linear interpolation, numerically kind. */
function deBoor(control: readonly V3[], knots: readonly number[], u: number): V3 {
  const k = spanOf(knots, control.length, u);
  let d: V3[] = [];
  for (let j = 0; j <= DEGREE; j += 1) d.push(control[k - DEGREE + j] ?? v3(0, 0, 0));
  for (let r = 1; r <= DEGREE; r += 1) {
    const next: V3[] = d.slice();
    for (let j = DEGREE; j >= r; j -= 1) {
      const i = k - DEGREE + j;
      const lo = knots[i] ?? 0;
      const hi = knots[i + DEGREE - r + 1] ?? 1;
      const span = hi - lo;
      const a = span > 0 ? (u - lo) / span : 0;
      next[j] = lerp(d[j - 1] ?? v3(0, 0, 0), d[j] ?? v3(0, 0, 0), a);
    }
    d = next;
  }
  return d[DEGREE] ?? v3(0, 0, 0);
}

class BSpline implements Curve {
  private readonly knots: readonly number[];

  constructor(private readonly control: readonly V3[]) {
    if (control.length < 2) throw new Error('A curve needs at least two control points.');
    this.knots = clampedKnots(control.length);
  }

  at(u: number): V3 {
    const t = Math.min(1, Math.max(0, u));
    // Two and three control points are below the degree, so fall back to the
    // straight and quadratic cases rather than degenerating the knot vector.
    const c = this.control;
    if (c.length === 2) return lerp(c[0]!, c[1]!, t);
    if (c.length === 3) {
      const a = lerp(c[0]!, c[1]!, t);
      const b = lerp(c[1]!, c[2]!, t);
      return lerp(a, b, t);
    }
    return deBoor(c, this.knots, t);
  }

  tangentAt(u: number): V3 {
    const h = 1e-4;
    const a = this.at(Math.max(0, u - h));
    const b = this.at(Math.min(1, u + h));
    return normalize(sub(b, a));
  }

  sample(n: number): V3[] {
    const out: V3[] = [];
    for (let i = 0; i <= n; i += 1) out.push(this.at(i / n));
    return out;
  }
}

/** A curve that approximates its control points — the fast path. */
export function bspline(control: readonly V3[]): Curve {
  return new BSpline(control);
}

/**
 * A curve that passes exactly through the given points.
 *
 * A body line is authored, not suggested: if a designer puts the roof peak at
 * a station, the surface has to go through it, not near it. So the control
 * points are solved for rather than used directly — a cubic interpolation
 * with chord-length parameterisation, which keeps the curve from bulging
 * between points that are far apart.
 *
 * The system is tridiagonal, so it is solved with the Thomas algorithm in one
 * forward and one back pass instead of a general matrix routine.
 */
export function interpolate(points: readonly V3[]): Curve {
  const n = points.length;
  if (n < 3) return bspline(points);

  // Chord-length parameterisation, normalised.
  const t: number[] = [0];
  for (let i = 1; i < n; i += 1) {
    const d = Math.hypot(
      points[i]!.x - points[i - 1]!.x,
      points[i]!.y - points[i - 1]!.y,
      points[i]!.z - points[i - 1]!.z,
    );
    t.push(t[i - 1]! + Math.max(d, 1e-6));
  }
  const total = t[n - 1]!;
  for (let i = 0; i < n; i += 1) t[i] = t[i]! / total;

  // Natural cubic spline through the points, per axis, then resampled into
  // control points for a B-spline. Solving the spline is cheap and exact;
  // resampling keeps one curve type downstream.
  const solveAxis = (get: (p: V3) => number): number[] => {
    const a = points.map(get);
    const rhs = new Array<number>(n).fill(0);
    const lo = new Array<number>(n).fill(0);
    const di = new Array<number>(n).fill(1);
    const hi = new Array<number>(n).fill(0);
    for (let i = 1; i < n - 1; i += 1) {
      const h0 = t[i]! - t[i - 1]!;
      const h1 = t[i + 1]! - t[i]!;
      lo[i] = h0;
      di[i] = 2 * (h0 + h1);
      hi[i] = h1;
      rhs[i] = 3 * ((a[i + 1]! - a[i]!) / h1 - (a[i]! - a[i - 1]!) / h0);
    }
    // Thomas: forward sweep then back substitution.
    for (let i = 1; i < n; i += 1) {
      const w = lo[i]! / di[i - 1]!;
      di[i] = di[i]! - w * hi[i - 1]!;
      rhs[i] = rhs[i]! - w * rhs[i - 1]!;
    }
    const c = new Array<number>(n).fill(0);
    c[n - 1] = di[n - 1] !== 0 ? rhs[n - 1]! / di[n - 1]! : 0;
    for (let i = n - 2; i >= 0; i -= 1) {
      c[i] = di[i] !== 0 ? (rhs[i]! - hi[i]! * c[i + 1]!) / di[i]! : 0;
    }
    return c;
  };

  const cx = solveAxis((p) => p.x);
  const cy = solveAxis((p) => p.y);
  const cz = solveAxis((p) => p.z);

  const evalAt = (u: number): V3 => {
    let i = 0;
    while (i < n - 2 && u > t[i + 1]!) i += 1;
    const h = t[i + 1]! - t[i]!;
    const s = h > 0 ? (u - t[i]!) / h : 0;
    const axis = (a0: number, a1: number, c0: number, c1: number): number => {
      const b = (a1 - a0) / h - (h * (2 * c0 + c1)) / 3;
      const d = (c1 - c0) / (3 * h);
      const x = s * h;
      return a0 + b * x + c0 * x * x + d * x * x * x;
    };
    return v3(
      axis(points[i]!.x, points[i + 1]!.x, cx[i]!, cx[i + 1]!),
      axis(points[i]!.y, points[i + 1]!.y, cy[i]!, cy[i + 1]!),
      axis(points[i]!.z, points[i + 1]!.z, cz[i]!, cz[i + 1]!),
    );
  };

  return {
    at: (u) => evalAt(Math.min(1, Math.max(0, u))),
    tangentAt: (u) => {
      const h = 1e-4;
      return normalize(sub(evalAt(Math.min(1, u + h)), evalAt(Math.max(0, u - h))));
    },
    sample: (steps) => {
      const out: V3[] = [];
      for (let i = 0; i <= steps; i += 1) out.push(evalAt(i / steps));
      return out;
    },
  };
}

/** Resample a curve at a fixed count, for lofting rib against rib. */
export function resample(curve: Curve, count: number): V3[] {
  return curve.sample(Math.max(1, count - 1));
}

/** A polyline's total length — used to check a curve is not wandering. */
export function polylineLength(pts: readonly V3[]): number {
  let sum = 0;
  for (let i = 1; i < pts.length; i += 1) {
    sum += Math.hypot(
      pts[i]!.x - pts[i - 1]!.x,
      pts[i]!.y - pts[i - 1]!.y,
      pts[i]!.z - pts[i - 1]!.z,
    );
  }
  return sum;
}

export { add, scale, sub, v3, type V3 };
