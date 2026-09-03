/**
 * The aero lens over the P1 (charge §9).
 *
 * A lens, not a stage: this script reads the finished document, reports, and
 * writes nothing back into it. The one file it does write is the preview's
 * body.json, so the Cp map can be painted on the skin — a view of the model,
 * the same status the crease normals have.
 */

import { writeFileSync, readFileSync } from "node:fs";
import { load } from "@car/history";
import { computeQuilt } from "@car/frame";
import { meshQuilt } from "@car/mesh";
import { aeroLens, dragAndPower, inletAdequacy } from "@car/lens";
import { assumed, sourced } from "@car/demand";
import { p1Config } from "@car/fixtures";
import type { CarDocument } from "@car/schema";

const doc = JSON.parse(readFileSync(new URL("../cars/panoramic-p1.car.json", import.meta.url), "utf8")) as CarDocument;
const quilt = computeQuilt(load(doc).state);
const raw = meshQuilt(quilt, { baseDensity: 20 });

// Seat it on the road before solving: the ground-plane image is mirrored in
// z = 0, so a body floating 40 mm above the road would be solved against a
// road 40 mm below where the wheels are.
const positions = Float64Array.from(raw.positions);
let minZ = Infinity;
for (let i = 2; i < positions.length; i += 3) minZ = Math.min(minZ, positions[i]!);
for (let i = 2; i < positions.length; i += 3) positions[i] = positions[i]! - minZ;

const t0 = process.hrtime.bigint();
const lens = aeroLens({ positions, indices: raw.indices }, { targetPanels: 700 });
const elapsedMs = Number(process.hrtime.bigint() - t0) / 1e6;

const line = (k: string, v: string): string => `${k.padEnd(28)} ${v}`;
console.log("\n=== AERO LENS — PANORAMIC P1 (charge §9) ===");
console.log(line("method", lens.method));
console.log(line("panels", `${lens.panelCount} at ${lens.panelGridMm.toFixed(0)} mm binning`));
console.log(line("solve time", `${elapsedMs.toFixed(0)} ms`));
console.log(line("residual normal velocity", `${lens.residual.toFixed(4)} of V∞`));
console.log(line("Cp range", `${lens.cpMin.toFixed(3)} to ${lens.cpMax.toFixed(3)}`));
console.log(line("Cp 2nd-98th percentile", `${lens.cpP02.toFixed(3)} to ${lens.cpP98.toFixed(3)} — the ramp uses these; ` +
  "potential flow puts unbounded suction on a sharp edge and one panel would set the whole scale"));
console.log(line("frontal area", `${lens.frontalArea.value.toFixed(3)} m² at ${lens.frontalAreaCellMm} mm ` +
  `(±${(lens.frontalAreaConvergence * 1000).toFixed(1)} × 10⁻³ m² on doubling the cell)`));
console.log(line("adverse-recovery flags", `${lens.separatedCount} of ${lens.panelCount} panels`));

console.log("\n--- what this map is not ---");
for (const n of lens.notes) console.log(`  · ${n}`);

// The P1 has no measured Cd — nothing has been in a tunnel — so the number is
// ASSUMED and the caveat rides along with every force it produces.
const cd = assumed(0.34, "ratio",
  "P1 has never been in a tunnel and no source exists for it; a coupe of this " +
  "shape sits near 0.34, and every force below inherits that guess");

console.log("\n--- drag and power (SOURCED-Cd × derived area, never the map) ---");
console.log(line("Cd", `${cd.value} [${cd.license.tag}]`));
for (const kph of [50, 100, 160, 250]) {
  const d = dragAndPower(sourced(kph, "km/h", "the speed box"), cd, lens.frontalArea);
  console.log(line(`  at ${kph} km/h`,
    `${d.drag.value.toFixed(0)} N · ${(d.power.value / 1000).toFixed(1)} kW` +
    (d.caveat ? `  — ${d.caveat}` : "")));
}

// Inlet: the P1 authors no grille aperture yet, so the area is ASSUMED and
// says so. The check itself is pure geometry either way.
const inlet = assumed(240000, "mm2",
  "P1 authors no grille aperture yet — 240,000 mm² stands in for the nose opening " +
  "a body of this frontal area would carry (roughly 800 × 300 mm)");
console.log("\n--- inlet versus cooling demand (geometry only) ---");
for (const kph of [50, 120]) {
  const c = inletAdequacy(inlet, p1Config.cooling.power, sourced(kph, "km/h", "the speed box"));
  console.log(line(`  at ${kph} km/h`,
    `needs ${(c.required.value / 1000).toFixed(1)} × 10³ mm², has ${(c.available.value / 1000).toFixed(1)} × 10³ mm² ` +
    `(${(c.ratio * 100).toFixed(0)}%) — ${c.adequate ? "adequate" : "SHORT"}`));
}
console.log(line("  chain", inletAdequacy(inlet, p1Config.cooling.power, sourced(100, "km/h", "x")).chain));

// --- paint it on the skin -----------------------------------------------
const url = new URL("../apps/preview/body.json", import.meta.url);
const body = JSON.parse(readFileSync(url, "utf8")) as Record<string, unknown>;
body["cp"] = {
  perTriangle: Array.from(lens.cpTriangle, (v) => Math.round(v * 1000) / 1000),
  min: lens.cpMin,
  max: lens.cpMax,
  p02: lens.cpP02,
  p98: lens.cpP98,
  panels: lens.panelCount,
  separatedCount: lens.separatedCount,
  frontalAreaM2: lens.frontalArea.value,
  note: lens.notes[0]!,
};
writeFileSync(url, JSON.stringify(body));
console.log(`\nwrote Cp for ${lens.cpTriangle.length} triangles into apps/preview/body.json`);
