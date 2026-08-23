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
  /** 1 where the reading means something, 0 at a collapsed patch corner. */
  readonly valid: Uint8Array;
  /** Vertices with no measurable curvature — a collapsed ring. */
  readonly degenerate: number;
  /** The threshold applied, mm² — one per cent of the median face area. */
  readonly areaFloorMm2: number;
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

  // Some vertices have no curvature to report, and the honest answer is to
  // say so rather than to bound a meaningless number.
  //
  // A vertex ringed by slivers has a mixed area near zero — on the P1 it was
  // 1e-10 mm² against a median face of 485. |Δx|/2A there first reported
  // 3.5e14 per mm, a radius of 1e-14 mm, and flooring the AREA only moved it
  // to 59 per mm, because the Laplacian at such a vertex is as meaningless as
  // the area. Percentiles could not save it either: the bad vertices ARE the
  // top of the distribution, so a 98th percentile lands inside them.
  //
  // So a vertex whose ring is under one per cent of a median face is marked
  // invalid, reads zero, and is left out of the display range. `degenerate`
  // says how many, because a lens that quietly drops part of a mesh is worse
  // than one that reports nonsense.
  //
  // WHAT THIS COMMENT USED TO SAY, AND WHY IT MATTERED. It attributed the
  // slivers to collapsed Coons patch corners. That was never measured, only
  // assumed — and it was wrong: `degeneratePatches` finds ZERO collapsed sides
  // on that body, and the mesher's own table agrees. The real cause was 214
  // near-duplicate grid columns in `meshQuilt`, trim endpoints landing an ulp
  // off a lattice point, each spreading a column of zero-area quads across its
  // cell. Fixing that took this count from 980 vertices to 45.
  //
  // The reading was right and the reason was invented, which is worse than
  // useless: it got quoted onward as fact and put a defect on the geometry
  // that belonged to the mesher. A lens may report what it cannot measure. It
  // may not name a cause it did not look for.
  const faceAreas: number[] = [];
  for (let t = 0; t < triCount; t++) {
    const i = indices[t * 3]!, j = indices[t * 3 + 1]!, k = indices[t * 3 + 2]!;
    const ux = positions[j * 3]! - positions[i * 3]!;
    const uy = positions[j * 3 + 1]! - positions[i * 3 + 1]!;
    const uz = positions[j * 3 + 2]! - positions[i * 3 + 2]!;
    const vx = positions[k * 3]! - positions[i * 3]!;
    const vy = positions[k * 3 + 1]! - positions[i * 3 + 1]!;
    const vz = positions[k * 3 + 2]! - positions[i * 3 + 2]!;
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    faceAreas.push(nsqrt(nx * nx + ny * ny + nz * nz) / 2);
  }
  faceAreas.sort((a, b) => a - b);
  const medianFace = faceAreas.length === 0 ? 0 : faceAreas[Math.floor(faceAreas.length / 2)]!;
  const areaFloor = medianFace / 100;

  const mean = new Float64Array(vertCount);
  const gaussian = new Float64Array(vertCount);
  const valid = new Uint8Array(vertCount);
  let degenerate = 0;
  for (let v = 0; v < vertCount; v++) {
    const a = area[v]!;
    if (a <= 0) continue;
    if (a < areaFloor) { degenerate++; continue; }
    valid[v] = 1;
    const lx = lap[v * 3]! / (2 * a), ly = lap[v * 3 + 1]! / (2 * a), lz = lap[v * 3 + 2]! / (2 * a);
    const m = nsqrt(lx * lx + ly * ly + lz * lz) / 2;
    const nx = normal[v * 3]!, ny = normal[v * 3 + 1]!, nz = normal[v * 3 + 2]!;
    // Sign from which side of the surface the Laplacian points.
    mean[v] = (lx * nx + ly * ny + lz * nz) >= 0 ? -m : m;
    gaussian[v] = (2 * Math.PI - angle[v]!) / a;
  }

  // Percentiles over the VALID vertices only, and percentiles rather than
  // min and max: one bad vertex at a wheel rim would otherwise set the colour
  // scale for the whole car.
  const mags: number[] = [];
  for (let v = 0; v < vertCount; v++) if (valid[v] === 1) mags.push(Math.abs(mean[v]!));
  mags.sort((a, b) => a - b);
  const at = (p: number): number => mags.length === 0 ? 0 : mags[Math.min(mags.length - 1, Math.floor(p * mags.length))]!;

  return {
    mean, gaussian, area,
    valid,
    degenerate,
    areaFloorMm2: areaFloor,
    meanP02: at(0.02),
    meanP98: at(0.98),
    note:
      "Discrete operators on the DERIVED mesh: cotangent Laplace–Beltrami for mean, " +
      "angle deficit over barycentric area for Gaussian. A reading is a property of " +
      "the tessellation as much as the surface — two readings at different mesh " +
      "densities are not comparable. A vertex whose ring is under one per cent " +
      "of a median face has no measurable curvature: it reads zero, is marked " +
      "invalid, and is left out of the display range.",
  };
}
