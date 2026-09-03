/**
 * Coons evaluation over a cell boundary — the ONE analytic surface evaluator.
 *
 * S(u,v) = (1-v)c0(u) + v c1(u) + (1-u)d0(v) + u d1(v)
 *        - [(1-u)(1-v)P00 + u(1-v)P10 + (1-u)v P01 + uv P11]
 * with, in loop terms (sides s0..s3, corners = loop starts):
 *   c0(u) = s0.point(u)      bottom, P00 -> P10
 *   c1(u) = s2.point(1-u)    top,    P01 -> P11
 *   d0(v) = s3.point(1-v)    left,   P00 -> P01
 *   d1(v) = s1.point(v)      right,  P10 -> P11
 *
 * Implemented in the algebraically identical correction form
 *   S = (1-v)c0 + v c1 + (1-u)(d0 - b0) + u(d1 - b1),
 *   b0(v) = (1-v)P00 + vP01,  b1(v) = (1-v)P10 + vP11,
 * and with edge short-circuits: on u=0/u=1/v=0/v=1 the formula reduces
 * exactly to the boundary curve, so the code returns the boundary evaluation
 * itself. The patch edge IS the shared curve, bit for bit — which is what
 * makes two neighbors position-watertight by construction. A straight-edged
 * frame's patch IS the flat panel (blend of straight lines is bilinear), so
 * crude and smooth modes are this one evaluator.
 *
 * ── THE G1 TERM ──────────────────────────────────────────────────────────
 *
 * The blend above is G0 and nothing more: its cross-boundary derivative on
 * one edge is fixed by the OPPOSITE edge, so two patches sharing a curve have
 * no mechanism for agreeing on a tangent plane. When a boundary carries a
 * cross field (see `tangent-field.ts` for why it is owned by the curve), the
 * patch becomes S + Φ with
 *
 *   Φ(u,v) = g(v)Δ₀(u) + h(u)Δ₁(v) + h(v)Δ₂(1-u) + g(u)Δ₃(1-v)
 *   g(x) = x(1-x)²   h(x) = x²(1-x)      (the two cubic Hermite tangent bases)
 *
 * Each Δ_k vanishes to first order at its own ends, so every term is zero in
 * value AND derivative on the three sides that are not its own. Consequences,
 * all exact rather than tolerated:
 *
 *   Φ ≡ 0 on all four edges          — the edge is still the shared curve
 *   Φ_u(u,0) = 0                     — the along-edge tangent is untouched
 *   Φ_v(u,0) = Δ₀(u)                 — the cross derivative is exactly the ask
 *
 * So watertightness, the closed-mesh check and the replay hash are all
 * indifferent to this term; only the tangent plane moves.
 *
 * ── THE G2 TERM ──────────────────────────────────────────────────────────
 *
 * G1 buys a shared tangent plane; it does not buy a shared curvature. With a
 * shared normal field along the shared curve, though, TWO of the three second
 * fundamental form coefficients come for free — II(T,T) is the curve's own
 * normal curvature and II(T,ê) is how the shared normal rotates along the
 * shared curve, and both are properties of objects the two patches already
 * hold in common. Only II(ê,ê), the normal curvature ACROSS the join, is
 * still each patch's own. So G2 here is one scalar per station, not three.
 *
 * That scalar is carried by a second term, Ψ, built from the quintic Hermite
 * second-derivative bases:
 *
 *   Ψ(u,v) = q(v)Δ²₀(u) + r(u)Δ²₁(v) + r(v)Δ²₂(1-u) + q(u)Δ²₃(1-v)
 *   q(x) = ½x² − 5x⁴ + 10x⁵ − 7.5x⁶ + 2x⁷   r(x) = q(1-x)
 *
 * q is zero in value, first AND third derivative at both ends, has second
 * derivative 1 at 0 and 0 at 1; r is its mirror. (The third-derivative zeros
 * are why it is septic rather than quintic — see the note at `qBasis`.) So Ψ adds exactly Δ²_k to side k's
 * inward SECOND derivative and disturbs neither the position nor the tangent
 * plane anywhere — G0 and G1 are untouched, and the terms stack rather than
 * fight.
 *
 * Normals come from the analytic partials of the same blend; boundary chain
 * derivatives route through chainDeriv in @car/num. Loops are CCW seen from
 * outside, so norm3(Su x Sv) points outward.
 */

import type { Pt3 } from "@car/schema";
import { clamp, cross3, dot3, norm3, scale3 } from "@car/num";
import {
  tightBasis, tightBasisHi, tightPrime, tightPrimeHi, tightPrime2, tightPrime2Hi,
} from "./blend.js";
import {
  cellBoundary,
  type CellBoundary,
  type CellLike,
  type ChainLookup,
  type CrossPrescription,
} from "./boundary.js";

type Corners = CellBoundary["corners"];

/** The interior blend. Callers handle the edges (see boundaryCoonsPoint). */
export function coonsBlend(
  c0u: Pt3, c1u: Pt3, d0v: Pt3, d1v: Pt3,
  corners: Corners, u: number, v: number,
): Pt3 {
  const [P00, P10, P11, P01] = corners;
  const out: [number, number, number] = [0, 0, 0];
  for (let k = 0; k < 3; k++) {
    const b0 = (1 - v) * P00[k]! + v * P01[k]!;
    const b1 = (1 - v) * P10[k]! + v * P11[k]!;
    out[k] = (1 - v) * c0u[k]! + v * c1u[k]! + (1 - u) * (d0v[k]! - b0) + u * (d1v[k]! - b1);
  }
  return out;
}

/** dS/du given boundary values/derivatives at (u,v). */
export function coonsSu(
  c0du: Pt3, c1du: Pt3, d0v: Pt3, d1v: Pt3,
  corners: Corners, v: number,
): Pt3 {
  const [P00, P10, P11, P01] = corners;
  const out: [number, number, number] = [0, 0, 0];
  for (let k = 0; k < 3; k++) {
    const b0 = (1 - v) * P00[k]! + v * P01[k]!;
    const b1 = (1 - v) * P10[k]! + v * P11[k]!;
    out[k] = (1 - v) * c0du[k]! + v * c1du[k]! + (d1v[k]! - b1) - (d0v[k]! - b0);
  }
  return out;
}

/** dS/dv given boundary values/derivatives at (u,v). */
export function coonsSv(
  c0u: Pt3, c1u: Pt3, d0dv: Pt3, d1dv: Pt3,
  corners: Corners, u: number,
): Pt3 {
  const [P00, P10, P11, P01] = corners;
  const out: [number, number, number] = [0, 0, 0];
  for (let k = 0; k < 3; k++) {
    out[k] =
      (c1u[k]! - c0u[k]!) +
      (1 - u) * (d0dv[k]! - (P01[k]! - P00[k]!)) +
      u * (d1dv[k]! - (P11[k]! - P10[k]!));
  }
  return out;
}

// ── the G1 term ────────────────────────────────────────────────────────────

/** Cubic Hermite tangent bases and their derivatives. */
export const gBasis = (x: number): number => x * (1 - x) * (1 - x);
export const hBasis = (x: number): number => x * x * (1 - x);
const gPrime = (x: number): number => 1 - 4 * x + 3 * x * x;
const hPrime = (x: number): number => 2 * x - 3 * x * x;
const gPrime2 = (x: number): number => -4 + 6 * x;
const hPrime2 = (x: number): number => 2 - 6 * x;

/**
 * Septic Hermite second-derivative bases: q''(0)=1, r''(1)=1, all else 0 —
 * INCLUDING the third derivative at both ends, which the quintic version of
 * this pair did not control.
 *
 * The original q(x) = ½x²(1−x)³ satisfied the G2 contract exactly and had
 * q‴(0) = −9, q‴(1) = −3: every unit of curvature correction arrived with
 * nine units of curvature-RATE kick at its own edge and leaked three onto the
 * opposite one. The G3 probe read that kick as the dominant rate mismatch at
 * every smooth join on every car — the correction was buying G2 by spending
 * G3. Two more polynomial degrees buy the four extra zero conditions:
 *
 *   q(x) = ½x² − 5x⁴ + 10x⁵ − 7.5x⁶ + 2x⁷      r(x) = q(1−x)
 *
 * q(0)=q'(0)=0, q''(0)=1, q‴(0)=0; q(1)=q'(1)=q''(1)=q‴(1)=0. The unique
 * degree-7 solution. Ψ still delivers exactly Δ²_k to side k's inward second
 * derivative and still vanishes to first order everywhere it must, so G0, G1
 * and G2 are bit-for-bit the same claims as before; only the third order —
 * previously uncontrolled — changes.
 */
export const qBasis = (x: number): number =>
  x * x * (0.5 + x * x * (-5 + x * (10 + x * (-7.5 + 2 * x))));
export const rBasis = (x: number): number => qBasis(1 - x);
const qPrime = (x: number): number =>
  x * (1 + x * x * (-20 + x * (50 + x * (-45 + 14 * x))));
const rPrime = (x: number): number => -qPrime(1 - x);
const qPrime2 = (x: number): number =>
  1 + x * x * (-60 + x * (200 + x * (-225 + 84 * x)));
const rPrime2 = (x: number): number => qPrime2(1 - x);

/**
 * The four side corrections and their along-edge derivatives, already
 * evaluated at this (u,v): index k holds Δ_k and Δ_k′ at side k's own loop
 * parameter (u, v, 1-u, 1-v respectively).
 *
 * `value` IS THE WIDE SHARE AND `tight` THE NARROW ONE, and together they are
 * the whole correction. A blend whose width varies along an edge is
 * algebraically two blends of fixed width on two profiles — see
 * `blend.ts` — so the shape of the bump never depends on the edge parameter
 * and none of the six functions below needs a chain rule for it. With no
 * softening authored, `tight` is zero, `band` is irrelevant, and every term
 * below vanishes: the arithmetic is bit-identical to what it was.
 */
export interface PhiSample {
  readonly value: readonly [Pt3, Pt3, Pt3, Pt3];
  readonly deriv: readonly [Pt3, Pt3, Pt3, Pt3];
  /** The G2 corrections Δ²_k at the same parameters; zero when order 1. */
  readonly second: readonly [Pt3, Pt3, Pt3, Pt3];
  /** The share of each side's correction carried by the tight bump. */
  readonly tight: readonly [Pt3, Pt3, Pt3, Pt3];
  /** Its along-edge derivative, same convention as `deriv`. */
  readonly tightDeriv: readonly [Pt3, Pt3, Pt3, Pt3];
  /** Width of each side's tight bump, in that side's inward parameter. */
  readonly band: readonly [number, number, number, number];
  /**
   * Width of each side's WIDE bump. Zero means the panel-wide cubic, which is
   * the right answer for a seam nobody softened; a positive value means the
   * wide share is compact too, so nothing the blend does can reach past it.
   */
  readonly wide: readonly [number, number, number, number];
}

const ZERO3: Pt3 = [0, 0, 0];
const ZERO4: readonly [Pt3, Pt3, Pt3, Pt3] = [ZERO3, ZERO3, ZERO3, ZERO3];
const NO_BAND: readonly [number, number, number, number] = [0, 0, 0, 0];
export const NO_PHI: PhiSample = {
  value: ZERO4, deriv: ZERO4, second: ZERO4,
  tight: ZERO4, tightDeriv: ZERO4, band: NO_BAND, wide: NO_BAND,
};

/**
 * The WIDE share's basis: the panel-wide cubic, or a compact bump when the
 * side carries a radius.
 *
 * One selector, six functions, and the branch is on a number that is zero on
 * every body built before softening existed — so the classic path is the
 * classic arithmetic, bit for bit.
 */
const wLo = (x: number, w: number): number => (w > 0 ? tightBasis(x, w) : gBasis(x));
const wHi = (x: number, w: number): number => (w > 0 ? tightBasisHi(x, w) : hBasis(x));
const wLoP = (x: number, w: number): number => (w > 0 ? tightPrime(x, w) : gPrime(x));
const wHiP = (x: number, w: number): number => (w > 0 ? tightPrimeHi(x, w) : hPrime(x));
const wLoP2 = (x: number, w: number): number => (w > 0 ? tightPrime2(x, w) : gPrime2(x));
const wHiP2 = (x: number, w: number): number => (w > 0 ? tightPrime2Hi(x, w) : hPrime2(x));

/** Φ + Ψ at (u,v) — the whole correction. Zero on every edge. */
export function coonsPhi(p: PhiSample, u: number, v: number): Pt3 {
  const [D0, D1, D2, D3] = p.value;
  const [S0, S1, S2, S3] = p.second;
  const [T0, T1, T2, T3] = p.tight;
  const [b0, b1, b2, b3] = p.band;
  const [w0, w1, w2, w3] = p.wide;
  const gv = wLo(v, w0), hu = wHi(u, w1), hv = wHi(v, w2), gu = wLo(u, w3);
  const qv = qBasis(v), ru = rBasis(u), rv = rBasis(v), qu = qBasis(u);
  const tv = tightBasis(v, b0), tu1 = tightBasisHi(u, b1);
  const tv2 = tightBasisHi(v, b2), tu = tightBasis(u, b3);
  const out: [number, number, number] = [0, 0, 0];
  for (let k = 0; k < 3; k++) {
    out[k] =
      gv * D0[k]! + hu * D1[k]! + hv * D2[k]! + gu * D3[k]! +
      qv * S0[k]! + ru * S1[k]! + rv * S2[k]! + qu * S3[k]! +
      tv * T0[k]! + tu1 * T1[k]! + tv2 * T2[k]! + tu * T3[k]!;
  }
  return out;
}

/**
 * ∂(Φ+Ψ)/∂u. Note the chain-rule sign on the sides read at 1-u.
 *
 * The Ψ part carries no along-edge derivative of its own: Δ²'s derivative is
 * never needed because q and r are flat to first order at both ends, so the
 * G2 term contributes to ∂/∂u only through its own u-dependence.
 */
export function coonsPhiU(p: PhiSample, u: number, v: number): Pt3 {
  const [, D1, , D3] = p.value;
  const [E0, , E2] = p.deriv;
  const [, S1, , S3] = p.second;
  const [, T1, , T3] = p.tight;
  const [F0, , F2] = p.tightDeriv;
  const [b0, b1, b2, b3] = p.band;
  const [w0, w1, w2, w3] = p.wide;
  const gv = wLo(v, w0), hv = wHi(v, w2), hpu = wHiP(u, w1), gpu = wLoP(u, w3);
  const rpu = rPrime(u), qpu = qPrime(u);
  const tv = tightBasis(v, b0), tv2 = tightBasisHi(v, b2);
  const tpu1 = tightPrimeHi(u, b1), tpu = tightPrime(u, b3);
  const out: [number, number, number] = [0, 0, 0];
  for (let k = 0; k < 3; k++) {
    out[k] =
      gv * E0[k]! + hpu * D1[k]! - hv * E2[k]! + gpu * D3[k]! +
      rpu * S1[k]! + qpu * S3[k]! +
      tv * F0[k]! + tpu1 * T1[k]! - tv2 * F2[k]! + tpu * T3[k]!;
  }
  return out;
}

/** ∂(Φ+Ψ)/∂v. Note the chain-rule sign on the sides read at 1-v. */
export function coonsPhiV(p: PhiSample, u: number, v: number): Pt3 {
  const [D0, , D2] = p.value;
  const [, E1, , E3] = p.deriv;
  const [S0, , S2] = p.second;
  const [T0, , T2] = p.tight;
  const [, F1, , F3] = p.tightDeriv;
  const [b0, b1, b2, b3] = p.band;
  const [w0, w1, w2, w3] = p.wide;
  const gpv = wLoP(v, w0), hpv = wHiP(v, w2), hu = wHi(u, w1), gu = wLo(u, w3);
  const qpv = qPrime(v), rpv = rPrime(v);
  const tpv = tightPrime(v, b0), tpv2 = tightPrimeHi(v, b2);
  const tu1 = tightBasisHi(u, b1), tu = tightBasis(u, b3);
  const out: [number, number, number] = [0, 0, 0];
  for (let k = 0; k < 3; k++) {
    out[k] =
      gpv * D0[k]! + hu * E1[k]! + hpv * D2[k]! - gu * E3[k]! +
      qpv * S0[k]! + rpv * S2[k]! +
      tpv * T0[k]! + tu1 * F1[k]! + tpv2 * T2[k]! - tu * F3[k]!;
  }
  return out;
}

/**
 * ∂²(Φ+Ψ)/∂v² ON AN EDGE v = 0 or v = 1. Not valid in the interior.
 *
 * The two sides read at 1-u carry Δ′′ and Δ²′′ terms that are genuinely
 * nonzero away from the edges, and this drops them — because on the edge they
 * vanish exactly (the corner window is C², so every field is flat to second
 * order at its own ends) and because nothing needs interior curvature yet. An
 * analytic curvature lens would; it would have to add them and difference the
 * fields twice, and it should not silently inherit a formula that only holds
 * on a boundary.
 */
export function coonsPhiEdgeVV(p: PhiSample, u: number, v: number): Pt3 {
  const [D0, , D2] = p.value;
  const [S0, , S2] = p.second;
  const [T0, , T2] = p.tight;
  const [b0, , b2] = p.band;
  const [w0, , w2] = p.wide;
  const gppv = wLoP2(v, w0), hppv = wHiP2(v, w2), qppv = qPrime2(v), rppv = rPrime2(v);
  const tppv = tightPrime2(v, b0), tppv2 = tightPrime2Hi(v, b2);
  const out: [number, number, number] = [0, 0, 0];
  for (let k = 0; k < 3; k++) {
    out[k] =
      gppv * D0[k]! + hppv * D2[k]! + qppv * S0[k]! + rppv * S2[k]! +
      tppv * T0[k]! + tppv2 * T2[k]!;
  }
  return out;
}

/** ∂²(Φ+Ψ)/∂u² on an edge u = 0 or u = 1, the mirror of the above. */
export function coonsPhiEdgeUU(p: PhiSample, u: number, v: number): Pt3 {
  const [, D1, , D3] = p.value;
  const [, S1, , S3] = p.second;
  const [, T1, , T3] = p.tight;
  const [, b1, , b3] = p.band;
  const [, w1, , w3] = p.wide;
  const gppu = wLoP2(u, w3), hppu = wHiP2(u, w1), qppu = qPrime2(u), rppu = rPrime2(u);
  const tppu1 = tightPrime2Hi(u, b1), tppu = tightPrime2(u, b3);
  const out: [number, number, number] = [0, 0, 0];
  for (let k = 0; k < 3; k++) {
    out[k] =
      hppu * D1[k]! + gppu * D3[k]! + rppu * S1[k]! + qppu * S3[k]! +
      tppu1 * T1[k]! + tppu * T3[k]!;
  }
  return out;
}

/** ∂²(Φ+Ψ)/∂u∂v on an edge. */
export function coonsPhiEdgeUV(p: PhiSample, u: number, v: number): Pt3 {
  const [E0, E1, E2, E3] = p.deriv;
  const [F0, F1, F2, F3] = p.tightDeriv;
  const [b0, b1, b2, b3] = p.band;
  const [w0, w1, w2, w3] = p.wide;
  const gpv = wLoP(v, w0), hpv = wHiP(v, w2), hpu = wHiP(u, w1), gpu = wLoP(u, w3);
  const tpv = tightPrime(v, b0), tpu1 = tightPrimeHi(u, b1);
  const tpv2 = tightPrimeHi(v, b2), tpu = tightPrime(u, b3);
  const out: [number, number, number] = [0, 0, 0];
  for (let k = 0; k < 3; k++) {
    out[k] =
      gpv * E0[k]! + hpu * E1[k]! - hpv * E2[k]! - gpu * E3[k]! +
      tpv * F0[k]! + tpu1 * F1[k]! - tpv2 * F2[k]! - tpu * F3[k]!;
  }
  return out;
}

/** One side's correction, split into the share each bump carries. */
export interface ShareSplit {
  readonly wide: Pt3;
  readonly tight: Pt3;
  readonly wideDeriv: Pt3;
  readonly tightDeriv: Pt3;
}

/**
 * Split one side's correction between the two bumps.
 *
 * THE ONLY PLACE THIS ARITHMETIC LIVES. Three callers build a `PhiSample` —
 * the analytic evaluator, the mesher and the feed — and the last time one of
 * them grew a term the other two did not, the print described a body 85 mm
 * different from every probe that was reading it. So the split is a function,
 * and `wide + tight` is `total` by construction rather than by three people
 * agreeing.
 */
export function splitShare(total: Pt3, dtotal: Pt3, a: number, da: number): ShareSplit {
  return {
    wide: [total[0] * (1 - a), total[1] * (1 - a), total[2] * (1 - a)],
    tight: [total[0] * a, total[1] * a, total[2] * a],
    wideDeriv: [
      dtotal[0] * (1 - a) - total[0] * da,
      dtotal[1] * (1 - a) - total[1] * da,
      dtotal[2] * (1 - a) - total[2] * da,
    ],
    tightDeriv: [
      dtotal[0] * a + total[0] * da,
      dtotal[1] * a + total[1] * da,
      dtotal[2] * a + total[2] * da,
    ],
  };
}

/** Sample a boundary's cross field at (u,v), in the layout Φ and Ψ expect. */
export function phiAt(b: CellBoundary, u: number, v: number): PhiSample {
  const x = b.cross;
  if (!x) return NO_PHI;
  const args: [number, number, number, number] = [u, v, 1 - u, 1 - v];
  const value: Pt3[] = [];
  const deriv: Pt3[] = [];
  const second: Pt3[] = [];
  const tight: Pt3[] = [];
  const tightDeriv: Pt3[] = [];
  const band: number[] = [];
  const wide: number[] = [];
  for (let k = 0; k < 4; k++) {
    const s = args[k]!;
    // `x.value` is the WHOLE correction to the cross-derivative — every caller
    // that only wants "what does this edge leave at" keeps its old answer. The
    // split into a wide and a tight share happens here and nowhere else, so
    // there is one place where the two can fail to add up to it.
    const sp = splitShare(
      x.value(k, s), x.deriv(k, s),
      x.tightShare ? x.tightShare(k, s) : 0,
      x.tightShareDeriv ? x.tightShareDeriv(k, s) : 0,
    );
    value.push(sp.wide);
    tight.push(sp.tight);
    deriv.push(sp.wideDeriv);
    tightDeriv.push(sp.tightDeriv);
    second.push(x.second ? x.second(k, s) : ZERO3);
    band.push(x.band ? x.band(k) : 0);
    wide.push(x.wideBand ? x.wideBand(k) : 0);
  }
  return {
    value: value as unknown as PhiSample["value"],
    deriv: deriv as unknown as PhiSample["deriv"],
    second: second as unknown as PhiSample["second"],
    tight: tight as unknown as PhiSample["tight"],
    tightDeriv: tightDeriv as unknown as PhiSample["tightDeriv"],
    band: band as unknown as PhiSample["band"],
    wide: wide as unknown as PhiSample["wide"],
  };
}

// ── the public evaluator ───────────────────────────────────────────────────

/** Evaluate the Coons patch at (u,v) ∈ [0,1]². Edges return the boundary
 *  curves themselves (exact); corners return the shared corner points. */
export function boundaryCoonsPoint(b: CellBoundary, u: number, v: number): Pt3 {
  const uu = clamp(u, 0, 1);
  const vv = clamp(v, 0, 1);
  const [s0, s1, s2, s3] = b.sides;
  if (vv === 0) return s0.point(uu);
  if (vv === 1) return s2.point(1 - uu);
  if (uu === 0) return s3.point(1 - vv);
  if (uu === 1) return s1.point(vv);
  const base = coonsBlend(
    s0.point(uu), s2.point(1 - uu), s3.point(1 - vv), s1.point(vv), b.corners, uu, vv,
  );
  if (!b.cross) return base;
  const phi = coonsPhi(phiAt(b, uu, vv), uu, vv);
  return [base[0] + phi[0], base[1] + phi[1], base[2] + phi[2]];
}

export function boundaryCoonsPartials(b: CellBoundary, u: number, v: number): { su: Pt3; sv: Pt3 } {
  const uu = clamp(u, 0, 1);
  const vv = clamp(v, 0, 1);
  const [s0, s1, s2, s3] = b.sides;
  const c0u = s0.point(uu);
  const c1u = s2.point(1 - uu);
  const d0v = s3.point(1 - vv);
  const d1v = s1.point(vv);
  const c0du = s0.deriv(uu);
  const c1du = scale3(s2.deriv(1 - uu), -1); // chain rule for the 1-u mapping
  const d0dv = scale3(s3.deriv(1 - vv), -1);
  const d1dv = s1.deriv(vv);
  const su = coonsSu(c0du, c1du, d0v, d1v, b.corners, vv);
  const sv = coonsSv(c0u, c1u, d0dv, d1dv, b.corners, uu);
  if (!b.cross) return { su, sv };
  const p = phiAt(b, uu, vv);
  const pu = coonsPhiU(p, uu, vv);
  const pv = coonsPhiV(p, uu, vv);
  return {
    su: [su[0] + pu[0], su[1] + pu[1], su[2] + pu[2]],
    sv: [sv[0] + pv[0], sv[1] + pv[1], sv[2] + pv[2]],
  };
}

/**
 * Partials of the UNCORRECTED blend. The cross field is derived from these —
 * asking a corrected patch what its natural derivative was would be circular,
 * and the answer would depend on the order the cells were visited in.
 */
export function boundaryCoonsPartialsNatural(
  b: CellBoundary, u: number, v: number,
): { su: Pt3; sv: Pt3 } {
  if (!b.cross) return boundaryCoonsPartials(b, u, v);
  return boundaryCoonsPartials({ ...b, cross: null }, u, v);
}

/**
 * The mixed partial S_uv of the UNCORRECTED blend, at any (u,v).
 *
 * Unlike S_uu and S_vv this one has a closed form valid over the whole patch
 * rather than only on an edge: the bilinear corner term's mixed partial is the
 * constant P00 - P10 + P11 - P01, and the two ruled terms contribute their own
 * boundary derivatives.
 *
 * It exists because d/ds of a side's natural cross-boundary derivative IS this
 * vector, up to the sign the side's loop direction puts on it. The polynomial
 * cross field differentiates its correction analytically, and the natural half
 * of that derivative has to come from somewhere exact — a central difference
 * of the partials would put ~1e-8 of noise into a quantity whose vanishing at
 * the corners is the condition keeping the correction off the adjacent sides.
 */
export function boundaryCoonsMixedNatural(b: CellBoundary, u: number, v: number): Pt3 {
  const uu = clamp(u, 0, 1);
  const vv = clamp(v, 0, 1);
  const [s0, s1, s2, s3] = b.sides;
  const [P00, P10, P11, P01] = b.corners;
  const c0d = s0.deriv(uu);
  const c1d = scale3(s2.deriv(1 - uu), -1);
  const d0d = scale3(s3.deriv(1 - vv), -1);
  const d1d = s1.deriv(vv);
  const out: [number, number, number] = [0, 0, 0];
  for (let k = 0; k < 3; k++) {
    out[k] =
      c1d[k]! - c0d[k]! +
      (d1d[k]! - (P11[k]! - P10[k]!)) -
      (d0d[k]! - (P01[k]! - P00[k]!));
  }
  return out;
}

/** Outward unit normal ([0,0,0] where the patch is degenerate). */
export function boundaryCoonsNormal(b: CellBoundary, u: number, v: number): Pt3 {
  const { su, sv } = boundaryCoonsPartials(b, u, v);
  return norm3(cross3(su, sv));
}

export function coonsPoint(
  cell: CellLike, source: ChainLookup, u: number, v: number, cross?: CrossPrescription,
): Pt3 {
  return boundaryCoonsPoint(cellBoundary(cell, source, cross), u, v);
}

export function coonsNormal(
  cell: CellLike, source: ChainLookup, u: number, v: number, cross?: CrossPrescription,
): Pt3 {
  return boundaryCoonsNormal(cellBoundary(cell, source, cross), u, v);
}

export function coonsPartials(
  cell: CellLike, source: ChainLookup, u: number, v: number, cross?: CrossPrescription,
): { su: Pt3; sv: Pt3 } {
  return boundaryCoonsPartials(cellBoundary(cell, source, cross), u, v);
}

/**
 * The second-order jet of the patch ON ONE OF ITS EDGES.
 *
 * Returns S_u, S_v, S_uu, S_uv, S_vv at (u,v), which must lie on an edge —
 * exactly where the second fundamental form has to be read to say anything
 * about curvature continuity across a join. The Φ and Ψ terms are included,
 * and on an edge their second-derivative contributions are exact (see
 * `coonsPhiEdgeVV`).
 *
 * The uncorrected pieces are the analytic derivatives of the blend:
 *
 *   S_uu = (1-v)c0'' + v c1''
 *   S_vv = (1-u)d0'' + u d1''      (the bilinear corner term is linear in each)
 *   S_uv = c1' - c0' + [d1' - (P11-P10)] - [d0' - (P01-P00)]
 */
export function boundaryCoonsEdgeJet(
  b: CellBoundary, u: number, v: number,
): { su: Pt3; sv: Pt3; suu: Pt3; suv: Pt3; svv: Pt3 } {
  const uu = clamp(u, 0, 1);
  const vv = clamp(v, 0, 1);
  if (uu !== 0 && uu !== 1 && vv !== 0 && vv !== 1) {
    throw new Error(`surface: edge jet asked for interior point (${uu}, ${vv})`);
  }
  const [s0, s1, s2, s3] = b.sides;
  const [P00, P10, P11, P01] = b.corners;

  const c0d = s0.deriv(uu);
  const c1d = scale3(s2.deriv(1 - uu), -1);
  const d0d = scale3(s3.deriv(1 - vv), -1);
  const d1d = s1.deriv(vv);
  const c0dd = s0.deriv2(uu);
  const c1dd = s2.deriv2(1 - uu);      // (-1)² from the 1-u mapping
  const d0dd = s3.deriv2(1 - vv);
  const d1dd = s1.deriv2(vv);

  const { su, sv } = boundaryCoonsPartials(b, uu, vv);
  const suu: [number, number, number] = [0, 0, 0];
  const svv: [number, number, number] = [0, 0, 0];
  const suv: [number, number, number] = [0, 0, 0];
  for (let k = 0; k < 3; k++) {
    suu[k] = (1 - vv) * c0dd[k]! + vv * c1dd[k]!;
    svv[k] = (1 - uu) * d0dd[k]! + uu * d1dd[k]!;
    suv[k] =
      c1d[k]! - c0d[k]! +
      (d1d[k]! - (P11[k]! - P10[k]!)) -
      (d0d[k]! - (P01[k]! - P00[k]!));
  }
  if (b.cross) {
    const p = phiAt(b, uu, vv);
    const puu = coonsPhiEdgeUU(p, uu, vv);
    const pvv = coonsPhiEdgeVV(p, uu, vv);
    const puv = coonsPhiEdgeUV(p, uu, vv);
    for (let k = 0; k < 3; k++) {
      suu[k]! += puu[k]!;
      svv[k]! += pvv[k]!;
      suv[k]! += puv[k]!;
    }
  }
  return { su, sv, suu, suv, svv };
}

/**
 * Normal curvature of the patch in tangent direction X, at a point whose jet
 * and unit normal are given. X need not be a parameter direction and need not
 * be unit — it is normalised against the first fundamental form.
 *
 * X is resolved into the (S_u, S_v) basis through the metric, so the answer is
 * the geometric one: two patches meeting along a curve can be compared in the
 * frame they share rather than in two parameterisations that have nothing to
 * do with each other. Null where the patch is degenerate and there is no
 * frame to resolve against.
 */
export function normalCurvatureAt(
  jet: { su: Pt3; sv: Pt3; suu: Pt3; suv: Pt3; svv: Pt3 },
  nHat: Pt3,
  x: Pt3,
): number | null {
  const E = dot3(jet.su, jet.su), F = dot3(jet.su, jet.sv), G = dot3(jet.sv, jet.sv);
  const det = E * G - F * F;
  if (!(Math.abs(det) > 0)) return null;
  const xu = dot3(x, jet.su), xv = dot3(x, jet.sv);
  const a = (G * xu - F * xv) / det;
  const b = (E * xv - F * xu) / det;
  const xx = dot3(x, x);
  if (!(xx > 0)) return null;
  const e = dot3(jet.suu, nHat), f = dot3(jet.suv, nHat), g = dot3(jet.svv, nHat);
  return (a * a * e + 2 * a * b * f + b * b * g) / xx;
}

/** Inward cross-boundary direction of side k, from a jet in (u,v). */
export function inwardOf(jet: { su: Pt3; sv: Pt3 }, k: number): Pt3 {
  if (k === 0) return jet.sv;
  if (k === 1) return scale3(jet.su, -1);
  if (k === 2) return scale3(jet.sv, -1);
  return jet.su;
}
