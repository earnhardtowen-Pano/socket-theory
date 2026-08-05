import { describe, expect, it } from 'vitest';
import { interpolate, scalarSpline, v3 } from '@pkgprop/geometry';

/** The old tableOf, verbatim, so the comparison is not a story. */
function oldTableOf(pairs: readonly { x: number; v: number }[]): (x: number) => number {
  const sorted = [...pairs].sort((a, b) => a.x - b.x);
  const pts: { x: number; v: number }[] = [];
  for (const p of sorted) {
    const prev = pts[pts.length - 1];
    if (prev && Math.abs(p.x - prev.x) < 1) pts[pts.length - 1] = { x: prev.x, v: (prev.v + p.v) / 2 };
    else pts.push(p);
  }
  const first = pts[0]!; const last = pts[pts.length - 1]!;
  const curve = interpolate(pts.map((p) => v3(p.x, p.v, 0)));
  const GRID = 240; const grid: number[] = [];
  const samples = curve.sample(GRID * 2);
  for (let i = 0; i <= GRID; i += 1) {
    const x = first.x + ((last.x - first.x) * i) / GRID;
    let best = samples[0]!;
    for (const s of samples) if (Math.abs(s.x - x) < Math.abs(best.x - x)) best = s;
    grid.push(best.y);
  }
  return (x: number): number => {
    if (x <= first.x) return grid[0]!;
    if (x >= last.x) return grid[GRID]!;
    const t = ((x - first.x) / (last.x - first.x)) * GRID;
    const i = Math.min(GRID - 1, Math.floor(t));
    return grid[i]! + (grid[i + 1]! - grid[i]!) * (t - i);
  };
}

/** A rail shaped like the real roof line: a few points, real curvature. */
const RAIL = [
  { x: -745, v: 631 }, { x: -387, v: 700 }, { x: 740, v: 960 },
  { x: 1745, v: 1478 }, { x: 2365, v: 900 }, { x: 3372, v: 736 },
];

function flips(f: (x: number) => number): { flips: number; maxJerk: number } {
  const H = 5;
  const vals: number[] = [];
  for (let x = -745; x <= 3372; x += H) vals.push(f(x));
  let n = 0; let prev = 0; let maxJerk = 0;
  const d2: number[] = [];
  for (let i = 1; i < vals.length - 1; i += 1) {
    d2.push((vals[i + 1]! - 2 * vals[i]! + vals[i - 1]!) / (H * H));
  }
  for (let i = 0; i < d2.length; i += 1) {
    const s = Math.sign(Math.round(d2[i]! * 1e7));
    if (s !== 0 && prev !== 0 && s !== prev) n += 1;
    if (s !== 0) prev = s;
    if (i > 0) maxJerk = Math.max(maxJerk, Math.abs(d2[i]! - d2[i - 1]!));
  }
  return { flips: n, maxJerk };
}

describe('the rails do not ruffle any more', () => {
  it('the nearest-sample grid was manufacturing curvature reversals; the spline is not', () => {
    const before = flips(oldTableOf(RAIL));
    const after = flips(scalarSpline(RAIL));
    console.log(`old: ${before.flips} curvature sign flips, max jerk ${before.maxJerk.toExponential(2)}`);
    console.log(`new: ${after.flips} curvature sign flips, max jerk ${after.maxJerk.toExponential(2)}`);

    // A rail through six points has five spans, so a handful of genuine
    // curvature reversals is the shape the designer drew. Anything approaching
    // the grid resolution is the grid talking.
    expect(after.flips).toBeLessThanOrEqual(6);
    expect(before.flips).toBeGreaterThan(30);
    expect(after.maxJerk).toBeLessThan(before.maxJerk / 20);
  });

  it('is exact at the points it was given, which the grid was not', () => {
    const f = scalarSpline(RAIL);
    for (const p of RAIL) expect(f(p.x)).toBeCloseTo(p.v, 6);
  });

  it('leaves the ends on their slope instead of flattening', () => {
    const f = scalarSpline(RAIL);
    const inside = f(-745 + 20) - f(-745);
    const outside = f(-745) - f(-745 - 20);
    // Same direction and roughly the same rate: a nose that runs past the last
    // drawn point keeps going the way it was going.
    expect(Math.sign(inside)).toBe(Math.sign(outside));
    expect(outside / inside).toBeGreaterThan(0.5);
    expect(outside / inside).toBeLessThan(2);
  });
});
