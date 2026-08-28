/**
 * Cross-boundary curvature RATE continuity — the G3 probe.
 *
 * `continuityProbe` asks whether two patches share a tangent plane (G1);
 * `curvatureJoinProbe` asks whether they bend the same amount as you cross
 * the seam (G2). This asks the next derivative: does the bending CHANGE at
 * the same rate? G2 keeps a reflection unbroken across a seam; G3 keeps its
 * flow — a G2 join with a G3 defect shows a reflection whose speed jumps as
 * it crosses, which a trained eye reads as a subtle hardness even on a body
 * whose zebra is perfect. It is the last of the visible orders: nobody's eye
 * reads G4.
 *
 * WHAT IS MEASURED. Walk across the seam along the transverse direction and
 * write the surface's normal curvature as a function of signed arc length,
 * κ(s), with s < 0 on owner A and s > 0 on owner B. G2 is κ continuous at 0;
 * G3 is dκ/ds continuous at 0. Each owner can only be asked one-sidedly, and
 * each is asked along its OWN inward direction — which are opposite — so the
 * two inward slopes of a G3 join must CANCEL, not agree:
 *
 *   dκ/ds continuous  ⇔  κ′_A(inward) + κ′_B(inward) = 0
 *
 * (κ itself is even in the direction, which is why the G2 probe needs no such
 * bookkeeping; its derivative is odd, which is why this one does.)
 *
 * HOW κ′ IS READ, and why not from a third derivative. The analytic jet stops
 * at second order — S_uu, S_uv, S_vv exist only on an edge, and no third
 * partial exists anywhere — so κ′ must come from κ at stations marching into
 * the panel. Three numerical layers, each leaning on an analytic quantity
 * rather than a differenced one:
 *
 *   κ(0)      analytic: the edge jet + the second fundamental form, exactly
 *             as the G2 probe reads it. No differencing at all.
 *   κ(s_j)    at interior march stations, from a second-order jet assembled
 *             by CENTRAL DIFFERENCES OF THE ANALYTIC FIRST PARTIALS — one
 *             differencing layer over exact quantities, never a second
 *             difference of positions.
 *   κ′(0)     the slope at s = 0 of the parabola through κ(0), κ(s₁), κ(s₂),
 *             with the s_j measured as real chord distances, not assumed.
 *
 * TWO DIRECTION RULES, both learned from a version that broke them. The first
 * cut marched along the side's inward PARAMETER axis and read the curvature
 * along the march. On a fixture with perpendicular rails it was exact; on
 * every real car it read a 200% mismatch at every join — because a real
 * cell's parameter axis is oblique to its seam, and by Euler's formula the
 * along-march curvature mixes in the ALONG-SEAM curvature, which is large,
 * shared, and reads with the same sign from both sides. The probe was
 * measuring parameterisation, not surface. So:
 *
 *   the march runs along the parameter direction that maps to the seam's
 *   true in-surface perpendicular (resolved through the metric), and
 *
 *   κ at every station is evaluated in the FIXED world direction of that
 *   perpendicular, projected to the local tangent plane — never along
 *   whatever direction the march happens to have drifted to.
 *
 * The march step adapts to what it is measuring: a fraction of the local
 * radius where the surface is tight (a softened lip at R6 varies its
 * curvature inside a band a fixed step would leap over) and a couple of
 * millimetres where it is slack.
 *
 * WHAT IT DELIBERATELY DOES NOT CLAIM. This body's construction guarantees
 * G0/G1 exactly and fits G2; nothing in it corrects the third order, so these
 * numbers are a MEASUREMENT of where the construction lands, not a gate it
 * was built to. The report says which joins pass at the tolerance and how the
 * rest are distributed, and that is the whole claim.
 *
 * Deterministic: the same ID-ordered adjacency walk as every other probe.
 */

import type { Id, Pt3, QuiltSpec } from "@car/schema";
import { dot3, len3, nabs, nmax, nmin, norm3, cross3, scale3, sub3, dist3 } from "@car/num";
import { cellBoundary, type CellBoundary, type CrossPrescription } from "./boundary.js";
import {
  boundaryCoonsEdgeJet, boundaryCoonsPartials, boundaryCoonsPoint,
  inwardOf, normalCurvatureAt,
} from "./coons.js";
import {
  edgeDefectProfile, medianOf, quiltAdjacency, sideParamOf, uvOnSide,
} from "./adjacency.js";
import { DEFAULT_CREASE_ANGLE } from "./crease-angle.js";

export interface RateStation {
  readonly curveId: Id;
  readonly cellA: Id;
  readonly cellB: Id;
  readonly t: number;
  readonly at: Pt3;
  /** Each owner's inward curvature slope, 1/mm². A G3 join has them cancel. */
  readonly rateA: number;
  readonly rateB: number;
  /** |rateA + rateB|, 1/mm². */
  readonly gap: number;
  /** gap / max(|rateA|, |rateB|). 0 where both rates vanish. */
  readonly relative: number;
}

export interface CurvatureRateReport {
  readonly joins: number;
  readonly creased: number;
  readonly sharp: number;
  readonly samples: number;
  /** Absolute rate mismatch, 1/mm². */
  readonly medianGap: number;
  readonly p90Gap: number;
  readonly worstGap: number;
  /** Relative mismatch, as a fraction. */
  readonly medianRelative: number;
  readonly p90Relative: number;
  readonly worstRelative: number;
  /** Joins whose worst relative mismatch along their length is under
   *  `g3Tolerance`. */
  readonly g3Joins: number;
  readonly worst: RateStation | null;
  readonly note: string;
}

export interface CurvatureRateOptions {
  readonly samplesPerJoin?: number;
  /** A join whose relative rate mismatch stays under this counts as G3.
   *  Default 0.05 — looser than the G2 gate by design: the construction fits
   *  curvature and merely inherits its rate, and the grade should say which
   *  joins inherit it well rather than flunk the whole body on principle. */
  readonly g3Tolerance?: number;
  readonly breakAngleDeg?: number;
  readonly cross?: CrossPrescription;
}

const DEFAULT_SAMPLES = 9;
const DEFAULT_G3_TOL = 0.05;
/** March step where the surface is slack, mm. */
const SLACK_STEP_MM = 2;
/** Fraction of the local radius the step shrinks to where it is tight. */
const TIGHT_FRACTION = 0.1;
const MIN_STEP_MM = 0.05;

/** One owner's inward curvature slope at a station, 1/mm². */
function inwardRate(
  b: CellBoundary, k: number, s: number,
): { rate: number; curv0: number } | null {
  const [u0, v0] = uvOnSide(k, s);
  const jet = boundaryCoonsEdgeJet(b, u0, v0);
  const nHat = norm3(cross3(jet.su, jet.sv));
  if (nHat[0] === 0 && nHat[1] === 0 && nHat[2] === 0) return null;
  const inward = inwardOf(jet, k);
  const iLen = len3(inward);
  if (!(iLen > 0)) return null;

  // The seam's in-surface perpendicular, unit, pointing into this panel —
  // the direction every κ in this read is taken in.
  const tang = k === 0 || k === 2 ? jet.su : jet.sv;
  const tLen = len3(tang);
  if (!(tLen > 0)) return null;
  const tHat = scale3(tang, 1 / tLen);
  const perp0 = sub3(inward, scale3(tHat, dot3(inward, tHat)));
  const pLen = len3(perp0);
  if (!(pLen > 0)) return null;
  const eHat = scale3(perp0, 1 / pLen);

  // κ(0), analytically.
  const curv0 = normalCurvatureAt(jet, nHat, eHat);
  if (curv0 === null || !Number.isFinite(curv0)) return null;

  // The march direction IN PARAMETER SPACE: the (du,dv) whose image under
  // (S_u, S_v) is eHat — resolved through the metric, so the march leaves the
  // seam perpendicular in the surface rather than along whatever the cell's
  // parameter axis does. Because eHat is unit, a march step of d is d
  // millimetres, to first order.
  const E = dot3(jet.su, jet.su), F = dot3(jet.su, jet.sv), G = dot3(jet.sv, jet.sv);
  const det = E * G - F * F;
  if (!(nabs(det) > 0)) return null;
  const eu = dot3(eHat, jet.su), ev = dot3(eHat, jet.sv);
  const du = (G * eu - F * ev) / det;
  const dv = (E * ev - F * eu) / det;

  // Step: a couple of millimetres, or a tenth of the local radius where that
  // is tighter. A fixed step reads a softened R6 lip as whatever is two
  // millimetres past it.
  const r0 = nabs(curv0) > 0 ? 1 / nabs(curv0) : Infinity;
  const hMm = nmax(MIN_STEP_MM, nmin(SLACK_STEP_MM, r0 * TIGHT_FRACTION));

  const at = (d: number): [number, number] => [u0 + du * d, v0 + dv * d];
  const inside = ([u, v]: [number, number]): boolean =>
    u > 1e-6 && u < 1 - 1e-6 && v > 1e-6 && v < 1 - 1e-6;

  // The two march stations must stay inside the patch — a skewed cell can
  // send the perpendicular out through a lateral edge, and a clamped
  // evaluation would silently read the edge instead of the interior.
  if (!inside(at(hMm)) || !inside(at(2 * hMm))) return null;

  /** κ in the projected eHat direction at an interior point, from a jet
   *  assembled by central differences of the analytic first partials. */
  const FD = 1e-4;
  const kappaAt = (d: number): number | null => {
    const [um, vm] = at(d);
    if (um < 2 * FD || um > 1 - 2 * FD || vm < 2 * FD || vm > 1 - 2 * FD) return null;
    const M = boundaryCoonsPartials(b, um, vm);
    const nM = norm3(cross3(M.su, M.sv));
    if (nM[0] === 0 && nM[1] === 0 && nM[2] === 0) return null;
    const pu0 = boundaryCoonsPartials(b, um - FD, vm);
    const pu1 = boundaryCoonsPartials(b, um + FD, vm);
    const pv0 = boundaryCoonsPartials(b, um, vm - FD);
    const pv1 = boundaryCoonsPartials(b, um, vm + FD);
    const suu: [number, number, number] = [0, 0, 0];
    const svv: [number, number, number] = [0, 0, 0];
    const suv: [number, number, number] = [0, 0, 0];
    for (let i = 0; i < 3; i++) {
      suu[i] = (pu1.su[i]! - pu0.su[i]!) / (2 * FD);
      svv[i] = (pv1.sv[i]! - pv0.sv[i]!) / (2 * FD);
      // Two estimates of the mixed partial that agree analytically; their
      // mean keeps the assembled jet symmetric.
      suv[i] = ((pu1.sv[i]! - pu0.sv[i]!) / (2 * FD) + (pv1.su[i]! - pv0.su[i]!) / (2 * FD)) / 2;
    }
    // The FIXED direction, projected to the local tangent plane.
    const x = sub3(eHat, scale3(nM, dot3(eHat, nM)));
    if (!(len3(x) > 0)) return null;
    const kn = normalCurvatureAt({ su: M.su, sv: M.sv, suu, suv, svv }, nM, x);
    return kn !== null && Number.isFinite(kn) ? kn : null;
  };

  const k1 = kappaAt(hMm);
  const k2 = kappaAt(2 * hMm);
  if (k1 === null || k2 === null) return null;

  // Real chord distances from the seam, not the nominal step: the metric
  // resolution is exact only at the seam and the fit should not inherit the
  // drift.
  const p0 = boundaryCoonsPoint(b, u0, v0);
  const s1 = dist3(p0, boundaryCoonsPoint(b, ...at(hMm)));
  const s2 = dist3(p0, boundaryCoonsPoint(b, ...at(2 * hMm)));
  if (!(s1 > 0) || !(s2 > s1)) return null;

  // Slope at 0 of the parabola through (0, κ0), (s1, κ1), (s2, κ2).
  const a1 = (k1 - curv0) / s1;
  const a2 = (k2 - curv0) / s2;
  const rate = (a1 * s2 - a2 * s1) / (s2 - s1);
  return Number.isFinite(rate) ? { rate, curv0 } : null;
}

export function curvatureRateProbe(
  quilt: QuiltSpec,
  opts: CurvatureRateOptions = {},
): CurvatureRateReport {
  const n = opts.samplesPerJoin ?? DEFAULT_SAMPLES;
  const tol = opts.g3Tolerance ?? DEFAULT_G3_TOL;
  const breakAngle = opts.breakAngleDeg ?? DEFAULT_CREASE_ANGLE;
  const adj = quiltAdjacency(quilt);
  // Evenly spaced stations only. The corner crowd exists to catch a fade
  // band's G1 peak; at a corner every body is G1-and-nothing-more by
  // construction (the corrections must vanish there), so a G3 reading in the
  // crowd would say only "this body has corners" — the same argument that
  // keeps corners out of the G2 join count.
  const stations: number[] = [];
  for (let m = 1; m <= n; m++) stations.push(m / (n + 1));

  const cellsById = new Map<Id, (typeof quilt.cells)[number]>();
  for (const c of quilt.cells) cellsById.set(c.id, c);
  const built = new Map<Id, CellBoundary>();
  const boundaryOf = (id: Id): CellBoundary => {
    if (!opts.cross) return adj.boundaries.get(id)!;
    const hit = built.get(id);
    if (hit) return hit;
    const b = cellBoundary(cellsById.get(id)!, quilt, opts.cross);
    built.set(id, b);
    return b;
  };

  const gaps: number[] = [];
  const rels: number[] = [];
  let worst: RateStation | null = null;
  let joins = 0, creased = 0, sharp = 0, g3Joins = 0;

  for (const edge of adj.edges) {
    if (edge.creased) { creased++; continue; }
    if (medianOf(edgeDefectProfile(adj, edge, n)) > breakAngle) { sharp++; continue; }

    const bA = boundaryOf(edge.a.cellId);
    const bB = boundaryOf(edge.b.cellId);
    const sA = bA.sides[edge.a.k]!;
    const sB = bB.sides[edge.b.k]!;
    joins++;
    let worstRel = 0;
    let measured = false;
    for (const f of stations) {
      const t = edge.lo + (edge.hi - edge.lo) * f;
      const A = inwardRate(bA, edge.a.k, sideParamOf(sA, t));
      const B = inwardRate(bB, edge.b.k, sideParamOf(sB, t));
      if (!A || !B) continue;
      measured = true;
      const gap = nabs(A.rate + B.rate);
      const scale = nmax(nabs(A.rate), nabs(B.rate));
      const rel = scale > 0 ? gap / scale : 0;
      gaps.push(gap);
      rels.push(rel);
      if (rel > worstRel) worstRel = rel;
      if (worst === null || gap > worst.gap) {
        worst = {
          curveId: edge.curveId, cellA: edge.a.cellId, cellB: edge.b.cellId,
          t, at: sA.atCurveParam(t), rateA: A.rate, rateB: B.rate, gap, relative: rel,
        };
      }
    }
    if (measured && worstRel <= tol) g3Joins++;
  }

  const pct = (xs: readonly number[], f: number): number => {
    if (xs.length === 0) return 0;
    const a = [...xs].sort((x, y) => x - y);
    return a[Math.min(a.length - 1, Math.floor(f * a.length))]!;
  };

  return {
    joins, creased, sharp,
    samples: gaps.length,
    medianGap: pct(gaps, 0.5), p90Gap: pct(gaps, 0.9),
    worstGap: worst === null ? 0 : worst.gap,
    medianRelative: pct(rels, 0.5), p90Relative: pct(rels, 0.9),
    worstRelative: pct(rels, 1),
    g3Joins, worst,
    note:
      "Inward curvature slope dκ/ds on each side of the join, 1/mm². A G3 " +
      "join has the two inward slopes cancel. Measured, not corrected: the " +
      "construction guarantees G0/G1 and fits G2; the third order is " +
      "inherited, and this is where it lands.",
  };
}
