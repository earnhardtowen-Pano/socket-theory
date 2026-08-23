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
 * Deterministic throughout: ID-ordered walk, fixed windows, no wall clock.
 */

import type { Id, Pt3, QuiltSpec } from "@car/schema";
import { chainDeriv, clamp, cross3, dot3, len3, norm3, scale3, sub3 } from "@car/num";
import { cellBoundary, type CellBoundary, type CrossPrescription } from "./boundary.js";
import {
  boundaryCoonsEdgeJet, boundaryCoonsPartials, inwardOf, normalCurvatureAt,
} from "./coons.js";
import {
  edgeDefectProfile,
  medianOf,
  quiltAdjacency,
  sideParamOf,
  uvOnSide,
  type QuiltAdjacency,
} from "./adjacency.js";
import { DEFAULT_CREASE_ANGLE } from "./crease-angle.js";

export interface CrossFieldOptions {
  /**
   * Half-width of the corner fade, in the side's own loop parameter. The
   * correction is at full strength on [fade, 1-fade].
   */
  readonly cornerFade?: number;
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
}

const DEFAULT_CORNER_FADE = 0.12;
/** Central-difference step for Δraw′, in the side's loop parameter. */
const FD_STEP = 1e-4;
const DEFAULT_CLASSIFY_SAMPLES = 9;
const DEFAULT_MIN_SEPARATION = 1e-9;
const DEFAULT_MIN_TRANSVERSE = 1e-9;

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

/** The corner window. 0 (with zero slope) at s=0 and s=1, 1 across the middle. */
export function cornerWindow(s: number, fade: number): number {
  if (fade <= 0) return s <= 0 || s >= 1 ? 0 : 1;
  if (s <= 0 || s >= 1) return 0;
  const a = Math.min(fade, 0.5);
  if (s < a) return smootherstep(s / a);
  if (s > 1 - a) return smootherstep((1 - s) / a);
  return 1;
}

/** dρ/ds, analytic — so the C¹ vanishing at the corners is exact, not FD noise. */
export function cornerWindowDeriv(s: number, fade: number): number {
  if (fade <= 0) return 0;
  if (s <= 0 || s >= 1) return 0;
  const a = Math.min(fade, 0.5);
  if (s < a) return smootherstepPrime(s / a) / a;
  if (s > 1 - a) return -smootherstepPrime((1 - s) / a) / a;
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

interface Claim {
  readonly lo: number;
  readonly hi: number;
  /** The neighbour, as (cellId, k). */
  readonly otherCell: Id;
  readonly otherK: number;
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

  const breakAngle = opts.breakAngleDeg ?? DEFAULT_CREASE_ANGLE;
  const classifySamples = opts.classifySamples ?? DEFAULT_CLASSIFY_SAMPLES;

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

  for (const e of adj.edges) {
    if (e.creased) { creasedEdges++; continue; }
    // The decision is made ONCE PER EDGE, not per station. Deciding per
    // sample would let the correction switch on partway along a join and put
    // a tangent-plane step exactly where the field exists to remove one.
    if (medianOf(edgeDefectProfile(adj, e, classifySamples)) > breakAngle) {
      sharpEdges++;
      continue;
    }
    edgeCount++;
    add(e.a.cellId, e.a.k, { lo: e.lo, hi: e.hi, otherCell: e.b.cellId, otherK: e.b.k });
    add(e.b.cellId, e.b.k, { lo: e.lo, hi: e.hi, otherCell: e.a.cellId, otherK: e.a.k });
  }

  const cellsWithField = new Set<Id>();
  for (const key of claims.keys()) cellsWithField.add(key.slice(0, key.lastIndexOf("#")) as Id);

  /**
   * Memo for the two expensive primitives.
   *
   * Not an optimisation bolted on afterwards — without it the second order is
   * quadratic in disguise. Evaluating Δ² at one station reads the G1-corrected
   * jets of BOTH patches, and each of those reads all four of that patch's Δ
   * and Δ′ fields, and each Δ′ is two more Δraw evaluations. One Δ² call was
   * costing ~380 chain evaluations, nearly all of them repeats of values asked
   * for a moment earlier by a neighbour.
   *
   * Safe because every function here is a pure function of the quilt: caching
   * cannot change an answer, only how often it is computed. The map grows with
   * the number of DISTINCT stations a caller asks about, which for a grid
   * tessellation is bounded by the grid.
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

  const rawDefectUncached = (cellId: Id, k: number, s: number): Pt3 => {
    const list = claims.get(`${cellId}#${k}`);
    if (!list) return ZERO;
    const bA = adj.boundaries.get(cellId);
    if (!bA) return ZERO;
    const sideA = bA.sides[k]!;
    const t = sideA.curveParam(s);

    // First claim covering this parameter, in insertion (ID) order.
    let claim: Claim | null = null;
    for (const c of list) {
      if (t >= c.lo && t <= c.hi) { claim = c; break; }
    }
    if (!claim) return ZERO;

    const bB = adj.boundaries.get(claim.otherCell);
    if (!bB) return ZERO;
    const sideB = bB.sides[claim.otherK]!;
    const sB = sideParamOf(sideB, t);
    if (sB < 0 || sB > 1) return ZERO;

    const tHat = curveTangent(bA, k, t);
    if (tHat[0] === 0 && tHat[1] === 0 && tHat[2] === 0) return ZERO;

    const nA = naturalCross(bA, k, s);
    const nB = naturalCross(bB, claim.otherK, sB);

    const perp = (n: Pt3): Pt3 => sub3(n, scale3(tHat, dot3(n, tHat)));
    const aPerp = perp(nA);
    const bPerp = perp(nB);
    const aLen = len3(aPerp);
    const bLen = len3(bPerp);
    if (aLen <= minTrans * (1 + len3(nA)) || bLen <= minTrans * (1 + len3(nB))) return ZERO;

    const aHat = scale3(aPerp, 1 / aLen);
    const bHat = scale3(bPerp, 1 / bLen);
    const sep = sub3(aHat, bHat);
    const sepLen = len3(sep);
    if (sepLen <= minSep) return ZERO;   // folded: no plane to share
    const dHat = scale3(sep, 1 / sepLen);

    // Δraw = |A⊥|(d̂ - Â⊥).
    return scale3(sub3(dHat, aHat), aLen);
  };

  const rawDefect = (cellId: Id, k: number, s: number): Pt3 =>
    memo("r", cellId, k, s, () => rawDefectUncached(cellId, k, s));

  const defect = (cellId: Id, k: number, s: number): Pt3 => {
    const w = cornerWindow(s, fade);
    if (w === 0) return ZERO;
    return scale3(rawDefect(cellId, k, s), w);
  };

  /**
   * Δ′ = ρ′·Δraw + ρ·Δraw′. The window derivative is analytic, so at s = 0
   * and s = 1 BOTH terms are exactly zero and the C¹ vanishing the patch
   * relies on is not a matter of step size. Δraw itself is a normalised
   * combination of two patches' partials with no closed form worth deriving;
   * it is differenced centrally, with the step pulled in near the ends so the
   * stencil never leaves the trim.
   */
  const defectDeriv = (cellId: Id, k: number, s: number): Pt3 =>
    memo("d", cellId, k, s, () => defectDerivUncached(cellId, k, s));

  const defectDerivUncached = (cellId: Id, k: number, s: number): Pt3 => {
    if (s <= 0 || s >= 1) return ZERO;
    const w = cornerWindow(s, fade);
    const wp = cornerWindowDeriv(s, fade);
    if (w === 0 && wp === 0) return ZERO;
    const raw = rawDefect(cellId, k, s);
    let out: Pt3 = scale3(raw, wp);
    if (w !== 0) {
      const step = Math.min(FD_STEP, s / 2, (1 - s) / 2);
      if (step > 0) {
        const plus = rawDefect(cellId, k, s + step);
        const minus = rawDefect(cellId, k, s - step);
        const scale = w / (2 * step);
        out = [
          out[0] + (plus[0] - minus[0]) * scale,
          out[1] + (plus[1] - minus[1]) * scale,
          out[2] + (plus[2] - minus[2]) * scale,
        ];
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
  const order: 1 | 2 = opts.order ?? 1;
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
    if (nHat[0] === 0 && nHat[1] === 0 && nHat[2] === 0) return null;
    const inward = inwardOf(jet, k);
    const perp = sub3(inward, scale3(tHat, dot3(inward, tHat)));
    const bLen = len3(perp);
    if (bLen <= minTrans * (1 + len3(inward))) return null;
    const curv = normalCurvatureAt(jet, nHat, scale3(perp, 1 / bLen));
    if (curv === null || !Number.isFinite(curv)) return null;
    return { curv, b: bLen, nHat };
  };

  const rawSecondUncached = (cellId: Id, k: number, s: number): Pt3 => {
    if (order < 2) return ZERO;
    const list = claims.get(`${cellId}#${k}`);
    if (!list) return ZERO;
    const bA = adj.boundaries.get(cellId);
    if (!bA) return ZERO;
    const t = bA.sides[k]!.curveParam(s);
    let claim: Claim | null = null;
    for (const c of list) {
      if (t >= c.lo && t <= c.hi) { claim = c; break; }
    }
    if (!claim) return ZERO;
    const bB = adj.boundaries.get(claim.otherCell);
    if (!bB) return ZERO;
    const sB = sideParamOf(bB.sides[claim.otherK]!, t);
    if (sB < 0 || sB > 1) return ZERO;

    const tHat = curveTangent(bA, k, t);
    if (tHat[0] === 0 && tHat[1] === 0 && tHat[2] === 0) return ZERO;

    const A = readSide(cellId, k, s, tHat);
    const B = readSide(claim.otherCell, claim.otherK, sB, tHat);
    if (!A || !B) return ZERO;

    // II(ê,ê) is even in ê, so no sign bookkeeping: the two sides' transverse
    // directions are opposite and the curvature they report is comparable.
    const target = (A.curv + B.curv) / 2;
    return scale3(A.nHat, A.b * A.b * (target - A.curv));
  };

  const rawSecond = (cellId: Id, k: number, s: number): Pt3 =>
    memo("s", cellId, k, s, () => rawSecondUncached(cellId, k, s));

  const secondDefect = (cellId: Id, k: number, s: number): Pt3 => {
    const w = cornerWindow(s, fade);
    if (w === 0) return ZERO;
    return scale3(rawSecond(cellId, k, s), w);
  };

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
