import { describe, expect, it } from 'vitest';
import {
  bspline,
  buildCar,
  bounds,
  clampedKnots,
  halfSection,
  interpolate,
  polylineLength,
  sectionAt,
  v3,
  vertexNormals,
  type CarInput,
  type Mesh,
} from '../src/index.js';

const SHAPE = { crown: 0.5, shoulder: 0.55, tumblehome: 0.35, glassInset: 0.4 };

/** A plausible car: 4.2m long, 1.9 wide, roof at 1.3, belt at 0.83. */
function testCar(over: Partial<CarInput> = {}): CarInput {
  const stations: number[] = [];
  for (let x = -800; x <= 3400; x += 150) stations.push(x);
  return {
    stations,
    topZ: (x: number) => 1300 - 700 * Math.max(0, Math.min(1, Math.abs(x - 1400) / 2200)) ** 2,
    beltZ: () => 830,
    halfWidth: (x: number) =>
      950 * Math.sin(Math.PI * Math.max(0.03, Math.min(0.97, (x + 800) / 4200))) ** 0.4,
    rockerZ: () => 150,
    cabin: { x0: 500, x1: 2500 },
    shape: SHAPE,
    ribPoints: 14,
    ...over,
  };
}

/** Every edge of a closed surface is shared by exactly two triangles. */
function openEdges(m: Mesh): number {
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
  return [...edges.values()].filter((n) => n !== 2).length;
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

  it('an interpolation passes through every point it was given', () => {
    const pts = [v3(0, 0, 0), v3(100, 40, 0), v3(250, 55, 0), v3(400, 30, 0), v3(520, 0, 0)];
    const c = interpolate(pts);
    const hits = c.sample(2000);
    for (const p of pts) {
      const nearest = hits.reduce((best, q) =>
        Math.hypot(q.x - p.x, q.y - p.y) < Math.hypot(best.x - p.x, best.y - p.y) ? q : best,
      );
      expect(Math.hypot(nearest.x - p.x, nearest.y - p.y)).toBeLessThan(1);
    }
  });

  it('an interpolated curve does not wander far from its chord', () => {
    const pts = [v3(0, 0, 0), v3(100, 10, 0), v3(200, 0, 0), v3(300, 10, 0)];
    const chord = polylineLength(pts);
    const arc = polylineLength(interpolate(pts).sample(400));
    expect(arc).toBeGreaterThan(chord * 0.98);
    expect(arc).toBeLessThan(chord * 1.35);
  });
});

describe('sections', () => {
  it('runs centreline top to the sill and never crosses the centreline', () => {
    const s = halfSection(1300, 150, 950, SHAPE);
    expect(s.at(0).y).toBeCloseTo(0, 6);
    expect(s.at(0).z).toBeCloseTo(1300, 6);
    expect(s.at(1).z).toBeCloseTo(150, 6);
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

  it('reaches its stated maximum half width and no further', () => {
    const pts = halfSection(1300, 150, 950, SHAPE).sample(200);
    const widest = Math.max(...pts.map((p) => p.y));
    expect(widest).toBeGreaterThan(940);
    expect(widest).toBeLessThan(951);
  });

  it('tumblehome pulls the sill in and leaves the shoulder alone', () => {
    const slab = halfSection(1300, 150, 950, { ...SHAPE, tumblehome: 0 });
    const leaned = halfSection(1300, 150, 950, { ...SHAPE, tumblehome: 1 });
    expect(leaned.at(1).y).toBeLessThan(slab.at(1).y - 300);
  });
});

describe('the two-volume car', () => {
  it('builds a body and a greenhouse, both watertight', () => {
    const car = buildCar(testCar());
    expect(car.greenhouse).not.toBeNull();
    expect(openEdges(car.body)).toBe(0);
    expect(openEdges(car.greenhouse!)).toBe(0);
  });

  it('the body stops at the belt inside the cabin — no more blister', () => {
    const input = testCar();
    const car = buildCar(input);
    const b = bounds(car.body);
    // The roof is at 1300; the body volume must top out near the belt, not
    // reach the roof. The greenhouse is what goes up there.
    expect(b.max.z).toBeLessThan(900);
    const g = bounds(car.greenhouse!);
    expect(g.max.z).toBeGreaterThan(1200);
  });

  it('the greenhouse sits inboard of the body', () => {
    const car = buildCar(testCar());
    const bodyW = bounds(car.body).max.y;
    const glassW = bounds(car.greenhouse!).max.y;
        // A real DLO sits just inboard of the shoulder — a step you can see, not
    // a fin. Both bounds matter: too wide and there is no break, too narrow
    // and the cabin stops being part of the car.
    expect(glassW).toBeLessThan(bodyW * 0.93);
    expect(glassW).toBeGreaterThan(bodyW * 0.7);
  });

  it('a car whose roof never clears the belt has no greenhouse', () => {
    const car = buildCar(testCar({ topZ: () => 700, beltZ: () => 830 }));
    expect(car.greenhouse).toBeNull();
    expect(openEdges(car.body)).toBe(0);
  });

  it('normals are unit length on both volumes', () => {
    const car = buildCar(testCar());
    for (const m of [car.body, car.greenhouse!]) {
      for (let i = 0; i < m.normals.length; i += 3) {
        const L = Math.hypot(m.normals[i]!, m.normals[i + 1]!, m.normals[i + 2]!);
        expect(L).toBeGreaterThan(0.99);
        expect(L).toBeLessThan(1.01);
      }
    }
  });

  it('both volumes are symmetric about the centre plane', () => {
    const car = buildCar(testCar());
    for (const m of [car.body, car.greenhouse!]) {
      let sumY = 0;
      for (let i = 1; i < m.positions.length; i += 3) sumY += m.positions[i]!;
      expect(Math.abs(sumY)).toBeLessThan(1);
    }
  });

  it('a sculpt displacement deforms the body and keeps it watertight', () => {
    // A scoop: 30mm in, over a patch of the flank. The topology never changes,
    // so no authored cut can ever open the surface.
    const cut = testCar({
      displace: (x, y, z) => {
        const inX = x > 1600 && x < 2200;
        const inZ = z > 400 && z < 700;
        return inX && inZ && y > 500 ? { y: y - 30, z } : { y, z };
      },
    });
    const plain = buildCar(testCar());
    const cutCar = buildCar(cut);
    expect(openEdges(cutCar.body)).toBe(0);
    // The cut actually moved material: the deepest point pulled inboard.
    const at = (m: Mesh, px: number, pz: number): number => {
      let best = 0;
      for (let i = 0; i < m.positions.length; i += 3) {
        const x = m.positions[i]!;
        const y = m.positions[i + 1]!;
        const z = m.positions[i + 2]!;
        if (Math.abs(x - px) < 80 && Math.abs(z - pz) < 80 && y > best) best = y;
      }
      return best;
    };
    expect(at(cutCar.body, 1900, 550)).toBeLessThan(at(plain.body, 1900, 550) - 20);
  });

  it('the composed section agrees with the loft tables', () => {
    const input = testCar();
    const s = sectionAt(input, 1400, 40);
    expect(s.greenhouse).not.toBeNull();
    const bodyTopZ = Math.max(...s.body.map((p) => p.z));
    expect(bodyTopZ).toBeLessThan(880); // belt + a hair, never the roof
    const glassTop = Math.max(...s.greenhouse!.map((p) => p.z));
    expect(glassTop).toBeGreaterThan(1200);
    const outside = sectionAt(input, -600, 40);
    expect(outside.greenhouse).toBeNull();
  });

  it('re-lofts a full-resolution car inside the frame budget', () => {
    const heavy = testCar({ ribPoints: 24 });
    const start = performance.now();
    for (let i = 0; i < 5; i += 1) buildCar(heavy);
    const each = (performance.now() - start) / 5;
    expect(each).toBeLessThan(100);
  });

  it('refuses a car it cannot loft rather than emitting a broken mesh', () => {
    expect(() => buildCar(testCar({ stations: [0] }))).toThrow(/at least two stations/);
  });
});

describe('normals', () => {
  it('a flat quad has one normal everywhere, pointing off the face', () => {
    const positions = new Float32Array([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0]);
    const indices = new Uint32Array([0, 1, 2, 0, 2, 3]);
    const n = vertexNormals(positions, indices);
    for (let i = 0; i < 4; i += 1) expect(n[i * 3 + 2]!).toBeCloseTo(1, 6);
  });
});
