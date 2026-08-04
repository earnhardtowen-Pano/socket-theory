import type { Bound, PlacedControl } from '../graph.js';
import { floorOf, powertrainTopOf, tireRadiusOf } from './chains.js';
import type { Ctx, Pt } from './ctx.js';
import { M } from './metas.js';

/**
 * Vision — sight lines from the row-one eye. All ceilings here are DERIVED:
 * pure similar-triangle geometry from the eye point and a stated ground
 * target. Published packaging tables are validation, never the spine.
 */

/** z of the line through the eye and a ground point, at station x. */
export function sightLineZ(eye: Pt, groundX: number, x: number): number {
  return (eye.z * (x - groundX)) / (eye.x - groundX);
}

/**
 * Cowl bound: the IP stack pushes it up from below; the sight line to the
 * forward ground target caps it from above.
 */
export function cowlBound(ctx: Ctx, eye: Pt, cowlX: number): Bound {
  const r = ctx.reg;
  ctx.cs.contribute('cowl_z', 'lower', M.dashStack, () =>
    floorOf(r, ctx.arch) + r.value('structure_dash_stack'),
  );
  ctx.cs.contribute('cowl_z', 'upper', M.sightOverCowl, () => {
    const groundX = eye.x - r.value('vision_ground_sight');
    return sightLineZ(eye, groundX, cowlX);
  });
  return ctx.cs.bound('cowl_z');
}

/**
 * Where the sight line grazing the placed cowl actually meets the road.
 * The honest readout: what the driver really sees, not the target.
 */
export function groundSightActual(ctx: Ctx, eye: Pt, cowl: Pt): number {
  return ctx.out.derive(
    'ground_sight_actual',
    'nearest visible ground, as placed',
    'mm',
    'the eye-over-cowl line extended to the road surface',
    () => {
      const dz = eye.z - cowl.z;
      if (dz <= 0) return Number.MAX_SAFE_INTEGER;
      const groundX = eye.x - (eye.z * (eye.x - cowl.x)) / dz;
      return eye.x - groundX;
    },
  );
}

/**
 * Hood bound at the front axle station: tire and travel push it up from
 * below (and the powertrain box, when it reaches this station); the line
 * from the eye over the placed cowl caps it from above.
 */
export function hoodBound(
  ctx: Ctx,
  eye: Pt,
  cowl: Pt,
  frontBox: { x0: number; x1: number; z1: number } | null,
  stationX: number,
): Bound {
  const r = ctx.reg;
  ctx.cs.contribute('hood_z', 'lower', M.tireClearance, () =>
    2 * tireRadiusOf(r) + r.value('body_tire_jounce'),
  );
  if (frontBox && frontBox.x0 <= stationX && stationX <= frontBox.x1) {
    ctx.cs.contribute('hood_z', 'lower', M.hoodOverPowertrain, () =>
      powertrainTopOf(r) + r.value('body_hood_clearance'),
    );
  }
  ctx.cs.contribute('hood_z', 'upper', M.sightOverHood, () => {
    const dz = eye.z - cowl.z;
    if (dz <= 0) return cowl.z;
    const groundX = eye.x - (eye.z * (eye.x - cowl.x)) / dz;
    return sightLineZ(eye, groundX, stationX);
  });
  return ctx.cs.bound('hood_z');
}

/**
 * Belt bound: door structure stacks up from the hip; the glass beside the
 * driver keeps the belt below eye level by the stated drop.
 */
export function beltBound(ctx: Ctx, eye: Pt, row1HipZ: number): Bound {
  const r = ctx.reg;
  ctx.cs.contribute('belt_z', 'lower', M.doorStack, () =>
    row1HipZ + r.value('door_belt_stack'),
  );
  ctx.cs.contribute('belt_z', 'upper', M.sightBesideDriver, () =>
    eye.z - r.value('vision_side_drop'),
  );
  return ctx.cs.bound('belt_z');
}

/**
 * Deck bound: the tail's hard contents push it up; the rearward sight line
 * over the deck caps it from above, evaluated at the tail where it is
 * strictest for a level deck.
 */
export function deckBound(ctx: Ctx, eye: Pt, tailX: number): Bound {
  const r = ctx.reg;
  const tailHardMass = ctx.arch.powertrain === 'mid-rear' || ctx.arch.powertrain === 'rear';
  if (tailHardMass) {
    ctx.cs.contribute('deck_z', 'lower', M.engineUnderDeck, () =>
      powertrainTopOf(r) + r.value('body_hood_clearance'),
    );
  } else {
    ctx.cs.contribute('deck_z', 'lower', M.cargoUnderDeck, () =>
      floorOf(r, ctx.arch) + r.value('cargo_deck_height'),
    );
  }
  ctx.cs.contribute('deck_z', 'upper', M.sightOverDeck, () => {
    const groundX = eye.x + r.value('vision_rear_ground_sight');
    return sightLineZ(eye, groundX, tailX);
  });
  return ctx.cs.bound('deck_z');
}

export type { PlacedControl };
