/**
 * makeSteering — rack, tie rods and column (type library, charge §5).
 *
 * The rack sits fore or aft of the front axle (param). The column is a TRUE
 * routed-path demand — from the steering-wheel hub position, through the
 * firewall plane, past the engine envelope, down to the rack pinion — not a
 * margin: the packaging solver must run the swept tube collision-free.
 * Waypoints are a param; the fallback path is ASSUMED loudly.
 *
 * turningCircleBackSolve closes the charge §5 chain:
 *   brief turning circle → wheelbase → required steer angle → front swept
 *   envelope widening (feed the returned angle into makeSuspension's
 *   steerAngleDeg — sweptWheelBox in suspension.ts does the widening).
 *
 * Datum: front axle center at wheel-center height (matches the suspension
 * datum so the two mate coaxially). +X aft, +Y left (LHD driver side +Y),
 * +Z up; world-aligned part frame. Units mm, deg, kg.
 */

import type {
  BoxShape,
  DemandRecord,
  IdAllocator,
  PartInstance,
  PathShape,
  PortRecord,
  Pt3,
  Quantity,
} from "@car/schema";
import { assumed, demand, derived, port, qDiv, qMul, sourced } from "@car/demand";
import { DEG, natan2 } from "@car/num";

// ---------------------------------------------------------------------------
// Back-solve: brief turning circle → required steer angle (bicycle model)
// ---------------------------------------------------------------------------

/**
 * Simple single-track (bicycle) model, chain shown:
 *
 *   R = turningCircle / 2          (brief circles are diameters)
 *   tan(δ) = wheelbase / R    →    δ = atan(wheelbase / R)
 *
 * Simplifications stated: one track, no Ackermann inner/outer split, R taken
 * at the vehicle path center ≈ kerb circle / 2. Monotone: a tighter circle
 * demands more steer angle. Feed δ into makeSuspension({ steerAngleDeg }) to
 * widen the front swept wheel envelope.
 */
export function turningCircleBackSolve(
  briefTurningCircle: Quantity<"m"> | Quantity<"mm">,
  wheelbase: Quantity<"mm">,
): Quantity<"deg"> {
  if (briefTurningCircle.value <= 0) throw new Error("turningCircleBackSolve: turning circle must be positive");
  if (wheelbase.value <= 0) throw new Error("turningCircleBackSolve: wheelbase must be positive");

  const circleMm: Quantity<"mm"> =
    briefTurningCircle.unit === "m"
      ? qMul(briefTurningCircle, derived(1000, "ratio", "1 m = 1000 mm (SI)"), "mm")
      : (briefTurningCircle as Quantity<"mm">);
  const radius = qDiv(circleMm, derived(2, "count", "turning radius = circle diameter / 2"), "mm");
  if (radius.value <= wheelbase.value) {
    throw new Error(
      `turningCircleBackSolve: circle radius ${radius.value.toFixed(0)} mm is not meaningfully larger than the wheelbase ` +
        `${wheelbase.value} mm — the bicycle model degenerates; check the brief`,
    );
  }
  const angleRad = natan2(wheelbase.value, radius.value);
  return derived(
    angleRad / DEG,
    "deg",
    `bicycle-model back-solve: delta = atan(wheelbase / R), R = circle/2; ` +
      `circle = ${circleMm.value.toFixed(0)} mm [${circleMm.license.tag}], wheelbase = ${wheelbase.value} mm [${wheelbase.license.tag}], ` +
      `R = ${radius.value.toFixed(0)} mm [${radius.license.tag}] — single-track simplification, no Ackermann split, R at path center`,
  );
}

// ---------------------------------------------------------------------------
// Parameters
// ---------------------------------------------------------------------------

export type RackPosition = "fore" | "aft";

export interface SteeringParams {
  /** Rack axis forward ("fore") or rearward ("aft") of the front axle line. */
  readonly rackPosition: RackPosition;
  /** Standoff of the rack axis from the axle line. Default ASSUMED. */
  readonly rackOffset?: Quantity<"mm">;
  /** Overall steering ratio (wheel deg : road-wheel deg), e.g. 15. */
  readonly ratio: Quantity<"ratio">;
  /** Front track — sizes the rack and tie rods. */
  readonly trackWidth: Quantity<"mm">;
  /**
   * Column path from the steering-wheel hub DOWN to the rack pinion, in part
   * space (front axle center datum). First waypoint = wheel hub; last =
   * pinion. Omitted → a loudly ASSUMED default path through the firewall.
   */
  readonly columnWaypoints?: readonly Pt3[];
  /** Swept clearance radius of the column run. Default ASSUMED. */
  readonly columnRadius?: Quantity<"mm">;
  /** Driver centerline offset from vehicle centerline (+Y = left, LHD). */
  readonly driverY?: Quantity<"mm">;
  readonly massOverride?: Quantity<"kg">;
}

export interface SteeringDims {
  readonly rackLength: Quantity<"mm">;
  /** Signed rack station: negative = fore (forward, −X) of the axle. */
  readonly rackStationX: Quantity<"mm">;
  readonly columnRadius: Quantity<"mm">;
  readonly ratio: Quantity<"ratio">;
  /** The wheel-hub end of the column path (part space). */
  readonly wheelHub: Pt3;
  readonly mass: Quantity<"kg">;
}

export interface SteeringInstance extends PartInstance {
  readonly dims: SteeringDims;
}

/** SOURCED typical overall steering-ratio range, for reference and validation prose. */
export function typicalSteeringRatio(): Quantity<"ratio"> {
  return sourced(
    14,
    "ratio",
    "Common passenger-car rack-and-pinion overall steering ratio",
    "HowStuffWorks 'How Car Steering Works': passenger cars typically 12:1–20:1; " +
      "firgelliauto.com steering-gear guide: ≈14:1 common for rack-and-pinion (e.g. Toyota Corolla ≈14:1, per ScienceDirect 'Steering Ratio' topic). Retrieved 2026-08-22.",
  );
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function makeSteering(params: SteeringParams, alloc: IdAllocator): SteeringInstance {
  const { rackPosition, ratio, trackWidth } = params;
  if (trackWidth.value <= 0) throw new Error("makeSteering: trackWidth must be positive");
  if (ratio.value <= 0) throw new Error("makeSteering: ratio must be positive");

  const rackOffset =
    params.rackOffset ??
    assumed(140, "mm", "rack axis fore/aft standoff from the front axle line — packaging figure, no source found this run, 140 mm ASSUMED");
  const rackStationX = derived(
    rackPosition === "fore" ? -rackOffset.value : rackOffset.value,
    "mm",
    `rack station = ${rackPosition === "fore" ? "-" : "+"}rackOffset (${rackPosition} of axle); rackOffset = ${rackOffset.value} mm [${rackOffset.license.tag}]`,
  );
  const rackX = rackStationX.value;

  const tieRodLength = assumed(
    320,
    "mm",
    "tie-rod length per side, rack end to steering arm — no source found this run, 320 mm ASSUMED",
  );
  const rackLength = derived(
    trackWidth.value - tieRodLength.value * 2,
    "mm",
    `rack housing length = track − 2 × tie-rod length; track = ${trackWidth.value} mm [${trackWidth.license.tag}], ` +
      `tie rod = ${tieRodLength.value} mm [${tieRodLength.license.tag}]`,
  );
  if (rackLength.value <= 0) {
    throw new Error("makeSteering: track too narrow for the assumed tie rods — pass a wider trackWidth or shorter tie rods");
  }

  const rackDiameter = assumed(70, "mm", "rack housing diameter incl. boots — no source found this run, 70 mm ASSUMED");
  const columnRadius =
    params.columnRadius ??
    assumed(
      50,
      "mm",
      "steering column swept clearance radius (tube + joints + boot swing) — no dimensioned source found this run, 50 mm ASSUMED",
    );
  const driverY =
    params.driverY ?? assumed(370, "mm", "driver centerline offset from vehicle centerline (LHD, +Y left) — no source found this run, 370 mm ASSUMED");

  // --- column path: wheel hub → firewall → pinion ---------------------------
  const defaultHubX = assumed(1350, "mm", "steering-wheel hub aft of the front axle — cabin-position placeholder, no source, ASSUMED");
  const defaultHubZ = assumed(620, "mm", "steering-wheel hub above wheel-center height — placeholder, no source, ASSUMED");
  const defaultFirewallX = assumed(850, "mm", "firewall plane station aft of the front axle — placeholder, no source, ASSUMED");
  const defaultFirewallZ = assumed(330, "mm", "column height at the firewall pass-through — placeholder, no source, ASSUMED");

  const waypoints: readonly Pt3[] =
    params.columnWaypoints ??
    [
      [defaultHubX.value, driverY.value, defaultHubZ.value],
      [defaultFirewallX.value, driverY.value, defaultFirewallZ.value],
      [rackX, driverY.value, 0],
    ];
  if (waypoints.length < 2) throw new Error("makeSteering: columnWaypoints needs at least hub and pinion");
  const wheelHub = waypoints[0]!;
  const pinion = waypoints[waypoints.length - 1]!;

  // --- ports ----------------------------------------------------------------
  const zUp: Pt3 = [0, 0, 1];
  const halfRack = rackLength.value / 2;
  const mountInset = assumed(80, "mm", "rack mount bosses inset from the housing ends — no source found this run, 80 mm ASSUMED");
  const mountY = halfRack - mountInset.value;

  const ports: PortRecord[] = [
    port(alloc.next("port"), "rack-pinion", "point", { origin: pinion, xAxis: [1, 0, 0], zAxis: zUp }),
    port(alloc.next("port"), "tie-rod-L", "axis", { origin: [rackX, halfRack, 0], xAxis: [0, 1, 0], zAxis: zUp }),
    port(alloc.next("port"), "tie-rod-R", "axis", { origin: [rackX, -halfRack, 0], xAxis: [0, -1, 0], zAxis: zUp }),
    port(alloc.next("port"), "column-top", "point", { origin: wheelHub, xAxis: [-1, 0, 0], zAxis: zUp }),
    port(alloc.next("port"), "mount-L", "point", { origin: [rackX, mountY, 0], xAxis: [1, 0, 0], zAxis: zUp }),
    port(alloc.next("port"), "mount-R", "point", { origin: [rackX, -mountY, 0], xAxis: [1, 0, 0], zAxis: zUp }),
  ];

  // --- demands --------------------------------------------------------------
  const envelope: BoxShape = {
    kind: "box",
    size: [rackDiameter, rackLength, rackDiameter],
    offset: [rackX, 0, 0],
  };
  const columnPath: PathShape = { kind: "path", waypoints, radius: columnRadius };
  const mountPad = assumed(60, "mm", "rack mount bracket pad extent — no source found this run, 60 mm ASSUMED");

  const demands: DemandRecord[] = [
    demand({
      id: alloc.next("demand"),
      principal: "physics",
      reason: "solid bodies exclude one another: the rack housing and boots claim their run across the car",
      kind: "envelope",
      shape: envelope,
    }),
    demand({
      id: alloc.next("demand"),
      principal: "person",
      reason:
        "the driver's hands are on the wheel: the steering column must run from the wheel hub through the " +
        "firewall plane past the engine envelope to the rack pinion, collision-free along its whole swept tube — " +
        "a true routed-path check, not a margin (charge §5)",
      kind: "routed-path",
      shape: columnPath,
      magnitude: columnRadius,
    }),
    demand({
      id: alloc.next("demand"),
      principal: "physics",
      reason: "steering loads (rack reaction to cornering and kerb strikes) enter at mount-L — must terminate in a reinforced member (anchorage law)",
      kind: "anchorage",
      shape: { kind: "box", size: [mountPad, mountPad, mountPad], offset: [rackX, mountY, 0] },
      massBearing: true,
    }),
    demand({
      id: alloc.next("demand"),
      principal: "physics",
      reason: "steering loads (rack reaction to cornering and kerb strikes) enter at mount-R — must terminate in a reinforced member (anchorage law)",
      kind: "anchorage",
      shape: { kind: "box", size: [mountPad, mountPad, mountPad], offset: [rackX, -mountY, 0] },
      massBearing: true,
    }),
  ];

  const mass =
    params.massOverride ??
    assumed(14, "kg", "rack + tie rods + column assembly mass — no source found this run, 14 kg ASSUMED; pass massOverride");

  const dims: SteeringDims = {
    rackLength,
    rackStationX,
    columnRadius,
    ratio,
    wheelHub,
    mass,
  };

  return {
    id: alloc.next("part"),
    label: `steering rack-${rackPosition} ratio-${ratio.value}`,
    ports,
    demands,
    mass,
    envelope,
    dims,
  };
}
