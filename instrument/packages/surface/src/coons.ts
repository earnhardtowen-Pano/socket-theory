/**
 * Coons evaluation over a cell boundary — the ONE surface evaluator.
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
 * Normals come from the analytic partials of the same blend; boundary chain
 * derivatives route through chainDeriv in @car/num. Loops are CCW seen from
 * outside, so norm3(Su x Sv) points outward.
 */

import type { Pt3 } from "@car/schema";
import { clamp, cross3, norm3, scale3 } from "@car/num";
import { cellBoundary, type CellBoundary, type CellLike, type ChainLookup } from "./boundary.js";

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
  return coonsBlend(s0.point(uu), s2.point(1 - uu), s3.point(1 - vv), s1.point(vv), b.corners, uu, vv);
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
  return {
    su: coonsSu(c0du, c1du, d0v, d1v, b.corners, vv),
    sv: coonsSv(c0u, c1u, d0dv, d1dv, b.corners, uu),
  };
}

/** Outward unit normal ([0,0,0] where the patch is degenerate). */
export function boundaryCoonsNormal(b: CellBoundary, u: number, v: number): Pt3 {
  const { su, sv } = boundaryCoonsPartials(b, u, v);
  return norm3(cross3(su, sv));
}

export function coonsPoint(cell: CellLike, source: ChainLookup, u: number, v: number): Pt3 {
  return boundaryCoonsPoint(cellBoundary(cell, source), u, v);
}

export function coonsNormal(cell: CellLike, source: ChainLookup, u: number, v: number): Pt3 {
  return boundaryCoonsNormal(cellBoundary(cell, source), u, v);
}

export function coonsPartials(
  cell: CellLike, source: ChainLookup, u: number, v: number,
): { su: Pt3; sv: Pt3 } {
  return boundaryCoonsPartials(cellBoundary(cell, source), u, v);
}
