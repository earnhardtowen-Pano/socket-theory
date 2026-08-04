import type { ArchitectureInput, SeatingInput } from '../inputs.js';
import type { Registry } from '../registry.js';

/**
 * Derivation chains as plain functions over the registry.
 *
 * These are called INSIDE contribution and readout traces, so every
 * parameter they touch lands in the attribution chain of whatever wall or
 * readout invoked them. Never pass their results into a trace from outside —
 * that severs the chain and the wall forgets why it stands where it does.
 */

/** Cabin floor height above ground. The EV battery raises the whole cabin. */
export function floorOf(reg: Registry, arch: ArchitectureInput): number {
  const base = reg.value('structure_ground_clearance') + reg.value('structure_floor_stack');
  return arch.powertrain === 'under-floor'
    ? base + reg.value('arch_battery_thickness')
    : base;
}

/** Horizontal hip-to-heel legroom at a given seat height, from the anchors. */
export function legroomOf(reg: Registry, h30: number): number {
  const lo = reg.value('anthro_h30_anchor_low');
  const hi = reg.value('anthro_h30_anchor_high');
  const span = hi - lo;
  const t = span > 0 ? Math.min(1, Math.max(0, (h30 - lo) / span)) : 0;
  const a = reg.value('anthro_legroom_at_low_h30');
  const b = reg.value('anthro_legroom_at_high_h30');
  return a + t * (b - a);
}

/** Sum of couple distances behind row one. */
export function coupleSumOf(reg: Registry, seating: SeatingInput): number {
  let sum = 0;
  for (const row of seating.rows) {
    if (row.coupleParam) sum += reg.value(row.coupleParam);
  }
  return sum;
}

/** Seat height of a given row index (0-based), applying theater steps. */
export function rowH30Of(reg: Registry, seating: SeatingInput, h30Front: number, rowIndex: number): number {
  let h30 = h30Front;
  for (let i = 0; i <= rowIndex; i += 1) {
    const row = seating.rows[i];
    if (i > 0 && row?.h30StepParam) h30 += reg.value(row.h30StepParam);
  }
  return h30;
}

/** Hip station of a given row index (0-based), chaining couples. */
export function rowHipXOf(
  reg: Registry,
  seating: SeatingInput,
  heelX: number,
  h30Front: number,
  rowIndex: number,
): number {
  let x = heelX + legroomOf(reg, h30Front);
  for (let i = 1; i <= rowIndex; i += 1) {
    const row = seating.rows[i];
    if (row?.coupleParam) x += reg.value(row.coupleParam);
  }
  return x;
}

/** Roof skin minimum over a given row: head top + clearance + roof structure. */
export function rowRoofMinOf(
  reg: Registry,
  arch: ArchitectureInput,
  seating: SeatingInput,
  h30Front: number,
  rowIndex: number,
): number {
  const h30 = rowH30Of(reg, seating, h30Front, rowIndex);
  const headTop = floorOf(reg, arch) + h30 + reg.value('anthro_seated_height_above_hpoint');
  return headTop + reg.value('anthro_headroom_clearance') + reg.value('body_roof_stack');
}

/** Tire radius from the designation params and the inch definition. */
export function tireRadiusOf(reg: Registry): number {
  const diameter =
    reg.value('tire_rim_in') * reg.value('unit_in_to_mm') +
    2 * reg.value('tire_section_width') * reg.value('tire_aspect');
  return diameter / 2;
}

/** Top of the powertrain hard mass above ground, where one exists. */
export function powertrainTopOf(reg: Registry): number {
  return reg.value('structure_ground_clearance') + reg.value('arch_powertrain_height');
}

/** Everything that must fit between the last hip and the rear axle line. */
export function rearDemandOf(reg: Registry, arch: ArchitectureInput): number {
  let demand = reg.value('structure_hip_to_rear_axle');
  if (arch.powertrain === 'mid-rear') {
    demand = Math.max(
      demand,
      reg.value('arch_bulkhead_clearance') + reg.value('arch_powertrain_length'),
    );
  }
  return demand;
}
