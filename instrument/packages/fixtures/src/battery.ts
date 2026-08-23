/**
 * The six-car battery (charge §12): six real cars re-entered from public specs,
 * chosen to stress different corners of one grammar — a roadster, a transverse
 * hatch, a longitudinal sedan, a tall SUV, a mid-engine supercar, and a
 * body-on-frame pickup. If the type library needs a special case, one of these
 * six will find it.
 *
 * LICENSING, and read this before trusting a number. Every value carries its
 * license. SOURCED cites the page actually consulted; ASSUMED says nobody
 * consulted anything. In THIS run the egress proxy blocked direct page fetches
 * (encycarpedia.com, en.wikipedia.org and the rest all returned
 * EGRESS_BLOCKED), and only the search index was reachable. So a SOURCED value
 * here means: the search index returned that figure attributed to that named
 * page, and the citation says so with "via search index". That is weaker than
 * reading the page and it is recorded as exactly what it is, because the
 * alternative — writing the citation as if the page had been opened — is the
 * one thing the charge forbids outright.
 *
 * What the acceptance test actually rests on is narrow and fully sourced:
 * wheelbase, front and rear track, and tire size. Those four fix every hard
 * point the ±15 mm tolerance is measured against. Powertrain and packaging
 * figures that the searches did not return are ASSUMED and say so; they shape
 * the package, not the acceptance.
 */

import type { Quantity } from "@car/schema";
import { assumed, sourced } from "@car/demand";
import { shoeboxV16 } from "./shoebox-v16.js";

export interface TireSpec {
  readonly widthMm: Quantity<"mm">;
  readonly aspectPct: Quantity<"ratio">;
  readonly rimIn: Quantity<"count">;
  readonly loadIndex: Quantity<"count">;
}

/** Measured public numbers only. Nothing here is an authoring decision. */
export interface PublicSpec {
  readonly key: string;
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
  readonly frontTire: TireSpec;
  readonly rearTire: TireSpec;
  readonly groundClearance: Quantity<"mm">;
  /** Only ever multiplied by a SOURCED Cd for drag; never read off the map. */
  readonly dragCoefficient: Quantity<"ratio">;
  readonly notes: string;
}

/**
 * What the author entered, as opposed to what was measured. All ASSUMED by
 * construction: these are architecture facts a spec sheet does not carry, and
 * the builder treats every car's answers identically.
 */
export interface EnteredLayout {
  readonly engineLayout: "I" | "V" | "flat";
  readonly engineOrientation: "longitudinal" | "transverse";
  readonly transmissionType: "manual" | "auto" | "dct" | "cvt" | "ev-reduction";
  readonly frontArchitecture: "strut" | "double-wishbone" | "multilink" | "twist-beam" | "solid-axle";
  readonly rearArchitecture: "strut" | "double-wishbone" | "multilink" | "twist-beam" | "solid-axle";
  readonly seats: Quantity<"count">;
}

export interface BatteryEntry {
  readonly spec: PublicSpec;
  readonly layout: EnteredLayout;
}

// ---------------------------------------------------------------------------
// Citations. Each names the page the search index attributed the figure to.
// ---------------------------------------------------------------------------
const VIA = "via search index; direct fetch blocked by this run's egress proxy";
const ENCY_GTI = `encycarpedia.com — Volkswagen Golf GTI (Mk8) 2020-2024 (${VIA})`;
const WIKI_GOLF8 = `en.wikipedia.org — Volkswagen Golf Mk8 (${VIA})`;
const WHEELSIZE_GTI = `wheel-size.com / tirewheelguide.com — Golf GTI Mk8 (CD1) fitment (${VIA})`;
const CG_M3 = `carsguide.com.au — BMW M3 dimensions 2021 (${VIA})`;
const AUTODATA_M3 = `auto-data.net — BMW M3 (G80) 3.0 (480 Hp) (${VIA})`;
const TIRESIZE_M3 = `tiresize.com / goodyear.com — 2021 BMW M3 OE fitment (${VIA})`;
const CARCONN_RAV4 = `thecarconnection.com — 2023 Toyota RAV4 specifications (${VIA})`;
const CARSGUIDE_RAV4 = `carsguide.com.au — Toyota RAV4 dimensions 2023 (${VIA})`;
const TIRESIZE_RAV4 = `tiresize.com / michelinman.com — 2023 RAV4 XLE Premium OE fitment (${VIA})`;
const DIM_HURACAN = `dimensions.com — Lamborghini Huracán EVO (LP 640-4) (${VIA})`;
const ZIG_HURACAN = `zigwheels.com / 91wheels.com — Lamborghini Huracán EVO specifications (${VIA})`;
const TIRESIZE_HURACAN = `tiresize.com / bigotires.com — 2020 Huracán EVO OE fitment (${VIA})`;
const DIM_F150 = `dimensions.com — Ford F-150 SuperCrew Short Bed (P702, 14th gen) (${VIA})`;
const USNEWS_F150 = `cars.usnews.com — 2023 Ford F-150 LARIAT 4WD SuperCrew 5.5' Box (${VIA})`;
const NSFORD_F150 = `nsford.com — 2023 Ford F-150 dimensions (${VIA})`;
const TIRESIZE_F150 = `tiresize.com / michelinman.com — 2023 F-150 XLT 4x4 OE fitment (${VIA})`;

const US_MX5 = "ultimatespecs.com — Mazda MX-5 Miata (ND) 2.0 SkyActiv-G 184";
const CD_MX5 = "cars-data.com — Mazda MX-5 (ND)";
const TS_MX5 = "wheel-size.com / tirepressure.com — 205/45R17 load index";

/** No source found in this run — the charge says say so, not bury it. */
const NOSRC = "no source found in this run's searches — entered by the author";

const tire = (
  w: number, a: number, rim: number, load: number, src: string, loadSrc?: string,
): TireSpec => ({
  widthMm: sourced(w, "mm", src, `${w}/${a}R${rim}`),
  aspectPct: sourced(a, "ratio", src, `${w}/${a}R${rim}`),
  rimIn: sourced(rim, "count", src, `${w}/${a}R${rim}`),
  loadIndex: loadSrc ? sourced(load, "count", loadSrc) : assumed(load, "count", `${NOSRC} — load index for ${w}/${a}R${rim}`),
});

// ---------------------------------------------------------------------------
// Car 1 — Mazda MX-5 (ND). Front engine, rear drive, two seats, small.
// ---------------------------------------------------------------------------
export const mx5: PublicSpec = {
  key: "mx5",
  name: "Mazda MX-5 (ND) 2.0 SkyActiv-G 184",
  wheelbase: sourced(2310, "mm", US_MX5, "90.94 in / 231.0 cm"),
  overallLength: sourced(3915, "mm", US_MX5, "154.13 in / 391.5 cm"),
  overallWidth: sourced(1735, "mm", US_MX5, "68.31 in / 173.5 cm"),
  overallHeight: sourced(1230, "mm", US_MX5, "48.43 in / 123.0 cm"),
  frontTrack: sourced(1495, "mm", CD_MX5),
  rearTrack: sourced(1505, "mm", CD_MX5),
  curbMass: sourced(1058, "kg", US_MX5),
  power: sourced(135, "kW", US_MX5, "184 PS"),
  displacementL: sourced(2.0, "L", US_MX5),
  cylinders: sourced(4, "count", US_MX5),
  fuelTank: sourced(45, "L", CD_MX5),
  frontTire: tire(205, 45, 17, 84, TS_MX5, TS_MX5),
  rearTire: tire(205, 45, 17, 84, TS_MX5, TS_MX5),
  groundClearance: assumed(135, "mm", `${NOSRC} — MX-5 static clearance`),
  dragCoefficient: assumed(0.35, "ratio", `${NOSRC} — the searches returned 0.32 for the NA/NB only, which is a different car`),
  notes: "Smallest wheelbase in the battery: the package has nowhere to hide.",
};

// ---------------------------------------------------------------------------
// Car 2 — VW Golf GTI (Mk8). Transverse, front drive, five seats.
// ---------------------------------------------------------------------------
export const golfGti: PublicSpec = {
  key: "golf-gti",
  name: "Volkswagen Golf GTI (Mk8)",
  wheelbase: sourced(2626, "mm", ENCY_GTI, "103.4 in"),
  overallLength: sourced(4284, "mm", WIKI_GOLF8, "Golf Mk8 hatch"),
  overallWidth: sourced(1789, "mm", WIKI_GOLF8),
  overallHeight: sourced(1456, "mm", WIKI_GOLF8),
  frontTrack: sourced(1534, "mm", ENCY_GTI, "60.4 in"),
  rearTrack: sourced(1514, "mm", ENCY_GTI, "59.6 in"),
  curbMass: sourced(1463, "kg", ENCY_GTI, "3225 lb"),
  power: assumed(180, "kW", `${NOSRC} — Mk8 GTI output`),
  displacementL: assumed(2.0, "L", `${NOSRC} — EA888`),
  cylinders: assumed(4, "count", NOSRC),
  fuelTank: assumed(50, "L", NOSRC),
  frontTire: tire(225, 40, 18, 92, WHEELSIZE_GTI),
  rearTire: tire(225, 40, 18, 92, WHEELSIZE_GTI),
  groundClearance: assumed(140, "mm", NOSRC),
  dragCoefficient: assumed(0.31, "ratio", `${NOSRC} — the search returned 0.31 for a "Golf GTI 02", which may be an earlier generation`),
  notes: "Transverse engine over the front axle: the setback rule runs negative here and must not be special-cased.",
};

// ---------------------------------------------------------------------------
// Car 3 — BMW M3 (G80). Longitudinal six, rear drive, staggered tires.
// ---------------------------------------------------------------------------
export const m3: PublicSpec = {
  key: "m3-g80",
  name: "BMW M3 (G80)",
  wheelbase: sourced(2857, "mm", CG_M3, "112.5 in"),
  overallLength: sourced(4794, "mm", CG_M3, "188.7 in"),
  overallWidth: sourced(1903, "mm", CG_M3, "74.9 in"),
  overallHeight: sourced(1434, "mm", CG_M3, "56.4 in"),
  frontTrack: sourced(1617, "mm", CG_M3, "63.7 in"),
  rearTrack: sourced(1605, "mm", CG_M3, "63.2 in"),
  curbMass: sourced(1705, "kg", CG_M3, "3759 lb, base M3"),
  power: sourced(358, "kW", AUTODATA_M3, "480 hp"),
  displacementL: sourced(3.0, "L", AUTODATA_M3),
  cylinders: assumed(6, "count", `${NOSRC} — the page title gave 3.0 and 480 hp but not the cylinder count`),
  fuelTank: sourced(59, "L", CG_M3, "15.6 gal"),
  frontTire: tire(275, 35, 19, 100, TIRESIZE_M3),
  rearTire: tire(285, 30, 20, 103, TIRESIZE_M3),
  groundClearance: assumed(120, "mm", NOSRC),
  dragCoefficient: sourced(0.33, "ratio", CG_M3),
  notes: "Staggered fitment front to rear, and the only car here with two different rim diameters.",
};

// ---------------------------------------------------------------------------
// Car 4 — Toyota RAV4 (2023). Tall, high clearance, five seats.
// ---------------------------------------------------------------------------
export const rav4: PublicSpec = {
  key: "rav4",
  name: "Toyota RAV4 (2023, XLE)",
  wheelbase: sourced(2690, "mm", CARCONN_RAV4, "105.9 in"),
  overallLength: sourced(4595, "mm", CARCONN_RAV4, "180.9 in"),
  overallWidth: sourced(1854, "mm", CARCONN_RAV4, "73.0 in"),
  overallHeight: sourced(1742, "mm", CARCONN_RAV4, "68.6 in"),
  frontTrack: sourced(1590, "mm", CARCONN_RAV4, "62.6 in"),
  rearTrack: sourced(1608, "mm", CARCONN_RAV4, "63.3 in"),
  curbMass: sourced(1640, "kg", CARCONN_RAV4, "3615 lb"),
  power: assumed(150, "kW", NOSRC),
  displacementL: assumed(2.5, "L", NOSRC),
  cylinders: assumed(4, "count", NOSRC),
  fuelTank: sourced(54.9, "L", CARCONN_RAV4, "14.5 US gal"),
  frontTire: tire(225, 60, 18, 100, TIRESIZE_RAV4),
  rearTire: tire(225, 60, 18, 100, TIRESIZE_RAV4),
  groundClearance: sourced(206, "mm", CARSGUIDE_RAV4, "8.1 in — the low end of the 8.1-8.6 in the sheet gives across trims"),
  dragCoefficient: assumed(0.35, "ratio", `${NOSRC} — the searches returned no Cd for this car`),
  notes: "Tallest and highest-riding: every clearance rule that was tuned on a sports car gets tested here.",
};

// ---------------------------------------------------------------------------
// Car 5 — Lamborghini Huracán EVO. Mid engine, ten cylinders, very wide.
// ---------------------------------------------------------------------------
export const huracan: PublicSpec = {
  key: "huracan",
  name: "Lamborghini Huracán EVO",
  wheelbase: sourced(2620, "mm", DIM_HURACAN, "8 ft 7.2 in"),
  overallLength: sourced(4520, "mm", DIM_HURACAN, "14 ft 10 in"),
  overallWidth: sourced(1930, "mm", DIM_HURACAN, "6 ft 4.1 in"),
  overallHeight: sourced(1170, "mm", DIM_HURACAN, "3 ft 9.9 in"),
  frontTrack: sourced(1668, "mm", ZIG_HURACAN),
  rearTrack: sourced(1620, "mm", ZIG_HURACAN),
  curbMass: sourced(1389, "kg", ZIG_HURACAN, "3062 lb"),
  power: sourced(449, "kW", ZIG_HURACAN, "602.11 bhp"),
  displacementL: sourced(5.204, "L", ZIG_HURACAN, "5204 cc"),
  cylinders: assumed(10, "count", `${NOSRC} — the sheet gave displacement and power, not the cylinder count`),
  fuelTank: sourced(83, "L", ZIG_HURACAN),
  frontTire: tire(245, 30, 20, 90, TIRESIZE_HURACAN),
  rearTire: tire(305, 30, 20, 104, TIRESIZE_HURACAN),
  groundClearance: assumed(105, "mm", NOSRC),
  dragCoefficient: assumed(0.36, "ratio", `${NOSRC} — the searches returned no Cd for this car`),
  notes: "Mid engine: the setback rule has to put a V10 behind the seats without a branch for it.",
};

// ---------------------------------------------------------------------------
// Car 6 — Ford F-150 SuperCrew. Body-on-frame, huge, two rows.
// ---------------------------------------------------------------------------
export const f150: PublicSpec = {
  key: "f150",
  name: "Ford F-150 SuperCrew 5.5' box (2023)",
  wheelbase: sourced(3693, "mm", USNEWS_F150, "145.4 in"),
  overallLength: sourced(5885, "mm", USNEWS_F150, "231.7 in"),
  overallWidth: sourced(2029, "mm", DIM_F150, "6 ft 7.9 in"),
  overallHeight: sourced(1915, "mm", DIM_F150, "6 ft 3.4 in"),
  frontTrack: sourced(1725, "mm", NSFORD_F150, "67.9 in"),
  rearTrack: sourced(1735, "mm", NSFORD_F150, "68.3 in"),
  curbMass: sourced(2241, "kg", USNEWS_F150, "4941 lb"),
  power: assumed(298, "kW", NOSRC),
  displacementL: assumed(3.5, "L", NOSRC),
  cylinders: assumed(6, "count", NOSRC),
  fuelTank: sourced(98.4, "L", USNEWS_F150, "26 US gal"),
  frontTire: tire(265, 70, 17, 115, TIRESIZE_F150),
  rearTire: tire(265, 70, 17, 115, TIRESIZE_F150),
  groundClearance: assumed(240, "mm", NOSRC),
  dragCoefficient: assumed(0.44, "ratio", `${NOSRC} — the searches returned no Cd for this car`),
  notes: "Longest wheelbase and heaviest: the rail and crossmember rules scale here or they do not scale.",
};

const L = (
  engineLayout: EnteredLayout["engineLayout"],
  engineOrientation: EnteredLayout["engineOrientation"],
  transmissionType: EnteredLayout["transmissionType"],
  frontArchitecture: EnteredLayout["frontArchitecture"],
  rearArchitecture: EnteredLayout["rearArchitecture"],
  seats: number,
  why: string,
): EnteredLayout => ({
  engineLayout, engineOrientation, transmissionType,
  frontArchitecture, rearArchitecture,
  seats: assumed(seats, "count", `entered layout — ${why}`),
});

/**
 * The battery, in order. Every entry is a public spec plus an entered layout,
 * and every one goes through the same builder with the same rules.
 */
export const battery: readonly BatteryEntry[] = [
  { spec: mx5, layout: L("I", "longitudinal", "manual", "double-wishbone", "multilink", 2, "front-engine rear-drive roadster") },
  { spec: golfGti, layout: L("I", "transverse", "dct", "strut", "multilink", 5, "transverse front-drive hatch") },
  { spec: m3, layout: L("I", "longitudinal", "auto", "double-wishbone", "multilink", 5, "longitudinal rear-drive sedan") },
  { spec: rav4, layout: L("I", "transverse", "auto", "strut", "multilink", 5, "transverse crossover") },
  { spec: huracan, layout: L("V", "longitudinal", "dct", "double-wishbone", "double-wishbone", 2, "mid-engine V10") },
  { spec: f150, layout: L("V", "longitudinal", "auto", "double-wishbone", "solid-axle", 5, "body-on-frame pickup") },
];

// ---------------------------------------------------------------------------
// The shoebox, wearing the same clothes (charge §12)
// ---------------------------------------------------------------------------
// The stress config is not a seventh car; it is the same six-car path with
// absurd numbers in it. Expressing it as a PublicSpec is the whole test: if
// the builder needed to know this one was invented, it would have to ask.
const SHOE = "shoebox V16 stress config — invented on purpose, charge §12";
export const shoeboxSpec: PublicSpec = {
  key: "shoebox-v16",
  name: shoeboxV16.name,
  wheelbase: shoeboxV16.wheelbase,
  overallLength: assumed(3600, "mm", `${SHOE} — shorter than the wheelbase deserves`),
  overallWidth: assumed(2000, "mm", SHOE),
  overallHeight: assumed(1150, "mm", SHOE),
  frontTrack: shoeboxV16.frontTrack,
  rearTrack: shoeboxV16.rearTrack,
  curbMass: shoeboxV16.curbMassTarget,
  power: shoeboxV16.power,
  displacementL: shoeboxV16.displacementL,
  cylinders: shoeboxV16.cylinders,
  fuelTank: shoeboxV16.fuelTank,
  frontTire: shoeboxV16.tire,
  rearTire: shoeboxV16.tire,
  groundClearance: assumed(90, "mm", `${SHOE} — scraping`),
  dragCoefficient: assumed(0.5, "ratio", `${SHOE} — it is a shoebox`),
  notes: shoeboxV16.notes,
};

export const shoeboxEntry: BatteryEntry = {
  spec: shoeboxSpec,
  layout: L("V", "longitudinal", "auto", "double-wishbone", "double-wishbone", 2,
            "V16 longitudinal, because the schema does not flinch"),
};
