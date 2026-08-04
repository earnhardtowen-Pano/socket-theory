import {
  clampToEnvelope,
  type ConstraintMeta,
  type SolveResult,
} from '@pkgprop/core';

/**
 * The characteristic-line set — brief §3.2. The human draws the car on the
 * solver: each line is an editable spline whose control points live inside
 * the envelope. Points are stored as fractions of the live package frame,
 * so a drawn car survives a package change and the clamps re-apply
 * themselves — the seed contract, extended from sliders to curves.
 */

export type LineId =
  | 'rocker'
  | 'arch_front'
  | 'arch_rear'
  | 'hood'
  | 'glass'
  | 'roof'
  | 'backlight'
  | 'deck'
  | 'belt'
  | 'plan_side';

/** A control point as fractions of the live frame. */
export interface NormPt {
  readonly fx: number;
  readonly fz: number;
}

export interface DrawingState {
  /** Authored lines only; a missing entry renders its live default. */
  readonly lines: Partial<Record<LineId, readonly NormPt[]>>;
}

export interface LineDef {
  readonly id: LineId;
  readonly label: string;
  readonly view: 'side' | 'plan';
  /** Which walls clamp this line's points. */
  readonly clamp: 'envelope' | 'belt' | 'rocker' | 'plan';
  /** Side-view lane: fender lines run outboard of the centerline masses. */
  readonly lane?: 'center' | 'outboard';
}

export const LINE_DEFS: readonly LineDef[] = [
  { id: 'rocker', label: 'rocker', view: 'side', clamp: 'rocker' },
  { id: 'arch_front', label: 'front arch', view: 'side', clamp: 'envelope', lane: 'outboard' },
  { id: 'arch_rear', label: 'rear arch', view: 'side', clamp: 'envelope', lane: 'outboard' },
  { id: 'hood', label: 'hood', view: 'side', clamp: 'envelope', lane: 'center' },
  { id: 'glass', label: 'glass', view: 'side', clamp: 'envelope', lane: 'center' },
  { id: 'roof', label: 'roof', view: 'side', clamp: 'envelope', lane: 'center' },
  { id: 'backlight', label: 'backlight', view: 'side', clamp: 'envelope', lane: 'center' },
  { id: 'deck', label: 'deck', view: 'side', clamp: 'envelope', lane: 'center' },
  { id: 'belt', label: 'belt', view: 'side', clamp: 'belt' },
  { id: 'plan_side', label: 'body side (plan)', view: 'plan', clamp: 'plan' },
];

/** The live frame both views normalize into. */
export interface Frame {
  readonly xMin: number;
  readonly xMax: number;
  readonly zMax: number;
}

export function frameOf(result: SolveResult): Frame {
  return {
    xMin: result.geometry.bumperX,
    xMax: result.geometry.tailX,
    zMax: result.bounds.roof_z.upper?.value ?? result.geometry.roofZ,
  };
}

/** The plan view's frame: same station axis, half-width vertical scale. */
export function planFrameOf(result: SolveResult): Frame {
  const f = frameOf(result);
  return {
    ...f,
    zMax: (result.bounds.overall_width.upper?.value ?? result.geometry.overallWidth) / 2,
  };
}

/** The frame a given line's points normalize against. */
export function lineFrameOf(id: LineId, result: SolveResult): Frame {
  return id === 'plan_side' ? planFrameOf(result) : frameOf(result);
}

export function denorm(frame: Frame, p: NormPt): { x: number; z: number } {
  return {
    x: frame.xMin + p.fx * (frame.xMax - frame.xMin),
    z: p.fz * frame.zMax,
  };
}

export function norm(frame: Frame, x: number, z: number): NormPt {
  const w = frame.xMax - frame.xMin;
  return {
    fx: w > 0 ? (x - frame.xMin) / w : 0,
    fz: frame.zMax > 0 ? z / frame.zMax : 0,
  };
}

export interface ClampedPt {
  readonly x: number;
  readonly z: number;
  readonly touching: { side: 'floor' | 'ceiling'; constraint: ConstraintMeta } | null;
}

const TOUCH_TOL = 2; // mm — grazing distance that counts as contact

/** Clamp one denormalized point against this line's walls. */
export function clampLinePoint(
  def: LineDef,
  result: SolveResult,
  x: number,
  z: number,
): ClampedPt {
  switch (def.clamp) {
    case 'envelope': {
      const floor =
        def.lane === 'outboard' ? result.envelope.floorOutboard : result.envelope.floorCenter;
      const c = clampToEnvelope(floor, result.envelope.ceiling, x, z, TOUCH_TOL);
      return { x, z: c.z, touching: c.touching };
    }
    case 'plan': {
      const c = clampToEnvelope(result.plan.floor, result.plan.ceiling, x, z, TOUCH_TOL);
      return { x, z: c.z, touching: c.touching };
    }
    case 'belt': {
      const b = result.bounds.belt_z;
      return clampScalar(x, z, b.lower?.value, b.upper?.value, b.lower?.constraint, b.upper?.constraint);
    }
    case 'rocker': {
      const b = result.bounds.rocker_z;
      return clampScalar(x, z, b.lower?.value, b.upper?.value, b.lower?.constraint, b.upper?.constraint);
    }
  }
}

function clampScalar(
  x: number,
  z: number,
  lo: number | undefined,
  hi: number | undefined,
  loMeta: ConstraintMeta | undefined,
  hiMeta: ConstraintMeta | undefined,
): ClampedPt {
  let out = z;
  let touching: ClampedPt['touching'] = null;
  if (lo !== undefined && loMeta && out <= lo + TOUCH_TOL) {
    out = Math.max(out, lo);
    touching = { side: 'floor', constraint: loMeta };
  }
  if (hi !== undefined && hiMeta && out >= hi - TOUCH_TOL) {
    out = Math.min(out, hi);
    touching = { side: 'ceiling', constraint: hiMeta };
  }
  return { x, z: out, touching };
}

export function defaultLines(): DrawingState {
  return { lines: {} };
}

/** Read a parameter's effective value out of the solve, by id. */
export function paramValue(result: SolveResult, id: string, fallback: number): number {
  return result.params.find((p) => p.id === id)?.effective ?? fallback;
}

/** Where the backlight meets the deck — the roof/deck handoff station. */
function backlightX(result: SolveResult): number {
  const g = result.geometry;
  const last = g.occupants[g.occupants.length - 1];
  const aft = paramValue(result, 'glass_backlight_aft_of_last_hip', 650);
  const x = (last?.hpoint.x ?? g.wheelbase) + aft;
  return Math.min(x, g.tailX - 200);
}

/**
 * Live default for a line with no authored points: a recognizable,
 * package-true car appears before the first drag. Derived from the solved
 * hard points, in frame fractions.
 */
export function defaultPoints(id: LineId, result: SolveResult): NormPt[] {
  const g = result.geometry;
  const f = lineFrameOf(id, result);
  const n = (x: number, z: number) => norm(f, x, z);
  const r = g.tireRadius;
  const jounce = paramValue(result, 'body_tire_jounce', 70);
  const arch = r + jounce + 25;
  const crown = r * 2 + jounce + 25;
  switch (id) {
    case 'rocker':
      return [n(arch * 0.95, g.rockerZ), n(g.wheelbase / 2, g.rockerZ), n(g.wheelbase - arch * 0.95, g.rockerZ)];
    case 'arch_front':
      return [n(-arch, g.rockerZ + 10), n(0, crown), n(arch, g.rockerZ + 10)];
    case 'arch_rear':
      return [n(g.wheelbase - arch, g.rockerZ + 10), n(g.wheelbase, crown), n(g.wheelbase + arch, g.rockerZ + 10)];
    case 'hood': {
      const noseZ = Math.max(g.hoodZ - 150, g.rockerZ + 60);
      const midX = -arch * 0.9;
      const ceil = result.envelope.ceiling.at(midX)?.z ?? g.hoodZ;
      const midZ = Math.min(g.hoodZ - 30, ceil - 18);
      return [n(g.bumperX + 30, noseZ), n(midX, midZ), n(g.cowl.x, g.cowl.z)];
    }
    case 'glass':
      return [
        n(g.cowl.x, g.cowl.z),
        n((g.cowl.x + g.header.x) / 2, (g.cowl.z + g.roofZ) / 2 + 25),
        n(g.header.x, g.roofZ),
      ];
    case 'roof': {
      const bl = backlightX(result);
      const roofEnd = Math.max(g.header.x + 220, Math.min(bl - 420, g.wheelbase - 180));
      const mid = (g.header.x + roofEnd) / 2;
      return [n(g.header.x, g.roofZ), n(mid, g.roofZ + 6), n(roofEnd, g.roofZ - 70)];
    }
    case 'backlight': {
      const bl = backlightX(result);
      const roofEnd = Math.max(g.header.x + 220, Math.min(bl - 420, g.wheelbase - 180));
      return [n(roofEnd, g.roofZ - 70), n(bl, g.deckZ + 20)];
    }
    case 'deck': {
      const bl = backlightX(result);
      return [n(bl, g.deckZ + 25), n((bl + g.tailX) / 2, g.deckZ), n(g.tailX - 25, g.deckZ - 20)];
    }
    case 'belt':
      return [
        n(g.cowl.x - 40, g.beltZ),
        n((g.cowl.x + g.wheelbase) / 2, g.beltZ - 8),
        n(g.tailX - 140, g.beltZ + 18),
      ];
    case 'plan_side': {
      const halfW = g.overallWidth / 2;
      return [
        n(g.bumperX + 20, halfW * 0.62),
        n(0, halfW),
        n(g.wheelbase / 2, halfW * 0.94),
        n(g.wheelbase, halfW),
        n(g.tailX - 20, halfW * 0.7),
      ];
    }
  }
}

/** Authored points if present, else the live default. */
export function linePoints(id: LineId, drawing: DrawingState, result: SolveResult): readonly NormPt[] {
  return drawing.lines[id] ?? defaultPoints(id, result);
}

/** Catmull-Rom through the clamped points, as an SVG path in view space. */
export function smoothPath(pts: readonly { x: number; y: number }[]): string {
  if (pts.length < 2) return '';
  const p = (i: number) => pts[Math.max(0, Math.min(pts.length - 1, i))]!;
  let d = `M ${p(0).x.toFixed(1)} ${p(0).y.toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i += 1) {
    const p0 = p(i - 1);
    const p1 = p(i);
    const p2 = p(i + 1);
    const p3 = p(i + 2);
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${c1x.toFixed(1)} ${c1y.toFixed(1)}, ${c2x.toFixed(1)} ${c2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  }
  return d;
}

/**
 * Points welded to solver hard points: the cowl ends of hood and glass sit
 * where the sight ceiling meets the glass-tangency floor — zero freedom.
 * They render as hard-point markers, not controls.
 */
export function isBoundPoint(id: LineId, index: number, count: number): boolean {
  if (id === 'hood') return index === count - 1;
  if (id === 'glass') return index === 0;
  return false;
}
