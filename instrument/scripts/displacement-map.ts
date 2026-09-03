/**
 * Where the surfacing moved the body — the picture behind section 2b of the
 * surfacing report.
 *
 * Every continuity probe in this instrument measures agreement at a seam. None
 * of them says where the surface WENT, and a correction can drive every join to
 * machine zero while moving a panel by a hand's width. This paints the
 * difference straight onto the body: two meshes of the same quilt, one bare and
 * one corrected, vertex for vertex — the grids are built from the curves and
 * their trims, so the correction cannot change the topology and the
 * correspondence is exact.
 *
 * Two panels: what the tangent-plane term does, and what the curvature term
 * adds on top of it. The scale is shared so they can be read against each
 * other, and it is LOGARITHMIC, because the interesting fact about this body is
 * that the range spans four orders of magnitude and a linear ramp would show
 * one red cell on a black car.
 *
 *   npx tsx scripts/displacement-map.ts [outfile.svg]
 *
 * The SVG is one path per triangle and comes out at about four megabytes, so it
 * is gitignored; `shots/displacement-map.png` beside it is the artefact.
 */

import { writeFileSync, readFileSync } from "node:fs";
import { load } from "@car/history";
import { computeQuilt } from "@car/frame";
import { meshQuilt } from "@car/mesh";
import { fieldDisplacement, tangentField } from "@car/surface";
import type { CarDocument, Pt3 } from "@car/schema";

const doc = JSON.parse(
  readFileSync(new URL("../cars/panoramic-p1.car.json", import.meta.url), "utf8"),
) as CarDocument;
const quilt = computeQuilt(load(doc).state);

const DENSITY = 16;
const g1 = tangentField(quilt, { order: 1 });
const g2 = tangentField(quilt, { order: 2 });
const bare = meshQuilt(quilt, { baseDensity: DENSITY, cross: null });
const one = meshQuilt(quilt, { baseDensity: DENSITY, cross: g1 });
const two = meshQuilt(quilt, { baseDensity: DENSITY, cross: g2 });
if (bare.positions.length !== one.positions.length || one.positions.length !== two.positions.length) {
  throw new Error("displacement map: the correction changed the mesh topology, which it must not");
}

const at = (p: Float64Array, i: number): Pt3 => [p[i * 3]!, p[i * 3 + 1]!, p[i * 3 + 2]!];
const dist = (a: Pt3, b: Pt3): number =>
  Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

const n = bare.positions.length / 3;
const phi = new Float64Array(n);
const psi = new Float64Array(n);
for (let i = 0; i < n; i++) {
  phi[i] = dist(at(bare.positions, i), at(one.positions, i));
  psi[i] = dist(at(one.positions, i), at(two.positions, i));
}

// ── camera ─────────────────────────────────────────────────────────────────
// A three-quarter from behind and above: the tail is where the story is.
const YAW = (-38 * Math.PI) / 180;
const PITCH = (24 * Math.PI) / 180;
const project = (p: Pt3): [number, number, number] => {
  const x = p[0], y = p[1], z = p[2];
  const cx = x * Math.cos(YAW) - y * Math.sin(YAW);
  const cy = x * Math.sin(YAW) + y * Math.cos(YAW);
  const sy = cy * Math.cos(PITCH) - z * Math.sin(PITCH);
  const sz = cy * Math.sin(PITCH) + z * Math.cos(PITCH);
  return [cx, -sz, sy];      // screen x, screen y (up is -y), depth
};

const W = 1180, PANEL_H = 400, PAD = 70, GAP = 26, HEAD = 128;
const H = HEAD + PANEL_H * 2 + GAP + 92;

const pts = Array.from({ length: n }, (_, i) => project(at(two.positions, i)));
let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
for (const [px, py] of pts) {
  minX = Math.min(minX, px); maxX = Math.max(maxX, px);
  minY = Math.min(minY, py); maxY = Math.max(maxY, py);
}
const scale = Math.min((W - PAD * 2) / (maxX - minX), (PANEL_H - 30) / (maxY - minY));
const ox = PAD - minX * scale + ((W - PAD * 2) - (maxX - minX) * scale) / 2;

/** Log ramp, shared by both panels: black through blue and orange to white. */
const LO = 1e-3, HI = 200;
const ramp = (mm: number): string => {
  if (!(mm > LO)) return "#101014";
  const t = Math.min(1, Math.log10(mm / LO) / Math.log10(HI / LO));
  const stops: [number, number, number, number][] = [
    [0.00, 16, 16, 20], [0.25, 26, 60, 120], [0.50, 40, 150, 170],
    [0.72, 235, 150, 40], [0.88, 255, 70, 40], [1.00, 255, 245, 235],
  ];
  let a = stops[0]!, b = stops[stops.length - 1]!;
  for (let i = 1; i < stops.length; i++) {
    if (t <= stops[i]![0]) { a = stops[i - 1]!; b = stops[i]!; break; }
  }
  const f = b[0] === a[0] ? 0 : (t - a[0]) / (b[0] - a[0]);
  const c = (i: number): number => Math.round(a[i]! + (b[i]! - a[i]!) * f);
  return `rgb(${c(1)},${c(2)},${c(3)})`;
};

interface Tri { readonly depth: number; readonly path: string; readonly mm: number }
function panel(field: Float64Array, y0: number): string {
  const tris: Tri[] = [];
  for (let t = 0; t < two.indices.length; t += 3) {
    const a = two.indices[t]!, b = two.indices[t + 1]!, c = two.indices[t + 2]!;
    const pa = pts[a]!, pb = pts[b]!, pc = pts[c]!;
    const path = `M${(ox + pa[0] * scale).toFixed(1)},${(y0 + (pa[1] - minY) * scale).toFixed(1)}` +
      `L${(ox + pb[0] * scale).toFixed(1)},${(y0 + (pb[1] - minY) * scale).toFixed(1)}` +
      `L${(ox + pc[0] * scale).toFixed(1)},${(y0 + (pc[1] - minY) * scale).toFixed(1)}Z`;
    tris.push({
      depth: (pa[2] + pb[2] + pc[2]) / 3,
      path,
      mm: (field[a]! + field[b]! + field[c]!) / 3,
    });
  }
  // Painter's algorithm: far first. No z-buffer needed for a closed body.
  tris.sort((x, y) => x.depth - y.depth);
  return tris.map((t) => {
    const col = ramp(t.mm);
    return `<path d="${t.path}" fill="${col}" stroke="${col}" stroke-width="0.4"/>`;
  }).join("");
}

const phiR = fieldDisplacement(quilt, { cross: g1 });
const psiR = fieldDisplacement(quilt, { cross: g2, against: g1 });

const legend = (): string => {
  const x0 = W - PAD - 300, y = H - 46;
  const ticks = [0.001, 0.01, 0.1, 1, 10, 100];
  const bar = Array.from({ length: 150 }, (_, i) => {
    const mm = LO * Math.pow(HI / LO, i / 149);
    return `<rect x="${(x0 + i * 2).toFixed(1)}" y="${y - 12}" width="2.2" height="12" fill="${ramp(mm)}"/>`;
  }).join("");
  const marks = ticks.map((v) => {
    const t = Math.log10(v / LO) / Math.log10(HI / LO);
    return `<text class="ax" x="${(x0 + t * 300).toFixed(1)}" y="${y + 13}" text-anchor="middle">${v < 1 ? v : v.toFixed(0)}</text>`;
  }).join("");
  return `${bar}${marks}<text class="ax" x="${x0 - 10}" y="${y - 2}" text-anchor="end">mm moved</text>`;
};

const cap = (label: string, sub: string, y: number): string =>
  `<text class="cap" x="${PAD}" y="${y}">${label}</text>` +
  `<text class="ax" x="${PAD}" y="${y + 17}">${sub}</text>`;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<style>
  text { font-family: ui-monospace, Menlo, monospace; fill: #8f8f88; }
  .t   { fill: #e6e6e0; font-size: 18px; letter-spacing: .26em; text-transform: uppercase; }
  .s   { font-size: 12.5px; letter-spacing: .12em; }
  .cap { font-size: 13px; letter-spacing: .16em; fill: #d8d8d2; }
  .ax  { font-size: 10.5px; letter-spacing: .06em; }
</style>
<rect width="${W}" height="${H}" fill="#08080a"/>
<text class="t" x="${PAD}" y="46">Panoramic P1 · where the surfacing moved the body</text>
<text class="s" x="${PAD}" y="72">every continuity probe measures agreement at a seam — none of them says where the surface went</text>
<text class="s" x="${PAD}" y="92">log scale, shared between panels · ${quilt.cells.length} cells · ${(two.indices.length / 3).toLocaleString("en-GB")} triangles</text>
${cap("TANGENT PLANE · Φ", `against the bare Coons blend — median ${phiR.median.toFixed(1)} mm · p90 ${phiR.p90.toFixed(1)} mm · worst ${phiR.worst.toFixed(0)} mm at ${phiR.worstCell} · ${phiR.overMillimetre} of ${phiR.cells.length} cells over 1 mm`, HEAD - 14)}
${panel(phi, HEAD + 10)}
${cap("CURVATURE · Ψ", `what it adds on top — median ${psiR.median.toFixed(2)} mm · p90 ${psiR.p90.toFixed(1)} mm · worst ${psiR.worst.toFixed(0)} mm at ${psiR.worstCell} · next worst ${psiR.cells[1]!.mm.toFixed(1)} mm`, HEAD + PANEL_H + GAP - 14)}
${panel(psi, HEAD + PANEL_H + GAP + 10)}
${legend()}
<text class="ax" x="${PAD}" y="${H - 46}">Δ² goes as the transverse length SQUARED times the curvature disagreement, so a join the network</text>
<text class="ax" x="${PAD}" y="${H - 32}">cannot close buys a correction of thousands. That white cell is the tail, and its four 72–74° corners.</text>
</svg>
`;

const out = process.argv[2] ?? "../../shots/displacement-map.svg";
writeFileSync(new URL(out, import.meta.url), svg);
console.log(`\nphi: median ${phiR.median.toFixed(3)} p90 ${phiR.p90.toFixed(3)} worst ${phiR.worst.toFixed(2)} (${phiR.worstCell})`);
console.log(`psi: median ${psiR.median.toFixed(3)} p90 ${psiR.p90.toFixed(3)} worst ${psiR.worst.toFixed(2)} (${psiR.worstCell})`);
console.log(`wrote ${out}\n`);
