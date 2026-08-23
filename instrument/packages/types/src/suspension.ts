/**
 * makeSuspension — one axle of suspension, per architecture (charge §5).
 *
 * Architectures: strut | double-wishbone | multilink | twist-beam | solid-axle.
 * Params are travel in jounce and rebound plus the tire the axle carries.
 *
 * Envelope: TYPE-SHAPED boxes. The qualitative shape is SOURCED (struts tall
 * and hood-height-demanding, wishbones wide and low, twist beam a transverse
 * brick between the wheels — citations in each value); the specific millimeter
 * dimensions could not be found as published figures this run and are ASSUMED
 * loudly, value by value.
 *
 * Publishes:
 *   - the swept wheel envelope per side = tire section + travel, plus steering
 *     articulation sweep at the front — the front box is wider, which is why
 *     front arches out-demand rears (charge §5);
 *   - pickup anchorage demands (massBearing) that must land in reinforced
 *     members (anchorage law, charge §2).
 *
 * DELIBERATELY OUT (charge §14): suspension kinematics beyond travel — camber,
 * caster and toe curves, roll centers, anti-dive/anti-squat, compliance. The
 * tool states this exclusion here and in SUSPENSION_KINEMATICS_EXCLUSION; no
 * kinematic number beyond jounce/rebound travel is computed or claimed.
 *
 * Datum: axle center — mid-track on the axle line at wheel-center height.
 * +X aft, +Y left, +Z up; world-aligned part frame. Units mm, kg, deg.
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
import { assumed, demand, derived, port, qAdd, sourced } from "@car/demand";
import { DEG, ncos, nmax, nsin } from "@car/num";

// ---------------------------------------------------------------------------
// Scope statement — the charge requires the exclusion to be stated in code.
// ---------------------------------------------------------------------------

export const SUSPENSION_KINEMATICS_EXCLUSION =
  "Suspension kinematics beyond jounce/rebound travel (camber/caster/toe curves, roll centers, " +
  "anti-dive/anti-squat, compliance) are deliberately out of scope in v1 (charge §14) — " +
  "the tool states this where a user would expect those numbers; none is computed or claimed.";

// ---------------------------------------------------------------------------
// Parameters
// ---------------------------------------------------------------------------

export type SuspensionArchitecture =
  | "strut"
  | "double-wishbone"
  | "multilink"
  | "twist-beam"
  | "solid-axle";

export type AxlePosition = "front" | "rear";

export interface SuspensionParams {
  readonly architecture: SuspensionArchitecture;
  readonly axle: AxlePosition;
  /** Upward wheel travel from design position. */
  readonly jounceTravel: Quantity<"mm">;
  /** Downward wheel travel from design position. */
  readonly reboundTravel: Quantity<"mm">;
  /** Wheel-center to wheel-center across the axle. */
  readonly trackWidth: Quantity<"mm">;
  /** Tire this axle carries (from makeWheelTire dims). */
  readonly tireOverallDiameter: Quantity<"mm">;
  readonly tireSectionWidth: Quantity<"mm">;
  /**
   * Steering articulation at the wheel. Front axles default to the SOURCED
   * typical maximum (≈35°); feed turningCircleBackSolve(...) from steering.ts
   * here to couple the brief's turning circle to the swept envelope.
   * Rear axles default to 0.
   */
  readonly steerAngleDeg?: Quantity<"deg">;
  readonly massOverride?: Quantity<"kg">;
}

export interface SuspensionDims {
  /** Swept wheel box per side: X (fore-aft) under articulation. */
  readonly sweptWheelLength: Quantity<"mm">;
  /** Swept wheel box per side: Y (across) under articulation — the arch width driver. */
  readonly sweptWheelWidth: Quantity<"mm">;
  /** Swept wheel box per side: Z = tire diameter + jounce + rebound. */
  readonly sweptWheelHeight: Quantity<"mm">;
  readonly totalTravel: Quantity<"mm">;
  /** Hardware stack height above wheel center — the hood-height demander. */
  readonly archHeightAboveWheelCenter: Quantity<"mm">;
  /** Hardware reach inboard of the tire's inner face, per side. */
  readonly archInboardWidthPerSide: Quantity<"mm">;
  readonly steerAngleDeg: Quantity<"deg">;
  readonly mass: Quantity<"kg">;
}

export interface SuspensionInstance extends PartInstance {
  readonly dims: SuspensionDims;
}

// ---------------------------------------------------------------------------
// Per-architecture shape values. Qualitative shape SOURCED; millimeters ASSUMED
// loudly (no published packaging dimensions found this run).
// ---------------------------------------------------------------------------

const STRUT_QUAL =
  "struts are the tall architecture: 'MacPherson struts are tall… making it difficult to lower a vehicle's " +
  "profile', 'generally taller than double wishbones, which may require a higher hood line' " +
  "(evo.co.uk 'Double wishbone suspension explained'; Advance Auto Parts / AutoZone strut-vs-wishbone comparisons, retrieved 2026-08-22)";
const WISHBONE_QUAL =
  "double wishbones are the wide-and-low architecture: 'requires less vertical space, allowing a lower ride height', " +
  "'more real estate under the hood… more horizontal space' (evo.co.uk 'Double wishbone suspension explained'; " +
  "Advance Auto Parts / AutoZone comparisons, retrieved 2026-08-22)";
const TWIST_QUAL =
  "a twist beam is a transverse brick between the wheels: 'transverse H- or C-shaped beam interconnecting the two rear " +
  "wheels… spans ≈1.2–1.5 m, roughly the rear track, packaged compactly under the floorpan' " +
  "(my-cardictionary.com 'Torsion Beam Axle'; twist-beam overview pages, retrieved 2026-08-22)";

interface ArchShape {
  readonly heightAboveWheelCenter: Quantity<"mm">;
  readonly inboardWidthPerSide: Quantity<"mm">;
  readonly depthX: Quantity<"mm">;
  /** Pickup points per side, in part space for the LEFT side (+Y); mirrored for right. */
  readonly pickups: readonly { readonly name: string; readonly at: Pt3 }[];
  readonly mass: Quantity<"kg">;
}

function archShape(
  architecture: SuspensionArchitecture,
  trackWidth: Quantity<"mm">,
  tireSectionWidth: Quantity<"mm">,
): ArchShape {
  const halfTrack = trackWidth.value / 2;
  switch (architecture) {
    case "strut": {
      const height = assumed(
        560,
        "mm",
        `strut stack wheel center to top mount — ${STRUT_QUAL}; no dimensioned source found, 560 mm ASSUMED`,
      );
      const inboard = assumed(
        220,
        "mm",
        "strut architecture is horizontally compact ('takes up less space… allows a wider engine compartment' — AutoZone/Advance Auto comparisons); 220 mm inboard reach ASSUMED, no dimensioned source",
      );
      const depth = assumed(360, "mm", "lower-control-arm fore-aft span + strut body — no source found this run, 360 mm ASSUMED");
      const towerInset = assumed(70, "mm", "strut top mount sits slightly inboard of the wheel center line — no source, 70 mm ASSUMED");
      const lcaDrop = assumed(110, "mm", "lower-control-arm inboard pivots below wheel center — no source, 110 mm ASSUMED");
      const towerY = halfTrack - towerInset.value;
      const lcaY = halfTrack - inboard.value;
      return {
        heightAboveWheelCenter: height,
        inboardWidthPerSide: inboard,
        depthX: depth,
        pickups: [
          { name: "tower", at: [0, towerY, height.value] },
          { name: "lca-front", at: [-(depth.value / 2), lcaY, -lcaDrop.value] },
          { name: "lca-rear", at: [depth.value / 2, lcaY, -lcaDrop.value] },
        ],
        mass: assumed(85, "kg", "strut axle assembly (two corners: struts, springs, knuckles, LCAs, subframe share) — no source found this run, 85 kg ASSUMED; pass massOverride"),
      };
    }
    case "double-wishbone": {
      const height = assumed(
        330,
        "mm",
        `upper wishbone + rocker/spring packaged low — ${WISHBONE_QUAL}; no dimensioned source found, 330 mm ASSUMED`,
      );
      const inboard = assumed(
        450,
        "mm",
        `two lateral arms reach far inboard — ${WISHBONE_QUAL}; 450 mm inboard reach ASSUMED, no dimensioned source`,
      );
      const depth = assumed(420, "mm", "wishbone leg fore-aft spread — no source found this run, 420 mm ASSUMED");
      const ucaZ = assumed(240, "mm", "upper-arm inboard pivot height above wheel center — no source, 240 mm ASSUMED");
      const lcaDrop = assumed(120, "mm", "lower-arm inboard pivot below wheel center — no source, 120 mm ASSUMED");
      const armY = halfTrack - inboard.value;
      return {
        heightAboveWheelCenter: height,
        inboardWidthPerSide: inboard,
        depthX: depth,
        pickups: [
          { name: "uca-front", at: [-(depth.value / 2), armY, ucaZ.value] },
          { name: "uca-rear", at: [depth.value / 2, armY, ucaZ.value] },
          { name: "lca-front", at: [-(depth.value / 2), armY, -lcaDrop.value] },
          { name: "lca-rear", at: [depth.value / 2, armY, -lcaDrop.value] },
          { name: "spring-seat", at: [0, armY, height.value] },
        ],
        mass: assumed(95, "kg", "double-wishbone axle assembly (arms ×4, uprights, springs/dampers, subframe share) — no source found this run, 95 kg ASSUMED; pass massOverride"),
      };
    }
    case "multilink": {
      const height = assumed(400, "mm", "multilink stack between strut-tall and wishbone-low — qualitative interpolation of the cited strut/wishbone comparisons; 400 mm ASSUMED, no dimensioned source");
      const inboard = assumed(470, "mm", "five links reach inboard to the subframe — no dimensioned source found this run, 470 mm ASSUMED");
      const depth = assumed(480, "mm", "link fan fore-aft spread — no source found this run, 480 mm ASSUMED");
      const linkY = halfTrack - inboard.value;
      const upperZ = assumed(210, "mm", "upper link pivot height — no source, 210 mm ASSUMED");
      const lowerDrop = assumed(130, "mm", "lower link pivots below wheel center — no source, 130 mm ASSUMED");
      const toeX = assumed(190, "mm", "toe-link station aft of the axle line — no source, 190 mm ASSUMED");
      return {
        heightAboveWheelCenter: height,
        inboardWidthPerSide: inboard,
        depthX: depth,
        pickups: [
          { name: "upper-front", at: [-(depth.value / 2), linkY, upperZ.value] },
          { name: "upper-rear", at: [depth.value / 2, linkY, upperZ.value] },
          { name: "lower-front", at: [-(depth.value / 2), linkY, -lowerDrop.value] },
          { name: "lower-rear", at: [depth.value / 2, linkY, -lowerDrop.value] },
          { name: "toe-link", at: [toeX.value, linkY, 0] },
          { name: "damper-top", at: [0, linkY, height.value] },
        ],
        mass: assumed(105, "kg", "multilink axle assembly (five links per side, subframe share) — no source found this run, 105 kg ASSUMED; pass massOverride"),
      };
    }
    case "twist-beam": {
      const damperTop = assumed(380, "mm", "twist-beam damper top above wheel center — no source found this run, 380 mm ASSUMED");
      const beamDepth = assumed(240, "mm", `beam cross-section fore-aft — ${TWIST_QUAL}; section depth 240 mm ASSUMED, no dimensioned source`);
      const armLength = assumed(380, "mm", "trailing-arm bush ahead of the wheel center — no source found this run, 380 mm ASSUMED");
      const beamInboard = derived(
        tireSectionWidth.value,
        "mm",
        `beam runs wheel-to-wheel: inboard reach per side taken as one tire section (${tireSectionWidth.value} mm [${tireSectionWidth.license.tag}]) — the brick fills the space between the wheels (${TWIST_QUAL})`,
      );
      const bushY = halfTrack - assumed(40, "mm", "trailing-arm bush slightly inboard of wheel center — no source, 40 mm ASSUMED").value;
      return {
        heightAboveWheelCenter: damperTop,
        inboardWidthPerSide: beamInboard,
        depthX: beamDepth,
        pickups: [
          { name: "trailing-bush", at: [-armLength.value, bushY, 0] },
          { name: "damper-top", at: [0, bushY, damperTop.value] },
        ],
        mass: assumed(45, "kg", "twist-beam axle ('fewer parts and lower weight than multilink' — my-cardictionary.com) — no measured source found this run, 45 kg ASSUMED; pass massOverride"),
      };
    }
    case "solid-axle": {
      const damperTop = assumed(420, "mm", "solid-axle damper top above wheel center — no source found this run, 420 mm ASSUMED");
      const tubeDepth = assumed(260, "mm", "axle tube + differential housing fore-aft bulk — no source found this run, 260 mm ASSUMED");
      const linkX = assumed(350, "mm", "four-link pickup stations fore/aft of the axle — no source, 350 mm ASSUMED");
      const linkInset = assumed(180, "mm", "link brackets inboard of wheel center — no source, 180 mm ASSUMED");
      const beamInboard = derived(
        halfTrack,
        "mm",
        `solid axle spans the full track: inboard reach per side = half track (${trackWidth.value} mm [${trackWidth.license.tag}] / 2)`,
      );
      const linkY = halfTrack - linkInset.value;
      return {
        heightAboveWheelCenter: damperTop,
        inboardWidthPerSide: beamInboard,
        depthX: tubeDepth,
        pickups: [
          { name: "link-front", at: [-linkX.value, linkY, 0] },
          { name: "link-rear", at: [linkX.value, linkY, 0] },
          { name: "damper-top", at: [0, linkY, damperTop.value] },
        ],
        mass: assumed(110, "kg", "solid axle with tube, diff and links (unsprung-heavy architecture) — no source found this run, 110 kg ASSUMED; pass massOverride"),
      };
    }
  }
}

// ---------------------------------------------------------------------------
// Swept wheel box — the pure geometry, exported so tests and callers can see
// exactly how articulation widens the front.
// ---------------------------------------------------------------------------

/**
 * Bounding box of a tire (cylinder: diameter × section) steered ±angle about Z
 * and traveled jounce/rebound along Z. At angle 0: [diameter, section, diameter+travel].
 */
export function sweptWheelBox(
  tireOverallDiameter: Quantity<"mm">,
  tireSectionWidth: Quantity<"mm">,
  steerAngleDeg: Quantity<"deg">,
  jounceTravel: Quantity<"mm">,
  reboundTravel: Quantity<"mm">,
): { readonly x: Quantity<"mm">; readonly y: Quantity<"mm">; readonly z: Quantity<"mm"> } {
  const a = steerAngleDeg.value * DEG;
  const d = tireOverallDiameter.value;
  const w = tireSectionWidth.value;
  const x = derived(
    d * ncos(a) + w * nsin(a),
    "mm",
    `swept X = diameter×cos(steer) + section×sin(steer); diameter = ${d} mm [${tireOverallDiameter.license.tag}], ` +
      `section = ${w} mm [${tireSectionWidth.license.tag}], steer = ${steerAngleDeg.value} deg [${steerAngleDeg.license.tag}]`,
  );
  const y = derived(
    d * nsin(a) + w * ncos(a),
    "mm",
    `swept Y = diameter×sin(steer) + section×cos(steer) — articulation swings the tire's length into width; ` +
      `diameter = ${d} mm [${tireOverallDiameter.license.tag}], section = ${w} mm [${tireSectionWidth.license.tag}], steer = ${steerAngleDeg.value} deg [${steerAngleDeg.license.tag}]`,
  );
  const z = qAdd(qAdd(tireOverallDiameter, jounceTravel), reboundTravel);
  return { x, y, z };
}

/** SOURCED typical maximum front steer angle — the front-axle default. */
export function typicalMaxSteerAngle(): Quantity<"deg"> {
  return sourced(
    35,
    "deg",
    "Typical passenger-car maximum front-wheel steer angle",
    "us.ok.com 'What is the maximum steering angle of a car's front wheels?': 30–40° typical, ≈35° common " +
      "(Ford Focus / Vauxhall Corsa class); carinterior.alibaba.com steering-angle guide: inner 39.6° / outer 33.5° example. Retrieved 2026-08-22.",
  );
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * One axle of suspension. Kinematics beyond travel are OUT (charge §14) —
 * see SUSPENSION_KINEMATICS_EXCLUSION; only jounce/rebound travel is modeled.
 */
export function makeSuspension(params: SuspensionParams, alloc: IdAllocator): SuspensionInstance {
  const { architecture, axle, jounceTravel, reboundTravel, trackWidth, tireOverallDiameter, tireSectionWidth } = params;
  if (trackWidth.value <= 0) throw new Error("makeSuspension: trackWidth must be positive");
  if (jounceTravel.value < 0 || reboundTravel.value < 0) {
    throw new Error("makeSuspension: travel must be non-negative");
  }

  const steerAngleDeg: Quantity<"deg"> =
    params.steerAngleDeg ??
    (axle === "front"
      ? typicalMaxSteerAngle()
      : derived(0, "deg", "rear axle: no steering articulation — swept envelope is tire + travel only"));

  const totalTravel = qAdd(jounceTravel, reboundTravel);
  const swept = sweptWheelBox(tireOverallDiameter, tireSectionWidth, steerAngleDeg, jounceTravel, reboundTravel);
  const arch = archShape(architecture, trackWidth, tireSectionWidth);

  const halfTrack = trackWidth.value / 2;
  const tireRadius = tireOverallDiameter.value / 2;

  // Swept box per side, vertical extent: wheel center travels [-rebound, +jounce];
  // tire extends ±radius beyond → z ∈ [-(radius+rebound), radius+jounce]; box center offset:
  const sweptZCenter = (jounceTravel.value - reboundTravel.value) / 2;

  // --- part envelope: swept wheels + type-shaped hardware -------------------
  const envLength = derived(
    nmax(swept.x.value, arch.depthX.value),
    "mm",
    `axle envelope length = max(swept wheel X ${swept.x.value.toFixed(1)} mm [${swept.x.license.tag}], hardware depth ${arch.depthX.value} mm [${arch.depthX.license.tag}])`,
  );
  const envWidth = derived(
    trackWidth.value + swept.y.value,
    "mm",
    `axle envelope width = track + swept wheel Y (each hub carries half a swept box outboard); ` +
      `track = ${trackWidth.value} mm [${trackWidth.license.tag}], swept Y = ${swept.y.value.toFixed(1)} mm [${swept.y.license.tag}]`,
  );
  // The axle part claims its HARDWARE, not its wheels: the wheels are their own
  // parts with their own envelopes, and each wheel's sweep is published as a
  // per-side swept-envelope demand above. Claiming tire radius + travel here
  // double-counted the wheels and made the axle a solid slab across the track,
  // which nothing mounted between the wheels — an engine, a rack — could clear.
  // (Found at the P1's first solve.)
  const envTop = derived(
    arch.heightAboveWheelCenter.value,
    "mm",
    `envelope top above wheel center = hardware height ${arch.heightAboveWheelCenter.value} mm [${arch.heightAboveWheelCenter.license.tag}] — the wheels claim their own sweep`,
  );
  const envBottom = derived(
    jounceTravel.value + reboundTravel.value,
    "mm",
    `envelope bottom below wheel center = total travel ${totalTravel.value} mm [${totalTravel.license.tag}]: the arms swing through it`,
  );
  const envHeight = qAdd(envTop, envBottom);
  const envelope: BoxShape = {
    kind: "box",
    size: [envLength, envWidth, envHeight],
    offset: [0, 0, (envTop.value - envBottom.value) / 2],
  };

  // --- ports: hubs + pickups, both sides (symmetry across Y=0) --------------
  const zUp: Pt3 = [0, 0, 1];
  const ports: PortRecord[] = [
    port(alloc.next("port"), "hub-L", "axis", { origin: [0, halfTrack, 0], xAxis: [0, 1, 0], zAxis: zUp }),
    port(alloc.next("port"), "hub-R", "axis", { origin: [0, -halfTrack, 0], xAxis: [0, -1, 0], zAxis: zUp }),
  ];
  for (const p of arch.pickups) {
    ports.push(
      port(alloc.next("port"), `${p.name}-L`, "point", { origin: p.at, xAxis: [0, 1, 0], zAxis: zUp }),
      port(alloc.next("port"), `${p.name}-R`, "point", { origin: [p.at[0], -p.at[1], p.at[2]], xAxis: [0, -1, 0], zAxis: zUp }),
    );
  }

  // --- demands --------------------------------------------------------------
  const sweptReason =
    axle === "front"
      ? "swept wheel envelope, front: tire section + jounce/rebound travel + steering articulation sweep — " +
        "the steered tire swings its length into width, which is why front arches out-demand rears (charge §5)"
      : "swept wheel envelope, rear: tire section + jounce/rebound travel (no steering articulation)";

  const sweptBoxL: BoxShape = {
    kind: "box",
    size: [swept.x, swept.y, swept.z],
    offset: [0, halfTrack, sweptZCenter],
  };
  const sweptBoxR: BoxShape = {
    kind: "box",
    size: [swept.x, swept.y, swept.z],
    offset: [0, -halfTrack, sweptZCenter],
  };

  const mountPad = assumed(70, "mm", "pickup bracket pad extent at the member face — no source found this run, 70 mm ASSUMED");

  const demands: DemandRecord[] = [
    demand({
      id: alloc.next("demand"),
      principal: "physics",
      reason: sweptReason + " — left wheel",
      kind: "swept-envelope",
      shape: sweptBoxL,
    }),
    demand({
      id: alloc.next("demand"),
      principal: "physics",
      reason: sweptReason + " — right wheel",
      kind: "swept-envelope",
      shape: sweptBoxR,
    }),
    demand({
      id: alloc.next("demand"),
      principal: "physics",
      reason: `solid bodies exclude one another: the ${architecture} axle claims its type-shaped hardware box plus swept wheels`,
      kind: "envelope",
      shape: envelope,
    }),
  ];

  for (const p of arch.pickups) {
    for (const side of ["L", "R"] as const) {
      const at: Pt3 = side === "L" ? p.at : [p.at[0], -p.at[1], p.at[2]];
      demands.push(
        demand({
          id: alloc.next("demand"),
          principal: "physics",
          reason:
            `wheel loads (vertical, lateral, braking) enter the body at pickup '${p.name}-${side}' — ` +
            `a mass-bearing anchorage must terminate in a reinforced member (anchorage law)`,
          kind: "anchorage",
          shape: { kind: "box", size: [mountPad, mountPad, mountPad], offset: at },
          massBearing: true,
        }),
      );
    }
  }

  const mass = params.massOverride ?? arch.mass;

  const dims: SuspensionDims = {
    sweptWheelLength: swept.x,
    sweptWheelWidth: swept.y,
    sweptWheelHeight: swept.z,
    totalTravel,
    archHeightAboveWheelCenter: arch.heightAboveWheelCenter,
    archInboardWidthPerSide: arch.inboardWidthPerSide,
    steerAngleDeg,
    mass,
  };

  return {
    id: alloc.next("part"),
    label: `suspension ${architecture} ${axle}`,
    ports,
    demands,
    mass,
    envelope,
    dims,
  };
}
