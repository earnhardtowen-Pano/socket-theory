/**
 * Build the MX-5 (NA) — the second car, and the reason it exists.
 *
 * The P1 is the demonstrator the surfacing machinery grew up against, which
 * makes it the worst possible witness for whether that machinery is general.
 * This is the control: a car that disagrees with the P1 on nearly everything a
 * surfacer cares about — 430 mm shorter, 265 mm narrower, near-equal
 * overhangs, round sections instead of creased ones, a soft top over a low
 * flat beltline instead of a fastback — authored with the same verbs against
 * its own packaging solve, and surfaced and measured by the same probes with
 * no per-car constants anywhere.
 *
 * Body datum: X = 0 at the NOSE (the solve's X = 0 is the front axle, so hard
 * points shift by the front overhang), Y across from the centreline, Z up
 * from the ground plane.
 *
 * TOP UP, and that is not a dodge. A roadster with the top down is an open
 * body, and the frame's whole guarantee is a closed watertight quilt; the
 * verb that authors an opening does not exist yet (see the wheel-arch note in
 * build-p1.ts, which is the same finding). The top-up car is the one this
 * frame can hold honestly, so it is the one it builds.
 *
 *   npx tsx scripts/build-miata.ts
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { makeAllocator, type Id, type Pt3 } from "@car/schema";
import { assembleCar, shoulderAboveHip95M, shoulderBreadth95M } from "@car/types";
import { CATALOGUE, finishOf, scanUp, sectionAt, sliceSection } from "@car/skin";
import { solve } from "@car/pack";
import {
  cabinLens, chassisFit, skinSupport, structureFit, MIN_SKIN_CLEARANCE, SKIN_REACH,
  type BodyMount, type CabinPerson, type CarriedPart, type SectionMesh, type StructureMember,
} from "@car/lens";
import {
  miataConfig, MX5_DIAMETER, MX5_FRONT_OVERHANG, MX5_FRONT_TRACK,
  MX5_PROFILE, MX5_PROFILE_TOLERANCE_MM, MX5_REAR_TRACK,
  MX5_TIRE_WIDTH, MX5_WHEELBASE,
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
const car = assembleCar(miataConfig, makeAllocator());
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
    return [o[0] + pose.origin[0] + MX5_FRONT_OVERHANG, DRIVER_Y, o[2] + pose.origin[2]];
  };
  return {
    heel: at(/^heel-/), hip: at(/^hip-/), eye: at(/^eye-/), head: at(/^head-/),
    shoulderHalfBreadth: shoulderBreadth95M().value / 2,
    shoulderAboveHip: shoulderAboveHip95M().value,
  };
};
/** LHD, +Y left — the occupant array's own convention and its default. */
const DRIVER_Y = 370;

const NOSE = MX5_FRONT_OVERHANG;
const FRONT_AXLE_X = NOSE;
const REAR_AXLE_X = NOSE + MX5_WHEELBASE;
const WHEEL_R = MX5_DIAMETER / 2;
// The arch is a semicircle about the axle, ending at axle height on both
// sides. 46 mm of radial clearance over the tyre is what a road car carries —
// enough for jounce and a snow chain, and tight enough that the wheel fills
// the opening the way it does on the real thing.
const ARCH_R = WHEEL_R + 46;
const ARCH_LIFT = 12;              // how far the lip stands proud of the tyre face
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
const ARCH_HALF = ARCH_R * Math.cos(ARCH_END);
const archMouth = (axleX: number): [number, number] => [axleX - ARCH_HALF, axleX + ARCH_HALF];

// ── 2. author the body ────────────────────────────────────────────────────
const s = createSession("MX-5 NA");
const side = { kind: "side" as const };

const LEN = 3970, HW = 838, FLOOR = 118, TOP = 1235;

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

// ── the two master lines ──────────────────────────────────────────────────
// The MX-5's whole character is the beltline: LOW, and near enough flat from
// the cowl to the boot. The P1's rises 555 mm nose to cabin; this one rises
// 215 and then stays put. If a body were a set of numbers tuned to one car,
// this is the number that would break it.
const track = (a: number, b: number, c: number, d: number) =>
  (t: number): number => [a, b, c, d][Math.round(t * 3)]!;

// The four numbers are STATIONS, not extremes. A cubic forced through them
// overshoots between them — steeply, when the leading rise is as fast as a
// short nose makes it — so the widest point of the car is at no station at
// all. Writing the published half-width into the table puts the actual peak
// 22 mm outside it.
//
// So the table says what the car should be and the SCRIPT solves for what to
// type: sample the fitted cubic, find its peak, and scale the plan tables
// until the peak is the published half-width. The number a person reads in
// this file is then the number a tape measure reads on the car. (The P1 never
// did this. It is authored 1880 wide and builds 2004, and nothing in its
// report says which of those is the car.)
const HALF_WIDTH = 838;                    // 1675 mm overall, published
const bezierAt = (a: number, b: number, c: number, d: number, t: number): number => {
  // The cubic that interpolates a,b,c,d at t = 0, 1/3, 2/3, 1 — the same
  // four-point fit `fitThrough` applies, evaluated here to find its peak.
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
// Narrow at both ends so the flanks WRAP the nose and tail instead of dying
// into a flat vertical plate. A 300 mm nose aperture and a 520 mm tail panel
// are what this car actually has.
const SHOULDER_Y = [150, 800, 815, 260] as const;
const ROCKER_Y = [140, 735, 748, 240] as const;
const planScale = HALF_WIDTH / Math.max(peakOf(SHOULDER_Y), peakOf(ROCKER_Y));
const scaled = (v: readonly [number, number, number, number]) =>
  track(v[0] * planScale, v[1] * planScale, v[2] * planScale, v[3] * planScale);

const shoulderY = scaled(SHOULDER_Y);
// The beltline over the front axle was 749 mm, which left only 125 mm of
// fender above an arch crown at 624 — and a flank cell that short is what the
// tangent field then bulges 50 mm outboard. A real NA carries about 180.
// 470 at the nose, not 620. The nose-tuck station's crown is 570, so a
// beltline that starts at 620 puts the SHOULDER of the tip above the ROOF
// just behind it — the body turns inside out over the last 90 mm and closes
// on a flat plate standing proud of everything around it. Both ends had it.
// 640 at the nose and 720 at the tail. It was 470 and 700, which put the
// beltline of the tip 230 mm below the real car's and left the body climbing
// to full height over the first tenth of its length. See BLUNT ENDS below.
const shoulderZ = track(640, 860, 845, 720);
const rockerY = scaled(ROCKER_Y);
const rockerZ = track(232, 128, 128, 246);

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
if (longEdges.length !== 4) throw new Error(`expected 4 long edges, got ${longEdges.length}`);
for (const id of longEdges) {
  const m = curveMean(id);
  const sign = m[1] >= 0 ? 1 : -1;
  const low = m[2] < (FLOOR + TOP) / 2;
  const yOf = low ? rockerY : shoulderY;
  const zOf = low ? rockerZ : shoulderZ;
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
const FRONT_LIP = MX5_FRONT_TRACK / 2 + MX5_TIRE_WIDTH / 2 + ARCH_LIFT;
const REAR_LIP = MX5_REAR_TRACK / 2 + MX5_TIRE_WIDTH / 2 + ARCH_LIFT;
const AXLE_Z = WHEEL_R;
const [fA, fB] = archMouth(FRONT_AXLE_X);
const [rA, rB] = archMouth(REAR_AXLE_X);
const ARCH_X = [0, fA, FRONT_AXLE_X, fB, rA, REAR_AXLE_X, rB, LEN];

/** Half-width of the rocker at station x — the plan a real sill has. */
const rockerPlanY = (x: number): number => {
  const ramp = (x0: number, y0: number, x1: number, y1: number): number => {
    const u = Math.min(1, Math.max(0, (x - x0) / (x1 - x0)));
    return y0 + (y1 - y0) * (u * u * (3 - 2 * u));
  };
  if (x <= fA) return ramp(0, 320, fA, FRONT_LIP);
  if (x <= fB) return FRONT_LIP;
  if (x <= rA) {
    const mid = 0.5 * (fB + rA);
    return x <= mid ? ramp(fB, FRONT_LIP, mid, 742) : ramp(mid, 742, rA, REAR_LIP);
  }
  if (x <= rB) return REAR_LIP;
  return ramp(rB, REAR_LIP, LEN, 560);
};
/** Height of the rocker where it is a sill rather than an arch. */
const rockerSillZ = (x: number): number => {
  const ramp = (x0: number, z0: number, x1: number, z1: number): number => {
    const u = Math.min(1, Math.max(0, (x - x0) / (x1 - x0)));
    return z0 + (z1 - z0) * (u * u * (3 - 2 * u));
  };
  const MOUTH_Z = AXLE_Z + ARCH_R * Math.sin(ARCH_END);
  // The aperture the body closes on: 220 x 170 at the nose and 360 x 370 at
  // the tail, rather than 300 x 384 and 520 x 528. A bumper is a moulding
  // wrapped round a tip, not a plate bolted to a cut-off.
  if (x <= fA) return ramp(0, 330, fA, MOUTH_Z);
  if (x >= rB) return ramp(rB, MOUTH_Z, LEN, 360);
  const mid = 0.5 * (fB + rA);
  return x <= mid ? ramp(fB, MOUTH_Z, mid, 132) : ramp(mid, 132, rA, MOUTH_Z);
};

/**
 * The beltline's plan, on the same seven spans as the rocker.
 *
 * One cubic through four stations could not be at 150 mm by the nose aperture
 * AND out to full width by the front axle, so the beltline was still only
 * 749 mm wide where the arch lip had to be 807 — and the car came out widest
 * at its SILL, with a skirt hanging out under the doors. A car is widest at
 * its shoulder. Seven spans is what lets it be.
 */
const shoulderPlanY = (x: number): number => {
  const T: [number, number][] = [
    // BLUNT ENDS. This table used to run [0, 110] -> [fA, 700]: a nose 220 mm
    // wide swelling to 1600 over the first tenth of the car. Sectioning the
    // built body against the real one found the whole fault in two rows —
    // everything from 10% to 90% of the length is within 5 mm, and both TIPS
    // are pinched to a point:
    //
    //     x/L    half-width  built / real
    //     0.00      112 / 640      -528
    //     0.05      408 / 720      -312
    //     0.10      772 / 790       -18      <- correct from here on
    //
    // A body that goes from a point to full width in 400 mm is a balloon, and
    // it is a balloon whatever the surfacing does. The four entries per span
    // are exactly where `fitChain` samples, so these ARE the built widths.
    [0, 340], [154, 700], [307, 762], [fA, 800],
    [FRONT_AXLE_X, 826], [fB, 838],
    [rA, 838], [REAR_AXLE_X, 830],
    [rB, 800], [3579, 790], [3775, 730], [LEN, 600],
  ];
  let base = T[T.length - 1]![1];
  for (let i = 0; i < T.length - 1; i++) {
    const [x0, y0] = T[i]!, [x1, y1] = T[i + 1]!;
    if (x <= x1) {
      const u = Math.min(1, Math.max(0, (x - x0) / (x1 - x0)));
      base = y0 + (y1 - y0) * (u * u * (3 - 2 * u));
      break;
    }
  }
  // THE SIGHT LINE. Through the cabin the beltline draws IN, so the widest
  // point of the section sits below it and the body side leans inboard on the
  // way up — which is tumblehome, and which was reading MINUS 0.6 degrees
  // before this existed. A flank whose top is wider than its waist flares,
  // and a car that flares above its belt looks like a bathtub.
  //
  // The tuck lives inside the rocker's own span (1119 to 2726) so it costs no
  // extra segment: one cubic already carries an extremum, and this is it.
  const c0 = fB, c1 = rA;
  if (x > c0 && x < c1) {
    const u = (x - c0) / (c1 - c0);
    base -= CABIN_TUCK * Math.sin(Math.PI * u) ** 2;
  }
  return base;
};
/** How far the beltline draws in at mid-cabin, mm per side. */
const CABIN_TUCK = 46;

const rockerIds = longEdges.filter((id) => curveMean(id)[2] < (FLOOR + TOP) / 2);
const shoulderIds = longEdges.filter((id) => curveMean(id)[2] >= (FLOOR + TOP) / 2);
if (rockerIds.length !== 2) throw new Error(`expected 2 rockers, got ${rockerIds.length}`);
if (shoulderIds.length !== 2) throw new Error(`expected 2 shoulders, got ${shoulderIds.length}`);

/** Give a master line a segment boundary at every arch station. */
const segmentAt = (id: Id, forward: boolean): void => {
  for (const x of ARCH_X.slice(1, -1)) {
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
  // z(x) off the curve as authored, by bisection on x — the chain is one
  // cubic here and x is monotone along it.
  const zAt = (x: number): number => {
    let lo = 0, hi = 1;
    for (let i = 0; i < 60; i++) {
      const mid = 0.5 * (lo + hi);
      if ((evalChain(chain0, mid)[0]! < x) === forward) lo = mid; else hi = mid;
    }
    return evalChain(chain0, 0.5 * (lo + hi))[2]!;
  };

  segmentAt(shoulder, forward);
  const n = s.state.curves.get(s.state.resolveCurve(shoulder))!.chain.segs.length;
  if (n !== 7) throw new Error(`shoulder has ${n} segments, expected 7`);
  fitChain(shoulder, (seg, local) => {
    const j = forward ? seg : 6 - seg;
    const k = forward ? local : 1 - local;
    const x = ARCH_X[j]! + (ARCH_X[j + 1]! - ARCH_X[j]!) * k;
    return [x, sign * shoulderPlanY(x), zAt(x)];
  });
}

for (const rocker of rockerIds) {
  const sign = Math.sign(curveMean(rocker)[1]) || 1;
  const chain0 = s.state.curves.get(s.state.resolveCurve(rocker))!.chain;
  const forward = evalChain(chain0, 0)[0]! < evalChain(chain0, 1)[0]!;

  segmentAt(rocker, forward);
  const n = s.state.curves.get(s.state.resolveCurve(rocker))!.chain.segs.length;
  if (n !== 7) throw new Error(`rocker has ${n} segments, expected 7`);

  const arcOf = new Map<number, { axleX: number; from: number; to: number }>([
    [1, { axleX: FRONT_AXLE_X, from: Math.PI - ARCH_END, to: Math.PI / 2 }],
    [2, { axleX: FRONT_AXLE_X, from: Math.PI / 2, to: ARCH_END }],
    [4, { axleX: REAR_AXLE_X, from: Math.PI - ARCH_END, to: Math.PI / 2 }],
    [5, { axleX: REAR_AXLE_X, from: Math.PI / 2, to: ARCH_END }],
  ]);
  fitChain(rocker, (seg, local) => {
    const j = forward ? seg : 6 - seg;
    const k = forward ? local : 1 - local;
    const arc = arcOf.get(j);
    if (arc) {
      // A cubic fits 90 degrees to three parts in ten thousand: 0.1 mm here,
      // the same construction and the same figure as the wheels themselves.
      const a = arc.from + (arc.to - arc.from) * k;
      const x = arc.axleX + ARCH_R * Math.cos(a);
      return [x, sign * rockerPlanY(x), AXLE_Z + ARCH_R * Math.sin(a)];
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
const sub = miataConfig.substrate;
const RAIL_Y = sub.railSpacing.value / 2;
const RAIL_H = sub.railSectionHeight.value, RAIL_W = sub.railSectionWidth.value;
const RAIL_Z = miataConfig.placement.railHeight.value;
/** Top face of a rail — what a floor pan would land on. */
const RAIL_TOP = RAIL_Z + RAIL_H / 2;
/** Pad plan size, and the least daylight a pad is worth making. */
const MOUNT_PAD = 90, MOUNT_H = 12;
/** Stations with a crossmember, and so the candidates for a body mount. */
const MOUNT_X = [620, 1700, 2560, 3320];
/** Top of the transmission tunnel — propshaft, PPF and exhaust, licensed. */
const TUNNEL_TOP = RAIL_Z - RAIL_H / 2 + sub.tunnelHeight.value;
/**
 * The least the cockpit floor may sit above the tunnel under it.
 *
 * Read off the LENS rather than typed, so the body clears the structure by
 * exactly the figure the lens will hold it to. The first cockpit floor was
 * typed at 410 with a tunnel topping out at 402, and the chassis lens found
 * 229 of 3,112 structure points inside its own threshold — a tunnel pressing
 * into a cabin floor down its whole length, which on a real car is a hump and
 * here is a collision.
 */
const WELL_FLOOR_MIN = TUNNEL_TOP + MIN_SKIN_CLEARANCE.value;

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

// ── the sections ──────────────────────────────────────────────────────────
// `roofY` is where the deck curve's shoulders sit, and it is what makes a
// GREENHOUSE rather than a pontoon. At 520–560 through the cabin the roof was
// as wide as the body and the two read as one blob; a real cabin is barely
// half the body's width and the flank tucks under it. That difference is
// tumblehome and it is most of what tells an eye it is looking at a car.
//
// `hip` is an ABSOLUTE half-width and `hipAt` is how far up the flank the
// widest point sits. The tyre faces sit at 795 front and 805 rear, so every
// station over a wheel has to clear those — and on this car it clears them by
// 35 and 33 mm rather than the P1's 67 and 69. A narrow car has nowhere to
// hide a fender, which is exactly why it is the harder test.
const STATIONS: {
  x: number; roof: number; roofY: number; floor: number; hip: number; hipAt: number; name: string;
}[] = [
  { x: 90,   roof: 706,  roofY: 420, floor: 300, hip: 660, hipAt: 0.45, name: "nose-tuck" },
  { x: 300,  roof: 758,  roofY: 500, floor: 240, hip: 755, hipAt: 0.50, name: "nose" },
  { x: archMouth(FRONT_AXLE_X)[0], roof: 790,  roofY: 540, floor: 152, hip: 800, hipAt: 0.58, name: "arch-front-lead" },
  { x: 620,  roof: 812,  roofY: 560, floor: 140, hip: 822, hipAt: 0.66, name: "front-fascia" },
  { x: 790,  roof: 830,  roofY: 500, floor: 132, hip: 838, hipAt: 0.74, name: "front-axle" },
  { x: 1000, roof: 858,  roofY: 540, floor: 130, hip: 830, hipAt: 0.68, name: "lamp-pods" },
  { x: archMouth(FRONT_AXLE_X)[1], roof: 856,  roofY: 552, floor: 129, hip: 812, hipAt: 0.58, name: "arch-front-trail" },
  { x: 1400, roof: 838,  roofY: 560, floor: PAD_TOP - 60, hip: 826, hipAt: 0.48, name: "hood-mid" },
  { x: 1700, roof: 892,  roofY: 560, floor: PAD_TOP, hip: 834, hipAt: 0.45, name: "cowl" },
  // ── the cockpit ─────────────────────────────────────────────────────────
  // `roof` BELOW the beltline is a well, not a roof, and that is the whole
  // change: the section runs up the body side to the belt and then turns in
  // and DOWN into the car. The tumblehome the lens reads is the angle of that
  // turn, and it only exists on a body that is open.
  //
  // The floor of the well is one cubic's minimum at the centreline, so this
  // car has no transmission tunnel — a tunnel is a rise BETWEEN two footwells
  // and a cubic across the car has one extremum, not two. Same limit the lamp
  // pods hit. Said here rather than discovered later.
  { x: 1980, roof: Math.max(448, WELL_FLOOR_MIN), roofY: 470, floor: PAD_TOP, hip: 838, hipAt: 0.42, name: "screen" },
  { x: 2280, roof: Math.max(410, WELL_FLOOR_MIN), roofY: 460, floor: PAD_TOP, hip: 840, hipAt: 0.42, name: "header" },
  { x: 2560, roof: Math.max(424, WELL_FLOOR_MIN), roofY: 460, floor: PAD_TOP, hip: 840, hipAt: 0.44, name: "top-rear" },
  { x: archMouth(REAR_AXLE_X)[0], roof: Math.max(448, WELL_FLOOR_MIN), roofY: 470, floor: PAD_TOP - 40, hip: 826, hipAt: 0.56, name: "arch-rear-lead" },
  // ── and closed again: the tonneau behind the seats ──────────────────────
  { x: 2880, roof: 878,  roofY: 500, floor: PAD_TOP - 80, hip: 836, hipAt: 0.64, name: "backlight" },
  // The boot lid of a roadster sits at the beltline, not above it. It was
  // 985 at the rear axle against a belt of 830 — a dome nobody asked for.
  { x: 3055, roof: 884,  roofY: 560, floor: 142, hip: 844, hipAt: 0.74, name: "rear-axle" },
  { x: archMouth(REAR_AXLE_X)[1], roof: 862,  roofY: 556, floor: 168, hip: 812, hipAt: 0.60, name: "arch-rear-trail" },
  { x: 3480, roof: 856,  roofY: 540, floor: 182, hip: 810, hipAt: 0.60, name: "deck" },
  { x: 3720, roof: 828,  roofY: 520, floor: 260, hip: 780, hipAt: 0.55, name: "tail" },
  { x: 3900, roof: 772,  roofY: 460, floor: 300, hip: 660, hipAt: 0.50, name: "tail-tuck" },
];

// Every arch mouth and crown must BE a station: the rocker can only be split
// where no cell claims across, and a station cut is what makes that true. The
// rear trail station was typed 160 mm from its arch and the split refused,
// naming the cell — which is the guard working, and this is the guard that
// stops it needing to.
for (const x of [...archMouth(FRONT_AXLE_X), FRONT_AXLE_X, ...archMouth(REAR_AXLE_X), REAR_AXLE_X]) {
  if (!STATIONS.some((st) => Math.abs(st.x - x) < 1e-6)) {
    throw new Error(`no station at x=${x}, which an arch mouth or crown needs`);
  }
}

const faceOf = (score: (m: Pt3) => number): Id => {
  const ids = [...s.state.cells.keys()] as Id[];
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
  return ids.reduce((best, id) => (score(meanOf(id)) > score(meanOf(best)) ? id : best), ids[0]!);
};
const deckFace = faceOf((m) => m[2]);
const underFace = faceOf((m) => -m[2]);
const flankPos = faceOf((m) => m[1]);
const flankNeg = faceOf((m) => -m[1]);

const sections: { deck: Id; under: Id; flanks: Id[] }[] = [];
for (const st of STATIONS) {
  const before = new Set(s.state.curves.keys());
  s.apply("tape", {
    kind: "line",
    line: { view: side, a: [st.x, FLOOR - 240], b: [st.x, TOP + 220], lineClass: "tape" },
    targets: [deckFace, underFace, flankPos, flankNeg],
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
  const flanks = made.filter((id) => !acrossCar(id));
  const zOf = (id: Id) => curveMean(id)[2];
  across.sort((a, b) => zOf(a) - zOf(b));
  const under = across[0], deck = across[across.length - 1];
  if (!under || !deck || across.length !== 2 || flanks.length !== 2) {
    throw new Error(`station ${st.name}: expected 2 across + 2 flank, got ${across.length} + ${flanks.length}`);
  }
  sections.push({ deck, under, flanks });
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
for (let i = 0; i < STATIONS.length; i++) {
  const st = STATIONS[i]!;
  const sec = sections[i]!;
  for (const [id, wantZ, wantY] of [[sec.deck, st.roof, st.roofY], [sec.under, st.floor, 0]] as const) {
    setAcross(id, st.x, wantZ, wantY);
  }
  for (const id of sec.flanks) {
    const [p0, , , p3] = ctrlsOf(id);
    const sign = Math.sign((p0[1] + p3[1]) / 2) || 1;
    const low = p0[2] < p3[2] ? p0 : p3;
    const high = p0[2] < p3[2] ? p3 : p0;
    const chord = Math.abs(low[1]) + (Math.abs(high[1]) - Math.abs(low[1])) * st.hipAt;
    const d = Math.max(0, (st.hip - chord) / 0.75);
    const wLow = 1 + (0.5 - st.hipAt) * 2;
    const wHigh = 2 - wLow;
    const upward = p0[2] < p3[2];
    setCtrl(id, 1, bulge(lerp3p(p0, p3, 1 / 3), sign, d * (upward ? wLow : wHigh)));
    setCtrl(id, 2, bulge(lerp3p(p0, p3, 2 / 3), sign, d * (upward ? wHigh : wLow)));
  }
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
// What a panel IS, in this document, is a connected run of cells with the
// GAP-marked curves cut — `panelsOf` has said so since A10 and nothing had
// ever drawn a closed loop for it to find, so the body has been reported as
// one 84-cell piece with four stray shutlines in it. A gap that does not
// close a loop separates nothing.
//
// Closing a loop needs the ability to gap PART of a shared curve, and until
// A13 there was no way to make part of a curve its own thing. That is what
// the verb was for and this is the first use of it that is not an arch.
//
// The rule the arches taught, and it still holds: splitting moves nothing and
// is safe after the cuts; shaping is not. Everything below is splits and
// marks. No control point moves.

const DOOR_FRONT = 1700;   // the cowl station — an NA's door shut is the A-pillar base
const DOOR_REAR = 2560;    // the top-rear station, ahead of the rear arch
const SCREEN_TOP = 2280;   // the header station — screen above, folding top behind
const BOOT_FRONT = 2880;   // the backlight station

const stationOf = (name: string) => {
  const k = STATIONS.findIndex((st) => st.name === name);
  const sec = sections[k];
  if (!sec) throw new Error(`no station ${name}`);
  return sec;
};

/**
 * Split a rocker span at an x that is already a station, and hand back the
 * two pieces in x order.
 *
 * The parameter is found by bisection on the piece's CURRENT chain, because
 * every split re-parameterises what is left, and A13 then snaps it to the
 * claim boundary the station cut put there — so the result is exact rather
 * than within a bisection of exact.
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

// THE SHOULDER, end to end. On a roadster the beltline is not a styling line
// with panels either side of it — it IS the seam: bonnet against fender ahead
// of the cowl, screen and folding top against the body through the cabin,
// boot lid against quarter behind. One continuous groove down the car, which
// is what an eye reads on the real thing.
for (const id of shoulderIds) s.apply("gap", { curveId: id });

// THE SILL, end to end, for the same reason as the shoulder: every unibody
// car has a pinch weld down there where the body side outer meets the floor
// pan, and every one of them shows it. Ahead of the door it is also the
// bolt-on wing's lower edge and its two arch flanges; behind, the quarter's.
// The door's own stretch has to be marked alone, which is what the two cuts
// below are for — split-curve's first use that is not an arch.
for (const rocker of rockerIds) {
  const spans = rockerSpans.get(rocker)!;
  const [wing, rest] = cutSpanAt(spans[3]!, DOOR_FRONT);
  const [door, quarterSill] = cutSpanAt(rest, DOOR_REAR);
  for (const id of [spans[0]!, spans[1]!, spans[2]!, wing, door, quarterSill,
                    spans[4]!, spans[5]!, spans[6]!]) {
    s.apply("gap", { curveId: id });
  }
}

// THE CROSS-CAR SHUTS. Bonnet at the cowl, screen at the header, boot at the
// backlight — the P1 gets a hood shut and a deck shut and that is the only
// thing the two cars share here, because this one's top folds and its stations
// are its own.
for (const name of ["cowl", "header", "backlight"]) {
  const sec = stationOf(name);
  s.apply("crease", { curveId: sec.deck });
  s.apply("gap", { curveId: sec.deck });
}

// THE DOOR SHUTS themselves — the two vertical cuts, which are station curves
// that already exist. The old build taped a fresh line at x = 2150 into one
// cell and marked it; that put a groove on the body and separated nothing,
// because a cut through one cell of a flank leaves the flank connected round
// it. These are the same two lines the sections already drew.
for (const name of ["cowl", "top-rear"]) {
  for (const id of stationOf(name).flanks) {
    s.apply("crease", { curveId: id });
    s.apply("gap", { curveId: id });
  }
}

// The pop-up lamp pods are a rise in the bonnet here and not two discrete
// pods, and the reason is the same one the wheel arches ran into: a station
// curve is ONE cubic across the car, so it can carry a crown but not two
// bumps with a valley between them. Authoring the real pods needs a way to
// split a curve ACROSS the car the way A13 splits one along it.

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
const HALF = MX5_TIRE_WIDTH / 2;
if (process.env["NOWHEELS"] !== "1") {
  wheel(FRONT_AXLE_X, WHEEL_R, HALF, MX5_FRONT_TRACK / 2 - HALF);
  wheel(REAR_AXLE_X, WHEEL_R, HALF, MX5_REAR_TRACK / 2 - HALF);
}

// ── the chassis ───────────────────────────────────────────────────────────
// The structure, from the substrate the config already declares and the
// packaging solve already placed: two rails at `railSpacing`, `crossmemberCount`
// beams across them, the tunnel the propshaft and PPF live in, and the sills.
// Nothing here is a new number — every dimension is read off `miataConfig`,
// which is the point. A body drawn over a chassis nobody modelled is a shell,
// and a shell and its structure rendered in one silver is one blob.
//
// It sits INSIDE the skin, as structure does. That is why the render has a
// ghost pass and why the chassis wears its own silver: you cannot judge a
// package you cannot see, and you cannot see two things that look identical.
const chassisCells: Id[] = [];
const mounts: BodyMount[] = [];
let members: StructureMember[] = [];
/** Crossmember stations the body WRAPS rather than sits on — reported, not faulted. */
const wrapped: number[] = [];
/** Where the sill runs, hoisted: the screen frame's feet land on it. */
const SILL_Y = 655;
/** Front and rear crush ROOM against the stroke the substrate declares. */
let crushRoom: [number, number, number, number] | null = null;
// Hoisted, because the SCREEN FRAME is structure too and is authored two
// hundred lines below this block. It stands proud of an open body on purpose
// so it stays out of the containment reading — but it still has to be a
// member, or the connectedness question is asked of a car with its whole
// greenhouse missing from the register.
const kit = memberKit({
  apply: (verb, args) => s.apply(verb as never, args as never),
  cellIds: () => [...s.state.cells.keys()] as Id[],
  curveIds: () => [...s.state.curves.keys()] as Id[],
  straighten, ctrlsOf, fitThrough,
});
const { beam, strut } = kit;
if (process.env["NOCHASSIS"] !== "1") {
  const chassisBefore = new Set(s.state.cells.keys());

  // The two rails. Authored on ONE side; the mirror law supplies the other,
  // which is the same bargain the wheels take.
  beam("rail", {
    view: side,
    a: [420, RAIL_Z - RAIL_H / 2], b: [3560, RAIL_Z + RAIL_H / 2],
    depth: RAIL_W, at: RAIL_Y - RAIL_W / 2,
  }, true);
  // The sills: `rockerHeight` x `rockerWidth`, INBOARD of the skin and short
  // of both arches. The first version ran to 2880 at y = 700 and the chassis
  // lens caught both mistakes in one line — 245 points outside the body, worst
  // 163 mm at the rear wheel arch, and zero clearance at the rocker. A sill
  // beam that touches the rocker is the same part as the rocker; a sill beam
  // that runs into the arch is a beam through a wheel.
  beam("sill", {
    view: side,
    a: [1560, 190], b: [rA - 40, 190 + sub.rockerHeight.value],
    depth: sub.rockerWidth.value, at: SILL_Y - sub.rockerWidth.value / 2,
  }, true);

  // Crossmembers: front, dash, seat, rear — `crossmemberCount` of them, spaced
  // over the run the rails cover.
  const N = Math.max(2, Math.round(sub.crossmemberCount.value));
  const xs = MOUNT_X;
  for (let i = 0; i < N; i++) {
    const x = xs[i] ?? 620 + ((3320 - 620) * i) / (N - 1);
    beam(`crossmember@${x}`, {
      view: { kind: "front" as const },
      a: [-RAIL_Y - RAIL_W / 2, RAIL_Z - RAIL_H / 2],
      b: [RAIL_Y + RAIL_W / 2, RAIL_Z - RAIL_H / 2 + 62],
      depth: 62, at: x,
    });
  }
  // BODY MOUNTS. The places the two halves are supposed to touch. A body does
  // not float above a frame, it SITS on it — at discrete pads, at the stiffest
  // points the frame has, which are the rail and crossmember intersections.
  // Nothing else in the model had a locus for "the body attaches here", so
  // nothing could be wrong about it.
  //
  // A PAD IS A SHIM, and its height is READ off the body it has to meet rather
  // than typed. The first version made all four the same twelve millimetres
  // and the lens reported the two end pairs 167 and 115 mm from bodywork they
  // were supposed to be carrying — because at the nose and the tail the body
  // does not sit on the frame at all, it WRAPS it. A crossmember inside a
  // front valance is a crash structure, and calling it a body mount is a claim
  // the geometry never supported.
  for (const x of xs.slice(0, N)) {
    const padTop = undersideAt(x, RAIL_Y);
    if (!Number.isFinite(padTop) || padTop < RAIL_TOP + 1) { wrapped.push(x); continue; }
    beam(`mount@${x}`, {
      view: side,
      a: [x - MOUNT_PAD / 2, RAIL_TOP],
      b: [x + MOUNT_PAD / 2, padTop],
      depth: MOUNT_PAD, at: RAIL_Y - MOUNT_PAD / 2,
    }, true);
    mounts.push({ name: `mount@${x}`, at: [x, RAIL_Y, padTop], padHalf: MOUNT_PAD / 2 });
    mounts.push({ name: `mount@${x}-R`, at: [x, -RAIL_Y, padTop], padHalf: MOUNT_PAD / 2 });
  }

  // The tunnel: propshaft, PPF and exhaust, between the seats.
  beam("tunnel", {
    view: side,
    a: [1500, RAIL_Z - RAIL_H / 2], b: [3060, RAIL_Z - RAIL_H / 2 + sub.tunnelHeight.value],
    depth: sub.tunnelWidth.value, at: -sub.tunnelWidth.value / 2,
  });

  // OUTRIGGERS, and the lens is the only reason they are here. The sills were
  // authored 275 mm outboard of the rails with nothing between them, so the
  // "chassis" was three separate bodies: a frame, and two sills floating
  // beside it. It rendered identically, sectioned identically, and passed the
  // containment, clearance and registration readings — because none of those
  // asks whether the members TOUCH. Every unibody has these; this one did not.
  for (const x of xs.slice(0, N)) {
    if (x < 1560 || x > rA - 40) continue;
    beam(`outrigger@${x}`, {
      view: { kind: "front" as const },
      a: [RAIL_Y - RAIL_W / 2, RAIL_Z - RAIL_H / 2], b: [SILL_Y, RAIL_Z + RAIL_H / 2],
      depth: 62, at: x,
    }, true);
  }

  // ── the suspension, which is what makes a wheel part of the car ─────────
  // Same argument as the E-Type's, on a car whose pickups are a ladder rail
  // rather than a tube frame. Before this, all four wheels on all three cars
  // in this repository were solids at the track and the axle station with
  // nothing within a third of a metre of them: the structure lens called them
  // drawn, not carried, and it was right.
  //
  // The TOWERS are what a rail car needs and a tube frame does not. A rail
  // sits 290 mm up and an upper wishbone wants a pickup at 520, so something
  // has to stand between them — which is the strut tower every unibody has
  // and the reason a bonnet has two humps in it.
  const TOWER_TOP = 560;
  const PICKUP_Y = RAIL_Y + RAIL_W / 2 + 20;
  for (const [tag, axleX, track] of [
    ["FL", FRONT_AXLE_X, MX5_FRONT_TRACK], ["RL", REAR_AXLE_X, MX5_REAR_TRACK],
  ] as const) {
    beam(`tower-${tag}`, {
      view: side,
      a: [axleX - 90, RAIL_Z], b: [axleX + 90, TOWER_TOP],
      depth: 96, at: PICKUP_Y - 48,
    }, true);
    suspensionCorner(kit, {
      tag, axleX, hubY: track / 2 - 58, axleZ: AXLE_Z,
      lowerIn: [axleX, PICKUP_Y, RAIL_Z - RAIL_H / 2 + 20],
      upperIn: [axleX, PICKUP_Y, TOWER_TOP - 40],
      springTop: [axleX - 20, PICKUP_Y, TOWER_TOP - 30],
      uprightHeight: 250,
    });
  }
  // ── crash structure, which is also what backs the panels ────────────────
  // A bumper is a moulding on a beam and a door skin is a pressing on a bar,
  // and neither beam nor bar existed. The crush strokes are the SUBSTRATE'S:
  // `makeSubstrate` has published `crushStrokeFront` and `crushStrokeRear`
  // since the first car and nothing had ever read them.
  const crushF = sub.crushStrokeFront?.value ?? 600;
  const crushR = sub.crushStrokeRear?.value ?? 450;
  const RAIL_TIP_F = 420, RAIL_TIP_R = 3560;
  const noseBeamX = Math.max(150, RAIL_TIP_F - crushF);
  const tailBeamX = Math.min(LEN - 150, RAIL_TIP_R + crushR);
  // WHAT IT COSTS TO DECLARE A STROKE YOU HAVE NO ROOM FOR. This car's rails
  // start 420 mm from the nose and it declares 600 of front crush, so the
  // beam would sit 180 mm in FRONT of the car. It is clamped to the nose and
  // the shortfall is reported rather than absorbed.
  crushRoom = [RAIL_TIP_F - noseBeamX, tailBeamX - RAIL_TIP_R, crushF, crushR];
  for (const [nm, bx, z, half] of [
    ["bumper-front", noseBeamX, 430, 380], ["bumper-rear", tailBeamX, 470, 420],
  ] as const) {
    beam(nm, {
      view: { kind: "front" as const }, a: [-half, z - 46], b: [half, z + 46], depth: 70, at: bx,
    });
  }
  strut("crush-rail-front", [noseBeamX + 36, 280, 430], [RAIL_TIP_F + 40, RAIL_Y, RAIL_Z], 58, 58, true);
  strut("crush-rail-rear", [tailBeamX + 34, 320, 470], [RAIL_TIP_R - 40, RAIL_Y, RAIL_Z], 58, 58, true);
  // Door intrusion beams, ending ON the sill and the screen-frame foot so the
  // load has somewhere to go.
  strut("door-beam", [1740, SILL_Y - 20, 300], [2660, SILL_Y - 10, 330], 44, 88, true);

  // The PPF — the aluminium beam that ties the gearbox to the differential and
  // is the whole reason this car turns the way it does. It is also the member
  // that stops the rear suspension being an island, which is what a lens that
  // asks about connectedness finds first.
  strut("ppf", [2100, 0, RAIL_Z - 40], [REAR_AXLE_X - 60, 0, RAIL_Z - 20], 150, 130);

  for (const id of [...s.state.cells.keys()] as Id[]) {
    if (chassisBefore.has(id)) continue;
    chassisCells.push(id);
  }
  members = kit.members;
}

// ── the screen frame ──────────────────────────────────────────────────────
// Two A-pillars and a header, and they are STRUCTURE — separate solids bolted
// to the cowl, the way the wheels are separate solids, not a band of the body
// pretending to be a windscreen. The band that used to pretend is gone: the
// deck through the cabin dips into the cockpit now, so there is nothing there
// to call glass.
//
// And there IS no glass here, which is a limit and not a choice. A windscreen
// is a surface inside a closed frame — a trimmed face — and there is no way
// to author a hole in this tool. The frame is real; the aperture is empty;
// saying so beats hanging a solid pane in it.
//
// Every number below comes off the person. The header sits above the eye the
// occupant array placed, so a driver looks THROUGH the aperture rather than
// over it, and the base sits at the cowl so the pillar stands on the scuttle.
const SCREEN_BASE_X = 1730, SCREEN_TOP_X = 2140;
// The base sits INSIDE the cowl rather than on top of it. A pillar that
// stops at the surface reads as a bar balanced on the bodywork; one that
// runs into it reads as structure, which is what it is.
const SCREEN_BASE_Z = 838, SCREEN_TOP_Z = 1205;
const PILLAR_Y = 482, PILLAR_THICK = 68, PILLAR_DEEP = 38;
const RAKE = SCREEN_TOP_Z - SCREEN_BASE_Z;
const pillarCells: Id[] = [];
const glazingCells: Id[] = [];
if (process.env["NOSCREEN"] !== "1") {
  const cellsBefore = new Set(s.state.cells.keys());
  // AUTHORED WITH `strut`, which is what a raked pillar is. This used to be a
  // box taped level and then sheared by hand, four curves at a time, because
  // there was no way to author a member between two points. There is now, and
  // the same call registers it — so the greenhouse is finally in the member
  // register and the connectedness question is asked of the whole car.
  const A_BASE: Pt3 = [SCREEN_BASE_X, PILLAR_Y + PILLAR_THICK / 2, SCREEN_BASE_Z];
  const A_TOP: Pt3 = [SCREEN_TOP_X, PILLAR_Y + PILLAR_THICK / 2, SCREEN_TOP_Z];
  strut("a-pillar", A_BASE, A_TOP, PILLAR_THICK, PILLAR_DEEP * 2, true);
  // AND ITS FOOT. A pillar that stops at the cowl is a bar balanced on a
  // panel: the structure lens called the whole screen frame an island, half a
  // metre above the nearest member, and it was right. A real A-pillar runs
  // down inside the cowl to the sill and that is the only reason a windscreen
  // stays where it is put.
  strut("a-pillar-foot", [SCREEN_BASE_X, SILL_Y - 20, 320], A_BASE, PILLAR_THICK, PILLAR_DEEP * 2, true);
  beam("header-rail", {
    view: { kind: "front" as const },
    a: [-PILLAR_Y - PILLAR_THICK, SCREEN_TOP_Z - PILLAR_DEEP],
    b: [PILLAR_Y + PILLAR_THICK, SCREEN_TOP_Z + PILLAR_DEEP],
    depth: 62, at: SCREEN_TOP_X - 62,
  });
  // The hoop behind the seats. On an NA this is a reinforcement rather than a
  // visible bar, and like the screen frame it stands in open air on purpose —
  // so it is a member for connectedness and stays out of the containment
  // reading, which is what `pillarCells` has always meant.
  // ON the sill, which ends at 2679 — a hoop 80 mm behind it is a hoop
  // bolted to nothing, and the lens said exactly that.
  const HOOP_X = 2640, HOOP_Y = 470, HOOP_TOP = 880;
  strut("hoop-leg", [HOOP_X, SILL_Y - 20, 330], [HOOP_X, HOOP_Y, HOOP_TOP], 64, 72, true);
  beam("hoop-bar", {
    view: { kind: "front" as const },
    a: [-HOOP_Y - 32, HOOP_TOP - 36], b: [HOOP_Y + 32, HOOP_TOP + 36], depth: 64, at: HOOP_X - 32,
  });
  for (const id of [...s.state.cells.keys()] as Id[]) {
    if (!cellsBefore.has(id)) pillarCells.push(id);
  }

  // ── the glazing, which is tertiary and must CONFORM ─────────────────────
  // A windscreen is not a pane leaned against a frame. It shares the frame's
  // rake by construction — the same two numbers the pillars were sheared by —
  // and it CROWNS, because a flat screen is a mirror and a real one is a
  // shallow cylinder. Nothing here is fitted to the frame afterwards; both
  // come off SCREEN_BASE and SCREEN_TOP, so they cannot drift apart.
  //
  // It is a thin SOLID rather than a face, because a face needs a trimmed
  // boundary and there is no way to author a hole in this tool. 10 mm of
  // laminated glass is 6 too many and it is the honest way to say so.
  const glassBefore = new Set(s.state.curves.keys());
  const glassCellsBefore = new Set(s.state.cells.keys());
  s.apply("tape", {
    kind: "box",
    rect: {
      view: side,
      a: [SCREEN_BASE_X + 30, SCREEN_BASE_Z - 17],
      b: [SCREEN_TOP_X - 14, SCREEN_BASE_Z - 7],
      depth: 2 * PILLAR_Y,
      at: -PILLAR_Y,
    },
  });
  const glassMade = [...s.state.curves.keys()].filter((id) => !glassBefore.has(id)) as Id[];
  const GX0 = SCREEN_BASE_X + 30, GX1 = SCREEN_TOP_X - 14;
  for (const id of glassMade) {
    const c = s.state.curves.get(s.state.resolveCurve(id))!;
    const a0 = evalChain(c.chain, 0), a1 = evalChain(c.chain, 1);
    if (Math.abs(a1[0] - a0[0]) > 10) {
      const forward = a0[0] < a1[0];
      fitThrough(id, (t) => {
        const u = forward ? t : 1 - t;
        const z0 = (forward ? a0 : a1)[2];
        return [GX0 + (GX1 - GX0) * u, a0[1], z0 + RAKE * u];
      });
    } else if (Math.abs(a1[1] - a0[1]) > 10) {
      // Cross-car: crown it. 34 mm of bow over the aperture, which is what
      // stops a screen reading as a flat plate with the sky folded in it.
      const CROWN = 22;
      fitThrough(id, (t) => {
        const y = a0[1] + (a1[1] - a0[1]) * t;
        const bow = CROWN * (1 - (y / PILLAR_Y) ** 2);
        return [a0[0] + (a1[0] - a0[0]) * t - bow * 0.55, y, a0[2] + (a1[2] - a0[2]) * t + bow];
      });
    } else {
      straighten(id);
    }
  }
  for (const id of [...s.state.cells.keys()] as Id[]) {
    if (glassCellsBefore.has(id)) continue;
    glazingCells.push(id);
    s.apply("mirror-detach", { cellId: id });
  }
  for (const id of glassMade) s.apply("crease", { curveId: id });
}

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
  paint: CATALOGUE["Classic Red"]!,
  frame: CATALOGUE["screen frame"]!,
  glass: CATALOGUE["windscreen"]!,
  chassis: CATALOGUE["chassis"]!,
  trim: CATALOGUE["cockpit trim"]!,
  under: CATALOGUE["undertray"]!,
  tyre: CATALOGUE["185/60R14"]!,
  rim: CATALOGUE["alloy"]!,
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
  const screenSet = new Set<Id>(pillarCells);
  const glassSet = new Set<Id>(glazingCells);
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
  // The screen frame is painted structure, by id rather than by geometry: it
  // spans the centreline at cabin stations and every geometric rule that
  // catches the cockpit would catch it too.
  for (const id of screenSet) give(id, MATERIALS.frame);
  for (const id of glassSet) give(id, MATERIALS.glass);
  for (const id of chassisSet) give(id, MATERIALS.chassis);
  for (const id of [...s.state.cells.keys()] as Id[]) {
    if (wheelSet.has(id) || screenSet.has(id) || glassSet.has(id) || chassisSet.has(id)) continue;
    const [lo, hi] = extentOf(id);
    // A cell that spans the centreline is a deck or a floor; one that does not
    // is a flank. That is the only distinction the classification needs.
    const across = lo[1]! < -1 && hi[1]! > 1;
    const endFace = hi[0]! - lo[0]! < 1;
    const mid = 0.5 * (lo[0]! + hi[0]!);
    // Floor or deck is decided by the cell's LOWEST point, not its highest:
    // an underside cell over a wheel arch reaches z = 624 at the crown and a
    // deck cell at the nose only reaches 650, so the tops overlap and the
    // bottoms do not — a deck cell starts at the shoulder, 620 at worst.
    if (endFace) endCells.add(id);
    if (!across && !endFace && mid > DOOR_FRONT && mid < DOOR_REAR) doorCells.add(id);
    if (across && !endFace && lo[2]! < 320) give(id, MATERIALS.under);
    // The cockpit: a cross-car cell whose LOWEST point is below the beltline
    // is the well, because a deck cell starts at the shoulder and a well
    // starts at its own floor. The x range is the cockpit opening the lens
    // measured, not a guess.
    else if (across && !endFace && mid > DOOR_FRONT && mid < BOOT_FRONT && lo[2]! < 700) {
      give(id, MATERIALS.trim);
    } else give(id, MATERIALS.paint);
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
/** Sampled points of one named set of cells — what a panel IS, as points. */
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

/** Every part the packing solve placed, as a box in BODY coordinates. */
const placedParts = (): CarriedPart[] => {
  const out: CarriedPart[] = [];
  for (const part of car.input.parts) {
    const pose = packed.placements.get(part.id);
    const env = part.envelope;
    if (!pose || !env) continue;
    const o = env.offset ?? [0, 0, 0];
    const c: Pt3 = [
      pose.origin[0] + o[0] + MX5_FRONT_OVERHANG, pose.origin[1] + o[1], pose.origin[2] + o[2],
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

const person = personInBody();
const cabin = cabinLens(envelopeMesh, person, {
  seatsAbreast: 2,
  elbowGap: 120,
  headerTopZ: SCREEN_TOP_Z + PILLAR_DEEP,
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
writeFileSync(new URL("../cars/mx5-na.car.json", import.meta.url), JSON.stringify(doc));
writeFileSync(new URL("../../mx5-na.stl", import.meta.url), writeStlBinary({ ...printed, normals: shaded.normals }, "mx5-na"));

const pad = (k: string) => k + " ".repeat(Math.max(0, 26 - k.length));
const line = (k: string, v: string) => console.log("  " + pad(k) + v);
const deg = (v: number) => (v < 1e-3 ? v.toExponential(1) : v.toFixed(3)) + "°";

console.log("\nMX-5 NA — the second car\n");
line("cells · curves · verbs", `${quilt.cells.length} · ${s.state.curves.size} · ${doc.verbs.length}`);
line("overall, as built", dims(asBuilt));
line("  as authored", dims(asAuthored));
line("  published 1989", "3970 × 1675 × 1235 mm");
line("G1 continuity", `${g1.g1Joins}/${g1.joins} joins · median ${deg(g1.medianDeg)} · worst ${deg(g1.worstDeg)}`);
line("  was, unfielded", `${g1bare.g1Joins}/${g1bare.joins} · worst ${g1bare.worstDeg.toFixed(1)}°`);
line("G2 curvature", `${g2.g2Joins}/${g2.joins} within 1% · median rel ${(g2.medianRelative * 100).toFixed(4)}% · p90 ${(g2.p90Relative * 100).toFixed(3)}%`);
line("curve network", `${net.cleanCorners}/${net.corners} corners coplanar · worst ${net.worstDeg.toFixed(2)}°`);
if (process.env["DBG"] === "1") {
  for (const c of [...net.open].sort((a, b) => b.angleDeg - a.angleDeg).slice(0, 6)) {
    console.log(`  DBG corner ${c.angleDeg.toFixed(1)}° at [${c.at.map((v) => v.toFixed(0)).join(", ")}]`);
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
line("head under the roof", cabin.roofed
  ? `${cabin.headroom!.toFixed(0)} mm of headroom — the body closes over the occupant here`
  : `${cabin.headAboveBody >= 0 ? "+" : ""}${cabin.headAboveBody.toFixed(0)} mm above an OPEN body, which is the sky`);
line("beltline above the hip", `${cabin.beltAboveHip.toFixed(0)} mm`);
line("shoulder room", cabin.shoulderRoom === null ? "no cockpit at the H-point" : `${cabin.shoulderRoom.toFixed(0)} mm of ${cabin.shoulderRoomNeeded.toFixed(0)} needed, read at z ${cabin.shoulderRoomAtZ.toFixed(0)}`);
line("hip room", cabin.hipRoom === null ? "none" : `${cabin.hipRoom.toFixed(0)} mm`);
// With the chassis inside the skin the lowest interior surface at this
// station is the TUNNEL, not the floor pan — so this reads hip-above-tunnel
// rather than hip-above-floor. Both are true; the label says which.
line("H-point above the floor", cabin.hipAboveWell === null
  ? "nothing under it"
  : `${cabin.hipAboveWell.toFixed(0)} mm to the cockpit floor, and no seat cushion in the model. It read 268 while the lens was being handed the whole print and finding the TUNNEL; the envelope has no structure in it`);
line("eye vs the header", cabin.eyeAboveHeader === null ? "no header" :
  `erect ${cabin.eyeAboveHeader >= 0 ? "+" : ""}${cabin.eyeAboveHeader.toFixed(0)} mm · relaxed ${cabin.eyeAboveHeaderRelaxed!.toFixed(0)} mm (negative = looking through the aperture)`);
line("eye aft of the H-point", `${(person.eye[0] - person.hip[0]).toFixed(0)} mm — a STRAIGHT-TORSO construction in @car/types/occupants; SAE's eye ellipse sits nearer 100 mm aft, so this over-rakes`);
line("cockpit opening", cabin.aperture === null ? "NONE — the body is closed" : `x ${cabin.aperture.fore.toFixed(0)} to ${cabin.aperture.aft.toFixed(0)} (${(cabin.aperture.aft - cabin.aperture.fore).toFixed(0)} mm)`);
{
  const th = cabin.sections.filter((sc) => sc.x > 1400 && sc.x < 2900 && sc.width > 1200);
  const vals = th.map((sc) => sc.tumblehomeDeg).sort((a, b) => a - b);
  const med = vals.length ? vals[Math.floor(vals.length / 2)]! : 0;
  line("tumblehome, cabin", vals.length === 0 ? "no sections" :
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
  for (const st of MX5_PROFILE) {
    const x = Math.min(LEN - 3, Math.max(3, st.at * LEN));
    const sec = sectionAt(skin, x, 500);
    const dw = sec.width / 2 - st.halfWidth, dz = sec.top - st.top;
    if (Math.abs(dw) > Math.abs(worstW)) { worstW = dw; atW = x; }
    if (Math.abs(dz) > Math.abs(worstZ)) worstZ = dz;
    if (Math.abs(dw) > MX5_PROFILE_TOLERANCE_MM || Math.abs(dz) > MX5_PROFILE_TOLERANCE_MM) over++;
  }
  // ── the two halves, against each other ─────────────────────────────────
  // The yin and yang, as three numbers. Containment says whether the structure
  // is hidden; clearance says whether a panel would read it through; the
  // mounts say whether the body sits on the frame or merely near it.
  const structure = structMesh;
  if (process.env["DBG"] === "1") {
    let lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    const seen = new Set<number>();
    for (const i of structIdx) seen.add(i);
    for (const i of seen) for (let k = 0; k < 3; k++) {
      lo[k] = Math.min(lo[k]!, printed.positions[i * 3 + k]!);
      hi[k] = Math.max(hi[k]!, printed.positions[i * 3 + k]!);
    }
    console.log(`  DBG chassisCells ${chassisCells.length} pillarCells ${pillarCells.length} structSet ${structSet.size}`);
    console.log(`  DBG structure extent ${lo.map((v) => v.toFixed(0)).join(",")} .. ${hi.map((v) => v.toFixed(0)).join(",")}`);
    const bodyIds = [...bodyCells].length;
    console.log(`  DBG bodyCells ${bodyIds} · body tris ${idx.length / 3} · struct tris ${structIdx.length / 3} · total ${printed.indices.length / 3}`);
    console.log(`  DBG PAD_TOP ${PAD_TOP} · RAIL_Z ${RAIL_Z} · RAIL_H ${RAIL_H} · RAIL_Y ${RAIL_Y}`);
    for (const m of mounts) {
      const sec = sliceSection(skin, m.at[0]);
      console.log(`  DBG ${m.name} y ${m.at[1].toFixed(0)} z ${m.at[2].toFixed(0)} · column [${scanUp(sec, m.at[1]).map((v) => v.toFixed(0)).join(", ")}]`);
    }
  }
  // AGAINST THE ENVELOPE, not the painted body. Containment asks whether the
  // structure is inside the CAR, and a windscreen is part of the car — so
  // testing against skin-and-trim puts a hole over the cabin and reports the
  // header rail under the screen as 264 mm outside the bodywork. The profile
  // check keeps the glassless body, because there a screen really would read
  // as an error in the bonnet. Two meshes, two questions.
  const fit = chassisFit(envelopeMesh, structure, mounts);
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
    line("  body mounts", `${on.length} of ${fit.mounts.length} carrying the body · standoff ` +
      fit.mounts.map((m) => m.standoff === null ? "—" : m.standoff.toFixed(0)).join(" / ") + " mm");
    if (wrapped.length > 0) {
      line("  wrapped, not mounted", `x ${wrapped.join(", ")} — the body's underside is below the rail there, ` +
        "so the frame is inside the bodywork and there is nothing for a pad to reach");
    }
  }
  for (const f of fit.faults) line("  chassis FAULT", f);

  // ── the structure against itself, and against what it carries ──────────
  const corners = [
    { name: "wheel-FL", at: [FRONT_AXLE_X, MX5_FRONT_TRACK / 2, AXLE_Z] as Pt3 },
    { name: "wheel-FR", at: [FRONT_AXLE_X, -MX5_FRONT_TRACK / 2, AXLE_Z] as Pt3 },
    { name: "wheel-RL", at: [REAR_AXLE_X, MX5_REAR_TRACK / 2, AXLE_Z] as Pt3 },
    { name: "wheel-RR", at: [REAR_AXLE_X, -MX5_REAR_TRACK / 2, AXLE_Z] as Pt3 },
  ];
  const cargo = placedParts().filter((q) => !q.name.includes("wheel-tire") && !q.name.startsWith("substrate"));
  const frameRead = structureFit(members, cargo, corners);
  const held = frameRead.anchorage.filter((q) => q.carried).length;
  line("structure", `${frameRead.members} members · ` +
    (frameRead.islands.length === 1
      ? "one body"
      : `${frameRead.islands.length} bodies, which is ${frameRead.islands.length - 1} too many`));
  line("  parts carried", `${held} of ${cargo.length} have structure within reach` +
    (frameRead.orphanedKg === 0 ? "" : ` · ${frameRead.orphanedKg.toFixed(0)} kg with nothing under it`));
  line("  wheels carried", frameRead.corners.map((c) =>
    `${c.name.slice(-2)} ${c.gap.toFixed(0)}`).join(" / ") + " mm to the nearest member");
  if (crushRoom) {
    const [roomF, roomR, wantF, wantR] = crushRoom;
    line("  crush stroke", `front ${roomF.toFixed(0)} of ${wantF} declared · rear ${roomR.toFixed(0)} of ${wantR}` +
      (roomF >= wantF && roomR >= wantR ? "" : " — the rails start too far forward to carry the stroke the substrate declares"));
  }
  // ── what the surfacing sits on ─────────────────────────────────────────
  for (const [what, cells, reach] of [
    ["roof", roofCells, SKIN_REACH.value],
    ["doors", doorCells, 460],
    ["nose and tail", endCells, 340],
  ] as const) {
    const pts = panelPoints(cells);
    if (pts.length === 0) { line(`  ${what} carried`, "no cells of that kind — this car has no roof"); continue; }
    const sup = skinSupport(members, pts, reach);
    line(`  ${what} carried`, `${sup.points - sup.over} of ${sup.points} points within ${reach} mm of a member · ` +
      `median ${sup.median.toFixed(0)} · worst ${sup.worst.toFixed(0)} at [${sup.worstAt.map((v) => v.toFixed(0)).join(", ")}]`);
    if (sup.over > 0) {
      line("  panel FAULT", `${sup.over} of ${sup.points} ${what} points have nothing within ${reach} mm holding them up — the surfacing is sitting on air there`);
    }
  }
  for (const f of frameRead.faults) line("  structure FAULT", f);

  line("profile vs the real car",
    `worst ${worstW.toFixed(0)} mm wide at x ${atW.toFixed(0)} · ${worstZ.toFixed(0)} mm tall · ` +
    `${over} of ${MX5_PROFILE.length} stations outside ${MX5_PROFILE_TOLERANCE_MM} mm (reference ASSUMED)`);
}
line("triangles", `${(mesh.indices.length / 3).toLocaleString("en-GB")}`);
console.log("\nwrote cars/mx5-na.car.json and mx5-na.stl\n");
