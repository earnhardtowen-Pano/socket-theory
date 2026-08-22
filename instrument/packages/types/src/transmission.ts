/**
 * makeTransmission — parametric gearbox (type library, charge §5).
 *
 * Case length comes from per-type coefficients anchored on published dimensions
 * of representative units (researched 2026-08-22, cited on each quantity), scaled
 * by gear count around the anchor's gear count with an ASSUMED per-gear growth.
 *
 * Datum: crank/input centerline at the bellhousing face center, world-aligned.
 * +X aft: the case extends aft from the bellhousing, output at x = caseLength.
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
  qScale,
  qSub,
  sourced,
} from "@car/demand";

// ---------------------------------------------------------------------------
// Parameters
// ---------------------------------------------------------------------------

export type TransmissionType = "manual" | "auto" | "dct" | "cvt" | "ev-reduction";

export interface TransmissionParams {
  readonly type: TransmissionType;
  /** Forward gear count. Ignored for length by "cvt" (continuous) and "ev-reduction" (single speed). */
  readonly gearCount: Quantity<"count">;
}

export interface TransmissionDims {
  readonly caseLength: Quantity<"mm">;
  readonly caseWidth: Quantity<"mm">;
  readonly caseHeight: Quantity<"mm">;
  readonly mass: Quantity<"kg">;
}

export interface TransmissionInstance extends PartInstance {
  readonly dims: TransmissionDims;
}

interface TypeAnchor {
  readonly anchorLength: Quantity<"mm">;
  readonly anchorGears: Quantity<"count">;
  readonly growthPerGear: Quantity<"ratio">;
  readonly mass: Quantity<"kg">;
  readonly caseWidth: Quantity<"mm">;
  readonly caseHeight: Quantity<"mm">;
}

// ---------------------------------------------------------------------------
// Per-type coefficients — SOURCED anchors, ASSUMED where research came up thin
// ---------------------------------------------------------------------------

function anchorFor(type: TransmissionType): TypeAnchor {
  const crossSectionNote =
    "case cross-section beyond the bellhousing — no published width/height found this run";
  switch (type) {
    case "manual":
      return {
        anchorLength: sourced(
          864.4,
          "mm",
          "Tremec T-56 Magnum 6-speed overall length",
          "34.03 in = 864.4 mm (Ford pattern; GM pattern 34.85 in) — shiftsst.com 'TREMEC Magnum Features and Dimensions'; " +
            "threepedals.com 'Tremec T56 Magnum dimensions'. Retrieved 2026-08-22.",
        ),
        anchorGears: sourced(
          6,
          "count",
          "Tremec T-56 Magnum forward gear count",
          "6-speed — Tremec Magnum service literature / shiftsst.com. Retrieved 2026-08-22.",
        ),
        growthPerGear: assumed(
          0.06,
          "ratio",
          "case-length growth per added forward gear (one gear-and-synchro pack ~6% of case) — no citable source found this run",
        ),
        mass: sourced(
          61.2,
          "kg",
          "Tremec T-56 Magnum dry mass",
          "135 lb dry = 61.2 kg — Bowler Transmissions / McLeod Racing T-56 Magnum product pages. Retrieved 2026-08-22.",
        ),
        caseWidth: assumed(330, "mm", `manual gearbox ${crossSectionNote}`),
        caseHeight: assumed(380, "mm", `manual gearbox ${crossSectionNote}`),
      };
    case "auto":
      return {
        anchorLength: sourced(
          556.3,
          "mm",
          "GM 4L60E 4-speed automatic overall length",
          "21.9 in = 556.3 mm — dieselhub.com '4L60E Transmission Specs, Gear Ratios, & History' " +
            "(some sources list 23.5 in for later bellhousing configurations). Retrieved 2026-08-22.",
        ),
        anchorGears: sourced(
          4,
          "count",
          "GM 4L60E forward gear count",
          "4-speed — dieselhub.com / Novak Adapt 4L60E guides. Retrieved 2026-08-22.",
        ),
        growthPerGear: assumed(
          0.04,
          "ratio",
          "case-length growth per added ratio for planetary automatics (added clutch pack, less than a full gear pair) — no citable source found this run; " +
            "ZF notes the 8HP kept the 6HP's dimensions (carparts.com ZF 8HP guide), so growth is weak",
        ),
        mass: sourced(
          66.2,
          "kg",
          "GM 4L60E dry mass",
          "146 lb dry = 66.2 kg (162 lb with fluid) — dieselhub.com 4L60E specs; cross-check: ZF 8HP70 87 kg incl. oil " +
            "(carparts.com, 'A Quick Guide to the ZF 8-Speed Transmission'). Retrieved 2026-08-22.",
        ),
        caseWidth: assumed(350, "mm", `automatic gearbox ${crossSectionNote}`),
        caseHeight: assumed(400, "mm", `automatic gearbox ${crossSectionNote}`),
      };
    case "dct":
      return {
        anchorLength: assumed(
          700,
          "mm",
          "no published overall length found this run for a longitudinal DCT (PDK / DL501); assumed between the " +
            "GM 4L60E (556 mm, 4-spd auto) and Tremec T-56 Magnum (864 mm, 6-spd manual) anchors at 7 speeds",
        ),
        anchorGears: assumed(7, "count", "DCT anchor taken as a 7-speed (PDK / DQ-series class) — anchor unit itself assumed, see anchorLength note"),
        growthPerGear: assumed(
          0.05,
          "ratio",
          "case-length growth per added forward gear for twin-shaft DCTs — no citable source found this run",
        ),
        mass: sourced(
          96,
          "kg",
          "VW DQ500 7-speed wet-clutch DCT mass (2WD)",
          "96 kg (212 lb), 4WD +3 kg — HandWiki, 'Engineering:Direct-shift gearbox'. Retrieved 2026-08-22.",
        ),
        caseWidth: assumed(360, "mm", `dual-clutch gearbox ${crossSectionNote}`),
        caseHeight: assumed(400, "mm", `dual-clutch gearbox ${crossSectionNote}`),
      };
    case "cvt":
      return {
        anchorLength: sourced(
          362.3,
          "mm",
          "Jatco CVT8 (JF016E) overall length",
          "362.3 mm — JATCO Ltd technical review, 'Introducing the Jatco CVT8 (JF016E) for the Nissan Rogue' (jatco.co.jp). Retrieved 2026-08-22.",
        ),
        anchorGears: derived(1, "count", "CVT ratio is continuous — nominal single 'gear' anchor"),
        growthPerGear: derived(0, "ratio", "CVT ratio is continuous; case length does not scale with a nominal gear count"),
        mass: sourced(
          94.0,
          "kg",
          "Jatco CVT8 (JF016E) wet mass (2WD)",
          "94.0 kg 2WD / 94.8 kg 4WD — JATCO Ltd technical review, 'Introducing the Jatco CVT8 (JF016E) for the Nissan Rogue'. Retrieved 2026-08-22.",
        ),
        caseWidth: assumed(400, "mm", `CVT (variator sheaves set the section) ${crossSectionNote}`),
        caseHeight: assumed(420, "mm", `CVT (variator sheaves set the section) ${crossSectionNote}`),
      };
    case "ev-reduction": {
      const driveUnitLength = sourced(
        554,
        "mm",
        "Tesla Model 3 rear drive unit front-to-back extent (motor + reduction gear + inverter)",
        "3D-scan dimensions ~676 x 554 x 353 mm — diyelectriccar.com thread 'Model 3 Rear Drive Unit dimensions'; " +
          "InsideEVs Model 3 drive-unit teardown coverage. Retrieved 2026-08-22.",
      );
      const gearCaseFraction = assumed(
        0.45,
        "ratio",
        "reduction-gear case share of the Model 3 drive unit's 554 mm extent — the scan covers the combined unit only; " +
          "no standalone gear-case dimension found this run",
      );
      return {
        anchorLength: qMul(driveUnitLength, gearCaseFraction, "mm"),
        anchorGears: derived(1, "count", "EV reduction stage is single-speed"),
        growthPerGear: derived(0, "ratio", "single-speed reduction; case length does not scale with gear count"),
        mass: assumed(
          30,
          "kg",
          "standalone EV reduction gearbox mass — combined Model 3 drive unit ~91 kg without inverter " +
            "(diyelectriccar.com); gear-case share not separable, 30 kg assumed",
        ),
        caseWidth: assumed(300, "mm", `EV reduction gearbox ${crossSectionNote}`),
        caseHeight: assumed(330, "mm", `EV reduction gearbox ${crossSectionNote}`),
      };
    }
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function makeTransmission(params: TransmissionParams, alloc: IdAllocator): TransmissionInstance {
  const { type, gearCount } = params;
  const anchor = anchorFor(type);

  // caseLength = anchorLength * (1 + growthPerGear * (gearCount - anchorGears))
  const deltaGears = qSub(gearCount, anchor.anchorGears);
  const growth = qMul(anchor.growthPerGear, deltaGears, "ratio");
  const scale = qAdd(derived(1, "ratio", "identity term of the gear-count scaling"), growth);
  const caseLength = qScale(anchor.anchorLength, scale);

  const { caseWidth, caseHeight, mass } = anchor;
  const lenV = caseLength.value;

  const envelope: BoxShape = {
    kind: "box",
    size: [caseLength, caseWidth, caseHeight],
    offset: [lenV / 2, 0, 0],
  };

  // --- ports ----------------------------------------------------------------
  const zUp: Pt3 = [0, 0, 1];
  const ports: PortRecord[] = [
    port(alloc.next("port"), "bellhousing", "face", { origin: [0, 0, 0], xAxis: [-1, 0, 0], zAxis: zUp }),
    port(alloc.next("port"), "output", "face", { origin: [lenV, 0, 0], xAxis: [1, 0, 0], zAxis: zUp }),
    port(alloc.next("port"), "mount-rear", "point", {
      origin: [lenV, 0, -(caseHeight.value / 2)],
      xAxis: [1, 0, 0],
      zAxis: zUp,
    }),
  ];

  // --- demands --------------------------------------------------------------
  const mountPad = assumed(60, "mm", "rear crossmember mount pad extent — no citable source found this run");
  const demands: DemandRecord[] = [
    demand({
      id: alloc.next("demand"),
      principal: "physics",
      reason: "solid bodies exclude one another: the gearbox claims its case volume aft of the bellhousing",
      kind: "envelope",
      shape: envelope,
    }),
    demand({
      id: alloc.next("demand"),
      principal: "physics",
      reason: `gearbox mass (${mass.value.toFixed(0)} kg) and torque reaction at mount-rear must terminate in a reinforced member (anchorage law)`,
      kind: "anchorage",
      shape: { kind: "box", size: [mountPad, mountPad, mountPad], offset: [lenV, 0, -(caseHeight.value / 2)] },
      massBearing: true,
    }),
  ];

  if (type === "manual") {
    const leverRise = assumed(
      250,
      "mm",
      "shift lever must rise from the case top through the tunnel to the driver's hand — reach placeholder; no citable source found this run",
    );
    const linkageRadius = assumed(
      40,
      "mm",
      "shift linkage sweep radius through the tunnel — no citable source found this run",
    );
    const shifterX = lenV / 2 + lenV / 2 / 2; // three-quarters back along the case
    const caseTopZ = caseHeight.value / 2;
    demands.push(
      demand({
        id: alloc.next("demand"),
        principal: "person",
        reason:
          "manual shift linkage: the driver's hand is in the cabin, the gear sets are in the case — " +
          "the linkage must route from the case top through the tunnel into the cabin collision-free",
        kind: "routed-path",
        shape: {
          kind: "path",
          waypoints: [
            [shifterX, 0, caseTopZ],
            [shifterX, 0, caseTopZ + leverRise.value],
          ],
          radius: linkageRadius,
        },
        magnitude: leverRise,
      }),
    );
  }

  const dims: TransmissionDims = { caseLength, caseWidth, caseHeight, mass };

  return {
    id: alloc.next("part"),
    label: `transmission ${type} ${gearCount.value}-speed`,
    ports,
    demands,
    mass,
    envelope,
    dims,
  };
}
