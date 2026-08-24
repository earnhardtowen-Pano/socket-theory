/**
 * Mirror symmetry — does a car authored down both sides BUILD down both sides?
 *
 * Nothing in the package asked this until an MX-5 came out 8.9 mm wider on one
 * flank than the other and every probe said the body was fine. They all said
 * so honestly: G1 reads a seam, G2 reads a curvature, the closed-mesh check
 * reads a topology, and none of them compares the car to its own reflection.
 * A left-right disagreement is invisible to every one of them and glaring to
 * a person, which is the definition of a lens worth building.
 *
 * WHAT IT MEASURES. For every vertex, the distance to the nearest vertex of
 * the mirrored body. Not a signature, not a hash: a distance in millimetres,
 * so the answer is a number a person can hold against a tolerance. Grid-hashed
 * so it is linear in the mesh rather than quadratic.
 *
 * WHAT IT DOES NOT MEAN. A car MAY be asymmetric on purpose — an exhaust
 * cutout, a filler flap, a driver-side mirror. This reports the disagreement;
 * it never claims one is wrong. It is the build script that knows whether its
 * car was authored symmetric, and the build script that should fail on this.
 *
 * The one trap: a mesh generated from a mirror twin is symmetric BY
 * CONSTRUCTION and proves nothing about the authoring. That is fine — the
 * defect this exists to catch is the opposite one, a car authored on both
 * sides that the tooling then treats differently on each.
 */

export interface MirrorSymmetry {
  /** Worst distance from a vertex to the mirrored body, mm. */
  readonly worst: number;
  /** Where that vertex is. */
  readonly worstAt: readonly [number, number, number];
  /** Median over all vertices, mm — the noise floor rather than the outlier. */
  readonly median: number;
  /** How many vertices are further out than `tolerance`. */
  readonly over: number;
  readonly vertices: number;
  readonly tolerance: number;
}

export interface MirrorSymmetryOptions {
  /** Vertices further than this from the reflection are counted. Default 0.05 mm. */
  readonly tolerance?: number;
  /** Grid cell for the hash, mm. Must exceed any gap you care to resolve. */
  readonly cell?: number;
}

const DEFAULT_TOLERANCE = 0.05;
const DEFAULT_CELL = 4;

export function mirrorSymmetry(
  mesh: { readonly positions: Float64Array },
  opts: MirrorSymmetryOptions = {},
): MirrorSymmetry {
  const tolerance = opts.tolerance ?? DEFAULT_TOLERANCE;
  const cell = opts.cell ?? DEFAULT_CELL;
  const p = mesh.positions;
  const n = p.length / 3;
  if (n === 0) {
    return { worst: 0, worstAt: [0, 0, 0], median: 0, over: 0, vertices: 0, tolerance };
  }

  const key = (x: number, y: number, z: number): string =>
    `${Math.floor(x / cell)},${Math.floor(y / cell)},${Math.floor(z / cell)}`;
  const bucket = new Map<string, number[]>();
  for (let i = 0; i < p.length; i += 3) {
    const k = key(p[i]!, p[i + 1]!, p[i + 2]!);
    const at = bucket.get(k);
    if (at) at.push(i); else bucket.set(k, [i]);
  }

  const all = new Float64Array(n);
  let worst = 0;
  let worstAt: [number, number, number] = [0, 0, 0];
  let over = 0;
  for (let i = 0; i < p.length; i += 3) {
    // The reflection of this vertex, and the nearest real vertex to it.
    const x = p[i]!, y = -p[i + 1]!, z = p[i + 2]!;
    const cx = Math.floor(x / cell), cy = Math.floor(y / cell), cz = Math.floor(z / cell);
    let best = Infinity;
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dz = -1; dz <= 1; dz++) {
          const at = bucket.get(`${cx + dx},${cy + dy},${cz + dz}`);
          if (!at) continue;
          for (const j of at) {
            const ex = p[j]! - x, ey = p[j + 1]! - y, ez = p[j + 2]! - z;
            const d = Math.sqrt(ex * ex + ey * ey + ez * ez);
            if (d < best) best = d;
          }
        }
      }
    }
    // A vertex with nothing within one grid cell of its reflection is as far
    // out as the search can see; report the horizon rather than Infinity, and
    // let the caller widen the cell if that is not enough.
    if (!Number.isFinite(best)) best = cell;
    all[i / 3] = best;
    if (best > tolerance) over++;
    if (best > worst) { worst = best; worstAt = [p[i]!, p[i + 1]!, p[i + 2]!]; }
  }

  const sorted = Float64Array.from(all).sort();
  const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
  return { worst, worstAt, median, over, vertices: n, tolerance };
}
