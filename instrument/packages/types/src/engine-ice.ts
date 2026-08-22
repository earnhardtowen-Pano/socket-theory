/**
 * makeEngineICE — parametric internal-combustion engine (type library, charge §5).
 *
 * Datum: crank centerline at the bellhousing face center, part frame world-aligned.
 * Longitudinal: crank along X, block extends forward (−X), bellhousing normal +X (aft).
 * Transverse: crank along Y, block extends toward −Y, bellhousing normal +Y (left).
 * Left = +Y (centerline Y=0). I-layout exhaust side is left (+Y) longitudinal / aft (+X) transverse.
 *
 * Every number is licensed: DERIVED chains shown, SOURCED coefficients cited from
 * research performed 2026-08-22, ASSUMED margins flagged loudly. No bare constants.
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
import { DEG, PI, nabs, ncos, nmax, npow, nsin } from "@car/num";

// ---------------------------------------------------------------------------
// Parameters
// ---------------------------------------------------------------------------

export type EngineLayout = "I" | "V" | "flat";
export type EngineOrientation = "longitudinal" | "transverse";

export interface EngineICEParams {
  readonly layout: EngineLayout;
  readonly cylinders: Quantity<"count">;
  readonly displacement: Quantity<"L">;
  /** Bore / stroke. >1 oversquare, <1 undersquare. */
  readonly boreStrokeRatio: Quantity<"ratio">;
  /** Included bank angle. Required for layout "V"; ignored for "I" (0°) and "flat" (180°). */
  readonly vAngleDeg?: Quantity<"deg">;
  readonly orientation: EngineOrientation;
  /** Rotation of the block about the crank axis. Default 0. */
  readonly tiltDeg?: Quantity<"deg">;
  /** Oil pan depth below the crank centerline. */
  readonly sumpDepth?: Quantity<"mm">;
  /** Adds a turbocharger bubble on each exhaust side. */
  readonly turbo?: boolean;
  // Ancillary margins — declared parameters with defaults (ASSUMED unless overridden).
  readonly plenumHeight?: Quantity<"mm">;
  readonly manifoldBubble?: Quantity<"mm">;
  readonly turboBubble?: Quantity<"mm">;
  readonly accessoryDriveFace?: Quantity<"mm">;
}

export interface EngineICEDims {
  readonly bore: Quantity<"mm">;
  readonly stroke: Quantity<"mm">;
  readonly boreSpacing: Quantity<"mm">;
  readonly cylindersPerBank: Quantity<"count">;
  readonly blockLength: Quantity<"mm">;
  /** Total length along the crank axis incl. accessory-drive face. */
  readonly length: Quantity<"mm">;
  /** Envelope width across the crank axis (after tilt). */
  readonly width: Quantity<"mm">;
  /** Envelope height (after tilt), sump bottom to plenum top. */
  readonly height: Quantity<"mm">;
  readonly bankLength: Quantity<"mm">;
  readonly heightAboveCrank: Quantity<"mm">;
  readonly sumpDepth: Quantity<"mm">;
  readonly mass: Quantity<"kg">;
}

export interface EngineICEInstance extends PartInstance {
  readonly dims: EngineICEDims;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function makeEngineICE(params: EngineICEParams, alloc: IdAllocator): EngineICEInstance {
  const { layout, cylinders, displacement, boreStrokeRatio, orientation } = params;
  if (layout === "V" && !params.vAngleDeg) {
    throw new Error("makeEngineICE: layout \"V\" requires vAngleDeg");
  }

  // --- ancillary margins: declared parameters with ASSUMED defaults ---------
  const plenumHeight =
    params.plenumHeight ??
    assumed(80, "mm", "intake plenum + runners stack above the heads — typical passenger-car plenum ~70–100 mm; no citable source found this run");
  const manifoldBubble =
    params.manifoldBubble ??
    assumed(90, "mm", "exhaust manifold + primary-pipe bubble per bank, lateral — no citable source found this run");
  const turboBubble =
    params.turboBubble ??
    assumed(120, "mm", "turbocharger + hot-side plumbing bubble per exhaust bank — no citable source found this run");
  const accessoryDriveFace =
    params.accessoryDriveFace ??
    assumed(100, "mm", "accessory drive (belt plane, pulleys, pumps) ahead of the block front face — no citable source found this run");
  const sumpDepth =
    params.sumpDepth ??
    assumed(160, "mm", "wet-sump pan depth below crank centerline — typical 150–200 mm; no citable source found this run");
  const tiltDeg = params.tiltDeg ?? derived(0, "deg", "no tilt requested — default 0");

  // --- bore and stroke from displacement (chain per charge §5) --------------
  const litreToMm3 = derived(1000000, "ratio", "1 L = 10^6 mm3 (SI definition of the litre)");
  const displacementMm3 = qMul(displacement, litreToMm3, "mm3");
  const vcyl = qDiv(displacementMm3, cylinders, "mm3");
  const bore = derived(
    npow((vcyl.value * boreStrokeRatio.value * 4) / PI, 1 / 3),
    "mm",
    `bore from displacement: Vcyl = (pi/4)*bore^2*stroke with stroke = bore/R => bore = cbrt(4*Vcyl*R/pi); ` +
      `Vcyl = ${vcyl.value.toFixed(1)} mm3 [${vcyl.license.tag}] (displacement ${displacement.value} L [${displacement.license.tag}] over ${cylinders.value} cylinders [${cylinders.license.tag}]), ` +
      `R = ${boreStrokeRatio.value} [${boreStrokeRatio.license.tag}]`,
  );
  const stroke = qDiv(bore, boreStrokeRatio, "mm");

  // --- bore spacing: SOURCED per modern production blocks -------------------
  const boreSpacingRatio = sourced(
    1.09,
    "ratio",
    "Bore-spacing-to-bore ratio of modern production blocks",
    "GM Gen III/IV LS: 4.400 in (111.76 mm) spacing over 4.065 in (103.25 mm) max production bore = 1.082 " +
      "(Holley Motor Life, 'Gen III/Gen IV LS Engine: Specs, dimensions, and Engine History'); " +
      "Ford Coyote 5.0: 100 mm spacing over 92.2 mm bore = 1.085 (DIY Ford, 'Ford Coyote Engine Cylinder Block Performance Guide'); " +
      "1.09 taken at the tight end of modern practice. Retrieved 2026-08-22.",
  );
  const boreSpacing = qMul(bore, boreSpacingRatio, "mm");

  // --- block length = cylinders-per-bank x bore spacing ---------------------
  const cylindersPerBank: Quantity<"count"> =
    layout === "I"
      ? cylinders
      : derived(cylinders.value / 2, "count", `cylinders per bank = ${cylinders.value} cylinders [${cylinders.license.tag}] / 2 banks (${layout} layout)`);
  const blockLength = qMul(cylindersPerBank, boreSpacing, "mm");
  const length = qAdd(blockLength, accessoryDriveFace);

  // --- bank geometry: crank-to-deck stack -----------------------------------
  const rodRatio = sourced(
    1.7,
    "ratio",
    "Connecting-rod length to stroke ratio, production engines",
    "Engine Builder Magazine, 'How Rod Lengths and Ratios Affect Performance' (2016): production rod ratios 1.4–2.0, most 1.6–1.8; V6s typically 1.7–1.8. Mid value 1.7 taken. Retrieved 2026-08-22.",
  );
  const rodLength = qMul(rodRatio, stroke, "mm");
  const halfStroke = derived(stroke.value / 2, "mm", `half stroke = ${stroke.value.toFixed(1)} mm [${stroke.license.tag}] / 2 (crank throw)`);
  const compHeight = assumed(35, "mm", "piston compression height (pin center to crown) — typical 30–40 mm for passenger-car bores; no citable source found this run");
  const crankToDeck = qAdd(qAdd(halfStroke, rodLength), compHeight);
  const headStack = assumed(115, "mm", "cylinder head + DOHC valvetrain + cam cover stack above the deck — no citable source found this run");
  const bankLength = qAdd(crankToDeck, headStack);
  const counterweightMargin = assumed(40, "mm", "crank counterweight + web radial clearance beyond half stroke — no citable source found this run");
  const crankcaseRadius = qAdd(halfStroke, counterweightMargin);

  // --- V-angle geometry -----------------------------------------------------
  const halfBankAngle: Quantity<"deg"> =
    layout === "V"
      ? derived((params.vAngleDeg as Quantity<"deg">).value / 2, "deg", `half bank angle = V angle ${(params.vAngleDeg as Quantity<"deg">).value} deg [${(params.vAngleDeg as Quantity<"deg">).license.tag}] / 2`)
      : layout === "flat"
        ? derived(90, "deg", "flat layout: included bank angle 180 deg / 2 = 90 deg from vertical")
        : derived(0, "deg", "inline layout: single bank upright, 0 deg from vertical");
  const halfRad = halfBankAngle.value * DEG;

  const widthCore = derived(
    nmax(bankLength.value * nsin(halfRad), crankcaseRadius.value) * 2,
    "mm",
    `core width = 2 * max(bankLength*sin(halfBankAngle), crankcaseRadius); ` +
      `bankLength = ${bankLength.value.toFixed(1)} mm [${bankLength.license.tag}], halfBankAngle = ${halfBankAngle.value} deg [${halfBankAngle.license.tag}], ` +
      `crankcaseRadius = ${crankcaseRadius.value.toFixed(1)} mm [${crankcaseRadius.license.tag}] (V-angle and stroke geometry)`,
  );
  const heightAboveCrank = derived(
    nmax(bankLength.value * ncos(halfRad), crankcaseRadius.value),
    "mm",
    `height above crank = max(bankLength*cos(halfBankAngle), crankcaseRadius); ` +
      `bankLength = ${bankLength.value.toFixed(1)} mm [${bankLength.license.tag}], halfBankAngle = ${halfBankAngle.value} deg [${halfBankAngle.license.tag}] (stroke geometry)`,
  );

  // --- side bubbles: exhaust manifold (+ optional turbo) per bank -----------
  const turboExtra: Quantity<"mm"> = params.turbo
    ? turboBubble
    : derived(0, "mm", "no turbocharger requested — no turbo bubble");
  const exhaustSide = qAdd(manifoldBubble, turboExtra);
  // V and flat carry exhaust outboard on both banks; inline exhausts on the left (+Y), intake on the right.
  const sideLeft = exhaustSide;
  const sideRight = layout === "I" ? manifoldBubble : exhaustSide;

  const width = qAdd(qAdd(widthCore, sideLeft), sideRight);
  const heightCore = qAdd(qAdd(sumpDepth, heightAboveCrank), plenumHeight);

  // --- tilt about the crank axis inflates the cross-section -----------------
  const tiltRad = nabs(tiltDeg.value) * DEG;
  const widthTilted = derived(
    width.value * ncos(tiltRad) + heightCore.value * nsin(tiltRad),
    "mm",
    `tilted width = width*cos(tilt) + height*sin(tilt); width = ${width.value.toFixed(1)} mm [${width.license.tag}], height = ${heightCore.value.toFixed(1)} mm [${heightCore.license.tag}], tilt = ${tiltDeg.value} deg [${tiltDeg.license.tag}]`,
  );
  const heightTilted = derived(
    heightCore.value * ncos(tiltRad) + width.value * nsin(tiltRad),
    "mm",
    `tilted height = height*cos(tilt) + width*sin(tilt); height = ${heightCore.value.toFixed(1)} mm [${heightCore.license.tag}], width = ${width.value.toFixed(1)} mm [${width.license.tag}], tilt = ${tiltDeg.value} deg [${tiltDeg.license.tag}]`,
  );

  // --- mass: SOURCED specific mass ------------------------------------------
  const specificMass = sourced(
    46.5,
    "kg/L",
    "Dry mass per litre of displacement, modern aluminium passenger-car engines",
    "BMW B58 3.0L I6: 139 kg dry = 46.3 kg/L (mymotorlist.com / babybmw.net B58 spec pages); " +
      "Toyota 2GR-FE 3.5L V6: 163 kg service weight = 46.6 kg/L (Australian Car Reviews, '2GR-FE Toyota engine'). " +
      "Mid value 46.5 kg/L. Excludes turbo and transmission. Retrieved 2026-08-22.",
  );
  const mass = qMul(displacement, specificMass, "kg");

  // --- geometry in the longitudinal datum, then orient ----------------------
  // Longitudinal part space: origin at bellhousing face center on the crank axis,
  // +X aft (out of the bellhousing face), block toward -X, +Y left, +Z up.
  const mapPt: (p: Pt3) => Pt3 =
    orientation === "longitudinal" ? (p) => p : (p) => [p[1], p[0], p[2]];

  const lengthV = length.value;
  const blockMidX = -(blockLength.value / 2);
  const topZ = heightTilted.value - sumpDepth.value;
  const asymY = (sideLeft.value - sideRight.value) / 2;

  const envelopeSize: readonly [Quantity<"mm">, Quantity<"mm">, Quantity<"mm">] =
    orientation === "longitudinal"
      ? [length, widthTilted, heightTilted]
      : [widthTilted, length, heightTilted];
  const envelopeOffset = mapPt([-(lengthV / 2), asymY, heightTilted.value / 2 - sumpDepth.value]);
  const envelope: BoxShape = { kind: "box", size: envelopeSize, offset: envelopeOffset };

  // --- ports (world-aligned frames, origin at the stated datum) -------------
  const zUp: Pt3 = [0, 0, 1];
  const aft: Pt3 = mapPt([1, 0, 0]);
  const fwd: Pt3 = mapPt([-1, 0, 0]);
  const left: Pt3 = mapPt([0, 1, 0]);
  const right: Pt3 = mapPt([0, -1, 0]);

  const mountY = widthCore.value / 2;
  // Envelope is centered at asymY; the physical side faces sit at asymY +/- width/2.
  // Untilted positions — with nonzero tilt the envelope inflates symmetrically past these.
  const leftFaceY = asymY + width.value / 2;
  const rightFaceY = asymY - width.value / 2;
  const flangeZ = heightAboveCrank.value / 2;

  const ports: PortRecord[] = [
    port(alloc.next("port"), "bellhousing", "face", { origin: mapPt([0, 0, 0]), xAxis: aft, zAxis: zUp }),
    port(alloc.next("port"), "mount-front-L", "point", { origin: mapPt([blockMidX, mountY, 0]), xAxis: left, zAxis: zUp }),
    port(alloc.next("port"), "mount-front-R", "point", { origin: mapPt([blockMidX, -mountY, 0]), xAxis: right, zAxis: zUp }),
    port(alloc.next("port"), "exhaust-flange-L", "face", { origin: mapPt([blockMidX, leftFaceY, flangeZ]), xAxis: left, zAxis: zUp }),
    ...(layout === "I"
      ? []
      : [port(alloc.next("port"), "exhaust-flange-R", "face", { origin: mapPt([blockMidX, rightFaceY, flangeZ]), xAxis: right, zAxis: zUp })]),
    port(alloc.next("port"), "coolant-in", "point", { origin: mapPt([-lengthV, 0, flangeZ]), xAxis: fwd, zAxis: zUp }),
    port(alloc.next("port"), "coolant-out", "point", { origin: mapPt([-lengthV, 0, heightAboveCrank.value]), xAxis: fwd, zAxis: zUp }),
    port(alloc.next("port"), "intake-mouth", "point", { origin: mapPt([-(lengthV / 2), 0, topZ]), xAxis: zUp, zAxis: zUp }),
  ];

  // --- demands --------------------------------------------------------------
  const heatGap = assumed(
    50,
    "mm",
    "clearance to exhaust manifold/turbo surfaces — manifolds and catalysts run 430–870 C " +
      "(thecatalyticconverter.com, 'What Is a Catalytic Converter Heat Shield?', retrieved 2026-08-22); " +
      "no published standoff distance found this run, 50 mm assumed",
  );
  const serviceGap = assumed(
    100,
    "mm",
    "hand-and-tool access above the cam covers (plugs, coils, fluids) — person-stated service margin; no citable source",
  );
  const mountPad = assumed(
    60,
    "mm",
    "engine-mount bracket pad extent at the block face — no citable source found this run",
  );

  const heatBoxSize: readonly [Quantity<"mm">, Quantity<"mm">, Quantity<"mm">] =
    orientation === "longitudinal"
      ? [blockLength, heatGap, bankLength]
      : [heatGap, blockLength, bankLength];

  const demands: DemandRecord[] = [
    demand({
      id: alloc.next("demand"),
      principal: "physics",
      reason: "solid bodies exclude one another: the engine claims its block, sump, plenum and per-bank manifold bubbles",
      kind: "envelope",
      shape: envelope,
    }),
    demand({
      id: alloc.next("demand"),
      principal: "physics",
      reason:
        "exhaust-side heat: manifold and catalyst surfaces run 430–870 C (thecatalyticconverter.com, retrieved 2026-08-22); " +
        "adjacent parts, lines and harnesses need standoff air on the left exhaust side",
      kind: "clearance",
      shape: { kind: "box", size: heatBoxSize, offset: mapPt([blockMidX, leftFaceY + heatGap.value / 2, flangeZ]) },
      magnitude: heatGap,
    }),
    ...(layout === "I"
      ? []
      : [
          demand({
            id: alloc.next("demand"),
            principal: "physics",
            reason:
              "exhaust-side heat: manifold and catalyst surfaces run 430–870 C (thecatalyticconverter.com, retrieved 2026-08-22); " +
              "adjacent parts, lines and harnesses need standoff air on the right exhaust side",
            kind: "clearance",
            shape: { kind: "box", size: heatBoxSize, offset: mapPt([blockMidX, rightFaceY - heatGap.value / 2, flangeZ]) },
            magnitude: heatGap,
          }),
        ]),
    demand({
      id: alloc.next("demand"),
      principal: "person",
      reason: "a technician must reach plugs, coils and fill points from above without pulling the engine",
      kind: "clearance",
      shape: {
        kind: "box",
        size: orientation === "longitudinal" ? [length, widthTilted, serviceGap] : [widthTilted, length, serviceGap],
        offset: mapPt([-(lengthV / 2), asymY, topZ + serviceGap.value / 2]),
      },
      magnitude: serviceGap,
    }),
    demand({
      id: alloc.next("demand"),
      principal: "physics",
      reason: `engine mass (${mass.value.toFixed(0)} kg) and torque reaction at mount-front-L must terminate in a reinforced member (anchorage law)`,
      kind: "anchorage",
      shape: { kind: "box", size: [mountPad, mountPad, mountPad], offset: mapPt([blockMidX, mountY, 0]) },
      massBearing: true,
    }),
    demand({
      id: alloc.next("demand"),
      principal: "physics",
      reason: `engine mass (${mass.value.toFixed(0)} kg) and torque reaction at mount-front-R must terminate in a reinforced member (anchorage law)`,
      kind: "anchorage",
      shape: { kind: "box", size: [mountPad, mountPad, mountPad], offset: mapPt([blockMidX, -mountY, 0]) },
      massBearing: true,
    }),
  ];

  const dims: EngineICEDims = {
    bore,
    stroke,
    boreSpacing,
    cylindersPerBank,
    blockLength,
    length,
    width: widthTilted,
    height: heightTilted,
    bankLength,
    heightAboveCrank,
    sumpDepth,
    mass,
  };

  return {
    id: alloc.next("part"),
    label: `engine-ice ${layout}${cylinders.value} ${displacement.value}L ${orientation}`,
    ports,
    demands,
    mass,
    envelope,
    dims,
  };
}
