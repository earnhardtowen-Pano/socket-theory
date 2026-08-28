/**
 * What radius did the body actually come out with?
 *
 * `blend.ts` derives the band a requested radius needs and defends the
 * derivation twice — the tight bump and the panel-wide one land on the same
 * expression from different centuries of surfacing. That is still a
 * derivation. This sections the BUILT surface across the seam, fits a circle to
 * the points the way a designer would put a template on a clay, and reports
 * asked against achieved.
 *
 * WHY A SECTION AND NOT THE ANALYTIC CURVATURE. Because the analytic curvature
 * is computed from the same partials the field was built from, so it would
 * agree with the ask by construction and prove nothing. A circle fitted to
 * points that came out of `boundaryCoonsPoint` is downstream of every
 * approximation in the chain — the corner window, the polynomial fit of the
 * field, the mix, the amplitude clamp — and it disagrees when any of them is
 * wrong. It found the amplitude clamp reading twice its share on the first run.
 *
 * THREE NUMBERS PER EDGE, and the second and third are the ones to argue with.
 *
 *   RADIUS — THE TIGHTEST ONE ALONG THE SECTION, which is what a number on a
 *   drawing means and what a radius gauge finds. The first version fitted ONE
 *   circle across the whole band and read 2.25 times the ask, every time, at
 *   every band and every radius. The constant ratio was the clue: nothing was
 *   wrong with the blend, the measurement was answering a different question.
 *   A blend is not an arc spliced into a hole — its curvature rises from zero
 *   at the seam to a peak a quarter of the way into the band and falls back to
 *   zero — so a circle fitted over the whole of it reports an average that
 *   depends on how wide you chose to section. The minimum radius does not.
 *   Both owners are read in one plane, because a section is one curve crossing
 *   a seam and not two curves meeting at it.
 *
 *   RESIDUAL BREAK. The angle still standing between the two surface normals
 *   at the curve. Zero is a rounding; anything else is a crease WITH a rounding
 *   on it, which is what a tight ask past the band floor buys. Reported rather
 *   than assumed zero, because "G1 by construction" is a claim about a field at
 *   full amplitude and a softened edge is not always at full amplitude.
 *
 *   ROLLING-BALL OFFSET. How far this surface sits from the fillet it stands
 *   in for. The edge is pinned to the shared curve and a rolling ball cuts the
 *   corner off, so the two differ by the arc's sagitta and always will. It is
 *   the price of a watertight body and it belongs in the report, not in a
 *   footnote.
 */

import type { Id, QuiltSpec } from "@car/schema";
import { cross3, dot3, len3, natan2, nhypot2, nsqrt, scale3, sub3 } from "@car/num";
import type { Pt3 } from "@car/schema";
import {
  quiltAdjacency, sideParamOf, uvOnSide, type QuiltAdjacency,
} from "./adjacency.js";
import {
  boundaryCoonsNormal, boundaryCoonsPoint, boundaryCoonsPartials,
} from "./coons.js";
import { cellBoundary } from "./boundary.js";
import { fieldFromAdjacency, type CrossField } from "./tangent-field.js";
import { radiusAt, rollingBallOffset } from "./blend.js";

export interface BlendReading {
  readonly curveId: Id;
  readonly cellA: Id;
  readonly cellB: Id;
  /** Curve parameter of this station. */
  readonly t: number;
  /** Radius the author asked for here, mm. */
  readonly asked: number;
  /** Radius a circle fitted to the section actually found, mm. Infinity where
   *  the section came out straight — a line that has died. */
  readonly achieved: number;
  /** Angle still standing between the two normals at the curve, degrees. */
  readonly residualDeg: number;
  /**
   * The break BEFORE the blend, degrees — read off the unfielded patches.
   *
   * The number that says whether there is a line here at all. A feature line
   * whose two surfaces have drifted into one plane has nothing to round, and a
   * radius asked for there comes out enormous and correctly so; without this
   * the report cannot tell a line that died from a blend that failed, and on
   * the McLaren it called the first one an 18238% error.
   */
  readonly naturalDeg: number;
  /** How far this stands from a rolling ball of the achieved radius, mm. */
  readonly offset: number;
  /** Spread of the local radii along the section, mm — how far it is from
   *  being one arc. A blend is a rounding, not an arc, so this is never zero. */
  readonly fitRms: number;
}

export interface BlendReport {
  readonly edges: number;
  readonly stations: number;
  readonly readings: readonly BlendReading[];
  /** Median |achieved − asked| / asked, over LIVE stations only. */
  readonly medianRelative: number;
  /** Worst of the same. */
  readonly worstRelative: number;
  /** Stations whose break is too small to be a line — the run-outs. */
  readonly washedOut: number;
  /** Stations with a break worth rounding. */
  readonly live: number;
  /** Worst residual, and the curve it is on. */
  readonly worstResidualAt: Id | null;
  /** Worst residual break left standing at a softened curve, degrees. */
  readonly worstResidualDeg: number;
  /** Worst rolling-ball offset, mm, and where. */
  readonly worstOffset: number;
  readonly worstOffsetAt: Pt3;
}

export interface BlendProbeOptions {
  readonly adjacency?: QuiltAdjacency;
  readonly cross?: CrossField;
  /** Stations along each softened curve. */
  readonly stations?: number;
  /** Points per side of the seam in the fitted section. */
  readonly samples?: number;
  /** How far past the band to sample, as a multiple of it. */
  readonly reach?: number;
  /** Below this break there is no line to round, degrees. */
  readonly minBreakDeg?: number;
}

/**
 * Circumradius of three 2-D points — the radius of the arc through them.
 *
 * Positions only, so it is downstream of every approximation in the chain
 * rather than sharing arithmetic with any of them. Collinear points give
 * Infinity, which is the right answer: a straight section has no radius and a
 * feature line that has died is straight.
 */
function circumradius(
  a: readonly [number, number], b: readonly [number, number], c: readonly [number, number],
): number {
  const ab = nhypot2(b[0] - a[0], b[1] - a[1]);
  const bc = nhypot2(c[0] - b[0], c[1] - b[1]);
  const ca = nhypot2(a[0] - c[0], a[1] - c[1]);
  const twiceArea = Math.abs(
    (b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1]),
  );
  if (twiceArea < 1e-15) return Infinity;
  return (ab * bc * ca) / (2 * twiceArea);
}

/**
 * The tightest radius anywhere along a sampled section, and its RMS departure
 * from a single circle over the same points.
 *
 * A WIDE STENCIL, not consecutive triples. Three neighbouring samples on a
 * nearly flat stretch subtend an area that is mostly rounding error, and the
 * circumradius of three nearly collinear points is numerically hopeless. Every
 * third sample gives the same curve a real triangle to work with.
 */
function sectionRadius(pts: readonly (readonly [number, number])[]): { r: number; rms: number } {
  const n = pts.length;
  if (n < 7) return { r: Infinity, rms: 0 };
  // ONE SAMPLE EITHER SIDE, and the first version used a twelfth of the
  // section. A circumradius over a wide stencil averages the curvature it
  // spans, and a blend's curvature RISES from zero at the seam to a peak and
  // falls again — so a wide stencil straddling the peak reads it low and the
  // probe reported every radius 11% larger than the surface has. Worse, the
  // stencil was a FRACTION of the sample count, so refining the sampling did
  // not refine the answer: it converged, beautifully, on the wrong number.
  const step = 1;
  let best = Infinity;
  const radii: number[] = [];
  for (let i = step; i + step < n; i++) {
    const r = circumradius(pts[i - step]!, pts[i]!, pts[i + step]!);
    if (Number.isFinite(r)) radii.push(r);
    if (r < best) best = r;
  }
  if (radii.length === 0) return { r: Infinity, rms: 0 };
  // How far the section is from being ONE arc: the spread of the local radii
  // relative to the tightest. A true fillet reads near zero; a blend reads
  // large, and should, because it is a rounding rather than an arc.
  const mean = radii.reduce((a, b) => a + b, 0) / radii.length;
  const varr = radii.reduce((a, b) => a + (b - mean) * (b - mean), 0) / radii.length;
  return { r: best, rms: nsqrt(varr) };
}

/** Section the built surface across one softened seam and measure it. */
export function blendProbe(quilt: QuiltSpec, opts: BlendProbeOptions = {}): BlendReport {
  const adj = opts.adjacency ?? quiltAdjacency(quilt);
  const cross = opts.cross ?? fieldFromAdjacency(adj);
  const nStations = Math.max(1, opts.stations ?? 7);
  const nSamples = Math.max(8, opts.samples ?? 24);
  const reach = opts.reach ?? 1.25;
  const minBreakDeg = opts.minBreakDeg ?? 0.5;
  // The UNFIELDED boundaries, kept beside the corrected ones: the break before
  // the blend is what says whether there was a line here to round.
  const bare = new Map<Id, ReturnType<typeof cellBoundary>>();
  const bareOf = (cellId: Id) => {
    const hit = bare.get(cellId);
    if (hit) return hit;
    const cell = quilt.cells.find((c) => c.id === cellId);
    if (!cell) return null;
    const b = cellBoundary(cell, quilt);
    bare.set(cellId, b);
    return b;
  };
  const angle = (nA: Pt3, nB: Pt3): number =>
    (natan2(len3(cross3(nA, nB)), dot3(nA, nB)) * 180) / Math.PI;

  const withField = new Map<Id, ReturnType<typeof cellBoundary>>();
  const boundaryOf = (cellId: Id) => {
    const hit = withField.get(cellId);
    if (hit) return hit;
    const cell = quilt.cells.find((c) => c.id === cellId);
    if (!cell) return null;
    const b = cellBoundary(cell, quilt, cross);
    withField.set(cellId, b);
    return b;
  };

  const readings: BlendReading[] = [];
  let worstOffset = 0;
  let worstOffsetAt: Pt3 = [0, 0, 0];
  let edges = 0;

  for (const e of adj.edges) {
    const spec = quilt.softening.get(e.curveId);
    if (!spec) continue;
    const bA = boundaryOf(e.a.cellId);
    const bB = boundaryOf(e.b.cellId);
    if (!bA || !bB) continue;
    edges++;
    const bandA = cross.band(e.a.cellId, e.a.k);
    const bandB = cross.band(e.b.cellId, e.b.k);
    const chain = quilt.curves.get(e.curveId);
    if (!chain) continue;

    for (let m = 1; m <= nStations; m++) {
      const t = e.lo + ((e.hi - e.lo) * m) / (nStations + 1);
      const sA = sideParamOf(bA.sides[e.a.k]!, t);
      const sB = sideParamOf(bB.sides[e.b.k]!, t);
      if (sA < 0 || sA > 1 || sB < 0 || sB > 1) continue;
      const [ua, va] = uvOnSide(e.a.k, sA);
      const [ub, vb] = uvOnSide(e.b.k, sB);

      // The section plane: perpendicular to the curve at this station. Both
      // owners are read in it, so the fitted circle crosses the seam rather
      // than stopping at it.
      const P0 = boundaryCoonsPoint(bA, ua, va);
      const pa = boundaryCoonsPartials(bA, ua, va);
      const tanC = e.a.k === 0 || e.a.k === 2 ? pa.su : pa.sv;
      const tl = len3(tanC);
      if (tl < 1e-12) continue;
      const tHat = scale3(tanC, 1 / tl);
      const nA = boundaryCoonsNormal(bA, ua, va);
      const nB = boundaryCoonsNormal(bB, ub, vb);
      const residualDeg = angle(nA, nB);
      const rawA = bareOf(e.a.cellId), rawB = bareOf(e.b.cellId);
      const naturalDeg = rawA && rawB
        ? angle(boundaryCoonsNormal(rawA, ua, va), boundaryCoonsNormal(rawB, ub, vb))
        : residualDeg;
      // In-plane axes: the shared normal, and the direction across the seam.
      const zHat = len3(nA) > 1e-12 ? scale3(nA, 1 / len3(nA)) : [0, 0, 1] as Pt3;
      const xRaw = cross3(zHat, tHat);
      const xl = len3(xRaw);
      if (xl < 1e-12) continue;
      const xHat = scale3(xRaw, 1 / xl);
      const proj = (p: Pt3): [number, number] => {
        const d = sub3(p, P0);
        return [dot3(d, xHat), dot3(d, zHat)];
      };

      // One section, walked from deep inside owner B, across the seam, and
      // out into owner A — so the point at the seam has neighbours on both
      // sides and the curvature there is a real reading rather than an
      // extrapolation off the end of a sample list.
      const pts: [number, number][] = [];
      const walk = (
        b: ReturnType<typeof cellBoundary>, k: number, s: number, band: number,
        outward: boolean,
      ): void => {
        const span = Math.min(0.98, Math.max(1e-4, band * reach));
        for (let i = 0; i <= nSamples; i++) {
          const f = outward ? i / nSamples : 1 - i / nSamples;
          const [u, v] = uvInward(k, s, span * f);
          pts.push(proj(boundaryCoonsPoint(b, u, v)));
        }
      };
      walk(bB, e.b.k, sB, bandB > 0 ? bandB : 0.3, false);
      walk(bA, e.a.k, sA, bandA > 0 ? bandA : 0.3, true);

      const { r, rms } = sectionRadius(pts);
      const asked = radiusAt(spec, t);
      const phi = (residualDeg * Math.PI) / 180;
      const offset = rollingBallOffset(Number.isFinite(r) ? r : 0, Math.max(phi, 1e-6));
      // A dead stretch has no ball to roll: a fitted radius orders past the
      // ask multiplied by any residual angle is an astronomical offset that
      // describes the arithmetic, not the corner. Same 50x line as below.
      const dead = asked > 0 && Number.isFinite(r) && r > 50 * asked;
      if (!dead && offset > worstOffset) { worstOffset = offset; worstOffsetAt = P0; }
      readings.push({
        curveId: e.curveId, cellA: e.a.cellId, cellB: e.b.cellId,
        t, asked, achieved: r, residualDeg, naturalDeg, offset, fitRms: rms,
      });
    }
  }

  const rel: number[] = [];
  let worstResidualDeg = 0;
  let worstResidualAt: Id | null = null;
  let washedOut = 0, live = 0;
  for (const rd of readings) {
    if (rd.residualDeg > worstResidualDeg) {
      worstResidualDeg = rd.residualDeg;
      worstResidualAt = rd.curveId;
    }
    if (rd.naturalDeg < minBreakDeg) { washedOut++; continue; }
    // The radius-domain twin of the angle test above. A stretch can hold half
    // a degree of break while its section has already gone flat — the fitted
    // radius comes back three or four ORDERS past the ask, which is not a
    // blend missing its number, it is no blend at all. Feeding it to
    // `worstRelative` printed "10426796545656% worst" in a report whose whole
    // point is that its numbers mean things. Fifty times the ask is the line:
    // past it the feature has died, and it is counted with the dead.
    if (rd.asked > 0 && Number.isFinite(rd.achieved) && rd.achieved > 50 * rd.asked) {
      washedOut++;
      continue;
    }
    live++;
    if (rd.asked > 0 && Number.isFinite(rd.achieved)) {
      rel.push(Math.abs(rd.achieved - rd.asked) / rd.asked);
    }
  }
  rel.sort((a, b) => a - b);
  return {
    edges,
    stations: readings.length,
    readings,
    medianRelative: rel.length === 0 ? 0 : rel[Math.floor(rel.length / 2)]!,
    worstRelative: rel.length === 0 ? 0 : rel[rel.length - 1]!,
    washedOut,
    live,
    worstResidualDeg,
    worstResidualAt,
    worstOffset,
    worstOffsetAt,
  };
}

/** (u,v) a distance ξ INWARD from side k at loop parameter s. */
function uvInward(k: number, s: number, xi: number): [number, number] {
  if (k === 0) return [s, xi];
  if (k === 1) return [1 - xi, s];
  if (k === 2) return [1 - s, 1 - xi];
  return [xi, 1 - s];
}
