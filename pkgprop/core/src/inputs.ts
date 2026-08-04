import type { ParamDef } from './license.js';

/**
 * Structural input contracts. /data presets satisfy these shapes; /core never
 * imports /data, so the solver stays pure and the spine stays swappable.
 */

export type PowertrainPlacement = 'front' | 'mid-rear' | 'rear' | 'under-floor';

export interface ArchitectureInput {
  readonly id: string;
  readonly label: string;
  readonly powertrain: PowertrainPlacement;
  readonly tire: string;
  readonly params: readonly ParamDef[];
}

export interface SeatRowInput {
  readonly seats: number;
  readonly coupleParam?: string;
  readonly h30StepParam?: string;
}

export interface SeatingInput {
  readonly id: string;
  readonly label: string;
  readonly rows: readonly SeatRowInput[];
  readonly params: readonly ParamDef[];
}

/** The controls a designer owns, each stored as a fraction of its live band. */
export const CONTROL_IDS = [
  'front_overhang',
  'h30',
  'heel_x',
  'roof_z',
  'cowl_z',
  'hood_z',
  'header_x',
  'belt_z',
  'wheelbase',
  'rear_overhang',
  'deck_z',
  'overall_width',
] as const;

export type ControlId = (typeof CONTROL_IDS)[number];

export interface SolveInput {
  readonly architecture: ArchitectureInput;
  readonly seating: SeatingInput;
  /** Tire designation params (parsed by /data from the designation string). */
  readonly tireParams: readonly ParamDef[];
  /** The shared spine parameters (anthro, vision, structure, style). */
  readonly globalParams?: readonly ParamDef[];
  /** User edits of ASSUMED parameters, by id. */
  readonly overrides?: Readonly<Record<string, number>>;
  /** Control positions as fractions of their live bands, 0..1. */
  readonly controls?: Readonly<Partial<Record<ControlId, number>>>;
}
