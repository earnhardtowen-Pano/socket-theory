/**
 * Build the Jaguar E-Type Series 1 3.8 fixed-head coupe — the third car.
 *
 * The P1 is the demonstrator the surfacing grew up against and the MX-5 is
 * the control that proved it general. This one is here to reach two things
 * neither of them could.
 *
 * A ROOF, and therefore a person under one. Two cars in and nothing has ever
 * put bodywork over an occupant's head: `cabinLens` has carried a headroom
 * reading, a fault string for a head through a roof and a `headAboveBody`
 * sign convention since the day it was written, and every number it has ever
 * published about a head has been "+464 mm, in the open air, which a roadster
 * means". A coupe is the first car that can make it say anything else.
 *
 * TWO STRUCTURES WITH A JOINT BETWEEN THEM. An E-Type is a monocoque tub from
 * the scuttle back and a bolted tubular frame ahead of it, and the bulkhead
 * where they meet is a real interface. `chassisFit` measures registration
 * between a body and a structure; here there are two structures that must
 * also register with each other, and the front one carries the whole bonnet.
 *
 * WHAT IS NEW IN THE BODY. Six master lines instead of four. A closed car has
 * a third longitudinal seam — the roof rail — and without it the greenhouse
 * is one surface from beltline to beltline over the top, which means the
 * windscreen cannot be told from the roof above the driver's shoulder. Two
 * plan cuts across the deck before anything is shaped give the car a centre
 * band and two side bands, and on this car in particular they are exactly
 * right: the bonnet's centre panel and the roof are the same band, and the
 * front wing and the door glass are the same band. The E-Type is a car whose
 * real panel breaks run that way.
 *
 * Body datum: X = 0 at the NOSE (the solve's X = 0 is the front axle, so hard
 * points shift by the front overhang), Y across from the centreline, Z up
 * from the ground plane.
 *
 *   npx tsx scripts/build-etype.ts
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { makeAllocator, type Id, type Pt3 } from "@car/schema";
import { assembleCar, shoulderAboveHip95M, shoulderBreadth95M } from "@car/types";
import { CATALOGUE, finishOf, scanUp, sectionAt, sliceSection } from "@car/skin";
import { solve } from "@car/pack";
import { cabinLens, chassisFit, MIN_SKIN_CLEARANCE, type BodyMount, type CabinPerson, type SectionMesh } from "@car/lens";
import {
  etypeConfig, ETYPE_DIAMETER, ETYPE_FRONT_OVERHANG, ETYPE_FRONT_TRACK,
  ETYPE_PROFILE, ETYPE_PROFILE_TOLERANCE_MM, ETYPE_REAR_TRACK,
  ETYPE_HEIGHT, ETYPE_LENGTH, ETYPE_TIRE_WIDTH, ETYPE_WHEELBASE, ETYPE_WIDTH,
} from "@car/fixtures";
import { createSession } from "@car/history";
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
const car = assembleCar(etypeConfig, makeAllocator());
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
    return [o[0] + pose.origin[0] + ETYPE_FRONT_OVERHANG, DRIVER_Y, o[2] + pose.origin[2]];
  };
  return {
    heel: at(/^heel-/), hip: at(/^hip-/), eye: at(/^eye-/), head: at(/^head-/),
    shoulderHalfBreadth: shoulderBreadth95M().value / 2,
    shoulderAboveHip: shoulderAboveHip95M().value,
  };
};
/** LHD, +Y left — the occupant array's own convention and its default. */
const DRIVER_Y = 370;

const NOSE = ETYPE_FRONT_OVERHANG;
const FRONT_AXLE_X = NOSE;
const REAR_AXLE_X = NOSE + ETYPE_WHEELBASE;
const WHEEL_R = ETYPE_DIAMETER / 2;
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
const s = createSession("E-Type S1 FHC");
const side = { kind: "side" as const };

const LEN = 4453, HW = 828, FLOOR = 120, TOP = 1219;

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
// The E-Type's character is not one line, it is the RATIO of two: a body that
// is full width for half its length, with everything a person reads about the
// shape happening in the ends. 1240 mm of nose sits ahead of the front axle
// and the car is still only two thirds of full width a tenth of the way back.
// The MX-5 is at 94% by then. If a body were a set of numbers tuned to one
// car, that is the number that would break it.
const track = (a: number, b: number, c: number, d: number) =>
  (t: number): number => [a, b, c, d][Math.round(t * 3)]!;

// The four numbers are STATIONS, not extremes, and a cubic forced through
// them overshoots between them — so the widest point of the car is at no
// station at all. The table says what the car should be and the SCRIPT solves
// for what to type: sample the fitted cubic, find its peak, and scale the
// plan tables until the peak is the published half-width.
const HALF_WIDTH = 828;                    // 1657 mm overall
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
const SHOULDER_Y = [175, 770, 800, 300] as const;
const ROCKER_Y = [160, 690, 715, 250] as const;
const planScale = HALF_WIDTH / Math.max(peakOf(SHOULDER_Y), peakOf(ROCKER_Y));
const scaled = (v: readonly [number, number, number, number]) =>
  track(v[0] * planScale, v[1] * planScale, v[2] * planScale, v[3] * planScale);

const shoulderY = scaled(SHOULDER_Y);
// The beltline: low, and it CLIMBS all the way. The MX-5's is flat from the
// cowl to the boot; this one rises from 555 at the nose to just over 1000 at
// the scuttle, because on this car the beltline and the bonnet's shut line
// are the same edge and the bonnet is a quarter of the car long.
const shoulderZ = track(555, 820, 990, 800);
const rockerY = scaled(ROCKER_Y);
const rockerZ = track(420, 150, 150, 415);

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
// On an E-Type in particular the two cuts land on real panel edges. Ahead of
// the scuttle they are the wing crowns, and what they enclose is the bonnet's
// centre panel — the louvred one. Behind it they are the roof rails, and what
// they enclose is screen, roof and backlight in one band while the side glass
// and the quarters stay with the flank. This car's actual panel breaks run
// exactly this way, which is a large part of why it was chosen.
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
const railY0 = track(RAIL_Y0 * 0.16, RAIL_Y0 * 0.86, RAIL_Y0 * 0.92, RAIL_Y0 * 0.42);
const railZ0 = track(540, 812, 1160, 745);
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
const FRONT_LIP = ETYPE_FRONT_TRACK / 2 + ETYPE_TIRE_WIDTH / 2 + ARCH_LIFT;
const REAR_LIP = ETYPE_REAR_TRACK / 2 + ETYPE_TIRE_WIDTH / 2 + ARCH_LIFT;
const AXLE_Z = WHEEL_R;
const [fA, fB] = archMouth(FRONT_AXLE_X);
const [rA, rB] = archMouth(REAR_AXLE_X);
const ARCH_X = [0, fA, FRONT_AXLE_X, fB, rA, REAR_AXLE_X, rB, LEN];

/** Half-width of the rocker at station x — the plan a real sill has. */
const rockerPlanY = profile([
  [0, 195], [180, 340], [430, 490], [620, 592], [fA, FRONT_LIP],
  [FRONT_AXLE_X, FRONT_LIP], [fB, FRONT_LIP],
  [2100, 706], [2800, 706], [rA, REAR_LIP],
  [REAR_AXLE_X, REAR_LIP], [rB, REAR_LIP],
  [4180, 634], [4320, 512], [LEN, 330],
]);
/** Height of the rocker where it is a sill rather than an arch. */
const MOUTH_Z = AXLE_Z + ARCH_R * Math.sin(ARCH_END);
const rockerSillZ = profile([
  // A nose aperture 210 wide by 155 tall, and a tail one 660 by 300. Both are
  // mouldings wrapped round a tip, not plates bolted to a cut-off — the
  // lesson the MX-5's blunt-end pass paid for and the reason both ends here
  // start narrow rather than at a point.
  //
  // THE KNOTS EITHER SIDE OF EACH MOUTH ARE THE POINT. A quarter circle
  // arrives at its mouth rising at 79 degrees and a sill that leaves flat
  // meets it with a corner nobody authored. These pull the sill down steeply
  // within 90 mm of the lip, which is what a real arch flange does, and turn
  // an 87 degree obstruction into a fold the surface can carry.
  [0, 300], [fA - 240, 214], [fA - 90, 318], [fA, MOUTH_Z],
  [fB, MOUTH_Z], [fB + 90, 318], [fB + 240, 200],
  [2100, 152], [2800, 152],
  [rA - 240, 200], [rA - 90, 318], [rA, MOUTH_Z],
  [rB, MOUTH_Z], [rB + 90, 322], [rB + 240, 268], [4320, 356], [LEN, 452],
]);

/**
 * The beltline's plan, on the same seven spans as the rocker.
 *
 * One cubic through four stations cannot be a 350 mm nose AND full width by
 * the front axle: on the MX-5 that left the beltline narrower than the arch
 * lip, and the car came out widest at its SILL with a skirt under the doors.
 * A car is widest at its shoulder. Seven spans is what lets it be, and on
 * this car it has further to travel than on any body yet — 1240 mm of nose
 * from 175 to full width.
 */
const shoulderPlanY = profile([
  [0, 186], [180, 356], [430, 520], [620, 634], [fA, 712],
  [FRONT_AXLE_X, 790], [fB, 820],
  [2100, 828], [2800, 828], [rA, 828],
  [REAR_AXLE_X, 822], [rB, 792],
  [4180, 724], [4320, 616], [LEN, 424],
]);

/**
 * The roof rail's plan and height — the third master line.
 *
 * PLAN is a little over half the beltline's, and it is what makes a
 * greenhouse rather than a canopy: 430 mm at the crown against a body
 * half-width of 828, so the roof is barely half the car's width and the flank
 * tucks a long way under it. Ahead of the scuttle the same line is the wing
 * crown, wider, because a bonnet's centre panel is a wide flat thing and a
 * roof is not.
 *
 * HEIGHT is the top of the body AT that y, which is the number the section
 * pass would otherwise have to invent per station. Both crown and rail come
 * off this one function so they cannot drift apart.
 */
const railPlanY = profile([
  [0, 100], [180, 196], [430, 296], [620, 358], [fA, 402],
  [FRONT_AXLE_X, 436], [fB, 462],
  [2100, 478], [2400, 476], [2560, 462],
  [2960, 436], [3160, 430], [3560, 432],
  [REAR_AXLE_X, 448], [rB, 452],
  [4180, 396], [4320, 306], [LEN, 168],
]);
const railZ = profile([
  [0, 552], [180, 622], [430, 700], [620, 738], [fA, 776],
  [FRONT_AXLE_X, 818], [fB, 852],
  // The bonnet's own crown, and then the scuttle: 160 mm of height in a tenth
  // of the car, which is what a windscreen raked like this one costs.
  [2100, 880], [2400, 910], [2560, 966],
  [2760, 1140], [2960, 1182], [3160, 1208], [3400, 1200],
  [3560, 1158], [REAR_AXLE_X, 1098],
  [3980, 968], [4180, 878], [4320, 806], [LEN, 726],
]);

/**
 * The beltline's HEIGHT, and unlike the MX-5's it had to be authored.
 *
 * There the beltline is flat from the cowl to the boot, so the four-station
 * cubic the box was fitted with was already right and the seven-span pass
 * sampled it back off the curve and handed it over unchanged — a plan change
 * and nothing else, which is what let the report say which move did what.
 * This car's beltline climbs 430 mm from the nose to the crown and falls 250
 * to the tail, and no cubic goes near it, so here it is a table like the rest.
 * It must stay BELOW `railZ` everywhere or the side band turns inside out.
 */
const shoulderZprofile = profile([
  [0, 544], [180, 610], [430, 682], [620, 722], [fA, 762],
  [FRONT_AXLE_X, 790], [fB, 822],
  [2100, 845], [2400, 872], [2560, 900],
  [2760, 940], [2960, 966], [3160, 978], [3400, 976],
  [3560, 962], [REAR_AXLE_X, 936],
  [3980, 890], [4180, 856], [4330, 780], [LEN, 726],
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
  segmentAt(shoulder, forward);
  const n = s.state.curves.get(s.state.resolveCurve(shoulder))!.chain.segs.length;
  if (n !== 7) throw new Error(`shoulder has ${n} segments, expected 7`);
  fitChain(shoulder, (seg, local) => {
    const j = forward ? seg : 6 - seg;
    const k = forward ? local : 1 - local;
    const x = ARCH_X[j]! + (ARCH_X[j + 1]! - ARCH_X[j]!) * k;
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
  segmentAt(rail, forward);
  const n = s.state.curves.get(s.state.resolveCurve(rail))!.chain.segs.length;
  if (n !== 7) throw new Error(`roof rail has ${n} segments, expected 7`);
  fitChain(rail, (seg, local) => {
    const j = forward ? seg : 6 - seg;
    const k = forward ? local : 1 - local;
    const x = ARCH_X[j]! + (ARCH_X[j + 1]! - ARCH_X[j]!) * k;
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
const sub = etypeConfig.substrate;
const RAIL_Y = sub.railSpacing.value / 2;
const RAIL_H = sub.railSectionHeight.value, RAIL_W = sub.railSectionWidth.value;
const RAIL_Z = etypeConfig.placement.railHeight.value;
/** Top face of a rail — what a floor pan would land on. */
const RAIL_TOP = RAIL_Z + RAIL_H / 2;
/** Pad plan size, and the least daylight a pad is worth making. */
const MOUNT_PAD = 90, MOUNT_H = 12;
/** Stations with a crossmember, and so the candidates for a body mount. */
const MOUNT_X = [2700, 3180, 3660];
/**
 * Top of the transmission tunnel — propshaft, bellhousing and twin pipes.
 *
 * On the MX-5 this number had to be argued with the CABIN FLOOR, because that
 * car's cockpit is a well cut into the body and the tunnel was pressing into
 * it. A coupe has no well: the tunnel is inside a closed shell and the only
 * thing it has to clear is the roof, which is nine hundred millimetres up. It
 * is kept because the chassis lens still measures against it.
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
  // NEGATIVE OVER THE WINGS, and that is the E-Type's bonnet in one number.
  // A wing crowns above the panel between the wings, so the centre band has
  // to sit BELOW its own rails there — the valley either side of the power
  // bulge that every photograph of this car shows and that a positive crown
  // everywhere cannot produce. One cubic rail to rail carries one extremum,
  // so this is a valley here and a bulge four hundred millimetres later, and
  // it cannot be both at once.
  [0, 6], [430, -4], [620, -12], [fA, -16],
  [FRONT_AXLE_X, -18], [fB, -10],
  // The power bulge itself.
  [1950, 30], [2300, 28], [2560, 18],
  [2980, 14], [3160, 14], [REAR_AXLE_X, 13], [rB, 11], [LEN, 5],
]);
const crownZ = (x: number): number => railZ(x) + crownRise(x);

const STATIONS: {
  x: number; roof: number; floor: number; hip: number; hipAt: number;
  sailBulge: number; name: string;
}[] = ([
  { x: 120,  floor: 400, hip: 300, hipAt: 0.50, sailBulge: 5,  name: "nose-tip" },
  { x: 330,  floor: 300, hip: 492, hipAt: 0.50, sailBulge: 9,  name: "mouth" },
  { x: 620,  floor: 200, hip: 660, hipAt: 0.52, sailBulge: 16, name: "lamp-pods" },
  { x: archMouth(FRONT_AXLE_X)[0], floor: 160, hip: 752, hipAt: 0.55, sailBulge: 20, name: "arch-front-lead" },
  { x: FRONT_AXLE_X, floor: 150, hip: 812, hipAt: 0.56, sailBulge: 22, name: "front-axle" },
  { x: archMouth(FRONT_AXLE_X)[1], floor: 145, hip: 828, hipAt: 0.52, sailBulge: 20, name: "arch-front-trail" },
  { x: 1950, floor: 140, hip: 828, hipAt: 0.46, sailBulge: 16, name: "bonnet-mid" },
  { x: 2300, floor: 145, hip: 828, hipAt: 0.44, sailBulge: 12, name: "bonnet-rear" },
  // ── the greenhouse ──────────────────────────────────────────────────────
  // From here the roof rail climbs 240 mm in 600 and the beltline climbs 78.
  // That difference IS the windscreen, and it is why the sail band goes from
  // a wing top to a piece of glass without changing what it is.
  { x: 2560, floor: 150, hip: 828, hipAt: 0.42, sailBulge: 8,  name: "scuttle" },
  { x: 2790, floor: 155, hip: 826, hipAt: 0.40, sailBulge: 5,  name: "screen-mid" },
  { x: 2980, floor: 158, hip: 825, hipAt: 0.40, sailBulge: 4,  name: "screen-top" },
  { x: 3160, floor: 160, hip: 824, hipAt: 0.41, sailBulge: 4,  name: "roof" },
  { x: archMouth(REAR_AXLE_X)[0], floor: 162, hip: 823, hipAt: 0.44, sailBulge: 5, name: "arch-rear-lead" },
  { x: 3480, floor: 168, hip: 822, hipAt: 0.50, sailBulge: 8,  name: "roof-rear" },
  { x: REAR_AXLE_X, floor: 175, hip: 820, hipAt: 0.56, sailBulge: 12, name: "rear-axle" },
  { x: archMouth(REAR_AXLE_X)[1], floor: 195, hip: 770, hipAt: 0.54, sailBulge: 12, name: "arch-rear-trail" },
  { x: 4250, floor: 288, hip: 668, hipAt: 0.48, sailBulge: 9,  name: "tail" },
  { x: 4390, floor: 390, hip: 500, hipAt: 0.48, sailBulge: 4,  name: "tail-tuck" },
] as const).map((st) => ({ ...st, roof: crownZ(st.x) }));

// Every arch mouth and crown must BE a station: the rocker can only be split
// where no cell claims across, and a station cut is what makes that true.
for (const x of [...archMouth(FRONT_AXLE_X), FRONT_AXLE_X, ...archMouth(REAR_AXLE_X), REAR_AXLE_X]) {
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
// A panel is a connected run of cells with the GAP-marked curves cut, and on
// this car the runs are unusually easy to name, because an E-Type's panels
// are unusually large.
//
// THE BONNET IS EVERYTHING FORWARD OF THE SCUTTLE. Not a hood with wings
// bolted either side of it — one forward-hinged clamshell carrying the nose,
// both front wings, the mouth surround and the lamp fairings, a quarter of
// the car in one pressing. So its shut is a single RING at the scuttle
// station: deck, both sails, both flanks. Nothing else has to be said, and
// nothing about the bonnet's own interior may be gapped or it stops being one
// piece. The MX-5 needed six cuts and a split to describe a bonnet; this one
// needs a ring, and the difference is the car rather than the tool.
//
// THE DOOR IS THE FLANK AND THE SAIL between two rings, which is what the
// roof rail bought: gapping the rail between those rings separates the door's
// glass frame from the roof it closes against. That is a drip rail, every
// closed car has one, and until this build there was no seam there to mark.
//
// The rule the arches taught still holds and everything below obeys it:
// splitting moves nothing and is safe after the cuts; shaping is not. No
// control point moves in this section.

const BONNET_SHUT = "scuttle";     // x = 2560 — the bonnet's rear edge and the door's front
const TAIL_SHUT = "roof-rear";     // x = 3480 — the door's rear edge and the tailgate's front

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
for (const name of [BONNET_SHUT, TAIL_SHUT]) {
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

// THE DRIP RAIL — the roof rail between the two rings, and nowhere else. Ahead
// of the scuttle the same line runs down the middle of the bonnet, where
// there is no seam at all: the bonnet is one pressing and marking a groove
// along its centre would invent a panel the car does not have. Behind the
// tailgate ring it is the hatch's own surface. So the rail is split at both
// stations and only the middle piece is marked.
for (const rail of railIds) {
  const [, aft] = cutSpanAt(rail, stationX(BONNET_SHUT));
  const [cabin] = cutSpanAt(aft, stationX(TAIL_SHUT));
  s.apply("crease", { curveId: cabin });
  s.apply("gap", { curveId: cabin });
}

// THE TAILGATE'S WAIST. Aft of the rear ring the beltline IS a shut: above it
// is the hatch, below it the rear quarter. Forward of that ring it is not one
// — the door is a single pressing from sill to glass and the bonnet is a
// single pressing over the whole nose — so the beltline is split at the ring
// and only the aft piece is marked. The MX-5 gapped its beltline end to end
// and was right to; on a roadster that line is the seam for the whole length
// of the car, and on a coupe it is a seam for the last fifth.
for (const shoulder of shoulderIds) {
  const [, aft] = cutSpanAt(shoulder, stationX(TAIL_SHUT));
  s.apply("crease", { curveId: aft });
  s.apply("gap", { curveId: aft });
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
const HALF = ETYPE_TIRE_WIDTH / 2;
if (process.env["NOWHEELS"] !== "1") {
  wheel(FRONT_AXLE_X, WHEEL_R, HALF, ETYPE_FRONT_TRACK / 2 - HALF);
  wheel(REAR_AXLE_X, WHEEL_R, HALF, ETYPE_REAR_TRACK / 2 - HALF);
}

// ── the chassis: TWO structures, which is what this car is ────────────────
// An E-Type is a monocoque tub from the scuttle back and a bolted tubular
// frame ahead of it. That is not trivia, it is the layout: the tub is the
// passenger cell and carries the rear suspension through a cage; the frame
// carries the engine, the front suspension and the whole bonnet, and the two
// meet at a bulkhead you can unbolt. Nobody who has looked under one thinks
// of it as a single structure and the model should not either.
//
// WHAT THAT CHANGES IN THE READING, and it is the point of building this car
// third. The MX-5's frame hangs BELOW its floor pan and carries the body on
// pads — 4 of 4 registered at 3 mm. A tub has no body mounts at all, because
// the body IS the structure: the longerons sit on top of the floor, inside
// the skin, welded. The same lens run against the same rule should therefore
// report the opposite of the MX-5 on registration and the same on
// containment, and if it does not, one of the two cars is wrong.
const chassisCells: Id[] = [];
const frameCells: Id[] = [];
const mounts: BodyMount[] = [];
/** Crossmember stations the body WRAPS rather than sits on — reported, not faulted. */
const wrapped: number[] = [];
if (process.env["NOCHASSIS"] !== "1") {
  const chassisBefore = new Set(s.state.cells.keys());
  /** A box, and every curve it made straightened — structure is straight. */
  const beam = (rect: {
    view: { kind: "side" | "front" }; a: [number, number]; b: [number, number]; depth: number; at: number;
  }): void => {
    const before = new Set(s.state.curves.keys());
    s.apply("tape", { kind: "box", rect: rect as never });
    for (const id of [...s.state.curves.keys()] as Id[]) {
      if (before.has(id)) continue;
      straighten(id);
      s.apply("crease", { curveId: id });
    }
  };

  // ── the tub ─────────────────────────────────────────────────────────────
  const TUB_FRONT = 2500, TUB_REAR = 3820;
  // Floor longerons, either side of the tunnel. On a tub these sit ON the
  // floor pan rather than under it, which is the whole structural difference
  // and the reason the registration reading below comes out the way it does.
  beam({
    view: side,
    a: [TUB_FRONT, RAIL_Z - RAIL_H / 2], b: [TUB_REAR, RAIL_Z + RAIL_H / 2],
    depth: RAIL_W, at: RAIL_Y - RAIL_W / 2,
  });
  // The sills, and on this car they ARE the structure: a tub with a floor
  // this shallow carries its bending in the rockers, which is why an E-Type's
  // sills are as deep as they are and why cutting one scraps the car.
  const SILL_Y = 630;
  beam({
    view: side,
    a: [TUB_FRONT, 178], b: [3560, 178 + sub.rockerHeight.value],
    depth: sub.rockerWidth.value, at: SILL_Y - sub.rockerWidth.value / 2,
  });
  const mirrored = [...s.state.cells.keys()].filter((id) => !chassisBefore.has(id)) as Id[];

  // The tunnel: propshaft, the Moss box's bellhousing and twin pipes. Wide,
  // because you sit either side of it rather than over it.
  beam({
    view: side,
    a: [2450, RAIL_Z - RAIL_H / 2], b: [3760, RAIL_Z - RAIL_H / 2 + sub.tunnelHeight.value],
    depth: sub.tunnelWidth.value, at: -sub.tunnelWidth.value / 2,
  });
  // The two bulkheads, and the seat crossmember between them. The front one
  // is the interface: everything ahead of it is a separate structure.
  beam({
    view: { kind: "front" as const },
    a: [-640, 180], b: [640, 815], depth: 58, at: 2532,
  });
  beam({
    view: { kind: "front" as const },
    a: [-600, 180], b: [600, 740], depth: 58, at: 3730,
  });
  beam({
    view: { kind: "front" as const },
    a: [-RAIL_Y - RAIL_W / 2, RAIL_Z - RAIL_H / 2], b: [RAIL_Y + RAIL_W / 2, RAIL_Z + RAIL_H / 2],
    depth: 70, at: 3180,
  });
  // The rear suspension cage: the E-Type's IRS is a subframe bolted into the
  // tub, carrying the diff, the inboard discs and both coilover pairs.
  beam({
    view: { kind: "front" as const },
    a: [-430, 180], b: [430, 430], depth: 380, at: 3500,
  });

  for (const id of [...s.state.cells.keys()] as Id[]) {
    if (chassisBefore.has(id)) continue;
    chassisCells.push(id);
    if (!mirrored.includes(id)) s.apply("mirror-detach", { cellId: id });
  }

  // ── the front frame ─────────────────────────────────────────────────────
  // Square tube, triangulated, from the bulkhead to a picture frame at the
  // nose that carries the radiator and the bonnet's hinge. The real one is
  // one-inch tube; 34 mm here, because a 25 mm member disappears at print
  // density and this model is read by eye as well as by lens.
  const frameBefore = new Set(s.state.cells.keys());
  const TUBE = 34;
  const FRAME_NOSE = 1180, FRAME_REAR = 2532;
  const LOW_Y = 272, LOW_Z = 246, UP_Y = 336, UP_Z = 622;
  for (const [y, z] of [[LOW_Y, LOW_Z], [UP_Y, UP_Z]] as const) {
    beam({
      view: side,
      a: [FRAME_NOSE, z - TUBE / 2], b: [FRAME_REAR, z + TUBE / 2],
      depth: TUBE, at: y - TUBE / 2,
    });
  }
  // Two verticals a side, which is where the triangulation would land if this
  // tool could author a diagonal in a side view without shearing four curves
  // by hand. Named as the simplification it is rather than drawn as a truss
  // and called one.
  for (const x of [1560, 2080]) {
    for (const y of [LOW_Y, UP_Y]) {
      beam({
        view: side,
        a: [x - TUBE / 2, LOW_Z], b: [x + TUBE / 2, UP_Z],
        depth: TUBE, at: y - TUBE / 2,
      });
    }
  }
  // The picture frame: the ring at the nose the radiator hangs in and the
  // bonnet hinges from.
  for (const [z, h] of [[LOW_Z, TUBE], [UP_Z, TUBE]] as const) {
    beam({
      view: { kind: "front" as const },
      a: [-UP_Y, z - h / 2], b: [UP_Y, z + h / 2], depth: TUBE, at: FRAME_NOSE,
    });
  }
  for (const y of [UP_Y, -UP_Y]) {
    beam({
      view: side,
      a: [FRAME_NOSE, LOW_Z], b: [FRAME_NOSE + TUBE, UP_Z],
      depth: TUBE, at: y - TUBE / 2,
    });
  }
  for (const id of [...s.state.cells.keys()] as Id[]) {
    if (frameBefore.has(id)) continue;
    frameCells.push(id);
    chassisCells.push(id);
    s.apply("mirror-detach", { cellId: id });
  }

  // ── body mounts, and why this car has none ──────────────────────────────
  // Same rule as the MX-5, applied to a different structure and giving the
  // opposite answer. A pad is a SHIM from the member's top face up to the
  // body's underside, and it only exists where there is daylight to shim: on
  // a body-on-frame car the pan sits above the rail and every pad is real,
  // and on a tub the floor pan is BELOW the longeron — the member is inside
  // the body, welded to it — so there is nothing for a pad to span. The lens
  // reports every station as wrapped, and that is the correct reading of a
  // monocoque rather than a failure to find something.
  for (const x of MOUNT_X) {
    const padTop = undersideAt(x, RAIL_Y);
    if (!Number.isFinite(padTop) || padTop < RAIL_TOP + 1) { wrapped.push(x); continue; }
    beam({
      view: side,
      a: [x - MOUNT_PAD / 2, RAIL_TOP], b: [x + MOUNT_PAD / 2, padTop],
      depth: MOUNT_PAD, at: RAIL_Y - MOUNT_PAD / 2,
    });
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
const SCREEN_FROM = stationX(BONNET_SHUT);   // 2560 — the scuttle
const SCREEN_TO = stationX("screen-top");    // 2980 — the header
const GLASS_FROM = SCREEN_TO;                // door glass starts where the screen ends
const GLASS_TO = stationX(TAIL_SHUT);        // 3480
const BACKLIGHT_FROM = GLASS_TO;
const BACKLIGHT_TO = stationX("arch-rear-trail");
/** Top of the windscreen header — the number the cabin lens reads the eye against. */
const HEADER_TOP_Z = crownZ(SCREEN_TO);
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
const MATERIALS = {
  paint: CATALOGUE["British Racing Green"]!,
  screen: CATALOGUE["windscreen"]!,
  backlight: CATALOGUE["backlight"]!,
  sideGlass: CATALOGUE["side glass"]!,
  chassis: CATALOGUE["chassis"]!,
  under: CATALOGUE["undertray"]!,
  tyre: CATALOGUE["6.40-15"]!,
  rim: CATALOGUE["wire wheel"]!,
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
    if (across && !endFace && lo[2]! < 480) { give(id, MATERIALS.under); continue; }
    if (across && !endFace) {
      // The centre band. Screen and backlight are glass; bonnet centre and
      // roof are paint. All four are the same surface and always were — a
      // windscreen IS the roof of a car for the length of the windscreen.
      if (inBand(SCREEN_FROM, SCREEN_TO)) give(id, MATERIALS.screen);
      else if (inBand(BACKLIGHT_FROM, BACKLIGHT_TO)) give(id, MATERIALS.backlight);
      else give(id, MATERIALS.paint);
      continue;
    }
    const isSail = !across && !endFace && lo[2]! > shoulderZprofile(mid) - 25;
    if (isSail && inBand(GLASS_FROM, GLASS_TO)) give(id, MATERIALS.sideGlass);
    else give(id, MATERIALS.paint);
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
writeFileSync(new URL("../cars/etype-s1-fhc.car.json", import.meta.url), JSON.stringify(doc));
writeFileSync(new URL("../../etype-s1-fhc.stl", import.meta.url), writeStlBinary({ ...printed, normals: shaded.normals }, "etype-s1-fhc"));

const pad = (k: string) => k + " ".repeat(Math.max(0, 26 - k.length));
const line = (k: string, v: string) => console.log("  " + pad(k) + v);
const deg = (v: number) => (v < 1e-3 ? v.toExponential(1) : v.toFixed(3)) + "°";

console.log("\nJaguar E-Type S1 3.8 FHC — the third car\n");
line("cells · curves · verbs", `${quilt.cells.length} · ${s.state.curves.size} · ${doc.verbs.length}`);
line("overall, as built", dims(asBuilt));
line("  as authored", dims(asAuthored));
line("  published 1961", `${ETYPE_LENGTH} × ${ETYPE_WIDTH} × ${ETYPE_HEIGHT} mm (ASSUMED from recall — see etype.ts)`);
line("G1 continuity", `${g1.g1Joins}/${g1.joins} joins · median ${deg(g1.medianDeg)} · worst ${deg(g1.worstDeg)}`);
line("  was, unfielded", `${g1bare.g1Joins}/${g1bare.joins} · worst ${g1bare.worstDeg.toFixed(1)}°`);
line("G2 curvature", `${g2.g2Joins}/${g2.joins} within 1% · median rel ${(g2.medianRelative * 100).toFixed(4)}% · p90 ${(g2.p90Relative * 100).toFixed(3)}%`);
line("curve network", `${net.cleanCorners}/${net.corners} corners coplanar · worst ${net.worstDeg.toFixed(2)}°`);
if (process.env["DBG"] === "1") {
  for (const c of [...net.open].sort((a, b) => b.angleDeg - a.angleDeg).slice(0, 8)) {
    console.log(`  DBG corner ${c.angleDeg.toFixed(1)}° at [${c.at.map((v) => v.toFixed(0)).join(", ")}] · ${c.curveId} ${c.cellA}|${c.cellB}`);
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
    : `NONE — the head is ${(-cabin.headroom!).toFixed(0)} mm THROUGH the roof. The occupant model sits at SAE J4004's 25 degree back angle and an E-Type's seat reclines a long way past that, so some of this is the person and not the car — but not 192 mm of it, and the real coupe is famous for the same complaint`);
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
  for (const st of ETYPE_PROFILE) {
    const x = Math.min(LEN - 3, Math.max(3, st.at * LEN));
    const sec = sectionAt(skin, x, 500);
    const dw = sec.width / 2 - st.halfWidth, dz = sec.top - st.top;
    if (Math.abs(dw) > Math.abs(worstW)) { worstW = dw; atW = x; }
    if (Math.abs(dz) > Math.abs(worstZ)) worstZ = dz;
    if (Math.abs(dw) > ETYPE_PROFILE_TOLERANCE_MM || Math.abs(dz) > ETYPE_PROFILE_TOLERANCE_MM) over++;
    if (process.env["DBG"] === "1") {
      console.log(`  DBG profile ${st.at.toFixed(2)} x${x.toFixed(0)} half ${(sec.width / 2).toFixed(0)}/${st.halfWidth} ${dw > 0 ? "+" : ""}${dw.toFixed(0)} · top ${sec.top.toFixed(0)}/${st.top} ${dz > 0 ? "+" : ""}${dz.toFixed(0)}`);
    }
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
  const fit = chassisFit(skin, structure, mounts);
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
      line("  body mounts", "NONE, and that is the reading. A monocoque has no body mounts because the " +
        "body IS the structure: the longerons sit ON the floor pan rather than under it, welded, inside " +
        "the skin. The MX-5 runs the same rule and gets 4 of 4 at 3 mm");
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

  line("profile vs the real car",
    `worst ${worstW.toFixed(0)} mm wide at x ${atW.toFixed(0)} · ${worstZ.toFixed(0)} mm tall · ` +
    `${over} of ${ETYPE_PROFILE.length} stations outside ${ETYPE_PROFILE_TOLERANCE_MM} mm (reference ASSUMED)`);
}
line("triangles", `${(mesh.indices.length / 3).toLocaleString("en-GB")}`);
console.log("\nwrote cars/etype-s1-fhc.car.json and etype-s1-fhc.stl\n");
