import type { Bound } from '../graph.js';
import {
  coupleSumOf,
  legroomOf,
  rearDemandOf,
  rowHipXOf,
} from './chains.js';
import type { Ctx } from './ctx.js';
import { M } from './metas.js';
import type { Box } from './structure.js';

/**
 * Wheelbase: the occupant chain, the mid-engine bay, and the battery all
 * push the rear axle aft; the owner's proportion target pulls it in.
 */
export function wheelbaseBound(ctx: Ctx, heelX: number, h30Front: number): Bound {
  const r = ctx.reg;
  const lastRow = ctx.seating.rows.length - 1;
  ctx.cs.contribute('wheelbase', 'lower', M.rearSeatStructure, () =>
    rowHipXOf(r, ctx.seating, heelX, h30Front, lastRow) +
    r.value('structure_hip_to_rear_axle'),
  );
  if (ctx.arch.powertrain === 'mid-rear') {
    ctx.cs.contribute('wheelbase', 'lower', M.midEngineBay, () =>
      rowHipXOf(r, ctx.seating, heelX, h30Front, lastRow) +
      r.value('arch_bulkhead_clearance') +
      r.value('arch_powertrain_length'),
    );
  }
  if (ctx.arch.powertrain === 'under-floor') {
    ctx.cs.contribute('wheelbase', 'lower', M.batteryFit, () =>
      r.value('arch_battery_length') + 2 * r.value('arch_battery_axle_clearance'),
    );
  }
  ctx.cs.contribute('wheelbase', 'upper', M.styleWheelbase, () =>
    r.value('style_wheelbase_max'),
  );
  // The budget must at least admit the chain: floor of the band is also
  // bounded below by what the heel placement already committed to.
  ctx.cs.contribute('wheelbase', 'lower', M.wheelbaseBudget, () =>
    heelX + legroomOf(r, h30Front) + coupleSumOf(r, ctx.seating) + rearDemandOf(r, ctx.arch),
  );
  return ctx.cs.bound('wheelbase');
}

/** Rear overhang: crash structure (and the RR engine) below, style above. */
export function rearOverhangBound(ctx: Ctx): Bound {
  const r = ctx.reg;
  ctx.cs.contribute('rear_overhang', 'lower', M.rearCrush, () =>
    r.value('arch_crush_rear'),
  );
  if (ctx.arch.powertrain === 'rear') {
    ctx.cs.contribute('rear_overhang', 'lower', M.engineBehindAxle, () =>
      r.value('arch_powertrain_length') + r.value('arch_crush_rear'),
    );
  }
  ctx.cs.contribute('rear_overhang', 'upper', M.styleRearOverhang, () =>
    r.value('style_rear_overhang_max'),
  );
  return ctx.cs.bound('rear_overhang');
}

/** The rear hard mass, where one exists: mid bay ahead of the axle, RR behind. */
export function rearPowertrainBox(
  ctx: Ctx,
  wheelbase: number,
  rearOverhang: number,
): Box | null {
  const r = ctx.reg;
  if (ctx.arch.powertrain === 'mid-rear') {
    const z0 = r.value('structure_ground_clearance');
    const z1 = z0 + r.value('arch_powertrain_height');
    return { x0: wheelbase - r.value('arch_powertrain_length'), x1: wheelbase, z0, z1 };
  }
  if (ctx.arch.powertrain === 'rear') {
    const z0 = r.value('structure_ground_clearance');
    const z1 = z0 + r.value('arch_powertrain_height');
    const x1 = wheelbase + rearOverhang - r.value('arch_crush_rear');
    return { x0: x1 - r.value('arch_powertrain_length'), x1, z0, z1 };
  }
  if (ctx.arch.powertrain === 'under-floor') {
    const z0 = r.value('structure_ground_clearance');
    const z1 = z0 + r.value('arch_powertrain_height');
    const half = r.value('arch_powertrain_length') / 2;
    return { x0: wheelbase - half, x1: wheelbase + half, z0, z1 };
  }
  return null;
}

/** The battery slab, EV only, sitting inside the wheelbase. */
export function batterySlab(ctx: Ctx, wheelbase: number): Box | null {
  if (ctx.arch.powertrain !== 'under-floor') return null;
  const r = ctx.reg;
  const clearance = r.value('arch_battery_axle_clearance');
  const z0 = r.value('structure_ground_clearance');
  const x0 = clearance;
  const x1 = Math.min(x0 + r.value('arch_battery_length'), wheelbase - clearance);
  return { x0, x1: Math.max(x0, x1), z0, z1: z0 + r.value('arch_battery_thickness') };
}
