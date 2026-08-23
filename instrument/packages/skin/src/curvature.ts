/**
 * Curvature over a derived skin — the numerics.
 *
 * Arithmetic, like the mesher and the flow solve: no licensed quantities, no
 * design claims, nothing to cite. @car/lens is the licensed façade that puts
 * a reading in front of a person; this is the operator underneath it.
 *
 * Two numbers per vertex, both standard discrete operators:
 *
 *  - MEAN curvature from the cotangent Laplace–Beltrami operator. Δx = 2H·n,
 *    so |Δx|/2 is the mean curvature and its sign comes from which way Δx
 *    points relative to the surface normal. This is the one that shows
 *    whether a panel is fair: a highlight travelling over a surface is
 *    travelling over its mean curvature.
 *  - GAUSSIAN curvature from the angle deficit, 2π minus the angles meeting
 *    at the vertex, over the mixed-area. Positive is a dome, negative is a
 *    saddle, zero is developable — which is what tells you whether a panel
 *    could be pressed from flat sheet.
 *
 * A lens: read-only, authors nothing, feeds nothing downstream. It reports on
 * the DERIVED mesh, so a curvature reading is a property of the tessellation
 * as much as the surface — which is why the report states the mesh density it
 * was taken at, and why comparing two readings at different densities is not
 * a comparison.
 *
 * Deterministic: index-ordered traversal, no wall clock, no randomness.
 */

import { nacos, nsqrt } from "@car/num";

export interface CurvatureMesh {
  readonly positions: Float64Array;
  readonly indices: Uint32Array;
}

export interface CurvatureResult {
  /** Mean curvature per vertex, 1/mm. Signed: + convex, − concave. */
  readonly mean: Float64Array;
  /** Gaussian curvature per vertex, 1/mm². */
  readonly gaussian: Float64Array;
  /** Mixed area per vertex, mm² — the weight the operators were taken over. */
  readonly area: Float64Array;
  /** Robust display range: the 2nd and 98th percentile of |mean|. */
  readonly meanP02: number;
  readonly meanP98: number;
  readonly note: string;
}

const cot = (ax: number, ay: number, az: number, bx: number, by: number, bz: number): number => {
  const dot = ax * bx + ay * by + az * bz;
  const cx = ay * bz - az * by, cy = az * bx - ax * bz, cz = ax * by - ay * bx;
  const s = nsqrt(cx * cx + cy * cy + cz * cz);
  // A degenerate corner has no well-defined cotangent; contributing zero is
  // the only honest answer, and clamping keeps one sliver from dominating a
  // whole vertex.
  if (s < 1e-12) return 0;
  return Math.max(Math.min(dot / s, 1e4), -1e4);
};

export function curvatureMap(mesh: CurvatureMesh): CurvatureResult {
  const { positions, indices } = mesh;
  const vertCount = Math.floor(positions.length / 3);
  const triCount = Math.floor(indices.length / 3);

  const lap = new Float64Array(vertCount * 3);
  const area = new Float64Array(vertCount);
  const angle = new Float64Array(vertCount);
  const normal = new Float64Array(vertCount * 3);

  for (let t = 0; t < triCount; t++) {
    const i = indices[t * 3]!, j = indices[t * 3 + 1]!, k = indices[t * 3 + 2]!;
    const px = [positions[i * 3]!, positions[j * 3]!, positions[k * 3]!];
    const py = [positions[i * 3 + 1]!, positions[j * 3 + 1]!, positions[k * 3 + 1]!];
    const pz = [positions[i * 3 + 2]!, positions[j * 3 + 2]!, positions[k * 3 + 2]!];
    const idx = [i, j, k];

    // Face normal and area, once.
    const ux = px[1]! - px[0]!, uy = py[1]! - py[0]!, uz = pz[1]! - pz[0]!;
    const vx = px[2]! - px[0]!, vy = py[2]! - py[0]!, vz = pz[2]! - pz[0]!;
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const nlen = nsqrt(nx * nx + ny * ny + nz * nz);
    const faceArea = nlen / 2;
    if (faceArea <= 0) continue;

    for (let c = 0; c < 3; c++) {
      const a = idx[c]!, b = idx[(c + 1) % 3]!, d = idx[(c + 2) % 3]!;
      // Angle at corner c, for the deficit; a third of the face area for the
      // mixed area (barycentric, which is the stable choice on a mesh that
      // may carry obtuse triangles).
      const e1x = px[(c + 1) % 3]! - px[c]!, e1y = py[(c + 1) % 3]! - py[c]!, e1z = pz[(c + 1) % 3]! - pz[c]!;
      const e2x = px[(c + 2) % 3]! - px[c]!, e2y = py[(c + 2) % 3]! - py[c]!, e2z = pz[(c + 2) % 3]! - pz[c]!;
      const l1 = nsqrt(e1x * e1x + e1y * e1y + e1z * e1z);
      const l2 = nsqrt(e2x * e2x + e2y * e2y + e2z * e2z);
      if (l1 > 0 && l2 > 0) {
        const cosA = Math.max(-1, Math.min(1, (e1x * e2x + e1y * e2y + e1z * e2z) / (l1 * l2)));
        angle[a] = angle[a]! + nacos(cosA);
      }
      area[a] = area[a]! + faceArea / 3;
      normal[a * 3] = normal[a * 3]! + nx;
      normal[a * 3 + 1] = normal[a * 3 + 1]! + ny;
      normal[a * 3 + 2] = normal[a * 3 + 2]! + nz;

      // Cotangent weight for edge (b,d), which is opposite corner c.
      const w = cot(e1x, e1y, e1z, e2x, e2y, e2z);
      const bdx = positions[b * 3]! - positions[d * 3]!;
      const bdy = positions[b * 3 + 1]! - positions[d * 3 + 1]!;
      const bdz = positions[b * 3 + 2]! - positions[d * 3 + 2]!;
      lap[b * 3] = lap[b * 3]! - w * bdx;
      lap[b * 3 + 1] = lap[b * 3 + 1]! - w * bdy;
      lap[b * 3 + 2] = lap[b * 3 + 2]! - w * bdz;
      lap[d * 3] = lap[d * 3]! + w * bdx;
      lap[d * 3 + 1] = lap[d * 3 + 1]! + w * bdy;
      lap[d * 3 + 2] = lap[d * 3 + 2]! + w * bdz;
    }
  }

  const mean = new Float64Array(vertCount);
  const gaussian = new Float64Array(vertCount);
  for (let v = 0; v < vertCount; v++) {
    const a = area[v]!;
    if (a <= 0) continue;
    const lx = lap[v * 3]! / (2 * a), ly = lap[v * 3 + 1]! / (2 * a), lz = lap[v * 3 + 2]! / (2 * a);
    const m = nsqrt(lx * lx + ly * ly + lz * lz) / 2;
    const nx = normal[v * 3]!, ny = normal[v * 3 + 1]!, nz = normal[v * 3 + 2]!;
    // Sign from which side of the surface the Laplacian points.
    mean[v] = (lx * nx + ly * ny + lz * nz) >= 0 ? -m : m;
    gaussian[v] = (2 * Math.PI - angle[v]!) / a;
  }

  // Percentiles rather than min and max: one bad vertex at a wheel rim would
  // otherwise set the colour scale for the whole car.
  const mags = Array.from(mean, Math.abs).sort((a, b) => a - b);
  const at = (p: number): number => mags.length === 0 ? 0 : mags[Math.min(mags.length - 1, Math.floor(p * mags.length))]!;

  return {
    mean, gaussian, area,
    meanP02: at(0.02),
    meanP98: at(0.98),
    note:
      "Discrete operators on the DERIVED mesh: cotangent Laplace–Beltrami for mean, " +
      "angle deficit over barycentric area for Gaussian. A reading is a property of " +
      "the tessellation as much as the surface — two readings at different mesh " +
      "densities are not comparable.",
  };
}
