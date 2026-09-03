/**
 * Car one — Mazda MX-5 (ND) 2.0 SkyActiv-G 184, re-entered from public specs.
 *
 * Every number carries its license. SOURCED values cite the page actually
 * consulted during the run (charge §13: never invent a citation); anything
 * the consulted sheets did not state is ASSUMED and says so.
 *
 * Consulted:
 *  - ultimatespecs.com "Mazda MX 5 Miata (ND) 2.0 SkyActiv-G 184 Specs"
 *    (dimensions, wheelbase, curb weight, power, tire fitment)
 *  - cars-data.com "Mazda MX-5" (front/rear track, fuel tank)
 *  - wheel-size.com / tirepressure.com 205/45R17 (load index 84 ≈ 500 kg)
 */

import type { Quantity } from "@car/schema";
import { assumed, sourced } from "@car/demand";

const US = "ultimatespecs.com — Mazda MX-5 Miata (ND) 2.0 SkyActiv-G 184";
const CD = "cars-data.com — Mazda MX-5 (ND)";
const TS = "wheel-size.com / tirepressure.com — 205/45R17 load index";

export interface Car1Spec {
  readonly name: string;
  readonly wheelbase: Quantity<"mm">;
  readonly overallLength: Quantity<"mm">;
  readonly overallWidth: Quantity<"mm">;
  readonly overallHeight: Quantity<"mm">;
  readonly frontTrack: Quantity<"mm">;
  readonly rearTrack: Quantity<"mm">;
  readonly curbMass: Quantity<"kg">;
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
  readonly groundClearance: Quantity<"mm">;
  readonly notes: string;
}

export const car1: Car1Spec = {
  name: "Mazda MX-5 (ND) 2.0 SkyActiv-G 184",
  wheelbase: sourced(2310, "mm", US, "90.94 in / 231.0 cm"),
  overallLength: sourced(3915, "mm", US, "154.13 in / 391.5 cm"),
  overallWidth: sourced(1735, "mm", US, "68.31 in / 173.5 cm"),
  overallHeight: sourced(1230, "mm", US, "48.43 in / 123.0 cm"),
  frontTrack: sourced(1495, "mm", CD),
  rearTrack: sourced(1505, "mm", CD),
  curbMass: sourced(1112, "kg", US, "2452 lbs"),
  power: sourced(135, "kW", US, "184 PS / 181 bhp"),
  displacementL: sourced(2.0, "L", US, "2.0 SkyActiv-G"),
  cylinders: sourced(4, "count", US, "inline four"),
  fuelTank: sourced(45, "L", CD),
  tire: {
    widthMm: sourced(205, "mm", US, "205/45WR17 Club/GT fitment"),
    aspectPct: sourced(45, "ratio", US, "205/45WR17"),
    rimIn: sourced(17, "count", US, "205/45WR17"),
    loadIndex: sourced(84, "count", TS, "84 ≈ 1102 lbs / 500 kg"),
  },
  groundClearance: assumed(135, "mm", "searched, not stated on the consulted sheets — typical ND figure pending a citable source"),
  notes:
    "Longitudinal front engine, rear drive, six-speed manual. Values above " +
    "are exactly the consulted sheets' figures; the acceptance tolerance " +
    "applies to DERIVED hard points, inputs are exact (charge §12).",
};
