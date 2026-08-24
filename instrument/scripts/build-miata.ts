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
import { assembleCar } from "@car/types";
import { solve } from "@car/pack";
import {
  miataConfig, MX5_DIAMETER, MX5_FRONT_OVERHANG, MX5_FRONT_TRACK, MX5_REAR_TRACK,
  MX5_TIRE_WIDTH, MX5_WHEELBASE,
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
const car = assembleCar(miataConfig, makeAllocator());
const packed = solve(car.input);

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
const shoulderZ = track(620, 860, 845, 780);
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
  if (x <= fA) return ramp(0, 150, fA, FRONT_LIP);
  if (x <= fB) return FRONT_LIP;
  if (x <= rA) {
    const mid = 0.5 * (fB + rA);
    return x <= mid ? ramp(fB, FRONT_LIP, mid, 742) : ramp(mid, 742, rA, REAR_LIP);
  }
  if (x <= rB) return REAR_LIP;
  return ramp(rB, REAR_LIP, LEN, 250);
};
/** Height of the rocker where it is a sill rather than an arch. */
const rockerSillZ = (x: number): number => {
  const ramp = (x0: number, z0: number, x1: number, z1: number): number => {
    const u = Math.min(1, Math.max(0, (x - x0) / (x1 - x0)));
    return z0 + (z1 - z0) * (u * u * (3 - 2 * u));
  };
  const MOUTH_Z = AXLE_Z + ARCH_R * Math.sin(ARCH_END);
  if (x <= fA) return ramp(0, 236, fA, MOUTH_Z);
  if (x >= rB) return ramp(rB, MOUTH_Z, LEN, 252);
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
    [0, 150], [fA, 700], [FRONT_AXLE_X, 826], [fB, 838],
    [rA, 838], [REAR_AXLE_X, 830], [rB, 786], [LEN, 260],
  ];
  for (let i = 0; i < T.length - 1; i++) {
    const [x0, y0] = T[i]!, [x1, y1] = T[i + 1]!;
    if (x <= x1) {
      const u = Math.min(1, Math.max(0, (x - x0) / (x1 - x0)));
      return y0 + (y1 - y0) * (u * u * (3 - 2 * u));
    }
  }
  return T[T.length - 1]![1];
};

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
  { x: 90,   roof: 570,  roofY: 150, floor: 250, hip: 250, hipAt: 0.45, name: "nose-tuck" },
  { x: 300,  roof: 660,  roofY: 300, floor: 200, hip: 470, hipAt: 0.48, name: "nose" },
  { x: archMouth(FRONT_AXLE_X)[0], roof: 736,  roofY: 400, floor: 152, hip: 724, hipAt: 0.58, name: "arch-front-lead" },
  { x: 620,  roof: 790,  roofY: 460, floor: 140, hip: 800, hipAt: 0.66, name: "front-fascia" },
  { x: 790,  roof: 830,  roofY: 500, floor: 132, hip: 838, hipAt: 0.74, name: "front-axle" },
  { x: 1000, roof: 858,  roofY: 540, floor: 130, hip: 830, hipAt: 0.68, name: "lamp-pods" },
  { x: archMouth(FRONT_AXLE_X)[1], roof: 856,  roofY: 552, floor: 129, hip: 812, hipAt: 0.58, name: "arch-front-trail" },
  { x: 1400, roof: 838,  roofY: 560, floor: 128, hip: 812, hipAt: 0.50, name: "hood-mid" },
  { x: 1700, roof: 890,  roofY: 600, floor: 128, hip: 820, hipAt: 0.45, name: "cowl" },
  { x: 1980, roof: 1090, roofY: 400, floor: 128, hip: 826, hipAt: 0.40, name: "screen" },
  { x: 2280, roof: 1232, roofY: 320, floor: 128, hip: 828, hipAt: 0.38, name: "header" },
  { x: 2560, roof: 1215, roofY: 330, floor: 130, hip: 830, hipAt: 0.40, name: "top-rear" },
  { x: archMouth(REAR_AXLE_X)[0], roof: 1140, roofY: 400, floor: 133, hip: 826, hipAt: 0.56, name: "arch-rear-lead" },
  { x: 2880, roof: 1075, roofY: 440, floor: 136, hip: 836, hipAt: 0.64, name: "backlight" },
  { x: 3055, roof: 985,  roofY: 560, floor: 142, hip: 844, hipAt: 0.74, name: "rear-axle" },
  { x: archMouth(REAR_AXLE_X)[1], roof: 906,  roofY: 556, floor: 168, hip: 812, hipAt: 0.60, name: "arch-rear-trail" },
  { x: 3480, roof: 894,  roofY: 540, floor: 182, hip: 800, hipAt: 0.60, name: "deck" },
  { x: 3720, roof: 848,  roofY: 430, floor: 218, hip: 700, hipAt: 0.55, name: "tail" },
  { x: 3900, roof: 800,  roofY: 300, floor: 252, hip: 470, hipAt: 0.50, name: "tail-tuck" },
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
for (let i = 0; i < STATIONS.length; i++) {
  const st = STATIONS[i]!;
  const sec = sections[i]!;
  for (const [id, wantZ, wantY] of [[sec.deck, st.roof, st.roofY], [sec.under, st.floor, 0]] as const) {
    const [p0, , , p3] = ctrlsOf(id);
    const endZ = (p0[2] + p3[2]) / 2;
    const ctrlZ = (wantZ - 0.25 * endZ) / 0.75;
    const yAt = wantY > 0 ? wantY : ((Math.abs(p0[1]) + Math.abs(p3[1])) / 2) * 0.74;
    setCtrl(id, 1, [st.x, Math.sign(p0[1]) * yAt, ctrlZ]);
    setCtrl(id, 2, [st.x, Math.sign(p3[1]) * yAt, ctrlZ]);
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
for (const master of rockerIds) {
  const rocker = master;
  const isRocker = true;
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
  if (isRocker) {
    for (const j of [1, 2, 4, 5]) {
      s.apply("crease", { curveId: inX[j]! });
      archSpans.push(inX[j]!);
    }
  }
}

// ── the lines the body is read by ─────────────────────────────────────────
// The beltline and sill are creased on both cars, and that is the ONLY thing
// the two share at this step. The P1 gets a hood shutline at the cowl and a
// deck shutline at the backlight; this car's boot lid opens at the backlight
// and its bonnet at the cowl, so the stations differ and the marks land where
// the panels actually split.
for (const name of ["cowl", "backlight"]) {
  const k = STATIONS.findIndex((st) => st.name === name);
  const sec = sections[k];
  if (!sec) continue;
  s.apply("crease", { curveId: sec.deck });
  s.apply("gap", { curveId: sec.deck });
}

// The pop-up lamp pods are a rise in the bonnet here and not two discrete
// pods, and the reason is the same one the wheel arches ran into: a station
// curve is ONE cubic across the car, so it can carry a crown but not two
// bumps with a valley between them. Authoring the real pods needs a verb that
// splits a curve into children. The frame does not have one, and saying so is
// better than shipping a hood that pretends.

// ── the door cut ──────────────────────────────────────────────────────────
const facesAt = (x: number, pick: (yMean: number, zMean: number) => boolean): { id: Id; z: number }[] => {
  const out: { id: Id; z: number }[] = [];
  for (const [id, cell] of s.state.cells) {
    let lo = Infinity, hi = -Infinity, ySum = 0, zSum = 0, n = 0;
    for (const sd of cell.sides) {
      const curve = s.state.curves.get(s.state.resolveCurve(sd.curveId));
      if (!curve) continue;
      for (const t of [0, 0.5, 1]) {
        const p = evalChain(curve.chain, sd.t0 + (sd.t1 - sd.t0) * t);
        lo = Math.min(lo, p[0]); hi = Math.max(hi, p[0]); ySum += p[1]; zSum += p[2]; n++;
      }
    }
    if (n === 0 || !(lo < x && hi > x)) continue;
    if (pick(ySum / n, zSum / n)) out.push({ id, z: zSum / n });
  }
  return out;
};
const faceAt = (x: number, pick: (y: number, z: number) => boolean, want: "low" | "high" = "low"): Id => {
  const found = facesAt(x, pick);
  if (found.length === 0) throw new Error(`no face at x=${x}`);
  found.sort((a, b) => a.z - b.z);
  return (want === "low" ? found[0]! : found[found.length - 1]!).id;
};
const isFlank = (sign: 1 | -1) => (y: number): boolean => Math.sign(y) === sign && Math.abs(y) > 340;

for (const sign of [1, -1] as const) {
  const doorCell = faceAt(2150, isFlank(sign), "high");
  const before = s.state.curves.size;
  s.apply("tape", {
    kind: "line",
    line: { view: side, a: [2150, 500], b: [2150, 1000], lineClass: "tape" },
    targets: [doorCell],
  });
  for (const id of [...s.state.curves.keys()].slice(before)) {
    s.apply("crease", { curveId: id as Id });
    s.apply("gap", { curveId: id as Id });
  }
}

// ── wheels ────────────────────────────────────────────────────────────────
// Same construction as the P1: eight cubic arcs, no cuts. A cubic fits a 90°
// arc to three parts in ten thousand, which at this radius is 0.09 mm.
const wheel = (cx: number, radius: number, halfWidth: number, yIn: number): void => {
  const before = new Set(s.state.curves.keys());
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
};
const HALF = MX5_TIRE_WIDTH / 2;
if (process.env["NOWHEELS"] !== "1") {
  wheel(FRONT_AXLE_X, WHEEL_R, HALF, MX5_FRONT_TRACK / 2 - HALF);
  wheel(REAR_AXLE_X, WHEEL_R, HALF, MX5_REAR_TRACK / 2 - HALF);
}

// ── the nose and tail panels ──────────────────────────────────────────────
// The box's two end faces are flat cross-car panels whose boundary curves
// break hard. Marking them moves no geometry; it changes what the document
// admits, and it is what stops the field bending a panel out of its own plane
// trying to make a 60-degree corner tangent-continuous.
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
  for (const sd of cell.sides) s.apply("crease", { curveId: s.state.resolveCurve(sd.curveId) });
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
line("field moved body", `${phi.median.toFixed(1)} mm median · ${phi.p90.toFixed(1)} p90 · ${phi.worst.toFixed(0)} worst`);
line("panels", `${panels.panels.length} pieces — ${bySize(panels).map((p) => p.cells.length).join(" + ")} cells`);
line("seams", `${panels.shutlines} shut · ${panels.features} feature · ${panels.smooth} smooth`);
line("control net", `(${degU},${degV}) · ${tiles.toLocaleString("en-GB")} tiles · ${control.toLocaleString("en-GB")} control points`);
line("  net vs evaluator", `${netWorst.toExponential(1)} mm worst, against a gate of 1e-9`);
line("closed mesh", `${check.closed} (${check.violations.length} violations)`);
line("mirror symmetry", `worst ${sym.worst.toFixed(4)} mm · ${sym.over} of ${sym.vertices.toLocaleString("en-GB")} vertices over ${sym.tolerance} mm`);
line("  bare blend", `worst ${symBare.worst.toFixed(4)} mm — the field's contribution is the difference`);
line("triangles", `${(mesh.indices.length / 3).toLocaleString("en-GB")}`);
console.log("\nwrote cars/mx5-na.car.json and mx5-na.stl\n");
