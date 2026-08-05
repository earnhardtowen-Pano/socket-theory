import { describe, expect, it } from 'vitest';
import { bspline, interpolate } from '../src/curve.js';
import { buildNetwork, mirrorNetwork, type NetworkSpec } from '../src/network.js';
import { dot, v3, type V3 } from '../src/vec.js';

/**
 * Two claims carry the whole network layer, and neither is obvious enough to
 * take on faith.
 *
 * The first is that panels sharing a curve are watertight. That is structural
 * — they evaluate the same curve object — but it is only structural if the
 * sampling along that edge is identical from both sides, and it is easy to
 * write a tessellation where it is not.
 *
 * The second is that an edge marked as a crease actually shades as one. That
 * is the difference between a character line and a soft dent, and it is
 * decided entirely by which vertices are allowed into the same normal bucket.
 */

const line = (a: V3, b: V3) => bspline([a, b]);

/** Two flat panels meeting along a shared curve at a dihedral angle. */
function tent(kind: 'smooth' | 'crease'): NetworkSpec {
  // The ridge both panels share, running along +x.
  const ridge = line(v3(0, 0, 400), v3(1000, 0, 400));
  const westFoot = line(v3(0, -500, 0), v3(1000, -500, 0));
  const eastFoot = line(v3(0, 500, 0), v3(1000, 500, 0));
  return {
    density: 6,
    curves: [
      { id: 'ridge', curve: ridge, label: 'ridge' },
      { id: 'west-foot', curve: westFoot, label: 'west foot' },
      { id: 'east-foot', curve: eastFoot, label: 'east foot' },
      { id: 'w-front', curve: line(v3(0, -500, 0), v3(0, 0, 400)), label: 'w front' },
      { id: 'w-back', curve: line(v3(1000, -500, 0), v3(1000, 0, 400)), label: 'w back' },
      { id: 'e-front', curve: line(v3(0, 0, 400), v3(0, 500, 0)), label: 'e front' },
      { id: 'e-back', curve: line(v3(1000, 0, 400), v3(1000, 500, 0)), label: 'e back' },
    ],
    panels: [
      {
        id: 'west',
        label: 'west slope',
        boundary: ['west-foot', 'w-back', 'ridge', 'w-front'],
        reversed: [false, false, true, true],
        edges: ['smooth', 'smooth', kind, 'smooth'],
      },
      {
        id: 'east',
        label: 'east slope',
        boundary: ['ridge', 'e-back', 'east-foot', 'e-front'],
        reversed: [false, false, true, true],
        edges: [kind, 'smooth', 'smooth', 'smooth'],
      },
    ],
  };
}

/** Every vertex sitting on the shared ridge, by index. */
function onRidge(positions: Float32Array): number[] {
  const out: number[] = [];
  for (let i = 0; i < positions.length / 3; i += 1) {
    if (Math.abs(positions[i * 3 + 1]!) < 1e-6 && Math.abs(positions[i * 3 + 2]! - 400) < 1e-6) {
      out.push(i);
    }
  }
  return out;
}

describe('the patch network', () => {
  it('two panels sharing a curve land on exactly the same points', () => {
    const mesh = buildNetwork(tent('smooth'));
    const ridge = onRidge(mesh.positions);
    // Both panels sample the ridge at density+1 points, so there are two
    // coincident vertices per station and every one of them has a partner.
    expect(ridge.length).toBe(2 * 7);
    const xs = ridge.map((i) => mesh.positions[i * 3]!).sort((a, b) => a - b);
    for (let i = 0; i < xs.length; i += 2) {
      expect(xs[i + 1]! - xs[i]!).toBeLessThan(1e-9);
    }
  });

  it('a smooth shared edge shades as one surface', () => {
    const mesh = buildNetwork(tent('smooth'));
    const ridge = onRidge(mesh.positions);
    const nrm = (i: number): V3 =>
      v3(mesh.normals[i * 3]!, mesh.normals[i * 3 + 1]!, mesh.normals[i * 3 + 2]!);

    // The claim is that the two panels AGREE, which is what welding buys. Pair
    // the coincident vertices by station and check each pair, rather than
    // checking every ridge normal against one of them: at the two open ends of
    // the ridge the area weighting legitimately leans, because a corner vertex
    // has a different number of incident triangles on each side of the seam.
    // That lean is symmetric, harmless, and not what this test is about.
    const byX = new Map<number, number[]>();
    for (const i of ridge) {
      const x = Math.round(mesh.positions[i * 3]! * 1000);
      const at = byX.get(x);
      if (at) at.push(i);
      else byX.set(x, [i]);
    }
    expect(byX.size).toBe(7);
    for (const pair of byX.values()) {
      expect(pair.length).toBe(2);
      expect(dot(nrm(pair[0]!), nrm(pair[1]!))).toBeGreaterThan(0.999999);
    }

    // And along the run of the ridge the welded normal points straight up: the
    // two slopes cancel sideways, which is the whole point of a smooth seam.
    for (const [x, pair] of byX) {
      if (x === 0 || x === 1000_000) continue;
      expect(Math.abs(nrm(pair[0]!).y)).toBeLessThan(1e-6);
      expect(nrm(pair[0]!).z).toBeGreaterThan(0.999);
    }
  });

  it('a crease shared edge keeps two normals and stays hard', () => {
    const mesh = buildNetwork(tent('crease'));
    const ridge = onRidge(mesh.positions);
    const normals = ridge.map((i) =>
      v3(mesh.normals[i * 3]!, mesh.normals[i * 3 + 1]!, mesh.normals[i * 3 + 2]!),
    );
    // Two distinct normals at the ridge, one per slope, leaning opposite ways.
    const leftish = normals.filter((n) => n.y < -0.1);
    const rightish = normals.filter((n) => n.y > 0.1);
    expect(leftish.length).toBeGreaterThan(0);
    expect(rightish.length).toBeGreaterThan(0);
    expect(dot(leftish[0]!, rightish[0]!)).toBeLessThan(0.99);
  });

  it('names every panel and covers every triangle exactly once', () => {
    const mesh = buildNetwork(tent('smooth'));
    expect(mesh.groups.map((g) => g.id)).toEqual(['west', 'east']);
    const covered = mesh.groups.reduce((sum, g) => sum + g.count, 0);
    expect(covered).toBe(mesh.indices.length);
    expect(mesh.groups[0]!.start).toBe(0);
    expect(mesh.groups[1]!.start).toBe(mesh.groups[0]!.count);
  });

  it('refuses a panel that names a curve the network does not have', () => {
    const spec = tent('smooth');
    const broken: NetworkSpec = {
      ...spec,
      panels: [{ ...spec.panels[0]!, boundary: ['west-foot', 'w-back', 'nope', 'w-front'] }],
    };
    expect(() => buildNetwork(broken)).toThrow(/not in the network/);
  });

  it('mirroring doubles the car and keeps the winding right', () => {
    const half = buildNetwork(tent('smooth'));
    const full = mirrorNetwork(half);
    expect(full.vertexCount).toBe(half.vertexCount * 2);
    expect(full.triangleCount).toBe(half.triangleCount * 2);
    expect(full.groups.length).toBe(half.groups.length * 2);

    // A mirror reverses handedness. If the winding were not flipped back, the
    // mirrored half would render inside out — so check a triangle's geometric
    // normal still agrees with its stored vertex normal.
    const t = half.indices.length; // first mirrored triangle
    const ia = full.indices[t]!;
    const ib = full.indices[t + 1]!;
    const ic = full.indices[t + 2]!;
    const P = (i: number): V3 =>
      v3(full.positions[i * 3]!, full.positions[i * 3 + 1]!, full.positions[i * 3 + 2]!);
    const a = P(ia);
    const b = P(ib);
    const c = P(ic);
    const face = {
      x: (b.y - a.y) * (c.z - a.z) - (b.z - a.z) * (c.y - a.y),
      y: (b.z - a.z) * (c.x - a.x) - (b.x - a.x) * (c.z - a.z),
      z: (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x),
    };
    const stored = v3(full.normals[ia * 3]!, full.normals[ia * 3 + 1]!, full.normals[ia * 3 + 2]!);
    expect(dot(face, stored)).toBeGreaterThan(0);
  });

  it('a curved panel is smooth in the middle, not faceted', () => {
    // A quarter-cylinder: the surface has real curvature, so if the welding or
    // the normals were wrong this is where it would show as banding.
    const arc = (x: number) =>
      interpolate([v3(x, 0, 500), v3(x, 354, 354), v3(x, 500, 0)]);
    const spec: NetworkSpec = {
      density: 10,
      curves: [
        { id: 'front', curve: arc(0), label: 'front' },
        { id: 'back', curve: arc(1000), label: 'back' },
        { id: 'top', curve: bspline([v3(0, 0, 500), v3(1000, 0, 500)]), label: 'top' },
        { id: 'bottom', curve: bspline([v3(0, 500, 0), v3(1000, 500, 0)]), label: 'bottom' },
      ],
      panels: [
        {
          id: 'skin',
          label: 'skin',
          boundary: ['top', 'back', 'bottom', 'front'],
          reversed: [false, false, true, true],
        },
      ],
    };
    const mesh = buildNetwork(spec);
    const N = 10;
    const nrm = (i: number, j: number): V3 => {
      const k = j * (N + 1) + i;
      return v3(mesh.normals[k * 3]!, mesh.normals[k * 3 + 1]!, mesh.normals[k * 3 + 2]!);
    };

    // Along a row the cylinder does not change, so the normal must not either.
    // Interior columns only: the two open ends of the panel have half the
    // incident triangles, so area weighting tilts them by a degree or so. That
    // is the correct behaviour for a free edge and it disappears the moment
    // another panel welds to it.
    for (let j = 0; j <= N; j += 1) {
      for (let i = 2; i < N - 1; i += 1) {
        expect(dot(nrm(i, j), nrm(1, j))).toBeGreaterThan(0.99999);
      }
    }

    // Across rows the normal turns through the arc. How fast is a property of
    // the curve, not of the tessellation — an interpolating natural cubic has
    // zero curvature at its ends by construction, so it genuinely turns slowly
    // there and quickly in the middle. Measured: 1.1° 3.3° 5.9° 9.2° 12.2°
    // and back down. Asserting a per-step angle would be asserting the
    // curve's shape; what belongs here is that the tessellation adds nothing
    // of its own. A tear is a spike.
    const steps: number[] = [];
    const mid = Math.floor(N / 2);
    for (let j = 1; j <= N; j += 1) steps.push(Math.acos(Math.min(1, dot(nrm(mid, j), nrm(mid, j - 1)))));
    const total = steps.reduce((a, b) => a + b, 0);
    const mean = total / steps.length;
    expect(Math.max(...steps)).toBeLessThan(mean * 3);

    // The fixture is symmetric about its middle, so the turning profile has to
    // be too. Anything that broke the sampling would break this first.
    for (let k = 0; k < steps.length / 2; k += 1) {
      expect(steps[k]!).toBeCloseTo(steps[steps.length - 1 - k]!, 6);
    }

    // And the panel really is curved — this is not a flat sheet passing by
    // accident.
    expect(total).toBeGreaterThan((55 * Math.PI) / 180);
  });
});
