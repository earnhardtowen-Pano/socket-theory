import type { ParamDef } from '@pkgprop/core';

/**
 * Tire specs — brief §3.1.
 *
 * The designation string is itself the source: "245/40R19" states section
 * width 245 mm, aspect ratio 40%, rim 19 in, by definition of the ISO metric
 * tire code. Parsing the string is reading the source, so the parsed values
 * are SOURCED to the designation. The overall diameter is DERIVED in
 * constraint code from these plus the inch definition.
 */

export interface TireSpec {
  readonly designation: string;
  readonly params: readonly ParamDef[];
}

const TIRE_CODE = /^(\d{3})\/(\d{2})R(\d{2})$/;

export function parseTire(designation: string): TireSpec {
  const m = TIRE_CODE.exec(designation.trim());
  if (!m) {
    throw new Error(
      `'${designation}' is not a tire code I can read. Expected the metric form, like 245/40R19.`,
    );
  }
  const width = Number(m[1]);
  const aspectPct = Number(m[2]);
  const rimIn = Number(m[3]);
  const src = `ISO metric tire code '${designation}'`;
  return {
    designation,
    params: [
      {
        id: 'tire_section_width',
        label: 'tire section width',
        unit: 'mm',
        value: width,
        license: 'SOURCED',
        source: src,
      },
      {
        id: 'tire_aspect',
        label: 'tire aspect ratio (sidewall / width)',
        unit: 'ratio',
        value: aspectPct / 100,
        license: 'SOURCED',
        source: src,
      },
      {
        id: 'tire_rim_in',
        label: 'rim diameter, inches',
        unit: 'ratio',
        value: rimIn,
        license: 'SOURCED',
        source: src,
      },
    ],
  };
}

/** Choices offered in the panel. Any valid code works; these are the presets. */
export const TIRE_CHOICES: readonly string[] = [
  '175/65R14',
  '195/60R15',
  '205/55R16',
  '225/45R17',
  '245/45R18',
  '245/40R19',
  '255/45R20',
  '265/35R20',
  '275/35R21',
];
