/**
 * Curve quality — the curvature comb, and what it says about a curve.
 *
 * WHY THIS MATTERS MORE THAN IT SOUNDS. A surface built on bad curves is a bad
 * surface, and no amount of continuity work at the seams changes that. The
 * tangent field can make two patches share a tangent plane exactly and the
 * body will still read badly if the master line running through them wobbles.
 * Every surfacer's first move is to comb the curves, and it is the move this
 * instrument could not make until now.
 *
 * WHAT A COMB IS. At each station along the curve, a hair of length
 * proportional to the curvature, drawn in the direction the curve is bending.
 * The tips trace a plot of κ against arc length. What a surfacer reads off it:
 *
 *   - a JUMP means the curve is only G1 there — usually a segment joint;
 *   - a KINK (κ continuous, dκ/ds not) means G2 and no more;
 *   - RIPPLE — κ wandering up and down over a stretch that ought to be one
 *     move — is the classic bad curve, and it survives every tolerance check
 *     there is because the curve passes through all its points perfectly;
 *   - a SIGN CHANGE is an inflection. Legitimate in an S, and a defect in
 *     anything meant to read as a single arc.
 *
 * The numbers below are the same readings as scalars, so a body can be ranked
 * without anybody looking at 86 plots.
 *
 * κ = |C' × C''| / |C'|³, exactly, from the chain's own derivatives. No
 * finite differences and no sampling error in the curvature itself — the
 * sampling only decides how finely the plot is drawn.
 */

import type { CurveChain, Pt3 } from "@car/schema";
import {
  chainDeriv, chainDeriv2, cross3, dist3, dot3, evalChain, len3, nabs, norm3, scale3, sub3,
} from "@car/num";

export interface CombSample {
  readonly t: number;
  /** Arc length from the start, mm. */
  readonly s: number;
  readonly at: Pt3;
  /** Curvature, 1/mm. Always non-negative — the sign lives in `hair`. */
  readonly kappa: number;
  /** Unit direction the curve bends toward; [0,0,0] where it is straight. */
  readonly hair: Pt3;
}

export interface CurveQuality {
  readonly samples: readonly CombSample[];
  readonly arcLength: number;
  readonly kappaMin: number;
  readonly kappaMax: number;
  /**
   * Times the bending direction reverses — inflections. One is an S-curve.
   * Several over a short span is ripple.
   */
  readonly inflections: number;
  /**
   * Times dκ/ds reverses sign. A curve that is one clean move has few; a
   * rippled one has many, and this counts them without needing a threshold on
   * how big the ripple is.
   */
  readonly curvatureTurns: number;
  /** True if κ never increases then decreases (or vice versa) — one clean move. */
  readonly monotone: boolean;
  /**
   * Total variation of κ divided by its range: how many times the curvature
   * goes up and down, as a continuous number.
   *
   *   1  monotone — κ sweeps once and stops. The Class-A ideal.
   *   2  one peak. What a normal body line looks like.
   *   3+ ripple, and the number is roughly the count of peaks and troughs.
   *
   * Scale-free by construction, so a 200 mm curve and a 2 m one are
   * comparable. This replaced a "worst slope" measure that could not tell
   * ripple from a legitimately tight corner — a curve that is nearly straight
   * and then turns hard has a huge slope and a perfect variation of 1.
   */
  readonly variation: number;
  /** Curvature at the two ends, 1/mm — what decides G2 where curves meet. */
  readonly kappaStart: number;
  readonly kappaEnd: number;
  /**
   * The curve turns less than `STRAIGHT_TURN` radians over its whole length.
   * Every shape reading below is then meaningless — a straight line's
   * curvature is roundoff, and roundoff has as many peaks as you sample for —
   * so they are reported as the perfect values they actually are rather than
   * as noise.
   */
  readonly straight: boolean;
}

/**
 * Total turning, in radians, below which a curve is a straight line.
 *
 * κ·L is dimensionless and is exactly the angle the tangent sweeps, so this
 * is one threshold that works for a 200 mm curve and a 5 m one. A nanoradian
 * over the length of a car is 5 µm of deviation; nothing in this tool means
 * anything at that scale.
 */
export const STRAIGHT_TURN = 1e-9;

const DEFAULT_SAMPLES = 96;

/** Sample the comb along a chain. */
export function curveComb(chain: CurveChain, samples = DEFAULT_SAMPLES): CombSample[] {
  const n = Math.max(4, samples);
  const out: CombSample[] = [];
  let arc = 0;
  let prev: Pt3 | null = null;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const at = evalChain(chain, t);
    if (prev) arc += dist3(prev, at);
    prev = at;
    const d1 = chainDeriv(chain, t);
    const d2 = chainDeriv2(chain, t);
    const speed = len3(d1);
    if (speed === 0) {
      out.push({ t, s: arc, at, kappa: 0, hair: [0, 0, 0] });
      continue;
    }
    const kappa = len3(cross3(d1, d2)) / (speed * speed * speed);
    // Bending direction: the component of C'' across the tangent.
    const tHat = scale3(d1, 1 / speed);
    const across = sub3(d2, scale3(tHat, dot3(d2, tHat)));
    out.push({ t, s: arc, at, kappa, hair: len3(across) === 0 ? [0, 0, 0] : norm3(across) });
  }
  return out;
}

/**
 * Read the comb as numbers.
 *
 * `inflections` counts turns of the BENDING DIRECTION, which is the thing a
 * designer sees; `curvatureTurns` counts turns of κ itself, which is the thing
 * that makes a highlight wobble. They are different faults and a curve can
 * have either without the other, so both are reported rather than rolled into
 * one score.
 */
export function curveQuality(chain: CurveChain, samples = DEFAULT_SAMPLES): CurveQuality {
  const comb = curveComb(chain, samples);
  const arcLength = comb.length === 0 ? 0 : comb[comb.length - 1]!.s;
  let kappaMin = Infinity, kappaMax = 0;
  for (const c of comb) {
    if (c.kappa < kappaMin) kappaMin = c.kappa;
    if (c.kappa > kappaMax) kappaMax = c.kappa;
  }
  if (!Number.isFinite(kappaMin)) kappaMin = 0;

  // Bending-direction reversals. A hair that flips to the opposite side is an
  // inflection; a hair that is zero (a straight stretch) carries no direction
  // and is skipped rather than counted as a reversal.
  let inflections = 0;
  let last: Pt3 | null = null;
  for (const c of comb) {
    if (c.kappa === 0 || len3(c.hair) === 0) continue;
    if (last && dot3(last, c.hair) < 0) inflections++;
    last = c.hair;
  }

  // dκ/ds sign turns, and the total variation of κ.
  let turns = 0;
  let totalVariation = 0;
  let lastSign = 0;
  let rising = 0, falling = 0;
  for (let i = 1; i < comb.length; i++) {
    const dk = comb[i]!.kappa - comb[i - 1]!.kappa;
    totalVariation += nabs(dk);
    const sign = dk > 0 ? 1 : dk < 0 ? -1 : 0;
    if (sign !== 0) {
      if (sign > 0) rising++; else falling++;
      if (lastSign !== 0 && sign !== lastSign) turns++;
      lastSign = sign;
    }
  }

  const span = kappaMax - kappaMin;
  const straight = kappaMax * arcLength < STRAIGHT_TURN;
  const variation = straight ? 1 : span > 0 ? totalVariation / span : 1;

  return {
    samples: comb,
    arcLength,
    kappaMin: straight ? 0 : kappaMin,
    kappaMax: straight ? 0 : kappaMax,
    inflections: straight ? 0 : inflections,
    curvatureTurns: straight ? 0 : turns,
    monotone: straight ? true : rising === 0 || falling === 0,
    variation,
    straight,
    kappaStart: straight || comb.length === 0 ? 0 : comb[0]!.kappa,
    kappaEnd: straight || comb.length === 0 ? 0 : comb[comb.length - 1]!.kappa,
  };
}
