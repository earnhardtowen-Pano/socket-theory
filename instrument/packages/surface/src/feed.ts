/**
 * RenderFeed — the one-way buffer seam from model to render (@car/schema).
 *
 * Surfaces: every quilt cell (mirror twins included) tessellated on a fixed
 * n x n grid; per-cell FeedRange entries with start/count in INDEX-ENTRY
 * units (three.js setDrawRange on indexed geometry). Grid edges are the
 * boundary curves themselves (edge rows short-circuit to boundary samples),
 * and side params map to curve params through one shared arithmetic form, so
 * welded neighbors with equal side ranges emit bit-identical edge vertices.
 * T-junction sub-shared edges are only tolerance-tight here; the conforming
 * union-of-samples mesh is @car/mesh's charge (statute §10), not the render
 * feed's.
 *
 * Lines: every shared curve (mirrored curves included) and every datum,
 * sampled at fixed density into a GL_LINES pair soup; per-curve FeedRange
 * start/count index POSITIONS in FLOAT units, per the frozen schema and every
 * consumer (viewport, pick, snap).
 *
 * Snaps: empty for now — published by the demand/packaging lanes later.
 *
 * Everything is deterministic and ID-sorted; identical state yields
 * byte-identical buffers.
 */

import type {
  CurveChain,
  FeedRange,
  Id,
  LineFeed,
  LineSpec,
  Pt3,
  QuiltSpec,
  RenderFeed,
  SurfaceFeed,
} from "@car/schema";
import { add3, evalChain, lineChain, scale3, sub3 } from "@car/num";
import { FrameState, idCompare, viewToWorld } from "@car/frame";
import { cellBoundary, type CrossPrescription } from "./boundary.js";
import {
  coonsBlend, coonsSu, coonsSv, coonsPhi, coonsPhiU, coonsPhiV,
  type PhiSample,
} from "./coons.js";
import { boundaryCoonsNormal } from "./coons.js";
import { cross3, norm3 } from "@car/num";

/** Default surface grid: quads per side per cell. Deterministic constant. */
export const DEFAULT_RESOLUTION = 16;

/** Line sampling density: segments per Bezier segment of a chain. */
export const LINE_SEGMENTS_PER_SEG = 16;

/** Presentation half-extent of an infinite through-line datum, mm. */
export const DATUM_HALF_LENGTH = 2500;

export interface RenderFeedOptions {
  /** Quads per side per cell; integer >= 1. Default DEFAULT_RESOLUTION. */
  readonly resolution?: number;
  /** Tangent-plane prescription; omit for the plain G0 blend. */
  readonly cross?: CrossPrescription;
}

function checkResolution(r: number): number {
  if (!Number.isInteger(r) || r < 1) {
    throw new Error(`surface: resolution must be an integer >= 1 (got ${r})`);
  }
  return r;
}

/**
 * Tessellate every quilt cell on a fixed n x n grid. Row-major vertices
 * (v-row j outer, u-column i inner, local index j*(n+1)+i), two CCW-from-
 * outside triangles per quad.
 */
export function tessellateQuilt(
  spec: QuiltSpec,
  resolution: number = DEFAULT_RESOLUTION,
  cross?: CrossPrescription,
): SurfaceFeed {
  const n = checkResolution(resolution);
  const cells = [...spec.cells].sort((a, b) => idCompare(a.id, b.id));
  const vertsPerCell = (n + 1) * (n + 1);
  const idxPerCell = 6 * n * n;
  const positions = new Float64Array(cells.length * vertsPerCell * 3);
  const normals = new Float64Array(cells.length * vertsPerCell * 3);
  const indices = new Uint32Array(cells.length * idxPerCell);
  const ranges: FeedRange[] = [];

  for (let ci = 0; ci < cells.length; ci++) {
    const cell = cells[ci];
    if (!cell) continue;
    const b = cellBoundary(cell, spec, cross);
    const [s0, s1, s2, s3] = b.sides;

    // Boundary sample and derivative tables, one evaluation per grid line.
    const c0: Pt3[] = [], c1: Pt3[] = [], d0: Pt3[] = [], d1: Pt3[] = [];
    const c0d: Pt3[] = [], c1d: Pt3[] = [], d0d: Pt3[] = [], d1d: Pt3[] = [];
    for (let i = 0; i <= n; i++) {
      c0.push(s0.gridPoint(i, n));
      c0d.push(s0.gridDeriv(i, n));
      c1.push(s2.gridPoint(n - i, n));
      c1d.push(scale3(s2.gridDeriv(n - i, n), -1));
      d0.push(s3.gridPoint(n - i, n));
      d0d.push(scale3(s3.gridDeriv(n - i, n), -1));
      d1.push(s1.gridPoint(i, n));
      d1d.push(s1.gridDeriv(i, n));
    }

    // Cross-field tables, one per side, sampled on the SAME grid. Evaluating
    // Δ per vertex instead would cost (n+1)² field evaluations per cell where
    // (n+1) will do: Φ only ever reads each side's field along its own edge.
    const xv: Pt3[][] = [[], [], [], []];
    const xd: Pt3[][] = [[], [], [], []];
    if (b.cross) {
      for (let k = 0; k < 4; k++) {
        for (let i = 0; i <= n; i++) {
          xv[k]!.push(b.cross.value(k, i / n));
          xd[k]!.push(b.cross.deriv(k, i / n));
        }
      }
    }
    const phiOf = (i: number, j: number): PhiSample | null => {
      if (!b.cross) return null;
      return {
        value: [xv[0]![i]!, xv[1]![j]!, xv[2]![n - i]!, xv[3]![n - j]!],
        deriv: [xd[0]![i]!, xd[1]![j]!, xd[2]![n - i]!, xd[3]![n - j]!],
      };
    };

    const vBase = ci * vertsPerCell;
    for (let j = 0; j <= n; j++) {
      const v = j / n;
      const d0j = d0[j]!, d1j = d1[j]!, d0dj = d0d[j]!, d1dj = d1d[j]!;
      for (let i = 0; i <= n; i++) {
        const u = i / n;
        const c0i = c0[i]!, c1i = c1[i]!;
        // Edges are the boundary curves themselves — the watertight seam.
        const phi = phiOf(i, j);
        const onEdge = j === 0 || j === n || i === 0 || i === n;
        let p: Pt3 =
          j === 0 ? c0i :
          j === n ? c1i :
          i === 0 ? d0j :
          i === n ? d1j :
          coonsBlend(c0i, c1i, d0j, d1j, b.corners, u, v);
        // Φ is exactly zero on every edge, so an edge vertex is still the
        // shared curve bit for bit — the watertight seam is untouched. Its
        // NORMAL is not: the whole point of the field is that Φ_v is nonzero
        // there, so the correction goes into the partials everywhere.
        if (phi && !onEdge) {
          const f = coonsPhi(phi, u, v);
          p = [p[0] + f[0], p[1] + f[1], p[2] + f[2]];
        }
        let su = coonsSu(c0d[i]!, c1d[i]!, d0j, d1j, b.corners, v);
        let sv = coonsSv(c0i, c1i, d0dj, d1dj, b.corners, u);
        if (phi) {
          const pu = coonsPhiU(phi, u, v);
          const pv = coonsPhiV(phi, u, v);
          su = [su[0] + pu[0], su[1] + pu[1], su[2] + pu[2]];
          sv = [sv[0] + pv[0], sv[1] + pv[1], sv[2] + pv[2]];
        }
        const nrm = norm3(cross3(su, sv));
        const at = (vBase + j * (n + 1) + i) * 3;
        positions[at] = p[0]; positions[at + 1] = p[1]; positions[at + 2] = p[2];
        normals[at] = nrm[0]; normals[at + 1] = nrm[1]; normals[at + 2] = nrm[2];
      }
    }

    let cursor = ci * idxPerCell;
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const a = vBase + j * (n + 1) + i;
        const bIdx = a + 1;
        const c = vBase + (j + 1) * (n + 1) + i;
        const dIdx = c + 1;
        indices[cursor++] = a; indices[cursor++] = bIdx; indices[cursor++] = dIdx;
        indices[cursor++] = a; indices[cursor++] = dIdx; indices[cursor++] = c;
      }
    }

    ranges.push({ id: cell.id, start: ci * idxPerCell, count: idxPerCell });
  }

  return { positions, normals, indices, ranges };
}

interface LineEntry {
  readonly id: Id;
  readonly chain: CurveChain;
}

function datumChain(kind: "through-line" | "sketch-line", line: { point: Pt3; dir: Pt3 } | LineSpec): CurveChain {
  if (kind === "through-line" && "point" in line) {
    const reach = scale3(line.dir, DATUM_HALF_LENGTH);
    return lineChain(sub3(line.point, reach), add3(line.point, reach));
  }
  if (kind === "sketch-line" && "view" in line) {
    // Sketch lines are authored in a view with no depth: drawn on the view
    // plane at along=0 (a section view's own station), a deterministic choice.
    return lineChain(viewToWorld(line.view, line.a, 0), viewToWorld(line.view, line.b, 0));
  }
  throw new Error("surface: datum kind does not match its line record");
}

function buildLineFeed(entries: readonly LineEntry[]): LineFeed {
  const sorted = [...entries].sort((a, b) => idCompare(a.id, b.id));
  let totalPoints = 0;
  const segCounts: number[] = [];
  for (const e of sorted) {
    const m = e.chain.segs.length * LINE_SEGMENTS_PER_SEG;
    segCounts.push(m);
    totalPoints += 2 * m;
  }
  const positions = new Float64Array(totalPoints * 3);
  const ranges: FeedRange[] = [];
  let pointCursor = 0;
  for (let e = 0; e < sorted.length; e++) {
    const entry = sorted[e];
    const m = segCounts[e];
    if (!entry || m === undefined) continue;
    const pts: Pt3[] = [];
    for (let k = 0; k <= m; k++) pts.push(evalChain(entry.chain, k / m));
    // FeedRange for lines indexes POSITIONS (floats), per the frozen schema —
    // every consumer (viewport, pick, snap) reads it that way. Emitting point
    // units here scrambled the line overlay: the first whole car drawn made it
    // obvious, the boxes before it did not.
    const start = pointCursor * 3;
    for (let k = 0; k < m; k++) {
      const a = pts[k]!, b = pts[k + 1]!;
      let at = pointCursor * 3;
      positions[at++] = a[0]; positions[at++] = a[1]; positions[at++] = a[2];
      positions[at++] = b[0]; positions[at++] = b[1]; positions[at++] = b[2];
      pointCursor += 2;
    }
    ranges.push({ id: entry.id, start, count: 2 * m * 3 });
  }
  return { positions, ranges };
}

/** The full render feed of a frame state: quilt surfaces, curve+datum lines,
 *  snaps (empty this phase). Identical state -> byte-identical buffers. */
export function buildRenderFeed(state: FrameState, opts: RenderFeedOptions = {}): RenderFeed {
  const resolution = checkResolution(opts.resolution ?? DEFAULT_RESOLUTION);
  const spec = state.quilt();

  const entries: LineEntry[] = [];
  for (const id of [...spec.curves.keys()].sort(idCompare)) {
    const chain = spec.curves.get(id);
    if (chain) entries.push({ id, chain });
  }
  for (const id of [...state.datums.keys()].sort(idCompare)) {
    const datum = state.datums.get(id);
    if (datum) entries.push({ id, chain: datumChain(datum.kind, datum.line) });
  }

  return {
    surfaces: tessellateQuilt(spec, resolution, opts.cross),
    lines: buildLineFeed(entries),
    snaps: [],
  };
}

// Re-exported for callers who want a one-off normal without a full feed.
export { boundaryCoonsNormal };
