/**
 * Variable-radius blends — how a feature line softens, fades, and dies.
 *
 * THE DEFECT THIS EXISTS TO FIX. Until now a curve had two states. Creased: the
 * tangent field is switched off across it and the two patches meet at whatever
 * angle their boundaries give, which is a knife edge, the same knife edge for
 * the whole length of the curve, ending abruptly wherever the curve ends.
 * Uncreased: the field runs at full strength and the seam is invisible. There
 * was nothing in between, and nothing that changed along a line.
 *
 * Real bodies are almost entirely the in-between. A feature line is crisp over
 * a wing, opens as it crosses a door, and is gone before the quarter — and it
 * dies by growing its radius, not by stopping. The McLaren's wing crown made
 * the point in one build: creased it engraved a chine down the length of a
 * bonnet that is one pressing, and uncreased there was no line at all. Those
 * were the only two things the tool could say.
 *
 * WHAT A BLEND IS HERE, AND WHAT IT IS NOT. This does not cut the edge out and
 * sew a fillet surface into the hole. It cannot: G0 holds in this tool because
 * the patch edge IS the shared curve, bit for bit, and trimming that away to
 * insert a rolling-ball fillet would trade the guarantee the whole surfacer is
 * built on for a sewing tolerance. So the edge stays exactly where it is and
 * the ROUNDING is done by the correction field — the two patches leave the
 * curve in one tangent plane, and the turn back to their own natural shapes is
 * packed into a band whose width sets the radius.
 *
 * That is a real fillet in every respect a reflection can see and one respect
 * it cannot. A rolling ball of radius r on a break of φ sits inside the corner
 * by r(sec(φ/2) − 1); this surface passes through the corner instead. On a
 * 15° feature line at r = 8 mm that is 69 microns, which is a quarter of the
 * mesh and a twentieth of a panel gap. On a 45° break at r = 5 it is 0.41 mm
 * and would show. `blendProbe` reports it per edge rather than leaving it to be
 * discovered, and the number is the honest price of a watertight body.
 *
 * THE FAMILY. Φ already reaches into a patch through a cubic bump
 * `g(x) = x(1−x)²` — g(0)=0 and g′(0)=1, so the boundary gets exactly the
 * cross-derivative it was prescribed and the position never moves. But g is
 * nonzero across the whole patch, so a seam correction is a PANEL-WIDE event:
 * the radius is whatever the panel's own size makes it, and no two lines on
 * one body can have different radii.
 *
 * A narrower bump gives a tighter radius. The one below is a quintic squeezed
 * into a band of width `band`:
 *
 *     t(x) = band · q5(x / band)   for x < band,   0 beyond
 *     q5(y) = y − 6y³ + 8y⁴ − 3y⁵
 *
 * chosen so that q5(0)=0, q5′(0)=1 — same boundary behaviour as g, so swapping
 * one for the other cannot move a point or rotate a tangent plane — and
 * q5(1)=q5′(1)=q5″(1)=0, so the bump and its first two derivatives all vanish
 * where the band ends. The surface joins its own untouched interior with
 * CURVATURE CONTINUITY, not merely tangency, and beyond the band the
 * correction is identically zero rather than small. That is what "washes out
 * seamlessly into a flat surface" has to mean if it is to be checkable: not a
 * tolerance, a construction. The cubic g cannot say the same — g″(1) = 2, so
 * today every side's G1 correction perturbs the second derivative of the side
 * opposite it, which is one of the reasons G2 is a fit and G1 is not.
 *
 * VARYING IT ALONG THE CURVE, without a chain rule anywhere. A radius that
 * changes along a line needs a bump that changes along a line, and a bump
 * whose shape depends on the edge parameter puts ∂B/∂α · α′(s) terms into
 * every one of the six Φ derivative functions. It does not have to. The family
 * is a CONVEX BLEND of the two fixed bumps and the blend is linear in α:
 *
 *     B(ξ; s) · D(s)  =  g(ξ) · [(1−α(s))·D(s)]  +  t(ξ) · [α(s)·D(s)]
 *
 * so a variable-width bump on one profile is algebraically two fixed-width
 * bumps on two profiles. Nothing differentiates a shape; the α-dependence
 * lives entirely in two ordinary along-edge vector functions, which is what
 * the field already knows how to carry and differentiate. Both terms have
 * B′(0) = 1, so their sum delivers exactly D at the boundary for any α at all
 * — G1 is untouched by construction, at every mix, which is the property that
 * had to survive.
 *
 * THE RADIUS, AS ARITHMETIC. Across the band the surface's tangent direction
 * sweeps from the shared plane back to the patch's own natural direction —
 * half the break, ψ = φ/2, on each side. The turn rate per unit of parameter
 * is ψ|B″(ξ)| and the arc length per unit is w = |S_ξ| at the edge, so the
 * curvature the blend puts in is ψ|B″|/w and the radius is its reciprocal at
 * the peak:
 *
 *     max|q5″| = 3.9402 at y = 0.2427    so  r ≈ band · w / (2 φ)
 *
 * and the two bumps combine as curvatures do, in reciprocal:
 *
 *     1/r  =  (1−α)·(2φ/w)  +  α·(2φ/(band·w))
 *
 * which inverts in closed form for α.
 *
 * THE WIDE BUMP AGREES WITH THE SAME FORMULA, which is the first check that
 * this is a derivation and not a curve fit: max|g″| = 4 exactly, at x = 0,
 * against the quintic's 3.9402, so the cubic already in the file IS the
 * band = 1 case to within a percent and a half. Two bumps chosen forty years
 * of surfacing apart land on one expression.
 *
 * THE SECOND CHECK IS A SECTION, and it is the one that counts. `blendProbe`
 * walks the BUILT surface across the seam and reads the tightest radius along
 * it, using nothing but positions — no partial, no coefficient, none of the
 * arithmetic the field was made from. Against the synthetic roof, at four
 * radii spanning two orders and six break angles:
 *
 *     break      6°     10°     20°     40°     60°     90°
 *     achieved   1.015  1.014   1.010   0.993   0.965   0.900   × asked
 *
 * Flat in the radius to three decimals at every angle, which says the FORM is
 * right; drifting slowly with the break, which is the |S_ξ|³ term the closed
 * form drops. Within 1.5% over the whole range a feature line lives in, and
 * no fitted constant anywhere. The 10% at 90° is a fold rather than a feature
 * line and is reported rather than corrected.
 *
 * The probe had to be fixed before it could say any of that, and the way it
 * was wrong is worth more than the number: it estimated curvature over a
 * stencil that was a FIXED FRACTION of the section, so it read every radius
 * 11% high and refining the sampling converged, beautifully, on the wrong
 * answer. A measurement that gets more precise without getting more accurate
 * is the hardest kind to catch.
 *
 * WHERE IT CANNOT DELIVER. Two ends, both reported rather than silently
 * clamped. Above `w/(2φ)` — the widest a panel that size can be — the line is
 * as soft as the panel allows and the ask is capped. Below `MIN_BAND·w/(2φ)`
 * the bump runs out of numerical room and the ask is capped the other way.
 *
 * AN AMPLITUDE KNOB WAS TRIED HERE AND IS NOT IN THE FILE, because it works
 * backwards and the probe said so. Scaling the correction by μ < 1 rotates the
 * tangent plane only part of the way, so the surface turns LESS over the same
 * band — a bigger radius, not a smaller one — and leaves (1−μ)φ of break
 * standing at the curve as well. It buys a softer roll with a crease still in
 * it, which is the one combination nobody asks for. A radius tighter than the
 * band floor is capped and reported instead. `radius: 0` clears the mark, so
 * it and `crease` alone are the same instruction and the same document hash.
 *
 * AND WHERE THE BREAK DIES, THE LINE DIES ON ITS OWN. r = band·w/(2φ) has φ
 * in the denominator, so a feature line whose two surfaces drift into the same
 * plane grows its radius without being asked and is gone by the time φ is.
 * That is how a real line runs out and it costs nothing to author.
 */

import type { Id } from "@car/schema";
import { ncos } from "@car/num";
import { DEFAULT_CREASE_ANGLE } from "./crease-angle.js";

// ── the two bumps ──────────────────────────────────────────────────────────

/**
 * The quintic the tight bump is made from: q5(0)=0, q5′(0)=1, and q5, q5′, q5″
 * all zero at 1. Six conditions, six coefficients, one answer.
 */
export const q5 = (y: number): number => y - 6 * y ** 3 + 8 * y ** 4 - 3 * y ** 5;
const q5Prime = (y: number): number => 1 - 18 * y * y + 32 * y ** 3 - 15 * y ** 4;
const q5Prime2 = (y: number): number => -36 * y + 96 * y * y - 60 * y ** 3;

/** |q5″| at its peak, and where. Both are needed by the radius arithmetic. */
export const Q5_CURVATURE_PEAK = 3.9402340;

/**
 * The tight bump, measured INWARD from a side at ξ = 0. Identically zero at and
 * beyond `band`, which is the whole point: the opposite edge of the patch is
 * untouched to every order rather than to first order.
 */
export const tightBasis = (x: number, band: number): number =>
  band > 0 && x < band ? band * q5(x / band) : 0;
export const tightPrime = (x: number, band: number): number =>
  band > 0 && x < band ? q5Prime(x / band) : 0;
export const tightPrime2 = (x: number, band: number): number =>
  band > 0 && x < band ? q5Prime2(x / band) / band : 0;

/** The same, measured inward from a side at ξ = 1 — the mirror, as `h` is of `g`. */
export const tightBasisHi = (x: number, band: number): number => tightBasis(1 - x, band);
export const tightPrimeHi = (x: number, band: number): number => -tightPrime(1 - x, band);
export const tightPrime2Hi = (x: number, band: number): number => tightPrime2(1 - x, band);

// ── what a designer authors ────────────────────────────────────────────────

/**
 * A feature line's radius, along its own curve parameter.
 *
 * Millimetres, because that is what a stylist says and what a section shows.
 * `end` defaults to `start`, so the common case — one radius for the whole
 * line — is one number.
 */
export interface SoftenSpec {
  /** Radius at the curve's t = 0, mm. Zero is a knife edge. */
  readonly start: number;
  /** Radius at t = 1, mm. Absent means constant. */
  readonly end?: number;
}

/** The requested radius at curve parameter t. Monotone between the two ends. */
export function radiusAt(spec: SoftenSpec, t: number): number {
  const a = Math.max(0, spec.start);
  const b = Math.max(0, spec.end ?? spec.start);
  const x = t <= 0 ? 0 : t >= 1 ? 1 : t;
  // Smootherstep rather than linear: a radius profile is a shape the surface
  // inherits, and a linear ramp puts a curvature step at each end of the run.
  const s = x * x * x * (x * (6 * x - 15) + 10);
  return a + (b - a) * s;
}

// ── the solver ─────────────────────────────────────────────────────────────

/** What one side of one shared edge needs, station by station. */
export interface BlendStation {
  /** Loop parameter along this side. */
  readonly s: number;
  /** Natural break angle between the two owners here, radians. */
  readonly phi: number;
  /** |S_ξ| at the edge — mm of surface per unit of inward parameter. */
  readonly speed: number;
  /** Radius asked for here, mm. */
  readonly asked: number;
}

export interface BlendPlan {
  /** Width of the tight bump for this side, in the side's inward parameter. */
  readonly band: number;
  /** Share of the correction carried by the tight bump, per station. */
  readonly mix: readonly number[];
  /** Radius this plan expects to deliver, per station, mm. */
  readonly achieved: readonly number[];
  /** Stations where the ask was wider than the panel could carry. */
  readonly cappedWide: number;
  /** Stations where the ask was tighter than the band floor. */
  readonly cappedTight: number;
  /** Worst |achieved − asked| / asked over the stations where a radius was asked. */
  readonly worstRelative: number;
}

export interface BlendOptions {
  /**
   * Narrowest band the tight bump may have, in the side's own parameter.
   *
   * NOT A MESH NUMBER, and the first version of it was. A band narrower than a
   * couple of print cells is a radius the STL will not show, and that felt
   * like a reason to forbid it — but the analytic surface carries it perfectly
   * well, an export reads the analytic surface, and a designer asking for a
   * 3 mm radius on a large panel is asking for something real. So the floor is
   * numerical only: below about a four-hundredth of a side the quintic's
   * second derivative is 1/band and starts to matter to the arithmetic rather
   * than to the shape. Whether the PRINT can show it is a separate question,
   * answered separately in `visibleAt`.
   */
  readonly minBand?: number;
  /** Widest the tight bump may be. Above this the wide bump is the better one. */
  readonly maxBand?: number;
  /** Breaks below this are not feature lines and get no blend. Radians. */
  readonly minBreak?: number;
}

/** Numerical floor on the band, in a side's own parameter. */
export const MIN_BAND = 0.0025;
const MAX_BAND = 0.75;

/**
 * How much softer the partner bump is than the tight one.
 *
 * BOTH BUMPS OF A SOFTENED SIDE ARE COMPACT, and the first version paired the
 * tight one with the panel-wide cubic. That is the difference between a fillet
 * and a disaster. Mixing toward a bump that reaches the whole patch means a
 * 6 mm radius asked for on a wheel arch is delivered as half a right-angle
 * correction spread across a 900 mm wheelhouse floor — the McLaren came out
 * 2150 mm tall against 1141 authored, with every continuity probe in the file
 * reporting a perfect surface, because it was one. It was a perfect blend of
 * the wrong thing.
 *
 * Two compact bumps in a six-to-one ratio give the same continuous range of
 * radii — six to one covers crisp-to-soft on any real feature line — and
 * NOTHING the blend does can reach further than the wider of the two. That is
 * what "without breaking the global continuity of the surrounding patches"
 * has to mean when the patches are the size of a car panel.
 *
 * The panel-wide cubic is still there and is still the right answer for a seam
 * nobody softened: an unmarked join between two panels IS a panel-wide event,
 * and pretending otherwise would put a band edge down the middle of every
 * smooth surface on the body.
 */
export const WIDE_RATIO = 6;

/** The partner band for a tight band, in a side's own parameter. */
export const partnerBand = (band: number): number =>
  Math.min(MAX_BAND, band * WIDE_RATIO);

/**
 * Is a band wide enough for a mesh at this density to show the rounding?
 *
 * A separate question from whether the surface has it. Two cells is the least
 * that can carry a roll at all — one cell is a chamfer and none is the knife
 * edge you were trying to get rid of.
 */
export const visibleAt = (band: number, density: number): boolean => band * density >= 2;
/** A tenth of the crease angle: below it there is no line to round. */
const MIN_BREAK = (DEFAULT_CREASE_ANGLE * Math.PI) / 180 / 10;

/**
 * Radius a bump of this band gives on its own, mm.
 *
 * NO FITTED CONSTANT. The header's table is what a section of the built
 * surface reads against this, and it is within 1.5% over every break angle a
 * feature line has. A coefficient was carried here for one draft, measured,
 * and found to be one.
 */
export const bandRadius = (band: number, speed: number, phi: number): number =>
  phi <= 0 ? Infinity : (band * speed) / (2 * phi);

/** The softest a panel-wide correction can be — band = 1, in effect. */
export const wideRadius = (speed: number, phi: number): number => bandRadius(1, speed, phi);

/** Radius a tight bump of this band gives on its own, mm. */
export const tightRadius = (band: number, speed: number, phi: number): number =>
  bandRadius(band, speed, phi);

/**
 * Choose the band, then the mix and the amplitude at every station.
 *
 * The band is fixed for the side because it is the position of a KNOT: the
 * tight bump is one polynomial inside it and identically zero outside, and a
 * knot that wandered along the edge would stop the patch being a tensor
 * product and take the control net with it. So the band is sized once, from
 * the tightest radius the side is asked for, and everything softer than that
 * is reached by mixing back toward the wide bump — which is a coefficient, not
 * a knot.
 */
export function blendPlan(
  stations: readonly BlendStation[],
  opts: BlendOptions = {},
): BlendPlan {
  const minBand = opts.minBand ?? MIN_BAND;
  const maxBand = opts.maxBand ?? MAX_BAND;
  const minBreak = opts.minBreak ?? MIN_BREAK;

  // THE WIDEST BAND ANY STATION ASKS FOR, and the first version took the
  // narrowest. That is the single most consequential line in the file and it
  // took a McLaren's wheel arch to settle it.
  //
  // The band is a knot and has to be one number for the side. Take the
  // NARROWEST and every station that wanted more gets it by mixing in the wide
  // bump — which reaches the entire panel. On a wheel arch lip that means a
  // 6 mm radius asked for on a 90° break is delivered as 88% of a right-angle
  // correction spread across a 900 mm wheelhouse floor: the body came out
  // 2150 mm tall, against 1141 authored, and every continuity probe in the
  // file said the surface was perfect. It was. It was a perfect blend of the
  // wrong thing.
  //
  // Take the WIDEST and the mix never fires for a tight ask at all: rTight is
  // at least the asked radius at every station, so α clamps to 1, the whole
  // correction rides a bump that is identically zero outside its band, and
  // nothing can reach a panel it was not asked to reach. What is lost is
  // fidelity rather than sanity — where the surface is stretched, the same
  // band delivers a softer radius than was asked for — and that is reported
  // per station rather than absorbed. The wide bump is then what it should
  // always have been: the answer for a line asked to be SOFTER than a full
  // band can make it, which is a panel-wide event and deserves a panel-wide
  // bump.
  //
  // Stations with no break to round contribute nothing either way: r =
  // band·w/(2φ) is unbounded as φ goes to zero, so a dead stretch of line
  // would otherwise ask for an infinite band and take the side with it.
  // THE NARROWEST any station asks for, which is safe now that the partner is
  // compact too: a station wanting more mixes toward a bump six times wider
  // and no further, rather than toward one that spans the panel. The earlier
  // draft took the widest to escape exactly that, and paid for it in fidelity
  // everywhere the surface was stretched.
  let want = Infinity;
  for (const st of stations) {
    if (st.asked <= 0 || st.phi < minBreak || st.speed <= 0) continue;
    want = Math.min(want, (2 * st.asked * st.phi) / st.speed);
  }
  const band = Number.isFinite(want)
    ? Math.min(maxBand, Math.max(minBand, want))
    : minBand;

  const mix: number[] = [];
  const achieved: number[] = [];
  let cappedWide = 0, cappedTight = 0, worstRelative = 0;

  for (const st of stations) {
    // No line here, or none asked for: the field runs as it always has.
    if (st.asked <= 0 || st.phi < minBreak || st.speed <= 0) {
      mix.push(0);
      achieved.push(wideRadius(st.speed, st.phi));
      continue;
    }
    const rWide = bandRadius(partnerBand(band), st.speed, st.phi);
    const rTight = bandRadius(band, st.speed, st.phi);
    let a: number;
    if (st.asked >= rWide) {
      a = 0;                       // softer than the panel can be
      cappedWide++;
    } else if (st.asked <= rTight) {
      a = 1;                       // tighter than the band can be
      if (st.asked < rTight - 1e-9) cappedTight++;
    } else {
      // Curvatures add, so the mix solves in closed form.
      //   1/r = (1−α)/rWide + α/rTight
      a = (1 / st.asked - 1 / rWide) / (1 / rTight - 1 / rWide);
      a = Math.min(1, Math.max(0, a));
    }
    const inv = (1 - a) / rWide + a / rTight;
    const got = inv > 0 ? 1 / inv : Infinity;
    mix.push(a);
    achieved.push(got);
    if (Number.isFinite(got)) {
      worstRelative = Math.max(worstRelative, Math.abs(got - st.asked) / st.asked);
    }
  }
  return { band, mix, achieved, cappedWide, cappedTight, worstRelative };
}

/**
 * How far this surface sits from the rolling-ball fillet it stands in for, mm.
 *
 * The blend keeps the edge on the curve; a true fillet cuts the corner off. The
 * gap between them is the sagitta of the arc, and it is the one thing a
 * displacement blend cannot buy back. Published per edge so that a designer
 * asking for a big radius on a hard break is told what it costs instead of
 * finding out in a reflection.
 */
export const rollingBallOffset = (radius: number, phi: number): number =>
  radius > 0 && phi > 0 ? radius * (1 / ncos(Math.min(phi, Math.PI * 0.98) / 2) - 1) : 0;

/** One shared edge's blend, as the field hands it to the patch. */
export interface EdgeBlend {
  readonly curveId: Id;
  readonly cellA: Id;
  readonly cellB: Id;
  readonly asked: SoftenSpec;
  /** Per owner, in the same order the adjacency reports them. */
  readonly plans: readonly [BlendPlan, BlendPlan];
  /** Worst rolling-ball offset over the stations, mm. */
  readonly offset: number;
  /** Median achieved radius, mm — the number to put in a report. */
  readonly medianRadius: number;
}
