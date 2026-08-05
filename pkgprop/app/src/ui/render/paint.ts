import type { RenderState } from '../../state/lines.js';

/**
 * Marker paint, mixed in code.
 *
 * A marker rendering reads as a car because of value structure, not detail:
 * sky reflected in the upper surfaces, the horizon band at the belt, ground
 * bounce below the rocker, and one specular streak where the sun is. Every
 * shade here is derived from the chosen hue and the sun, so moving the sun
 * moves the whole read.
 */

export function hsl(h: number, s: number, l: number, a = 1): string {
  const sat = Math.round(Math.max(0, Math.min(1, s)) * 100);
  const lum = Math.round(Math.max(0, Math.min(1, l)) * 100);
  return a >= 1 ? `hsl(${h} ${sat}% ${lum}%)` : `hsl(${h} ${sat}% ${lum}% / ${a})`;
}

export interface Palette {
  /** Sky-lit upper surfaces: hood crown, roof, shoulder. */
  readonly skyTop: string;
  readonly skyMid: string;
  /** The horizon band — where the world's edge reflects across the body side. */
  readonly horizon: string;
  /** Body side below the horizon, in shade. */
  readonly sideMid: string;
  readonly sideLow: string;
  /** Ground bounce along the rocker. */
  readonly bounce: string;
  /** Specular highlight. */
  readonly spec: string;
  /** Glass. */
  readonly glass: string;
  readonly glassLow: string;
  /** Shadow on the ground. */
  readonly shadow: string;
  /** How saturated the sun is right now — low sun means warmer light. */
  readonly warmth: number;
}

export function paletteOf(r: RenderState): Palette {
  const h = r.hue;
  const s = r.sat;
  // A low sun warms and darkens everything; a high sun flattens and brightens.
  const el = Math.max(0, Math.min(1, r.sunEl));
  const warmth = 1 - el;
  const lift = 0.06 + el * 0.16;

  return {
    skyTop: hsl(h + 4, s * 0.55, 0.74 + lift * 0.5),
    skyMid: hsl(h + 2, s * 0.75, 0.58 + lift * 0.4),
    // The horizon band is the hard value break that makes a flat shape read
    // as a reflective body side. Keep it clearly darker than the sky above.
    horizon: hsl(h - 6 + warmth * 14, Math.min(1, s * 1.25 + warmth * 0.06), 0.19 + lift * 0.22),
    sideMid: hsl(h, s, 0.44 + lift * 0.35),
    sideLow: hsl(h - 4, s * 0.9, 0.24 + lift * 0.2),
    bounce: hsl(h + 18 + warmth * 16, Math.min(1, s + 0.12), 0.36 + lift * 0.25),
    spec: hsl(h + 30 * warmth, s * 0.3, 0.97),
    // Glass carries the sky at its top edge and goes deep at the belt, so the
    // greenhouse reads as glazing rather than a hole cut in the body.
    glass: hsl(h + 6, Math.max(0.05, s * 0.35), 0.4 + lift * 0.3),
    glassLow: hsl(h + 12, Math.max(0.05, s * 0.5), 0.13 + lift * 0.14),
    shadow: hsl(h + 8, 0.14, 0.16),
    warmth,
  };
}

/** Where the sun sits in the sky, in view-space fractions of the frame. */
export function sunScreenPos(
  r: RenderState,
  bbox: { x0: number; x1: number; zTop: number },
): { x: number; z: number } {
  const span = bbox.x1 - bbox.x0;
  const cx = (bbox.x0 + bbox.x1) / 2;
  return {
    x: cx + r.sunAz * span * 0.72,
    z: bbox.zTop * (0.35 + r.sunEl * 1.15),
  };
}
