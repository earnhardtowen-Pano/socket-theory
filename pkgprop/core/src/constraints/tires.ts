import type { Ctx } from './ctx.js';

export interface TireGeometry {
  readonly diameter: number;
  readonly radius: number;
}

/** Overall tire size, derived from the designation and the inch definition. */
export function tireGeometry(ctx: Ctx): TireGeometry {
  const diameter = ctx.out.derive(
    'tire_diameter',
    'tire overall diameter',
    'mm',
    'rim diameter in mm plus two sidewalls (section width × aspect ratio)',
    () =>
      ctx.reg.value('tire_rim_in') * ctx.reg.value('unit_in_to_mm') +
      2 * ctx.reg.value('tire_section_width') * ctx.reg.value('tire_aspect'),
  );
  return { diameter, radius: diameter / 2 };
}
