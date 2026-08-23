import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { load } from "@car/history";
import { computeQuilt } from "@car/frame";
import { meshQuilt } from "@car/mesh";
import { flowMesh } from "@car/flow";
import { evalChain, PI, ncos, nsin } from "@car/num";
import { initEngineNode } from "@car/occt";
import type { Pt3, QuiltSpec } from "@car/schema";
import type { CarDocument } from "@car/schema";

const doc = JSON.parse(readFileSync(new URL("../cars/panoramic-p1.car.json", import.meta.url), "utf8")) as CarDocument;
const s = load(doc);
const quilt = computeQuilt(s.state);

const raw = meshQuilt(quilt, { baseDensity: 20 });
const creaseSamples: Pt3[] = [];
for (const id of quilt.creases) {
  const chain = quilt.curves.get(id);
  if (!chain) continue;
  for (let i = 0; i <= 32; i++) creaseSamples.push(evalChain(chain, i / 32));
}
const faired = flowMesh(raw, [], { passes: 30, lambda: 0.48, mu: -0.50 }).positions;
const seated = Float64Array.from(faired);
let minZ = Infinity;
for (let i = 2; i < seated.length; i += 3) minZ = Math.min(minZ, seated[i]!);
for (let i = 2; i < seated.length; i += 3) seated[i] = seated[i]! - minZ;
const mesh = { positions: seated, indices: raw.indices };
const core = { positions: new Float64Array(0), indices: new Uint32Array(0) };

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
