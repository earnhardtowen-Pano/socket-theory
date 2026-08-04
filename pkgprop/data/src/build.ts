import type { ControlId, SolveInput } from '@pkgprop/core';
import { getArchitecture } from './architectures.js';
import { GLOBAL_PARAMS } from './global-params.js';
import { getSeating } from './seating.js';
import { parseTire } from './tires.js';

/**
 * The project state — one human-readable JSON that is the entire car's
 * package side. Drawing state rides alongside it in the app's project file.
 */
export interface PackageState {
  readonly architecture: string;
  readonly seating: string;
  /** Tire designation; defaults to the architecture's preset. */
  readonly tire?: string;
  readonly overrides?: Readonly<Record<string, number>>;
  readonly controls?: Readonly<Partial<Record<ControlId, number>>>;
}

/** Wire the spine into a solver input. */
export function buildSolveInput(state: PackageState): SolveInput {
  const architecture = getArchitecture(state.architecture);
  const seating = getSeating(state.seating);
  const tire = parseTire(state.tire ?? architecture.tire);
  const input: SolveInput = {
    architecture,
    seating,
    tireParams: tire.params,
    globalParams: GLOBAL_PARAMS,
    ...(state.overrides ? { overrides: state.overrides } : {}),
    ...(state.controls ? { controls: state.controls } : {}),
  };
  return input;
}
