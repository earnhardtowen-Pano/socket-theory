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
/**
 * Directions the curve must leave and arrive along.
 *
 * Only the direction is used; the magnitude is taken from the curve's own
 * chord length, because a tangent whose length disagrees with the curve's
 * parameterisation produces a loop at the end rather than a lean.
 *
 * This exists for one reason above all others. A car is a mirrored half, and a
 * mirrored half only reads as one surface if it leaves the mirror plane
 * perpendicular to it. A *natural* spline pins the second derivative at its
 * ends and leaves the first derivative free, so where the section met the
 * centreline the tangent was whatever the point spacing happened to produce —
 * measured at nine to twenty-seven degrees off. Mirrored, that is a crease
 * running the entire length of the car, down the hood, over the roof and along
 * the decklid, with a matching one down the keel. It is the single loudest
 * reason the bodies read as folded rather than moulded, and nobody drew it.
 */
export interface EndTangents {
  readonly start?: V3;
  readonly end?: V3;
}

export function interpolate(points: readonly V3[], ends?: EndTangents): Curve {
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

  // Scaled into the normalised parameter, so the prescribed slope is in the
  // same units as the spline's own derivative.
  const startD = ends?.start ? scale(normalize(ends.start), total) : null;
  const endD = ends?.end ? scale(normalize(ends.end), total) : null;

  // Cubic spline through the points, per axis. Natural at an end with no
  // prescribed tangent — second derivative zero — and clamped at an end that
  // has one.
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
    // Clamped rows, from S'(t0) = m0 and S'(t_{n-1}) = m_end under this file's
    // c = S''/2 convention.
    if (startD) {
      const h0 = t[1]! - t[0]!;
      di[0] = 2 * h0;
      hi[0] = h0;
      rhs[0] = 3 * ((a[1]! - a[0]!) / h0 - get(startD));
    }
    if (endD) {
      const hL = t[n - 1]! - t[n - 2]!;
      lo[n - 1] = hL;
      di[n - 1] = 2 * hL;
      rhs[n - 1] = 3 * (get(endD) - (a[n - 1]! - a[n - 2]!) / hL);
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

/**
 * A rail: one value as a smooth function of station.
 *
 * A car's rails — how tall the roof is at x, how wide the body is at x — are
 * functions, not free curves in space, and treating them as free curves costs
 * more than it sounds. A parametric curve has to be *inverted* to answer "what
 * is the value at this x", and the cheap way to invert it is to sample it
 * densely and look up the nearest sample. That is what this replaces, and the
 * nearest-sample lookup was the single largest source of the rippling the
 * owner could see on the body: every rail became a 240-segment polyline whose
 * vertices sat up to half a sample-spacing off the true curve, and shading
 * reads the first derivative, so 240 jittered slope breaks along the length of
 * the car is 240 ripples.
 *
 * Solved as a function of x instead, the answer is exact, C2, and costs a
 * binary search. There is nothing to sample and nothing to drift.
 *
 * Outside the given range the rail continues at its end slope rather than
 * flattening: a nose or a tail that runs past the last drawn point should keep
 * going the way it was going, not turn a corner.
 */
export function scalarSpline(
  points: readonly { readonly x: number; readonly v: number }[],
): (x: number) => number {
  const pts = [...points].sort((a, b) => a.x - b.x);
  // Two points at the same station are one point; averaging is the only
  // answer that does not depend on which was drawn first.
  const clean: { x: number; v: number }[] = [];
  for (const p of pts) {
    const prev = clean[clean.length - 1];
    if (prev && Math.abs(p.x - prev.x) < 1e-9) prev.v = (prev.v + p.v) / 2;
    else clean.push({ x: p.x, v: p.v });
  }

  const n = clean.length;
  if (n === 0) return () => 0;
  const first = clean[0]!;
  if (n === 1) return () => first.v;
  const last = clean[n - 1]!;
  if (n === 2) {
    const m = (last.v - first.v) / (last.x - first.x);
    return (x: number) => first.v + m * (x - first.x);
  }

  // Natural cubic: second derivative zero at both ends. Solved for the second
  // derivatives with the Thomas algorithm, one forward and one back pass.
  const h: number[] = [];
  for (let i = 0; i < n - 1; i += 1) h.push(clean[i + 1]!.x - clean[i]!.x);

  const lo = new Array<number>(n).fill(0);
  const di = new Array<number>(n).fill(1);
  const hi = new Array<number>(n).fill(0);
  const rhs = new Array<number>(n).fill(0);
  for (let i = 1; i < n - 1; i += 1) {
    lo[i] = h[i - 1]!;
    di[i] = 2 * (h[i - 1]! + h[i]!);
    hi[i] = h[i]!;
    rhs[i] = 6 * ((clean[i + 1]!.v - clean[i]!.v) / h[i]! - (clean[i]!.v - clean[i - 1]!.v) / h[i - 1]!);
  }
  for (let i = 1; i < n; i += 1) {
    const w = lo[i]! / di[i - 1]!;
    di[i] = di[i]! - w * hi[i - 1]!;
    rhs[i] = rhs[i]! - w * rhs[i - 1]!;
  }
  const m = new Array<number>(n).fill(0);
  m[n - 1] = di[n - 1] !== 0 ? rhs[n - 1]! / di[n - 1]! : 0;
  for (let i = n - 2; i >= 0; i -= 1) {
    m[i] = di[i] !== 0 ? (rhs[i]! - hi[i]! * m[i + 1]!) / di[i]! : 0;
  }

  const evalSpan = (i: number, x: number): number => {
    const a = clean[i]!;
    const b = clean[i + 1]!;
    const hh = h[i]!;
    const t = x - a.x;
    const s = b.x - x;
    return (
      (m[i]! * s * s * s + m[i + 1]! * t * t * t) / (6 * hh) +
      (a.v / hh - (m[i]! * hh) / 6) * s +
      (b.v / hh - (m[i + 1]! * hh) / 6) * t
    );
  };

  const slopeAt = (i: number, x: number): number => {
    const eps = 1e-3;
    return (evalSpan(i, x + eps) - evalSpan(i, x - eps)) / (2 * eps);
  };

  return (x: number): number => {
    if (x <= first.x) return first.v + slopeAt(0, first.x) * (x - first.x);
    if (x >= last.x) return last.v + slopeAt(n - 2, last.x) * (x - last.x);
    let loI = 0;
    let hiI = n - 2;
    while (loI < hiI) {
      const mid = (loI + hiI + 1) >> 1;
      if (clean[mid]!.x <= x) loI = mid;
      else hiI = mid - 1;
    }
    return evalSpan(loI, x);
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
