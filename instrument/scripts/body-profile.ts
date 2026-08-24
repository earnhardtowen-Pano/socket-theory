/**
 * The body against the real car, station by station.
 *
 * The underlay Owen asked for, as arithmetic rather than as a tracing. It
 * sections the built mesh at each reference station and subtracts: half-width
 * and top-of-body, built minus real, in millimetres.
 *
 * What it caught the first time it was run, on a body every other probe called
 * clean — G1 at 1.6e-15 degrees, closed mesh, 54 panels, symmetric to a
 * micron — was that the car looked like a balloon at the front, and exactly
 * why: everything from a tenth of the length to nine tenths sat within five
 * millimetres of the real car, and both tips were pinched to a point that
 * inflated to full width over four hundred millimetres.
 *
 *   npx tsx scripts/body-profile.ts [car.json]
 */
import { readFileSync } from "node:fs";
import { load } from "@car/history";
import { computeQuilt } from "@car/frame";
import { tangentField } from "@car/surface";
import { meshQuilt } from "@car/mesh";
import { finishOf, sectionAt } from "@car/skin";
import { MX5_PROFILE, MX5_PROFILE_TOLERANCE_MM, MX5_LENGTH } from "@car/fixtures";
import type { CarDocument, Id } from "@car/schema";

const carPath = process.argv[2] ?? "../cars/mx5-na.car.json";
const doc = JSON.parse(readFileSync(new URL(carPath, import.meta.url), "utf8")) as CarDocument;
const state = load(doc).state;
const quilt = computeQuilt(state);
const full = meshQuilt(quilt, { baseDensity: 20, cross: tangentField(quilt, { order: 2 }) });

/**
 * The SKIN only.
 *
 * The reference is a body's profile, so the comparison has to be a body's
 * profile. Section the whole mesh and the A-pillar reports as a 47 mm error in
 * the cowl, which is true of the numbers and false about the car. Structure
 * and glazing are separate assemblies and the reference says so; the class
 * system is what lets the filter be a fact rather than a list of ids.
 */
const master = (id: string): Id => (id.endsWith("~m") ? id.slice(0, -2) : id) as Id;
const skinOnly = (() => {
  const keep = new Uint8Array(full.indices.length / 3);
  for (const r of full.ranges) {
    const cell = state.cells.get(master(r.id));
    const mat = cell?.materialId === undefined ? undefined : state.materials.get(cell.materialId);
    // No material at all is unpainted SKIN, which is the catalogue's own
    // fallback and the right answer for a car nobody has painted.
    const klass = mat ? finishOf(mat.name, mat.color).surfaceClass : "skin";
    if (klass !== "skin" && klass !== "trim") continue;
    for (let t = r.start; t < r.start + r.count; t += 3) keep[t / 3] = 1;
  }
  const idx: number[] = [];
  for (let t = 0; t < full.indices.length; t += 3) {
    if (!keep[t / 3]) continue;
    idx.push(full.indices[t]!, full.indices[t + 1]!, full.indices[t + 2]!);
  }
  return { positions: full.positions, indices: Uint32Array.from(idx) };
})();
const mesh = skinOnly;

console.log(`\n${doc.title ?? "car"} against the NA MX-5's own profile\n`);
console.log("   x    x/L    half-width  built  real     Δ      top  built  real     Δ");
let worstW = 0, worstZ = 0, over = 0;
for (const st of MX5_PROFILE) {
  // Clamp off the very ends: a plane exactly at the tip cuts nothing.
  const x = Math.min(MX5_LENGTH - 3, Math.max(3, st.at * MX5_LENGTH));
  const s = sectionAt(mesh, x, 500);
  const hw = s.width / 2;
  const dw = hw - st.halfWidth, dz = s.top - st.top;
  if (Math.abs(dw) > Math.abs(worstW)) worstW = dw;
  if (Math.abs(dz) > Math.abs(worstZ)) worstZ = dz;
  const bad = Math.abs(dw) > MX5_PROFILE_TOLERANCE_MM || Math.abs(dz) > MX5_PROFILE_TOLERANCE_MM;
  if (bad) over++;
  console.log(
    `  ${x.toFixed(0).padStart(4)}   ${st.at.toFixed(2)}            ` +
    `${hw.toFixed(0).padStart(5)} ${String(st.halfWidth).padStart(5)} ${dw.toFixed(0).padStart(5)}` +
    `          ${s.top.toFixed(0).padStart(5)} ${String(st.top).padStart(5)} ${dz.toFixed(0).padStart(5)}` +
    (bad ? "   <<<" : ""),
  );
}
console.log(
  `\n  worst  ${worstW.toFixed(0)} mm on half-width · ${worstZ.toFixed(0)} mm on height · ` +
  `${over} of ${MX5_PROFILE.length} stations outside ${MX5_PROFILE_TOLERANCE_MM} mm\n` +
  `  the reference is ASSUMED — see packages/fixtures/src/miata-reference.ts\n`);
