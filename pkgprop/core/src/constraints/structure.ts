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

/**
 * Front overhang: crash structure below, the owner's proportion cap above.
 *
 * The crush floor has to account for where the first hard mass actually sits,
 * or the demand it states is not the demand it enforces. For a front layout
 * the box is built at bumper-plus-crush (`frontPowertrainBox` below), so the
 * gap is true by construction. For the skateboard the drive unit straddles the
 * axle at x = 0, so its front face is half a unit ahead of the axle and the
 * crush zone has to clear that too — otherwise the reason claims a gap the
 * arithmetic never checks.
 */
export function frontOverhangBound(ctx: Ctx): Bound {
  ctx.cs.contribute('front_overhang', 'lower', M.frontCrush, () => {
    const crush = ctx.reg.value('arch_crush_front');
    if (ctx.arch.powertrain === 'under-floor') {
      return crush + ctx.reg.value('arch_powertrain_length') / 2;
    }
    return crush;
  });
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

/**
 * Seat height band for this architecture. The two walls carry their own
 * identities: one meta for both ends printed the same sentence whichever end
 * you hit, so the chip could not tell you which way the band was pushing.
 */
export function h30Bound(ctx: Ctx): Bound {
  ctx.cs.contribute('h30', 'lower', M.seatBandLow, () => ctx.reg.value('arch_h30_min'));
  ctx.cs.contribute('h30', 'upper', M.seatBandHigh, () => ctx.reg.value('arch_h30_max'));
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
      () => {
        // The bay starts at the placed bumper, so where the nose ended up is
        // part of why the heel cannot come further forward.
        ctx.reg.inherit('front_overhang');
        return (
          -frontOverhang.value +
          ctx.reg.value('arch_crush_front') +
          ctx.reg.value('arch_powertrain_length') +
          ctx.reg.value('structure_dash_offset')
        );
      },
    );
  }
  ctx.cs.contribute('heel_x', 'lower', M.footwell, () =>
    ctx.reg.value('arch_footwell_aft_of_axle'),
  );
  ctx.cs.contribute(
    'heel_x',
    'upper',
    M.heelUnderWheelbaseCap,
    () =>
      ctx.reg.value('style_wheelbase_max') -
      legroomOf(ctx.reg, h30) -
      coupleSumOf(ctx.reg, ctx.seating) -
      rearDemandOf(ctx.reg, ctx.arch),
  );
  return ctx.cs.bound('heel_x');
}
