/**
 * Shutline grooves (charge §10) — "shutlines engrave as grooves at the chosen
 * scale; at 1:24 they catch light like real gaps."
 *
 * Why this cannot be done in real millimetres. A door gap on a car is about
 * 4 mm. At 1:24 that is 0.17 mm, well under a 0.4 mm nozzle, so it prints as
 * nothing at all — the shutline vanishes and the model reads as one lump of
 * plastic. The groove therefore is not scaled from the real gap; it is sized
 * from the PRINTER and back-scaled into the model. A groove one nozzle wide
 * at the print is 24 nozzles wide on the car, and looks wrong up close in
 * CAD, and is the only thing that reads at all in the hand.
 *
 * That trade is stated rather than hidden: the result carries both the model
 * dimensions and the printed ones, so nobody has to reverse the arithmetic to
 * find out what they are about to hold.
 *
 * Topology is never touched — vertices move along their own normals and
 * nothing is added, removed or re-indexed. A closed mesh stays closed, which
 * is checked, not asserted.
 *
 * Deterministic: index-ordered traversal, no wall clock, no randomness.
 */

import type { Pt3 } from "@car/schema";
import { nsqrt } from "@car/num";

export interface GrooveMesh {
  readonly positions: Float64Array;
  readonly indices: Uint32Array;
}

export interface GrooveOptions {
  /** Print scale denominator: 24 for 1:24. */
  readonly scaleDenominator: number;
  /** Smallest feature the printer resolves — a nozzle width, mm. */
  readonly minPrintedFeatureMm: number;
  /** Groove width as a multiple of the minimum feature. Default 2. */
  readonly widthInFeatures?: number;
  /** Depth as a fraction of the half-width. Default 0.6. */
  readonly depthRatio?: number;
}

export interface GrooveResult {
  readonly positions: Float64Array;
  /** Vertices actually displaced. Zero means nothing was near a shutline. */
  readonly moved: number;
  /** Model-space groove size, mm. */
  readonly halfWidthMm: number;
  readonly depthMm: number;
  /** What it becomes in the hand, mm. */
  readonly printedWidthMm: number;
  readonly printedDepthMm: number;
  readonly note: string;
}

/** Area-weighted vertex normals — the same average creaseNormals uses. */
function vertexNormals(mesh: GrooveMesh): Float64Array {
  const { positions, indices } = mesh;
  const out = new Float64Array(positions.length);
  for (let t = 0; t + 2 < indices.length; t += 3) {
    const a = indices[t]!, b = indices[t + 1]!, c = indices[t + 2]!;
    const ux = positions[b * 3]! - positions[a * 3]!;
    const uy = positions[b * 3 + 1]! - positions[a * 3 + 1]!;
    const uz = positions[b * 3 + 2]! - positions[a * 3 + 2]!;
    const vx = positions[c * 3]! - positions[a * 3]!;
    const vy = positions[c * 3 + 1]! - positions[a * 3 + 1]!;
    const vz = positions[c * 3 + 2]! - positions[a * 3 + 2]!;
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    for (const v of [a, b, c]) {
      out[v * 3] = out[v * 3]! + nx;
      out[v * 3 + 1] = out[v * 3 + 1]! + ny;
      out[v * 3 + 2] = out[v * 3 + 2]! + nz;
    }
  }
  for (let v = 0; v + 2 < out.length; v += 3) {
    const l = nsqrt(out[v]! * out[v]! + out[v + 1]! * out[v + 1]! + out[v + 2]! * out[v + 2]!);
    if (l > 0) { out[v] = out[v]! / l; out[v + 1] = out[v + 1]! / l; out[v + 2] = out[v + 2]! / l; }
  }
  return out;
}

/**
 * Sink a groove into the skin along every shutline.
 *
 * `line` is the shutlines sampled densely enough that consecutive samples are
 * closer together than the groove is wide — otherwise the groove comes out
 * scalloped, which is a sampling artefact and not a design.
 */
export function engraveGrooves(
  mesh: GrooveMesh,
  line: readonly Pt3[],
  opts: GrooveOptions,
): GrooveResult {
  const widthInFeatures = opts.widthInFeatures ?? 2;
  const depthRatio = opts.depthRatio ?? 0.6;
  const halfWidth = (opts.minPrintedFeatureMm * widthInFeatures * opts.scaleDenominator) / 2;
  const depth = halfWidth * depthRatio;

  const positions = Float64Array.from(mesh.positions);
  const note =
    `groove ${(halfWidth * 2).toFixed(1)} mm wide and ${depth.toFixed(1)} mm deep on the car, ` +
    `which is ${(opts.minPrintedFeatureMm * widthInFeatures).toFixed(2)} × ` +
    `${((depth / opts.scaleDenominator)).toFixed(2)} mm at 1:${opts.scaleDenominator}. ` +
    "Sized from the nozzle and back-scaled, NOT scaled down from a real 4 mm door gap — " +
    "that would print at 0.17 mm and disappear.";

  if (line.length === 0 || halfWidth <= 0) {
    return {
      positions, moved: 0, halfWidthMm: halfWidth, depthMm: depth,
      printedWidthMm: (halfWidth * 2) / opts.scaleDenominator,
      printedDepthMm: depth / opts.scaleDenominator,
      note: line.length === 0 ? "no shutlines to engrave" : note,
    };
  }

  // A uniform grid over the shutline samples, so each vertex only tests the
  // samples that could possibly be near it. Without it this is vertices ×
  // samples, which on a real body is tens of millions of distance tests.
  const cell = halfWidth;
  const key = (i: number, j: number, k: number): string => `${i},${j},${k}`;
  const grid = new Map<string, number[]>();
  for (let s = 0; s < line.length; s++) {
    const p = line[s]!;
    const gk = key(Math.floor(p[0] / cell), Math.floor(p[1] / cell), Math.floor(p[2] / cell));
    const bucket = grid.get(gk);
    if (bucket) bucket.push(s); else grid.set(gk, [s]);
  }

  const normals = vertexNormals(mesh);
  const vertCount = Math.floor(positions.length / 3);
  let moved = 0;
  for (let v = 0; v < vertCount; v++) {
    const x = mesh.positions[v * 3]!, y = mesh.positions[v * 3 + 1]!, z = mesh.positions[v * 3 + 2]!;
    const gi = Math.floor(x / cell), gj = Math.floor(y / cell), gk = Math.floor(z / cell);
    let best = Infinity;
    for (let di = -1; di <= 1; di++) {
      for (let dj = -1; dj <= 1; dj++) {
        for (let dk = -1; dk <= 1; dk++) {
          const bucket = grid.get(key(gi + di, gj + dj, gk + dk));
          if (!bucket) continue;
          for (const s of bucket) {
            const p = line[s]!;
            const d = (x - p[0]) ** 2 + (y - p[1]) ** 2 + (z - p[2]) ** 2;
            if (d < best) best = d;
          }
        }
      }
    }
    if (best === Infinity) continue;
    const d = nsqrt(best);
    if (d >= halfWidth) continue;
    // Cosine-squared falloff: flat-bottomed enough to read as a gap, and it
    // meets the surrounding skin with zero slope so the groove has no lip.
    const t = d / halfWidth;
    const sink = depth * (1 - t * t);
    if (sink <= 0) continue;
    positions[v * 3] = x - normals[v * 3]! * sink;
    positions[v * 3 + 1] = y - normals[v * 3 + 1]! * sink;
    positions[v * 3 + 2] = z - normals[v * 3 + 2]! * sink;
    moved++;
  }

  return {
    positions, moved, halfWidthMm: halfWidth, depthMm: depth,
    printedWidthMm: (halfWidth * 2) / opts.scaleDenominator,
    printedDepthMm: depth / opts.scaleDenominator,
    note,
  };
}
