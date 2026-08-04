import type { SolveResult } from '@pkgprop/core';
import { buildCar, interpolate, v3, type CarBuild, type CarInput, type Displace } from '@pkgprop/geometry';
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
import type { Feature, FeatureMap } from './features.js';

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
 * A sampled (x, value) table turned into a smooth lookup. Piecewise-linear
 * would put a slope discontinuity at every drawn point, and a slope
 * discontinuity in a rail is a crease across the car once it is lit.
 */
function tableOf(pairs: readonly { x: number; v: number }[]): (x: number) => number {
  const sorted = [...pairs].sort((a, b) => a.x - b.x);
  const pts: { x: number; v: number }[] = [];
  for (const p of sorted) {
    const prev = pts[pts.length - 1];
    if (prev && Math.abs(p.x - prev.x) < 1) pts[pts.length - 1] = { x: prev.x, v: (prev.v + p.v) / 2 };
    else pts.push(p);
  }
  if (pts.length === 0) return () => 0;
  const first = pts[0]!;
  const last = pts[pts.length - 1]!;
  if (pts.length < 3) {
    return (x) => {
      if (x <= first.x) return first.v;
      if (x >= last.x) return last.v;
      const span = last.x - first.x;
      return first.v + (last.v - first.v) * (span > 0 ? (x - first.x) / span : 0);
    };
  }
  const curve = interpolate(pts.map((p) => v3(p.x, p.v, 0)));
  const GRID = 240;
  const grid: number[] = [];
  const samples = curve.sample(GRID * 2);
  for (let i = 0; i <= GRID; i += 1) {
    const x = first.x + ((last.x - first.x) * i) / GRID;
    let best = samples[0]!;
    for (const s of samples) if (Math.abs(s.x - x) < Math.abs(best.x - x)) best = s;
    grid.push(best.y);
  }
  return (x: number): number => {
    if (x <= first.x) return grid[0]!;
    if (x >= last.x) return grid[GRID]!;
    const t = ((x - first.x) / (last.x - first.x)) * GRID;
    const i = Math.min(GRID - 1, Math.floor(t));
    return grid[i]! + (grid[i + 1]! - grid[i]!) * (t - i);
  };
}

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

export interface BodyBuild {
  readonly car: CarBuild;
  readonly input: CarInput;
  readonly wheels: readonly { x: number; y: number; radius: number; section: number }[];
  readonly groundZ: number;
}

/** Station spacing: dense enough for a continuous highlight, cheap to re-loft. */
const STATION_STEP = 60;

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

  const stations: number[] = [];
  for (let x = g.bumperX; x < g.tailX; x += STATION_STEP) stations.push(x);
  stations.push(g.tailX);
  for (const end of [g.bumperX, g.tailX]) {
    const dir = end === g.bumperX ? 1 : -1;
    for (const d of [12, 30, 60, 110, 180]) stations.push(end + dir * d);
  }

  const halfW = (x: number): number => Math.max(28, halfWidth(x));
  const rocker = (x: number): number => rockerZ(x);
  const displace = sculptOf(features, halfW, rocker, { x0: g.bumperX, x1: g.tailX });

  const input: CarInput = {
    stations,
    topZ: (x) => Math.max(rockerZ(x) + 1, topZ(x)),
    beltZ: (x) => beltZ(x),
    halfWidth: halfW,
    rockerZ: rocker,
    cabin,
    shape,
    ribPoints: 16,
    ...(displace ? { displace } : {}),
  };

  const sectionW = paramValue(result, 'tire_section_width', 245);
  const wheels = [0, g.wheelbase].flatMap((x) =>
    [1, -1].map((side) => ({
      x,
      y: (side * g.track) / 2,
      radius: g.tireRadius,
      section: sectionW,
    })),
  );

  return { car: buildCar(input), input, wheels, groundZ: 0 };
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
