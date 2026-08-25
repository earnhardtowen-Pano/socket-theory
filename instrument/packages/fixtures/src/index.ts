export { car1, type Car1Spec } from "./car1-spec.js";
export {
  acceptanceTolerance,
  expectedHardPoints,
  tireRadius,
  type ExpectedHardPoint,
} from "./car1-expected.js";
export { shoeboxV16, type ShoeboxSpec } from "./shoebox-v16.js";
export { p1Config, P1_WHEELBASE, P1_FRONT_OVERHANG, P1_REAR_OVERHANG, P1_FRONT_TRACK, P1_REAR_TRACK, P1_RAIL_HEIGHT, P1_LENGTH, P1_FRONT_DIAMETER, P1_REAR_DIAMETER, P1_FRONT_TIRE_WIDTH, P1_REAR_TIRE_WIDTH } from "./p1.js";
export {
  battery,
  shoeboxEntry,
  shoeboxSpec,
  mx5,
  golfGti,
  m3,
  rav4,
  huracan,
  f150,
  type BatteryEntry,
  type EnteredLayout,
  type PublicSpec,
  type TireSpec,
} from "./battery.js";
export {
  configFromSpec,
  fitSubstrate,
  expectedWheelCentres,
  tireDiameterOf,
  BATTERY_TOLERANCE_MM,
  type ExpectedPoint,
} from "./from-spec.js";
export {
  miataConfig, MX5_WHEELBASE, MX5_FRONT_OVERHANG, MX5_REAR_OVERHANG, MX5_FRONT_TRACK,
  MX5_REAR_TRACK, MX5_RAIL_HEIGHT, MX5_LENGTH, MX5_WIDTH, MX5_HEIGHT, MX5_DIAMETER,
  MX5_TIRE_WIDTH,
} from "./miata.js";

export {
  etypeConfig, etypeV12Config, ETYPE_WHEELBASE, ETYPE_FRONT_OVERHANG, ETYPE_REAR_OVERHANG, ETYPE_FRONT_TRACK,
  ETYPE_REAR_TRACK, ETYPE_RAIL_HEIGHT, ETYPE_LENGTH, ETYPE_WIDTH, ETYPE_HEIGHT, ETYPE_DIAMETER,
  ETYPE_TIRE_WIDTH,
} from "./etype.js";

export { ETYPE_PROFILE, ETYPE_PROFILE_TOLERANCE_MM } from "./etype-reference.js";

export {
  mclarenF1Config, F1_WHEELBASE, F1_FRONT_OVERHANG, F1_REAR_OVERHANG, F1_FRONT_TRACK,
  F1_REAR_TRACK, F1_RAIL_HEIGHT, F1_LENGTH, F1_WIDTH, F1_HEIGHT,
  F1_FRONT_DIAMETER, F1_REAR_DIAMETER, F1_FRONT_TIRE_WIDTH, F1_REAR_TIRE_WIDTH,
} from "./mclaren-f1.js";

export { F1_PROFILE, F1_PROFILE_TOLERANCE_MM } from "./mclaren-f1-reference.js";

export {
  MX5_PROFILE, MX5_PROFILE_TOLERANCE_MM, type ProfileStation,
} from "./miata-reference.js";
