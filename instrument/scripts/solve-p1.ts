import { makeAllocator } from "@car/schema";
import { assembleCar } from "@car/types";
import { solve } from "@car/pack";
import { p1Config } from "@car/fixtures";

const alloc = makeAllocator();
const car = assembleCar(p1Config, alloc);
const result = solve(car.input);

console.log("parts:", car.input.parts.length, "mates:", car.input.mates.length,
            "members:", car.input.members.length, "worldDemands:", car.input.worldDemands.length);
console.log("closed:", result.closed, "| placements:", result.placements.size,
            "| clamps:", result.clamps.length, "| violations:", result.violations.length);
console.log("\n-- placements --");
for (const p of car.input.parts) {
  const pose = result.placements.get(p.id);
  console.log(" ", p.label.padEnd(28), pose ? pose.origin.map((v) => Math.round(v)).join(", ") : "UNPLACED");
}
console.log("\n-- violations --");
for (const v of result.violations.slice(0, 14)) console.log(` [${v.kind}]`, v.detail.slice(0, 150));
if (result.violations.length > 14) console.log(` ... ${result.violations.length - 14} more`);
