/**
 * @car/pack geometry — axis-aligned world boxes and deterministic ID ordering.
 *
 * Box convention (stated once, used everywhere): a BoxShape rides a carrier
 * point; the box CENTER sits at carrier + offset and the half-extents are
 * size/2 per axis. Carriers: a part's pose origin, a member's `at`, or the
 * world origin for world-scoped demand shapes.
 */

import type { BoxShape, Id, Pt3 } from "@car/schema";
import { nabs, nmax, nmin, nsqrt } from "@car/num";

export const ORIGIN3: Pt3 = [0, 0, 0];

export interface WorldBox {
  readonly center: Pt3;
  readonly half: Pt3;
}

/** Deterministic Id ordering: kind lexicographic, then numeric suffix. */
export function idCompare(a: Id, b: Id): number {
  const ha = a.indexOf("#");
  const hb = b.indexOf("#");
  const ka = a.slice(0, ha);
  const kb = b.slice(0, hb);
  if (ka < kb) return -1;
  if (ka > kb) return 1;
  return Number(a.slice(ha + 1)) - Number(b.slice(hb + 1));
}

export function sortIds(ids: Iterable<Id>): Id[] {
  return [...ids].sort(idCompare);
}

export function worldBox(shape: BoxShape, carrier: Pt3): WorldBox {
  const off = shape.offset ?? ORIGIN3;
  return {
    center: [carrier[0] + off[0], carrier[1] + off[1], carrier[2] + off[2]],
    half: [shape.size[0].value / 2, shape.size[1].value / 2, shape.size[2].value / 2],
  };
}

export function inflate(box: WorldBox, byMm: number): WorldBox {
  if (byMm === 0) return box;
  return {
    center: box.center,
    half: [box.half[0] + byMm, box.half[1] + byMm, box.half[2] + byMm],
  };
}

/**
 * Per-axis penetration depth (positive on an axis = the boxes overlap along
 * that axis; boxes intersect iff all three are strictly positive).
 */
export function penetrations(a: WorldBox, b: WorldBox): Pt3 {
  return [
    a.half[0] + b.half[0] - nabs(a.center[0] - b.center[0]),
    a.half[1] + b.half[1] - nabs(a.center[1] - b.center[1]),
    a.half[2] + b.half[2] - nabs(a.center[2] - b.center[2]),
  ];
}

export function intersects(a: WorldBox, b: WorldBox): boolean {
  const p = penetrations(a, b);
  return p[0] > 0 && p[1] > 0 && p[2] > 0;
}

/**
 * Minimum penetration over axes. Positive: the boxes interpenetrate by that
 * much along the cheapest separating axis. Zero: exact face contact.
 * Negative: separated, with a gap of -value along the widest separating axis.
 */
export function minPenetration(a: WorldBox, b: WorldBox): number {
  const p = penetrations(a, b);
  return nmin(nmin(p[0], p[1]), p[2]);
}

/** Inclusive containment: box faces count as inside. */
export function containsPoint(box: WorldBox, p: Pt3): boolean {
  return (
    nabs(p[0] - box.center[0]) <= box.half[0] &&
    nabs(p[1] - box.center[1]) <= box.half[1] &&
    nabs(p[2] - box.center[2]) <= box.half[2]
  );
}

/** Euclidean distance from a point to a box (0 when inside). */
export function pointBoxDistance(box: WorldBox, p: Pt3): number {
  const dx = nmax(nabs(p[0] - box.center[0]) - box.half[0], 0);
  const dy = nmax(nabs(p[1] - box.center[1]) - box.half[1], 0);
  const dz = nmax(nabs(p[2] - box.center[2]) - box.half[2], 0);
  return nsqrt(dx * dx + dy * dy + dz * dz);
}

const dezero = (x: number): number => (x === 0 ? 0 : x);

/** Canonicalize -0 to 0 so published coordinates are bit-stable. */
export function canon3(p: Pt3): Pt3 {
  return [dezero(p[0]), dezero(p[1]), dezero(p[2])];
}
