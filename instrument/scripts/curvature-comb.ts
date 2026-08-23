/**
 * The curvature comb — the Class-A diagnostic, drawn across a seam.
 *
 * A zebra shows G1: a stripe that breaks means the tangent planes disagree.
 * It says nothing useful about G2, because a stripe can run straight across a
 * join whose curvature jumps. The comb does: walk a path from inside one
 * patch, across the shared curve, into the other, and plot the surface's
 * normal curvature along it. A step in that plot is a curvature break, and a
 * curvature break is what a real highlight finds and a zebra does not.
 *
 * Deliberately measured rather than derived. The curvature here comes from
 * three sampled POSITIONS at a time — the same second-difference a physical
 * comb approximates — not from the analytic second derivative the G2 field
 * was built against. Grading the correction with the formula that produced it
 * would prove nothing.
 *
 * Writes an SVG with one trace per surface order, over the same seam and the
 * same path, so the three are comparable by eye.
 *
 *   npx tsx scripts/curvature-comb.ts [outfile.svg]
 */

import { writeFileSync, readFileSync } from "node:fs";
import { load } from "@car/history";
import { computeQuilt } from "@car/frame";
import {
  boundaryCoonsNormal,
  boundaryCoonsPoint,
  cellBoundary,
  edgeDefectProfile,
  medianOf,
  networkObstruction,
  quiltAdjacency,
  sideParamOf,
  tangentField,
  DEFAULT_CREASE_ANGLE,
  type CellBoundary,
  type CrossPrescription,
  type SharedEdge,
} from "@car/surface";
import { cross3, dist3, dot3, len3, natan2, sub3 } from "@car/num";
import type { CarDocument, Id, Pt3 } from "@car/schema";

const doc = JSON.parse(
  readFileSync(new URL("../cars/panoramic-p1.car.json", import.meta.url), "utf8"),
) as CarDocument;
const quilt = computeQuilt(load(doc).state);
const adj = quiltAdjacency(quilt);
const cellsById = new Map<Id, (typeof quilt.cells)[number]>();
for (const c of quilt.cells) cellsById.set(c.id, c);

/** (u,v) at loop parameter s on side k, `tau` in from the edge. */
function inward(k: number, s: number, tau: number): [number, number] {
  if (k === 0) return [s, tau];
  if (k === 1) return [1 - tau, s];
  if (k === 2) return [1 - s, 1 - tau];
  return [tau, 1 - s];
}

/**
 * Pick the seam to draw. Wanted: a join the field is allowed to correct, whose
 * BOTH corners the curve network already turns smoothly (so the corner window
 * is not the story), and which actually bends — a flat seam proves nothing.
 */
function pickSeam(): { edge: SharedEdge; score: number } {
  let best: { edge: SharedEdge; score: number } | null = null;
  for (const edge of adj.edges) {
    if (edge.creased) continue;
    const profile = edgeDefectProfile(adj, edge, 9);
    if (profile.length === 0) continue;
    if (medianOf(profile) > DEFAULT_CREASE_ANGLE) continue;
    const bA = adj.boundaries.get(edge.a.cellId)!;
    const bB = adj.boundaries.get(edge.b.cellId)!;
    // corner cleanliness: the tangent-plane disagreement at both ends
    let cornerWorst = 0;
    for (const f of [1e-5, 1 - 1e-5]) {
      const t = edge.lo + (edge.hi - edge.lo) * f;
      const [ua, va] = inward(edge.a.k, sideParamOf(bA.sides[edge.a.k]!, t), 0);
      const [ub, vb] = inward(edge.b.k, sideParamOf(bB.sides[edge.b.k]!, t), 0);
      const nA = boundaryCoonsNormal(bA, ua, va);
      const nB = boundaryCoonsNormal(bB, ub, vb);
      const d = (natan2(len3(cross3(nA, nB)), dot3(nA, nB)) * 180) / Math.PI;
      cornerWorst = Math.max(cornerWorst, Number.isFinite(d) ? d : 180);
    }
    if (cornerWorst > 0.5) continue;
    const seamLength = dist3(
      bA.sides[edge.a.k]!.atCurveParam(edge.lo),
      bA.sides[edge.a.k]!.atCurveParam(edge.hi),
    );
    const score = medianOf(profile) * seamLength;   // bends AND is long enough to walk
    if (!best || score > best.score) best = { edge, score };
  }
  if (!best) throw new Error("comb: no clean seam to draw");
  return best;
}

const { edge } = pickSeam();
const sA = adj.boundaries.get(edge.a.cellId)!.sides[edge.a.k]!;
const tMid = (edge.lo + edge.hi) / 2;

/** Walk the path for one surface order and return (arclength, curvature). */
function comb(cross: CrossPrescription | undefined): {
  s: number[]; k: number[]; normalBreakDeg: number;
} {
  const bOf = (id: Id): CellBoundary =>
    cross ? cellBoundary(cellsById.get(id)!, quilt, cross) : adj.boundaries.get(id)!;
  const bA = bOf(edge.a.cellId);
  const bB = bOf(edge.b.cellId);
  const sMidA = sideParamOf(bA.sides[edge.a.k]!, tMid);
  const sMidB = sideParamOf(bB.sides[edge.b.k]!, tMid);

  const STEPS = 90;          // per side
  const DEPTH = 0.42;        // how far into each patch, in its own parameter
  const pts: Pt3[] = [];
  const nrm: Pt3[] = [];
  for (let i = STEPS; i >= 0; i--) {
    const [u, v] = inward(edge.a.k, sMidA, (DEPTH * i) / STEPS);
    pts.push(boundaryCoonsPoint(bA, u, v));
    nrm.push(boundaryCoonsNormal(bA, u, v));
  }
  for (let i = 1; i <= STEPS; i++) {
    const [u, v] = inward(edge.b.k, sMidB, (DEPTH * i) / STEPS);
    pts.push(boundaryCoonsPoint(bB, u, v));
    nrm.push(boundaryCoonsNormal(bB, u, v));
  }

  // The tangent-plane break AT the seam — each patch's own normal ON the
  // shared curve, not one step either side of it, which would fold real
  // surface curvature into a number that is meant to be about the join.
  const [ua0, va0] = inward(edge.a.k, sMidA, 0);
  const [ub0, vb0] = inward(edge.b.k, sMidB, 0);
  const nA0 = boundaryCoonsNormal(bA, ua0, va0);
  const nB0 = boundaryCoonsNormal(bB, ub0, vb0);
  // atan2, not acos: acos has a resolution floor near zero of about 1.2e-6
  // degrees, which is exactly the range an exactly-G1 join reports in.
  const normalBreakDeg = (natan2(len3(cross3(nA0, nB0)), dot3(nA0, nB0)) * 180) / Math.PI;

  const s: number[] = [0];
  for (let i = 1; i < pts.length; i++) s.push(s[i - 1]! + dist3(pts[i - 1]!, pts[i]!));
  const mid = s[STEPS]!;

  // Normal curvature from three positions, unequal spacing:
  //   P'' ≈ 2[h₂P₀ - (h₁+h₂)P₁ + h₁P₂] / (h₁h₂(h₁+h₂)),  κ_n = ⟨P'', N⟩
  const out: number[] = [];
  const arc: number[] = [];
  for (let i = 1; i + 1 < pts.length; i++) {
    const p0 = pts[i - 1]!, p1 = pts[i]!, p2 = pts[i + 1]!;
    const h1 = len3(sub3(p1, p0)), h2 = len3(sub3(p2, p1));
    if (h1 === 0 || h2 === 0) continue;
    const d2: Pt3 = [0, 0, 0];
    for (let c = 0; c < 3; c++) {
      d2[c] = (2 * (h2 * p0[c]! - (h1 + h2) * p1[c]! + h1 * p2[c]!)) / (h1 * h2 * (h1 + h2));
    }
    out.push(dot3(d2, nrm[i]!));
    arc.push(s[i]! - mid);
  }
  return { s: arc, k: out, normalBreakDeg };
}

/** The jump in measured curvature from one side of the seam to the other. */
const curvStep = (r: { data: { k: number[] } }): number => {
  const m = Math.floor(r.data.k.length / 2);
  return Math.abs(r.data.k[m]! - r.data.k[m - 1]!);
};

const runs = [
  { label: "G0 · bilinear Coons", colour: "#ff5533", cross: undefined },
  { label: "G1 · tangent field", colour: "#e0b13a", cross: tangentField(quilt, { order: 1 }) },
  { label: "G2 · + cross-curvature", colour: "#4db8c8", cross: tangentField(quilt, { order: 2 }) },
].map((r) => ({ ...r, data: comb(r.cross) }));

// ---------------------------------------------------------------------------
// SVG — two panels. The top one is at the scale of the G0 spike, which is the
// only scale on which the G0 trace can be drawn at all; the bottom drops it
// and rescales, because otherwise "G1 and G2 both look like zero" and the
// whole point of the second order is invisible.
// ---------------------------------------------------------------------------
const W = 1180, L = 104, R = 48;
const net = networkObstruction(quilt);

const xs = runs.flatMap((r) => r.data.s);
const x0 = Math.min(...xs), x1 = Math.max(...xs);
const px = (x: number): number => L + ((x - x0) / (x1 - x0)) * (W - L - R);

interface Panel {
  readonly y0: number;
  readonly h: number;
  readonly caption: string;
  readonly show: readonly (typeof runs)[number][];
}
const PANEL_H = 250;
const panels: Panel[] = [
  { y0: 116, h: PANEL_H, caption: "all three, at the scale the G0 break needs", show: runs },
  { y0: 116 + PANEL_H + 76, h: PANEL_H, caption: "G0 dropped, rescaled — this is where the second order shows", show: runs.slice(1) },
];

const body = panels.map((panel) => {
  const ys = panel.show.flatMap((r) => r.data.k);
  const yAbs = Math.max(...ys.map(Math.abs)) * 1.15 || 1;
  const py = (y: number): number => panel.y0 + (1 - (y + yAbs) / (2 * yAbs)) * panel.h;
  const trace = (r: (typeof runs)[number]): string =>
    r.data.s.map((x, i) => `${i === 0 ? "M" : "L"}${px(x).toFixed(1)},${py(r.data.k[i]!).toFixed(1)}`).join("");
  const ticks: number[] = [];
  for (let i = 0; i <= 6; i++) ticks.push(x0 + ((x1 - x0) * i) / 6);
  return `
${ticks.map((t) => `<line x1="${px(t).toFixed(1)}" y1="${panel.y0}" x2="${px(t).toFixed(1)}" y2="${panel.y0 + panel.h}" stroke="#16161a"/>`).join("")}
<line x1="${L}" y1="${py(0).toFixed(1)}" x2="${W - R}" y2="${py(0).toFixed(1)}" stroke="#2a2a31"/>
<line x1="${px(0).toFixed(1)}" y1="${panel.y0}" x2="${px(0).toFixed(1)}" y2="${panel.y0 + panel.h}" stroke="#ff5533" stroke-dasharray="3 4" opacity=".75"/>
${panel.show.map((r) => `<path d="${trace(r)}" fill="none" stroke="${r.colour}" stroke-width="2.1" stroke-linejoin="round"/>`).join("\n")}
<text class="ax" x="${L - 14}" y="${py(yAbs * 0.87).toFixed(1)}" text-anchor="end">${(yAbs * 0.87).toExponential(1)}</text>
<text class="ax" x="${L - 14}" y="${(py(0) + 4).toFixed(1)}" text-anchor="end">0</text>
<text class="ax" x="${L - 14}" y="${py(-yAbs * 0.87).toFixed(1)}" text-anchor="end">${(-yAbs * 0.87).toExponential(1)}</text>
<text class="cap" x="${L}" y="${panel.y0 - 12}">${panel.caption}</text>
${ticks.map((t) => `<text class="ax" x="${px(t).toFixed(1)}" y="${panel.y0 + panel.h + 20}" text-anchor="middle">${t.toFixed(0)}</text>`).join("")}`;
}).join("\n");

const H = panels[1]!.y0 + PANEL_H + 170;
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<style>
  text { font-family: ui-monospace, Menlo, monospace; fill: #8f8f88; }
  .t   { fill: #e6e6e0; font-size: 17px; letter-spacing: .26em; text-transform: uppercase; }
  .s   { font-size: 12.5px; letter-spacing: .12em; }
  .cap { font-size: 11.5px; letter-spacing: .14em; text-transform: uppercase; fill: #6e6e68; }
  .ax  { font-size: 11px; letter-spacing: .08em; }
  .k   { font-size: 13px; letter-spacing: .1em; fill: #b6b6ae; }
  .accent { fill: #ff5533; }
</style>
<rect width="${W}" height="${H}" fill="#08080a"/>
<text class="t" x="${L}" y="42">Panoramic P1 · curvature comb across one seam</text>
<text class="s" x="${L}" y="66">${edge.a.cellId} | ${edge.b.cellId} on ${edge.curveId} — normal curvature along a path crossing the shared curve</text>
<text class="s" x="${L}" y="86">read from three sampled positions at a time — never from the derivative the correction was built against</text>
<text class="ax accent" x="${(px(0) + 9).toFixed(1)}" y="${panels[0]!.y0 + 16}">the seam</text>
${body}
<text class="ax" x="${L}" y="${H - 118}">mm along the path, signed from the seam · vertical axis 1/mm</text>
${runs.map((r, i) => `
<rect x="${L + i * 330}" y="${H - 82}" width="24" height="2.4" fill="${r.colour}"/>
<text class="k" x="${L + i * 330 + 34}" y="${H - 76}">${r.label}</text>
<text class="ax" x="${L + i * 330 + 34}" y="${H - 56}">break ${r.data.normalBreakDeg.toFixed(2)}° · step ${curvStep(r).toExponential(2)}/mm</text>`).join("")}
<text class="ax" x="${L}" y="${H - 24}">curve network: ${net.cleanCorners}/${net.corners} corners coplanar to 1° — where a corner is not, no surfacing pass can help and the fade band carries it</text>
</svg>
`;

const out = process.argv[2] ?? "../../shots/curvature-comb.svg";
writeFileSync(new URL(out, import.meta.url), svg);
console.log(`\nseam            ${edge.a.cellId} | ${edge.b.cellId} on ${edge.curveId}`);
for (const r of runs) {
  console.log(
    `${r.label.padEnd(26)} tangent break ${r.data.normalBreakDeg.toExponential(2).padStart(10)}°` +
    `   curvature step at the seam ${curvStep(r).toExponential(2)} /mm`,
  );
}
console.log(`\nwrote ${out}`);
