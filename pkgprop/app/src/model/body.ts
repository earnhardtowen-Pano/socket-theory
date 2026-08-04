import type { SolveResult } from '@pkgprop/core';
import { buildBody, interpolate, v3, type BodyInput, type Mesh, type SectionShape } from '@pkgprop/geometry';
import {
  clampLinePoint,
  denorm,
  LINE_DEFS,
  lineFrameOf,
  linePoints,
  type DrawingState,
  type LineId,
} from '../state/lines.js';
import type { FeatureMap } from './features.js';

/**
 * The drawn car, lofted.
 *
 * The side lines say how tall the body is at every station, the plan line says
 * how wide, and the section feature says what shape connects them. Put the
 * three together and there is a surface — which is the only way a render stops
 * looking like a cartoon, because a highlight bends with curvature and
 * curvature needs a real normal.
 *
 * Nothing here invents geometry. Every number traces back to a line the human
 * drew or a wall the solver closed.
 */

/** The side lines that make up the upper silhouette, nose to tail. */
const SILHOUETTE: readonly LineId[] = ['hood', 'glass', 'roof', 'backlight', 'deck'];

/**
 * A sampled (x, value) table turned into a smooth lookup.
 *
 * Piecewise-linear is the obvious choice and it is wrong here: every drawn
 * point becomes a slope discontinuity, and a slope discontinuity in the rail
 * is a crease running the width of the car once it is lofted and lit. The
 * curvature has to be continuous before the highlight can be.
 *
 * Duplicate stations are dropped — two lines meeting at a weld would otherwise
 * put two values at one x and send the interpolation vertical.
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
  // The curve is parameterised by chord length, not by x, so it is resampled
  // onto an even x grid once and read from there.
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

/** Every drawn point of a line, clamped, in millimetres. */
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

export interface BodyBuild {
  readonly mesh: Mesh;
  readonly input: BodyInput;
  /** Where the wheels sit, so the view can stand the car on them. */
  readonly wheels: readonly { x: number; y: number; radius: number; width: number }[];
  readonly groundZ: number;
}

/**
 * Station spacing for the loft.
 *
 * Close enough that the shoulder line reads as a continuous highlight rather
 * than a row of facets, coarse enough that a package change re-lofts inside a
 * frame. 60 mm on a 4-metre car is about seventy ribs.
 */
const STATION_STEP = 60;

export function buildCarBody(
  result: SolveResult,
  drawing: DrawingState,
  features: FeatureMap,
): BodyBuild {
  const g = result.geometry;

  // Upper silhouette: every point of every top line, welded into one table.
  const topPairs: { x: number; v: number }[] = [];
  for (const id of SILHOUETTE) {
    for (const p of pointsOf(id, drawing, result)) topPairs.push({ x: p.x, v: p.z });
  }
  const topZ = tableOf(topPairs);

  // Plan half-width. The plan line is authored as one half; the other is its
  // mirror, which is why nothing here doubles it.
  const planPairs = pointsOf('plan_side', drawing, result).map((p) => ({ x: p.x, v: Math.abs(p.z) }));
  const halfWidth = tableOf(planPairs);

  const rockerPairs = pointsOf('rocker', drawing, result).map((p) => ({ x: p.x, v: p.z }));
  const rockerZ = tableOf(rockerPairs);

  // The drawn beltline is where the body ends and the glass begins, so it is
  // where the section steps inboard.
  const beltPairs = pointsOf('belt', drawing, result).map((p) => ({ x: p.x, v: p.z }));
  const beltZ = tableOf(beltPairs);

  const section = features['section-body'];
  const shape: SectionShape = {
    crown: section?.params.crown ?? 0.42,
    shoulder: section?.params.shoulder ?? 0.64,
    tumblehome: section?.params.tumblehome ?? 0.3,
    glassInset: section?.params.glassInset ?? 0.5,
  };

  // Even spacing through the body, tightened at the ends where curvature is
  // highest and where a coarse rib leaves the cap visibly faceted.
  const stations: number[] = [];
  for (let x = g.bumperX; x < g.tailX; x += STATION_STEP) stations.push(x);
  stations.push(g.tailX);
  for (const end of [g.bumperX, g.tailX]) {
    const dir = end === g.bumperX ? 1 : -1;
    for (const d of [12, 30, 60, 110, 180]) stations.push(end + dir * d);
  }

  const input: BodyInput = {
    stations,
    // The nose and tail have to close, or the caps fan across a full-width
    // opening and the car ends in a flat wall. Tapering the last station's
    // width to a fraction gives the body somewhere to converge.
    topZ: (x) => Math.max(rockerZ(x) + 1, topZ(x)),
    // The plan line already carries the taper — it is drawn narrow at the
    // bumper, full through the body, narrow again at the tail. Applying a
    // second taper on top of it squeezed the whole car inward and left the
    // nose chopped off at a little over half width. The floor here only stops
    // a station from collapsing to nothing, which would degenerate the cap.
    halfWidth: (x) => Math.max(28, halfWidth(x)),
    rockerZ: (x) => rockerZ(x),
    beltZ: (x) => beltZ(x),
    shape,
    ribPoints: 16,
  };

  const track = g.track;
  const tireHalf = 0;
  const wheels = [0, g.wheelbase].flatMap((x) =>
    [1, -1].map((side) => ({
      x,
      y: (side * track) / 2,
      radius: g.tireRadius,
      width: tireHalf,
    })),
  );

  return { mesh: buildBody(input), input, wheels, groundZ: 0 };
}
