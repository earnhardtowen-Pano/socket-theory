/**
 * Isophotes — the Class-A surfacer's real instrument, and the one this tool
 * did not have.
 *
 * An isophote is a line of constant angle between the surface normal and a
 * fixed light direction: the set where n̂·L̂ is some constant. Drawing a family
 * of them turns a surface into a contour map of its own orientation, and that
 * map reads continuity ONE ORDER HIGHER than the surface itself:
 *
 *   G0 and no more   the lines break across the seam — they do not even meet
 *   G1               the lines MEET but turn a corner where they cross
 *   G2               the lines cross smoothly but their curvature jumps
 *   G3               the lines are curvature-continuous across the seam
 *
 * That is the whole reason a studio uses them. A tangent-plane defect of a
 * tenth of a degree is invisible on a shaded render and unmistakable as a kink
 * in an isophote, because the contour's direction is the normal's derivative
 * and differentiating amplifies exactly the thing you are looking for.
 *
 * NORMALS COME FROM THE SURFACE, NEVER FROM THE MESH. A render mesh splits its
 * normals at the crease angle and averages them everywhere else, so an isophote
 * drawn on render normals shows the smoothing groups. `tessellateQuilt` gives
 * the analytic Coons normal per patch with nothing shared between cells, which
 * is the only honest source: a break in a line drawn on those is a break in the
 * body.
 *
 * WHY IT IS NOT THE ZEBRA. The zebra is an isophote family with two bands and
 * a hard edge, viewed through a camera. This is the same field with the camera
 * taken out — a number per vertex that can be contoured, differenced between
 * two builds, or reported as a distribution. A picture is one use of it.
 *
 * A lens: read-only, authors nothing, feeds nothing downstream.
 * Deterministic: index-ordered traversal, no wall clock, no randomness.
 */

import { nabs, nacos, nfloor, nsqrt, PI } from "@car/num";

export interface IsophoteMesh {
  /** Per-vertex analytic surface normals, 3 per vertex. Need not be unit. */
  readonly normals: Float64Array;
  readonly indices: Uint32Array;
}

export interface IsophoteOptions {
  /** Light direction. Normalised here; need not be unit. */
  readonly light?: readonly [number, number, number];
  /** How many bands the 0..180° range is cut into. */
  readonly bands?: number;
}

export interface IsophoteResult {
  /** cos of the angle between the normal and the light, per vertex, in -1..1. */
  readonly cosine: Float64Array;
  /** That angle in degrees, 0..180. */
  readonly angleDeg: Float64Array;
  /** Which band each vertex falls in. Contours are where this changes. */
  readonly band: Int32Array;
  /** Unit light direction actually used. */
  readonly light: readonly [number, number, number];
  readonly bands: number;
  /**
   * Triangles the contour set crosses — the drawable isophote. Each is a
   * triangle index whose three vertices do not all share a band.
   */
  readonly crossings: Uint32Array;
  /** Vertices whose normal was zero — a degenerate patch corner has none. */
  readonly degenerate: number;
  readonly note: string;
}

/** A light that rakes the body: high, ahead and to one side. Nothing about it
 *  is special except that it is FIXED, so two builds are comparable. */
const DEFAULT_LIGHT: readonly [number, number, number] = [0.40, 0.46, 0.79];
const DEFAULT_BANDS = 24;

export function isophoteField(
  mesh: IsophoteMesh,
  opts: IsophoteOptions = {},
): IsophoteResult {
  const raw = opts.light ?? DEFAULT_LIGHT;
  const ll = nsqrt(raw[0] * raw[0] + raw[1] * raw[1] + raw[2] * raw[2]);
  if (!(ll > 0)) throw new Error("isophote: light direction is zero");
  const light: readonly [number, number, number] = [raw[0] / ll, raw[1] / ll, raw[2] / ll];
  const bands = Math.max(2, nfloor(opts.bands ?? DEFAULT_BANDS));

  const n = mesh.normals.length / 3;
  const cosine = new Float64Array(n);
  const angleDeg = new Float64Array(n);
  const band = new Int32Array(n);
  let degenerate = 0;

  for (let i = 0; i < n; i++) {
    const x = mesh.normals[i * 3]!, y = mesh.normals[i * 3 + 1]!, z = mesh.normals[i * 3 + 2]!;
    const len = nsqrt(x * x + y * y + z * z);
    if (!(len > 0)) {
      degenerate++;
      band[i] = -1;
      continue;
    }
    const c = (x * light[0] + y * light[1] + z * light[2]) / len;
    const clamped = c > 1 ? 1 : c < -1 ? -1 : c;
    cosine[i] = clamped;
    const deg = (nacos(clamped) * 180) / PI;
    angleDeg[i] = deg;
    // Bands are equal in ANGLE, not in cosine: equal cosine bands crowd at
    // grazing incidence, which is where a highlight actually lives and where
    // the contours would then be too dense to read.
    let b = nfloor((deg / 180) * bands);
    if (b >= bands) b = bands - 1;
    band[i] = b;
  }

  const crossings: number[] = [];
  for (let t = 0; t + 2 < mesh.indices.length; t += 3) {
    const a = band[mesh.indices[t]!]!;
    const b = band[mesh.indices[t + 1]!]!;
    const c = band[mesh.indices[t + 2]!]!;
    if (a < 0 || b < 0 || c < 0) continue;
    if (a !== b || b !== c) crossings.push(t / 3);
  }

  return {
    cosine, angleDeg, band, light, bands,
    crossings: Uint32Array.from(crossings),
    degenerate,
    note:
      `Angle between the surface normal and a fixed light, in ${bands} equal ` +
      "bands over 0-180°. Contours are where the band changes. Read across a " +
      "seam: broken lines are G0, lines that meet at a corner are G1, lines " +
      "that cross smoothly are G2. Analytic normals only — render normals are " +
      "crease-split and would draw the smoothing groups instead.",
  };
}

/**
 * The contours themselves, as line segments in space.
 *
 * Marching triangles on the angle field: for every band boundary a triangle
 * straddles, the two edges that cross it give two points, and the segment
 * between them is a piece of the isophote. Linear interpolation along an edge
 * is exact enough at any density that resolves the surface, and it is what
 * makes the drawing a LINE rather than a staircase of coloured triangles —
 * which matters, because the whole reading is whether the line kinks.
 *
 * Returned flat, NINE numbers per segment: two endpoints and the source
 * triangle's face normal. The normal is there because a contour drawn on a
 * closed body needs back-face culling or the far side of the car shows through
 * its own floor — and a depth sort cannot fix that, since a long thin segment
 * and a large triangle have centroids that sort the wrong way round.
 */
export function isophoteContours(
  mesh: IsophoteMesh & { readonly positions: Float64Array },
  field: IsophoteResult,
): Float64Array {
  const step = 180 / field.bands;
  const out: number[] = [];
  const at = (i: number, k: number): number => mesh.positions[i * 3 + k]!;
  for (let t = 0; t + 2 < mesh.indices.length; t += 3) {
    const v = [mesh.indices[t]!, mesh.indices[t + 1]!, mesh.indices[t + 2]!];
    if (field.band[v[0]!]! < 0 || field.band[v[1]!]! < 0 || field.band[v[2]!]! < 0) continue;
    const a = [field.angleDeg[v[0]!]!, field.angleDeg[v[1]!]!, field.angleDeg[v[2]!]!];
    const lo = Math.min(a[0]!, a[1]!, a[2]!);
    const hi = Math.max(a[0]!, a[1]!, a[2]!);
    const first = nfloor(lo / step) + 1;
    const last = nfloor(hi / step);
    for (let b = first; b <= last; b++) {
      const level = b * step;
      const hits: number[] = [];
      for (let e = 0; e < 3; e++) {
        const i0 = e, i1 = (e + 1) % 3;
        const d0 = a[i0]! - level, d1 = a[i1]! - level;
        if ((d0 <= 0 && d1 > 0) || (d1 <= 0 && d0 > 0)) {
          const f = d0 / (d0 - d1);
          for (let k = 0; k < 3; k++) {
            hits.push(at(v[i0]!, k) + (at(v[i1]!, k) - at(v[i0]!, k)) * f);
          }
        }
      }
      // Two crossings is the ordinary case; a level passing exactly through a
      // vertex can give three, and taking the first two of those is the same
      // segment twice over rather than a wrong one.
      if (hits.length >= 6) {
        out.push(...hits.slice(0, 6));
        const ax = at(v[1]!, 0) - at(v[0]!, 0), ay = at(v[1]!, 1) - at(v[0]!, 1), az = at(v[1]!, 2) - at(v[0]!, 2);
        const bx = at(v[2]!, 0) - at(v[0]!, 0), by = at(v[2]!, 1) - at(v[0]!, 1), bz = at(v[2]!, 2) - at(v[0]!, 2);
        out.push(ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx);
      }
    }
  }
  return Float64Array.from(out);
}

/**
 * How straight the isophote family runs, per vertex: the magnitude of the
 * change in the field across the vertex's ring, normalised.
 *
 * A HIGH value is a place the normal is turning fast — a highlight edge, or a
 * defect. This is the scalar to paint when a picture of the contours is too
 * fine to read at print size, and it is what makes the lens usable as a number
 * rather than only as a drawing.
 */
export function isophoteGradient(mesh: IsophoteMesh, field: IsophoteResult): Float64Array {
  const n = field.cosine.length;
  const out = new Float64Array(n);
  const count = new Int32Array(n);
  for (let t = 0; t + 2 < mesh.indices.length; t += 3) {
    const v = [mesh.indices[t]!, mesh.indices[t + 1]!, mesh.indices[t + 2]!];
    for (let i = 0; i < 3; i++) {
      for (let j = i + 1; j < 3; j++) {
        const d = nabs(field.cosine[v[i]!]! - field.cosine[v[j]!]!);
        out[v[i]!]! += d; count[v[i]!]!++;
        out[v[j]!]! += d; count[v[j]!]!++;
      }
    }
  }
  for (let i = 0; i < n; i++) if (count[i]! > 0) out[i]! /= count[i]!;
  return out;
}
