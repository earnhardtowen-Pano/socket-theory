import type { SolveResult } from '@pkgprop/core';
import {
  buildCar,
  scalarSpline,
  type CarBuild,
  type CarInput,
  type Displace,
} from '@pkgprop/geometry';
import {
  clampLinePoint,
  denorm,
  LINE_DEFS,
  lineFrameOf,
  linePoints,
  paramValue,
  type DrawingState,
  type LineId,
} from '../state/lines.js';
import { generateFeature, type Feature, type FeatureMap } from './features.js';
import { buildCarNetwork, networkInputFrom, type CarNetwork } from './carNetwork.js';

/**
 * The drawn car, lofted — and sculpted.
 *
 * The side lines say how tall, the plan line says how wide, the section says
 * what shape connects them, and the sculpt features — creases and cuts — are
 * composed into one displacement field evaluated at every surface point.
 * Nothing here invents geometry: every number traces to a line the human drew,
 * a wall the solver closed, or a parameter a feature declares.
 */

const SILHOUETTE: readonly LineId[] = ['hood', 'glass', 'roof', 'backlight', 'deck'];

/**
 * A rail: one drawn line turned into an exact, smooth function of station.
 *
 * This used to build a parametric curve through the points, sample it 480
 * times, and then — because a parametric curve cannot be asked "what is your
 * value at this x" without inverting it — walk those samples looking for the
 * nearest one by x, into a 240-cell grid it then interpolated linearly.
 *
 * That is where the ruffles came from. Every rail on the car went through it,
 * so `topZ`, `halfWidth`, `rockerZ` and `beltZ` were each a 240-segment
 * polyline whose vertices sat up to half a sample-spacing off the true curve.
 * Shading reads the first derivative, and 240 jittered slope breaks along the
 * length of a car is exactly the bunching you can see. The comment that used
 * to sit here claimed the function existed to avoid slope discontinuities; the
 * implementation manufactured two hundred and forty of them.
 *
 * Solved as a function of x rather than as a curve in space, the answer is
 * exact and C2 and there is nothing left to sample.
 */
const tableOf = scalarSpline;

function pointsOf(id: LineId, drawing: DrawingState, result: SolveResult): { x: number; z: number }[] {
  const def = LINE_DEFS.find((d) => d.id === id);
  if (!def) return [];
  const frame = lineFrameOf(id, result);
  return linePoints(id, drawing, result).map((p) => {
    const { x, z } = denorm(frame, p);
    const c = clampLinePoint(def, result, x, z);
    return { x: c.x, z: c.z };
  });
}

const smooth = (t: number): number => {
  const s = Math.min(1, Math.max(0, t));
  return s * s * (3 - 2 * s);
};

/** `Math.max` with the corner rounded off over `k` millimetres. */
const softMax = (a: number, b: number, k: number): number => {
  const hi = Math.max(a, b);
  const d = Math.abs(a - b);
  if (d >= k) return hi;
  const t = 1 - d / k;
  return hi + k * 0.25 * t * t;
};

/** How far the arch blends into the rocker where the two meet. */
const ARCH_BLEND = 70;

/**
 * The sculpt field: every crease and cut, composed in author order.
 *
 * A crease is a ridge (or valley) following the flank at an authored height.
 * A cut is a recessed patch with a rim — the professional stand-in for a
 * boolean, which ideation tools avoid because it wrecks the surface. Both act
 * on the half-section before mirroring, so symmetry is structural.
 */
function sculptOf(
  features: FeatureMap,
  halfWidth: (x: number) => number,
  rockerZ: (x: number) => number,
  span: { x0: number; x1: number },
): Displace | undefined {
  const creases = Object.values(features).filter((f) => f.kind === 'character-line');
  const cuts = Object.values(features).filter((f) => f.kind === 'body-cut');
  if (creases.length === 0 && cuts.length === 0) return undefined;

  return (x, y, z) => {
    let oy = y;
    const oz = z;
    const half = halfWidth(x);
    // Sculpting acts on the outboard face, not the crown or the underfloor.
    const onFlank = y > half * 0.45;

    if (onFlank) {
      for (const f of creases) {
        const lineZ = rockerZ(x) + (f.params.height ?? 300);
        const w = Math.max(20, f.params.width ?? 70);
        const d = f.params.depth ?? 6;
        const fade =
          smooth((x - span.x0 - 120) / 420) * smooth((span.x1 - 120 - x) / 420);
        const t = (z - lineZ) / w;
        oy += d * Math.exp(-t * t) * fade;
      }
      for (const f of cuts) {
        const cx = f.params.station ?? 0;
        const cz = f.params.height ?? 500;
        const hw = Math.max(40, f.params.width ?? 420) / 2;
        const hh = Math.max(30, f.params.tall ?? 180) / 2;
        const rim = Math.max(6, f.params.rim ?? 24);
        const depth = Math.max(0, f.params.depth ?? 30);
        const mx = smooth((hw - Math.abs(x - cx)) / rim);
        const mz = smooth((hh - Math.abs(z - cz)) / rim);
        oy -= depth * mx * mz;
      }
    }
    return { y: Math.max(0, oy), z: oz };
  };
}

/**
 * The wheel openings, as the body's lower edge.
 *
 * A wheel opening is a hole, and a displacement field cannot make a hole. But
 * it does not have to: an opening is exactly the statement that the bodyside
 * stops higher over the wheel than it does either side of it. Raise the
 * lower boundary of the loft along the arch profile and the opening is cut —
 * watertight, no CSG, and the arch you see in 3D is the same curve the side
 * view draws, because it is literally the same feature's geometry.
 */
function archTable(
  features: FeatureMap,
  result: SolveResult,
): ((x: number) => number) | null {
  const openings = Object.values(features).filter((f) => f.kind === 'wheel-opening');
  if (openings.length === 0) return null;

  // Each opening becomes a sampled upper envelope over its own x span. The
  // curve is authored as a superellipse walked left to right, so the highest
  // z near a station is the arch there.
  const spans: { x0: number; x1: number; at: (x: number) => number }[] = [];
  for (const f of openings) {
    const pts = generateFeature(f, result).curve;
    if (pts.length < 3) continue;
    let x0 = Infinity;
    let x1 = -Infinity;
    for (const p of pts) {
      x0 = Math.min(x0, p.x);
      x1 = Math.max(x1, p.x);
    }
    if (!(x1 > x0)) continue;
    const N = 96;
    const grid = new Array<number>(N + 1).fill(-Infinity);
    for (const p of pts) {
      const i = Math.round(((p.x - x0) / (x1 - x0)) * N);
      grid[i] = Math.max(grid[i] ?? -Infinity, p.z);
    }
    // The sampled curve does not land on every cell; carry the neighbours in
    // so the arch has no notches where a sample happened to miss.
    for (let i = 1; i <= N; i += 1) if (grid[i] === -Infinity) grid[i] = grid[i - 1]!;
    for (let i = N - 1; i >= 0; i -= 1) if (grid[i] === -Infinity) grid[i] = grid[i + 1]!;
    spans.push({
      x0,
      x1,
      at: (x: number): number => {
        const t = ((x - x0) / (x1 - x0)) * N;
        const i = Math.min(N - 1, Math.max(0, Math.floor(t)));
        return grid[i]! + (grid[i + 1]! - grid[i]!) * Math.min(1, Math.max(0, t - i));
      },
    });
  }
  if (spans.length === 0) return null;
  return (x: number): number => {
    let z = -Infinity;
    for (const s of spans) if (x >= s.x0 && x <= s.x1) z = Math.max(z, s.at(x));
    return z === -Infinity ? -Infinity : z;
  };
}

/** Samples across each panel. Panels are small, so this is per-panel, not per-car. */
const PANEL_DENSITY = 7;

export interface BodyBuild {
  readonly car: CarBuild;
  /** The panelled surface: named panels, real pillars, creases that hold. */
  readonly network: CarNetwork | null;
  readonly input: CarInput;
  readonly wheels: readonly { x: number; y: number; radius: number; section: number }[];
  readonly groundZ: number;
}

/** Station spacing: dense enough for a continuous highlight, cheap to re-loft. */
const STATION_STEP = 60;

/**
 * How far the nose and tail round off.
 *
 * This is corner radius, not extra length: the stations stop short by exactly
 * this much and the cap reaches the bumper, so overall length is untouched.
 */
const CAP_DEPTH = 95;

/**
 * Mesh resolution is not a taste setting. It is set by the tightest thing on
 * the car.
 *
 * A crease 70mm wide sampled every 137mm is not a crease, it is two lumps —
 * and 137mm is exactly what a sixteen-point rib gives across a half-section
 * arc of a couple of metres. So the sample count is derived from the narrowest
 * authored feature rather than picked, and a car with nothing sculpted on it
 * never pays for the density it does not need.
 */
const SAMPLES_ACROSS_FEATURE = 3.5;
/** Enough that the crown of a bare body does not facet under a stripe light. */
const RIB_BASE = 32;
/** Past here the triangles cost more than the fidelity is worth. */
const RIB_MAX = 128;

/** The narrowest transition anything on this car asks the surface to make. */
function tightestScale(features: FeatureMap): number | null {
  let tightest = Infinity;
  for (const f of Object.values(features)) {
    // A crease's softness and a cut's rim are the same quantity wearing two
    // names: how far the surface has to move to get in or out of the feature.
    if (f.kind === 'character-line') tightest = Math.min(tightest, Math.max(12, f.params.width ?? 70));
    if (f.kind === 'body-cut') tightest = Math.min(tightest, Math.max(4, f.params.rim ?? 24));
  }
  return Number.isFinite(tightest) ? tightest : null;
}

function ribCountFor(features: FeatureMap, rise: number, halfW: number): number {
  const tightest = tightestScale(features);
  if (tightest === null) return RIB_BASE;
  // Up the flank and out to the widest point, with slack for the curvature
  // the straight-line estimate misses.
  const arc = 1.25 * (rise + halfW);
  const wanted = Math.ceil((arc / tightest) * SAMPLES_ACROSS_FEATURE);
  return Math.min(RIB_MAX, Math.max(RIB_BASE, wanted));
}

export function buildCarBody(
  result: SolveResult,
  drawing: DrawingState,
  features: FeatureMap,
): BodyBuild {
  const g = result.geometry;

  const topPairs: { x: number; v: number }[] = [];
  for (const id of SILHOUETTE) {
    for (const p of pointsOf(id, drawing, result)) topPairs.push({ x: p.x, v: p.z });
  }
  const topZ = tableOf(topPairs);

  const planPairs = pointsOf('plan_side', drawing, result).map((p) => ({ x: p.x, v: Math.abs(p.z) }));
  const halfWidth = tableOf(planPairs);

  const rockerPairs = pointsOf('rocker', drawing, result).map((p) => ({ x: p.x, v: p.z }));
  const rockerZ = tableOf(rockerPairs);

  const beltPairs = pointsOf('belt', drawing, result).map((p) => ({ x: p.x, v: p.z }));
  const beltZ = tableOf(beltPairs);

  const section = features['section-body'];
  const shape = {
    crown: section?.params.crown ?? 0.42,
    shoulder: section?.params.shoulder ?? 0.64,
    tumblehome: section?.params.tumblehome ?? 0.3,
    glassInset: section?.params.glassInset ?? 0.5,
  };

  // The greenhouse runs cowl to backlight base — the glass span the drawn
  // silhouette already carries.
  const backlightPts = pointsOf('backlight', drawing, result);
  const cabinEnd = backlightPts[backlightPts.length - 1]?.x ?? g.wheelbase;
  const cabin = { x0: g.cowl.x, x1: Math.max(g.cowl.x + 300, cabinEnd) };

  // The nose and tail round off over CAP_DEPTH, and the cap is what reaches
  // the legal bumper and tail — so the ribs stop short by exactly that much.
  // Running them all the way out instead left the body closed by a flat
  // vertical face the width of the bumper.
  const x0 = g.bumperX + CAP_DEPTH;
  const x1 = g.tailX - CAP_DEPTH;
  const stations: number[] = [];
  for (let x = x0; x < x1; x += STATION_STEP) stations.push(x);
  stations.push(x1);
  for (const end of [x0, x1]) {
    const dir = end === x0 ? 1 : -1;
    for (const d of [14, 34, 64, 110, 180]) stations.push(end + dir * d);
  }

  // A cut's edge is a rim tens of millimetres wide and the station grid steps
  // straight over it, so the aperture arrives as a soft dent instead of an
  // opening. Refine along the car only where a cut actually has an edge — a
  // crease needs no help here because it runs lengthwise and only fades over
  // hundreds of millimetres at its ends.
  for (const f of Object.values(features)) {
    if (f.kind !== 'body-cut') continue;
    const cx = f.params.station ?? 0;
    const hw = Math.max(40, f.params.width ?? 420) / 2;
    const rim = Math.max(4, f.params.rim ?? 24);
    const step = Math.max(5, rim / 3);
    for (const edge of [cx - hw, cx + hw]) {
      for (let d = -rim * 1.5; d <= rim * 1.5; d += step) {
        const x = edge + d;
        if (x > x0 && x < x1) stations.push(x);
      }
    }
  }

  const halfW = (x: number): number => Math.max(28, halfWidth(x));
  // The rocker stays the flat datum a crease is measured from. The body's
  // lower edge is a different thing, and it climbs over the wheels.
  const rocker = (x: number): number => rockerZ(x);
  const displace = sculptOf(features, halfW, rocker, { x0: g.bumperX, x1: g.tailX });

  const arch = archTable(features, result);
  if (arch) {
    // The arch meets the rocker over a few tens of millimetres at each end,
    // and the 60mm grid walks straight past that corner. Put stations on it.
    for (const f of Object.values(features)) {
      if (f.kind !== 'wheel-opening') continue;
      const pts = generateFeature(f, result).curve;
      let x0 = Infinity;
      let x1 = -Infinity;
      for (const p of pts) {
        x0 = Math.min(x0, p.x);
        x1 = Math.max(x1, p.x);
      }
      if (!(x1 > x0)) continue;
      // The arch rim is the highest-curvature line on the whole car in plan;
      // it needs stations at a fraction of the base grid or it steps.
      for (let i = 0; i <= 48; i += 1) {
        const x = x0 + ((x1 - x0) * i) / 48;
        if (x > x0 && x < x1) stations.push(x);
      }
    }
  }

  const bodyTopAt = (x: number): number => Math.max(rockerZ(x) + 1, topZ(x));
  const sillZ = (x: number): number => {
    const floor = rocker(x);
    if (!arch) return floor;
    const a = arch(x);
    // The arch is authored, so the arch wins. Where an opening asks for more
    // room than the drawn hood leaves above it, the body rises over the wheel
    // rather than the opening being quietly shaved — which is what a real
    // fender does, and which keeps the arch in 3D identical to the arch in the
    // side view. Pull the opening radius back in and the bulge goes with it.
    // Blended, not maxed: the arch runs into the rocker at a shallow angle at
    // each end, and a hard max there leaves a kink you can see as a bright
    // line across the sill.
    return a === -Infinity ? floor : softMax(floor, a, ARCH_BLEND);
  };

  const sectionW = paramValue(result, 'tire_section_width', 245);
  // The wheel well's inner wall stands just inboard of the tire, not at some
  // fraction of the body — so it comes from the track and the section width,
  // both of which the solver already knows.
  const WELL_GAP = 40;
  const wellInner = Math.max(60, g.track / 2 - sectionW / 2 - WELL_GAP);
  const wellY = (x: number): number => Math.min(wellInner, halfW(x) * 0.9);

  const midX = (g.bumperX + g.tailX) / 2;
  const ribPoints = ribCountFor(features, Math.max(1, topZ(midX) - rockerZ(midX)), halfW(midX));

  const input: CarInput = {
    stations,
    topZ: bodyTopAt,
    beltZ: (x) => beltZ(x),
    halfWidth: halfW,
    sillZ,
    floorZ: rocker,
    wellY,
    cabin,
    shape,
    ribPoints,
    capDepth: CAP_DEPTH,
    ...(displace ? { displace } : {}),
  };

  const wheels = [0, g.wheelbase].flatMap((x) =>
    [1, -1].map((side) => ({
      x,
      y: (side * g.track) / 2,
      radius: g.tireRadius,
      section: sectionW,
    })),
  );

  // The panelled surface, built from the same rails and the same section the
  // loft uses — so the two are describing one car while the loft is still
  // here for SECTIONS and the golden geometry checks.
  const archSpans = Object.values(features)
    .filter((f) => f.kind === 'wheel-opening')
    .map((f) => {
      const pts = generateFeature(f, result).curve;
      let a = Infinity;
      let b = -Infinity;
      for (const p of pts) {
        a = Math.min(a, p.x);
        b = Math.max(b, p.x);
      }
      return { slot: f.slot, x0: a, x1: b };
    })
    .filter((s) => s.x1 > s.x0);

  let network: CarNetwork | null = null;
  try {
    network = buildCarNetwork(
      networkInputFrom(
        result,
        { topZ: bodyTopAt, beltZ, halfWidth: halfW, rockerZ: rocker },
        shape,
        cabin,
        arch,
        archSpans,
        PANEL_DENSITY,
      ),
    );
  } catch {
    // A topology that will not close is a bug worth seeing, but not one worth
    // taking the whole view down for — the loft still renders.
    network = null;
  }

  return { car: buildCar(input), input, wheels, groundZ: 0, network };
}

/** The sculpt and appendage parts on the car right now, for the 3D view. */
export function partsOf(features: FeatureMap): {
  wings: Feature[];
  splitters: Feature[];
} {
  const all = Object.values(features);
  return {
    wings: all.filter((f) => f.kind === 'wing'),
    splitters: all.filter((f) => f.kind === 'splitter'),
  };
}
