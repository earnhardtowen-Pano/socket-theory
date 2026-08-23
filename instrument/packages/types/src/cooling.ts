/**
 * makeCooling — parametric cooling pack (type library, charge §5).
 *
 * The loop that shapes the face of the car, derivable down to the coefficient:
 *   rejected heat = power x SOURCED split (ICE: the classic one-third rule)
 *                 = power x (1-eta)/eta   (EV: SOURCED drivetrain efficiency)
 *   radiator frontal area = rejected heat / SOURCED flux coefficient [kW/m2]
 * Core thickness is a parameter. Demands: an inlet aperture that must admit
 * the cooling airflow (physics) and an exit path for the heated air (physics)
 * — air that cannot leave does not flow.
 *
 * Datum: center of the core FRONT face, part frame world-aligned. The core
 * extends aft (+X); the front face looks forward (−X) at the nose inlet.
 * +Y left, +Z up. Research performed 2026-08-22; citations inline.
 */

import type {
  BoxShape,
  DemandRecord,
  IdAllocator,
  PartInstance,
  PortRecord,
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

export type CoolingPowertrain = "ice" | "ev";

export interface CoolingParams {
  readonly powertrain: CoolingPowertrain;
  /** Peak powertrain output the loop must survive (engine brake power / motor peak). */
  readonly power: Quantity<"kW">;
  /** Radiator core thickness. Default ASSUMED 32 mm. */
  readonly coreThickness?: Quantity<"mm">;
  /** Core plan aspect width/height. Default ASSUMED 1.4. */
  readonly aspect?: Quantity<"ratio">;
  /** A/C condenser slab stacked ahead of the core; adds depth when present (charge §5). */
  readonly condenserThickness?: Quantity<"mm">;
  /** Override for the SOURCED EV drivetrain efficiency (ignored for ICE). */
  readonly drivetrainEfficiency?: Quantity<"ratio">;
}

export interface CoolingDims {
  readonly powertrain: CoolingPowertrain;
  readonly rejectedHeat: Quantity<"kW">;
  /** ICE: coolant-heat/brake-power split. EV: drivetrain efficiency eta. */
  readonly heatBasis: Quantity<"ratio">;
  readonly fluxCoefficient: Quantity<"kW/m2">;
  readonly frontalArea: Quantity<"mm2">;
  readonly coreWidth: Quantity<"mm">;
  readonly coreHeight: Quantity<"mm">;
  readonly coreThickness: Quantity<"mm">;
  /** Total pack depth: condenser (if any) + core + fan/shroud. */
  readonly depth: Quantity<"mm">;
  readonly mass: Quantity<"kg">;
}

export interface CoolingInstance extends PartInstance {
  readonly dims: CoolingDims;
}

// ---------------------------------------------------------------------------
// Sourced coefficients — researched 2026-08-22
// ---------------------------------------------------------------------------

/** ICE: heat rejected to coolant per unit brake power — the classic one-third rule. */
function iceCoolantSplit(): Quantity<"ratio"> {
  return sourced(
    1.0,
    "ratio",
    "Heat to coolant per unit brake power — the classic one-third energy balance",
    "National Academies, 'Cost, Effectiveness, and Deployment of Fuel Economy Technologies for Light-Duty Vehicles' " +
      "(nap.edu, ch. 2): fuel energy divides into roughly three equal parts — brake work, coolant heat, exhaust enthalpy; " +
      "hence radiator heat ~= brake power (also stated plainly in the FSAE wiki 'Cooling' page: the radiator dissipates " +
      "approximately the power sent to the wheels). Retrieved 2026-08-22.",
  );
}

/** EV: combined motor + inverter efficiency at peak. */
function evDrivetrainEfficiency(): Quantity<"ratio"> {
  return sourced(
    0.9,
    "ratio",
    "Combined EV motor + inverter efficiency at peak load",
    "Charged EVs, 'How to improve EV traction motor efficiency': motor, inverter and reduction each run mid-to-high " +
      "90-percent efficiency; einfochips, 'Understanding Traction Inverter in Modern Electric Vehicle': modern SiC " +
      "inverters above 95%, ~96% at full load. Motor x inverter ~= 0.90 combined at peak taken. Retrieved 2026-08-22.",
  );
}

/** Radiator core frontal heat flux, kW/m2 — a legal unit in the frozen set. */
function radiatorFlux(): Quantity<"kW/m2"> {
  return sourced(
    1155.8,
    "kW/m2",
    "Street radiator sizing rule of thumb, 1 in2 of core frontal area per engine horsepower, converted to core flux",
    "Rule quoted in 'Auto Radiator Sizing Calculator' (onlinetoolkit.co) and the Grassroots Motorsports 'Radiator Sizing' " +
      "forum thread: 1 square inch of frontal area per horsepower for street applications. With coolant heat ~= brake " +
      "power (one-third rule), 1 hp per in2 = 745.7 W / 645.16 mm2 = 1155.8 kW/m2. This is the street-minimum end: " +
      "production cars run larger cores for idle towing, hot climates and condenser stacking. Retrieved 2026-08-22.",
  );
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function makeCooling(params: CoolingParams, alloc: IdAllocator): CoolingInstance {
  const { powertrain, power } = params;
  if (power.value <= 0) {
    throw new Error(`makeCooling: power must be positive, got ${power.value} kW`);
  }

  // --- rejected heat ---------------------------------------------------------
  let heatBasis: Quantity<"ratio">;
  let rejectedHeat: Quantity<"kW">;
  if (powertrain === "ice") {
    heatBasis = iceCoolantSplit();
    rejectedHeat = qMul(power, heatBasis, "kW");
  } else {
    heatBasis = params.drivetrainEfficiency ?? evDrivetrainEfficiency();
    if (heatBasis.value <= 0 || heatBasis.value >= 1) {
      throw new Error(`makeCooling: drivetrain efficiency must be in (0,1), got ${heatBasis.value}`);
    }
    // For output P at efficiency eta, losses = P * (1-eta)/eta — the heat the loop must move.
    rejectedHeat = derived(
      (power.value * (1 - heatBasis.value)) / heatBasis.value,
      "kW",
      `EV rejected heat = power x (1-eta)/eta; power = ${power.value} kW [${power.license.tag}], ` +
        `eta = ${heatBasis.value} [${heatBasis.license.tag}] (motor + inverter losses to the coolant loop)`,
    );
  }

  // --- frontal area from the flux coefficient --------------------------------
  const flux = radiatorFlux();
  const frontalArea = derived(
    (rejectedHeat.value / flux.value) * 1000000,
    "mm2",
    `radiator frontal area = rejectedHeat / flux, in mm2; rejectedHeat = ${rejectedHeat.value.toFixed(1)} kW ` +
      `[${rejectedHeat.license.tag}], flux = ${flux.value} kW/m2 [${flux.license.tag}]; 1 m2 = 10^6 mm2`,
  );

  const aspect =
    params.aspect ??
    assumed(1.4, "ratio", "core plan aspect width/height — cores run wider than tall; no citable source found this run");
  const coreWidth = derived(
    nsqrt(frontalArea.value * aspect.value),
    "mm",
    `core width = sqrt(area x aspect); area = ${frontalArea.value.toFixed(0)} mm2 [${frontalArea.license.tag}], ` +
      `aspect = ${aspect.value} [${aspect.license.tag}]`,
  );
  const coreHeight = qDiv(frontalArea, coreWidth, "mm");

  // --- depth stack: condenser (optional) + core + fan/shroud -----------------
  const coreThickness =
    params.coreThickness ??
    assumed(32, "mm", "radiator core thickness — typical passenger-car cores 26-40 mm; no citable source found this run");
  const fanShroud = assumed(
    60,
    "mm",
    "electric fan + shroud stack behind the core — no citable source found this run, 60 mm assumed",
  );
  const condenser =
    params.condenserThickness ?? derived(0, "mm", "no condenser requested — nothing stacks ahead of the core");
  const depth = qAdd(qAdd(condenser, coreThickness), fanShroud);

  // --- mass ------------------------------------------------------------------
  const effectiveDensity = assumed(
    1.0,
    "g/cm3",
    "effective wet density of a finned aluminium core with coolant — near water's density; no citable core-mass " +
      "figure found this run, 1.0 g/cm3 assumed",
  );
  const slabThickness = qAdd(coreThickness, condenser); // heat-exchanger slabs only; shroud is air
  const mass = derived(
    (coreWidth.value * coreHeight.value * slabThickness.value * effectiveDensity.value) / 1000000,
    "kg",
    `cooling-pack mass = W x H x slabThickness x effectiveDensity; W = ${coreWidth.value.toFixed(0)} mm ` +
      `[${coreWidth.license.tag}], H = ${coreHeight.value.toFixed(0)} mm [${coreHeight.license.tag}], ` +
      `slab = ${slabThickness.value.toFixed(0)} mm [${slabThickness.license.tag}], density = ${effectiveDensity.value} ` +
      `g/cm3 [${effectiveDensity.license.tag}]; mm3 x g/cm3 / 10^6 = kg`,
  );

  // --- envelope: the full pack depth behind the front face -------------------
  const envelope: BoxShape = {
    kind: "box",
    size: [depth, coreWidth, coreHeight],
    offset: [depth.value / 2, 0, 0],
  };

  // --- ports (datum: core front face center) ---------------------------------
  const zUp: readonly [number, number, number] = [0, 0, 1];
  const aft: readonly [number, number, number] = [1, 0, 0];
  const fwd: readonly [number, number, number] = [-1, 0, 0];
  const halfW = coreWidth.value / 2;
  const halfH = coreHeight.value / 2;
  const rearX = depth.value;

  const ports: PortRecord[] = [
    port(alloc.next("port"), "inlet-face", "face", { origin: [0, 0, 0], xAxis: fwd, zAxis: zUp }),
    port(alloc.next("port"), "coolant-in", "point", { origin: [rearX, halfW / 2, halfH], xAxis: aft, zAxis: zUp }),
    port(alloc.next("port"), "coolant-out", "point", { origin: [rearX, -(halfW / 2), -halfH], xAxis: aft, zAxis: zUp }),
    port(alloc.next("port"), "mount-lower-L", "point", { origin: [rearX / 2, halfW / 2, -halfH], xAxis: aft, zAxis: zUp }),
    port(alloc.next("port"), "mount-lower-R", "point", { origin: [rearX / 2, -(halfW / 2), -halfH], xAxis: aft, zAxis: zUp }),
    port(alloc.next("port"), "mount-upper-L", "point", { origin: [rearX / 2, halfW / 2, halfH], xAxis: aft, zAxis: zUp }),
    port(alloc.next("port"), "mount-upper-R", "point", { origin: [rearX / 2, -(halfW / 2), halfH], xAxis: aft, zAxis: zUp }),
  ];

  // --- demands ---------------------------------------------------------------
  const grilleDepth = assumed(
    50,
    "mm",
    "duct run between the nose aperture and the core face — no citable source found this run, 50 mm assumed",
  );
  const exitRun = assumed(
    400,
    "mm",
    "exit-duct run from the core rear to the underbody low-pressure region — no citable source found this run, 400 mm assumed",
  );
  const exitDrop = assumed(
    150,
    "mm",
    "vertical drop of the exit path toward the underbody — no citable source found this run, 150 mm assumed",
  );
  const exitRadius = derived(
    nsqrt(frontalArea.value / PI),
    "mm",
    `exit-path equivalent radius = sqrt(area/pi); area = ${frontalArea.value.toFixed(0)} mm2 [${frontalArea.license.tag}] ` +
      `(the exit must pass what the inlet admits)`,
  );
  const mountPad = assumed(
    40,
    "mm",
    "radiator isolator pad extent at the lower crossmember — no citable source found this run, 40 mm assumed",
  );

  const demands: DemandRecord[] = [
    demand({
      id: alloc.next("demand"),
      principal: "physics",
      reason: "solid bodies exclude one another: the cooling pack claims condenser + core + fan/shroud depth",
      kind: "envelope",
      shape: envelope,
    }),
    demand({
      id: alloc.next("demand"),
      principal: "physics",
      reason: "inlet must admit the cooling airflow: the nose opening feeds the full core frontal area",
      kind: "aperture",
      shape: {
        kind: "box",
        size: [grilleDepth, coreWidth, coreHeight],
        offset: [-(grilleDepth.value / 2), 0, 0],
      },
      magnitude: frontalArea,
    }),
    demand({
      id: alloc.next("demand"),
      principal: "physics",
      reason:
        "heated air must have an exit path to a lower-pressure region behind and below the core — " +
        "air that cannot leave does not flow, and a blocked exit stalls the whole loop",
      kind: "routed-path",
      shape: {
        kind: "path",
        waypoints: [
          [rearX, 0, 0],
          [rearX + exitRun.value / 2, 0, -(exitDrop.value / 2)],
          [rearX + exitRun.value, 0, -exitDrop.value],
        ],
        radius: exitRadius,
      },
      magnitude: frontalArea,
    }),
    demand({
      id: alloc.next("demand"),
      principal: "physics",
      reason:
        `cooling-pack mass (${mass.value.toFixed(1)} kg wet) rests in the lower isolators at mount-lower-L; ` +
        `it must terminate in a reinforced member (anchorage law); the upper mounts are steadies`,
      kind: "anchorage",
      shape: { kind: "box", size: [mountPad, mountPad, mountPad], offset: [rearX / 2, halfW / 2, -halfH] },
      massBearing: true,
    }),
    demand({
      id: alloc.next("demand"),
      principal: "physics",
      reason:
        `cooling-pack mass (${mass.value.toFixed(1)} kg wet) rests in the lower isolators at mount-lower-R; ` +
        `it must terminate in a reinforced member (anchorage law); the upper mounts are steadies`,
      kind: "anchorage",
      shape: { kind: "box", size: [mountPad, mountPad, mountPad], offset: [rearX / 2, -(halfW / 2), -halfH] },
      massBearing: true,
    }),
  ];

  const dims: CoolingDims = {
    powertrain,
    rejectedHeat,
    heatBasis,
    fluxCoefficient: flux,
    frontalArea,
    coreWidth,
    coreHeight,
    coreThickness,
    depth,
    mass,
  };

  return {
    id: alloc.next("part"),
    label: `cooling ${powertrain} ${power.value}kW`,
    ports,
    demands,
    mass,
    envelope,
    dims,
  };
}
