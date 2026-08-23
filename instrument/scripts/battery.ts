/**
 * The six-car battery, run (charge §12).
 *
 * Six real cars re-entered from public specs plus the shoebox V16, every one
 * through the same builder and the same solver. Reports, per car: whether the
 * packaging solve closed, how many typed violations it raised, how far the
 * solved wheel centres landed from where the sourced inputs say they belong,
 * and how much of the ledger is still ASSUMED.
 *
 * The deltas are the point. They are capability visibility, not a pass mark —
 * a car that lands its wheels but raises violations is telling you which rule
 * in the type library does not generalise, and that is worth more than a
 * green tick.
 */

import { makeAllocator, type Pt3 } from "@car/schema";
import { assembleCar } from "@car/types";
import { solve } from "@car/pack";
import { massLedger } from "@car/lens";
import {
  battery,
  shoeboxEntry,
  configFromSpec,
  fitSubstrate,
  expectedWheelCentres,
  tireDiameterOf,
  BATTERY_TOLERANCE_MM,
  type BatteryEntry,
} from "@car/fixtures";

interface Row {
  readonly name: string;
  readonly closed: boolean;
  readonly violations: number;
  readonly clamps: number;
  readonly placed: number;
  readonly worstDelta: number;
  readonly worstLabel: string;
  readonly within: boolean;
  readonly massKg: number;
  readonly targetGap: number;
  readonly assumed: number;
  readonly byKind: ReadonlyMap<string, number>;
  readonly error?: string;
}

const dist = (a: Pt3, b: Pt3): number =>
  Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

function run(entry: BatteryEntry): Row {
  const { spec } = entry;
  try {
    const alloc = makeAllocator();
    const car = assembleCar(fitSubstrate(entry), alloc);
    const packed = solve(car.input);

    // Solved wheel centres, read back off the placements and sorted so left
    // and right are compared to left and right rather than to each other.
    const wheelsOf = (ws: readonly { id: string; label: string }[]): Pt3[] =>
      ws.map((w) => (packed.placements.get(w.id as never)?.origin ?? [NaN, NaN, NaN]) as Pt3)
        .sort((a, b) => a[1] - b[1]);
    const solved = [
      ...wheelsOf(car.frontWheels as never),
      ...wheelsOf(car.rearWheels as never),
    ];
    const want = [...expectedWheelCentres(spec)].sort((a, b) =>
      (a.at[0] - b.at[0]) || (a.at[1] - b.at[1]));
    const got = [...solved].sort((a, b) => (a[0] - b[0]) || (a[1] - b[1]));

    let worstDelta = 0;
    let worstLabel = "—";
    for (let i = 0; i < want.length; i++) {
      const w = want[i], g = got[i];
      if (!w || !g) continue;
      const d = dist(w.at, g);
      if (d > worstDelta) { worstDelta = d; worstLabel = w.label; }
    }

    const ledger = massLedger({
      parts: car.input.parts,
      placements: packed.placements,
      wheels: [...car.frontWheels, ...car.rearWheels].map((w, i) => {
        const pose = packed.placements.get(w.id);
        return {
          label: `${i < 2 ? "front" : "rear"}-${i % 2 === 0 ? "L" : "R"}`,
          at: (pose ? pose.origin : [0, 0, 0]) as Pt3,
          loadCapacityKg: (w as { loadCapacity?: number }).loadCapacity ?? w.mass!,
        };
      }),
      massTarget: spec.curbMass,
    });

    return {
      name: spec.name,
      closed: packed.closed,
      violations: packed.violations.length,
      clamps: packed.clamps.length,
      placed: packed.placements.size,
      worstDelta,
      worstLabel,
      within: worstDelta <= BATTERY_TOLERANCE_MM.value,
      massKg: ledger.total.value,
      targetGap: ledger.targetGap.value,
      assumed: ledger.outstandingAssumptions?.length ?? 0,
      byKind: packed.violations.reduce((m, v) => m.set(v.kind, (m.get(v.kind) ?? 0) + 1), new Map<string, number>()),
    };
  } catch (e) {
    return {
      name: spec.name, closed: false, violations: 0, clamps: 0, placed: 0,
      worstDelta: NaN, worstLabel: "—", within: false, massKg: NaN,
      targetGap: NaN, assumed: 0, byKind: new Map(),
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

const entries = [...battery, shoeboxEntry];
const rows = entries.map(run);

const pad = (s: string, n: number): string => s.length >= n ? s.slice(0, n) : s + " ".repeat(n - s.length);
const rpad = (s: string, n: number): string => s.length >= n ? s : " ".repeat(n - s.length) + s;

console.log("\n=== SIX-CAR BATTERY (charge §12) ===");
console.log(`acceptance: wheel centres within ±${BATTERY_TOLERANCE_MM.value} mm of the sourced inputs\n`);
console.log(
  pad("car", 38) + rpad("wb", 6) + rpad("closed", 8) + rpad("viol", 6) +
  rpad("clamp", 7) + rpad("parts", 7) + rpad("Δmax", 8) + rpad("within", 8) +
  rpad("mass", 8) + rpad("gap", 9),
);
console.log("-".repeat(105));
for (let i = 0; i < rows.length; i++) {
  const r = rows[i]!, e = entries[i]!;
  if (r.error) {
    console.log(pad(r.name, 38) + " THREW: " + r.error);
    continue;
  }
  console.log(
    pad(r.name, 38) +
    rpad(String(e.spec.wheelbase.value), 6) +
    rpad(String(r.closed), 8) +
    rpad(String(r.violations), 6) +
    rpad(String(r.clamps), 7) +
    rpad(String(r.placed), 7) +
    rpad(r.worstDelta.toFixed(2), 8) +
    rpad(r.within ? "yes" : "NO", 8) +
    rpad(r.massKg.toFixed(0), 8) +
    rpad(r.targetGap.toFixed(0), 9),
  );
}

const threw = rows.filter((r) => r.error);
const outside = rows.filter((r) => !r.error && !r.within);
const open = rows.filter((r) => !r.error && !r.closed);

console.log("\n--- verdict ---");
console.log(`crashed                   ${threw.length} of ${rows.length}`);
console.log(`hard points within ±${BATTERY_TOLERANCE_MM.value} mm  ${rows.length - threw.length - outside.length} of ${rows.length}`);
console.log(`packaging solve closed    ${rows.length - threw.length - open.length} of ${rows.length}`);
if (outside.length > 0) {
  console.log("\noutside tolerance:");
  for (const r of outside) console.log(`  ${r.name}: ${r.worstDelta.toFixed(2)} mm at ${r.worstLabel}`);
}
if (open.length > 0) {
  console.log("\nsolve did not close (typed violations, not crashes):");
  for (const r of open) {
    const kinds = [...r.byKind].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${n} ${k}`).join(", ");
    console.log(`  ${pad(r.name, 38)} ${kinds}`);
  }
}
console.log(
  "\nDeltas are capability visibility, not a pass mark. A car that lands its\n" +
  "wheels and still raises violations is naming a rule that does not\n" +
  "generalise — which is the reason to run six cars instead of one.",
);

// Non-zero exit only on the two things that are unambiguously failures: a
// crash, or a hard point outside tolerance. Typed violations are a report.
if (threw.length > 0 || outside.length > 0) process.exitCode = 1;

// Wheel diameters, for the record: the acceptance rests on these.
console.log("\n--- tire diameters used (sidewall math on the sourced fitments) ---");
for (const e of entries) {
  console.log(
    pad(e.spec.name, 38) +
    `front ${tireDiameterOf(e.spec.frontTire).toFixed(1)} mm · rear ${tireDiameterOf(e.spec.rearTire).toFixed(1)} mm`,
  );
}
