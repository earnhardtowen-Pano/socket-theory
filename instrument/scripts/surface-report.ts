/**
 * The surfacing report — the whole body graded in one pass, worst first.
 *
 * Three questions, in the order a surfacer asks them:
 *
 *  1. ARE THE CURVES ANY GOOD? Nothing downstream can rescue a bad curve. A
 *     curvature plot that goes up and down over a stretch meant to be one move
 *     is the classic fault and it passes every tolerance check there is,
 *     because the curve goes through all its points perfectly.
 *  2. DO THE PATCHES MEET? Tangent plane first, then curvature across.
 *  3. WHERE IS THE NETWORK IN THE WAY? A corner the curves turn badly pins a
 *     defect no surfacing pass can remove.
 *
 * Emits a console table and an SVG of the worst curves' combs.
 *
 *   npx tsx scripts/surface-report.ts [outfile.svg]
 */

import { writeFileSync, readFileSync } from "node:fs";
import { load } from "@car/history";
import { computeQuilt } from "@car/frame";
import {
  continuityProbe, curvatureJoinProbe, curveQuality, networkObstruction,
  quiltAdjacency, tangentField, type CurveQuality,
} from "@car/surface";
import type { CarDocument, Id } from "@car/schema";

const doc = JSON.parse(
  readFileSync(new URL("../cars/panoramic-p1.car.json", import.meta.url), "utf8"),
) as CarDocument;
const state = load(doc).state;
const quilt = computeQuilt(state);
const cross = tangentField(quilt, { order: 2 });

const pad = (s: string, n: number): string => (s.length >= n ? s : s + " ".repeat(n - s.length));
const rp = (s: string, n: number): string => (s.length >= n ? s : " ".repeat(n - s.length) + s);
const rule = (t: string): void => console.log(`\n${t}\n${"-".repeat(74)}`);

// ── 1. curves ──────────────────────────────────────────────────────────────
interface CurveRow { readonly id: Id; readonly q: CurveQuality; readonly crease: boolean }
const curves: CurveRow[] = [...state.curves.values()].map((c) => ({
  id: c.id, q: curveQuality(c.chain), crease: c.crease,
}));
const shaped = curves.filter((r) => !r.q.straight);
// Worst first: ripple (turns of dκ/ds) dominates, then how much of it there is.
const byRipple = [...shaped].sort((a, b) =>
  (b.q.curvatureTurns - a.q.curvatureTurns) || (b.q.variation - a.q.variation));

rule("1. CURVES — is the network worth surfacing?");
console.log(`  ${curves.length} curves · ${curves.length - shaped.length} straight · ` +
  `${shaped.filter((r) => r.q.monotone).length} of ${shaped.length} shaped curves sweep their curvature once`);
console.log(`  ${shaped.filter((r) => r.q.inflections > 0).length} carry an inflection · ` +
  `worst variation ${Math.max(...shaped.map((r) => r.q.variation)).toFixed(2)} ` +
  `(1 = monotone, 2 = one peak, 3+ = ripple)`);
console.log("");
console.log("  " + pad("curve", 12) + rp("mm", 7) + rp("κ min", 11) + rp("κ max", 11) +
  rp("turns", 7) + rp("infl", 6) + rp("variation", 11) + "  ");
for (const r of byRipple.slice(0, 8)) {
  console.log("  " + pad(r.id, 12) + rp(r.q.arcLength.toFixed(0), 7) +
    rp(r.q.kappaMin.toExponential(1), 11) + rp(r.q.kappaMax.toExponential(1), 11) +
    rp(String(r.q.curvatureTurns), 7) + rp(String(r.q.inflections), 6) +
    rp(r.q.variation.toFixed(3), 11) + (r.crease ? "  crease" : ""));
}

// ── 2. joins ───────────────────────────────────────────────────────────────
const before = continuityProbe(quilt);
const after = continuityProbe(quilt, { cross });
const g2before = curvatureJoinProbe(quilt);
const g2after = curvatureJoinProbe(quilt, { cross });
const adj = quiltAdjacency(quilt);

rule("2. JOINS — do the patches meet?");
console.log(`  ${adj.edges.length} shared edges · ${after.joins} smooth · ` +
  `${after.creased} creased (authored) · ${after.sharp} sharper than ${after.breakAngleDeg}° (unmarked)`);
console.log("");
console.log("  " + pad("", 12) + rp("G1 joins", 12) + rp("median", 10) + rp("worst", 10) +
  rp("κ gap median", 15) + rp("κ gap worst", 14));
const jrow = (label: string, c: typeof before, g: typeof g2before): void => {
  console.log("  " + pad(label, 12) + rp(`${c.g1Joins}/${c.joins}`, 12) +
    rp(`${c.medianDeg.toFixed(2)}°`, 10) + rp(`${c.worstDeg.toFixed(2)}°`, 10) +
    rp(`${g.medianGap.toExponential(1)}/mm`, 15) + rp(`${g.worstGap.toExponential(1)}/mm`, 14));
};
jrow("bare blend", before, g2before);
jrow("with field", after, g2after);
if (after.worst) {
  console.log(`\n  worst join   ${after.worst.cellA} | ${after.worst.cellB} on ${after.worst.curveId} ` +
    `— ${after.worst.angleDeg.toFixed(2)}° at [${after.worst.at.map((v) => Math.round(v)).join(", ")}]`);
}

// ── 3. network ─────────────────────────────────────────────────────────────
const net = networkObstruction(quilt);
rule("3. NETWORK — where the curves are in the way");
console.log(`  ${net.cleanCorners}/${net.corners} corners coplanar to ${net.toleranceDeg}° · ` +
  `median ${net.medianDeg.toFixed(3)}° · p90 ${net.p90Deg.toFixed(2)}° · worst ${net.worstDeg.toFixed(1)}°`);
if (net.worst) {
  console.log(`  worst        ${net.worst.cellA} | ${net.worst.cellB} on ${net.worst.curveId} ` +
    `— ${net.worst.angleDeg.toFixed(1)}° at [${net.worst.at.map((v) => Math.round(v)).join(", ")}]`);
}
console.log(`  fairing them would swing a curve at the vertex by ` +
  `${net.medianRotationDeg.toFixed(2)}° median · ${net.worstRotationDeg.toFixed(1)}° worst`);
console.log("");
console.log("  " + pad("worst open corners", 26) + rp("plane gap", 11) + rp("swing A", 10) + rp("swing B", 10) + "   at");
for (const c of net.open.slice(0, 6)) {
  console.log("  " + pad(`${c.cellA} | ${c.cellB}`, 26) +
    rp(`${c.angleDeg.toFixed(2)}°`, 11) + rp(`${c.rotateADeg.toFixed(2)}°`, 10) +
    rp(`${c.rotateBDeg.toFixed(2)}°`, 10) +
    `   [${c.at.map((v) => Math.round(v)).join(", ")}]`);
}
console.log(`\n  A patch has no freedom at a corner: its tangent plane there is spanned by\n` +
  `  the two curves meeting at the vertex. These ${net.corners - net.cleanCorners} are the whole of what is left,\n` +
  `  and closing them means moving curves — which is authoring, and needs a verb.`);

// ── the combs ──────────────────────────────────────────────────────────────
const SHOW = byRipple.slice(0, 6);
const CW = 360, CH = 170, COLS = 2, PADX = 74, PADY = 128, GAPX = 52, GAPY = 74;
const W = PADX * 2 + CW * COLS + GAPX * (COLS - 1);
const rows = Math.ceil(SHOW.length / COLS);
const H = PADY + rows * (CH + GAPY) + 76;

const plot = (r: CurveRow, col: number, row: number): string => {
  const x0 = PADX + col * (CW + GAPX);
  const y0 = PADY + row * (CH + GAPY);
  const q = r.q;
  const kMax = Math.max(q.kappaMax, 1e-12);
  const px = (s: number): number => x0 + (s / Math.max(q.arcLength, 1e-9)) * CW;
  const py = (k: number): number => y0 + CH - (k / kMax) * CH;
  const line = q.samples
    .map((c, i) => `${i === 0 ? "M" : "L"}${px(c.s).toFixed(1)},${py(c.kappa).toFixed(1)}`).join("");
  // The hairs: one every few stations, from the baseline up to κ.
  const hairs = q.samples
    .filter((_, i) => i % 4 === 0)
    .map((c) => `<line x1="${px(c.s).toFixed(1)}" y1="${(y0 + CH).toFixed(1)}" x2="${px(c.s).toFixed(1)}" y2="${py(c.kappa).toFixed(1)}" stroke="#3a3a44"/>`)
    .join("");
  return `
<text class="cap" x="${x0}" y="${y0 - 16}">${r.id}${r.crease ? " · crease" : ""}</text>
<text class="ax" x="${x0 + CW}" y="${y0 - 16}" text-anchor="end">${q.arcLength.toFixed(0)} mm · ${q.curvatureTurns} turns · variation ${q.variation.toFixed(2)}</text>
<line x1="${x0}" y1="${y0 + CH}" x2="${x0 + CW}" y2="${y0 + CH}" stroke="#2a2a31"/>
${hairs}
<path d="${line}" fill="none" stroke="#ff5533" stroke-width="1.8"/>
<text class="ax" x="${x0 - 10}" y="${y0 + 8}" text-anchor="end">${kMax.toExponential(1)}</text>
<text class="ax" x="${x0 - 10}" y="${(y0 + CH + 4).toFixed(0)}" text-anchor="end">0</text>`;
};

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<style>
  text { font-family: ui-monospace, Menlo, monospace; fill: #8f8f88; }
  .t   { fill: #e6e6e0; font-size: 17px; letter-spacing: .26em; text-transform: uppercase; }
  .s   { font-size: 12.5px; letter-spacing: .12em; }
  .cap { font-size: 12.5px; letter-spacing: .16em; fill: #d8d8d2; }
  .ax  { font-size: 10.5px; letter-spacing: .06em; }
</style>
<rect width="${W}" height="${H}" fill="#08080a"/>
<text class="t" x="${PADX}" y="46">Panoramic P1 · curvature combs</text>
<text class="s" x="${PADX}" y="72">the ${SHOW.length} worst — κ against arc length, hairs every fourth station</text>
<text class="s" x="${PADX}" y="92">variation 1 monotone · 2 one peak · 3+ ripple</text>
${SHOW.map((r, i) => plot(r, i % COLS, Math.floor(i / COLS))).join("\n")}
<text class="ax" x="${PADX}" y="${H - 30}">${curves.length} curves · ${curves.length - shaped.length} straight · worst variation ${Math.max(...shaped.map((r) => r.q.variation)).toFixed(2)} — the P1's curves are clean; its corners are not</text>
</svg>
`;

const out = process.argv[2] ?? "../../shots/curve-combs.svg";
writeFileSync(new URL(out, import.meta.url), svg);
console.log(`\nwrote ${out}\n`);
