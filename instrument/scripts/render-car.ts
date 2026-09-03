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
 *
 * The page then takes ?light=dark|high|day. `dark` is the studio above and is
 * the right light to JUDGE a surface in; `high` is a white cyclorama and is
 * the right light to SEE a car in, which is not the same thing; `day` is
 * outdoors. Also ?ghost=1, ?yaw, ?pitch, ?dist, ?fov.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { load } from "@car/history";
import { computeQuilt } from "@car/frame";
import { tessellateQuilt, tangentField } from "@car/surface";
import type { CarDocument, Id } from "@car/schema";
import { finishOf, type Finish } from "@car/skin";

const carPath = process.argv[2] ?? "../cars/panoramic-p1.car.json";
const outPath = process.argv[3] ?? "../apps/render/p1.html";
const paint = process.argv[4] ?? "#8d1b24";

const doc = JSON.parse(
  readFileSync(new URL(carPath, import.meta.url), "utf8"),
) as CarDocument;
const state = load(doc).state;
const quilt = computeQuilt(state);
const cross = tangentField(quilt, { order: 2 });
// The RENDER FEED, not the print mesh. The difference is the normals: the
// mesher hands back triangles and `creaseNormals` averages face normals into
// them, which is C0 across a cell boundary however fine the tessellation
// gets. A clearcoat is a mirror, and a mirror shows a slope break in the
// normal field as a hard edge — that is the banding the first render had, and
// it was never in the surface. G1 reads 4e-4 degrees on this body. The feed
// evaluates `boundaryCoonsNormal` at every vertex instead, so the normals are
// the surface's own and the reflection travels.
const RES = 26;
const mesh = tessellateQuilt(quilt, RES, cross);

// Seat the car on the road — the floor is at z = 0 and the tyres meet it.
const pos = Float32Array.from(mesh.positions);
let minZ = Infinity;
for (let i = 2; i < pos.length; i += 3) minZ = Math.min(minZ, pos[i]!);
for (let i = 2; i < pos.length; i += 3) pos[i] = pos[i]! - minZ;

const nrm = Float32Array.from(mesh.normals);
const idx = Uint32Array.from(mesh.indices);

// ── shutlines ─────────────────────────────────────────────────────────────
// The print mesh engraves a groove along every gap curve; the render never
// did, so a car with fifteen panels rendered as one unbroken shell. Rather
// than cut the render feed — its normals are analytic and a displaced vertex
// would keep the surface's normal and read as a smudge — every vertex carries
// its DISTANCE to the nearest shutline, and the shader draws the gap.
//
// The feed's layout is what makes this cheap. Each cell owns an (n+1)x(n+1)
// grid at `cellIndex * vertsPerCell`, indexed `j * (n+1) + i`, with side 0 at
// j = 0, side 1 at i = n, side 2 at j = n and side 3 at i = 0. So the distance
// from a vertex to a gapped side is the distance to its own row's or column's
// end — exact on the boundary and accurate where it matters, which is within
// a few millimetres of it.
const vertsPerCell = (RES + 1) * (RES + 1);
const gapDist = new Float32Array(pos.length / 3).fill(1e4);
{
  const byId = new Map(quilt.cells.map((c) => [c.id, c] as const));
  const at = (base: number, i: number, j: number): number => (base + j * (RES + 1) + i) * 3;
  const dist = (a: number, b: number): number =>
    Math.hypot(pos[a]! - pos[b]!, pos[a + 1]! - pos[b + 1]!, pos[a + 2]! - pos[b + 2]!);
  for (let ci = 0; ci < mesh.ranges.length; ci++) {
    const cell = byId.get(mesh.ranges[ci]!.id);
    if (!cell) continue;
    const base = ci * vertsPerCell;
    const gapped = cell.sides.map((sd) => quilt.gaps.has(sd.curveId));
    if (!gapped.some(Boolean)) continue;
    for (let j = 0; j <= RES; j++) {
      for (let i = 0; i <= RES; i++) {
        const here = at(base, i, j);
        let d = 1e4;
        if (gapped[0]) d = Math.min(d, dist(here, at(base, i, 0)));
        if (gapped[2]) d = Math.min(d, dist(here, at(base, i, RES)));
        if (gapped[3]) d = Math.min(d, dist(here, at(base, 0, j)));
        if (gapped[1]) d = Math.min(d, dist(here, at(base, RES, j)));
        gapDist[here / 3] = Math.min(gapDist[here / 3]!, d);
      }
    }
  }
}

// ── materials ─────────────────────────────────────────────────────────────
// Every render this tool has made painted the whole body one colour, glass
// and tyres included, because nothing had ever called `assign-material`. The
// document carries the assignment per cell and the feed carries a range per
// cell, so joining them is the whole of it.
//
// The material RECORD is a name and a colour and nothing else — that is its
// ratified shape — so the finish (how rough, how metallic, whether it wears a
// clearcoat) is decided here, by name, with paint as the default. A `finish`
// on the record itself would be the right home for it and is an amendment
// nobody has asked for yet; until then this shim is the honest version,
// because a renderer inventing a finish is better than a renderer pretending
// glass is steel.
// The catalogue decides the finish, not a substring match on the name. The
// old table asked "does the name contain 'glass'?", which would have rendered
// a paint called Sea Glass Green as a window; `@car/types/finishes` keys on
// the name itself and falls back to unpainted skin, keeping the car's own
// colour and replacing only the physics.
/** The shader indexes classes, so they need an order. Structure is 1 because
 *  the ghost pass asks "is this structure?" and nothing else. */
const CLASS_INDEX: Record<string, number> = {
  skin: 0, structure: 1, glazing: 2, trim: 3, tyre: 4, wheel: 5,
};

const hexToRgb = (h: string): [number, number, number] => {
  const v = parseInt(h.replace("#", ""), 16);
  return [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255];
};
/** A twin is `<master>~m`; the material lives on the master. */
const masterOf = (id: string): Id => (id.endsWith("~m") ? id.slice(0, -2) : id) as Id;

const palette: { name: string; rgb: [number, number, number]; finish: Finish }[] = [];
const slotOf = new Map<string, number>();
// Slot 0 is always the command-line paint, so a car with no materials at all
// renders exactly as it did before this existed.
palette.push({ name: "paint", rgb: hexToRgb(paint), finish: finishOf("Classic Red") });
slotOf.set("", 0);
const matOfVertex = new Float32Array(pos.length / 3);
let assignedCells = 0;
for (const r of mesh.ranges) {
  const cell = state.cells.get(masterOf(r.id));
  const mat = cell?.materialId === undefined ? undefined : state.materials.get(cell.materialId);
  let slot = 0;
  if (mat) {
    assignedCells++;
    const key = `${mat.name}|${mat.color}`;
    const seen = slotOf.get(key);
    if (seen !== undefined) slot = seen;
    else {
      slot = palette.length;
      // The paint slot is shared, so the command line still recolours a car.
      const fin = finishOf(mat.name, mat.color);
      // The command line still recolours a car, but only its SKIN: a paint
      // override that also repainted the glass and the chassis would undo the
      // distinction the classes exist to make.
      if (fin.surfaceClass === "skin" && process.argv[4] !== undefined) slot = 0;
      else palette.push({ name: mat.name, rgb: hexToRgb(mat.color), finish: fin });
      slotOf.set(key, slot);
    }
  }
  // A range is a run of INDICES; the vertices it names are what get the slot.
  for (let t = r.start; t < r.start + r.count; t++) matOfVertex[idx[t]!] = slot;
}
if (palette.length > 16) throw new Error(`${palette.length} materials; the shader holds 16`);

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

let topZ = -Infinity;
for (let i = 2; i < pos.length; i += 3) if (pos[i]! > topZ) topZ = pos[i]!;

const payload = {
  name: doc.name ?? "car",
  paint,
  materials: palette.map((m) => ({
    name: m.name, rgb: m.rgb,
    rough: m.finish.rough, metal: m.finish.metal, coat: m.finish.coat,
    opacity: m.finish.opacity, klass: CLASS_INDEX[m.finish.surfaceClass],
  })),
  positions: b64(pos),
  normals: b64(nrm),
  indices: b64(idx),
  mats: b64(matOfVertex),
  gaps: b64(gapDist),
  gapWidth: 4.5,
  footprint: { data: b64(foot), w: FW, h: FH, x0: fx0, x1: fx1, y0: fy0, y1: fy1 },
  // A loop, not a spread. `Math.max(...positions)` is fine until a car has a
  // chassis in it and the argument list is 360,000 long, at which point it is
  // a stack overflow rather than a slow path.
  bounds: { lo: [lo[0], lo[1], 0], hi: [hi[0], hi[1], topZ] },
  triangles: idx.length / 3,
};

const template = readFileSync(new URL("../apps/render/template.html", import.meta.url), "utf8");
if (!template.includes("__PAYLOAD__")) throw new Error("render template has no payload slot");
mkdirSync(new URL("../apps/render", import.meta.url), { recursive: true });
const json = JSON.stringify(payload);
writeFileSync(new URL(outPath, import.meta.url), template.replace("__PAYLOAD__", json));
console.log(
  `\n${(idx.length / 3).toLocaleString("en-GB")} triangles · ${(json.length / 1024 / 1024).toFixed(2)} MB` +
  `\n${assignedCells} of ${mesh.ranges.length} cells carry a material · ${palette.length} in the palette: ` +
  palette.map((m) => `${m.name} [${m.finish.surfaceClass}]`).join(", ") +
  `\nwrote ${outPath}\n`);
