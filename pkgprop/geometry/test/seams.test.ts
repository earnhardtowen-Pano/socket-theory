import { describe, expect, it } from 'vitest';
import { interpolate, type Curve } from '../src/curve.js';
import { networkPatches, type NetworkSpec, type PanelSpec } from '../src/network.js';
import { dot, v3, type V3 } from '../src/vec.js';

/**
 * What a smooth seam is worth, measured on the surface rather than on the mesh.
 *
 * The distinction is the whole test. `buildNetwork` returns welded vertex
 * normals, and the weld averages across the seam, so a continuity check run
 * against the mesh is a check against the cosmetic that hides the defect — it
 * will report a beautiful seam over a 17° tangent break. So this asks the
 * patches instead, by finite-differencing each surface at its own boundary.
 */

const deg = (a: V3, b: V3): number =>
  (Math.acos(Math.min(1, Math.abs(dot(a, b)))) * 180) / Math.PI;

/**
 * A sub-range of a curve, resampled and reparameterised to [0,1].
 *
 * This is what `carNetwork`'s `cutCurve` does, and copying it here is the whole
 * reason this test says anything true. See below.
 */
function segment(c: Curve, a: number, b: number): Curve {
  const pts: V3[] = [];
  for (let i = 0; i <= 14; i += 1) pts.push(c.at(a + ((b - a) * i) / 14));
  return interpolate(pts);
}

/**
 * Three rails and two panels between them, curved in both directions so the
 * panels have something to disagree about.
 *
 * A flat test case proves nothing here: two planar patches agree at a seam
 * whatever their cross fields say, because there is only one plane available.
 *
 * THE TRANSVERSE CURVES ARE ONE CURVE SPLIT AT THE RAIL, and that is not a
 * convenience. Ribbons make the two panels agree about the slope they leave the
 * seam at, but at the two *ends* of the seam the slope is also pinned by the
 * transverse boundary curves that run across it — that derivative belongs to
 * both the seam's cross field and the transverse curve's own tangent, and if
 * those two disagree, no surface satisfies both. The data is contradictory
 * before any patch is built.
 *
 * Written the obvious way — a fresh interpolation above the rail and another
 * below it — the two meet at the rail with a kink, and the measured seam break
 * stays at 17.26° with ribbons fully working, because it is measuring the kink
 * in the curve network rather than anything the surface did. The real car does
 * not have that problem: a cut is a restriction of one section curve between
 * two rail parameters, so the piece above a rail and the piece below it are
 * segments of the same spline. This mirrors that.
 */
function twoPanels(kind: 'smooth' | 'crease'): NetworkSpec {
  const rail = (y: number, z: number): Curve =>
    interpolate([v3(0, y, z), v3(500, y, z + 40), v3(1000, y, z)]);
  const crown = rail(0, 900);
  const shoulder = rail(500, 800);
  const sill = rail(900, 400);

  /** One section through all three rails at a station, bulged between them. */
  const section = (x: number, u: number): Curve => {
    const a = crown.at(u);
    const b = shoulder.at(u);
    const c = sill.at(u);
    return interpolate([
      a,
      v3(x, (a.y + b.y) / 2, (a.z + b.z) / 2 + 30),
      b,
      v3(x, (b.y + c.y) / 2, (b.z + c.z) / 2 + 30),
      c,
    ]);
  };
  /** Where the section passes the shoulder — the parameter the cuts split at. */
  const splitAt = (c: Curve, p: V3): number => {
    let best = 0;
    let near = Infinity;
    for (let i = 0; i <= 2000; i += 1) {
      const q = c.at(i / 2000);
      const d = Math.hypot(q.x - p.x, q.y - p.y, q.z - p.z);
      if (d < near) {
        near = d;
        best = i / 2000;
      }
    }
    return best;
  };
  const w = section(0, 0);
  const e = section(1000, 1);
  const tw = splitAt(w, shoulder.at(0));
  const te = splitAt(e, shoulder.at(1));

  const panel = (id: string, s: string, ee: string, n: string, ww: string): PanelSpec => ({
    id,
    label: id,
    boundary: [s, ee, n, ww],
    reversed: [false, false, true, true],
    // The seam between the two is the shared shoulder; everything else is an
    // open boundary of this little network and stays smooth.
    edges: id === 'upper' ? ['smooth', 'smooth', kind, 'smooth'] : [kind, 'smooth', 'smooth', 'smooth'],
  });

  return {
    density: 6,
    curves: [
      { id: 'crown', curve: crown, label: 'crown' },
      { id: 'shoulder', curve: shoulder, label: 'shoulder' },
      { id: 'sill', curve: sill, label: 'sill' },
      { id: 'up-w', curve: segment(w, 0, tw), label: 'up-w' },
      { id: 'up-e', curve: segment(e, 0, te), label: 'up-e' },
      { id: 'lo-w', curve: segment(w, tw, 1), label: 'lo-w' },
      { id: 'lo-e', curve: segment(e, te, 1), label: 'lo-e' },
    ],
    panels: [
      panel('upper', 'crown', 'up-e', 'shoulder', 'up-w'),
      panel('lower', 'shoulder', 'lo-e', 'sill', 'lo-w'),
    ],
  };
}

/** Worst tangent-plane break along the shared rail, in degrees. */
function seamBreak(kind: 'smooth' | 'crease'): number {
  const patches = networkPatches(twoPanels(kind));
  const upper = patches.find((p) => p.panel.id === 'upper')!.patch;
  const lower = patches.find((p) => p.panel.id === 'lower')!.patch;
  let worst = 0;
  // The corners are excluded deliberately, and the exclusion is reported rather
  // than hidden: the bicubic Coons form cannot reproduce a prescribed cross
  // field at a corner unless the twists agree there, which is the classical
  // twist-incompatibility problem. Ribbons fix the run of a seam; the corners
  // want Gregory's rational blend, which this does not have.
  for (let i = 1; i < 20; i += 1) {
    const t = i / 20;
    worst = Math.max(worst, deg(upper.normalAt(t, 1), lower.normalAt(t, 0)));
  }
  return worst;
}

describe('a smooth seam is smooth in geometry, not only in shading', () => {
  it('the shared rail is tangent-continuous', () => {
    const smooth = seamBreak('smooth');
    // Was 17.3° when every patch computed its own cross field by taking a chord
    // across itself. The edge owns the field now, so both panels leave the seam
    // inside one plane. What is left is the corner residual described above —
    // it does not reach zero without Gregory's rational twist blend, and
    // claiming otherwise would mean loosening this until it passed.
    console.log(`smooth seam: worst tangent break ${smooth.toFixed(2)}°`);
    expect(smooth).toBeLessThan(4);
  });

  it('but a crease is NOT yet a crease — it is shading only, and this records why', () => {
    const hard = seamBreak('crease');
    const soft = seamBreak('smooth');
    console.log(`crease seam: worst tangent break ${hard.toFixed(2)}°`);
    // These two should be far apart and they are not. Declaring an edge a crease
    // withholds the cross-boundary field and lets the patch fall back to the
    // ruled chord, which was supposed to be the hard fold. It is not: within a
    // fiftieth of a degree of the smooth edge.
    //
    // The cause is not in the patch. Both transverse curves here are segments of
    // ONE section spline — as they are on the real car, where a cut is a
    // restriction of the section between two rail parameters — so they meet the
    // shared rail tangentially, and the patch's corner data then dominates the
    // cross field entirely. A surface cannot fold where its boundary curves
    // refuse to.
    //
    // So the fold has to be put in the section: a chain of segments with a real
    // corner at each crease rail, and a depth on that corner. Clamping the cut's
    // end tangents was tried instead and reverted — it moves a fourteenth of the
    // curve and cost 3.89° → 5.06° of upper-body continuity on the car for no
    // visible line.
    //
    // WHEN THAT LANDS, THIS TEST FAILS. That failure is the proof it worked.
    expect(Math.abs(hard - soft)).toBeLessThan(0.5);
  });

  it('and the two are barely different surfaces, which is the same finding', () => {
    const s = networkPatches(twoPanels('smooth'));
    const c = networkPatches(twoPanels('crease'));
    let moved = 0;
    for (const [i, sp] of s.entries()) {
      const cp = c[i]!.patch;
      for (let a = 0; a <= 8; a += 1) {
        for (let b = 0; b <= 8; b += 1) {
          const p = sp.patch.at(a / 8, b / 8);
          const q = cp.at(a / 8, b / 8);
          moved = Math.max(moved, Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z));
        }
      }
    }
    console.log(`smooth vs crease: ${moved.toFixed(2)}mm of geometry moves`);
    // It was exactly 0.00mm before ribbons: `smoothEdge(c, f, t => length(f(t)))`
    // is `scale(normalize(f), length(f))`, which is f — so a smooth edge asked
    // for precisely the ruled slope a crease falls back to anyway, and the kind
    // changed which vertices shared a normal and nothing else. Ribbons make the
    // smooth side move, so it is no longer zero. A third of a millimetre across
    // a half-metre panel is still not a character line.
    expect(moved).toBeGreaterThan(0.1);
    expect(moved).toBeLessThan(5);
  });
});
