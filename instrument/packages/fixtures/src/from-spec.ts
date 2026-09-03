/**
 * One builder, six cars, and the shoebox.
 *
 * charge §12 says the shoebox V16 must package "with no special-casing
 * anywhere". The only way to mean that is to have exactly one path from public
 * numbers to a CarConfig and send everything down it — an MX-5, an F-150 and
 * an invented V16 with a wheelbase shorter than its engine. Every rule below
 * is arithmetic on the spec. There is not one branch on which car this is, and
 * the two branches that do exist (engine orientation, drive layout) read a
 * field the AUTHOR entered about the car's architecture, not a name.
 *
 * Everything the builder invents is ASSUMED and carries the rule that produced
 * it in its reason string, so a reader can see both the number and why it is
 * that number. The measured inputs stay exactly as licensed in battery.ts:
 * the builder never re-licenses a sourced value as its own.
 */

import { makeAllocator, type Pt3, type Quantity } from "@car/schema";
import { assumed, override } from "@car/demand";
import { assembleCar, type CarConfig } from "@car/types";
import { anchorPointOf, solve } from "@car/pack";
import type { BatteryEntry, PublicSpec, TireSpec } from "./battery.js";

const RULE = "battery builder";
const clamp = (x: number, lo: number, hi: number): number => Math.min(Math.max(x, lo), hi);
const round = (x: number): number => Math.round(x);

/** Overall tire diameter from the sidewall math — exact, not a rule. */
export const tireDiameterOf = (t: TireSpec): number =>
  t.rimIn.value * 25.4 + 2 * (t.widthMm.value * t.aspectPct.value) / 100;

/**
 * A CarConfig from a public spec plus the entered layout. Read the reasons:
 * every ASSUMED here names the ratio it came from, so the whole package is
 * one page of arithmetic rather than a page of taste.
 */
export function configFromSpec(entry: BatteryEntry): CarConfig {
  const { spec, layout } = entry;
  const wb = spec.wheelbase.value;
  const len = spec.overallLength.value;
  const wid = spec.overallWidth.value;
  const hgt = spec.overallHeight.value;
  const gc = spec.groundClearance.value;
  const ft = spec.frontTrack.value;
  const rt = spec.rearTrack.value;
  const kW = spec.power.value;
  const litres = spec.displacementL.value;
  const seats = layout.seats.value;
  const frontDia = tireDiameterOf(spec.frontTire);
  const rearDia = tireDiameterOf(spec.rearTire);

  // Overhangs split what the wheelbase does not use. 45/55 front/rear is the
  // one proportion rule in the builder; a car with a longer front overhang
  // than that is telling you something the spec sheet did not.
  const overhang = Math.max(len - wb, 0);
  const frontOverhang = round(overhang * 0.45);
  const rearOverhang = round(overhang - frontOverhang);

  // Structure scales off track and clearance, never off a car's name.
  const railSectionHeight = round(clamp(gc * 0.75, 90, 200));
  const railSpacing = round(clamp(ft * 0.46, 500, 1100));
  const rockerHeight = round(clamp(gc * 0.95, 100, 260));

  const transverse = layout.engineOrientation === "transverse";
  // Transverse engines sit ACROSS the front axle, so the setback runs
  // negative; a longitudinal engine sits behind it. Same expression, sign
  // from the entered architecture. Mid-engine cars are longitudinal with the
  // block behind the cabin, which the ratio handles by being large.
  const midEngine = !transverse && seats <= 2 && litres >= 4.5;
  const setback = transverse ? -round(wb * 0.06)
    : midEngine ? round(wb * 0.62)
    : round(wb * 0.17);

  const heelStation = round(wb * (transverse ? 0.30 : 0.46));
  const heelHeight = round(gc + clamp(hgt * 0.10, 90, 260));
  const rows = seats <= 2
    ? [{ heel: [0, 0, 0] as Pt3, H30: assumed(round(clamp(hgt * 0.20, 200, 420)), "mm", `${RULE} — hip above heel at 20% of overall height`), occupants: assumed(seats, "count", `${RULE} — one row`), label: "front row" }]
    : [
      { heel: [0, 0, 0] as Pt3, H30: assumed(round(clamp(hgt * 0.20, 200, 420)), "mm", `${RULE} — hip above heel at 20% of overall height`), occupants: assumed(2, "count", `${RULE} — two in front`), label: "front row" },
      { heel: [round(wb * 0.33), 0, 0] as Pt3, H30: assumed(round(clamp(hgt * 0.21, 200, 440)), "mm", `${RULE} — rear hip 1 point higher, stadium seating`), occupants: assumed(seats - 2, "count", `${RULE} — the rest behind`), label: "rear row" },
    ];

  // Consumption from mass, range from the tank the car actually carries.
  const consumption = clamp(spec.curbMass.value / 165, 4.5, 20);
  const rangeKm = round((spec.fuelTank.value / consumption) * 100);

  return {
    name: spec.name,
    substrate: {
      style: "body-on-frame",
      wheelbase: spec.wheelbase,
      frontOverhang: assumed(frontOverhang, "mm", `${RULE} — 45% of (length − wheelbase)`),
      rearOverhang: assumed(rearOverhang, "mm", `${RULE} — the remainder of (length − wheelbase)`),
      railSpacing: assumed(railSpacing, "mm", `${RULE} — 46% of front track, clamped 500–1100`),
      crossmemberCount: assumed(round(clamp(wb / 650, 3, 6)), "count", `${RULE} — one per 650 mm of wheelbase, 3 to 6`),
      railSectionHeight: assumed(railSectionHeight, "mm", `${RULE} — 75% of ground clearance, clamped 90–200`),
      railSectionWidth: assumed(round(railSectionHeight * 0.6), "mm", `${RULE} — 60% of rail height`),
      tunnelWidth: assumed(round(railSpacing * 0.38), "mm", `${RULE} — 38% of rail spacing`),
      tunnelHeight: assumed(round(railSectionHeight * 1.5), "mm", `${RULE} — 1.5× rail height`),
      rockerHeight: assumed(rockerHeight, "mm", `${RULE} — 95% of ground clearance, clamped 100–260`),
      rockerWidth: assumed(round(rockerHeight * 0.6), "mm", `${RULE} — 60% of rocker height`),
    },
    engine: {
      layout: layout.engineLayout,
      cylinders: spec.cylinders,
      displacement: spec.displacementL,
      // A V engine has to state its bank angle, and the type refuses to guess
      // — found by the battery, which threw on three cars at once. The angle
      // is the one that balances: 720°/cylinders, rounded to the nearest 15,
      // which lands 60 for a V6 or V12, 90 for a V8, 72 for a V10 (rounded to
      // 75 here) and 45 for a V16. Stated as a rule, applied to all of them.
      ...(layout.engineLayout === "V"
        ? { vAngleDeg: assumed(round(clamp(720 / spec.cylinders.value, 45, 90) / 15) * 15, "deg",
            `${RULE} — 720°/cylinders rounded to the nearest 15°, clamped 45–90`) }
        : {}),
      boreStrokeRatio: assumed(0.95, "ratio", `${RULE} — slightly undersquare; the spec sheets do not carry bore and stroke`),
      orientation: layout.engineOrientation,
      sumpDepth: assumed(round(clamp(gc * 0.85, 80, 220)), "mm", `${RULE} — 85% of ground clearance, clamped 80–220`),
      // Specific output over 65 kW/L is forced induction on any engine built
      // in the last thirty years. A rule, applied to all six the same way.
      turbo: kW / litres > 65,
    },
    transmission: {
      type: layout.transmissionType,
      gearCount: assumed(layout.transmissionType === "manual" ? 6 : 8, "count", `${RULE} — 6 for a manual, 8 otherwise`),
    },
    driveline: {
      // Crank torque from power at an ASSUMED peak-torque speed: T = 9549·P/n.
      torque: assumed(round((kW * 9549) / 4500), "Nm", `${RULE} — 9549·kW/rpm at an assumed 4500 rpm peak-torque speed`),
      layout: transverse ? "transverse" : "longitudinal",
      shaftLength: assumed(round(wb * 0.47), "mm", `${RULE} — 47% of wheelbase; zero-length for a transaxle, which the type handles`),
      halfshaftLength: assumed(round(rt * 0.38), "mm", `${RULE} — 38% of rear track`),
    },
    frontSuspension: {
      architecture: layout.frontArchitecture,
      axle: "front",
      jounceTravel: assumed(round(clamp(gc * 0.55, 55, 150)), "mm", `${RULE} — 55% of ground clearance, clamped 55–150`),
      reboundTravel: assumed(round(clamp(gc * 0.60, 60, 160)), "mm", `${RULE} — 60% of ground clearance, clamped 60–160`),
      trackWidth: spec.frontTrack,
      tireOverallDiameter: assumed(frontDia, "mm", `${RULE} — sidewall math on the sourced front fitment`),
      tireSectionWidth: spec.frontTire.widthMm,
    },
    rearSuspension: {
      architecture: layout.rearArchitecture,
      axle: "rear",
      jounceTravel: assumed(round(clamp(gc * 0.58, 55, 155)), "mm", `${RULE} — 58% of ground clearance, clamped 55–155`),
      reboundTravel: assumed(round(clamp(gc * 0.63, 60, 165)), "mm", `${RULE} — 63% of ground clearance, clamped 60–165`),
      trackWidth: spec.rearTrack,
      tireOverallDiameter: assumed(rearDia, "mm", `${RULE} — sidewall math on the sourced rear fitment`),
      tireSectionWidth: spec.rearTire.widthMm,
    },
    steering: {
      rackPosition: "fore",
      ratio: assumed(15, "ratio", `${RULE} — the spec sheets do not carry rack ratio`),
      trackWidth: spec.frontTrack,
    },
    brakes: {
      discDiameter: assumed(round(spec.frontTire.rimIn.value * 25.4 * 0.72), "mm", `${RULE} — 72% of rim diameter, the usual ceiling for caliper clearance`),
      wheelRimDiameter: assumed(round(spec.frontTire.rimIn.value * 25.4), "mm", `${RULE} — rim inches to mm`),
      driverSide: "left",
    },
    cooling: { powertrain: "ice", power: spec.power },
    fuelTank: {
      kind: "fuel-tank",
      range: assumed(rangeKm, "km", `${RULE} — tank litres ÷ consumption × 100`),
      consumption: assumed(Math.round(consumption * 10) / 10, "L/100km", `${RULE} — curb mass ÷ 165, clamped 4.5–20; it iterates with the ledger`),
    },
    occupants: { rows },
    frontTire: {
      sectionWidth: spec.frontTire.widthMm,
      aspectPercent: spec.frontTire.aspectPct,
      rimDiameterIn: spec.frontTire.rimIn,
      loadIndex: spec.frontTire.loadIndex,
    },
    rearTire: {
      sectionWidth: spec.rearTire.widthMm,
      aspectPercent: spec.rearTire.aspectPct,
      rimDiameterIn: spec.rearTire.rimIn,
      loadIndex: spec.rearTire.loadIndex,
    },
    brief: {
      cargoVolumeL: assumed(round(clamp((len * wid * hgt) / 1e6 * 0.03, 100, 900)), "L", `${RULE} — 3% of the bounding box`),
      cargoAperture: {
        w: assumed(round(wid * 0.55), "mm", `${RULE} — 55% of overall width`),
        h: assumed(round(hgt * 0.32), "mm", `${RULE} — 32% of overall height`),
      },
      rangeKm: assumed(rangeKm, "km", `${RULE} — tank litres ÷ consumption × 100`),
      groundClearanceMm: override(spec.groundClearance, spec.groundClearance.value,
        "owner adopts the car's published static clearance as the brief target"),
      approachDeg: assumed(round(clamp(gc / 8, 10, 32)), "deg", `${RULE} — ground clearance ÷ 8, clamped 10–32`),
      departureDeg: assumed(round(clamp(gc / 7, 12, 34)), "deg", `${RULE} — ground clearance ÷ 7, clamped 12–34`),
      // The brief is the OWNER's principal (charge §7), and the type enforces
      // it: a brief value may not arrive carrying SOURCED, because then the
      // spec sheet would be setting the target instead of the person. Re-
      // entering a real car means the owner adopts the measured figure as his
      // target, which is exactly what override() is for — it keeps the chain
      // back to the sourced number and re-licenses the decision as his.
      massTargetKg: override(spec.curbMass, spec.curbMass.value,
        "owner adopts the car's published curb mass as the target for the re-entry"),
      seatCount: layout.seats,
    },
    placement: {
      railHeight: assumed(round(gc + railSectionHeight / 2), "mm", `${RULE} — rail centreline half a section above the clearance line`),
      engineSetback: assumed(setback, "mm", `${RULE} — ${transverse ? "−6% of wheelbase: transverse, across the axle" : midEngine ? "62% of wheelbase: the block sits behind the cabin" : "17% of wheelbase: behind the front axle"}`),
      engineHeight: assumed(round(clamp(gc * 0.55, 50, 200)), "mm", `${RULE} — 55% of ground clearance above the rail line`),
      radiatorAhead: assumed(round(clamp(frontOverhang * 0.45, 60, 600)), "mm", `${RULE} — 45% of the front overhang`),
      radiatorHeight: assumed(round(clamp(gc * 0.7, 60, 260)), "mm", `${RULE} — 70% of ground clearance`),
      tankAheadOfRearAxle: assumed(round(wb * 0.13), "mm", `${RULE} — 13% of wheelbase, clear of the axle hardware`),
      tankHeight: assumed(round(clamp(gc * 1.2, 110, 340)), "mm", `${RULE} — 1.2× ground clearance, above the driveline`),
      heelStation: assumed(heelStation, "mm", `${RULE} — ${transverse ? "30" : "46"}% of wheelbase`),
      heelHeight: assumed(heelHeight, "mm", `${RULE} — clearance plus 10% of overall height`),
      pedalBoxStation: assumed(round(heelStation - clamp(wb * 0.08, 120, 320)), "mm", `${RULE} — 8% of wheelbase ahead of the heel`),
      pedalBoxHeight: assumed(round(heelHeight - clamp(hgt * 0.09, 80, 220)), "mm", `${RULE} — 9% of overall height below the heel`),
      rackStation: assumed(-round(clamp(wb * 0.035, 40, 160)), "mm", `${RULE} — 3.5% of wheelbase ahead of the axle line`),
      rackHeight: assumed(-round(clamp(railSectionHeight * 0.25, 15, 60)), "mm", `${RULE} — a quarter-section below the rail centreline`),
    },
  };
}

// ---------------------------------------------------------------------------
// Expected hard points — the acceptance target (charge §12)
// ---------------------------------------------------------------------------

export interface ExpectedPoint {
  readonly label: string;
  readonly at: Pt3;
}

/**
 * Where the wheels have to end up, derived from the sourced inputs alone.
 * Station origin is the FRONT AXLE centre, X aft, Y across, Z up from the
 * road. Nothing here consults the solve — that is the whole point.
 */
export function expectedWheelCentres(spec: PublicSpec): readonly ExpectedPoint[] {
  const fr = tireDiameterOf(spec.frontTire) / 2;
  const rr = tireDiameterOf(spec.rearTire) / 2;
  const hf = spec.frontTrack.value / 2;
  const hr = spec.rearTrack.value / 2;
  const wb = spec.wheelbase.value;
  return [
    { label: "wheel-centre-FL", at: [0, -hf, fr] },
    { label: "wheel-centre-FR", at: [0, hf, fr] },
    { label: "wheel-centre-RL", at: [wb, -hr, rr] },
    { label: "wheel-centre-RR", at: [wb, hr, rr] },
  ];
}

/** ±15 mm on derived hard points, exact on inputs (charge §12, owner-adjustable). */
export const BATTERY_TOLERANCE_MM: Quantity<"mm"> = assumed(
  15, "mm", "acceptance calibration per charge §12 — owner-adjustable",
);

// ---------------------------------------------------------------------------
// Fitting the substrate to its own law
// ---------------------------------------------------------------------------

/**
 * Put the members where the loads are.
 *
 * The anchorage law says every mass-bearing demand must terminate inside a
 * reinforced member. The substrate laid rails at a spacing derived from track
 * and crossmembers on an even grid; the type library published anchorages
 * wherever a part's mounts happened to fall; nothing reconciled the two. The
 * six-car battery reported thirty-five anchorage violations per car — on all
 * seven, identically — which is not seven cars failing but one missing step.
 *
 * A chassis is not laid out that way round. The rail runs under the engine
 * mounts and the crossmember goes where the load is. So: assemble once, ask
 * the solver's own anchorPointOf where every mass-bearing demand actually
 * lands, and re-emit the substrate with the rails under the off-centre
 * anchors and a crossmember at each inboard one. Same pattern as the P1
 * engine setback — the first solve is a measurement, and the second one is
 * the design.
 *
 * Deterministic: sorted inputs, median by index, no wall clock.
 */
export function fitSubstrate(entry: BatteryEntry): CarConfig {
  const first = configFromSpec(entry);
  const alloc = makeAllocator();
  const car = assembleCar(first, alloc);
  const packed = solve(car.input);

  const anchors: Pt3[] = [];
  for (const part of car.input.parts) {
    const origin = packed.placements.get(part.id)?.origin;
    if (!origin) continue;
    for (const d of part.demands) {
      if (d.massBearing !== true) continue;
      anchors.push(anchorPointOf(part, d, origin));
    }
  }
  if (anchors.length === 0) return first;

  const railW = first.substrate.railSectionWidth?.value ?? 70;
  // Rails go under the off-centre anchors: the median of their |y| is the
  // spacing that holds the most of them without chasing an outlier.
  const offCentre = anchors.map((a) => Math.abs(a[1])).filter((y) => y > railW).sort((a, b) => a - b);
  const median = offCentre.length > 0 ? offCentre[Math.floor(offCentre.length / 2)]! : 0;
  const railSpacing = median > 0
    ? clamp(round(median * 2), 420, spec_(entry).frontTrack.value - 260)
    : first.substrate.railSpacing.value;

  // A crossmember at every anchor the rails do not already hold. Sorted so
  // the substrate's own collapse rule sees them in order.
  const halfSpacing = railSpacing / 2;
  const heldByRail = (a: Pt3): boolean => Math.abs(Math.abs(a[1]) - halfSpacing) <= railW / 2;
  const stations = [...new Set(anchors.filter((a) => !heldByRail(a)).map((a) => round(a[0])))]
    .sort((a, b) => a - b)
    .map((x) => assumed(x, "mm", `${RULE} — crossmember under a mass-bearing anchor at X ${x} mm`));

  return {
    ...first,
    substrate: {
      ...first.substrate,
      railSpacing: assumed(railSpacing, "mm",
        `${RULE} — rails under the mass-bearing anchors: median |Y| of ${offCentre.length} of them, doubled`),
      ...(stations.length > 0 ? { crossmemberStations: stations } : {}),
    },
  };
}

const spec_ = (e: BatteryEntry): PublicSpec => e.spec;
