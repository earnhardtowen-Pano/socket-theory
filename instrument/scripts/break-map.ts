/**
 * Every break on the body, painted on the seams that carry it.
 *
 * The continuity probe returns one number per join. This asks the same
 * question at three hundred stations along every shared curve and draws the
 * answer where it happens, which is the only way to see that a defect lives in
 * a band a twentieth of an edge wide next to a corner rather than spread along
 * the seam.
 *
 * Three panels, one scale: the bare Coons blend, the same quilt with the
 * tangent field, and the creased seams the field is right to leave alone. The
 * scale is logarithmic from a thousandth of a degree to ninety, because that is
 * the range a car body actually spans.
 *
 *   npx tsx scripts/break-map.ts [outfile.svg]
 *
 * The SVG is one path per station per seam and comes out at about eleven
 * megabytes, so it is gitignored; `shots/break-map.png` beside it is the
 * artefact.
 */

import { writeFileSync, readFileSync } from "node:fs";
import { load } from "@car/history";
import { computeQuilt } from "@car/frame";
import { meshQuilt } from "@car/mesh";
import {
  boundaryCoonsNormal, bySize, cellBoundary, continuityProbe, panelsOf, quiltAdjacency,
  sideParamOf, tangentField, uvOnSide, type CrossPrescription, type SeamKind,
} from "@car/surface";
import { cross3, dot3, len3, natan2 } from "@car/num";
import type { CarDocument, Id, Pt3 } from "@car/schema";

const doc = JSON.parse(
  readFileSync(new URL("../cars/panoramic-p1.car.json", import.meta.url), "utf8"),
) as CarDocument;
const quilt = computeQuilt(load(doc).state);
const field = tangentField(quilt, { order: 2 });
const adj = quiltAdjacency(quilt);
const mesh = meshQuilt(quilt, { baseDensity: 14, cross: field });

/** Defect along one join, at stations that crowd both corners. */
const STATIONS = (() => {
  const out = new Set<number>();
  for (let i = 1; i < 240; i++) out.add(i / 240);
  for (let k = 1; k <= 7; k++) for (const m of [1, 2, 5]) {
    const f = m * Math.pow(10, -k);
    if (f < 0.5) { out.add(f); out.add(1 - f); }
  }
  return [...out].sort((a, b) => a - b);
})();

const panels = panelsOf(quilt, adj);
const kindByEdge = new Map<SharedEdgeKey, SeamKind>();
type SharedEdgeKey = string;
const keyOf = (e: { a: { cellId: Id; k: number }; b: { cellId: Id; k: number }; lo: number }): string =>
  `${e.a.cellId}#${e.a.k}|${e.b.cellId}#${e.b.k}@${e.lo}`;
for (const s of panels.seams) kindByEdge.set(keyOf(s.edge), s.kind);

function seamDefect(cross: CrossPrescription | undefined): {
  pts: Pt3[]; deg: number[]; creased: boolean; kind: SeamKind;
}[] {
  const built = new Map<Id, ReturnType<typeof cellBoundary>>();
  const bOf = (id: Id): ReturnType<typeof cellBoundary> => {
    let h = built.get(id);
    if (!h) {
      h = cellBoundary(quilt.cells.find((c) => c.id === id)!, quilt, cross);
      built.set(id, h);
    }
    return h;
  };
  const out: { pts: Pt3[]; deg: number[]; creased: boolean; kind: SeamKind }[] = [];
  for (const e of adj.edges) {
    const bA = bOf(e.a.cellId), bB = bOf(e.b.cellId);
    const sA = bA.sides[e.a.k]!, sB = bB.sides[e.b.k]!;
    const pts: Pt3[] = [], deg: number[] = [];
    for (const f of STATIONS) {
      const t = e.lo + (e.hi - e.lo) * f;
      const [ua, va] = uvOnSide(e.a.k, sideParamOf(sA, t));
      const [ub, vb] = uvOnSide(e.b.k, sideParamOf(sB, t));
      const nA = boundaryCoonsNormal(bA, ua, va);
      const nB = boundaryCoonsNormal(bB, ub, vb);
      pts.push(sA.atCurveParam(t));
      deg.push(len3(nA) === 0 || len3(nB) === 0 ? 0
        : (natan2(len3(cross3(nA, nB)), dot3(nA, nB)) * 180) / Math.PI);
    }
    out.push({ pts, deg, creased: e.creased, kind: kindByEdge.get(keyOf(e)) ?? "smooth" });
  }
  return out;
}

const bare = seamDefect(undefined);
const fixed = seamDefect(field);

// ── camera ─────────────────────────────────────────────────────────────────
const YAW = (-34 * Math.PI) / 180, PITCH = (20 * Math.PI) / 180;
const project = (p: Pt3): [number, number, number] => {
  const cx = p[0] * Math.cos(YAW) - p[1] * Math.sin(YAW);
  const cy = p[0] * Math.sin(YAW) + p[1] * Math.cos(YAW);
  return [cx, -(cy * Math.sin(PITCH) + p[2] * Math.cos(PITCH)), cy * Math.cos(PITCH) - p[2] * Math.sin(PITCH)];
};

const W = 1180, PH = 330, PAD = 62, HEAD = 118, GAP = 30;
const H = HEAD + 3 * (PH + GAP) + 76;

const vert = (i: number): Pt3 =>
  [mesh.positions[i * 3]!, mesh.positions[i * 3 + 1]!, mesh.positions[i * 3 + 2]!];
const screen = Array.from({ length: mesh.positions.length / 3 }, (_, i) => project(vert(i)));
let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
for (const [x, y] of screen) {
  minX = Math.min(minX, x); maxX = Math.max(maxX, x);
  minY = Math.min(minY, y); maxY = Math.max(maxY, y);
}
const SC = Math.min((W - PAD * 2) / (maxX - minX), (PH - 14) / (maxY - minY));
const OX = PAD + ((W - PAD * 2) - (maxX - minX) * SC) / 2 - minX * SC;

const LO = 1e-3, HI = 90;
const ramp = (d: number): string => {
  if (!(d > LO)) return "#1c6f7a";
  const t = Math.min(1, Math.log10(d / LO) / Math.log10(HI / LO));
  const stops: [number, number, number, number][] = [
    [0, 28, 111, 122], [0.35, 60, 170, 150], [0.62, 235, 165, 45],
    [0.82, 255, 80, 40], [1, 255, 250, 245],
  ];
  let a = stops[0]!, b = stops[stops.length - 1]!;
  for (let i = 1; i < stops.length; i++) if (t <= stops[i]![0]) { a = stops[i - 1]!; b = stops[i]!; break; }
  const f = b[0] === a[0] ? 0 : (t - a[0]) / (b[0] - a[0]);
  const c = (i: number): number => Math.round(a[i]! + (b[i]! - a[i]!) * f);
  return `rgb(${c(1)},${c(2)},${c(3)})`;
};

function bodyPanel(y0: number): string {
  const tris: { d: number; p: string; s: number }[] = [];
  for (let t = 0; t < mesh.indices.length; t += 3) {
    const ia = mesh.indices[t]!, ib = mesh.indices[t + 1]!, ic = mesh.indices[t + 2]!;
    const A = vert(ia), B = vert(ib), C = vert(ic);
    const u: Pt3 = [B[0] - A[0], B[1] - A[1], B[2] - A[2]];
    const v: Pt3 = [C[0] - A[0], C[1] - A[1], C[2] - A[2]];
    const n = cross3(u, v); const L = len3(n) || 1;
    const lit = Math.max(0.05, (n[0] / L) * 0.3 + (n[1] / L) * -0.45 + (n[2] / L) * 0.84);
    const P = [screen[ia]!, screen[ib]!, screen[ic]!];
    tris.push({
      d: (P[0]![2] + P[1]![2] + P[2]![2]) / 3, s: lit,
      p: P.map((q, i) => `${i === 0 ? "M" : "L"}${(OX + q[0] * SC).toFixed(1)},${(y0 + (q[1] - minY) * SC).toFixed(1)}`).join("") + "Z",
    });
  }
  tris.sort((a, b) => a.d - b.d);
  return tris.map((t) => {
    const g = Math.round(14 + t.s * 40);
    return `<path d="${t.p}" fill="rgb(${g},${g},${g + 2})"/>`;
  }).join("");
}

function seams(
  y0: number, data: ReturnType<typeof seamDefect>,
  pick: (s: ReturnType<typeof seamDefect>[number]) => boolean,
  colour: (s: ReturnType<typeof seamDefect>[number], i: number) => string,
  width = 2.4,
): string {
  const parts: string[] = [];
  for (const seam of data) {
    if (!pick(seam)) continue;
    for (let i = 0; i + 1 < seam.pts.length; i++) {
      const a = project(seam.pts[i]!), b = project(seam.pts[i + 1]!);
      parts.push(`<line x1="${(OX + a[0] * SC).toFixed(1)}" y1="${(y0 + (a[1] - minY) * SC).toFixed(1)}" ` +
        `x2="${(OX + b[0] * SC).toFixed(1)}" y2="${(y0 + (b[1] - minY) * SC).toFixed(1)}" ` +
        `stroke="${colour(seam, i)}" stroke-width="${width}" stroke-linecap="round"/>`);
    }
  }
  return parts.join("");
}

/** The three things a seam can be, and they are not interchangeable. */
const SHUT = "rgb(120,215,255)";
const FEATURE = "rgb(245,175,60)";
const SMOOTH = "rgb(60,150,150)";

const before = continuityProbe(quilt);
const after = continuityProbe(quilt, { cross: field });
const cap = (t: string, sub: string, y: number): string =>
  `<text class="cap" x="${PAD}" y="${y}">${t}</text><text class="ax" x="${PAD}" y="${y + 16}">${sub}</text>`;

const legend = ((): string => {
  const x0 = W - PAD - 300, y = H - 40;
  const bar = Array.from({ length: 150 }, (_, i) =>
    `<rect x="${(x0 + i * 2).toFixed(1)}" y="${y - 12}" width="2.2" height="12" fill="${ramp(LO * Math.pow(HI / LO, i / 149))}"/>`).join("");
  const marks = [0.001, 0.01, 0.1, 1, 10, 90].map((v) => {
    const t = Math.log10(v / LO) / Math.log10(HI / LO);
    return `<text class="ax" x="${(x0 + t * 300).toFixed(1)}" y="${y + 13}" text-anchor="middle">${v < 1 ? v : v.toFixed(0)}</text>`;
  }).join("");
  return `${bar}${marks}<text class="ax" x="${x0 - 10}" y="${y - 2}" text-anchor="end">tangent break, degrees</text>`;
})();

const y1 = HEAD, y2 = HEAD + PH + GAP, y3 = HEAD + 2 * (PH + GAP);
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<style>
  text { font-family: ui-monospace, Menlo, monospace; fill: #8f8f88; }
  .t   { fill: #e6e6e0; font-size: 18px; letter-spacing: .26em; text-transform: uppercase; }
  .s   { font-size: 12.5px; letter-spacing: .12em; }
  .cap { font-size: 13px; letter-spacing: .16em; fill: #d8d8d2; }
  .ax  { font-size: 10.5px; letter-spacing: .06em; }
</style>
<rect width="${W}" height="${H}" fill="#08080a"/>
<text class="t" x="${PAD}" y="44">Panoramic P1 · every break, on the seam that carries it</text>
<text class="s" x="${PAD}" y="70">${STATIONS.length} stations per join, crowding both corners to a ten-millionth of an edge</text>
<text class="s" x="${PAD}" y="90">log scale · teal is under a thousandth of a degree · white is ninety</text>
${cap("BARE COONS BLEND", `${before.g1Joins} of ${before.joins} smooth joins under 1° · median ${before.medianDeg.toExponential(1)}° · worst ${before.worstDeg.toFixed(1)}°`, y1 - 14)}
${bodyPanel(y1 + 8)}${seams(y1 + 8, bare, (s) => s.kind === "smooth", (s, i) => ramp(Math.max(s.deg[i]!, s.deg[i + 1]!)))}
${cap("WITH THE TANGENT FIELD", `${after.g1Joins} of ${after.joins} · median ${after.medianDeg.toExponential(1)}° · worst ${after.worstDeg.toExponential(1)}° — corner to corner`, y2 - 14)}
${bodyPanel(y2 + 8)}${seams(y2 + 8, fixed, (s) => s.kind === "smooth", (s, i) => ramp(Math.max(s.deg[i]!, s.deg[i + 1]!)))}
${cap("WHAT EACH SEAM IS", `${panels.panels.length} panels · ${panels.shutlines} shutline seams (blue, a real gap between two pieces) · ` +
  `${panels.features} feature lines (amber, one piece folded) · ${panels.smooth} smooth (teal, must be invisible)`, y3 - 14)}
${bodyPanel(y3 + 8)}${seams(y3 + 8, fixed, (s) => s.kind === "smooth", () => SMOOTH, 1.5)}${seams(y3 + 8, fixed, (s) => s.kind === "feature", () => FEATURE, 2.4)}${seams(y3 + 8, fixed, (s) => s.kind === "shutline", () => SHUT, 3.4)}
${legend}
<text class="ax" x="${PAD}" y="${H - 46}">A break can only survive in the band next to a corner. Nine evenly spaced stations start a tenth of an edge in and never look inside it.</text>
<text class="ax" x="${PAD}" y="${H - 32}">A panel is a connected component of the cell graph with the GAP curves cut. Continuity is judged inside a panel; gap and flush across one. This body is ${panels.panels.length} pieces: ${bySize(panels).map((p) => p.cells.length).join(" + ")} cells.</text>
</svg>
`;

const out = process.argv[2] ?? "../../shots/break-map.svg";
writeFileSync(new URL(out, import.meta.url), svg);
console.log(`\nbare  ${before.g1Joins}/${before.joins} · worst ${before.worstDeg.toFixed(2)}°`);
console.log(`field ${after.g1Joins}/${after.joins} · worst ${after.worstDeg.toExponential(2)}°`);
console.log(`panels ${panels.panels.length} · shutline seams ${panels.shutlines} · feature ${panels.features} · smooth ${panels.smooth}`);
console.log(`wrote ${out}\n`);
