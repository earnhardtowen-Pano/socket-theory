/**
 * The cross-boundary tangent field — tangent-plane continuity made a property
 * of the CURVE rather than of either patch.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHY THE QUILT IS ONLY G0 WITHOUT THIS
 *
 * A bilinearly blended Coons patch takes four boundary curves and nothing
 * else. Differentiate it across its bottom edge and you get
 *
 *     S_v(u,0) = c1(u) - c0(u) + (1-u)[d0'(0) - (P01-P00)] + u[d1'(0) - (P11-P10)]
 *
 * — the cross-boundary derivative on one edge is fixed by the OPPOSITE edge.
 * Two patches sharing a curve have different opposite edges, so their tangent
 * planes disagree, and no amount of tuning the boundary curves fixes it. That
 * is a property of the representation, not a miss. Measured on the P1:
 * 6 of 102 joins under 1°, median defect 10.21°.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHAT G1 ACTUALLY REQUIRES
 *
 * Not equal derivatives — equal tangent PLANES. On the shared curve both
 * patches already have the same first spanning vector, the curve tangent T,
 * exactly (the edge IS the curve, bit for bit). So the join is G1 iff their
 * cross-boundary derivatives lie in one plane with T. Nothing is required of
 * the derivatives' lengths, and nothing is required of their component ALONG
 * T — that component is reparameterisation, not shape.
 *
 * So the shared object is a single unit direction d̂(t), transverse to the
 * curve, owned by the curve. Patch A is handed +d̂, patch B is handed -d̂,
 * each scaled by its own natural magnitude and keeping its own tangential
 * component. Both tangent planes are then span{T, d̂} — the same plane, by
 * construction rather than by tolerance, which is the same move the weld law
 * already makes for position.
 *
 *     A⊥ = N_A - (N_A·T̂)T̂        (each patch's natural inward cross-derivative,
 *     B⊥ = N_B - (N_B·T̂)T̂         transverse part only)
 *     d̂  = normalise(Â⊥ - B̂⊥)     (unit inputs: neither owner outvotes the other)
 *     Δ_A = |A⊥|(d̂ - Â⊥)          (what to add to A's natural derivative)
 *     Δ_B = |B⊥|(-d̂ - B̂⊥)
 *
 * Unit inputs matter. Averaging the raw vectors would let the patch with the
 * longer parameterisation drag the plane toward itself, and the two sides of
 * a T-junction have deliberately different parameter spans.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * HOW THE CORRECTION IS APPLIED WITHOUT BREAKING WATERTIGHTNESS
 *
 * The patch becomes S = S₀ + Φ, S₀ the existing Coons blend and
 *
 *     Φ(u,v) = g(v)·Δ₀(u) + h(u)·Δ₁(v) + h(v)·Δ₂(1-u) + g(u)·Δ₃(1-v)
 *     g(x) = x(1-x)²   h(x) = x²(1-x)
 *
 * g and h are the two cubic Hermite tangent bases. Each is zero at both ends;
 * g' is 1 at 0 and 0 at 1, h' is 0 at 0 and -1 at 1. So the term for side k
 * contributes exactly Δ_k to the inward cross-derivative on side k, and
 * exactly nothing — value AND derivative — to the other three.
 *
 * That leaves one requirement, and it is the whole reason the corner window
 * below exists: every Δ_k must vanish TO FIRST ORDER at its own two ends.
 * Otherwise g(v)·Δ₀(0) moves the left edge (G0 gone) and g(v)·Δ₀'(0) tilts it
 * (the correction leaks into the neighbouring side). With that condition met,
 * on the bottom edge
 *
 *     Φ(u,0) = 0,  Φ_u(u,0) = 0,  Φ_v(u,0) = Δ₀(u)   — all three exact.
 *
 * The patch edges are still the shared curves bit for bit; `closedMeshCheck`
 * is untouched; and the probe, which samples the boundary, needs no finite
 * differences to read the result.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * THE CORNER WINDOW, AND WHAT IT ADMITS
 *
 * At a cell corner the cross-derivative is not free: it IS the tangent of the
 * curve turning the corner. Patch A's prescription there is C_next's tangent
 * going one way; patch B's is C_next's tangent going the other. Those agree —
 * exactly, giving Δ(0) = 0 with no window needed — precisely when the curve
 * network is itself tangent-continuous through the vertex. Where it is not (a
 * T-junction landing mid-edge, a crease vertex, a chain with a kink), the two
 * prescriptions are genuinely incompatible and no patch pair can be G1 there.
 * This is the vertex enclosure problem and it is not going to be argued away.
 *
 * The response is a window, not a fudge:
 *
 *     Δ_k(s) = ρ(s)·Δraw_k(s),  ρ = smoothstep in, 1 across the middle, out
 *
 * ρ and ρ' are zero at both ends, satisfying the requirement above, and ρ is
 * exactly 1 over the interior — so the correction is applied at FULL strength
 * across the body of every edge and faded only inside `cornerFade` of a
 * vertex. Where the network is smooth the faded value was already the right
 * one and the window costs nothing.
 *
 * The alternative — a global cubic that removes the corner data across the
 * whole edge — was tried first and is wrong: the Hermite value bases sum to
 * one, so a constant defect gets cancelled everywhere and the correction does
 * nothing at all. Locality is the point.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHAT IS DELIBERATELY NOT CORRECTED
 *
 *  - Creased curves. An authored tangent break is the design, and smoothing
 *    it would be the same mistake as reporting it as a defect.
 *  - Curves with one owner. Nothing to agree with.
 *  - Stations where either transverse part vanishes, or where the two
 *    naturals point the SAME way (|Â⊥ - B̂⊥| ≈ 0, the surface folded back on
 *    itself). There is no tangent plane to share; inventing one would move
 *    geometry to satisfy a metric.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * THE FIELD IS A SPLINE (see `cross-poly.ts`)
 *
 * d̂ above is a normalised bisector, which is a square root, which means the
 * patch could be sampled and printed but not written down. By default this
 * builds the same field in a form that can be: one cubic B-spline direction
 * D* per shared edge, and per owner a pair of scalar splines placing its
 * cross-derivative in span{C', D*}. G1 is then exact by the same argument as
 * before — both owners read the same D* — and Δ = E - N is piecewise
 * polynomial, because the natural Coons cross-derivative N always was.
 *
 * WHAT IT COSTS, MEASURED. On the P1:
 *
 *   G1   exact in both forms; the spline body sits within 0.0065 mm of the
 *        bisector body, which is the fit tolerance carried through Φ's
 *        Hermite basis and nothing else.
 *   G2   was exact, is now a fit. Median relative curvature gap 0.000 % →
 *        0.154 %, joins within 1 % 23/64 → 19/64. The miss is concentrated
 *        in the corner fade, where the two patches have not yet converged on
 *        the normal Δ² is supposed to lie along, so the model is
 *        approximating something outside itself. Class-A grades G2 at 0.5 to
 *        5 % relative, so the median is still an order inside the tight end.
 *
 * `polynomial: false` returns the bisector field instead. It is not a fallback
 * and nothing in the pipeline uses it; it is there so the two can be measured
 * against each other, which is the only way to make the paragraph above a
 * measurement rather than a claim.
 *
 * Deterministic throughout: ID-ordered walk, fixed windows, no wall clock.
 */

import type { Id, Pt3, QuiltSpec } from "@car/schema";
import {
  bsplineAt, bsplineAt3, bsplineDerivAt, bsplineDerivAt3,
  chainDeriv, chainDeriv2, clamp, cross3, dot3, len3, natan2, norm3, scale3, sub3,
} from "@car/num";
import {
  cellBoundary, type BoundarySide, type CellBoundary, type CrossPrescription,
} from "./boundary.js";
import {
  boundaryCoonsEdgeJet, boundaryCoonsMixedNatural, boundaryCoonsNormal,
  boundaryCoonsPartials, inwardOf, normalCurvatureAt,
} from "./coons.js";
import {
  edgeDefectProfile,
  medianOf,
  quiltAdjacency,
  sideParamOf,
  uvOnSide,
  type QuiltAdjacency,
  type SharedEdge,
} from "./adjacency.js";
import { DEFAULT_CREASE_ANGLE } from "./crease-angle.js";
import {
  evalCrossDeriv, fitEdgeField, fitSecondMagnitude, sharedNormal,
  type EdgeSample, type OwnerCoeffs, type SecondStation,
} from "./cross-poly.js";

export interface CrossFieldOptions {
  /**
   * WIDEST the corner fade may be, in the side's own loop parameter. Each end
   * of each side gets its own width, scaled by how far that corner actually is
   * from closing — see `cornerFadeFloor`.
   */
  readonly cornerFade?: number;
  /**
   * Narrowest the fade may be, as a fraction of `cornerFade`.
   *
   * A corner the network turns cleanly needs no band at all — there is nothing
   * to fade — but the band cannot be zero, because Δ and its first two
   * derivatives have to vanish at the corner and only the window makes them.
   * So there is a floor, and the residual G1 defect a body carries is
   * proportional to it: on the P1 about 66° × the width, which at the default
   * is under a hundredth of a degree, an order inside the tightest Class-A G1
   * tolerance and four hundred times better than one width for every corner.
   */
  readonly cornerFadeFloor?: number;
  /**
   * Below this, the two patches' transverse directions are treated as having
   * no plane to share (they point the same way — a fold).
   */
  readonly minSeparation?: number;
  /** Transverse parts shorter than this, relative to the raw derivative, are
   *  degenerate: the patch runs into the curve rather than away from it. */
  readonly minTransverse?: number;
  /**
   * A join whose natural defect exceeds this is a FEATURE, not a defect, and
   * is left alone. Defaults to the render's own crease angle — the same
   * decision, made once (see `crease-angle.ts`).
   */
  readonly breakAngleDeg?: number;
  /** Stations used to classify a join as smooth or sharp. */
  readonly classifySamples?: number;
  /**
   * 1 = tangent plane (G1). 2 = tangent plane and cross-curvature (G2).
   * The second order is a second pass over the FIRST-order-corrected patches,
   * because the curvature to match is the curvature they end up with, not the
   * one they started with.
   */
  readonly order?: 1 | 2;
  /**
   * Build the polynomial field (the default) rather than the raw normalised
   * bisector. False is for measurement only — see the header.
   */
  readonly polynomial?: boolean;
  /** Degree of every fitted field. 3 unless there is a reason. */
  readonly fitDegree?: number;
  /** Cap on polynomial pieces per edge. */
  readonly maxSpans?: number;
  /** Relative residual the span doubling aims for. */
  readonly fitTolerance?: number;
}

const DEFAULT_CORNER_FADE = 0.12;
const DEFAULT_CORNER_FADE_FLOOR = 1e-4;
/** How close to a corner the obstruction is read. Not 0: a corner can be
 *  degenerate, and a degenerate corner has no normal to compare. */
const CORNER_EPS = 1e-5;
/** Central-difference step for Δraw′ — bisector form only; the polynomial
 *  form differentiates its own coefficients. */
const FD_STEP = 1e-4;
const DEFAULT_CLASSIFY_SAMPLES = 9;
const DEFAULT_MIN_SEPARATION = 1e-9;
const DEFAULT_MIN_TRANSVERSE = 1e-9;
const DEFAULT_FIT_DEGREE = 3;
/**
 * Cap on polynomial pieces per shared edge.
 *
 * Most joins take one piece. It is set this high for the few that do not: the
 * P1 has two, on a curve whose speed swings four to one under a join that turns
 * 52°, and they need every one of the thirty-two. The cap exists so that a
 * pathological curve costs a BOUNDED number of control points in the export
 * rather than an unbounded one; an edge that reaches it is reported as
 * unconverged with the residual it achieved, not dropped back to G0.
 */
const DEFAULT_MAX_SPANS = 32;
/**
 * Worst cross-derivative residual the span doubling aims for, in mm.
 *
 * Through the Hermite basis this is at most 4/27 of it in body, so 0.05 mm of
 * cross-derivative is under eight micrometres of car — thinner than the paint,
 * two orders below a panel gap, and the level at which "the spline body IS the
 * bisector body" is a statement rather than a hope.
 */
const DEFAULT_FIT_TOLERANCE = 0.05;

/** How well one shared edge's field came out as a polynomial. Shape, not
 *  continuity — see `cross-poly.ts`. */
export interface EdgeFitReport {
  readonly curveId: Id;
  readonly cellA: Id;
  readonly cellB: Id;
  /** Worst |E − target| / |target| over the check stations, both owners. */
  readonly relative: number;
  /** The same, absolute — mm of cross-derivative. */
  readonly worst: number;
  /** Polynomial pieces this edge needed. */
  readonly spans: number;
  /** False if the span cap was reached without meeting the tolerance. */
  readonly converged: boolean;
  /** Worst departure of D* from unit length over the stations. */
  readonly drift: number;
  /** Worst relative residual of the two G2 magnitude fits; 0 at order 1. */
  readonly secondRelative: number;
}

export interface CrossFieldStats {
  /** (cell, side) pairs carrying a prescription. */
  readonly correctedSides: number;
  /** Shared edges the field acted on. */
  readonly edges: number;
  /** Shared edges skipped because the curve is creased — an authored break. */
  readonly creasedEdges: number;
  /** Shared edges skipped because they turn sharper than the break angle.
   *  Every one of these is a break the designer did not mark. */
  readonly sharpEdges: number;
  /** The angle that classified them. */
  readonly breakAngleDeg: number;
  /** 1 or 2 — how far the prescription goes. */
  readonly order: 1 | 2;
  /** Sides with more than one neighbour over the same stretch. */
  readonly ambiguous: number;
  /** Polynomial form, or the raw bisector. */
  readonly polynomial: boolean;
  readonly fitDegree: number;
  /** Worst span count any edge needed. 1 means every edge is a plain Bézier. */
  readonly worstSpans: number;
  /** Edges whose fit did not reach the tolerance at the span cap. */
  readonly unconverged: number;
  /**
   * Worst and median relative residual of the (a, λ) fits — how far the
   * polynomial cross-derivative sits from the natural one, against the
   * natural one's own length. A SHAPE figure. It says nothing about G1,
   * which is exact in either form.
   */
  readonly fitWorst: number;
  readonly fitMedian: number;
  /** Worst departure of a fitted D* from unit length. Cosmetic — λ absorbs
   *  the magnitude — but a large one means the direction fit is straining. */
  readonly directionDrift: number;
  /** Smallest |λ| over every owner and station. Zero is a collapsed plane. */
  readonly minAcross: number;
  /** Edges dropped because too few stations had a bisector to fit. */
  readonly unfittable: number;
  /** Worst residual of the G2 magnitude fits, relative to the correction. */
  readonly secondFitWorst: number;
  /** Per-edge, in adjacency order. Empty in bisector form. */
  readonly fits: readonly EdgeFitReport[];
  /** Worst |E − target| over every edge, mm of cross-derivative. The number
   *  that bounds how far the spline body sits from the bisector body. */
  readonly fitWorstAbs: number;
}

export interface CrossField {
  /**
   * Correction to add to side k's INWARD cross-boundary derivative at loop
   * parameter s. Zero where nothing is prescribed.
   */
  defect(cellId: Id, k: number, s: number): Pt3;
  /**
   * d/ds of the above, along the edge. Exactly zero at s = 0 and s = 1 —
   * which is not a numerical accident but the condition that keeps Φ and its
   * partials off the other three sides of the patch (see the header).
   */
  defectDeriv(cellId: Id, k: number, s: number): Pt3;
  /** The correction BEFORE the corner window — what full G1 would have asked
   *  for. The gap between this and `defect` is what the window gave up. */
  rawDefect(cellId: Id, k: number, s: number): Pt3;
  /**
   * Δ²_k(s): the curvature correction, a vector along the shared normal.
   * Present only at order 2; a G1 field returns zero.
   */
  secondDefect(cellId: Id, k: number, s: number): Pt3;
  /** True if any of this cell's four sides carries a prescription. */
  has(cellId: Id): boolean;
  readonly stats: CrossFieldStats;
}

const ZERO: Pt3 = [0, 0, 0];
const isZeroPt = (v: Pt3): boolean => v[0] === 0 && v[1] === 0 && v[2] === 0;

/**
 * Smootherstep: 0 and 1 at the ends, with zero FIRST AND SECOND derivative at
 * both.
 *
 * The cubic smoothstep would do for G1 — it only has to be C¹ — but the G2
 * term needs every field flat to second order at its own ends, or the
 * curvature correction on one side leaks into the second derivative of the
 * side next to it and the two neighbours stop agreeing about the thing they
 * were just made to agree about. One window, strong enough for both.
 */
const smootherstep = (x: number): number => {
  const t = clamp(x, 0, 1);
  return t * t * t * (t * (6 * t - 15) + 10);
};
const smootherstepPrime = (x: number): number => {
  const t = clamp(x, 0, 1);
  return 30 * t * t * (t - 1) * (t - 1);
};

/**
 * The corner window. 0 (with zero slope) at s=0 and s=1, 1 across the middle.
 *
 * THE TWO ENDS ARE SIZED SEPARATELY, and that is the point. A side's two
 * corners are different corners: one may be a vertex the curve network turns
 * cleanly and the other a vertex it cannot. Giving both the same band makes the
 * clean one carry a defect it does not have — the band IS the defect, since
 * inside it the correction is only partly applied — and on the P1 that was
 * eight degrees of break sitting a twentieth of an edge from a corner that was
 * coplanar to a thousandth of a degree.
 */
export function cornerWindow(s: number, fade: number, fadeEnd = fade): number {
  if (s <= 0 || s >= 1) return 0;
  const a = Math.min(fade, 0.5);
  const b = Math.min(fadeEnd, 0.5);
  if (a > 0 && s < a) return smootherstep(s / a);
  if (b > 0 && s > 1 - b) return smootherstep((1 - s) / b);
  return 1;
}

/** dρ/ds, analytic — so the C¹ vanishing at the corners is exact, not FD noise. */
export function cornerWindowDeriv(s: number, fade: number, fadeEnd = fade): number {
  if (s <= 0 || s >= 1) return 0;
  const a = Math.min(fade, 0.5);
  const b = Math.min(fadeEnd, 0.5);
  if (a > 0 && s < a) return smootherstepPrime(s / a) / a;
  if (b > 0 && s > 1 - b) return -smootherstepPrime((1 - s) / b) / b;
  return 0;
}

/** Inward cross-boundary derivative of the UNCORRECTED patch on side k. */
export function naturalCross(b: CellBoundary, k: number, s: number): Pt3 {
  const [u, v] = uvOnSide(k, s);
  const { su, sv } = boundaryCoonsPartials(b, u, v);
  if (k === 0) return sv;
  if (k === 1) return scale3(su, -1);
  if (k === 2) return scale3(sv, -1);
  return su;
}

/**
 * The cross-derivative one owner should end up with: its own tangential part,
 * and its own transverse part turned onto the shared direction WITHOUT being
 * shortened.
 *
 *     target = (N·T̂)T̂ + |X⊥|·d̂
 *
 * This is `N + Δraw` for the bisector field, written directly — so a perfect
 * polynomial fit reproduces the bisector body exactly, and the fit residual
 * measures the polynomial and nothing else.
 */
function crossTarget(n: Pt3, tHat: Pt3, bis: { dHat: Pt3; aLen: number }): Pt3 {
  const along = dot3(n, tHat);
  return [
    along * tHat[0] + bis.aLen * bis.dHat[0],
    along * tHat[1] + bis.aLen * bis.dHat[1],
    along * tHat[2] + bis.aLen * bis.dHat[2],
  ];
}

/**
 * d/ds of the natural cross-derivative, exactly.
 *
 * Every side's natural cross-derivative differentiates along the edge to the
 * patch's mixed partial, up to the sign its loop direction puts on it: sides
 * 0 and 2 run with it and sides 1 and 3 against.
 */
function naturalCrossDeriv(b: CellBoundary, k: number, s: number): Pt3 {
  const [u, v] = uvOnSide(k, s);
  const suv = boundaryCoonsMixedNatural(b, u, v);
  return k === 0 || k === 2 ? suv : scale3(suv, -1);
}

/**
 * Unit tangent of the shared curve at global parameter t.
 *
 * Read off the ONE shared chain object, at the GLOBAL parameter, never
 * through either side's trim. Both owners therefore get a bit-identical
 * direction — including the two sides of a T-junction, whose loop parameters
 * run at different rates over the same stretch of curve.
 */
function curveTangent(b: CellBoundary, k: number, t: number): Pt3 {
  return norm3(chainDeriv(b.sides[k]!.chain, clamp(t, 0, 1)));
}

/** dt/ds of a side — the trim scale, signed by the loop direction. */
const trimScale = (side: BoundarySide): number =>
  side.reversed ? side.t0 - side.t1 : side.t1 - side.t0;

/**
 * One owner's fitted cross field on one shared edge.
 *
 * `dStar` is shared by reference with the other owner. That is the mechanism,
 * not an optimisation: two owners reading the same array cannot disagree about
 * which plane they are in, in the same way that two cells reading the same
 * chain object cannot disagree about where the boundary is.
 */
interface EdgePoly {
  readonly lo: number;
  readonly hi: number;
  readonly degree: number;
  readonly knots: readonly number[];
  readonly dStar: readonly Pt3[];
  readonly coeffs: OwnerCoeffs;
  /** μ for the G2 magnitude; empty until (and unless) the order-2 pass runs. */
  second: readonly number[];
}

interface Claim {
  readonly lo: number;
  readonly hi: number;
  /** The neighbour, as (cellId, k). */
  readonly otherCell: Id;
  readonly otherK: number;
  /** This owner's fitted field, or null in bisector form. */
  readonly poly: EdgePoly | null;
}

/** The queried owner's view of the shared transverse direction at a station. */
interface Bisector {
  /** Unit, and pointing out of the queried owner. */
  readonly dHat: Pt3;
  /** The queried owner's own unit transverse natural. */
  readonly aHat: Pt3;
  readonly aLen: number;
}

export function tangentField(quilt: QuiltSpec, opts: CrossFieldOptions = {}): CrossField {
  const adj = quiltAdjacency(quilt);
  return fieldFromAdjacency(adj, opts);
}

/** Same field, when the caller already has the adjacency walk in hand. */
export function fieldFromAdjacency(
  adj: QuiltAdjacency,
  opts: CrossFieldOptions = {},
): CrossField {
  const fade = opts.cornerFade ?? DEFAULT_CORNER_FADE;
  const minSep = opts.minSeparation ?? DEFAULT_MIN_SEPARATION;
  const minTrans = opts.minTransverse ?? DEFAULT_MIN_TRANSVERSE;
  const fadeFloor = opts.cornerFadeFloor ?? DEFAULT_CORNER_FADE_FLOOR;

  const breakAngle = opts.breakAngleDeg ?? DEFAULT_CREASE_ANGLE;
  const classifySamples = opts.classifySamples ?? DEFAULT_CLASSIFY_SAMPLES;

  const order: 1 | 2 = opts.order ?? 1;
  const polynomial = opts.polynomial ?? true;
  const fitDegree = Math.max(1, Math.floor(opts.fitDegree ?? DEFAULT_FIT_DEGREE));
  const maxSpans = Math.max(1, Math.floor(opts.maxSpans ?? DEFAULT_MAX_SPANS));
  const fitTolerance = opts.fitTolerance ?? DEFAULT_FIT_TOLERANCE;

  const claims = new Map<string, Claim[]>();
  let creasedEdges = 0;
  let sharpEdges = 0;
  let edgeCount = 0;

  const add = (cellId: Id, k: number, c: Claim): void => {
    const key = `${cellId}#${k}`;
    const list = claims.get(key);
    if (list) list.push(c);
    else claims.set(key, [c]);
  };

  // The decision is made ONCE PER EDGE, not per station. Deciding per sample
  // would let the correction switch on partway along a join and put a
  // tangent-plane step exactly where the field exists to remove one.
  const kept: SharedEdge[] = [];
  for (const e of adj.edges) {
    if (e.creased) { creasedEdges++; continue; }
    if (medianOf(edgeDefectProfile(adj, e, classifySamples)) > breakAngle) {
      sharpEdges++;
      continue;
    }
    kept.push(e);
  }

  /** The natural bisector at one station, seen from the queried owner. */
  const bisectorFrom = (
    bA: CellBoundary, kA: number, sA: number,
    bB: CellBoundary, kB: number, sB: number,
    tHat: Pt3,
  ): Bisector | null => {
    const nA = naturalCross(bA, kA, sA);
    const nB = naturalCross(bB, kB, sB);
    const perp = (n: Pt3): Pt3 => sub3(n, scale3(tHat, dot3(n, tHat)));
    const aPerp = perp(nA);
    const bPerp = perp(nB);
    const aLen = len3(aPerp);
    const bLen = len3(bPerp);
    if (aLen <= minTrans * (1 + len3(nA)) || bLen <= minTrans * (1 + len3(nB))) return null;
    const aHat = scale3(aPerp, 1 / aLen);
    const bHat = scale3(bPerp, 1 / bLen);
    const sep = sub3(aHat, bHat);
    const sepLen = len3(sep);
    if (sepLen <= minSep) return null;   // folded: no plane to share
    return { dHat: scale3(sep, 1 / sepLen), aHat, aLen };
  };

  // ── the fit ─────────────────────────────────────────────────────────────
  interface FittedEdge {
    readonly edge: SharedEdge;
    readonly sideA: BoundarySide;
    readonly sideB: BoundarySide;
    readonly chain: BoundarySide["chain"];
    readonly poly: EdgePoly;
    readonly polyB: EdgePoly;
    readonly samples: readonly EdgeSample[];
  }
  const fitted: FittedEdge[] = [];
  const reports: (EdgeFitReport & { secondRelative: number })[] = [];
  const fitRelatives: number[] = [];
  let unfittable = 0;
  let unconverged = 0;
  let worstSpans = 0;
  let worstDrift = 0;
  let fitWorstAbs = 0;
  let minAcross = Infinity;

  for (const e of kept) {
    const bA = adj.boundaries.get(e.a.cellId);
    const bB = adj.boundaries.get(e.b.cellId);
    if (!bA || !bB) continue;
    const claimA = { lo: e.lo, hi: e.hi, otherCell: e.b.cellId, otherK: e.b.k };
    const claimB = { lo: e.lo, hi: e.hi, otherCell: e.a.cellId, otherK: e.a.k };

    if (!polynomial) {
      add(e.a.cellId, e.a.k, { ...claimA, poly: null });
      add(e.b.cellId, e.b.k, { ...claimB, poly: null });
      edgeCount++;
      continue;
    }

    const sideA = bA.sides[e.a.k]!;
    const sideB = bB.sides[e.b.k]!;
    const sampler = (tau: number): EdgeSample | null => {
      const t = e.lo + tau * (e.hi - e.lo);
      const sA = sideParamOf(sideA, t);
      const sB = sideParamOf(sideB, t);
      if (sA < 0 || sA > 1 || sB < 0 || sB > 1) return null;
      const cp = chainDeriv(sideA.chain, clamp(t, 0, 1));
      const tHat = norm3(cp);
      if (isZeroPt(tHat)) return null;
      // Both owners' views of the same station. B's bisector is A's negated —
      // asked for rather than assumed, so each magnitude comes from the owner
      // it belongs to.
      const bisA = bisectorFrom(bA, e.a.k, sA, bB, e.b.k, sB, tHat);
      const bisB = bisectorFrom(bB, e.b.k, sB, bA, e.a.k, sA, tHat);
      if (!bisA || !bisB) return null;
      return {
        tau, tangent: cp, dHat: bisA.dHat,
        targetA: crossTarget(naturalCross(bA, e.a.k, sA), tHat, bisA),
        targetB: crossTarget(naturalCross(bB, e.b.k, sB), tHat, bisB),
      };
    };

    const fit = fitEdgeField(sampler, {
      degree: fitDegree, maxSpans, tolerance: fitTolerance,
    });
    if (!fit) { unfittable++; continue; }
    if (!fit.converged) unconverged++;
    if (fit.spans > worstSpans) worstSpans = fit.spans;
    if (fit.drift > worstDrift) worstDrift = fit.drift;
    if (fit.minAcross < minAcross) minAcross = fit.minAcross;
    if (fit.worst > fitWorstAbs) fitWorstAbs = fit.worst;
    fitRelatives.push(fit.relative);

    const shared = { lo: e.lo, hi: e.hi, degree: fit.degree, knots: fit.knots, dStar: fit.dStar };
    const polyA: EdgePoly = { ...shared, coeffs: fit.a, second: [] };
    const polyB: EdgePoly = { ...shared, coeffs: fit.b, second: [] };
    reports.push({
      curveId: e.curveId, cellA: e.a.cellId, cellB: e.b.cellId,
      relative: fit.relative, worst: fit.worst, spans: fit.spans,
      converged: fit.converged, drift: fit.drift, secondRelative: 0,
    });
    add(e.a.cellId, e.a.k, { ...claimA, poly: polyA });
    add(e.b.cellId, e.b.k, { ...claimB, poly: polyB });
    fitted.push({
      edge: e, sideA, sideB, chain: sideA.chain, poly: polyA, polyB,
      samples: fit.samples,
    });
    edgeCount++;
  }

  const cellsWithField = new Set<Id>();
  for (const key of claims.keys()) cellsWithField.add(key.slice(0, key.lastIndexOf("#")) as Id);

  /**
   * Memo for the expensive primitives.
   *
   * Not an optimisation bolted on afterwards — without it the second order is
   * quadratic in disguise. Evaluating Δ² at one station reads the G1-corrected
   * jets of BOTH patches, and each of those reads all four of that patch's Δ
   * and Δ′ fields. One Δ² call was costing ~380 chain evaluations, nearly all
   * of them repeats of values asked for a moment earlier by a neighbour.
   *
   * Safe because every function here is a pure function of the quilt: caching
   * cannot change an answer, only how often it is computed.
   */
  const rawCache = new Map<string, Pt3>();
  const memo = (tag: string, cellId: Id, k: number, s: number, f: () => Pt3): Pt3 => {
    const key = `${tag}${cellId}#${k}#${s}`;
    const hit = rawCache.get(key);
    if (hit) return hit;
    const v = f();
    rawCache.set(key, v);
    return v;
  };

  /** The claim covering loop parameter s of (cell, side), with its boundary. */
  const locate = (
    cellId: Id, k: number, s: number,
  ): { b: CellBoundary; side: BoundarySide; t: number; claim: Claim } | null => {
    const list = claims.get(`${cellId}#${k}`);
    if (!list) return null;
    const b = adj.boundaries.get(cellId);
    if (!b) return null;
    const side = b.sides[k]!;
    const t = side.curveParam(s);
    for (const c of list) {
      if (t >= c.lo && t <= c.hi) return { b, side, t, claim: c };
    }
    return null;
  };

  /** E(τ) = a(τ)·C′(t) + λ(τ)·D*(τ) — the spline cross-derivative. */
  const evalOwner = (p: EdgePoly, side: BoundarySide, t: number): Pt3 => {
    const span = p.hi - p.lo;
    const tau = span === 0 ? 0 : (t - p.lo) / span;
    const cp = chainDeriv(side.chain, clamp(t, 0, 1));
    return evalCrossDeriv(p.coeffs, p.dStar, p.degree, p.knots, cp, tau);
  };

  const rawDefectUncached = (cellId: Id, k: number, s: number): Pt3 => {
    const at = locate(cellId, k, s);
    if (!at) return ZERO;
    const { b: bA, side: sideA, t, claim } = at;

    if (claim.poly) {
      return sub3(evalOwner(claim.poly, sideA, t), naturalCross(bA, k, s));
    }

    const bB = adj.boundaries.get(claim.otherCell);
    if (!bB) return ZERO;
    const sB = sideParamOf(bB.sides[claim.otherK]!, t);
    if (sB < 0 || sB > 1) return ZERO;
    const tHat = curveTangent(bA, k, t);
    if (isZeroPt(tHat)) return ZERO;
    const bis = bisectorFrom(bA, k, s, bB, claim.otherK, sB, tHat);
    if (!bis) return ZERO;
    // Δraw = |A⊥|(d̂ - Â⊥).
    return scale3(sub3(bis.dHat, bis.aHat), bis.aLen);
  };

  const rawDefect = (cellId: Id, k: number, s: number): Pt3 =>
    memo("r", cellId, k, s, () => rawDefectUncached(cellId, k, s));

  /**
   * The tangent-plane defect at one end of a side, in degrees, read on the
   * UNCORRECTED patches — which is not an approximation, because every
   * correction vanishes at the corners by construction.
   */
  const cornerDefectDeg = (cellId: Id, k: number, end: 0 | 1): number => {
    const s = end === 0 ? CORNER_EPS : 1 - CORNER_EPS;
    const at = locate(cellId, k, s);
    if (!at) return breakAngle;
    const bB = adj.boundaries.get(at.claim.otherCell);
    if (!bB) return breakAngle;
    const sB = sideParamOf(bB.sides[at.claim.otherK]!, at.t);
    if (sB < 0 || sB > 1) return breakAngle;
    const [ua, va] = uvOnSide(k, s);
    const [ub, vb] = uvOnSide(at.claim.otherK, sB);
    const nA = boundaryCoonsNormal(at.b, ua, va);
    const nB = boundaryCoonsNormal(bB, ub, vb);
    // A degenerate corner has no normal and nothing to say; fade it fully
    // rather than guess.
    if (isZeroPt(nA) || isZeroPt(nB)) return breakAngle;
    return (natan2(len3(cross3(nA, nB)), dot3(nA, nB)) * 180) / Math.PI;
  };

  /**
   * The two fade widths of one side, in its own loop parameter.
   *
   * Scaled by how far each corner is from closing, against the same break
   * angle that decides whether a join is a feature at all. A corner at the
   * break angle gets the full band; a corner the fairing has closed gets the
   * floor. The two are clamped so they cannot meet in the middle and leave the
   * side with no full-strength stretch.
   */
  const fadeCache = new Map<string, readonly [number, number]>();
  const fadesOf = (cellId: Id, k: number): readonly [number, number] => {
    const key = `${cellId}#${k}`;
    const hit = fadeCache.get(key);
    if (hit) return hit;
    const width = (d: number): number =>
      fade * Math.min(1, Math.max(fadeFloor, d / breakAngle));
    let lo = width(cornerDefectDeg(cellId, k, 0));
    let hi = width(cornerDefectDeg(cellId, k, 1));
    const total = lo + hi;
    if (total > 0.9) { lo = (lo / total) * 0.9; hi = (hi / total) * 0.9; }
    const out = [lo, hi] as const;
    fadeCache.set(key, out);
    return out;
  };

  const defect = (cellId: Id, k: number, s: number): Pt3 => {
    const [lo, hi] = fadesOf(cellId, k);
    const w = cornerWindow(s, lo, hi);
    if (w === 0) return ZERO;
    return scale3(rawDefect(cellId, k, s), w);
  };

  /**
   * dΔraw/ds where the field is polynomial — every term differentiated in
   * closed form.
   *
   *   Δraw(s) = E(τ(s)) - N(s)
   *   dE/dτ   = a′C′ + a·C″·(hi-lo) + λ′D* + λ·D*′
   *   dτ/ds   = (dt/ds)/(hi-lo)
   *   dN/ds   = ±S_uv
   *
   * Null in bisector form, where there is no closed form worth deriving and
   * the caller falls back to a central difference.
   */
  const rawDefectDerivPoly = (cellId: Id, k: number, s: number): Pt3 | null => {
    const at = locate(cellId, k, s);
    if (!at) return null;
    const p = at.claim.poly;
    if (!p) return null;
    const { b, side, t } = at;
    const span = p.hi - p.lo;
    if (span === 0) return null;
    const tau = (t - p.lo) / span;
    const cp = chainDeriv(side.chain, clamp(t, 0, 1));
    const cpp = scale3(chainDeriv2(side.chain, clamp(t, 0, 1)), span);
    const d = bsplineAt3(p.dStar, p.degree, p.knots, tau);
    const dp = bsplineDerivAt3(p.dStar, p.degree, p.knots, tau);
    const a = bsplineAt(p.coeffs.along, p.degree, p.knots, tau);
    const ap = bsplineDerivAt(p.coeffs.along, p.degree, p.knots, tau);
    const lam = bsplineAt(p.coeffs.across, p.degree, p.knots, tau);
    const lamp = bsplineDerivAt(p.coeffs.across, p.degree, p.knots, tau);
    const dTauDs = trimScale(side) / span;
    const dn = naturalCrossDeriv(b, k, s);
    const out: [number, number, number] = [0, 0, 0];
    for (let c = 0; c < 3; c++) {
      const dE = ap * cp[c]! + a * cpp[c]! + lamp * d[c]! + lam * dp[c]!;
      out[c] = dE * dTauDs - dn[c]!;
    }
    return out;
  };

  /**
   * Δ′ = ρ′·Δraw + ρ·Δraw′. The window derivative is analytic, so at s = 0
   * and s = 1 BOTH terms are exactly zero and the C¹ vanishing the patch
   * relies on is not a matter of step size.
   */
  const defectDeriv = (cellId: Id, k: number, s: number): Pt3 =>
    memo("d", cellId, k, s, () => defectDerivUncached(cellId, k, s));

  const defectDerivUncached = (cellId: Id, k: number, s: number): Pt3 => {
    if (s <= 0 || s >= 1) return ZERO;
    const [lo, hi] = fadesOf(cellId, k);
    const w = cornerWindow(s, lo, hi);
    const wp = cornerWindowDeriv(s, lo, hi);
    if (w === 0 && wp === 0) return ZERO;
    const raw = rawDefect(cellId, k, s);
    const out: [number, number, number] = [raw[0] * wp, raw[1] * wp, raw[2] * wp];
    if (w !== 0) {
      const exact = rawDefectDerivPoly(cellId, k, s);
      if (exact) {
        for (let c = 0; c < 3; c++) out[c] = out[c]! + exact[c]! * w;
      } else {
        // Bisector form: a normalised combination of two patches' partials
        // with no closed form worth deriving. Differenced centrally, with the
        // step pulled in near the ends so the stencil never leaves the trim.
        const step = Math.min(FD_STEP, s / 2, (1 - s) / 2);
        if (step > 0) {
          const plus = rawDefect(cellId, k, s + step);
          const minus = rawDefect(cellId, k, s - step);
          const scale = w / (2 * step);
          for (let c = 0; c < 3; c++) out[c] = out[c]! + (plus[c]! - minus[c]!) * scale;
        }
      }
    }
    return out;
  };

  // ── order 2: cross-curvature ────────────────────────────────────────────
  //
  // Read the SECOND fundamental form of each neighbour on the shared curve,
  // in the frame the two of them now hold in common. Under G1 the normal
  // field N and the transverse direction ê are shared, which makes II(T,T)
  // and II(T,ê) shared too — the first is the curve's own normal curvature,
  // the second is only how N rotates along the curve. So the whole of G2
  // across this join is one scalar: II(ê,ê), the normal curvature ACROSS it.
  //
  // Match it by averaging, and hand each patch the change to its own inward
  // second derivative that lands it there. The change is purely along N: a
  // second derivative's tangential part is parameterisation, and moving it
  // would bend the surface to satisfy a metric.
  const g1Only: CrossPrescription = { defect, defectDeriv };
  const g1Boundaries = new Map<Id, CellBoundary>();
  const cellsById = new Map<Id, (typeof adj.quilt.cells)[number]>();
  for (const c of adj.quilt.cells) cellsById.set(c.id, c);
  const g1BoundaryOf = (id: Id): CellBoundary | null => {
    const hit = g1Boundaries.get(id);
    if (hit) return hit;
    const cell = cellsById.get(id);
    if (!cell) return null;
    const built = cellBoundary(cell, adj.quilt, g1Only);
    g1Boundaries.set(id, built);
    return built;
  };

  /** Everything the G2 step needs about one owner at one station. */
  const readSide = (
    cellId: Id, k: number, s: number, tHat: Pt3,
  ): { curv: number; b: number; nHat: Pt3 } | null => {
    const b = g1BoundaryOf(cellId);
    if (!b) return null;
    const [u, v] = uvOnSide(k, s);
    const jet = boundaryCoonsEdgeJet(b, u, v);
    const nHat = norm3(cross3(jet.su, jet.sv));
    if (isZeroPt(nHat)) return null;
    const inward = inwardOf(jet, k);
    const perp = sub3(inward, scale3(tHat, dot3(inward, tHat)));
    const bLen = len3(perp);
    if (bLen <= minTrans * (1 + len3(inward))) return null;
    const curv = normalCurvatureAt(jet, nHat, scale3(perp, 1 / bLen));
    if (curv === null || !Number.isFinite(curv)) return null;
    return { curv, b: bLen, nHat };
  };

  /**
   * Δ² as the averaging derivation gives it, split into the owner's own normal
   * and the amount along it — because the amount IS the curvature effect and
   * the direction is only where it is delivered.
   */
  const exactSecondParts = (
    cellId: Id, k: number, s: number,
  ): { nHat: Pt3; amount: number } | null => {
    const at = locate(cellId, k, s);
    if (!at) return null;
    const { b: bA, t, claim } = at;
    const bB = adj.boundaries.get(claim.otherCell);
    if (!bB) return null;
    const sB = sideParamOf(bB.sides[claim.otherK]!, t);
    if (sB < 0 || sB > 1) return null;
    const tHat = curveTangent(bA, k, t);
    if (isZeroPt(tHat)) return null;
    const A = readSide(cellId, k, s, tHat);
    const B = readSide(claim.otherCell, claim.otherK, sB, tHat);
    if (!A || !B) return null;
    // II(ê,ê) is even in ê, so no sign bookkeeping: the two sides' transverse
    // directions are opposite and the curvature they report is comparable.
    const target = (A.curv + B.curv) / 2;
    return { nHat: A.nHat, amount: A.b * A.b * (target - A.curv) };
  };

  const exactSecond = (cellId: Id, k: number, s: number): Pt3 => {
    const p = exactSecondParts(cellId, k, s);
    return p ? scale3(p.nHat, p.amount) : ZERO;
  };

  // Fit μ against the shared normal C′ × D*, once the G1 field above exists —
  // the curvature to match is the one the patches end up with.
  let secondFitWorst = 0;
  if (order >= 2 && polynomial) {
    for (let fi = 0; fi < fitted.length; fi++) {
      const f = fitted[fi]!;
      const owners: [EdgePoly, Id, number, BoundarySide][] = [
        [f.poly, f.edge.a.cellId, f.edge.a.k, f.sideA],
        [f.polyB, f.edge.b.cellId, f.edge.b.k, f.sideB],
      ];
      for (const [poly, cellId, k, side] of owners) {
        // μ has degree+spans coefficients; four stations each is
        // over-determination enough, and every station here costs two edge
        // jets on G1-corrected patches, which is the most expensive thing in
        // the file. On a 32-piece edge this is 140 stations rather than 513.
        const want = 4 * (poly.degree + (poly.knots.length - 2 * poly.degree - 1));
        const stride = Math.max(1, Math.floor(f.samples.length / Math.max(want, 1)));
        const st: SecondStation[] = [];
        for (let si = 0; si < f.samples.length; si += stride) {
          const sm = f.samples[si]!;
          const t = f.edge.lo + sm.tau * (f.edge.hi - f.edge.lo);
          const sOwn = sideParamOf(side, t);
          const [wLo, wHi] = fadesOf(cellId, k);
          if (cornerWindow(sOwn, wLo, wHi) === 0) continue;
          const parts = exactSecondParts(cellId, k, sOwn);
          if (!parts) continue;
          const normal = sharedNormal(
            sm.tangent, bsplineAt3(poly.dStar, poly.degree, poly.knots, sm.tau),
          );
          const nl = len3(normal);
          if (nl === 0) continue;
          st.push({
            tau: sm.tau,
            effect: parts.amount,
            response: dot3(normal, parts.nHat),
            scale: nl,
          });
        }
        const fit = fitSecondMagnitude(st, poly.degree, poly.knots);
        poly.second = fit.coeffs;
        if (fit.relative > secondFitWorst) secondFitWorst = fit.relative;
        const rep = reports[fi]!;
        if (fit.relative > rep.secondRelative) rep.secondRelative = fit.relative;
      }
    }
  }

  const rawSecondUncached = (cellId: Id, k: number, s: number): Pt3 => {
    if (order < 2) return ZERO;
    const at = locate(cellId, k, s);
    if (!at) return ZERO;
    const p = at.claim.poly;
    if (!p) return exactSecond(cellId, k, s);
    if (p.second.length === 0) return ZERO;
    const span = p.hi - p.lo;
    const tau = span === 0 ? 0 : (at.t - p.lo) / span;
    const normal = sharedNormal(
      chainDeriv(at.side.chain, clamp(at.t, 0, 1)),
      bsplineAt3(p.dStar, p.degree, p.knots, tau),
    );
    return scale3(normal, bsplineAt(p.second, p.degree, p.knots, tau));
  };

  const rawSecond = (cellId: Id, k: number, s: number): Pt3 =>
    memo("s", cellId, k, s, () => rawSecondUncached(cellId, k, s));

  const secondDefect = (cellId: Id, k: number, s: number): Pt3 => {
    const [lo, hi] = fadesOf(cellId, k);
    const w = cornerWindow(s, lo, hi);
    if (w === 0) return ZERO;
    return scale3(rawSecond(cellId, k, s), w);
  };

  const sortedFits = [...fitRelatives].sort((a, b) => a - b);
  return {
    defect,
    defectDeriv,
    secondDefect,
    rawDefect,
    has: (cellId: Id): boolean => cellsWithField.has(cellId),
    stats: {
      correctedSides: claims.size,
      edges: edgeCount,
      creasedEdges,
      sharpEdges,
      breakAngleDeg: breakAngle,
      order,
      ambiguous: adj.ambiguous,
      polynomial,
      fitDegree,
      worstSpans,
      unconverged,
      fitWorst: sortedFits.length === 0 ? 0 : sortedFits[sortedFits.length - 1]!,
      fitMedian: sortedFits.length === 0 ? 0 : sortedFits[Math.floor(sortedFits.length / 2)]!,
      directionDrift: worstDrift,
      minAcross: Number.isFinite(minAcross) ? minAcross : 0,
      unfittable,
      secondFitWorst,
      fits: reports,
      fitWorstAbs,
    },
  };
}

/**
 * How far a prescription actually moved the surface, per side — the number
 * that says whether the field is doing work or the body was already smooth.
 * Reported in mm of cross-derivative, which is a parameter-scaled quantity;
 * read it as a relative figure against the natural derivative's own length.
 */
export function fieldMagnitude(
  quilt: QuiltSpec,
  field: CrossField,
  samples = 9,
): { readonly median: number; readonly worst: number; readonly sides: number } {
  const adj = quiltAdjacency(quilt);
  const ratios: number[] = [];
  for (const cellId of [...adj.boundaries.keys()].sort()) {
    const b = adj.boundaries.get(cellId)!;
    for (let k = 0; k < 4; k++) {
      let worstHere = 0;
      for (let m = 1; m <= samples; m++) {
        const s = m / (samples + 1);
        const d = field.defect(cellId, k, s);
        const n = naturalCross(b, k, s);
        const nl = len3(n);
        if (nl === 0) continue;
        const r = len3(d) / nl;
        if (r > worstHere) worstHere = r;
      }
      ratios.push(worstHere);
    }
  }
  const sorted = [...ratios].sort((a, b) => a - b);
  return {
    median: sorted.length === 0 ? 0 : sorted[Math.floor(sorted.length / 2)]!,
    worst: sorted.length === 0 ? 0 : sorted[sorted.length - 1]!,
    sides: sorted.length,
  };
}
