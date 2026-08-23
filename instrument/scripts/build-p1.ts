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
import { meshQuilt, closedMeshCheck, writeStlBinary } from "@car/mesh";
import { flowMesh } from "@car/flow";
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
const STATIONS: { x: number; roof: number; halfWidth: number }[] = [
  { x: 250,  roof: 620,  halfWidth: 700 },
  { x: 620,  roof: 795,  halfWidth: 855 },
  { x: 980,  roof: 840,  halfWidth: 935 },  // over the front wheels
  { x: 1500, roof: 858,  halfWidth: 880 },
  { x: 2010, roof: 890,  halfWidth: 855 },  // cowl: the screen starts here
  { x: 2420, roof: 1235, halfWidth: 790 },  // roof front
  { x: 3020, roof: 1225, halfWidth: 800 },  // roof rear
  { x: 3450, roof: 1010, halfWidth: 940 },  // over the rear wheels, fastback falling
  { x: 3900, roof: 880,  halfWidth: 910 },
  { x: 4210, roof: 820,  halfWidth: 800 },
];

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
pushCurve(yEdge(0, 1), [0, 0, 470 - curveMean(yEdge(0, 1))[2]]);
pushCurve(yEdge(0, 3), [0, 0, 790 - curveMean(yEdge(0, 3))[2]]);

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
// Nose and tail plan width.
for (const [k, target] of [[0, 470], [2, 560]] as const) {
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
  const amount = st.x < 2010 ? 26 : st.x < 3100 ? 18 : 22;
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
const ARCH = [
  { front: 560, rear: 1330, top: 560 },
  { front: 3060, rear: 3830, top: 610 },
];
for (const a of ARCH) {
  for (const x of [a.front, a.rear]) {
    s.apply("tape", {
      kind: "line",
      line: { view: side, a: [x, FLOOR - 40], b: [x, FLOOR + 520], lineClass: "tape" },
      targets: ["cell#2" as Id, "cell#3" as Id],
    });
  }
}
// Lift the arch mouths by geometry, not by cell search: every curve lying on
// the floor line whose span falls inside an arch is one of the two mouths, so
// left and right are treated in ONE pass and the body cannot drift asymmetric.
// (Searching per side did drift, and the mirror law reported it as twins.)
for (const a of ARCH) {
  const mouths: Id[] = [];
  for (const [id, c] of s.state.curves) {
    let lo = Infinity, hi = -Infinity, zMax = -Infinity, yAbs = 0, n = 0;
    for (const t of [0, 0.5, 1]) {
      const p = evalChain(c.chain, t);
      lo = Math.min(lo, p[0]); hi = Math.max(hi, p[0]);
      zMax = Math.max(zMax, p[2]); yAbs += Math.abs(p[1]); n++;
    }
    if (zMax > FLOOR + 5 || yAbs / n < 380) continue;
    if (lo > a.front - 5 && hi < a.rear + 5) mouths.push(id as Id);
  }
  for (const id of mouths) {
    pushCurve(id, [0, 0, a.top - FLOOR]);
    pinch(id, [0, 0, 110]);
  }
}

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
// Authored as blocks then pinched round — the silhouette a wheel needs at this
// scale. Left side only: the mirror law renders the right.
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
  void made;
  // Round the silhouette by drawing the four corner edges in toward the hub —
  // an octagon reads as a wheel where a square does not. The corner edges are
  // the ones running ACROSS the car, found by geometry so the wheel does not
  // depend on the box's internal edge order.
  const cut = radius * 0.42;
  for (const id of [...s.state.curves.keys()].filter((k) => !beforeCurves.has(k)) as Id[]) {
    const c = s.state.curves.get(id)!;
    const a0 = evalChain(c.chain, 0), a1 = evalChain(c.chain, 1);
    const acrossCar = Math.abs(a1[1] - a0[1]) > Math.max(Math.abs(a1[0] - a0[0]), Math.abs(a1[2] - a0[2]));
    if (!acrossCar) continue;
    const m = curveMean(id);
    // Draw the corner in along the length always, and down only from ABOVE the
    // hub: lifting the lower corners rounds the tread off the road, and a car
    // that floats is not a car. The contact patch is a datum.
    const dz = m[2] > radius ? -cut : 0;
    pushCurve(id, [Math.sign(cx - m[0]) * cut, 0, dz]);
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
const raw = meshQuilt(quilt, {});
// G3 flow solve: fair the derived mesh, creases pinned. A derivation — the
// authored history is untouched and still replays byte-identically.
const creaseSamples: Pt3[] = [];
for (const id of quilt.creases) {
  const chain = quilt.curves.get(id);
  if (!chain) continue;
  for (let i = 0; i <= 32; i++) creaseSamples.push(evalChain(chain, i / 32));
}
const flowed = flowMesh(raw, creaseSamples, { pinPlaneZ: 0, passes: 2, lambda: 0.28, mu: -0.30 });
const mesh = { positions: flowed.positions, indices: raw.indices, ranges: raw.ranges };
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
console.log(line("flow solve", `${flowed.report.passes} pass pairs · ${flowed.report.pinned} crease vertices pinned · mean shift ${flowed.report.meanShift.toFixed(1)} mm`));
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
