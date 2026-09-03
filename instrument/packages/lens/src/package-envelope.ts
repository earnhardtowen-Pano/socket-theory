/**
 * What the car must be big enough to contain, station by station.
 *
 * THE CAUSALITY IN THIS TOOL HAS BEEN BACKWARDS. A body was authored from a
 * station table somebody typed, a frame was then derived from the parts, and
 * a lens checked afterwards whether the two agreed. When they did not — an
 * engine through a bonnet, a crush rail through a valance — the answer was
 * always to retype the body until the complaint stopped. That is a person
 * doing by hand what the geometry already knows.
 *
 * A real car is the other way round. An E-Type has that bonnet BECAUSE the XK
 * six is 663 mm long and stands 620 tall and the frame has to get round it;
 * when Jaguar put a V12 in one the nose grew, the track widened and the arches
 * flared, and nobody redrew the car for fun. The package is the cause and the
 * surface is the effect.
 *
 * So: this publishes the MINIMUM body at a station — the half-width it must
 * reach, the height it must clear, the floor it must not rise above — as the
 * union of every box the car carries plus the air a panel wants over it. The
 * body's own tables become a FLOOR under the styling rather than the whole of
 * it: a designer says what the car should look like and the package says what
 * it may not be smaller than, and where those two disagree the package wins
 * and the report says which part won it.
 *
 * WHAT IT IS NOT. It is not a styling proposal. It says nothing about what
 * shape the body should be between its bounds, which is the entire art; it
 * only says where the bounds are. A car that is exactly its package envelope
 * is a van.
 *
 * Boxes are axis-aligned, which OVER-states a part — an engine is not a
 * cuboid and neither is a wishbone — so an envelope this publishes is at
 * least as large as the truth. Erring large is the right direction: the
 * failure it prevents is a body too small for its own contents.
 *
 * Body frame: x aft from the nose, y lateral, z up from the road. Millimetres.
 */

import type { Pt3 } from "@car/schema";
import { assumed } from "@car/demand";

/** Anything the body has to enclose: a placed part, or a structural member. */
export interface PackageBox {
  readonly name: string;
  readonly lo: Pt3;
  readonly hi: Pt3;
}

export interface PackageStation {
  readonly x: number;
  /** Half-width the body must reach here. Zero where nothing is at this station. */
  readonly halfWidth: number;
  /** Height the body must clear. Zero where nothing is here. */
  readonly top: number;
  /** Height the body's underside must stay below. Infinity where nothing is here. */
  readonly bottom: number;
  /** Which box set each bound, so a report can say what drove the shape. */
  readonly topDriver: string | null;
  readonly widthDriver: string | null;
  readonly bottomDriver: string | null;
}

export interface PackageOptions {
  /** Air between a part and the outer skin. */
  readonly skinGap?: number;
}

/**
 * Air between the outermost thing the car carries and the panel over it.
 *
 * ASSUMED. It has to cover a panel's own thickness, its inner reinforcement,
 * the trim on the other side where there is any, and the fact that nothing in
 * this model is a cuboid so every box is already generous. 45 mm is a hand's
 * breadth less than the clearance a stylist would ask for and a good deal
 * more than a panel gap; it is here to be argued with rather than buried.
 */
const SKIN_GAP = assumed(
  45, "mm",
  "air between the outermost part or member at a station and the outer skin over it — no source consulted; 45 mm ASSUMED",
);

/** The package's demand at one station. */
export function packageAt(
  boxes: readonly PackageBox[],
  x: number,
  opts: PackageOptions = {},
): PackageStation {
  const gap = opts.skinGap ?? SKIN_GAP.value;
  let halfWidth = 0, top = 0, bottom = Infinity;
  let topDriver: string | null = null, widthDriver: string | null = null, bottomDriver: string | null = null;
  for (const b of boxes) {
    if (x < b.lo[0]! || x > b.hi[0]!) continue;
    const half = Math.max(Math.abs(b.lo[1]!), Math.abs(b.hi[1]!)) + gap;
    if (half > halfWidth) { halfWidth = half; widthDriver = b.name; }
    const t = b.hi[2]! + gap;
    if (t > top) { top = t; topDriver = b.name; }
    const u = b.lo[2]! - gap;
    if (u < bottom) { bottom = u; bottomDriver = b.name; }
  }
  return { x, halfWidth, top, bottom, topDriver, widthDriver, bottomDriver };
}

/** The same, over a list of stations. */
export function packageEnvelope(
  boxes: readonly PackageBox[],
  stations: readonly number[],
  opts: PackageOptions = {},
): PackageStation[] {
  return stations.map((x) => packageAt(boxes, x, opts));
}

/** One station's worth of what the package asked for against what was drawn. */
export interface PackageMiss {
  readonly x: number;
  readonly what: "top" | "width" | "floor";
  /** How far the drawn body fell short, mm. Always positive. */
  readonly by: number;
  readonly driver: string;
}

/**
 * Where a drawn body would have been smaller than its own contents.
 *
 * Reported rather than silently corrected, because "the package raised this
 * bonnet 40 mm and here is the part that did it" is the sentence a designer
 * needs. Silently taking the max of two numbers is how a car ends up shaped
 * by something nobody remembers deciding.
 */
export function packageMisses(
  drawn: readonly { x: number; halfWidth: number; top: number; floor: number }[],
  need: readonly PackageStation[],
): PackageMiss[] {
  const out: PackageMiss[] = [];
  for (let i = 0; i < drawn.length && i < need.length; i++) {
    const d = drawn[i]!, n = need[i]!;
    if (n.top > d.top && n.topDriver) out.push({ x: d.x, what: "top", by: n.top - d.top, driver: n.topDriver });
    if (n.halfWidth > d.halfWidth && n.widthDriver) {
      out.push({ x: d.x, what: "width", by: n.halfWidth - d.halfWidth, driver: n.widthDriver });
    }
    if (Number.isFinite(n.bottom) && n.bottom < d.floor && n.bottomDriver) {
      out.push({ x: d.x, what: "floor", by: d.floor - n.bottom, driver: n.bottomDriver });
    }
  }
  return out;
}

export { SKIN_GAP };
