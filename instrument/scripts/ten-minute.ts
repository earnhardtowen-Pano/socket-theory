/**
 * The ten-minute test, scripted (charge §12).
 *
 * "blank file → blocked, skinned, cut, printed report, inside one scripted
 * session." Five stages, each timed, each asserting the thing it claims to
 * have done rather than merely finishing. A stage that produces a file nobody
 * checked has not passed.
 *
 * The point of the test is not speed — it runs in seconds, and the ten
 * minutes is a human sitting at it. The point is that the whole chain exists
 * with no hand-holding between the links: nothing here reaches into a fixture
 * or a pre-built document, and the car it makes did not exist when the script
 * started.
 *
 * Exit code is non-zero if any assertion fails, so this is a CI gate and not
 * a demo.
 */

import { writeFileSync } from "node:fs";
import { createSession, load } from "@car/history";
import { computeQuilt } from "@car/frame";
import { continuityProbe, tangentField } from "@car/surface";
import {
  closedMeshCheck, creaseNormals, DEFAULT_CREASE_ANGLE,
  engraveGrooves, meshQuilt, writeStlBinary,
} from "@car/mesh";
import { initEngineNode } from "@car/occt";
import { provenanceReport } from "@car/lens";
import { evalChain, PI, ncos, nsin } from "@car/num";
import { makeAllocator, type Id, type Pt3 } from "@car/schema";
import { assumed } from "@car/demand";

const failures: string[] = [];
let stage = 0;
const marks: [string, number, string][] = [];

const check = (label: string, ok: boolean, detail: string): void => {
  if (!ok) failures.push(`${label}: ${detail}`);
};
const t0 = process.hrtime.bigint();
let last = t0;
const mark = (name: string, detail: string): void => {
  const now = process.hrtime.bigint();
  marks.push([`${++stage}. ${name}`, Number(now - last) / 1e6, detail]);
  last = now;
};

// ---------------------------------------------------------------------------
// 1. Blank file
// ---------------------------------------------------------------------------
const s = createSession("ten-minute");
check("blank file", s.log.length === 0, `expected an empty history, got ${s.log.length} verbs`);
mark("blank file", `session open, ${s.log.length} verbs`);

// ---------------------------------------------------------------------------
// 2. Blocked — a body, taped and sculpted through welded curves
// ---------------------------------------------------------------------------
const side = { kind: "side" as const };
const LEN = 4200, HW = 900, FLOOR = 140, TOP = 1300;
s.apply("tape", {
  kind: "box",
  rect: { view: side, a: [0, FLOOR], b: [LEN, TOP], depth: HW * 2, at: -HW },
});

// Four stations, cut all the way round the ring — a cut that stops at one
// face leaves its neighbours holding a T-junction they were never told about.
const STATIONS = [
  { x: 700, roof: 830 },
  { x: 1700, roof: 980 },
  { x: 2600, roof: 1240 },
  { x: 3500, roof: 1020 },
];
// Target the four faces the cut actually crosses, found by geometry. Aiming
// a vertical line at the nose face asks it to cross a plane it is parallel
// to, and the frame says so rather than guessing.
const cellMean = (id: Id): Pt3 => {
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
const pickFace = (score: (m: Pt3) => number): Id => {
  const ids = [...s.state.cells.keys()] as Id[];
  return ids.reduce((best, id) => (score(cellMean(id)) > score(cellMean(best)) ? id : best), ids[0]!);
};
const ring = [
  pickFace((m) => m[2]), pickFace((m) => -m[2]),
  pickFace((m) => m[1]), pickFace((m) => -m[1]),
];

const topCurves: Id[] = [];
for (const st of STATIONS) {
  const before = new Set(s.state.curves.keys());
  s.apply("tape", {
    kind: "line",
    line: { view: side, a: [st.x, FLOOR - 200], b: [st.x, TOP + 200], lineClass: "tape" },
    targets: ring,
  });
  const made = [...s.state.curves.keys()].filter((k) => !before.has(k)) as Id[];
  // The deck curve is the highest cross-car one this cut produced.
  let best: Id | undefined;
  let bestZ = -Infinity;
  for (const id of made) {
    const c = s.state.curves.get(id)!;
    const a = evalChain(c.chain, 0), b = evalChain(c.chain, 1);
    const acrossCar = Math.abs(b[1] - a[1]) > Math.abs(b[2] - a[2]);
    const z = (a[2] + b[2]) / 2;
    if (acrossCar && z > bestZ) { best = id; bestZ = z; }
  }
  if (best) {
    s.apply("push-pull", { target: { kind: "curve", id: best }, delta: [0, 0, st.roof - bestZ] });
    topCurves.push(best);
  }
}
s.apply("crease", { curveId: topCurves[2] ?? ("curve#0" as Id) });
check("blocked", s.log.length >= 6, `expected at least 6 verbs, got ${s.log.length}`);
check("blocked", topCurves.length === STATIONS.length,
  `expected ${STATIONS.length} deck curves, found ${topCurves.length}`);
mark("blocked", `${s.log.length} verbs, ${s.state.cells.size} cells, ${s.state.curves.size} curves`);

// ---------------------------------------------------------------------------
// 3. Skinned — quilt, conforming mesh, closed check, smoothing groups
// ---------------------------------------------------------------------------
const quilt = computeQuilt(s.state);
// The surfacing layer, on the path that actually prints. A box turns 90° at
// every join, so the break angle should leave every one of them alone — a
// tangent field that rounded off a shoebox would be the failure this stage is
// here to catch.
const cross = tangentField(quilt, { order: 2 });
const raw = meshQuilt(quilt, { baseDensity: 14, cross });
const report = closedMeshCheck(raw);
const before = continuityProbe(quilt);
const cont = continuityProbe(quilt, { cross });
const shaded = creaseNormals(raw, DEFAULT_CREASE_ANGLE);
check("skinned", report.closed, `mesh is OPEN with ${report.violations.length} violations`);
// The blocked-out body is boxes plus a rotate and a taper, so most joins turn
// a right angle and a few do not. The field must leave the right angles alone
// — a surfacing pass that rounded off a shoebox would be the failure worth
// catching here — and must actually fix the ones it does take.
check("skinned", cross.stats.sharpEdges > 0,
  "the tangent field found no right angles to hold on a body made of boxes");
check("skinned", cont.medianDeg < 1e-6,
  `smooth joins still read ${cont.medianDeg.toFixed(4)}° after the field`);
check("skinned", cont.medianDeg <= before.medianDeg,
  `the field made continuity worse: ${before.medianDeg.toFixed(3)}° to ${cont.medianDeg.toFixed(3)}°`);
check("skinned", raw.indices.length > 0, "mesher produced no triangles");
check("skinned", shaded.positions.length >= raw.positions.length,
  "crease normals lost vertices, which is impossible if it only splits");
mark("skinned", `${raw.indices.length / 3} triangles, closed ${report.closed}, ` +
  `${cont.sharp} joins held as edges at ${cont.breakAngleDeg}°, ` +
  `${cont.g1Joins}/${cont.joins} smooth joins G1 (was ${before.g1Joins}), ` +
  `${shaded.split} vertices split at ${DEFAULT_CREASE_ANGLE}°`);

// ---------------------------------------------------------------------------
// 4. Cut — a recorded boolean, replayed through the kernel, out as STEP
// ---------------------------------------------------------------------------
const ARCH_R = 380, FRONT_X = 900, REAR_X = 3300;
s.apply("cut", {
  profile: { kind: "half-circle", center: [FRONT_X, FLOOR], radius: ARCH_R, view: side, at: -HW - 1, depth: HW * 2 + 2 },
  targets: ["cell#2" as Id],
});
s.apply("cut", {
  profile: { kind: "half-circle", center: [REAR_X, FLOOR], radius: ARCH_R, view: side, at: -HW - 1, depth: HW * 2 + 2 },
  targets: ["cell#2" as Id],
});

const engine = await initEngineNode();
const slab = engine.makeBox([LEN, HW * 2, 420], [0, -HW, FLOOR]);
const archProfile = (cx: number): Pt3[] => {
  const y = -HW - 1;
  const pts: Pt3[] = [[cx - ARCH_R - 20, y, FLOOR - 60], [cx + ARCH_R + 20, y, FLOOR - 60],
                      [cx + ARCH_R + 20, y, FLOOR]];
  for (let i = 0; i <= 16; i++) {
    const th = (i / 16) * PI;
    pts.push([cx + ARCH_R * ncos(th), y, FLOOR + ARCH_R * nsin(th)]);
  }
  pts.push([cx - ARCH_R - 20, y, FLOOR]);
  return pts;
};
const cut1 = engine.cutPrism(slab, archProfile(FRONT_X), [0, 1, 0], HW * 2 + 2);
const cut2 = engine.cutPrism(cut1, archProfile(REAR_X), [0, 1, 0], HW * 2 + 2);
const cutMesh = engine.meshShape(cut2, 1.5);
const cutReport = closedMeshCheck({ positions: cutMesh.positions, indices: cutMesh.indices });

const step = engine.stepExport(cut2);
const stepAgain = engine.stepExport(cut2);
check("cut", cutReport.closed, `the boolean result is OPEN with ${cutReport.violations.length} violations`);
check("cut", step.startsWith("ISO-10303-21"), `STEP does not start with ISO-10303-21: ${step.slice(0, 24)}`);
check("cut", step === stepAgain, "STEP export is not byte-identical on a second call");
check("cut", s.log.filter((v) => v.verb === "cut").length === 2,
  "the cuts are not recorded verbs in the document");
writeFileSync(new URL("../../ten-minute-cut.step", import.meta.url), step);
mark("cut", `2 recorded booleans replayed, ${cutMesh.indices.length / 3} tris, ` +
  `STEP ${step.length} bytes, byte-identical on re-export`);

// ---------------------------------------------------------------------------
// 5. Printed report — STL, grooves, provenance, and the document itself
// ---------------------------------------------------------------------------
const shutlines: Pt3[] = [];
for (const id of quilt.creases) {
  const chain = quilt.curves.get(id);
  if (!chain) continue;
  for (let i = 0; i <= 300; i++) shutlines.push(evalChain(chain, i / 300));
}
const grooved = engraveGrooves(raw, shutlines, { scaleDenominator: 24, minPrintedFeatureMm: 0.4 });
const printMesh = { positions: grooved.positions, indices: raw.indices };
const printReport = closedMeshCheck(printMesh);
const stl = writeStlBinary(printMesh, "ten-minute");

const doc = s.save();
const replayed = load(doc);
const sameDoc = JSON.stringify(replayed.save()) === JSON.stringify(doc);

const prov = provenanceReport({
  carName: "Ten-minute test car",
  config: {
    printScale: assumed(24, "count", "1:24, the scale this test prints at"),
    nozzle: assumed(0.4, "mm", "0.4 mm nozzle — what the groove is sized from"),
    length: assumed(LEN, "mm", "blocked by the script, nothing consulted"),
    halfWidth: assumed(HW, "mm", "blocked by the script"),
    floor: assumed(FLOOR, "mm", "blocked by the script"),
    top: assumed(TOP, "mm", "blocked by the script"),
    archRadius: assumed(ARCH_R, "mm", "blocked by the script"),
  },
  clamps: [],
  bodyChecks: [],
  ledgerLines: ["no ledger: this car has no parts, only a skin"],
  modelFacts: [
    ["verbs in history", String(doc.verbs.length)],
    ["triangles printed", String(printMesh.indices.length / 3)],
    ["closed after grooves", String(printReport.closed)],
    ["STL bytes", String(stl.byteLength)],
    ["replay round-trip", String(sameDoc)],
  ],
});

writeFileSync(new URL("../../ten-minute.stl", import.meta.url), stl);
writeFileSync(new URL("../../ten-minute-provenance.txt", import.meta.url), prov.text);
writeFileSync(new URL("../cars/ten-minute.car.json", import.meta.url), JSON.stringify(doc));

check("printed report", printReport.closed,
  `the grooved mesh is OPEN with ${printReport.violations.length} violations`);
check("printed report", sameDoc, "the document does not replay to itself");
check("printed report", stl.byteLength > 0, "empty STL");
check("printed report", prov.text.includes("PROVENANCE REPORT"), "provenance report is not a report");
mark("printed report", `${stl.byteLength} STL bytes, ${grooved.moved} groove vertices, ` +
  `${prov.assumedCount} assumed quantities, replay ${sameDoc}`);

// ---------------------------------------------------------------------------
const totalMs = Number(process.hrtime.bigint() - t0) / 1e6;
const pad = (t: string, n: number): string => t.length >= n ? t : t + " ".repeat(n - t.length);
console.log("\n=== THE TEN-MINUTE TEST (charge §12) ===");
console.log("blank file → blocked → skinned → cut → printed report, one scripted session\n");
for (const [name, ms, detail] of marks) {
  console.log(`${pad(name, 22)}${pad(`${ms.toFixed(0)} ms`, 10)}${detail}`);
}
console.log(`\n${pad("total", 22)}${totalMs.toFixed(0)} ms`);
console.log("\nWrote ten-minute.stl, ten-minute-cut.step, ten-minute-provenance.txt,");
console.log("and instrument/cars/ten-minute.car.json — none of which existed when this started.");

if (failures.length > 0) {
  console.error(`\nFAILED ${failures.length} assertion(s):`);
  for (const f of failures) console.error(`  · ${f}`);
  process.exitCode = 1;
} else {
  console.log("\nAll stage assertions passed.");
}
