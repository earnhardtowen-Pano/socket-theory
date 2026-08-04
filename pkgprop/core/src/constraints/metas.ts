import type { ConstraintMeta } from '../graph.js';

/**
 * The constraints, named. Labels and reasons in plain words — these are the
 * exact strings a wall prints when a control touches it. Licenses per Law 4:
 * DERIVED when the wall falls out of geometry, ASSUMED when it is a stated
 * guess or a style target the owner can move.
 */

export const M = {
  frontCrush: {
    id: 'front_crush',
    label: 'front crash structure',
    reason: 'crush length has to fit between the bumper and the first hard mass',
    license: 'ASSUMED',
  },
  rearCrush: {
    id: 'rear_crush',
    label: 'rear crash structure',
    reason: 'crush length has to fit behind the last hard mass',
    license: 'ASSUMED',
  },
  styleFrontOverhang: {
    id: 'style_front_overhang',
    label: 'front overhang target',
    reason: 'the owner capped the nose; a proportion choice, not physics',
    license: 'ASSUMED',
  },
  styleRearOverhang: {
    id: 'style_rear_overhang',
    label: 'rear overhang target',
    reason: 'the owner capped the tail; a proportion choice, not physics',
    license: 'ASSUMED',
  },
  styleWheelbase: {
    id: 'style_wheelbase',
    label: 'wheelbase target',
    reason: 'the owner capped the wheelbase; a proportion choice, not physics',
    license: 'ASSUMED',
  },
  styleHeight: {
    id: 'style_height',
    label: 'overall height target',
    reason: 'the owner capped how tall the car may stand',
    license: 'ASSUMED',
  },
  seatBand: {
    id: 'seat_band',
    label: 'seat height band',
    reason: 'this architecture only works with the hip in this band',
    license: 'ASSUMED',
  },
  dashOverPowertrain: {
    id: 'dash_over_powertrain',
    label: 'dash over the powertrain',
    reason: 'the heel cannot sit inside the engine bay or the dash stack',
    license: 'DERIVED',
  },
  footwell: {
    id: 'footwell',
    label: 'footwell limit',
    reason: 'the feet stop where the wheelhouse and floor hardware begin',
    license: 'ASSUMED',
  },
  wheelbaseBudget: {
    id: 'wheelbase_budget',
    label: 'wheelbase budget',
    reason: 'everything aft of the heel still has to fit ahead of the rear axle',
    license: 'DERIVED',
  },
  occupantRoof: (row: number): ConstraintMeta => ({
    id: `occupant_roof_row${row}`,
    label: `occupant roof minimum, row ${row}`,
    reason: 'a seated occupant needs head room under the roof structure',
    license: 'DERIVED',
  }),
  dashStack: {
    id: 'dash_stack',
    label: 'instrument panel under the cowl',
    reason: 'the cowl cannot sink into the column, IP, and ducting below it',
    license: 'DERIVED',
  },
  sightOverCowl: {
    id: 'sight_over_cowl',
    label: 'driver sight line over the cowl',
    reason: 'the driver must see the road surface within the sight target',
    license: 'DERIVED',
  },
  sightOverHood: {
    id: 'sight_over_hood',
    label: 'sight line over the hood',
    reason: 'the hood must stay under the line from the eye over the cowl to the road',
    license: 'DERIVED',
  },
  sightOverDeck: {
    id: 'sight_over_deck',
    label: 'sight line over the deck',
    reason: 'the driver must see the road behind over the decklid',
    license: 'DERIVED',
  },
  sightBesideDriver: {
    id: 'sight_beside_driver',
    label: 'glass beside the driver',
    reason: 'the belt must sit below eye level by the stated drop',
    license: 'DERIVED',
  },
  tireClearance: {
    id: 'tire_clearance',
    label: 'tire and suspension travel',
    reason: 'the body must clear the tire crown plus jounce travel',
    license: 'DERIVED',
  },
  hoodOverPowertrain: {
    id: 'hood_over_powertrain',
    label: 'hood clearance over the powertrain',
    reason: 'the hood must clear the hard mass by the stated air gap',
    license: 'DERIVED',
  },
  engineUnderDeck: {
    id: 'engine_under_deck',
    label: 'engine under the deck',
    reason: 'the deck must clear the engine box by the stated air gap',
    license: 'DERIVED',
  },
  cargoUnderDeck: {
    id: 'cargo_under_deck',
    label: 'cargo under the deck',
    reason: 'the deck must leave the stated cargo depth above the rear floor',
    license: 'ASSUMED',
  },
  doorStack: {
    id: 'door_stack',
    label: 'door structure above the hip',
    reason: 'beam, glass drop, and rail stack up between hip and belt',
    license: 'ASSUMED',
  },
  headTangency: {
    id: 'head_tangency',
    label: 'windshield clears the head',
    reason: 'glass laid any flatter would cut into the head clearance sphere',
    license: 'DERIVED',
  },
  uprightGlass: {
    id: 'upright_glass',
    label: 'most upright glass',
    reason: 'the shortest windshield run the owner will accept',
    license: 'ASSUMED',
  },
  longestGlass: {
    id: 'longest_glass',
    label: 'longest glass run',
    reason: 'the longest windshield run the owner will accept',
    license: 'ASSUMED',
  },
  rearSeatStructure: {
    id: 'rear_seat_structure',
    label: 'rear seat to axle',
    reason: 'seat frame, kick-up, and wheelhouse need room before the axle line',
    license: 'ASSUMED',
  },
  midEngineBay: {
    id: 'mid_engine_bay',
    label: 'engine bay behind the cabin',
    reason: 'the engine sits between the last seats and the rear axle',
    license: 'DERIVED',
  },
  batteryFit: {
    id: 'battery_fit',
    label: 'battery inside the wheelbase',
    reason: 'the slab plus axle clearances must fit between the axle lines',
    license: 'DERIVED',
  },
  engineBehindAxle: {
    id: 'engine_behind_axle',
    label: 'engine behind the axle',
    reason: 'the engine and its crush length must fit inside the rear overhang',
    license: 'DERIVED',
  },
  wheelsOnTrack: {
    id: 'wheels_on_track',
    label: 'wheels on the track',
    reason: 'the body must cover the tires where the track puts them',
    license: 'DERIVED',
  },
  shoulderRoom: {
    id: 'shoulder_room',
    label: 'shoulders in the cabin',
    reason: 'the widest row of shoulders plus both door stacks must fit',
    license: 'DERIVED',
  },
  styleWidth: {
    id: 'style_width',
    label: 'overall width target',
    reason: 'the owner capped how wide the car may stand',
    license: 'ASSUMED',
  },
} as const;
