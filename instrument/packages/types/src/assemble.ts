/**
 * assembleCar — compose type entries into a SolveInput for the blind solver.
 *
 * This is the layer the charge implies but never spells out: the factories
 * publish demands and ports, the solver consumes demands and ports, and this
 * module is the composition between them. It knows part types (it calls the
 * factories); the SOLVER never does — @car/pack still imports only
 * schema/num/demand, and the CI import rule proves it.
 *
 * Placement law here: datum-defining parts are FIXED (the substrate, and each
 * axle line — an axle is a datum, not a solved position); everything else
 * reaches its place through a mate chain, so a moved datum moves the car.
 * Every offset is a licensed Quantity authored by the caller: no bare numbers
 * live in this file, which is exactly the no-bare-constants law working.
 */

import type {
  DemandRecord, Id, IdAllocator, Mate, MemberRecord, PartInstance, Pose, Pt3, Quantity, SolveInput,
} from "@car/schema";
import { makeEngineICE, type EngineICEParams, type EngineICEInstance } from "./engine-ice.js";
import { makeTransmission, type TransmissionParams } from "./transmission.js";
import { makeDriveline, type DrivelineParams } from "./driveline.js";
import { makeSuspension, type SuspensionParams } from "./suspension.js";
import { makeSteering, type SteeringParams } from "./steering.js";
import { makeBrakes, type BrakesParams } from "./brakes.js";
import { makeCooling, type CoolingParams } from "./cooling.js";
import { makeFuelTank, type FuelTankParams } from "./energy-store.js";
import { makeOccupantArray, type OccupantArrayParams } from "./occupants.js";
import { makeWheelTire, type WheelTireParams, type WheelTireInstance } from "./wheels.js";
import { makeSubstrate, type SubstrateParams, type SubstrateInstance } from "./substrate.js";
import { allRegulatory } from "./regulatory.js";
import { makeBrief, type BriefParams } from "./brief.js";

/** Every placement the author chooses, licensed. mm unless stated. */
export interface PlacementChoices {
  /** Rail centerline height above the ground plane. */
  readonly railHeight: Quantity<"mm">;
  /** Crank centerline aft of the front axle (+ = rearward: front-mid). */
  readonly engineSetback: Quantity<"mm">;
  /** Crank centerline above the rail centerline. */
  readonly engineHeight: Quantity<"mm">;
  /** Radiator core face ahead of the front axle. */
  readonly radiatorAhead: Quantity<"mm">;
  /** Radiator core center above the rail centerline. */
  readonly radiatorHeight: Quantity<"mm">;
  /** Tank front face ahead of the rear axle. */
  readonly tankAheadOfRearAxle: Quantity<"mm">;
  /** Tank body above the rail centerline. */
  readonly tankHeight: Quantity<"mm">;
  /** Driver heel point aft of the front axle. */
  readonly heelStation: Quantity<"mm">;
  /** Driver heel point above the ground plane. */
  readonly heelHeight: Quantity<"mm">;
  /** Pedal box (brake booster) aft of the front axle. */
  readonly pedalBoxStation: Quantity<"mm">;
  /** Pedal box height above the rail centerline. */
  readonly pedalBoxHeight: Quantity<"mm">;
  /** Steering rack station relative to the front axle (+ aft). */
  readonly rackStation: Quantity<"mm">;
  /** Rack height above the rail centerline. */
  readonly rackHeight: Quantity<"mm">;
}

export interface CarConfig {
  readonly name: string;
  readonly substrate: SubstrateParams;
  readonly engine: EngineICEParams;
  readonly transmission: TransmissionParams;
  readonly driveline: DrivelineParams;
  readonly frontSuspension: SuspensionParams;
  readonly rearSuspension: SuspensionParams;
  readonly steering: SteeringParams;
  readonly brakes: BrakesParams;
  readonly cooling: CoolingParams;
  readonly fuelTank: FuelTankParams;
  readonly occupants: OccupantArrayParams;
  readonly frontTire: WheelTireParams;
  readonly rearTire: WheelTireParams;
  readonly brief: BriefParams;
  readonly placement: PlacementChoices;
  /** Regulatory demands ride along as world demands when true (default true). */
  readonly includeRegulatory?: boolean;
}

export interface AssembledCar {
  readonly input: SolveInput;
  readonly substrate: SubstrateInstance;
  readonly engine: EngineICEInstance;
  readonly frontWheels: readonly WheelTireInstance[];
  readonly rearWheels: readonly WheelTireInstance[];
  /** Every part by its label, for readback after the solve. */
  readonly byLabel: ReadonlyMap<string, PartInstance>;
  readonly members: readonly MemberRecord[];
  /** The law, surfaced: carried for the report, not enforced against v1 parts. */
  readonly regulatory: readonly DemandRecord[];
  /** Demands the finished body answers, not the placement solve. */
  readonly bodyChecks: readonly DemandRecord[];
}

function portOrThrow(part: PartInstance, name: string): { origin: Pt3 } {
  const found = part.ports.find((p) => p.name === name);
  if (!found) {
    throw new Error(
      `assemble: ${part.label} publishes no port "${name}" — has ${part.ports.map((p) => p.name).join(", ")}`,
    );
  }
  return found.frame;
}

function mate(a: PartInstance, aPort: string, b: PartInstance, bPort: string, offset?: Pt3): Mate {
  portOrThrow(a, aPort);
  portOrThrow(b, bPort);
  const base = { a: { partId: a.id, portId: a.ports.find((p) => p.name === aPort)!.id },
                 b: { partId: b.id, portId: b.ports.find((p) => p.name === bPort)!.id } };
  return offset ? { ...base, offset } : base;
}

/**
 * Mate that lands part `b` at a stated world origin. The author says where the
 * part goes; the offset is arithmetic, not a guess:
 *   poseA + aPort + offset = poseB + bPort  →  offset = desired + bPort - poseA - aPort
 * Move the datum (poseA) and every part placed this way moves with it.
 */
function placeAt(
  a: PartInstance, aPort: string, aPose: Pose,
  b: PartInstance, bPort: string, desired: Pt3,
): Mate {
  const ap = portOrThrow(a, aPort).origin;
  const bp = portOrThrow(b, bPort).origin;
  const offset: Pt3 = [
    desired[0] + bp[0] - aPose.origin[0] - ap[0],
    desired[1] + bp[1] - aPose.origin[1] - ap[1],
    desired[2] + bp[2] - aPose.origin[2] - ap[2],
  ];
  return mate(a, aPort, b, bPort, offset);
}

/**
 * Compose the car. Fixed: the substrate (its origin IS the front-axle datum
 * at rail height) and the two axle lines. Everything else mates.
 */
export function assembleCar(config: CarConfig, alloc: IdAllocator): AssembledCar {
  const pl = config.placement;

  const substrate = makeSubstrate(config.substrate, alloc);
  const engine = makeEngineICE(config.engine, alloc);
  const transmission = makeTransmission(config.transmission, alloc);
  const driveline = makeDriveline(config.driveline, alloc);
  const frontSusp = makeSuspension(config.frontSuspension, alloc);
  const rearSusp = makeSuspension(config.rearSuspension, alloc);
  const steering = makeSteering(config.steering, alloc);
  const brakes = makeBrakes(config.brakes, alloc);
  const cooling = makeCooling(config.cooling, alloc);
  const tank = makeFuelTank(config.fuelTank, alloc);
  const occupants = makeOccupantArray(config.occupants, alloc);
  const wheelFL = makeWheelTire(config.frontTire, alloc);
  const wheelFR = makeWheelTire(config.frontTire, alloc);
  const wheelRL = makeWheelTire(config.rearTire, alloc);
  const wheelRR = makeWheelTire(config.rearTire, alloc);

  const parts: PartInstance[] = [
    substrate, engine, transmission, driveline, frontSusp, rearSusp,
    steering, brakes, cooling, tank, occupants,
    wheelFL, wheelFR, wheelRL, wheelRR,
  ];

  // --- fixed datums -------------------------------------------------------
  const railZ = pl.railHeight.value;
  const wheelbase = config.substrate.wheelbase.value;
  const frontRadius = config.frontSuspension.tireOverallDiameter.value / 2;
  const rearRadius = config.rearSuspension.tireOverallDiameter.value / 2;

  const fixed = new Map<Id, Pose>([
    [substrate.id, { origin: [0, 0, railZ] }],
    [frontSusp.id, { origin: [0, 0, frontRadius] }],
    [rearSusp.id, { origin: [wheelbase, 0, rearRadius] }],
  ]);

  // --- the mate chain -----------------------------------------------------
  // Wheels hang off their axle's hubs; the powertrain hangs off the substrate;
  // everything downstream of the engine hangs off the engine.
  const subPose = fixed.get(substrate.id)!;
  const centerline = 0;
  const mates: Mate[] = [
    mate(frontSusp, "hub-L", wheelFL, "hub"),
    mate(frontSusp, "hub-R", wheelFR, "hub"),
    mate(rearSusp, "hub-L", wheelRL, "hub"),
    mate(rearSusp, "hub-R", wheelRR, "hub"),

    // Engine: crank centerline aft of the front axle and above the rails —
    // this is where "front-mid" is actually decided.
    placeAt(substrate, "tower-front-L", subPose, engine, "mount-front-L",
      [pl.engineSetback.value, centerline, railZ + pl.engineHeight.value]),
    // Bellhousing to bellhousing: face on face, no offset. Physical.
    mate(engine, "bellhousing", transmission, "bellhousing"),
    mate(transmission, "output", driveline, "input"),

    placeAt(substrate, "rail-tip-front-L", subPose, cooling, "inlet-face",
      [-pl.radiatorAhead.value, centerline, railZ + pl.radiatorHeight.value]),
    placeAt(substrate, "tower-rear-L", subPose, tank, "strap-front",
      [wheelbase - pl.tankAheadOfRearAxle.value, centerline, railZ + pl.tankHeight.value]),
    placeAt(substrate, "tower-front-L", subPose, occupants, "pedal-plane",
      [pl.heelStation.value, centerline, pl.heelHeight.value]),
    placeAt(substrate, "tower-front-L", subPose, brakes, "pedal-box",
      [pl.pedalBoxStation.value, centerline, railZ + pl.pedalBoxHeight.value]),
    placeAt(substrate, "tower-front-L", subPose, steering, "rack-pinion",
      [pl.rackStation.value, centerline, railZ + pl.rackHeight.value]),
  ];

  // The brief's demands are genuinely universal (ground slab, clearance) and
  // ride as world demands. The REGULATORY set is not: lamp bands, bumper
  // heights and wiper zones govern lamps, beams and glass — parts the v1
  // library does not model, and a world demand applies to EVERY part. They are
  // returned for the provenance report and surfaced there as outstanding, not
  // silently enforced against the wrong geometry.
  // Ground clearance is a BODY check, not a placement constraint. The demand's
  // own reason exempts unsprung mass ("no sprung part may reach into it"), and
  // a world keep-out cannot express that exemption — it applies to every part,
  // so wheels, hubs and arms would violate it by existing. A part-owned zone is
  // no better: it rides its owner, and the ground plane does not move with the
  // engine. So it leaves the solve and becomes a readback against the finished
  // body's lowest sprung surface, reported with a real number.
  const briefDemands = makeBrief(config.brief, alloc);
  const isGroundSlab = (d: DemandRecord): boolean =>
    d.kind === "protected-zone" && d.reason.includes("air under the whole body");
  const worldDemands = briefDemands.filter((d) => !isGroundSlab(d));
  const bodyChecks = briefDemands.filter(isGroundSlab);
  const regulatory = config.includeRegulatory === false ? [] : allRegulatory(alloc);

  const byLabel = new Map<string, PartInstance>(parts.map((p) => [p.label, p]));

  return {
    input: { parts, mates, fixed, members: substrate.members, worldDemands },
    substrate,
    engine,
    frontWheels: [wheelFL, wheelFR],
    rearWheels: [wheelRL, wheelRR],
    byLabel,
    members: substrate.members,
    regulatory,
    bodyChecks,
  };
}
