/**
 * Build the McLaren F1 — the fourth car, and the first that is not
 * front-engined.
 *
 * Everything the other three share about their layout is wrong here. The
 * occupant is AHEAD of the engine and the nose is luggage; the driver sits on
 * the centreline with two passengers outboard; the roofline peaks at 0.42 of
 * the length where every previous car peaks at 0.70 or later; and the two axles
 * carry different wheels — 643 mm at the front, 715 at the rear — which no
 * build in this repository has had to draw before.
 *
 * WHAT THAT TESTS. The chain now runs from a powertrain's envelope through the
 * frame to the roofline, and it has only ever been asked to point forwards. On
 * this car the thing the engine drives is the REAR DECK: the S70/2 sits behind
 * the cabin, the subframe goes round it, and the height of the engine cover is
 * whatever that comes to. Point the same machinery backwards and see whether
 * it still resolves.
 *
 * Body datum: X = 0 at the NOSE, Y across from the centreline, Z up from the
 * ground plane. Millimetres.
 *
 *   npx tsx scripts/build-mclaren-f1.ts
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
  mclarenF1Config, F1_FRONT_DIAMETER, F1_FRONT_OVERHANG, F1_FRONT_TIRE_WIDTH, F1_FRONT_TRACK,
  F1_PROFILE, F1_PROFILE_TOLERANCE_MM, F1_REAR_DIAMETER, F1_REAR_OVERHANG,
  F1_REAR_TIRE_WIDTH, F1_REAR_TRACK, F1_HEIGHT, F1_LENGTH, F1_WHEELBASE, F1_WIDTH,
} from "@car/fixtures";
import { createSession } from "@car/history";
import { memberKit, suspensionCorner } from "./lib/members.js";
import { computeQuilt } from "@car/frame";
import {
  bySize, cellBezier, cellBoundary, continuityProbe, curvatureJoinProbe, fieldDisplacement,
  boundaryCoonsPoint, netAt, networkObstruction, panelsOf, quiltAdjacency, tangentField,
  DEFAULT_CREASE_ANGLE,
} from "@car/surface";
import {
  closedMeshCheck, creaseNormals, engraveGrooves, meshQuilt, mirrorSymmetry, writeStlBinary,
} from "@car/mesh";
import { dist3, evalChain } from "@car/num";

// ── 1. the packaging solve ────────────────────────────────────────────────
const config = mclarenF1Config;
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
    return [o[0] + pose.origin[0] + F1_FRONT_OVERHANG, DRIVER_Y, o[2] + pose.origin[2]];
  };
  return {
    heel: at(/^heel-/), hip: at(/^hip-/), eye: at(/^eye-/), head: at(/^head-/),
    shoulderHalfBreadth: shoulderBreadth95M().value / 2,
    shoulderAboveHip: shoulderAboveHip95M().value,
  };
};
/**
 * ZERO, and it is the only car here for which that is true.
 *
 * `driverSide: "centre"` in the config is not decoration: the whole package
 * turns on it. A central driver is why the pedal box can sit on the tub's
 * axis, why there is no steering-column offset to package round, why the
 * tunnel carries a loom instead of a shaft, and why the cabin readings below
 * are taken on the section's own centreline rather than 370 mm out.
 */
const DRIVER_Y = 0;

const NOSE = F1_FRONT_OVERHANG;
const FRONT_AXLE_X = NOSE;
const REAR_AXLE_X = NOSE + F1_WHEELBASE;
/**
 * TWO WHEEL DIAMETERS, which no build in this repository has had before.
 *
 * 643.3 mm at the front on a 235/45 and 715.3 at the rear on a 315/45 — a
 * 72 mm difference, and the rear tyre is 80 mm wider on a track 96 mm
 * NARROWER. Every previous car in here carries one `WHEEL_R`, one `ARCH_R`,
 * one `AXLE_Z`; the arch machinery below is per-axle for that reason and the
 * front and rear lips land at different heights and different half-widths
 * because the wheels under them are different wheels.
 *
 * TWENTY-FOUR MILLIMETRES OF RADIAL CLEARANCE, against the 46 the other two
 * cars carry, and the front axle forced it. The arch is a semicircle about
 * the axle, so its crown sits a wheel radius plus a clearance above the tyre:
 * at 46 that is 689 mm, on a car whose bodywork at the front axle is 685 mm
 * tall. The opening came out taller than the panel it is cut in, which put
 * the ROCKER above the BELTLINE and turned the whole flank band inside out —
 * a mushroom over the front wheel that no probe in the file objects to,
 * because none of them checks that a section's six curves are in order.
 *
 * 24 puts the crown at 667 and leaves 48 mm of body above it. And it is not a
 * fudge: an arch LIP is a panel edge, not a clearance envelope. The tyre
 * jounces up into the wheelhouse behind the lip, which is why a real car with
 * 55 mm of travel can and does run an opening this tight over a static tyre.
 */
const FRONT_WHEEL_R = F1_FRONT_DIAMETER / 2;
const REAR_WHEEL_R = F1_REAR_DIAMETER / 2;
const ARCH_CLEAR = 24;
const FRONT_ARCH_R = FRONT_WHEEL_R + ARCH_CLEAR;
const REAR_ARCH_R = REAR_WHEEL_R + ARCH_CLEAR;
/**
 * How far the lip stands proud of the tyre's outer face. SIX, not the twelve
 * the other cars carry, and the front axle is why.
 *
 * The F1's front track is 1568 on a body 1820 wide, so a 235 section tyre's
 * outer face sits at 901.5 mm against a body half-width of 910. There are
 * eight and a half millimetres between the tyre and the flank. Twelve would
 * push the lip outside the car; six leaves two and a half. That is not the
 * tool being clever — it is what the real car's front wing looks like, and
 * why it looks like that.
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
// A real car is the other way round. This one has that bonnet BECAUSE the XK
// six is 663 mm long and stands 620 tall and a tube frame has to get round
// it. So the parts come first, the frame's proportions come off the parts,
// and the BODY's own tables become a floor under the styling rather than the
// whole of it: where the two disagree the package wins and the report names
// the part that won it.

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
      pose.origin[0] + o[0] + F1_FRONT_OVERHANG,
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
 * The REAR subframe's proportions, as a pure function of what it carries.
 *
 * Same four readings the E-Type's front frame makes and every one of them
 * points the other way, which is the test. There the frame's nose came off
 * the radiator and its back off the bulkhead; here its FRONT face comes off
 * the engine's front face — which is the rear bulkhead, because on this car
 * the engine bolts straight to it and is a structural member — and its tail
 * off the gearbox. The tube spacing is still the engine's width plus a
 * clearance and the top is still the engine's own crown. Nothing in
 * `frameEnvelope` knew which end of the car it was at.
 *
 * `lowZ` is deliberately NOT here. It has a second bound, the body's own
 * underside, and that is not known until the body exists; the chassis block
 * settles it once both are.
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
 * WHAT DOES NOT DRIVE IT, and why. The first version clamped the body to
 * every placed part and produced a van: 1880 wide and 1518 tall against a
 * published 1657 by 1219. Two boxes did it.
 *
 *   The OCCUPANT ARRAY is one box from heel to head vertex, 990 to 2403 and
 *   1760 wide, and on this car it is over-stated twice over: its top is a
 *   95th-percentile male's head at 1315 mm on a car that is 1140 mm tall,
 *   and its WIDTH is three people abreast at one station when the F1's two
 *   passengers sit 300 mm behind the driver — which is the entire reason
 *   three of them fit in a car 1820 wide. Clamping to it would produce a
 *   different car twice. `cabinLens` says the height part in millimetres,
 *   which is where it belongs.
 *
 *   The SUSPENSION is a SWEPT volume, 1790 mm wide — the wheels through
 *   their travel and their lock, not a solid. A body is not required to
 *   enclose a swept volume; it is required to have arches over it, which is
 *   a different geometry the arch pass already authors.
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
const s = createSession("McLaren F1");
const side = { kind: "side" as const };

const LEN = F1_LENGTH, HW = F1_WIDTH / 2, FLOOR = 120, TOP = F1_HEIGHT;

s.apply("tape", {
  kind: "box",
  rect: { view: side, a: [0, FLOOR], b: [LEN, TOP], depth: HW * 2, at: -HW },
});

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

const curveMean = (id: Id): Pt3 => {
  const c = s.state.curves.get(s.state.resolveCurve(id));
  if (!c) throw new Error(`no curve ${id}`);
  let x = 0, y = 0, z = 0;
  const ts = [0, 0.25, 0.5, 0.75, 1];
  for (const t of ts) { const p = evalChain(c.chain, t); x += p[0]; y += p[1]; z += p[2]; }
  return [x / ts.length, y / ts.length, z / ts.length];
};

// ── the two master lines, and this car's third ────────────────────────────
// The F1's character is the opposite of the E-Type's and it is the same
// measurement that says so. The E-Type is a third of full width a tenth of
// the way back, because 1240 mm of nose sits ahead of its front axle. The F1
// has 760 mm of nose and a 643 mm front wheel inside it, so the tyre STARTS
// at x = 438 — a tenth of the length — and the bodywork has to be out to
// within nine millimetres of full width by then or the wheel is outside the
// car. 620 mm of swell in 429 mm of length. There is no long nose to draw a
// line down; there is a prow between two wings, and that is the whole front
// of this car in one number.
const track = (a: number, b: number, c: number, d: number) =>
  (t: number): number => [a, b, c, d][Math.round(t * 3)]!;

// The four numbers are STATIONS, not extremes, and a cubic forced through
// them overshoots between them — so the widest point of the car is at no
// station at all. The table says what the car should be and the SCRIPT solves
// for what to type: sample the fitted cubic, find its peak, and scale the
// plan tables until the peak is the published half-width.
const HALF_WIDTH = HW;                     // 1820 mm overall
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
// Four stations at x = 0, 1429, 2858 and 4287. The rocker is WIDER than the
// shoulder at three of them, which is true of no other car in here: on a
// mid-engined car with arch lips at the body's own maximum and a waist
// through the doors, the widest thing at a station over a wheel is the lip,
// and the lip is on the rocker.
const SHOULDER_Y = [200, 862, 884, 540] as const;
const ROCKER_Y = [230, 856, 872, 520] as const;
const planScale = HALF_WIDTH / Math.max(peakOf(SHOULDER_Y), peakOf(ROCKER_Y));
const scaled = (v: readonly [number, number, number, number]) =>
  track(v[0] * planScale, v[1] * planScale, v[2] * planScale, v[3] * planScale);

const shoulderY = scaled(SHOULDER_Y);
// The beltline climbs the whole length and never falls, which on a
// front-engined car would be impossible: there the belt is the bonnet's shut
// line and it drops over the boot. Here it is the door top ahead of the rear
// bulkhead and the engine cover's shoulder behind it, and the engine cover is
// the highest of the two.
const shoulderZ = track(452, 748, 878, 852);
const rockerY = scaled(ROCKER_Y);
const rockerZ = track(290, 150, 150, 430);

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
  const m: number[] = new Array(n).fill(0);
  m[0] = d[0]!;
  m[n - 1] = d[n - 2]!;
  for (let i = 1; i < n - 1; i++) {
    const a = d[i - 1]!, b = d[i]!;
    if (a * b <= 0) { m[i] = 0; continue; }
    const w1 = 2 * h[i]! + h[i - 1]!, w2 = h[i]! + 2 * h[i - 1]!;
    m[i] = (w1 + w2) / (w1 / a + w2 / b);
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
const railY0 = track(RAIL_Y0 * 0.23, RAIL_Y0 * 0.98, RAIL_Y0 * 0.93, RAIL_Y0 * 0.51);
const railZ0 = track(476, 940, 1014, 927);
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
    return [u * LEN, sign * yOf(u), zOf(u)];
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
// AND THE TWO ARCHES ARE NOT THE SAME ARCH. Every other body in this
// repository has one `WHEEL_R` and one `ARCH_R` and the front and rear
// openings are congruent. Here the rear arc is 36 mm larger in radius, its
// centre sits 36 mm higher, its mouths are 71 mm further apart — and its LIP
// IS NARROWER than the front's, because the rear track is 96 mm narrower and
// that beats the tyre being 80 mm wider. A car whose rear wheels are bigger
// and whose rear arches are further in.
const FRONT_LIP = F1_FRONT_TRACK / 2 + F1_FRONT_TIRE_WIDTH / 2 + ARCH_LIFT;
const REAR_LIP = F1_REAR_TRACK / 2 + F1_REAR_TIRE_WIDTH / 2 + ARCH_LIFT;
const FRONT_AXLE_Z = FRONT_WHEEL_R;
const REAR_AXLE_Z = REAR_WHEEL_R;
const [fA, fB] = archMouth(FRONT_AXLE_X, FRONT_ARCH_HALF);
const [rA, rB] = archMouth(REAR_AXLE_X, REAR_ARCH_HALF);
const ARCH_X = [0, fA, FRONT_AXLE_X, fB, rA, REAR_AXLE_X, rB, LEN];

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
  [0, 310], [150, 545], [300, 730], [fA, 866],
  [500, 901], [FRONT_AXLE_X, FRONT_LIP], [1060, 902], [fB, 880],
  [1450, 856], [1900, 840], [2350, 846], [2700, 868],
  [rA, 882], [3200, 893], [REAR_AXLE_X, REAR_LIP], [3800, 894], [rB, 874],
  [4073, 806], [4200, 712], [LEN, 606],
]);
/** Height of the rocker where it is a sill rather than an arch. */
const FRONT_MOUTH_Z = FRONT_AXLE_Z + FRONT_ARCH_R * Math.sin(ARCH_END);
const REAR_MOUTH_Z = REAR_AXLE_Z + REAR_ARCH_R * Math.sin(ARCH_END);
const rockerSillZ = profile([
  // Both ends are mouldings wrapped round a tip rather than plates bolted to
  // a cut-off — the lesson the MX-5's blunt-end pass paid for.
  //
  // THE KNOTS EITHER SIDE OF EACH MOUTH ARE THE POINT. A quarter circle
  // arrives at its mouth rising at 79 degrees and a sill that leaves flat
  // meets it with a corner nobody authored: on the E-Type that was eight
  // 87-degree obstructions and a 53 mm bulge where the tangent field tried to
  // blend across them. These pull the sill down steeply within 90 mm of the
  // lip, which is what an arch flange does.
  //
  // Between the arches it is 145 mm, and that is a deep sill on a 120 mm
  // ground clearance — 25 mm of daylight under a rocker 230 mm tall. It is
  // also the whole reason this car's doors open upwards.
  [0, 290], [fA - 240, 205], [fA - 90, 300], [fA, FRONT_MOUTH_Z],
  [fB, FRONT_MOUTH_Z], [fB + 90, 300], [fB + 240, 188],
  [1800, 145], [2400, 145],
  [rA - 240, 190], [rA - 90, 322], [rA, REAR_MOUTH_Z],
  [rB, REAR_MOUTH_Z], [rB + 90, 344], [rB + 240, 296], [4200, 352], [LEN, 430],
]);

/**
 * The beltline's plan, on the same seven spans as the rocker.
 *
 * THE WAIST IS HERE and it is most of what the F1 looks like from above. 866
 * at the cowl, 850 through the doors, 890 at the rear axle — a 40 mm tuck
 * between the arches, against a rocker that is at 907 over the front wheel.
 * Nothing forces the width between the tyres, so the car narrows there, and
 * the door is the tuck.
 */
const shoulderPlanY = profile([
  [0, 296], [150, 520], [300, 700], [fA, 800],
  [500, 862], [FRONT_AXLE_X, 890], [1060, 886], [fB, 874],
  [1290, 866], [1620, 856], [1900, 850], [2144, 852],
  [2486, 868], [2800, 880],
  [rA, 886], [3200, 890], [REAR_AXLE_X, 892], [3800, 886], [rB, 870],
  [4073, 800], [4200, 706], [LEN, 600],
]);

/**
 * The roof rail's plan and height — the third master line.
 *
 * PLAN is a TEARDROP and it is the other half of what this car looks like.
 * 610 mm at the cowl narrowing to 404 over the driver's head: the canopy
 * pulls in 206 mm as it rises 300, which is why the F1 reads as a bubble
 * sitting on a wide body rather than as a roof on a cabin. Ahead of the cowl
 * the same line is the wing crown, wider, because the nose panel between the
 * crowns is a wide flat thing and a canopy is not.
 *
 * HEIGHT is the top of the body AT that y. Both crown and rail come off this
 * one function so they cannot drift apart.
 */
const railPlanY = profile([
  [0, 196], [150, 330], [300, 442], [fA, 490],
  [500, 528], [FRONT_AXLE_X, 578], [1060, 606], [fB, 610],
  [1290, 600], [1450, 540], [1620, 470], [1780, 424],
  [1900, 412], [2144, 404], [2350, 410], [2486, 424], [2800, 468],
  [rA, 496], [3200, 508], [REAR_AXLE_X, 520], [3800, 502], [rB, 494],
  [4073, 442], [4200, 372], [LEN, 290],
]);
const railZdrawn = profile([
  [0, 476], [150, 530], [300, 592], [fA, 632],
  [500, 676], [FRONT_AXLE_X, 716], [1060, 756], [fB, 780],
  // The cowl, and then the screen: 296 mm of height in 490 mm of length, at
  // 0.30 of the car. On the E-Type the same event happens at 0.62.
  [1290, 850], [1450, 968], [1620, 1062], [1780, 1122],
  [1900, 1130], [2050, 1122], [2144, 1112],
  // Behind the canopy the deck falls onto the engine cover and then stops
  // falling. From 2486 to the rear axle the roofline loses 44 mm in a metre,
  // which is what an engine underneath a deck looks like from the side.
  [2350, 1074], [2486, 1037], [2800, 1016],
  [rA, 1004], [3200, 999], [REAR_AXLE_X, 993], [3800, 977], [rB, 970],
  [4073, 954], [4200, 934], [LEN, 912],
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
  // OVER EACH ARCH IT IS PINNED ABOVE THE CROWN. 700 at the front axle where
  // the arch crowns at 667; 900 at the rear where it crowns at 739. That
  // ordering is not decoration — a beltline below a rocker is a flank band
  // turned inside out, and it is what the first render of this car showed.
  [0, 452], [150, 494], [300, 560], [fA, 596],
  [500, 646], [FRONT_AXLE_X, 700], [1060, 708], [fB, 712],
  [1290, 736], [1450, 756], [1620, 776], [1780, 792],
  [1900, 802], [2144, 820], [2350, 838], [2486, 856], [2800, 878],
  [rA, 890], [3200, 896], [REAR_AXLE_X, 900], [3800, 890], [rB, 884],
  [4073, 866], [4200, 852], [LEN, 836],
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
 * The spans the BELTLINE and the ROOF RAIL are fitted on, and there are
 * thirteen of them where the rocker has seven.
 *
 * SEVEN IS NOT ENOUGH ON THIS CAR and the first build proved it. Between the
 * two arch mouths — fB at 1121 and rA at 3081 — sits one span 1960 mm long,
 * and on the E-Type that span is a bonnet: it climbs steadily and one cubic
 * carries it. On the F1 the same span contains the cowl, the whole
 * windscreen, the top of the car and the fall onto the engine cover. A cubic
 * through four samples of that overshoots between them, and it did: the roof
 * came out 92 mm above its own table at the screen base, at a station where
 * every number in the table is within four millimetres of the real car.
 *
 * Nothing was wrong with the tables. There were not enough places to put
 * them. The rocker keeps its seven because its middle spans are quarter
 * circles and a quarter circle IS a cubic to a tenth of a millimetre.
 */
const SPAN_X = [
  0, fA, FRONT_AXLE_X, fB,
  1290, 1620, 1900, 2144, 2486,
  rA, REAR_AXLE_X, rB, 4100, LEN,
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
  segmentAt(shoulder, forward, SPAN_X);
  const n = s.state.curves.get(s.state.resolveCurve(shoulder))!.chain.segs.length;
  if (n !== SPAN_X.length - 1) throw new Error(`shoulder has ${n} segments, expected ${SPAN_X.length - 1}`);
  fitChain(shoulder, (seg, local) => {
    const j = forward ? seg : n - 1 - seg;
    const k = forward ? local : 1 - local;
    const x = SPAN_X[j]! + (SPAN_X[j + 1]! - SPAN_X[j]!) * k;
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
  fitChain(rail, (seg, local) => {
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

  segmentAt(rocker, forward);
  const n = s.state.curves.get(s.state.resolveCurve(rocker))!.chain.segs.length;
  if (n !== 7) throw new Error(`rocker has ${n} segments, expected 7`);

  // Per axle, because the two arches are different sizes. `r` and `z` travel
  // with the entry rather than being read off one module-level constant, and
  // that is the whole of what a second wheel diameter costs the arch pass.
  const F = { axleX: FRONT_AXLE_X, r: FRONT_ARCH_R, z: FRONT_AXLE_Z };
  const R = { axleX: REAR_AXLE_X, r: REAR_ARCH_R, z: REAR_AXLE_Z };
  const arcOf = new Map<number, { axleX: number; r: number; z: number; from: number; to: number }>([
    [1, { ...F, from: Math.PI - ARCH_END, to: Math.PI / 2 }],
    [2, { ...F, from: Math.PI / 2, to: ARCH_END }],
    [4, { ...R, from: Math.PI - ARCH_END, to: Math.PI / 2 }],
    [5, { ...R, from: Math.PI / 2, to: ARCH_END }],
  ]);
  fitChain(rocker, (seg, local) => {
    const j = forward ? seg : 6 - seg;
    const k = forward ? local : 1 - local;
    const arc = arcOf.get(j);
    if (arc) {
      // A cubic fits 90 degrees to three parts in ten thousand: 0.1 mm here,
      // the same construction and the same figure as the wheels themselves.
      const a = arc.from + (arc.to - arc.from) * k;
      const x = arc.axleX + arc.r * Math.cos(a);
      return [x, sign * rockerPlanY(x), arc.z + arc.r * Math.sin(a)];
    }
    const x = ARCH_X[j]! + (ARCH_X[j + 1]! - ARCH_X[j]!) * k;
    return [x, sign * rockerPlanY(x), rockerSillZ(x)];
  });
}

// ── the frame, as numbers, hoisted ────────────────────────────────────────
// These belong to the chassis block four hundred lines down and are read here
// because the BODY has to know where the frame is. That is the whole of the
// yin and yang: a floor that does not know the rail height is a floor that
// happens to be near one.
const sub = mclarenF1Config.substrate;
const RAIL_Y = sub.railSpacing.value / 2;
const RAIL_H = sub.railSectionHeight.value, RAIL_W = sub.railSectionWidth.value;
const RAIL_Z = mclarenF1Config.placement.railHeight.value;
/** Top face of a rail — what a floor pan would land on. */
const RAIL_TOP = RAIL_Z + RAIL_H / 2;
/** Pad plan size, and the least daylight a pad is worth making. */
const MOUNT_PAD = 90, MOUNT_H = 12;
/** Stations with a crossmember, and so the candidates for a body mount. */
const MOUNT_X = [1290, 1900, 2400];
/**
 * Top of the transmission tunnel — propshaft, bellhousing and twin pipes.
 *
 * EXCEPT THAT THERE IS NO TRANSMISSION IN IT. The gearbox is 660 mm behind
 * the tub and there is no propshaft at all, so on this car the number is the
 * top of a rib carrying a loom and a gearchange cable — 90 mm, which the
 * config says in as many words. It is kept because the chassis lens still
 * measures against it, and because a spine on a tub is a real member even
 * when nothing runs through it.
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
  // NEGATIVE OVER THE NOSE, and it is the same fact the E-Type's bonnet
  // states: a wing crowns above the panel between the wings, so the centre
  // band sits BELOW its own rails there. The F1 has that valley too and it is
  // deeper, because its wings are further apart.
  [0, 6], [150, 3], [300, -2], [fA, -4],
  [500, -7], [FRONT_AXLE_X, -9], [1060, -8], [fB, -6],
  // Through the canopy the centreline is the HIGHEST part of the car and the
  // rise turns positive: a dome, not a valley. One cubic rail to rail carries
  // one extremum, so it cannot be both at once, which is why these are two
  // separate stretches of one table rather than one number.
  [1290, 0], [1620, 10], [1900, 14], [2144, 16],
  // And behind it the snorkel — the intake standing on the engine cover's
  // centreline, which is a crown of a different kind and the same sign.
  [2486, 18], [2800, 17], [rA, 16], [REAR_AXLE_X, 12], [rB, 9],
  [4200, 5], [LEN, 3],
]);
const crownZ = (x: number): number => railZ(x) + crownRise(x);

/** How low the car may sit, from the brief. Nothing below this is packageable. */
const GROUND_CLEARANCE = mclarenF1Config.brief.groundClearanceMm.value;
/** Stations where the package asked to go below the road and was refused. */
const grounded: { x: number; by: number; driver: string }[] = [];

const STATIONS: {
  x: number; roof: number; floor: number; hip: number; hipAt: number;
  sailBulge: number; name: string;
  drawn: { top: number; floor: number; halfWidth: number };
}[] = ([
  // The prow is BOWED, not faceted. A 400 mm half-width at the tip reached by
  // straight sail and flank bands is a wedge with a ridge down it, which is
  // what the first render showed; the bulge is what makes it a moulding
  // wrapped round a tip instead.
  { x: 100,  floor: 344, hip: 404, hipAt: 0.46, sailBulge: 14, name: "nose-tip" },
  { x: 250,  floor: 292, hip: 664, hipAt: 0.42, sailBulge: 20, name: "nose-mouth" },
  // The arch mouth is at 399, which is 52% of the way from the nose to the
  // front axle. There is no lead-in stretch on this car: the wing IS the
  // front of it.
  { x: archMouth(FRONT_AXLE_X, FRONT_ARCH_HALF)[0], floor: 200, hip: 870, hipAt: 0.30, sailBulge: 12, name: "arch-front-lead" },
  // hipAt 0.25 — the widest point of this section is the ARCH LIP, which is
  // the flank's own lower end. On the E-Type it is 0.56, half way up the
  // flank, because there the shoulder is the widest thing at every station.
  // Here the lip is at 907.5 and the beltline 190 mm above it is at 890, so
  // the flank is all but vertical and the widest point is near its foot.
  { x: FRONT_AXLE_X, floor: 160, hip: 910, hipAt: 0.25, sailBulge: 10, name: "front-axle" },
  { x: archMouth(FRONT_AXLE_X, FRONT_ARCH_HALF)[1], floor: 152, hip: 888, hipAt: 0.40, sailBulge: 12, name: "arch-front-trail" },
  // ── the greenhouse, and it starts a third of the way along the car ─────
  { x: 1290, floor: 146, hip: 872, hipAt: 0.44, sailBulge: 10, name: "cowl" },
  { x: 1450, floor: 143, hip: 866, hipAt: 0.48, sailBulge: 6,  name: "screen-base" },
  { x: 1620, floor: 141, hip: 862, hipAt: 0.50, sailBulge: 4,  name: "screen-mid" },
  { x: 1780, floor: 140, hip: 858, hipAt: 0.52, sailBulge: 3,  name: "header" },
  { x: 1900, floor: 140, hip: 856, hipAt: 0.54, sailBulge: 3,  name: "roof" },
  { x: 2144, floor: 142, hip: 858, hipAt: 0.55, sailBulge: 4,  name: "roof-rear" },
  { x: 2486, floor: 146, hip: 872, hipAt: 0.52, sailBulge: 6,  name: "backlight" },
  // ── and the engine deck ────────────────────────────────────────────────
  { x: 2800, floor: 152, hip: 884, hipAt: 0.44, sailBulge: 9,  name: "deck-front" },
  { x: archMouth(REAR_AXLE_X, REAR_ARCH_HALF)[0], floor: 158, hip: 892, hipAt: 0.55, sailBulge: 10, name: "arch-rear-lead" },
  { x: REAR_AXLE_X, floor: 170, hip: 902, hipAt: 0.30, sailBulge: 10, name: "rear-axle" },
  { x: archMouth(REAR_AXLE_X, REAR_ARCH_HALF)[1], floor: 210, hip: 880, hipAt: 0.40, sailBulge: 10, name: "arch-rear-trail" },
  { x: 4100, floor: 290, hip: 786, hipAt: 0.44, sailBulge: 8,  name: "tail" },
  { x: 4230, floor: 350, hip: 660, hipAt: 0.46, sailBulge: 4,  name: "tail-tuck" },
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
  setAcross(sec.under, st.x, st.floor, 0);
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
      setAcross(sections[i]!.under, st.x, st.floor, 0);
    }
  }
};
clearTheRails();

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
  // The rocker is SEVEN segments now, one per span, so its own parameter runs
  // uniformly over them and every mouth and crown sits at k/7 — whichever way
  // round the curve happens to run. Deriving these from x/LEN was right while
  // the rocker was a single cubic and is not any more.
  const stations = [1, 2, 3, 4, 5, 6].map((k) => k / 7);

  let head = rocker;
  const pieces: Id[] = [];
  let upper = 1;
  for (const t of [...stations].reverse()) {
    const before = new Set(s.state.curves.keys());
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
  for (const j of [1, 2, 4, 5]) {
    s.apply("crease", { curveId: inX[j]! });
    archSpans.push(inX[j]!);
  }
}

// ── panel gaps ────────────────────────────────────────────────────────────
// A panel is a connected run of cells with the GAP-marked curves cut, and
// this car has THREE of them over its whole length.
//
// TWO CLAMSHELLS AND A PAIR OF DOORS. Everything ahead of the cowl is one
// forward-hinged piece — nose, both front wings, the lamp fairings, the mouth
// surround. Everything behind the cabin is one rearward-hinged piece — engine
// cover, both haunches, the tail. Between them are the doors. Three pressings
// and a cabin, which is what a carbon tub with bodywork hung off it looks
// like, and it is why both shuts here are RINGS: a full cross-section bar the
// underside, deck and sails and flanks down to the sill.
//
// AND THIS CAR HAS NO DRIP RAIL, which is the difference the F1 makes to the
// seam the E-Type needed. There the door shut runs up the A-pillar, along the
// roof rail and down the C-pillar, so the rail between the two rings is a
// gap. Here the doors are dihedral and they TAKE THE ROOF WITH THEM: the shut
// crosses the roof rather than following it, which the two rings already say,
// and there is no longitudinal seam over the cabin at all. The roof rail
// through the greenhouse is marked as nothing, because on this car it is
// nothing — the same curve, the same geometry, a different car's answer.
//
// Ahead of the cowl that line is not nothing. It is the fold between the nose
// valley and the wing crown, which every photograph of this car shows and
// which is a character line rather than a shut: creased, not gapped.
//
// The rule the arches taught still holds and everything below obeys it:
// splitting moves nothing and is safe after the cuts; shaping is not. No
// control point moves in this section.

const NOSE_SHUT = "cowl";        // x = 1290 — the front clamshell's rear edge
const TAIL_SHUT = "backlight";   // x = 2486 — the rear clamshell's front edge

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

// THE TWO RINGS. Each is one station's whole cross-section bar the underside:
// over the roof, down both sails, down both flanks to the sill. Creased as
// well as gapped, because a shut line IS a tangent break — the panel either
// side of it is a separate pressing and its surface does not have to agree.
for (const name of [NOSE_SHUT, TAIL_SHUT]) {
  const sec = stationOf(name);
  for (const id of [sec.deck, ...sec.sails, ...sec.flanks]) {
    s.apply("crease", { curveId: id });
    s.apply("gap", { curveId: id });
  }
}

// THE SILL, end to end. Every unibody has a pinch weld down there where the
// body side outer meets the floor pan, and every one of them shows it. On
// this car it is also the bonnet's own lower edge for the whole of the front
// half, which is what makes that panel as big as it is.
for (const rocker of rockerIds) {
  for (const id of rockerSpans.get(rocker)!) s.apply("gap", { curveId: id });
}

// THE ROOF RAIL IS MARKED AS NOTHING, ANYWHERE, and it is the only line in
// the file that is. It is still SPLIT at both rings, because a curve that
// spans three panels has to be able to belong to three panels, but no piece
// of it is creased and no piece is gapped.
//
// Over the cabin there is nothing to mark: the doors take the roof with them,
// so the shut crosses the rail rather than following it and the two rings
// already say so. Ahead of the cowl the line IS the wing crown, and creasing
// it was tried: it puts a hard chine down the length of a bonnet that is one
// pressing, and the nose came out as two flat planes meeting at a ridge. A
// crown is a fold in a surface, not a fold in a panel, and the tangent field
// is the thing that knows the difference.
for (const rail of railIds) {
  cutSpanAt(cutSpanAt(rail, stationX(NOSE_SHUT))[1], stationX(TAIL_SHUT));
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

// THE TAIL EDGE. Where the engine cover stops and the tail panel starts there
// is a hard line across the whole width of this car and down both quarters —
// the diffuser's top edge continued upward, and the reason the F1's back reads
// as a cut-off rather than as a taper. The network says the same thing in
// degrees: 45.8 across the deck band at that station, which is past anything a
// tangent field should be asked to blend and is a break the author should own.
for (const id of (() => { const sec = stationOf("tail-tuck"); return [sec.deck, ...sec.sails, ...sec.flanks]; })()) {
  s.apply("crease", { curveId: id });
}

// The lamp fairings are a rise in the wing here and not two glazed pods, and
// the reason is the one the wheel arches ran into: a station curve is ONE
// cubic across the car, so it can carry a crown but not two bumps with a
// valley between them. Authoring the real fairings needs a way to split a
// curve ACROSS the car the way A13 splits one along it.

// ── wheels ────────────────────────────────────────────────────────────────
// Same construction as the P1: eight cubic arcs, no cuts. A cubic fits a 90°
// arc to three parts in ten thousand, which at this radius is 0.09 mm.
const wheelTread: Id[] = [];
const wheelDisc: Id[] = [];
const wheel = (cx: number, radius: number, halfWidth: number, yIn: number): void => {
  const before = new Set(s.state.curves.keys());
  const cellsBefore = new Set(s.state.cells.keys());
  s.apply("tape", {
    kind: "box",
    rect: { view: side, a: [cx - radius, 0], b: [cx + radius, radius * 2], depth: halfWidth * 2, at: yIn },
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
  const angleAt = (p: Pt3): number => Math.atan2(p[2] - radius, p[0] - cx);
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
      return [cx + radius * Math.cos(a), y, radius + radius * Math.sin(a)];
    });
  }
  for (const id of made) if (acrossCar(id)) straighten(id);
  for (const id of made) if (!acrossCar(id)) s.apply("crease", { curveId: id });
  // A tyre and a rim are not the same material, and the box already knows
  // which is which: the two faces at constant y are the wheel, the four that
  // were fitted to arcs are the tread.
  for (const id of [...s.state.cells.keys()] as Id[]) {
    if (cellsBefore.has(id)) continue;
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
// FOUR WHEELS, TWO SIZES. The tyre's half-section and its radius travel
// together per axle, which is the last place in the body pass that had to be
// told there are two of them.
const F_HALF = F1_FRONT_TIRE_WIDTH / 2;
const R_HALF = F1_REAR_TIRE_WIDTH / 2;
if (process.env["NOWHEELS"] !== "1") {
  wheel(FRONT_AXLE_X, FRONT_WHEEL_R, F_HALF, F1_FRONT_TRACK / 2 - F_HALF);
  wheel(REAR_AXLE_X, REAR_WHEEL_R, R_HALF, F1_REAR_TRACK / 2 - R_HALF);
}

// ── where the greenhouse begins and ends ──────────────────────────────────
// Hoisted above the chassis because the STRUCTURE under the roof is built on
// the same four stations the glass is, and a pillar that does not know where
// the windscreen ends is a pillar somebody typed.
const SCREEN_FROM = stationX(NOSE_SHUT);      // 1290 — the cowl
const SCREEN_TO = stationX("header");         // 1780 — the header rail
/**
 * THE DOOR GLASS STARTS AT THE SCREEN BASE, not at the header, and this car
 * is the first that had to say so.
 *
 * On a car with an upright screen the two are nearly the same station and it
 * does not matter which you pick. The F1's screen is raked 31 degrees over
 * 490 mm of length, so taking the header put 490 mm of PAINT in the sail band
 * beside the windscreen — an A-pillar half a metre wide, which is exactly what
 * the first render showed and looked like a fin.
 *
 * A pillar is as wide as a pillar. The glass starts 160 mm behind the cowl and
 * runs to the rear bulkhead, which is 1036 mm of side glass in one piece and
 * is what a dihedral door on this car actually carries.
 */
const GLASS_FROM = stationX("screen-base");   // 1450
const GLASS_TO = stationX(TAIL_SHUT);         // 2486
const BACKLIGHT_FROM = stationX("roof-rear"); // 2144
const BACKLIGHT_TO = stationX(TAIL_SHUT);     // 2486
/** Top of the windscreen header — the number the cabin lens reads the eye against. */
const HEADER_TOP_Z = crownZ(SCREEN_TO);

// ── the chassis: a TUB, and two things bolted to its ends ────────────────
// A McLaren F1 is a carbon monocoque with the engine bolted to the back of it
// as a stressed member, a light subframe hung off the engine and gearbox
// carrying the rear suspension, and an aluminium-and-Nomex crash structure on
// the front carrying the front suspension, the rack and the luggage. Three
// pieces, and the middle one is the car.
//
// THAT IS A THIRD CONSTRUCTION STYLE and the tool has two. `makeSubstrate`
// knows "body-on-frame" and "unibody"; a tub with structural bodywork bolted
// to it is neither, and the substrate here is declared as body-on-frame
// because that is the nearer of the two lies. The consequence is visible
// below and reported at the end: the mount pass looks for daylight between a
// rail top and a floor pan and finds none, because on a tub the longeron is
// INSIDE the body rather than under it. The E-Type reached the same answer
// from the other direction and for the same reason.
//
// WHAT IS READ RATHER THAN TYPED, and it is the same list as the E-Type's
// pointing backwards: the subframe's front face is the engine's front face
// (they are bolted together), its tail is the gearbox's, its tube spacing is
// the engine's width plus a clearance, its top is the engine's crown. The
// greenhouse is read off the two master lines. The suspension is read off the
// track and the wheel radius — per axle now, because this car's are different
// sizes.
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

  // ── what the subframe has to fit round ─────────────────────────────────
  // Read, not typed. `FRAME.front` IS the rear bulkhead: the engine bolts to
  // it, so the face the tub ends on and the face the block starts on are one
  // face, and neither of them is a number anybody chose.
  const { engine, front: FRAME_FRONT, tail: FRAME_TAIL, lowY: LOW_Y, upY: UP_Y, upZ: UP_Z } = FRAME;

  // ── the tub ─────────────────────────────────────────────────────────────
  // From the pedal bulkhead to the engine bulkhead, and it is the whole of
  // the car's stiffness. Both ends are read: the front off the pedal box the
  // solve placed, the rear off the engine.
  const pedals = partBox("brakes");
  const TUB_FRONT = Math.min(pedals.lo[0] - 40, FRONT_AXLE_X - 320);
  const TUB_REAR = FRAME_FRONT;
  // Floor longerons, either side of the driver. On a tub these sit ON the
  // floor pan rather than under it, which is the whole structural difference
  // and the reason the mount pass below comes out the way it does.
  beam("longeron", {
    view: side,
    a: [TUB_FRONT, RAIL_Z - RAIL_H / 2], b: [TUB_REAR, RAIL_Z + RAIL_H / 2],
    depth: RAIL_W, at: RAIL_Y - RAIL_W / 2,
  }, true);
  // The sills, and on this car they ARE the structure. 230 mm deep against
  // the E-Type's 160 and the MX-5's, because a tub with no roof rails to help
  // it carries every bit of its bending down there — and because the doors
  // cut into the roof, so there is nothing above the beltline to carry any.
  // It is also why you climb over one to get in.
  const SILL_Y = 660;
  const SILL_Z = 145;
  beam("sill", {
    view: side,
    a: [TUB_FRONT, SILL_Z], b: [TUB_REAR, SILL_Z + sub.rockerHeight.value],
    depth: sub.rockerWidth.value, at: SILL_Y - sub.rockerWidth.value / 2,
  }, true);

  // The spine. NOT a transmission tunnel — there is no propshaft on this car
  // and the gearbox is 660 mm behind the tub — so it is sized by the loom and
  // the gearchange the config declares and nothing else. On the E-Type the
  // same beam is 1300 mm long and wraps a bellhousing; here it is a rib.
  beam("spine", {
    view: side,
    a: [TUB_FRONT + 80, RAIL_Z - RAIL_H / 2], b: [TUB_REAR - 60, TUNNEL_TOP],
    depth: sub.tunnelWidth.value, at: -sub.tunnelWidth.value / 2,
  });
  // The two bulkheads. The REAR one is the interface the whole car turns on:
  // the engine bolts to it, the subframe hangs off the engine, and the tub
  // ends there. It is placed at the engine's own front face, read.
  // CLAMPED TO THE BODY, because the tub's front bulkhead stands in the
  // NOSE and the nose of this car is 610 mm tall. A pedal bulkhead drawn at
  // the height a dash bulkhead wants puts 84 mm of carbon through the top of
  // the bonnet, which is exactly what the first run reported and where.
  const BULKHEAD_CLEAR = 60;
  const frontBulkTop = Math.min(700, crownZ(TUB_FRONT) - BULKHEAD_CLEAR);
  beam("bulkhead-front", {
    view: { kind: "front" as const },
    a: [-SILL_Y, SILL_Z], b: [SILL_Y, frontBulkTop], depth: 58, at: TUB_FRONT,
  });
  beam("bulkhead-rear", {
    view: { kind: "front" as const },
    a: [-SILL_Y, SILL_Z], b: [SILL_Y, Math.min(860, crownZ(TUB_REAR) - BULKHEAD_CLEAR)],
    depth: 58, at: TUB_REAR - 58,
  });
  beam("dash-crossmember", {
    view: { kind: "front" as const },
    a: [-SILL_Y + 40, 620], b: [SILL_Y - 40, Math.min(700, crownZ(SCREEN_FROM) - BULKHEAD_CLEAR)],
    depth: 70, at: SCREEN_FROM,
  });
  beam("seat-crossmember", {
    view: { kind: "front" as const },
    a: [-RAIL_Y - RAIL_W / 2, RAIL_Z - RAIL_H / 2], b: [RAIL_Y + RAIL_W / 2, RAIL_Z + RAIL_H / 2],
    depth: 70, at: 1900,
  });

  for (const id of [...s.state.cells.keys()] as Id[]) {
    if (chassisBefore.has(id)) continue;
    chassisCells.push(id);
  }

  // ── the rear subframe ───────────────────────────────────────────────────
  // Square tube off the back of the engine, carrying the rear suspension and
  // the tail. It is small and it is meant to be: the engine and gearbox are
  // structural, so this frame does not have to be a chassis — it has to hold
  // the wheels onto one.
  //
  // AND ITS LOWER RAIL IS CLAMPED TO THE BODY, the same way the E-Type's ring
  // is. Reading the tube's height off the engine alone put that car's lower
  // rail 24 mm out through the valance, because an engine does not know where
  // the underside is. Here the bound is read across the whole span rather
  // than under the tube: over the rear axle the underbody is an arch curling
  // into the wheelhouse, so it is 170 mm on the centreline and past 400 at
  // the rocker, and a horizontal rail is only inside the car if it clears the
  // arch's HIGHEST point.
  const frameBefore = new Set(s.state.cells.keys());
  let underWorst = 0;
  for (let k = 0; k <= 16; k++) {
    const u = undersideAt(FRAME_TAIL, (rockerPlanY(FRAME_TAIL) * k) / 16);
    if (Number.isFinite(u) && u > underWorst) underWorst = u;
  }
  const LOW_Z = Math.max(RAIL_Z - RAIL_H / 2, engine.lo[2] + 120, underWorst + TUBE);
  if (process.env["DBG"] === "1") {
    console.log(`  DBG frame LOW_Z ${LOW_Z.toFixed(0)} underWorst ${underWorst.toFixed(0)} FRAME_FRONT ${FRAME_FRONT.toFixed(0)} FRAME_TAIL ${FRAME_TAIL.toFixed(0)} LOW_Y ${LOW_Y.toFixed(0)} UP_Y ${UP_Y.toFixed(0)}`);
  }
  beam("subframe-lower", {
    view: side,
    a: [FRAME_FRONT, LOW_Z - TUBE / 2], b: [FRAME_TAIL, LOW_Z + TUBE / 2],
    depth: TUBE, at: LOW_Y - TUBE / 2,
  }, true);
  // THE UPPER TUBE SLOPES, and it has to. Run it level at the engine's own
  // crown and it leaves the engine cover before the tail, because the deck is
  // falling and the engine is not there any more. So its BACK end comes off
  // the body — `crownZ` at the subframe's tail, less the clearance a panel
  // wants over a tube — and its front off the ENGINE. Both ends are read.
  // The E-Type's version of this member slopes the other way for the same
  // reason, which is the only difference between them.
  const RING_TOP = Math.min(UP_Z, crownZ(FRAME_TAIL) - 92);
  strut("subframe-upper", [FRAME_FRONT, UP_Y, UP_Z], [FRAME_TAIL, UP_Y, RING_TOP], TUBE, TUBE, true);
  const midX = (FRAME_FRONT + FRAME_TAIL) / 2;
  const midZ = (UP_Z + RING_TOP) / 2;
  strut("subframe-diag-fwd", [FRAME_FRONT + 40, LOW_Y, LOW_Z], [midX, UP_Y, midZ], TUBE, TUBE, true);
  strut("subframe-diag-aft", [midX, LOW_Y, LOW_Z], [FRAME_TAIL - 40, UP_Y, RING_TOP], TUBE, TUBE, true);
  // The ring at the tail: what the gearbox's rear mount, the diffuser and the
  // rear crash structure all pick up on.
  for (const [nm, z] of [["subframe-ring-lower", LOW_Z], ["subframe-ring-upper", RING_TOP]] as const) {
    beam(nm, { view: { kind: "front" as const }, a: [-UP_Y, z - TUBE / 2], b: [UP_Y, z + TUBE / 2], depth: TUBE, at: FRAME_TAIL });
  }
  beam("subframe-ring-post", {
    view: side, a: [FRAME_TAIL - TUBE, LOW_Z], b: [FRAME_TAIL, RING_TOP], depth: TUBE, at: UP_Y - TUBE / 2,
  }, true);
  // ENGINE MOUNTS, and on this car they are not brackets. The block is a
  // structural member: it takes the subframe's loads into the rear bulkhead,
  // which is why there are four of them and why they are as big as they are.
  for (const dz of [0, 1]) {
    const z = engine.lo[2] + 90 + dz * 300;
    strut(`engine-mount@${z.toFixed(0)}`, [TUB_REAR, LOW_Y - 40, z], [engine.lo[0] + 60, engine.hi[1], z], 54, 54, true);
  }

  // ── the front structure ─────────────────────────────────────────────────
  // Two longerons from the pedal bulkhead forward to a nose beam, and the
  // front suspension on them. It carries the luggage bay and it is designed
  // to be destroyed; the tub behind it is not.
  const NOSE_END = 150;
  // 430 and not 470. The upper rail runs to the pedal bulkhead at x = 440,
  // where the body's crown is 615 and its underside 220, and a rail whose top
  // face sits at 487 leaves nothing between it and the bonnet. The chassis
  // lens read six points out through the nose at 181 mm; this is the fix, and
  // it is the same reading the E-Type's upper tube gets from `crownZ`.
  const FRONT_LOW_Z = 250, FRONT_UP_Z = 430;
  const FRONT_Y = 300;
  for (const [nm, z] of [["front-rail-lower", FRONT_LOW_Z], ["front-rail-upper", FRONT_UP_Z]] as const) {
    beam(nm, {
      view: side, a: [NOSE_END, z - TUBE / 2], b: [TUB_FRONT, z + TUBE / 2],
      depth: TUBE, at: FRONT_Y - TUBE / 2,
    }, true);
  }
  strut("front-diag", [NOSE_END + 40, FRONT_Y, FRONT_LOW_Z], [TUB_FRONT - 40, FRONT_Y, FRONT_UP_Z], TUBE, TUBE, true);

  // ── the suspension, which is what makes a wheel part of the car ────────
  // Everything below is geometry off the track, the wheel radius and the
  // structure the links pick up on — PER AXLE, because this car's two axles
  // are not the same axle. Nothing is typed that the car does not know.
  const F_HUB_Y = F1_FRONT_TRACK / 2 - 62;
  const R_HUB_Y = F1_REAR_TRACK / 2 - 62;
  // FRONT: double wishbones onto the two front rails, with the coilover
  // inboard off the upper. There is no torsion bar and no anti-roll bar
  // reaching back to a bulkhead — the F1's front suspension lives entirely
  // between the nose beam and the pedal bulkhead, which is what a 760 mm
  // overhang buys you and what it costs.
  const upperAtAxle = FRONT_UP_Z;
  suspensionCorner(kit, {
    tag: "FL", axleX: FRONT_AXLE_X, hubY: F_HUB_Y, axleZ: FRONT_AXLE_Z,
    lowerIn: [FRONT_AXLE_X, FRONT_Y, FRONT_LOW_Z], upperIn: [FRONT_AXLE_X, FRONT_Y, upperAtAxle],
    springTop: [FRONT_AXLE_X - 40, FRONT_Y, upperAtAxle],
  });
  // The steering rack and its tie rods, which the solve also placed. AHEAD of
  // the axle on this car, and on the centreline of a car whose driver is too.
  const rack = partBox("steering");
  beam("rack", {
    view: { kind: "front" as const },
    a: [rack.lo[1], rack.lo[2]], b: [rack.hi[1], rack.hi[2]],
    depth: rack.hi[0] - rack.lo[0], at: rack.lo[0],
  });
  strut("tie-rod", [rack.hi[0] - 20, rack.hi[1], (rack.lo[2] + rack.hi[2]) / 2],
    [FRONT_AXLE_X - 90, F_HUB_Y - 20, FRONT_AXLE_Z - 60], 24, 24, true);

  // REAR: the subframe carries it, and the subframe is bolted to the engine.
  // So the load path from a rear tyre runs hub, wishbone, subframe, BLOCK,
  // rear bulkhead, tub — through the engine, which is exactly what "stressed
  // member" means and is the reason `structureFit` has to find the engine
  // mounts above or call the whole back of the car an island.
  suspensionCorner(kit, {
    tag: "RL", axleX: REAR_AXLE_X, hubY: R_HUB_Y, axleZ: REAR_AXLE_Z,
    lowerIn: [REAR_AXLE_X, LOW_Y, LOW_Z], upperIn: [REAR_AXLE_X, UP_Y, midZ],
    springTop: [REAR_AXLE_X - 60, UP_Y, midZ + 40],
  });
  // Radius arms, forward from the upright to the tub's own sill: what stops
  // the subframe rotating about its transverse links.
  strut("radius-arm", [REAR_AXLE_X, R_HUB_Y, REAR_AXLE_Z - 130],
    [TUB_REAR - 60, SILL_Y - 40, 300], 34, 34, true);

  // ── the greenhouse: what the roof sits ON ───────────────────────────────
  // Every point below is READ off the two master lines the greenhouse is
  // built on. The A-pillar's top is where the roof rail is at the header
  // station; the cantrail follows the rail aft; the bows sit under the crown.
  // Move the roofline and the structure under it moves with it.
  //
  // AND ON THIS CAR THE GREENHOUSE IS THE TUB. A McLaren F1's A-pillars and
  // roof rails are carbon, moulded in one piece with the floor and the sills,
  // which is what lets the doors take a slice of the roof with them and still
  // leave a car that is stiff. So the pillars here are not add-on solids
  // standing on a cowl — they are members that reach the sill at both ends,
  // and the report at the bottom says whether they actually do.
  const PILLAR_W = 62, PILLAR_D = 74;
  // Inboard of the rail by a little, not outboard by half a pillar: the sail
  // band leans in hard on this car — the canopy pulls in 206 mm as it rises
  // 300 — so a pillar centred ON the rail puts its outboard corner through
  // the side glass.
  const railAt = (x: number): Pt3 => [x, railPlanY(x) - 6, railZ(x) - 50];
  // Down 58 and in 22 from the rail, not 40 and 6. A pillar half a section
  // thick, centred on a line that IS the outer surface, puts its outboard top
  // corner through the cowl — 5 mm, which is nothing to look at and is still a
  // piece of structure outside the bodywork.
  const COWL_TOP: Pt3 = [SCREEN_FROM, railPlanY(SCREEN_FROM) - 22, railZ(SCREEN_FROM) - 58];
  const aTop = railAt(SCREEN_TO);
  const bcTop = railAt(GLASS_TO);
  strut("a-pillar", COWL_TOP, aTop, PILLAR_W, PILLAR_D, true);
  // Down the inside of the cowl to the sill, because a pillar that stops at
  // the cowl is a pillar balanced on a panel.
  strut("a-pillar-foot", [SCREEN_FROM, SILL_Y, SILL_Z + 180], COWL_TOP, PILLAR_W, PILLAR_D, true);
  // The B/C pillar. One pillar and not two — the door glass ends at it and
  // there is no quarter light behind it — and it lands on the rear bulkhead,
  // which is the stiffest thing on the car.
  strut("bc-pillar", [GLASS_TO, SILL_Y, SILL_Z + 180], bcTop, PILLAR_W, PILLAR_D, true);
  beam("header-rail", {
    view: { kind: "front" as const },
    a: [-aTop[1], aTop[2] - 30], b: [aTop[1], aTop[2] + 30], depth: 64, at: SCREEN_TO - 32,
  });
  beam("rear-header", {
    view: { kind: "front" as const },
    a: [-bcTop[1], bcTop[2] - 30], b: [bcTop[1], bcTop[2] + 30], depth: 64, at: GLASS_TO - 32,
  });
  strut("cantrail", aTop, bcTop, 58, 58, true);
  // Roof bows, under the crown and between the cantrails. Two of them puts
  // nothing further than a bow-and-a-half from a member.
  for (const bx of [SCREEN_TO + (GLASS_TO - SCREEN_TO) / 3, SCREEN_TO + (2 * (GLASS_TO - SCREEN_TO)) / 3]) {
    beam(`roof-bow@${bx.toFixed(0)}`, {
      view: { kind: "front" as const },
      a: [-railPlanY(bx), crownZ(bx) - 74], b: [railPlanY(bx), crownZ(bx) - 30],
      depth: 52, at: bx - 26,
    });
  }

  // ── crash structure, which is also what backs the panels ────────────────
  // A bumper is a moulding on a beam and a door skin is a pressing on a bar.
  // The same members answer a crash question and a panel-stiffness question,
  // which is why they are one pass.
  //
  // THE CRUSH STROKES ARE THE SUBSTRATE'S OWN. `makeSubstrate` publishes
  // `crushStrokeFront` and `crushStrokeRear` and the beams sit exactly that
  // far ahead of the front rails and behind the subframe, so the stroke is a
  // length of structure rather than a number in a report.
  //
  // ON THIS CAR THE FRONT STROKE IS THE WHOLE NOSE. There are 760 mm from
  // the tip to the front axle and a 643 mm wheel inside them, so whatever
  // the substrate asks for, the beam ends up hard against the nose — which
  // is the honest answer for a car with an overhang this short, and the
  // clamp below is what says so rather than putting a bumper in front of the
  // car.
  const crushF = sub.crushStrokeFront?.value ?? 600;
  const crushR = sub.crushStrokeRear?.value ?? 450;
  // The beam is 76 mm deep and sits AT its station, so `LEN - 60` leaves it
  // 16 mm out the back of the car. On the E-Type the clamp never bit and the
  // arithmetic was never tested; here it bites at both ends at once.
  const BEAM_D = 76;
  const noseBeamX = Math.max(60, TUB_FRONT - crushF);
  const tailBeamX = Math.min(LEN - 60 - BEAM_D, FRAME_TAIL + crushR);
  crushFit = {
    frontAsked: crushF, frontGot: TUB_FRONT - noseBeamX,
    rearAsked: crushR, rearGot: tailBeamX - FRAME_TAIL,
  };
  for (const [nm, bx, z, half] of [
    ["bumper-front", noseBeamX, 420, 280], ["bumper-rear", tailBeamX, 660, 400],
  ] as const) {
    beam(nm, {
      view: { kind: "front" as const },
      a: [-half, z - 52], b: [half, z + 52], depth: 76, at: bx,
    });
  }
  // The crush rails themselves: nose beam back to the front rails, tail beam
  // forward to the subframe ring. Sloped, because a beam sits at bumper
  // height and the structure it feeds does not.
  strut("crush-rail-front", [noseBeamX + 40, 220, 420], [NOSE_END + 40, FRONT_Y, FRONT_LOW_Z], 62, 62, true);
  strut("crush-rail-rear", [tailBeamX + 30, 320, 660], [FRAME_TAIL, UP_Y, RING_TOP], 62, 62, true);
  // Door intrusion beams: one bar across each door. Its ENDS ARE THE PILLARS,
  // and they have to be — a bar floating inside a door skin carries nothing,
  // and the structure lens says so by calling it a separate body. In a side
  // impact the load goes beam, latch, pillar, sill; the model earns that by
  // having them touch.
  //
  // AND ON THIS CAR THE SILL IS THE REAL ANSWER, which is why the beam sits
  // as low as it does. A door that cuts into the roof cannot carry a side
  // impact through its own frame, because above the beltline the door IS the
  // roof; everything goes into a rocker 230 mm deep instead.
  strut("door-beam", [SCREEN_FROM + 20, SILL_Y + 10, SILL_Z + 240], [GLASS_TO - 20, SILL_Y + 20, SILL_Z + 300], 46, 92, true);

  // EVERYTHING SINCE `frameBefore` IS STRUCTURE, and the collection has to
  // happen after the last of it is authored. It used to sit half way up this
  // block, so the greenhouse and the crash members were never added to
  // `chassisCells` — which meant the material pass painted them as BODY, the
  // body mesh grew an eleven-millimetre wall at y = 300 that no station table
  // had ever asked for, and the chassis lens reported a crush rail sticking
  // out through it. A collection loop in the wrong place looks like a
  // geometry defect from every direction except this one.
  for (const id of [...s.state.cells.keys()] as Id[]) {
    if (frameBefore.has(id)) continue;
    frameCells.push(id);
    chassisCells.push(id);
  }
  members = kit.members;

  // ── body mounts, and why this car has none either ──────────────────────
  // Third car, third answer from one rule. A pad is a SHIM from a member's
  // top face up to the body's underside and it exists only where there is
  // daylight to shim. The MX-5 is a unibody with a subframe under it and
  // every pad is real. The E-Type is a tub and there is nothing to span. An
  // F1 is a tub whose floor pan IS the longeron — one carbon moulding, not a
  // pan on a rail — so there is not even a joint to shim, and the pass
  // reports all three stations wrapped rather than mounted. The rule did not
  // change; the car did.
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

// ── the nose and tail panels ──────────────────────────────────────────────
// The box's two end faces are flat cross-car panels whose boundary curves
// break hard. Marking them moves no geometry; it changes what the document
// admits, and it is what stops the field bending a panel out of its own plane
// trying to make a 60-degree corner tangent-continuous.
//
// They are GAPPED as well as creased, and that is what closes four loops at
// once: a bumper is its own moulding, and until its four edges said so the
// bonnet ran through the nose panel into the front fender into the sill and
// out the other side, and `panelsOf` was right to call the lot one piece.
const flatEnds = [...s.state.cells.values()].filter((c) => {
  let lo = Infinity, hi = -Infinity;
  for (const sd of c.sides) {
    const cu = s.state.curves.get(s.state.resolveCurve(sd.curveId));
    if (!cu) return false;
    for (const t of [0, 0.5, 1]) {
      const p = evalChain(cu.chain, sd.t0 + (sd.t1 - sd.t0) * t);
      lo = Math.min(lo, p[0]); hi = Math.max(hi, p[0]);
    }
  }
  return hi - lo < 1;
});
for (const cell of flatEnds) {
  for (const sd of cell.sides) {
    const id = s.state.resolveCurve(sd.curveId);
    s.apply("crease", { curveId: id });
    s.apply("gap", { curveId: id });
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
  paint: CATALOGUE["Papaya Orange"]!,
  screen: CATALOGUE["windscreen"]!,
  backlight: CATALOGUE["backlight"]!,
  sideGlass: CATALOGUE["side glass"]!,
  // NOT the steel grey the other two cars wear. A carbon tub is a black
  // dielectric under a clearcoat and the catalogue now knows the difference,
  // which is the fourth car earning a fourth material rather than a fourth
  // shade of the same one.
  chassis: CATALOGUE["carbon"]!,
  under: CATALOGUE["undertray"]!,
  tyre: CATALOGUE["315/45ZR17"]!,
  rim: CATALOGUE["magnesium"]!,
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
  const wheelSet = new Set<Id>([...wheelTread, ...wheelDisc]);
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
  for (const id of wheelTread) give(id, MATERIALS.tyre);
  for (const id of wheelDisc) give(id, MATERIALS.rim);
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
    const endFace = hi[0]! - lo[0]! < 1;
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
    if (endFace) endCells.add(id);
    const isSail = !across && !endFace && lo[2]! > shoulderZprofile(mid) - 25;
    if (isSail && inBand(GLASS_FROM, GLASS_TO)) give(id, MATERIALS.sideGlass);
    else {
      if (!across && !endFace && !isSail && inBand(SCREEN_FROM, GLASS_TO)) doorCells.add(id);
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
writeFileSync(new URL("../cars/mclaren-f1.car.json", import.meta.url), JSON.stringify(doc));
writeFileSync(new URL("../../mclaren-f1.stl", import.meta.url), writeStlBinary({ ...printed, normals: shaded.normals }, "mclaren-f1"));

const pad = (k: string) => k + " ".repeat(Math.max(0, 26 - k.length));
const line = (k: string, v: string) => console.log("  " + pad(k) + v);
const deg = (v: number) => (v < 1e-3 ? v.toExponential(1) : v.toFixed(3)) + "°";

console.log("\nMcLaren F1 — the fourth car, and the first that is not front-engined\n");
line("cells · curves · verbs", `${quilt.cells.length} · ${s.state.curves.size} · ${doc.verbs.length}`);
line("overall, as built", dims(asBuilt));
line("  as authored", dims(asAuthored));
line("  published 1992", `${F1_LENGTH} × ${F1_WIDTH} × ${F1_HEIGHT} mm (ASSUMED from recall — see mclaren-f1.ts)`);
line("G1 continuity", `${g1.g1Joins}/${g1.joins} joins · median ${deg(g1.medianDeg)} · worst ${deg(g1.worstDeg)}`);
line("  was, unfielded", `${g1bare.g1Joins}/${g1bare.joins} · worst ${g1bare.worstDeg.toFixed(1)}°`);
line("G2 curvature", `${g2.g2Joins}/${g2.joins} within 1% · median rel ${(g2.medianRelative * 100).toFixed(4)}% · p90 ${(g2.p90Relative * 100).toFixed(3)}%`);
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
    : `NONE — the head is ${(-cabin.headroom!).toFixed(0)} mm THROUGH the roof, on a car 1140 mm tall. Some of that is the person: the occupant model sits at SAE J4004's 25 degree back angle and this car's driver reclines a long way past it, on a seat moulded into a tub floor 190 mm off the road. The rest of it is a real car in which a tall driver's helmet touches`);
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
  const th = cabin.sections.filter((sc) => sc.x > 1400 && sc.x < 2900 && sc.width > 1200);
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

// ── the body against the real car ─────────────────────────────────────────
// The underlay, as arithmetic. This is what found the balloon: every station
// from a tenth of the length to nine tenths sat within five millimetres, and
// both TIPS were pinched to a point that inflated to full width over four
// hundred. `scripts/body-profile.ts` prints the whole table.
{
  const skin = bodyMesh;
  let worstW = 0, worstZ = 0, over = 0, atW = 0;
  // THIRTY MILLIMETRES IN FROM EACH END, and this car is why. The other two
  // taper to 330 mm of half-width at the tail, so a section three
  // millimetres from the end reads a tip. The F1's tail is 620 wide and flat
  // — a diffuser, two exhausts and a crash structure across it — so a cut
  // that close lands INSIDE the tail panel and measures the panel's own edge
  // rather than the body: the top reads 928 mm at x 4276, 881 at 4280 and 839
  // at 4284, which is the section walking down the panel's own fillet. Twelve
  // millimetres clears it and is 0.3% of the length; thirty was tried first
  // and over-corrected, reading 64 mm wide at the nose because at x = 30 the
  // prow is genuinely wider than its tip.
  const END_INSET = 12;
  for (const st of F1_PROFILE) {
    const x = Math.min(LEN - END_INSET, Math.max(END_INSET, st.at * LEN));
    const sec = sectionAt(skin, x, 500);
    const dw = sec.width / 2 - st.halfWidth, dz = sec.top - st.top;
    if (Math.abs(dw) > Math.abs(worstW)) { worstW = dw; atW = x; }
    if (Math.abs(dz) > Math.abs(worstZ)) worstZ = dz;
    if (Math.abs(dw) > F1_PROFILE_TOLERANCE_MM || Math.abs(dz) > F1_PROFILE_TOLERANCE_MM) over++;
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
  const BONDED = /^(a-pillar|bc-pillar|header-rail|rear-header|cantrail|roof-bow|door-beam|bumper-|sill)/;
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
      line("  body mounts", "NONE, and that is the reading. A carbon tub has no body mounts because the " +
        "floor pan IS the longeron — one moulding, not a pan on a rail — so there is not even a joint " +
        "for a pad to span. The MX-5 runs the same rule and gets 4 of 4 at 3 mm");
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
    { name: "wheel-FL", at: [FRONT_AXLE_X, F1_FRONT_TRACK / 2, FRONT_AXLE_Z] as Pt3 },
    { name: "wheel-FR", at: [FRONT_AXLE_X, -F1_FRONT_TRACK / 2, FRONT_AXLE_Z] as Pt3 },
    { name: "wheel-RL", at: [REAR_AXLE_X, F1_REAR_TRACK / 2, REAR_AXLE_Z] as Pt3 },
    { name: "wheel-RR", at: [REAR_AXLE_X, -F1_REAR_TRACK / 2, REAR_AXLE_Z] as Pt3 },
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
        "The tallest demand behind the cabin is the engine at " +
        `${packageAt(DRIVING, 2800).top.toFixed(0)} mm against a deck drawn at ${STATIONS.find((st) => st.name === "deck-front")!.drawn.top.toFixed(0)}`);
    } else {
      line("package vs styling", `${obeyed.length} station bound${obeyed.length === 1 ? "" : "s"} moved by the hard package · ` +
        `roofline lifted ${worstLift.toFixed(0)} mm · the rest is the FLOOR being pushed down, which on a ` +
        "mid-engined car is where the package bites: cores in the flanks and a transaxle over the rear axle");
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
  // `makeSubstrate` publishes a stroke front and rear and this is the first
  // car that has not had room for either. That is the correct answer for a
  // 760 mm nose with a 643 mm wheel in it and an 809 mm tail with a gearbox
  // in it, and it is a real consequence of the layout rather than a bug: a
  // mid-engined car with short overhangs has less crushable length than a
  // front-engined one of the same wheelbase, and always did.
  if (crushFit) {
    const pct = (a: number, b: number) => `${b.toFixed(0)} of ${a.toFixed(0)} mm (${((b / a) * 100).toFixed(0)}%)`;
    line("crush stroke", `front ${pct(crushFit.frontAsked, crushFit.frontGot)} · ` +
      `rear ${pct(crushFit.rearAsked, crushFit.rearGot)} — clamped by the ends of the car, not chosen`);
  }
  for (const f of frameRead.faults) line("  structure FAULT", f);

  line("profile vs the real car",
    `worst ${worstW.toFixed(0)} mm wide at x ${atW.toFixed(0)} · ${worstZ.toFixed(0)} mm tall · ` +
    `${over} of ${F1_PROFILE.length} stations outside ${F1_PROFILE_TOLERANCE_MM} mm (reference ASSUMED)`);
}
line("triangles", `${(mesh.indices.length / 3).toLocaleString("en-GB")}`);
console.log("\nwrote cars/mclaren-f1.car.json and the STL beside it\n");
