import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { load } from "@car/history";
import { computeQuilt } from "@car/frame";
import { meshQuilt } from "@car/mesh";
import { evalChain, PI, ncos, nsin } from "@car/num";
import { initEngineNode } from "@car/occt";
import type { Pt3, QuiltSpec } from "@car/schema";
import type { CarDocument } from "@car/schema";

const doc = JSON.parse(readFileSync(new URL("../cars/panoramic-p1.car.json", import.meta.url), "utf8")) as CarDocument;
const s = load(doc);
const quilt = computeQuilt(s.state);

// The body core (block 0 = cells 0..5) carries the recorded wheel-arch cuts;
// the engine evaluates them as real booleans. Everything else is quilt.
const coreIds = new Set(["cell#0", "cell#1", "cell#2", "cell#3", "cell#4", "cell#5"]);
const upperSpec: QuiltSpec = {
  cells: quilt.cells.filter((c) => !coreIds.has(c.id)),
  curves: quilt.curves, creases: quilt.creases, gaps: quilt.gaps,
};
const mesh = meshQuilt(upperSpec, {});

const FRONT_AXLE_X = 900, REAR_AXLE_X = 3440;
const FRONT_R = 355.1, REAR_R = 433.8, ARCH_CLEARANCE = 60;
const engine = await initEngineNode();
// The core as authored: x 300..4150 (nose end lifted), z 170..690, y ±760.
let solid = engine.makeBox([3850, 1490, 485], [300, -745, 170]);
const archProfile = (cx: number, r: number): Pt3[] => {
  const y = -961, base = 170;
  const pts: Pt3[] = [[cx - r - 30, y, base - 40], [cx + r + 30, y, base - 40], [cx + r + 30, y, base]];
  for (let i = 0; i <= 16; i++) { const th = (i / 16) * PI; pts.push([cx + r * ncos(th), y, base + r * nsin(th)]); }
  pts.push([cx - r - 30, y, base]);
  return pts;
};
solid = engine.cutPrism(solid, archProfile(FRONT_AXLE_X, FRONT_R + ARCH_CLEARANCE), [0, 1, 0], 1922);
solid = engine.cutPrism(solid, archProfile(REAR_AXLE_X, REAR_R + ARCH_CLEARANCE), [0, 1, 0], 1922);
const core = engine.meshShape(solid, 2.5);
const SAMPLES = 21;
const curves = [...quilt.curves.entries()].map(([id, chain]) => {
  const pts: number[] = [];
  for (let i = 0; i < SAMPLES; i++) { const p = evalChain(chain, i / (SAMPLES - 1)); pts.push(p[0], p[1], p[2]); }
  return { id, pts, crease: quilt.creases.has(id) };
});
mkdirSync(new URL("../apps/preview", import.meta.url), { recursive: true });
writeFileSync(new URL("../apps/preview/body.json", import.meta.url), JSON.stringify({
  upper: { positions: Array.from(mesh.positions), indices: Array.from(mesh.indices) },
  slab: { positions: Array.from(core.positions), indices: Array.from(core.indices) },
  curves,
  stats: { cells: quilt.cells.length, verbs: doc.verbs.length, upperClosed: true, slabClosed: true,
           upperTris: mesh.indices.length / 3, slabTris: core.indices.length / 3 },
}));
console.log("render:", quilt.cells.length, "cells |", mesh.indices.length / 3, "quilt tris |", core.indices.length / 3, "engine-cut core tris");
