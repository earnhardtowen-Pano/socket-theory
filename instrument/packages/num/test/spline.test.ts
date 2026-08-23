/**
 * The Bernstein and B-spline bases, and the small least squares over them —
 * stated as laws rather than as spot values.
 *
 * These are the numerics the exportable surface stands on: a Bernstein
 * coefficient IS a Bezier control point and a B-spline coefficient IS a
 * control point of the surface that goes into the STEP file. A basis that is
 * subtly wrong here would move the exported body relative to the sampled one,
 * which is exactly the class of error the whole exercise exists to rule out.
 */

import { describe, expect, it } from "vitest";
import {
  bernsteinAt, bernsteinAt3, bernsteinBasis, bernsteinBasisDeriv, bernsteinDerivAt,
  bsplineAt, bsplineAt3, bsplineBasis, bsplineBasisDeriv, bsplineCount, bsplineDerivAt,
  knotSpan, solveLeastSquares, uniformKnots,
} from "@car/num";

const STATIONS = 201;
const stations = Array.from({ length: STATIONS }, (_, i) => i / (STATIONS - 1));

describe("Bernstein basis", () => {
  it("is a partition of unity, non-negative on [0,1], at every degree used", () => {
    for (const n of [0, 1, 2, 3, 5, 9]) {
      for (const x of stations) {
        const b = bernsteinBasis(n, x);
        expect(b.length).toBe(n + 1);
        expect(b.reduce((a, c) => a + c, 0)).toBeCloseTo(1, 14);
        for (const v of b) expect(v).toBeGreaterThanOrEqual(-1e-15);
      }
    }
  });

  it("interpolates its end coefficients exactly", () => {
    const c = [3, -1, 7, 2];
    expect(bernsteinAt(c, 0)).toBe(3);
    expect(bernsteinAt(c, 1)).toBe(2);
  });

  it("reproduces a polynomial it can represent, to machine precision", () => {
    // 1, x, x², x³ in the Bernstein basis of degree 3.
    const cubic = (x: number): number => 2 - 3 * x + 5 * x * x - x * x * x;
    const coeffs = solveLeastSquares(
      stations.map((x) => bernsteinBasis(3, x)),
      stations.map(cubic),
    );
    for (const x of stations) expect(bernsteinAt(coeffs, x)).toBeCloseTo(cubic(x), 10);
  });

  it("differentiates analytically — the basis derivatives sum to zero", () => {
    for (const n of [1, 3, 5]) {
      for (const x of stations) {
        expect(bernsteinBasisDeriv(n, x).reduce((a, c) => a + c, 0)).toBeCloseTo(0, 12);
      }
    }
    const c = [1, 4, -2, 3];
    const h = 1e-6;
    for (const x of [0.17, 0.4, 0.83]) {
      const fd = (bernsteinAt(c, x + h) - bernsteinAt(c, x - h)) / (2 * h);
      expect(bernsteinDerivAt(c, x)).toBeCloseTo(fd, 6);
    }
  });

  it("evaluates a vector coefficient set componentwise", () => {
    const c: [number, number, number][] = [[1, 0, 0], [0, 2, 0], [0, 0, 3], [1, 1, 1]];
    for (const x of [0, 0.3, 0.75, 1]) {
      const v = bernsteinAt3(c, x);
      for (let k = 0; k < 3; k++) {
        expect(v[k]).toBeCloseTo(bernsteinAt(c.map((p) => p[k]!), x), 14);
      }
    }
  });
});

describe("B-spline basis", () => {
  it("is a partition of unity and non-negative, at every degree and span count", () => {
    for (const p of [1, 2, 3, 5]) {
      for (const spans of [1, 2, 3, 7]) {
        const k = uniformKnots(p, spans);
        expect(bsplineCount(p, k)).toBe(p + spans);
        for (const x of stations) {
          const b = bsplineBasis(p, k, x);
          expect(b.reduce((a, c) => a + c, 0)).toBeCloseTo(1, 14);
          for (const v of b) expect(v).toBeGreaterThanOrEqual(-1e-15);
        }
      }
    }
  });

  /** The claim that makes one code path serve both the fit and the export. */
  it("IS the Bernstein basis when there is one span", () => {
    for (const p of [1, 2, 3, 5]) {
      const k = uniformKnots(p, 1);
      for (const x of stations) {
        const bs = bsplineBasis(p, k, x);
        const be = bernsteinBasis(p, x);
        for (let i = 0; i <= p; i++) expect(bs[i]).toBe(be[i]);
      }
    }
  });

  it("is clamped: the end coefficients are interpolated exactly", () => {
    const k = uniformKnots(3, 4);
    const c = Array.from({ length: bsplineCount(3, k) }, (_, i) => i * i - 3);
    expect(bsplineAt(c, 3, k, 0)).toBe(c[0]);
    expect(bsplineAt(c, 3, k, 1)).toBe(c[c.length - 1]);
  });

  it("keeps the span index inside the valid range at and beyond the ends", () => {
    const k = uniformKnots(3, 4);
    const last = bsplineCount(3, k) - 1;
    expect(knotSpan(3, k, -1)).toBe(3);
    expect(knotSpan(3, k, 0)).toBe(3);
    expect(knotSpan(3, k, 1)).toBe(last);
    expect(knotSpan(3, k, 2)).toBe(last);
  });

  it("differentiates analytically — away from knots it matches a difference", () => {
    for (const p of [2, 3, 5]) {
      const k = uniformKnots(p, 3);
      const n = bsplineCount(p, k);
      const c = Array.from({ length: n }, (_, i) => Math.sin(1.7 * i) + 0.3 * i);
      const h = 1e-6;
      for (const x of [0.11, 0.27, 0.51, 0.79, 0.92]) {
        if (k.some((u) => Math.abs(u - x) < 3 * h)) continue;
        const fd = (bsplineAt(c, p, k, x + h) - bsplineAt(c, p, k, x - h)) / (2 * h);
        expect(bsplineDerivAt(c, p, k, x)).toBeCloseTo(fd, 4);
      }
      for (const x of stations) {
        expect(bsplineBasisDeriv(p, k, x).reduce((a, v) => a + v, 0)).toBeCloseTo(0, 9);
      }
    }
  });

  it("evaluates a vector coefficient set componentwise", () => {
    const k = uniformKnots(3, 3);
    const n = bsplineCount(3, k);
    const c: [number, number, number][] =
      Array.from({ length: n }, (_, i) => [i, -i, i * 0.5]);
    for (const x of [0.05, 0.4, 0.66, 0.99]) {
      const v = bsplineAt3(c, 3, k, x);
      for (let m = 0; m < 3; m++) {
        expect(v[m]).toBeCloseTo(bsplineAt(c.map((q) => q[m]!), 3, k, x), 12);
      }
    }
  });

  /**
   * The property the adaptive fit rests on: splitting spans strictly increases
   * what the basis can represent, so a residual that stops falling is a signal
   * about the DATA and not about the basis running out.
   */
  it("splits into a strictly better approximation, and converges like a cubic", () => {
    // A peak an eighth of the domain wide: a single cubic cannot see it at
    // all, which is the point. This is the same shape as the P1's worst join,
    // where a global degree-11 Bezier still left three per cent and two
    // interior knots at degree 3 beat it outright.
    const hard = (x: number): number => 1 / (1 + 100 * (x - 0.37) * (x - 0.37));
    const worst: number[] = [];
    for (const spans of [1, 2, 4, 8, 16, 32]) {
      const k = uniformKnots(3, spans);
      const coeffs = solveLeastSquares(
        stations.map((x) => bsplineBasis(3, k, x)),
        stations.map(hard),
      );
      let w = 0;
      for (const x of stations) w = Math.max(w, Math.abs(bsplineAt(coeffs, 3, k, x) - hard(x)));
      worst.push(w);
    }
    // Every split helps.
    for (let i = 1; i < worst.length; i++) expect(worst[i]!).toBeLessThan(worst[i - 1]!);
    // Once the pieces are small enough to resolve the peak, a cubic spline is
    // O(h⁴) and each doubling should be worth far more than a factor of four.
    for (let i = 3; i < worst.length; i++) expect(worst[i]!).toBeLessThan(worst[i - 1]! / 4);
    expect(worst[worst.length - 1]!).toBeLessThan(1e-3);
  });
});

describe("least squares", () => {
  it("solves an exactly determined system to the ridge's precision", () => {
    // The relative 1e-12 Tikhonov term is the floor here, not the arithmetic:
    // it is what makes a rank-deficient system return an answer instead of
    // throwing, and it costs twelve digits on one that does not need it.
    const rows = [[2, 1], [1, -1]];
    const x = solveLeastSquares(rows, [5, 1]);
    expect(x[0]).toBeCloseTo(2, 10);
    expect(x[1]).toBeCloseTo(1, 10);
  });

  it("survives columns at wildly different scales — the case it exists for", () => {
    // One block carries a curve derivative in mm per unit parameter, the other
    // a unit direction. Unequilibrated normal equations lose this outright.
    const big = 2.4e3;
    const truth = [7e-3, -1.5e2];
    const rows = stations.map((x) => [big * (1 + x), 1 - 0.5 * x]);
    const rhs = rows.map((r) => r[0]! * truth[0]! + r[1]! * truth[1]!);
    const x = solveLeastSquares(rows, rhs);
    expect(x[0]).toBeCloseTo(truth[0]!, 9);
    expect(x[1]).toBeCloseTo(truth[1]!, 6);
  });

  it("refuses a system it cannot solve rather than inventing an answer", () => {
    expect(() => solveLeastSquares([], [])).toThrow();
    expect(() => solveLeastSquares([[1, 2]], [1])).toThrow();      // 1 row, 2 unknowns
    expect(() => solveLeastSquares([[1], [1]], [1])).toThrow();    // rhs count wrong
  });

  it("returns a finite answer for a rank-deficient system", () => {
    // Two identical columns: the ridge decides, and the sum is still right.
    const rows = stations.map((x) => [x, x]);
    const out = solveLeastSquares(rows, stations.map((x) => 3 * x));
    expect(Number.isFinite(out[0]!)).toBe(true);
    expect(out[0]! + out[1]!).toBeCloseTo(3, 6);
  });

  it("is a pure function of its input — same data, same bits", () => {
    const rows = stations.map((x) => bernsteinBasis(3, x));
    const rhs = stations.map((x) => Math.sin(6 * x));
    expect(solveLeastSquares(rows, rhs)).toEqual(solveLeastSquares(rows, rhs));
  });
});
