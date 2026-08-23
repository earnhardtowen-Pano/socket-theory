/**
 * makeWheelTire — wheel + tire from the three sidewall numbers plus load index
 * (type library, charge §5 "Wheels / tires").
 *
 * A tire IS its sidewall designation: section width (mm), aspect (the sidewall
 * percent number), rim diameter (inches) — plus the load index. Overall
 * diameter is DERIVED with the chain shown:
 *
 *   diameter = rim × 25.4 + 2 × width × aspect/100
 *
 * Load capacity comes from the standard load-index table, SOURCED — the table
 * is public and every transcribed value below was cross-verified against the
 * cited charts on 2026-08-22. The ledger consumes loadCapacityKg for the
 * per-tire load check (charge §8).
 *
 * Datum: wheel center. Spin axis +Y (across the car); the mate flips sides.
 * World-aligned part frame; units mm, kg.
 */

import type {
  BoxShape,
  DemandRecord,
  IdAllocator,
  PartInstance,
  PortRecord,
  Quantity,
} from "@car/schema";
import { demand, derived, port, qAdd, qDiv, qMul, qScale, sourced, assumed } from "@car/demand";
import { npow, nround } from "@car/num";

// ---------------------------------------------------------------------------
// Parameters
// ---------------------------------------------------------------------------

export interface WheelTireParams {
  /** Tire section width, the first sidewall number (e.g. 205 for 205/55R16). */
  readonly sectionWidth: Quantity<"mm">;
  /** Aspect ratio, the second sidewall number as printed (55 means 55%). */
  readonly aspectPercent: Quantity<"ratio">;
  /** Rim diameter in inches, the third sidewall number (e.g. 16). */
  readonly rimDiameterIn: Quantity<"count">;
  /** Load index as printed on the sidewall (e.g. 91). Table spans 60–125. */
  readonly loadIndex: Quantity<"count">;
  /** Known assembly mass, if the caller has one; otherwise a derived estimate. */
  readonly massOverride?: Quantity<"kg">;
}

export interface WheelTireDims {
  readonly overallDiameter: Quantity<"mm">;
  readonly sectionWidth: Quantity<"mm">;
  readonly rimDiameterMm: Quantity<"mm">;
  readonly sidewallHeight: Quantity<"mm">;
  /** From the standard load-index table — the mass ledger's per-tire check. */
  readonly loadCapacityKg: Quantity<"kg">;
  readonly mass: Quantity<"kg">;
}

export interface WheelTireInstance extends PartInstance {
  readonly dims: WheelTireDims;
}

// ---------------------------------------------------------------------------
// The standard load-index table, LI 60–125, SOURCED.
// Every value below was cross-verified in retrieved excerpts on 2026-08-22;
// the table is the industry-standard ETRTO/TRA load-index table.
// ---------------------------------------------------------------------------

const LI_SOURCE =
  "Standard tyre load-index table (ETRTO/TRA), LI 60–125, kg per tire";
const LI_CITE =
  "Cross-verified 2026-08-22 across public charts: TyreSizeCalculator.com 'Tire Load Index Chart'; " +
  "tirepressure.com 'Tire Load Index Chart'; Axon Tire (Titan / Alliance) load-index chart PDFs; " +
  "Runflat International 'Tyre Load Speed Index' PDF; CVRT.ie tyre load data tables; " +
  "spot values 91 = 615 kg (Kal Tire, Pirelli), 80 = 450 kg, 100 = 800 kg confirmed independently.";

/** First load index in the transcribed table. */
const LI_TABLE_START = derived(60, "count", "first load index in the transcribed standard table (LI 60–125)");

/**
 * kg capacities for LI 60..125 in order — a sourced() call per entry so every
 * value carries the table's license (and the lint sees the factory directly).
 */
const LOAD_INDEX_KG: readonly Quantity<"kg">[] = [
  sourced(250, "kg", LI_SOURCE, LI_CITE),  // LI 60
  sourced(257, "kg", LI_SOURCE, LI_CITE),  // LI 61
  sourced(265, "kg", LI_SOURCE, LI_CITE),  // LI 62
  sourced(272, "kg", LI_SOURCE, LI_CITE),  // LI 63
  sourced(280, "kg", LI_SOURCE, LI_CITE),  // LI 64
  sourced(290, "kg", LI_SOURCE, LI_CITE),  // LI 65
  sourced(300, "kg", LI_SOURCE, LI_CITE),  // LI 66
  sourced(307, "kg", LI_SOURCE, LI_CITE),  // LI 67
  sourced(315, "kg", LI_SOURCE, LI_CITE),  // LI 68
  sourced(325, "kg", LI_SOURCE, LI_CITE),  // LI 69
  sourced(335, "kg", LI_SOURCE, LI_CITE),  // LI 70
  sourced(345, "kg", LI_SOURCE, LI_CITE),  // LI 71
  sourced(355, "kg", LI_SOURCE, LI_CITE),  // LI 72
  sourced(365, "kg", LI_SOURCE, LI_CITE),  // LI 73
  sourced(375, "kg", LI_SOURCE, LI_CITE),  // LI 74
  sourced(387, "kg", LI_SOURCE, LI_CITE),  // LI 75
  sourced(400, "kg", LI_SOURCE, LI_CITE),  // LI 76
  sourced(412, "kg", LI_SOURCE, LI_CITE),  // LI 77
  sourced(425, "kg", LI_SOURCE, LI_CITE),  // LI 78
  sourced(437, "kg", LI_SOURCE, LI_CITE),  // LI 79
  sourced(450, "kg", LI_SOURCE, LI_CITE),  // LI 80
  sourced(462, "kg", LI_SOURCE, LI_CITE),  // LI 81
  sourced(475, "kg", LI_SOURCE, LI_CITE),  // LI 82
  sourced(487, "kg", LI_SOURCE, LI_CITE),  // LI 83
  sourced(500, "kg", LI_SOURCE, LI_CITE),  // LI 84
  sourced(515, "kg", LI_SOURCE, LI_CITE),  // LI 85
  sourced(530, "kg", LI_SOURCE, LI_CITE),  // LI 86
  sourced(545, "kg", LI_SOURCE, LI_CITE),  // LI 87
  sourced(560, "kg", LI_SOURCE, LI_CITE),  // LI 88
  sourced(580, "kg", LI_SOURCE, LI_CITE),  // LI 89
  sourced(600, "kg", LI_SOURCE, LI_CITE),  // LI 90
  sourced(615, "kg", LI_SOURCE, LI_CITE),  // LI 91
  sourced(630, "kg", LI_SOURCE, LI_CITE),  // LI 92
  sourced(650, "kg", LI_SOURCE, LI_CITE),  // LI 93
  sourced(670, "kg", LI_SOURCE, LI_CITE),  // LI 94
  sourced(690, "kg", LI_SOURCE, LI_CITE),  // LI 95
  sourced(710, "kg", LI_SOURCE, LI_CITE),  // LI 96
  sourced(730, "kg", LI_SOURCE, LI_CITE),  // LI 97
  sourced(750, "kg", LI_SOURCE, LI_CITE),  // LI 98
  sourced(775, "kg", LI_SOURCE, LI_CITE),  // LI 99
  sourced(800, "kg", LI_SOURCE, LI_CITE),  // LI 100
  sourced(825, "kg", LI_SOURCE, LI_CITE),  // LI 101
  sourced(850, "kg", LI_SOURCE, LI_CITE),  // LI 102
  sourced(875, "kg", LI_SOURCE, LI_CITE),  // LI 103
  sourced(900, "kg", LI_SOURCE, LI_CITE),  // LI 104
  sourced(925, "kg", LI_SOURCE, LI_CITE),  // LI 105
  sourced(950, "kg", LI_SOURCE, LI_CITE),  // LI 106
  sourced(975, "kg", LI_SOURCE, LI_CITE),  // LI 107
  sourced(1000, "kg", LI_SOURCE, LI_CITE), // LI 108
  sourced(1030, "kg", LI_SOURCE, LI_CITE), // LI 109
  sourced(1060, "kg", LI_SOURCE, LI_CITE), // LI 110
  sourced(1090, "kg", LI_SOURCE, LI_CITE), // LI 111
  sourced(1120, "kg", LI_SOURCE, LI_CITE), // LI 112
  sourced(1150, "kg", LI_SOURCE, LI_CITE), // LI 113
  sourced(1180, "kg", LI_SOURCE, LI_CITE), // LI 114
  sourced(1215, "kg", LI_SOURCE, LI_CITE), // LI 115
  sourced(1250, "kg", LI_SOURCE, LI_CITE), // LI 116
  sourced(1285, "kg", LI_SOURCE, LI_CITE), // LI 117
  sourced(1320, "kg", LI_SOURCE, LI_CITE), // LI 118
  sourced(1360, "kg", LI_SOURCE, LI_CITE), // LI 119
  sourced(1400, "kg", LI_SOURCE, LI_CITE), // LI 120
  sourced(1450, "kg", LI_SOURCE, LI_CITE), // LI 121
  sourced(1500, "kg", LI_SOURCE, LI_CITE), // LI 122
  sourced(1550, "kg", LI_SOURCE, LI_CITE), // LI 123
  sourced(1600, "kg", LI_SOURCE, LI_CITE), // LI 124
  sourced(1650, "kg", LI_SOURCE, LI_CITE), // LI 125
];

/** Look up a load index in the standard table. Throws outside LI 60–125. */
export function loadIndexCapacityKg(loadIndex: Quantity<"count">): Quantity<"kg"> {
  const idxRaw = loadIndex.value;
  const idx = nround(idxRaw);
  if (idx !== idxRaw) {
    throw new Error(`makeWheelTire: load index must be an integer, got ${idxRaw}`);
  }
  const offset = idx - LI_TABLE_START.value;
  const entry = LOAD_INDEX_KG[offset];
  if (offset < 0 || entry === undefined) {
    throw new Error(
      `makeWheelTire: load index ${idx} outside the transcribed table (LI ${LI_TABLE_START.value}–${LI_TABLE_START.value + LOAD_INDEX_KG.length - 1}) — extend the table from the cited source`,
    );
  }
  return entry;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function makeWheelTire(params: WheelTireParams, alloc: IdAllocator): WheelTireInstance {
  const { sectionWidth, aspectPercent, rimDiameterIn, loadIndex } = params;
  if (sectionWidth.value <= 0 || aspectPercent.value <= 0 || rimDiameterIn.value <= 0) {
    throw new Error("makeWheelTire: sidewall numbers must be positive");
  }

  // --- overall diameter: the exact sidewall formula, chain composed ---------
  const inchMm = derived(25.4, "ratio", "1 in = 25.4 mm exactly (international inch definition, 1959)");
  const rimDiameterMm = qMul(rimDiameterIn, inchMm, "mm");
  const percent = derived(100, "ratio", "aspect number is sidewall height as a percent of section width — divide by 100");
  const sidewallHeight = qDiv(qMul(sectionWidth, aspectPercent, "mm"), percent, "mm");
  const twoSidewalls = derived(2, "count", "a tire stands on two sidewalls: one above the rim, one below");
  const overallDiameter = qAdd(rimDiameterMm, qScale(sidewallHeight, twoSidewalls));
  // chain reads: add(rim×25.4, scale(width×aspect/100, 2)) = rim×25.4 + 2×width×aspect/100

  // --- load capacity from the standard table (SOURCED) ----------------------
  const loadCapacityKg = loadIndexCapacityKg(loadIndex);

  // --- mass: sourced baseline assembly, scaled by diameter ------------------
  const baselineMass = sourced(
    16.4,
    "kg",
    "Measured 205/55R16 tire + 6J×16 steel wheel assembly mass",
    "myturbodiesel.com thread 'Wheel and tyre weight surprise': 205/55R16 tire + 6J×16 VW steel wheel = 16.4 kg measured; " +
      "tire alone 18–23 lb (8.2–10.4 kg) per axlewise.com 'Tire Weight by Size' chart. Retrieved 2026-08-22.",
  );
  const baselineDiameter = derived(
    631.9,
    "mm",
    "overall diameter of the 205/55R16 mass-baseline tire: 16×25.4 + 2×205×0.55 = 631.9 mm",
  );
  const massScaleExp = assumed(
    2,
    "ratio",
    "ASSUMED: wheel+tire assembly mass scales with (overall diameter)^2 at similar construction — " +
      "modeling choice, no source found this run; pass massOverride for a known wheel",
  );
  const mass =
    params.massOverride ??
    derived(
      baselineMass.value * npow(overallDiameter.value / baselineDiameter.value, massScaleExp.value),
      "kg",
      `assembly mass = baseline × (diameter/baselineDiameter)^exp; baseline = ${baselineMass.value} kg [${baselineMass.license.tag}], ` +
        `diameter = ${overallDiameter.value.toFixed(1)} mm [${overallDiameter.license.tag}], baselineDiameter = ${baselineDiameter.value} mm [${baselineDiameter.license.tag}], ` +
        `exp = ${massScaleExp.value} [${massScaleExp.license.tag}]`,
    );

  // --- geometry: datum at wheel center, spin axis +Y ------------------------
  const radius = overallDiameter.value / 2;
  const envelope: BoxShape = {
    kind: "box",
    size: [overallDiameter, sectionWidth, overallDiameter],
    offset: [0, 0, 0],
  };

  const ports: PortRecord[] = [
    port(alloc.next("port"), "hub", "axis", { origin: [0, 0, 0], xAxis: [0, 1, 0], zAxis: [0, 0, 1] }),
    port(alloc.next("port"), "ground-contact", "point", { origin: [0, 0, -radius], xAxis: [1, 0, 0], zAxis: [0, 0, 1] }),
  ];

  const demands: DemandRecord[] = [
    demand({
      id: alloc.next("demand"),
      principal: "physics",
      reason: "solid bodies exclude one another: the wheel+tire claims its rolling cylinder (blocked as its bounding box)",
      kind: "envelope",
      shape: envelope,
    }),
  ];

  const dims: WheelTireDims = {
    overallDiameter,
    sectionWidth,
    rimDiameterMm,
    sidewallHeight,
    loadCapacityKg,
    mass,
  };

  return {
    id: alloc.next("part"),
    label: `wheel-tire ${sectionWidth.value}/${aspectPercent.value}R${rimDiameterIn.value} LI${loadIndex.value}`,
    ports,
    demands,
    mass,
    envelope,
    dims,
  };
}
