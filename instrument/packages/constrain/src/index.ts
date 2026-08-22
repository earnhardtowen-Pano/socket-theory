/**
 * @car/constrain — the fenced 2D constraint solver (charge §3: "constrain —
 * the fenced seven"). Exactly seven constraint kinds; the fence is the
 * feature. Deterministic below the render seam: fixed iteration counts,
 * fixed damping schedule, sorted-id traversals, no wall clock, no random.
 */

export type {
  Sketch,
  Constraint,
  ConstraintKind,
  CoincidentSpec,
  DistanceSpec,
  AngleSpec,
  ParallelSpec,
  PerpendicularSpec,
  SymmetricSpec,
  OnGridSpec,
  SolveOpts,
  SolveDiagnostics,
  ConstrainResult,
} from "./types.js";
export {
  coincident,
  distance,
  angle,
  parallel,
  perpendicular,
  symmetric,
  onGrid,
} from "./types.js";
export { solve } from "./solve.js";
export { constrainRect, rectFromCorners, type Rect, type RectSpecs } from "./rect.js";
