/**
 * Put a different engine in and watch the car resolve.
 *
 * This is the demonstration the inversion exists for. `build-etype.ts` reads
 * ENGINE from the environment and changes NOTHING ELSE — same wheelbase, same
 * track, same overhangs, same station tables, same styling — so every number
 * that moves below moved because of the engine and nothing else.
 *
 * WHAT IS ACTUALLY BEING SHOWN. The chain runs: the config declares a
 * powertrain; `makeEngineICE` turns it into an envelope; the packing solve
 * places it; `frameEnvelope` reads its box and puts the frame round it; the
 * body's roofline is the larger of what a person drew and what that frame
 * demands. Four links, none of them a person retyping a table.
 *
 * It also shows the demonstration REFUSING to be dramatic, which matters more
 * than a big number would. A V12 is the bigger engine by every measure a
 * brochure quotes and it makes this car SMALLER: 5.3 litres against 3.8, 69 kg
 * heavier, and 147 mm shorter, because twelve cylinders in two banks of six
 * are six bores long and a straight six is six bores long standing up. The
 * body stops needing the bonnet lifted. If the tool only ever agreed that
 * bigger means bigger it would not be measuring anything.
 *
 *   npx tsx scripts/engine-swap.ts
 */
import { execFileSync } from "node:child_process";

const LINES = [
  "overall, as built",
  "G1 continuity",
  "closed mesh",
  "package vs styling",
  "structure",
  "  wheels carried",
  "  roof carried",
  "profile vs the real car",
];

function build(engine: string): { report: Map<string, string>; dbg: string[] } {
  const out = execFileSync("npx", ["tsx", "scripts/build-etype.ts"], {
    encoding: "utf8",
    env: { ...process.env, ENGINE: engine, DBG: "1" },
    maxBuffer: 64 * 1024 * 1024,
  });
  const report = new Map<string, string>();
  const dbg: string[] = [];
  for (const raw of out.split("\n")) {
    if (raw.includes("DBG   ") || raw.includes("DBG engine")) { dbg.push(raw.trim()); continue; }
    for (const key of LINES) {
      if (raw.startsWith(`  ${key} `) || raw.startsWith(`  ${key}  `)) {
        report.set(key, raw.slice(2 + key.length).trim());
      }
    }
  }
  return { report, dbg };
}

const pad = (s: string, n: number): string => (s.length >= n ? s : s + " ".repeat(n - s.length));

console.log("\nE-TYPE, TWO ENGINES — everything else held fixed\n");
const six = build("six");
const v12 = build("v12");

console.log("  what the solve placed, and the frame it produced\n");
for (const [tag, r] of [["3.8 six", six], ["5.3 V12", v12]] as const) {
  console.log(`  ${tag}`);
  for (const d of r.dbg) console.log(`      ${d.replace(/^DBG\s*/, "")}`);
}

console.log("\n  what the body did about it\n");
for (const key of LINES) {
  const a = six.report.get(key) ?? "—";
  const b = v12.report.get(key) ?? "—";
  if (a === b) {
    console.log(`    ${pad(key.trim(), 24)}${a}`);
  } else {
    console.log(`  * ${pad(key.trim(), 24)}3.8  ${a}`);
    console.log(`    ${pad("", 24)}V12  ${b}`);
  }
}
console.log("\n  * = the engine moved it. Everything unmarked held.\n");
