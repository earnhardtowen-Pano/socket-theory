import type { Readouts } from '../derived.js';
import type { ContributionSet } from '../graph.js';
import type { ArchitectureInput, SeatingInput } from '../inputs.js';
import type { Registry } from '../registry.js';

/** Everything a constraint stage may touch. Numbers come only from `reg`. */
export interface Ctx {
  readonly reg: Registry;
  readonly cs: ContributionSet;
  readonly out: Readouts;
  readonly arch: ArchitectureInput;
  readonly seating: SeatingInput;
}

export interface Pt {
  readonly x: number;
  readonly z: number;
}
