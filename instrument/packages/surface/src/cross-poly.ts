/**
 * The cross-boundary field as a SPLINE — what makes the patch exportable.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * THE ONE TERM THAT WAS NOT POLYNOMIAL
 *
 * `tangent-field.ts` builds the shared transverse direction as
 *
 *     d̂ = normalise(Â⊥ - B̂⊥)
 *
 * — three square roots deep. Everything else in the patch (the Coons blend,
 * the Hermite bases, the corner window) is polynomial already, so this single
 * normalisation is the whole of what stands between `S₀ + Φ + Ψ` and a tensor
 * product surface that can be written into a STEP file and handed to somebody.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * DO NOT FIT THE NORMALISED FIELD — CHOOSE A POLYNOMIAL ONE
 *
 * The temptation is to approximate d̂ and accept the error as a continuity
 * loss. That would be a bad trade and an unnecessary one, because of what the
 * requirement on d̂ actually is.
 *
 * G1 across a shared curve asks that the two patches' tangent planes agree.
 * Patch A's plane on the edge is span{C′, E_A} where C′ is the curve's own
 * derivative (the edge IS the curve, so this is exact for both owners) and
 * E_A is A's cross-boundary derivative. So the join is G1 iff
 *
 *     span{C′, E_A} = span{C′, E_B}
 *
 * which holds for ANY E_A, E_B of the form
 *
 *     E_A(τ) = a_A(τ)·C′(t) + λ_A(τ)·D*(τ)
 *     E_B(τ) = a_B(τ)·C′(t) + λ_B(τ)·D*(τ)          λ_A, λ_B ≠ 0
 *
 * with D* ANY field both owners read. The exact value of D* was never the
 * requirement — it decides WHICH plane the two patches share, never WHETHER
 * they share one. So D* is free to be a piecewise polynomial, and then E is
 * piecewise polynomial, and then Δ = E − N is too, because N — the patch's
 * natural Coons cross-derivative — always was.
 *
 * The fit that follows is therefore a SHAPE decision, not a continuity one.
 * Its residual says how far the spline body sits from the bisector body, in
 * millimetres of cross-derivative. It says nothing whatever about G1, which
 * is exact either way, and the probe reading 0.0000° after the change is the
 * gate that proves it.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHY THE TANGENTIAL SLOT MUST HOLD C′ ITSELF
 *
 * A tempting simplification is to fit the unit tangent too and write
 * E = a·T* + λ·D* with both fields fitted. It does not work, and the failure
 * is worth stating because it is not obvious:
 *
 *     E_A × E_B = (a_A λ_B − a_B λ_A)·(T* × D*)
 *     det(C′, E_A, E_B) = (a_A λ_B − a_B λ_A)·C′·(T* × D*)
 *
 * which vanishes only if C′ lies in span{T*, D*}. Fit T* to within anything
 * short of exactly and it does not, and the two planes part by an angle
 * proportional to the fit error. C′ is polynomial as it stands — a cubic
 * chain's derivative is a quadratic — so there is no reason to approximate
 * the one vector that has to be exact.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * A SPLINE, NOT A POLYNOMIAL, AND WHY THAT WAS FORCED
 *
 * The first version of this fitted single Béziers and it was not good enough.
 * On the P1's worst join — `cell#19 | cell#27` on `curve#18`, where the curve's
 * speed swings from 1972 to 502 mm per unit parameter and the bisector rotates
 * 52° across the middle of the edge — a degree-3 Bézier left 23 % of the
 * cross-derivative on the table, and degree 11 still left 3 %. That is 19 mm
 * of body. The trouble is LOCAL: one bad stretch in the middle of an otherwise
 * ordinary join. Global degree is the wrong instrument for it, and two interior
 * knots at degree 3 beat degree 11 outright.
 *
 * So the fields are cubic B-splines and the knot count is chosen per edge, by
 * doubling until the residual is under tolerance or the cap is reached. The
 * loop is deterministic — fixed candidate span counts, fixed stations, fixed
 * tolerance — and the achieved residual is reported per edge whether or not it
 * met the target, because an edge that could not be fitted is a thing the
 * owner of the car needs to be told about rather than a thing to average away.
 *
 * Fit stations and CHECK stations are different sets: the fit reads every
 * other station and the check reads all of them, so the reported residual is
 * measured half on data the fit never saw. A residual measured only where the
 * least squares was aimed is not a measurement.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * G2 GETS THE SAME STRUCTURE AND A WEAKER GUARANTEE
 *
 * The curvature correction Δ² is a vector along the shared normal, and the
 * shared normal is C′ × D* — a spline, for free, once D* is. So
 *
 *     Δ²_X(τ) = μ_X(τ)·(C′(t) × D*(τ))
 *
 * is a spline by the same construction, with only the scalar μ fitted.
 *
 * But G2 is a SCALAR condition — the two owners' II(ê,ê) must be equal — and
 * fitting μ makes it hold to the fit's accuracy rather than exactly. That is
 * an honest downgrade and it is stated rather than buried: G1 is exact by
 * construction, G2 is a tolerance. Class-A practice grades G2 as a tolerance
 * anyway (0.5–5 % relative curvature), so this is the standard's own position
 * and not a concession invented here.
 *
 * Inside the corner fade the patches are not G1, so there is no shared normal
 * for the correction to lie along and the model is not merely inaccurate but
 * wrong. Those stations are kept in the fit all the same, unweighted, because
 * a least squares against a single direction IS the projection onto it — the
 * fitted μ is the sensible component and nothing else — and because a spline
 * is local: bad data at the ends moves the coefficients at the ends, not the
 * ones in the middle where G2 is actually being asked for. Weighting them down
 * was tried and it is worse, since it leaves the fit unconstrained exactly
 * where the correction is still being applied at a fifth of full strength.
 */

import type { Pt3 } from "@car/schema";
import {
  bsplineAt, bsplineAt3, bsplineBasis, bsplineCount, cross3, dot3, len3,
  solveLeastSquares, sub3, uniformKnots,
} from "@car/num";

/** One sampled station of a shared edge, in the edge's own [0,1] parameter. */
export interface EdgeSample {
  readonly tau: number;
  /** C′(t) — the shared curve's derivative in the curve's own parameter. */
  readonly tangent: Pt3;
  /** The natural bisector seen from owner A, unit. */
  readonly dHat: Pt3;
  /**
   * The cross-derivative each owner SHOULD end up with: its natural
   * tangential part, and its natural transverse part ROTATED onto the shared
   * direction without changing length,
   *
   *     target = (N·T̂)T̂ + |X⊥|·d̂
   *
   * Not the natural derivative N itself. Fitting to N would ask the spline to
   * move the surface as little as possible, and the smallest move into the
   * shared plane is the orthogonal PROJECTION — which shortens the
   * cross-derivative by cos θ and flattens the patch against its own boundary.
   * A rotation keeps the patch's reach and only turns it; that is why the
   * bisector field was derived as |A⊥|(d̂ - â) rather than as a projection, and
   * the spline form inherits the same choice rather than quietly making the
   * other one.
   */
  readonly targetA: Pt3;
  readonly targetB: Pt3;
}

/** The two scalar splines that place one owner's cross-derivative. */
export interface OwnerCoeffs {
  /** a_X: how much of C′. Reparameterisation; invisible to the tangent plane. */
  readonly along: readonly number[];
  /** λ_X: how much of D*. Must not vanish, or the plane collapses. */
  readonly across: readonly number[];
}

export type EdgeSampler = (tau: number) => EdgeSample | null;

export interface EdgeFieldFit {
  readonly degree: number;
  readonly knots: readonly number[];
  readonly spans: number;
  /** The shared transverse direction. Both owners read THIS array. */
  readonly dStar: readonly Pt3[];
  readonly a: OwnerCoeffs;
  readonly b: OwnerCoeffs;
  /** Worst |E − target| / |target| over the check stations, both owners. */
  readonly relative: number;
  /** The same, absolute — mm of cross-derivative. */
  readonly worst: number;
  /** Smallest |λ| over the check stations. Zero here means no tangent plane. */
  readonly minAcross: number;
  /** Worst departure of D* from unit length. Cosmetic — λ absorbs the
   *  magnitude — but a large one means the fit is straining. */
  readonly drift: number;
  /** True if `worst` met the tolerance asked for. */
  readonly converged: boolean;
  /** The stations this fit was measured on, at the density it settled at.
   *  Handed back so the curvature pass does not have to sample again. */
  readonly samples: readonly EdgeSample[];
}

export interface EdgeFitOptions {
  readonly degree: number;
  /** Cap on polynomial pieces per edge. Doubling stops here. */
  readonly maxSpans: number;
  /**
   * Worst |E − target| the doubling is trying to reach, in mm of
   * cross-derivative.
   *
   * ABSOLUTE, not relative, because it is meant to be read as millimetres of
   * body. The correction enters the patch through the Hermite tangent basis
   * g(x) = x(1-x)², whose largest value is 4/27, so a cross-derivative error
   * of ε moves the surface by at most 0.15ε and usually far less. A tolerance
   * of one micrometre of cross-derivative is a tenth of a micrometre of car.
   *
   * A relative tolerance was tried first and it is the wrong instrument: it
   * asks the same accuracy of a join whose cross-derivative is 2000 mm as of
   * one whose cross-derivative is 50, which spends spans — and control points
   * in the export — on the joins that need them least.
   */
  readonly tolerance: number;
}

/** Candidate span counts, in order. Fixed so the search is a function of the
 *  data and not of how the loop was written. */
const SPAN_LADDER = [1, 2, 4, 8, 16, 32];

/**
 * Fit stations each polynomial piece must have before the ladder is allowed to
 * split again.
 *
 * Without it the doubling walks straight into overfitting and then stops
 * improving, which reads exactly like an approximation limit and is not one:
 * at sixteen pieces over forty-nine stations a cubic span holds three points,
 * interpolates them, and does as it pleases in between — where the check
 * stations are. The residual on the P1's worst join sat at 1.78 mm from four
 * pieces to sixteen because of this, and the fix is more data per piece, not
 * more pieces.
 */
const MIN_POINTS_PER_SPAN = 8;

/**
 * How much of the shared normal must lie along an owner's own normal before a
 * station's curvature target is worth chasing: cos 60°.
 *
 * Below it the two patches have not converged on a normal — this is inside the
 * ramp of the second-order window, near a corner the curve network cannot
 * close — and μ = effect/response runs away as the cosine falls. The station is
 * not DROPPED, which would leave the coefficients under it free to do anything;
 * its target is replaced by zero at full weight, which is the honest ask: where
 * the premise of the curvature match fails, do not correct.
 */
const MIN_NORMAL_RESPONSE = 0.5;

const evalVec = (c: readonly Pt3[], d: number, k: readonly number[], x: number): Pt3 =>
  bsplineAt3(c, d, k, x);

/**
 * Fit the shared transverse direction of one edge.
 *
 * Fitted against the UNIT bisector rather than the raw one: the magnitude is
 * absorbed by each owner's λ afterwards, and a unit field is the better
 * conditioned thing to approximate — its length does not vary along the edge,
 * so the residual is all direction and none of it scale.
 */
function fitDirectionSpline(
  samples: readonly EdgeSample[], degree: number, knots: readonly number[],
): Pt3[] {
  const n = bsplineCount(degree, knots);
  const rows: number[][] = [];
  const rhs: number[][] = [[], [], []];
  for (const st of samples) {
    rows.push(bsplineBasis(degree, knots, st.tau));
    for (let c = 0; c < 3; c++) rhs[c]!.push(st.dHat[c]!);
  }
  // One design matrix, three right-hand sides — the basis does not depend on
  // which component is being fitted.
  const cols = [0, 1, 2].map((c) => solveLeastSquares(rows, rhs[c]!));
  const out: Pt3[] = [];
  for (let i = 0; i < n; i++) out.push([cols[0]![i]!, cols[1]![i]!, cols[2]![i]!]);
  return out;
}

/**
 * Fit one owner's (a, λ) jointly against the shared direction.
 *
 * The unknowns are the two coefficient blocks end to end, and every station
 * contributes three rows — one per component of
 *
 *     Σ a_i N_i(τ)·C′(t) + Σ λ_i N_i(τ)·D*(τ) = target(τ)
 *
 * Solved as one system rather than two: splitting the target into a tangential
 * and a transverse part to fit each separately would need the unit tangent,
 * and the unit tangent is a square root — the thing this file exists to keep
 * out of the answer.
 */
function fitOwnerSpline(
  samples: readonly EdgeSample[],
  target: (s: EdgeSample) => Pt3,
  dStar: readonly Pt3[],
  degree: number,
  knots: readonly number[],
): OwnerCoeffs {
  const n = bsplineCount(degree, knots);
  const rows: number[][] = [];
  const rhs: number[] = [];
  for (const st of samples) {
    const b = bsplineBasis(degree, knots, st.tau);
    const d = evalVec(dStar, degree, knots, st.tau);
    const y = target(st);
    for (let c = 0; c < 3; c++) {
      const row = new Array<number>(2 * n).fill(0);
      for (let i = 0; i < n; i++) {
        row[i] = b[i]! * st.tangent[c]!;
        row[n + i] = b[i]! * d[c]!;
      }
      rows.push(row);
      rhs.push(y[c]!);
    }
  }
  const sol = solveLeastSquares(rows, rhs);
  return { along: sol.slice(0, n), across: sol.slice(n) };
}

/** E(τ) = a(τ)·C′(t) + λ(τ)·D*(τ). */
export function evalCrossDeriv(
  coeffs: OwnerCoeffs, dStar: readonly Pt3[], degree: number, knots: readonly number[],
  tangent: Pt3, tau: number,
): Pt3 {
  const a = bsplineAt(coeffs.along, degree, knots, tau);
  const lam = bsplineAt(coeffs.across, degree, knots, tau);
  const d = evalVec(dStar, degree, knots, tau);
  return [
    a * tangent[0] + lam * d[0],
    a * tangent[1] + lam * d[1],
    a * tangent[2] + lam * d[2],
  ];
}

/**
 * Fit one edge's whole field, raising the span count until it is accurate
 * enough or the cap is reached.
 *
 * Returns the best attempt either way — an edge the cap could not fit still
 * gets the closest field available, and says so in `converged`, rather than
 * being silently dropped back to a G0 join.
 */
export function fitEdgeField(
  sample: EdgeSampler,
  opts: EdgeFitOptions,
): EdgeFieldFit | null {
  let best: EdgeFieldFit | null = null;

  for (const spans of SPAN_LADDER) {
    if (spans > opts.maxSpans) break;
    // Sample at the density this many pieces needs, and no denser. An edge
    // that fits at one piece never pays for five hundred stations.
    const n = 2 * MIN_POINTS_PER_SPAN * spans + 1;
    const samples: EdgeSample[] = [];
    for (let m = 1; m <= n; m++) {
      const st = sample(m / (n + 1));
      if (st) samples.push(st);
    }
    if (samples.length < 8) return best;
    // Every other station fits; every station checks. Half the check set is
    // data the least squares never saw.
    const fitSet = samples.filter((_, i) => i % 2 === 0);
    const knots = uniformKnots(opts.degree, spans);
    const count = bsplineCount(opts.degree, knots);
    if (fitSet.length * 3 < 6 * count) break;

    const dStar = fitDirectionSpline(fitSet, opts.degree, knots);
    const a = fitOwnerSpline(fitSet, (st) => st.targetA, dStar, opts.degree, knots);
    const b = fitOwnerSpline(fitSet, (st) => st.targetB, dStar, opts.degree, knots);

    let worst = 0, relative = 0, minAcross = Infinity, drift = 0;
    for (const st of samples) {
      const d = evalVec(dStar, opts.degree, knots, st.tau);
      const dl = len3(d);
      drift = Math.max(drift, dl > 1 ? dl - 1 : 1 - dl);
      for (const [co, tg] of [[a, st.targetA], [b, st.targetB]] as const) {
        const e = sub3(
          evalCrossDeriv(co, dStar, opts.degree, knots, st.tangent, st.tau),
          tg as Pt3,
        );
        const len = len3(e);
        const tn = len3(tg as Pt3);
        if (len > worst) worst = len;
        if (tn > 0 && len / tn > relative) relative = len / tn;
        const lam = bsplineAt(co.across, opts.degree, knots, st.tau);
        const m = lam < 0 ? -lam : lam;
        if (m < minAcross) minAcross = m;
      }
    }
    const fit: EdgeFieldFit = {
      degree: opts.degree, knots, spans, dStar, a, b,
      relative, worst,
      minAcross: Number.isFinite(minAcross) ? minAcross : 0,
      drift,
      converged: worst <= opts.tolerance,
      samples,
    };
    if (!best || fit.worst < best.worst) best = fit;
    if (fit.converged) return fit;
  }
  return best;
}

/**
 * One station of the curvature fit: what the patch's own normal needs to see,
 * and how much of that one unit of μ delivers.
 */
export interface SecondStation {
  /**
   * How much of this station's correction actually survives — the corner
   * window at this parameter.
   *
   * The objective is the error in the DELIVERED correction, ρ·μ·response,
   * not in the correction that was asked for. Inside the fade the window is
   * taking the answer to zero anyway, and grading μ on the full ask there
   * asks it to chase a near-pole: `response` is the shared normal read
   * against the owner's own, and it vanishes exactly where the two patches
   * have not converged on a plane. Weighting by ρ is what makes the ladder
   * converge; without it 44 of the P1's owners hit the span cap at 46 %.
   */
  readonly weight: number;
  readonly tau: number;
  /** Δ²·N̂ — the change in the owner's inward second derivative ALONG ITS OWN
   *  normal that lands its II(ê,ê) on the average. */
  readonly effect: number;
  /** (C′ × D*)·N̂ — what one unit of μ contributes to that. */
  readonly response: number;
  /** |C′ × D*| — how big a VECTOR one unit of μ costs. Where the response is
   *  a small fraction of this, μ is being asked to deliver curvature through a
   *  direction that barely points that way, and the correction it buys is
   *  mostly a displacement nobody asked for. */
  readonly scale: number;
}

/**
 * Fit the scalar magnitude of the curvature correction.
 *
 * WHAT IS FITTED IS THE EFFECT, NOT THE VECTOR. Δ² is added to the owner's
 * inward second derivative, and only its component along that owner's normal
 * changes II — the rest is a Christoffel term, which moves the parameterisation
 * and not the shape. So the objective is
 *
 *     minimise Σ ( μ(τ)·(M*·N̂) − Δ²·N̂ )²
 *
 * and not the distance between two vectors. Where the correction is at full
 * strength this is the same problem, because M* is then parallel to N̂ and the
 * two objectives coincide. Where it is not — inside the corner fade, where the
 * patches do not yet share a normal — fitting the VECTOR would quietly trade
 * away the curvature match to chase a direction that carries no curvature.
 * That was worth six millimetres of body at the P1's tail before it was
 * written this way.
 */
export function fitSecondMagnitude(
  stations: readonly SecondStation[],
  degree: number,
  knots: readonly number[],
): { readonly coeffs: readonly number[]; readonly relative: number } {
  const count = bsplineCount(degree, knots);
  if (stations.length < 2 * count) return { coeffs: [], relative: 0 };
  const rows: number[][] = [];
  const rhs: number[] = [];
  const weak: boolean[] = [];
  for (const st of stations) {
    const usable = Math.abs(st.response) >= MIN_NORMAL_RESPONSE * st.scale;
    weak.push(!usable);
    const gain = (usable ? st.response : st.scale) * st.weight;
    rows.push(bsplineBasis(degree, knots, st.tau).map((bi) => bi * gain));
    rhs.push(usable ? st.effect * st.weight : 0);
  }
  const coeffs = solveLeastSquares(rows, rhs);
  // Reported over the stations the model was actually asked about: a station
  // whose target was replaced by zero has no curvature claim to miss.
  let worst = 0, scale = 0;
  for (let i = 0; i < stations.length; i++) {
    if (weak[i]) continue;
    const st = stations[i]!;
    const m = bsplineAt(coeffs, degree, knots, st.tau);
    const e = (m * st.response - st.effect) * st.weight;
    worst = Math.max(worst, e < 0 ? -e : e);
    const asked = st.effect * st.weight;
    scale = Math.max(scale, asked < 0 ? -asked : asked);
  }
  return { coeffs, relative: scale > 0 ? worst / scale : 0 };
}

/** The shared normal direction at τ — a spline, and the same for both owners. */
export const sharedNormal = (tangent: Pt3, direction: Pt3): Pt3 => cross3(tangent, direction);

/** How far off the shared plane a cross-derivative sits, as a sine. Zero is
 *  the whole claim of this file; anything else is a bug, not a tolerance. */
export const planeResidual = (e: Pt3, normal: Pt3): number => {
  const nl = len3(normal), el = len3(e);
  return nl === 0 || el === 0 ? 0 : Math.abs(dot3(e, normal)) / (nl * el);
};

/** A lazy second-order station source, so the ladder samples only as densely
 *  as the span count it is currently trying actually needs. */
export type SecondSampler = (tau: number) => SecondStation | null;

export interface SecondFit {
  readonly coeffs: readonly number[];
  readonly degree: number;
  readonly knots: readonly number[];
  readonly spans: number;
  /** Worst |μ·response − effect| over the CHECK stations, relative. */
  readonly relative: number;
  readonly converged: boolean;
}

/**
 * Fit μ with its own span ladder, instead of borrowing the G1 field's knots.
 *
 * The G1 fit chose its knots by doubling until the CROSS-DERIVATIVE residual
 * met tolerance. μ carries a different function — the curvature the two owners
 * have to meet in the middle of, which is `effect/response` and therefore
 * rational even where the field it rides on is not — and nobody ever asked
 * whether those knots were enough for it. They are not, and that gap was the
 * whole of the P1's G2 residual.
 *
 * Same discipline as `fitEdgeField`, one order up: double until the worst
 * CHECK station meets tolerance, fit on the even stations and check on all of
 * them so the answer is never graded on its own homework, and hold
 * `MIN_POINTS_PER_SPAN` per piece so the doubling cannot stall in
 * overfitting.
 */
export function fitSecondAdaptive(
  sample: SecondSampler,
  opts: { degree: number; maxSpans: number; tolerance: number },
): SecondFit {
  const degree = opts.degree;
  let best: SecondFit | null = null;

  for (const spans of SPAN_LADDER) {
    if (spans > opts.maxSpans) break;
    const knots = uniformKnots(degree, spans);
    const count = bsplineCount(degree, knots);
    const n = 2 * MIN_POINTS_PER_SPAN * spans + 1;
    const all: SecondStation[] = [];
    for (let m = 1; m <= n; m++) {
      const st = sample(m / (n + 1));
      if (st) all.push(st);
    }
    if (all.length < 2 * count) break;

    const fitOn = all.filter((_, i) => i % 2 === 0);
    if (fitOn.length < count) break;
    const { coeffs } = fitSecondMagnitude(fitOn, degree, knots);
    if (coeffs.length === 0) break;

    let worst = 0, scale = 0;
    for (const st of all) {
      if (Math.abs(st.response) < MIN_NORMAL_RESPONSE * st.scale) continue;
      const e = (bsplineAt(coeffs, degree, knots, st.tau) * st.response - st.effect) * st.weight;
      worst = Math.max(worst, e < 0 ? -e : e);
      const asked = st.effect * st.weight;
      scale = Math.max(scale, asked < 0 ? -asked : asked);
    }
    const relative = scale > 0 ? worst / scale : 0;
    const converged = relative <= opts.tolerance;
    if (!best || relative < best.relative) {
      best = { coeffs, degree, knots, spans, relative, converged };
    }
    if (converged) break;
  }

  return best ?? {
    coeffs: [], degree, knots: uniformKnots(degree, 1), spans: 1,
    relative: 0, converged: false,
  };
}
