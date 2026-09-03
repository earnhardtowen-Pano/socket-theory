/**
 * Brief demand set — the owner as principal (charge §7).
 *
 * ASSUMED-class, owner-set, ledgered as his: cargo volume and loading
 * aperture; range; ground clearance with approach and departure angles; mass
 * target; seat count. Every quantity the owner hands in MUST already carry an
 * ASSUMED license — the brief is assumption by statute ("mass target ASSUMED
 * first, iterate", charge §8) — and makeBrief refuses anything else: to brief
 * a sourced or derived number is to override it, and overriding flips a value
 * to ASSUMED, the owner's (charge §2, amendment A9). The caller performs that
 * flip explicitly with assumed()/override(); this file never launders it.
 *
 * Shapes and semantics:
 *   - ground clearance is a band [ground datum Z=0 .. clearance]: a keep-out
 *     slab of air under the whole sprung body — nothing of the body may reach
 *     below zMax. The zMin is the ground-plane DATUM (derived, chain stated),
 *     the single non-ASSUMED quantity in the set.
 *   - the cargo aperture is an aperture demand: the tail must admit a
 *     w × h test box (nominal ASSUMED sweep depth, note stated).
 *   - cargo volume, range, mass target and seat count are ledger demands:
 *     magnitude-only envelopes with no shape — the type factories and the
 *     mass ledger consume the numbers (tank volume = range ÷ consumption,
 *     occupant array × seat count, target vs summed mass), the packaging
 *     solver has nothing geometric to hold yet.
 *   - approach and departure are clearance demands carrying the owner's
 *     target angles; the derived checks over overhang/wheelbase geometry live
 *     in approachAngleDeg / departureAngleDeg / breakoverAngleDeg below, each
 *     with its derivation chain shown, so the check re-runs as packaging
 *     moves the wheels.
 *
 * These records are world demands; no massBearing, no ports, no mass.
 */

import type { BandShape, BoxShape, DemandRecord, IdAllocator, Quantity } from "@car/schema";
import { assumed, demand, derived, qDiv } from "@car/demand";
import { DEG, natan2, nround } from "@car/num";

// ---------------------------------------------------------------------------
// Parameters
// ---------------------------------------------------------------------------

export interface CargoAperture {
  /** Clear width of the loading opening, across the car (Y), mm. */
  readonly w: Quantity<"mm">;
  /** Clear height of the loading opening (Z), mm. */
  readonly h: Quantity<"mm">;
}

export interface BriefParams {
  /** Cargo hold volume the car must swallow, litres. */
  readonly cargoVolumeL: Quantity<"L">;
  /** Loading aperture the cargo must pass through, mm × mm. */
  readonly cargoAperture: CargoAperture;
  /** Range on one fill/charge, km — feeds tank/pack sizing. */
  readonly rangeKm: Quantity<"km">;
  /** Air under the whole body, mm. */
  readonly groundClearanceMm: Quantity<"mm">;
  /** Approach angle target at the nose, degrees. */
  readonly approachDeg: Quantity<"deg">;
  /** Departure angle target at the tail, degrees. */
  readonly departureDeg: Quantity<"deg">;
  /** Whole-car mass target, kg — the ledger shows the gap. */
  readonly massTargetKg: Quantity<"kg">;
  /** Seats, integer count — feeds the occupant array. */
  readonly seatCount: Quantity<"count">;
}

// ---------------------------------------------------------------------------
// Owner-license enforcement
// ---------------------------------------------------------------------------

function mustBeOwners(q: Quantity, name: string): void {
  if (q.license.tag !== "ASSUMED") {
    throw new Error(
      `makeBrief: ${name} carries ${q.license.tag} — the brief is the owner's; pass assumed() ` +
        "(or override()) quantities: ASSUMED-class, owner-set, ledgered as his (charge §7)",
    );
  }
}

const RIGHT_ANGLE = derived(
  90,
  "deg",
  "quarter turn: approach/departure targets live strictly inside (0°, 90°) — a 90° ramp is a wall",
);

// ---------------------------------------------------------------------------
// The brief as demands
// ---------------------------------------------------------------------------

export function makeBrief(params: BriefParams, alloc: IdAllocator): DemandRecord[] {
  const {
    cargoVolumeL,
    cargoAperture,
    rangeKm,
    groundClearanceMm,
    approachDeg,
    departureDeg,
    massTargetKg,
    seatCount,
  } = params;

  // -- every briefed number is the owner's: ASSUMED or refused ---------------
  mustBeOwners(cargoVolumeL, "cargoVolumeL");
  mustBeOwners(cargoAperture.w, "cargoAperture.w");
  mustBeOwners(cargoAperture.h, "cargoAperture.h");
  mustBeOwners(rangeKm, "rangeKm");
  mustBeOwners(groundClearanceMm, "groundClearanceMm");
  mustBeOwners(approachDeg, "approachDeg");
  mustBeOwners(departureDeg, "departureDeg");
  mustBeOwners(massTargetKg, "massTargetKg");
  mustBeOwners(seatCount, "seatCount");

  // -- sanity ----------------------------------------------------------------
  if (cargoVolumeL.value <= 0) throw new Error("makeBrief: cargo volume must be positive");
  if (cargoAperture.w.value <= 0 || cargoAperture.h.value <= 0) {
    throw new Error("makeBrief: cargo aperture width and height must be positive");
  }
  if (rangeKm.value <= 0) throw new Error("makeBrief: range must be positive");
  if (groundClearanceMm.value <= 0) throw new Error("makeBrief: ground clearance must be positive");
  for (const [angle, name] of [
    [approachDeg, "approach"],
    [departureDeg, "departure"],
  ] as const) {
    if (angle.value <= 0 || angle.value >= RIGHT_ANGLE.value) {
      throw new Error(`makeBrief: ${name} angle must lie strictly inside (0°, ${RIGHT_ANGLE.value}°)`);
    }
  }
  if (massTargetKg.value <= 0) throw new Error("makeBrief: mass target must be positive");
  if (seatCount.value < 1 || nround(seatCount.value) !== seatCount.value) {
    throw new Error("makeBrief: seat count must be a positive integer");
  }

  // -- cargo volume: ledger demand, proportions stay the designer's ----------
  const cargoVolume = demand({
    id: alloc.next("demand"),
    principal: "brief",
    reason:
      "owner's brief: the cargo hold must swallow the stated litres — the number binds, the box " +
      "proportions stay free; the ledger and the cargo bay entry consume the magnitude",
    kind: "envelope",
    magnitude: cargoVolumeL,
  });

  // -- cargo aperture: the tail must admit the owner's test box --------------
  const apertureSweep = assumed(
    150,
    "mm",
    "ASSUMED: nominal sweep depth of the aperture test box through the tail opening — modeling " +
      "choice matching the occupant-entry aperture convention, not an owner number",
  );
  const apertureShape: BoxShape = {
    kind: "box",
    size: [apertureSweep, cargoAperture.w, cargoAperture.h],
  };
  const cargoApertureDemand = demand({
    id: alloc.next("demand"),
    principal: "brief",
    reason:
      "owner's brief: the loading aperture must admit a box of the stated width and height straight " +
      "through the tail opening — what he owns must fit through the door, whatever the styling does",
    kind: "aperture",
    shape: apertureShape,
  });

  // -- range: ledger demand feeding the energy store -------------------------
  const range = demand({
    id: alloc.next("demand"),
    principal: "brief",
    reason:
      "owner's brief: range on one fill or charge — the energy-store entry sizes tank volume or pack " +
      "kWh from this magnitude over consumption (itself ASSUMED until mass and drag exist; iterates)",
    kind: "envelope",
    magnitude: rangeKm,
  });

  // -- ground clearance: keep-out band from the ground datum -----------------
  const groundDatum = derived(
    0,
    "mm",
    "ground plane datum: Z = 0 at the tire contact line by the fixed car-axes convention (Z up) — " +
      "a datum of the frame, not an assumption",
  );
  // The slab is a KEEP-OUT, not a keep-in: a "band" demand clamps a part INTO
  // its range, which would drag the whole car down to the clearance line. The
  // requirement is that nothing reaches DOWN into the slab, which is exactly
  // what a protected zone means to the solver. (Found at the P1's first solve:
  // the shape and the reason disagreed; the reason was right.)
  const slabLength = assumed(
    6000, "mm",
    "planning extent of the ground-clearance slab along the car — long enough to " +
      "swallow any v1 body; the brief carries no footprint of its own",
  );
  const slabWidth = assumed(
    2600, "mm",
    "planning extent of the ground-clearance slab across the car — wide enough to " +
      "swallow any v1 body; the brief carries no footprint of its own",
  );
  const slabCenterZ = qDiv(groundClearanceMm, derived(2, "ratio", "slab center is half its height"), "mm");
  const clearanceShape: BoxShape = {
    kind: "box",
    size: [slabLength, slabWidth, groundClearanceMm],
    offset: [0, 0, slabCenterZ.value],
  };
  const groundClearance = demand({
    id: alloc.next("demand"),
    principal: "brief",
    reason:
      "owner's brief: air under the whole body — the protected slab runs from the ground datum " +
      "up to the clearance line; no sprung part (exhaust, pack, sills) may reach into it",
    kind: "protected-zone",
    shape: clearanceShape,
    magnitude: groundClearanceMm,
  });
  void groundDatum;

  // -- approach / departure: target angles; derived checks live below --------
  const approach = demand({
    id: alloc.next("demand"),
    principal: "brief",
    reason:
      "owner's brief: approach angle at the nose — the ramp plane from the front tire contact patch " +
      "at the target angle must clear all front bodywork; check against geometry with " +
      "approachAngleDeg(clearance, front overhang)",
    kind: "clearance",
    magnitude: approachDeg,
  });
  const departure = demand({
    id: alloc.next("demand"),
    principal: "brief",
    reason:
      "owner's brief: departure angle at the tail — the ramp plane from the rear tire contact patch " +
      "at the target angle must clear all rear bodywork; check against geometry with " +
      "departureAngleDeg(clearance, rear overhang)",
    kind: "clearance",
    magnitude: departureDeg,
  });

  // -- mass target: the ledger's closing number ------------------------------
  const massTarget = demand({
    id: alloc.next("demand"),
    principal: "brief",
    reason:
      "owner's brief: whole-car mass target — ASSUMED first, iterate; the mass ledger sums every " +
      "part's mass at its position and shows the gap against this magnitude (charge §8)",
    kind: "envelope",
    magnitude: massTargetKg,
  });

  // -- seat count: feeds the occupant array ----------------------------------
  const seats = demand({
    id: alloc.next("demand"),
    principal: "brief",
    reason:
      "owner's brief: seat count — the occupant array instantiates this many stations with their " +
      "anthropometric points, apertures and belt anchorages",
    kind: "envelope",
    magnitude: seatCount,
  });

  return [
    cargoVolume,
    cargoApertureDemand,
    range,
    groundClearance,
    approach,
    departure,
    massTarget,
    seats,
  ];
}

// ---------------------------------------------------------------------------
// Approach / departure / breakover — derived angle checks, chains shown.
// Feed them the briefed clearance and the current overhang/wheelbase numbers
// (assumed at first, solved later); the chain records both licenses so the
// ledger sees exactly what the check stood on.
// ---------------------------------------------------------------------------

function anglePreconditions(clearance: Quantity<"mm">, run: Quantity<"mm">, what: string): void {
  if (run.value <= 0) throw new Error(`${what}: the horizontal run must be positive`);
  if (clearance.value < 0) throw new Error(`${what}: clearance cannot be negative`);
}

/**
 * Approach angle from geometry: atan2(ground clearance, front overhang), in
 * degrees. Uses the flat-ramp model — the lowest front bodywork point sits at
 * clearance height directly above the front bumper's leading edge, one
 * overhang ahead of the front contact patch.
 */
export function approachAngleDeg(
  groundClearance: Quantity<"mm">,
  frontOverhang: Quantity<"mm">,
): Quantity<"deg"> {
  anglePreconditions(groundClearance, frontOverhang, "approachAngleDeg");
  const rad = natan2(groundClearance.value, frontOverhang.value);
  return derived(
    rad / DEG,
    "deg",
    `approach angle = atan2(clearance, front overhang) = atan2(${groundClearance.value}mm` +
      `[${groundClearance.license.tag}], ${frontOverhang.value}mm[${frontOverhang.license.tag}]) → deg`,
  );
}

/** Departure angle from geometry: atan2(ground clearance, rear overhang), degrees. */
export function departureAngleDeg(
  groundClearance: Quantity<"mm">,
  rearOverhang: Quantity<"mm">,
): Quantity<"deg"> {
  anglePreconditions(groundClearance, rearOverhang, "departureAngleDeg");
  const rad = natan2(groundClearance.value, rearOverhang.value);
  return derived(
    rad / DEG,
    "deg",
    `departure angle = atan2(clearance, rear overhang) = atan2(${groundClearance.value}mm` +
      `[${groundClearance.license.tag}], ${rearOverhang.value}mm[${rearOverhang.license.tag}]) → deg`,
  );
}

/**
 * Ramp breakover angle from geometry: 2 × atan2(2 × clearance, wheelbase),
 * degrees — the tent angle under the belly with its apex at mid-wheelbase.
 */
export function breakoverAngleDeg(
  groundClearance: Quantity<"mm">,
  wheelbase: Quantity<"mm">,
): Quantity<"deg"> {
  anglePreconditions(groundClearance, wheelbase, "breakoverAngleDeg");
  const rad = 2 * natan2(2 * groundClearance.value, wheelbase.value);
  return derived(
    rad / DEG,
    "deg",
    `breakover angle = 2 × atan2(2 × clearance, wheelbase) = 2 × atan2(2 × ${groundClearance.value}mm` +
      `[${groundClearance.license.tag}], ${wheelbase.value}mm[${wheelbase.license.tag}]) → deg`,
  );
}

/** One angle check: does the geometry meet the owner's target? */
export interface AngleCheck {
  readonly required: Quantity<"deg">;
  readonly achieved: Quantity<"deg">;
  readonly ok: boolean;
}

/** Compare an achieved (derived) angle against the briefed target. */
export function angleCheck(required: Quantity<"deg">, achieved: Quantity<"deg">): AngleCheck {
  return { required, achieved, ok: achieved.value >= required.value };
}
