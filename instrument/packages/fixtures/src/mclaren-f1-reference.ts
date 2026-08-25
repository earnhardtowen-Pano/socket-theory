/**
 * The McLaren F1's profile, station by station — the underlay, as numbers.
 *
 * Same instrument as the other two reference tables and it exists for the same
 * reason: a body sectioned against a table gives millimetres, and a body
 * traced over a photograph gives an argument. On the MX-5 this found in one
 * run what a night of renders had not.
 *
 * IT MUST NOT BE THE STATION TABLE AGAIN. Its whole value is that it is
 * derived from a DIFFERENT thing than the body is — published overall
 * dimensions plus the car's known proportions, read at fractions of the
 * length, with no reference to what `build-mclaren-f1.ts` types into its
 * sections.
 *
 * WHAT THE F1'S PROFILE IS, in three facts this table encodes:
 *
 *   THE CANOPY IS FORWARD AND IT IS THE TOP OF THE CAR. The roof peaks at
 *   0.42 of the length — barely past the midpoint of the wheelbase — and
 *   everything behind it falls. Three cars in, every roofline in this
 *   repository has peaked at 0.70 or later.
 *
 *   IT IS WAISTED, AND THE ARCHES ARE THE WIDEST PART. 910 mm over each
 *   axle and 858 through the doors — a 52 mm tuck either side that is most of
 *   what the car looks like from above — and 300 at the nose.
 *
 *   THE TAIL IS BLUNT. 620 mm of half-width at the very back, where the
 *   E-Type has 415 and the MX-5 has 600 — because a diffuser and two
 *   exhausts and a rear crash structure all have to fit across it.
 *
 * TOP OF BODY is the top of the body SURFACE, canopy included. Glazing is
 * excluded: the windscreen and the door glass are their own cells.
 *
 * PROVENANCE, AND ITS LIMIT. ASSUMED, all of it, and the same step weaker as
 * the E-Type's — even the overall dimensions are recalled rather than
 * consulted (see `mclaren-f1.ts`). Good to perhaps 30 mm. A shape brief.
 *
 * Body frame: x aft from the nose, z up from the road. Millimetres.
 */

import type { ProfileStation } from "./miata-reference.js";

/**
 * THE TYRE IS A FLOOR UNDER THIS TABLE, and it has now caught two drafts.
 *
 * A station with a wheel at it cannot be narrower than that wheel's outer
 * face, which is track/2 + section/2 and is arithmetic rather than opinion:
 * 901.5 mm at the front and 893.5 at the rear. The first draft of this file
 * put 790 at the front axle, which would have stood the tyre 111 mm outside
 * its own bodywork. The second put 700 at 0.10 and 870 at 0.88 — the front
 * tyre starts at x = 438 and the rear one ends at 3836, so both of those were
 * inside a tyre too. Five stations moved.
 *
 * That is not the table being bent to fit the body. It is the table being
 * made possible: the numbers below are recalled proportions, and the tyre is
 * a consequence of the published track and the published tyre size. Where a
 * recollection and a consequence disagree, the consequence wins.
 */
export const F1_PROFILE: readonly ProfileStation[] = [
  { at: 0.00, halfWidth: 300, top: 480 },
  { at: 0.05, halfWidth: 620, top: 545 },
  // The front tyre begins at x = 438, which is 0.102 of the length. The wing
  // is therefore all but out to full width before a tenth of the car has
  // gone by — a 620 mm swell in 429 mm — and that is why the F1's nose reads
  // as a prow between two wings rather than as a nose.
  { at: 0.10, halfWidth: 845, top: 610 },
  { at: 0.15, halfWidth: 902, top: 660 },
  // 0.177 is the front axle, and the car is at FULL WIDTH there.
  { at: 0.18, halfWidth: 906, top: 685 },
  { at: 0.25, halfWidth: 902, top: 760 },
  // The waist. Between the tyres nothing forces the width, and the F1 tucks:
  // 858 at its narrowest against 910 over the arches. The door is the tuck.
  { at: 0.32, halfWidth: 875, top: 930 },
  // The canopy: 350 mm of height in a tenth of the car, and then the top of
  // the whole car at 0.42 — barely past the middle of the wheelbase.
  { at: 0.42, halfWidth: 862, top: 1140 },
  { at: 0.50, halfWidth: 858, top: 1120 },
  // Behind the cabin the deck falls onto the engine cover and stays there,
  // and the haunch swells back out over the rear tyre.
  { at: 0.58, halfWidth: 872, top: 1055 },
  { at: 0.68, halfWidth: 895, top: 1025 },
  // 0.811 is the rear axle.
  { at: 0.81, halfWidth: 905, top: 1005 },
  { at: 0.88, halfWidth: 895, top: 985 },
  { at: 0.95, halfWidth: 820, top: 960 },
  { at: 1.00, halfWidth: 620, top: 930 },
];

/** How far off the reference a station may sit before it is worth a word. */
export const F1_PROFILE_TOLERANCE_MM = 40;
