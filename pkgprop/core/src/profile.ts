import type { ConstraintMeta } from './graph.js';

/**
 * Envelope profiles — the buildable space as attributable geometry.
 *
 * A profile is an ordered set of segments over x. Each segment knows the
 * constraint that authored it, so evaluating the profile at any x returns
 * both a z and the wall's name. The drawing layer clamps authored control
 * points against these and prints the segment's constraint on contact —
 * the same contract as the sliders.
 *
 * Segments are analytic (lines and circular arcs), never sampled, so the
 * attribution has no resolution.
 */

export interface Pt {
  readonly x: number;
  readonly z: number;
}

export type Segment =
  | {
      readonly kind: 'line';
      readonly x0: number;
      readonly x1: number;
      readonly z0: number;
      readonly z1: number;
      readonly constraint: ConstraintMeta;
    }
  | {
      readonly kind: 'arc';
      /** Upper half of the circle centered (cx, cz), radius r, clipped to [x0, x1]. */
      readonly cx: number;
      readonly cz: number;
      readonly r: number;
      readonly x0: number;
      readonly x1: number;
      readonly constraint: ConstraintMeta;
    };

export interface ProfileHit {
  readonly z: number;
  readonly constraint: ConstraintMeta;
}

function segmentZ(s: Segment, x: number): number | null {
  if (x < s.x0 || x > s.x1) return null;
  if (s.kind === 'line') {
    if (s.x1 === s.x0) return Math.max(s.z0, s.z1);
    const t = (x - s.x0) / (s.x1 - s.x0);
    return s.z0 + t * (s.z1 - s.z0);
  }
  const dx = x - s.cx;
  const under = s.r * s.r - dx * dx;
  if (under < 0) return null;
  return s.cz + Math.sqrt(under);
}

/**
 * A floor profile: the surface must stay ON OR ABOVE it. Evaluation takes
 * the max over covering segments; the winning segment is the attribution.
 */
export class FloorProfile {
  constructor(readonly segments: readonly Segment[]) {}

  at(x: number): ProfileHit | null {
    let best: ProfileHit | null = null;
    for (const s of this.segments) {
      const z = segmentZ(s, x);
      if (z !== null && (best === null || z > best.z)) {
        best = { z, constraint: s.constraint };
      }
    }
    return best;
  }
}

/**
 * A ceiling profile: the surface must stay ON OR BELOW it. Evaluation takes
 * the min over covering segments.
 */
export class CeilingProfile {
  constructor(readonly segments: readonly Segment[]) {}

  at(x: number): ProfileHit | null {
    let best: ProfileHit | null = null;
    for (const s of this.segments) {
      const z = segmentZ(s, x);
      if (z !== null && (best === null || z < best.z)) {
        best = { z, constraint: s.constraint };
      }
    }
    return best;
  }
}

export interface ClampResult {
  readonly z: number;
  /** Wall touched when the requested z was pushed back, or grazed exactly. */
  readonly touching: { side: 'floor' | 'ceiling'; constraint: ConstraintMeta } | null;
  /** Set when floor and ceiling cross here: both walls, nothing buildable. */
  readonly conflict: { floor: ProfileHit; ceiling: ProfileHit } | null;
}

/** Clamp an authored z into [floor(x), ceiling(x)], naming any wall touched. */
export function clampToEnvelope(
  floor: FloorProfile,
  ceiling: CeilingProfile,
  x: number,
  z: number,
  touchTolerance: number,
): ClampResult {
  const f = floor.at(x);
  const c = ceiling.at(x);
  if (f && c && f.z > c.z) {
    return { z: f.z, touching: { side: 'floor', constraint: f.constraint }, conflict: { floor: f, ceiling: c } };
  }
  let out = z;
  let touching: ClampResult['touching'] = null;
  if (f && out <= f.z + touchTolerance) {
    out = Math.max(out, f.z);
    touching = { side: 'floor', constraint: f.constraint };
  }
  if (c && out >= c.z - touchTolerance) {
    out = Math.min(out, c.z);
    touching = { side: 'ceiling', constraint: c.constraint };
  }
  return { z: out, touching, conflict: null };
}
