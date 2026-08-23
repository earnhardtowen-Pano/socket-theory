/**
 * The shoebox V16 — the acceptance stress config (charge §12): an absurd car
 * that must package clean with no special-casing anywhere. Every value is
 * ASSUMED, loudly: nothing here has a source because nothing here exists.
 * The parametric grammar packages it exactly like something real — that is
 * the point.
 */

import type { Quantity } from "@car/schema";
import { assumed } from "@car/demand";

const WHY = "shoebox V16 stress config — invented on purpose, charge §12";

export interface ShoeboxSpec {
  readonly name: string;
  readonly wheelbase: Quantity<"mm">;
  readonly frontTrack: Quantity<"mm">;
  readonly rearTrack: Quantity<"mm">;
  readonly curbMassTarget: Quantity<"kg">;
  readonly power: Quantity<"kW">;
  readonly displacementL: Quantity<"L">;
  readonly cylinders: Quantity<"count">;
  readonly fuelTank: Quantity<"L">;
  readonly tire: {
    readonly widthMm: Quantity<"mm">;
    readonly aspectPct: Quantity<"ratio">;
    readonly rimIn: Quantity<"count">;
    readonly loadIndex: Quantity<"count">;
  };
  readonly seats: Quantity<"count">;
  readonly notes: string;
}

export const shoeboxV16: ShoeboxSpec = {
  name: "Shoebox V16",
  wheelbase: assumed(1900, "mm", `${WHY} — a wheelbase shorter than the engine deserves`),
  frontTrack: assumed(1650, "mm", WHY),
  rearTrack: assumed(1700, "mm", WHY),
  curbMassTarget: assumed(1500, "kg", `${WHY} — optimistic, the ledger will show the gap`),
  power: assumed(735, "kW", `${WHY} — one thousand metric horses`),
  displacementL: assumed(8.0, "L", WHY),
  cylinders: assumed(16, "count", `${WHY} — V16, longitudinal, because the schema does not flinch`),
  fuelTank: assumed(90, "L", `${WHY} — it will need it`),
  tire: {
    widthMm: assumed(335, "mm", WHY),
    aspectPct: assumed(30, "ratio", WHY),
    rimIn: assumed(20, "count", WHY),
    loadIndex: assumed(97, "count", `${WHY} — 97 ≈ 730 kg per corner`),
  },
  seats: assumed(2, "count", WHY),
  notes:
    "All-ASSUMED ledger by construction. The solve must close or fail with " +
    "typed violations — never crash, never special-case (charge §12).",
};
