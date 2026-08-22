/**
 * makeDriveline — propshaft, final drive and halfshafts (type library, charge §5).
 *
 * Shaft diameter is derived from peak torque over a SOURCED allowable shear
 * stress: tau = 16T/(pi d^3) solved for d (solid shaft; conservative envelope
 * for a real tube). Allowable shear follows the ASME transmission-shafting rule
 * (30% yield / 18% ultimate, whichever governs) on AISI 4140 Q&T steel — both
 * cited. Halfshaft articulation and plunge limits are SOURCED from GKN joint data.
 *
 * Datum: shaft centerline at the transmission-output end, world-aligned.
 * +X aft: the propshaft runs aft to the diff at x = shaftLength. Longitudinal
 * publishes the tunnel-section routed-path demand onto the substrate.
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
  qMin,
  qMul,
  qScale,
  sourced,
} from "@car/demand";
import { DEG, PI, npow, nsin } from "@car/num";

// ---------------------------------------------------------------------------
// Parameters
// ---------------------------------------------------------------------------

export type DrivelineLayout = "longitudinal" | "transverse";

export interface DrivelineParams {
  /** Peak torque the sized shaft must carry (engine x gearing as applicable — caller states which shaft). */
  readonly torque: Quantity<"Nm">;
  readonly layout: DrivelineLayout;
  /** Propshaft span, transmission output to diff nose. Longitudinal only. */
  readonly shaftLength?: Quantity<"mm">;
  /** Halfshaft span, diff flange to wheel center. */
  readonly halfshaftLength?: Quantity<"mm">;
  /** Overrides for the SOURCED joint limits, if the caller runs different joints. */
  readonly articulationFixedDeg?: Quantity<"deg">;
  readonly articulationPlungeDeg?: Quantity<"deg">;
  readonly plungeTravel?: Quantity<"mm">;
}

export interface DrivelineDims {
  readonly shaftDiameter: Quantity<"mm">;
  readonly allowableShear: Quantity<"MPa">;
  readonly shaftLength: Quantity<"mm">;
  readonly halfshaftLength: Quantity<"mm">;
  readonly articulationFixedDeg: Quantity<"deg">;
  readonly articulationPlungeDeg: Quantity<"deg">;
  readonly plungeTravel: Quantity<"mm">;
  readonly mass: Quantity<"kg">;
}

export interface DrivelineInstance extends PartInstance {
  readonly dims: DrivelineDims;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function makeDriveline(params: DrivelineParams, alloc: IdAllocator): DrivelineInstance {
  const { torque, layout } = params;

  const shaftLength =
    params.shaftLength ??
    (layout === "longitudinal"
      ? assumed(1500, "mm", "propshaft span depends on wheelbase and engine setback — placeholder pending the chassis solve")
      : derived(0, "mm", "transverse layout: no propshaft, final drive integral to the transaxle"));
  const halfshaftLength =
    params.halfshaftLength ??
    assumed(350, "mm", "halfshaft span diff-flange to wheel center — depends on track and diff width; placeholder pending the chassis solve");

  // --- allowable shear: ASME rule on AISI 4140 Q&T --------------------------
  const yieldStrength = sourced(
    655,
    "MPa",
    "AISI 4140 steel yield strength, quenched and tempered",
    "655–850 MPa Q&T at 25 mm section — AZoM, 'AISI 4140 Alloy Steel (UNS G41400)'; low end taken. Retrieved 2026-08-22.",
  );
  const ultimateStrength = sourced(
    850,
    "MPa",
    "AISI 4140 steel ultimate tensile strength, quenched and tempered",
    "850–1000 MPa Q&T at 25 mm section — AZoM, 'AISI 4140 Alloy Steel (UNS G41400)'; low end taken. Retrieved 2026-08-22.",
  );
  const asmeYieldFactor = sourced(
    0.3,
    "ratio",
    "ASME transmission-shafting allowable shear: 30% of yield strength (shafts without keyways)",
    "Engineers Edge, 'ASME Shaft Design Allowable Stress and Diameter equations and calculators'; standard machine-design " +
      "texts state allowable shear = 30% Sy, not over 18% Su, less 25% with keyways. Retrieved 2026-08-22.",
  );
  const asmeUltimateFactor = sourced(
    0.18,
    "ratio",
    "ASME transmission-shafting allowable shear: 18% of ultimate strength (shafts without keyways)",
    "Engineers Edge, 'ASME Shaft Design Allowable Stress and Diameter equations and calculators'. Retrieved 2026-08-22.",
  );
  const allowableShear = qMin(
    qMul(asmeYieldFactor, yieldStrength, "MPa"),
    qMul(asmeUltimateFactor, ultimateStrength, "MPa"),
  );

  const shockFactor = assumed(
    1.5,
    "ratio",
    "ASME kt shock/fatigue multiplier on torque (suddenly applied load) — the code's kt table values were not retrieved this run; 1.5 assumed",
  );
  const designTorque = qScale(torque, shockFactor);

  // --- diameter: tau = 16T/(pi d^3) solved for d ----------------------------
  const shaftDiameter = derived(
    npow((16 * designTorque.value * 1000) / (PI * allowableShear.value), 1 / 3),
    "mm",
    `tau = 16T/(pi d^3) solved for d: d = cbrt(16*T/(pi*tau_allow)); ` +
      `T = ${torque.value} Nm [${torque.license.tag}] x kt ${shockFactor.value} [${shockFactor.license.tag}] = ${designTorque.value.toFixed(0)} Nm = ${(designTorque.value * 1000).toFixed(0)} N*mm; ` +
      `tau_allow = ${allowableShear.value.toFixed(1)} MPa [${allowableShear.license.tag}] (min of 30% Sy, 18% Su on AISI 4140 Q&T, both SOURCED). Solid-shaft sizing — conservative envelope for a tube.`,
  );

  // --- joint limits: SOURCED GKN data ---------------------------------------
  const articulationFixedDeg =
    params.articulationFixedDeg ??
    sourced(
      47,
      "deg",
      "GKN AC fixed ball joint maximum articulation (outboard/wheel-side)",
      "AC joint 47 deg max (UF joint: 50 deg) — GKN 'Driveshafts Technology' (SPIDAN/LOEBRO editions), gknautomotive.com aftermarket downloads. Retrieved 2026-08-22.",
    );
  const articulationPlungeDeg =
    params.articulationPlungeDeg ??
    sourced(
      22,
      "deg",
      "GKN VL ball plunging joint maximum articulation (inboard/diff-side)",
      "VL joint 22 deg max with 50 mm plunge (DO joint: 26–31 deg) — GKN 'Driveshafts Technology' (SPIDAN/LOEBRO editions), gknautomotive.com. Retrieved 2026-08-22.",
    );
  const plungeTravel =
    params.plungeTravel ??
    sourced(
      50,
      "mm",
      "GKN VL/DO plunging joint axial plunge travel",
      "50 mm plunge — GKN 'Driveshafts Technology' (SPIDAN/LOEBRO editions), gknautomotive.com. Retrieved 2026-08-22.",
    );

  // --- clearances and diff geometry -----------------------------------------
  const runningClearance = assumed(
    25,
    "mm",
    "propshaft-to-tunnel running clearance for driveline jounce and shaft whirl — no citable source found this run",
  );
  const tunnelRadius = qAdd(
    derived(shaftDiameter.value / 2, "mm", `shaft radius = d/2, d = ${shaftDiameter.value.toFixed(1)} mm [DERIVED]`),
    runningClearance,
  );
  const diffFlangeSpan = assumed(180, "mm", "diff housing width across the output flanges — no citable source found this run");
  const diffSize = assumed(250, "mm", "final-drive housing bulk (ring gear + carrier) — no citable source found this run");

  // --- mass: volume x density (+ diff housing) ------------------------------
  const steelDensity = sourced(
    7.85,
    "g/cm3",
    "AISI 4140 steel density",
    "7.85 g/cm3 — AZoM, 'AISI 4140 Alloy Steel (UNS G41400)'. Retrieved 2026-08-22.",
  );
  const shaftMass = derived(
    (PI / 4) * shaftDiameter.value * shaftDiameter.value * shaftLength.value * steelDensity.value * 1e-6,
    "kg",
    `shaft mass = (pi/4)*d^2*L*rho: d = ${shaftDiameter.value.toFixed(1)} mm [DERIVED], L = ${shaftLength.value} mm [${shaftLength.license.tag}], ` +
      `rho = ${steelDensity.value} g/cm3 [SOURCED] (1 g/cm3 = 1e-6 kg/mm3). Solid shaft — conservative.`,
  );
  const diffMass =
    layout === "longitudinal"
      ? assumed(35, "kg", "final-drive housing + gears + lube — no citable source found this run")
      : derived(0, "kg", "transverse layout: final drive integral to the transaxle, counted in the transmission entry");
  const mass = qAdd(shaftMass, diffMass);

  // --- geometry -------------------------------------------------------------
  const L = shaftLength.value;
  const diffX = layout === "longitudinal" ? L : 0;
  const zUp: Pt3 = [0, 0, 1];

  const envelopeWidth = derived(
    (layout === "longitudinal" ? tunnelRadius.value * 2 : 0) + diffFlangeSpan.value,
    "mm",
    `envelope width = shaft swept width (2*tunnelRadius, longitudinal only) + diff flange span; ` +
      `tunnelRadius = ${tunnelRadius.value.toFixed(1)} mm [${tunnelRadius.license.tag}], span = ${diffFlangeSpan.value} mm [${diffFlangeSpan.license.tag}]`,
  );
  const envelopeLength = qAdd(
    shaftLength,
    layout === "longitudinal" ? diffSize : derived(diffSize.value, "mm", `transverse: envelope is the diff bulk alone (${diffSize.value} mm [${diffSize.license.tag}])`),
  );
  const envelope: BoxShape = {
    kind: "box",
    size: [envelopeLength, envelopeWidth, diffSize],
    offset: [(L + diffSize.value) / 2, 0, 0],
  };

  const ports: PortRecord[] = [
    port(alloc.next("port"), "input", "face", { origin: [0, 0, 0], xAxis: [-1, 0, 0], zAxis: zUp }),
    port(alloc.next("port"), "diff", "point", { origin: [diffX, 0, 0], xAxis: [1, 0, 0], zAxis: zUp }),
    port(alloc.next("port"), "halfshaft-L", "axis", {
      origin: [diffX, diffFlangeSpan.value / 2, 0],
      xAxis: [0, 1, 0],
      zAxis: zUp,
    }),
    port(alloc.next("port"), "halfshaft-R", "axis", {
      origin: [diffX, -(diffFlangeSpan.value / 2), 0],
      xAxis: [0, -1, 0],
      zAxis: zUp,
    }),
  ];

  // --- demands --------------------------------------------------------------
  const demands: DemandRecord[] = [
    demand({
      id: alloc.next("demand"),
      principal: "physics",
      reason: "solid bodies exclude one another: shaft run and final-drive housing claim their volume",
      kind: "envelope",
      shape: envelope,
    }),
    demand({
      id: alloc.next("demand"),
      principal: "physics",
      reason: `final-drive mass (${diffMass.value.toFixed(0)} kg) and axle torque reaction must terminate in a reinforced member (anchorage law)`,
      kind: "anchorage",
      shape: { kind: "box", size: [diffSize, diffFlangeSpan, diffSize], offset: [diffX, 0, 0] },
      massBearing: true,
    }),
  ];

  if (layout === "longitudinal") {
    demands.push(
      demand({
        id: alloc.next("demand"),
        principal: "physics",
        reason:
          "tunnel section: a rotating propshaft must cross the floor collision-free under driveline jounce and whirl — " +
          "the substrate must open a tunnel of this radius along the shaft line",
        kind: "routed-path",
        shape: {
          kind: "path",
          waypoints: [
            [0, 0, 0],
            [L, 0, 0],
          ],
          radius: tunnelRadius,
        },
        magnitude: tunnelRadius,
      }),
    );
  }

  // Halfshaft articulation sweep, per side: the shaft cone under jounce/rebound
  // articulation (inboard plunging-joint limit) plus plunge travel along Y.
  const sweepHalfHeight = derived(
    halfshaftLength.value * nsin(articulationPlungeDeg.value * DEG),
    "mm",
    `halfshaft vertical sweep = halfshaftLength * sin(inboard articulation limit); ` +
      `halfshaftLength = ${halfshaftLength.value} mm [${halfshaftLength.license.tag}], limit = ${articulationPlungeDeg.value} deg [${articulationPlungeDeg.license.tag}]`,
  );
  const sweepHeight = qAdd(sweepHalfHeight, sweepHalfHeight);
  const sweepLength = qAdd(halfshaftLength, plungeTravel);
  for (const side of [1, -1] as const) {
    demands.push(
      demand({
        id: alloc.next("demand"),
        principal: "physics",
        reason:
          `wheel travel articulates the halfshaft: inboard plunging joint allows ${articulationPlungeDeg.value} deg and ` +
          `${plungeTravel.value} mm plunge, outboard fixed joint ${articulationFixedDeg.value} deg (GKN Driveshafts Technology) — ` +
          "the swept cone must stay collision-free",
        kind: "swept-envelope",
        shape: {
          kind: "box",
          size: [sweepHeight, sweepLength, sweepHeight],
          offset: [diffX, side * (diffFlangeSpan.value / 2 + sweepLength.value / 2), 0],
        },
        magnitude: articulationPlungeDeg,
      }),
    );
  }

  const dims: DrivelineDims = {
    shaftDiameter,
    allowableShear,
    shaftLength,
    halfshaftLength,
    articulationFixedDeg,
    articulationPlungeDeg,
    plungeTravel,
    mass,
  };

  return {
    id: alloc.next("part"),
    label: `driveline ${layout} ${torque.value}Nm`,
    ports,
    demands,
    mass,
    envelope,
    dims,
  };
}
