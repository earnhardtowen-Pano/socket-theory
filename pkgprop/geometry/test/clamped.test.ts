import { describe, expect, it } from 'vitest';
import { interpolate } from '../src/curve.js';
import { dot, normalize, v3, type V3 } from '../src/vec.js';

/**
 * A mirrored half only reads as one surface if it leaves the mirror plane
 * perpendicular to it. This is the test for that, and it is the difference
 * between a body and a body with a crease down its spine.
 */

const OUTBOARD: V3 = v3(0, 1, 0);
const INBOARD: V3 = v3(0, -1, 0);

/** A section-shaped point list: centreline top, round the flank, back to the keel. */
const SECTION: V3[] = [
  v3(0, 0, 1400),
  v3(0, 380, 1330),
  v3(0, 820, 1100),
  v3(0, 940, 700),
  v3(0, 760, 210),
  v3(0, 0, 170),
];

const angleFromY = (t: V3): number =>
  (Math.acos(Math.min(1, Math.abs(dot(normalize(t), OUTBOARD)))) * 180) / Math.PI;

describe('end tangents', () => {
  it('a natural spline leaves the centreline at whatever angle it likes', () => {
    const free = interpolate(SECTION);
    const start = angleFromY(free.tangentAt(0));
    const end = angleFromY(free.tangentAt(1));
    // Characterising the defect, not asserting it is good: both ends are well
    // off perpendicular, and mirrored that is a crease on the spine and one on
    // the keel.
    expect(start).toBeGreaterThan(5);
    expect(end).toBeGreaterThan(5);
  });

  it('a clamped spline leaves and arrives perpendicular to the mirror plane', () => {
    const held = interpolate(SECTION, { start: OUTBOARD, end: INBOARD });
    expect(angleFromY(held.tangentAt(0))).toBeLessThan(0.5);
    expect(angleFromY(held.tangentAt(1))).toBeLessThan(0.5);
  });

  it('and still passes exactly through every point it was given', () => {
    // Clamping the ends must not cost interpolation anywhere.
    const held = interpolate(SECTION, { start: OUTBOARD, end: INBOARD });
    const hit = (p: V3): number => {
      let best = Infinity;
      for (let i = 0; i <= 2000; i += 1) {
        const q = held.at(i / 2000);
        best = Math.min(best, Math.hypot(q.x - p.x, q.y - p.y, q.z - p.z));
      }
      return best;
    };
    for (const p of SECTION) expect(hit(p)).toBeLessThan(1);
  });

  it('clamping one end only leaves the other natural', () => {
    const half = interpolate(SECTION, { start: OUTBOARD });
    expect(angleFromY(half.tangentAt(0))).toBeLessThan(0.5);
    expect(angleFromY(half.tangentAt(1))).toBeGreaterThan(5);
  });

  it('the mirrored pair is smooth across the seam once clamped', () => {
    // What the clamp is actually for: reflect the curve in y and check the two
    // halves meet without a corner.
    const held = interpolate(SECTION, { start: OUTBOARD, end: INBOARD });
    const t0 = normalize(held.tangentAt(0));
    const mirrored = v3(t0.x, -t0.y, t0.z);
    // The mirrored tangent must be the exact opposite, i.e. one straight line
    // through the seam rather than a vee.
    expect(dot(t0, mirrored)).toBeLessThan(-0.9999);
  });
});
