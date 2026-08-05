import type { CeilingProfile, FloorProfile, Segment } from '@pkgprop/core';

/** Map mm space (x rearward, z up) into SVG space (y down), with margin. */
export interface ViewMap {
  readonly x0: number;
  readonly z1: number;
  readonly w: number;
  readonly h: number;
  sx(x: number): number;
  sy(z: number): number;
}

export function makeView(xMin: number, xMax: number, zMax: number, margin: number): ViewMap {
  const x0 = xMin - margin;
  const z1 = zMax + margin;
  return {
    x0,
    z1,
    w: xMax - xMin + margin * 2,
    h: z1 + margin,
    sx: (x: number) => x - x0,
    sy: (z: number) => z1 - z,
  };
}

/** One profile segment as an SVG path, arcs sampled fine enough to read true. */
export function segmentPath(v: ViewMap, s: Segment): string {
  if (s.kind === 'line') {
    return `M ${v.sx(s.x0)} ${v.sy(s.z0)} L ${v.sx(s.x1)} ${v.sy(s.z1)}`;
  }
  const steps = 32;
  const parts: string[] = [];
  for (let i = 0; i <= steps; i += 1) {
    const x = s.x0 + ((s.x1 - s.x0) * i) / steps;
    const dx = x - s.cx;
    const under = s.r * s.r - dx * dx;
    if (under < 0) continue;
    const z = s.cz + Math.sqrt(under);
    parts.push(`${parts.length === 0 ? 'M' : 'L'} ${v.sx(x).toFixed(1)} ${v.sy(z).toFixed(1)}`);
  }
  return parts.join(' ');
}

export function profilePaths(
  v: ViewMap,
  profile: FloorProfile | CeilingProfile,
): { d: string; label: string; license: string }[] {
  return profile.segments.map((s) => ({
    d: segmentPath(v, s),
    label: s.constraint.label,
    license: s.constraint.license,
  }));
}
