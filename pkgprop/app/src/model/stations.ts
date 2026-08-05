import type { SolveResult } from '@pkgprop/core';
import { paramValue } from '../state/lines.js';

export interface Station {
  readonly id: string;
  readonly label: string;
  readonly x: number;
}

/** The named stations both views hang their shared ruler on. */
export function stationsOf(result: SolveResult): Station[] {
  const g = result.geometry;
  const out: Station[] = [
    { id: 'bumper', label: 'BMP', x: g.bumperX },
    { id: 'front-axle', label: 'FA', x: 0 },
    { id: 'cowl', label: 'CWL', x: g.cowl.x },
  ];
  g.occupants.forEach((o, i) => {
    out.push({ id: `hip-${i + 1}`, label: `H${i + 1}`, x: o.hpoint.x });
  });
  const last = g.occupants[g.occupants.length - 1];
  if (last) {
    const bl = last.hpoint.x + paramValue(result, 'glass_backlight_aft_of_last_hip', 650);
    if (bl < g.tailX) out.push({ id: 'backlight', label: 'BLT', x: bl });
  }
  out.push({ id: 'rear-axle', label: 'RA', x: g.wheelbase });
  out.push({ id: 'tail', label: 'TL', x: g.tailX });
  return out.sort((a, b) => a.x - b.x);
}
