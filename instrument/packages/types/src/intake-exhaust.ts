/**
 * makeIntakeExhaust — air intake and exhaust run (type library, charge §5).
 *
 * Datum: exhaust manifold-flange center, world-aligned. +X aft: the run goes
 * aft to the tailpipe at x = runLength. The airbox sits high and forward of
 * the flange (its inlet is the "intake-mouth" port).
 *
 * Demands published, per charge §5 intake/exhaust:
 *  - catalyst heat bubble near the manifold        (physics)
 *  - routing above the ground-clearance line       (band — BRIEF principal: charge §7
 *    assigns "ground clearance with approach and departure angles" to the owner's
 *    brief, so the line the exhaust must clear is his; a regulator minimum would
 *    make it law, and none was found this run)
 *  - muffler volume near the tail                  (physics)
 *  - heat shield past the tank zone                (law — fuel-system fire safety,
 *    FMVSS 301 fuel system integrity names the hazard; shield gap ASSUMED)
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
  qMul,
  sourced,
} from "@car/demand";
import { PI, npow } from "@car/num";

// ---------------------------------------------------------------------------
// Parameters
// ---------------------------------------------------------------------------

export interface IntakeExhaustParams {
  /** Air filter element volume; the airbox is sized from it. */
  readonly filterVolume: Quantity<"L">;
  /** Engine displacement — sizes catalyst and muffler volumes. */
  readonly displacement: Quantity<"L">;
  /** Manifold flange to tailpipe, along +X. */
  readonly runLength?: Quantity<"mm">;
  /** Z of the ground-clearance line in part space (below the flange datum). Owner's brief. */
  readonly groundLineZ?: Quantity<"mm">;
  /** Fuel-tank protected-zone stations in part space, for the heat-shield demand. */
  readonly tankZoneStartX?: Quantity<"mm">;
  readonly tankZoneEndX?: Quantity<"mm">;
}

export interface IntakeExhaustDims {
  readonly pipeDiameter: Quantity<"mm">;
  readonly catalystVolume: Quantity<"mm3">;
  readonly catalystDiameter: Quantity<"mm">;
  readonly catalystLength: Quantity<"mm">;
  readonly mufflerVolume: Quantity<"mm3">;
  readonly mufflerSide: Quantity<"mm">;
  readonly mufflerLength: Quantity<"mm">;
  readonly airboxSide: Quantity<"mm">;
  readonly runLength: Quantity<"mm">;
  readonly mass: Quantity<"kg">;
}

export interface IntakeExhaustInstance extends PartInstance {
  readonly dims: IntakeExhaustDims;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function makeIntakeExhaust(params: IntakeExhaustParams, alloc: IdAllocator): IntakeExhaustInstance {
  const { filterVolume, displacement } = params;

  const runLength =
    params.runLength ??
    assumed(2800, "mm", "manifold flange to tailpipe span depends on wheelbase — placeholder pending the chassis solve");
  const groundLineZ =
    params.groundLineZ ??
    assumed(-300, "mm", "ground-clearance line below the flange datum — the owner's brief ground clearance is not wired into this lane; placeholder");
  const tankZoneStartX =
    params.tankZoneStartX ??
    assumed(1800, "mm", "fuel-tank protected-zone start station — placeholder pending the energy-store and substrate lanes");
  const tankZoneEndX =
    params.tankZoneEndX ??
    assumed(2400, "mm", "fuel-tank protected-zone end station — placeholder pending the energy-store and substrate lanes");

  const litreToMm3 = derived(1000000, "ratio", "1 L = 10^6 mm3 (SI definition of the litre)");
  const displacementMm3 = qMul(displacement, litreToMm3, "mm3");

  // --- pipe -----------------------------------------------------------------
  const pipeDiameter = assumed(
    60,
    "mm",
    "single exhaust pipe diameter — passenger cars commonly run 2–2.5 in pipe; no citable source found this run",
  );

  // --- catalyst: SOURCED volume ratio, close to the manifold ----------------
  const catalystVolumeRatio = sourced(
    1.2,
    "ratio",
    "Catalyst-volume-to-engine-displacement ratio, gasoline",
    "US Patent 11,614,015 'Exhaust gas purification system for a gasoline engine': Vcat/Veng at least 1, preferably 1–5, " +
      "more preferably 1.2–3.5; low end 1.2 taken for a single close-coupled brick. Retrieved 2026-08-22.",
  );
  const catalystVolume = qMul(displacementMm3, catalystVolumeRatio, "mm3");
  const catalystDiameter = assumed(
    110,
    "mm",
    "catalyst monolith diameter — common passenger-car substrates run ~4.3 in; no citable source found this run",
  );
  const catalystLength = derived(
    catalystVolume.value / ((PI / 4) * catalystDiameter.value * catalystDiameter.value),
    "mm",
    `catalyst length = Vcat / ((pi/4)*D^2); Vcat = ${catalystVolume.value.toFixed(0)} mm3 [${catalystVolume.license.tag}], ` +
      `D = ${catalystDiameter.value} mm [${catalystDiameter.license.tag}]`,
  );
  const catalystX = assumed(
    300,
    "mm",
    "close-coupled catalyst center within ~300 mm of the manifold for fast light-off — no citable source found this run",
  );

  // --- muffler: SOURCED volume ratio, near the tail -------------------------
  const mufflerVolumeRatio = sourced(
    10,
    "ratio",
    "Muffler-volume-to-engine-displacement ratio",
    "Springer Nature muffler-design chapter (DOI 10.1007/978-981-10-4828-9_1): small and large mufflers are characterized " +
      "by ~5x and ~15x the engine's piston displacement; mid value 10x taken. Retrieved 2026-08-22.",
  );
  const mufflerVolume = qMul(displacementMm3, mufflerVolumeRatio, "mm3");
  // Box the volume as a 1 x 1 x 3 brick: V = 3 s^3.
  const mufflerSide = derived(
    npow(mufflerVolume.value / 3, 1 / 3),
    "mm",
    `muffler section side from V = 3*s^3 (1x1x3 brick): s = cbrt(V/3); V = ${mufflerVolume.value.toFixed(0)} mm3 [${mufflerVolume.license.tag}]`,
  );
  const mufflerLength = derived(
    mufflerSide.value * 3,
    "mm",
    `muffler length = 3*s (1x1x3 brick); s = ${mufflerSide.value.toFixed(1)} mm [DERIVED]`,
  );

  // --- airbox: cube on the filter volume, high dry inlet --------------------
  const airboxSide = derived(
    npow(filterVolume.value * litreToMm3.value, 1 / 3),
    "mm",
    `airbox side = cbrt(filter volume); filter volume = ${filterVolume.value} L [${filterVolume.license.tag}] x 10^6 mm3/L`,
  );
  const airboxZ = assumed(
    250,
    "mm",
    "airbox center height above the flange datum — the inlet must sit high and dry (charge §5); placeholder pending engine-bay packaging",
  );

  // --- mass -----------------------------------------------------------------
  const runMassCoeff = assumed(
    0.006,
    "ratio",
    "exhaust system mass per mm of run (~6 kg/m incl. catalyst and muffler; full systems typically 15–25 kg) — no citable source found this run",
  );
  const runMass = qMul(runLength, runMassCoeff, "kg");
  const airboxMass = assumed(2.5, "kg", "airbox + filter element + intake ducting — no citable source found this run");
  const mass = qAdd(runMass, airboxMass);

  // --- geometry -------------------------------------------------------------
  const runV = runLength.value;
  const mufflerCenterX = runV - mufflerLength.value / 2;
  const airboxCenter: Pt3 = [-(airboxSide.value / 2), 0, airboxZ.value];
  const zUp: Pt3 = [0, 0, 1];

  const envelopeWidth = derived(
    Math.max(mufflerSide.value, catalystDiameter.value, airboxSide.value),
    "mm",
    `envelope width = max(muffler side ${mufflerSide.value.toFixed(0)} mm [DERIVED], catalyst diameter ${catalystDiameter.value} mm [ASSUMED], airbox side ${airboxSide.value.toFixed(0)} mm [DERIVED])`,
  );
  const envelopeTopZ = airboxZ.value + airboxSide.value / 2;
  const envelopeBottomZ = -(mufflerSide.value / 2);
  const envelopeLength = qAdd(runLength, airboxSide);
  const envelopeHeight = derived(
    envelopeTopZ - envelopeBottomZ,
    "mm",
    `envelope height = airbox top (${envelopeTopZ.toFixed(0)} mm) - muffler bottom (${envelopeBottomZ.toFixed(0)} mm), both from licensed dims`,
  );
  const envelope: BoxShape = {
    kind: "box",
    size: [envelopeLength, envelopeWidth, envelopeHeight],
    offset: [(runV - airboxSide.value) / 2, 0, (envelopeTopZ + envelopeBottomZ) / 2],
  };

  // --- ports ----------------------------------------------------------------
  const ports: PortRecord[] = [
    port(alloc.next("port"), "manifold-flange", "face", { origin: [0, 0, 0], xAxis: [-1, 0, 0], zAxis: zUp }),
    port(alloc.next("port"), "intake-mouth", "point", {
      origin: [airboxCenter[0], 0, airboxZ.value + airboxSide.value / 2],
      xAxis: [-1, 0, 0],
      zAxis: zUp,
    }),
    port(alloc.next("port"), "catalyst", "point", { origin: [catalystX.value, 0, 0], xAxis: [1, 0, 0], zAxis: zUp }),
    port(alloc.next("port"), "muffler", "point", { origin: [mufflerCenterX, 0, 0], xAxis: [1, 0, 0], zAxis: zUp }),
    port(alloc.next("port"), "tailpipe", "face", { origin: [runV, 0, 0], xAxis: [1, 0, 0], zAxis: zUp }),
  ];

  // --- demands --------------------------------------------------------------
  const heatBubbleGap = assumed(
    50,
    "mm",
    "standoff air around the catalyst — converters run 430–870 C (thecatalyticconverter.com, 'What Is a Catalytic " +
      "Converter Heat Shield?', retrieved 2026-08-22); no published standoff distance found this run, 50 mm assumed",
  );
  const heatBubbleSize = qAdd(catalystDiameter, qAdd(heatBubbleGap, heatBubbleGap));
  const heatBubbleLength = qAdd(catalystLength, qAdd(heatBubbleGap, heatBubbleGap));

  const shieldGap = assumed(
    25,
    "mm",
    "air-gap heat shield standoff between exhaust and tank zone — typical stamped shields run a small air gap; " +
      "no citable dimension found this run, 25 mm assumed",
  );
  const tankSpan = derived(
    tankZoneEndX.value - tankZoneStartX.value,
    "mm",
    `tank-zone span = end ${tankZoneEndX.value} mm [${tankZoneEndX.license.tag}] - start ${tankZoneStartX.value} mm [${tankZoneStartX.license.tag}]`,
  );
  const shieldHeight = qAdd(pipeDiameter, qAdd(shieldGap, shieldGap));

  const hangerPad = assumed(50, "mm", "exhaust hanger bracket pad extent — no citable source found this run");

  const bandCeiling = derived(0, "mm", "run ceiling at the flange/floor datum height (z = 0 in part space)");

  const demands: DemandRecord[] = [
    demand({
      id: alloc.next("demand"),
      principal: "physics",
      reason: "solid bodies exclude one another: airbox, pipe run, catalyst and muffler claim their volume",
      kind: "envelope",
      shape: envelope,
    }),
    demand({
      id: alloc.next("demand"),
      principal: "physics",
      reason:
        "catalyst heat bubble: the converter runs 430–870 C close-coupled to the manifold " +
        "(thecatalyticconverter.com, retrieved 2026-08-22) — lines, harnesses and panels need standoff air around it",
      kind: "clearance",
      shape: { kind: "box", size: [heatBubbleLength, heatBubbleSize, heatBubbleSize], offset: [catalystX.value, 0, 0] },
      magnitude: heatBubbleGap,
    }),
    demand({
      id: alloc.next("demand"),
      principal: "brief",
      reason:
        "the whole run must route above the ground-clearance line and below the floor — charge §7 assigns ground " +
        "clearance (with approach/departure angles) to the owner's brief, so the line is his; no regulator minimum was found this run",
      kind: "band",
      shape: { kind: "band", zMin: groundLineZ, zMax: bandCeiling },
    }),
    demand({
      id: alloc.next("demand"),
      principal: "physics",
      reason:
        "muffler volume near the tail: silencing needs expansion volume (5x–15x displacement, Springer muffler-design " +
        "chapter) and the tailpipe must exit behind the occupied body",
      kind: "envelope",
      shape: {
        kind: "box",
        size: [mufflerLength, mufflerSide, mufflerSide],
        offset: [mufflerCenterX, 0, 0],
      },
    }),
    demand({
      id: alloc.next("demand"),
      principal: "law",
      reason:
        "fuel-system fire safety (FMVSS 301 fuel system integrity names the hazard): the exhaust passing the fuel-tank " +
        "protected zone must carry a heat shield with an air gap — gap dimension ASSUMED, no published figure found this run",
      kind: "clearance",
      shape: {
        kind: "box",
        size: [tankSpan, shieldHeight, shieldHeight],
        offset: [(tankZoneStartX.value + tankZoneEndX.value) / 2, 0, 0],
      },
      magnitude: shieldGap,
    }),
    demand({
      id: alloc.next("demand"),
      principal: "physics",
      reason: "the exhaust run's mass hangs from the underbody: front hanger (near the catalyst) must terminate in a reinforced member (anchorage law)",
      kind: "anchorage",
      shape: { kind: "box", size: [hangerPad, hangerPad, hangerPad], offset: [catalystX.value, 0, 0] },
      massBearing: true,
    }),
    demand({
      id: alloc.next("demand"),
      principal: "physics",
      reason: "the exhaust run's mass hangs from the underbody: rear hanger (near the muffler) must terminate in a reinforced member (anchorage law)",
      kind: "anchorage",
      shape: { kind: "box", size: [hangerPad, hangerPad, hangerPad], offset: [mufflerCenterX, 0, 0] },
      massBearing: true,
    }),
  ];

  const dims: IntakeExhaustDims = {
    pipeDiameter,
    catalystVolume,
    catalystDiameter,
    catalystLength,
    mufflerVolume,
    mufflerSide,
    mufflerLength,
    airboxSide,
    runLength,
    mass,
  };

  return {
    id: alloc.next("part"),
    label: `intake-exhaust ${displacement.value}L run`,
    ports,
    demands,
    mass,
    envelope,
    dims,
  };
}
