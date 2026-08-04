import type { Bound } from '../graph.js';
import { CeilingProfile, FloorProfile, type Segment } from '../profile.js';
import { tireRadiusOf } from './chains.js';
import type { Ctx } from './ctx.js';
import { M } from './metas.js';
import type { OccupantRow } from './occupants.js';

/**
 * Plan view — the same contract as the side view, turned on its side.
 * The profile's "z" is the half-width y from the centerline: the floor is
 * what the body must cover (wheels on the track, shoulders in the cabin),
 * the ceiling is the owner's width target. Symmetry is enforced by only
 * ever solving the right half.
 */

/** Overall width: wheels and shoulders push out; the width target pulls in. */
export function widthBound(ctx: Ctx, occupants: readonly OccupantRow[]): Bound {
  const r = ctx.reg;
  ctx.cs.contribute('overall_width', 'lower', M.wheelsOnTrack, () =>
    r.value('chassis_track') +
    r.value('tire_section_width') +
    2 * r.value('body_tire_lateral_clearance'),
  );
  const widest = occupants.reduce((m, row) => Math.max(m, row.seats), 1);
  ctx.cs.contribute('overall_width', 'lower', M.shoulderRoom, () =>
    widest * r.value('anthro_shoulder_width') + 2 * r.value('door_side_stack'),
  );
  ctx.cs.contribute('overall_width', 'upper', M.styleWidth, () =>
    r.value('style_overall_width_max'),
  );
  return ctx.cs.bound('overall_width');
}

export interface PlanEnvelope {
  readonly floor: FloorProfile;
  readonly ceiling: CeilingProfile;
}

export function buildPlanEnvelope(
  ctx: Ctx,
  bumperX: number,
  tailX: number,
  wheelbase: number,
  occupants: readonly OccupantRow[],
): PlanEnvelope {
  const r = ctx.reg;
  const floorSegs: Segment[] = [];
  const ceilSegs: Segment[] = [];

  // Wheel zones: half track plus half section plus lateral clearance,
  // over each axle's tire footprint.
  const tireR = tireRadiusOf(r);
  const jounce = r.value('body_tire_jounce');
  const reach = tireR + jounce;
  const halfWheelY =
    (r.value('chassis_track') + r.value('tire_section_width')) / 2 +
    r.value('body_tire_lateral_clearance');
  for (const axleX of [0, wheelbase]) {
    floorSegs.push({
      kind: 'line', x0: axleX - reach, x1: axleX + reach,
      z0: halfWheelY, z1: halfWheelY, constraint: M.wheelsOnTrack,
    });
  }

  // Cabin zone: the widest row's shoulders plus the door stacks, spanning
  // from the first heel to the last hip.
  const first = occupants[0];
  const last = occupants[occupants.length - 1];
  if (first && last) {
    const widest = occupants.reduce((m, row) => Math.max(m, row.seats), 1);
    const halfCabinY =
      (widest * r.value('anthro_shoulder_width')) / 2 + r.value('door_side_stack');
    floorSegs.push({
      kind: 'line', x0: first.heel.x, x1: last.hpoint.x,
      z0: halfCabinY, z1: halfCabinY, constraint: M.shoulderRoom,
    });
  }

  // The owner's width target, over the whole car.
  const halfMax = r.value('style_overall_width_max') / 2;
  ceilSegs.push({
    kind: 'line', x0: bumperX, x1: tailX, z0: halfMax, z1: halfMax,
    constraint: M.styleWidth,
  });

  return { floor: new FloorProfile(floorSegs), ceiling: new CeilingProfile(ceilSegs) };
}
