/**
 * Build PANORAMIC P1 — a front-mid inline-six, rear-drive, two-door coupe,
 * authored with the ratified verbs against a real packaging solve.
 *
 * Body datum for authoring: X = 0 at the NOSE (the solve's X = 0 is the front
 * axle, so hard points shift by the front overhang), Y across from the
 * centerline, Z up from the ground plane.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { makeAllocator, type Id, type Pt3 } from "@car/schema";
import { assembleCar } from "@car/types";
import { solve } from "@car/pack";
import {
  p1Config,
  P1_FRONT_DIAMETER,
  P1_FRONT_OVERHANG,
  P1_FRONT_TIRE_WIDTH,
  P1_FRONT_TRACK,
  P1_REAR_DIAMETER,
  P1_REAR_TIRE_WIDTH,
  P1_REAR_TRACK,
  P1_WHEELBASE,
} from "@car/fixtures";
import { createSession, load } from "@car/history";
import { computeQuilt } from "@car/frame";
import {
  continuityProbe, curvatureJoinProbe, fieldDisplacement, networkObstruction, tangentField,
} from "@car/surface";
import {
  closedMeshCheck,
  creaseNormals,
  DEFAULT_CREASE_ANGLE,
  engraveGrooves,
  meshQuilt,
  writeStlBinary,
} from "@car/mesh";
import { massLedger, provenanceReport } from "@car/lens";
import { evalChain } from "@car/num";

// ---------------------------------------------------------------------------
// 1. The packaging solve — the body is authored against these, not invented
// ---------------------------------------------------------------------------
const alloc = makeAllocator();
const car = assembleCar(p1Config, alloc);
const packed = solve(car.input);

const NOSE = P1_FRONT_OVERHANG;                 // body X = solve X + NOSE
const FRONT_AXLE_X = NOSE;                      // 900
const REAR_AXLE_X = NOSE + P1_WHEELBASE;        // 3440
const FRONT_R = P1_FRONT_DIAMETER / 2;
const REAR_R = P1_REAR_DIAMETER / 2;

const hp = new Map<string, Pt3>();
for (const s of packed.hardPoints) {
  if (!hp.has(s.label ?? "")) hp.set(s.label ?? "", [s.at[0] + NOSE, s.at[1], s.at[2]]);
}

// ---------------------------------------------------------------------------
// 2. Author the body — tape blocks, then sculpt through the welds
// ---------------------------------------------------------------------------
const s = createSession("Panoramic P1");
const side = { kind: "side" as const };

/** tape a box in side view: (x0,z0)-(x1,z1), spanning y ±halfWidth. */
const block = (x0: number, z0: number, x1: number, z1: number, halfWidth: number): void => {
  s.apply("tape", { kind: "box", rect: { view: side, a: [x0, z0], b: [x1, z1], depth: halfWidth * 2, at: -halfWidth } });
};
const curveCount = (): number => s.state.curves.size;
const cellsOfBlockAt = (start: number): Id[] =>
  [...s.state.cells.keys()].filter((id) => {
    const n = Number(id.split("#")[1]);
    return n >= start && n < start + 6;
  }) as Id[];

/** tape a box in side view spanning an explicit Y band (one side only). */
const blockY = (x0: number, z0: number, x1: number, z1: number, y0: number, y1: number): void => {
  s.apply("tape", { kind: "box", rect: { view: side, a: [x0, z0], b: [x1, z1], depth: y1 - y0, at: y0 } });
};

// --- ONE body, built from master lines and sections ------------------------
// A car body is not a box with its edges shoved around. It is two master
// lines running the length of the car — the ROCKER at the sill and the
// SHOULDER at the beltline — and a family of SECTIONS hung between them.
// That is exactly what a taped box already is, once you read it right: its
// four long edges ARE the two rockers and the two shoulders, its top face is
// the deck between the shoulders, its flanks run rocker to shoulder, and its
// bottom face is the underbody. Nothing else needed inventing.
//
// The earlier body ignored that. It left the long edges near the centreline
// and pushed each station's flank curve 480 mm outboard of its own two
// endpoints, so every "section" was a bulge hung off a line that was nowhere
// near the car's side. It read as a car in silhouette and was incoherent as a
// surface. Here the master lines carry plan width and beltline height, and
// each station only has to say what its section does between them.
//
// Why the master lines are single cubics and that is not a compromise: a tape
// split subdivides a curve's TRIMS, not the curve, so a long edge stays one
// curve for the life of the body (see DESIGN-NOTES). A rocker and a beltline
// ARE single sweeping curves on a real car. The constraint and the craft agree.
const LEN = 4400, HW = 940, FLOOR = 130, TOP = 1270;
block(0, FLOOR, LEN, TOP, HW);

const yEdge = (base: number, k: 0 | 1 | 2 | 3): Id => `curve#${base + 4 + k}` as Id;
const pushCurve = (id: Id, d: Pt3): void => { s.apply("push-pull", { target: { kind: "curve", id }, delta: d }); };
const pinch = (id: Id, d: Pt3): void => {
  for (const idx of [1, 2] as const) s.apply("push-pull", { target: { kind: "ctrl", id, seg: 0, idx }, delta: d });
};

/** Mean point of a curve — how the script reads the model back before moving it. */
const curveMean = (id: Id): Pt3 => {
  const c = s.state.curves.get(s.state.resolveCurve(id));
  if (!c) throw new Error(`no curve ${id}`);
  let x = 0, y = 0, z = 0;
  const ts = [0, 0.25, 0.5, 0.75, 1];
  for (const t of ts) { const p = evalChain(c.chain, t); x += p[0]; y += p[1]; z += p[2]; }
  return [x / ts.length, y / ts.length, z / ts.length];
};

// --- reading and moving control points -------------------------------------
// Every shaping move below is "read the model, compute the delta, apply the
// verb". Nothing is written from a remembered number: the document is the only
// place the geometry lives, and it has already caught three authoring bugs
// that a cached copy would have hidden.
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
/** Make a curve the straight line between its own endpoints. */
const straighten = (id: Id): void => {
  const [p0, , , p3] = ctrlsOf(id);
  setCtrl(id, 1, lerp3p(p0, p3, 1 / 3));
  setCtrl(id, 2, lerp3p(p0, p3, 2 / 3));
};
/**
 * Fit a cubic so it passes through f(0), f(1/3), f(2/3), f(1). Standard
 * four-point interpolation: B(1/3) and B(2/3) are linear in p1,p2, so the
 * 2x2 solve is exact and the curve is a genuine interpolant, not a fairing.
 */
const fitThrough = (id: Id, f: (t: number) => Pt3): void => {
  const A = f(0), B = f(1 / 3), C = f(2 / 3), D = f(1);
  const p1: Pt3 = [0, 0, 0].map((_, k) =>
    3 * B[k]! - 1.5 * C[k]! - (5 / 6) * A[k]! + (1 / 3) * D[k]!) as unknown as Pt3;
  const p2: Pt3 = [0, 0, 0].map((_, k) =>
    3 * C[k]! - 1.5 * B[k]! - (5 / 6) * D[k]! + (1 / 3) * A[k]!) as unknown as Pt3;
  // Ends first: moving a chain end is a weld event that drags every curve
  // meeting there, and the interior points must be set against the result.
  setCtrl(id, 0, A);
  setCtrl(id, 3, D);
  setCtrl(id, 1, p1);
  setCtrl(id, 2, p2);
};

// --- the master lines ------------------------------------------------------
// Tables are read at t = 0, 1/3, 2/3, 1 — the four points the cubic is fitted
// through — so x(t) comes out exactly linear and station x maps to curve
// parameter x/LEN. Every section below relies on that.
const track = (a: number, b: number, c: number, d: number) =>
  (t: number): number => [a, b, c, d][Math.round(t * 3)]!;

// Beltline: narrow and low over the nose, widest through the doors, drawn in
// and up over the rear haunch, tapering to the tail panel.
const shoulderY = track(345, 880, 900, 560);
// Height matters as much as width. At 380/775/880/800 the beltline came out
// 700 mm over the front axle — 22 mm above a 679 mm tire — so the fender had
// nowhere to arch and the tire stood through it. A front fender crowns about
// 100 mm over the tire on a car this low; these numbers put it at 784.
const shoulderZ = track(395, 900, 950, 870);
// Sill: inboard of the tires everywhere, so a wheel always stands in daylight
// below the fender rather than being skirted over. Lifts at both ends for
// approach and departure.
const rockerY = track(320, 800, 815, 520);
const rockerZ = track(235, 138, 138, 250);

const longEdges = [...s.state.curves.keys()].filter((id) => {
  const c = s.state.curves.get(id as Id)!;
  const a0 = evalChain(c.chain, 0), a1 = evalChain(c.chain, 1);
  return Math.abs(a1[0] - a0[0]) > LEN * 0.9;
}) as Id[];
if (longEdges.length !== 4) throw new Error(`expected 4 long edges, got ${longEdges.length}`);
const masters: { id: Id; sign: 1 | -1; low: boolean }[] = longEdges.map((id) => {
  const m = curveMean(id);
  return { id, sign: (m[1] >= 0 ? 1 : -1) as 1 | -1, low: m[2] < (FLOOR + TOP) / 2 };
});
for (const { id, sign, low } of masters) {
  const yOf = low ? rockerY : shoulderY;
  const zOf = low ? rockerZ : shoulderZ;
  // Fit nose-to-tail whichever way the edge happens to run: a box's four long
  // edges are not all wound the same way, and assuming they are is how a body
  // goes quietly asymmetric.
  const a0 = evalChain(s.state.curves.get(s.state.resolveCurve(id))!.chain, 0);
  const forward = a0[0] < LEN / 2;
  fitThrough(id, (t) => {
    const u = forward ? t : 1 - t;
    return [u * LEN, sign * yOf(u), zOf(u)];
  });
}
// The nose and tail end faces, and the four corner posts, had their endpoints
// dragged by that fit; make each the straight line it should be.
for (const id of [...s.state.curves.keys()] as Id[]) {
  if (longEdges.includes(id)) continue;
  straighten(id);
}

// --- sections --------------------------------------------------------------
// Each station says what its section does BETWEEN the master lines, and
// nothing about where the sides of the car are. roof and floor are centreline
// heights; roofY is where the roof's shoulders sit (small = tumblehome, a
// cabin; large = a flat wide deck, a hood); flare is how far the flank stands
// outboard of the rocker-to-shoulder chord at its widest — that, over an
// axle, IS the fender.
const STATIONS: {
  x: number; roof: number; roofY: number; floor: number; hip: number; hipAt: number; name: string;
}[] = [
  { x: 300,  roof: 545,  roofY: 300, floor: 235, hip: 470, hipAt: 0.45, name: "nose" },
  { x: 620,  roof: 760,  roofY: 480, floor: 155, hip: 978, hipAt: 0.70, name: "front-fascia" },
  { x: 900,  roof: 860,  roofY: 560, floor: 142, hip: 996, hipAt: 0.74, name: "front-axle" },
  { x: 1295, roof: 890,  roofY: 620, floor: 138, hip: 980, hipAt: 0.68, name: "hood-mid" },
  { x: 1880, roof: 950,  roofY: 690, floor: 136, hip: 928, hipAt: 0.5,  name: "cowl" },
  { x: 2200, roof: 1130, roofY: 680, floor: 135, hip: 922, hipAt: 0.45, name: "screen" },
  { x: 2520, roof: 1290, roofY: 650, floor: 135, hip: 918, hipAt: 0.45, name: "header" },
  { x: 2900, roof: 1280, roofY: 660, floor: 136, hip: 932, hipAt: 0.5,  name: "roof-rear" },
  { x: 3045, roof: 1225, roofY: 660, floor: 138, hip: 978, hipAt: 0.62, name: "backlight" },
  { x: 3440, roof: 1105, roofY: 700, floor: 148, hip: 998, hipAt: 0.7,  name: "rear-axle" },
  { x: 3835, roof: 975,  roofY: 660, floor: 185, hip: 978, hipAt: 0.62, name: "deck" },
  { x: 4150, roof: 915,  roofY: 560, floor: 240, hip: 800, hipAt: 0.5,  name: "tail" },
];
// hip is an ABSOLUTE half-width — the widest the section gets, about a third
// of the way up the flank — and absolute for a reason. A master line is one
// cubic, so it carries the body's overall plan and cannot also bulge locally
// over a wheel; the fender is entirely the flank's job. Written as a bulge
// OVER the master line it could not be checked against anything, and the
// tires came through the bodywork twice. Written as a half-width it reads
// against the numbers that matter: the tire faces sit at 896 front and 929
// rear, so every station over a wheel is at least 925, and the widest point
// of the car is 970 at the rear axle. A fender has to cover the whole wheel —
// 560 to 1239 at the front — not just the axle station.

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

// One cut per station, all the way round the ring. A cut that stops at one
// face leaves its neighbours holding a T-junction they were never told about
// — that is what opened the first round wheel in 60 places.
const sections: { deck: Id; under: Id; flanks: Id[] }[] = [];
for (const st of STATIONS) {
  const before = new Set(s.state.curves.keys());
  s.apply("tape", {
    kind: "line",
    line: { view: side, a: [st.x, FLOOR - 260], b: [st.x, TOP + 240], lineClass: "tape" },
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

// Shape each section. The endpoints are already exactly on the master lines —
// the cut put them there — so only the two interior control points of each
// curve have to say anything, and the section can never come adrift from the
// side of the car.
const bulge = (base: Pt3, sign: number, out: number): Pt3 => [base[0], base[1] + sign * out, base[2]];
for (let i = 0; i < STATIONS.length; i++) {
  const st = STATIONS[i]!;
  const sec = sections[i]!;

  // Deck: shoulder -> roof -> shoulder. A cubic with both interior points at
  // height h reads 0.75h + 0.25*shoulder on the centreline, so the control
  // height is solved backwards from the roof height the table asks for.
  for (const [id, wantZ, wantY] of [[sec.deck, st.roof, st.roofY], [sec.under, st.floor, 0]] as const) {
    const [p0, , , p3] = ctrlsOf(id);
    const endZ = (p0[2] + p3[2]) / 2;
    const ctrlZ = (wantZ - 0.25 * endZ) / 0.75;
    // The underbody takes its width from the sill it hangs between. Averaging
    // the two ends SIGNED gives zero — they are opposite sides of the car —
    // which pinched the floor to a knife edge down the centreline.
    const yAt = wantY > 0 ? wantY : ((Math.abs(p0[1]) + Math.abs(p3[1])) / 2) * 0.74;
    setCtrl(id, 1, [st.x, Math.sign(p0[1]) * yAt, ctrlZ]);
    setCtrl(id, 2, [st.x, Math.sign(p3[1]) * yAt, ctrlZ]);
  }

  // Flank: rocker -> shoulder, standing out at a third of its height. That is
  // the fender over an axle and the tumblehome everywhere else; the flank is
  // always tucked back inside the tire at the sill, so the wheel shows.
  for (const id of sec.flanks) {
    const [p0, , , p3] = ctrlsOf(id);
    const sign = Math.sign((p0[1] + p3[1]) / 2) || 1;
    // hipAt says HOW FAR UP the flank its widest point sits, and it is not a
    // nicety: a fender's widest point is at the arch, level with the crown of
    // the tire. With the fullness fixed low on the flank the section had
    // already narrowed by the time it got up to the tire, and the tire stood
    // through it however wide the table said the car was. Weighting the two
    // interior offsets against each other slides the peak up and down; their
    // sum stays 2, so the peak stays 0.75d off the chord wherever it sits and
    // d can still be solved backwards from the half-width asked for.
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



// --- the lines a body is read by -------------------------------------------
// Beltline and sill are creased: they are the two edges an eye follows down
// the side of a car, and marking them in the document is what lets the
// instrument draw them and a later panel split find them.
for (const { id } of masters) s.apply("crease", { curveId: id });
// Hood shutline at the cowl, deck shutline at the backlight. These are BOTH:
// a panel gap and a character line, which amendment A2 anticipates in as many
// words — a shutline is interior to its parent flow solve unless it happens to
// sit on a crease, and these do. So they carry both marks.
for (const k of [4, 8]) {
  const sec = sections[k];
  if (!sec) continue;
  s.apply("crease", { curveId: sec.deck });
  s.apply("gap", { curveId: sec.deck });
}

// --- the living cell of a face at a station --------------------------------
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
/** Lowest (or highest) matching face at a station — robust to how many splits
 *  a flank has already taken, which is why it reads the model instead of
 *  guessing cell numbers. */
const faceAt = (x: number, pick: (yMean: number, zMean: number) => boolean, want: "low" | "high" = "low"): Id => {
  const found = facesAt(x, pick);
  if (found.length === 0) throw new Error(`no face at x=${x}`);
  found.sort((a, b) => a.z - b.z);
  return (want === "low" ? found[0]! : found[found.length - 1]!).id;
};
const isFlank = (sign: 1 | -1) => (y: number, _z: number): boolean =>
  Math.sign(y) === sign && Math.abs(y) > 380;

// --- wheel arches: openings, not booleans ----------------------------------
// Clause 25: an opening is authored, not cut. Splitting the flank at the arch
// mouth and pushing that segment's lower edge up IS the arch — and the body
// stays one closed solid, which is what a printable car has to be.
// --- wheel openings: what this frame can and cannot author -----------------
// This is where an arch mouth used to be lifted, and it is worth recording
// that it never fired once. A tape split subdivides a curve's TRIMS, not the
// curve, so the flank's bottom edge stays one curve running the whole length
// of the car however many times it is cut. The search asked for a curve
// spanning only the arch and found nothing, silently, on every run — the
// openings in every render before this one were imaginary.
//
// Instrumented, removed, and replaced with the feature the frame does carry:
// cross-car station curves. The fenders above are that feature. A real
// opening needs a verb that splits a curve into children, which the ratified
// set does not have; that is a spec question for G3, not a workaround here.
// (Clause 25 says an opening is authored, not cut. It still is — this frame
// just cannot author THIS opening yet, and saying so is the point.)

// --- door cut + shoulder crease --------------------------------------------
for (const sign of [1, -1] as const) {
  const doorCell = faceAt(2600, isFlank(sign), "high");
  const before = s.state.curves.size;
  s.apply("tape", {
    kind: "line",
    line: { view: side, a: [2600, 600], b: [2600, 1200], lineClass: "tape" },
    targets: [doorCell],
  });
  // The door cut is the one thing on this car that is unambiguously a place a
  // door opens. Creased because it is also a hard edge; gapped because it is a
  // gap, and only the gap mark reaches the groove pass.
  for (const id of [...s.state.curves.keys()].slice(before)) {
    s.apply("crease", { curveId: id as Id });
    s.apply("gap", { curveId: id as Id });
  }
}

// --- wheels: four of them, and they are part of the document ---------------
// Third construction, and the first that is actually round. A box with its
// corners pulled in is an octagon. Sectioning the box and projecting the
// cross-car curves onto the circle looked round from some angles and threw
// shards from others, for the reason that governs this whole frame: a wheel's
// SILHOUETTE lives on the four long edges of its flanks, tape splits
// subdivide trims and not curves, so those edges stayed a rectangle no matter
// how finely the faces were cut, and the projected curves stood proud of it.
//
// The answer is to shape the silhouette edges themselves. Each is a quarter
// of the wheel circle, and a cubic fits a 90-degree arc to about three parts
// in ten thousand — 0.1 mm at this radius, an order under the print
// tolerance. Eight arcs, no cuts at all. The tread bands then come out as
// exact cylindrical strips, because a Coons patch spanned between two
// identical arcs IS the band between them.
// Left side only: the mirror law renders the right.
const wheel = (cx: number, radius: number, halfWidth: number, yIn: number): void => {
  const before = new Set(s.state.curves.keys());
  s.apply("tape", {
    kind: "box",
    rect: { view: side, a: [cx - radius, 0], b: [cx + radius, radius * 2], depth: halfWidth * 2, at: yIn },
  });
  // Ids come from the model, never from a count: splits allocate too, so map
  // size stopped tracking the allocator the moment the body was sectioned.
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
    // Shortest way round: the two ends are a quarter turn apart, and taking
    // the long way would fit a three-quarter arc through the middle of the
    // wheel. Normalising into (-PI, PI] is what picks the right quadrant.
    let sweep = angleAt(p1) - a0;
    while (sweep > Math.PI) sweep -= 2 * Math.PI;
    while (sweep <= -Math.PI) sweep += 2 * Math.PI;
    const y = p0[1];
    fitThrough(id, (t) => {
      const a = a0 + sweep * t;
      return [cx + radius * Math.cos(a), y, radius + radius * Math.sin(a)];
    });
  }
  // The four cross-car curves were dragged at both ends by those fits; each
  // is a straight line across the wheel and should say so.
  for (const id of made) if (acrossCar(id)) straighten(id);
};
// Track and tire width come from the solve and the chassis fixture, not from
// the eye. The first pass typed 660 and 118 in by hand: 32 mm inboard of
// where the solve had actually placed the wheel and 9 mm narrow. A body
// authored against invented hardpoints is a drawing, not a car.
const FRONT_HALF = P1_FRONT_TIRE_WIDTH / 2;
const REAR_HALF = P1_REAR_TIRE_WIDTH / 2;
const FRONT_CENTRE = P1_FRONT_TRACK / 2;
const REAR_CENTRE = P1_REAR_TRACK / 2;
if (process.env['NOWHEELS'] !== '1') {
  wheel(FRONT_AXLE_X, FRONT_R, FRONT_HALF, FRONT_CENTRE - FRONT_HALF);
  wheel(REAR_AXLE_X, REAR_R, REAR_HALF, REAR_CENTRE - REAR_HALF);
}

// --- panels and material ---------------------------------------------------
const topCellIds = [...s.state.cells.keys()].filter((id) => {
  const c = s.state.cells.get(id)!;
  let zSum = 0, ySum = 0, n = 0;
  for (const sd of c.sides) {
    const cu = s.state.curves.get(s.state.resolveCurve(sd.curveId));
    if (!cu) continue;
    const p = evalChain(cu.chain, 0.5); zSum += p[2]; ySum += Math.abs(p[1]); n++;
  }
  return n > 0 && zSum / n > 700 && ySum / n < 700;
}) as Id[];
if (topCellIds.length >= 2) s.apply("group", { cellIds: topCellIds, name: "upper-body" });
s.apply("assign-material", { targetId: "cell#0" as Id, name: "body-in-white", color: "#c8c8c2" });

// ---------------------------------------------------------------------------
// 3. Evaluate: quilt -> conforming mesh -> closed check -> STL
// ---------------------------------------------------------------------------
const quilt = computeQuilt(s.state);
// Tangent-plane AND cross-curvature continuity. The field is a property of the shared CURVES,
// derived from the quilt and nothing else, so it changes no verb, no document
// and no hash — it changes what the patches between those curves do. Handed
// to the mesher AND to the render AND to the probe, from one call, because
// three different fields would mean three different cars.
const cross = tangentField(quilt, { order: 2 });
const raw = meshQuilt(quilt, { baseDensity: 20, cross });
// The geometry stays as authored. Fairing it (the G3 flow solve, still in the
// tree and still tested) melted the arch mouths, splitter and roof breaks —
// the car did not need smoother SHAPE, it needed smoother SHADING. That is
// creaseNormals, a render-path derivation, and it moves no vertex at all.
const shaded = creaseNormals(raw, DEFAULT_CREASE_ANGLE);
// 1:24 on a 0.4 mm nozzle — the scale the P1 is printed at.
const PRINT_SCALE = 24;
const NOZZLE_MM = 0.4;
// Dense enough that consecutive samples sit closer than the groove is wide,
// or the groove comes out scalloped and that is a sampling artefact.
const GROOVE_SAMPLES = 400;
// Grooves engrave the GAP set — the shutlines — and not the crease set.
//
// They used to engrave creases, because amendment A10 did not exist and the
// ratified verb list had `crease` and no `gap`, so no curve in any document
// could be a gap and the pass had nothing else to read. That was visible in
// the hand: a 0.80 mm groove down the beltline and the sill, which are
// character lines, not places a door opens. Clause 24 and amendment A2 were
// always clear that the two are different marks, and `FrameState.markGap` was
// always there; what was missing was a way to call it.
//
// The scale is the print's, not the car's: a 4 mm door gap at 1:24 is 0.17 mm
// and simply does not exist coming off a 0.4 mm nozzle, so the groove is sized
// from the printer and back-scaled. Topology is untouched, so the closed check
// below is still checking the thing that gets printed.
const shutlines: Pt3[] = [];
for (const id of quilt.gaps) {
  const chain = quilt.curves.get(id);
  if (!chain) continue;
  for (let i = 0; i <= GROOVE_SAMPLES; i++) shutlines.push(evalChain(chain, i / GROOVE_SAMPLES));
}
const grooved = engraveGrooves(raw, shutlines, {
  scaleDenominator: PRINT_SCALE,
  minPrintedFeatureMm: NOZZLE_MM,
});

// Seat the car on the road: the ground plane is a datum — the car meets it.
const seated = Float64Array.from(grooved.positions);
let minZ = Infinity;
for (let i = 2; i < seated.length; i += 3) minZ = Math.min(minZ, seated[i]!);
for (let i = 2; i < seated.length; i += 3) seated[i] = seated[i]! - minZ;
const mesh = { positions: seated, indices: raw.indices, ranges: raw.ranges };
const report = closedMeshCheck(mesh);
// MESHDEBUG=1 turns "100 violations" into "here is where". An open mesh is
// a count and nothing else by default, and a count cannot be debugged; this
// says which kinds, how many vertices, and — the one that actually locates it
// — the histogram of open vertices by station. It found the windshield deck
// cells in a single run, and it stays because the next opening will be
// somewhere else.
if (process.env['MESHDEBUG'] === '1') {
  const kinds = new Map<string, number>();
  for (const v of report.violations) kinds.set(v.kind, (kinds.get(v.kind) ?? 0) + 1);
  console.error("violation kinds:", [...kinds]);
  const at = (i: number) => [0, 1, 2].map((k) => Math.round(mesh.positions[i * 3 + k]!)).join("/");
  const seen = new Set<number>();
  for (const v of report.violations) {
    const m = /edge (\d+)-(\d+)/.exec(v.detail);
    if (!m) continue;
    for (const g of [m[1]!, m[2]!]) seen.add(Number(g));
  }
  const pts = [...seen].sort((a, b) => a - b);
  console.error("open vertices:", pts.length);
  const xs = new Map<number, number>();
  for (const i of pts) { const x = Math.round(mesh.positions[i * 3]! / 10) * 10; xs.set(x, (xs.get(x) ?? 0) + 1); }
  console.error("open x histogram:", [...xs].sort((a, b) => a[0] - b[0]));
}

// lowest sprung surface, for the ground-clearance body check
let lowestZ = Infinity;
for (let i = 2; i < mesh.positions.length; i += 3) lowestZ = Math.min(lowestZ, mesh.positions[i]!);

// ---------------------------------------------------------------------------
// 4. Mass ledger
// ---------------------------------------------------------------------------
const wheelLabels = [...car.frontWheels, ...car.rearWheels];
const ledger = massLedger({
  parts: car.input.parts,
  placements: packed.placements,
  wheels: wheelLabels.map((w, i) => {
    const pose = packed.placements.get(w.id);
    return {
      label: `${i < 2 ? "front" : "rear"}-${i % 2 === 0 ? "L" : "R"}`,
      at: (pose ? pose.origin : [0, 0, 0]) as Pt3,
      loadCapacityKg: (w as { loadCapacity?: never }).loadCapacity ?? w.mass!,
    };
  }),
  massTarget: p1Config.brief.massTargetKg,
});

// ---------------------------------------------------------------------------
// 5. Emit
// ---------------------------------------------------------------------------
const doc = s.save();
mkdirSync(new URL("../cars", import.meta.url), { recursive: true });
writeFileSync(new URL("../cars/panoramic-p1.car.json", import.meta.url), JSON.stringify(doc));
// The instrument ships the car inside its bundle, so the same document is
// written there in the same breath. Copying it by hand let it drift 61 verbs
// behind, and the tool then opened a car nobody had built.
mkdirSync(new URL("../apps/instrument/src/cars", import.meta.url), { recursive: true });
writeFileSync(new URL("../apps/instrument/src/cars/panoramic-p1.json", import.meta.url), JSON.stringify(doc));
const stl = writeStlBinary(mesh, "panoramic-p1");
writeFileSync(new URL("../../panoramic-p1.stl", import.meta.url), stl);

// Every print emits the provenance report (charge §10). Beside the STL, not
// in a menu: a printed object stops looking like a model and starts looking
// like a fact, and this is the page that says which parts of it are.
const prov = provenanceReport({
  carName: "Panoramic P1",
  config: p1Config,
  clamps: packed.clamps,
  bodyChecks: car.bodyChecks,
  ledgerLines: [
    `total                ${ledger.total.value.toFixed(1)} kg (target ${p1Config.brief.massTargetKg.value} kg)`,
    `gap to target        ${ledger.targetGap.value.toFixed(1)} kg`,
    `CG                   ${ledger.cg.map((v) => v.toFixed(0)).join(", ")} mm`,
    `axle loads F/R       ${ledger.axleLoads.front.value.toFixed(0)} / ${ledger.axleLoads.rear.value.toFixed(0)} kg`,
    `ASSUMED outstanding  ${ledger.assumedOutstanding.length}`,
  ],
  modelFacts: [
    ["verbs in history", String(doc.verbs.length)],
    ["cells / curves", `${s.state.cells.size} / ${s.state.curves.size}`],
    ["quilt cells with mirror", String(quilt.cells.length)],
    ["triangles printed", String(mesh.indices.length / 3)],
    ["closed mesh", `${report.closed} (${report.violations.length} violations)`],
    ["STL bytes", String(stl.byteLength)],
    ["print scale", `1:${PRINT_SCALE} on a ${NOZZLE_MM} mm nozzle`],
    ["shutline grooves", `${grooved.moved} vertices sunk, ${grooved.printedWidthMm.toFixed(2)} mm wide printed`],
    ["packaging solve closed", String(packed.closed)],
    ["packaging violations", String(packed.violations.length)],
  ],
});
writeFileSync(new URL("../../panoramic-p1-provenance.txt", import.meta.url), prov.text);

// replay integrity: the car is a first-class replayable document
const reloaded = load(doc);
const same = JSON.stringify(reloaded.save()) === JSON.stringify(doc);

const line = (k: string, v: string): string => `${k.padEnd(26)} ${v}`;
console.log("\n=== PANORAMIC P1 ===");
console.log(line("verbs in history", String(doc.verbs.length)));
console.log(line("cells / curves", `${s.state.cells.size} / ${s.state.curves.size}`));
console.log(line("quilt cells (with mirror)", String(quilt.cells.length)));
console.log(line("triangles", String(mesh.indices.length / 3)));
// Cross-boundary continuity, measured rather than eyeballed. The zebra cannot
// tell an authored crease from a defect; this asks the surfaces directly.
const before = continuityProbe(quilt);
const cont = continuityProbe(quilt, { cross });
console.log(line("G1 continuity", `${cont.g1Joins}/${cont.joins} joins under 1° · ` +
  `median ${cont.medianDeg.toFixed(2)}° · worst ${cont.worstDeg.toFixed(2)}°`));
console.log(line("  was, unfielded", `${before.g1Joins}/${before.joins} · ` +
  `median ${before.medianDeg.toFixed(2)}° · worst ${before.worstDeg.toFixed(2)}°`));
console.log(line("  joins excluded", `${cont.creased} creased (authored) + ${cont.sharp} sharper than ${cont.breakAngleDeg}° (unmarked)`));
// G2. Under G1 the only free coefficient of the second fundamental form on a
// join is the curvature ACROSS it; this is that one number, matched.
const g2 = curvatureJoinProbe(quilt, { cross });
const g2before = curvatureJoinProbe(quilt);
console.log(line("G2 curvature", `${g2.g2Joins}/${g2.joins} joins within 1% · ` +
  `median gap ${g2.medianGap.toExponential(1)} /mm · worst ${g2.worstGap.toExponential(1)} /mm`));
console.log(line("  was, unfielded", `${g2before.g2Joins}/${g2before.joins} · ` +
  `median gap ${g2before.medianGap.toExponential(1)} /mm · worst ${g2before.worstGap.toExponential(1)} /mm`));
// How far the surfacing moved the body. Every number above is about agreement
// at a seam; none of them says where the surface went, and a correction can
// drive every join to machine zero while moving a panel by a hand's width.
const g1field = tangentField(quilt, { order: 1 });
const phiMoved = fieldDisplacement(quilt, { cross: g1field });
const psiMoved = fieldDisplacement(quilt, { cross, against: g1field });
console.log(line("surfacing moves body", `tangent plane ${phiMoved.median.toFixed(1)} mm median · ` +
  `${phiMoved.p90.toFixed(1)} p90 · ${phiMoved.worst.toFixed(0)} worst (${phiMoved.worstCell}) — ` +
  `curvature a further ${psiMoved.median.toFixed(2)} · ${psiMoved.p90.toFixed(1)} · ${psiMoved.worst.toFixed(0)}`));
console.log(line("  field form", `cubic spline, ${cross.stats.edges} edges, ` +
  `up to ${cross.stats.worstSpans} pieces each · worst residual ` +
  `${cross.stats.fitWorstAbs.toExponential(1)} mm of cross-derivative · ` +
  `${cross.stats.unconverged} short of tolerance`));
// The overall dimensions, bare and corrected. A Coons patch is pinned at its
// boundary and free in its interior, so a tangent-plane correction has nowhere
// to go BUT the interior — and where the network breaks hard at a cell's
// corners, the middle of that cell balloons. On the P1 that is the tail panel,
// whose four corners break by 72–74°, and it costs the car 75 mm of length.
// Nothing measured this until the displacement report existed.
const bareMesh = meshQuilt(quilt, { baseDensity: 20, cross: null });
const boxOf = (positions: Float64Array): [Pt3, Pt3] => {
  const lo: Pt3 = [Infinity, Infinity, Infinity];
  const hi: Pt3 = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < positions.length; i += 3) {
    for (let c = 0; c < 3; c++) {
      const v = positions[i + c]!;
      if (v < lo[c]!) lo[c] = v;
      if (v > hi[c]!) hi[c] = v;
    }
  }
  return [lo, hi];
};
const [bLo, bHi] = boxOf(bareMesh.positions);
const [fLo, fHi] = boxOf(raw.positions);
const dim = (i: number): string => `${(fHi[i]! - fLo[i]!).toFixed(0)}`;
const grew = (i: number): number => (fHi[i]! - fLo[i]!) - (bHi[i]! - bLo[i]!);
console.log(line("overall L·W·H", `${dim(0)} × ${dim(1)} × ${dim(2)} mm — the surfacing added ` +
  `${grew(0) >= 0 ? "+" : ""}${grew(0).toFixed(0)} × ${grew(1) >= 0 ? "+" : ""}${grew(1).toFixed(0)} × ` +
  `${grew(2) >= 0 ? "+" : ""}${grew(2).toFixed(0)} to the bare blend's ` +
  `${(bHi[0]! - bLo[0]!).toFixed(0)} × ${(bHi[1]! - bLo[1]!).toFixed(0)} × ${(bHi[2]! - bLo[2]!).toFixed(0)}`));
// What the surfacing pass is NOT allowed to fix. A patch has no freedom at a
// corner — its tangent plane there is spanned by the two curves meeting at the
// vertex — so a corner where the network breaks tangency pins a defect no
// surface can remove. This says how much of the body that is.
const net = networkObstruction(quilt);
console.log(line("curve network", `${net.cleanCorners}/${net.corners} corners coplanar to ${net.toleranceDeg}° · ` +
  `median ${net.medianDeg.toFixed(3)}° · worst ${net.worstDeg.toFixed(1)}°` +
  (net.worst ? ` at [${net.worst.at.map((v) => Math.round(v)).join(", ")}]` : "")));
console.log(line("shutline grooves", `${grooved.moved} vertices sunk on ${quilt.gaps.size} gap curves ` +
  `(${quilt.creases.size} creased curves are character lines and are NOT engraved) — ${grooved.note}`));
console.log(line("closed mesh", `${report.closed} (${report.violations.length} violations)`));
console.log(line("shading", `${DEFAULT_CREASE_ANGLE}° smoothing groups · ${shaded.split} vertices split on hard edges`));
console.log(line("replay round-trip", String(same)));
// Fender coverage: how far each tire stands proud of the body beside it.
// Guessing this from the table is what let the tires through the bodywork
// twice; the flank curve is right there in the document and can be asked.
const proud = (axleX: number, tireOuterY: number, tireR: number): number => {
  let i = 0;
  for (let k = 1; k < STATIONS.length; k++) {
    if (Math.abs(STATIONS[k]!.x - axleX) < Math.abs(STATIONS[i]!.x - axleX)) i = k;
  }
  const flank = sections[i]!.flanks[0]!;
  const c = s.state.curves.get(s.state.resolveCurve(flank))!;
  // The number that decides whether a wheel looks right is the one at the
  // tire's CROWN. Below that a proud tire is the arch doing its job — the
  // wheel showing in daylight — and measuring the worst point over the whole
  // flank just reports the sill tuck as if it were a fault.
  let best = Infinity, cover = 0;
  for (let k = 0; k <= 64; k++) {
    const q = evalChain(c.chain, k / 64);
    const d = Math.abs(q[2] - tireR * 2);
    if (d < best) { best = d; cover = tireOuterY - Math.abs(q[1]); }
  }
  return cover;
};
if (process.env['TRACK'] === '1') {
  for (const w of [...car.frontWheels, ...car.rearWheels]) {
    const pose = packed.placements.get(w.id);
    console.error("wheel", w.id, pose ? pose.origin.join("/") : "unplaced");
  }
}
console.log(line("tire crown vs fender",
  `front ${proud(FRONT_AXLE_X, FRONT_CENTRE + FRONT_HALF, FRONT_R).toFixed(0)} mm · rear ${proud(REAR_AXLE_X, REAR_CENTRE + REAR_HALF, REAR_R).toFixed(0)} mm  (negative = covered)`));
console.log(line("lowest body point", `${lowestZ.toFixed(0)} mm (brief asks ${p1Config.brief.groundClearanceMm.value} mm)`));
console.log("\n--- package ---");
console.log(line("solve closed", String(packed.closed)));
console.log(line("placed parts", String(packed.placements.size)));
console.log(line("hard points", String(packed.hardPoints.length)));
console.log(line("clamps", String(packed.clamps.length)));
console.log(line("violations", String(packed.violations.length)));
console.log("\n--- mass ledger ---");
console.log(line("total", `${ledger.total.value.toFixed(1)} kg (target ${p1Config.brief.massTargetKg.value} kg)`));
console.log(line("gap to target", `${ledger.targetGap.value.toFixed(1)} kg`));
console.log(line("CG", ledger.cg.map((v) => v.toFixed(0)).join(", ")));
console.log(line("axle loads F/R", `${ledger.axleLoads.front.value.toFixed(0)} / ${ledger.axleLoads.rear.value.toFixed(0)} kg`));
console.log(line("ASSUMED outstanding", String(ledger.assumedOutstanding.length)));
console.log(`\nprovenance             ${prov.assumedCount} assumed · ${prov.sourcedCount} sourced · ${prov.derivedCount} derived`);
console.log("\nwrote cars/panoramic-p1.car.json, panoramic-p1.stl and panoramic-p1-provenance.txt");
void evalChain; void hp;
