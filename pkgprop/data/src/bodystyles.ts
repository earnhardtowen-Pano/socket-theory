import type { ControlId } from '@pkgprop/core';

/**
 * Body styles — a whole car in one press.
 *
 * Picking "MR" only ever said where the engine sits. Everything that makes a
 * mid-engine car look like one — the driver laid back and moved forward, the
 * roof slammed, the wide rubber, the short deck over the bay, the strong
 * tumblehome — was left at the same neutral pose whatever you chose, so every
 * architecture opened as the same beige shape with the hard points shuffled.
 *
 * A style sets the architecture *and* the pose *and* the section, so the car
 * that appears is one you would recognise. Every number is still a fraction of
 * a live band or a licensed override, so nothing here escapes the solver: pick
 * a style whose demands cannot be met and the conflict names what pushed back.
 */

export interface BodyStyle {
  readonly id: string;
  readonly label: string;
  /** Plain words for the chip's title, in the language of the trade. */
  readonly blurb: string;
  readonly architecture: string;
  readonly seating: string;
  readonly tire: string;
  /** Where each control sits in its own band. */
  readonly controls: Readonly<Record<ControlId, number>>;
  /** How the car is shaped across its width. */
  readonly section: {
    readonly crown: number;
    readonly shoulder: number;
    readonly tumblehome: number;
    readonly glassInset: number;
  };
  /** ASSUMED values this style disagrees with — always legal, always visible. */
  readonly overrides?: Readonly<Record<string, number>>;
}

export const BODY_STYLES: readonly BodyStyle[] = [
  {
    id: 'mid-sports',
    label: 'mid-engine sports',
    blurb: 'cab forward, roof slammed, short deck over the bay',
    architecture: 'mr',
    seating: '2',
    tire: '245/40R19',
    controls: {
      // Nose short and the driver pushed hard forward: a mid-engine car puts
      // the cabin where a front-engine car keeps its engine.
      front_overhang: 0.76,
      h30: 0.04,
      // Behind the front axle, not ahead of it: cab-forward is a short dash to
      // axle, not a driver sitting over the wheel.
      heel_x: 0.24,
      roof_z: 0.0,
      cowl_z: 0.42,
      hood_z: 0.12,
      header_x: 0.86,
      belt_z: 0.66,
      // The wheelbase band opens at what the occupants alone demand; a real
      // mid-engine car sits well above its own floor.
      wheelbase: 0.62,
      rear_overhang: 0.62,
      deck_z: 0.06,
      overall_width: 0.82,
      rocker_z: 0.08,
    },
    section: { crown: 0.62, shoulder: 0.42, tumblehome: 0.55, glassInset: 0.62 },
    overrides: {
      // Laying the driver back is the whole trick: the torso swings about the
      // hip, so the head drops and the roof follows it down.
      seat_back_angle_deg: 42,
      structure_ground_clearance: 105,
      body_tire_jounce: 45,
    },
  },
  {
    id: 'front-gt',
    label: 'front-engine GT',
    blurb: 'long dash to axle, cabin set back, fastback tail',
    architecture: 'fr',
    seating: '2+2',
    tire: '245/45R18',
    controls: {
      front_overhang: 0.3,
      h30: 0.42,
      heel_x: 0.55,
      roof_z: 0.12,
      cowl_z: 0.92,
      hood_z: 0.62,
      header_x: 0.6,
      belt_z: 0.52,
      wheelbase: 0.35,
      rear_overhang: 0.46,
      deck_z: 0.24,
      overall_width: 0.6,
      rocker_z: 0.22,
    },
    section: { crown: 0.5, shoulder: 0.6, tumblehome: 0.38, glassInset: 0.46 },
    overrides: {
      seat_back_angle_deg: 30,
      structure_ground_clearance: 120,
      // A 2+2 behind a longitudinal engine does not fit under the default
      // 2950 cap — the heel band inverts and the car has nowhere legal to put
      // its driver. Raising the owner's own wheelbase target is the honest
      // resolution, and it is exactly the trade a GT makes.
      style_wheelbase_max: 3150,
    },
  },
  {
    id: 'ev-crossover',
    label: 'EV crossover',
    blurb: 'skateboard floor, cab forward, upright glass',
    architecture: 'ev',
    seating: '5',
    tire: '255/45R20',
    controls: {
      front_overhang: 0.24,
      h30: 0.6,
      heel_x: 0.3,
      roof_z: 0.4,
      cowl_z: 0.7,
      hood_z: 0.45,
      header_x: 0.3,
      belt_z: 0.4,
      wheelbase: 0.55,
      rear_overhang: 0.3,
      deck_z: 0.5,
      overall_width: 0.55,
      rocker_z: 0.5,
    },
    section: { crown: 0.3, shoulder: 0.68, tumblehome: 0.16, glassInset: 0.3 },
    overrides: {
      seat_back_angle_deg: 22,
      // A crossover stands tall by definition; under the default height cap
      // the roof band is all but collapsed and every drag hits a wall.
      style_overall_height_max: 1820,
    },
  },
];

export function getBodyStyle(id: string): BodyStyle {
  const s = BODY_STYLES.find((b) => b.id === id);
  if (!s) throw new Error(`No such body style: '${id}'.`);
  return s;
}
