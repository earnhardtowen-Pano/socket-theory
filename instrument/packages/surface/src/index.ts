/**
 * @car/surface — Coons evaluation over the frame, boundary extraction, and
 * the render feed. One evaluator serves crude and smooth: a straight-edged
 * frame's patch IS the flat panel. Position-watertight by construction:
 * patch edges short-circuit to the shared curve itself, bit for bit.
 *
 * Tangent-plane continuity is a separate, opt-in layer on top of that:
 * `tangentField` derives a cross-boundary direction owned by each shared
 * CURVE, and the evaluator adds a term that carries it without moving a
 * single boundary point. `continuityProbe` measures the result. Both run off
 * ONE adjacency walk (`quiltAdjacency`) so the thing being measured and the
 * thing being built cannot drift apart.
 */

export {
  cellBoundary,
  chainsOf,
  type BoundarySide,
  type CellBoundary,
  type CellLike,
  type ChainLookup,
  type ChainSource,
  type CrossDefects,
  type CrossPrescription,
  type SideRange,
} from "./boundary.js";
export { DEFAULT_CREASE_ANGLE } from "./crease-angle.js";
export {
  fieldDisplacement,
  type CellDisplacement,
  type DisplacementOptions,
  type DisplacementReport,
} from "./displacement.js";
export {
  degeneratePatches,
  type CollapsedSide,
  type DegenerateReport,
} from "./degenerate.js";
export {
  cornerFairing,
  type FairingOptions,
  type FairingPlan,
  type TangentMove,
} from "./fair.js";
export {
  curveComb,
  curveQuality,
  STRAIGHT_TURN,
  type CombSample,
  type CurveQuality,
} from "./curve-quality.js";
export {
  edgeDefectProfile,
  medianOf,
  quiltAdjacency,
  sideParamOf,
  uvOnSide,
  type EdgeOwner,
  type QuiltAdjacency,
  type SharedEdge,
} from "./adjacency.js";
export {
  cornerWindow,
  cornerWindowDeriv,
  fieldFromAdjacency,
  fieldMagnitude,
  naturalCross,
  tangentField,
  type CrossField,
  type CrossFieldOptions,
  type CrossFieldStats,
  type EdgeFitReport,
} from "./tangent-field.js";
export {
  evalCrossDeriv,
  fitEdgeField,
  fitSecondMagnitude,
  planeResidual,
  sharedNormal,
  type EdgeFieldFit,
  type EdgeFitOptions,
  type EdgeSample,
  type OwnerCoeffs,
  type SecondStation,
} from "./cross-poly.js";
export {
  boundaryCoonsMixedNatural,
  boundaryCoonsNormal,
  boundaryCoonsPartials,
  boundaryCoonsPartialsNatural,
  boundaryCoonsPoint,
  coonsBlend,
  coonsNormal,
  coonsPartials,
  boundaryCoonsEdgeJet,
  coonsPhi,
  coonsPhiU,
  coonsPhiV,
  coonsPoint,
  inwardOf,
  normalCurvatureAt,
  qBasis,
  rBasis,
  gBasis,
  hBasis,
  phiAt,
  NO_PHI,
  type PhiSample,
} from "./coons.js";
export {
  buildRenderFeed,
  tessellateQuilt,
  DEFAULT_RESOLUTION,
  type RenderFeedOptions,
} from "./feed.js";
export {
  curvatureJoinProbe,
  type CurvatureJoinOptions,
  type CurvatureJoinReport,
  type CurvatureStation,
} from "./curvature-join.js";
export {
  continuityProbe,
  networkObstruction,
  type ContinuityOptions,
  type ContinuityReport,
  type ContinuityStation,
  type CornerObstruction,
  type NetworkOptions,
  type NetworkReport,
} from "./continuity.js";
