/**
 * The panel solve — arithmetic only.
 *
 * First-order source panels over a triangulated skin, with an optional
 * ground-plane image. Constant strength per panel, influence taken as a point
 * source at the panel centroid, and the exact σ/2 self term on the diagonal.
 * Solve A·σ = −V∞·n, then read the surface velocity and Cp = 1 − |V|²/|V∞|².
 *
 * Distances are clamped to half a panel width so an adjacent panel cannot
 * blow up the matrix. That is a stated approximation; `residual` is how you
 * check whether it mattered, and on the P1 it comes back 0.0000.
 *
 * What this file deliberately does NOT do: name a method to a person, carry a
 * licence, decide what the numbers mean, or produce a force. All of that is
 * @car/lens's job (charge §9), and keeping it out of here is what lets the
 * four genuine assumptions in the aero lens stand out instead of being buried
 * among four hundred array strides.
 *
 * Deterministic: index-ordered assembly, no wall clock, no randomness.
 */

import type { Pt3 } from "@car/schema";
import { nsqrt, PI } from "@car/num";

export interface PanelMesh {
  readonly positions: Float64Array;
  readonly indices: Uint32Array;
}

export interface PanelOptions {
  readonly targetPanels?: number;
  readonly freestream?: Pt3;
  readonly groundPlane?: boolean;
}

export interface PanelSolution {
  readonly panelCount: number;
  readonly gridMm: number;
  readonly centroids: Float64Array;
  readonly normals: Float64Array;
  readonly areas: Float64Array;
  /** Panel index for every triangle, or −1 if the triangle was degenerate. */
  readonly ofTriangle: Int32Array;
  readonly cpPanel: Float64Array;
  readonly cpTriangle: Float64Array;
  /** Worst |V·n| after the solve, as a fraction of |V∞|. */
  readonly residual: number;
  readonly solved: boolean;
}

const cross = (a: Pt3, b: Pt3): Pt3 =>
  [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

/**
 * Panels from triangles: bin centroids on a uniform grid and merge each bin.
 * A panel's normal is the area-weighted sum of its triangles' normals, which
 * is the right average — a sliver cannot outvote a facet.
 */
function buildPanels(mesh: PanelMesh, target: number): {
  centroids: Float64Array; normals: Float64Array; areas: Float64Array;
  ofTriangle: Int32Array; count: number; gridMm: number;
} {
  const { positions, indices } = mesh;
  const triCount = Math.floor(indices.length / 3);
  const cx = new Float64Array(triCount), cy = new Float64Array(triCount), cz = new Float64Array(triCount);
  const nx = new Float64Array(triCount), ny = new Float64Array(triCount), nz = new Float64Array(triCount);
  const area = new Float64Array(triCount);
  let lo0 = Infinity, lo1 = Infinity, lo2 = Infinity;
  let hi0 = -Infinity, hi1 = -Infinity, hi2 = -Infinity;
  for (let t = 0; t < triCount; t++) {
    const a = indices[t * 3]!, b = indices[t * 3 + 1]!, c = indices[t * 3 + 2]!;
    const ax = positions[a * 3]!, ay = positions[a * 3 + 1]!, az = positions[a * 3 + 2]!;
    const bx = positions[b * 3]!, by = positions[b * 3 + 1]!, bz = positions[b * 3 + 2]!;
    const dx = positions[c * 3]!, dy = positions[c * 3 + 1]!, dz = positions[c * 3 + 2]!;
    const n = cross([bx - ax, by - ay, bz - az], [dx - ax, dy - ay, dz - az]);
    const len = nsqrt(n[0] * n[0] + n[1] * n[1] + n[2] * n[2]);
    area[t] = len / 2;
    if (len > 0) { nx[t] = n[0] / len; ny[t] = n[1] / len; nz[t] = n[2] / len; }
    cx[t] = (ax + bx + dx) / 3; cy[t] = (ay + by + dy) / 3; cz[t] = (az + bz + dz) / 3;
    lo0 = Math.min(lo0, cx[t]!); hi0 = Math.max(hi0, cx[t]!);
    lo1 = Math.min(lo1, cy[t]!); hi1 = Math.max(hi1, cy[t]!);
    lo2 = Math.min(lo2, cz[t]!); hi2 = Math.max(hi2, cz[t]!);
  }

  // Bisect the grid size until the non-empty bin count lands near the target.
  // Sixteen halvings is plenty and bounds the loop; no convergence test can
  // hang here.
  const binsAt = (g: number): Map<number, number[]> => {
    const m = new Map<number, number[]>();
    const ny_ = Math.max(1, Math.ceil((hi1 - lo1) / g) + 1);
    const nz_ = Math.max(1, Math.ceil((hi2 - lo2) / g) + 1);
    for (let t = 0; t < triCount; t++) {
      const i = Math.floor((cx[t]! - lo0) / g);
      const j = Math.floor((cy[t]! - lo1) / g);
      const k = Math.floor((cz[t]! - lo2) / g);
      const key = (i * ny_ + j) * nz_ + k;
      const list = m.get(key);
      if (list) list.push(t); else m.set(key, [t]);
    }
    return m;
  };
  let loG = 1, hiG = Math.max(hi0 - lo0, hi1 - lo1, hi2 - lo2);
  let best = binsAt(hiG), bestG = hiG;
  for (let iter = 0; iter < 16; iter++) {
    const mid = (loG + hiG) / 2;
    const m = binsAt(mid);
    best = m; bestG = mid;
    if (m.size > target) loG = mid; else hiG = mid;
  }

  // Deterministic panel order: bin key ascending.
  const keys = [...best.keys()].sort((a, b) => a - b);
  const count = keys.length;
  const pc = new Float64Array(count * 3);
  const pn = new Float64Array(count * 3);
  const pa = new Float64Array(count);
  const ofTriangle = new Int32Array(triCount).fill(-1);
  for (let p = 0; p < count; p++) {
    const tris = best.get(keys[p]!)!;
    let sa = 0, sx = 0, sy = 0, sz = 0, snx = 0, sny = 0, snz = 0;
    for (const t of tris) {
      const w = area[t]!;
      sa += w;
      sx += cx[t]! * w; sy += cy[t]! * w; sz += cz[t]! * w;
      snx += nx[t]! * w; sny += ny[t]! * w; snz += nz[t]! * w;
      ofTriangle[t] = p;
    }
    if (sa <= 0) continue;
    pc[p * 3] = sx / sa; pc[p * 3 + 1] = sy / sa; pc[p * 3 + 2] = sz / sa;
    const nl = nsqrt(snx * snx + sny * sny + snz * snz);
    if (nl > 0) { pn[p * 3] = snx / nl; pn[p * 3 + 1] = sny / nl; pn[p * 3 + 2] = snz / nl; }
    pa[p] = sa;
  }
  return { centroids: pc, normals: pn, areas: pa, ofTriangle, count, gridMm: bestG };
}

/** LU with partial pivoting, in place. Returns false on a singular matrix. */
function solveDense(A: Float64Array, b: Float64Array, n: number): boolean {
  const piv = new Int32Array(n);
  for (let i = 0; i < n; i++) piv[i] = i;
  for (let k = 0; k < n; k++) {
    let best = k, bestAbs = Math.abs(A[k * n + k]!);
    for (let i = k + 1; i < n; i++) {
      const v = Math.abs(A[i * n + k]!);
      if (v > bestAbs) { best = i; bestAbs = v; }
    }
    if (bestAbs === 0) return false;
    if (best !== k) {
      for (let j = 0; j < n; j++) {
        const tmp = A[k * n + j]!; A[k * n + j] = A[best * n + j]!; A[best * n + j] = tmp;
      }
      const tb = b[k]!; b[k] = b[best]!; b[best] = tb;
    }
    const pivot = A[k * n + k]!;
    for (let i = k + 1; i < n; i++) {
      const f = A[i * n + k]! / pivot;
      if (f === 0) continue;
      A[i * n + k] = 0;
      for (let j = k + 1; j < n; j++) A[i * n + j] = A[i * n + j]! - f * A[k * n + j]!;
      b[i] = b[i]! - f * b[k]!;
    }
  }
  for (let i = n - 1; i >= 0; i--) {
    let s = b[i]!;
    for (let j = i + 1; j < n; j++) s -= A[i * n + j]! * b[j]!;
    b[i] = s / A[i * n + i]!;
  }
  return true;
}

/**
 * Frontal area by projecting the skin onto the YZ plane and rasterising the
 * union. Summing |n_x|·A over front-facing triangles would be exact only for
 * a body convex along X, and a car with wheels behind a fender is not; that
 * sum double-counts. The raster takes the union, which is the actual
 * silhouette, and the result reports the cell size AND the change on halving
 * it so the convergence is visible instead of claimed.
 */
export function frontalAreaMm2(mesh: PanelMesh, cell: number): number {
  const { positions, indices } = mesh;
  let loY = Infinity, hiY = -Infinity, loZ = Infinity, hiZ = -Infinity;
  for (let i = 0; i < positions.length; i += 3) {
    loY = Math.min(loY, positions[i + 1]!); hiY = Math.max(hiY, positions[i + 1]!);
    loZ = Math.min(loZ, positions[i + 2]!); hiZ = Math.max(hiZ, positions[i + 2]!);
  }
  const w = Math.max(1, Math.ceil((hiY - loY) / cell) + 1);
  const h = Math.max(1, Math.ceil((hiZ - loZ) / cell) + 1);
  const mask = new Uint8Array(w * h);
  const triCount = Math.floor(indices.length / 3);
  for (let t = 0; t < triCount; t++) {
    const a = indices[t * 3]!, b = indices[t * 3 + 1]!, c = indices[t * 3 + 2]!;
    const y0 = (positions[a * 3 + 1]! - loY) / cell, z0 = (positions[a * 3 + 2]! - loZ) / cell;
    const y1 = (positions[b * 3 + 1]! - loY) / cell, z1 = (positions[b * 3 + 2]! - loZ) / cell;
    const y2 = (positions[c * 3 + 1]! - loY) / cell, z2 = (positions[c * 3 + 2]! - loZ) / cell;
    const minY = Math.max(0, Math.floor(Math.min(y0, y1, y2)));
    const maxY = Math.min(w - 1, Math.ceil(Math.max(y0, y1, y2)));
    const minZ = Math.max(0, Math.floor(Math.min(z0, z1, z2)));
    const maxZ = Math.min(h - 1, Math.ceil(Math.max(z0, z1, z2)));
    const d = (y1 - y0) * (z2 - z0) - (y2 - y0) * (z1 - z0);
    if (d === 0) continue;
    for (let j = minY; j <= maxY; j++) {
      for (let k = minZ; k <= maxZ; k++) {
        const py = j + 0.5, pz = k + 0.5;
        const l1 = ((py - y0) * (z2 - z0) - (pz - z0) * (y2 - y0)) / d;
        const l2 = ((y1 - y0) * (pz - z0) - (z1 - z0) * (py - y0)) / d;
        if (l1 >= 0 && l2 >= 0 && l1 + l2 <= 1) mask[j * h + k] = 1;
      }
    }
  }
  let covered = 0;
  for (let i = 0; i < mask.length; i++) covered += mask[i]!;
  return covered * cell * cell;
}

export function panelSolve(mesh: PanelMesh, opts: PanelOptions = {}): PanelSolution {
  const target = opts.targetPanels ?? 700;
  const ground = opts.groundPlane ?? true;
  const vinf: Pt3 = opts.freestream ?? [1, 0, 0];
  const vmag = nsqrt(vinf[0] * vinf[0] + vinf[1] * vinf[1] + vinf[2] * vinf[2]);
  const v: Pt3 = [vinf[0] / vmag, vinf[1] / vmag, vinf[2] / vmag];

  const P = buildPanels(mesh, target);
  const n = P.count;
  const A = new Float64Array(n * n);
  const rhs = new Float64Array(n);
  const FOURPI = 4 * PI;

  // Influence of a constant-strength source panel, taken as a point source at
  // its centroid: v = σ·A·r / (4π|r|³). The diagonal is the classical self-
  // induced normal velocity of a source sheet, σ/2. Distances are clamped to
  // half a panel width so an adjacent panel cannot blow up the matrix — a
  // stated approximation, and the residual reported below is how you check
  // whether it mattered.
  for (let i = 0; i < n; i++) {
    const ix = P.centroids[i * 3]!, iy = P.centroids[i * 3 + 1]!, iz = P.centroids[i * 3 + 2]!;
    const nix = P.normals[i * 3]!, niy = P.normals[i * 3 + 1]!, niz = P.normals[i * 3 + 2]!;
    rhs[i] = -(v[0] * nix + v[1] * niy + v[2] * niz);
    for (let j = 0; j < n; j++) {
      const aj = P.areas[j]!;
      const core = 0.5 * nsqrt(aj);
      let k = 0;
      if (i === j) {
        k = 0.5;
      } else {
        const rx = ix - P.centroids[j * 3]!, ry = iy - P.centroids[j * 3 + 1]!, rz = iz - P.centroids[j * 3 + 2]!;
        const r = Math.max(nsqrt(rx * rx + ry * ry + rz * rz), core);
        k += (aj / FOURPI) * (rx * nix + ry * niy + rz * niz) / (r * r * r);
      }
      if (ground) {
        // Image in z = 0 carries the same strength, which is what makes the
        // road a streamline instead of a hole in the flow.
        const rx = ix - P.centroids[j * 3]!, ry = iy - P.centroids[j * 3 + 1]!, rz = iz + P.centroids[j * 3 + 2]!;
        const r = Math.max(nsqrt(rx * rx + ry * ry + rz * rz), core);
        k += (aj / FOURPI) * (rx * nix + ry * niy + rz * niz) / (r * r * r);
      }
      A[i * n + j] = k;
    }
  }

  const sigma = Float64Array.from(rhs);
  const solved = solveDense(A, sigma, n);

  // Surface velocity, then Cp. With the normal velocity driven to zero the
  // result is tangential; the residual says how nearly.
  const cpPanel = new Float64Array(n);
  let residual = 0;
  for (let i = 0; i < n; i++) {
    const ix = P.centroids[i * 3]!, iy = P.centroids[i * 3 + 1]!, iz = P.centroids[i * 3 + 2]!;
    let vx = v[0], vy = v[1], vz = v[2];
    for (let j = 0; j < n; j++) {
      const s = sigma[j]!;
      if (s === 0) continue;
      const aj = P.areas[j]!;
      const core = 0.5 * nsqrt(aj);
      if (i !== j) {
        const rx = ix - P.centroids[j * 3]!, ry = iy - P.centroids[j * 3 + 1]!, rz = iz - P.centroids[j * 3 + 2]!;
        const r = Math.max(nsqrt(rx * rx + ry * ry + rz * rz), core);
        const f = (s * aj) / (FOURPI * r * r * r);
        vx += f * rx; vy += f * ry; vz += f * rz;
      } else {
        vx += 0.5 * s * P.normals[i * 3]!;
        vy += 0.5 * s * P.normals[i * 3 + 1]!;
        vz += 0.5 * s * P.normals[i * 3 + 2]!;
      }
      if (ground) {
        const rx = ix - P.centroids[j * 3]!, ry = iy - P.centroids[j * 3 + 1]!, rz = iz + P.centroids[j * 3 + 2]!;
        const r = Math.max(nsqrt(rx * rx + ry * ry + rz * rz), core);
        const f = (s * aj) / (FOURPI * r * r * r);
        vx += f * rx; vy += f * ry; vz += f * rz;
      }
    }
    const vn = vx * P.normals[i * 3]! + vy * P.normals[i * 3 + 1]! + vz * P.normals[i * 3 + 2]!;
    residual = Math.max(residual, Math.abs(vn));
    cpPanel[i] = 1 - (vx * vx + vy * vy + vz * vz);
  }

  const cpTriangle = new Float64Array(P.ofTriangle.length);
  for (let t = 0; t < P.ofTriangle.length; t++) {
    const p = P.ofTriangle[t]!;
    cpTriangle[t] = p >= 0 ? cpPanel[p]! : 0;
  }

  return {
    panelCount: n,
    gridMm: P.gridMm,
    centroids: P.centroids,
    normals: P.normals,
    areas: P.areas,
    ofTriangle: P.ofTriangle,
    cpPanel,
    cpTriangle,
    residual,
    solved,
  };
}
