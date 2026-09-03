/**
 * MX-5 (NA) — front-mid inline-four, rear drive, two-seat roadster.
 *
 * The second car authored in the instrument, and it exists to answer one
 * question: is the sandbox general, or was it fitted to the P1?
 *
 * Chosen because it disagrees with the P1 on almost everything that matters
 * to a surfacer. It is 430 mm shorter, 265 mm narrower and 35 mm lower on a
 * wheelbase 275 mm shorter; its overhangs are nearly equal where the P1's are
 * lopsided; its sections are round where the P1's are creased; and its
 * greenhouse is a soft top pulled down over a low beltline rather than a
 * fastback. If the surfacing machinery only worked on the shape it was built
 * against, this is where that shows.
 *
 * Published dimensions are the 1989 car's, cited as such. Everything else is
 * an authored choice recorded as ASSUMED with the reason, which is what a
 * free authored choice means here.
 */

import type { CarConfig } from "@car/types";
import { assumed } from "@car/demand";

const CHOICE = "MX-5 authored placement";
const PROPORTION = "MX-5 proportion — published 1989 dimensions";

/** Overall diameter of a sidewall spec, mm: rim x 25.4 + 2 x width x aspect/100. */
const tireDiameter = (widthMm: number, aspectPct: number, rimIn: number): number =>
  rimIn * 25.4 + 2 * widthMm * (aspectPct / 100);

const TIRE = { width: 185, aspect: 60, rim: 14, load: 82 };

export const MX5_TIRE_WIDTH = TIRE.width;
export const MX5_DIAMETER = tireDiameter(TIRE.width, TIRE.aspect, TIRE.rim);

export const MX5_WHEELBASE = 2265;
export const MX5_FRONT_OVERHANG = 790;
export const MX5_REAR_OVERHANG = 915;
export const MX5_FRONT_TRACK = 1405;
export const MX5_REAR_TRACK = 1425;
export const MX5_RAIL_HEIGHT = 290;
export const MX5_LENGTH = MX5_FRONT_OVERHANG + MX5_WHEELBASE + MX5_REAR_OVERHANG;
export const MX5_WIDTH = 1675;
export const MX5_HEIGHT = 1235;

export const miataConfig: CarConfig = {
  name: "MX-5 NA",
  substrate: {
    style: "body-on-frame",
    wheelbase: assumed(MX5_WHEELBASE, "mm", `${PROPORTION} — 2265 mm between axles`),
    frontOverhang: assumed(MX5_FRONT_OVERHANG, "mm", `${PROPORTION} — short nose`),
    rearOverhang: assumed(MX5_REAR_OVERHANG, "mm", `${PROPORTION} — short tail, near-equal overhangs`),
    railSpacing: assumed(700, "mm", `${CHOICE} — narrow car, rails inboard of the seats`),
    crossmemberCount: assumed(4, "count", `${CHOICE} — front, dash, seat, rear`),
    railSectionHeight: assumed(110, "mm", `${CHOICE} — shallow rail; the PPF carries the driveline`),
    railSectionWidth: assumed(65, "mm", CHOICE),
    tunnelWidth: assumed(240, "mm", `${CHOICE} — propshaft, PPF and exhaust`),
    tunnelHeight: assumed(175, "mm", CHOICE),
    rockerHeight: assumed(140, "mm", `${CHOICE} — a roadster has no roof to stiffen it, so the sill is deep`),
    rockerWidth: assumed(85, "mm", CHOICE),
  },
  engine: {
    layout: "I",
    cylinders: assumed(4, "count", "MX-5 powertrain — B6ZE inline four"),
    displacement: assumed(1.6, "L", "MX-5 powertrain — 1.6 L"),
    boreStrokeRatio: assumed(1.0, "ratio", "MX-5 powertrain — 78 x 83.6 mm, near square"),
    orientation: "longitudinal",
    sumpDepth: assumed(105, "mm", `${CHOICE} — shallow sump, engine sits low and far back`),
    turbo: false,
  },
  transmission: {
    type: "manual",
    gearCount: assumed(5, "count", "MX-5 powertrain — five-speed manual"),
  },
  driveline: {
    torque: assumed(136, "Nm", "MX-5 powertrain — peak crank torque"),
    layout: "longitudinal",
    shaftLength: assumed(980, "mm", `${CHOICE} — short car, short shaft`),
    halfshaftLength: assumed(520, "mm", `${CHOICE} — diff flange to rear hub`),
  },
  frontSuspension: {
    architecture: "double-wishbone",
    axle: "front",
    jounceTravel: assumed(80, "mm", "MX-5 chassis — road car travel"),
    reboundTravel: assumed(85, "mm", "MX-5 chassis — road car travel"),
    trackWidth: assumed(MX5_FRONT_TRACK, "mm", PROPORTION),
    tireOverallDiameter: assumed(MX5_DIAMETER, "mm", "MX-5 chassis — 185/60R14"),
    tireSectionWidth: assumed(TIRE.width, "mm", "MX-5 chassis — 185/60R14"),
  },
  rearSuspension: {
    architecture: "multilink",
    axle: "rear",
    jounceTravel: assumed(85, "mm", "MX-5 chassis — road car travel"),
    reboundTravel: assumed(90, "mm", "MX-5 chassis — road car travel"),
    trackWidth: assumed(MX5_REAR_TRACK, "mm", `${PROPORTION} — rear track 20 mm wider`),
    tireOverallDiameter: assumed(MX5_DIAMETER, "mm", "MX-5 chassis — 185/60R14"),
    tireSectionWidth: assumed(TIRE.width, "mm", "MX-5 chassis — 185/60R14"),
  },
  steering: {
    rackPosition: "fore",
    ratio: assumed(15, "ratio", "MX-5 chassis — unassisted rack on the early car"),
    trackWidth: assumed(MX5_FRONT_TRACK, "mm", PROPORTION),
  },
  brakes: {
    discDiameter: assumed(235, "mm", "MX-5 chassis — front disc; it sets the wheel-diameter floor"),
    wheelRimDiameter: assumed(TIRE.rim * 25.4, "mm", "MX-5 chassis — 14 in rim"),
    driverSide: "left",
  },
  cooling: {
    powertrain: "ice",
    power: assumed(85, "kW", "MX-5 powertrain — 116 hp"),
  },
  fuelTank: {
    kind: "fuel-tank",
    range: assumed(500, "km", "MX-5 brief — 45 L tank at the consumption below"),
    consumption: assumed(9.0, "L/100km", "MX-5 brief — ASSUMED until mass and drag exist"),
  },
  occupants: {
    rows: [{
      heel: [0, 0, 0],
      H30: assumed(215, "mm", "MX-5 package — hip 215 mm above the heel: you sit ON the floor"),
      occupants: assumed(2, "count", "MX-5 brief — two seats, two doors"),
      label: "front row",
    }],
  },
  frontTire: {
    sectionWidth: assumed(TIRE.width, "mm", "MX-5 chassis — 185/60R14"),
    aspectPercent: assumed(TIRE.aspect, "ratio", "MX-5 chassis — 185/60R14"),
    rimDiameterIn: assumed(TIRE.rim, "count", "MX-5 chassis — 185/60R14"),
    loadIndex: assumed(TIRE.load, "count", "MX-5 chassis — load index 82"),
  },
  rearTire: {
    sectionWidth: assumed(TIRE.width, "mm", "MX-5 chassis — 185/60R14"),
    aspectPercent: assumed(TIRE.aspect, "ratio", "MX-5 chassis — 185/60R14"),
    rimDiameterIn: assumed(TIRE.rim, "count", "MX-5 chassis — 185/60R14"),
    loadIndex: assumed(TIRE.load, "count", "MX-5 chassis — load index 82"),
  },
  brief: {
    cargoVolumeL: assumed(130, "L", "MX-5 brief — a boot behind the fuel tank, and not much of one"),
    cargoAperture: {
      w: assumed(760, "mm", "MX-5 brief — boot aperture"),
      h: assumed(340, "mm", "MX-5 brief — boot aperture"),
    },
    rangeKm: assumed(500, "km", "MX-5 brief"),
    groundClearanceMm: assumed(130, "mm", "MX-5 brief — a road car, not a track car"),
    approachDeg: assumed(17, "deg", "MX-5 brief — short nose, decent approach"),
    departureDeg: assumed(19, "deg", "MX-5 brief"),
    massTargetKg: assumed(955, "kg", "MX-5 brief — the whole point of the car"),
    seatCount: assumed(2, "count", "MX-5 brief — two seats"),
  },
  placement: {
    railHeight: assumed(MX5_RAIL_HEIGHT, "mm", `${CHOICE} — rail centerline above the ground`),
    engineSetback: assumed(300, "mm", `${CHOICE} — block center aft of the front axle. The whole engine sits behind the axle line on this car and that is the reason it turns`),
    engineHeight: assumed(60, "mm", `${CHOICE} — crank barely above the rails`),
    radiatorAhead: assumed(150, "mm", `${CHOICE} — core ahead of the axle, laid back under the short nose`),
    radiatorHeight: assumed(80, "mm", CHOICE),
    tankAheadOfRearAxle: assumed(180, "mm", `${CHOICE} — tank between the seat backs and the rear axle`),
    tankHeight: assumed(150, "mm", CHOICE),
    heelStation: assumed(1090, "mm", `${CHOICE} — driver heel aft of the front axle`),
    heelHeight: assumed(245, "mm", `${CHOICE} — heel above the ground`),
    pedalBoxStation: assumed(900, "mm", `${CHOICE} — pedal box at the firewall`),
    pedalBoxHeight: assumed(135, "mm", CHOICE),
    rackStation: assumed(-85, "mm", `${CHOICE} — rack ahead of the axle line`),
    rackHeight: assumed(-25, "mm", `${CHOICE} — rack just below the rail centerline`),
  },
};
