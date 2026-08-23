/**
 * Cross-boundary continuity probe — how smooth the quilt actually is, as a
 * number rather than as an impression.
 *
 * WHY THIS EXISTS. The zebra lens was used to claim the P1's body was "G1 and
 * not G2". It could not have measured that: it runs on the crease-split
 * render normals, so at the crease angle every deliberate smoothing-group
 * split breaks a stripe by construction, and a real discontinuity and an
 * intended one look identical. This asks the surfaces directly instead.
 *
 * WHAT IT MEASURES. Two patches sharing a curve are G0 if they meet on it
 * (which this quilt guarantees by construction — a patch edge short-circuits
 * to the shared curve bit for bit) and G1 if they share a TANGENT PLANE along
 * it. So the test is the angle between the two patches' outward unit normals
 * at the same point on the shared curve. Zero means the tangent planes agree
 * and the join is G1; anything else is the G1 defect, in degrees.
 *
 * Comparing cross-boundary derivatives directly would be the obvious thing
 * and the wrong one: two patches can span the same tangent plane with
 * cross-derivatives of different length and different tangential component,
 * and that join is perfectly G1. The normal is what is invariant.
 *
 * WHAT IT DELIBERATELY IGNORES. Creased curves. A crease is an authored
 * tangent break, and reporting one as a defect would be the same class of
 * mistake the zebra made. The count of excluded joins is reported so the
 * exclusion cannot hide anything.
 *
 * Deterministic: ID-sorted traversal, fixed sampling, no wall clock.
 */

import type { Id, Pt3, QuiltSpec } from "@car/schema";
import { nacos, clamp } from "@car/num";
import { cellBoundary, type BoundarySide, type CellBoundary } from "./boundary.js";
import { boundaryCoonsNormal } from "./coons.js";

export interface ContinuityStation {
  readonly curveId: Id;
  readonly cellA: Id;
  readonly cellB: Id;
  /** Global curve parameter of the sample. */
  readonly t: number;
  readonly at: Pt3;
  /** Angle between the two patches' outward normals, degrees. */
  readonly angleDeg: number;
}

export interface ContinuityReport {
  /** Shared-curve adjacencies actually compared. */
  readonly joins: number;
  /** Adjacencies skipped because the curve is creased — an authored break. */
  readonly creased: number;
  /** Adjacencies skipped because the two trims do not overlap. */
  readonly disjoint: number;
  readonly samples: number;
  readonly worstDeg: number;
  readonly medianDeg: number;
  readonly p90Deg: number;
  readonly worst: ContinuityStation | null;
  /** Joins whose worst sample is under `g1ToleranceDeg`. */
  readonly g1Joins: number;
  readonly note: string;
}

export interface ContinuityOptions {
  /** Interior samples per join. Endpoints are corners and are left alone. */
  readonly samplesPerJoin?: number;
  /** A join this close to flat counts as G1 for the summary. */
  readonly g1ToleranceDeg?: number;
}

const DEFAULT_SAMPLES = 9;
const DEFAULT_G1_TOL_DEG = 1;

/** Loop parameter s of a side, from a global curve parameter t. */
function sideParamOf(side: BoundarySide, t: number): number {
  const span = side.reversed ? side.t0 - side.t1 : side.t1 - side.t0;
  if (span === 0) return 0;
  const base = side.reversed ? side.t1 : side.t0;
  return (t - base) / span;
}

/** (u,v) on the patch for loop parameter s along side k. */
function uvOnSide(k: number, s: number): [number, number] {
  if (k === 0) return [s, 0];
  if (k === 1) return [1, s];
  if (k === 2) return [1 - s, 1];
  return [0, 1 - s];
}

const angleBetween = (a: Pt3, b: Pt3): number => {
  const dot = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  return (nacos(clamp(dot, -1, 1)) * 180) / Math.PI;
};

const isZero = (v: Pt3): boolean => v[0] === 0 && v[1] === 0 && v[2] === 0;

/**
 * Walk every shared curve and report how far the two patches on it are from
 * sharing a tangent plane.
 */
export function continuityProbe(
  quilt: QuiltSpec,
  opts: ContinuityOptions = {},
): ContinuityReport {
  const n = opts.samplesPerJoin ?? DEFAULT_SAMPLES;
  const tol = opts.g1ToleranceDeg ?? DEFAULT_G1_TOL_DEG;

  // Index every (cell, side) by the curve it sits on. Cells in ID order so
  // the pairing below is deterministic.
  const boundaries = new Map<Id, CellBoundary>();
  const bySide = new Map<Id, { cellId: Id; k: number }[]>();
  const cells = [...quilt.cells].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  for (const cell of cells) {
    const b = cellBoundary(cell, quilt);
    boundaries.set(cell.id, b);
    for (let k = 0; k < 4; k++) {
      const side = b.sides[k]!;
      const list = bySide.get(side.curveId);
      if (list) list.push({ cellId: cell.id, k });
      else bySide.set(side.curveId, [{ cellId: cell.id, k }]);
    }
  }

  const angles: number[] = [];
  let worst: ContinuityStation | null = null;
  let joins = 0;
  let creased = 0;
  let disjoint = 0;
  let g1Joins = 0;

  for (const curveId of [...bySide.keys()].sort()) {
    const owners = bySide.get(curveId)!;
    for (let i = 0; i < owners.length; i++) {
      for (let j = i + 1; j < owners.length; j++) {
        const A = owners[i]!, B = owners[j]!;
        const bA = boundaries.get(A.cellId)!, bB = boundaries.get(B.cellId)!;
        const sA = bA.sides[A.k]!, sB = bB.sides[B.k]!;

        // Adjacency FIRST. A long master line is a side of a dozen cells that
        // are nowhere near each other, and pairing all of them gives C(12,2)
        // phantom joins. Two owners are neighbours only where their trims
        // overlap over a real range — T-junctions are legal everywhere, so
        // the ranges need not be equal, but they must overlap. Touching at a
        // single point is not a shared edge.
        const loA = Math.min(sA.t0, sA.t1), hiA = Math.max(sA.t0, sA.t1);
        const loB = Math.min(sB.t0, sB.t1), hiB = Math.max(sB.t0, sB.t1);
        const lo = Math.max(loA, loB), hi = Math.min(hiA, hiB);
        if (hi - lo <= 0) { disjoint++; continue; }

        // Only then: a creased curve is an authored tangent break, not a
        // defect. Testing this first counted every phantom pair as a crease
        // and reported 1408 exclusions against 102 real joins.
        if (quilt.creases.has(curveId)) { creased++; continue; }

        joins++;
        let worstHere = 0;
        for (let m = 1; m <= n; m++) {
          const t = lo + ((hi - lo) * m) / (n + 1);   // interior only
          const [ua, va] = uvOnSide(A.k, sideParamOf(sA, t));
          const [ub, vb] = uvOnSide(B.k, sideParamOf(sB, t));
          const nA = boundaryCoonsNormal(bA, ua, va);
          const nB = boundaryCoonsNormal(bB, ub, vb);
          // A degenerate patch corner has no normal; it has nothing to say
          // about continuity either, so it is skipped rather than counted as
          // agreement — same rule the curvature lens landed on.
          if (isZero(nA) || isZero(nB)) continue;
          const deg = angleBetween(nA, nB);
          angles.push(deg);
          if (deg > worstHere) worstHere = deg;
          if (worst === null || deg > worst.angleDeg) {
            worst = {
              curveId, cellA: A.cellId, cellB: B.cellId, t,
              at: sA.atCurveParam(t), angleDeg: deg,
            };
          }
        }
        if (worstHere <= tol) g1Joins++;
      }
    }
  }

  const sorted = [...angles].sort((a, b) => a - b);
  const at = (f: number): number =>
    sorted.length === 0 ? 0 : sorted[Math.min(sorted.length - 1, Math.floor(f * sorted.length))]!;

  return {
    joins, creased, disjoint,
    samples: angles.length,
    worstDeg: sorted.length === 0 ? 0 : sorted[sorted.length - 1]!,
    medianDeg: at(0.5),
    p90Deg: at(0.9),
    worst,
    g1Joins,
    note:
      "Angle between the two patches' outward normals on the shared curve. " +
      "0° means they share a tangent plane and the join is G1. Creased curves " +
      "are excluded — a crease is an authored break, not a defect.",
  };
}
