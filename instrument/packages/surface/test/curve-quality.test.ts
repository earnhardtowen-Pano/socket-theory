/**
 * The curvature comb, checked against something that is not itself.
 *
 * κ here is computed analytically from the chain's own derivatives. The test
 * that matters is the one that does not reuse that formula: curvature is also
 * |dT̂/ds|, the rate the unit tangent turns per unit arc length, and that can
 * be differenced from sampled points alone. If the two agree the formula is
 * right; if only the formula were tested, it would only be tested against
 * itself.
 */

import { describe, expect, it } from "vitest";
import type { CurveChain } from "@car/schema";
import { chainDeriv, chainOf, dist3, evalChain, len3, lineChain, norm3, sub3 } from "@car/num";
import { curveComb, curveQuality, STRAIGHT_TURN } from "@car/surface";

/** κ = |dT̂/ds|, from sampled tangents only. */
function kappaByDifference(chain: CurveChain, t: number, h = 1e-4): number {
  const a = norm3(chainDeriv(chain, t - h));
  const b = norm3(chainDeriv(chain, t + h));
  const ds = dist3(evalChain(chain, t - h), evalChain(chain, t + h));
  if (ds === 0) return 0;
  return len3(sub3(b, a)) / ds;
}

const hump = chainOf({ p0: [0, 0, 0], p1: [30, 60, 0], p2: [70, 60, 0], p3: [100, 0, 0] });
const ess = chainOf({ p0: [0, 0, 0], p1: [40, 60, 0], p2: [60, -60, 0], p3: [100, 0, 0] });

describe("curvature comb", () => {
  it("agrees with the turning of the tangent, which is a different calculation", () => {
    for (const chain of [hump, ess]) {
      for (const t of [0.15, 0.3, 0.5, 0.7, 0.85]) {
        const analytic = curveComb(chain, 200).reduce(
          (best, c) => (Math.abs(c.t - t) < Math.abs(best.t - t) ? c : best),
        );
        expect(analytic.kappa).toBeCloseTo(kappaByDifference(chain, t), 6);
      }
    }
  });

  it("calls a straight line straight, and says nothing else about it", () => {
    const q = curveQuality(lineChain([0, 0, 0], [1000, 0, 0]));
    expect(q.straight).toBe(true);
    expect(q.kappaMax).toBe(0);
    expect(q.inflections).toBe(0);
    expect(q.curvatureTurns).toBe(0);
    expect(q.monotone).toBe(true);
    // The variation of a straight line's curvature is roundoff over roundoff,
    // and roundoff has as many peaks as you sample for. Reported as perfect.
    expect(q.variation).toBe(1);
  });

  it("reads a single hump as one peak and no inflection", () => {
    const q = curveQuality(hump);
    expect(q.straight).toBe(false);
    expect(q.inflections).toBe(0);
    expect(q.curvatureTurns).toBe(1);
    expect(q.variation).toBeGreaterThan(1.5);
    expect(q.variation).toBeLessThan(2.2);
  });

  it("finds the inflection in an S", () => {
    const q = curveQuality(ess);
    expect(q.inflections).toBe(1);
    // κ goes to zero at the inflection, so the range starts at zero.
    expect(q.kappaMin).toBeLessThan(q.kappaMax / 100);
  });

  it("measures arc length by walking it", () => {
    const q = curveQuality(lineChain([0, 0, 0], [300, 400, 0]), 8);
    expect(q.arcLength).toBeCloseTo(500, 6);
  });

  it("uses one straightness threshold for any size of curve", () => {
    // κ·L is the angle the tangent sweeps, so the same number works at both
    // ends of the scale. A 5 m curve that turns a nanoradian is still a line.
    const tiny = lineChain([0, 0, 0], [1, 0, 0]);
    const huge = lineChain([0, 0, 0], [5000, 0, 0]);
    expect(curveQuality(tiny).straight).toBe(true);
    expect(curveQuality(huge).straight).toBe(true);
    expect(STRAIGHT_TURN).toBeLessThan(1e-6);
  });

  it("is deterministic", () => {
    const a = curveQuality(ess);
    const b = curveQuality(ess);
    expect(a.samples.map((c) => c.kappa)).toEqual(b.samples.map((c) => c.kappa));
    expect(a.variation).toBe(b.variation);
  });
});
