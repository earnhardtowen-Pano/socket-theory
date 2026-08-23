/**
 * The aero lens (charge §9) — stamped, and honest about its shape.
 *
 * WHAT THIS IS. A classical first-order source-panel solve over the sampled
 * quilt, with a ground-plane image. It returns a pressure-coefficient map to
 * colour the skin with. Potential flow: no viscosity, no wake, no circulation,
 * therefore no lift and no drag. That is not a limitation to be apologised
 * for later — it is the method, and everything below is arranged so that
 * nothing downstream can mistake the map for a force.
 *
 * WHAT IT IS NOT.
 *  - It is not a drag figure. Drag and power come from a SOURCED Cd times the
 *    frontal area this model actually has, in `dragAndPower`, which never
 *    reads the map. A panel solve of this class cannot produce a Cd, and
 *    reporting one off the integral of Cp would be the most convincing wrong
 *    number in the whole tool.
 *  - It is not a separation prediction. Separation is beyond the method
 *    entirely. `separated` is a crude adverse-recovery flag, ASSUMED-tagged,
 *    and the lens says so in its own notes so the flag cannot travel without
 *    its warning.
 *  - It never authors. Nothing here returns geometry, and nothing downstream
 *    consumes its output (overlay law, charge §2).
 *
 * SPEED INDEPENDENCE. Cp in potential flow is independent of freestream
 * speed, so one solve serves every speed the user types; only the force
 * rescale by v² knows about MPH. That is why the solve takes no speed at all.
 *
 * Deterministic: index-ordered assembly and traversal, no wall clock, no
 * randomness, transcendentals via @car/num.
 */

import type { Pt3, Quantity } from "@car/schema";
import { assumed, derived, sourced } from "@car/demand";
import { nsqrt, PI } from "@car/num";

export interface AeroMesh {
  readonly positions: Float64Array;
  readonly indices: Uint32Array;
}

export interface AeroOptions {
  /** Panels to aim for. The binning grid is sized to land near this. */
  readonly targetPanels?: number;
  /** Freestream direction; the car travels along −X, so air comes from −X. */
  readonly freestream?: Pt3;
  /** Mirror the body in z = 0 so the road is a streamline. Default true. */
  readonly groundPlane?: boolean;
  /** Raster cell for the frontal-area projection, mm. Default 2. */
  readonly frontalCellMm?: number;
}

export interface AeroResult {
  /** The method, in one line, carried with the result so it cannot be lost. */
  readonly method: string;
  readonly panelCount: number;
  readonly panelGridMm: number;
  /** Cp per panel, and the same value spread back over every triangle. */
  readonly cpPanel: Float64Array;
  readonly cpTriangle: Float64Array;
  readonly cpMin: number;
  readonly cpMax: number;
  /**
   * Robust display bounds: the 2nd and 98th percentile of Cp. Potential flow
   * puts unbounded suction on a sharp convex edge, so the raw minimum is set
   * by one panel on the splitter lip and colouring to it compresses the whole
   * car into two shades of blue. min and max stay reported — they are the
   * truth about the solve — but the ramp should use these.
   */
  readonly cpP02: number;
  readonly cpP98: number;
  /** ASSUMED adverse-recovery flag per panel. Never a separation prediction. */
  readonly separated: Uint8Array;
  readonly separatedCount: number;
  /** Worst residual normal velocity after the solve, as a fraction of V∞. */
  readonly residual: number;
  readonly frontalArea: Quantity<"m2">;
  readonly frontalAreaCellMm: number;
  /** |area at the cell size − area at twice it|, m². Convergence, shown. */
  readonly frontalAreaConvergence: number;
  readonly notes: readonly string[];
}

const AIR_DENSITY: Quantity<"kg/m3"> = sourced(
  1.225, "kg/m3",
  "ISO 2533 International Standard Atmosphere, sea level, 15 °C",
  "the standard reference density every published Cd is quoted against",
);

/** Adverse recovery steeper than this reads as a dead zone. Crude, and said so. */
const RECOVERY_LIMIT_PER_M: Quantity<"ratio"> = assumed(
  1.6, "ratio",
  "adverse-recovery criterion: dCp/dx above 1.6 per metre flags a dead zone. " +
  "A stand-in for a boundary-layer calculation this method does not do",
);

const cross = (a: Pt3, b: Pt3): Pt3 =>
  [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

/**
 * Panels from triangles: bin centroids on a uniform grid and merge each bin.
 * A panel's normal is the area-weighted sum of its triangles' normals, which
 * is the right average — a sliver cannot outvote a facet.
 */
function buildPanels(mesh: AeroMesh, target: number): {
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
function frontalAreaMm2(mesh: AeroMesh, cell: number): number {
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

/**
 * The solve. Cp on every panel and on every triangle behind it, plus the
 * frontal area this body actually has.
 */
export function aeroLens(mesh: AeroMesh, opts: AeroOptions = {}): AeroResult {
  const target = opts.targetPanels ?? 700;
  const ground = opts.groundPlane ?? true;
  const cell = opts.frontalCellMm ?? 2;
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

  // Crude adverse-recovery flag. Walk to the nearest panel downstream of each
  // one and ask how fast the pressure is climbing back. This is NOT a
  // separation prediction and the notes say so.
  const separated = new Uint8Array(n);
  const limitPerMm = RECOVERY_LIMIT_PER_M.value / 1000;
  for (let i = 0; i < n; i++) {
    const ix = P.centroids[i * 3]!, iy = P.centroids[i * 3 + 1]!, iz = P.centroids[i * 3 + 2]!;
    let bestJ = -1, bestD = Infinity;
    for (let j = 0; j < n; j++) {
      if (j === i) continue;
      const dx = P.centroids[j * 3]! - ix;
      if (dx <= 0) continue;                       // downstream only
      const dy = P.centroids[j * 3 + 1]! - iy, dz = P.centroids[j * 3 + 2]! - iz;
      const d = nsqrt(dx * dx + dy * dy + dz * dz);
      if (d < bestD) { bestD = d; bestJ = j; }
    }
    if (bestJ < 0 || bestD === 0) continue;
    const slope = (cpPanel[bestJ]! - cpPanel[i]!) / bestD;
    if (slope > limitPerMm) separated[i] = 1;
  }

  const cpTriangle = new Float64Array(P.ofTriangle.length);
  for (let t = 0; t < P.ofTriangle.length; t++) {
    const p = P.ofTriangle[t]!;
    cpTriangle[t] = p >= 0 ? cpPanel[p]! : 0;
  }

  let cpMin = Infinity, cpMax = -Infinity;
  for (let i = 0; i < n; i++) { cpMin = Math.min(cpMin, cpPanel[i]!); cpMax = Math.max(cpMax, cpPanel[i]!); }
  const sortedCp = Array.from(cpPanel).sort((a, b) => a - b);
  const pct = (f: number): number =>
    sortedCp.length === 0 ? 0 : sortedCp[Math.min(sortedCp.length - 1, Math.floor(f * sortedCp.length))]!;

  const fineMm2 = frontalAreaMm2(mesh, cell);
  const coarseMm2 = frontalAreaMm2(mesh, cell * 2);
  let separatedCount = 0;
  for (let i = 0; i < n; i++) separatedCount += separated[i]!;

  const notes = [
    "Potential flow. No viscosity, no wake, no circulation — therefore no lift and no drag.",
    "Cp is speed-independent below racing speeds: one solve serves every speed the box is set to.",
    `Separation is beyond this method. ${separatedCount} panels carry the ASSUMED adverse-recovery flag ` +
    `(dCp/dx > ${RECOVERY_LIMIT_PER_M.value} per metre); that is a stand-in for a boundary-layer ` +
    "calculation, not a prediction.",
    "Drag and power never come from this map. Ask dragAndPower(), which needs a SOURCED Cd.",
    solved ? `Residual normal velocity ${residual.toFixed(4)} of V∞ after the solve.`
      : "SINGULAR MATRIX — the solve did not converge and this map means nothing.",
  ];

  return {
    method:
      `first-order source panels on ${n} panels (${P.gridMm.toFixed(0)} mm binning of ` +
      `${Math.floor(mesh.indices.length / 3)} triangles), point-source influence with an exact ` +
      `σ/2 self term${ground ? ", ground-plane image in z = 0" : ", no ground plane"}`,
    panelCount: n,
    panelGridMm: P.gridMm,
    cpPanel,
    cpTriangle,
    cpMin: solved ? cpMin : NaN,
    cpMax: solved ? cpMax : NaN,
    cpP02: solved ? pct(0.02) : NaN,
    cpP98: solved ? pct(0.98) : NaN,
    separated,
    separatedCount,
    residual,
    frontalArea: derived(fineMm2 / 1e6, "m2",
      `union of the skin projected on YZ, rasterised at ${cell} mm`),
    frontalAreaCellMm: cell,
    frontalAreaConvergence: Math.abs(fineMm2 - coarseMm2) / 1e6,
    notes,
  };
}

// ---------------------------------------------------------------------------
// Forces — the only place a drag number is allowed to come from
// ---------------------------------------------------------------------------

export interface DragEstimate {
  readonly drag: Quantity<"N">;
  readonly power: Quantity<"W">;
  readonly speed: Quantity<"km/h">;
  readonly density: Quantity<"kg/m3">;
  /** Empty when the Cd is SOURCED. Otherwise says the number is a guess. */
  readonly caveat: string;
}

/**
 * D = ½ρv²·Cd·A, P = D·v. The Cd must come from outside — a panel solve of
 * this class cannot produce one, and this function will not pretend it can.
 * If the Cd handed in is not SOURCED, the caveat says so and travels with the
 * result rather than being dropped at the call site.
 */
export function dragAndPower(
  speedKph: Quantity<"km/h">,
  cd: Quantity<"ratio">,
  frontalArea: Quantity<"m2">,
  density: Quantity<"kg/m3"> = AIR_DENSITY,
): DragEstimate {
  const v = speedKph.value / 3.6;
  const d = 0.5 * density.value * v * v * cd.value * frontalArea.value;
  const chain =
    `½ρv²·Cd·A: ρ ${density.value} kg/m³ [${density.license.tag}], v ${speedKph.value} km/h, ` +
    `Cd ${cd.value} [${cd.license.tag}], A ${frontalArea.value.toFixed(3)} m² [${frontalArea.license.tag}]`;
  return {
    drag: derived(d, "N", chain),
    power: derived(d * v, "W", `drag × speed — ${chain}`),
    speed: speedKph,
    density,
    caveat: cd.license.tag === "SOURCED" ? "" :
      `the Cd is ${cd.license.tag}, so this force is only as good as that guess`,
  };
}

// ---------------------------------------------------------------------------
// Inlet versus cooling demand — a pure geometry check (charge §9)
// ---------------------------------------------------------------------------

export interface InletCheck {
  readonly required: Quantity<"mm2">;
  readonly available: Quantity<"mm2">;
  readonly ratio: number;
  readonly adequate: boolean;
  readonly chain: string;
}

/**
 * Air a radiator has to swallow per kW of heat: ṁ = Q/(cp·ΔT), with cp for
 * air at 1.005 kJ/kg·K and an ASSUMED 40 K air-side rise, so 1/(1.005 × 40)
 * = 0.02488 kg/s per kW.
 */
const FLOW_PER_KW: Quantity<"ratio"> = assumed(
  0.02488, "ratio",
  "air mass flow per kW rejected: 1/(cp·ΔT) with cp 1.005 kJ/kg·K and an assumed 40 K rise",
);

/**
 * Velocity at the INLET PLANE as a fraction of free stream. Two corrections
 * live behind this number and they are not the same:
 *
 *  - at the inlet the flow is still near free stream — capture is high, and
 *    0.8 is the usual figure once spillage is allowed for;
 *  - by the CORE face it has diffused to roughly a third, which is why a
 *    radiator core is two to three times the area of the grille in front of it.
 *
 * This check is about the inlet (charge §9), so it uses the first. The first
 * version of this constant used the second, and got it backwards on top: it
 * was folded into the mass-flow constant and multiplied where it should have
 * divided, so the P1 "needed" 1.39 m² of grille at 50 km/h — most of the front
 * of the car — and the reason string contradicted its own arithmetic. Both
 * numbers are separate and ASSUMED now, so each can be argued with alone.
 */
const CAPTURE_RATIO: Quantity<"ratio"> = assumed(
  0.8, "ratio",
  "velocity at the inlet plane as a fraction of free stream, after spillage",
);

/**
 * Geometry only: the inlet a cooling load needs at a given speed, against the
 * inlet the body actually has. No heat transfer, no core model — this asks
 * whether enough air can physically get in, which is a question about area.
 */
export function inletAdequacy(
  availableMm2: Quantity<"mm2">,
  coolingPower: Quantity<"kW">,
  speedKph: Quantity<"km/h">,
  density: Quantity<"kg/m3"> = AIR_DENSITY,
): InletCheck {
  const v = Math.max(speedKph.value / 3.6, 1e-6);
  const mdot = FLOW_PER_KW.value * coolingPower.value;      // kg/s
  const areaM2 = mdot / (density.value * v * CAPTURE_RATIO.value);
  const requiredMm2 = areaM2 * 1e6;
  const chain =
    `ṁ = ${FLOW_PER_KW.value} kg/s·kW [${FLOW_PER_KW.license.tag}] × ${coolingPower.value} kW ` +
    `[${coolingPower.license.tag}] = ${mdot.toFixed(2)} kg/s; A = ṁ/(ρ·v·${CAPTURE_RATIO.value.toFixed(3)}) ` +
    `[capture ${CAPTURE_RATIO.license.tag}] at ${speedKph.value} km/h. Sustained PEAK rejection: at low ` +
    "speed this is the number a fan exists to cover, not a body failure";
  return {
    required: derived(requiredMm2, "mm2", chain),
    available: availableMm2,
    ratio: availableMm2.value / requiredMm2,
    adequate: availableMm2.value >= requiredMm2,
    chain,
  };
}

export { AIR_DENSITY, RECOVERY_LIMIT_PER_M, FLOW_PER_KW, CAPTURE_RATIO };
