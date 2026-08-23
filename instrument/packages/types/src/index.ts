/**
 * @car/types — the parametric type library. Every load-bearing type ships
 * parametric so nothing structural is hand-modeled; each factory returns a
 * PartInstance whose every value carries its license and whose every demand
 * names its principal and reason (charge §5).
 */

export { makeEngineICE, type EngineICEParams, type EngineICEInstance } from "./engine-ice.js";
export { makeTransmission, type TransmissionParams, type TransmissionInstance } from "./transmission.js";
export { makeDriveline, type DrivelineParams, type DrivelineInstance } from "./driveline.js";
export { makeIntakeExhaust, type IntakeExhaustParams, type IntakeExhaustInstance } from "./intake-exhaust.js";
export { makeEVMotor, type EVMotorParams, type EVMotorInstance } from "./ev-motor.js";
export {
  makeEnergyStore, makeFuelTank, makeEVPack,
  type EnergyStoreParams, type EnergyStoreInstance,
  type FuelTankParams, type FuelTankInstance,
  type EVPackParams, type EVPackInstance,
} from "./energy-store.js";
export { makeCooling, type CoolingParams, type CoolingInstance } from "./cooling.js";
export { makeBrakes, type BrakesParams, type BrakesInstance } from "./brakes.js";
export { makeSuspension, type SuspensionParams, type SuspensionInstance } from "./suspension.js";
export { makeSteering, type SteeringParams, type SteeringInstance } from "./steering.js";
export { makeOccupantArray, type OccupantArrayParams, type OccupantArrayInstance } from "./occupants.js";
export { makeWheelTire, type WheelTireParams, type WheelTireInstance } from "./wheels.js";
export { makeSubstrate, type SubstrateParams, type SubstrateInstance } from "./substrate.js";
export { allRegulatory } from "./regulatory.js";
export { makeBrief, type BriefParams } from "./brief.js";
