/**
 * The P1's control net, and whether it is the same body.
 *
 * The test suite proves the claim on synthetic fixtures; this proves it on the
 * car, which is where the tile count stops being a footnote. Reports the worst
 * disagreement between `netAt` and `boundaryCoonsPoint` over every cell, the
 * bidegree actually reached, and what the whole body would cost as a file.
 *
 *   npx tsx scripts/control-net.ts [stations-per-side]
 */

import { readFileSync } from "node:fs";
import { dist3 } from "@car/num";
import { load } from "@car/history";
import { computeQuilt } from "@car/frame";
import { boundaryCoonsPoint, cellBezier, cellBoundary, netAt, tangentField } from "@car/surface";
import type { CarDocument } from "@car/schema";

const N = Math.max(3, Number(process.argv[2] ?? 11));

const doc = JSON.parse(
  readFileSync(new URL("../cars/panoramic-p1.car.json", import.meta.url), "utf8"),
) as CarDocument;
const quilt = computeQuilt(load(doc).state);
const cross = tangentField(quilt, { order: 2 });

let worst = 0, worstCell = "", worstAt = "";
let tiles = 0, control = 0, degU = 0, degV = 0, cells = 0, refused = 0;
const perCellTiles: number[] = [];

for (const cell of quilt.cells) {
  const b = cellBoundary(cell, quilt, cross);
  let net;
  try {
    net = cellBezier(b, cross, { order: 2 });
  } catch (e) {
    refused++;
    console.log(`  ${cell.id}: ${(e as Error).message}`);
    continue;
  }
  cells++;
  const t = net.tiles.length * net.tiles[0]!.length;
  tiles += t;
  perCellTiles.push(t);
  control += net.controlPoints;
  if (net.degreeU > degU) degU = net.degreeU;
  if (net.degreeV > degV) degV = net.degreeV;
  for (let i = 0; i <= N; i++) {
    for (let j = 0; j <= N; j++) {
      const u = i / N, v = j / N;
      const d = dist3(netAt(net, u, v), boundaryCoonsPoint(b, u, v));
      if (d > worst) { worst = d; worstCell = cell.id; worstAt = `${u.toFixed(3)},${v.toFixed(3)}`; }
    }
  }
}

perCellTiles.sort((a, b) => a - b);
const median = perCellTiles[Math.floor(perCellTiles.length / 2)] ?? 0;
const biggest = perCellTiles[perCellTiles.length - 1] ?? 0;

// A STEP CARTESIAN_POINT is about 60 bytes written plainly, and a surface
// entity carries its knots and its net. This is the order of magnitude, not a
// promise: the writer is the next stage.
const megabytes = (control * 60) / 1024 / 1024;

const pad = (s: string, n: number) => s + " ".repeat(n > s.length ? n - s.length : 0);
const line = (k: string, v: string) => console.log("  " + pad(k, 26) + v);

console.log("\nTHE P1 AS A CONTROL NET\n");
line("cells written", `${cells}${refused ? ` (${refused} refused)` : ""}`);
line("worst disagreement", `${worst.toExponential(3)} mm  at ${worstCell} (${worstAt})`);
line("stations per cell", `${(N + 1) ** 2}`);
line("bidegree", `(${degU},${degV})`);
line("tiles", `${tiles.toLocaleString("en-GB")} · median ${median}/cell · worst ${biggest}`);
line("control points", control.toLocaleString("en-GB"));
line("as a file, roughly", `${megabytes.toFixed(1)} MB`);
console.log(
  `\n  ${worst < 1e-9 ? "PASS" : "FAIL"} — the net is the surface to ` +
  `${worst.toExponential(1)} mm, against a gate of 1e-9.\n`);
