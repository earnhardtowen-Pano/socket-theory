/**
 * The viewer payload — everything the surfacing instrument needs, in one file.
 *
 * WHAT IS SHIPPED AND WHAT IS COMPUTED IN THE PAGE. Anything that follows from
 * a vertex normal is computed live, because then it can be DRAGGED: the
 * isophote light and the draft pull are directions, and a lens you can turn is
 * worth ten you can only look at. Anything that needs the mesh's neighbourhood
 * — curvature, how fast the normal turns — is computed here and shipped as a
 * field, because a browser should not be running a cotangent Laplacian.
 *
 * The analytic tessellation, not the print mesh. Per-patch normals with nothing
 * shared between cells: a render mesh splits its normals at the crease angle,
 * so a lens drawn on those would show the smoothing groups instead of the body.
 *
 * Binary, base64'd. The alternative is a JSON array of two hundred thousand
 * numbers, which is four times the size and slower to parse than the geometry
 * is to draw.
 *
 *   npx tsx scripts/export-viewer.ts [out.json]
 */

import { writeFileSync, readFileSync } from "node:fs";
import { load } from "@car/history";
import { computeQuilt } from "@car/frame";
import {
  boundaryCoonsNormal, bySize, cellBoundary, continuityProbe, curvatureJoinProbe,
  fieldDisplacement, networkObstruction, panelsOf, quiltAdjacency, sideParamOf,
  tangentField, tessellateQuilt, uvOnSide,
} from "@car/surface";
import { curvatureMap, draftMap, isophoteField, isophoteGradient, undercutFraction } from "@car/skin";
import { cross3, dot3, len3, natan2 } from "@car/num";
import type { CarDocument, Id } from "@car/schema";

const DENSITY = 14;

const doc = JSON.parse(
  readFileSync(new URL("../cars/panoramic-p1.car.json", import.meta.url), "utf8"),
) as CarDocument;
const quilt = computeQuilt(load(doc).state);
const cross = tangentField(quilt, { order: 2 });
const adj = quiltAdjacency(quilt);
const feed = tessellateQuilt(quilt, DENSITY, cross);
const vertexCount = feed.positions.length / 3;

const b64 = (a: Float32Array | Uint32Array | Uint16Array | Uint8Array): string =>
  Buffer.from(a.buffer, a.byteOffset, a.byteLength).toString("base64");

// ── per-vertex fields the page cannot derive from a normal ─────────────────
const curv = curvatureMap({ positions: feed.positions, indices: feed.indices });
const iso = isophoteField({ normals: feed.normals, indices: feed.indices }, { bands: 16 });
const grad = isophoteGradient({ normals: feed.normals, indices: feed.indices }, iso);

/** Quantise a field to a byte against its own 2nd–98th percentile, so a single
 *  outlier cannot flatten the whole reading. */
function quantise(src: Float64Array, valid?: Uint8Array): {
  data: Uint8Array; lo: number; hi: number;
} {
  const ok: number[] = [];
  for (let i = 0; i < src.length; i++) {
    if (valid && !valid[i]) continue;
    if (Number.isFinite(src[i]!)) ok.push(src[i]!);
  }
  ok.sort((a, b) => a - b);
  const lo = ok.length ? ok[Math.floor(ok.length * 0.02)]! : 0;
  const hi = ok.length ? ok[Math.floor(ok.length * 0.98)]! : 1;
  const span = hi - lo || 1;
  const out = new Uint8Array(src.length);
  for (let i = 0; i < src.length; i++) {
    const v = Number.isFinite(src[i]!) ? (src[i]! - lo) / span : 0;
    out[i] = Math.max(0, Math.min(255, Math.round(v * 255)));
  }
  return { data: out, lo, hi };
}

const meanAbs = new Float64Array(vertexCount);
for (let i = 0; i < vertexCount; i++) meanAbs[i] = Math.abs(curv.mean[i]!);
const qCurv = quantise(meanAbs, curv.valid);
const qGrad = quantise(grad);

// Displacement: how far the correction moved this part of the body. Measured
// per cell, so every vertex of a cell carries its cell's figure.
const g1only = tangentField(quilt, { order: 1 });
const phiMoved = fieldDisplacement(quilt, { cross: g1only });
const psiMoved = fieldDisplacement(quilt, { cross, against: g1only });
const cellOrder = [...quilt.cells].map((c) => c.id).sort();
const cellIndex = new Map<Id, number>(cellOrder.map((id, i) => [id, i]));
const phiByCell = new Float64Array(cellOrder.length);
const psiByCell = new Float64Array(cellOrder.length);
for (const c of phiMoved.cells) phiByCell[cellIndex.get(c.cellId)!] = c.mm;
for (const c of psiMoved.cells) psiByCell[cellIndex.get(c.cellId)!] = c.mm;

// Which cell and which panel each vertex belongs to.
const panels = panelsOf(quilt, adj);
// Renumber largest-first, so the viewer can give the main stamping the quiet
// colour and spend its accents on the small pieces.
const panelOfCell = new Map<Id, number>();
bySize(panels).forEach((p, rank) => { for (const id of p.cells) panelOfCell.set(id, rank); });
const vertCell = new Uint16Array(vertexCount);
const vertPanel = new Uint8Array(vertexCount);
for (const r of feed.ranges) {
  const ci = cellIndex.get(r.id) ?? 0;
  const pi = panelOfCell.get(r.id) ?? 0;
  for (let k = r.start; k < r.start + r.count; k++) {
    const v = feed.indices[k]!;
    vertCell[v] = ci;
    vertPanel[v] = pi;
  }
}

// ── the seams, as polylines with what they are and how badly they break ────
const SEAM_STATIONS = 41;
const seamKind = new Map<string, string>();
const keyOf = (e: { a: { cellId: Id; k: number }; b: { cellId: Id; k: number }; lo: number }): string =>
  `${e.a.cellId}#${e.a.k}|${e.b.cellId}#${e.b.k}@${e.lo}`;
for (const s of panels.seams) seamKind.set(keyOf(s.edge), s.kind);

const seamPos: number[] = [];
const seamMeta: { kind: string; start: number; count: number; worstBare: number; worstFixed: number }[] = [];
const boundaries = new Map<Id, ReturnType<typeof cellBoundary>>();
const bOf = (id: Id, c?: typeof cross): ReturnType<typeof cellBoundary> => {
  const key = `${id}${c ? "+" : ""}` as Id;
  let hit = boundaries.get(key);
  if (!hit) {
    hit = cellBoundary(quilt.cells.find((x) => x.id === id)!, quilt, c);
    boundaries.set(key, hit);
  }
  return hit;
};
const angle = (p: readonly number[], q: readonly number[]): number =>
  (natan2(len3(cross3(p as never, q as never)), dot3(p as never, q as never)) * 180) / Math.PI;

for (const e of adj.edges) {
  const start = seamPos.length / 3;
  let worstBare = 0, worstFixed = 0;
  for (let m = 0; m < SEAM_STATIONS; m++) {
    const f = m / (SEAM_STATIONS - 1);
    const t = e.lo + (e.hi - e.lo) * f;
    const sideA = adj.boundaries.get(e.a.cellId)!.sides[e.a.k]!;
    const p = sideA.atCurveParam(t);
    seamPos.push(p[0], p[1], p[2]);
    if (m > 0 && m < SEAM_STATIONS - 1) {
      const [ua, va] = uvOnSide(e.a.k, sideParamOf(sideA, t));
      const sB = adj.boundaries.get(e.b.cellId)!.sides[e.b.k]!;
      const [ub, vb] = uvOnSide(e.b.k, sideParamOf(sB, t));
      for (const [which, c] of [["bare", undefined], ["fixed", cross]] as const) {
        const nA = boundaryCoonsNormal(bOf(e.a.cellId, c), ua, va);
        const nB = boundaryCoonsNormal(bOf(e.b.cellId, c), ub, vb);
        if (len3(nA) === 0 || len3(nB) === 0) continue;
        const d = angle(nA, nB);
        if (which === "bare") worstBare = Math.max(worstBare, d);
        else worstFixed = Math.max(worstFixed, d);
      }
    }
  }
  seamMeta.push({
    kind: seamKind.get(keyOf(e)) ?? "smooth",
    start, count: SEAM_STATIONS, worstBare, worstFixed,
  });
}

// ── the readings ───────────────────────────────────────────────────────────
const g1 = continuityProbe(quilt, { cross });
const g1bare = continuityProbe(quilt);
const g2 = curvatureJoinProbe(quilt, { cross });
const net = networkObstruction(quilt);
const draft = draftMap(
  { normals: feed.normals, positions: feed.positions, indices: feed.indices },
  { pull: [0, 0, 1], minDraftDeg: 3 },
);

const payload = {
  car: "Panoramic P1",
  vertexCount,
  triangleCount: feed.indices.length / 3,
  cells: quilt.cells.length,
  cellNames: cellOrder,
  density: DENSITY,
  positions: b64(Float32Array.from(feed.positions)),
  normals: b64(Float32Array.from(feed.normals)),
  indices: b64(Uint32Array.from(feed.indices)),
  vertCell: b64(vertCell),
  vertPanel: b64(vertPanel),
  fields: {
    curvature: { data: b64(qCurv.data), lo: qCurv.lo, hi: qCurv.hi, unit: "1/mm", label: "mean curvature" },
    highlight: { data: b64(qGrad.data), lo: qGrad.lo, hi: qGrad.hi, unit: "", label: "how fast the normal turns" },
  },
  perCell: {
    phiMm: Array.from(phiByCell, (v) => Math.round(v * 100) / 100),
    psiMm: Array.from(psiByCell, (v) => Math.round(v * 100) / 100),
  },
  seams: { positions: b64(Float32Array.from(seamPos)), meta: seamMeta },
  panels: bySize(panels).map((p, rank) => ({ index: rank, cells: p.cells.length, shutlines: p.shutlines, features: p.featureSeams })),
  readings: {
    g1Joins: g1.g1Joins, joins: g1.joins,
    g1Median: g1.medianDeg, g1Worst: g1.worstDeg,
    g1BareJoins: g1bare.g1Joins, g1BareMedian: g1bare.medianDeg, g1BareWorst: g1bare.worstDeg,
    g2Joins: g2.g2Joins, g2MedianRel: g2.medianRelative, g2P90Rel: g2.p90Relative,
    g2MedianGap: g2.medianGap, g2WorstGap: g2.worstGap,
    corners: net.corners, cleanCorners: net.cleanCorners, cornerWorst: net.worstDeg,
    creasedSeams: panels.features, shutlineSeams: panels.shutlines, smoothSeams: panels.smooth,
    panelCount: panels.panels.length,
    phiMedian: phiMoved.median, phiP90: phiMoved.p90, phiWorst: phiMoved.worst,
    psiMedian: psiMoved.median, psiP90: psiMoved.p90, psiWorst: psiMoved.worst,
    supportFraction: undercutFraction(draft),
    fitWorstMm: cross.stats.fitWorstAbs, fitSpans: cross.stats.worstSpans,
  },
};

const json = JSON.stringify(payload);
const out = process.argv[2] ?? "../apps/viewer-payload.json";
writeFileSync(new URL(out, import.meta.url), json);
console.log(`\n${vertexCount.toLocaleString("en-GB")} vertices · ${(feed.indices.length / 3).toLocaleString("en-GB")} triangles · ` +
  `${adj.edges.length} seams · ${(json.length / 1024 / 1024).toFixed(2)} MB`);
console.log(`wrote ${out}`);

// The bench is one file on purpose: no server, no build step, no fetch — the
// whole body travels inside the page. Both outputs are generated, so neither
// is committed; this script is the source of both.
const template = readFileSync(new URL("../apps/bench/template.html", import.meta.url), "utf8");
if (!template.includes("__PAYLOAD__")) throw new Error("bench template has no payload slot");
const page = template.replace("__PAYLOAD__", json);
writeFileSync(new URL("../apps/bench/bench.html", import.meta.url), page);
console.log(`wrote ../apps/bench/bench.html · ${(page.length / 1024 / 1024).toFixed(2)} MB\n`);
