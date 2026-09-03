/**
 * The Panoramic P2's profile, station by station — the brief, as numbers.
 *
 * The other four reference tables are a published car read at fractions of
 * its length; this one is a BRIEF read the same way. That is a weaker
 * witness — the brief and the build were written by the same hand — and it
 * is still a witness: the table is typed from the brief's sentences and
 * never from the build script's tables, and it was RE-READ ONCE, after the
 * first standing build showed the brief's own first draft had put the roof
 * hold of a sedan on a fastback and the front beltline under a 21 in tyre's
 * arch. What stands here is the brief as ratified; if the body drifts from
 * it again, the drift shows up as millimetres.
 *
 * WHAT THE P2'S PROFILE IS, in three facts this table encodes:
 *
 *   THE ROOF PEAKS OVER THE DRIVER AND NEVER STOPS FALLING. 0.56 of the
 *   length is the header rail; from there the line falls 440 mm to the
 *   ducktail without a level stretch — which is what makes it a fastback
 *   and not a sedan with a big backlight.
 *
 *   THE HIPS ARE THE CAR. Widest at the rear axle, 980 half-width over a
 *   295-section tyre with 7.5 mm to spare — the M3's plan fact, designed in
 *   rather than found.
 *
 *   BOTH ENDS ARE DOMED, NOT SLABBED. The first station is at 0.02 rather
 *   than 0.00 because the nose is a prow: the body's own end face bows
 *   forward from its corners, and a section cut at the tip reads a point.
 *
 * TOP OF BODY is the top of the body SURFACE, glazing excluded, as every
 * other table reads it.
 *
 * Body frame: x aft from the nose, z up from the road. Millimetres.
 */

import type { ProfileStation } from "./miata-reference.js";

export const P2_PROFILE: readonly ProfileStation[] = [
  // The prow: 90 mm of dome ahead of corners that sit at 640, so a section
  // 99 mm from the tip is still well inside the flare.
  { at: 0.02, halfWidth: 740, top: 695 },
  { at: 0.06, halfWidth: 885, top: 735 },
  // The front tyre runs x = 564..1276 (0.114..0.258). The lip over it is
  // track/2 + section/2 — arithmetic — plus the same 6 mm flare allowance
  // every table here shares with its build, named rather than hidden.
  { at: 0.12, halfWidth: 950, top: 808 },
  // 0.186 is the front axle: the front blister at full flare, under a
  // bonnet drawn tall for a 712 mm tyre and a 500 kW radiator.
  { at: 0.19, halfWidth: 953, top: 856 },
  { at: 0.26, halfWidth: 936, top: 876 },
  // The cowl: the last painted station before the screen.
  { at: 0.33, halfWidth: 924, top: 909 },
  // Beside the screen the whole sail band is glass, so the tallest painted
  // thing is the beltline — the convention `sectionAt` applies everywhere.
  { at: 0.40, halfWidth: 916, top: 880 },
  { at: 0.47, halfWidth: 914, top: 895 },
  // The peak, over the header rail — painted roof from here to the backlight.
  { at: 0.56, halfWidth: 918, top: 1400 },
  { at: 0.63, halfWidth: 930, top: 1360 },
  // Behind the rear door glass the C-pillar is painted again and the table
  // reads its top; through the door glass, with the backlight overhead, the
  // painted top drops to the beltline, so no station is taken there.
  // The rear tyre runs x = 3550..4290 (0.717..0.867); its lip is 978.
  { at: 0.73, halfWidth: 972, top: 1178 },
  { at: 0.75, halfWidth: 974, top: 1143 },
  // 0.792 is the rear axle: the hips.
  { at: 0.79, halfWidth: 978, top: 1061 },
  { at: 0.86, halfWidth: 974, top: 978 },
  { at: 0.93, halfWidth: 912, top: 920 },
  // The tail: 56 mm of dome behind corners at 730, the deck's trailing
  // edge 900 above the road.
  { at: 0.98, halfWidth: 792, top: 906 },
];

/** How far off the brief a station may sit before it is worth a word. */
export const P2_PROFILE_TOLERANCE_MM = 40;
