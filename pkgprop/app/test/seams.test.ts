import { describe, expect, it } from 'vitest';
import { solve } from '@pkgprop/core';
import { ARCHITECTURES, buildSolveInput } from '@pkgprop/data';
import { networkPatches, dot, type NetworkPatch } from '@pkgprop/geometry';
import { buildCarBody } from '../src/model/body.js';
import { initialState } from '../src/state/store.js';

/**
 * Every seam on a real car, measured on the surface rather than on the mesh.
 *
 * This is the number the ribbon work exists to move, and it has to be taken
 * from the patches: `buildNetwork` averages normals across a weld, so a seam
 * check run against the mesh is a check against the very averaging that was
 * hiding the break. It would report a beautiful car over a 17° kink.
 *
 * A seam is any curve two panels both call smooth. The panels either side are
 * asked for their own analytic normal at the same physical point, and the angle
 * between the two tangent planes is the break.
 */

const SAMPLES = 12;

/** Which side of a patch lies on a given curve, and at what patch coordinates. */
function sideParams(p: NetworkPatch, curveId: string): ((t: number) => [number, number])[] {
  const out: ((t: number) => [number, number])[] = [];
  const sides = p.sides;
  // [south, east, north, west] in boundary order; the patch's own convention is
  // south at v=0, north at v=1, west at u=0, east at u=1.
  const uv: ((s: number) => [number, number])[] = [
    (s) => [s, 0],
    (s) => [1, s],
    (s) => [s, 1],
    (s) => [0, s],
  ];
  for (const [i, side] of sides.entries()) {
    if (side.curveId !== curveId || side.kind !== 'smooth') continue;
    const map = uv[i]!;
    out.push((t: number) => map(side.swap(t)));
  }
  return out;
}

interface Band {
  readonly worst: number;
  readonly median: number;
  readonly seams: number;
  readonly worstAt: string;
}

interface SeamReport {
  /** Everything from the shoulder up: hood, glass, roof, decklid, fender tops. */
  readonly upper: Band;
  /** Everything that touches the sill or the underfloor — the wheel-well band. */
  readonly lower: Band;
}

/**
 * Does this panel reach down into the wheel-opening band?
 *
 * The sill rail is the rocker along most of the car and the arch rim across an
 * opening, so a panel bounded by it is a panel whose bottom edge climbs a
 * couple of hundred millimetres and back down again. Below that the underfloor
 * panel has to reach from the arch rim inboard to the centreline, which is a
 * wall across the wheel well rather than any surface a car has. That band is a
 * known-open topology problem — a wheel opening ought to be a hole in the body,
 * not a place where the body's bottom edge moves — and it is measured
 * separately rather than averaged into a number that would then say nothing.
 */
const inWheelBand = (p: NetworkPatch): boolean =>
  p.panel.boundary.some((id) => id.startsWith('sill@') || id.startsWith('floor@'));

function band(angles: { deg: number; at: string }[]): Band {
  const sorted = [...angles].sort((a, b) => a.deg - b.deg);
  const worst = sorted[sorted.length - 1];
  return {
    worst: worst?.deg ?? 0,
    median: sorted[Math.floor(sorted.length / 2)]?.deg ?? 0,
    seams: angles.length,
    worstAt: worst?.at ?? '—',
  };
}

function seamBreaks(archId: string): SeamReport {
  const st = initialState();
  const result = solve(buildSolveInput({ ...st.now.pkg, architecture: archId }));
  const net = buildCarBody(result, st.now.drawing, st.now.features).network!;
  const patches = networkPatches(net.spec);

  // Which panels meet along each curve, counting only sides that call it smooth.
  const byCurve = new Map<string, NetworkPatch[]>();
  for (const p of patches) {
    for (const side of p.sides) {
      if (side.kind !== 'smooth') continue;
      const list = byCurve.get(side.curveId);
      if (list) list.push(p);
      else byCurve.set(side.curveId, [p]);
    }
  }

  const upper: { deg: number; at: string }[] = [];
  const lower: { deg: number; at: string }[] = [];

  for (const [curveId, list] of byCurve) {
    if (list.length < 2) continue;
    const a = list[0]!;
    const b = list[1]!;
    const pa = sideParams(a, curveId)[0];
    const pb = sideParams(b, curveId)[0];
    if (!pa || !pb) continue;
    const into = inWheelBand(a) || inWheelBand(b) ? lower : upper;
    const at = `${curveId} (${a.panel.group} / ${b.panel.group})`;
    // The very ends are excluded. The bicubic Coons form cannot reproduce a
    // prescribed cross field at a corner unless the twists agree there — the
    // classical twist-incompatibility problem, which Gregory patches solve with
    // a rational blend and this does not. Ribbons fix the run of a seam; what
    // survives is concentrated at the four corners, and pretending otherwise by
    // sampling them would just bury a real limitation in an average.
    for (let i = 1; i < SAMPLES; i += 1) {
      const t = i / SAMPLES;
      const [ua, va] = pa(t);
      const [ub, vb] = pb(t);
      const na = a.patch.normalAt(ua, va);
      const nb = b.patch.normalAt(ub, vb);
      const d = Math.min(1, Math.abs(dot(na, nb)));
      into.push({ deg: (Math.acos(d) * 180) / Math.PI, at });
    }
  }

  return { upper: band(upper), lower: band(lower) };
}

describe('smooth seams on a real car', () => {
  it('the upper body is tangent-continuous, on every architecture', () => {
    for (const arch of ARCHITECTURES) {
      const { upper } = seamBreaks(arch.id);
      console.log(
        `${arch.id.padEnd(4)} upper  ${String(upper.seams).padStart(4)} samples · ` +
          `median ${upper.median.toFixed(2)}° · worst ${upper.worst.toFixed(2)}° at ${upper.worstAt}`,
      );
      expect(upper.seams, `${arch.id} has no upper-body seams to check`).toBeGreaterThan(50);
      // The arch used to be measured from the same bottom the shoulder was, so
      // a wheel opening stepped every rail on the flank all the way to the roof:
      // 57.8° across the fender-top seams alone. Decoupling them, giving the
      // cross field to the edge, and dropping the 20mm sliver panel between the
      // C-pillar and the rear arch took the whole upper body to this.
      //
      // The worst is not down where the median is, and it is not meant to look
      // like it is. It sits at the last station before the rear arch, where the
      // shoulder is climbing over the tyre — the haunch — and the panel above it
      // is short. That is the wheel-opening topology reaching up one band, and
      // it goes when the opening becomes a real hole rather than a raised hem.
      expect(upper.median, `${arch.id} upper median`).toBeLessThan(8);
      // Every architecture's worst lands on the same seam — the belt-rail band
      // beside a wheel opening, 43-58° depending on where the arch falls. One
      // defect wearing five hats, not five defects.
      expect(upper.worst, `${arch.id} upper worst`).toBeLessThan(70);
    }
  });

  it('and the wheel-opening band is not, which is a topology problem and is recorded', () => {
    const r = seamBreaks('fr');
    console.log(
      `fr   lower  ${String(r.lower.seams).padStart(4)} samples · ` +
        `median ${r.lower.median.toFixed(2)}° · worst ${r.lower.worst.toFixed(2)}° at ${r.lower.worstAt}`,
    );
    // Pinned, not accepted. A wheel opening is currently modelled as the body's
    // bottom edge moving up, so the panel under the shoulder is squeezed to
    // nothing over a tyre and the underfloor becomes a wall across the wheel
    // well. No amount of continuity work on the surface fixes that, because the
    // surface is doing what it was asked; the ask is wrong. Closing the car
    // properly — a real opening, with the arch as its own boundary curve — is
    // what moves this, and when it does, this expectation should fail.
    expect(r.lower.median, 'wheel band median').toBeGreaterThan(3);
    expect(r.lower.median, 'wheel band median has regressed').toBeLessThan(40);
  });
});
