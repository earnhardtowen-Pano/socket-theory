/**
 * Build the Panoramic P2 — the sixth car, and the first DESIGNED here.
 *
 * Five bodies stand in the cars directory. One was authored from a brief and
 * four were rebuilt from published envelopes, and every one of those four
 * was a test of whether the instrument could reach a shape somebody else had
 * already found. This is the other question: a four-door fastback GT with
 * nothing to copy, drawn to the company's own brief, on the same grammar the
 * M3 proved out — two seat rows, two shut rings a side, a boot that is a
 * lid — and pushed past it in three places the M3 could not go.
 *
 * WHAT THIS CAR ADDS. Both END CAPS are domed: the box's flat nose and tail
 * faces bow forward from their corners, so the prow is a prow and the tail
 * is a kamm, not two plates. The caps are then CUT INTO BANDS — a grille
 * across the nose, a lamp band across the tail — each seam re-bowed onto the
 * dome so the halves are the dome, split. And the WHEELS are two solids now:
 * a tyre whose shoulders are softened, and a rim disc standing proud of the
 * sidewall, so a wheel reads as a wheel rather than as a painted drum.
 *
 * Body datum: X = 0 at the NOSE TIP, Y across from the centreline, Z up from
 * the ground plane. Millimetres. The box itself starts at X0, one dome-depth
 * aft of the tip, and ends one dome-depth short of the tail.
 *
 *   npx tsx scripts/build-panoramic-p2.ts
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { makeAllocator, type Id, type Pt3 } from "@car/schema";
import { assembleCar, shoulderAboveHip95M, shoulderBreadth95M } from "@car/types";
import { CATALOGUE, finishOf, scanAt, scanUp, sectionAt, sliceSection } from "@car/skin";
import { solve } from "@car/pack";
import {
  cabinLens, chassisFit, packageAt, packageMisses, skinSupport, structureFit,
  MIN_SKIN_CLEARANCE, SKIN_REACH,
  type BodyMount, type CabinPerson, type CarriedPart, type PackageBox, type SectionMesh,
  type StructureMember,
} from "@car/lens";
import {
  p2Config, P2_FRONT_DIAMETER, P2_FRONT_OVERHANG, P2_FRONT_TIRE_WIDTH, P2_FRONT_TRACK,
  P2_PROFILE, P2_PROFILE_TOLERANCE_MM, P2_REAR_DIAMETER, P2_REAR_OVERHANG,
  P2_REAR_TIRE_WIDTH, P2_REAR_TRACK, P2_HEIGHT, P2_LENGTH, P2_WHEELBASE, P2_WIDTH,
} from "@car/fixtures";
import { createSession } from "@car/history";
import { memberKit, suspensionCorner } from "./lib/members.js";
import { capBand, domeEndCap, type EndCap } from "./lib/caps.js";
import { computeQuilt } from "@car/frame";
import {
  blendProbe, bySize, cellBezier, cellBoundary, continuityProbe, curvatureJoinProbe,
  curvatureRateProbe, fieldDisplacement, boundaryCoonsPoint, netAt, networkObstruction,
  panelsOf, quiltAdjacency, tangentField, DEFAULT_CREASE_ANGLE,
} from "@car/surface";
import {
  closedMeshCheck, creaseNormals, engraveGrooves, meshQuilt, mirrorSymmetry, writeStlBinary,
} from "@car/mesh";
import { dist3, evalChain } from "@car/num";

// ── 1. the packaging solve ────────────────────────────────────────────────
const config = p2Config;
const car = assembleCar(config, makeAllocator());
const packed = solve(car.input);

/**
 * The person, lifted out of the packaging solve into BODY coordinates.
 *
 * The packer works from the front axle and the body from the nose, so every
 * station moves by the front overhang. Nothing here is authored: heel, hip,
 * eye and head are ports the occupant array published from sourced
 * anthropometry, placed by the blind solver against the pedal plane. The
 * cabin is measured against THEM, which is the whole point of having them.
 *
 * The row is authored on the centreline and the driver sits `driverY` off it;
 * the cabin readings that matter (shoulder room, the well floor) are about
 * the section rather than the seat, so the person is read at the driver's
 * side and the section is read across the whole car.
 */
const personInBody = (): CabinPerson => {
  const part = car.input.parts.find((pt) => pt.ports.some((q) => /^hip-/.test(q.name)));
  if (!part) throw new Error("no occupant part in the assembly");
  const pose = packed.placements.get(part.id);
  if (!pose) throw new Error("the occupant was not placed");
  const at = (name: RegExp): Pt3 => {
    const q = part.ports.find((r) => name.test(r.name));
    if (!q) throw new Error(`no ${name} port on the occupant`);
    const o = q.frame.origin;
    // + the pose, + the nose-to-axle shift, and the driver's own y offset.
    return [o[0] + pose.origin[0] + P2_FRONT_OVERHANG, DRIVER_Y, o[2] + pose.origin[2]];
  };
  return {
    heel: at(/^heel-/), hip: at(/^hip-/), eye: at(/^eye-/), head: at(/^head-/),
    shoulderHalfBreadth: shoulderBreadth95M().value / 2,
    shoulderAboveHip: shoulderAboveHip95M().value,
  };
};
/**
 * Left-hand drive, beside a wide tunnel, on a car 143 mm wider than the M3:
 * the driver sits further out, and every cabin reading below is taken at
 * that shoulder.
 */
const DRIVER_Y = 390;

const NOSE = P2_FRONT_OVERHANG;
const FRONT_AXLE_X = NOSE;
const REAR_AXLE_X = NOSE + P2_WHEELBASE;
/**
 * TWO WHEEL DIAMETERS, designed in. 711.9 mm at the front on a 255/35 and
 * 739.9 at the rear on a 295/35, both on 21s: the rear pair is 28 mm taller
 * and 40 wider, so the rear arch is the bigger opening and the rear lip the
 * widest thing on the car — the M3's plan fact, chosen rather than found.
 *
 * THIRTY MILLIMETRES OF RADIAL CLEARANCE. Two more than the M3, because a
 * GT on adaptive springs jounces further than an M car on road springs, and
 * the same lesson bounds it: an arch LIP is a panel edge, not a clearance
 * envelope, and the tyre goes up into the wheelhouse behind it.
 */
const FRONT_WHEEL_R = P2_FRONT_DIAMETER / 2;
const REAR_WHEEL_R = P2_REAR_DIAMETER / 2;
const ARCH_CLEAR = 30;
const FRONT_ARCH_R = FRONT_WHEEL_R + ARCH_CLEAR;
const REAR_ARCH_R = REAR_WHEEL_R + ARCH_CLEAR;
/**
 * How far the lip stands proud of the tyre's outer face. SIX again, and the
 * width of the car was chosen to make it so: a 295 section on a 1650 track
 * puts the tyre's outer face at 972.5 against a half-width of 980. Seven and
 * a half millimetres of daylight, the lip takes six, and the rear arch lip is
 * the widest thing on the car at 978.5 — by design rather than by survey.
 */
const ARCH_LIFT = 6;
/**
 * How far short of vertical the arch mouth stops, in radians.
 *
 * A full semicircle puts the mouth exactly where the arc is VERTICAL in side
 * view, and the station cut is a vertical tape line at that same x — so the
 * line grazes the curve and the crossing solve is ill-conditioned. It came out
 * ten millimetres adrift, which is enough for the split to refuse. Eleven
 * degrees of trim gives the mouth a real slope to be cut across, and it is
 * also what a lip does on a car: it runs out into the rocker rather than
 * ending on a tangent.
 */
const ARCH_END = 0.06 * Math.PI;
const FRONT_ARCH_HALF = FRONT_ARCH_R * Math.cos(ARCH_END);
const REAR_ARCH_HALF = REAR_ARCH_R * Math.cos(ARCH_END);
const archMouth = (axleX: number, half: number): [number, number] => [axleX - half, axleX + half];

// ── 1b. what the car has to contain, and the frame that gets round it ─────
// THE CAUSALITY USED TO RUN THE OTHER WAY. A body was authored from a station
// table somebody typed, a frame was derived from the parts afterwards, and a
// lens then complained when the two disagreed — at which point the answer was
// always to retype the body until it stopped. That is a person doing by hand
// what the geometry already knows.
//
// A real car is the other way round. This one has that bonnet BECAUSE the
// V8 stands where it stands: the block behind the front axle under a long
// dash-to-axle, the plenum needing the bulge above it. The parts come first,
// the bay's proportions come off the parts, and the BODY's own tables become
// a floor under the styling rather than the whole of it: where the two
// disagree the package wins and the report names the part that won it.

/**
 * Every part the packing solve placed, as a box in BODY coordinates.
 *
 * The solve works from the front axle and the body from the nose, so every
 * envelope shifts by the front overhang — the same conversion `personInBody`
 * makes for the occupant, and for the same reason.
 */
const placedParts = (): CarriedPart[] => {
  const out: CarriedPart[] = [];
  for (const part of car.input.parts) {
    const pose = packed.placements.get(part.id);
    const env = part.envelope;
    if (!pose || !env) continue;
    const o = env.offset ?? [0, 0, 0];
    const c: Pt3 = [
      pose.origin[0] + o[0] + P2_FRONT_OVERHANG,
      pose.origin[1] + o[1],
      pose.origin[2] + o[2],
    ];
    const h = env.size.map((q) => q.value / 2) as [number, number, number];
    out.push({
      name: part.label,
      lo: [c[0] - h[0], c[1] - h[1], c[2] - h[2]],
      hi: [c[0] + h[0], c[1] + h[1], c[2] + h[2]],
      massKg: part.mass?.value,
    });
  }
  return out;
};
const parts = placedParts();
if (process.env["DBG"] === "1") {
  for (const q of parts) {
    console.log(`  DBG part ${q.name.padEnd(30)} ${q.lo.map((v) => v.toFixed(0)).join(",")} .. ${q.hi.map((v) => v.toFixed(0)).join(",")}`);
  }
}
/** One placed part's box, by a fragment of its label. Throws rather than guesses. */
const partBox = (frag: string): CarriedPart => {
  const hit = parts.find((q) => q.name.includes(frag));
  if (!hit) throw new Error(`no placed part matching "${frag}"`);
  return hit;
};


/**
 * The ENGINE BAY's proportions, as a pure function of what it carries.
 *
 * Same readings as the E-Type's front frame and the F1's rear subframe, and
 * this car points them the classic way again: the bay's rails run beside the
 * block the solve placed, their tail is the gearbox's, their spacing is the
 * wider of the two plus a clearance, and the strut towers stand at the axle
 * the wheels defined. Nothing in `frameEnvelope` knows which layout it is
 * serving — which is the point of it.
 *
 * `lowZ` is deliberately NOT here. It has a second bound, the body's own
 * underside, and that is not known until the body exists.
 */
const TUBE_CLEAR = 74;
const TUBE = 34;
const frameEnvelope = () => {
  const engine = partBox("engine-ice");
  const gearbox = partBox("transmission");
  const lowY = Math.max(engine.hi[1], gearbox.hi[1]) + TUBE_CLEAR;
  return {
    engine, gearbox,
    front: engine.lo[0] - TUBE_CLEAR,
    tail: gearbox.hi[0] + TUBE_CLEAR,
    lowY,
    upY: lowY + 58,
    upZ: engine.hi[2] - 30,
    lowZfloor: engine.lo[2] + 120,
  };
};
const FRAME = frameEnvelope();
if (process.env["DBG"] === "1") {
  const e = FRAME.engine;
  console.log(`  DBG engine ${e.name}`);
  console.log(`  DBG   box    ${e.lo.map((v) => v.toFixed(0)).join(",")} .. ${e.hi.map((v) => v.toFixed(0)).join(",")}` +
    ` (${(e.hi[0] - e.lo[0]).toFixed(0)} long, ${(e.hi[1] - e.lo[1]).toFixed(0)} wide, ${(e.hi[2] - e.lo[2]).toFixed(0)} tall, ${e.massKg?.toFixed(0) ?? "—"} kg)`);
  console.log(`  DBG   frame  front ${FRAME.front.toFixed(0)} · tail ${FRAME.tail.toFixed(0)} · tubes y ${FRAME.lowY.toFixed(0)}/${FRAME.upY.toFixed(0)} · top ${FRAME.upZ.toFixed(0)} · floor ${FRAME.lowZfloor.toFixed(0)}`);
}

/** The subframe's tubes as a box, so a body that clears the engine clears them too. */
const FRAME_BOX: PackageBox = {
  name: "subframe-tubes",
  lo: [FRAME.front, -FRAME.upY - TUBE, FRAME.lowZfloor - TUBE],
  hi: [FRAME.tail, FRAME.upY + TUBE, FRAME.upZ + TUBE],
};

/**
 * WHAT DRIVES THE BODY, and it is not everything.
 *
 * The hard mechanical package: the frame, and the four things it is built
 * around. These are solids that must fit, so the body's tables are clamped to
 * them — put a taller engine in and the bonnet rises, which is the whole
 * point of the inversion.
 *
 * WHAT DOES NOT DRIVE IT, and why. Clamping the body to every placed part
 * produced a van on the E-Type and would here too. Two boxes stay out:
 *
 *   The OCCUPANT ARRAY is TWO rows and four people, spanning from the
 *   driver's heel to the rear chairs' heads — 2.3 metres of box whose top is
 *   a 95th-percentile male sitting bolt upright. The roof is drawn for
 *   exactly this reason, and the cabin lens reports the millimetres;
 *   clamping to the box would raise the roof to the erect-posture worst
 *   case at every station at once.
 *
 *   The SUSPENSION is a SWEPT volume — wheels through travel and lock, not
 *   a solid. A body is not required to enclose a swept volume; it is
 *   required to have arches over it, which the arch pass authors.
 *
 * Both are still REPORTED against, under `package vs styling`. Reporting a
 * demand and obeying it are different things, and only one of them turns a
 * car into a box.
 */
const DRIVING: PackageBox[] = [
  FRAME_BOX,
  ...parts.filter((q) => /engine-ice|cooling|transmission|driveline|fuel-tank/.test(q.name)),
];
/** Everything, for the report. */
const CONTAINED: PackageBox[] = [
  FRAME_BOX,
  ...parts.filter((q) => !q.name.includes("wheel-tire") && !q.name.startsWith("substrate")),
];

// ── 2. author the body ────────────────────────────────────────────────────
const s = createSession("Panoramic P2");
const side = { kind: "side" as const };

const LEN = P2_LENGTH, HW = P2_WIDTH / 2, FLOOR = 115, TOP = P2_HEIGHT;
/**
 * THE DOMES, and where the box sits because of them.
 *
 * The nose cap bows 90 mm forward of its own corners at the middle of the
 * face — its LOWER edge leading, 60 against the top's 40, which is as much
 * rake as a face whose corners share one x can wear — and the tail cap 56
 * aft, so the BOX is drawn one dome-depth in from
 * each tip and the domes reach the published length. Every master line runs
 * X0 to X1; every table below is still in body x from the nose tip, and
 * `profile` clamps outside its knots, so a table that starts at 0 is read
 * from X0 without complaint.
 */
const NOSE_DOME = { sign: -1 as const, top: 40, bottom: 60, side: 40 };
const TAIL_DOME = { sign: 1 as const, top: 30, bottom: 26, side: 28 };
const domeDepth = (d: { top: number; bottom: number; side: number }) => (d.top + d.bottom) / 2 + d.side;
const X0 = domeDepth(NOSE_DOME);
const X1 = LEN - domeDepth(TAIL_DOME);

s.apply("tape", {
  kind: "box",
  rect: { view: side, a: [X0, FLOOR], b: [X1, TOP], depth: HW * 2, at: -HW },
});
/**
 * The two end faces, remembered NOW while they are the only cells at one x.
 * After the domes go in there is no x-extent test that finds them, and after
 * the bands are cut there are five of them. A set built at birth survives
 * both.
 */
const capCells = new Set<Id>();
{
  for (const [id, cell] of s.state.cells) {
    const xs: number[] = [];
    for (const sd of cell.sides) {
      const c = s.state.curves.get(s.state.resolveCurve(sd.curveId));
      if (!c) continue;
      for (const t of [0, 0.5, 1]) xs.push(evalChain(c.chain, sd.t0 + (sd.t1 - sd.t0) * t)[0]);
    }
    if (Math.max(...xs) - Math.min(...xs) < 1) capCells.add(id as Id);
  }
  if (capCells.size !== 2) throw new Error(`expected 2 end faces, got ${capCells.size}`);
}

const ctrlsOf = (id: Id): [Pt3, Pt3, Pt3, Pt3] => {
  const c = s.state.curves.get(s.state.resolveCurve(id));
  if (!c) throw new Error(`no curve ${id}`);
  const seg = c.chain.segs[0];
  if (!seg) throw new Error(`curve ${id} has no segment`);
  return [seg.p0, seg.p1, seg.p2, seg.p3];
};
const setCtrl = (id: Id, idx: 0 | 1 | 2 | 3, to: Pt3): void => {
  const at = ctrlsOf(id)[idx];
  const d: Pt3 = [to[0] - at[0], to[1] - at[1], to[2] - at[2]];
  if (d[0] === 0 && d[1] === 0 && d[2] === 0) return;
  s.apply("push-pull", { target: { kind: "ctrl", id, seg: 0, idx }, delta: d });
};
const lerp3p = (a: Pt3, b: Pt3, t: number): Pt3 =>
  [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const straighten = (id: Id): void => {
  const [p0, , , p3] = ctrlsOf(id);
  setCtrl(id, 1, lerp3p(p0, p3, 1 / 3));
  setCtrl(id, 2, lerp3p(p0, p3, 2 / 3));
};
/** Fit a cubic through f(0), f(1/3), f(2/3), f(1). Ends first: moving a chain
 *  end is a weld event that drags every curve meeting there. */
const fitThrough = (id: Id, f: (t: number) => Pt3, endsToo = true): void => {
  const A = f(0), B = f(1 / 3), C = f(2 / 3), D = f(1);
  const p1: Pt3 = [0, 1, 2].map((k) =>
    3 * B[k]! - 1.5 * C[k]! - (5 / 6) * A[k]! + (1 / 3) * D[k]!) as unknown as Pt3;
  const p2: Pt3 = [0, 1, 2].map((k) =>
    3 * C[k]! - 1.5 * B[k]! - (5 / 6) * D[k]! + (1 / 3) * A[k]!) as unknown as Pt3;
  if (endsToo) {
    setCtrl(id, 0, A);
    setCtrl(id, 3, D);
  }
  setCtrl(id, 1, p1);
  setCtrl(id, 2, p2);
};
/** Set one control point of one SEGMENT of a chain. */
const setSegCtrl = (id: Id, seg: number, idx: 0 | 1 | 2 | 3, to: Pt3): void => {
  const c = s.state.curves.get(s.state.resolveCurve(id))!;
  const sg = c.chain.segs[seg];
  if (!sg) throw new Error(`no segment ${seg} of ${id}`);
  const at = [sg.p0, sg.p1, sg.p2, sg.p3][idx]!;
  const d: Pt3 = [to[0] - at[0], to[1] - at[1], to[2] - at[2]];
  if (d[0] === 0 && d[1] === 0 && d[2] === 0) return;
  s.apply("push-pull", { target: { kind: "ctrl", id, seg, idx }, delta: d });
};

/**
 * Fit a MULTI-segment chain, segment by segment, through a profile.
 *
 * Boundaries first and interiors after, for the same reason the single-segment
 * fitter does it: setting a segment's p0 also sets its neighbour's p3, so the
 * shared points have to settle before the interior ones are computed against
 * them.
 */
const fitChain = (id: Id, at: (seg: number, local: number) => Pt3): void => {
  const n = s.state.curves.get(s.state.resolveCurve(id))!.chain.segs.length;
  for (let j = 0; j < n; j++) setSegCtrl(id, j, 0, at(j, 0));
  setSegCtrl(id, n - 1, 3, at(n - 1, 1));
  for (let j = 0; j < n; j++) {
    const A = at(j, 0), B = at(j, 1 / 3), C = at(j, 2 / 3), D = at(j, 1);
    const p1 = [0, 1, 2].map((k) =>
      3 * B[k]! - 1.5 * C[k]! - (5 / 6) * A[k]! + (1 / 3) * D[k]!) as unknown as Pt3;
    const p2 = [0, 1, 2].map((k) =>
      3 * C[k]! - 1.5 * B[k]! - (5 / 6) * D[k]! + (1 / 3) * A[k]!) as unknown as Pt3;
    setSegCtrl(id, j, 1, p1);
    setSegCtrl(id, j, 2, p2);
  }
};

/**
 * Fit a multi-segment chain and have it come out SMOOTH.
 *
 * `fitChain` above fits each span independently through four samples of its
 * own stretch. Every span lands on its neighbour's endpoint — the chain is
 * watertight — and arrives there at whatever angle its own four samples
 * implied. The chain is C0 and nothing more: a tangent kink at every span
 * boundary, twelve of them down a beltline. That is the lumpiness you can see
 * from across the room and no probe in the file was measuring.
 *
 * This interpolates the same station points with a C2 CUBIC SPLINE instead —
 * one tridiagonal solve per run, natural at both ends — so position, tangent
 * AND curvature are continuous across every span boundary. A line then makes
 * as many moves as its table asks for and no more.
 *
 * CORNERS ARE DECLARED, not discovered, and each run between them is solved on
 * its own. An arch mouth is a real corner: the sill arrives at 33 degrees and
 * the quarter circle leaves at 79, and a spline that smoothed across it would
 * destroy both. Declaring it is the same principle as `crease`, one level
 * down — on the curve rather than on the surface.
 *
 * IT INTERPOLATES THE STATIONS AND NOTHING ELSE, except where told otherwise.
 * `fitChain` sampled each span at four points and so tracked the profile
 * BETWEEN stations; the spline reads only the station values. That is the
 * right trade now that `profile` is itself C2 — what happens between two
 * stations is the spline's business.
 *
 * EXCEPT ON A SPAN THAT IS A CIRCLE. The rocker's four arch spans are quarter
 * circles, and a quarter circle is a cubic through four of its own points to a
 * tenth of a millimetre; a spline through only its two ENDS is a chord with a
 * bulge and is not an arch. Those spans keep the four-point fit, and the runs
 * either side of them are solved separately — so the arc is exact, the sill is
 * C2, and the mouth between them is the corner it has always been.
 */
const fitChainSmooth = (
  id: Id,
  at: (seg: number, local: number) => Pt3,
  corners: readonly number[] = [],
  exact: readonly number[] = [],
): void => {
  const n = s.state.curves.get(s.state.resolveCurve(id))!.chain.segs.length;
  const P: Pt3[] = [];
  for (let j = 0; j <= n; j++) P.push(j < n ? at(j, 0) : at(n - 1, 1));

  // Runs between declared corners AND either side of every exact span. Each is
  // solved on its own with natural ends, so a corner keeps exactly the angle
  // the profile puts there and the stretches either side are each C2.
  const fixed = new Set(exact);
  const cut = new Set<number>([...corners]);
  for (const e of fixed) { cut.add(e); cut.add(e + 1); }
  const breaks = [0, ...[...cut].filter((b) => b > 0 && b < n).sort((a, b) => a - b), n];
  const M: Pt3[] = P.map(() => [0, 0, 0] as Pt3);
  for (let r = 0; r + 1 < breaks.length; r++) {
    const lo = breaks[r]!, hi = breaks[r + 1]!;
    const k = hi - lo;                       // spans in this run
    if (k === 1 && fixed.has(lo)) continue;  // an arc: fitted below, not splined
    if (k === 1) {
      // One span: the chord is the only slope there is.
      const d: Pt3 = [P[hi]![0] - P[lo]![0], P[hi]![1] - P[lo]![1], P[hi]![2] - P[lo]![2]];
      M[lo] = d; M[hi] = d;
      continue;
    }
    // The C2 tridiagonal on a uniform parameter, one component at a time.
    for (let c = 0; c < 3; c++) {
      const b: number[] = new Array(k + 1).fill(4);
      const rhs: number[] = new Array(k + 1).fill(0);
      b[0] = 2; b[k] = 2;
      rhs[0] = 3 * (P[lo + 1]![c]! - P[lo]![c]!);
      rhs[k] = 3 * (P[hi]![c]! - P[hi - 1]![c]!);
      for (let q = 1; q < k; q++) rhs[q] = 3 * (P[lo + q + 1]![c]! - P[lo + q - 1]![c]!);
      const cUp: number[] = new Array(k + 1).fill(1);
      for (let q = 1; q <= k; q++) {
        const w = 1 / b[q - 1]!;
        b[q] = b[q]! - w * cUp[q - 1]!;
        rhs[q] = rhs[q]! - w * rhs[q - 1]!;
      }
      const out: number[] = new Array(k + 1).fill(0);
      out[k] = rhs[k]! / b[k]!;
      for (let q = k - 1; q >= 0; q--) out[q] = (rhs[q]! - cUp[q]! * out[q + 1]!) / b[q]!;
      for (let q = 0; q <= k; q++) M[lo + q]![c] = out[q]!;
    }
  }

  // Boundaries first, then interiors — setting a span's p0 also sets its
  // neighbour's p3, so the shared points settle before anything is computed
  // against them. Same order and same reason as `fitChain`.
  for (let j = 0; j < n; j++) setSegCtrl(id, j, 0, P[j]!);
  setSegCtrl(id, n - 1, 3, P[n]!);
  for (let j = 0; j < n; j++) {
    if (fixed.has(j)) {
      // The four-point fit, exactly as `fitChain` does it — three parts in ten
      // thousand on a quarter circle, which is 0.1 mm on an arch this size.
      const A = at(j, 0), B = at(j, 1 / 3), C = at(j, 2 / 3), D = at(j, 1);
      const p1 = [0, 1, 2].map((c) =>
        3 * B[c]! - 1.5 * C[c]! - (5 / 6) * A[c]! + (1 / 3) * D[c]!) as unknown as Pt3;
      const p2 = [0, 1, 2].map((c) =>
        3 * C[c]! - 1.5 * B[c]! - (5 / 6) * D[c]! + (1 / 3) * A[c]!) as unknown as Pt3;
      setSegCtrl(id, j, 1, p1);
      setSegCtrl(id, j, 2, p2);
      continue;
    }
    const A = P[j]!, B = P[j + 1]!, MA = M[j]!, MB = M[j + 1]!;
    setSegCtrl(id, j, 1, [A[0] + MA[0] / 3, A[1] + MA[1] / 3, A[2] + MA[2] / 3]);
    setSegCtrl(id, j, 2, [B[0] - MB[0] / 3, B[1] - MB[1] / 3, B[2] - MB[2] / 3]);
  }
};

const curveMean = (id: Id): Pt3 => {
  const c = s.state.curves.get(s.state.resolveCurve(id));
  if (!c) throw new Error(`no curve ${id}`);
  let x = 0, y = 0, z = 0;
  const ts = [0, 0.25, 0.5, 0.75, 1];
  for (const t of ts) { const p = evalChain(c.chain, t); x += p[0]; y += p[1]; z += p[2]; }
  return [x / ts.length, y / ts.length, z / ts.length];
};

// ── the two master lines, and this car's third ────────────────────────────
// A GT's character is a WEDGE and a FALL: a beltline that rises the whole
// length of the car from a low wing edge to a high deck shoulder, a sill
// that runs level under it, and a roofline that climbs to the header rail
// and then never stops falling until the ducktail. The M3 held its roof for
// a fifth of the car because four people sat under it; this car seats four
// too and gives the rear pair a reclined chair under the fall instead.
const track = (a: number, b: number, c: number, d: number) =>
  (t: number): number => [a, b, c, d][Math.round(t * 3)]!;

// The four numbers are STATIONS, not extremes, and a cubic forced through
// them overshoots between them — so the widest point of the car is at no
// station at all. The table says what the car should be and the SCRIPT solves
// for what to type: sample the fitted cubic, find its peak, and scale the
// plan tables until the peak is the published half-width.
const HALF_WIDTH = HW;                     // 1817 mm overall, surveyed
const bezierAt = (a: number, b: number, c: number, d: number, t: number): number => {
  const p1 = 3 * b - 1.5 * c - (5 / 6) * a + (1 / 3) * d;
  const p2 = 3 * c - 1.5 * b - (5 / 6) * d + (1 / 3) * a;
  const u = 1 - t;
  return u * u * u * a + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * d;
};
const peakOf = (v: readonly [number, number, number, number]): number => {
  let m = 0;
  for (let i = 0; i <= 400; i++) m = Math.max(m, Math.abs(bezierAt(v[0], v[1], v[2], v[3], i / 400)));
  return m;
};
// Four stations at X0, one third, two thirds and X1. The shoulder and the
// rocker run nearly parallel in plan — the body side is one wall — and the
// rocker only beats the shoulder over the arches, where the flares live.
const SHOULDER_Y = [600, 928, 932, 760] as const;
const ROCKER_Y = [640, 934, 940, 740] as const;
const planScale = HALF_WIDTH / Math.max(peakOf(SHOULDER_Y), peakOf(ROCKER_Y));
const scaled = (v: readonly [number, number, number, number]) =>
  track(v[0] * planScale, v[1] * planScale, v[2] * planScale, v[3] * planScale);

const shoulderY = scaled(SHOULDER_Y);
// The beltline climbs the whole way — wing edge to door top to deck
// shoulder — 250 mm of rise over the length, which is the wedge.
const shoulderZ = track(660, 830, 895, 850);
const rockerY = scaled(ROCKER_Y);
const rockerZ = track(200, 140, 140, 300);

/**
 * A table lookup that is C1 at its knots AND ARRIVES AT THEM WITH A SLOPE.
 *
 * Every plan and height profile below is one of these, and the first version
 * was a per-span smoothstep, which is where the E-Type's worst defect came
 * from. Smoothstep is FLAT at both ends of every span by construction. Put a
 * knot at a wheel-arch mouth and the sill leaves it horizontally — while the
 * arch arrives at seventy-nine degrees, because a quarter circle at its mouth
 * is nearly vertical. Eight corners at 87 degrees out of plane, one at every
 * mouth of every arch, and a 53 mm bulge where the tangent field tried to
 * blend across them. Nothing in the station table was wrong; the interpolator
 * was.
 *
 * So: monotone cubic (Fritsch–Carlson), which passes through every knot,
 * never overshoots between them — a plan table must not invent width the
 * author did not ask for — and carries the secant slope THROUGH a knot when
 * the data is going somewhere. A knot placed close to an arch mouth now
 * genuinely steepens the approach, which is what lets a sill curl into a lip.
 */
const profile = (T: readonly (readonly [number, number])[]) => {
  const n = T.length;
  const xs = T.map((p) => p[0]), ys = T.map((p) => p[1]);
  // Secants, then slopes: zero where the data turns, harmonic mean where it
  // does not. That is the whole of Fritsch–Carlson and it is what forbids the
  // overshoot a plain Catmull-Rom would give at the nose.
  const h: number[] = [], d: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    h.push(xs[i + 1]! - xs[i]!);
    d.push((ys[i + 1]! - ys[i]!) / (xs[i + 1]! - xs[i]!));
  }
  // ── the slopes, and this is where a line stops looking hand-drawn ────────
  //
  // FRITSCH–CARLSON IS C1 AND THAT IS THE WHOLE PROBLEM. Its slope rule — the
  // harmonic mean of the two secants — passes through every knot, never
  // overshoots, and leaves the SECOND derivative free to jump at each one. A
  // beltline with twenty-two knots therefore carries twenty-two curvature
  // steps, and the curvature comb read variation 6.3 with twenty-six turns on
  // a line that makes three moves. Nothing was wrong with any number in the
  // table; the interpolator was lumpy between them.
  //
  // So: solve the C2 cubic spline first — one tridiagonal system, natural at
  // both ends, curvature continuous everywhere by construction — and then
  // FILTER the slopes back to the monotonicity bound wherever the data is
  // monotone. Where the filter does not bite the line is C2; where it does it
  // falls back to exactly what it was. That keeps the property the arches need
  // (a plan table must not invent width the author did not ask for) and buys
  // curvature continuity everywhere else, which is most of a car.
  const m: number[] = new Array(n).fill(0);
  {
    const a: number[] = new Array(n).fill(0);
    const b: number[] = new Array(n).fill(0);
    const c: number[] = new Array(n).fill(0);
    const r: number[] = new Array(n).fill(0);
    b[0] = 2; c[0] = 1; r[0] = 3 * d[0]!;
    for (let i = 1; i < n - 1; i++) {
      a[i] = h[i]!;
      b[i] = 2 * (h[i - 1]! + h[i]!);
      c[i] = h[i - 1]!;
      r[i] = 3 * (h[i]! * d[i - 1]! + h[i - 1]! * d[i]!);
    }
    a[n - 1] = 1; b[n - 1] = 2; r[n - 1] = 3 * d[n - 2]!;
    // Thomas: forward sweep, back substitution. The system is diagonally
    // dominant for any strictly increasing knots, so no pivoting.
    for (let i = 1; i < n; i++) {
      const w = a[i]! / b[i - 1]!;
      b[i] = b[i]! - w * c[i - 1]!;
      r[i] = r[i]! - w * r[i - 1]!;
    }
    m[n - 1] = r[n - 1]! / b[n - 1]!;
    for (let i = n - 2; i >= 0; i--) m[i] = (r[i]! - c[i]! * m[i + 1]!) / b[i]!;
  }
  // The Hyman filter: zero at a turn, and never steeper than three times the
  // shallower neighbouring secant. This is the Fritsch–Carlson condition
  // stated as a bound rather than as a formula, so a C2 slope that already
  // satisfies it is left exactly alone.
  const limit = (v: number, lo: number, hi: number): number =>
    v < lo ? lo : v > hi ? hi : v;
  for (let i = 0; i < n; i++) {
    const dl = i > 0 ? d[i - 1]! : d[0]!;
    const dr = i < n - 1 ? d[i]! : d[n - 2]!;
    if (dl * dr <= 0) { m[i] = 0; continue; }
    const cap = 3 * Math.min(Math.abs(dl), Math.abs(dr));
    m[i] = dl > 0 ? limit(m[i]!, 0, cap) : limit(m[i]!, -cap, 0);
  }
  return (x: number): number => {
    if (x <= xs[0]!) return ys[0]!;
    if (x >= xs[n - 1]!) return ys[n - 1]!;
    let i = 0;
    while (i < n - 2 && xs[i + 1]! < x) i++;
    const t = (x - xs[i]!) / h[i]!;
    const t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * ys[i]!
      + (t3 - 2 * t2 + t) * h[i]! * m[i]!
      + (-2 * t3 + 3 * t2) * ys[i + 1]!
      + (t3 - t2) * h[i]! * m[i + 1]!;
  };
};

// ── the roof rail: the seam a closed car has and an open one does not ─────
// Four master lines describe a body as a rocker, a beltline and one surface
// over the top between them. That is enough for a roadster, whose top IS a
// separate assembly, and it is not enough here: with one band from beltline
// to beltline the windscreen cannot be told from the roof above the driver's
// shoulder, because they are the same cell. Every closed car has a third
// longitudinal seam and this is it.
//
// On this car the band the two cuts enclose changes what it IS three times
// and stays one surface throughout, which is the strongest case yet for the
// seam being real rather than a modelling convenience. Ahead of the cowl it
// is the nose panel between the wing crowns — the valley the F1 has and the
// E-Type has and a MX-5 does not. Through the cabin it is screen, roof and
// backlight. Behind the rear bulkhead it is the engine cover, with the intake
// snorkel standing on its centreline. Three panels, one band, one continuous
// piece of geometry.
//
// The cuts go in FIRST, on the box, before a control point has moved. Cutting
// after shaping is what opens a print mesh, and the arches four hundred lines
// down are the same rule stated again.
const RAIL_Y0 = HW * 0.56;
{
  const topFace = ([...s.state.cells.keys()] as Id[]).reduce((best, id) => {
    const meanZ = (cid: Id): number => {
      const cell = s.state.cells.get(cid)!;
      let z = 0, n = 0;
      for (const sd of cell.sides) {
        const c = s.state.curves.get(s.state.resolveCurve(sd.curveId));
        if (!c) continue;
        for (const t of [0, 0.5, 1]) { z += evalChain(c.chain, sd.t0 + (sd.t1 - sd.t0) * t)[2]; n++; }
      }
      return z / n;
    };
    return meanZ(id) > meanZ(best) ? id : best;
  });
  for (const y of [RAIL_Y0, -RAIL_Y0]) {
    s.apply("tape", {
      kind: "line",
      line: { view: { kind: "plan" as const }, a: [-40, y], b: [LEN + 40, y], lineClass: "tape" },
      targets: [topFace],
    });
  }
}

// The body is authored on BOTH sides, so it must not also be MIRRORED. A cell
// left on "auto" gets a twin generated whenever its reflection is not already
// present to the quantiser's precision — and the moment anything makes the two
// flanks differ by a hair, half the car is silently duplicated on top of
// itself. That is what the "768 edges" attributed to the beltline actually
// was. Detaching the six box faces before any cut puts the whole body outside
// the mirror law by descent; the wheels, which ARE authored one side only,
// stay on it.
for (const id of [...s.state.cells.keys()] as Id[]) s.apply("mirror-detach", { cellId: id });

const longEdges = [...s.state.curves.keys()].filter((id) => {
  const c = s.state.curves.get(id as Id)!;
  const a0 = evalChain(c.chain, 0), a1 = evalChain(c.chain, 1);
  return Math.abs(a1[0] - a0[0]) > LEN * 0.9;
}) as Id[];
if (longEdges.length !== 6) throw new Error(`expected 6 long edges, got ${longEdges.length}`);
// Three kinds, told apart by where the BOX put them: the rockers are low, and
// of the four high ones the rails are the pair the plan cuts made inboard of
// the corners. Nothing has moved yet, so this is exact rather than a guess.
const railY0 = track(RAIL_Y0 * 0.72, RAIL_Y0 * 0.99, RAIL_Y0 * 0.87, RAIL_Y0 * 0.74);
const railZ0 = track(670, 900, 1380, 930);
for (const id of longEdges) {
  const m = curveMean(id);
  const sign = m[1] >= 0 ? 1 : -1;
  const low = m[2] < (FLOOR + TOP) / 2;
  const rail = !low && Math.abs(m[1]) < HW * 0.9;
  const yOf = low ? rockerY : rail ? railY0 : shoulderY;
  const zOf = low ? rockerZ : rail ? railZ0 : shoulderZ;
  const a0 = evalChain(s.state.curves.get(s.state.resolveCurve(id))!.chain, 0);
  const forward = a0[0] < LEN / 2;
  fitThrough(id, (t) => {
    const u = forward ? t : 1 - t;
    return [X0 + u * (X1 - X0), sign * yOf(u), zOf(u)];
  });
}
for (const id of [...s.state.curves.keys()] as Id[]) {
  if (!longEdges.includes(id)) straighten(id);
}

// ── the wheel arches, cut into the rocker BEFORE anything is cut ──────────
// Order matters and it is the whole lesson of this build. Shaping a shared
// curve AFTER its cells have been cut opens the print mesh — a box with two
// tape cuts and one control point moved a tenth of a millimetre loses 138
// edges, split or not, and `packages/mesh/test/split-move.test.ts` records it
// with `it.fails` so the day it is fixed the suite says so.
//
// So the arch goes in first. `place-point` gives the rocker a segment boundary
// at each arch mouth and crown while it is still one uncut curve, and then
// every segment is fitted to its own piece of the profile: a quarter circle
// over each wheel, the sill in between. By the time the stations are cut the
// arches are already there, and nothing has to move afterwards.
//
// AND THE TWO ARCHES ARE NOT THE SAME ARCH: the rear arc is 14 mm larger in
// radius, its centre 14 higher, its mouths 28 further apart, and its lip 25
// mm further out — the rear track is 10 wider AND the tyre 40 wider, so both
// facts point the same way on this car where on the M3 they fought.
const FRONT_LIP = P2_FRONT_TRACK / 2 + P2_FRONT_TIRE_WIDTH / 2 + ARCH_LIFT;
const REAR_LIP = P2_REAR_TRACK / 2 + P2_REAR_TIRE_WIDTH / 2 + ARCH_LIFT;
const FRONT_AXLE_Z = FRONT_WHEEL_R;
const REAR_AXLE_Z = REAR_WHEEL_R;
const [fA, fB] = archMouth(FRONT_AXLE_X, FRONT_ARCH_HALF);
const [rA, rB] = archMouth(REAR_AXLE_X, REAR_ARCH_HALF);
const ARCH_X = [X0, fA, FRONT_AXLE_X, fB, rA, REAR_AXLE_X, rB, X1];

/**
 * The spans the ROCKER is fitted on, and there are eleven where there were
 * seven.
 *
 * The arch stations are load-bearing — segments 2, 3, 7 and 8 below ARE the
 * four quarter circles, and a quarter circle is a cubic to a tenth of a
 * millimetre — so they cannot move. What the seven-span version had no room
 * for was the SILL: 2004 mm from the front arch mouth to the rear one, carried
 * by one cubic, over a table that drops 234 mm and comes back. It undershot
 * its own floor by 33 mm and put a smile under the car.
 *
 * Four extra knots, none of them near an arch, and the arcs keep their spans.
 */
const ROCKER_X = [
  X0, 300, fA, FRONT_AXLE_X, fB, 1420, 1780, 2800, 3400, rA, REAR_AXLE_X, rB, 4650, X1,
];
/** Which of those spans are the quarter circles, derived rather than typed. */
const ARC_SPANS = [
  ROCKER_X.indexOf(fA), ROCKER_X.indexOf(FRONT_AXLE_X),
  ROCKER_X.indexOf(rA), ROCKER_X.indexOf(REAR_AXLE_X),
];

/**
 * Half-width of the rocker at station x — the plan a real sill has.
 *
 * THE TYRE IS THE FLOOR UNDER THIS TABLE and it is the tightest fit in the
 * repository. The front tyre's outer face is at 901.5 mm and the body is 910
 * half-width: eight and a half millimetres, of which the arch lip takes six.
 * The lip therefore cannot be pinned across the whole mouth the way the
 * E-Type's is — at fA it would stand a hundred millimetres proud of a nose
 * that is only 399 mm long — so it holds the tyre's own span and tapers out
 * of it at both ends, which is what a front wing actually does.
 */
const rockerPlanY = profile([
  // ITS KNOTS ARE THE CHAIN'S SPANS — the F1's rule, kept. The only knots
  // that are NOT span ends are inside the arch spans — 700, 1150, 3700,
  // 4150 — and those are read by the arcs' own four-point fit, which is what
  // keeps each tyre inside its own lip.
  // A PROW: the cap's corners sit at 660 and the sill is out to 880 within
  // 220 mm, which with the 77 mm dome is a nose that rounds in plan the way
  // every nose does and no box has.
  [0, 640], [300, 875], [fA, 925],
  [700, 946], [FRONT_AXLE_X, FRONT_LIP], [1150, 947], [fB, 930],
  // THE TUCK. The sill sits 38 mm inboard of the door's widest line, so the
  // flank is a surface light falls off rather than a wall — the M3's 10 mm
  // read as a slab, and this car is meant to be looked at down its side.
  [1420, 895], [1780, 882], [2800, 880], [3400, 895],
  [rA, 940], [3700, 972], [REAR_AXLE_X, REAR_LIP], [4150, 973], [rB, 950],
  [4650, 870], [LEN, 720],
]);
/** Height of the rocker where it is a sill rather than an arch. */
const FRONT_MOUTH_Z = FRONT_AXLE_Z + FRONT_ARCH_R * Math.sin(ARCH_END);
const REAR_MOUTH_Z = REAR_AXLE_Z + REAR_ARCH_R * Math.sin(ARCH_END);
const rockerSillZ = profile([
  // MONOTONE INTO EACH ARCH AND OUT OF THE TAIL — the F1's hard-won rule —
  // and STEEP where it meets each mouth: an arch FLANGE that drops from the
  // mouth to the sill in 120 mm, and a low sill running level between the
  // flanges. The knots at 1420 and 3400 are those flanges, and they are chain
  // span ends because the M3's rule says they must be. The nose is the
  // splitter's lower edge at 200 and the tail the diffuser's at 300.
  [0, 200], [300, 175], [fA, FRONT_MOUTH_Z],
  [fB, FRONT_MOUTH_Z], [1420, 150], [1780, 140], [2800, 138], [3400, 150], [rA, REAR_MOUTH_Z],
  [rB, REAR_MOUTH_Z], [4650, 285], [LEN, 300],
]);

/**
 * The beltline's plan.
 *
 * A WAIST OF TWENTY-SIX: the doors pull in between the flares — the scallop
 * a side view shows as shadow — and then the HIPS swell past everything, 972
 * at the rear axle against 936 at the front. Widest at the back, the plan
 * fact the brief put first.
 */
const shoulderPlanY = profile([
  [0, 600], [300, 855], [fA, 918], [FRONT_AXLE_X, 936], [fB, 928],
  [1650, 918], [2100, 910], [2800, 912],
  [rA, 950], [REAR_AXLE_X, 972], [rB, 962], [4650, 890], [LEN, 730],
]);

/**
 * The roof rail's plan and height — the third master line.
 *
 * PLAN pulls in through the greenhouse — 560 at the cowl to 466 over the
 * B-pillar, the tumblehome of a GT whose glass leans in hard — and flares
 * OUT over the fastback, so the backlight wraps toward the hips and the
 * deck's shoulders are wide enough for the lamp band to run between them.
 *
 * HEIGHT is the fastback in one table: a bonnet that climbs steadily, a
 * screen at 32 degrees, a peak at the header rail, and then ONE FALL — 440
 * mm of it over 2.4 m, through the roof, the backlight and the deck — to a
 * ducktail that kicks 22 mm at the last station. No hold anywhere.
 */
const railPlanY = profile([
  [0, 400], [300, 490], [fA, 530], [FRONT_AXLE_X, 552], [fB, 560],
  [1650, 556], [1780, 548], [2100, 515], [2450, 480], [2800, 466],
  // THE BACKLIGHT WRAPS. Aft of the roof the rails flare out toward the
  // hips — 478 at the roof's trailing edge to 690 over the rear arch — so
  // the glass is wide and the C-pillars are blades rather than sails.
  [3100, 470], [3300, 478], [rA, 550], [3820, 640], [REAR_AXLE_X, 680],
  [rB, 690], [4650, 650], [LEN, 560],
]);
const railZdrawn = profile([
  // A TALL BONNET, for two reasons that both live under it: a 500 kW V8
  // with its radiator (the first draft drew 715 at the arch mouth and the
  // package lifted it 48), and a 712 mm tyre whose arch crowns at 742 — the
  // first draft's beltline was 730 there and the lip broke through it.
  [0, 670], [300, 715], [fA, 775], [FRONT_AXLE_X, 830], [fB, 850],
  // The cowl, then the screen: 440 mm of rise in 800 of length, which is
  // the long fast screen a GT wears.
  [1650, 890], [1780, 935], [2100, 1160], [2450, 1362],
  // The peak over the header rail — drawn 16 under the brief's 1400,
  // because the C2 spline and the crown put the built roof there — and the
  // fall begins at once.
  [2800, 1384], [3100, 1348],
  // The backlight, the deck, the ducktail: the fall never stops, and the
  // last knot kicks back up so the tail edge reads as a lip.
  [3300, 1290], [rA, 1200], [3820, 1090], [REAR_AXLE_X, 1040],
  [rB, 950], [4650, 900], [LEN, 892],
]);

/**
 * The roof rail, RAISED wherever the package needs more than was drawn.
 *
 * This is the inversion, in one function. `railZdrawn` is what a person
 * typed; `packageAt` is what the car contains at that station; the line the
 * body is built on is the larger.
 *
 * AND ON THIS CAR IT POINTS BACKWARDS. Every previous use of it raised a
 * BONNET, because every previous car had its engine under one. Here the
 * engine is behind the cabin, so the station the package can win is the
 * REAR DECK — the same four links, aimed the other way, with nothing in the
 * chain that knew which way it was facing.
 */
const railZ = (x: number): number => Math.max(railZdrawn(x), packageAt(DRIVING, x).top);

/** How much of the roofline is the package's doing rather than the styling's. */
const packageLift = (x: number): number => railZ(x) - railZdrawn(x);

/**
 * The beltline's HEIGHT. It must stay BELOW `railZ` everywhere or the side
 * band turns inside out — and the margin between them IS the side glass
 * through the cabin: 330 mm at the driver's shoulder, 75 at the tail.
 */
const shoulderZprofile = profile([
  // OVER EACH ARCH IT IS PINNED ABOVE THE CROWN — 790 at the front axle over
  // a crown at 742, 915 at the rear over 770 — and between them it does the
  // one thing a GT beltline does: rises, the whole way, wing edge to door top
  // to deck shoulder, and only eases in the last 300 mm of deck. It stays
  // under the rail by 60 at the tail, which is the height of the lamp band's
  // sail beside it.
  [0, 660], [300, 690], [fA, 740], [FRONT_AXLE_X, 790], [fB, 815],
  [1650, 850], [2100, 875], [2800, 900],
  [rA, 915], [REAR_AXLE_X, 925], [rB, 895], [4650, 855], [LEN, 838],
]);

const rockerIds = longEdges.filter((id) => curveMean(id)[2] < (FLOOR + TOP) / 2);
const highIds = longEdges.filter((id) => curveMean(id)[2] >= (FLOOR + TOP) / 2);
// The rails are the inboard pair of the four high lines. Sorting by |y| is
// what tells them from the beltline now that both have been fitted and
// neither is at the box corner any more.
const byY = [...highIds].sort((a, b) => Math.abs(curveMean(a)[1]) - Math.abs(curveMean(b)[1]));
const railIds = byY.slice(0, 2);
const shoulderIds = byY.slice(2);
if (rockerIds.length !== 2) throw new Error(`expected 2 rockers, got ${rockerIds.length}`);
if (shoulderIds.length !== 2) throw new Error(`expected 2 shoulders, got ${shoulderIds.length}`);
if (railIds.length !== 2) throw new Error(`expected 2 roof rails, got ${railIds.length}`);

/**
 * The spans the BELTLINE and the ROOF RAIL are fitted on.
 *
 * The F1 proved seven is not enough the hard way — one 1960 mm span holding
 * a cowl, a screen, the top of the car and a fall overshot 92 mm — and a
 * fastback's rail carries as many events as a sedan's: bonnet rise, screen,
 * the peak, a fall that has to stay one curve for two metres, the ducktail.
 * Seventeen spans, every boundary a station, asserted below.
 */
/**
 * The BELTLINE's own spans, and it does not want the roof rail's.
 *
 * They shared a list because they are fitted by the same pass, and the rail
 * needs stations through the screen — 1620 and 2144 — that the beltline runs
 * straight past. Two spare spans on a line that makes three moves is two spare
 * curvature events, and the comb counted them.
 */
const SHOULDER_X = [
  X0, 300, fA, FRONT_AXLE_X, fB,
  1650, 2100, 2800,
  rA, REAR_AXLE_X, rB, 4650, X1,
];

const SPAN_X = [
  X0, 300, fA, FRONT_AXLE_X, fB,
  1650, 1780, 2100, 2450, 2800, 3100, 3300,
  rA, 3820, REAR_AXLE_X, rB, 4650, X1,
];

/** Give a master line a segment boundary at every station in `xs`. */
const segmentAt = (id: Id, forward: boolean, xs: readonly number[] = ARCH_X): void => {
  for (const x of xs.slice(1, -1)) {
    const ch = s.state.curves.get(s.state.resolveCurve(id))!.chain;
    let lo = 0, hi = 1;
    for (let i = 0; i < 60; i++) {
      const mid = 0.5 * (lo + hi);
      if ((evalChain(ch, mid)[0]! < x) === forward) lo = mid; else hi = mid;
    }
    s.apply("place-point", { curveId: id, t: 0.5 * (lo + hi) });
  }
};

// ── the beltline, on the same seven spans ─────────────────────────────────
// One cubic through four stations cannot be 150 mm wide at the nose aperture
// AND out to full width by the front axle. It was 749 mm where the arch lip
// has to be 807, so the car came out widest at its SILL, with a skirt hanging
// out under the doors. A car is widest at its shoulder; seven spans is what
// lets it be, and `shoulderPlanY` above is that plan.
//
// It goes in HERE, beside the rocker and before any cut, for the reason the
// whole file turns on: shaping a shared curve after its cells are cut opens
// the print mesh. An earlier attempt put this after the stations and lost 768
// edges, which read as a second defect and was the same one.
//
// The HEIGHT is not re-authored — it is sampled off the cubic that is already
// there and handed back unchanged, so this move is a plan change and nothing
// else. Typing a new z table would have made two changes and left the report
// unable to say which one did what.
for (const shoulder of shoulderIds) {
  const sign = Math.sign(curveMean(shoulder)[1]) || 1;
  const chain0 = s.state.curves.get(s.state.resolveCurve(shoulder))!.chain;
  const forward = evalChain(chain0, 0)[0]! < evalChain(chain0, 1)[0]!;
  segmentAt(shoulder, forward, SHOULDER_X);
  const n = s.state.curves.get(s.state.resolveCurve(shoulder))!.chain.segs.length;
  if (n !== SHOULDER_X.length - 1) {
    throw new Error(`shoulder has ${n} segments, expected ${SHOULDER_X.length - 1}`);
  }
  fitChainSmooth(shoulder, (seg, local) => {
    const j = forward ? seg : n - 1 - seg;
    const k = forward ? local : 1 - local;
    const x = SHOULDER_X[j]! + (SHOULDER_X[j + 1]! - SHOULDER_X[j]!) * k;
    return [x, sign * shoulderPlanY(x), shoulderZprofile(x)];
  });
}

// THE ROOF RAIL, on the same seven spans and for the same reason. Its profile
// climbs 660 mm from the nose to the crown and falls 470 to the tail; no one
// cubic goes near that. It is fitted after the beltline and before any cut,
// which is the same window everything else here uses.
for (const rail of railIds) {
  const sign = Math.sign(curveMean(rail)[1]) || 1;
  const chain0 = s.state.curves.get(s.state.resolveCurve(rail))!.chain;
  const forward = evalChain(chain0, 0)[0]! < evalChain(chain0, 1)[0]!;
  segmentAt(rail, forward, SPAN_X);
  const n = s.state.curves.get(s.state.resolveCurve(rail))!.chain.segs.length;
  if (n !== SPAN_X.length - 1) throw new Error(`roof rail has ${n} segments, expected ${SPAN_X.length - 1}`);
  fitChainSmooth(rail, (seg, local) => {
    const j = forward ? seg : n - 1 - seg;
    const k = forward ? local : 1 - local;
    const x = SPAN_X[j]! + (SPAN_X[j + 1]! - SPAN_X[j]!) * k;
    return [x, sign * railPlanY(x), railZ(x)];
  });
}

for (const rocker of rockerIds) {
  const sign = Math.sign(curveMean(rocker)[1]) || 1;
  const chain0 = s.state.curves.get(s.state.resolveCurve(rocker))!.chain;
  const forward = evalChain(chain0, 0)[0]! < evalChain(chain0, 1)[0]!;

  segmentAt(rocker, forward, ROCKER_X);
  const n = s.state.curves.get(s.state.resolveCurve(rocker))!.chain.segs.length;
  if (n !== ROCKER_X.length - 1) {
    throw new Error(`rocker has ${n} segments, expected ${ROCKER_X.length - 1}`);
  }

  // Per axle, because the two arches are different sizes. `r` and `z` travel
  // with the entry rather than being read off one module-level constant, and
  // that is the whole of what a second wheel diameter costs the arch pass.
  const F = { axleX: FRONT_AXLE_X, r: FRONT_ARCH_R, z: FRONT_AXLE_Z };
  const R = { axleX: REAR_AXLE_X, r: REAR_ARCH_R, z: REAR_AXLE_Z };
  const arcOf = new Map<number, { axleX: number; r: number; z: number; from: number; to: number }>([
    [ARC_SPANS[0]!, { ...F, from: Math.PI - ARCH_END, to: Math.PI / 2 }],
    [ARC_SPANS[1]!, { ...F, from: Math.PI / 2, to: ARCH_END }],
    [ARC_SPANS[2]!, { ...R, from: Math.PI - ARCH_END, to: Math.PI / 2 }],
    [ARC_SPANS[3]!, { ...R, from: Math.PI / 2, to: ARCH_END }],
  ]);
  // The four arch mouths are corners and are declared as such; the axle
  // boundaries inside each arch are not — a quarter circle runs through them.
  const mouths = [fA, fB, rA, rB]
    .map((x) => ROCKER_X.indexOf(x))
    .map((j) => (forward ? j : n - j));
  // THE FLANGE SPANS ARE EXACT TOO, and the reason is a trap the F1 never
  // hit: `fitChainSmooth` splines x as well as z, and a C2 x-spline through
  // spans whose lengths differ by 7:1 — 650 mm of sill against the 95 mm
  // flange beside it — overshoots 42 mm in x and comes back. The station cut
  // then crosses the curve at the overshoot instead of the station, the
  // claim lands 42 mm off, and the rocker split refuses by name. A span
  // fitted through four samples of its own linear-x stretch cannot overshoot
  // in x, which the four arch arcs already relied on without saying so.
  const flanges = [ROCKER_X.indexOf(fB), ROCKER_X.indexOf(3400)];
  // AND THE TWO END SPANS. The prow flares from 640 to 875 in 210 mm and
  // the tail tucks from 870 to 720 in 244; a C2 spline through either
  // stretch overshoots the plan by 22 mm at the nose and 13 at the tail —
  // the line audit found both — where the four-point fit of the profile,
  // which cannot overshoot, follows the table to a tenth of a millimetre.
  const endSpans = [0, ROCKER_X.length - 2];
  fitChainSmooth(rocker, (seg, local) => {
    const j = forward ? seg : n - 1 - seg;
    const k = forward ? local : 1 - local;
    const arc = arcOf.get(j);
    if (arc) {
      // A cubic fits 90 degrees to three parts in ten thousand: 0.1 mm here,
      // the same construction and the same figure as the wheels themselves.
      const a = arc.from + (arc.to - arc.from) * k;
      const x = arc.axleX + arc.r * Math.cos(a);
      return [x, sign * rockerPlanY(x), arc.z + arc.r * Math.sin(a)];
    }
    const x = ROCKER_X[j]! + (ROCKER_X[j + 1]! - ROCKER_X[j]!) * k;
    return [x, sign * rockerPlanY(x), rockerSillZ(x)];
  }, mouths, [...ARC_SPANS, ...flanges, ...endSpans]);
}

// ── the frame, as numbers, hoisted ────────────────────────────────────────
// These belong to the chassis block four hundred lines down and are read here
// because the BODY has to know where the frame is. That is the whole of the
// yin and yang: a floor that does not know the rail height is a floor that
// happens to be near one.
const sub = p2Config.substrate;
const RAIL_Y = sub.railSpacing.value / 2;
const RAIL_H = sub.railSectionHeight.value, RAIL_W = sub.railSectionWidth.value;
const RAIL_Z = p2Config.placement.railHeight.value;
/** Top face of a rail — what a floor pan would land on. */
const RAIL_TOP = RAIL_Z + RAIL_H / 2;
/** Pad plan size, and the least daylight a pad is worth making. */
const MOUNT_PAD = 90, MOUNT_H = 12;
/** Stations with a crossmember, and so the candidates for a body mount. */
const MOUNT_X = [1650, 2800, 3620];
/**
 * Top of the transmission tunnel — and for the first time in this
 * repository, a transmission is actually IN it. The gearbox's tail and the
 * propshaft run down this tunnel to the diff, the exhaust beside them,
 * which is what the config's 240 x 190 section is sized by. The E-Type's
 * tunnel wrapped a bellhousing; the F1's was a rib carrying a loom; this
 * one is the thing the field was named for.
 */
const TUNNEL_TOP = RAIL_Z - RAIL_H / 2 + sub.tunnelHeight.value;

/**
 * Where the body lands on the frame: rail top plus the mount's own height.
 *
 * THE FLOOR PAN IS THIS NUMBER. It is what makes the two halves one object —
 * the `floor` column of the station table through the cabin is set from it
 * rather than typed, so moving the rails moves the body's floor and the lens
 * that checks the two agree cannot be quietly wrong.
 *
 * It is the CENTRELINE floor, and that is not the same as the floor over a
 * rail. The underbody is an arch: its crown is this number and it falls away
 * to the rockers, so at the rail's own y it reads twelve to thirty
 * millimetres lower — which was enough to slice the top off the cowl
 * crossmember and stand five structure points out in the open air. The arch
 * is measured and corrected for below, at `clearTheRails`, rather than being
 * guessed at here with a bigger number.
 */
const PAD_TOP = RAIL_TOP + MOUNT_H;

// ── the cross curves, straightened AGAIN ─────────────────────────────────
// THE MASTER LINES ARE FITTED TWICE and only the first pass had company.
// `straighten` ran on every non-master curve right after `fitThrough` put the
// six lines through four stations each; then `fitChain` re-fitted all six over
// thirteen spans and moved their ENDPOINTS. Moving a chain end drags the
// welded end of every curve meeting there and leaves that curve's two interior
// control points where the old geometry put them — so the end panels' edges
// stopped being straight lines between their own corners without anything
// saying so.
//
// It cost 45.8 degrees at the tail. The end face is a flat cross-car panel and
// its top edge is meant to run rail to rail in a straight line; instead it
// sagged 75 mm below both of its ends, and the deck band that shares it broke
// against the next cell along by more than the crease law would tolerate.
//
// So the second pass gets the same treatment as the first. This is still
// BEFORE any station cut, which is the window the whole file works in.
for (const id of [...s.state.curves.keys()] as Id[]) {
  if (!longEdges.includes(id)) straighten(id);
}

// ── the domes ─────────────────────────────────────────────────────────────
// THE END FACES STOP BEING PLATES, and this is the whole of what it costs:
// the box's nose and tail cells are Coons patches of four straight edges, so
// bowing each edge in x by a parabola that vanishes at its ends bows the face
// with it, and every corner stays exactly where every master line ends. It
// goes in here — after the straighten pass that put the edges back to lines,
// before the first station cut — in the same window everything else is
// shaped in. `scripts/lib/caps.ts` carries the construction and the formula;
// the bands are cut into these below, once the section pass is done, because
// a band seam is a split and a split is safe after the cuts.
const capDeps = {
  apply: (verb: string, args: unknown) => s.apply(verb as never, args as never),
  cellIds: () => [...s.state.cells.keys()] as Id[],
  curveIds: () => [...s.state.curves.keys()] as Id[],
  sidesOf: (cellId: Id) => s.state.cells.get(cellId)!.sides.map((sd) => s.state.resolveCurve(sd.curveId)),
  pointAt: (id: Id, t: number): Pt3 => evalChain(s.state.curves.get(s.state.resolveCurve(id))!.chain, t),
  fitThrough,
};
let noseCap: EndCap | null = null;
let tailCap: EndCap | null = null;
for (const id of capCells) {
  const forwardFace = curveMean(capDeps.sidesOf(id)[0]!)[0] < LEN / 2;
  if (forwardFace) noseCap = domeEndCap(capDeps, id, NOSE_DOME);
  else tailCap = domeEndCap(capDeps, id, TAIL_DOME);
}
if (!noseCap || !tailCap) throw new Error("a cap went missing");

// ── the sections ──────────────────────────────────────────────────────────
// A station is SIX curves now, not four, and that is the whole of what a roof
// costs. The two plan cuts split the top band in three, so a cross-section
// runs: underside across the car, a flank up each side to the beltline, a
// SAIL from each beltline in to the roof rail, and the roof across between
// the rails. The sail is the piece that did not exist on an open car — over
// the bonnet it is the wing top and over the cabin it is the side glass, and
// on this body those are one continuous band because on the real car they
// are too.
//
// `hip` is an ABSOLUTE half-width and `hipAt` is how far up the flank the
// widest point sits. The tyre faces sit at 716 mm front and rear, so every
// station over a wheel has to clear that — by 96 mm here against the MX-5's
// 35, because this car's track is narrow under a wide body and the arch has
// somewhere to go for the first time.
//
// `sailBulge` is how far the sail bows OUTBOARD of the straight line from
// beltline to rail. Over the wings it is a crown; through the cabin it is
// nearly nothing, because side glass is nearly flat and the tumblehome comes
// from where the rail is rather than from bowing the glass.
//
// The roof's crown is NOT typed. It is `railZ` plus a rise, so the rail and
// the crown come off one function and a change to the roofline cannot leave
// half the section behind.
const crownRise = profile([
  // POSITIVE THE WHOLE LENGTH, largest over the engine — a power bulge over
  // the twin-turbo V8's plenum, the M3's reading kept — and rising again
  // over the deck, where a fastback's lid crowns between its two shoulders.
  [0, 6], [300, 10], [fA, 12], [FRONT_AXLE_X, 14], [fB, 16],
  [1650, 10], [1780, 8], [2100, 6], [2450, 5], [2800, 4], [3100, 5],
  [3300, 6], [rA, 6], [3820, 8], [REAR_AXLE_X, 8], [rB, 6], [4650, 5], [LEN, 4],
]);
const crownZ = (x: number): number => railZ(x) + crownRise(x);

/** How low the car may sit, from the brief. Nothing below this is packageable. */
const GROUND_CLEARANCE = p2Config.brief.groundClearanceMm.value;
/** Stations where the package asked to go below the road and was refused. */
const grounded: { x: number; by: number; driver: string }[] = [];

const STATIONS: {
  x: number; roof: number; floor: number; hip: number; hipAt: number;
  sailBulge: number; name: string; underY?: number;
  drawn: { top: number; floor: number; halfWidth: number };
}[] = ([
  // The nose: the first station stands 70 mm behind the domed cap's corners,
  // and the prow bulge is small because the dome is doing the rounding.
  { x: 190,  floor: 205, hip: 790, hipAt: 0.45, sailBulge: 10, name: "nose-tip" },
  { x: 300,  floor: 120, hip: 885, hipAt: 0.45, sailBulge: 16, name: "nose-mouth" },
  { x: archMouth(FRONT_AXLE_X, FRONT_ARCH_HALF)[0], floor: 118, hip: 938, hipAt: 0.32, sailBulge: 10, name: "arch-front-lead" },
  // hipAt 0.25 — over a wheel the widest thing at the station is the arch
  // lip at the flank's own foot, the F1's reading repeated.
  { x: FRONT_AXLE_X, floor: 116, hip: 953, hipAt: 0.25, sailBulge: 8, name: "front-axle" },
  { x: archMouth(FRONT_AXLE_X, FRONT_ARCH_HALF)[1], floor: 116, hip: 935, hipAt: 0.38, sailBulge: 9, underY: 750, name: "arch-front-trail" },
  // ── the greenhouse: two rows of people under one fall ──────────────────
  // hipAt 0.6 through the doors: the widest line of the flank sits above
  // its middle, so the lower half tucks under toward the sill.
  { x: 1650, floor: 116, hip: 922, hipAt: 0.55, sailBulge: 8, underY: 780, name: "cowl" },
  { x: 1780, floor: 116, hip: 918, hipAt: 0.58, sailBulge: 6, underY: 780, name: "screen-base" },
  { x: 2100, floor: 116, hip: 914, hipAt: 0.60, sailBulge: 5, underY: 780, name: "screen-mid" },
  { x: 2450, floor: 116, hip: 914, hipAt: 0.60, sailBulge: 4, underY: 780, name: "header" },
  { x: 2800, floor: 116, hip: 918, hipAt: 0.60, sailBulge: 4, underY: 780, name: "b-pillar" },
  { x: 3100, floor: 118, hip: 930, hipAt: 0.58, sailBulge: 5, underY: 780, name: "roof-mid" },
  { x: 3300, floor: 120, hip: 942, hipAt: 0.56, sailBulge: 6, underY: 780, name: "roof-rear" },
  { x: archMouth(REAR_AXLE_X, REAR_ARCH_HALF)[0], floor: 122, hip: 955, hipAt: 0.45, sailBulge: 7, underY: 750, name: "arch-rear-lead" },
  // ── the deck ───────────────────────────────────────────────────────────
  { x: 3820, floor: 126, hip: 972, hipAt: 0.40, sailBulge: 8, name: "decklid-lead" },
  { x: REAR_AXLE_X, floor: 128, hip: 978, hipAt: 0.28, sailBulge: 8, name: "rear-axle" },
  { x: archMouth(REAR_AXLE_X, REAR_ARCH_HALF)[1], floor: 150, hip: 962, hipAt: 0.40, sailBulge: 8, name: "arch-rear-trail" },
  { x: 4650, floor: 230, hip: 890, hipAt: 0.45, sailBulge: 8, name: "tail" },
  { x: 4830, floor: 290, hip: 770, hipAt: 0.48, sailBulge: 5, name: "tail-tuck" },
] as const).map((st) => {
  // The package under the styling, at the station level as well as the master
  // line's. A crown lower than the contents, a floor above the sump, or a
  // flank narrower than the widest thing at that station are all the same
  // mistake, and all three are corrected here and reported below.
  const need = packageAt(DRIVING, st.x);
  // THE ROAD BEATS THE PACKAGE, and this is the first car where the two have
  // disagreed. `packageAt` says the underbody must clear the bottom of the
  // radiator core the solve placed, which is 13 mm above the ground; the
  // brief says the car sits 120 mm off it. Both are declared demands and one
  // of them is not negotiable, because a floor below the road is not a
  // packaging decision, it is a car on its sump.
  //
  // So the floor is clamped to the ground clearance and the refusal is
  // REPORTED rather than obeyed or hidden. Taking the smaller of two numbers
  // and saying nothing is how a body ends up shaped by something nobody
  // remembers deciding — the same sentence `packageMisses` was written for,
  // pointing the other way.
  const wanted = Number.isFinite(need.bottom) ? Math.min(st.floor, need.bottom) : st.floor;
  const floor = Math.max(wanted, GROUND_CLEARANCE);
  if (floor > wanted + 0.5 && need.bottomDriver) {
    grounded.push({ x: st.x, by: floor - wanted, driver: need.bottomDriver });
  }
  return {
    ...st,
    drawn: { top: crownZ(st.x), floor: st.floor, halfWidth: st.hip },
    roof: Math.max(crownZ(st.x), need.top),
    floor,
    hip: Math.max(st.hip, need.halfWidth),
  };
});

// EVERY SPAN BOUNDARY OF THE BELTLINE AND THE ROOF RAIL MUST BE A STATION,
// and this is the assertion that says so rather than the print discovering it.
//
// A boundary at a non-station is a knot the chain has and the CELLS do not, so
// the mesher's union of the two axes gets a column a hair off a lattice point
// and the near-duplicate rule reuses the wrong vertex. It opens the mesh: 12
// edges, from one knot at x = 300 that had no business being anywhere but a
// station. The rocker is exempt because it is SPLIT at its arch stations, so
// its extra sill knots are interior to pieces no cell claims across.
for (const x of [...SPAN_X, ...SHOULDER_X]) {
  if (x === X0 || x === X1) continue;
  if (!STATIONS.some((st) => Math.abs(st.x - x) < 1e-6)) {
    throw new Error(`SPAN_X has ${x.toFixed(1)}, which is not a station — the print will open there`);
  }
}

// Every arch mouth and crown must BE a station: the rocker can only be split
// where no cell claims across, and a station cut is what makes that true.
for (const x of [
  ...archMouth(FRONT_AXLE_X, FRONT_ARCH_HALF), FRONT_AXLE_X,
  ...archMouth(REAR_AXLE_X, REAR_ARCH_HALF), REAR_AXLE_X,
]) {
  if (!STATIONS.some((st) => Math.abs(st.x - x) < 1e-6)) {
    throw new Error(`no station at x=${x}, which an arch mouth or crown needs`);
  }
}

/**
 * The six faces of the body, told apart by where they sit.
 *
 * Scores would do it for four; with six the roof and the underside are both
 * on the centreline and the flank and the sail are both on a side, so the
 * test is two-stage: centreline faces split by height, side faces split by
 * how far out they reach. Nothing here is a tolerance — the six are the only
 * long faces there are, and each pair genuinely differs.
 */
const bodyFaces = (): { deck: Id; under: Id; flank: [Id, Id]; sail: [Id, Id] } => {
  const meanOf = (id: Id): Pt3 => {
    const cell = s.state.cells.get(id)!;
    let x = 0, y = 0, z = 0, n = 0;
    for (const sd of cell.sides) {
      const c = s.state.curves.get(s.state.resolveCurve(sd.curveId));
      if (!c) continue;
      for (const t of [0, 0.5, 1]) {
        const q = evalChain(c.chain, sd.t0 + (sd.t1 - sd.t0) * t);
        x += q[0]; y += q[1]; z += q[2]; n++;
      }
    }
    return [x / n, y / n, z / n];
  };
  const spanX = (id: Id): number => {
    const cell = s.state.cells.get(id)!;
    let lo = Infinity, hi = -Infinity;
    for (const sd of cell.sides) {
      const c = s.state.curves.get(s.state.resolveCurve(sd.curveId));
      if (!c) continue;
      for (const t of [0, 0.5, 1]) {
        const q = evalChain(c.chain, sd.t0 + (sd.t1 - sd.t0) * t);
        lo = Math.min(lo, q[0]); hi = Math.max(hi, q[0]);
      }
    }
    return hi - lo;
  };
  const long = ([...s.state.cells.keys()] as Id[]).filter((id) => spanX(id) > LEN * 0.9);
  if (long.length !== 6) throw new Error(`expected 6 long faces, got ${long.length}`);
  const centre = long.filter((id) => Math.abs(meanOf(id)[1]) < HW * 0.2);
  const side = long.filter((id) => Math.abs(meanOf(id)[1]) >= HW * 0.2);
  if (centre.length !== 2 || side.length !== 4) {
    throw new Error(`expected 2 centre + 4 side faces, got ${centre.length} + ${side.length}`);
  }
  centre.sort((a, b) => meanOf(a)[2] - meanOf(b)[2]);
  const pick = (sign: number): [Id, Id] => {
    const own = side.filter((id) => Math.sign(meanOf(id)[1]) === sign);
    if (own.length !== 2) throw new Error(`expected 2 faces on side ${sign}, got ${own.length}`);
    own.sort((a, b) => Math.abs(meanOf(b)[1]) - Math.abs(meanOf(a)[1]));
    return [own[0]!, own[1]!];   // flank first — it reaches further out
  };
  const [flankP, sailP] = pick(1);
  const [flankN, sailN] = pick(-1);
  return { under: centre[0]!, deck: centre[1]!, flank: [flankP, flankN], sail: [sailP, sailN] };
};
const faces = bodyFaces();

const sections: { deck: Id; under: Id; flanks: Id[]; sails: Id[] }[] = [];
for (const st of STATIONS) {
  const before = new Set(s.state.curves.keys());
  s.apply("tape", {
    kind: "line",
    line: { view: side, a: [st.x, FLOOR - 240], b: [st.x, TOP + 220], lineClass: "tape" },
    targets: [faces.deck, faces.under, ...faces.flank, ...faces.sail],
  });
  const made = [...s.state.curves.keys()].filter((id) => !before.has(id)) as Id[];
  // A curve is "across the car" if it SPANS THE CENTRELINE — its two ends sit
  // on opposite sides. Comparing the y span to the z span looks equivalent and
  // is not: once the arch is in the rocker, the flank over a wheel is 83 mm
  // tall and wider than it is high, and the old test called it a deck curve.
  const acrossCar = (id: Id): boolean => {
    const c = s.state.curves.get(s.state.resolveCurve(id))!;
    const a0 = evalChain(c.chain, 0), a1 = evalChain(c.chain, 1);
    return Math.sign(a0[1]) !== Math.sign(a1[1]);
  };
  const across = made.filter(acrossCar);
  const oneSided = made.filter((id) => !acrossCar(id));
  const zOf = (id: Id) => curveMean(id)[2];
  across.sort((a, b) => zOf(a) - zOf(b));
  const under = across[0], deck = across[across.length - 1];
  if (!under || !deck || across.length !== 2 || oneSided.length !== 4) {
    throw new Error(`station ${st.name}: expected 2 across + 4 side, got ${across.length} + ${oneSided.length}`);
  }
  // Of the two curves on each side, the SAIL is the higher one: it runs from
  // the beltline up to the rail, and the flank from the rocker up to the
  // beltline. They meet at the beltline, so their means never tie.
  const bySide = (sign: number): [Id, Id] => {
    const own = oneSided.filter((id) => Math.sign(curveMean(id)[1]) === sign);
    if (own.length !== 2) throw new Error(`station ${st.name}: ${own.length} curves on side ${sign}`);
    own.sort((a, b) => zOf(a) - zOf(b));
    return [own[0]!, own[1]!];   // flank, sail
  };
  const [flankP, sailP] = bySide(1);
  const [flankN, sailN] = bySide(-1);
  sections.push({ deck, under, flanks: [flankP, flankN], sails: [sailP, sailN] });
}

const bulge = (base: Pt3, sign: number, out: number): Pt3 => [base[0], base[1] + sign * out, base[2]];
/**
 * Put a cross-car curve's crown at `wantZ`, its shoulders at `wantY`.
 *
 * Both ends are pinned — they are the flank, and moving them would unweld the
 * section — so the crown is reached by placing the two interior control
 * points, and a cubic at its midpoint reads a quarter of its ends plus three
 * quarters of its middle. That is the 0.25 / 0.75 below and it is the only
 * arithmetic here.
 */
const setAcross = (id: Id, x: number, wantZ: number, wantY: number): void => {
  const [p0, , , p3] = ctrlsOf(id);
  const endZ = (p0[2] + p3[2]) / 2;
  const ctrlZ = (wantZ - 0.25 * endZ) / 0.75;
  const yAt = wantY > 0 ? wantY : ((Math.abs(p0[1]) + Math.abs(p3[1])) / 2) * 0.74;
  setCtrl(id, 1, [x, Math.sign(p0[1]) * yAt, ctrlZ]);
  setCtrl(id, 2, [x, Math.sign(p3[1]) * yAt, ctrlZ]);
};

/**
 * Bow a side curve outboard of its own chord. Both ends are pinned.
 *
 * `d` is a CONTROL POINT offset and a cubic does not reach its control
 * points, so asking for a bulge of d gets a curve that peaks somewhere short
 * of it — or, when the chord is already wide, past the number that was typed.
 * Dividing by 0.75 and hoping left this car 19 mm wide at every station from
 * the front axle to the tail: authored 1657, built 1695, and the report said
 * both numbers without either being wrong.
 *
 * So the caller names the PEAK it wants and this solves for the offset that
 * delivers it — bisection on a monotone function, twenty iterations, exact to
 * a thousandth of a millimetre. The MX-5 does the same thing for its two
 * master lines and calls it `planScale`; this is that idea applied to the
 * ninety curves in between.
 */
const bowSide = (id: Id, at: number, target: (chord: number) => number): void => {
  const [p0, , , p3] = ctrlsOf(id);
  const sign = Math.sign((p0[1] + p3[1]) / 2) || 1;
  const low = p0[2] < p3[2] ? p0 : p3;
  const high = p0[2] < p3[2] ? p3 : p0;
  const chord = Math.abs(low[1]) + (Math.abs(high[1]) - Math.abs(low[1])) * at;
  const want = target(chord);
  const wLow = 1 + (0.5 - at) * 2;
  const wHigh = 2 - wLow;
  const upward = p0[2] < p3[2];
  const q1 = lerp3p(p0, p3, 1 / 3), q2 = lerp3p(p0, p3, 2 / 3);
  const peakAt = (d: number): number => {
    const y1 = q1[1] + sign * d * (upward ? wLow : wHigh);
    const y2 = q2[1] + sign * d * (upward ? wHigh : wLow);
    let m = 0;
    for (let i = 0; i <= 200; i++) {
      const t = i / 200, u = 1 - t;
      const y = u * u * u * p0[1] + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * p3[1];
      if (Math.abs(y) > m) m = Math.abs(y);
    }
    return m;
  };
  let d = 0;
  if (peakAt(0) < want) {
    let lo = 0, hi = Math.max(64, (want - peakAt(0)) * 3);
    while (peakAt(hi) < want && hi < 4096) hi *= 2;
    for (let i = 0; i < 40; i++) {
      const mid = 0.5 * (lo + hi);
      if (peakAt(mid) < want) lo = mid; else hi = mid;
    }
    d = 0.5 * (lo + hi);
  }
  setCtrl(id, 1, bulge(q1, sign, d * (upward ? wLow : wHigh)));
  setCtrl(id, 2, bulge(q2, sign, d * (upward ? wHigh : wLow)));
};

for (let i = 0; i < STATIONS.length; i++) {
  const st = STATIONS[i]!;
  const sec = sections[i]!;
  setAcross(sec.deck, st.x, st.roof, 0);
  setAcross(sec.under, st.x, st.floor, st.underY ?? 0);
  for (const id of sec.flanks) bowSide(id, st.hipAt, () => st.hip);
  for (const id of sec.sails) bowSide(id, 0.5, (chord) => chord + st.sailBulge);
}

// ── the floor, told where the rails are ───────────────────────────────────

/** The body's underside at (x, y), read off the section curve that owns it. */
const undersideAtStation = (i: number, y: number): number => {
  const c = s.state.curves.get(s.state.resolveCurve(sections[i]!.under))!;
  const N = 96;
  let prev = evalChain(c.chain, 0);
  for (let k = 1; k <= N; k++) {
    const q = evalChain(c.chain, k / N);
    if ((prev[1] - y) * (q[1] - y) <= 0 && prev[1] !== q[1]) {
      return prev[2] + (q[2] - prev[2]) * ((y - prev[1]) / (q[1] - prev[1]));
    }
    prev = q;
  }
  // The curve never reaches that y: the body is narrower there than the frame,
  // which the caller has to hear about rather than have papered over.
  return NaN;
};

/**
 * The body's underside at (x, y) — the yin-and-yang function.
 *
 * Every other floor number in this file is TYPED. This one is READ, off the
 * curves the section pass just placed, which is what lets the frame be built
 * against the body instead of beside it. It interpolates between the two
 * stations bracketing x, because that is what the surface does between them.
 */
const undersideAt = (x: number, y: number): number => {
  let i = 0;
  while (i < STATIONS.length - 2 && STATIONS[i + 1]!.x < x) i++;
  const a = STATIONS[i]!, b = STATIONS[i + 1]!;
  const za = undersideAtStation(i, y), zb = undersideAtStation(i + 1, y);
  if (!Number.isFinite(za)) return zb;
  if (!Number.isFinite(zb)) return za;
  const f = b.x === a.x ? 0 : Math.min(1, Math.max(0, (x - a.x) / (b.x - a.x)));
  return za + (zb - za) * f;
};

/**
 * Lift the underbody clear of the rails wherever a mount is meant to be.
 *
 * THE DEFECT THIS EXISTS TO KILL. `floor: PAD_TOP` in the station table sets
 * the CROWN of an arch whose ends are the rockers, and the rockers are lower,
 * so over the rail at y = 350 the floor came out 12 to 27 mm under the number
 * that was typed. Twenty-seven millimetres is more than the mount pad is
 * tall: the outer skin passed straight through the cowl crossmember and stood
 * five structure points out in the open, and every body mount read as buried
 * in bodywork it was nowhere near carrying.
 *
 * The fix is a measurement, not a bigger constant. Raise the crown by exactly
 * what the arch eats, look again — the ends are pinned, so a lift of d at the
 * crown is less than d over the rail — and stop when the rail is clear. Three
 * passes is plenty; the residual is reported either way.
 */
const clearTheRails = (): void => {
  /** How far either side of a mount the lift is blended out to nothing. */
  const SPAN = 700;
  for (let pass = 0; pass < 4; pass++) {
    // What each mount that is MEANT to carry the body still lacks. Where the
    // underside sits below the rail's own centre the body wraps the frame —
    // a nose over a crash member — and lifting the valance there would buy
    // nothing but a taller nose.
    const need: [number, number][] = [];
    for (const mx of MOUNT_X) {
      const have = undersideAt(mx, RAIL_Y);
      if (!Number.isFinite(have) || have < RAIL_Z) continue;
      const lift = PAD_TOP - have;
      if (lift > 0.05) need.push([mx, lift]);
    }
    if (need.length === 0) break;
    // BLENDED, and the first version was not. Lifting the mount's own station
    // and leaving its neighbours put a forty-millimetre step into the
    // underbody over a hundred and fifty of length: the curve network went
    // from 16 degrees out of plane to 55, and G1 with it. A floor is a
    // surface, so a correction to it has to be one too.
    for (let i = 0; i < STATIONS.length; i++) {
      const st = STATIONS[i]!;
      let lift = 0;
      for (const [mx, d] of need) {
        const u = Math.min(1, Math.abs(st.x - mx) / SPAN);
        lift = Math.max(lift, d * (1 - u * u * (3 - 2 * u)));
      }
      if (lift <= 0.05) continue;
      st.floor += lift;
      setAcross(sections[i]!.under, st.x, st.floor, st.underY ?? 0);
    }
  }
};
clearTheRails();
if (process.env["DBG"] === "1") {
  for (const mx of MOUNT_X) {
    console.log(`  DBG underside at mount x${mx}: y${RAIL_Y} -> z ${undersideAt(mx, RAIL_Y).toFixed(1)} (rail z ${RAIL_Z}, rail top ${RAIL_TOP}, pad top ${PAD_TOP})`);
  }
  for (const st of STATIONS) {
    console.log(`  DBG station ${st.name.padEnd(16)} x${st.x.toFixed(0).padStart(5)} roof ${st.roof.toFixed(0)} (drawn ${st.drawn.top.toFixed(0)}) floor ${st.floor.toFixed(0)} hip ${st.hip.toFixed(0)} · rail ${railZ(st.x).toFixed(0)} drawn ${railZdrawn(st.x).toFixed(0)} · shoulder ${shoulderZprofile(st.x).toFixed(0)}`);
  }
}

// The beltline and sill are creased BEFORE the rocker is split, so both marks
// ride onto every piece. Creasing after would mark only the stretch that kept
// the original id — the first seventh of the sill — and leave the field trying
// to smooth the other six.
for (const id of longEdges) s.apply("crease", { curveId: id });

// ── mark the arch lips ────────────────────────────────────────────────────
// The arches are already in the rocker; what is left is to SAY so. A13 splits
// the rocker at each mouth and crown so the four quarter spans become curves
// of their own, and then each can be creased. Splitting moves nothing — that
// is what `split-curve.test` checks point by point — so this is safe after the
// cuts in a way that shaping is not.
//
// An arch lip is a fold. Marking it stops the tangent field trying to make the
// flank and the wheelhouse tangent across a 90-degree turn, and it is what
// makes the lip read as a lip instead of a soft roll.
const archSpans: Id[] = [];
/** Every rocker's seven spans, in increasing x, keyed by the master's id. */
const rockerSpans = new Map<Id, Id[]>();
for (const rocker of rockerIds) {
  const chain0 = s.state.curves.get(s.state.resolveCurve(rocker))!.chain;
  const forward = evalChain(chain0, 0)[0]! < evalChain(chain0, 1)[0]!;
  // SPLIT AT THE ARCH STATIONS ONLY, not at every span boundary. A split is a
  // topology change and is legal exactly where no cell claims across the cut —
  // which is at a STATION. The rocker's extra sill knots are not stations and
  // do not need to be: `place-point` gives the chain a segment boundary there
  // without making a new curve, which is all a table needs. Splitting there
  // asks the verb to cut a cell in half and it refuses, correctly, by name.
  //
  // Its own parameter runs uniformly over its spans, so the boundary before
  // span j sits at j/N whichever way round the curve happens to run.
  const N = ROCKER_X.length - 1;
  const cuts = [fA, FRONT_AXLE_X, fB, rA, REAR_AXLE_X, rB]
    .map((x) => ROCKER_X.indexOf(x) / N)
    .sort((a, b) => a - b);
  const stations = cuts;

  let head = rocker;
  const pieces: Id[] = [];
  let upper = 1;
  for (const t of [...stations].reverse()) {
    const before = new Set(s.state.curves.keys());
    if (process.env["DBGSPLIT"] === "1") {
      const ch = s.state.curves.get(s.state.resolveCurve(head))!.chain;
      console.log(`  DBGSPLIT ${head} t=${(t / upper).toFixed(4)} x(t)=${evalChain(ch, t / upper)[0].toFixed(1)} segs=${ch.segs.length} bounds=` +
        ch.segs.map((_, j) => evalChain(ch, j / ch.segs.length)[0].toFixed(0)).join(","));
    }
    s.apply("split-curve", { curveId: head, t: t / upper });
    const tail = [...s.state.curves.keys()].find((id) => !before.has(id)) as Id;
    if (!tail) throw new Error("split-curve made no new curve");
    pieces.unshift(tail);
    upper = t;
  }
  pieces.unshift(head);
  if (pieces.length !== 7) throw new Error(`rocker split into ${pieces.length}, expected 7`);
  const inX = forward ? pieces : [...pieces].reverse();
  rockerSpans.set(rocker, inX);
  // Seven pieces again, and the two quarters of each arch are 1,2 and 4,5 —
  // the extra sill knots live INSIDE pieces 0, 3 and 6 and change no index.
  for (const j of [1, 2, 4, 5]) {
    s.apply("crease", { curveId: inX[j]! });
    archSpans.push(inX[j]!);
  }
}

// ── panel gaps ────────────────────────────────────────────────────────────
// A panel is a connected run of cells with the GAP-marked curves cut. The
// four-door grammar the M3 built is used as it stands — four shut stations,
// not all the same KIND of shut — with the caps' own seams added below:
//
//   THE COWL RING is a full cross-section bar the underside — the bonnet's
//   rear shut across the deck band, continuing down the sails and flanks as
//   the wing-to-door gap. One ring, two real gaps that happen to line up,
//   which on the actual car they very nearly do.
//
//   THE B-PILLAR RING is FLANKS AND SAILS ONLY. A door shut runs up the body
//   side and stops at the roof rail: the roof of a sedan is one pressing from
//   screen to backlight and nothing crosses it. The deck band at this station
//   carries NO mark — which is the first time a shut station has had to say
//   which bands it is a shut OF.
//
//   THE REAR-DOOR RING at the rear arch's leading mouth, flanks and sails
//   again: the rear door's trailing edge lands where the quarter panel's
//   flare begins, which is where every four-door with hips puts it.
//
//   THE BOOT SHUT is the opposite selection: DECK ONLY. A bootlid's side
//   edges run along the deck's own shoulders — they are the aft stretch of
//   the roof-rail seam, gapped below — so the only cross-car piece of its
//   ring is the lid's leading edge.
//
// The rule the arches taught still holds and everything below obeys it:
// splitting moves nothing and is safe after the cuts; shaping is not. No
// control point moves in this section.

const NOSE_SHUT = "cowl";          // x = 1650 — bonnet shut + wing/door gap
const DOOR_SHUT = "b-pillar";      // x = 2800 — door-to-door, flanks and sails
const REAR_DOOR_SHUT = "arch-rear-lead";   // rear door's trailing edge
const TAIL_SHUT = "decklid-lead";  // x = 3820 — the lid's leading edge, at the backlight's foot

const stationOf = (name: string) => {
  const k = STATIONS.findIndex((st) => st.name === name);
  const sec = sections[k];
  if (!sec) throw new Error(`no station ${name}`);
  return sec;
};
const stationX = (name: string): number => {
  const st = STATIONS.find((q) => q.name === name);
  if (!st) throw new Error(`no station ${name}`);
  return st.x;
};

/**
 * Split a curve at an x that is already a station, and hand back the two
 * pieces in x order.
 *
 * The parameter is found by bisection on the curve's CURRENT chain, because
 * every split re-parameterises what is left, and A13 then snaps it to the
 * claim boundary the station cut put there — so the result is exact rather
 * than within a bisection of exact. It is only legal AT a station: anywhere
 * else a cell claims across the cut and the verb refuses by name, which is
 * the guard doing its job.
 */
const cutSpanAt = (piece: Id, x: number): [Id, Id] => {
  const chain = s.state.curves.get(s.state.resolveCurve(piece))!.chain;
  const forward = evalChain(chain, 0)[0]! < evalChain(chain, 1)[0]!;
  let lo = 0, hi = 1;
  for (let i = 0; i < 60; i++) {
    const mid = 0.5 * (lo + hi);
    if ((evalChain(chain, mid)[0]! < x) === forward) lo = mid; else hi = mid;
  }
  const before = new Set(s.state.curves.keys());
  s.apply("split-curve", { curveId: piece, t: 0.5 * (lo + hi) });
  const tail = [...s.state.curves.keys()].find((id) => !before.has(id)) as Id;
  if (!tail) throw new Error(`split-curve made no new curve at x=${x}`);
  return forward ? [piece, tail] : [tail, piece];
};

// THE FOUR SHUT STATIONS, each marking only the bands it is a shut of.
//
// THE DOOR SHUTS ARE GAPPED AND NOT CREASED, which is amendment A2 read the
// way it was written: a shutline does not break flow. The M3 creased every
// shut on the argument that the panels either side are separate pressings —
// true, and beside the point, because a door skin CONTINUES the quarter's
// surface across the gap on every car ever made flush. Creasing the rear
// door shut put a visible fold up the C-pillar where the door glass meets
// the painted blade, and the fold was the crease, not the car. The cowl
// ring and the lid shut stay creased: bonnet-to-screen and glass-to-lid are
// real folds, not shuts through one surface.
for (const name of [NOSE_SHUT]) {
  const sec = stationOf(name);
  for (const id of [sec.deck, ...sec.sails, ...sec.flanks]) {
    s.apply("crease", { curveId: id });
    s.apply("gap", { curveId: id });
  }
}
for (const name of [DOOR_SHUT, REAR_DOOR_SHUT]) {
  const sec = stationOf(name);
  for (const id of [...sec.sails, ...sec.flanks]) s.apply("gap", { curveId: id });
}
{
  const sec = stationOf(TAIL_SHUT);
  s.apply("crease", { curveId: sec.deck });
  s.apply("gap", { curveId: sec.deck });
}

// THE SILL, end to end: the seam where the body side meets the floor's
// extrusion, which on a bonded-aluminium shell is a real line.
for (const rocker of rockerIds) {
  for (const id of rockerSpans.get(rocker)!) s.apply("gap", { curveId: id });
}

// THE RAIL, CUT IN THREE, AND EACH PIECE IS A DIFFERENT THING. Ahead of the
// cowl it is the BONNET'S SIDE EDGE above the wing: creased and softened,
// 16 mm opening to 50 by the nose, the shoulder a long bonnet rolls into its
// grille band. Through the greenhouse it is the ROOF CHANNEL — the seam the
// door frames seal against — creased and gapped. Aft of the lid shut it is
// the LID'S SIDE EDGE: creased and gapped, because the lid is its own piece
// and its gap runs along the deck shoulder, which is why the lid ring above
// only crossed the deck.
for (const rail of railIds) {
  const [fwd, aft] = cutSpanAt(rail, stationX(NOSE_SHUT));
  const [channel, rest] = cutSpanAt(aft, stationX("roof-rear"));
  const [cEdge, boot] = cutSpanAt(rest, stationX(TAIL_SHUT));
  s.apply("crease", { curveId: fwd });
  s.apply("soften", { curveId: fwd, radius: 16, endRadius: 50 });
  s.apply("crease", { curveId: channel });
  s.apply("gap", { curveId: channel });
  // The C-pillar's edge, backlight top to lid: on a fastback this is the
  // long sweep where the sail meets the glass, and it wears the widest roll
  // on the car — the surface a highlight travels furthest on.
  s.apply("crease", { curveId: cEdge });
  s.apply("soften", { curveId: cEdge, radius: 30, endRadius: 40 });
  s.apply("crease", { curveId: boot });
  s.apply("gap", { curveId: boot });
}

// THE BLADE — the beltline wearing amendment A12 as this car's own line.
// The M3's swage fades once, from the wing into the lamp. The P2's does the
// opposite in the middle: CRISP over the front wing (R8), DISSOLVING through
// the doors (R12 opening to R40, so the door skin is one soft surface by the
// rear shut), and RE-FORMING over the hip (R40 closing to R14) — the line
// comes back exactly where the flare is widest, which is what makes the
// hips read as hips rather than as a bulge. Creased throughout, because the
// crease says the two bands MEAN to disagree and the radius says by how
// much rounds; the radii meet at each cut so the line never steps.
for (const shoulder of shoulderIds) {
  const [wing, rest] = cutSpanAt(shoulder, stationX(NOSE_SHUT));
  const [doors, quarter] = cutSpanAt(rest, stationX(REAR_DOOR_SHUT));
  s.apply("soften", { curveId: wing, radius: 8 });
  s.apply("soften", { curveId: doors, radius: 12, endRadius: 40 });
  s.apply("soften", { curveId: quarter, radius: 40, endRadius: 14 });
}

// THE ARCH MOUTHS. Where the lip ends and the sill begins there is a fold,
// and on this car it is a big one: a quarter circle arrives at its mouth
// rising at 79 degrees and no sill can leave at that angle without going
// through the road. Both other cars have the same corner — it is at the arch
// mouths on the MX-5 too — and there it is 16 degrees because the wheel is
// smaller and the arch shallower. Here it is 75, which is past anything the
// tangent field should be asked to blend, and asking it anyway bulged the
// wing 57 mm.
//
// So it is MARKED rather than smoothed. That is what a flange is, and it is
// the same decision the door shuts get: a break the author declares stops
// being a defect the surfacer has to hide.
// The UNDERSIDE curve at the same stations, for the same reason on the other
// side of the lip: its ends ARE the rocker, so it meets the fold too, and
// leaving it out left one corner class at 72 degrees when the flanks were
// down to 8. A fold across a wheelhouse floor is invisible and real.
for (const name of ["arch-front-lead", "arch-front-trail", "arch-rear-lead", "arch-rear-trail"]) {
  const sec = stationOf(name);
  for (const id of [...sec.flanks, sec.under]) s.apply("crease", { curveId: id });
}
// The UNDER curves at the two stations bracketing each rocker FLANGE, for
// the same reason one level down: the flange puts a 65-degree kink in the
// under cells' own boundary, the one smooth side left on those cells is the
// station curve, and the field's correction there dug the belly 148 mm below
// its own floor trying to fair a fold the author meant. A fold across a
// floor pan is invisible and real — the arch mouths said it first.
for (const name of ["cowl", "roof-rear"]) {
  s.apply("crease", { curveId: stationOf(name).under });
}

// AND THE LIP ITSELF GETS A RADIUS. An arch flange is not a knife edge — it is
// a tight roll, four or five millimetres on a pressed panel and rather more on
// a moulding — and until now the only way to say "this is an edge" was to say
// "this is infinitely sharp". The four arch spans of each rocker are the lip,
// so they are the four curves that carry it.
//
// SIX MILLIMETRES, which is the same number `ARCH_LIFT` uses for how far the
// lip stands proud of the tyre, and for the same reason: on this car there are
// eight and a half millimetres between the front tyre and the flank, and a lip
// with a bigger roll than that has nowhere to be.
for (const rocker of rockerIds) {
  const spans = rockerSpans.get(rocker)!;
  for (const j of [1, 2, 4, 5]) s.apply("soften", { curveId: spans[j]!, radius: 6 });
}

// THE KAMM EDGE. Where the deck stops and the tail cap begins there is a
// hard line across the whole width of the car and down both quarters — the
// ducktail's trailing edge, and the reason a fastback's back reads as a
// cut-off rather than as a taper. The station before the cap is creased on
// every band so the surfacer owns the break instead of hiding it.
for (const id of (() => { const sec = stationOf("tail-tuck"); return [sec.deck, ...sec.sails, ...sec.flanks]; })()) {
  s.apply("crease", { curveId: id });
}

// ── wheels ────────────────────────────────────────────────────────────────
// TWO SOLIDS PER CORNER, where every car before had one. A wheel was a box
// with eight cubic arcs — a drum — and its outer face was painted alloy from
// the tread inward, sidewall and all. Here the drum is the TYRE: its two
// faces are the sidewalls and wear the tyre's own finish, and its eight arcs
// are SOFTENED, because a tyre's shoulder is a roll and not an edge. The RIM
// is a second, smaller drum whose outer face stands three millimetres proud
// of the sidewall and whose arcs are creased, because a machined lip is an
// edge. Same eight-arc construction each; a cubic fits a 90° arc to three
// parts in ten thousand, which at these radii is under a tenth of a
// millimetre.
const wheelTread: Id[] = [];
const wheelDisc: Id[] = [];
const rimCells: Id[] = [];
/** How much of the tyre's shoulder rolls. A 35-section on a 21 has little sidewall to spend. */
const TYRE_SHOULDER_R = 18;
/** How far the rim's face stands proud of the sidewall. */
const RIM_PROUD = 3;
const wheel = (cx: number, radius: number, halfWidth: number, yIn: number, kind: "tyre" | "rim", cz = radius): void => {
  const before = new Set(s.state.curves.keys());
  const cellsBefore = new Set(s.state.cells.keys());
  s.apply("tape", {
    kind: "box",
    rect: { view: side, a: [cx - radius, cz - radius], b: [cx + radius, cz + radius], depth: halfWidth * 2, at: yIn },
  });
  const made = [...s.state.curves.keys()].filter((id) => !before.has(id)) as Id[];
  const ends = (id: Id): [Pt3, Pt3] => {
    const c = s.state.curves.get(s.state.resolveCurve(id))!;
    return [evalChain(c.chain, 0), evalChain(c.chain, 1)];
  };
  const acrossCar = (id: Id): boolean => {
    const [p0, p1] = ends(id);
    return Math.abs(p1[1] - p0[1]) > Math.max(Math.abs(p1[0] - p0[0]), Math.abs(p1[2] - p0[2]));
  };
  const angleAt = (p: Pt3): number => Math.atan2(p[2] - cz, p[0] - cx);
  for (const id of made) {
    if (acrossCar(id)) continue;
    const [p0, p1] = ends(id);
    const a0 = angleAt(p0);
    let sweep = angleAt(p1) - a0;
    while (sweep > Math.PI) sweep -= 2 * Math.PI;
    while (sweep <= -Math.PI) sweep += 2 * Math.PI;
    const y = p0[1];
    fitThrough(id, (t) => {
      const a = a0 + sweep * t;
      return [cx + radius * Math.cos(a), y, cz + radius * Math.sin(a)];
    });
  }
  for (const id of made) if (acrossCar(id)) straighten(id);
  for (const id of made) {
    if (acrossCar(id)) continue;
    s.apply("crease", { curveId: id });
    // The tyre's shoulder rolls; the rim's lip does not.
    if (kind === "tyre") s.apply("soften", { curveId: id, radius: TYRE_SHOULDER_R });
  }
  // The two faces at constant y are the sidewalls (or the rim's face), the
  // four that were fitted to arcs are the tread (or the rim's barrel).
  for (const id of [...s.state.cells.keys()] as Id[]) {
    if (cellsBefore.has(id)) continue;
    if (kind === "rim") { rimCells.push(id); continue; }
    const cell = s.state.cells.get(id)!;
    let lo = Infinity, hi = -Infinity;
    for (const sd of cell.sides) {
      const c = s.state.curves.get(s.state.resolveCurve(sd.curveId))!;
      for (const t of [0, 0.5, 1]) {
        const q = evalChain(c.chain, sd.t0 + (sd.t1 - sd.t0) * t);
        lo = Math.min(lo, q[1]); hi = Math.max(hi, q[1]);
      }
    }
    (hi - lo < 1 ? wheelDisc : wheelTread).push(id);
  }
};
// FOUR WHEELS, TWO SIZES, EIGHT SOLIDS. The tyre's half-section and its
// radius travel together per axle; the rim is the same 21 in drum at both
// ends, buried 40 mm into the tyre and standing 3 proud of its outer face.
const F_HALF = P2_FRONT_TIRE_WIDTH / 2;
const R_HALF = P2_REAR_TIRE_WIDTH / 2;
const RIM_R = (config.frontTire.rimDiameterIn.value * 25.4) / 2;
const RIM_DEPTH = 40;
if (process.env["NOWHEELS"] !== "1") {
  for (const [axleX, r, half, track] of [
    [FRONT_AXLE_X, FRONT_WHEEL_R, F_HALF, P2_FRONT_TRACK],
    [REAR_AXLE_X, REAR_WHEEL_R, R_HALF, P2_REAR_TRACK],
  ] as const) {
    const yIn = track / 2 - half;
    wheel(axleX, r, half, yIn, "tyre");
    // The rim's own drum: on the tyre's axle, from RIM_DEPTH inside the
    // sidewall to RIM_PROUD outside it, centred at the tyre's axle height
    // rather than tangent to the road.
    wheel(axleX, RIM_R, (RIM_DEPTH + RIM_PROUD) / 2, track / 2 + half - RIM_DEPTH, "rim", r);
  }
}

// ── where the greenhouse begins and ends ──────────────────────────────────
// Hoisted above the chassis because the STRUCTURE under the roof is built on
// the same stations the glass is, and a pillar that does not know where the
// windscreen ends is a pillar somebody typed.
const SCREEN_FROM = stationX(NOSE_SHUT);        // 1620 — the cowl
const SCREEN_TO = stationX("header");           // 2330 — the header rail
/** Door glass from the A-pillar base to the rear door's trailing edge — four
 *  doors of it, spanning both shut rings, which is what a sedan's DLO is. */
const GLASS_FROM = stationX("screen-base");     // 1720
const GLASS_TO = stationX(REAR_DOOR_SHUT);      // the rear arch's leading mouth
const BACKLIGHT_FROM = stationX("roof-rear");   // 3230
const BACKLIGHT_TO = stationX(TAIL_SHUT);       // 3640 — the boot's leading edge
/** Top of the windscreen header — the number the cabin lens reads the eye against. */
const HEADER_TOP_Z = crownZ(SCREEN_TO);

// ── the chassis: a BONDED SHELL, drawn as the members that matter ────────
// The P2 is a bonded and riveted aluminium unibody: extruded sills and
// longerons, cast towers, pressed pillars, one shell, with a subframe under
// the engine and a cradle under the rear multilink. `makeSubstrate` still
// knows one construction style, so the config declares body-on-frame and
// the "rails" it describes are the floor's own extrusions — the same
// accommodation every closed car here has made, and recorded as such.
//
// WHAT IS READ RATHER THAN TYPED: the engine bay's rails come off the
// engine's own box (the solve placed it; the bay is built round it), the
// strut towers stand at the front axle the wheels defined, the greenhouse
// members come off the two master lines, and the rear cradle sits under the
// axle the wheelbase put there.
const chassisCells: Id[] = [];
const frameCells: Id[] = [];
const mounts: BodyMount[] = [];
let members: StructureMember[] = [];
/** Crossmember stations the body WRAPS rather than sits on — reported, not faulted. */
const wrapped: number[] = [];
/** What the substrate asked for in crush stroke, against what the car had room for. */
let crushFit: { frontAsked: number; frontGot: number; rearAsked: number; rearGot: number } | null = null;

if (process.env["NOCHASSIS"] !== "1") {
  const chassisBefore = new Set(s.state.cells.keys());
  const kit = memberKit({
    apply: (verb, args) => s.apply(verb as never, args as never),
    cellIds: () => [...s.state.cells.keys()] as Id[],
    curveIds: () => [...s.state.curves.keys()] as Id[],
    straighten, ctrlsOf, fitThrough,
  });
  const { beam, strut } = kit;

  const { engine, tail: GEARBOX_TAIL, lowY: LOW_Y, upY: UP_Y, upZ: UP_Z } = FRAME;

  // ── the bulkhead, and the bay ahead of it ──────────────────────────────
  // The pedal bulkhead is where the engine bay ends and the cabin begins.
  // Read off the two parts that flank it: the engine's back face and the
  // pedal box the solve placed.
  const pedals = partBox("brakes");
  const BULK = Math.max(engine.hi[0] + 50, pedals.lo[0] - 20);
  /** Rear seat bulkhead — the cabin ends where the rear door shut does. */
  const SEAT_BULK = stationX(REAR_DOOR_SHUT);

  // Floor longerons, under the cabin, bulkhead to 80 short of the rear
  // shut: at the shut station the under skin has begun its climb into the
  // arch flange, and a longeron run to it stood 3 mm out of the belly.
  beam("longeron", {
    view: side,
    a: [BULK, RAIL_Z - RAIL_H / 2], b: [SEAT_BULK - 80, RAIL_Z + RAIL_H / 2],
    depth: RAIL_W, at: RAIL_Y - RAIL_W / 2,
  }, true);
  // The sills, under the four door apertures: an extruded aluminium sill,
  // 165 deep, at 760 — inboard of a flank that is 910 through the doors, and
  // ending 90 short of the rear arch so its tail stays out of the opening.
  const SILL_Y = 760;
  const SILL_Z = 140;
  beam("sill", {
    view: side,
    a: [SCREEN_FROM, SILL_Z], b: [SEAT_BULK - 90, SILL_Z + sub.rockerHeight.value],
    depth: sub.rockerWidth.value, at: SILL_Y - sub.rockerWidth.value / 2,
  }, true);

  // The tunnel: a real one at last. A propshaft and an exhaust run down it
  // from the bellhousing to the diff, which is what the config's 240 x 190
  // section is sized by — the first car in the repository whose spine
  // carries what a spine is for.
  beam("spine", {
    view: side,
    a: [BULK, RAIL_Z - RAIL_H / 2], b: [SEAT_BULK - 60, TUNNEL_TOP],
    depth: sub.tunnelWidth.value, at: -sub.tunnelWidth.value / 2,
  });
  // The two cabin bulkheads and the crossmembers between them.
  const BULKHEAD_CLEAR = 60;
  beam("bulkhead-front", {
    view: { kind: "front" as const },
    a: [-SILL_Y, SILL_Z], b: [SILL_Y, Math.min(820, crownZ(BULK) - BULKHEAD_CLEAR)],
    depth: 58, at: BULK,
  });
  beam("bulkhead-rear", {
    view: { kind: "front" as const },
    a: [-SILL_Y, SILL_Z], b: [SILL_Y, Math.min(880, shoulderZprofile(SEAT_BULK) - 30)],
    depth: 58, at: SEAT_BULK - 58,
  });
  beam("dash-crossmember", {
    view: { kind: "front" as const },
    a: [-SILL_Y + 40, 620], b: [SILL_Y - 40, Math.min(790, crownZ(SCREEN_FROM) - BULKHEAD_CLEAR)],
    depth: 70, at: SCREEN_FROM,
  });
  beam("seat-crossmember", {
    view: { kind: "front" as const },
    a: [-RAIL_Y - RAIL_W / 2, RAIL_Z - RAIL_H / 2], b: [RAIL_Y + RAIL_W / 2, RAIL_Z + RAIL_H / 2],
    depth: 70, at: 2450,
  });

  for (const id of [...s.state.cells.keys()] as Id[]) {
    if (chassisBefore.has(id)) continue;
    chassisCells.push(id);
  }

  // ── the engine bay ──────────────────────────────────────────────────────
  // Two rails from the crash beam back to the bulkhead, high beside the
  // block; the strut towers on them at the axle; the subframe under it. The
  // bay is built round the engine's own box — put a taller engine in and the
  // towers, the rails and the bonnet over them all move.
  const frameBefore = new Set(s.state.cells.keys());
  const NOSE_END = 200;
  const BAY_RAIL_Z = Math.min(engine.hi[2] - 40, 470);
  // IN LINE WITH THE FLOOR RAILS, not with the engine's own width: the bay
  // rails continue into the cabin longerons on a real unibody, and the first
  // draft read their y off the block — 66 mm inboard of the longerons, which
  // `structureFit` correctly called two separate bodies.
  const BAY_Y = RAIL_Y;
  for (const [nm, z] of [["front-rail-lower", 220], ["front-rail-upper", BAY_RAIL_Z]] as const) {
    beam(nm, {
      view: side, a: [NOSE_END, z - TUBE / 2], b: [BULK, z + TUBE / 2],
      depth: TUBE, at: BAY_Y - TUBE / 2,
    }, true);
  }
  strut("front-diag", [NOSE_END + 40, BAY_Y, 220], [BULK - 40, BAY_Y, BAY_RAIL_Z], TUBE, TUBE, true);
  // The strut towers — the tall architecture, and the reason the bonnet
  // could never be an E-Type's. Their tops sit under the wing line beside
  // the dome.
  const TOWER_TOP = Math.min(shoulderZprofile(FRONT_AXLE_X) - 45, 700);
  beam("strut-tower", {
    view: side,
    a: [FRONT_AXLE_X - 90, BAY_RAIL_Z], b: [FRONT_AXLE_X + 90, TOWER_TOP],
    depth: 120, at: BAY_Y - 18,   // straddles the upper rail, so the two touch
  }, true);
  beam("front-subframe", {
    view: { kind: "front" as const },
    a: [-BAY_Y, 150], b: [BAY_Y, 210], depth: 340, at: FRONT_AXLE_X - 170,
  });

  // ── the rear cradle ─────────────────────────────────────────────────────
  // The multilink's subframe: two crossmembers under the axle, two rails
  // kicked up over it from the floor to the boot floor, and the diff between
  // them.
  const KICK_Z = 380;
  strut("rear-rail-kick", [SEAT_BULK - 80, RAIL_Y, RAIL_Z], [REAR_AXLE_X, RAIL_Y - 30, KICK_Z], 48, 64, true);
  strut("rear-rail-boot", [REAR_AXLE_X, RAIL_Y - 30, KICK_Z], [LEN - 220, RAIL_Y - 60, KICK_Z + 10], 48, 64, true);
  for (const [nm, cx] of [["cradle-front", REAR_AXLE_X - 150], ["cradle-rear", REAR_AXLE_X + 170]] as const) {
    beam(nm, {
      view: { kind: "front" as const },
      a: [-480, 190], b: [480, 250], depth: 60, at: cx,
    });
    // A subframe hangs from the rails on bushes, and the first draft forgot
    // the bushes: the rear crossmember sat 100 mm under the boot rail and
    // read as a second body. One hanger per side per crossmember.
    strut(`${nm}-hanger`, [cx + 30, RAIL_Y - 45, 250], [cx + 30, RAIL_Y - 45, KICK_Z], 40, 40, true);
  }

  // ── the suspension ──────────────────────────────────────────────────────
  const F_HUB_Y = P2_FRONT_TRACK / 2 - 62;
  const R_HUB_Y = P2_REAR_TRACK / 2 - 62;
  // FRONT: double wishbones — the lower on the subframe, the upper on the
  // tower, the spring between them on the tower top.
  suspensionCorner(kit, {
    tag: "FL", axleX: FRONT_AXLE_X, hubY: F_HUB_Y, axleZ: FRONT_AXLE_Z,
    lowerIn: [FRONT_AXLE_X, BAY_Y - 60, 190], upperIn: [FRONT_AXLE_X, 600, TOWER_TOP - 20],
    springTop: [FRONT_AXLE_X, 615, TOWER_TOP],
  });
  const rack = partBox("steering");
  beam("rack", {
    view: { kind: "front" as const },
    a: [rack.lo[1], rack.lo[2]], b: [rack.hi[1], rack.hi[2]],
    depth: rack.hi[0] - rack.lo[0], at: rack.lo[0],
  });
  strut("tie-rod", [rack.hi[0] - 20, rack.hi[1], (rack.lo[2] + rack.hi[2]) / 2],
    [FRONT_AXLE_X - 90, F_HUB_Y - 20, FRONT_AXLE_Z - 60], 24, 24, true);
  // REAR: five links abstracted to the corner kit on the cradle.
  suspensionCorner(kit, {
    tag: "RL", axleX: REAR_AXLE_X, hubY: R_HUB_Y, axleZ: REAR_AXLE_Z,
    lowerIn: [REAR_AXLE_X, 440, 220], upperIn: [REAR_AXLE_X, 470, 440],
    springTop: [REAR_AXLE_X - 40, 490, 560],
  });
  strut("radius-arm", [REAR_AXLE_X, R_HUB_Y, REAR_AXLE_Z - 130],
    [SEAT_BULK - 40, SILL_Y - 60, 260], 34, 34, true);

  // ── the greenhouse: what the roof sits ON ───────────────────────────────
  // Every point below is READ off the master lines. The whole alphabet
  // again: A-pillar at the screen, a B-pillar between the doors, and a
  // C-pillar that on a fastback is a long lean member up the backlight's
  // edge from the lid shut to the roof's trailing bow.
  const PILLAR_W = 62, PILLAR_D = 74;
  const railAt = (x: number): Pt3 => [x, railPlanY(x) - 10, railZ(x) - 56];
  const COWL_TOP: Pt3 = [SCREEN_FROM, railPlanY(SCREEN_FROM) - 36, railZ(SCREEN_FROM) - 88];
  const aTop = railAt(SCREEN_TO);
  const cTopX = stationX("roof-rear");
  const cTop = railAt(cTopX);
  strut("a-pillar", COWL_TOP, aTop, PILLAR_W, PILLAR_D, true);
  strut("a-pillar-foot", [SCREEN_FROM, SILL_Y, SILL_Z + 140], COWL_TOP, PILLAR_W, PILLAR_D, true);
  // THE B-PILLAR: sill to cantrail, straight up at the door shut. It is the
  // reason the door-beam pass below can anchor two beams per side.
  strut("b-pillar", [stationX(DOOR_SHUT), SILL_Y, SILL_Z + 120], railAt(stationX(DOOR_SHUT)), PILLAR_W, PILLAR_D, true);
  // THE C-PILLAR: from the parcel-shelf corner up the backlight's edge.
  strut("c-pillar", [stationX(TAIL_SHUT), 600, shoulderZprofile(stationX(TAIL_SHUT)) + 20], cTop, PILLAR_W, PILLAR_D, true);
  beam("header-rail", {
    view: { kind: "front" as const },
    a: [-aTop[1], aTop[2] - 30], b: [aTop[1], aTop[2] + 30], depth: 64, at: SCREEN_TO - 32,
  });
  beam("rear-header", {
    view: { kind: "front" as const },
    a: [-cTop[1], cTop[2] - 30], b: [cTop[1], cTop[2] + 30], depth: 64, at: cTopX - 32,
  });
  strut("cantrail", aTop, cTop, 58, 58, true);
  for (const bx of [SCREEN_TO + (cTopX - SCREEN_TO) / 3, SCREEN_TO + (2 * (cTopX - SCREEN_TO)) / 3]) {
    beam(`roof-bow@${bx.toFixed(0)}`, {
      view: { kind: "front" as const },
      a: [-railPlanY(bx), crownZ(bx) - 74], b: [railPlanY(bx), crownZ(bx) - 30],
      depth: 52, at: bx - 26,
    });
  }

  // ── crash structure ─────────────────────────────────────────────────────
  // Both beams sit just inside their DOMED caps: the nose beam's face at
  // 110, fifty behind the cap's corners and a hundred behind its tip, so the
  // dome at the beam's own width still covers it. A metre of bay ahead of
  // the block and a whole boot behind the tank, so both strokes come out
  // longer than asked. Reported as asked-vs-got either way.
  const crushF = sub.crushStrokeFront?.value ?? 600;
  const crushR = sub.crushStrokeRear?.value ?? 450;
  const BEAM_D = 76;
  const noseBeamX = 110;
  const tailBeamX = LEN - 100 - BEAM_D;
  const tank = partBox("fuel-tank");
  crushFit = {
    frontAsked: crushF, frontGot: engine.lo[0] - noseBeamX,
    rearAsked: crushR, rearGot: tailBeamX - tank.hi[0],
  };
  for (const [nm, bx, z, half] of [
    ["bumper-front", noseBeamX, 400, 680], ["bumper-rear", tailBeamX, 540, 700],
  ] as const) {
    beam(nm, {
      view: { kind: "front" as const },
      a: [-half, z - 52], b: [half, z + 52], depth: 76, at: bx,
    });
  }
  strut("crush-rail-front", [noseBeamX + 40, BAY_Y, 400], [NOSE_END + 40, BAY_Y, 300], 62, 62, true);
  strut("crush-rail-rear", [tailBeamX - 20, RAIL_Y - 60, 540], [LEN - 300, RAIL_Y - 60, KICK_Z + 20], 62, 62, true);
  // Door intrusion beams — TWO per side now, one bar per door, and each ends
  // ON a pillar: A to B for the front door, B to the quarter for the rear.
  strut("door-beam", [SCREEN_FROM + 20, SILL_Y + 10, SILL_Z + 320],
    [stationX(DOOR_SHUT) - 20, SILL_Y + 20, SILL_Z + 350], 46, 92, true);
  strut("door-beam-rear", [stationX(DOOR_SHUT) + 20, SILL_Y + 20, SILL_Z + 350],
    [SEAT_BULK - 20, SILL_Y + 5, SILL_Z + 330], 46, 92, true);

  for (const id of [...s.state.cells.keys()] as Id[]) {
    if (frameBefore.has(id)) continue;
    frameCells.push(id);
    chassisCells.push(id);
  }
  members = kit.members;

  // ── body mounts ─────────────────────────────────────────────────────────
  // Fourth car, and the rule reads it the same way it read the tub: a
  // unibody's floor pan IS its longeron, so there is no joint for a pad to
  // span and every station comes back wrapped. The MX-5's subframe is still
  // the only car here with real pads.
  for (const x of MOUNT_X) {
    const padTop = undersideAt(x, RAIL_Y);
    if (!Number.isFinite(padTop) || padTop < RAIL_TOP + 1) { wrapped.push(x); continue; }
    beam(`mount@${x}`, {
      view: side,
      a: [x - MOUNT_PAD / 2, RAIL_TOP], b: [x + MOUNT_PAD / 2, padTop],
      depth: MOUNT_PAD, at: RAIL_Y - MOUNT_PAD / 2,
    }, true);
    mounts.push({ name: `mount@${x}`, at: [x, RAIL_Y, padTop], padHalf: MOUNT_PAD / 2 });
    mounts.push({ name: `mount@${x}-R`, at: [x, -RAIL_Y, padTop], padHalf: MOUNT_PAD / 2 });
  }
}

// ── the greenhouse, and the pillars this car does not bolt on ─────────────
// The MX-5 has a screen frame: two A-pillars and a header, separate solids
// bolted to a cowl, standing over an open body. A monocoque coupe has no such
// thing. Its pillars ARE the shell — pressed into the same panel as the roof
// and the quarter — and modelling them as add-on solids would be modelling a
// different car.
//
// So there is nothing to build here, and the glazing is not built either: it
// is ASSIGNED, to cells of the body that already exist. The roof rail earned
// its place exactly here. Between the two rings the deck band is screen,
// roof and backlight from front to back, and the sail band either side of it
// is A-pillar, door glass and C-pillar — which is the real decomposition of a
// closed car, arrived at by cutting the body in three bands rather than by
// hanging panes on it.
//
// WHAT IT COSTS. The glass is FLUSH with the surrounding surface rather than
// set into a rebate, because there is no way to author a hole in this tool
// and a rebate is a hole with a lip. On a car whose screen is bonded nearly
// flush that is a small lie; on a car with deep gutters it would be a large
// one. Said here rather than discovered in a render.
const pillarCells: Id[] = [];
const glazingCells: Id[] = [];

// ── the caps: a grille and a lamp band ────────────────────────────────────
// The domes went in before the first station cut. Now, with every cut made,
// each cap is CUT ACROSS: once on the nose, at the top of the grille, and
// twice on the tail, at the bottom and top of the lamp band. Each seam is a
// split and so safe here, and `capBand` re-bows it onto the dome so the
// pieces are still the dome. The heights are read off the cap's own edges
// rather than typed — a valance lip under the grille, the grille to 46% of
// the face; a diffuser across the bottom 30% of the tail, a valance, the
// lamp band from 55% to 72%, paint above — so a change to the rocker or
// the beltline moves them with it. Each cut is made on the piece the last
// one left above.
const bandZ = (cap: EndCap, f: number): number => cap.zBottom + (cap.zTop - cap.zBottom) * f;
const noseLip = capBand(capDeps, noseCap, noseCap.cells[0]!, bandZ(noseCap, 0.12));
const grille = capBand(capDeps, noseCap, noseLip.upper, bandZ(noseCap, 0.46));
const diffuser = capBand(capDeps, tailCap, tailCap.cells[0]!, bandZ(tailCap, 0.30));
const tailValance = capBand(capDeps, tailCap, diffuser.upper, bandZ(tailCap, 0.55));
const tailLamp = capBand(capDeps, tailCap, tailValance.upper, bandZ(tailCap, 0.72));
const grilleCell = grille.lower;
const splitterCell = noseLip.lower;
const lampCell = tailLamp.lower;
const diffuserCell = diffuser.lower;
// The cuts RETIRED the two original cells, so the set is rebuilt from what
// the caps say they are made of now.
capCells.clear();
for (const id of [...noseCap.cells, ...tailCap.cells]) capCells.add(id);

// Every edge of every cap piece breaks hard against what it meets, and is
// GAPPED as well as creased: a bumper is its own moulding, a grille its own
// frame, a lamp its own part. Marking them moves no geometry; it changes what
// the document admits, and it is what stops the field bending a cap out of
// its own dome trying to make the corner with the bonnet tangent-continuous.
{
  const done = new Set<Id>();
  for (const cellId of capCells) {
    for (const sd of s.state.cells.get(cellId)!.sides) {
      const id = s.state.resolveCurve(sd.curveId);
      if (done.has(id)) continue;
      done.add(id);
      s.apply("crease", { curveId: id });
      s.apply("gap", { curveId: id });
    }
  }
}

// ── materials ─────────────────────────────────────────────────────────────
// `assign-material` has existed since the first ratified verb list and no car
// has ever called it, so every render this tool has made painted the whole
// body one colour — including the glass, the folding top and the tyres. The
// panels above are what make it answerable: a material belongs to a panel,
// and until there were panels there was nothing to give one to.
//
// Two cells of one panel never disagree here. The classification is by
// geometry rather than by a list of ids, so it survives the stations moving.
// The catalogue decides what each of these IS — skin, structure, glazing,
// trim — and the render reads the class from the same place rather than
// sniffing the name. A body and its chassis in two different silvers is the
// whole reason the class exists.
const bodyCells = new Set<Id>();
/**
 * Skin, trim AND GLAZING — what actually closes over an occupant.
 *
 * The profile check wants the body without its glass, because a windscreen is
 * a separate assembly and sectioning it reports the screen as an error in the
 * bonnet. The CABIN lens wants the opposite: a roof made of glass is still a
 * roof, and on a fastback coupe the panel over the driver's head IS the
 * backlight. Handed skin-and-trim, the lens found a hole where the rear
 * window is and reported a head 206 mm through the roof as a head in the
 * open air.
 */
const envelopeCells = new Set<Id>();
/** The panels whose support is worth asking about, by what they are. */
const roofCells = new Set<Id>();
const doorCells = new Set<Id>();
const endCells = new Set<Id>();
const MATERIALS = {
  paint: CATALOGUE["Panoramic Bronze"]!,
  screen: CATALOGUE["windscreen"]!,
  backlight: CATALOGUE["backlight"]!,
  sideGlass: CATALOGUE["side glass"]!,
  chassis: CATALOGUE["chassis"]!,
  under: CATALOGUE["undertray"]!,
  // Two tyre names for a staggered fitment, and for the first time the
  // SIDEWALLS wear them: the rim is its own disc now.
  tyreFront: CATALOGUE["255/35R21"]!,
  tyreRear: CATALOGUE["295/35R21"]!,
  rim: CATALOGUE["forged alloy"]!,
  // The cap bands, and the lamps in the nose ring's two sail cells.
  grille: CATALOGUE["grille"]!,
  lamp: CATALOGUE["tail lamp"]!,
  diffuser: CATALOGUE["diffuser"]!,
  splitter: CATALOGUE["splitter"]!,
  headlamp: CATALOGUE["headlamp"]!,
} as const;

{
  const extentOf = (cellId: Id): [Pt3, Pt3] => {
    const cell = s.state.cells.get(cellId)!;
    const lo: Pt3 = [Infinity, Infinity, Infinity];
    const hi: Pt3 = [-Infinity, -Infinity, -Infinity];
    for (const sd of cell.sides) {
      const c = s.state.curves.get(s.state.resolveCurve(sd.curveId))!;
      for (let i = 0; i <= 6; i++) {
        const q = evalChain(c.chain, sd.t0 + (sd.t1 - sd.t0) * (i / 6));
        for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k]!, q[k]!); hi[k] = Math.max(hi[k]!, q[k]!); }
      }
    }
    return [lo, hi];
  };
  const wheelSet = new Set<Id>([...wheelTread, ...wheelDisc, ...rimCells]);
  const chassisSet = new Set<Id>(chassisCells);
  let painted = 0;
  const used = new Map<string, number>();
  const give = (cellId: Id, m: { name: string; color: string }): void => {
    s.apply("assign-material", { targetId: cellId, name: m.name, color: m.color });
    used.set(m.name, (used.get(m.name) ?? 0) + 1);
    painted++;
    // The profile check compares a BODY against a body, so it needs to know
    // which cells are one. Structure and glazing are separate assemblies and
    // sectioning them in reports the A-pillar as an error in the cowl.
    // The BODY is skin and trim together: the undertray is the bottom of the
    // same closed solid and the cockpit well is its inside. Splitting them out
    // leaves a shell with a hole in it, and a hole breaks every parity test
    // downstream — which is exactly how the first run of the chassis lens
    // reported half the frame as sticking out of the car.
    const klass = finishOf(m.name, m.color).surfaceClass;
    if (klass === "skin" || klass === "trim") bodyCells.add(cellId);
    if (klass === "skin" || klass === "trim" || klass === "glazing") envelopeCells.add(cellId);
  };
  // Tread AND sidewall are the tyre; only the rim's own drum is alloy.
  for (const id of [...wheelTread, ...wheelDisc]) {
    const [lo, hi] = extentOf(id);
    give(id, (lo[0]! + hi[0]!) / 2 < LEN / 2 ? MATERIALS.tyreFront : MATERIALS.tyreRear);
  }
  for (const id of rimCells) give(id, MATERIALS.rim);
  for (const id of chassisSet) give(id, MATERIALS.chassis);

  // THE THREE BANDS, and this is where the roof rail pays for itself. Every
  // body cell belongs to one of them and the band plus an x range names the
  // panel — no list of ids, so the classification survives a station moving.
  //
  //   ACROSS + low     the underside
  //   ACROSS + high    the centre band: bonnet centre, screen, roof, backlight
  //   SIDE  + at belt  the sail band: wing top, A-pillar, door glass, C-pillar
  //   SIDE  + at sill  the flank: valance, wing side, door skin, quarter
  //
  // A sail cell is told from a flank cell by its LOWEST point, which is the
  // beltline it stands on — exact by construction rather than a threshold,
  // because `shoulderZprofile` is the curve that put it there.
  for (const id of [...s.state.cells.keys()] as Id[]) {
    if (wheelSet.has(id) || chassisSet.has(id)) continue;
    const [lo, hi] = extentOf(id);
    const across = lo[1]! < -1 && hi[1]! > 1;
    const endFace = capCells.has(id);
    const mid = 0.5 * (lo[0]! + hi[0]!);
    const inBand = (from: number, to: number): boolean => mid > from + 1 && mid < to - 1;
    // EXACT BY CONSTRUCTION, not a threshold. The under band is everything
    // below the rocker and the deck band everything above the beltline, so
    // "is this cell entirely under the beltline" separates them with no
    // number to tune. The E-Type used `lo[2] < 480` and it worked there
    // because its nose is 552 mm tall at the tip; the F1's is 476, so the
    // same test paints the front of its bonnet as undertray.
    if (across && !endFace && hi[2]! < shoulderZprofile(mid)) { give(id, MATERIALS.under); continue; }
    if (across && !endFace) {
      // The centre band. Screen and backlight are glass; bonnet centre and
      // roof are paint. All four are the same surface and always were — a
      // windscreen IS the roof of a car for the length of the windscreen.
      if (inBand(SCREEN_FROM, SCREEN_TO)) give(id, MATERIALS.screen);
      else if (inBand(BACKLIGHT_FROM, BACKLIGHT_TO)) give(id, MATERIALS.backlight);
      else {
        if (inBand(SCREEN_TO, BACKLIGHT_FROM)) roofCells.add(id);
        give(id, MATERIALS.paint);
      }
      continue;
    }
    if (endFace) {
      // The caps: grille, lamp band, and paint for the rest of each dome.
      endCells.add(id);
      give(id, id === grilleCell ? MATERIALS.grille
        : id === splitterCell ? MATERIALS.splitter
        : id === lampCell ? MATERIALS.lamp
        : id === diffuserCell ? MATERIALS.diffuser
        : MATERIALS.paint);
      continue;
    }
    const isSail = !across && lo[2]! > shoulderZprofile(mid) - 25;
    if (isSail && inBand(GLASS_FROM, GLASS_TO)) give(id, MATERIALS.sideGlass);
    // THE HEADLAMPS are the nose ring's two sail cells: the band between the
    // wing's shoulder and the bonnet's edge, from the cap to the first
    // station — the upper corners of the face, wrapping onto the wing.
    // Assigned rather than authored, like the glazing: no cell was cut for
    // them, because the grammar already had the cell.
    else if (isSail && mid < stationX("nose-tip")) give(id, MATERIALS.headlamp);
    else {
      if (!across && !isSail && inBand(SCREEN_FROM, GLASS_TO)) doorCells.add(id);
      give(id, MATERIALS.paint);
    }
  }
  console.log(`  materials                 ${painted} cells · ` +
    [...used].map(([n, c]) => `${n} ${c}`).join(" · "));
}

s.apply("fair-corners", { maxBreakDeg: DEFAULT_CREASE_ANGLE });


// ── 3. surface and measure ────────────────────────────────────────────────
const quilt = computeQuilt(s.state);
const adj = quiltAdjacency(quilt);
const cross = tangentField(quilt, { adjacency: adj, order: 2 });

const g1 = continuityProbe(quilt, { adjacency: adj, cross });
// Unfielded means NO prescription at all — the plain Coons blend. Passing a
// field built with a zero option would have compared the car to itself, and
// an option the builder does not recognise is silently ignored: the first run
// of this script reported 66/66 joins already perfect and a field that moved
// the body 0.0 mm, which is what that mistake looks like from the outside.
const g1bare = continuityProbe(quilt, { adjacency: adj });
const g2 = curvatureJoinProbe(quilt, { adjacency: adj, cross });
const g3 = curvatureRateProbe(quilt, { cross });
const net = networkObstruction(quilt, { adjacency: adj });
const panels = panelsOf(quilt, adj);
const phi = fieldDisplacement(quilt, { cross });

const mesh = meshQuilt(quilt, { baseDensity: 20, cross });
const shaded = creaseNormals(mesh, DEFAULT_CREASE_ANGLE);
// Same print scale and nozzle as the P1: the groove is sized from the printer
// and back-scaled, so a 4 mm door gap at 1:24 is a feature that exists.
const GROOVE_SAMPLES = 400;
const shutlines: Pt3[] = [];
for (const id of quilt.gaps) {
  const chain = quilt.curves.get(id);
  if (!chain) continue;
  for (let i = 0; i <= GROOVE_SAMPLES; i++) shutlines.push(evalChain(chain, i / GROOVE_SAMPLES));
}
const grooved = engraveGrooves(mesh, shutlines, {
  scaleDenominator: 24, minPrintedFeatureMm: 0.4,
});
// Seat the car on the road: the ground plane is a datum, so the car meets it.
const seated = Float64Array.from(grooved.positions);
let minZ = Infinity;
for (let i = 2; i < seated.length; i += 3) minZ = Math.min(minZ, seated[i]!);
for (let i = 2; i < seated.length; i += 3) seated[i] = seated[i]! - minZ;
const printed = { positions: seated, indices: mesh.indices, ranges: mesh.ranges };
const check = closedMeshCheck(printed);
if (process.env["DBG"] === "1" && !check.closed) {
  for (const v of check.violations.slice(0, 12)) {
    const m = /edge (\d+)-(\d+)/.exec(v.detail);
    const at = m ? [Number(m[1]), Number(m[2])].map((i) =>
      `[${[0, 1, 2].map((k) => printed.positions[i * 3 + k]!.toFixed(1)).join(",")}]`).join(" .. ") : "";
    console.log(`  DBG violation ${v.kind} ${v.detail} ${at}`);
  }
}
// Does a car authored down both sides BUILD down both sides? Nothing asked
// until the fairing pass restyled one flank by 8.9 mm and every other probe
// called the body clean, because none of them compares a car to its own
// reflection. This one does, in millimetres.
const sym = mirrorSymmetry(printed);

// ── the cabin, against the person the packer placed ───────────────────────
// ── the body, and the structure, as separate meshes ───────────────────────
// Every lens that measures the BODY needs the body and not the car. The cabin
// lens was handed the whole print for two cars running — chassis, wheels and
// glazing included — and so read a beltline off a wheel and a roof off a roll
// hoop. It is split out here, once, above the first lens that needs it.
const bodySplit = ((): { body: SectionMesh; structure: SectionMesh; envelope: SectionMesh } => {
  const keep = new Uint8Array(printed.indices.length / 3);
  const struct = new Uint8Array(printed.indices.length / 3);
  // Containment applies to BURIED structure. A screen frame is structure that
  // stands proud of the body on purpose, so testing it for containment would
  // report a windscreen as an 885 mm protrusion — which the first run did.
  const structSet = new Set<Id>(chassisCells);
  for (const r of mesh.ranges) {
    const id = (r.id.endsWith("~m") ? r.id.slice(0, -2) : r.id) as Id;
    if (bodyCells.has(id)) for (let t = r.start; t < r.start + r.count; t += 3) keep[t / 3] = 1;
    else if (structSet.has(id)) for (let t = r.start; t < r.start + r.count; t += 3) struct[t / 3] = 1;
  }
  const env = new Uint8Array(printed.indices.length / 3);
  for (const r of mesh.ranges) {
    const id = (r.id.endsWith("~m") ? r.id.slice(0, -2) : r.id) as Id;
    if (envelopeCells.has(id)) for (let t = r.start; t < r.start + r.count; t += 3) env[t / 3] = 1;
  }
  const idx: number[] = [], structIdx: number[] = [], envIdx: number[] = [];
  for (let t = 0; t < printed.indices.length; t += 3) {
    const tri = [printed.indices[t]!, printed.indices[t + 1]!, printed.indices[t + 2]!];
    if (keep[t / 3]) idx.push(...tri); else if (struct[t / 3]) structIdx.push(...tri);
    if (env[t / 3]) envIdx.push(...tri);
  }
  return {
    body: { positions: printed.positions, indices: Uint32Array.from(idx) },
    structure: { positions: printed.positions, indices: Uint32Array.from(structIdx) },
    envelope: { positions: printed.positions, indices: Uint32Array.from(envIdx) },
  };
})();
const bodyMesh = bodySplit.body;
/**
 * Sampled points of one named set of cells — what a panel IS, as points.
 *
 * The support reading needs the skin of a PARTICULAR panel, because a roof
 * and a wing do not span the same distance and the lens must be asked about
 * one at a time.
 */
const panelPoints = (cells: ReadonlySet<Id>, limit = 500): Pt3[] => {
  const keep = new Uint8Array(printed.indices.length / 3);
  for (const r of mesh.ranges) {
    const id = (r.id.endsWith("~m") ? r.id.slice(0, -2) : r.id) as Id;
    if (cells.has(id)) for (let t = r.start; t < r.start + r.count; t += 3) keep[t / 3] = 1;
  }
  const seen = new Set<number>();
  for (let t = 0; t < printed.indices.length; t += 3) {
    if (!keep[t / 3]) continue;
    for (let k = 0; k < 3; k++) seen.add(printed.indices[t + k]!);
  }
  const all = [...seen].sort((a, b) => a - b);
  const step = Math.max(1, Math.floor(all.length / limit));
  const out: Pt3[] = [];
  for (let i = 0; i < all.length; i += step) {
    const v = all[i]!;
    out.push([printed.positions[v * 3]!, printed.positions[v * 3 + 1]!, printed.positions[v * 3 + 2]!]);
  }
  return out;
};
const structMesh = bodySplit.structure;
const envelopeMesh = bodySplit.envelope;

const person = personInBody();
const cabin = cabinLens(envelopeMesh, person, {
  seatsAbreast: 2,
  elbowGap: 120,
  headerTopZ: HEADER_TOP_Z,
  // Erect is the posture the tables are measured in and nobody drives in.
  // The 65 mm is the occupant module's own citation, unused until now.
  eyeSlumpMm: 65,
  stations: STATIONS.map((st) => st.x),
});

// The control net, and whether it is the same body. This is the whole claim
// of the export stage and it is worth re-asking on a car the machinery has
// never seen: the tiles ARE the surface, not a fit of it.
let tiles = 0, control = 0, degU = 0, degV = 0, netWorst = 0;
for (const cell of quilt.cells) {
  const b = cellBoundary(cell, quilt, cross);
  const cn = cellBezier(b, cross, { order: 2 });
  tiles += cn.tiles.length * cn.tiles[0]!.length;
  control += cn.controlPoints;
  degU = Math.max(degU, cn.degreeU);
  degV = Math.max(degV, cn.degreeV);
  for (let i = 0; i <= 9; i++) {
    for (let j = 0; j <= 9; j++) {
      const d = dist3(netAt(cn, i / 9, j / 9), boundaryCoonsPoint(b, i / 9, j / 9));
      if (d > netWorst) netWorst = d;
    }
  }
}

// Overall dimensions read off the BODY, twice: as authored and as surfaced.
// A Coons patch is pinned at its boundary and free in its interior, so a
// tangent-plane correction has nowhere to go but the interior and the car
// comes out a little larger than its own curve network. The P1 gains 75 mm of
// length that way. Quoting only one of these two numbers is how that went
// unnoticed for as long as it did.
const extent = (m: { positions: Float64Array }): [Pt3, Pt3] => {
  const lo: [number, number, number] = [Infinity, Infinity, Infinity];
  const hi: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < m.positions.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      lo[k] = Math.min(lo[k]!, m.positions[i + k]!);
      hi[k] = Math.max(hi[k]!, m.positions[i + k]!);
    }
  }
  return [lo, hi];
};
const size = (m: { positions: Float64Array }): [number, number, number] => {
  const [a, b] = extent(m);
  return [b[0]! - a[0]!, b[1]! - a[1]!, b[2]! - a[2]!];
};
const dims = (d: readonly number[]) => d.map((v) => Math.round(v)).join(" × ") + " mm";
// `cross: null` explicitly. Omitting it does NOT give the bare blend — the
// mesher derives a field when the option is absent, and says so in its own
// header: "Pass null to print the bare G0 blend, which nobody should get by
// forgetting." This line was forgetting, so "as authored" and "as built" were
// the same number and the field looked like it moved nothing.
const bareMesh = meshQuilt(quilt, { baseDensity: 20, cross: null });
const symBare = mirrorSymmetry(bareMesh);
const asBuilt = size(mesh);
const asAuthored = size(bareMesh);

// ── 4. emit ───────────────────────────────────────────────────────────────
const doc = s.save();
mkdirSync(new URL("../cars", import.meta.url), { recursive: true });
writeFileSync(new URL("../cars/panoramic-p2.car.json", import.meta.url), JSON.stringify(doc));
writeFileSync(new URL("../../panoramic-p2.stl", import.meta.url), writeStlBinary({ ...printed, normals: shaded.normals }, "panoramic-p2"));

const pad = (k: string) => k + " ".repeat(Math.max(0, 26 - k.length));
const line = (k: string, v: string) => console.log("  " + pad(k) + v);
const deg = (v: number) => (v < 1e-3 ? v.toExponential(1) : v.toFixed(3)) + "°";

console.log("\nPanoramic P2 — the sixth car, and the first designed here\n");
line("cells · curves · verbs", `${quilt.cells.length} · ${s.state.curves.size} · ${doc.verbs.length}`);
line("overall, as built", dims(asBuilt));
line("  as authored", dims(asAuthored));
line("  the brief", `${P2_LENGTH} × ${P2_WIDTH} × ${P2_HEIGHT} mm (ASSUMED — the owner's own, panoramic-p2.ts)`);
line("end caps", `nose domed ${noseCap.depth} mm · tail ${tailCap.depth} · ${noseCap.seams.length + tailCap.seams.length} band seams re-bowed onto the domes`);
line("wheels", `tyre shoulders R${TYRE_SHOULDER_R} · rims ${RIM_R.toFixed(0)} mm radius standing ${RIM_PROUD} proud of the sidewall`);
line("G1 continuity", `${g1.g1Joins}/${g1.joins} joins · median ${deg(g1.medianDeg)} · worst ${deg(g1.worstDeg)}`);
line("  was, unfielded", `${g1bare.g1Joins}/${g1bare.joins} · worst ${g1bare.worstDeg.toFixed(1)}°`);
line("G2 curvature", `${g2.g2Joins}/${g2.joins} within 1% · median rel ${(g2.medianRelative * 100).toFixed(4)}% · p90 ${(g2.p90Relative * 100).toFixed(3)}%`);
line("G3 curvature rate", `${g3.g3Joins}/${g3.joins} within 5% · median rel ${(g3.medianRelative * 100).toFixed(1)}% · median gap ${g3.medianGap.toExponential(1)} /mm² — measured, not corrected: the construction fits G2 and inherits its rate`);
line("curve network", `${net.cleanCorners}/${net.corners} corners coplanar · worst ${net.worstDeg.toFixed(2)}°`);
if (process.env["DBG"] === "1") {
  const ext = (cid: string) => {
    const cell = quilt.cells.find((q) => q.id === cid);
    if (!cell) return "?";
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (const sd of cell.sides) {
      const ch = quilt.curves.get(sd.curveId as Id);
      if (!ch) continue;
      for (const t of [0, 0.5, 1]) {
        const q = evalChain(ch, sd.t0 + (sd.t1 - sd.t0) * t);
        for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k]!, q[k]!); hi[k] = Math.max(hi[k]!, q[k]!); }
      }
    }
    return `${lo.map((v) => v.toFixed(0)).join(",")}..${hi.map((v) => v.toFixed(0)).join(",")}`;
  };
  for (const c of [...net.open].sort((a, b) => b.angleDeg - a.angleDeg).slice(0, 8)) {
    console.log(`  DBG corner ${c.angleDeg.toFixed(1)}° at [${c.at.map((v) => v.toFixed(0)).join(", ")}] · ${c.curveId} ${c.cellA}[${ext(c.cellA)}] | ${c.cellB}[${ext(c.cellB)}]`);
  }
}
// ── the feature lines, asked against delivered ────────────────────────────
// A radius is a number a designer says and a number a section finds, and the
// two are not the same number. `blendProbe` walks the built surface across
// each softened seam and reads the tightest radius along it from positions
// alone — nothing it uses came from the field the blend was made with — so a
// disagreement here is real. Published rather than assumed, like everything
// else in this report.
{
  const bl = blendProbe(quilt, { adjacency: adj, cross, stations: 5, samples: 60 });
  if (bl.edges > 0) {
    const asks = [...new Set(cross.blends.map((b) =>
      b.asked.end === undefined || b.asked.end === b.asked.start
        ? `R${b.asked.start}`
        : `R${b.asked.start}\u2192${b.asked.end}`))];
    line("feature lines", `${bl.edges} softened seam${bl.edges === 1 ? "" : "s"} · ${asks.join(", ")}`);
    line("  radius delivered", bl.live === 0
      ? "nothing to measure — every softened stretch has washed out"
      : `within ${(bl.medianRelative * 100).toFixed(0)}% median, ` +
        `${(bl.worstRelative * 100).toFixed(0)}% worst, over ${bl.live} live stations`);
    if (bl.washedOut > 0) {
      line("  washed out", `${bl.washedOut} of ${bl.stations} stations break by less than half a degree — ` +
        "the two surfaces have met and there is no line left to round. That is a feature line dying, " +
        "which is what they do, and it is why the radius above is measured only where there IS one");
    }
    line("  break left standing", bl.worstResidualDeg < 1e-6
      ? "none — every softened line is tangent-continuous at its own curve"
      : `${bl.worstResidualDeg.toFixed(2)}\u00b0 worst on ${bl.worstResidualAt} — inside the corner fade, ` +
        "where the correction is deliberately only part-applied so it cannot reach the next side along");
    line("  vs a rolling ball", `${bl.worstOffset.toFixed(2)} mm worst at ` +
      `[${bl.worstOffsetAt.map((v) => v.toFixed(0)).join(", ")}] — the edge stays ON the curve, ` +
      "so a true fillet would cut the corner off by this much and this body does not");
  }
}
line("field moved body", `${phi.median.toFixed(1)} mm median · ${phi.p90.toFixed(1)} p90 · ${phi.worst.toFixed(0)} worst`);
line("panels", `${panels.panels.length} pieces — ${bySize(panels).map((p) => p.cells.length).join(" + ")} cells`);
line("seams", `${panels.shutlines} shut · ${panels.features} feature · ${panels.smooth} smooth`);
line("control net", `(${degU},${degV}) · ${tiles.toLocaleString("en-GB")} tiles · ${control.toLocaleString("en-GB")} control points`);
line("  net vs evaluator", `${netWorst.toExponential(1)} mm worst, against a gate of 1e-9`);
line("closed mesh", `${check.closed} (${check.violations.length} violations)`);
line("mirror symmetry", `worst ${sym.worst.toFixed(4)} mm · ${sym.over} of ${sym.vertices.toLocaleString("en-GB")} vertices over ${sym.tolerance} mm`);
line("  bare blend", `worst ${symBare.worst.toFixed(4)} mm — the field's contribution is the difference`);
console.log("");
line("H-point (hip)", `[${person.hip.map((v) => v.toFixed(0)).join(", ")}] · eye [${person.eye.map((v) => v.toFixed(0)).join(", ")}] · head z ${person.head[2].toFixed(0)}`);
if (process.env["DBG"] === "1") {
  const hx = cabin.person.head[0];
  const sec = sectionAt(envelopeMesh, hx, cabin.person.head[2]);
  console.log(`  DBG head x ${hx.toFixed(0)} z ${cabin.person.head[2].toFixed(0)} · top ${sec.top.toFixed(0)} beltZ ${sec.beltZ.toFixed(0)} · roofed ${cabin.roofed}`);
}
line("head under the roof", !cabin.roofed
  ? `${cabin.headAboveBody >= 0 ? "+" : ""}${cabin.headAboveBody.toFixed(0)} mm above an OPEN body, which is the sky`
  : cabin.headroom! >= 0
    ? `${cabin.headroom!.toFixed(0)} mm of it`
    : `NONE — the head is ${(-cabin.headroom!).toFixed(0)} mm THROUGH the roof, which on a 1400 mm GT with two seat rows is a real fault`);
line("beltline above the hip", `${cabin.beltAboveHip.toFixed(0)} mm`);
// THE CLOSED-BODY LIMIT, and this car is the one that found it. A cabin is a
// VOID, and the mesher hands back a closed solid — so an open car's cockpit
// exists (it is a well cut into the top of the solid, and the lens reads its
// walls) and a coupe's does not. Every reading below that needs an interior
// comes back null on this body, or worse, finds the WHEELHOUSE and reports
// the gap between the two rear arches as hip room. Reported as the limit it
// is rather than as a number.
line("shoulder room", cabin.shoulderRoom === null
  ? "unreadable — a closed body is a solid here, so there is no interior to scan"
  : `${cabin.shoulderRoom.toFixed(0)} mm of ${cabin.shoulderRoomNeeded.toFixed(0)} needed, read at z ${cabin.shoulderRoomAtZ.toFixed(0)}`);
line("hip room", cabin.hipRoom === null ? "unreadable — see above" : `${cabin.hipRoom.toFixed(0)} mm, and on a closed body this is the gap between the WHEELHOUSES, not a cabin`);
// With the chassis inside the skin the lowest interior surface at this
// station is the TUNNEL, not the floor pan — so this reads hip-above-tunnel
// rather than hip-above-floor. Both are true; the label says which.
line("H-point above the floor", cabin.hipAboveWell === null
  ? "unreadable — no interior on a closed body, so there is no floor to measure to"
  : `${cabin.hipAboveWell.toFixed(0)} mm to the lowest interior surface at that station, and no seat cushion in the model`);
line("eye vs the header", cabin.eyeAboveHeader === null ? "no header" :
  `erect ${cabin.eyeAboveHeader >= 0 ? "+" : ""}${cabin.eyeAboveHeader.toFixed(0)} mm · relaxed ${cabin.eyeAboveHeaderRelaxed!.toFixed(0)} mm (negative = looking through the aperture)`);
line("eye aft of the H-point", `${(person.eye[0] - person.hip[0]).toFixed(0)} mm — a STRAIGHT-TORSO construction in @car/types/occupants; SAE's eye ellipse sits nearer 100 mm aft, so this over-rakes`);
line("cockpit opening", cabin.aperture === null || cabin.aperture.aft - cabin.aperture.fore < 1
  ? "NONE — the body is closed, which is correct and is why the readings above are null"
  : `x ${cabin.aperture.fore.toFixed(0)} to ${cabin.aperture.aft.toFixed(0)} (${(cabin.aperture.aft - cabin.aperture.fore).toFixed(0)} mm)`);
{
  const th = cabin.sections.filter((sc) => sc.x > 1900 && sc.x < 3300 && sc.width > 1200);
  const vals = th.map((sc) => sc.tumblehomeDeg).sort((a, b) => a - b);
  const med = vals.length ? vals[Math.floor(vals.length / 2)]! : 0;
  // A CAVEAT THIS CAR EARNED. `beltZ` is the highest point of the outer QUARTER
  // of the section, which is the beltline on an open car and is well up the
  // side glass on a coupe with real tumblehome. So the angle below is the
  // GREENHOUSE RAKE on this body, not a body-side lean, and the two are not
  // the same number. Left as the lens computes it and labelled, rather than
  // quietly redefined for one car.
  line("greenhouse rake", vals.length === 0 ? "no sections" :
    `median ${med.toFixed(1)}° · ${vals[0]!.toFixed(1)}° to ${vals[vals.length - 1]!.toFixed(1)}°`);
}
for (const f of cabin.faults) line("  cabin FAULT", f);

// ── the body against the brief ────────────────────────────────────────────
// The underlay, as arithmetic. This is what found the balloon: every station
// from a tenth of the length to nine tenths sat within five millimetres, and
// both TIPS were pinched to a point that inflated to full width over four
// hundred. `scripts/body-profile.ts` prints the whole table.
{
  const skin = bodyMesh;
  let worstW = 0, worstZ = 0, over = 0, atW = 0;
  // Twelve millimetres in from each end — the F1's calibration, kept, and
  // moot here: the table's first station is at 0.02 because both ends are
  // domes and a section at the tip reads a point.
  const END_INSET = 12;
  for (const st of P2_PROFILE) {
    const x = Math.min(LEN - END_INSET, Math.max(END_INSET, st.at * LEN));
    const sec = sectionAt(skin, x, 500);
    const dw = sec.width / 2 - st.halfWidth, dz = sec.top - st.top;
    if (Math.abs(dw) > Math.abs(worstW)) { worstW = dw; atW = x; }
    if (Math.abs(dz) > Math.abs(worstZ)) worstZ = dz;
    if (Math.abs(dw) > P2_PROFILE_TOLERANCE_MM || Math.abs(dz) > P2_PROFILE_TOLERANCE_MM) over++;
    if (process.env["DBG"] === "1") {
      console.log(`  DBG profile ${st.at.toFixed(2)} x${x.toFixed(0)} half ${(sec.width / 2).toFixed(0)}/${st.halfWidth} ${dw > 0 ? "+" : ""}${dw.toFixed(0)} · top ${sec.top.toFixed(0)}/${st.top} ${dz > 0 ? "+" : ""}${dz.toFixed(0)}`);
    }
  }
  // ── the two halves, against each other ─────────────────────────────────
  // The yin and yang, as three numbers. Containment says whether the structure
  // is hidden; clearance says whether a panel would read it through; the
  // mounts say whether the body sits on the frame or merely near it.
  const structure = structMesh;
  // The greenhouse is WELDED to the skin it carries, so its footprint is
  // contact rather than clearance — see `chassisFit`'s `contact`.
  const BONDED = /^(a-pillar|b-pillar|c-pillar|header-rail|rear-header|cantrail|roof-bow|door-beam|bumper-|sill|strut-tower)/;
  // AGAINST THE ENVELOPE, not the painted body. Containment asks whether the
  // structure is inside the CAR, and a windscreen is part of the car — so
  // testing against skin-and-trim puts a hole over the cabin and reports the
  // header rail under the screen as 264 mm outside the bodywork. The profile
  // check keeps the glassless body, because there a screen really would read
  // as an error in the bonnet. Two meshes, two questions.
  const fit = chassisFit(envelopeMesh, structure, mounts,
    { contact: members.filter((m) => BONDED.test(m.name)) });
  line("chassis hidden by the skin",
    `${fit.points - fit.outsideVisible} of ${fit.points} points · ${fit.exposedBelow} slung under the floor` +
    (fit.outsideVisible === 0
      ? " · nothing showing"
      : ` · worst protrusion ${fit.worstProtrusion.toFixed(0)} mm at [${fit.worstProtrusionAt.map((v) => v.toFixed(0)).join(", ")}]`));
  line("  skin clearance", `${fit.minClearance.toFixed(0)} mm closest at [${fit.minClearanceAt.map((v) => v.toFixed(0)).join(", ")}] · ` +
    `${fit.medianClearance.toFixed(0)} median · ${fit.tight} of ${fit.covered} covered points inside ${MIN_SKIN_CLEARANCE.value}`);
  line("  frame under the body", `${(fit.spanCoverage * 100).toFixed(0)}% of the length`);
  {
    const on = fit.mounts.filter((m) => m.standoff !== null && Math.abs(m.standoff) <= 15);
    if (fit.mounts.length === 0) {
      line("  body mounts", "NONE, and that is the reading. A unibody's floor pan IS its longeron — " +
        "pressed and welded as one shell — so where the skin wraps the member there is no joint " +
        "for a pad to span, and the pass says wrapped rather than inventing one");
    } else {
      line("  body mounts", `${on.length} of ${fit.mounts.length} carrying the body · standoff ` +
        fit.mounts.map((m) => m.standoff === null ? "—" : m.standoff.toFixed(0)).join(" / ") + " mm");
    }
    if (wrapped.length > 0) {
      line("  wrapped, not mounted", `x ${wrapped.join(", ")} — the body's underside is below the member there, ` +
        "so the structure is inside the bodywork and there is nothing for a pad to span");
    }
  }
  for (const f of fit.faults) line("  chassis FAULT", f);

  // ── the structure against itself, and against what it carries ──────────
  // The other half of the question `chassisFit` cannot ask. That one is about
  // the SKIN; this one is about whether the thing under the skin is a
  // structure at all — one body rather than several, with something in reach
  // of every part the solve placed and of all four wheels.
  const corners = [
    { name: "wheel-FL", at: [FRONT_AXLE_X, P2_FRONT_TRACK / 2, FRONT_AXLE_Z] as Pt3 },
    { name: "wheel-FR", at: [FRONT_AXLE_X, -P2_FRONT_TRACK / 2, FRONT_AXLE_Z] as Pt3 },
    { name: "wheel-RL", at: [REAR_AXLE_X, P2_REAR_TRACK / 2, REAR_AXLE_Z] as Pt3 },
    { name: "wheel-RR", at: [REAR_AXLE_X, -P2_REAR_TRACK / 2, REAR_AXLE_Z] as Pt3 },
  ];
  // The wheels are parts too, and the structure has to reach them like
  // anything else — but they are reported as CORNERS rather than as cargo,
  // because what reaches a wheel is a suspension link and what reaches a fuel
  // tank is a strap.
  const cargo = parts.filter((q) => !q.name.includes("wheel-tire") && !q.name.startsWith("substrate"));
  const frameRead = structureFit(members, cargo, corners);
  if (process.env["DBG"] === "1") {
    // The REGISTER against the MESH. They describe the same members and are
    // computed two different ways, so a disagreement means one of them is
    // wrong — which is the only way to catch a strut that never got mapped.
    let rlo = [Infinity, Infinity, Infinity], rhi = [-Infinity, -Infinity, -Infinity];
    for (const m of members) for (let k = 0; k < 3; k++) {
      rlo[k] = Math.min(rlo[k]!, m.lo[k]!); rhi[k] = Math.max(rhi[k]!, m.hi[k]!);
    }
    console.log(`  DBG register  ${rlo.map((v) => v.toFixed(0)).join(",")} .. ${rhi.map((v) => v.toFixed(0)).join(",")}`);
    for (const x of [200, 300, 434, 439]) {
      const sec = sliceSection(envelopeMesh, x);
      console.log(`  DBG slice x${x} segs ${sec.length} · scanAt(442) [${scanAt(sec, 442).map((v) => v.toFixed(0)).join(", ")}] · scanAt(500) [${scanAt(sec, 500).map((v) => v.toFixed(0)).join(", ")}]`);
    }
    const w = fit.worstProtrusionAt;
    for (const m of members) {
      const inBox = [0, 1, 2].every((k) => w[k]! >= m.lo[k]! - 3 && w[k]! <= m.hi[k]! + 3);
      if (inBox) console.log(`  DBG worst-protrusion member ${m.name} ${m.lo.map((v) => v.toFixed(0)).join(",")} .. ${m.hi.map((v) => v.toFixed(0)).join(",")}`);
    }
    const seen = new Set<number>();
    for (const i of structMesh.indices) seen.add(i);
    let mlo = [Infinity, Infinity, Infinity], mhi = [-Infinity, -Infinity, -Infinity];
    for (const i of seen) for (let k = 0; k < 3; k++) {
      mlo[k] = Math.min(mlo[k]!, structMesh.positions[i * 3 + k]!);
      mhi[k] = Math.max(mhi[k]!, structMesh.positions[i * 3 + k]!);
    }
    console.log(`  DBG mesh      ${mlo.map((v) => v.toFixed(0)).join(",")} .. ${mhi.map((v) => v.toFixed(0)).join(",")}`);
    for (const m of members.slice(0, 60)) {
      console.log(`  DBG member ${m.name.padEnd(22)} ${m.lo.map((v) => v.toFixed(0)).join(",")} .. ${m.hi.map((v) => v.toFixed(0)).join(",")}`);
    }
  }
  const held = frameRead.anchorage.filter((q) => q.carried).length;
  line("structure", `${frameRead.members} members · ` +
    (frameRead.islands.length === 1
      ? "one body"
      : `${frameRead.islands.length} bodies, which is ${frameRead.islands.length - 1} too many`));
  line("  parts carried", `${held} of ${cargo.length} have structure within reach` +
    (frameRead.orphanedKg === 0 ? "" : ` · ${frameRead.orphanedKg.toFixed(0)} kg with nothing under it`));
  line("  wheels carried", frameRead.corners.map((c) =>
    `${c.name.slice(-2)} ${c.gap.toFixed(0)}`).join(" / ") + " mm to the nearest member");
  // ── what the surfacing sits on ─────────────────────────────────────────
  // The question in Owen's words, and it needed pillars before it could be
  // asked at all. A roof is carried by bows and rails; a door skin by its
  // frame and one bar; a bumper moulding by the beam behind it. A wing is
  // carried at its edges and unsupported over its area ON PURPOSE, which is
  // why each panel is asked about separately and with its own reach.
  for (const [what, cells, reach] of [
    ["roof", roofCells, SKIN_REACH.value],
    ["doors", doorCells, 460],
    ["nose and tail", endCells, 340],
  ] as const) {
    const pts = panelPoints(cells);
    if (pts.length === 0) { line(`  ${what} carried`, "no cells of that kind"); continue; }
    const sup = skinSupport(members, pts, reach);
    line(`  ${what} carried`, `${sup.points - sup.over} of ${sup.points} points within ${reach} mm of a member · ` +
      `median ${sup.median.toFixed(0)} · worst ${sup.worst.toFixed(0)} at [${sup.worstAt.map((v) => v.toFixed(0)).join(", ")}]`);
    if (sup.over > 0) {
      line("  panel FAULT", `${sup.over} of ${sup.points} ${what} points have nothing within ${reach} mm holding them up — the surfacing is sitting on air there`);
    }
  }
  // ── what the package drove ─────────────────────────────────────────────
  // The report the inversion exists for. Every station where the contents
  // asked for more than the styling drew, with the part that asked. A car
  // whose shape is package-driven should be able to say WHERE, and which part.
  {
    // TWO SETS AND TWO VERBS, and the first version of this report ran them
    // together. `DRIVING` is the hard mechanical package and the body OBEYS
    // it — `railZ` is the larger of the drawn line and the demand, so a
    // taller engine raises a bonnet. `CONTAINED` is everything the car
    // carries and the body only HEARS about it. Printing the second set under
    // the heading "raised by the contents" said 27 stations had been raised on
    // a car where none had, which is a false report in a file whose whole
    // argument is that its reports are not.
    const obeyed = packageMisses(
      STATIONS.map((st) => ({ x: st.x, halfWidth: st.drawn.halfWidth, top: st.drawn.top, floor: st.drawn.floor })),
      STATIONS.map((st) => packageAt(DRIVING, st.x)),
    );
    const heard = packageMisses(
      STATIONS.map((st) => ({ x: st.x, halfWidth: st.drawn.halfWidth, top: st.drawn.top, floor: st.drawn.floor })),
      STATIONS.map((st) => packageAt(CONTAINED, st.x)),
    );
    const worstLift = Math.max(0, ...STATIONS.map((st) => packageLift(st.x)));
    if (obeyed.length === 0 && worstLift < 0.5) {
      // AND THIS IS THE ANSWER FOR THIS CAR, which is worth as much as a big
      // number would have been. The E-Type's bonnet is raised 58 mm by an XK
      // six it has to get over; the F1's rear deck is not raised at all,
      // because a dry-sumped V12 lying under an engine cover that has already
      // fallen 200 mm from the roof has room to spare. Same four links, aimed
      // backwards, reporting honestly that they did nothing.
      line("package vs styling", "the drawn body already contains the hard package — no station was raised. " +
        "The tallest demand under the bonnet is the engine at " +
        `${packageAt(DRIVING, 1200).top.toFixed(0)} mm against a bonnet drawn at ${crownZ(1200).toFixed(0)}`);
    } else {
      line("package vs styling", `${obeyed.length} station bound${obeyed.length === 1 ? "" : "s"} moved by the hard package · ` +
        `roofline lifted ${worstLift.toFixed(0)} mm · on a front-mid GT the package bites at the ` +
        "bonnet and the tunnel: the V8 under one, the propshaft under the other");
      for (const m of obeyed.slice(0, 6)) {
        line(`  ${m.what} at x ${m.x.toFixed(0)}`, `+${m.by.toFixed(0)} mm, asked for by ${m.driver}`);
      }
      if (obeyed.length > 6) line("  and", `${obeyed.length - 6} more`);
    }
    if (grounded.length > 0) {
      const worst = grounded.reduce((a, b) => (b.by > a.by ? b : a));
      line("  refused by the road", `${grounded.length} station${grounded.length === 1 ? "" : "s"} where the package ` +
        `asked to sit below ${GROUND_CLEARANCE} mm of ground clearance — worst ${worst.by.toFixed(0)} mm at x ` +
        `${worst.x.toFixed(0)}, asked for by ${worst.driver}. The brief wins; the demand is recorded, not obeyed`);
    }
    // What the body was told and did not obey, which is a different sentence.
    if (heard.length > 0) {
      const worst = heard.reduce((a, b) => (b.by > a.by ? b : a));
      const who = new Set(heard.map((m) => m.driver));
      line("  reported, not obeyed", `${heard.length} bounds from the SWEPT and OCCUPANT boxes — ` +
        `worst ${worst.what} +${worst.by.toFixed(0)} mm at x ${worst.x.toFixed(0)} from ${worst.driver}` +
        (who.size > 1 ? ` (and ${who.size - 1} other)` : "") +
        ". Neither is a solid the body must enclose; see DRIVING");
    }
  }
  // ── the crush strokes, asked for and got ───────────────────────────────
  // `makeSubstrate` publishes a stroke front and rear; a front-mid GT with a
  // long tail has room at both ends, and the over-delivery is a consequence
  // of the layout, reported as asked-vs-got like the F1's shortfall was.
  if (crushFit) {
    const pct = (a: number, b: number) => `${b.toFixed(0)} of ${a.toFixed(0)} mm (${((b / a) * 100).toFixed(0)}%)`;
    line("crush stroke", `front ${pct(crushFit.frontAsked, crushFit.frontGot)} · ` +
      `rear ${pct(crushFit.rearAsked, crushFit.rearGot)}`);
  }
  for (const f of frameRead.faults) line("  structure FAULT", f);

  line("profile vs the brief",
    `worst ${worstW.toFixed(0)} mm wide at x ${atW.toFixed(0)} · ${worstZ.toFixed(0)} mm tall · ` +
    `${over} of ${P2_PROFILE.length} stations outside ${P2_PROFILE_TOLERANCE_MM} mm (every station ASSUMED — the brief is the owner's)`);
}
line("triangles", `${(mesh.indices.length / 3).toLocaleString("en-GB")}`);
console.log("\nwrote cars/panoramic-p2.car.json and the STL beside it\n");
