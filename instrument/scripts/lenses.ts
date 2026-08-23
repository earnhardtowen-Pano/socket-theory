/**
 * The inspection sheet — the readings a surfacer takes before signing a body.
 *
 * Three lenses on one plate, each answering a question the others cannot:
 *
 *  1. ISOPHOTES. Lines of constant angle between the normal and a fixed light.
 *     They read continuity one order higher than the surface: a tenth of a
 *     degree of tangent break is invisible on a shaded render and unmistakable
 *     as a kink in a contour. Drawn on ANALYTIC normals — a render mesh splits
 *     its normals at the crease angle, so isophotes drawn on those would show
 *     the smoothing groups instead of the surface.
 *  2. HIGHLIGHT RUN. The same field as a scalar: how fast the normal turns.
 *     Where the contours crowd, a highlight moves slowly and the eye stops —
 *     which is what a feature line IS, and what an unintended one looks like.
 *  3. DRAFT. Whether the body comes out of the tool. The manufacturability row
 *     of the audit has read "not modelled" since the beginning; this is the
 *     first honest thing to put in it.
 *
 *   npx tsx scripts/lenses.ts [outfile.svg]
 */

import { writeFileSync, readFileSync } from "node:fs";
import { load } from "@car/history";
import { computeQuilt } from "@car/frame";
import { tangentField, tessellateQuilt } from "@car/surface";
import {
  draftMap, isophoteContours, isophoteField, isophoteGradient, shallowFraction, undercutFraction,
} from "@car/skin";
import { cross3, len3 } from "@car/num";
import type { CarDocument, Pt3 } from "@car/schema";
import {
  bodyDrawables, compose, fitView, heatRamp, litBy, paintBody, segmentDrawables,
  sheet, viewDirection, LIGHT, type Panel,
} from "./lib/plate.js";

const doc = JSON.parse(
  readFileSync(new URL("../cars/panoramic-p1.car.json", import.meta.url), "utf8"),
) as CarDocument;
const quilt = computeQuilt(load(doc).state);
const cross = tangentField(quilt, { order: 2 });

// The analytic surface, per patch, with nothing shared between cells. This is
// the only honest source for a normal-based reading.
const feed = tessellateQuilt(quilt, 16, cross);
const mesh = { positions: feed.positions, indices: feed.indices };
const n = feed.positions.length / 3;
const pts: Pt3[] = Array.from({ length: n }, (_, i) =>
  [feed.positions[i * 3]!, feed.positions[i * 3 + 1]!, feed.positions[i * 3 + 2]!]);
const view = fitView(pts);
// The draft panel looks from UNDER the car, because that is where the answer
// is: a top three-quarter cannot show what faces down.
const under = fitView(pts, undefined, -34, -32);

const iso = isophoteField({ normals: feed.normals, indices: feed.indices }, { bands: 16 });
const contours = isophoteContours(
  { normals: feed.normals, indices: feed.indices, positions: feed.positions }, iso,
);
const grad = isophoteGradient({ normals: feed.normals, indices: feed.indices }, iso);
// +Z, off the print bed. That is the pull this body actually undergoes, and it
// is a single genuinely one-sided one. A pressed body is a different question:
// each panel is drawn with its own die direction, which needs per-panel tool
// axes this does not have — so it is not asked here rather than answered badly.
const draft = draftMap(
  { normals: feed.normals, positions: feed.positions, indices: feed.indices },
  { pull: [0, 0, 1], minDraftDeg: 3 },
);
/** Steeper than this from vertical, an overhang needs something under it. */
const SUPPORT_DEG = 45;
let supported = 0, supportArea = 0, totalArea = 0;
for (let t = 0; t + 2 < feed.indices.length; t += 3) {
  const w = Math.min(
    draft.draftDeg[feed.indices[t]!]!, draft.draftDeg[feed.indices[t + 1]!]!,
    draft.draftDeg[feed.indices[t + 2]!]!,
  );
  if (!Number.isFinite(w)) continue;
  const a = triangleArea(t);
  totalArea += a;
  if (w < -SUPPORT_DEG) { supported++; supportArea += a; }
}
function triangleArea(t: number): number {
  const p = feed.positions;
  const ia = feed.indices[t]! * 3, ib = feed.indices[t + 1]! * 3, ic = feed.indices[t + 2]! * 3;
  const u: Pt3 = [p[ib]! - p[ia]!, p[ib + 1]! - p[ia + 1]!, p[ib + 2]! - p[ia + 2]!];
  const v: Pt3 = [p[ic]! - p[ia]!, p[ic + 1]! - p[ia + 1]!, p[ic + 2]! - p[ia + 2]!];
  return len3(cross3(u, v)) / 2;
}

/** Face lighting, so a painted body still reads as a body. */
function litness(ia: number, ib: number, ic: number): number {
  const at = (i: number): Pt3 =>
    [feed.positions[i * 3]!, feed.positions[i * 3 + 1]!, feed.positions[i * 3 + 2]!];
  const A = at(ia), B = at(ib), C = at(ic);
  const nn = cross3([B[0] - A[0], B[1] - A[1], B[2] - A[2]], [C[0] - A[0], C[1] - A[1], C[2] - A[2]]);
  const L = len3(nn) || 1;
  return Math.max(0, (nn[0] / L) * LIGHT[0] + (nn[1] / L) * LIGHT[1] + (nn[2] / L) * LIGHT[2]);
}

// Scaled to the body's own distribution rather than to a guess: the point of
// the reading is where this body is unusual, and a ramp whose ends nothing
// reaches is a ramp with no resolution in the middle.
const percentile = (xs: Float64Array, f: number): number => {
  const a = Array.from(xs).filter((v) => Number.isFinite(v)).sort((p, q) => p - q);
  return a.length === 0 ? 0 : a[Math.min(a.length - 1, Math.floor(f * a.length))]!;
};
const CAM = viewDirection();
const gradRamp = heatRamp(Math.max(1e-5, percentile(grad, 0.35)), percentile(grad, 0.999));
/**
 * Classified, not ramped. The question a print asks has thresholds in it —
 * a face is either steep enough to need support or it is not — and a
 * continuous ramp across a threshold hides exactly the line you are looking
 * for.
 */
const draftColour = (deg: number): string => {
  if (deg >= 0) return "rgb(46,84,96)";                     // faces up: lays down on what is below
  if (deg > -SUPPORT_DEG) {                                  // an overhang, but a printable one
    const t = -deg / SUPPORT_DEG;
    return `rgb(${Math.round(46 + 186 * t)},${Math.round(84 + 74 * t)},${Math.round(96 - 36 * t)})`;
  }
  return "rgb(255,72,46)";                                   // needs support under it
};

const panels: Panel[] = [
  {
    title: "ISOPHOTES",
    subtitle: `${iso.bands} equal-angle bands about a fixed light · ` +
      `${(contours.length / 9).toLocaleString("en-GB")} contour segments · ` +
      `analytic normals, nothing shared between patches`,
    draw: (y0) => compose([
      ...bodyDrawables(mesh, y0, view, (t, ia, ib, ic) => {
        // Lift the body out of black here: the contours are the reading, but a
        // reading needs a form under it to sit on.
        const g = Math.round(20 + litness(ia, ib, ic) * 62);
        return `rgb(${g},${g},${Math.round(g * 1.04)})`;
      }),
      ...segmentDrawables(contours, y0, view, "rgb(248,214,138)", 1.0, 3e-3, 9,
        (i) => contours[i + 6]! * CAM[0] + contours[i + 7]! * CAM[1] + contours[i + 8]! * CAM[2] <= 0),
    ]),
  },
  {
    title: "HIGHLIGHT RUN",
    subtitle: "how fast the normal turns — where the contours crowd, a highlight " +
      "slows and the eye stops. A feature line is this on purpose; anywhere else it is a defect",
    draw: (y0) => paintBody(mesh, y0, view, (t, ia, ib, ic) =>
      litBy(gradRamp((grad[ia]! + grad[ib]! + grad[ic]!) / 3), litness(ia, ib, ic))),
  },
  {
    title: "DRAFT · pulled +Z, off the print bed · seen from underneath",
    subtitle: `red overhangs by more than ${SUPPORT_DEG}° and needs support — ` +
      `${((supportArea / totalArea) * 100).toFixed(1)}% of the area · ` +
      `${(shallowFraction(draft) * 100).toFixed(1)}% is within ${draft.minDraftDeg}° of vertical`,
    draw: (y0) => paintBody(mesh, y0, under, (t, ia, ib, ic) =>
      litBy(draftColour(Math.min(
        Math.abs(draft.draftDeg[ia]!), Math.abs(draft.draftDeg[ib]!), Math.abs(draft.draftDeg[ic]!),
      )), litness(ia, ib, ic))),
  },
];

const svg = sheet({
  title: "Panoramic P1 · inspection",
  lines: [
    `${quilt.cells.length} cells · ${(feed.indices.length / 3).toLocaleString("en-GB")} analytic triangles · ` +
      `tangent field at order 2`,
    "isophotes and draft read the surface normal, so they are drawn on the analytic patches and never on render normals",
  ],
  panels,
  footer: [
    `Isophotes: unbroken lines across a seam are G1, lines that cross without a corner are G2. Bands are equal in ANGLE, not in cosine — equal-cosine bands crowd at grazing incidence, which is where a highlight lives.`,
    `Draft is LOCAL: it finds faces that lean the wrong way, not parts that will not come out. A face can be perfectly drafted and still trapped behind another, and finding those needs a visibility test this does not do.`,
  ],
});

const out = process.argv[2] ?? "../../shots/lenses.svg";
writeFileSync(new URL(out, import.meta.url), svg);
console.log(`\nisophotes  ${iso.bands} bands · ${contours.length / 9} segments · ${iso.crossings.length} crossings · ${iso.degenerate} degenerate normals`);
console.log(`draft +Z   ${(undercutFraction(draft) * 100).toFixed(1)}% faces down · ` +
  `${((supportArea / totalArea) * 100).toFixed(1)}% overhangs past ${SUPPORT_DEG}° and needs support · ` +
  `${(shallowFraction(draft) * 100).toFixed(1)}% within ${draft.minDraftDeg}° of vertical`);
console.log(`wrote ${out}\n`);
