/**
 * @car/lens — read-only analysis lenses over the placed model (overlay law,
 * charge §2): every number reported here traces to a licensed quantity; the
 * lens never authors geometry and feeds nothing downstream.
 *
 * Ships the mass ledger (charge §8) — total, CG, axle loads, per-wheel
 * capacity checks, target gap, outstanding assumptions — the clearance
 * readback strip over a packaging SolveResult, and the aero lens (charge §9):
 * a source-panel Cp map, the frontal area the model actually has, the drag
 * that a SOURCED Cd and that area imply, and the inlet-versus-cooling
 * geometry check. Read aero.ts's header before trusting anything it says: the
 * map is potential flow and cannot produce a drag figure, which is why the
 * drag lives in a separate function that refuses to look at it.
 */

export {
  massLedger,
  clearanceReadback,
  AXLE_GROUP_TOL_MM,
  type MassLedgerInput,
  type MassLedgerResult,
  type WheelStation,
  type WheelLoadRow,
  type AxleLoads,
  type ClearanceReadback,
} from "./mass.js";

export {
  aeroLens,
  dragAndPower,
  inletAdequacy,
  AIR_DENSITY,
  RECOVERY_LIMIT_PER_M,
  FLOW_PER_KW,
  CAPTURE_RATIO,
  type AeroMesh,
  type AeroOptions,
  type AeroResult,
  type DragEstimate,
  type InletCheck,
} from "./aero.js";
export {
  curvatureMap,
  type CurvatureMesh,
  type CurvatureResult,
} from "./curvature.js";
