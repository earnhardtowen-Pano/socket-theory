import type { ParamDef } from '@pkgprop/core';

/**
 * Architecture presets — brief §3.1.
 *
 * Each preset contributes its own parameter set under the same ids, so
 * constraint code reads `arch_*` without knowing which architecture is live.
 * Powertrain placement is data, not machinery.
 */

export type PowertrainPlacement = 'front' | 'mid-rear' | 'rear' | 'under-floor';

export interface ArchitecturePreset {
  readonly id: string;
  readonly label: string;
  /** Plain words for the panel. */
  readonly description: string;
  readonly powertrain: PowertrainPlacement;
  /** Default tire designation, resolved through the tire catalog. */
  readonly tire: string;
  readonly params: readonly ParamDef[];
}

/** Shared shape helper so every preset carries the same param ids. */
function archParams(a: {
  crushFront: number;
  crushRear: number;
  ptLength: number;
  ptHeight: number;
  h30Min: number;
  h30Max: number;
  footwell: number;
  ptWidth: number;
  extra?: ParamDef[];
}): ParamDef[] {
  return [
    {
      id: 'arch_powertrain_width',
      label: 'powertrain box width',
      unit: 'mm',
      value: a.ptWidth,
      license: 'ASSUMED',
      note: 'lateral envelope of the hard mass; becomes DERIVED once an engine is configured.',
      range: [300, 1400],
    },
    {
      id: 'arch_footwell_aft_of_axle',
      label: 'footwell limit aft of the front axle',
      unit: 'mm',
      value: a.footwell,
      license: 'ASSUMED',
      note: 'how far back the wheelhouse and floor hardware push the driver heel.',
      range: [-200, 400],
    },
    {
      id: 'arch_crush_front',
      label: 'front crash structure length',
      unit: 'mm',
      value: a.crushFront,
      license: 'ASSUMED',
      note: 'crush length ahead of the first hard mass. Settle against published FMVSS/NCAP structure data for this layout.',
      range: [300, 900],
      pending: true,
    },
    {
      id: 'arch_crush_rear',
      label: 'rear crash structure length',
      unit: 'mm',
      value: a.crushRear,
      license: 'ASSUMED',
      note: 'crush length behind the last hard mass.',
      range: [250, 800],
      pending: true,
    },
    {
      id: 'arch_powertrain_length',
      label: 'powertrain box length',
      unit: 'mm',
      value: a.ptLength,
      license: 'ASSUMED',
      note: 'longitudinal envelope of the engine or drive unit, with accessories.',
      range: [250, 1100],
    },
    {
      id: 'arch_powertrain_height',
      label: 'powertrain box height',
      unit: 'mm',
      value: a.ptHeight,
      license: 'ASSUMED',
      note: 'hard mass height above its mounting plane at ground clearance.',
      range: [200, 800],
    },
    {
      id: 'arch_h30_min',
      label: 'lowest workable seat height',
      unit: 'mm',
      value: a.h30Min,
      license: 'ASSUMED',
      note: 'floor of the H30 band for this layout.',
      range: [120, 350],
    },
    {
      id: 'arch_h30_max',
      label: 'highest workable seat height',
      unit: 'mm',
      value: a.h30Max,
      license: 'ASSUMED',
      note: 'ceiling of the H30 band for this layout.',
      range: [220, 480],
    },
    ...(a.extra ?? []),
  ];
}

export const ARCHITECTURES: readonly ArchitecturePreset[] = [
  {
    id: 'fr',
    label: 'FR longitudinal',
    description: 'engine ahead of the cabin, set longitudinally; driven rear wheels',
    powertrain: 'front',
    tire: '245/40R19',
    params: archParams({
      crushFront: 600,
      ptWidth: 640,
      footwell: 0,
      crushRear: 500,
      ptLength: 780,
      ptHeight: 560,
      h30Min: 200,
      h30Max: 330,
    }),
  },
  {
    id: 'ft',
    label: 'front transverse',
    description: 'engine across the nose; compact dash-forward cabin',
    powertrain: 'front',
    tire: '225/45R17',
    params: archParams({
      crushFront: 580,
      ptWidth: 1050,
      footwell: 0,
      crushRear: 480,
      ptLength: 560,
      ptHeight: 540,
      h30Min: 230,
      h30Max: 360,
    }),
  },
  {
    id: 'mr',
    label: 'MR',
    description: 'engine between the cabin and the rear axle',
    powertrain: 'mid-rear',
    tire: '265/35R20',
    params: archParams({
      crushFront: 480,
      ptWidth: 620,
      footwell: -50,
      crushRear: 450,
      ptLength: 620,
      ptHeight: 500,
      h30Min: 170,
      h30Max: 280,
      extra: [
        {
          id: 'arch_bulkhead_clearance',
          label: 'cabin bulkhead to engine box',
          unit: 'mm',
          value: 90,
          license: 'ASSUMED',
          note: 'firewall, insulation, and service air between the last seat back and the engine.',
          range: [40, 220],
        },
      ],
    }),
  },
  {
    id: 'rr',
    label: 'RR',
    description: 'engine behind the rear axle',
    powertrain: 'rear',
    tire: '245/45R18',
    params: archParams({
      crushFront: 450,
      ptWidth: 600,
      footwell: 0,
      crushRear: 520,
      ptLength: 580,
      ptHeight: 500,
      h30Min: 200,
      h30Max: 330,
    }),
  },
  {
    id: 'ev',
    label: 'EV skateboard',
    description: 'battery slab in the floor; compact drive units at the axles',
    powertrain: 'under-floor',
    tire: '255/45R20',
    params: archParams({
      crushFront: 520,
      ptWidth: 520,
      footwell: 120,
      crushRear: 480,
      ptLength: 360,
      ptHeight: 300,
      h30Min: 270,
      h30Max: 410,
      extra: [
        {
          id: 'arch_battery_thickness',
          label: 'battery slab thickness',
          unit: 'mm',
          value: 120,
          license: 'ASSUMED',
          note: 'cells plus case under the floor; raises the whole cabin.',
          range: [80, 220],
          pending: true,
        },
        {
          id: 'arch_battery_length',
          label: 'battery slab length',
          unit: 'mm',
          value: 2000,
          license: 'ASSUMED',
          note: 'slab must fit inside the wheelbase with clearance at both axles.',
          range: [1400, 2800],
        },
        {
          id: 'arch_battery_axle_clearance',
          label: 'battery clearance to each axle line',
          unit: 'mm',
          value: 250,
          license: 'ASSUMED',
          note: 'suspension and driveline room between slab ends and axle centers.',
          range: [100, 500],
        },
      ],
    }),
  },
];

export function getArchitecture(id: string): ArchitecturePreset {
  const a = ARCHITECTURES.find((x) => x.id === id);
  if (!a) throw new Error(`No such architecture: '${id}'.`);
  return a;
}
