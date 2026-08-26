/**
 * Two defects you can see in a side view and no probe in this package could.
 *
 * `curveQuality` next door measures CURVATURE — ripple, inflections, how many
 * times the bending turns over. That is the right instrument for whether a
 * surface will reflect cleanly and it is blind to the two things a designer
 * spots first from across the room:
 *
 *   THE DIP THAT COMES BACK. A line descends and then climbs to the same
 *   height it left. Its curvature can be immaculate the whole way — one clean
 *   inflection, variation near 1 — and it still reads as a mistake, because a
 *   body line goes somewhere. A roofline that peaks once is one reversal and
 *   is the roof; a roofline that sags twenty millimetres over three hundred
 *   and recovers is a wobble, and the difference between them is AMPLITUDE
 *   AGAINST SPAN, not curvature.
 *
 *   THE BALLOON. A chain's segment endpoints are the stations somebody
 *   authored. Between two of them the cubic is free, and a cubic fitted
 *   through four samples of a monotone run can leave the interval its own two
 *   ends span — going above both, or below both. That is width or height the
 *   author did not ask for and cannot see in the table. Measured against the
 *   segment's OWN endpoints, so it needs no reference data and works on any
 *   curve in any car.
 *
 * Both are reported per axis, because a line can be clean in side and awful in
 * plan and the two are authored by different tables.
 */

import type { CurveChain, Pt3 } from "@car/schema";
import { evalChain } from "@car/num";

/** One place a profile changes direction along the drawing axis. */
export interface ProfileTurn {
  /** Where, along the run axis. */
  readonly at: number;
  /** The value at the turn, on the measured axis. */
  readonly value: number;
  /** True if the profile was rising into this turn — so this is a peak. */
  readonly peak: boolean;
  /**
   * How far the profile moved between this turn and the previous one, mm.
   *
   * The number that separates a feature from a wobble. A roof peak has an
   * amplitude of hundreds; a sag has one of tens.
   */
  readonly amplitude: number;
  /** How far along the run axis that took, mm. */
  readonly span: number;
}

export interface ProfileQuality {
  readonly turns: readonly ProfileTurn[];
  /** Turns whose amplitude is under the wobble threshold. */
  readonly wobbles: number;
  readonly worstWobble: number;
  readonly worstWobbleAt: number;
  /**
   * Furthest a segment strays outside the interval its own two endpoints
   * span, mm. Zero on a chain whose every span is monotone between its
   * stations, which is what an authored table means to say.
   */
  readonly overshoot: number;
  readonly overshootAt: number;
  /** Which segment did it, so a caller can name the station. */
  readonly overshootSeg: number;
}

export interface ProfileOptions {
  /** Axis the profile is measured on: 0 x, 1 y, 2 z. */
  readonly axis?: 0 | 1 | 2;
  /** Axis the drawing runs along. */
  readonly runAxis?: 0 | 1 | 2;
  /** Reversals smaller than this are wobble rather than shape, mm. */
  readonly wobbleMm?: number;
  /** Samples per segment. */
  readonly perSegment?: number;
  /** Read |value| rather than value — for a plan view of a two-sided body. */
  readonly absolute?: boolean;
}

/**
 * How much of a move counts as shape rather than noise.
 *
 * Twelve millimetres over a car. A panel gap is four, a highlight will show a
 * two-millimetre flat, and nothing a stylist draws on purpose reverses by less
 * than a centimetre — so a reversal under this is the interpolator talking,
 * not the author.
 */
export const WOBBLE_MM = 12;

export function profileQuality(chain: CurveChain, opts: ProfileOptions = {}): ProfileQuality {
  const axis = opts.axis ?? 2;
  const runAxis = opts.runAxis ?? 0;
  const wobbleMm = opts.wobbleMm ?? WOBBLE_MM;
  const per = Math.max(8, opts.perSegment ?? 48);
  const n = chain.segs.length;
  const read = (p: Pt3): number => (opts.absolute ? Math.abs(p[axis]!) : p[axis]!);

  // ── the balloon: per segment, against its own two ends ───────────────────
  let overshoot = 0, overshootAt = 0, overshootSeg = -1;
  for (let j = 0; j < n; j++) {
    const a = read(evalChain(chain, j / n));
    const b = read(evalChain(chain, (j + 1) / n));
    const lo = Math.min(a, b), hi = Math.max(a, b);
    for (let i = 1; i < per; i++) {
      const t = (j + i / per) / n;
      const p = evalChain(chain, t);
      const v = read(p);
      const out = v > hi ? v - hi : v < lo ? lo - v : 0;
      if (out > overshoot) {
        overshoot = out;
        overshootAt = p[runAxis]!;
        overshootSeg = j;
      }
    }
  }

  // ── the dip that comes back: every reversal, with its size ───────────────
  const N = n * per;
  const vals: number[] = [], runs: number[] = [];
  for (let i = 0; i <= N; i++) {
    const p = evalChain(chain, i / N);
    vals.push(read(p));
    runs.push(p[runAxis]!);
  }
  const turns: ProfileTurn[] = [];
  let lastTurnIdx = 0;
  let dir = 0;
  for (let i = 1; i <= N; i++) {
    const d = vals[i]! - vals[i - 1]!;
    if (d === 0) continue;
    const s = d > 0 ? 1 : -1;
    if (dir === 0) { dir = s; continue; }
    if (s === dir) continue;
    // Direction changed at i-1.
    turns.push({
      at: runs[i - 1]!,
      value: vals[i - 1]!,
      peak: dir > 0,
      amplitude: Math.abs(vals[i - 1]! - vals[lastTurnIdx]!),
      span: Math.abs(runs[i - 1]! - runs[lastTurnIdx]!),
    });
    lastTurnIdx = i - 1;
    dir = s;
  }
  // The run from the last turn to the end is not a reversal and is not counted.

  let wobbles = 0, worstWobble = 0, worstWobbleAt = 0;
  for (const t of turns) {
    if (t.amplitude >= wobbleMm) continue;
    wobbles++;
    if (t.amplitude > worstWobble) { worstWobble = t.amplitude; worstWobbleAt = t.at; }
  }
  return { turns, wobbles, worstWobble, worstWobbleAt, overshoot, overshootAt, overshootSeg };
}
