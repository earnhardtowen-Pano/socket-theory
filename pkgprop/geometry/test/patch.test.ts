import { describe, expect, it } from 'vitest';
import { bspline, interpolate, type Curve } from '../src/curve.js';
import { coonsPatch, creaseEdge, smoothEdge, type PatchEdges } from '../src/patch.js';
import { length, sub, v3, type V3 } from '../src/vec.js';

/**
 * The patch has exactly one property that everything else rests on: it goes
 * through its own boundary curves. Two patches stay watertight because they
 * share a curve, and they only share it if both of them actually reach it.
 *
 * It is worth saying why this needs a test at all, since "it interpolates its
 * boundaries" reads like a definition rather than a claim. The bicubic form
 * subtracts a correction term, and the correction only cancels along the edges
 * when it is built from the same cross-boundary fields the ruled terms used.
 * Build it from the boundary curves' own derivatives instead — which is the
 * obvious thing to do, and wrong — and the patch misses its edge by a fraction
 * of a millimetre everywhere the boundary is not a straight line. That is
 * invisible in a render and fatal in an export.
 */

const dist = (a: V3, b: V3): number => length(sub(a, b));

/** A patch whose four sides are all curved and none of them is a straight line. */
function bentQuad(): PatchEdges {
  const south = interpolate([v3(0, 0, 0), v3(500, 40, -30), v3(1000, 0, 0)]);
  const north = interpolate([v3(0, 300, 90), v3(500, 380, 140), v3(1000, 300, 90)]);
  const west = interpolate([v3(0, 0, 0), v3(-60, 150, 60), v3(0, 300, 90)]);
  const east = interpolate([v3(1000, 0, 0), v3(1070, 150, 30), v3(1000, 300, 90)]);
  return {
    south: creaseEdge(south),
    north: creaseEdge(north),
    west: creaseEdge(west),
    east: creaseEdge(east),
  };
}

describe('the Coons patch', () => {
  it('passes exactly through all four boundary curves', () => {
    const p = coonsPatch(bentQuad());
    let worst = 0;
    for (let i = 0; i <= 40; i += 1) {
      const t = i / 40;
      worst = Math.max(
        worst,
        dist(p.at(t, 0), p.edges.south.curve.at(t)),
        dist(p.at(t, 1), p.edges.north.curve.at(t)),
        dist(p.at(0, t), p.edges.west.curve.at(t)),
        dist(p.at(1, t), p.edges.east.curve.at(t)),
      );
    }
    // Millimetres. This is a exactness claim, not a tolerance.
    expect(worst).toBeLessThan(1e-6);
  });

  it('still interpolates its boundaries when the cross-slopes are authored', () => {
    // The correction term is built from the cross fields, so changing them
    // must move the interior and leave the edges alone. If a future change
    // ever wires the correction to the curve derivatives instead, this is the
    // test that catches it.
    //
    // The cross field has to VARY along the edge to move anything. A slope
    // that is constant from one corner to the other is exactly what the
    // corner-correction bicubic reproduces from its endpoint data, so it
    // subtracts itself back out and the interior does not budge. What tools a
    // panel is the profile of the slope along its boundary — leave hard here,
    // leave gently there — which is the same thing a surfacer means by
    // "tension on the curve".
    const q = bentQuad();
    const up = (): V3 => v3(0, 0, 1);
    const hump = (t: number): number => 200 + 600 * Math.sin(Math.PI * t);
    const edges: PatchEdges = {
      south: smoothEdge(q.south.curve, up, hump),
      north: smoothEdge(q.north.curve, up, () => 200),
      west: q.west,
      east: q.east,
    };
    const p = coonsPatch(edges);
    let worst = 0;
    for (let i = 0; i <= 40; i += 1) {
      const t = i / 40;
      worst = Math.max(
        worst,
        dist(p.at(t, 0), q.south.curve.at(t)),
        dist(p.at(t, 1), q.north.curve.at(t)),
        dist(p.at(0, t), q.west.curve.at(t)),
        dist(p.at(1, t), q.east.curve.at(t)),
      );
    }
    expect(worst).toBeLessThan(1e-6);

    // And it genuinely changed the middle, or the cross field is doing nothing.
    const plain = coonsPatch(q);
    expect(dist(p.at(0.5, 0.5), plain.at(0.5, 0.5))).toBeGreaterThan(1);
  });

  it('a flat quadrilateral comes out flat', () => {
    const corner = (x: number, y: number): V3 => v3(x, y, 250);
    const line = (a: V3, b: V3): Curve => bspline([a, b]);
    const p = coonsPatch({
      south: creaseEdge(line(corner(0, 0), corner(1000, 0))),
      north: creaseEdge(line(corner(0, 600), corner(1000, 600))),
      west: creaseEdge(line(corner(0, 0), corner(0, 600))),
      east: creaseEdge(line(corner(1000, 0), corner(1000, 600))),
    });
    for (let i = 0; i <= 8; i += 1) {
      for (let j = 0; j <= 8; j += 1) {
        expect(p.at(i / 8, j / 8).z).toBeCloseTo(250, 6);
      }
    }
  });

  it('two patches sharing a curve meet with no gap at all', () => {
    // Watertightness is not a tolerance either: both patches evaluate the
    // same curve object, so the seam is bit-identical.
    const seam = interpolate([v3(1000, 0, 0), v3(1070, 150, 30), v3(1000, 300, 90)]);
    const left = coonsPatch({ ...bentQuad(), east: creaseEdge(seam) });
    const right = coonsPatch({
      south: creaseEdge(interpolate([v3(1000, 0, 0), v3(1500, -30, 20), v3(2000, 0, 60)])),
      north: creaseEdge(interpolate([v3(1000, 300, 90), v3(1500, 330, 120), v3(2000, 300, 150)])),
      west: creaseEdge(seam),
      east: creaseEdge(interpolate([v3(2000, 0, 60), v3(2020, 150, 100), v3(2000, 300, 150)])),
    });
    for (let i = 0; i <= 20; i += 1) {
      const t = i / 20;
      expect(dist(left.at(1, t), right.at(0, t))).toBeLessThan(1e-9);
    }
  });

  it('refuses a quadrilateral that does not close', () => {
    const q = bentQuad();
    const detached = bspline([v3(1000, 0, 40), v3(1070, 150, 30), v3(1000, 300, 90)]);
    // 40mm adrift at one corner — the kind of mistake that otherwise shows up
    // as a torn seam in a render three panels away from its cause.
    expect(() => coonsPatch({ ...q, east: creaseEdge(detached) })).toThrow(/corners disagree/);
  });

  it('gives a usable normal everywhere, including the corners', () => {
    const p = coonsPatch(bentQuad());
    for (const [u, v] of [[0, 0], [1, 0], [0, 1], [1, 1], [0.5, 0.5], [0, 0.5], [1, 0.5]] as const) {
      const n = p.normalAt(u, v);
      expect(Number.isFinite(n.x + n.y + n.z)).toBe(true);
      expect(length(n)).toBeCloseTo(1, 6);
    }
  });
});
