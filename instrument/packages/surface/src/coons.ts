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
 * Normals come from the analytic partials of the same blend; boundary chain
 * derivatives route through chainDeriv in @car/num. Loops are CCW seen from
 * outside, so norm3(Su x Sv) points outward.
 */

import type { Pt3 } from "@car/schema";
import { clamp, cross3, norm3, scale3 } from "@car/num";
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

/**
 * The four side corrections and their along-edge derivatives, already
 * evaluated at this (u,v): index k holds Δ_k and Δ_k′ at side k's own loop
 * parameter (u, v, 1-u, 1-v respectively).
 */
export interface PhiSample {
  readonly value: readonly [Pt3, Pt3, Pt3, Pt3];
  readonly deriv: readonly [Pt3, Pt3, Pt3, Pt3];
}

const ZERO3: Pt3 = [0, 0, 0];
export const NO_PHI: PhiSample = {
  value: [ZERO3, ZERO3, ZERO3, ZERO3],
  deriv: [ZERO3, ZERO3, ZERO3, ZERO3],
};

/** Φ(u,v) — the tangent-plane correction. Zero on every edge. */
export function coonsPhi(p: PhiSample, u: number, v: number): Pt3 {
  const [D0, D1, D2, D3] = p.value;
  const gv = gBasis(v), hu = hBasis(u), hv = hBasis(v), gu = gBasis(u);
  return [
    gv * D0[0] + hu * D1[0] + hv * D2[0] + gu * D3[0],
    gv * D0[1] + hu * D1[1] + hv * D2[1] + gu * D3[1],
    gv * D0[2] + hu * D1[2] + hv * D2[2] + gu * D3[2],
  ];
}

/** ∂Φ/∂u. Note the chain-rule sign on Δ₂, which is read at 1-u. */
export function coonsPhiU(p: PhiSample, u: number, v: number): Pt3 {
  const [, D1, , D3] = p.value;
  const [E0, , E2] = p.deriv;
  const gv = gBasis(v), hv = hBasis(v), hpu = hPrime(u), gpu = gPrime(u);
  return [
    gv * E0[0] + hpu * D1[0] - hv * E2[0] + gpu * D3[0],
    gv * E0[1] + hpu * D1[1] - hv * E2[1] + gpu * D3[1],
    gv * E0[2] + hpu * D1[2] - hv * E2[2] + gpu * D3[2],
  ];
}

/** ∂Φ/∂v. Note the chain-rule sign on Δ₃, which is read at 1-v. */
export function coonsPhiV(p: PhiSample, u: number, v: number): Pt3 {
  const [D0, , D2] = p.value;
  const [, E1, , E3] = p.deriv;
  const gpv = gPrime(v), hpv = hPrime(v), hu = hBasis(u), gu = gBasis(u);
  return [
    gpv * D0[0] + hu * E1[0] + hpv * D2[0] - gu * E3[0],
    gpv * D0[1] + hu * E1[1] + hpv * D2[1] - gu * E3[1],
    gpv * D0[2] + hu * E1[2] + hpv * D2[2] - gu * E3[2],
  ];
}

/** Sample a boundary's cross field at (u,v), in the layout Φ expects. */
export function phiAt(b: CellBoundary, u: number, v: number): PhiSample {
  const x = b.cross;
  if (!x) return NO_PHI;
  const args: [number, number, number, number] = [u, v, 1 - u, 1 - v];
  const value: Pt3[] = [];
  const deriv: Pt3[] = [];
  for (let k = 0; k < 4; k++) {
    value.push(x.value(k, args[k]!));
    deriv.push(x.deriv(k, args[k]!));
  }
  return {
    value: value as unknown as PhiSample["value"],
    deriv: deriv as unknown as PhiSample["deriv"],
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
