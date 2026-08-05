/**
 * Angle unit conversion. Definitional math (π rad = 180°), kept outside the
 * constraint directory: the license lint guards domain numbers, and these are
 * unit definitions, not demands on the car.
 */
export function degToRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

export function radToDeg(rad: number): number {
  return (rad * 180) / Math.PI;
}
