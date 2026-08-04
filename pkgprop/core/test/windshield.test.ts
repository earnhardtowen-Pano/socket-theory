import { describe, expect, it } from 'vitest';
import { headTangency } from '../src/constraints/windshield.js';
import { radToDeg } from '../src/units.js';

/**
 * The head-tangency rake floor and its guaranteed monotonicity (brief §3.1):
 * demanding more clearance always raises the floor — more upright glass —
 * and always pulls the farthest legal header forward. Property-tested over
 * randomized sane cockpit geometry.
 */

function rand(min: number, max: number, r: () => number): number {
  return min + (max - min) * r();
}

// Deterministic pseudo-random: keeps the property test reproducible.
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('head tangency (the rake floor)', () => {
  it('known geometry: 45° to center, tangent above it', () => {
    // Cowl at origin, head center 1000 up-and-aft at 45°, clearance 200.
    const t = headTangency({ x: 0, z: 0 }, { x: 707.1, z: 707.1 }, 200);
    const toCenter = Math.PI / 4;
    const spread = Math.asin(200 / 1000);
    expect(t.impossible).toBe(false);
    expect(t.angleRad).toBeCloseTo(toCenter + spread, 3);
  });

  it('a cowl inside the clearance circle is impossible, not silently clamped', () => {
    const t = headTangency({ x: 0, z: 0 }, { x: 50, z: 50 }, 200);
    expect(t.impossible).toBe(true);
  });

  it('property: more clearance demanded → floor rises, never falls', () => {
    const random = mulberry32(20260804);
    for (let trial = 0; trial < 500; trial += 1) {
      const cowl = { x: 0, z: 0 };
      const head = {
        x: rand(400, 1400, random),
        z: rand(200, 900, random),
      };
      const dist = Math.hypot(head.x, head.z);
      const rBase = rand(50, Math.min(300, dist * 0.6), random);
      const rMore = rBase + rand(1, 50, random);
      if (rMore >= dist) continue;
      const a = headTangency(cowl, head, rBase);
      const b = headTangency(cowl, head, rMore);
      expect(b.angleRad).toBeGreaterThan(a.angleRad);
    }
  });

  it('property: more clearance → farthest legal header pulled forward', () => {
    const random = mulberry32(41);
    for (let trial = 0; trial < 500; trial += 1) {
      const cowl = { x: 0, z: 0 };
      const head = { x: rand(500, 1200, random), z: rand(250, 700, random) };
      const roofRise = rand(300, 900, random);
      const dist = Math.hypot(head.x, head.z);
      const rBase = rand(50, Math.min(250, dist * 0.5), random);
      const rMore = rBase + rand(1, 40, random);
      if (rMore >= dist) continue;
      const a = headTangency(cowl, head, rBase);
      const b = headTangency(cowl, head, rMore);
      if (a.angleRad >= Math.PI / 2 || b.angleRad >= Math.PI / 2) continue;
      const headerA = roofRise / Math.tan(a.angleRad);
      const headerB = roofRise / Math.tan(b.angleRad);
      expect(headerB).toBeLessThan(headerA);
    }
  });

  it('reads in sensible degrees for a real cockpit', () => {
    // Cowl 850 up at x=1600; head center at x=2550, z=1150 (a low sports car).
    const t = headTangency({ x: 1600, z: 850 }, { x: 2550, z: 1150 }, 195);
    const deg = radToDeg(t.angleRad);
    expect(deg).toBeGreaterThan(15);
    expect(deg).toBeLessThan(60);
  });
});
