/**
 * The E90 M3's profile, station by station — the underlay, as numbers.
 *
 * Same instrument as the other three reference tables: a body sectioned
 * against a table gives millimetres, and a body traced over a photograph
 * gives an argument. It is derived from a DIFFERENT thing than the body is —
 * published overall dimensions plus the car's proportions read at fractions
 * of the length — with no reference to what `build-e90-m3.ts` types.
 *
 * WHAT THE E90 M3'S PROFILE IS, in three facts this table encodes:
 *
 *   THE ROOF PEAKS OVER THE B-PILLAR. A three-box sedan carries its height
 *   at 0.56 of the length — aft of every coupe in this repository except
 *   none — and holds within 10 mm of it for a fifth of the car, because four
 *   adults sit under it in two rows.
 *
 *   THE HIPS ARE THE WIDEST PART, AND THEY ARE AT THE REAR AXLE. 1817 mm
 *   over the rear arches against 1760 through the doors: the M3's flares are
 *   nearly all of the 35 mm it carries over a base E90, and the rear pair
 *   carries more of it than the front.
 *
 *   THE DECK IS HIGH AND SHORT. The bootlid trailing edge sits near
 *   beltline height at 0.95 of the length — a modern high tail, where the
 *   E-Type's fell away to almost nothing.
 *
 * TOP OF BODY is the top of the body SURFACE. Glazing is excluded — through
 * the screen and backlight stations the body's own top is the cantrail.
 *
 * PROVENANCE. The overall envelope (4580 x 1817 x 1447) is SOURCED this run;
 * the stations between are proportion, ASSUMED, good to perhaps 30 mm. The
 * tyre floor is arithmetic: track/2 + section/2 = 891.5 front, 902 rear, and
 * every station a tyre lives at respects it.
 *
 * Body frame: x aft from the nose, z up from the road. Millimetres.
 */

import type { ProfileStation } from "./miata-reference.js";

export const E90_PROFILE: readonly ProfileStation[] = [
  { at: 0.00, halfWidth: 780, top: 640 },
  { at: 0.05, halfWidth: 850, top: 700 },
  { at: 0.10, halfWidth: 880, top: 735 },
  // The front tyre runs x = 623..1277 (0.136..0.279); the lip over it is
  // track/2 + section/2 + a 6 mm flare = 897.5.
  { at: 0.14, halfWidth: 892, top: 762 },
  // 0.207 is the front axle. The arch blister is at full flare.
  { at: 0.21, halfWidth: 897, top: 792 },
  { at: 0.28, halfWidth: 888, top: 835 },
  // The doors: the E90's flank tucks between the flares — the scallop.
  { at: 0.35, halfWidth: 874, top: 882 },
  // THROUGH THE GREENHOUSE the table reads what the instrument reads: the
  // top of the body WITHOUT ITS GLAZING. Beside the screen the whole sail
  // band is door glass, so the tallest painted thing at the station is the
  // beltline — the same convention `sectionAt` applies to every car.
  { at: 0.42, halfWidth: 870, top: 840 },
  { at: 0.49, halfWidth: 872, top: 860 },
  // The peak, over the B-pillar — painted roof from here to the backlight.
  { at: 0.56, halfWidth: 875, top: 1447 },
  { at: 0.63, halfWidth: 880, top: 1437 },
  { at: 0.70, halfWidth: 890, top: 1330 },
  // The rear tyre runs x = 3376..4046 (0.737..0.883); its lip is 908 — the
  // widest thing on the car, wider than the front pair.
  { at: 0.74, halfWidth: 902, top: 1180 },
  // 0.810 is the rear axle: the hips.
  { at: 0.81, halfWidth: 908, top: 1020 },
  { at: 0.88, halfWidth: 904, top: 990 },
  { at: 0.95, halfWidth: 862, top: 962 },
  { at: 1.00, halfWidth: 790, top: 935 },
];

/** How far off the reference a station may sit before it is worth a word. */
export const E90_PROFILE_TOLERANCE_MM = 40;
