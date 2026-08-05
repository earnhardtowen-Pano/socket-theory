import { describe, expect, it } from 'vitest';
import { bspline, interpolate, type Curve } from '../src/curve.js';
import { buildNetwork, type NetworkSpec } from '../src/network.js';
import { coonsPatch, smoothEdge } from '../src/patch.js';
import { cross, dot, length, normalize, sub, v3, type V3 } from '../src/vec.js';

/**
 * What "smooth" currently buys, measured.
 *
 * These are characterization tests, not aspirations. They pin the behaviour
 * the network has *today* with a number on it, because that behaviour is worse
 * than its own vocabulary suggests and the gap is invisible unless someone
 * measures it.
 *
 * The claim in `network.ts` is that an edge is either smooth or a crease. The
 * reality is that both produce identical geometry, and the only difference is
 * which vertices are allowed into the same normal bucket. So a smooth seam is
 * smooth in shading and not in surface: the two panels agree on where the seam
 * is, exactly, but not on the slope at which they arrive.
 *
 * Both numbers below should MOVE when the cross field becomes edge-owned — one
 * shared normal field per edge, each side projecting its own transversal into
 * the perpendicular plane. When that lands, these tests fail, and that is the
 * signal that it worked. Update them then; do not delete them.
 */

/** Two patches sharing one rail, built exactly the way `buildNetwork` builds them. */
function sharedRailPair(): { lower: ReturnType<typeof coonsPatch>; upper: ReturnType<typeof coonsPatch>; shared: Curve } {
  const rail = (y: number, z: number): Curve =>
    interpolate([v3(0, y, z), v3(500, y, z + 40), v3(1000, y, z)]);
  const crown = rail(0, 900);
  const shoulder = rail(500, 800);
  const sill = rail(900, 400);

  // A cut with real bulge, so the panels have curvature to disagree about.
  const cut = (a: Curve, b: Curve, x: number, u: number): Curve => {
    const p = a.at(u);
    const q = b.at(u);
    return interpolate([p, v3(x, (p.y + q.y) / 2, (p.z + q.z) / 2 + 30), q]);
  };

  const patch = (south: Curve, north: Curve, west: Curve, east: Curve) => {
    const dv = (t: number): V3 => sub(north.at(t), south.at(t));
    const du = (t: number): V3 => sub(east.at(t), west.at(t));
    return coonsPatch({
      south: smoothEdge(south, dv, (t) => length(dv(t))),
      north: smoothEdge(north, dv, (t) => length(dv(t))),
      west: smoothEdge(west, du, (t) => length(du(t))),
      east: smoothEdge(east, du, (t) => length(du(t))),
    });
  };

  return {
    lower: patch(crown, shoulder, cut(crown, shoulder, 0, 0), cut(crown, shoulder, 1000, 1)),
    upper: patch(shoulder, sill, cut(shoulder, sill, 0, 0), cut(shoulder, sill, 1000, 1)),
    shared: shoulder,
  };
}

describe('continuity across a shared edge', () => {
  it('a smooth seam is watertight to floating point', () => {
    const { lower, upper } = sharedRailPair();
    for (let i = 0; i <= 20; i += 1) {
      const t = i / 20;
      // The lower patch's north edge and the upper patch's south edge are the
      // same curve object, so this is exact rather than close.
      expect(length(sub(lower.at(t, 1), upper.at(t, 0)))).toBeLessThan(1e-9);
    }
  });

  it('but the tangent planes still break across it — currently about 17 degrees', () => {
    const { lower, upper } = sharedRailPair();
    let worst = 0;
    for (let i = 1; i < 20; i += 1) {
      const t = i / 20;
      const a = lower.normalAt(t, 1);
      const b = upper.normalAt(t, 0);
      worst = Math.max(worst, (Math.acos(Math.min(1, Math.abs(dot(a, b)))) * 180) / Math.PI);
    }
    // THIS IS THE DEFECT, pinned. Each patch derives its cross-boundary field
    // from its own chord across itself, so two panels meeting at one curve want
    // different slopes there and nothing reconciles them. Seventeen degrees is
    // a crease you can see, on an edge the code calls smooth.
    expect(worst).toBeGreaterThan(15);
    expect(worst).toBeLessThan(20);
  });

  it('smooth and crease produce identical geometry — the kind only moves normals', () => {
    const line = (a: V3, b: V3): Curve => bspline([a, b]);
    const spec = (kind: 'smooth' | 'crease'): NetworkSpec => ({
      density: 6,
      curves: [
        { id: 'ridge', curve: line(v3(0, 0, 400), v3(1000, 0, 400)), label: 'ridge' },
        { id: 'wf', curve: line(v3(0, -500, 0), v3(1000, -500, 0)), label: 'west foot' },
        { id: 'ef', curve: line(v3(0, 500, 0), v3(1000, 500, 0)), label: 'east foot' },
        { id: 'a', curve: line(v3(0, -500, 0), v3(0, 0, 400)), label: 'a' },
        { id: 'b', curve: line(v3(1000, -500, 0), v3(1000, 0, 400)), label: 'b' },
        { id: 'c', curve: line(v3(0, 0, 400), v3(0, 500, 0)), label: 'c' },
        { id: 'd', curve: line(v3(1000, 0, 400), v3(1000, 500, 0)), label: 'd' },
      ],
      panels: [
        { id: 'w', label: 'w', boundary: ['wf', 'b', 'ridge', 'a'], reversed: [false, false, true, true], edges: ['smooth', 'smooth', kind, 'smooth'] },
        { id: 'e', label: 'e', boundary: ['ridge', 'd', 'ef', 'c'], reversed: [false, false, true, true], edges: [kind, 'smooth', 'smooth', 'smooth'] },
      ],
    });

    const soft = buildNetwork(spec('smooth'));
    const hard = buildNetwork(spec('crease'));
    expect(soft.positions.length).toBe(hard.positions.length);

    let dp = 0;
    let dn = 0;
    for (let i = 0; i < soft.positions.length; i += 1) {
      dp = Math.max(dp, Math.abs(soft.positions[i]! - hard.positions[i]!));
      dn = Math.max(dn, Math.abs(soft.normals[i]! - hard.normals[i]!));
    }
    // Not one micron of geometry moves. `smoothEdge(c, f, t => length(f(t)))`
    // is `scale(normalize(f), length(f))`, which is f — so a smooth edge asks
    // the patch for exactly the ruled slope a crease falls back to anyway.
    expect(dp).toBe(0);
    // Only the shading differs, and only at the seam.
    expect(dn).toBeGreaterThan(0.1);
  });

  it('the shared normal a real fix would produce is available and well defined', () => {
    // Not a fix, a feasibility check: the average of the two surfaces' normals
    // along the seam, orthogonalised against the seam's own tangent, is stable
    // and non-degenerate the whole way along. That is the field both patches
    // would be given.
    const { lower, upper, shared } = sharedRailPair();
    for (let i = 1; i < 20; i += 1) {
      const t = i / 20;
      const mean = normalize(
        v3(
          lower.normalAt(t, 1).x + upper.normalAt(t, 0).x,
          lower.normalAt(t, 1).y + upper.normalAt(t, 0).y,
          lower.normalAt(t, 1).z + upper.normalAt(t, 0).z,
        ),
      );
      const tangent = shared.tangentAt(t);
      const across = normalize(cross(mean, tangent));
      expect(length(mean)).toBeCloseTo(1, 6);
      expect(length(across)).toBeCloseTo(1, 6);
      // Perpendicular to the seam, which is what makes it a usable cross field.
      expect(Math.abs(dot(across, tangent))).toBeLessThan(1e-6);
    }
  });
});
