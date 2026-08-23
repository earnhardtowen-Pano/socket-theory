/**
 * creaseNormals — smoothing groups for the render path.
 *
 * A Coons patch is flat between straight boundaries, so a body meshed from a
 * quilt is a field of flats. Two wrong answers were tried before this one:
 * shading every facet (the body reads shattered) and averaging every normal
 * (the body reads like soap — arch mouths, splitter and roof breaks all melt).
 * The right answer is the one car renders have always used: average a vertex's
 * normal across an edge ONLY when the two faces meet below a crease angle, and
 * split it across edges above. Panels then read as continuous surface, and
 * every deliberate break stays a hard line.
 *
 * RENDER ONLY, and the boundary matters: splitting a normal duplicates a
 * vertex, so the returned buffers carry MORE vertices than the mesh they came
 * from. That is a view of the model, never the model. The printed mesh is the
 * one @car/mesh emits — closed-mesh check and STL run on that, untouched. The
 * triangle count and winding are preserved exactly; only which vertex slot a
 * corner points at can change.
 *
 * Deterministic: index-ordered traversal, area-weighted face normals (so a
 * sliver triangle cannot outvote a panel), no wall clock, no randomness.
 */

import type { Pt3 } from "@car/schema";
import { ncos, norm3 } from "@car/num";

export interface NormalMesh {
  readonly positions: Float64Array;
  readonly indices: Uint32Array;
}

export interface CreaseNormalResult {
  /** Positions with split vertices appended; render with these, not the input. */
  readonly positions: Float64Array;
  readonly normals: Float64Array;
  readonly indices: Uint32Array;
  /** Vertices added by splitting — how much hard edge the body carries. */
  readonly split: number;
  /**
   * For every output vertex, the input vertex it came from. Identity for the
   * originals, and the vertex it was copied from for each split. A lens that
   * measures the PRINT mesh (curvature, say) needs this to paint its result
   * on the RENDER mesh without re-deriving anything.
   */
  readonly sourceOf: Uint32Array;
}

/** Below this dihedral angle two faces share a normal. Degrees. */
export const DEFAULT_CREASE_ANGLE = 48;

const faceNormalRaw = (p: Float64Array, a: number, b: number, c: number): Pt3 => {
  const ux = p[b * 3]! - p[a * 3]!, uy = p[b * 3 + 1]! - p[a * 3 + 1]!, uz = p[b * 3 + 2]! - p[a * 3 + 2]!;
  const vx = p[c * 3]! - p[a * 3]!, vy = p[c * 3 + 1]! - p[a * 3 + 1]!, vz = p[c * 3 + 2]! - p[a * 3 + 2]!;
  // Unnormalised cross product: its length is twice the triangle area, which
  // is exactly the weight a face should carry into a vertex average.
  return [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
};

/**
 * Group the faces around each vertex into smoothing groups, then emit one
 * normal per (vertex, group).
 */
export function creaseNormals(mesh: NormalMesh, angleDeg = DEFAULT_CREASE_ANGLE): CreaseNormalResult {
  const { positions, indices } = mesh;
  const triCount = Math.floor(indices.length / 3);
  const vertCount = Math.floor(positions.length / 3);
  const cosLimit = ncos((angleDeg * Math.PI) / 180);

  // Face normals: raw (area-weighted) for averaging, unit for the angle test.
  const raw: Pt3[] = new Array(triCount);
  const unit: Pt3[] = new Array(triCount);
  for (let t = 0; t < triCount; t++) {
    const n = faceNormalRaw(positions, indices[t * 3]!, indices[t * 3 + 1]!, indices[t * 3 + 2]!);
    raw[t] = n;
    unit[t] = norm3(n);
  }

  // Faces incident to each vertex, faces sharing each edge, and — so the
  // per-vertex pass walks its own ring rather than every edge in the body —
  // the edges incident to each vertex. Edge keys are numeric (lo*V+hi), which
  // keeps this out of string-hashing territory on a 6k-triangle body.
  const vertFaces: number[][] = Array.from({ length: vertCount }, () => []);
  const vertEdges: number[][] = Array.from({ length: vertCount }, () => []);
  const edgeFaces = new Map<number, number[]>();
  for (let t = 0; t < triCount; t++) {
    const tri = [indices[t * 3]!, indices[t * 3 + 1]!, indices[t * 3 + 2]!];
    for (let e = 0; e < 3; e++) {
      vertFaces[tri[e]!]!.push(t);
      const a = tri[e]!, b = tri[(e + 1) % 3]!;
      const key = a < b ? a * vertCount + b : b * vertCount + a;
      const list = edgeFaces.get(key);
      if (list) {
        list.push(t);
      } else {
        edgeFaces.set(key, [t]);
        vertEdges[a]!.push(key);
        vertEdges[b]!.push(key);
      }
    }
  }

  /** Two faces smooth together when they share an edge and bend gently. */
  const smoothPair = (t0: number, t1: number): boolean => {
    const a = unit[t0]!, b = unit[t1]!;
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2] >= cosLimit;
  };

  const outPos: number[] = Array.from(positions);
  const sourceOf: number[] = Array.from({ length: vertCount }, (_, i) => i);
  const outNrm = new Float64Array(vertCount * 3);
  const outIdx = Uint32Array.from(indices);
  const extraNrm: number[] = [];
  let split = 0;

  const parent = new Map<number, number>();
  const find = (x: number): number => {
    let r = x;
    while (parent.get(r) !== r) r = parent.get(r)!;
    return r;
  };

  for (let v = 0; v < vertCount; v++) {
    const faces = vertFaces[v]!;
    if (faces.length === 0) continue;

    // Union the faces around this vertex, walking only the edges that meet at
    // it, so a hard edge genuinely separates the two sides of the ring.
    parent.clear();
    for (const f of faces) parent.set(f, f);
    for (const key of vertEdges[v]!) {
      const pair = edgeFaces.get(key)!;
      if (pair.length !== 2) continue;             // boundary or non-manifold: never union
      const [t0, t1] = pair as [number, number];
      if (!smoothPair(t0, t1)) continue;           // a crease: no union
      const r0 = find(t0), r1 = find(t1);
      if (r0 !== r1) parent.set(r0, r1);
    }

    const groups = new Map<number, number[]>();
    for (const f of faces) {
      const r = find(f);
      const g = groups.get(r);
      if (g) g.push(f); else groups.set(r, [f]);
    }

    let firstGroup = true;
    for (const [, members] of [...groups.entries()].sort((a, b) => a[0] - b[0])) {
      let nx = 0, ny = 0, nz = 0;
      for (const f of members) {
        const n = raw[f]!;
        nx += n[0]; ny += n[1]; nz += n[2];
      }
      const n = norm3([nx, ny, nz]);
      if (firstGroup) {
        outNrm[v * 3] = n[0]; outNrm[v * 3 + 1] = n[1]; outNrm[v * 3 + 2] = n[2];
        firstGroup = false;
        continue;
      }
      // A second group at this vertex is a hard edge running through it: give
      // that side its own copy of the vertex so the edge reads crisp.
      const nv = outPos.length / 3;
      outPos.push(positions[v * 3]!, positions[v * 3 + 1]!, positions[v * 3 + 2]!);
      sourceOf.push(v);
      extraNrm.push(n[0], n[1], n[2]);
      split++;
      for (const f of members) {
        for (let e = 0; e < 3; e++) {
          if (outIdx[f * 3 + e] === v) outIdx[f * 3 + e] = nv;
        }
      }
    }
  }

  const normals = new Float64Array(outNrm.length + extraNrm.length);
  normals.set(outNrm, 0);
  normals.set(extraNrm, outNrm.length);
  return {
    positions: Float64Array.from(outPos),
    normals,
    indices: outIdx,
    split,
    sourceOf: Uint32Array.from(sourceOf),
  };
}
