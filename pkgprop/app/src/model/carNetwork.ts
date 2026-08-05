import type { SolveResult } from '@pkgprop/core';
import {
  buildNetwork,
  interpolate,
  mirrorNetwork,
  v3,
  type Curve,
  type EdgeKind,
  type NetCurve,
  type NetworkMesh,
  type NetworkSpec,
  type PanelSpec,
  type SectionShape,
  type V3,
} from '@pkgprop/geometry';

/**
 * The car as a grid of named curves, and a panel in every cell.
 *
 * The trick that keeps this honest is that the section is the only source of
 * truth about shape. A rail — the rocker, the shoulder, the beltline, the hood
 * shutline — is not a separate curve someone drew and hoped would agree with
 * the surface; it is the section evaluated at a fixed parameter, swept along
 * the car. A transverse cut is the same section restricted between two of
 * those parameters. So every boundary in the network comes off one curve, and
 * two panels that meet cannot disagree about where they meet, because they are
 * reading the same function at the same numbers.
 *
 * What that buys, in the owner's words: panels that are their own panels, and
 * a greenhouse that is a windscreen and three pillars and two pieces of side
 * glass rather than a balloon. A pillar is not a bulge in a taper any more. It
 * is a patch, with a crease down each side, and the crease is why you can see
 * it.
 */

/**
 * A longitudinal rail, named by what it is on a car and located by where it
 * sits across the section.
 *
 * Parameter, not height: the section runs from the centreline over the crown
 * and down the flank to the sill as one curve, so a fixed parameter tracks the
 * same *feature* as the car changes shape. Pinning a rail to a height instead
 * would let the shoulder wander onto the roof the moment someone lowered the
 * belt.
 */
interface Rail {
  readonly id: string;
  readonly label: string;
  /** Where across the half-section, 0 at the centreline, 1 at the sill. */
  readonly f: number;
  /** Whether the surface breaks along this rail. */
  readonly kind: EdgeKind;
}

/** A transverse cut: a station, and whether the surface breaks across it. */
interface Cut {
  readonly id: string;
  readonly label: string;
  readonly x: number;
  readonly kind: EdgeKind;
}

/**
 * The five stations across a half-section, from the centreline outboard and
 * down to the sill. Every rail on the car is one of these, and every panel
 * lies between two of them.
 *
 * Five points and one curve through all of them, rather than a body section
 * and a separate greenhouse section, because two sections cannot be made to
 * agree. They did not: the body was capped flat at the beltline right across
 * its width, and the glass landed on that deck 289mm inboard of where the deck
 * ended. So every car had a horizontal shelf a foot wide running the length of
 * the cabin on both sides, with a tent sitting on it. That is the chip bag, and
 * no amount of continuity work on either volume could have fixed it, because
 * the two volumes were describing different cars.
 *
 * With one curve there is no shelf to have. The bottom of the glass IS the top
 * of the bodyside — the same point, on the same curve, at the same parameter.
 */
const RAIL_CROWN = 0;
const RAIL_ROOF = 1;
const RAIL_DLO = 2;
const RAIL_SHOULDER = 3;
const RAIL_SILL = 4;
/**
 * The underfloor, at the centreline.
 *
 * Without it the half-section is an open arc and the car is a shell you can
 * see straight up into from below — which is most of what "parts of the body
 * are just empty" was. With it the half-section is a closed half-loop from the
 * centreline over the roof and back to the centreline under the floor, so
 * mirroring produces a closed tube and the only openings left are the two ends.
 */
const RAIL_FLOOR = 5;

/**
 * How far out along the roof the drip rail sits, as a fraction of the glass
 * band. Where the roof stops being roof and the side glass begins.
 */
const ROOF_RAIL_FRACTION = 0.42;

/**
 * Outside the cabin there is no glass, so the two middle rails have no job to
 * do — but the grid still wants five. They land on the body's own crown
 * instead, which is where the hood shutline and the fender top belong anyway,
 * so the same two rails are the DLO down the cabin and the hood shut across
 * the nose without the topology changing under them.
 */
const NOSE_ROOF_FRACTION = 0.18;
const NOSE_DLO_FRACTION = 0.38;

/** Samples along a curve when turning a rail or a cut into a network curve. */
const CURVE_SAMPLES = 14;

/**
 * How wide a pillar is, across the daylight opening.
 *
 * This is a real design decision rather than a modelling constant — it trades
 * directly against how much the driver cannot see — and it wants to become a
 * solved band between structure and obstruction. Until then it is one number,
 * named, and the same for all three pillars.
 */
const PILLAR_WIDTH = 110;

/**
 * How far the underfloor sits below the sill at the centreline.
 *
 * Small and deliberate: a flat pan at exactly sill height would put the floor
 * in the same plane as the rocker's lowest point and the section would have a
 * zero-area corner there. Dropping it slightly also reads correctly — a real
 * floor pan sits below the rocker's outer flange.
 */
const FLOOR_DROP = 25;

/**
 * How full each panel sits between its boundaries.
 *
 * A Coons patch knows its four boundary curves and nothing whatever about its
 * interior, so left alone it fills the middle with the average of its two ruled
 * surfaces — the fattest inoffensive thing on offer. Every panel does it, so
 * the whole body puffs, and that is the balloon. It is not taste, it is the
 * surface type's default behaviour, and the fix is to say what each panel is.
 *
 * Real bodywork is not uniformly full. A hood is taut across its middle with
 * its crown gathered near the shoulder; a roof is nearly flat; a fender is
 * full because it has a wheel underneath it; glass is close to developable
 * because it has to be made. These say so.
 *
 * Below 1 pulls a panel toward the flat quadrilateral through its corners;
 * above 1 pushes it out. The boundary never moves either way.
 */
const DEFAULT_FULLNESS = 0.72;
const FULLNESS: Readonly<Record<string, number>> = {
  // Big, seen edge-on, and the panel where slack reads worst.
  hood: 0.55,
  roof: 0.5,
  decklid: 0.6,
  // Glass is nearly developable on a real car — it has to be formed.
  glass: 0.62,
  // A pillar is a narrow strap; fullness there just bulges it.
  pillar: 0.85,
  // Fenders and quarters have a wheel under them and want their volume.
  'front fender': 0.95,
  'rear quarter': 0.95,
  'fender top': 0.85,
  'quarter top': 0.85,
  // The door is the flattest big panel on most cars.
  door: 0.6,
  'belt rail': 0.8,
  underfloor: 0.5,
};

/**
 * The least body depth between the top of a wheel opening and the shoulder.
 *
 * ASSUMED. There is a real number behind it — the arch flange, the inner
 * wheelhouse and the sheet metal between them — but it is a body-engineering
 * dimension and not one this tool solves yet, so it is named and flagged rather
 * than dressed up as derived.
 *
 * It exists because without it the section turns itself inside out. The sill
 * rail is the rocker along most of the car and the arch rim across a wheel
 * opening, and a big wheel under a low body puts that rim *above* the shoulder:
 * measured at 299mm above, over more than half the length of the rear opening.
 * The section then doubles back in z, the panel between shoulder and sill is
 * built upside down, and the flank reads as a gouge with a shelf in it rather
 * than as a fender.
 */
const ARCH_TO_SHOULDER = 110;

/**
 * How softly the shoulder lifts over an arch.
 *
 * A hard `max` would put a corner in the shoulder rail at the exact station
 * where the arch overtakes it, and a corner in a rail is a crease on the
 * finished car that nobody drew. Blending over a run turns it into what it
 * physically is: the fender crowning over the wheel. That crown has a name —
 * the haunch — and it is most of why a rear-drive car looks planted.
 */
const HAUNCH_BLEND = 130;

/**
 * A maximum with the corner taken off it.
 *
 * Standard log-sum-exp softmax: exactly `max` when the two are far apart,
 * rounded over a run of `k` where they cross. Written in the numerically stable
 * form — the naive `k·log(e^{a/k} + e^{b/k})` overflows for millimetre inputs.
 */
function softMax(a: number, b: number, k: number): number {
  if (k <= 0) return Math.max(a, b);
  return Math.max(a, b) + k * Math.log1p(Math.exp(-Math.abs(a - b) / k));
}

/**
 * The closest two panel divisions may sit before one of them is dropped.
 *
 * ASSUMED. Two reasons, and they agree on roughly the same number.
 *
 * The design one: nobody draws a shutline 20mm from a pillar edge. Panel gaps
 * on a production car run 3-5mm and the metal between two of them has to be
 * formable, so divisions this close are not a style anyone chose — they are two
 * unrelated stations that happened to land near each other.
 *
 * The arithmetic one, which is what forced this: the C-pillar's trailing edge
 * and the fore end of the rear wheel opening landed 20mm apart on the default
 * car. That is a panel 20mm wide and 400mm tall — aspect ratio 1:20 — and the
 * finite-difference normals across it are numerical noise rather than surface.
 * Measured at 84-88° of "tangent break" on seams that are geometrically fine;
 * the surface was not broken, the sliver was.
 */
const MIN_STATION_SPACING = 60;

/**
 * Drop divisions that land on top of each other.
 *
 * When two are too close, the stronger statement survives: a crease is a line
 * somebody drew — a pillar edge, a shutline, the cowl — while a smooth station
 * is only where a wheel opening happens to begin or end. The first and last are
 * the nose and the tail and are never dropped, because dropping either shortens
 * the car.
 */
function spaceOut(cuts: readonly Cut[]): Cut[] {
  if (cuts.length < 3) return [...cuts];
  const rank = (c: Cut): number => (c.kind === 'crease' ? 1 : 0);
  const out: Cut[] = [cuts[0]!];
  const last = cuts[cuts.length - 1]!;
  for (const cut of cuts.slice(1, -1)) {
    const prev = out[out.length - 1]!;
    if (cut.x - prev.x >= MIN_STATION_SPACING) out.push(cut);
    else if (out.length > 1 && rank(cut) > rank(prev)) out[out.length - 1] = cut;
  }
  // The tail wins any argument with whatever crowded up against it.
  while (out.length > 1 && last.x - out[out.length - 1]!.x < MIN_STATION_SPACING) out.pop();
  out.push(last);
  return out;
}

const clamp01 = (t: number): number => Math.min(1, Math.max(0, t));

export interface CarNetworkInput {
  /** Upper silhouette at a station — the drawn hood/roof/deck chain. */
  readonly topZ: (x: number) => number;
  readonly beltZ: (x: number) => number;
  readonly halfWidth: (x: number) => number;
  readonly rockerZ: (x: number) => number;
  readonly shape: SectionShape;
  readonly cabin: { readonly x0: number; readonly x1: number } | null;
  readonly bumperX: number;
  readonly tailX: number;
  readonly wheelbase: number;
  /** Arch rim height at a station, where an opening is cut. */
  readonly archZ: ((x: number) => number) | null;
  /** Fore and aft extent of each wheel opening. */
  readonly arches: readonly { readonly slot: string; readonly x0: number; readonly x1: number }[];
  /** Where the rear seats begin, if there are any — the B-pillar station. */
  readonly secondRowX: number | null;
  readonly density: number;
}

/**
 * One half-section: the five named points, and the single curve through them.
 *
 * The parameters are returned alongside because everything downstream needs to
 * know where a rail *is* on the curve, and they are computed the same way the
 * interpolation computes them — chord length, normalised — so a rail sits
 * exactly on its own point rather than near it.
 */
interface Section {
  readonly curve: Curve;
  /** Parameter of each named rail, RAIL_CROWN through RAIL_SILL. */
  readonly t: readonly number[];
}

function chordParams(pts: readonly V3[]): number[] {
  const t = [0];
  for (let i = 1; i < pts.length; i += 1) {
    const a = pts[i]!;
    const b = pts[i - 1]!;
    t.push(t[i - 1]! + Math.max(1e-6, Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)));
  }
  const total = t[t.length - 1]!;
  return t.map((v) => v / total);
}

/**
 * How much of the glass section applies at this station: 1 down the cabin, 0
 * across the nose and the tail, and a smooth ramp over the cowl and the
 * backlight base where the one becomes the other.
 */
const GLASS_RUN = 170;

function glassWeight(input: CarNetworkInput, x: number): number {
  const { cabin } = input;
  if (!cabin) return 0;
  const t = (v: number): number => {
    const c = clamp01(v);
    return c * c * (3 - 2 * c);
  };
  return Math.min(t((x - cabin.x0 + GLASS_RUN) / GLASS_RUN), t((cabin.x1 + GLASS_RUN - x) / GLASS_RUN));
}

function sectionAt(input: CarNetworkInput, x: number): Section | null {
  const top = input.topZ(x);
  const belt = input.beltZ(x);
  const halfW = Math.max(20, input.halfWidth(x));
  const w0 = glassWeight(input, x);

  // Two different bottoms, and conflating them was putting an 80° crease up the
  // side of the car at every wheel arch.
  //
  // `ground` is the rocker: one continuous line the length of the body. `hem`
  // is where this particular section stops, which inside a wheel opening is the
  // arch rim instead — a max, so it has a corner at each end of the opening.
  // That corner is correct and wanted: a real rocker does turn sharply up into
  // the arch, and the sill rail is where that happens.
  //
  // What is not wanted is the corner travelling. Everything above the sill used
  // to be measured from the hem, so the moment the arch lifted the bottom of
  // the section it lifted the shoulder, the fender top and the underfloor with
  // it — a step of a hundred-odd millimetres in every rail on the flank, at four
  // stations, propagating all the way to the roof. Measured at 47-55° of tangent
  // break across the arch cuts, against 2.5° everywhere else on the car.
  //
  // So the arch raises the hem and nothing else. It is a wheel opening, not a
  // change of body height.
  const ground = input.rockerZ(x);
  const hem = input.archZ ? Math.max(ground, input.archZ(x)) : ground;

  // The bodyside below the belt: shoulder out at maximum width, sill tucked in
  // under it. Its height reference slides with the glass weight for the same
  // reason the rails do — a step here would step the shoulder.
  const shoulderTop = Math.max(ground + 60, top + (belt - top) * w0);
  const drawnShoulder = ground + (shoulderTop - ground) * clamp01(input.shape.shoulder);
  // The shoulder rides over the wheel rather than being cut by it. Where the
  // arch would otherwise come through, the fender crowns — which is a haunch,
  // and a haunch is not a workaround, it is the thing that makes a rear-drive
  // car look like it is standing on its back wheels.
  const shoulderZ = softMax(drawnShoulder, hem + ARCH_TO_SHOULDER, HAUNCH_BLEND);

  // The rocker tucks under by the tumblehome, and it keeps tucking across a
  // wheel opening. Releasing the tuck there was tried and reverted: it put the
  // arch rim at the body's full width, which made every arch the widest point
  // on the car and turned the fenders into blisters bolted to a narrower tub.
  // Pontoon fenders, 1948. The flange really is near full width on a real car,
  // but only because the flank beside it is too — that is a plan-outline
  // question, not a section one, and faking it here reads as separate volumes.
  const sillY = halfW * (1 - 0.66 * clamp01(input.shape.tumblehome));

  // Both point sets, always, and blended across the cabin's ends.
  //
  // The two are genuinely different topologies — with glass the middle rails
  // are the roof rail and the DLO, without it they ride the body's own crown —
  // and switching between them at a station puts a cliff in every rail that
  // crosses the boundary. A rail is sampled along the car, so a cliff between
  // two samples is a spike on the finished surface, which is exactly what
  // appeared at the cowl. Blending over a short run turns the cliff into the
  // transition it physically is: the hood running up to the base of the
  // windscreen.
  const inset = clamp01(input.shape.glassInset);
  const dloY = Math.max(16, halfW * (1 - 0.24 * inset));
  const glassPts: V3[] = [
    v3(x, 0, top),
    v3(x, dloY * (1 - 0.52 * ROOF_RAIL_FRACTION), belt + (top - belt) * (1 - ROOF_RAIL_FRACTION * 0.55)),
    v3(x, dloY, belt),
    v3(x, halfW, shoulderZ),
    v3(x, sillY, hem),
    // The floor pan is flat. It does not climb into the wheel well, which is
    // what measuring it from the hem had it doing.
    v3(x, 0, ground - FLOOR_DROP),
  ];
  const crownY = halfW * (0.18 + 0.42 * (1 - clamp01(input.shape.crown)));
  const rise = Math.max(60, top - ground);
  const solidPts: V3[] = [
    v3(x, 0, top),
    v3(x, crownY * NOSE_ROOF_FRACTION * 2.2, top - rise * NOSE_ROOF_FRACTION * 0.35),
    v3(x, crownY, top - rise * NOSE_DLO_FRACTION * 0.4),
    v3(x, halfW, shoulderZ),
    v3(x, sillY, hem),
    v3(x, 0, ground - FLOOR_DROP),
  ];

  const w = glassWeight(input, x);
  const pts: V3[] = glassPts.map((gp, i) => {
    const sp = solidPts[i]!;
    return v3(x, sp.y + (gp.y - sp.y) * w, sp.z + (gp.z - sp.z) * w);
  });

  // Monotonic outboard, or the section folds back on itself and the surface
  // self-intersects. This fires on a very narrow nose section, where the
  // shoulder can come inboard of the crown.
  for (let i = 1; i < RAIL_SILL; i += 1) {
    const prev = pts[i - 1]!;
    const cur = pts[i]!;
    if (cur.y < prev.y) pts[i] = v3(x, prev.y + 1, cur.z);
  }

  const t = chordParams(pts);
  // Perpendicular to the mirror plane at both ends. The car is a mirrored
  // half, and a mirrored half only reads as one surface if it leaves the
  // centreline square — otherwise the reflection meets it at an angle and the
  // body wears a crease down its spine and another down its keel, running its
  // whole length, that nobody drew. Alias calls this Golden Rule 4.
  const curve = interpolate(pts, { start: v3(0, 1, 0), end: v3(0, -1, 0) });
  // The interpolation overshoots past the widest point, and the plan half-width
  // is a solved wall. Scale back rather than clamp, which would leave a flat
  // spot along the widest point.
  let peak = 0;
  for (let i = 0; i <= 48; i += 1) peak = Math.max(peak, curve.at(i / 48).y);
  if (peak <= halfW) return { curve, t };
  const k = halfW / peak;
  return {
    curve: {
      at: (u) => {
        const p = curve.at(u);
        return v3(p.x, p.y * k, p.z);
      },
      tangentAt: (u) => curve.tangentAt(u),
      sample: (n) => curve.sample(n).map((p) => v3(p.x, p.y * k, p.z)),
    },
    t,
  };
}

/** A rail: one named section point swept between two stations. */
function railCurve(
  section: (x: number) => Section | null,
  rail: number,
  x0: number,
  x1: number,
): Curve | null {
  const pts: V3[] = [];
  for (let i = 0; i <= CURVE_SAMPLES; i += 1) {
    const x = x0 + ((x1 - x0) * i) / CURVE_SAMPLES;
    const sec = section(x);
    if (!sec) return null;
    pts.push(sec.curve.at(sec.t[rail]!));
  }
  return interpolate(pts);
}

/**
 * A cut: one station's section, restricted between two named rails.
 *
 * Restricted, not rebuilt. The points come off the same curve the rails come
 * off, at parameters between the same two the rails sit at, so a cut meets its
 * rails at exactly their points and the four corners of every panel close.
 *
 * ## Why there are no character lines, measured
 *
 * This function is the reason, and it is worth writing down because two rounds
 * of work went at the wrong end of it.
 *
 * Declaring a panel edge a `crease` withholds the cross-boundary field from the
 * patch and lets it fall back to the ruled chord. That was supposed to be the
 * hard fold. It is not: a crease measures 2.54° of tangent break against a
 * smooth edge's 2.52°, with 0.33mm of geometry between them across a whole
 * panel. Every shutline, drip rail, pillar edge and DLO on the car is a
 * flat-shading trick that disappears the moment you look at the silhouette.
 *
 * The cause is here rather than in the patch. A cut is a restriction of ONE
 * section spline between two rail parameters, so the piece above a rail and the
 * piece below it are segments of the same smooth curve and meet tangentially
 * however loudly the panel edge says "crease". A surface cannot fold where its
 * boundary curves refuse to; the patch is doing exactly what it was asked.
 *
 * Clamping the end tangents here was tried and reverted. It moves almost
 * nothing — the other thirteen sample points still lie on the smooth section,
 * so the fold is confined to a fourteenth of the curve — and it cost 3.89° →
 * 5.06° of upper-body continuity to buy no visible line. Measured, not guessed.
 *
 * The fold has to go in the section itself: `sectionAt` must build a chain of
 * segments with a real corner at each crease rail, and that corner wants a
 * depth, which is the "cut into the body any depth I want" control. That is the
 * next piece of work, and it is a change to the section rather than to this.
 */
function cutCurve(
  section: (x: number) => Section | null,
  x: number,
  railA: Rail,
  railB: Rail,
): Curve | null {
  const sec = section(x);
  if (!sec) return null;
  const a = sec.t[railA.f]!;
  const b = sec.t[railB.f]!;
  const pts: V3[] = [];
  for (let i = 0; i <= CURVE_SAMPLES; i += 1) {
    pts.push(sec.curve.at(a + ((b - a) * i) / CURVE_SAMPLES));
  }
  return interpolate(pts);
}

/**
 * Cross a rail list with a cut list and put a panel in every cell.
 *
 * The whole topology is this loop. A two-seater and a four-door differ only in
 * how many cuts are in the list, which is why neither of them is a special
 * case in the code.
 */
function grid(
  section: (x: number) => Section | null,
  rails: readonly Rail[],
  cuts: readonly Cut[],
  names: (rail: number, cut: number) => { id: string; label: string; group: string } | null,
): { curves: NetCurve[]; panels: PanelSpec[] } {
  const curves: NetCurve[] = [];
  const panels: PanelSpec[] = [];
  const seen = new Set<string>();
  const push = (id: string, curve: Curve | null, label: string): boolean => {
    if (!curve) return false;
    if (!seen.has(id)) {
      seen.add(id);
      curves.push({ id, curve, label });
    }
    return true;
  };

  for (let r = 0; r < rails.length - 1; r += 1) {
    for (let c = 0; c < cuts.length - 1; c += 1) {
      const named = names(r, c);
      if (!named) continue;
      const lo = rails[r]!;
      const hi = rails[r + 1]!;
      const fwd = cuts[c]!;
      const aft = cuts[c + 1]!;
      if (aft.x - fwd.x < 1) continue;

      const loId = `${lo.id}@${fwd.id}-${aft.id}`;
      const hiId = `${hi.id}@${fwd.id}-${aft.id}`;
      const fwdId = `${fwd.id}@${lo.id}-${hi.id}`;
      const aftId = `${aft.id}@${lo.id}-${hi.id}`;

      const ok =
        push(loId, railCurve(section, lo.f, fwd.x, aft.x), lo.label) &&
        push(hiId, railCurve(section, hi.f, fwd.x, aft.x), hi.label) &&
        push(fwdId, cutCurve(section, fwd.x, lo, hi), fwd.label) &&
        push(aftId, cutCurve(section, aft.x, lo, hi), aft.label);
      if (!ok) continue;

      // Boundary order is [south, east, north, west] walking the loop: along
      // the low rail aft, up the aft cut, back along the high rail, down the
      // forward cut.
      panels.push({
        id: named.id,
        label: named.label,
        group: named.group,
        boundary: [loId, aftId, hiId, fwdId],
        reversed: [false, false, true, true],
        edges: [lo.kind, aft.kind, hi.kind, fwd.kind],
      });
    }
  }
  return { curves, panels };
}

export interface CarNetwork {
  readonly mesh: NetworkMesh;
  readonly panelCount: number;
  readonly creaseCount: number;
  /**
   * The network the mesh was sampled from — the half, before mirroring.
   *
   * The mesh is a sampling of the surface and not the surface itself, and the
   * difference matters to anything that asks a question about quality: a
   * highlight line, a continuity measurement, a section cut. Those want the
   * analytic patch normal. The mesh only has the welded vertex normal, which is
   * an average computed to make shading look continuous, so asking the mesh
   * about continuity asks the cosmetic whether it is doing its job.
   */
  readonly spec: NetworkSpec;
}

/**
 * Where the greenhouse actually has height.
 *
 * The cabin span comes from the drawn silhouette's cowl and backlight
 * stations, and at the very ends of that span the glass has closed down to
 * nothing — the backlight has already met the decklid by the time it reaches
 * its last drawn point. Building panels out to the nominal ends therefore asks
 * for a patch with no height, which is dropped, and the car quietly loses its
 * backlight. Scanning for the live span instead is also what makes a fastback
 * and a speedster fall out of the same code: a speedster's live span is empty
 * and it simply has no greenhouse.
 */
function liveCabin(input: CarNetworkInput): { x0: number; x1: number } | null {
  const { cabin } = input;
  if (!cabin) return null;
  const STEPS = 60;
  let lo: number | null = null;
  let hi: number | null = null;
  for (let i = 0; i <= STEPS; i += 1) {
    const x = cabin.x0 + ((cabin.x1 - cabin.x0) * i) / STEPS;
    if (input.topZ(x) >= input.beltZ(x) + 60) {
      if (lo === null) lo = x;
      hi = x;
    }
  }
  return lo !== null && hi !== null && hi - lo > 200 ? { x0: lo, x1: hi } : null;
}

export function buildCarNetwork(rawInput: CarNetworkInput): CarNetwork {
  const live = liveCabin(rawInput);
  const input: CarNetworkInput = { ...rawInput, cabin: live };
  const section = (x: number): Section | null => sectionAt(input, x);

  const cowlX = input.cabin?.x0 ?? input.wheelbase * 0.35;
  const backX = input.cabin?.x1 ?? input.wheelbase * 0.85;
  const inCabin = (x: number): boolean => x > cowlX + 1 && x < backX - 1;

  // ---- the rails: one set, the whole car ---------------------------------
  //
  // Two of them change their name depending on where you are along the car,
  // and that is the point rather than a compromise. Down the cabin the middle
  // pair are the roof rail and the DLO; across the nose the same pair are the
  // hood shutline and the fender top. One grid, five rails, and no seam
  // between a "body" and a "greenhouse" because there is only one section.
  const rails: Rail[] = [
    // The centreline and the keel are where the car meets its own
    // reflection: the surface has to leave them square or the mirror puts a
    // crease the length of the body down each one.
    { id: 'crown', label: 'centreline', f: RAIL_CROWN, kind: 'mirror' },
    { id: 'roof-rail', label: 'roof rail', f: RAIL_ROOF, kind: 'crease' },
    { id: 'dlo', label: 'DLO lower edge', f: RAIL_DLO, kind: 'crease' },
    { id: 'shoulder', label: 'shoulder', f: RAIL_SHOULDER, kind: 'smooth' },
    { id: 'sill', label: 'sill', f: RAIL_SILL, kind: 'crease' },
    { id: 'floor', label: 'underfloor', f: RAIL_FLOOR, kind: 'mirror' },
  ];

  // ---- the cuts: panel divisions along the car ---------------------------
  const cuts: Cut[] = [{ id: 'nose', label: 'front parting', x: input.bumperX, kind: 'smooth' }];
  for (const a of input.arches) {
    cuts.push({ id: `arch-${a.slot}-fore`, label: `${a.slot} arch, fore`, x: a.x0, kind: 'smooth' });
    cuts.push({ id: `arch-${a.slot}-aft`, label: `${a.slot} arch, aft`, x: a.x1, kind: 'smooth' });
  }
  const pillarAt = (id: string, label: string, x: number): void => {
    cuts.push({ id: `${id}-fore`, label: `${label} leading edge`, x: x - PILLAR_WIDTH / 2, kind: 'crease' });
    cuts.push({ id: `${id}-aft`, label: `${label} trailing edge`, x: x + PILLAR_WIDTH / 2, kind: 'crease' });
  };
  cuts.push({ id: 'cowl', label: 'cowl shutline', x: cowlX, kind: 'crease' });
  if (input.cabin) {
    pillarAt('a-pillar', 'A-pillar', cowlX + PILLAR_WIDTH * 1.4);
    if (input.secondRowX !== null && input.secondRowX > cowlX + 400 && input.secondRowX < backX - 400) {
      pillarAt('b-pillar', 'B-pillar', input.secondRowX);
    }
    pillarAt('c-pillar', 'C-pillar', backX - PILLAR_WIDTH * 1.4);
  }
  cuts.push({ id: 'backlight-base', label: 'backlight base', x: backX, kind: 'crease' });
  cuts.push({ id: 'tail', label: 'rear parting', x: input.tailX, kind: 'smooth' });
  cuts.sort((a, b) => a.x - b.x);
  const stations = spaceOut(cuts);

  /** What a cell is called, in car language, given where it sits. */
  const nameOf = (r: number, c: number) => {
    const fwd = stations[c]!;
    const aft = stations[c + 1]!;
    const mid = (fwd.x + aft.x) / 2;
    const cabin = inCabin(mid);
    const isPillar =
      cabin &&
      fwd.id.endsWith('-fore') &&
      aft.id.endsWith('-aft') &&
      fwd.id.slice(0, -5) === aft.id.slice(0, -4);

    // Above the DLO rail inside the cabin is roof and glass; outside it is
    // hood or decklid.
    let group: string;
    if (r === RAIL_CROWN) group = cabin ? 'roof' : mid < cowlX ? 'hood' : 'decklid';
    else if (r === RAIL_ROOF) {
      if (!cabin) group = mid < cowlX ? 'fender top' : 'quarter top';
      else if (isPillar) group = 'pillar';
      else group = 'glass';
    } else if (r === RAIL_DLO) {
      // The belt rail: the band of body between the glass and the shoulder.
      group = cabin ? 'belt rail' : mid < cowlX ? 'front fender' : 'rear quarter';
    } else if (r === RAIL_SHOULDER) {
      group = cabin ? 'door' : mid < cowlX ? 'front fender' : 'rear quarter';
    } else {
      group = 'underfloor';
    }

    return {
      id: `p-${r}-${c}`,
      label: isPillar ? fwd.label.replace(' leading edge', '') : `${group} · ${fwd.label} to ${aft.label}`,
      group,
      fullness: FULLNESS[group] ?? DEFAULT_FULLNESS,
    };
  };

  const built = grid(section, rails, stations, nameOf);

  const spec: NetworkSpec = {
    curves: built.curves,
    panels: built.panels,
    density: Math.max(3, Math.floor(input.density)),
  };
  const half = buildNetwork(spec);

  const creases = built.panels.reduce(
    (sum, p) => sum + (p.edges ?? []).filter((e) => e === 'crease').length,
    0,
  );

  return {
    mesh: mirrorNetwork(half),
    panelCount: built.panels.length,
    creaseCount: creases,
    spec,
  };
}

export { PILLAR_WIDTH };

/** Build the network input from a solve, the drawn rails, and the features. */
export function networkInputFrom(
  result: SolveResult,
  rails: {
    topZ: (x: number) => number;
    beltZ: (x: number) => number;
    halfWidth: (x: number) => number;
    rockerZ: (x: number) => number;
  },
  shape: SectionShape,
  cabin: { x0: number; x1: number } | null,
  archZ: ((x: number) => number) | null,
  arches: readonly { slot: string; x0: number; x1: number }[],
  density: number,
): CarNetworkInput {
  const g = result.geometry;
  // The B-pillar stands where the second row's heels are: that is the station
  // a rear door has to open behind, so it needs no number of its own.
  const secondRow = g.occupants[1]?.hpoint.x ?? null;
  return {
    ...rails,
    shape,
    cabin,
    bumperX: g.bumperX,
    tailX: g.tailX,
    wheelbase: g.wheelbase,
    archZ,
    arches,
    secondRowX: secondRow,
    density,
  };
}
