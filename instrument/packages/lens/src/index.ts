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
 *
 * And the cabin lens: the body sectioned against the PERSON the packing solve
 * placed, so headroom is a distance between a body and a head rather than a
 * number somebody typed into a station table. And the chassis fit, which asks
 * the same kind of question of the other half of the car: is the structure
 * inside the skin, how close does it come, and does the body sit on it.
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
  packageAt,
  packageEnvelope,
  packageMisses,
  SKIN_GAP,
  type PackageBox,
  type PackageStation,
  type PackageOptions,
  type PackageMiss,
} from "./package-envelope.js";

export {
  structureFit,
  skinSupport,
  SKIN_REACH,
  type StructureMember,
  type CarriedPart,
  type Corner,
  type Anchorage,
  type CornerFit,
  type SkinSupport,
  type StructureReport,
  type StructureOptions,
} from "./structure.js";

export {
  chassisFit,
  MIN_SKIN_CLEARANCE,
  type BodyMount,
  type MountFit,
  type ChassisFitReport,
  type ChassisFitOptions,
} from "./chassis.js";

export {
  cabinLens,
  type CabinPerson,
  type CabinReport,
  type CabinOptions,
  type SectionMesh,
  type StationSection,
} from "./cabin.js";

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
  provenanceReport,
  collectLicensed,
  type LicensedEntry,
  type ProvenanceInput,
  type ProvenanceReport,
} from "./provenance.js";
