/**
 * makeEnergyStore — parametric energy stores (type library, charge §5).
 *
 * Two variants under one factory:
 *
 *   fuel-tank — volume = range / consumption. Consumption ARRIVES AS AN
 *     ASSUMED QUANTITY by design: it cannot be derived until the mass ledger
 *     and drag exist, so it iterates with the ledger exactly like the mass
 *     target (charge §5, §8). The assumption rides the derivation chain and
 *     is surfaced, never buried. Placement publishes a protected-zone demand
 *     under FMVSS 301 (law principal, cited inline).
 *
 *   ev-pack — kWh + cell format → pack thickness and plan area via SOURCED
 *     pack-level energy density (researched 2026-08-22, citations inline).
 *     Publishes the under-floor protected zone (FMVSS 305, law principal)
 *     and the "pack-top" port — THE H30 COUPLING, flagged loudly below.
 *
 * Datum (both variants): center of the bottom face, part frame world-aligned.
 * +X aft, +Y left, +Z up.
 *
 * UNIT CARRIER NOTE (surfaced, not buried): the frozen Unit set has no Wh/L
 * or Wh/kg member. Pack-level energy densities are carried as
 * Quantity<"ratio"> with the true unit stated in the source text and
 * restated in every derivation chain that consumes them.
 */

import type {
  BoxShape,
  DemandRecord,
  IdAllocator,
  PartInstance,
  PortRecord,
  Pt3,
  Quantity,
} from "@car/schema";
import {
  assumed,
  demand,
  derived,
  port,
  qAdd,
  qDiv,
  qMul,
  sourced,
} from "@car/demand";
import { nsqrt, PI } from "@car/num";

// ---------------------------------------------------------------------------
// Parameters
// ---------------------------------------------------------------------------

export interface FuelTankParams {
  readonly kind: "fuel-tank";
  /** Brief-principal range target. */
  readonly range: Quantity<"km">;
  /**
   * Fuel consumption — ASSUMED until mass and drag exist; iterates with the
   * ledger like the mass target (charge §5). Pass an assumed() quantity; the
   * assumption is carried and surfaced in every downstream chain.
   */
  readonly consumption: Quantity<"L/100km">;
  /** Tank internal height. Default ASSUMED 230 mm. */
  readonly height?: Quantity<"mm">;
}

export type CellFormat = "pouch" | "prismatic" | "cylindrical";

export interface EVPackParams {
  readonly kind: "ev-pack";
  readonly energy: Quantity<"kWh">;
  readonly format: CellFormat;
  /** Pack width between the sills. Default ASSUMED 1350 mm. */
  readonly packWidth?: Quantity<"mm">;
}

export type EnergyStoreParams = FuelTankParams | EVPackParams;

// ---------------------------------------------------------------------------
// Fuel tank
// ---------------------------------------------------------------------------

export interface FuelTankDims {
  readonly volume: Quantity<"L">;
  readonly length: Quantity<"mm">; // X
  readonly width: Quantity<"mm">; // Y
  readonly height: Quantity<"mm">; // Z
  /** The SOURCED fuel density used for the fuel mass — surfaced for the ledger. */
  readonly fuelDensity: Quantity<"kg/L">;
  readonly fuelMass: Quantity<"kg">;
  readonly shellMass: Quantity<"kg">;
  readonly mass: Quantity<"kg">;
  readonly protectedZoneStandoff: Quantity<"mm">;
}

export interface FuelTankInstance extends PartInstance {
  readonly storeKind: "fuel-tank";
  readonly dims: FuelTankDims;
}

export function makeFuelTank(params: FuelTankParams, alloc: IdAllocator): FuelTankInstance {
  const { range, consumption } = params;
  if (range.value <= 0 || consumption.value <= 0) {
    throw new Error(
      `makeFuelTank: range and consumption must be positive, got ${range.value} km, ${consumption.value} L/100km`,
    );
  }

  // volume = range * consumption / 100 — the /100 is the L/100km unit basis.
  // The consumption license (ASSUMED until the ledger closes) rides this chain.
  const volume = derived(
    (range.value * consumption.value) / 100,
    "L",
    `tank volume = range x consumption / 100km-basis; range = ${range.value} km [${range.license.tag}], ` +
      `consumption = ${consumption.value} L/100km [${consumption.license.tag}] — consumption is the ledger-iterated ` +
      `assumption: it cannot be derived until mass and drag exist`,
  );

  // --- box dims from volume --------------------------------------------------
  const height =
    params.height ??
    assumed(230, "mm", "flat under-floor/ahead-of-axle tank height — typical 200-250 mm; no citable source found this run");
  const planAspect = assumed(
    1.6,
    "ratio",
    "tank plan aspect width/length — tanks run wider than long ahead of the rear axle; no citable source found this run",
  );
  const litreToMm3 = derived(1000000, "mm3", "1 L = 10^6 mm3 (SI definition of the litre)");
  const volumeMm3 = qMul(volume, litreToMm3, "mm3");
  const planArea = qDiv(volumeMm3, height, "mm2");
  const width = derived(
    nsqrt(planArea.value * planAspect.value),
    "mm",
    `tank width = sqrt(planArea x aspect); planArea = ${planArea.value.toFixed(0)} mm2 [${planArea.license.tag}], ` +
      `aspect = ${planAspect.value} [${planAspect.license.tag}]`,
  );
  const length = qDiv(planArea, width, "mm");

  // --- mass ------------------------------------------------------------------
  const gasolineDensity = sourced(
    0.745,
    "kg/L",
    "Automotive gasoline density at 15 C",
    "EN 228 automotive petrol specification: density 0.720-0.775 kg/L at 15 C (Measurlabs, 'EN 228 Gasoline Testing Package'; " +
      "typical value 0.745 kg/L per MetaCAD, 'Density of Gasoline — kg/m3 and kg/L Table'). Retrieved 2026-08-22.",
  );
  const fuelMass = qMul(volume, gasolineDensity, "kg");
  const shellMass = assumed(
    10,
    "kg",
    "HDPE tank shell + baffles + pump module mass — no citable shell-mass figure found this run, 10 kg assumed",
  );
  const mass = qAdd(fuelMass, shellMass);

  // --- envelope: dims plus declared strap/heat-shield margin -----------------
  const strapMargin = assumed(
    20,
    "mm",
    "strap, heat-shield and expansion allowance around the tank shell — no citable source found this run, 20 mm assumed",
  );
  const two = derived(2, "count", "margin applies on both sides of each axis");
  const marginBoth = qMul(strapMargin, two, "mm");
  const envLength = qAdd(length, marginBoth);
  const envWidth = qAdd(width, marginBoth);
  const envHeight = qAdd(height, marginBoth);
  const envelope: BoxShape = {
    kind: "box",
    size: [envLength, envWidth, envHeight],
    offset: [0, 0, height.value / 2],
  };

  // --- ports (datum: bottom face center) -------------------------------------
  const zUp: Pt3 = [0, 0, 1];
  const aft: Pt3 = [1, 0, 0];
  const fwd: Pt3 = [-1, 0, 0];
  const left: Pt3 = [0, 1, 0];
  const halfL = length.value / 2;
  const strapX = halfL / 2;

  const ports: PortRecord[] = [
    port(alloc.next("port"), "strap-front", "point", { origin: [-strapX, 0, 0], xAxis: fwd, zAxis: zUp }),
    port(alloc.next("port"), "strap-rear", "point", { origin: [strapX, 0, 0], xAxis: aft, zAxis: zUp }),
    port(alloc.next("port"), "filler-neck", "point", { origin: [halfL / 2, width.value / 2, height.value], xAxis: left, zAxis: zUp }),
    port(alloc.next("port"), "fuel-out", "point", { origin: [-halfL, 0, 0], xAxis: fwd, zAxis: zUp }),
  ];

  // --- demands ---------------------------------------------------------------
  const zoneStandoff = assumed(
    150,
    "mm",
    "crush standoff around the tank envelope — FMVSS 301 is performance-based (spillage limits, not millimetres), " +
      "and the crash-band source table per class is reserved to the owner (charge §15); 150 mm assumed pending it",
  );
  const zoneBoth = qMul(zoneStandoff, two, "mm");

  const strapAnchor = (name: string, at: Pt3): DemandRecord =>
    demand({
      id: alloc.next("demand"),
      principal: "physics",
      reason:
        `full-tank mass (${mass.value.toFixed(0)} kg) slung on ${name} must terminate in a reinforced member ` +
        `(anchorage law — tank straps are named substrate duties, charge §4)`,
      kind: "anchorage",
      shape: { kind: "box", size: [strapMargin, strapMargin, strapMargin], offset: at },
      massBearing: true,
    });

  const demands: DemandRecord[] = [
    demand({
      id: alloc.next("demand"),
      principal: "physics",
      reason: "solid bodies exclude one another: the tank claims its shell plus strap and heat-shield allowance",
      kind: "envelope",
      shape: envelope,
    }),
    demand({
      id: alloc.next("demand"),
      principal: "law",
      reason:
        "FMVSS 301 'Fuel System Integrity' (49 CFR 571.301) limits fuel spillage in frontal, side and 80 km/h " +
        "70%-overlap rear moving-deformable-barrier impacts (spillage limits per S5.5); the tank zone must stay " +
        "clear of crush and of hard parts that could breach the shell (regulation identified 2026-08-22 via eCFR/NHTSA)",
      kind: "protected-zone",
      shape: {
        kind: "box",
        size: [qAdd(envLength, zoneBoth), qAdd(envWidth, zoneBoth), qAdd(envHeight, zoneBoth)],
        offset: [0, 0, height.value / 2],
      },
      magnitude: zoneStandoff,
    }),
    strapAnchor("strap-front", [-strapX, 0, 0]),
    strapAnchor("strap-rear", [strapX, 0, 0]),
  ];

  const dims: FuelTankDims = {
    volume,
    length,
    width,
    height,
    fuelDensity: gasolineDensity,
    fuelMass,
    shellMass,
    mass,
    protectedZoneStandoff: zoneStandoff,
  };

  return {
    id: alloc.next("part"),
    label: `fuel-tank ${volume.value.toFixed(0)}L`,
    ports,
    demands,
    mass,
    envelope,
    storeKind: "fuel-tank",
    dims,
  };
}

// ---------------------------------------------------------------------------
// EV pack
// ---------------------------------------------------------------------------

export interface EVPackDims {
  readonly volume: Quantity<"L">;
  /** Pack thickness (Z) — cell stand height + case stack. THE H30 driver. */
  readonly thickness: Quantity<"mm">;
  /** Case plan area including case-overhead allowance. */
  readonly planArea: Quantity<"mm2">;
  readonly length: Quantity<"mm">; // X
  readonly width: Quantity<"mm">; // Y
  readonly cellHeight: Quantity<"mm">;
  /** The SOURCED pack-level volumetric baseline (ratio carrier, Wh/L) — surfaced. */
  readonly packBaseDensity: Quantity<"ratio">;
  /** Effective pack-level energy density actually used (ratio carrier, Wh/L). */
  readonly packEnergyDensity: Quantity<"ratio">;
  /** The SOURCED pack-level gravimetric density (ratio carrier, Wh/kg) — surfaced. */
  readonly packGravimetricDensity: Quantity<"ratio">;
  readonly mass: Quantity<"kg">;
  readonly protectedZoneStandoff: Quantity<"mm">;
}

export interface EVPackInstance extends PartInstance {
  readonly storeKind: "ev-pack";
  readonly dims: EVPackDims;
}

/** Pack-level volumetric energy density baseline, Wh/L in a ratio carrier. */
function packBaseEnergyDensity(): Quantity<"ratio"> {
  return sourced(
    206,
    "ratio",
    "Pack-level volumetric energy density baseline, Wh per litre (ratio carrier — Unit set has no Wh/L)",
    "'From Cell to Pack: Empirical Analysis of the Correlations' (hub-edrive.de publication): across 25 BEVs from 10 OEMs, " +
      "pack-level volumetric energy density rose from 95.5 Wh/L (2010) to a 206 Wh/L average in 2019, best cases above " +
      "250 Wh/L. The 2019 fleet average is taken as the rectangular-tiling (prismatic) baseline. Retrieved 2026-08-22.",
  );
}

/** Format packing factor relative to the rectangular-tiling baseline. */
function formatPackingFactor(format: CellFormat): Quantity<"ratio"> {
  switch (format) {
    case "prismatic":
      return derived(
        1,
        "ratio",
        "rectangular prismatic cells tile a rectangular pack volume with no format-induced gap — baseline factor 1",
      );
    case "pouch":
      return sourced(
        0.93,
        "ratio",
        "Pouch-cell packaging efficiency, mid of the published 90-95% range",
        "Molicel, 'Comparing Battery Cell Types: Prismatic, Pouch, and Cylindrical Cells Explained': pouch format " +
          "achieves 90-95% packing efficiency but requires swell allowance. Mid value 0.93. Retrieved 2026-08-22.",
      );
    case "cylindrical":
      return derived(
        PI / (2 * nsqrt(3)),
        "ratio",
        "hexagonal close packing of circles: pi / (2*sqrt(3)) = 0.9069 — the geometric ceiling for cylindrical cells in plan",
      );
  }
}

/** Cell stand height (Z) per format, as installed in an under-floor pack. */
function formatCellHeight(format: CellFormat): Quantity<"mm"> {
  switch (format) {
    case "prismatic":
      return sourced(
        90,
        "mm",
        "BYD Blade prismatic cell standing height",
        "BYD Blade cell 960 x 90 x 13.5 mm, 138 Ah, 2.63 kg (TYCORUN, 'BYD Blade Battery Explained'; codienergy datasheet " +
          "lists 960 (L) x 90 (W)). The 90 mm dimension stands vertical in the pack. Retrieved 2026-08-22.",
      );
    case "pouch":
      return assumed(
        100,
        "mm",
        "pouch cell edge height as racked in under-floor modules — no citable module-height figure found this run, 100 mm assumed",
      );
    case "cylindrical":
      return derived(
        70,
        "mm",
        "cell height encoded in the 21700 format designation: 21 mm diameter x 70.0 mm length, cells standing upright",
      );
  }
}

export function makeEVPack(params: EVPackParams, alloc: IdAllocator): EVPackInstance {
  const { energy, format } = params;
  if (energy.value <= 0) {
    throw new Error(`makeEVPack: pack energy must be positive, got ${energy.value} kWh`);
  }

  const base = packBaseEnergyDensity();
  const factor = formatPackingFactor(format);
  const packEnergyDensity = qMul(base, factor, "ratio");

  // volume [L] = kWh * 1000 / (Wh/L). The ratio carrier's true unit is restated here.
  const volume = derived(
    (energy.value * 1000) / packEnergyDensity.value,
    "L",
    `pack volume = energy x 1000 / packEnergyDensity; energy = ${energy.value} kWh [${energy.license.tag}], ` +
      `packEnergyDensity = ${packEnergyDensity.value.toFixed(1)} Wh/L [${packEnergyDensity.license.tag}] ` +
      `(ratio carrier for Wh/L)`,
  );

  // --- thickness: cell stand height + case stack — THE H30 DRIVER ------------
  const cellHeight = formatCellHeight(format);
  const caseStack = assumed(
    40,
    "mm",
    "cooling plate + bottom strike plate + top cover stack around the cells — no citable case-stack figure found this run, " +
      "40 mm assumed",
  );
  const thickness = qAdd(cellHeight, caseStack);

  // --- plan area from volume and thickness -----------------------------------
  const litreToMm3 = derived(1000000, "mm3", "1 L = 10^6 mm3 (SI definition of the litre)");
  const volumeMm3 = qMul(volume, litreToMm3, "mm3");
  const cellPlanArea = qDiv(volumeMm3, thickness, "mm2");
  const caseOverhead = assumed(
    1.1,
    "ratio",
    "case walls, crush rails, busbar and BMS bays add plan area beyond the cell field — no citable overhead figure " +
      "found this run, +10% assumed",
  );
  const planArea = qMul(cellPlanArea, caseOverhead, "mm2");
  const width =
    params.packWidth ??
    assumed(1350, "mm", "pack width between the sills of a mid-size floor — no citable between-sill figure found this run");
  const length = qDiv(planArea, width, "mm");

  // --- mass ------------------------------------------------------------------
  const gravimetric = sourced(
    160,
    "ratio",
    "Pack-level gravimetric energy density, Wh per kg (ratio carrier — Unit set has no Wh/kg)",
    "'Lithium-Ion Battery Weight and Energy Density: Formulas, Data & Chemistry Comparison' (lifepo4batteryshop.com): " +
      "pack-level 140-180 Wh/kg for NMC, 150-174 Wh/kg NCA, 125-145 Wh/kg LFP. Mid NMC value 160 Wh/kg taken. " +
      "Retrieved 2026-08-22.",
  );
  const mass = derived(
    (energy.value * 1000) / gravimetric.value,
    "kg",
    `pack mass = energy x 1000 / gravimetric density; energy = ${energy.value} kWh [${energy.license.tag}], ` +
      `gravimetric = ${gravimetric.value} Wh/kg [${gravimetric.license.tag}] (ratio carrier for Wh/kg)`,
  );

  // --- envelope: the case box (case overhead is the declared plan margin) ----
  const envelope: BoxShape = {
    kind: "box",
    size: [length, width, thickness],
    offset: [0, 0, thickness.value / 2],
  };

  // --- ports (datum: bottom face center) -------------------------------------
  const zUp: Pt3 = [0, 0, 1];
  const aft: Pt3 = [1, 0, 0];
  const fwd: Pt3 = [-1, 0, 0];
  const halfL = length.value / 2;
  const halfW = width.value / 2;
  const topZ = thickness.value;

  // ============================ H30 COUPLING — FLAGGED LOUDLY ================
  // The cabin floor rides ON this face. SAE J1100 H30 (seat H-point height
  // above the floor) stacks on pack-top Z: pack thickness raises the floor,
  // the floor raises the H-point, and for a given headroom the H-point raises
  // the roof. THIS PORT IS THE SINGLE NUMBER THAT DRIVES ROOF HEIGHT FOR A
  // GIVEN HEADROOM (charge §5). Grids must show it; the occupant array's heel
  // and hip points chain from it.
  // ===========================================================================
  const ports: PortRecord[] = [
    port(alloc.next("port"), "pack-top", "face", { origin: [0, 0, topZ], xAxis: aft, zAxis: zUp }),
    port(alloc.next("port"), "mount-FL", "point", { origin: [-halfL, halfW, 0], xAxis: fwd, zAxis: zUp }),
    port(alloc.next("port"), "mount-FR", "point", { origin: [-halfL, -halfW, 0], xAxis: fwd, zAxis: zUp }),
    port(alloc.next("port"), "mount-RL", "point", { origin: [halfL, halfW, 0], xAxis: aft, zAxis: zUp }),
    port(alloc.next("port"), "mount-RR", "point", { origin: [halfL, -halfW, 0], xAxis: aft, zAxis: zUp }),
    port(alloc.next("port"), "hv-out", "point", { origin: [-halfL, 0, topZ], xAxis: fwd, zAxis: zUp }),
    port(alloc.next("port"), "coolant-in", "point", { origin: [-halfL, halfW / 2, topZ], xAxis: fwd, zAxis: zUp }),
    port(alloc.next("port"), "coolant-out", "point", { origin: [-halfL, -(halfW / 2), topZ], xAxis: fwd, zAxis: zUp }),
  ];

  // --- demands ---------------------------------------------------------------
  const zoneStandoff = assumed(
    50,
    "mm",
    "intrusion standoff around and under the pack — FMVSS 305 is performance-based (retention, isolation, spillage, " +
      "not millimetres), and the crash-band source table per class is reserved to the owner (charge §15); 50 mm assumed",
  );
  const two = derived(2, "count", "standoff applies on both sides of each plan axis");
  const zoneBoth = qMul(zoneStandoff, two, "mm");
  const mountPad = assumed(
    60,
    "mm",
    "pack mount bracket pad extent at the case rail — no citable source found this run, 60 mm assumed",
  );

  const packAnchor = (name: string, at: Pt3): DemandRecord =>
    demand({
      id: alloc.next("demand"),
      principal: "physics",
      reason:
        `pack mass (${mass.value.toFixed(0)} kg — the heaviest single part) at ${name} must terminate in a ` +
        `reinforced member (anchorage law; FMVSS 305 additionally requires battery retention in crash)`,
      kind: "anchorage",
      shape: { kind: "box", size: [mountPad, mountPad, mountPad], offset: at },
      massBearing: true,
    });

  const demands: DemandRecord[] = [
    demand({
      id: alloc.next("demand"),
      principal: "physics",
      reason: "solid bodies exclude one another: the pack claims its case box under the floor",
      kind: "envelope",
      shape: envelope,
    }),
    demand({
      id: alloc.next("demand"),
      principal: "law",
      reason:
        "FMVSS 305 'Electric-powered vehicles: electrolyte spillage and electrical shock protection' (49 CFR 571.305) " +
        "requires battery retention, electrolyte-spillage limits and electrical isolation in crash (FMVSS 305a / GTR 20 " +
        "extends this); the under-floor pack zone must stay clear of crush and of hard parts that could breach cells " +
        "(regulation identified 2026-08-22 via govinfo/Federal Register)",
      kind: "protected-zone",
      shape: {
        kind: "box",
        size: [qAdd(length, zoneBoth), qAdd(width, zoneBoth), qAdd(thickness, zoneStandoff)],
        offset: [0, 0, (thickness.value - zoneStandoff.value) / 2],
      },
      magnitude: zoneStandoff,
    }),
    packAnchor("mount-FL", [-halfL, halfW, 0]),
    packAnchor("mount-FR", [-halfL, -halfW, 0]),
    packAnchor("mount-RL", [halfL, halfW, 0]),
    packAnchor("mount-RR", [halfL, -halfW, 0]),
  ];

  const dims: EVPackDims = {
    volume,
    thickness,
    planArea,
    length,
    width,
    cellHeight,
    packBaseDensity: base,
    packEnergyDensity,
    packGravimetricDensity: gravimetric,
    mass,
    protectedZoneStandoff: zoneStandoff,
  };

  return {
    id: alloc.next("part"),
    label: `ev-pack ${energy.value}kWh ${format}`,
    ports,
    demands,
    mass,
    envelope,
    storeKind: "ev-pack",
    dims,
  };
}

// ---------------------------------------------------------------------------
// Dispatcher
// ---------------------------------------------------------------------------

export type EnergyStoreInstance = FuelTankInstance | EVPackInstance;

export function makeEnergyStore(params: EnergyStoreParams, alloc: IdAllocator): EnergyStoreInstance {
  return params.kind === "fuel-tank" ? makeFuelTank(params, alloc) : makeEVPack(params, alloc);
}
