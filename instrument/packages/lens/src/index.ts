/**
 * @car/lens — read-only analysis lenses over the placed model (overlay law,
 * charge §2): every number reported here traces to a licensed quantity; the
 * lens never authors geometry and feeds nothing downstream.
 *
 * v1 ships the mass ledger (charge §8) — total, CG, axle loads, per-wheel
 * capacity checks, target gap, outstanding assumptions — and the clearance
 * readback strip over a packaging SolveResult. The aero lens (charge §9) is a
 * separate stamped deliverable and is not in this package yet — stated here so
 * the package never claims a capability it lacks.
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
