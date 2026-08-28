/**
 * The app: every car this tool has built, in one page you can open anywhere.
 *
 * `render-car.ts` makes a PHOTOGRAPH — one car, one light, one angle, and a
 * thirty-megabyte file to do it in, because it hands the browser raw float
 * positions, raw float normals and a full index buffer. That is the right
 * trade for judging a surface on a desk and the wrong one for a page that has
 * to travel.
 *
 * So this writes the same renderer against a payload that costs a fifth as
 * much, by noticing three things the photograph never used:
 *
 *   THE INDICES ARE DERIVABLE. `tessellateQuilt` lays every cell out as a
 *   regular (n+1)x(n+1) grid at `ci * vertsPerCell` and triangulates it the
 *   same way every time. So the index buffer carries no information — the
 *   browser can rebuild it from `res` and the cell count, bit for bit, and it
 *   is checked here against the mesher's own before it is dropped.
 *
 *   POSITIONS AND NORMALS DO NOT NEED 32 BITS. A car is four metres across;
 *   sixteen bits over its own bounding box is a sixteenth of a millimetre,
 *   which is finer than the print. Normals are the one place quantisation
 *   shows — a clearcoat is a mirror and a mirror shows a stepped normal as a
 *   band — so they get sixteen bits too, not eight: 0.002 degrees, invisible.
 *   Eight-bit normals are 0.45 degrees and would put the banding back that
 *   the analytic-normal feed exists to remove.
 *
 *   MATERIAL IS A PROPERTY OF THE CELL. The photograph stores a float per
 *   VERTEX; every vertex of a cell has the same one. One byte per cell.
 *
 *   npx tsx scripts/build-app.ts [res]
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { load } from "@car/history";
import { computeQuilt } from "@car/frame";
import { tessellateQuilt, tangentField } from "@car/surface";
import { meshQuilt } from "@car/mesh";
import type { CarDocument, Id } from "@car/schema";
import { finishOf, type Finish } from "@car/skin";

const RES = Number(process.argv[2] ?? 16);

const CARS = [
  { file: "e90-m3.car.json", label: "BMW E90 M3", note: "LCI sedan · 4580 mm · front V8", paint: undefined },
  { file: "mclaren-f1.car.json", label: "McLaren F1", note: "1992 · 4287 mm · mid V12", paint: undefined },
  { file: "etype-s1-fhc.car.json", label: "Jaguar E-Type", note: "S1 FHC · 4453 mm · straight six", paint: undefined },
  { file: "mx5-na.car.json", label: "Mazda MX-5", note: "NA · 3970 mm · front four", paint: undefined },
  { file: "panoramic-p1.car.json", label: "Panoramic P1", note: "the first car · 80 cells", paint: "#8d1b24" },
] as const;

const CLASS_INDEX: Record<string, number> = {
  skin: 0, structure: 1, glazing: 2, trim: 3, tyre: 4, wheel: 5,
};
const hexToRgb = (h: string): [number, number, number] => {
  const v = parseInt(h.replace("#", ""), 16);
  return [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255];
};
const masterOf = (id: string): Id => (id.endsWith("~m") ? id.slice(0, -2) : id) as Id;
const b64 = (a: ArrayBufferView): string =>
  Buffer.from(a.buffer, a.byteOffset, a.byteLength).toString("base64");

function buildCar(spec: (typeof CARS)[number]) {
  const doc = JSON.parse(
    readFileSync(new URL(`../cars/${spec.file}`, import.meta.url), "utf8"),
  ) as CarDocument;
  const state = load(doc).state;
  const quilt = computeQuilt(state);
  const cross = tangentField(quilt, { order: 2 });
  const mesh = tessellateQuilt(quilt, RES, cross);

  // The plate under the car quotes OVERALL, and overall has to be the same
  // number the build report quotes or the page contradicts itself. The render
  // feed is a regular grid per cell and the print mesh is not, so their
  // bounding boxes differ by a few millimetres on a coarse body — the P1 reads
  // 2022 wide on the feed and 2004 on the print. So take the dimensions from
  // the print, which is what the report measures.
  const print = meshQuilt(quilt, { cross });
  const plo = [Infinity, Infinity, Infinity], phi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < print.positions.length; i += 3) for (let k = 0; k < 3; k++) {
    plo[k] = Math.min(plo[k]!, print.positions[i + k]!);
    phi[k] = Math.max(phi[k]!, print.positions[i + k]!);
  }
  const overall = [phi[0]! - plo[0]!, phi[1]! - plo[1]!, phi[2]! - plo[2]!]
    .map((v) => Math.round(v));

  const pos = Float64Array.from(mesh.positions);
  let minZ = Infinity;
  for (let i = 2; i < pos.length; i += 3) minZ = Math.min(minZ, pos[i]!);
  for (let i = 2; i < pos.length; i += 3) pos[i] = pos[i]! - minZ;

  const nCells = mesh.ranges.length;
  const vertsPerCell = (RES + 1) * (RES + 1);
  const idxPerCell = 6 * RES * RES;

  // The claim that lets the index buffer go: rebuild it and demand equality.
  {
    const rebuilt = new Uint32Array(nCells * idxPerCell);
    let c = 0;
    for (let ci = 0; ci < nCells; ci++) {
      const vB = ci * vertsPerCell;
      for (let j = 0; j < RES; j++) for (let i = 0; i < RES; i++) {
        const a = vB + j * (RES + 1) + i, d = vB + (j + 1) * (RES + 1) + i + 1;
        rebuilt[c++] = a; rebuilt[c++] = a + 1; rebuilt[c++] = d;
        rebuilt[c++] = a; rebuilt[c++] = d; rebuilt[c++] = d - 1;
      }
    }
    if (rebuilt.length !== mesh.indices.length)
      throw new Error(`${spec.label}: index count ${mesh.indices.length} vs ${rebuilt.length}`);
    for (let i = 0; i < rebuilt.length; i++)
      if (rebuilt[i] !== mesh.indices[i])
        throw new Error(`${spec.label}: index ${i} is ${mesh.indices[i]}, rebuilt ${rebuilt[i]}`);
  }

  // ── shutline distance, exactly as the photograph computes it ─────────────
  const byId = new Map(quilt.cells.map((c) => [c.id, c] as const));
  const gapDist = new Float64Array(pos.length / 3).fill(1e4);
  {
    const at = (base: number, i: number, j: number): number => (base + j * (RES + 1) + i) * 3;
    const dist = (a: number, b: number): number =>
      Math.hypot(pos[a]! - pos[b]!, pos[a + 1]! - pos[b + 1]!, pos[a + 2]! - pos[b + 2]!);
    for (let ci = 0; ci < nCells; ci++) {
      const cell = byId.get(mesh.ranges[ci]!.id);
      if (!cell) continue;
      const base = ci * vertsPerCell;
      const gapped = cell.sides.map((sd) => quilt.gaps.has(sd.curveId));
      if (!gapped.some(Boolean)) continue;
      for (let j = 0; j <= RES; j++) for (let i = 0; i <= RES; i++) {
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

  // ── palette, one slot per distinct material ─────────────────────────────
  const paint = spec.paint ?? "#8d1b24";
  const palette: { name: string; rgb: [number, number, number]; finish: Finish }[] = [
    { name: "paint", rgb: hexToRgb(paint), finish: finishOf("Classic Red") },
  ];
  const slotOf = new Map<string, number>();
  const matCell = new Uint8Array(nCells);
  for (let ci = 0; ci < nCells; ci++) {
    const cell = state.cells.get(masterOf(mesh.ranges[ci]!.id));
    const mat = cell?.materialId === undefined ? undefined : state.materials.get(cell.materialId);
    if (!mat) continue;
    const key = `${mat.name}|${mat.color}`;
    let slot = slotOf.get(key);
    if (slot === undefined) {
      slot = palette.length;
      palette.push({ name: mat.name, rgb: hexToRgb(mat.color), finish: finishOf(mat.name, mat.color) });
      slotOf.set(key, slot);
    }
    matCell[ci] = slot;
  }
  if (palette.length > 16) throw new Error(`${spec.label}: ${palette.length} materials; the shader holds 16`);

  // ── contact shadow, the body's own footprint ────────────────────────────
  const FW = 192, FH = 96;
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < pos.length; i += 3) for (let k = 0; k < 3; k++) {
    lo[k] = Math.min(lo[k]!, pos[i + k]!); hi[k] = Math.max(hi[k]!, pos[i + k]!);
  }
  const pad = 260;
  const fx0 = lo[0]! - pad, fx1 = hi[0]! + pad, fy0 = lo[1]! - pad, fy1 = hi[1]! + pad;
  const foot = new Uint8Array(FW * FH);
  for (let ci = 0; ci < nCells; ci++) {
    const vB = ci * vertsPerCell;
    for (let j = 0; j < RES; j++) for (let i = 0; i < RES; i++) {
      const quad = [vB + j * (RES + 1) + i, vB + j * (RES + 1) + i + 1,
        vB + (j + 1) * (RES + 1) + i + 1, vB + (j + 1) * (RES + 1) + i];
      let zs = 0; const px: number[] = [], py: number[] = [];
      for (const v of quad) {
        px.push(((pos[v * 3]! - fx0) / (fx1 - fx0)) * (FW - 1));
        py.push(((pos[v * 3 + 1]! - fy0) / (fy1 - fy0)) * (FH - 1));
        zs += pos[v * 3 + 2]!;
      }
      const near = Math.max(0, 1 - zs / 4 / 900);
      const v = Math.round(255 * Math.min(1, 0.25 + near));
      const x0 = Math.max(0, Math.floor(Math.min(...px))), x1 = Math.min(FW - 1, Math.ceil(Math.max(...px)));
      const y0 = Math.max(0, Math.floor(Math.min(...py))), y1 = Math.min(FH - 1, Math.ceil(Math.max(...py)));
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const p = y * FW + x;
        if (v > foot[p]!) foot[p] = v;
      }
    }
  }

  // ── quantise ────────────────────────────────────────────────────────────
  const nVerts = pos.length / 3;
  const qpos = new Uint16Array(nVerts * 3);
  const span = [hi[0]! - lo[0]!, hi[1]! - lo[1]!, hi[2]! - lo[2]!].map((s) => (s > 0 ? s : 1));
  for (let i = 0; i < nVerts; i++) for (let k = 0; k < 3; k++)
    qpos[i * 3 + k] = Math.round(((pos[i * 3 + k]! - lo[k]!) / span[k]!) * 65535);
  const qnrm = new Int16Array(nVerts * 3);
  for (let i = 0; i < nVerts * 3; i++)
    qnrm[i] = Math.max(-32767, Math.min(32767, Math.round(mesh.normals[i]! * 32767)));
  const qgap = new Uint8Array(nVerts);
  for (let i = 0; i < nVerts; i++) qgap[i] = Math.min(254, Math.round(gapDist[i]! * 10));

  // What the quantisation actually cost, measured rather than asserted.
  let worstPos = 0, worstNrm = 0;
  for (let i = 0; i < nVerts * 3; i++) {
    const k = i % 3;
    const back = lo[k]! + (qpos[i]! / 65535) * span[k]!;
    worstPos = Math.max(worstPos, Math.abs(back - pos[i]!));
    worstNrm = Math.max(worstNrm, Math.abs(qnrm[i]! / 32767 - mesh.normals[i]!));
  }

  return {
    car: {
      name: doc.name ?? spec.label,
      label: spec.label,
      note: spec.note,
      res: RES,
      cells: nCells,
      paint,
      materials: palette.map((m) => ({
        name: m.name, rgb: m.rgb,
        rough: m.finish.rough, metal: m.finish.metal, coat: m.finish.coat,
        opacity: m.finish.opacity, klass: CLASS_INDEX[m.finish.surfaceClass],
      })),
      qlo: lo, qspan: span,
      pos: b64(qpos), nrm: b64(qnrm), gap: b64(qgap), mat: b64(matCell),
      gapWidth: 4.5,
      footprint: { data: b64(foot), w: FW, h: FH, x0: fx0, x1: fx1, y0: fy0, y1: fy1 },
      bounds: { lo: [lo[0], lo[1], 0], hi: [hi[0], hi[1], hi[2]] },
      dims: overall,
      triangles: nCells * 2 * RES * RES,
    },
    stat: `${spec.label}: ${nCells} cells · ${(nCells * 2 * RES * RES).toLocaleString("en-GB")} tris · ` +
      `quantised to ${worstPos.toFixed(3)} mm, ${(Math.asin(Math.min(1, worstNrm)) * 180 / Math.PI).toFixed(4)}°`,
  };
}

const built = CARS.map(buildCar);
const payload = { res: RES, cars: built.map((b) => b.car) };
const json = JSON.stringify(payload);

const template = readFileSync(new URL("../apps/app/template.html", import.meta.url), "utf8");
if (!template.includes("__PAYLOAD__")) throw new Error("app template has no payload slot");
if (!template.includes("__REPORT__")) throw new Error("app template has no report slot");
const report = readFileSync(new URL("../apps/app/report.html", import.meta.url), "utf8");
mkdirSync(new URL("../apps/app", import.meta.url), { recursive: true });
const out = template.replace("__REPORT__", report).replace("__PAYLOAD__", json);
writeFileSync(new URL("../apps/app/panoramic.html", import.meta.url), out);

for (const b of built) console.log("  " + b.stat);
console.log(`\n  payload ${(json.length / 1024 / 1024).toFixed(2)} MB · page ${(out.length / 1024 / 1024).toFixed(2)} MB`);
console.log("  wrote apps/app/panoramic.html\n");
