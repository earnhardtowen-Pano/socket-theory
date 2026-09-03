/**
 * @car/pack policy constants — the solver's own knobs, licensed like every
 * other number in the cone. These are ASSUMED solver policy, not engineering
 * values: no external source exists for an internal tolerance or an iteration
 * cap, and inventing one would be the worse crime. They are surfaced here,
 * loudly, instead of hiding as bare literals.
 */

import { assumed } from "@car/demand";

/**
 * Two placement paths for the same part that disagree by more than this many
 * millimeters are a mate conflict (reported, never averaged away).
 */
export const MATE_AGREEMENT_TOL_MM: number = assumed(
  1e-6,
  "mm",
  "SOLVER POLICY (ASSUMED): mate-closure agreement tolerance — placement paths disagreeing beyond 1e-6 mm are reported as a mate conflict. Fixed by packaging-solver semantics v1; internal policy, no external engineering source exists.",
).value;

/**
 * Inequality audit contact window: within this of exact contact reads as an
 * active clamp; deeper interpenetration reads as a violation.
 */
export const CONTACT_TOL_MM: number = assumed(
  1e-6,
  "mm",
  "SOLVER POLICY (ASSUMED): bound-contact tolerance for the inequality audit — a bound within 1e-6 mm of exact contact is an active clamp, deeper is a violation. Fixed by packaging-solver semantics v1; internal policy, no external engineering source exists.",
).value;

/**
 * Fixed cap on deterministic projection passes over the inequality set.
 * Determinism over convergence: anything still violated when the cap lands is
 * reported as a violation, never silently iterated away.
 */
export const PROJECTION_PASS_CAP: number = assumed(
  32,
  "count",
  "SOLVER POLICY (ASSUMED): fixed inequality-projection pass cap — determinism over convergence; residual violations are reported, never iterated away in unbounded loops. Fixed by packaging-solver semantics v1; internal policy, no external engineering source exists.",
).value;
