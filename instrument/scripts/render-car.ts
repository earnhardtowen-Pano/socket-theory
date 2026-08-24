/**
 * A render of a car, not a lens of one.
 *
 * Every picture this tool has made so far was a measurement wearing paint: a
 * heat ramp, an isophote plot, a seam overlay. Useful, and none of them tells
 * you whether the surface is any GOOD — that judgement is made by a person
 * looking at a highlight travel down a flank, and it needs a real material
 * under a real environment.
 *
 * So: clearcoat over metallic base, a procedural studio with two softboxes
 * and a kicker, a glossy floor with the body reflected in it, a contact
 * shadow taken from the body's own footprint rather than faked, and ACES.
 * Nothing here measures anything. That is the point of it.
 *
 *   npx tsx scripts/render-car.ts <car.json> <out.html> [paint]
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { load } from "@car/history";
import { computeQuilt } from "@car/frame";
import { tessellateQuilt, tangentField } from "@car/surface";
import type { CarDocument } from "@car/schema";

const carPath = process.argv[2] ?? "../cars/panoramic-p1.car.json";
const outPath = process.argv[3] ?? "../apps/render/p1.html";
const paint = process.argv[4] ?? "#8d1b24";

const doc = JSON.parse(
  readFileSync(new URL(carPath, import.meta.url), "utf8"),
) as CarDocument;
const quilt = computeQuilt(load(doc).state);
const cross = tangentField(quilt, { order: 2 });
// The RENDER FEED, not the print mesh. The difference is the normals: the
// mesher hands back triangles and `creaseNormals` averages face normals into
// them, which is C0 across a cell boundary however fine the tessellation
// gets. A clearcoat is a mirror, and a mirror shows a slope break in the
// normal field as a hard edge — that is the banding the first render had, and
// it was never in the surface. G1 reads 4e-4 degrees on this body. The feed
// evaluates `boundaryCoonsNormal` at every vertex instead, so the normals are
// the surface's own and the reflection travels.
const mesh = tessellateQuilt(quilt, 26, cross);

// Seat the car on the road — the floor is at z = 0 and the tyres meet it.
const pos = Float32Array.from(mesh.positions);
let minZ = Infinity;
for (let i = 2; i < pos.length; i += 3) minZ = Math.min(minZ, pos[i]!);
for (let i = 2; i < pos.length; i += 3) pos[i] = pos[i]! - minZ;

const nrm = Float32Array.from(mesh.normals);
const idx = Uint32Array.from(mesh.indices);

// The contact shadow is the body's OWN footprint, rasterised on the CPU into
// a small occupancy map and blurred in the shader. A faked ellipse reads as a
// sticker under the car; this one has the wheels in it.
const FW = 192, FH = 96;
let lo = [Infinity, Infinity], hi = [-Infinity, -Infinity];
for (let i = 0; i < pos.length; i += 3) {
  lo[0] = Math.min(lo[0]!, pos[i]!); hi[0] = Math.max(hi[0]!, pos[i]!);
  lo[1] = Math.min(lo[1]!, pos[i + 1]!); hi[1] = Math.max(hi[1]!, pos[i + 1]!);
}
const pad = 260;
const fx0 = lo[0]! - pad, fx1 = hi[0]! + pad;
const fy0 = lo[1]! - pad, fy1 = hi[1]! + pad;
const foot = new Uint8Array(FW * FH);
for (let t = 0; t < idx.length; t += 3) {
  // Weight by how low the triangle sits: a roof casts a softer, wider mark
  // than a sill, and treating them alike is what makes a footprint look flat.
  let zs = 0;
  const px: number[] = [], py: number[] = [];
  for (let k = 0; k < 3; k++) {
    const v = idx[t + k]! * 3;
    px.push((pos[v]! - fx0) / (fx1 - fx0) * (FW - 1));
    py.push((pos[v + 1]! - fy0) / (fy1 - fy0) * (FH - 1));
    zs += pos[v + 2]!;
  }
  const near = Math.max(0, 1 - (zs / 3) / 900);
  const v = Math.round(255 * Math.min(1, 0.25 + near));
  const x0 = Math.max(0, Math.floor(Math.min(...px)));
  const x1 = Math.min(FW - 1, Math.ceil(Math.max(...px)));
  const y0 = Math.max(0, Math.floor(Math.min(...py)));
  const y1 = Math.min(FH - 1, Math.ceil(Math.max(...py)));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const i = y * FW + x;
      if (v > foot[i]!) foot[i] = v;
    }
  }
}

const b64 = (a: Float32Array | Uint32Array | Uint8Array): string =>
  Buffer.from(a.buffer, a.byteOffset, a.byteLength).toString("base64");

const payload = {
  name: doc.name ?? "car",
  paint,
  positions: b64(pos),
  normals: b64(nrm),
  indices: b64(idx),
  footprint: { data: b64(foot), w: FW, h: FH, x0: fx0, x1: fx1, y0: fy0, y1: fy1 },
  bounds: { lo: [lo[0], lo[1], 0], hi: [hi[0], hi[1], Math.max(...[...pos].filter((_, i) => i % 3 === 2))] },
  triangles: idx.length / 3,
};

const template = readFileSync(new URL("../apps/render/template.html", import.meta.url), "utf8");
if (!template.includes("__PAYLOAD__")) throw new Error("render template has no payload slot");
mkdirSync(new URL("../apps/render", import.meta.url), { recursive: true });
const json = JSON.stringify(payload);
writeFileSync(new URL(outPath, import.meta.url), template.replace("__PAYLOAD__", json));
console.log(
  `\n${(idx.length / 3).toLocaleString("en-GB")} triangles · ${(json.length / 1024 / 1024).toFixed(2)} MB` +
  `\nwrote ${outPath}\n`);
