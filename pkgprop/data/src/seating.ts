import type { ParamDef } from '@pkgprop/core';

/**
 * Occupant-row couples — brief §3.1.
 *
 * Seat counts are data: each config lists its rows; each row names the
 * ASSUMED couple distance (H-point to H-point) back to the row ahead and an
 * H30 step. The solver takes the max over all occupants — one generalization
 * that opens sedan / wagon / van as data instead of machinery.
 */

export interface SeatRow {
  readonly seats: number;
  /** Param id of the couple distance from the previous row's H-point. Absent on row 1. */
  readonly coupleParam?: string;
  /** Param id of the H30 change vs the previous row (theater step). Absent on row 1. */
  readonly h30StepParam?: string;
}

export interface SeatingConfig {
  readonly id: string;
  readonly label: string;
  readonly rows: readonly SeatRow[];
  readonly params: readonly ParamDef[];
}

const COUPLE_FULL: ParamDef = {
  id: 'seat_couple_full',
  label: 'full rear-row couple distance',
  unit: 'mm',
  value: 850,
  license: 'ASSUMED',
  note: 'H-point to H-point for an adult-usable rear row. Settle against benchmark couple data.',
  range: [700, 1150],
  pending: true,
};

const COUPLE_OCCASIONAL: ParamDef = {
  id: 'seat_couple_occasional',
  label: 'occasional (+2) couple distance',
  unit: 'mm',
  value: 700,
  license: 'ASSUMED',
  note: 'tight couple for a 2+2 back seat: children or short trips.',
  range: [560, 850],
};

const COUPLE_THIRD: ParamDef = {
  id: 'seat_couple_third',
  label: 'third-row couple distance',
  unit: 'mm',
  value: 780,
  license: 'ASSUMED',
  note: 'second to third row H-point spacing.',
  range: [650, 1000],
};

const H30_STEP: ParamDef = {
  id: 'seat_h30_step',
  label: 'theater step per row',
  unit: 'mm',
  value: 25,
  license: 'ASSUMED',
  note: 'each row sits this much higher than the one ahead, to see out.',
  range: [0, 90],
};

export const SEATING_CONFIGS: readonly SeatingConfig[] = [
  {
    id: '1',
    label: 'single seat',
    rows: [{ seats: 1 }],
    params: [],
  },
  {
    id: '2',
    label: 'two seats',
    rows: [{ seats: 2 }],
    params: [],
  },
  {
    id: '2+2',
    label: 'two plus two',
    rows: [
      { seats: 2 },
      { seats: 2, coupleParam: 'seat_couple_occasional', h30StepParam: 'seat_h30_step' },
    ],
    params: [COUPLE_OCCASIONAL, H30_STEP],
  },
  {
    id: '5',
    label: 'four to five seats',
    rows: [
      { seats: 2 },
      { seats: 3, coupleParam: 'seat_couple_full', h30StepParam: 'seat_h30_step' },
    ],
    params: [COUPLE_FULL, H30_STEP],
  },
  {
    id: '2+3row',
    label: 'three rows',
    rows: [
      { seats: 2 },
      { seats: 3, coupleParam: 'seat_couple_full', h30StepParam: 'seat_h30_step' },
      { seats: 2, coupleParam: 'seat_couple_third', h30StepParam: 'seat_h30_step' },
    ],
    params: [COUPLE_FULL, COUPLE_THIRD, H30_STEP],
  },
];

export function getSeating(id: string): SeatingConfig {
  const s = SEATING_CONFIGS.find((x) => x.id === id);
  if (!s) throw new Error(`No such seating configuration: '${id}'.`);
  return s;
}
