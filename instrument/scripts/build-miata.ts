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
  closedMeshCheck, creaseNormals, engraveGrooves, meshQuilt, writeStlBinary,
} from "@car/mesh";
import { dist3, evalChain } from "@car/num";

// ── 1. the packaging solve ────────────────────────────────────────────────
const car = assembleCar(miataConfig, makeAllocator());
const packed = solve(car.input);

const NOSE = MX5_FRONT_OVERHANG;
const FRONT_AXLE_X = NOSE;
const REAR_AXLE_X = NOSE + MX5_WHEELBASE;
const WHEEL_R = MX5_DIAMETER / 2;

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
const fitThrough = (id: Id, f: (t: number) => Pt3): void => {
  const A = f(0), B = f(1 / 3), C = f(2 / 3), D = f(1);
  const p1: Pt3 = [0, 1, 2].map((k) =>
    3 * B[k]! - 1.5 * C[k]! - (5 / 6) * A[k]! + (1 / 3) * D[k]!) as unknown as Pt3;
  const p2: Pt3 = [0, 1, 2].map((k) =>
    3 * C[k]! - 1.5 * B[k]! - (5 / 6) * D[k]! + (1 / 3) * A[k]!) as unknown as Pt3;
  setCtrl(id, 0, A);
  setCtrl(id, 3, D);
  setCtrl(id, 1, p1);
  setCtrl(id, 2, p2);
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
const shoulderZ = track(600, 800, 815, 770);
const rockerY = scaled(ROCKER_Y);
const rockerZ = track(232, 128, 128, 246);

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
  { x: 560,  roof: 762,  roofY: 430, floor: 146, hip: 762, hipAt: 0.60, name: "front-fascia" },
  { x: 790,  roof: 830,  roofY: 500, floor: 132, hip: 830, hipAt: 0.72, name: "front-axle" },
  { x: 1050, roof: 862,  roofY: 545, floor: 130, hip: 822, hipAt: 0.62, name: "lamp-pods" },
  { x: 1400, roof: 838,  roofY: 560, floor: 128, hip: 812, hipAt: 0.50, name: "hood-mid" },
  { x: 1700, roof: 890,  roofY: 600, floor: 128, hip: 820, hipAt: 0.45, name: "cowl" },
  { x: 1980, roof: 1090, roofY: 400, floor: 128, hip: 826, hipAt: 0.40, name: "screen" },
  { x: 2280, roof: 1232, roofY: 320, floor: 128, hip: 828, hipAt: 0.38, name: "header" },
  { x: 2560, roof: 1215, roofY: 330, floor: 130, hip: 830, hipAt: 0.40, name: "top-rear" },
  { x: 2800, roof: 1120, roofY: 390, floor: 134, hip: 834, hipAt: 0.52, name: "backlight" },
  { x: 3055, roof: 985,  roofY: 560, floor: 142, hip: 838, hipAt: 0.70, name: "rear-axle" },
  { x: 3400, roof: 900,  roofY: 540, floor: 175, hip: 806, hipAt: 0.62, name: "deck" },
  { x: 3720, roof: 848,  roofY: 430, floor: 218, hip: 700, hipAt: 0.55, name: "tail" },
  { x: 3900, roof: 800,  roofY: 300, floor: 252, hip: 470, hipAt: 0.50, name: "tail-tuck" },
];

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
  const acrossCar = (id: Id): boolean => {
    const c = s.state.curves.get(s.state.resolveCurve(id))!;
    const a0 = evalChain(c.chain, 0), a1 = evalChain(c.chain, 1);
    return Math.abs(a1[1] - a0[1]) > Math.abs(a1[2] - a0[2]);
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

// ── the lines the body is read by ─────────────────────────────────────────
// The beltline and sill are creased on both cars, and that is the ONLY thing
// the two share at this step. The P1 gets a hood shutline at the cowl and a
// deck shutline at the backlight; this car's boot lid opens at the backlight
// and its bonnet at the cowl, so the stations differ and the marks land where
// the panels actually split.
for (const id of longEdges) s.apply("crease", { curveId: id });
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
const bareMesh = meshQuilt(quilt, { baseDensity: 20 });
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
line("triangles", `${(mesh.indices.length / 3).toLocaleString("en-GB")}`);
console.log("\nwrote cars/mx5-na.car.json and mx5-na.stl\n");
