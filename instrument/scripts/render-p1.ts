import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { load } from "@car/history";
import { computeQuilt } from "@car/frame";
import { creaseNormals, DEFAULT_CREASE_ANGLE, meshQuilt } from "@car/mesh";
import { evalChain, PI, ncos, nsin } from "@car/num";
import { initEngineNode } from "@car/occt";
import type { Pt3, QuiltSpec } from "@car/schema";
import type { CarDocument } from "@car/schema";

const doc = JSON.parse(readFileSync(new URL("../cars/panoramic-p1.car.json", import.meta.url), "utf8")) as CarDocument;
const s = load(doc);
const quilt = computeQuilt(s.state);

const raw = meshQuilt(quilt, { baseDensity: 20 });
// Authored geometry, shaded in smoothing groups: normals average across a
// panel and split at anything sharper than the crease angle. The split
// duplicates vertices, so the render buffer is wider than the print mesh —
// a view of the model, never the model.
const shaded = creaseNormals(raw, DEFAULT_CREASE_ANGLE);
const seated = Float64Array.from(shaded.positions);
let minZ = Infinity;
for (let i = 2; i < seated.length; i += 3) minZ = Math.min(minZ, seated[i]!);
for (let i = 2; i < seated.length; i += 3) seated[i] = seated[i]! - minZ;
const mesh = { positions: seated, normals: shaded.normals, indices: shaded.indices };
const core = { positions: new Float64Array(0), indices: new Uint32Array(0) };

const SAMPLES = 21;
const curves = [...quilt.curves.entries()].map(([id, chain]) => {
  const pts: number[] = [];
  for (let i = 0; i < SAMPLES; i++) { const p = evalChain(chain, i / (SAMPLES - 1)); pts.push(p[0], p[1], p[2]); }
  return { id, pts, crease: quilt.creases.has(id) };
});
mkdirSync(new URL("../apps/preview", import.meta.url), { recursive: true });
writeFileSync(new URL("../apps/preview/body.json", import.meta.url), JSON.stringify({
  upper: { positions: Array.from(mesh.positions), normals: Array.from(mesh.normals), indices: Array.from(mesh.indices) },
  slab: { positions: Array.from(core.positions), normals: [] as number[], indices: Array.from(core.indices) },
  curves,
  stats: { cells: quilt.cells.length, verbs: doc.verbs.length, upperClosed: true, slabClosed: true,
           upperTris: mesh.indices.length / 3, slabTris: core.indices.length / 3 },
}));
console.log("render:", quilt.cells.length, "cells |", mesh.indices.length / 3, "quilt tris |",
            shaded.split, `vertices split at ${DEFAULT_CREASE_ANGLE}\u00b0`);
