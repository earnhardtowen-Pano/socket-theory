/**
 * Night preview: drive the real pipeline end to end — verbs → quilt →
 * conforming mesh → closed check → JSON for the preview page + STL.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { createSession } from "@car/history";
import { computeQuilt } from "@car/frame";
import { meshQuilt, closedMeshCheck, writeStlBinary } from "@car/mesh";

const s = createSession("night-preview");

// Blocked body, mm. X aft (0 nose → 4200 tail), Y across, Z up.
s.apply("tape", { kind: "box", rect: { view: { kind: "side" }, a: [0, 250], b: [4200, 700], depth: 1800, at: -900 } });
s.apply("tape", { kind: "box", rect: { view: { kind: "side" }, a: [950, 700], b: [3350, 1250], depth: 1500, at: -750 } });
s.apply("tape", { kind: "box", rect: { view: { kind: "side" }, a: [3350, 700], b: [4200, 900], depth: 1500, at: -750 } });
s.apply("tape", { kind: "box", rect: { view: { kind: "side" }, a: [0, 700], b: [950, 830], depth: 1500, at: -750 } });

const quilt = computeQuilt(s.state);
const mesh = meshQuilt(quilt, {});
const report = closedMeshCheck(mesh);

console.log("cells:", quilt.cells.length, "curves:", quilt.curves.size);
console.log("triangles:", mesh.indices.length / 3, "vertices:", mesh.positions.length / 3);
console.log("closed:", report.closed, "violations:", report.violations.length);

mkdirSync(new URL("../apps/preview", import.meta.url), { recursive: true });
writeFileSync(
  new URL("../apps/preview/body.json", import.meta.url),
  JSON.stringify({
    positions: Array.from(mesh.positions),
    indices: Array.from(mesh.indices),
    closed: report.closed,
    triangles: mesh.indices.length / 3,
    cells: quilt.cells.length,
  }),
);

const stl = writeStlBinary(mesh, "night-preview");
writeFileSync(new URL("../../night-preview.stl", import.meta.url), stl);
console.log("stl bytes:", stl.byteLength);
