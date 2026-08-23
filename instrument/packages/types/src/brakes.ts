/**
 * makeBrakes — parametric brake system (type library, charge §5).
 *
 * Two duties, per the charge:
 *
 *   1. The wheel floor. The disc must live inside the wheel with sourced
 *      caliper radial clearance: discDiameter <= wheelRimDiameter − 2 x
 *      clearance. deriveMinWheelDiameter() exposes the floor to the rest of
 *      the instrument — brakes set the smallest wheel the car may wear.
 *
 *   2. The pedal box. Booster + master cylinder claim the driver-side
 *      firewall at the pedal box, tied to the heel point: the seated human
 *      sets the heel, and the booster stack is coaxial with the pedal
 *      pushrod, so this hard point cannot move without moving the driver.
 *
 * Datum: the pedal-box point — the booster mounting face center ON the
 * firewall. The booster + master cylinder extend forward (−X) into the
 * engine bay; the pedal pushrod exits aft (+X) into the cabin. Part frame
 * world-aligned; +Y left, +Z up. The solver places the part on the driver's
 * side — the side is recorded, not solved. Corner hardware (discs, calipers)
 * is sized here for the wheel floor and carried in the part mass; its
 * geometry rides the wheel corners, outside this envelope.
 *
 * Research performed 2026-08-22; citations inline.
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
  qScale,
  sourced,
} from "@car/demand";
import { PI } from "@car/num";

// ---------------------------------------------------------------------------
// The wheel floor — sourced clearance, exposed arithmetic
// ---------------------------------------------------------------------------

/** Radial allowance per side between disc OD and wheel rim seat, caliper included. */
export function caliperRadialClearance(): Quantity<"mm"> {
  return sourced(
    50.8,
    "mm",
    "Caliper radial allowance per side between disc OD and wheel rim diameter",
    "Industry big-brake fitment rule: wheel diameter = rotor diameter + 4 in (11 in rotors clear 15 in wheels, " +
      "12 in need 16 in, 13 in need 17 in, 14 in push to 18 in) — icooh.com, 'What size wheels are needed for a big " +
      "brake kit?' and performanceplustire.com, 'BBK Wheel Clearance Guide'. 4 in / 2 sides = 50.8 mm radial per side, " +
      "covering the caliper body plus the hard minimum 5.0 mm caliper-to-rim air gap that EBC Brakes Racing specifies " +
      "in its wheel fitment templates (ebcbrakes.com). Retrieved 2026-08-22.",
  );
}

/**
 * The smallest wheel rim diameter that clears a given disc — brakes set the
 * wheel floor (charge §5). minRim = disc + 2 x sourced caliper radial clearance.
 */
export function deriveMinWheelDiameter(discDiameter: Quantity<"mm">): Quantity<"mm"> {
  const clearance = caliperRadialClearance();
  // Added once per side so the SOURCED clearance shows in the top-level chain.
  return qAdd(qAdd(discDiameter, clearance), clearance);
}

// ---------------------------------------------------------------------------
// Parameters
// ---------------------------------------------------------------------------

export interface BrakesParams {
  /** Front disc diameter — the pair that sets the wheel floor. */
  readonly discDiameter: Quantity<"mm">;
  /** Rim diameter of the wheel the car will wear (17 in = 431.8 mm). */
  readonly wheelRimDiameter: Quantity<"mm">;
  /** Disc thickness. Default ASSUMED 28 mm (vented front rotor). */
  readonly discThickness?: Quantity<"mm">;
  /** Booster diameter. Default SOURCED 8 in dual-diaphragm. */
  readonly boosterDiameter?: Quantity<"mm">;
  /** Which side the driver (and so the pedal box) sits. Recorded, not solved. */
  readonly driverSide?: "left" | "right";
}

export interface BrakesDims {
  readonly discDiameter: Quantity<"mm">;
  readonly discThickness: Quantity<"mm">;
  readonly caliperClearance: Quantity<"mm">;
  /** The wheel floor this disc sets. */
  readonly minWheelRimDiameter: Quantity<"mm">;
  readonly boosterDiameter: Quantity<"mm">;
  /** Booster + master cylinder assembled length, firewall face to MC tip. */
  readonly boosterMcLength: Quantity<"mm">;
  readonly discMassEach: Quantity<"kg">;
  readonly mass: Quantity<"kg">;
}

export interface BrakesInstance extends PartInstance {
  readonly dims: BrakesDims;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function makeBrakes(params: BrakesParams, alloc: IdAllocator): BrakesInstance {
  const { discDiameter, wheelRimDiameter } = params;
  if (discDiameter.value <= 0) {
    throw new Error(`makeBrakes: disc diameter must be positive, got ${discDiameter.value} mm`);
  }

  // --- the wheel floor: disc must fit inside the wheel -----------------------
  const clearance = caliperRadialClearance();
  const minWheelRimDiameter = deriveMinWheelDiameter(discDiameter);
  if (minWheelRimDiameter.value > wheelRimDiameter.value) {
    throw new Error(
      `makeBrakes: disc ${discDiameter.value} mm does not fit inside a ${wheelRimDiameter.value} mm rim — ` +
        `discDiameter <= wheelRimDiameter - 2 x ${clearance.value} mm caliper clearance requires a rim of at least ` +
        `${minWheelRimDiameter.value.toFixed(1)} mm. Brakes set the wheel floor: grow the wheel or shrink the disc.`,
    );
  }

  // --- booster + master cylinder stack ---------------------------------------
  const boosterDiameter =
    params.boosterDiameter ??
    sourced(
      203.2,
      "mm",
      "Dual-diaphragm vacuum booster diameter, 8 in",
      "Master Power Brakes, 'An Explanation of Single and Dual Diaphragm Boosters': single diaphragm 7 in, dual 8 in, " +
        "range 7-11 in; Speedway Motors, 'Dual 8 Inch Brake Booster Master Cylinder Combo' product spec. " +
        "8 in = 203.2 mm. Retrieved 2026-08-22.",
    );
  const boosterMcLength = sourced(
    342.9,
    "mm",
    "Booster + master cylinder assembled length, mount flange to MC tip, 13.5 in",
    "Speedway Motors, 'Dual 8 Inch Brake Booster Master Cylinder Combo, 1-1/8 Inch Bore' product spec: assembled length " +
      "from booster mount flange to end of master cylinder 13.5 in = 342.9 mm. Retrieved 2026-08-22.",
  );

  // --- corner hardware mass (rides the wheel corners; ledgered here) ---------
  const discThickness =
    params.discThickness ??
    assumed(28, "mm", "vented front rotor thickness — typical 22-32 mm; no citable source found this run");
  const hatFraction = assumed(
    0.6,
    "ratio",
    "disc hat/vane inner-diameter fraction of OD — the swept annulus outside it carries the friction ring; " +
      "no citable source found this run, 0.6 assumed",
  );
  const castIronDensity = sourced(
    7.2,
    "g/cm3",
    "Grey cast iron density (G250-class disc rotor material)",
    "ResearchGate materials table, 'Material properties of grey cast iron — density 7.34 g/cm3' and " +
      "trade.mechanic.com.au, 'Disc Rotor Materials - G3000, G250': grey cast iron ~7.2 g/cm3, graded per ISO 185. " +
      "7.2 g/cm3 taken. Retrieved 2026-08-22.",
  );
  const discMassEach = derived(
    (((PI / 4) * discDiameter.value * discDiameter.value * (1 - hatFraction.value * hatFraction.value) *
      discThickness.value) / 1000) * (castIronDensity.value / 1000),
    "kg",
    `disc mass = (pi/4) x (OD^2 - (hatFraction x OD)^2) x thickness x density; OD = ${discDiameter.value} mm ` +
      `[${discDiameter.license.tag}], hatFraction = ${hatFraction.value} [${hatFraction.license.tag}], ` +
      `thickness = ${discThickness.value} mm [${discThickness.license.tag}], density = ${castIronDensity.value} g/cm3 ` +
      `[${castIronDensity.license.tag}]; mm3 -> cm3 -> kg conversions shown`,
  );
  const caliperMassEach = assumed(
    4.5,
    "kg",
    "fixed/floating front caliper mass with pads — no citable figure found this run, 4.5 kg assumed",
  );
  const boosterMcMass = assumed(
    5.5,
    "kg",
    "vacuum booster + tandem master cylinder + reservoir mass — no citable figure found this run, 5.5 kg assumed",
  );
  const two = derived(2, "count", "front axle carries a disc and caliper per side");
  const cornerMass = qAdd(qScale(discMassEach, two), qScale(caliperMassEach, two));
  const mass = qAdd(cornerMass, boosterMcMass);

  // --- envelope: the booster + MC stack forward of the firewall --------------
  const envelope: BoxShape = {
    kind: "box",
    size: [boosterMcLength, boosterDiameter, boosterDiameter],
    offset: [-(boosterMcLength.value / 2), 0, 0],
  };

  // --- ports (datum: pedal-box point on the firewall) ------------------------
  const zUp: readonly [number, number, number] = [0, 0, 1];
  const aft: readonly [number, number, number] = [1, 0, 0];
  const fwd: readonly [number, number, number] = [-1, 0, 0];

  const ports: PortRecord[] = [
    port(alloc.next("port"), "pedal-box", "point", { origin: [0, 0, 0], xAxis: aft, zAxis: zUp }),
    port(alloc.next("port"), "master-cylinder-out", "point", {
      origin: [-boosterMcLength.value, 0, 0],
      xAxis: fwd,
      zAxis: zUp,
    }),
  ];

  // --- demands ---------------------------------------------------------------
  const driverSide = params.driverSide ?? "left";
  const mountPad = assumed(
    80,
    "mm",
    "booster mounting flange + pedal-bracket pad extent on the firewall — no citable source found this run, 80 mm assumed",
  );

  const demands: DemandRecord[] = [
    demand({
      id: alloc.next("demand"),
      principal: "physics",
      reason:
        "solid bodies exclude one another: the booster and master cylinder claim the driver-side firewall face " +
        "ahead of the pedal box",
      kind: "envelope",
      shape: envelope,
    }),
    demand({
      id: alloc.next("demand"),
      principal: "person",
      reason:
        `the pedal box sits at the ${driverSide}-side driver's heel point and cannot move: the seated human fixes ` +
        `the heel, the pedals must meet the foot, and the booster + master cylinder are coaxial with the pedal ` +
        `pushrod through the firewall — moving this point means moving the driver`,
      kind: "point-at",
    }),
    demand({
      id: alloc.next("demand"),
      principal: "physics",
      reason:
        "panic-stop pedal force reacts through the booster into the firewall, and the hung pedal + booster mass " +
        "rides the same joint; it must terminate in a reinforced member (anchorage law)",
      kind: "anchorage",
      shape: { kind: "box", size: [mountPad, mountPad, mountPad], offset: [0, 0, 0] },
      massBearing: true,
    }),
  ];

  const dims: BrakesDims = {
    discDiameter,
    discThickness,
    caliperClearance: clearance,
    minWheelRimDiameter,
    boosterDiameter,
    boosterMcLength,
    discMassEach,
    mass,
  };

  return {
    id: alloc.next("part"),
    label: `brakes disc${discDiameter.value} ${driverSide}-pedalbox`,
    ports,
    demands,
    mass,
    envelope,
    dims,
  };
}
