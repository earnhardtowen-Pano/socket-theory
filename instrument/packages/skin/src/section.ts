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
 * The vertices a mesh's INDICES actually reference, as flat vertex numbers.
 *
 * Not the same as "every vertex in the positions array", and the difference is
 * a trap worth naming: a caller filtering one part out of a bigger mesh keeps
 * the shared positions buffer and hands over a shorter index list. Anything
 * that walks positions then measures the WHOLE car and calls it the part —
 * which is how the chassis lens first reported a windscreen header as an
 * 885 mm protrusion of the frame.
 */
export function usedVertices(mesh: SectionMesh): number[] {
  const seen = new Set<number>();
  for (const i of mesh.indices) seen.add(i);
  return [...seen].sort((a, b) => a - b);
}

/** The x range of the geometry a mesh's indices reference. */
export function xRange(mesh: SectionMesh): [number, number] {
  let lo = Infinity, hi = -Infinity;
  for (const v of usedVertices(mesh)) {
    const x = mesh.positions[v * 3]!;
    if (x < lo) lo = x;
    if (x > hi) hi = x;
  }
  return Number.isFinite(lo) ? [lo, hi] : [0, 0];
}

/**
 * Evenly spaced stations across a mesh's own x range, at cell centres.
 *
 * A sampling density, which is arithmetic — how finely you look at something
 * is not a claim about it. It lives here so the lens next door can stay a
 * package where every number IS a claim.
 */
export function evenStations(mesh: SectionMesh, count = 40): number[] {
  const [lo, hi] = xRange(mesh);
  const n = Math.max(1, Math.floor(count));
  return Array.from({ length: n }, (_, i) => lo + ((hi - lo) * (i + 0.5)) / n);
}

/**
 * Sections and floor profiles of one mesh, cached.
 *
 * Slicing is the expensive part of every question a chassis asks, and the
 * points it asks about share very few x values — a box has eight. Both grids
 * are quantisation, not judgement: a quarter of a millimetre is finer than any
 * mesh this package will see, and a floor pan is a metre wide so five
 * millimetres locates it. That is why they live here and not in the lens.
 *
 * `floorAtX(x)` returns the body's LOWEST surface at a given y, which is what
 * tells a floor pan from a panel — see `coverClearance`.
 */
export function sectionCache(mesh: SectionMesh): {
  sectionAtX: (x: number) => Seg2[];
  floorAtX: (x: number) => (y: number) => number;
} {
  const STATION_STEP = 0.25, FLOOR_STEP = 5;
  const sections = new Map<number, Seg2[]>();
  const floors = new Map<number, (y: number) => number>();
  const keyOf = (x: number): number => Math.round(x / STATION_STEP) * STATION_STEP;
  const sectionAtX = (x: number): Seg2[] => {
    const key = keyOf(x);
    let s = sections.get(key);
    if (!s) { s = sliceSection(mesh, key); sections.set(key, s); }
    return s;
  };
  const floorAtX = (x: number): ((y: number) => number) => {
    const key = keyOf(x);
    let f = floors.get(key);
    if (f) return f;
    const section = sectionAtX(key);
    const grid = new Map<number, number>();
    f = (y: number): number => {
      const k = Math.round(y / FLOOR_STEP);
      let v = grid.get(k);
      if (v === undefined) {
        const col = scanUp(section, k * FLOOR_STEP);
        v = col.length === 0 ? -Infinity : col[0]!;
        grid.set(k, v);
      }
      return v;
    };
    floors.set(key, f);
    return f;
  };
  return { sectionAtX, floorAtX };
}

/**
 * An even sample of the vertices a mesh's indices reference.
 *
 * Sampling, never a claim — the caller says how many it can afford and this
 * spreads them over the buffer in index order. Ten thousand is a mesh a lens
 * can walk in a moment; a car is a million.
 */
export function sampledVertices(mesh: SectionMesh, limit = 4000): number[] {
  const verts = usedVertices(mesh);
  const step = Math.max(1, Math.floor(verts.length / Math.max(1, limit)));
  const out: number[] = [];
  for (let k = 0; k < verts.length; k += step) out.push(verts[k]!);
  return out;
}

/**
 * Closest pair of crossings in a scan, mm. Infinity for fewer than two.
 *
 * A ray that passes within a hair of a fold enters and leaves again inside
 * that hair, and the two crossings it reports are really one grazing touch —
 * which is the classic way a parity test gets the wrong answer on geometry
 * that is perfectly well formed.
 */
const tightestPair = (cs: readonly number[]): number => {
  let best = Infinity;
  for (let i = 1; i < cs.length; i++) best = Math.min(best, Math.abs(cs[i]! - cs[i - 1]!));
  return best;
};

/** How close two crossings have to be before a ray is treated as grazing. */
const GRAZE_MM = 3;

/**
 * Is (y, z) inside the solid the section bounds?
 *
 * Parity on the crossings to its left. The body a mesher hands back is a
 * CLOSED SOLID rather than a shell with thickness, so this answers exactly the
 * question a chassis asks: am I buried in the bodywork, or am I out in the
 * air where somebody can see me? A point in an open cockpit is outside, and
 * correctly so — the cockpit is air.
 *
 * The duplicate collapse in `scanAt` is what makes the parity right: every
 * quad face is two triangles, and a scan line crossing their shared diagonal
 * is reported by both. Counting that twice flips the answer.
 *
 * TWO RAYS, NOT ONE, AND THE McLAREN IS WHY. A single horizontal ray is exact
 * for a closed polygon and it meets exactly one condition it cannot check for
 * itself: that it crosses the boundary transversally. Just inboard of a wheel
 * arch's lip — where the opening has only begun and the cut is a two
 * millimetre sliver — a horizontal ray enters the flank and leaves through the
 * wheelhouse wall two millimetres later, which flips the parity for the entire
 * rest of the section. Seven structure points read as 193 mm out through the
 * bonnet of a car whose front rails are in the middle of its nose.
 *
 * So both rays are cast, and where they disagree the one with no grazing pair
 * wins. That is not a tolerance and not a vote: a ray that enters and leaves
 * inside three millimetres has met the boundary tangentially and its parity is
 * the unreliable one, which is a fact about the ray rather than about the
 * body. Where both are clean and they still disagree the horizontal answer
 * stands, so nothing about the old behaviour changes on a section without a
 * sliver in it.
 */
export function insideSection(section: readonly Seg2[], y: number, z: number): boolean {
  const across = scanAt(section, z);
  const parity = (cs: readonly number[], at: number): boolean => {
    let before = 0;
    for (const c of cs) if (c < at) before++;
    return before % 2 === 1;
  };
  const flat = parity(across, y);
  if (tightestPair(across) >= GRAZE_MM) return flat;
  const up = scanUp(section, y);
  if (tightestPair(up) >= GRAZE_MM) return parity(up, z);
  return flat;
}

/** Distance from (y, z) to the nearest piece of the section, mm. */
export function wallClearance(section: readonly Seg2[], y: number, z: number): number {
  let best = Infinity;
  for (const s of section) {
    const [ya, za] = s.a, [yb, zb] = s.b;
    const dy = yb - ya, dz = zb - za;
    const len2 = dy * dy + dz * dz;
    let t = len2 > EPS ? ((y - ya) * dy + (z - za) * dz) / len2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const ey = y - (ya + t * dy), ez = z - (za + t * dz);
    const d = Math.sqrt(ey * ey + ez * ez);
    if (d < best) best = d;
  }
  return best;
}

/**
 * Distance to the skin that COVERS a point — over it or beside it, never under.
 *
 * WHY THIS IS NOT `wallClearance`. The defect being looked for is a panel
 * drawn tight over structure: the flat spot and the dying highlight every
 * cheap car has over its sill. That needs a panel BETWEEN the eye and the
 * structure. A frame rail welded to the floor pan it sits on is zero
 * millimetres from the skin and is not a defect at all — it is a weld, and
 * every unibody on earth has one. Measuring in all directions cannot tell the
 * two apart and calls the weld the fault.
 *
 * So a segment counts only when the point of it nearest the query is not
 * BELOW the query. Floor under a rail: excluded. Rocker beside it, deck over
 * it: counted. Returns Infinity when nothing covers the point, which is the
 * honest answer for structure hanging in the open under a car.
 *
 * `floorAt` is the second half of the same idea and the caller has to supply
 * it, because only the caller can section the body. A frame rail spot-welded
 * to the floor pan ABOVE it is zero millimetres from the skin and is not a
 * read-through either — it is the same weld seen from the other side, and
 * nobody has ever looked at a floor pan and complained about a flat spot. A
 * covering point sitting on the body's lowest surface in its own column is
 * that pan, and is skipped. Omit `floorAt` and every covering surface counts.
 */
export function coverClearance(
  section: readonly Seg2[],
  y: number,
  z: number,
  floorAt?: (y: number) => number,
): number {
  let best = Infinity;
  for (const s of section) {
    const [ya, za] = s.a, [yb, zb] = s.b;
    const dy = yb - ya, dz = zb - za;
    const len2 = dy * dy + dz * dz;
    let t = len2 > EPS ? ((y - ya) * dy + (z - za) * dz) / len2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const cz = za + t * dz;
    if (cz < z - EPS) continue;
    const cy = ya + t * dy;
    if (floorAt && cz <= floorAt(cy) + 1) continue;
    const ey = y - cy, ez = z - cz;
    const d = Math.sqrt(ey * ey + ez * ez);
    if (d < best) best = d;
  }
  return best;
}

/**
 * Where a VERTICAL line at y crosses a section, bottom to top.
 *
 * The transpose of `scanAt`, and it needs to exist for the same reason: a body
 * mount asks "how far up is the floor from here", which is a question about a
 * column, not a row.
 */
export function scanUp(section: readonly Seg2[], y: number): number[] {
  const zs: number[] = [];
  for (const s of section) {
    const [ya, za] = s.a, [yb, zb] = s.b;
    if ((ya - y) * (yb - y) > 0) continue;
    if (Math.abs(yb - ya) < EPS) continue;
    zs.push(za + ((y - ya) / (yb - ya)) * (zb - za));
  }
  zs.sort((a, b) => a - b);
  const out: number[] = [];
  for (const z of zs) if (out.length === 0 || z - out[out.length - 1]! > 1) out.push(z);
  return out;
}
