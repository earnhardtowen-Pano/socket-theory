/**
 * The real NA MX-5's profile, station by station — the underlay, as numbers.
 *
 * WHY NUMBERS AND NOT A PICTURE. Tracing a body over a photograph is how this
 * is normally done and it is unfalsifiable: two people looking at the same
 * overlay disagree about whether it fits, and neither can say by how much. A
 * table of half-widths and heights can be sectioned out of the built mesh and
 * subtracted, and the answer is millimetres.
 *
 * It earned its place immediately. The body it was first pointed at was within
 * five millimetres of the real car from a tenth of its length to nine tenths,
 * and both TIPS were pinched to a point:
 *
 *     x/L    half-width  built / real
 *     0.00      112 / 640      -528
 *     0.05      408 / 720      -312
 *     0.10      772 / 790       -18
 *
 * Which is the whole of "it looks like a balloon at the front" — a nose that
 * goes from a point to full width in four hundred millimetres. Nothing in the
 * surfacing, the continuity or the panel work could have told you that, and
 * none of them was wrong.
 *
 * PROVENANCE, AND ITS LIMIT. ASSUMED, all of it. The published dimensions are
 * real (3970 x 1675 x 1235, wheelbase 2265, tracks 1405/1425) and are in
 * `miata.ts` with their own licences; these intermediate stations are read off
 * those and off the car's known proportions, not off a measured survey or a
 * dimensioned drawing. They are good to perhaps 30 mm and should be treated
 * as a shape brief rather than a measurement. A real survey would replace this
 * table without changing anything that consumes it.
 *
 * TOP OF BODY excludes the screen frame and the folding top, because both are
 * separate assemblies and a comparison that included them would report the
 * windscreen as a 200 mm error in the bonnet.
 *
 * Body frame: x aft from the nose, z up from the road. Millimetres.
 */

export interface ProfileStation {
  /** Fraction of the overall length, nose to tail. */
  readonly at: number;
  /** Half-width of the body at that plane. */
  readonly halfWidth: number;
  /** Highest point of the BODY at that plane — no screen, no top. */
  readonly top: number;
}

/**
 * The tips are narrow on purpose.
 *
 * A car's frontmost plane cuts only the middle of the bumper, because the
 * corners have already begun to wrap; the width there is small and recovers
 * within a hundred and fifty millimetres. The fault this table exists to catch
 * is not a narrow tip, it is a narrow tip that takes four hundred millimetres
 * to become a car.
 */
export const MX5_PROFILE: readonly ProfileStation[] = [
  { at: 0.00, halfWidth: 330, top: 660 },
  { at: 0.05, halfWidth: 730, top: 730 },
  { at: 0.10, halfWidth: 790, top: 780 },
  { at: 0.15, halfWidth: 820, top: 812 },
  { at: 0.20, halfWidth: 834, top: 830 },
  { at: 0.25, halfWidth: 838, top: 845 },
  { at: 0.30, halfWidth: 838, top: 852 },
  { at: 0.40, halfWidth: 838, top: 872 },
  { at: 0.45, halfWidth: 838, top: 880 },
  // 0.50 to 0.68 is the cockpit. With the top down the body there is the
  // BELTLINE, not a roof, so the reference is the tonneau and the door top.
  { at: 0.60, halfWidth: 838, top: 862 },
  { at: 0.70, halfWidth: 838, top: 848 },
  { at: 0.80, halfWidth: 830, top: 866 },
  { at: 0.90, halfWidth: 800, top: 848 },
  { at: 0.95, halfWidth: 750, top: 820 },
  { at: 1.00, halfWidth: 600, top: 730 },
];

/** How far off the reference a station may sit before it is worth a word. */
export const MX5_PROFILE_TOLERANCE_MM = 40;
