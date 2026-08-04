export { GLOBAL_PARAMS } from './global-params.js';
export {
  ARCHITECTURES,
  getArchitecture,
  type ArchitecturePreset,
  type PowertrainPlacement,
} from './architectures.js';
export { SEATING_CONFIGS, getSeating, type SeatingConfig, type SeatRow } from './seating.js';
export { parseTire, TIRE_CHOICES, type TireSpec } from './tires.js';
export { buildSolveInput, type PackageState } from './build.js';
