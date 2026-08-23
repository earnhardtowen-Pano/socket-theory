/**
 * makeEVMotor — parametric EV traction motor (type library, charge §5).
 *
 * Datum: rotor axis center at the mid-point of the active machine stack,
 * part frame world-aligned. Motor axis along Y (transverse drive unit:
 * halfshafts exit both ends), +X aft, +Z up. The reduction stage stacks on
 * the −Y (right) end; output shafts publish on both sides.
 *
 * Sizing law: kW → machine volume via SOURCED volumetric power density,
 * kW → mass via SOURCED gravimetric power density (research performed
 * 2026-08-22, ORNL/DOE benchmarking — see citations inline). Diameter and
 * length split the volume through an aspect-ratio parameter.
 *
 * UNIT CARRIER NOTE (surfaced, not buried): the frozen Unit set in
 * @car/schema has no kW/L or kW/kg member. Power-density coefficients are
 * carried as Quantity<"ratio"> with the true unit stated in the source text
 * and restated in every derivation chain that consumes them.
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
  qScale,
  sourced,
} from "@car/demand";
import { PI, npow } from "@car/num";

// ---------------------------------------------------------------------------
// Parameters
// ---------------------------------------------------------------------------

export interface EVMotorParams {
  /** Peak mechanical output power of the machine. */
  readonly peakPower: Quantity<"kW">;
  /**
   * Reduction-stage count stacked on the −Y end (single-speed EV reduction = 1,
   * direct rim drive = 0). Default 1.
   */
  readonly reductionStages?: Quantity<"count">;
  /** Active-machine aspect ratio stackLength / statorDiameter. Default ASSUMED 0.8. */
  readonly aspectRatio?: Quantity<"ratio">;
  /**
   * Override for the SOURCED volumetric power density (carried as ratio, kW/L —
   * see unit carrier note). Overriding a sourced value is the owner's ASSUMED.
   */
  readonly volumetricPowerDensity?: Quantity<"ratio">;
  /** Override for the SOURCED gravimetric power density (ratio carrier, kW/kg). */
  readonly gravimetricPowerDensity?: Quantity<"ratio">;
}

export interface EVMotorDims {
  /** Housing diameter of the machine (X and Z extent). */
  readonly diameter: Quantity<"mm">;
  /** Active machine length along the axis (Y), excluding reduction. */
  readonly activeLength: Quantity<"mm">;
  /** Axial length of the reduction stack on the −Y end. */
  readonly reductionLength: Quantity<"mm">;
  /** Total axial extent: active machine + reduction stages. */
  readonly axialLength: Quantity<"mm">;
  /** Machine volume from the sourced volumetric power density. */
  readonly volume: Quantity<"L">;
  /** The sourced (or overridden) volumetric power density, ratio carrier for kW/L. */
  readonly volumetricPowerDensity: Quantity<"ratio">;
  /** The sourced (or overridden) gravimetric power density, ratio carrier for kW/kg. */
  readonly gravimetricPowerDensity: Quantity<"ratio">;
  readonly motorMass: Quantity<"kg">;
  readonly reductionMass: Quantity<"kg">;
  readonly mass: Quantity<"kg">;
}

export interface EVMotorInstance extends PartInstance {
  readonly dims: EVMotorDims;
}

// ---------------------------------------------------------------------------
// Sourced coefficients — researched 2026-08-22
// ---------------------------------------------------------------------------

/** Volumetric power density of a production automotive PM traction motor. */
function defaultVolumetricPowerDensity(): Quantity<"ratio"> {
  return sourced(
    5.7,
    "ratio",
    "Peak volumetric power density of a production automotive PM traction motor, kW per litre (ratio carrier — Unit set has no kW/L)",
    "Burress (ORNL), 'Benchmarking EV and HEV Technologies', U.S. DOE Vehicle Technologies Office 2017 Annual Merit Review, " +
      "presentation edt087_burress_2017 (energy.gov): 2017 Toyota Prius traction motor peak power density 5.7 kW/L. " +
      "The DOE ELT 2025 research target is 50 kW/L (OSTI report 'Design, Optimization, and Control of a 100 kW Electric " +
      "Traction Motor Meeting or Exceeding DOE 2025 Targets') — production machines sit near the conservative end taken here. " +
      "Retrieved 2026-08-22.",
  );
}

/** Gravimetric power density (specific power) of the same benchmarked machine. */
function defaultGravimetricPowerDensity(): Quantity<"ratio"> {
  return sourced(
    1.6,
    "ratio",
    "Peak specific power of a production automotive PM traction motor, kW per kg (ratio carrier — Unit set has no kW/kg)",
    "Burress (ORNL), 'Benchmarking EV and HEV Technologies', U.S. DOE Vehicle Technologies Office 2017 Annual Merit Review, " +
      "presentation edt087_burress_2017 (energy.gov): 2017 Toyota Prius traction motor peak specific power 1.6 kW/kg. " +
      "Motor only — inverter and reduction excluded. Retrieved 2026-08-22.",
  );
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function makeEVMotor(params: EVMotorParams, alloc: IdAllocator): EVMotorInstance {
  const { peakPower } = params;
  if (peakPower.value <= 0) {
    throw new Error(`makeEVMotor: peak power must be positive, got ${peakPower.value} kW`);
  }

  const reductionStages =
    params.reductionStages ?? derived(1, "count", "single-speed EV reduction stage — the default EV drive layout");
  const aspectRatio =
    params.aspectRatio ??
    assumed(
      0.8,
      "ratio",
      "active-machine aspect ratio stackLength/statorDiameter — radial-flux traction machines run shorter than their " +
        "diameter (pancake-leaning); no citable production aspect figure found this run, 0.8 assumed",
    );
  const rhoV = params.volumetricPowerDensity ?? defaultVolumetricPowerDensity();
  const rhoM = params.gravimetricPowerDensity ?? defaultGravimetricPowerDensity();

  // --- volume and principal dimensions --------------------------------------
  // rhoV is kW/L in a ratio carrier: kW / (kW/L) = L.
  const volume = qDiv(peakPower, rhoV, "L");
  const litreToMm3 = derived(1000000, "mm3", "1 L = 10^6 mm3 (SI definition of the litre)");
  const volumeMm3 = qMul(volume, litreToMm3, "mm3");

  // Cylinder of diameter D, length AR*D: V = (pi/4) * AR * D^3  =>  D = cbrt(4V / (pi*AR)).
  const diameter = derived(
    npow((volumeMm3.value * 4) / (PI * aspectRatio.value), 1 / 3),
    "mm",
    `stator housing diameter from machine volume: V = (pi/4)*AR*D^3 => D = cbrt(4V/(pi*AR)); ` +
      `V = ${volumeMm3.value.toFixed(0)} mm3 [${volumeMm3.license.tag}] ` +
      `(peak power ${peakPower.value} kW [${peakPower.license.tag}] over volumetric power density ` +
      `${rhoV.value} kW/L [${rhoV.license.tag}]), AR = ${aspectRatio.value} [${aspectRatio.license.tag}]`,
  );
  const activeLength = qMul(aspectRatio, diameter, "mm");

  const reductionStageLength = assumed(
    120,
    "mm",
    "axial length added per single-speed reduction stage (gear pair + differential housing) — " +
      "no citable per-stage axial figure found this run, 120 mm assumed",
  );
  const reductionLength = qMul(reductionStages, reductionStageLength, "mm");
  const axialLength = qAdd(activeLength, reductionLength);

  // --- mass ------------------------------------------------------------------
  // rhoM is kW/kg in a ratio carrier: kW / (kW/kg) = kg.
  const motorMass = qDiv(peakPower, rhoM, "kg");
  const reductionStageMass = assumed(
    25,
    "kg",
    "mass per single-speed reduction stage (gears, diff, housing, oil) — no citable figure found this run, 25 kg assumed",
  );
  const reductionMass = qScale(reductionStageMass, reductionStages);
  const mass = qAdd(motorMass, reductionMass);

  // --- envelope --------------------------------------------------------------
  const terminalBox = assumed(
    70,
    "mm",
    "HV terminal box + phase busbar stack above the machine housing — no citable source found this run, 70 mm assumed",
  );
  const envelopeHeight = qAdd(diameter, terminalBox);
  const radius = diameter.value / 2;
  const activeHalf = activeLength.value / 2;
  const minusYEnd = -(activeHalf + reductionLength.value); // −Y extreme (reduction end)
  const envelopeOffsetY = -(reductionLength.value / 2); // envelope center shifts toward the reduction
  const envelope: BoxShape = {
    kind: "box",
    size: [diameter, axialLength, envelopeHeight],
    offset: [0, envelopeOffsetY, terminalBox.value / 2],
  };

  // --- ports (world-aligned part frames; datum = rotor axis center) ----------
  const zUp: Pt3 = [0, 0, 1];
  const aft: Pt3 = [1, 0, 0];
  const fwd: Pt3 = [-1, 0, 0];
  const left: Pt3 = [0, 1, 0];
  const right: Pt3 = [0, -1, 0];

  const ports: PortRecord[] = [
    port(alloc.next("port"), "mount-L", "point", { origin: [0, activeHalf, -radius], xAxis: left, zAxis: zUp }),
    port(alloc.next("port"), "mount-R", "point", { origin: [0, minusYEnd, -radius], xAxis: right, zAxis: zUp }),
    port(alloc.next("port"), "mount-torque", "point", { origin: [-radius, envelopeOffsetY, 0], xAxis: fwd, zAxis: zUp }),
    port(alloc.next("port"), "output-L", "axis", { origin: [0, activeHalf, 0], xAxis: left, zAxis: zUp }),
    port(alloc.next("port"), "output-R", "axis", { origin: [0, minusYEnd, 0], xAxis: right, zAxis: zUp }),
    port(alloc.next("port"), "coolant-in", "point", { origin: [0, activeHalf / 2, radius], xAxis: aft, zAxis: zUp }),
    port(alloc.next("port"), "coolant-out", "point", { origin: [0, -(activeHalf / 2), radius], xAxis: aft, zAxis: zUp }),
    port(alloc.next("port"), "hv-in", "point", { origin: [0, 0, radius + terminalBox.value], xAxis: aft, zAxis: zUp }),
  ];

  // --- demands ---------------------------------------------------------------
  const mountPad = assumed(
    60,
    "mm",
    "motor-mount bracket pad extent at the case — no citable source found this run, 60 mm assumed",
  );
  const hvBendRadius = assumed(
    80,
    "mm",
    "clearance above the HV terminals for high-voltage cable minimum bend radius — " +
      "no citable bend-radius table found this run, 80 mm assumed",
  );

  const anchorage = (name: string, at: Pt3): DemandRecord =>
    demand({
      id: alloc.next("demand"),
      principal: "physics",
      reason:
        `drive-unit mass (${mass.value.toFixed(0)} kg) and peak drive torque reaction at ${name} ` +
        `must terminate in a reinforced member (anchorage law)`,
      kind: "anchorage",
      shape: { kind: "box", size: [mountPad, mountPad, mountPad], offset: at },
      massBearing: true,
    });

  const demands: DemandRecord[] = [
    demand({
      id: alloc.next("demand"),
      principal: "physics",
      reason:
        "solid bodies exclude one another: the drive unit claims its machine housing, reduction stack and terminal box",
      kind: "envelope",
      shape: envelope,
    }),
    anchorage("mount-L", [0, activeHalf, -radius]),
    anchorage("mount-R", [0, minusYEnd, -radius]),
    anchorage("mount-torque", [-radius, envelopeOffsetY, 0]),
    demand({
      id: alloc.next("demand"),
      principal: "physics",
      reason:
        "high-voltage cables leaving the terminal box need room for their minimum bend radius; " +
        "a kinked HV cable is a failure, so the air above the terminals is claimed",
      kind: "clearance",
      shape: {
        kind: "box",
        size: [diameter, activeLength, hvBendRadius],
        offset: [0, 0, radius + terminalBox.value + hvBendRadius.value / 2],
      },
      magnitude: hvBendRadius,
    }),
  ];

  const dims: EVMotorDims = {
    diameter,
    activeLength,
    reductionLength,
    axialLength,
    volume,
    volumetricPowerDensity: rhoV,
    gravimetricPowerDensity: rhoM,
    motorMass,
    reductionMass,
    mass,
  };

  return {
    id: alloc.next("part"),
    label: `ev-motor ${peakPower.value}kW x${reductionStages.value}red`,
    ports,
    demands,
    mass,
    envelope,
    dims,
  };
}
