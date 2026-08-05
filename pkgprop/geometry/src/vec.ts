/**
 * Three numbers and the handful of things you do to them.
 *
 * Car axes throughout: +x aft along the car, +y outboard to the right, +z up
 * from the road. The 2D drafting layer works in (x, z) and the plan view in
 * (x, y); this is the same space with both of them present at once.
 */

export interface V3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export const v3 = (x: number, y: number, z: number): V3 => ({ x, y, z });

export const add = (a: V3, b: V3): V3 => v3(a.x + b.x, a.y + b.y, a.z + b.z);
export const sub = (a: V3, b: V3): V3 => v3(a.x - b.x, a.y - b.y, a.z - b.z);
export const scale = (a: V3, k: number): V3 => v3(a.x * k, a.y * k, a.z * k);
export const dot = (a: V3, b: V3): number => a.x * b.x + a.y * b.y + a.z * b.z;

export const cross = (a: V3, b: V3): V3 =>
  v3(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);

export const length = (a: V3): number => Math.sqrt(dot(a, a));

/** Unit vector, or the zero vector when there is no direction to speak of. */
export function normalize(a: V3): V3 {
  const L = length(a);
  return L > 0 ? scale(a, 1 / L) : v3(0, 0, 0);
}

export const lerp = (a: V3, b: V3, t: number): V3 => add(a, scale(sub(b, a), t));

/** Mirror across the car's centre plane. The left side is never authored. */
export const mirrorY = (a: V3): V3 => v3(a.x, -a.y, a.z);
