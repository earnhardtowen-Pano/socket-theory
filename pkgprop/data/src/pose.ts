import type { ControlId } from '@pkgprop/core';

/**
 * The opening pose — where each control sits inside its own live band when a
 * project has not said otherwise.
 *
 * These are fractions, not millimetres: 0 puts the control on its floor wall,
 * 1 on its ceiling wall, and the actual number in mm falls out of whatever the
 * solver computed those walls to be. That is why they survive a package change
 * — swap the architecture and the pose holds its proportions.
 *
 * They lived in `core/src/solve.ts` as thirteen bare fractions, which made the
 * solver choose the car you first see and put thirteen unlicensed numbers a
 * directory above the license lint's reach. They are a stated preference about
 * what a pleasing default car looks like, so they belong here with the rest of
 * the spine, and the kernel keeps no opinion: a control the project does not
 * name falls to the middle of its band, which asserts nothing about cars.
 *
 * Every value below was chosen so FR·2 and MR·2 open with zero conflicts.
 */
export const OPENING_POSE: Readonly<Record<ControlId, number>> = {
  /** Nose kept short of the cap — a long overhang reads as a rental car. */
  front_overhang: 0.35,
  /** Hip low in the band without bottoming it, so the roof can come down. */
  h30: 0.4,
  /** Heel well forward, which buys dash-to-axle behind it. */
  heel_x: 0.15,
  /** Roof near its floor: the lowest roof the occupants actually allow. */
  roof_z: 0.15,
  /** Cowl high in its band — a low cowl reads as a cab-forward hatchback. */
  cowl_z: 0.85,
  hood_z: 0.5,
  /** Glass laid back most of the way toward head tangency. */
  header_x: 0.7,
  belt_z: 0.4,
  wheelbase: 0.35,
  rear_overhang: 0.35,
  deck_z: 0.3,
  overall_width: 0.4,
  rocker_z: 0.3,
};
