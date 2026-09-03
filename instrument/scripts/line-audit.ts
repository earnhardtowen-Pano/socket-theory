/**
 * Where the master lines dip, and where they balloon.
 *
 * Two defects `curveQuality` cannot see and a designer sees immediately: a
 * line that descends and climbs back to the height it left, and a span that
 * leaves the interval its own two stations span. Both are read off the built
 * chains, both in the view they are drawn in.
 *
 *   npx tsx scripts/line-audit.ts [car.json]
 */
import { readFileSync } from "node:fs";
import { load } from "@car/history";
import { computeQuilt } from "@car/frame";
import { curveQuality, profileQuality, WOBBLE_MM } from "@car/surface";
import { evalChain } from "@car/num";
import { finishOf } from "@car/skin";
import type { CarDocument, Id } from "@car/schema";

const carPath = process.argv[2] ?? "../cars/mclaren-f1.car.json";
const doc = JSON.parse(readFileSync(new URL(carPath, import.meta.url), "utf8")) as CarDocument;
const state = load(doc).state;
const quilt = computeQuilt(state);

const BODY = new Set<Id>();
for (const cell of quilt.cells) {
  const master = (cell.id.endsWith("~m") ? cell.id.slice(0, -2) : cell.id) as Id;
  const rec = state.cells.get(master);
  const mat = rec?.materialId === undefined ? undefined : state.materials.get(rec.materialId);
  const klass = mat ? finishOf(mat.name, mat.color).surfaceClass : "skin";
  if (klass !== "skin" && klass !== "trim" && klass !== "glazing") continue;
  for (const sd of cell.sides) BODY.add(sd.curveId as Id);
}

let LEN = 0;
for (const [id, ch] of quilt.curves) {
  if (!BODY.has(id)) continue;
  for (let i = 0; i <= 8; i++) LEN = Math.max(LEN, evalChain(ch, i / 8)[0]);
}

// Every reversal on the long lines, whatever its size — the author decides
// which are shape and which are wobble, and cannot if the probe pre-filters.
for (const [id, ch] of quilt.curves) {
  if (!BODY.has(id)) continue;
  const A = evalChain(ch, 0), B = evalChain(ch, 1);
  if (Math.abs(B[0] - A[0]) < LEN * 0.25) continue;
  if (A[1] < 0) continue;                      // one side is enough
  for (const [view, axis, abs] of [["side", 2, false], ["plan", 1, true]] as const) {
    const q = profileQuality(ch, { axis, runAxis: 0, absolute: abs, wobbleMm: 0 });
    const list = q.turns.map((t) =>
      `${t.peak ? "\u25b2" : "\u25bc"}${t.value.toFixed(0)}@${t.at.toFixed(0)}(${t.amplitude.toFixed(0)}/${t.span.toFixed(0)})`).join(" ");
    console.log(`  ${id.padEnd(10)} ${view} ${String(ch.segs.length).padStart(2)}sp  ${list || "monotone"}`);
  }
  const cq = curveQuality(ch);
  console.log(`  ${" ".repeat(10)} curvature  variation ${cq.variation.toFixed(2)}` +
    `  inflections ${cq.inflections}  turns ${cq.curvatureTurns}` +
    `  (1 = one clean sweep, 2 = one peak, 3+ = ripple)`);
}
console.log("");

interface Row { id: Id; span: number; view: string; wob: number; worst: number; at: number; over: number; overAt: number; segs: number; }
const rows: Row[] = [];
for (const [id, ch] of quilt.curves) {
  if (!BODY.has(id)) continue;
  const a = evalChain(ch, 0), b = evalChain(ch, 1);
  const runSpan = Math.abs(b[0] - a[0]);
  if (runSpan < LEN * 0.06) continue;            // only lines that run along the car
  for (const [view, axis, abs] of [["side", 2, false], ["plan", 1, true]] as const) {
    const q = profileQuality(ch, { axis, runAxis: 0, absolute: abs });
    if (q.wobbles === 0 && q.overshoot < 1) continue;
    rows.push({
      id, span: runSpan, view, wob: q.wobbles, worst: q.worstWobble, at: q.worstWobbleAt,
      over: q.overshoot, overAt: q.overshootAt, segs: ch.segs.length,
    });
  }
}
rows.sort((x, y) => (y.over + y.worst) - (x.over + x.worst));

console.log(`\n${doc.name || "car"} — master line audit  (wobble under ${WOBBLE_MM} mm)\n`);
if (rows.length === 0) console.log("  clean: no reversal under the wobble threshold, no span outside its own stations\n");
for (const r of rows.slice(0, 24)) {
  const ch = quilt.curves.get(r.id)!;
  const A = evalChain(ch, 0), B = evalChain(ch, 1);
  const ends = `[${A.map((v) => v.toFixed(0)).join(",")}]→[${B.map((v) => v.toFixed(0)).join(",")}]`;
  console.log(`  ${r.id.padEnd(11)} ${r.view}  ${r.segs} spans  ${ends}` +
    (r.wob > 0 ? `  ·  ${r.wob} wobble${r.wob === 1 ? "" : "s"}, worst ${r.worst.toFixed(1)} mm at x ${r.at.toFixed(0)}` : "") +
    (r.over >= 1 ? `  ·  balloon ${r.over.toFixed(1)} mm at x ${r.overAt.toFixed(0)}` : ""));
}
const totWob = rows.reduce((s, r) => s + r.wob, 0);
const worstOver = rows.reduce((s, r) => Math.max(s, r.over), 0);
console.log(`\n  ${rows.length} lines flagged · ${totWob} wobbles · worst balloon ${worstOver.toFixed(1)} mm\n`);
