import type { Bound, PlacedControl } from '../graph.js';
import { floorOf, legroomOf, coupleSumOf, rearDemandOf } from './chains.js';
import type { Ctx } from './ctx.js';
import { M } from './metas.js';

/** Cabin floor height readout (the chain lives in chains.ts). */
export function floorHeight(ctx: Ctx): number {
  return ctx.out.derive(
    'floor_z',
    'cabin floor height',
    'mm',
    ctx.arch.powertrain === 'under-floor'
      ? 'ground clearance plus battery slab plus floor structure'
      : 'ground clearance plus floor structure',
    () => floorOf(ctx.reg, ctx.arch),
  );
}

/** Front overhang: crash structure below, the owner's proportion cap above. */
export function frontOverhangBound(ctx: Ctx): Bound {
  ctx.cs.contribute('front_overhang', 'lower', M.frontCrush, () =>
    ctx.reg.value('arch_crush_front'),
  );
  ctx.cs.contribute('front_overhang', 'upper', M.styleFrontOverhang, () =>
    ctx.reg.value('style_front_overhang_max'),
  );
  return ctx.cs.bound('front_overhang');
}

export interface Box {
  readonly x0: number;
  readonly x1: number;
  readonly z0: number;
  readonly z1: number;
}

/**
 * The front hard mass, when there is one: engine behind the crush zone for
 * front layouts, drive unit centered on the axle for the skateboard.
 */
export function frontPowertrainBox(ctx: Ctx, frontOverhang: PlacedControl): Box | null {
  const r = ctx.reg;
  if (ctx.arch.powertrain === 'front') {
    const z0 = r.value('structure_ground_clearance');
    const z1 = z0 + r.value('arch_powertrain_height');
    const x0 = -frontOverhang.value + r.value('arch_crush_front');
    return { x0, x1: x0 + r.value('arch_powertrain_length'), z0, z1 };
  }
  if (ctx.arch.powertrain === 'under-floor') {
    const z0 = r.value('structure_ground_clearance');
    const z1 = z0 + r.value('arch_powertrain_height');
    const half = r.value('arch_powertrain_length') / 2;
    return { x0: -half, x1: half, z0, z1 };
  }
  return null;
}

/** The rocker (sill) band: running clearance below, cabin floor above. */
export function rockerBound(ctx: Ctx): Bound {
  ctx.cs.contribute('rocker_z', 'lower', M.groundClearance, () =>
    ctx.reg.value('structure_ground_clearance'),
  );
  ctx.cs.contribute('rocker_z', 'upper', M.cabinFloor, () => floorOf(ctx.reg, ctx.arch));
  return ctx.cs.bound('rocker_z');
}

/** Seat height band for this architecture. */
export function h30Bound(ctx: Ctx): Bound {
  ctx.cs.contribute('h30', 'lower', M.seatBand, () => ctx.reg.value('arch_h30_min'));
  ctx.cs.contribute('h30', 'upper', M.seatBand, () => ctx.reg.value('arch_h30_max'));
  return ctx.cs.bound('h30');
}

/**
 * Where the driver heel may sit: behind the dash chain (front layouts) and
 * the footwell hardware, ahead of the wheelbase budget.
 */
export function heelBound(ctx: Ctx, frontOverhang: PlacedControl, h30: number): Bound {
  if (ctx.arch.powertrain === 'front') {
    ctx.cs.contribute(
      'heel_x',
      'lower',
      M.dashOverPowertrain,
      () =>
        -frontOverhang.value +
        ctx.reg.value('arch_crush_front') +
        ctx.reg.value('arch_powertrain_length') +
        ctx.reg.value('structure_dash_offset'),
    );
  }
  ctx.cs.contribute('heel_x', 'lower', M.footwell, () =>
    ctx.reg.value('arch_footwell_aft_of_axle'),
  );
  ctx.cs.contribute(
    'heel_x',
    'upper',
    M.wheelbaseBudget,
    () =>
      ctx.reg.value('style_wheelbase_max') -
      legroomOf(ctx.reg, h30) -
      coupleSumOf(ctx.reg, ctx.seating) -
      rearDemandOf(ctx.reg, ctx.arch),
  );
  return ctx.cs.bound('heel_x');
}
