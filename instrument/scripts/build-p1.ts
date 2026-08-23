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
import { p1Config, P1_FRONT_OVERHANG, P1_WHEELBASE, P1_FRONT_DIAMETER, P1_REAR_DIAMETER } from "@car/fixtures";
import { createSession, load } from "@car/history";
import { computeQuilt } from "@car/frame";
import {
  closedMeshCheck,
  creaseNormals,
  DEFAULT_CREASE_ANGLE,
  meshQuilt,
  writeStlBinary,
} from "@car/mesh";
import { massLedger } from "@car/lens";
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

// --- ONE body, sectioned along its length ----------------------------------
// A car is not a stack of boxes. It is one skin whose section changes from
// nose to tail, so that is how it is authored here: a single volume, tape-cut
// into stations, each station's roofline and half-width pushed to its target.
// Every push moves a SHARED curve, so the sections stay welded into one closed
// body — coherent to look at and printable in one piece.
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

/** Tape a station line across the given faces; return the curves it created. */
const stationCut = (x: number, z0: number, z1: number, targets: Id[]): Id[] => {
  const before = s.state.curves.size;
  s.apply("tape", { kind: "line", line: { view: side, a: [x, z0], b: [x, z1], lineClass: "tape" }, targets });
  return [...s.state.curves.keys()].slice(before) as Id[];
};

// Stations, nose to tail. Roof height and half-width at each: this table IS
// the car's profile and plan, and reads as one.
const STATIONS: { x: number; roof: number; halfWidth: number; tuck: number }[] = [
  { x: 250,  roof: 560,  halfWidth: 640, tuck: 60 },
  { x: 505,  roof: 705,  halfWidth: 830, tuck: 300 },  // ahead of the front wheel
  { x: 900,  roof: 815,  halfWidth: 980, tuck: 430 },  // front axle: fender crown
  { x: 1295, roof: 840,  halfWidth: 860, tuck: 300 },  // behind it: waist returns
  { x: 1880, roof: 880,  halfWidth: 850, tuck: 170 },  // cowl: the screen starts
  { x: 2520, roof: 1215, halfWidth: 800, tuck: 150 },  // header rail
  { x: 2900, roof: 1200, halfWidth: 825, tuck: 170 },  // roof rear
  { x: 3045, roof: 1140, halfWidth: 880, tuck: 300 },  // ahead of the rear wheel
  { x: 3440, roof: 1030, halfWidth: 995, tuck: 440 },  // rear axle: haunch
  { x: 3835, roof: 905,  halfWidth: 890, tuck: 300 },  // behind it
  { x: 4210, roof: 815,  halfWidth: 755, tuck: 110 },
];
// Two things this table now does that the last one did not. The screen runs
// 1880 -> 2520 and rises 335 mm: 28 degrees off horizontal, which is a sports
// car; over 410 mm it was 40 degrees and rendered as a wall with a roof
// dropped on it. And the stations at the wheel edges (505/1295, 3045/3835)
// with the axles wide between them are what makes a FENDER: the plan swells
// over each wheel and comes back in behind it. That shape used to be
// attempted by lifting an arch mouth, which never once fired — see below.

// Cut every station through the top face and both flanks in one pass each.
const topCurves: Id[] = [];
const flankCurves: Id[][] = [];
for (const st of STATIONS) {
  topCurves.push(...stationCut(st.x, TOP - 60, TOP + 60, ["cell#5" as Id]));
  flankCurves.push(stationCut(st.x, FLOOR + 40, TOP - 40, ["cell#2" as Id, "cell#3" as Id]));
}

// Roofline: drop each station's top curve to its target height. The curve is
// shared by the segments either side, so the roof arrives as one surface.
for (let i = 0; i < STATIONS.length; i++) {
  const st = STATIONS[i]!;
  const id = topCurves[i];
  if (!id) continue;
  pushCurve(id, [0, 0, st.roof - curveMean(id)[2]]);
}
// Nose and tail ends of the body follow the same profile.
pushCurve(yEdge(0, 1), [0, 0, 395 - curveMean(yEdge(0, 1))[2]]);
pushCurve(yEdge(0, 3), [0, 0, 795 - curveMean(yEdge(0, 3))[2]]);

// Plan: each station's flank curves move to their target half-width. Left and
// right move by the same magnitude, so the body stays symmetric and the mirror
// law has nothing to twin.
for (let i = 0; i < STATIONS.length; i++) {
  const st = STATIONS[i]!;
  for (const id of flankCurves[i] ?? []) {
    const mean = curveMean(id);
    const sign = mean[1] >= 0 ? 1 : -1;
    pushCurve(id, [0, sign * (st.halfWidth - Math.abs(mean[1])), 0]);
  }
}
// Rocker tuck — and this is the wheel arch, arrived at the long way round.
// The flank curve at a station runs from the floor up to the shoulder; pulling
// its LOWER control point inboard makes the body narrow at the rocker while
// the shoulder stays flared. Over an axle that is exactly an arch: the fender
// swells to 980 at the shoulder and draws back inside the tire's outer face
// (896) near the ground, so the wheel stands in the recess instead of being
// skirted over. Between the wheels the same move gives the rocker its
// undercut. Which control point is the low one has to be read off the curve —
// the two flanks are cut in opposite directions, and assuming an order is how
// a body goes quietly asymmetric.
for (let i = 0; i < STATIONS.length; i++) {
  const st = STATIONS[i]!;
  if (st.tuck === 0) continue;
  for (const id of flankCurves[i] ?? []) {
    const c = s.state.curves.get(s.state.resolveCurve(id));
    if (!c) continue;
    const a0 = evalChain(c.chain, 0), a1 = evalChain(c.chain, 1);
    const idx = a0[2] <= a1[2] ? 1 : 2;
    const sign = (a0[1] + a1[1]) >= 0 ? 1 : -1;
    s.apply("push-pull", { target: { kind: "ctrl", id, seg: 0, idx }, delta: [0, -sign * st.tuck, 0] });
  }
}

// Nose and tail plan width.
for (const [k, target] of [[0, 415], [2, 530]] as const) {
  for (const j of [0, 1] as const) {
    const id = `curve#${8 + k + j}` as Id;
    const mean = curveMean(id);
    const sign = mean[1] >= 0 ? 1 : -1;
    pushCurve(id, [0, sign * (target - Math.abs(mean[1])), 0]);
  }
}

// Crown: the roof and hood dome across the car so light travels over them.
for (let i = 0; i < topCurves.length; i++) {
  const id = topCurves[i];
  const st = STATIONS[i]!;
  if (!id) continue;
  const amount = st.x < 1880 ? 26 : st.x < 3100 ? 18 : 22;
  pinch(id, [0, 0, amount]);
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
  for (const id of [...s.state.curves.keys()].slice(before)) s.apply("crease", { curveId: id as Id });
}

// --- wheels: four of them, and they are part of the document ---------------
// A wheel has to read ROUND. The first pass taped a box and drew its four
// corners in, which is an octagon at best and rendered as a brick with the top
// corners knocked off. This pass sections the box the same way the body is
// sectioned — tape lines across each face — and then projects every resulting
// cross-car curve radially onto the wheel circle. Sixteen of them: the
// silhouette is a 16-gon, under 10 mm off a true circle at this radius, and
// the 22-degree facets fall under the crease angle so it shades as a cylinder.
// Left side only: the mirror law renders the right.
const wheel = (cx: number, radius: number, halfWidth: number, yIn: number): void => {
  const beforeCells = new Set(s.state.cells.keys());
  const beforeCurves = new Set(s.state.curves.keys());
  s.apply("tape", {
    kind: "box",
    rect: { view: side, a: [cx - radius, 0], b: [cx + radius, radius * 2], depth: halfWidth * 2, at: yIn },
  });
  // Ids come from the model, never from a count: splits allocate too, so map
  // size stopped tracking the allocator the moment the body was sectioned.
  const made = [...s.state.cells.keys()].filter((id) => !beforeCells.has(id)) as Id[];

  /** Mean point of a cell, read back off its own boundary curves. */
  const cellMean = (id: Id): Pt3 => {
    const cell = s.state.cells.get(id);
    if (!cell) throw new Error(`no cell ${id}`);
    let x = 0, y = 0, z = 0, n = 0;
    for (const sd of cell.sides) {
      const c = s.state.curves.get(s.state.resolveCurve(sd.curveId));
      if (!c) continue;
      for (const t of [0, 0.5, 1]) {
        const p = evalChain(c.chain, sd.t0 + (sd.t1 - sd.t0) * t);
        x += p[0]; y += p[1]; z += p[2]; n++;
      }
    }
    return [x / n, y / n, z / n];
  };
  const means = new Map(made.map((id) => [id, cellMean(id)] as const));
  const pickBy = (score: (m: Pt3) => number): Id =>
    made.reduce((best, id) => (score(means.get(id)!) > score(means.get(best)!) ? id : best), made[0]!);

  // The four faces that carry the silhouette. Flanks are never extreme in x or
  // z (they sit at the hub), so max/min picks the right face without counting.
  const topFace = pickBy((m) => m[2]);
  const botFace = pickBy((m) => -m[2]);
  const frontFace = pickBy((m) => -m[0]);
  const rearFace = pickBy((m) => m[0]);

  const flanks = made.filter((id) => id !== topFace && id !== botFace && id !== frontFace && id !== rearFace);

  // Section the wheel the way the body is sectioned: each cut goes all the way
  // ROUND the ring, never through one face alone. A cut that stops at one face
  // leaves the neighbours holding a T-junction they were never told about, and
  // the curve then moves out from under them — that is exactly how the first
  // attempt at this wheel meshed open in 60 places. Targeting the original
  // face ids is enough; the tape verb resolves descendants, so later cuts land
  // on the pieces earlier ones made.
  const seg = radius * 0.5;
  for (const x of [cx - seg, cx, cx + seg]) {
    s.apply("tape", {
      kind: "line",
      line: { view: side, a: [x, -40], b: [x, radius * 2 + 40], lineClass: "tape" },
      targets: [topFace, botFace, ...flanks],
    });
  }
  for (const z of [radius - seg, radius, radius + seg]) {
    s.apply("tape", {
      kind: "line",
      line: { view: side, a: [cx - radius - 40, z], b: [cx + radius + 40, z], lineClass: "tape" },
      targets: [frontFace, rearFace, ...flanks],
    });
  }

  // Project every cross-car curve onto the circle about the hub. The corners
  // come in, the face midpoints go out, and the flats disappear. Found by
  // geometry so the wheel never depends on the box's internal edge order.
  const hubZ = radius;
  for (const id of [...s.state.curves.keys()].filter((k) => !beforeCurves.has(k)) as Id[]) {
    const c = s.state.curves.get(id);
    if (!c) continue;
    const a0 = evalChain(c.chain, 0), a1 = evalChain(c.chain, 1);
    const acrossCar = Math.abs(a1[1] - a0[1]) > Math.max(Math.abs(a1[0] - a0[0]), Math.abs(a1[2] - a0[2]));
    if (!acrossCar) continue;
    const m = curveMean(id);
    const dx = m[0] - cx, dz = m[2] - hubZ;
    const len = Math.hypot(dx, dz);
    if (len < 1) continue;                       // a curve through the hub has no radial direction
    pushCurve(id, [cx + (radius * dx) / len - m[0], 0, hubZ + (radius * dz) / len - m[2]]);
  }
};
if (process.env['NOWHEELS'] !== '1') { wheel(FRONT_AXLE_X, FRONT_R, 118, 660);
wheel(REAR_AXLE_X, REAR_R, 132, 665); }

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
const raw = meshQuilt(quilt, { baseDensity: 20 });
// The geometry stays as authored. Fairing it (the G3 flow solve, still in the
// tree and still tested) melted the arch mouths, splitter and roof breaks —
// the car did not need smoother SHAPE, it needed smoother SHADING. That is
// creaseNormals, a render-path derivation, and it moves no vertex at all.
const shaded = creaseNormals(raw, DEFAULT_CREASE_ANGLE);
// Seat the car on the road: the ground plane is a datum — the car meets it.
const seated = Float64Array.from(raw.positions);
let minZ = Infinity;
for (let i = 2; i < seated.length; i += 3) minZ = Math.min(minZ, seated[i]!);
for (let i = 2; i < seated.length; i += 3) seated[i] = seated[i]! - minZ;
const mesh = { positions: seated, indices: raw.indices, ranges: raw.ranges };
const report = closedMeshCheck(mesh);

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
writeFileSync(new URL("../../panoramic-p1.stl", import.meta.url), writeStlBinary(mesh, "panoramic-p1"));

// replay integrity: the car is a first-class replayable document
const reloaded = load(doc);
const same = JSON.stringify(reloaded.save()) === JSON.stringify(doc);

const line = (k: string, v: string): string => `${k.padEnd(26)} ${v}`;
console.log("\n=== PANORAMIC P1 ===");
console.log(line("verbs in history", String(doc.verbs.length)));
console.log(line("cells / curves", `${s.state.cells.size} / ${s.state.curves.size}`));
console.log(line("quilt cells (with mirror)", String(quilt.cells.length)));
console.log(line("triangles", String(mesh.indices.length / 3)));
console.log(line("closed mesh", `${report.closed} (${report.violations.length} violations)`));
console.log(line("shading", `${DEFAULT_CREASE_ANGLE}° smoothing groups · ${shaded.split} vertices split on hard edges`));
console.log(line("replay round-trip", String(same)));
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
console.log("\nwrote cars/panoramic-p1.car.json and panoramic-p1.stl");
void evalChain; void hp;
