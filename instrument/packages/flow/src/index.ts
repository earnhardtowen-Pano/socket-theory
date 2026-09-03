/**
 * @car/flow — the flow solve (statute amendments A6/A7, charge §3).
 *
 * A quilt authored by tape and push-pull meets itself in facets: each Coons
 * patch is flat between straight boundaries, so every shared curve reads as a
 * crease whether or not anyone asked for one. Flow removes the kinks nobody
 * authored and keeps every one somebody did.
 *
 * WHERE IT ACTS, and why here. The kinks are not at curve junctions — a tape
 * split subdivides a curve's TRIMS, not the curve, so a sectioned body has
 * almost no two-curve junctions to fair. The kink is across the shared curve
 * itself, between two patches. So flow runs on the derived mesh, where that
 * seam is a real edge with real neighbours, and it runs as a DERIVATION: the
 * authored model is never touched, and replay stays byte-identical.
 *
 * WHAT IT IS: Taubin λ|μ relaxation. A plain Laplacian pass smooths and
 * shrinks; Taubin follows each smoothing pass with a slightly larger negative
 * pass, so the body keeps its volume instead of melting toward its centroid —
 * the difference between a faired body and a bar of soap.
 *
 * WHAT IT PRESERVES, exactly:
 *   - TOPOLOGY. Only vertex positions move; every triangle keeps its indices,
 *     so a closed mesh stays closed and a printable body stays printable.
 *   - CREASES AND CHARACTER LINES. Vertices lying on a creased curve are
 *     pinned. Panel gaps do NOT pin: the gap curve is interior to its parent
 *     flow region (amendment A2).
 *   - DETERMINISM. Fixed pass count, index-ordered accumulation, no wall
 *     clock, no randomness. The same mesh fairs to the same mesh, bit for bit.
 *
 * WHAT IT IS NOT: curvature-grade (G2) fairing, which is where Class-A
 * surfacing begins. The charge's stage gate is tangent now, curvature later,
 * and the code claims exactly that much. Zebra is where the difference shows.
 */

import type { Pt3 } from "@car/schema";
import { dist3 } from "@car/num";

export interface FlowMesh {
  readonly positions: Float64Array;
  readonly indices: Uint32Array;
}

export interface FlowOptions {
  /** Smoothing/anti-shrink pass pairs. Default 6. */
  readonly passes?: number;
  /** Smoothing weight per pass, 0..1. Default 0.5. */
  readonly lambda?: number;
  /**
   * Anti-shrink weight, negative and slightly larger in magnitude than
   * lambda. Default -0.53.
   */
  readonly mu?: number;
  /** Vertices within this distance of a crease sample are pinned, mm. */
  readonly creaseTol?: number;
  /**
   * Hold vertices lying on this Z plane, mm. The tire contact patch is a datum
   * like a crease: fairing rounded the tread and stood the car 93 mm off the
   * road until this was pinned.
   */
  readonly pinPlaneZ?: number;
}

export const FLOW_PASSES = 6;
export const FLOW_LAMBDA = 0.5;
export const FLOW_MU = -0.53;
export const CREASE_TOL = 2;

export interface FlowReport {
  readonly vertices: number;
  readonly pinned: number;
  readonly passes: number;
  /** Mean distance a free vertex travelled, mm — how much fairing there was. */
  readonly meanShift: number;
}

export interface FlowResult {
  readonly positions: Float64Array;
  readonly report: FlowReport;
}

/** One-ring neighbours from the triangle list, built once, index-ordered. */
function adjacency(indices: Uint32Array, vertexCount: number): number[][] {
  const seen = new Set<number>();
  const adj: number[][] = Array.from({ length: vertexCount }, () => []);
  for (let t = 0; t + 2 < indices.length; t += 3) {
    const tri = [indices[t]!, indices[t + 1]!, indices[t + 2]!];
    for (let e = 0; e < 3; e++) {
      const a = tri[e]!, b = tri[(e + 1) % 3]!;
      if (a === b) continue;
      const lo = a < b ? a : b, hi = a < b ? b : a;
      const k = lo * vertexCount + hi;
      if (seen.has(k)) continue;
      seen.add(k);
      adj[a]!.push(b);
      adj[b]!.push(a);
    }
  }
  for (const list of adj) list.sort((x, y) => x - y);
  return adj;
}

/**
 * Fair a derived mesh. `creaseSamples` are points along every curve the model
 * marks as a deliberate crease or character line; vertices near them are held.
 */
export function flowMesh(
  mesh: FlowMesh,
  creaseSamples: readonly Pt3[] = [],
  opts: FlowOptions = {},
): FlowResult {
  const passes = opts.passes ?? FLOW_PASSES;
  const lambda = opts.lambda ?? FLOW_LAMBDA;
  const mu = opts.mu ?? FLOW_MU;
  const tol = opts.creaseTol ?? CREASE_TOL;

  const n = mesh.positions.length / 3;
  const out = Float64Array.from(mesh.positions);
  const adj = adjacency(mesh.indices, n);

  const pinned = new Uint8Array(n);
  if (opts.pinPlaneZ !== undefined) {
    for (let v = 0; v < n; v++) {
      if (Math.abs(out[v * 3 + 2]! - opts.pinPlaneZ) <= tol) pinned[v] = 1;
    }
  }
  if (creaseSamples.length > 0) {
    for (let v = 0; v < n; v++) {
      const p: Pt3 = [out[v * 3]!, out[v * 3 + 1]!, out[v * 3 + 2]!];
      for (const c of creaseSamples) {
        if (dist3(p, c) <= tol) { pinned[v] = 1; break; }
      }
    }
  }

  const scratch = new Float64Array(out.length);
  const step = (weight: number): void => {
    for (let v = 0; v < n; v++) {
      const base = v * 3;
      const ring = adj[v]!;
      if (pinned[v] === 1 || ring.length === 0) {
        scratch[base] = out[base]!;
        scratch[base + 1] = out[base + 1]!;
        scratch[base + 2] = out[base + 2]!;
        continue;
      }
      let sx = 0, sy = 0, sz = 0;
      for (const w of ring) { sx += out[w * 3]!; sy += out[w * 3 + 1]!; sz += out[w * 3 + 2]!; }
      const inv = 1 / ring.length;
      scratch[base] = out[base]! + weight * (sx * inv - out[base]!);
      scratch[base + 1] = out[base + 1]! + weight * (sy * inv - out[base + 1]!);
      scratch[base + 2] = out[base + 2]! + weight * (sz * inv - out[base + 2]!);
    }
    out.set(scratch);
  };

  for (let i = 0; i < passes; i++) { step(lambda); step(mu); }

  let shift = 0, free = 0;
  for (let v = 0; v < n; v++) {
    if (pinned[v] === 1) continue;
    free++;
    shift += dist3(
      [out[v * 3]!, out[v * 3 + 1]!, out[v * 3 + 2]!],
      [mesh.positions[v * 3]!, mesh.positions[v * 3 + 1]!, mesh.positions[v * 3 + 2]!],
    );
  }
  let pinnedCount = 0;
  for (let v = 0; v < n; v++) if (pinned[v] === 1) pinnedCount++;

  return {
    positions: out,
    report: { vertices: n, pinned: pinnedCount, passes, meanShift: free === 0 ? 0 : shift / free },
  };
}
