/**
 * Stage 1 measurement — what the cross-boundary tangent field actually buys.
 *
 * Runs the continuity probe on the P1 twice, over exactly the same joins:
 * once on the plain G0 blend, once with the field. Nothing else changes.
 */

import { readFileSync } from "node:fs";
import { load } from "@car/history";
import { computeQuilt } from "@car/frame";
import { continuityProbe, tangentField, fieldMagnitude, quiltAdjacency, type ContinuityReport } from "@car/surface";
import type { CarDocument } from "@car/schema";

const doc = JSON.parse(readFileSync(new URL("../cars/panoramic-p1.car.json", import.meta.url), "utf8")) as CarDocument;
const quilt = computeQuilt(load(doc).state);

const adj = quiltAdjacency(quilt);
console.log(`\nquilt          ${quilt.cells.length} cells · ${quilt.curves.size} curves · ${quilt.creases.size} creased`);
console.log(`adjacency      ${adj.edges.length} shared edges · ${adj.disjointPairs} non-overlapping pairs · ${adj.ambiguous} ambiguous`);

const row = (label: string, r: ContinuityReport): void => {
  console.log(
    `${label.padEnd(14)} G1<1° ${String(r.g1Joins).padStart(4)}/${String(r.joins).padEnd(4)}` +
    ` median ${r.medianDeg.toFixed(3).padStart(8)}°  p90 ${r.p90Deg.toFixed(3).padStart(8)}°` +
    `  worst ${r.worstDeg.toFixed(3).padStart(8)}°`,
  );
};

const before = continuityProbe(quilt);
const field = tangentField(quilt);
const after = continuityProbe(quilt, { cross: field });

console.log("");
row("G0 blend", before);
row("+ field", after);
console.log("");
console.log(`joins          ${before.joins} smooth · ${before.creased} creased · ${before.sharp} sharper than ${before.breakAngleDeg}° (unmarked features)`);
console.log(`field          ${field.stats.correctedSides} sides prescribed over ${field.stats.edges} edges` +
  ` (${field.stats.creasedEdges} creased + ${field.stats.sharpEdges} sharp left alone, ${field.stats.ambiguous} ambiguous)`);
const mag = fieldMagnitude(quilt, field);
console.log(`correction     median ${(mag.median * 100).toFixed(1)}% · worst ${(mag.worst * 100).toFixed(1)}% of the natural cross-derivative`);
if (after.worst) {
  console.log(`worst join     ${after.worst.cellA} / ${after.worst.cellB} on ${after.worst.curveId}` +
    ` at t=${after.worst.t.toFixed(3)} — ${after.worst.angleDeg.toFixed(2)}°`);
}
