/**
 * @car/constrain — wire types for the fenced 2D constraint solver.
 *
 * THE FENCE IS THE FEATURE (charge §3: "constrain — the fenced seven").
 * Exactly seven constraint kinds exist: coincident, distance, angle,
 * parallel, perpendicular, symmetric, onGrid. There is no eighth.
 * Tangent, equal-length, midpoint, horizontal/vertical and every other
 * "just one more kind" either composes out of these upstream or stays
 * out; widening this union is a statute amendment, not a patch. The
 * exhaustive switch in residuals.ts turns any smuggled kind into a
 * compile error and a runtime throw.
 */

import type { Pt2 } from "@car/schema";

/** A 2D sketch: named points in view coordinates. Millimeters. */
export interface Sketch {
  readonly points: Record<string, Pt2>;
}

// ---------------------------------------------------------------------------
// The seven constraint specs
// ---------------------------------------------------------------------------

/** Points a and b occupy the same position. */
export interface CoincidentSpec {
  readonly kind: "coincident";
  readonly a: string;
  readonly b: string;
}

/** |ab| equals the typed distance d (mm, ≥ 0). */
export interface DistanceSpec {
  readonly kind: "distance";
  readonly a: string;
  readonly b: string;
  readonly d: number;
}

/**
 * The signed angle at vertex b, from ray b→a to ray b→c, equals deg.
 * Positive is counter-clockwise; the residual wraps to (−180°, 180°], so
 * the solve settles on the turn nearest the current configuration.
 */
export interface AngleSpec {
  readonly kind: "angle";
  readonly a: string;
  readonly b: string;
  readonly c: string;
  readonly deg: number;
}

/** Segment ab is parallel to segment cd. */
export interface ParallelSpec {
  readonly kind: "parallel";
  readonly a: string;
  readonly b: string;
  readonly c: string;
  readonly d: string;
}

/** Segment ab is perpendicular to segment cd. */
export interface PerpendicularSpec {
  readonly kind: "perpendicular";
  readonly a: string;
  readonly b: string;
  readonly c: string;
  readonly d: string;
}

/** Points a and b mirror each other across the line through lineP and lineQ. */
export interface SymmetricSpec {
  readonly kind: "symmetric";
  readonly a: string;
  readonly b: string;
  readonly lineP: string;
  readonly lineQ: string;
}

/**
 * Point a snaps to the nearest multiple of pitch — as a quantization
 * PRE-PASS only, before the iterative solve. The solved result is never
 * re-rounded: the grid is a convenience, never a rounding (statute
 * clause 8). Anchored points (opts.fixed) are never moved by the snap.
 */
export interface OnGridSpec {
  readonly kind: "onGrid";
  readonly a: string;
  readonly pitch: number;
}

export type Constraint =
  | CoincidentSpec
  | DistanceSpec
  | AngleSpec
  | ParallelSpec
  | PerpendicularSpec
  | SymmetricSpec
  | OnGridSpec;

export type ConstraintKind = Constraint["kind"];

// ---------------------------------------------------------------------------
// Builders — the sanctioned constructors for the seven
// ---------------------------------------------------------------------------

export const coincident = (a: string, b: string): CoincidentSpec =>
  ({ kind: "coincident", a, b });

export const distance = (a: string, b: string, d: number): DistanceSpec =>
  ({ kind: "distance", a, b, d });

/** Angle at vertex b, from ray b→a to ray b→c, in degrees (signed, CCW positive). */
export const angle = (a: string, b: string, c: string, deg: number): AngleSpec =>
  ({ kind: "angle", a, b, c, deg });

export const parallel = (a: string, b: string, c: string, d: string): ParallelSpec =>
  ({ kind: "parallel", a, b, c, d });

export const perpendicular = (a: string, b: string, c: string, d: string): PerpendicularSpec =>
  ({ kind: "perpendicular", a, b, c, d });

/** a and b mirror across the line through lineP and lineQ. */
export const symmetric = (a: string, b: string, lineP: string, lineQ: string): SymmetricSpec =>
  ({ kind: "symmetric", a, b, lineP, lineQ });

export const onGrid = (a: string, pitch: number): OnGridSpec =>
  ({ kind: "onGrid", a, pitch });

// ---------------------------------------------------------------------------
// Solve options and result
// ---------------------------------------------------------------------------

export interface SolveOpts {
  /** Anchored point ids — excluded from the variable set; never moved. */
  readonly fixed?: readonly string[];
  /**
   * Fixed iteration count (default 64). The solver runs exactly this many
   * Levenberg-Marquardt iterations — never fewer on "convergence", never
   * more. Statute: fixed iteration counts, no convergence-noise termination.
   */
  readonly maxIterations?: number;
  /** Residual L2 norm at or below this reports converged (default 1e-8). */
  readonly tol?: number;
}

/** Ledger-facing diagnosis of the constraint system at the final state. */
export interface SolveDiagnostics {
  /** Residual not driven near zero — constraints conflict (or cap too low). */
  readonly overConstrained: boolean;
  /** Jacobian rank deficit — free degrees of freedom remain. */
  readonly underConstrained: boolean;
  /** Human-readable summary for the ledger. */
  readonly note: string;
}

export interface ConstrainResult {
  /** Every sketch point (fixed included), keyed and ordered by sorted id. */
  readonly points: Record<string, Pt2>;
  /** True when the final residual L2 norm is at or below opts.tol. */
  readonly converged: boolean;
  /** Iterations actually run: exactly the cap, or 0 when there is nothing to iterate. */
  readonly iterations: number;
  /** Final residual L2 norm (mixed mm / dimensionless rows). */
  readonly residual: number;
  readonly diagnostics: SolveDiagnostics;
}
