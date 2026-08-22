/**
 * meshQuilt — structured conforming interiors over the GlobalSampleTable.
 *
 * Per cell the four loop-ordered sides map onto the unit square:
 *   side 0 → v=0 (south, u runs with the loop), side 1 → u=1 (east),
 *   side 2 → v=1 (north, loop runs u 1→0), side 3 → u=0 (west, loop runs v 1→0).
 * U is the sorted union of south and north grid params, V of west and east.
 * Boundary grid points resolve to TABLE vertices by index — a boundary param
 * the side itself does not sample snaps to the side's nearest table vertex at
 * or below it, so the seam polyline stays exactly the table polyline and the
 * snap only reshapes interior transition triangles (duplicates degenerate and
 * are dropped). Interior points are discrete transfinite (Coons) blends of the
 * four sampled boundary polylines. A collapsed (tapered) side contributes one
 * vertex; its whole grid row is that vertex and the row's quads shed one
 * degenerate triangle each — the taper fan, NaN-free by construction.
 */

import type { FeedRange, Id, Pt3, QuiltSpec } from "@car/schema";
import { lerp3 } from "@car/num";
import { compareId } from "./ids.js";
import { buildSampleTable, type GlobalSampleTable, type SideSamples } from "./table.js";

export interface MeshOptions {
  /** Uniform base samples per chain segment of every curve. Default 8. */
  readonly baseDensity?: number;
}

export const DEFAULT_BASE_DENSITY = 8;

export interface QuiltMesh {
  /** xyz per vertex, mm, Float64. Table vertices first, cell interiors after. */
  readonly positions: Float64Array;
  /** Triangles, outward CCW winding (from the quilt's CCW-outside side loops). */
  readonly indices: Uint32Array;
  /** Per cell, sorted by cell id; start/count into `indices`. */
  readonly ranges: readonly FeedRange[];
  /** The shared boundary table — its vertices are positions[0 .. vertexCount). */
  readonly table: GlobalSampleTable;
}

/** A side re-parameterized to its grid axis: ascending grid coords + table verts. */
interface GridSide {
  readonly collapsed: boolean;
  readonly g: readonly number[];
  readonly verts: readonly number[];
}

function toGridSide(side: SideSamples, flip: boolean): GridSide {
  if (side.collapsed) return { collapsed: true, g: [0], verts: [...side.verts] };
  if (!flip) return { collapsed: false, g: [...side.s], verts: [...side.verts] };
  const g: number[] = [];
  const verts: number[] = [];
  for (let i = side.s.length - 1; i >= 0; i--) {
    g.push(1 - side.s[i]!); // exact at the ends: 1-0=1, 1-1=0
    verts.push(side.verts[i]!);
  }
  return { collapsed: false, g, verts };
}

/** Index of the largest grid param <= q (q ∈ [0,1]; g[0] is always 0). */
function floorIndex(g: readonly number[], q: number): number {
  let lo = 0;
  let hi = g.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (g[mid]! <= q) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

const snapVert = (side: GridSide, q: number): number =>
  side.collapsed ? side.verts[0]! : side.verts[floorIndex(side.g, q)]!;

function plEval(side: GridSide, posOf: (v: number) => Pt3, q: number): Pt3 {
  if (side.collapsed) return posOf(side.verts[0]!);
  const k = floorIndex(side.g, q);
  if (k === side.g.length - 1 || side.g[k] === q) return posOf(side.verts[k]!);
  const g0 = side.g[k]!;
  const g1 = side.g[k + 1]!;
  return lerp3(posOf(side.verts[k]!), posOf(side.verts[k + 1]!), (q - g0) / (g1 - g0));
}

function unionParams(a: GridSide, b: GridSide): number[] {
  const all: number[] = [0, 1];
  if (!a.collapsed) all.push(...a.g);
  if (!b.collapsed) all.push(...b.g);
  all.sort((x, y) => x - y);
  const out: number[] = [];
  for (const p of all) {
    if (out.length === 0 || out[out.length - 1] !== p) out.push(p);
  }
  return out;
}

export function meshQuilt(quilt: QuiltSpec, opts?: MeshOptions): QuiltMesh {
  const table = buildSampleTable(quilt, opts?.baseDensity ?? DEFAULT_BASE_DENSITY);

  const pos: number[] = Array.from(table.positions);
  const posOf = (v: number): Pt3 => [pos[3 * v]!, pos[3 * v + 1]!, pos[3 * v + 2]!];
  const pushVert = (p: Pt3): number => {
    const v = pos.length / 3;
    pos.push(p[0], p[1], p[2]);
    return v;
  };

  const indices: number[] = [];
  const ranges: FeedRange[] = [];

  const cells = [...quilt.cells].sort((a, b) => compareId(a.id, b.id));
  for (const cell of cells) {
    const [s0, s1, s2, s3] = table.sidesOf(cell.id);
    const south = toGridSide(s0, false);
    const east = toGridSide(s1, false);
    const north = toGridSide(s2, true);
    const west = toGridSide(s3, true);

    const U = unionParams(south, north);
    const V = unionParams(west, east);

    // corner positions for the bilinear correction — exact table vertex positions
    const P00 = plEval(south, posOf, 0);
    const P10 = plEval(south, posOf, 1);
    const P01 = plEval(north, posOf, 0);
    const P11 = plEval(north, posOf, 1);

    const nu = U.length;
    const nv = V.length;
    const grid = new Uint32Array(nu * nv);
    for (let j = 0; j < nv; j++) {
      const v = V[j]!;
      for (let i = 0; i < nu; i++) {
        const u = U[i]!;
        let vert: number;
        if (j === 0) vert = snapVert(south, u);
        else if (j === nv - 1) vert = snapVert(north, u);
        else if (i === 0) vert = snapVert(west, v);
        else if (i === nu - 1) vert = snapVert(east, v);
        else {
          const b = plEval(south, posOf, u);
          const t = plEval(north, posOf, u);
          const l = plEval(west, posOf, v);
          const r = plEval(east, posOf, v);
          const q: number[] = [0, 0, 0];
          for (let c = 0; c < 3; c++) {
            q[c] =
              (1 - v) * b[c]! + v * t[c]! + (1 - u) * l[c]! + u * r[c]! -
              ((1 - u) * (1 - v) * P00[c]! + u * (1 - v) * P10[c]! +
               (1 - u) * v * P01[c]! + u * v * P11[c]!);
          }
          vert = pushVert([q[0]!, q[1]!, q[2]!]);
        }
        grid[j * nu + i] = vert;
      }
    }

    const start = indices.length;
    for (let j = 0; j + 1 < nv; j++) {
      for (let i = 0; i + 1 < nu; i++) {
        const a = grid[j * nu + i]!;
        const b = grid[j * nu + i + 1]!;
        const c = grid[(j + 1) * nu + i + 1]!;
        const d = grid[(j + 1) * nu + i]!;
        // two triangles per quad, outward CCW; index-degenerate triangles
        // (snap duplicates, taper rows) are dropped before any closed check
        if (a !== b && b !== c && a !== c) indices.push(a, b, c);
        if (a !== c && c !== d && a !== d) indices.push(a, c, d);
      }
    }
    ranges.push({ id: cell.id, start, count: indices.length - start });
  }

  return {
    positions: new Float64Array(pos),
    indices: new Uint32Array(indices),
    ranges,
    table,
  };
}
