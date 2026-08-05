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
    // The sight line hangs off the eye, so everything that put the eye where
    // it is belongs in this wall's chain: raising the seat is as real a way to
    // move this ceiling as loosening the ground-sight target.
    r.inherit('eye_x', 'eye_z', 'cowl_x');
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
    // This wall used to read the registry zero times: it is built entirely
    // from the eye and the placed cowl, both handed in as bare numbers. That
    // left it with an empty chain and no resolvers, so a hood conflict named
    // two walls and offered nothing to move.
    r.inherit('eye_x', 'eye_z', 'cowl_x', 'cowl_z');
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
  ctx.cs.contribute('belt_z', 'lower', M.doorStack, () => {
    r.inherit('row1_hip_z');
    return row1HipZ + r.value('door_belt_stack');
  });
  ctx.cs.contribute('belt_z', 'upper', M.sightBesideDriver, () => {
    r.inherit('eye_z');
    return eye.z - r.value('vision_side_drop');
  });
  return ctx.cs.bound('belt_z');
}

/**
 * Deck bound: the tail's hard contents push it up; the rearward sight line
 * over the deck caps it from above, evaluated at the tail where it is
 * strictest for a level deck.
 */
export function deckBound(ctx: Ctx, eye: Pt, tailX: number): Bound {
  const r = ctx.reg;
  // These two were an either/or, which disagreed with the drawn envelope for
  // the skateboard: its drive unit straddles the rear axle, so buildEnvelope
  // pushed an engine floor there while this bound took the cargo branch and
  // ignored the hardware entirely. The slider and the drawing enforced
  // different things for the same car. Both demands are real and independent —
  // the deck clears whichever is higher — so both are contributed, under the
  // same conditions the envelope uses.
  const bay = ctx.arch.powertrain;
  const tailHardMass = bay === 'mid-rear' || bay === 'rear' || bay === 'under-floor';
  const tailCarriesCargo = bay !== 'mid-rear' && bay !== 'rear';
  if (tailHardMass) {
    ctx.cs.contribute('deck_z', 'lower', M.engineUnderDeck, () =>
      powertrainTopOf(r) + r.value('body_hood_clearance'),
    );
  }
  if (tailCarriesCargo) {
    ctx.cs.contribute('deck_z', 'lower', M.cargoUnderDeck, () =>
      floorOf(r, ctx.arch) + r.value('cargo_deck_height'),
    );
  }
  ctx.cs.contribute('deck_z', 'upper', M.sightOverDeck, () => {
    r.inherit('eye_x', 'eye_z', 'wheelbase', 'rear_overhang');
    const groundX = eye.x + r.value('vision_rear_ground_sight');
    return sightLineZ(eye, groundX, tailX);
  });
  return ctx.cs.bound('deck_z');
}

export type { PlacedControl };
