export type { License, Unit, ParamDef, Param } from './license.js';
export { LICENSES } from './license.js';
export { Registry } from './registry.js';
export {
  ContributionSet,
  placeControl,
  type ConstraintMeta,
  type Contribution,
  type Wall,
  type Bound,
  type Conflict,
  type PlacedControl,
} from './graph.js';
export {
  FloorProfile,
  CeilingProfile,
  clampToEnvelope,
  type Segment,
  type ProfileHit,
  type ClampResult,
  type Pt,
} from './profile.js';
export type { Readout } from './derived.js';
export {
  CONTROL_IDS,
  type ControlId,
  type SolveInput,
  type ArchitectureInput,
  type SeatingInput,
  type SeatRowInput,
  type PowertrainPlacement,
} from './inputs.js';
export { solve, type SolveResult, type SideGeometry } from './solve.js';
export { headTangency, type Tangency } from './constraints/windshield.js';
export { degToRad, radToDeg } from './units.js';
export type { OccupantRow } from './constraints/occupants.js';
export type { Box } from './constraints/structure.js';
export type { Envelope } from './constraints/envelope.js';
