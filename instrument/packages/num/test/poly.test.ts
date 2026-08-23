/**
 * Exact polynomial algebra.
 *
 * Every assertion here is an IDENTITY, not a tolerance: elevation, the
 * product rule, knot insertion and Bézier extraction all return a different
 * representation of the same polynomial. Where a bound appears it is the
 * rounding of the multiplies that carry the identity, and it is stated in
 * units of the value being compared.
 *
 * All fixtures are synthetic. Nothing here reads the P1.
 */

import { describe, expect, it } from "vitest";
import {
  addBezier, bernsteinAt, bezierSegments, bezierSegments3, binomial, crossBezier3,
  deCasteljauLeft, deCasteljauRight, derivBezier, dotBezier3, elevateBezier,
  elevateBezier3, elevateBezierTo, insertKnot, multiplyBezier, powerBezier,
  restrictBezier, restrictBezier3, scaleBezier3, uniformKnots, bsplineAt,
  type Vec3Bezier,
} from "../src/index.js";

/** Deterministic pseudo-random coefficients — a fixed recurrence, no clock. */
function coeffs(n: number, seed: number): number[] {
  const out: number[] = [];
  let s = seed;
  for (let i = 0; i <= n; i++) {
    s = (s * 1103515245 + 12345) % 2147483648;
    out.push((s / 2147483648) * 20 - 10);
  }
  return out;
}
const vecs = (n: number, seed: number): Vec3Bezier => {
  const x = coeffs(n, seed), y = coeffs(n, seed + 7), z = coeffs(n, seed + 13);
  return x.map((v, i) => [v, y[i]!, z[i]!] as const);
};

const STATIONS = Array.from({ length: 41 }, (_, i) => i / 40);

describe("binomial", () => {
  it("is exact where the factorial formula is not", () => {
    // 50! is 3e64; C(50,25) is 1.26e14, comfortably inside 2^53.
    expect(binomial(50, 25)).toBe(126410606437752);
    expect(binomial(30, 15)).toBe(155117520);
    expect(binomial(5, 0)).toBe(1);
    expect(binomial(5, 5)).toBe(1);
  });
  it("is zero outside the row", () => {
    expect(binomial(4, 5)).toBe(0);
    expect(binomial(4, -1)).toBe(0);
  });
});

describe("degree elevation", () => {
  it("does not move the curve", () => {
    const c = coeffs(4, 11);
    const up = elevateBezierTo(c, 12);
    expect(up.length).toBe(13);
    for (const x of STATIONS) {
      expect(bernsteinAt(up, x)).toBeCloseTo(bernsteinAt(c, x), 11);
    }
  });

  it("keeps the endpoints bit for bit", () => {
    const c = coeffs(3, 5);
    let up: readonly number[] = c;
    for (let i = 0; i < 8; i++) up = elevateBezier(up);
    expect(up[0]).toBe(c[0]);
    expect(up[up.length - 1]).toBe(c[3]);
  });

  it("refuses to lower a degree", () => {
    expect(() => elevateBezierTo(coeffs(5, 1), 3)).toThrow(/cannot be lowered/);
  });

  it("elevates a vector Bézier the same way", () => {
    const c = vecs(3, 21);
    const up = elevateBezier3(c, 9);
    expect(up.length).toBe(10);
    expect(up[0]).toEqual(c[0]);
  });
});

describe("the product rule", () => {
  it("multiplies exactly at every station", () => {
    const a = coeffs(3, 3), b = coeffs(5, 9);
    const p = multiplyBezier(a, b);
    expect(p.length).toBe(9);
    for (const x of STATIONS) {
      const want = bernsteinAt(a, x) * bernsteinAt(b, x);
      expect(bernsteinAt(p, x)).toBeCloseTo(want, 9);
    }
  });

  it("is the identity against the degree-0 one", () => {
    const a = coeffs(6, 17);
    expect(multiplyBezier(a, [1])).toEqual(a);
  });

  it("reproduces x^k", () => {
    const p = powerBezier(5);
    for (const x of STATIONS) expect(bernsteinAt(p, x)).toBeCloseTo(x ** 5, 12);
  });

  it("carries the surfacing blends exactly", () => {
    // g(t) = t(1-t)^2 and q(t) = ½t²(1-t)³ — the actual Hermite blends the
    // patch uses, built from products rather than written out.
    const x: number[] = [0, 1], omx: number[] = [1, 0];
    const g = multiplyBezier(x, multiplyBezier(omx, omx));
    const q = multiplyBezier(
      scaleBezier(multiplyBezier(x, x), 0.5),
      multiplyBezier(omx, multiplyBezier(omx, omx)),
    );
    for (const t of STATIONS) {
      expect(bernsteinAt(g, t)).toBeCloseTo(t * (1 - t) ** 2, 12);
      expect(bernsteinAt(q, t)).toBeCloseTo(0.5 * t * t * (1 - t) ** 3, 12);
    }
    expect(g.length).toBe(4);   // cubic — first order
    expect(q.length).toBe(6);   // quintic — second order
  });
});

const scaleBezier = (a: readonly number[], s: number): number[] => a.map((v) => v * s);

describe("sum and derivative", () => {
  it("adds across unequal degrees", () => {
    const a = coeffs(2, 31), b = coeffs(7, 41);
    const s = addBezier(a, b);
    expect(s.length).toBe(8);
    for (const x of STATIONS) {
      expect(bernsteinAt(s, x)).toBeCloseTo(bernsteinAt(a, x) + bernsteinAt(b, x), 10);
    }
  });

  it("differentiates the product by the product rule", () => {
    const a = coeffs(3, 61), b = coeffs(4, 71);
    const lhs = derivBezier(multiplyBezier(a, b));
    const rhs = addBezier(
      multiplyBezier(derivBezier(a), b),
      multiplyBezier(a, derivBezier(b)),
    );
    for (const x of STATIONS) {
      expect(bernsteinAt(lhs, x)).toBeCloseTo(bernsteinAt(rhs, x), 8);
    }
  });

  it("returns a zero constant for a constant", () => {
    expect(derivBezier([4])).toEqual([0]);
  });
});

describe("vector products", () => {
  it("crosses exactly", () => {
    const a = vecs(2, 101), b = vecs(3, 211);
    const c = crossBezier3(a, b);
    const at = (v: Vec3Bezier, x: number) =>
      [0, 1, 2].map((k) => bernsteinAt(v.map((p) => p[k]!), x));
    for (const x of STATIONS) {
      const [ax, ay, az] = at(a, x) as [number, number, number];
      const [bx, by, bz] = at(b, x) as [number, number, number];
      const want = [ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx];
      const got = at(c, x);
      for (let k = 0; k < 3; k++) expect(got[k]!).toBeCloseTo(want[k]!, 8);
    }
  });

  it("dots exactly", () => {
    const a = vecs(2, 303), b = vecs(2, 404);
    const d = dotBezier3(a, b);
    for (const x of STATIONS) {
      const va = [0, 1, 2].map((k) => bernsteinAt(a.map((p) => p[k]!), x));
      const vb = [0, 1, 2].map((k) => bernsteinAt(b.map((p) => p[k]!), x));
      const want = va[0]! * vb[0]! + va[1]! * vb[1]! + va[2]! * vb[2]!;
      expect(bernsteinAt(d, x)).toBeCloseTo(want, 8);
    }
  });

  it("scales a vector Bézier by a scalar one", () => {
    const s = coeffs(3, 5), v = vecs(2, 9);
    const p = scaleBezier3(s, v);
    expect(p.length).toBe(6);
    for (const x of STATIONS) {
      const want = bernsteinAt(s, x) * bernsteinAt(v.map((q) => q[0]!), x);
      expect(bernsteinAt(p.map((q) => q[0]!), x)).toBeCloseTo(want, 8);
    }
  });
});

describe("knot insertion", () => {
  it("does not move the spline", () => {
    const degree = 3, spans = 4;
    const knots = uniformKnots(degree, spans);
    const c = coeffs(knots.length - degree - 2, 77);
    const step = insertKnot(degree, knots, c, 0.37);
    expect(step.coeffs.length).toBe(c.length + 1);
    expect(step.knots.length).toBe(knots.length + 1);
    for (const x of STATIONS) {
      const before = bsplineAt(c, degree, knots, x);
      const after = bsplineAt(step.coeffs, degree, step.knots, x);
      expect(after).toBeCloseTo(before, 11);
    }
  });

  it("refuses a knot outside the open interval", () => {
    const knots = uniformKnots(3, 2);
    const c = coeffs(knots.length - 5, 1);
    expect(() => insertKnot(3, knots, c, 0)).toThrow(/outside/);
    expect(() => insertKnot(3, knots, c, 1)).toThrow(/outside/);
  });

  it("refuses to exceed full multiplicity", () => {
    const degree = 2;
    let knots: readonly number[] = uniformKnots(degree, 2);
    let c: readonly number[] = coeffs(knots.length - degree - 2, 3);
    // `uniformKnots` already places 0.5 once, so one more insertion reaches
    // the degree and the span becomes a Bézier boundary.
    const step = insertKnot(degree, knots, c, 0.5);
    knots = step.knots; c = step.coeffs;
    expect(() => insertKnot(degree, knots, c, 0.5)).toThrow(/full multiplicity/);
  });
});

describe("Bézier extraction", () => {
  it("reproduces the spline span by span", () => {
    const degree = 3, spans = 5;
    const knots = uniformKnots(degree, spans);
    const c = coeffs(knots.length - degree - 2, 909);
    const { breaks, segments } = bezierSegments(degree, knots, c);
    expect(segments.length).toBe(spans);
    expect(breaks.length).toBe(spans + 1);
    for (const seg of segments) expect(seg.length).toBe(degree + 1);
    for (const x of STATIONS) {
      let s = 0;
      while (s < segments.length - 1 && x >= breaks[s + 1]!) s++;
      const lo = breaks[s]!, hi = breaks[s + 1]!;
      const local = (x - lo) / (hi - lo);
      expect(bernsteinAt(segments[s]!, local)).toBeCloseTo(bsplineAt(c, degree, knots, x), 10);
    }
  });

  it("is a no-op on a single span", () => {
    const knots = uniformKnots(3, 1);
    const c = coeffs(3, 5);
    const { segments } = bezierSegments(3, knots, c);
    expect(segments.length).toBe(1);
    expect(segments[0]).toEqual(c);
  });

  it("extracts a vector spline in step with the scalar one", () => {
    const degree = 3, spans = 3;
    const knots = uniformKnots(degree, spans);
    const v = vecs(knots.length - degree - 2, 55);
    const { segments } = bezierSegments3(degree, knots, v);
    expect(segments.length).toBe(spans);
    expect(segments[0]![0]).toEqual(v[0]);
  });
});

describe("subdivision and restriction", () => {
  it("splits without moving the curve", () => {
    const c = coeffs(5, 313), t = 0.4;
    const left = deCasteljauLeft(c, t), right = deCasteljauRight(c, t);
    expect(left.length).toBe(c.length);
    expect(right.length).toBe(c.length);
    for (const x of STATIONS) {
      expect(bernsteinAt(left, x)).toBeCloseTo(bernsteinAt(c, x * t), 10);
      expect(bernsteinAt(right, x)).toBeCloseTo(bernsteinAt(c, t + x * (1 - t)), 10);
    }
  });

  it("restricts to an interior window", () => {
    const c = coeffs(4, 404), a = 0.25, b = 0.8;
    const r = restrictBezier(c, a, b);
    for (const x of STATIONS) {
      expect(bernsteinAt(r, x)).toBeCloseTo(bernsteinAt(c, a + x * (b - a)), 10);
    }
  });

  it("restricts to the whole domain as the identity", () => {
    const c = coeffs(3, 17);
    const r = restrictBezier(c, 0, 1);
    for (let i = 0; i < c.length; i++) expect(r[i]!).toBeCloseTo(c[i]!, 12);
  });

  it("restricts a vector Bézier", () => {
    const v = vecs(3, 606);
    const r = restrictBezier3(v, 0.1, 0.9);
    expect(r.length).toBe(4);
    const at = (c: Vec3Bezier, x: number) => bernsteinAt(c.map((p) => p[1]!), x);
    for (const x of STATIONS) expect(at(r, x)).toBeCloseTo(at(v, 0.1 + x * 0.8), 10);
  });

  it("refuses an empty window", () => {
    expect(() => restrictBezier(coeffs(3, 1), 0.5, 0.5)).toThrow(/empty interval/);
  });
});
