import { natan2 } from "@car/num";

/**
 * Sectioning a mesh — the arithmetic under the cabin lens.
 *
 * Here rather than in @car/lens for the reason this package's header already
 * gives: a plane-triangle intersection is not made of design decisions, it is
 * made of array strides and a linear interpolation, and licensing its 0.5 as
 * an assumption would say nothing true. The CLAIMS — how much elbow room a
 * person wants, how far below a beltline to read a tumblehome — stay in the
 * lens, licensed, where they can be argued with.
 *
 * A cross-section of a watertight body at a station is a set of (y, z)
 * segments that close into loops. Scanning a horizontal line across them
 * gives the crossings in order, so the OUTER pair is the body's width there
 * and any INNER pair is a cockpit's. Everything the cabin lens knows, it
 * knows from those two operations.
 */

export interface SectionMesh {
  readonly positions: Float64Array;
  readonly indices: Uint32Array | ReadonlyArray<number>;
}

/** One segment of a cross-section, in (y, z). */
export interface Seg2 {
  readonly a: readonly [number, number];
  readonly b: readonly [number, number];
}


export interface StationSection {
  readonly x: number;
  /** Outer width of the body here, mm. Zero if the plane misses the body. */
  readonly width: number;
  /** Highest point of the body here. */
  readonly top: number;
  /** Lowest. */
  readonly bottom: number;
  /**
   * Beltline: the outer surface's highest point on the +y side, and the angle
   * its surface leans IN from vertical just below it — the tumblehome. A body
   * side that leans out reports negative.
   */
  readonly beltZ: number;
  readonly beltY: number;
  readonly tumblehomeDeg: number;
  /** Interior half-width at the queried height, or null where there is no cockpit. */
  readonly interiorHalfWidth: number | null;
  /** Lowest interior surface near the centreline, or null if the section is solid. */
  readonly wellFloor: number | null;
}



/** Below this two numbers are the same number. Arithmetic, not a claim. */
const EPS = 1e-9;

/**
 * Cross-section of a triangle mesh at x = station, as (y, z) segments.
 *
 * Plain marching over triangles: a triangle contributes a segment when its
 * vertices straddle the plane. A vertex exactly ON the plane is nudged to the
 * positive side rather than special-cased, which keeps the count even and the
 * loops closed — a section is only useful if it closes.
 */
export function sliceSection(mesh: SectionMesh, station: number): Seg2[] {
  const p = mesh.positions;
  const idx = mesh.indices;
  const out: Seg2[] = [];
  const side = (i: number): number => {
    const d = p[i * 3]! - station;
    return d >= 0 ? 1 : -1;
  };
  const cross = (i: number, j: number): [number, number] => {
    const xi = p[i * 3]!, xj = p[j * 3]!;
    const t = Math.abs(xj - xi) < EPS ? 0.5 : (station - xi) / (xj - xi);
    return [
      p[i * 3 + 1]! + t * (p[j * 3 + 1]! - p[i * 3 + 1]!),
      p[i * 3 + 2]! + t * (p[j * 3 + 2]! - p[i * 3 + 2]!),
    ];
  };
  for (let t = 0; t + 2 < idx.length; t += 3) {
    const a = idx[t]!, b = idx[t + 1]!, c = idx[t + 2]!;
    const sa = side(a), sb = side(b), sc = side(c);
    if (sa === sb && sb === sc) continue;
    // The two edges that straddle: exactly two of three, always.
    const hits: [number, number][] = [];
    if (sa !== sb) hits.push(cross(a, b));
    if (sb !== sc) hits.push(cross(b, c));
    if (sc !== sa) hits.push(cross(c, a));
    if (hits.length !== 2) continue;         // degenerate in this plane
    out.push({ a: hits[0]!, b: hits[1]! });
  }
  return out;
}

/**
 * Where a horizontal line at height z crosses a section, left to right.
 *
 * Duplicates within a millimetre collapse: a scan line through a shared edge
 * hits both triangles that own it, and counting that twice turns one wall into
 * two and a cockpit into a phantom.
 */
export function scanAt(section: readonly Seg2[], z: number): number[] {
  const ys: number[] = [];
  for (const s of section) {
    const [ya, za] = s.a, [yb, zb] = s.b;
    if ((za - z) * (zb - z) > 0) continue;       // both on one side
    if (Math.abs(zb - za) < EPS) continue;       // horizontal: no crossing
    ys.push(ya + ((z - za) / (zb - za)) * (yb - ya));
  }
  ys.sort((a, b) => a - b);
  const out: number[] = [];
  for (const y of ys) if (out.length === 0 || y - out[out.length - 1]! > 1) out.push(y);
  return out;
}

/** Read one station: outer size, beltline, tumblehome, and any cockpit. */
export interface SectionOptions {
  /** How far below the beltline to read the tumblehome, mm. The lens licenses
   *  the default; this layer only needs to be told one. */
  readonly tumblehomeDropMm?: number;
}

export function sectionAt(
  mesh: SectionMesh,
  x: number,
  interiorAtZ: number,
  opts: SectionOptions = {},
): StationSection {
  const drop = opts.tumblehomeDropMm ?? 60;
  const section = sliceSection(mesh, x);
  if (section.length === 0) {
    return {
      x, width: 0, top: 0, bottom: 0, beltZ: 0, beltY: 0,
      tumblehomeDeg: 0, interiorHalfWidth: null, wellFloor: null,
    };
  }
  let top = -Infinity, bottom = Infinity, yLo = Infinity, yHi = -Infinity;
  for (const s of section) {
    for (const q of [s.a, s.b]) {
      if (q[1] > top) top = q[1];
      if (q[1] < bottom) bottom = q[1];
      if (q[0] < yLo) yLo = q[0];
      if (q[0] > yHi) yHi = q[0];
    }
  }

  // The beltline is the top of the BODY SIDE — the highest the outer flank
  // reaches before it turns inboard. Taking the section's overall top would
  // give the roof centreline on a closed car and the right answer only by
  // accident on an open one, so it is read off the outer quarter of the
  // section's width and nowhere else.
  const outerCut = 0.75 * yHi;
  let beltZ = bottom;
  for (const sg of section) {
    for (const q of [sg.a, sg.b]) {
      if (q[0] >= outerCut && q[1] > beltZ) beltZ = q[1];
    }
  }
  const outerAt = (z: number): number | null => {
    const ys = scanAt(section, z);
    return ys.length === 0 ? null : ys[ys.length - 1]!;
  };
  // Read a hair BELOW the belt: exactly at it the surface is horizontal and a
  // scan line lying in a face crosses nothing.
  const beltY = outerAt(beltZ - 1) ?? yHi;
  const yDn = outerAt(Math.max(bottom + 1, beltZ - 1 - drop)) ?? beltY;
  const rise = beltZ - 1 - Math.max(bottom + 1, beltZ - 1 - drop);
  // Positive leans IN going up, which is what a car does. A flared side, which
  // almost nothing does above the belt, comes back negative rather than as an
  // absolute value that hides its own sign.
  const tumblehomeDeg = rise > EPS ? (natan2(yDn - beltY, rise) * 180) / Math.PI : 0;

  // The cockpit: a scan at the queried height with four or more crossings has
  // an interior between the middle pair.
  const ys = scanAt(section, interiorAtZ);
  const interiorHalfWidth = ys.length >= 4
    ? Math.max(0, (ys[ys.length - 2]! - ys[1]!) / 2)
    : null;

  // The well floor: the lowest interior surface near the centreline. Found by
  // scanning up from the bottom for the first height that has an interior.
  let wellFloor: number | null = null;
  for (let z = bottom + 2; z < top; z += 2) {
    if (scanAt(section, z).length >= 4) { wellFloor = z; break; }
  }

  return {
    x, width: yHi - yLo, top, bottom, beltZ, beltY,
    tumblehomeDeg, interiorHalfWidth, wellFloor,
  };
}


/**
 * Evenly spaced stations across a mesh's own x range, at cell centres.
 *
 * A sampling density, which is arithmetic — how finely you look at something
 * is not a claim about it. It lives here so the lens next door can stay a
 * package where every number IS a claim.
 */
export function evenStations(mesh: SectionMesh, count = 40): number[] {
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < mesh.positions.length; i += 3) {
    const x = mesh.positions[i]!;
    if (x < lo) lo = x;
    if (x > hi) hi = x;
  }
  const n = Math.max(1, Math.floor(count));
  return Array.from({ length: n }, (_, i) => lo + ((hi - lo) * (i + 0.5)) / n);
}
