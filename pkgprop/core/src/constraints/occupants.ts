import type { Bound } from '../graph.js';
import { floorOf, legroomOf, rowH30Of, rowHipXOf, rowRoofMinOf, seatedHeightOf } from './chains.js';
import type { Ctx, Pt } from './ctx.js';
import { M } from './metas.js';

/**
 * The occupant array — brief §3.1. Rows sit at their couple distances with a
 * theater step; every occupant derives a roof demand; vision comes from row
 * one. The H-point stays; inheritance goes: everything chains from body
 * geometry and the anthro table, never from published packaging tables.
 */

export interface OccupantRow {
  readonly row: number;
  readonly seats: number;
  readonly h30: number;
  readonly hpoint: Pt;
  readonly heel: Pt;
  readonly headCenter: Pt;
  readonly headTopZ: number;
  readonly roofMinZ: number;
}

/** Roof band: every row pushes up; the owner's height target pushes down. */
export function roofBound(ctx: Ctx, heelX: number, h30Front: number): Bound {
  for (let i = 0; i < ctx.seating.rows.length; i += 1) {
    const rowIndex = i;
    ctx.cs.contribute('roof_z', 'lower', M.occupantRoof(rowIndex + 1), () =>
      rowRoofMinOf(ctx.reg, ctx.arch, ctx.seating, h30Front, rowIndex),
    );
  }
  ctx.cs.contribute('roof_z', 'upper', M.styleHeight, () =>
    ctx.reg.value('style_overall_height_max'),
  );
  return ctx.cs.bound('roof_z');
}

/** Geometry of every seated occupant, for the drawing and the panel. */
export function placeOccupants(ctx: Ctx, heelX: number, h30Front: number): OccupantRow[] {
  const r = ctx.reg;
  const floorZ = floorOf(r, ctx.arch);
  const legroom = legroomOf(r, h30Front);
  const rows: OccupantRow[] = [];
  for (let i = 0; i < ctx.seating.rows.length; i += 1) {
    const def = ctx.seating.rows[i];
    if (!def) continue;
    // Each row's geometry is computed under its own trace and published, so a
    // later wall built on a hip or a head — the belt, the windshield — can
    // inherit the whole occupant chain rather than restating its last term.
    const endRow = r.beginTrace();
    r.inherit('heel_x', 'h30');
    const h30 = rowH30Of(r, ctx.seating, h30Front, i);
    const hipX = rowHipXOf(r, ctx.seating, heelX, h30Front, i);
    const hipZ = floorOf(r, ctx.arch) + h30;
    const headTopZ = hipZ + seatedHeightOf(r);
    const headCenterZ = headTopZ - r.value('anthro_head_radius');
    const headCenterX = hipX + r.value('anthro_head_center_aft_of_hpoint');
    const rowChain = endRow();
    for (const q of [`row${i + 1}_hip_x`, `row${i + 1}_hip_z`, `row${i + 1}_head_x`, `row${i + 1}_head_z`]) {
      r.publish(q, rowChain);
    }
    rows.push({
      row: i + 1,
      seats: def.seats,
      h30,
      hpoint: { x: hipX, z: hipZ },
      heel: { x: i === 0 ? heelX : hipX - legroom, z: floorZ },
      headCenter: { x: headCenterX, z: headCenterZ },
      headTopZ,
      roofMinZ: headTopZ + r.value('anthro_headroom_clearance') + r.value('body_roof_stack'),
    });
  }
  return rows;
}

/** Row-one eye point, the origin of every sight line. */
export function eyePoint(ctx: Ctx, row1: OccupantRow): Pt {
  const r = ctx.reg;
  const z = ctx.out.derive(
    'eye_z',
    'eye height above ground',
    'mm',
    'floor height plus seat height plus seated eye height above the hip',
    () => {
      r.inherit('h30');
      return floorOf(r, ctx.arch) + row1.h30 + r.value('anthro_eye_above_hpoint');
    },
  );
  const x = ctx.out.derive(
    'eye_x',
    'eye station',
    'mm',
    'hip station plus the seated eye setback',
    () => {
      r.inherit('row1_hip_x');
      return row1.hpoint.x + r.value('anthro_eye_aft_of_hpoint');
    },
  );
  return { x, z };
}
