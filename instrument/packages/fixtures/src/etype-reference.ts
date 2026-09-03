/**
 * The E-Type coupe's profile, station by station — the underlay, as numbers.
 *
 * Same instrument as `miata-reference.ts` and it exists for the same reason:
 * tracing a body over a photograph is unfalsifiable, and a table of
 * half-widths and heights can be sectioned out of the built mesh and
 * subtracted. On the MX-5 this table found in one run what a night of looking
 * at renders had not — both tips pinched to a point and inflating to full
 * width over four hundred millimetres, which is the whole of "it looks like a
 * balloon at the front".
 *
 * IT MUST NOT BE THE STATION TABLE AGAIN. The value of this file is that it
 * is derived from a DIFFERENT thing than the body is: the published overall
 * dimensions plus the car's known proportions, read at fractions of the
 * length, with no reference to whatever `build-etype.ts` happens to type into
 * its sections. Copy the station table in here and the check is circular and
 * worth nothing.
 *
 * WHAT THE E-TYPE'S PROFILE IS, in three facts the table encodes:
 *
 *   The car is full width for HALF ITS LENGTH — 828 mm from about a third of
 *   the way back to past the rear axle, barely tapering. What a person reads
 *   as the shape is entirely in the ends.
 *
 *   The nose is a long point. At a tenth of the length it is still only two
 *   thirds of full width, where the MX-5 is at 94%. Twelve hundred and forty
 *   millimetres of it sit ahead of the front axle.
 *
 *   The roof peaks at 0.70 and it is a peak, not a plateau: 1219 mm at the
 *   crown, 1092 over the rear axle a hundred and thirty millimetres later.
 *   The fastback is falling for the last third of the car.
 *
 * TOP OF BODY is the top of the BODY SURFACE, roof included — a coupe's roof
 * is the body, unlike the MX-5's screen frame and folding top, which are
 * separate assemblies and were excluded there. Glazing is still excluded:
 * the windscreen and the backlight are their own cells set against this
 * surface, not part of it.
 *
 * PROVENANCE, AND ITS LIMIT. ASSUMED, all of it, and one step weaker than the
 * MX-5's was. There the published dimensions were at least published; here
 * even those are recalled rather than consulted (see `etype.ts`), and these
 * intermediate stations are read off them and off the car's proportions.
 * Good to perhaps 30 mm. A shape brief, not a measurement.
 *
 * Body frame: x aft from the nose, z up from the road. Millimetres.
 */

import type { ProfileStation } from "./miata-reference.js";

export const ETYPE_PROFILE: readonly ProfileStation[] = [
  // The long nose. Full width is not reached until a third of the way back.
  { at: 0.00, halfWidth: 190, top: 555 },
  { at: 0.05, halfWidth: 400, top: 625 },
  { at: 0.10, halfWidth: 565, top: 690 },
  { at: 0.15, halfWidth: 680, top: 735 },
  { at: 0.20, halfWidth: 758, top: 775 },
  // 0.278 is the front axle. The tyre's outer face is at 716 mm, so the flank
  // stands 96 mm outboard of it here — room the MX-5 never had.
  { at: 0.28, halfWidth: 812, top: 820 },
  { at: 0.35, halfWidth: 828, top: 848 },
  { at: 0.45, halfWidth: 828, top: 885 },
  // The scuttle, and then the screen: 160 mm of height in a tenth of the car.
  { at: 0.55, halfWidth: 828, top: 975 },
  { at: 0.62, halfWidth: 826, top: 1135 },
  { at: 0.70, halfWidth: 824, top: 1219 },
  { at: 0.80, halfWidth: 822, top: 1160 },
  // 0.826 is the rear axle, already 127 mm below the crown.
  { at: 0.83, halfWidth: 820, top: 1092 },
  { at: 0.90, halfWidth: 778, top: 955 },
  { at: 0.95, halfWidth: 685, top: 858 },
  { at: 1.00, halfWidth: 415, top: 742 },
];

/** How far off the reference a station may sit before it is worth a word. */
export const ETYPE_PROFILE_TOLERANCE_MM = 40;
