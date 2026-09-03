/**
 * The line scaffold, and the fairing on it.
 *
 * A body in this tool is a network of curves and the surface between them. Every
 * render so far has shown the surface; this shows the SCAFFOLD — every curve, in
 * plan and in side — and on top of it the FAIRING: for each softened feature
 * line, the band either side of it that the rounding actually occupies, drawn to
 * scale in millimetres.
 *
 * WHAT THE BAND IS. A blend here does not cut the edge out and sew an arc into
 * the hole; the edge stays exactly on its curve and the turn is packed into a
 * band whose width sets the radius. So the band is the thing to look at. It is
 * measured, not drawn from the ask: for each station the script walks the built
 * surface outward from the curve until the correction has died, and the ribbon's
 * edge is where it dies. Where the ribbon is narrow the line is crisp; where it
 * opens the line is soft; where it swallows the panel the line is gone.
 *
 * Curves are drawn by what the document says they are, and the four states are
 * the whole of the vocabulary:
 *
 *   plain      no mark — the field blends across it and there is no line
 *   gap        a shutline: two panels stop and the eye sees daylight
 *   crease     a knife edge, and until amendment A12 the only line available
 *   softened   a crease with a radius, drawn with its fairing band
 *
 *   npx tsx scripts/line-scaffold.ts [car.json] [out.svg]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { load } from "@car/history";
import { computeQuilt } from "@car/frame";
import {
  blendProbe, cellBoundary, boundaryCoonsPoint, partnerBand, quiltAdjacency,
  tangentField, uvOnSide, sideParamOf,
} from "@car/surface";
import { evalChain } from "@car/num";
import { finishOf } from "@car/skin";
import type { CarDocument, Id, Pt3 } from "@car/schema";

const carPath = process.argv[2] ?? "../cars/mclaren-f1.car.json";
const outPath = process.argv[3] ?? "../../line-scaffold.svg";

const doc = JSON.parse(readFileSync(new URL(carPath, import.meta.url), "utf8")) as CarDocument;
const state = load(doc).state;
const quilt = computeQuilt(state);
const adj = quiltAdjacency(quilt);
const cross = tangentField(quilt, { adjacency: adj, order: 2 });

// ── the BODY's scaffold, not the car's ─────────────────────────────────────
// A chassis member is a box and a wheel is a cylinder, and both are made of
// curves the same way the body is — so the first version of this drawing had
// 727 knife edges in it, of which about forty were the car and the rest were
// the corners of tubes. The material each cell carries already says which is
// which: skin, trim and glazing are the body, and everything else is what the
// body is wrapped around.
const BODY = new Set<Id>();
for (const cell of quilt.cells) {
  const master = (cell.id.endsWith("~m") ? cell.id.slice(0, -2) : cell.id) as Id;
  const rec = state.cells.get(master);
  const mat = rec?.materialId === undefined ? undefined : state.materials.get(rec.materialId);
  const klass = mat ? finishOf(mat.name, mat.color).surfaceClass : "skin";
  if (klass !== "skin" && klass !== "trim" && klass !== "glazing") continue;
  for (const sd of cell.sides) BODY.add(sd.curveId as Id);
}

// ── what each curve is ─────────────────────────────────────────────────────
type Kind = "plain" | "gap" | "crease" | "soft";
const kindOf = (id: Id): Kind =>
  quilt.softening.has(id) ? "soft" : quilt.gaps.has(id) ? "gap" : quilt.creases.has(id) ? "crease" : "plain";
const bodyCurves = (): Id[] => [...quilt.curves.keys()].filter((id) => BODY.has(id as Id)) as Id[];

const SAMPLES = 48;
const polyOf = (id: Id): Pt3[] => {
  const chain = quilt.curves.get(id);
  if (!chain) return [];
  const out: Pt3[] = [];
  for (let i = 0; i <= SAMPLES; i++) out.push(evalChain(chain, i / SAMPLES));
  return out;
};

// ── the fairing band, measured off the built surface ───────────────────────
// For each owner of a softened edge, walk outward from the curve to where the
// correction dies and record the point. The ribbon between the two is the roll.
const boundaries = new Map<Id, ReturnType<typeof cellBoundary>>();
const boundaryOf = (cellId: Id) => {
  const hit = boundaries.get(cellId);
  if (hit) return hit;
  const cell = quilt.cells.find((c) => c.id === cellId);
  if (!cell) return null;
  const b = cellBoundary(cell, quilt, cross);
  boundaries.set(cellId, b);
  return b;
};
const uvInward = (k: number, s: number, xi: number): [number, number] =>
  k === 0 ? [s, xi] : k === 1 ? [1 - xi, s] : k === 2 ? [1 - s, 1 - xi] : [xi, 1 - s];

interface Ribbon { a: Pt3[]; b: Pt3[]; }
const ribbons: Ribbon[] = [];
const STATIONS = 24;
for (const e of adj.edges) {
  if (!quilt.softening.has(e.curveId)) continue;
  const bA = boundaryOf(e.a.cellId), bB = boundaryOf(e.b.cellId);
  if (!bA || !bB) continue;
  const a: Pt3[] = [], b: Pt3[] = [];
  for (let m = 0; m <= STATIONS; m++) {
    const t = e.lo + ((e.hi - e.lo) * m) / STATIONS;
    const walk = (bd: NonNullable<ReturnType<typeof boundaryOf>>, cellId: Id, k: number): Pt3 | null => {
      const s = sideParamOf(bd.sides[k]!, t);
      if (s < 0 || s > 1) return null;
      const band = cross.band(cellId, k);
      if (band <= 0) return null;
      // Where the correction actually dies: the tight band when the mix is all
      // tight, opening toward the compact partner as the mix softens.
      const mix = cross.tightShare(cellId, k, s);
      const reach = Math.min(0.99, band + (partnerBand(band) - band) * (1 - mix));
      const [u, v] = uvInward(k, s, reach);
      return boundaryCoonsPoint(bd, u, v);
    };
    const pa = walk(bA, e.a.cellId, e.a.k);
    const pb = walk(bB, e.b.cellId, e.b.k);
    if (pa && pb) { a.push(pa); b.push(pb); }
  }
  if (a.length > 2) ribbons.push({ a, b });
}

// ── the two views ──────────────────────────────────────────────────────────
let lo: Pt3 = [Infinity, Infinity, Infinity], hi: Pt3 = [-Infinity, -Infinity, -Infinity];
for (const id of bodyCurves()) {
  for (const p of polyOf(id)) {
    for (let k = 0; k < 3; k++) {
      lo[k] = Math.min(lo[k]!, p[k]!); hi[k] = Math.max(hi[k]!, p[k]!);
    }
  }
}
const LEN = hi[0] - lo[0], WID = hi[1] - lo[1], HGT = hi[2] - lo[2];

const PAD = 46, GAP = 40;
const SCALE = 1360 / LEN;
const W = LEN * SCALE + PAD * 2;
const sideH = HGT * SCALE, planH = WID * SCALE;
const H = PAD * 2 + sideH + GAP + planH + 126;
const sideTop = PAD + 30;
const planTop = sideTop + sideH + GAP + 40;

/** side: x right, z up. plan: x right, y up (mirrored so +y is up). */
const px = (p: Pt3): number => PAD + (p[0] - lo[0]) * SCALE;
const pySide = (p: Pt3): number => sideTop + (hi[2] - p[2]) * SCALE;
const pyPlan = (p: Pt3): number => planTop + (hi[1] - p[1]) * SCALE;

const path = (pts: Pt3[], y: (p: Pt3) => number): string =>
  pts.map((p, i) => `${i === 0 ? "M" : "L"}${px(p).toFixed(1)} ${y(p).toFixed(1)}`).join("");

const STYLE: Record<Kind, { stroke: string; w: number; dash?: string }> = {
  plain: { stroke: "#c9ccd2", w: 0.7 },
  gap: { stroke: "#8f97a3", w: 1.0, dash: "5 4" },
  crease: { stroke: "#1d2733", w: 1.7 },
  soft: { stroke: "#d2571b", w: 2.2 },
};
const ORDER: Kind[] = ["plain", "gap", "crease", "soft"];

const layer = (y: (p: Pt3) => number): string => {
  const out: string[] = [];
  for (const kind of ORDER) {
    const st = STYLE[kind];
    const ds: string[] = [];
    for (const id of bodyCurves()) {
      if (kindOf(id) !== kind) continue;
      const poly = polyOf(id);
      if (poly.length > 1) ds.push(path(poly, y));
    }
    if (ds.length === 0) continue;
    out.push(`<path d="${ds.join("")}" fill="none" stroke="${st.stroke}" stroke-width="${st.w}"` +
      (st.dash ? ` stroke-dasharray="${st.dash}"` : "") + ` stroke-linecap="round"/>`);
  }
  return out.join("\n");
};

const ribbonLayer = (y: (p: Pt3) => number): string =>
  ribbons.map((r) => {
    const fwd = r.a.map((p, i) => `${i === 0 ? "M" : "L"}${px(p).toFixed(1)} ${y(p).toFixed(1)}`).join("");
    const back = [...r.b].reverse()
      .map((p) => `L${px(p).toFixed(1)} ${y(p).toFixed(1)}`).join("");
    return `<path d="${fwd}${back}Z" fill="#d2571b" fill-opacity="0.30" stroke="none"/>`;
  }).join("\n");

// ── the numbers, measured ──────────────────────────────────────────────────
const bl = blendProbe(quilt, { adjacency: adj, cross, stations: 5, samples: 60 });
const counts = { plain: 0, gap: 0, crease: 0, soft: 0 };
for (const id of bodyCurves()) counts[kindOf(id)]++;
const asks = [...new Set(cross.blends.map((b) =>
  b.asked.end === undefined || b.asked.end === b.asked.start
    ? `R${b.asked.start}` : `R${b.asked.start}→${b.asked.end}`))].join(", ");

const key = [
  ["plain", `${counts.plain} unmarked — the field blends across, no line`],
  ["gap", `${counts.gap} panel gaps — a shutline, not a fold`],
  ["crease", `${counts.crease} knife edges — the only line this tool had before A12`],
  ["soft", `${counts.soft} faired — ${asks}, band drawn to scale`],
] as const;

const legend = key.map(([k, label], i) => {
  const yy = H - 84 + i * 19;
  const st = STYLE[k as Kind];
  return `<line x1="${PAD}" y1="${yy}" x2="${PAD + 34}" y2="${yy}" stroke="${st.stroke}" ` +
    `stroke-width="${st.w + 0.6}"${st.dash ? ` stroke-dasharray="${st.dash}"` : ""}/>` +
    `<text x="${PAD + 44}" y="${yy + 4}" font-size="12.5" fill="#3a4552">${label}</text>`;
}).join("\n");

const title = doc.name && doc.name.length > 0 ? doc.name : "McLaren F1";
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W.toFixed(0)}" height="${H.toFixed(0)}" viewBox="0 0 ${W.toFixed(0)} ${H.toFixed(0)}" font-family="ui-sans-serif, -apple-system, Segoe UI, Roboto, sans-serif">
<rect width="100%" height="100%" fill="#fbfbfa"/>
<text x="${PAD}" y="${PAD - 8}" font-size="15" font-weight="600" fill="#1d2733">${title} — line scaffold and fairing</text>
<text x="${W - PAD}" y="${PAD - 8}" font-size="12" fill="#6a7481" text-anchor="end">${bodyCurves().length} body curves · ${quilt.cells.length} cells · radius delivered within ${(bl.medianRelative * 100).toFixed(0)}% median over ${bl.live} stations</text>
<text x="${PAD}" y="${sideTop - 10}" font-size="11.5" fill="#8f97a3" letter-spacing="0.06em">SIDE</text>
${ribbonLayer(pySide)}
${layer(pySide)}
<text x="${PAD}" y="${planTop - 10}" font-size="11.5" fill="#8f97a3" letter-spacing="0.06em">PLAN</text>
${ribbonLayer(pyPlan)}
${layer(pyPlan)}
${legend}
</svg>
`;

writeFileSync(new URL(outPath, import.meta.url), svg);
console.log(`\n${title} — ${bodyCurves().length} body curves: ` +
  `${counts.plain} plain, ${counts.gap} gap, ${counts.crease} crease, ${counts.soft} faired`);
console.log(`  fairing bands drawn from the built surface at ${ribbons.length} seams`);
console.log(`  radius delivered within ${(bl.medianRelative * 100).toFixed(0)}% median, ` +
  `${bl.live} live stations, ${bl.washedOut} washed out\n`);
console.log(`wrote ${outPath}\n`);
