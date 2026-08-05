/**
 * The license system — Law 4.
 *
 * Every number in the instrument carries a license tag saying where it came
 * from. There is no such thing as a bare constant.
 */

/** How a number earned its place. */
export type License =
  /** Computed from geometry or physics; the derivation is in code and ledger. */
  | 'DERIVED'
  /** A named external source is recorded with the value. */
  | 'SOURCED'
  /** A visible, adjustable guess. Flagged as pending until sourced or ratified. */
  | 'ASSUMED';

export type Unit = 'mm' | 'deg' | 'count' | 'ratio' | 'mm/s';

/** A parameter definition: a licensed number the solver may read. */
export interface ParamDef {
  readonly id: string;
  /** Plain words. What this number is, said like an instrument label. */
  readonly label: string;
  readonly unit: Unit;
  readonly value: number;
  readonly license: License;
  /** SOURCED: the named external source. Never invented. */
  readonly source?: string;
  /** DERIVED: how it was computed, in plain words. */
  readonly derivation?: string;
  /** ASSUMED: why this guess, and what would settle it. */
  readonly note?: string;
  /** ASSUMED: sensible editing range for the ledger, [min, max] in `unit`. */
  readonly range?: readonly [number, number];
  /** True when a source is known to exist but has not been verified on disk. */
  readonly pending?: boolean;
}

/** A parameter as resolved at solve time (definition + any user override). */
export interface Param extends ParamDef {
  /** The value in force: override if the user edited an ASSUMED, else `value`. */
  readonly effective: number;
  readonly overridden: boolean;
}

export const LICENSES: readonly License[] = ['DERIVED', 'SOURCED', 'ASSUMED'];
