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

// --- the volumes, nose to tail ---------------------------------------------
// Block 0 is the body core: it carries the wheel arches as recorded cuts and
// is the solid the engine path booleans at print. Everything else is quilt.
const cCore = curveCount();
block(300, 170, 4150, 655, 745);      // 0  body core: sills, tub, beltline
const cHood = curveCount();
block(600, 645, 2010, 830, 755);      // 1  hood over the front-mid six
const cCabin = curveCount();
block(1980, 815, 3120, 1245, 700);    // 2  cabin: tumblehome, inboard of the body
const cDeck = curveCount();
block(3060, 645, 4230, 870, 760);     // 3  rear deck
const cNose = curveCount();
block(0, 195, 645, 680, 660);         // 4  nose / fascia
const cTail = curveCount();
block(4175, 290, 4400, 770, 735);     // 5  tail
const cSplit = curveCount();
block(470, 140, 1260, 235, 800);      // 6  front splitter
const cFendF = curveCount();
blockY(545, 380, 1355, 860, 660, 930); // 7  front fender (left; the mirror law gives the right)
const cFendR = curveCount();
blockY(2860, 380, 3910, 880, 655, 950); // 8  rear haunch (left)

// Sculpting: every push moves a SHARED curve, so both owning panels follow.
const yEdge = (base: number, k: 0 | 1 | 2 | 3): Id => `curve#${base + 4 + k}` as Id;
const xEdge = (base: number, k: 0 | 1 | 2 | 3): Id => `curve#${base + k}` as Id;
const push = (id: Id, d: Pt3): void => { s.apply("push-pull", { target: { kind: "curve", id }, delta: d }); };
/** Pinch: bow a straight edge by moving its interior contact points. */
const pinch = (id: Id, d: Pt3): void => {
  for (const idx of [1, 2] as const) s.apply("push-pull", { target: { kind: "ctrl", id, seg: 0, idx }, delta: d });
};

// Windshield rake and fastback — the two lines that make it a coupe.
push(yEdge(cCabin, 1), [300, 0, 0]);
push(yEdge(cCabin, 3), [430, 0, -330]);
// Nose: chamfer the leading top edge down and tuck the lower edge back.
push(yEdge(cNose, 1), [70, 0, -120]);
push(yEdge(cNose, 0), [55, 0, 55]);
// Hood: drop its leading edge into the nose, so the hood line falls to the road.
push(yEdge(cHood, 1), [0, 0, -95]);
// Body core: draw the nose end in and lift the tail end — a wedge in side view.
push(yEdge(cCore, 0), [0, 0, 45]);
push(yEdge(cCore, 3), [-40, 0, 25]);
// Tail: clipped Kamm.
push(yEdge(cTail, 3), [-45, 0, -85]);
push(yEdge(cDeck, 3), [-70, 0, -75]);
push(yEdge(cDeck, 1), [0, 0, 40]);
// Splitter rakes down to the road.
push(yEdge(cSplit, 1), [-45, 0, -40]);
// Haunches: pull the rear fender's top edge up and out over the rear tire.
push(yEdge(cFendR, 1), [40, 0, 25]);
push(yEdge(cFendF, 3), [-30, 0, 15]);

// Fender ends blade into the body — "taper it to a point" is a first-class
// verb, and a fender that stops in a flat wall is what it exists to prevent.
// Side indices are the cell's loop order; the ±X faces are cells base+0/+1.
const fendFCells = cellsOfBlockAt(42);
const fendRCells = cellsOfBlockAt(48);
s.apply("taper", { cellId: fendFCells[0]!, side: 1, scale: 0.35 });
s.apply("taper", { cellId: fendRCells[1]!, side: 1, scale: 0.4 });

// Crown — the surfacing gesture: bow the flat panels so light travels across
// them. Hood and roof crown across the car; the haunch crowns over the tire.
pinch(yEdge(cHood, 3), [0, 0, 22]);
pinch(yEdge(cHood, 1), [0, 0, 14]);
pinch(yEdge(cCabin, 3), [0, 0, 18]);
// Crown ACROSS the car (a Y-edge spans -hw..+hw, so bowing its middle stays
// symmetric). Bowing a single X-edge would crown one side only — the mirror
// law caught exactly that and correctly offered twins for a now-asymmetric
// body. Centered blocks crown on Y-edges; the one-sided haunch may use either.
pinch(yEdge(cCore, 1), [0, 0, 10]);
pinch(xEdge(cFendR, 3), [0, 0, 16]);
pinch(yEdge(cDeck, 3), [0, 0, 12]);

// --- door cut + shoulder crease --------------------------------------------
// Face order per block is -X, +X, -Y, +Y, -Z, +Z: the door line splits the two
// SIDE faces only (a side-view line never crosses a YZ end cap).
const cabinSideCells = ["cell#14", "cell#15"] as Id[]; // cabin block = cells 12..17
s.apply("tape", {
  kind: "line",
  line: { view: side, a: [2560, 830], b: [2560, 1340], lineClass: "tape" },
  targets: cabinSideCells,
});
const newCurves = [...s.state.curves.keys()].slice(-2);
for (const id of newCurves) s.apply("crease", { curveId: id });

// --- groups: the panels a real body splits into ----------------------------
const cellsOfBlock = (start: number): Id[] =>
  [...s.state.cells.keys()].filter((id) => {
    const n = Number(id.split("#")[1]);
    return n >= start && n < start + 6;
  }) as Id[];
s.apply("group", { cellIds: cellsOfBlock(6), name: "hood" });
s.apply("group", { cellIds: cellsOfBlock(12), name: "cabin" });
s.apply("group", { cellIds: cellsOfBlock(18), name: "decklid" });
s.apply("group", { cellIds: cellsOfBlock(42), name: "rear-haunch" });
s.apply("assign-material", { targetId: "cell#0" as Id, name: "body-in-white", color: "#c8c8c2" });

// --- wheel arches: recorded cuts, evaluated as booleans downstream ----------
const ARCH_CLEARANCE = 60;
const archCut = (centerX: number, radius: number): void => {
  s.apply("cut", {
    profile: { kind: "half-circle", center: [centerX, 170], radius, view: side, at: -961, depth: 1922 },
    targets: ["cell#2" as Id],
  });
};
archCut(FRONT_AXLE_X, FRONT_R + ARCH_CLEARANCE);
archCut(REAR_AXLE_X, REAR_R + ARCH_CLEARANCE);

// ---------------------------------------------------------------------------
// 3. Evaluate: quilt -> conforming mesh -> closed check -> STL
// ---------------------------------------------------------------------------
const quilt = computeQuilt(s.state);
const mesh = meshQuilt(quilt, {});
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
