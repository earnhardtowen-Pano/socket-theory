import type { Bound } from '../graph.js';
import { radToDeg } from '../units.js';
import type { Ctx, Pt } from './ctx.js';
import { M } from './metas.js';

/**
 * The windshield and the head-tangency rake floor.
 *
 * The glass runs from the cowl point up and aft to the header. Laying it
 * flatter swings the header aft and brings the glass toward the driver's
 * head. The flattest legal glass is the line from the cowl tangent to the
 * head clearance circle — the rake floor. Its guaranteed monotonicity, and
 * the property test's contract: demand more clearance and the floor rises
 * (more upright), never falls.
 */

export interface Tangency {
  /** Angle of the flattest legal glass, radians above horizontal. */
  readonly angleRad: number;
  /** True when the cowl point already violates the clearance circle. */
  readonly impossible: boolean;
}

/** Tangent from a point to a circle, taking the tangent passing above it. */
export function headTangency(cowl: Pt, headCenter: Pt, clearanceRadius: number): Tangency {
  const dx = headCenter.x - cowl.x;
  const dz = headCenter.z - cowl.z;
  const dist = Math.hypot(dx, dz);
  if (dist <= clearanceRadius) return { angleRad: Math.PI / 2, impossible: true };
  const toCenter = Math.atan2(dz, dx);
  const spread = Math.asin(clearanceRadius / dist);
  return { angleRad: toCenter + spread, impossible: false };
}

/**
 * Header station bound: the owner's shortest run pushes it aft of the cowl;
 * head tangency and the owner's longest run cap how far aft it may go.
 */
export function headerBound(ctx: Ctx, cowl: Pt, headCenter: Pt, roofZ: number): Bound {
  const r = ctx.reg;
  ctx.cs.contribute('header_x', 'lower', M.uprightGlass, () =>
    cowl.x + r.value('glass_min_run'),
  );
  ctx.cs.contribute('header_x', 'upper', M.headTangency, () => {
    const clearance = r.value('anthro_head_radius') + r.value('glass_head_clearance');
    const t = headTangency(cowl, headCenter, clearance);
    if (t.impossible) return cowl.x;
    const rise = roofZ - cowl.z;
    if (rise <= 0) return cowl.x;
    const slope = Math.tan(t.angleRad);
    if (slope <= 0) return cowl.x;
    return cowl.x + rise / slope;
  });
  ctx.cs.contribute('header_x', 'upper', M.longestGlass, () =>
    cowl.x + r.value('glass_max_run'),
  );
  return ctx.cs.bound('header_x');
}

/** Rake readouts: the floor from tangency, and the rake as placed. */
export function rakeReadouts(ctx: Ctx, cowl: Pt, headCenter: Pt, headerX: number, roofZ: number): void {
  const r = ctx.reg;
  ctx.out.derive(
    'rake_floor_deg',
    'flattest legal glass',
    'deg',
    'angle of the line from the cowl tangent to the head clearance circle',
    () => {
      const clearance = r.value('anthro_head_radius') + r.value('glass_head_clearance');
      return radToDeg(headTangency(cowl, headCenter, clearance).angleRad);
    },
  );
  ctx.out.derive(
    'rake_deg',
    'windshield rake as placed',
    'deg',
    'angle of the cowl-to-header line above horizontal',
    () => radToDeg(Math.atan2(roofZ - cowl.z, headerX - cowl.x)),
  );
}
