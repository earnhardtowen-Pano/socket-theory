import { describe, expect, it } from 'vitest';
import {
  bspline,
  buildBody,
  bounds,
  clampedKnots,
  halfSection,
  interpolate,
  polylineLength,
  v3,
  vertexNormals,
  type BodyInput,
} from '../src/index.js';

const SHAPE = { crown: 0.5, shoulder: 0.55, tumblehome: 0.35, glassInset: 0.3 };

/** A plausible car: 4.2 m long, 1.9 wide, roof at 1.3, rocker at 0.15. */
function testBody(over: Partial<BodyInput> = {}): BodyInput {
  const stations = [];
  for (let x = -800; x <= 3400; x += 200) stations.push(x);
  return {
    stations,
    topZ: (x) => 1300 - 700 * Math.max(0, Math.min(1, Math.abs(x - 1400) / 2200)) ** 2,
    halfWidth: (x) => 950 * Math.sin(Math.PI * Math.max(0.03, Math.min(0.97, (x + 800) / 4200))) ** 0.4,
    rockerZ: () => 150,
    beltZ: () => 780,
    shape: SHAPE,
    ribPoints: 14,
    ...over,
  };
}

describe('curves', () => {
  it('a clamped knot vector starts at 0 and ends at 1 with degree+1 of each', () => {
    const k = clampedKnots(8);
    expect(k.slice(0, 4)).toEqual([0, 0, 0, 0]);
    expect(k.slice(-4)).toEqual([1, 1, 1, 1]);
    expect(k.length).toBe(8 + 3 + 1);
    for (let i = 1; i < k.length; i += 1) expect(k[i]!).toBeGreaterThanOrEqual(k[i - 1]!);
  });

  it('a b-spline starts and ends on its first and last control point', () => {
    const c = bspline([v3(0, 0, 0), v3(1, 2, 0), v3(3, 2, 0), v3(4, 0, 0), v3(6, 1, 0)]);
    expect(c.at(0).x).toBeCloseTo(0, 6);
    expect(c.at(1).x).toBeCloseTo(6, 6);
    expect(c.at(1).y).toBeCloseTo(1, 6);
  });

  it('two and three control points degrade to a line and a quadratic, not to nonsense', () => {
    const line = bspline([v3(0, 0, 0), v3(10, 0, 0)]);
    expect(line.at(0.5).x).toBeCloseTo(5, 6);
    const quad = bspline([v3(0, 0, 0), v3(5, 10, 0), v3(10, 0, 0)]);
    expect(quad.at(0.5).x).toBeCloseTo(5, 6);
    expect(quad.at(0.5).y).toBeCloseTo(5, 6);
  });

  it('an interpolation passes through every point it was given', () => {
    // This is the property the whole surface rests on: a designer who puts the
    // roof peak at a station means the surface goes there, not near there.
    const pts = [v3(0, 0, 0), v3(100, 40, 0), v3(250, 55, 0), v3(400, 30, 0), v3(520, 0, 0)];
    const c = interpolate(pts);
    const hits = c.sample(2000);
    for (const p of pts) {
      const nearest = hits.reduce((best, q) =>
        Math.hypot(q.x - p.x, q.y - p.y, q.z - p.z) < Math.hypot(best.x - p.x, best.y - p.y, best.z - p.z)
          ? q
          : best,
      );
      expect(Math.hypot(nearest.x - p.x, nearest.y - p.y, nearest.z - p.z)).toBeLessThan(1);
    }
  });

  it('an interpolated curve does not wander: it stays near the chord length', () => {
    const pts = [v3(0, 0, 0), v3(100, 10, 0), v3(200, 0, 0), v3(300, 10, 0)];
    const chord = polylineLength(pts);
    const arc = polylineLength(interpolate(pts).sample(400));
    expect(arc).toBeGreaterThan(chord * 0.98);
    expect(arc).toBeLessThan(chord * 1.35);
  });

  it('tangents point along the curve', () => {
    const c = interpolate([v3(0, 0, 0), v3(100, 0, 0), v3(200, 0, 0)]);
    const t = c.tangentAt(0.5);
    expect(t.x).toBeCloseTo(1, 3);
    expect(Math.abs(t.y)).toBeLessThan(1e-3);
  });
});

describe('sections', () => {
  it('starts on the centreline at the top and ends at the rocker', () => {
    const s = halfSection(1300, 150, 950, SHAPE);
    expect(s.at(0).y).toBeCloseTo(0, 6);
    expect(s.at(0).z).toBeCloseTo(1300, 6);
    expect(s.at(1).z).toBeCloseTo(150, 6);
  });

  it('never crosses the centreline — a section cannot fold through itself', () => {
    for (const shape of [
      { crown: 0, shoulder: 0.2, tumblehome: 0, glassInset: 0 },
      { crown: 1, shoulder: 0.9, tumblehome: 1, glassInset: 1 },
      SHAPE,
    ]) {
      for (const p of halfSection(1300, 150, 950, shape).sample(120)) {
        expect(p.y).toBeGreaterThanOrEqual(-1);
      }
    }
  });

  it('reaches its stated maximum half width', () => {
    const pts = halfSection(1300, 150, 950, SHAPE).sample(200);
    const widest = Math.max(...pts.map((p) => p.y));
    expect(widest).toBeGreaterThan(940);
    expect(widest).toBeLessThan(960);
  });

  it('tumblehome pulls the sill in and leaves the shoulder alone', () => {
    const slab = halfSection(1300, 150, 950, { ...SHAPE, tumblehome: 0 });
    const leaned = halfSection(1300, 150, 950, { ...SHAPE, tumblehome: 1 });
    expect(leaned.at(1).y).toBeLessThan(slab.at(1).y - 300);
    expect(Math.max(...leaned.sample(200).map((p) => p.y))).toBeCloseTo(
      Math.max(...slab.sample(200).map((p) => p.y)),
      0,
    );
  });
});

describe('the lofted body', () => {
  it('produces a mesh with matching normals and valid indices', () => {
    const m = buildBody(testBody());
    expect(m.vertexCount).toBeGreaterThan(100);
    expect(m.triangleCount).toBeGreaterThan(100);
    expect(m.normals.length).toBe(m.positions.length);
    for (const i of m.indices) expect(i).toBeLessThan(m.vertexCount);
  });

  it('every normal is unit length — a zero normal is a black facet under light', () => {
    const m = buildBody(testBody());
    for (let i = 0; i < m.normals.length; i += 3) {
      const L = Math.hypot(m.normals[i]!, m.normals[i + 1]!, m.normals[i + 2]!);
      expect(L).toBeGreaterThan(0.99);
      expect(L).toBeLessThan(1.01);
    }
  });

  it('is symmetric about the centre plane', () => {
    const m = buildBody(testBody());
    let sumY = 0;
    for (let i = 1; i < m.positions.length; i += 3) sumY += m.positions[i]!;
    expect(Math.abs(sumY)).toBeLessThan(1);
  });

  it('stays inside the silhouette and the plan width it was given', () => {
    const input = testBody();
    const b = bounds(buildBody(input));
    const widest = Math.max(...input.stations.map((x) => input.halfWidth(x)));
    const tallest = Math.max(...input.stations.map((x) => input.topZ(x)));
    expect(b.max.y).toBeLessThanOrEqual(widest + 1);
    expect(b.max.z).toBeLessThanOrEqual(tallest + 1);
    expect(b.min.z).toBeGreaterThanOrEqual(149);
  });

  it('closes its ends rather than leaving an open tube', () => {
    const m = buildBody(testBody());
    // Every edge in a closed surface is shared by exactly two triangles.
    const edges = new Map<string, number>();
    for (let t = 0; t < m.indices.length; t += 3) {
      const tri = [m.indices[t]!, m.indices[t + 1]!, m.indices[t + 2]!];
      for (let e = 0; e < 3; e += 1) {
        const a = tri[e]!;
        const b = tri[(e + 1) % 3]!;
        const key = a < b ? `${a}_${b}` : `${b}_${a}`;
        edges.set(key, (edges.get(key) ?? 0) + 1);
      }
    }
    const open = [...edges.values()].filter((n) => n !== 2).length;
    expect(open).toBe(0);
  });

  it('re-lofts a full-resolution body inside the frame budget', () => {
    const heavy = testBody({ ribPoints: 28 });
    const start = performance.now();
    for (let i = 0; i < 5; i += 1) buildBody(heavy);
    const each = (performance.now() - start) / 5;
    // The package can change on any slider drag, so a re-loft has to fit
    // inside a frame with room to spare for the renderer.
    expect(each).toBeLessThan(100);
  });

  it('refuses a body it cannot loft rather than emitting a broken mesh', () => {
    expect(() => buildBody(testBody({ stations: [0] }))).toThrow(/at least two stations/);
  });
});

describe('normals', () => {
  it('a flat quad has one normal everywhere, pointing off the face', () => {
    const positions = new Float32Array([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0]);
    const indices = new Uint32Array([0, 1, 2, 0, 2, 3]);
    const n = vertexNormals(positions, indices);
    for (let i = 0; i < 4; i += 1) {
      expect(n[i * 3 + 2]!).toBeCloseTo(1, 6);
    }
  });
});
