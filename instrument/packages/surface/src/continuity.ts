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
import { cross3, dot3, len3, natan2 } from "@car/num";
import { cellBoundary, type CellBoundary, type CrossPrescription } from "./boundary.js";
import { boundaryCoonsNormal } from "./coons.js";
import { edgeDefectProfile, medianOf, quiltAdjacency, sideParamOf, uvOnSide } from "./adjacency.js";
import { DEFAULT_CREASE_ANGLE } from "./crease-angle.js";

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
  /**
   * Adjacencies skipped because they turn sharper than the break angle. These
   * are breaks the designer did not mark; the tool treats them as features
   * for the same reason the renderer creases them, and counts them out loud
   * because a body full of unmarked edges would otherwise read as a body with
   * nothing wrong with it.
   */
  readonly sharp: number;
  /** The angle used to separate a feature from a defect. */
  readonly breakAngleDeg: number;
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
  /** Joins turning sharper than this are features, not defects. Must match
   *  whatever the field under test was built with. */
  readonly breakAngleDeg?: number;
  /**
   * Measure the CORRECTED surface. The probe must be handed the same field
   * the renderer and the mesher were handed, or it is reporting on a body
   * nobody built — which is the exact failure this file exists to prevent.
   */
  readonly cross?: CrossPrescription;
}

const DEFAULT_SAMPLES = 9;
const DEFAULT_G1_TOL_DEG = 1;

/**
 * Angle between two unit vectors, in degrees.
 *
 * atan2(|a×b|, a·b) rather than acos(a·b). The two agree mathematically and
 * do not agree numerically anywhere near zero, which is precisely where this
 * probe now spends its time: for a perfect join the dot product lands one ulp
 * below 1 and acos turns that into sqrt(2ε) ≈ 1.2 × 10⁻⁶ degrees of pure
 * arithmetic. That floor was invisible while the defect was ten degrees and
 * would have been reported as the surface's residual once it wasn't. atan2
 * has no such floor: it reads an exact join as an exact zero.
 */
const angleBetween = (a: Pt3, b: Pt3): number =>
  (natan2(len3(cross3(a, b)), dot3(a, b)) * 180) / Math.PI;

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
  const breakAngle = opts.breakAngleDeg ?? DEFAULT_CREASE_ANGLE;

  // ONE adjacency walk, shared with the field that removes what this measures.
  const adj = quiltAdjacency(quilt);

  // Boundaries carrying the field under test. The adjacency's own boundaries
  // are deliberately uncorrected — that is what the field is derived from —
  // so when a field is supplied the probe rebuilds against it.
  const cellsById = new Map<Id, (typeof quilt.cells)[number]>();
  for (const c of quilt.cells) cellsById.set(c.id, c);
  const measured = new Map<Id, CellBoundary>();
  const boundaryOf = (id: Id): CellBoundary => {
    if (!opts.cross) return adj.boundaries.get(id)!;
    const hit = measured.get(id);
    if (hit) return hit;
    const built = cellBoundary(cellsById.get(id)!, quilt, opts.cross);
    measured.set(id, built);
    return built;
  };

  const angles: number[] = [];
  let worst: ContinuityStation | null = null;
  let joins = 0;
  let creased = 0;
  let sharp = 0;
  let g1Joins = 0;

  for (const edge of adj.edges) {
    // A crease is an authored tangent break, not a defect. Reporting one
    // would be the same class of mistake the zebra made.
    if (edge.creased) { creased++; continue; }

    // Classified on the UNCORRECTED geometry, exactly as the field classifies
    // it. Reading the corrected surface here would be circular: a correction
    // that half-smoothed a right angle would reclassify it as smooth and then
    // be graded against its own handiwork.
    if (medianOf(edgeDefectProfile(adj, edge, n)) > breakAngle) { sharp++; continue; }

    const bA = boundaryOf(edge.a.cellId);
    const bB = boundaryOf(edge.b.cellId);
    const sA = bA.sides[edge.a.k]!;
    const sB = bB.sides[edge.b.k]!;

    joins++;
    let worstHere = 0;
    for (let m = 1; m <= n; m++) {
      const t = edge.lo + ((edge.hi - edge.lo) * m) / (n + 1);   // interior only
      const [ua, va] = uvOnSide(edge.a.k, sideParamOf(sA, t));
      const [ub, vb] = uvOnSide(edge.b.k, sideParamOf(sB, t));
      const nA = boundaryCoonsNormal(bA, ua, va);
      const nB = boundaryCoonsNormal(bB, ub, vb);
      // A degenerate patch corner has no normal; it has nothing to say about
      // continuity either, so it is skipped rather than counted as agreement
      // — the same rule the curvature lens landed on.
      if (isZero(nA) || isZero(nB)) continue;
      const deg = angleBetween(nA, nB);
      angles.push(deg);
      if (deg > worstHere) worstHere = deg;
      if (worst === null || deg > worst.angleDeg) {
        worst = {
          curveId: edge.curveId, cellA: edge.a.cellId, cellB: edge.b.cellId, t,
          at: sA.atCurveParam(t), angleDeg: deg,
        };
      }
    }
    if (worstHere <= tol) g1Joins++;
  }

  const disjoint = adj.disjointPairs;

  const sorted = [...angles].sort((a, b) => a - b);
  const at = (f: number): number =>
    sorted.length === 0 ? 0 : sorted[Math.min(sorted.length - 1, Math.floor(f * sorted.length))]!;

  return {
    joins, creased, sharp, breakAngleDeg: breakAngle, disjoint,
    samples: angles.length,
    worstDeg: sorted.length === 0 ? 0 : sorted[sorted.length - 1]!,
    medianDeg: at(0.5),
    p90Deg: at(0.9),
    worst,
    g1Joins,
    note:
      "Angle between the two patches' outward normals on the shared curve. " +
      "0° means they share a tangent plane and the join is G1. Creased curves " +
      "are excluded — a crease is an authored break, not a defect — as are " +
      `joins turning sharper than ${breakAngle}°, which are features nobody marked.`,
  };
}

/**
 * The corner obstruction — the part of the G1 defect no surfacing pass can
 * remove, because the CURVE NETWORK pins it.
 *
 * A patch that interpolates its four boundary curves has no freedom at a
 * corner: S_u there IS one curve's tangent and S_v IS the other's, so its
 * tangent plane at the vertex is span of the two curves meeting there and
 * nothing can be done about it. Two patches across a shared curve therefore
 * agree at the vertex only if the curves turning that corner on their two
 * sides are coplanar with the shared curve — a condition on the network, not
 * on the surfaces.
 *
 * This is the vertex enclosure problem stated as a measurement. Where this
 * comes back at zero, the tangent field can run to the corner and the join is
 * G1 end to end. Where it does not, the corner window has to fade the
 * correction out over some band, and this number is what is left inside that
 * band. Reporting it separates two very different faults that look identical
 * on a zebra: a surfacing pass that did not do its job, and a curve network
 * that will not let it.
 *
 * Measured on the UNCORRECTED patches, which is not an approximation: every
 * correction vanishes at the corners by construction, so the corner values
 * are the same either way.
 */
export interface CornerObstruction {
  readonly curveId: Id;
  readonly cellA: Id;
  readonly cellB: Id;
  /** Which end of the shared stretch: 0 = lo, 1 = hi. */
  readonly end: 0 | 1;
  readonly at: Pt3;
  readonly angleDeg: number;
}

export interface NetworkReport {
  readonly corners: number;
  readonly medianDeg: number;
  readonly p90Deg: number;
  readonly worstDeg: number;
  /** Corners already coplanar to within `toleranceDeg`. */
  readonly cleanCorners: number;
  readonly toleranceDeg: number;
  readonly worst: CornerObstruction | null;
  readonly note: string;
}

export interface NetworkOptions {
  readonly breakAngleDeg?: number;
  /** How close to the corner to read. Not 0: a corner can be degenerate. */
  readonly epsilon?: number;
  readonly toleranceDeg?: number;
  readonly samplesPerJoin?: number;
}

export function networkObstruction(
  quilt: QuiltSpec,
  opts: NetworkOptions = {},
): NetworkReport {
  const breakAngle = opts.breakAngleDeg ?? DEFAULT_CREASE_ANGLE;
  const eps = opts.epsilon ?? 1e-5;
  const tol = opts.toleranceDeg ?? DEFAULT_G1_TOL_DEG;
  const n = opts.samplesPerJoin ?? DEFAULT_SAMPLES;
  const adj = quiltAdjacency(quilt);

  const angles: number[] = [];
  let worst: CornerObstruction | null = null;
  let clean = 0;

  for (const edge of adj.edges) {
    if (edge.creased) continue;
    if (medianOf(edgeDefectProfile(adj, edge, n)) > breakAngle) continue;
    const bA = adj.boundaries.get(edge.a.cellId)!;
    const bB = adj.boundaries.get(edge.b.cellId)!;
    const sA = bA.sides[edge.a.k]!;
    const sB = bB.sides[edge.b.k]!;
    for (const end of [0, 1] as const) {
      const f = end === 0 ? eps : 1 - eps;
      const t = edge.lo + (edge.hi - edge.lo) * f;
      const [ua, va] = uvOnSide(edge.a.k, sideParamOf(sA, t));
      const [ub, vb] = uvOnSide(edge.b.k, sideParamOf(sB, t));
      const nA = boundaryCoonsNormal(bA, ua, va);
      const nB = boundaryCoonsNormal(bB, ub, vb);
      if (isZero(nA) || isZero(nB)) continue;
      const deg = angleBetween(nA, nB);
      angles.push(deg);
      if (deg <= tol) clean++;
      if (worst === null || deg > worst.angleDeg) {
        worst = {
          curveId: edge.curveId, cellA: edge.a.cellId, cellB: edge.b.cellId,
          end, at: sA.atCurveParam(t), angleDeg: deg,
        };
      }
    }
  }

  const sorted = [...angles].sort((a, b) => a - b);
  const at = (f: number): number =>
    sorted.length === 0 ? 0 : sorted[Math.min(sorted.length - 1, Math.floor(f * sorted.length))]!;

  return {
    corners: angles.length,
    medianDeg: at(0.5),
    p90Deg: at(0.9),
    worstDeg: sorted.length === 0 ? 0 : sorted[sorted.length - 1]!,
    cleanCorners: clean,
    toleranceDeg: tol,
    worst,
    note:
      "Tangent-plane disagreement AT the shared curve's endpoints, where a " +
      "Coons patch has no freedom: its tangent plane there is spanned by the " +
      "two curves meeting at the vertex. This is a curve-network property and " +
      "no surfacing pass can remove it.",
  };
}
