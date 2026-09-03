/**
 * @car/skin — numerics over a derived skin.
 *
 * The panel solve, the curvature operators and the frontal projection live
 * here rather than in @car/lens for a reason the honesty police found before
 * I did: @car/lens is a LICENSED package, where every numeric literal has to
 * be an argument to derived/sourced/assumed, and a panel solver is not made
 * of design decisions — it is made of array strides, cotangent weights and
 * a 4π. Forcing licences onto those would say nothing true and would bury the
 * four constants in the aero lens that genuinely ARE assumptions.
 *
 * So the split is: arithmetic here, claims in @car/lens. Same relationship
 * @car/mesh and @car/flow already have to the packages that use them.
 *
 * Deterministic throughout: index-ordered traversal, no wall clock, no
 * randomness, transcendentals via @car/num.
 */

export {
  sliceSection, scanAt, scanUp, sectionAt, evenStations,
  coverClearance, insideSection, sampledVertices, sectionCache, wallClearance, usedVertices, xRange,
  type SectionMesh, type SectionOptions, type Seg2, type StationSection,
} from "./section.js";
export {
  CATALOGUE, UNPAINTED, finishOf, finishesOfClass,
  type Finish, type SurfaceClass,
} from "./finishes.js";
export { curvatureMap, type CurvatureMesh, type CurvatureResult } from "./curvature.js";
export {
  isophoteContours,
  isophoteField,
  isophoteGradient,
  type IsophoteMesh,
  type IsophoteOptions,
  type IsophoteResult,
} from "./isophote.js";
export {
  draftMap,
  shallowFraction,
  twoSidedDraftDeg,
  undercutFraction,
  type DraftMesh,
  type DraftOptions,
  type DraftResult,
} from "./draft.js";
export {
  panelSolve,
  frontalAreaMm2,
  type PanelMesh,
  type PanelOptions,
  type PanelSolution,
} from "./panel.js";
