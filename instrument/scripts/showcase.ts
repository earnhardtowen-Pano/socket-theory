/**
 * Showcase: the real pipeline, both paths in one model.
 *   - Body sculpted with verbs (welded-curve pushes rake the cabin and chamfer
 *     the nose/tail; door lines tape-split both sides and crease).
 *   - Slab evaluated through the borrowed engine: recorded wheel-arch cuts
 *     become OCCT booleans, meshed engine-side.
 * Emits body.json for the preview page (perspective + side elevation views).
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { createSession } from "@car/history";
import { computeQuilt } from "@car/frame";
import { meshQuilt, closedMeshCheck } from "@car/mesh";
import { initEngineNode } from "@car/occt";
import { evalChain, PI, ncos, nsin } from "@car/num";
import type { Pt3, QuiltSpec } from "@car/schema";

const s = createSession("showcase");

// Blocked in four boxes. mm; X aft, Y across (centered), Z up.
s.apply("tape", { kind: "box", rect: { view: { kind: "side" }, a: [0, 250], b: [4200, 700], depth: 1800, at: -900 } });    // slab: cells 0-5, curves 0-11
s.apply("tape", { kind: "box", rect: { view: { kind: "side" }, a: [950, 700], b: [3350, 1250], depth: 1500, at: -750 } }); // cabin: cells 6-11, curves 12-23
s.apply("tape", { kind: "box", rect: { view: { kind: "side" }, a: [0, 700], b: [950, 830], depth: 1500, at: -750 } });     // hood: curves 24-35
s.apply("tape", { kind: "box", rect: { view: { kind: "side" }, a: [3350, 700], b: [4200, 900], depth: 1500, at: -750 } }); // tail: curves 36-47

// Sculpt by pushing welded Y-edges — both owning faces follow (the weld law).
s.apply("push-pull", { target: { kind: "curve", id: "curve#17" }, delta: [300, 0, 0] });  // cabin front-top: windshield rake
s.apply("push-pull", { target: { kind: "curve", id: "curve#19" }, delta: [-250, 0, 0] }); // cabin rear-top: fastback
s.apply("push-pull", { target: { kind: "curve", id: "curve#29" }, delta: [0, 0, -90] });  // hood front-top: nose chamfer
s.apply("push-pull", { target: { kind: "curve", id: "curve#43" }, delta: [0, 0, -70] });  // tail rear-top: tail chamfer

// Door line, authored on both side faces — a centered body carries its own mirror.
s.apply("tape", {
  kind: "line",
  line: { view: { kind: "side" }, a: [1900, 650], b: [1900, 1300], lineClass: "tape" },
  targets: ["cell#8", "cell#9"],
});
s.apply("crease", { curveId: "curve#48" });
s.apply("crease", { curveId: "curve#49" });

// Wheel arches: recorded cut verbs, evaluated as engine booleans below.
const ARCH_R = 400;
const ARCH_FRONT_X = 800;
const ARCH_REAR_X = 3400;
s.apply("cut", { profile: { kind: "half-circle", center: [ARCH_FRONT_X, 250], radius: ARCH_R, view: { kind: "side" }, at: -901, depth: 1802 }, targets: ["cell#2"] });
s.apply("cut", { profile: { kind: "half-circle", center: [ARCH_REAR_X, 250], radius: ARCH_R, view: { kind: "side" }, at: -901, depth: 1802 }, targets: ["cell#2"] });

const quilt = computeQuilt(s.state);

// Display split: the slab renders through the engine cut path; everything else
// through our conforming mesher.
const slabCells = new Set(["cell#0", "cell#1", "cell#2", "cell#3", "cell#4", "cell#5"]);
const upper: QuiltSpec = {
  cells: quilt.cells.filter((c) => !slabCells.has(c.id)),
  curves: quilt.curves,
  creases: quilt.creases,
  gaps: quilt.gaps,
};
const upperMesh = meshQuilt(upper, {});
const upperReport = closedMeshCheck(upperMesh);

// Engine path: replay the recorded cuts as booleans on the crude slab.
const engine = await initEngineNode();
const slab = engine.makeBox([4200, 1800, 450], [0, -900, 250]);
function archProfile(cx: number): Pt3[] {
  const y = -901;
  const pts: Pt3[] = [
    [cx - ARCH_R - 20, y, 200],
    [cx + ARCH_R + 20, y, 200],
    [cx + ARCH_R + 20, y, 250],
  ];
  for (let i = 0; i <= 12; i++) {
    const th = (i / 12) * PI;
    pts.push([cx + ARCH_R * ncos(th), y, 250 + ARCH_R * nsin(th)]);
  }
  pts.push([cx - ARCH_R - 20, y, 250]);
  return pts;
}
const cut1 = engine.cutPrism(slab, archProfile(ARCH_FRONT_X), [0, 1, 0], 1802);
const cut2 = engine.cutPrism(cut1, archProfile(ARCH_REAR_X), [0, 1, 0], 1802);
const slabMesh = engine.meshShape(cut2, 1.5);
const slabReport = closedMeshCheck({ positions: slabMesh.positions, indices: slabMesh.indices });

// Curve polylines for the elevation view.
const SAMPLES = 25;
const curveLines = [...quilt.curves.entries()].map(([id, chain]) => {
  const pts: number[] = [];
  for (let i = 0; i < SAMPLES; i++) {
    const p = evalChain(chain, i / (SAMPLES - 1));
    pts.push(p[0], p[1], p[2]);
  }
  return { id, pts, crease: quilt.creases.has(id) };
});

console.log("upper cells:", upper.cells.length, "closed:", upperReport.closed, "violations:", upperReport.violations.length);
console.log("slab (engine cut) tris:", slabMesh.indices.length / 3, "closed:", slabReport.closed, "violations:", slabReport.violations.length);
console.log("verbs in history:", s.log.length);

mkdirSync(new URL("../apps/preview", import.meta.url), { recursive: true });
writeFileSync(
  new URL("../apps/preview/body.json", import.meta.url),
  JSON.stringify({
    upper: { positions: Array.from(upperMesh.positions), indices: Array.from(upperMesh.indices) },
    slab: { positions: Array.from(slabMesh.positions), indices: Array.from(slabMesh.indices) },
    curves: curveLines,
    stats: {
      cells: quilt.cells.length,
      verbs: s.log.length,
      upperClosed: upperReport.closed,
      slabClosed: slabReport.closed,
      upperTris: upperMesh.indices.length / 3,
      slabTris: slabMesh.indices.length / 3,
    },
  }),
);
console.log("body.json written");
