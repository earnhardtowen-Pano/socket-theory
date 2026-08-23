/**
 * PANORAMIC P1 — front-mid inline-six, rear drive, two-door coupe.
 *
 * The first car authored in the instrument. Every value carries its license:
 * the brief's targets are the owner's (ASSUMED, his to move), the engineering
 * coefficients come from the type library's own SOURCED entries, and the
 * placement choices below are authored decisions — recorded as ASSUMED with
 * the reason stated, which is exactly what "a free authored choice" means.
 */

import type { CarConfig } from "@car/types";
import { assumed } from "@car/demand";

const CHOICE = "P1 authored placement";
const PROPORTION = "P1 proportion — owner's brief, cab-rearward sports coupe";

/** Overall diameter of a sidewall spec, mm: rim x 25.4 + 2 x width x aspect/100. */
const tireDiameter = (widthMm: number, aspectPct: number, rimIn: number): number =>
  rimIn * 25.4 + 2 * widthMm * (aspectPct / 100);

const FRONT_TIRE = { width: 245, aspect: 40, rim: 19, load: 98 };
const REAR_TIRE = { width: 275, aspect: 35, rim: 19, load: 100 };

export const P1_FRONT_TIRE_WIDTH = FRONT_TIRE.width;
export const P1_REAR_TIRE_WIDTH = REAR_TIRE.width;
export const P1_FRONT_DIAMETER = tireDiameter(FRONT_TIRE.width, FRONT_TIRE.aspect, FRONT_TIRE.rim);
export const P1_REAR_DIAMETER = tireDiameter(REAR_TIRE.width, REAR_TIRE.aspect, REAR_TIRE.rim);

export const P1_WHEELBASE = 2540;
export const P1_FRONT_OVERHANG = 900;
export const P1_REAR_OVERHANG = 960;
export const P1_FRONT_TRACK = 1620;
export const P1_REAR_TRACK = 1640;
export const P1_RAIL_HEIGHT = 330;
export const P1_LENGTH = P1_FRONT_OVERHANG + P1_WHEELBASE + P1_REAR_OVERHANG;

export const p1Config: CarConfig = {
  name: "Panoramic P1",
  substrate: {
    style: "body-on-frame",
    wheelbase: assumed(P1_WHEELBASE, "mm", `${PROPORTION} — 2540 mm between axles`),
    frontOverhang: assumed(P1_FRONT_OVERHANG, "mm", `${PROPORTION} — long hood, short front overhang`),
    rearOverhang: assumed(P1_REAR_OVERHANG, "mm", `${PROPORTION} — fastback tail`),
    railSpacing: assumed(760, "mm", `${CHOICE} — rails inboard of the seats, tunnel between`),
    crossmemberCount: assumed(4, "count", `${CHOICE} — front, dash, seat, rear`),
    railSectionHeight: assumed(120, "mm", `${CHOICE} — shallow rail for a low car`),
    railSectionWidth: assumed(70, "mm", CHOICE),
    tunnelWidth: assumed(280, "mm", `${CHOICE} — propshaft plus exhaust past the seats`),
    tunnelHeight: assumed(190, "mm", CHOICE),
    rockerHeight: assumed(150, "mm", `${CHOICE} — traded against the entry aperture, coupe`),
    rockerWidth: assumed(90, "mm", CHOICE),
  },
  engine: {
    layout: "I",
    cylinders: assumed(6, "count", "P1 powertrain — inline six, the shape a long hood wants"),
    displacement: assumed(3.0, "L", "P1 powertrain — 3.0 L"),
    boreStrokeRatio: assumed(0.92, "ratio", "P1 powertrain — slightly undersquare, torque-biased"),
    orientation: "longitudinal",
    sumpDepth: assumed(120, "mm", `${CHOICE} — shallow sump, engine sits low`),
    turbo: true,
  },
  transmission: {
    type: "manual",
    gearCount: assumed(6, "count", "P1 powertrain — six-speed manual, the shift linkage is a demand"),
  },
  driveline: {
    torque: assumed(500, "Nm", "P1 powertrain — peak crank torque the propshaft carries"),
    layout: "longitudinal",
    shaftLength: assumed(1200, "mm", `${CHOICE} — transmission tail to diff nose`),
    halfshaftLength: assumed(620, "mm", `${CHOICE} — diff flange to rear hub`),
  },
  frontSuspension: {
    architecture: "double-wishbone",
    axle: "front",
    jounceTravel: assumed(70, "mm", "P1 chassis — short travel, sports calibration"),
    reboundTravel: assumed(75, "mm", "P1 chassis — short travel, sports calibration"),
    trackWidth: assumed(P1_FRONT_TRACK, "mm", PROPORTION),
    tireOverallDiameter: assumed(P1_FRONT_DIAMETER, "mm", "P1 chassis — 245/40R19 front"),
    tireSectionWidth: assumed(FRONT_TIRE.width, "mm", "P1 chassis — 245/40R19 front"),
  },
  rearSuspension: {
    architecture: "multilink",
    axle: "rear",
    jounceTravel: assumed(75, "mm", "P1 chassis — short travel, sports calibration"),
    reboundTravel: assumed(80, "mm", "P1 chassis — short travel, sports calibration"),
    trackWidth: assumed(P1_REAR_TRACK, "mm", `${PROPORTION} — rear track wider, haunches follow`),
    tireOverallDiameter: assumed(P1_REAR_DIAMETER, "mm", "P1 chassis — 275/35R19 rear"),
    tireSectionWidth: assumed(REAR_TIRE.width, "mm", "P1 chassis — 275/35R19 rear"),
  },
  steering: {
    rackPosition: "fore",
    ratio: assumed(14, "ratio", "P1 chassis — quick rack, sports calibration"),
    trackWidth: assumed(P1_FRONT_TRACK, "mm", PROPORTION),
  },
  brakes: {
    discDiameter: assumed(355, "mm", "P1 chassis — front disc; it sets the wheel-diameter floor"),
    wheelRimDiameter: assumed(FRONT_TIRE.rim * 25.4, "mm", "P1 chassis — 19 in rim"),
    driverSide: "left",
  },
  cooling: {
    powertrain: "ice",
    power: assumed(285, "kW", "P1 powertrain — peak output the loop must survive"),
  },
  fuelTank: {
    kind: "fuel-tank",
    range: assumed(600, "km", "P1 brief — touring range between fills"),
    consumption: assumed(9.5, "L/100km", "P1 brief — ASSUMED until mass and drag exist; it iterates"),
  },
  occupants: {
    rows: [{
      heel: [0, 0, 0],
      H30: assumed(245, "mm", "P1 package — hip 245 mm above the heel: a low sports seat"),
      occupants: assumed(2, "count", "P1 brief — two seats, two doors"),
      label: "front row",
    }],
  },
  frontTire: {
    sectionWidth: assumed(FRONT_TIRE.width, "mm", "P1 chassis — 245/40R19"),
    aspectPercent: assumed(FRONT_TIRE.aspect, "ratio", "P1 chassis — 245/40R19"),
    rimDiameterIn: assumed(FRONT_TIRE.rim, "count", "P1 chassis — 245/40R19"),
    loadIndex: assumed(FRONT_TIRE.load, "count", "P1 chassis — load index 98"),
  },
  rearTire: {
    sectionWidth: assumed(REAR_TIRE.width, "mm", "P1 chassis — 275/35R19"),
    aspectPercent: assumed(REAR_TIRE.aspect, "ratio", "P1 chassis — 275/35R19"),
    rimDiameterIn: assumed(REAR_TIRE.rim, "count", "P1 chassis — 275/35R19"),
    loadIndex: assumed(REAR_TIRE.load, "count", "P1 chassis — load index 100"),
  },
  brief: {
    cargoVolumeL: assumed(230, "L", "P1 brief — a weekend for two behind the seats"),
    cargoAperture: {
      w: assumed(900, "mm", "P1 brief — hatch aperture"),
      h: assumed(420, "mm", "P1 brief — hatch aperture"),
    },
    rangeKm: assumed(600, "km", "P1 brief"),
    groundClearanceMm: assumed(110, "mm", "P1 brief — low, and it says so"),
    approachDeg: assumed(12, "deg", "P1 brief — consequence of the splitter"),
    departureDeg: assumed(16, "deg", "P1 brief"),
    massTargetKg: assumed(1450, "kg", "P1 brief — the ledger will show the gap"),
    seatCount: assumed(2, "count", "P1 brief — two seats"),
  },
  placement: {
    railHeight: assumed(P1_RAIL_HEIGHT, "mm", `${CHOICE} — rail centerline above the ground`),
    engineSetback: assumed(430, "mm", `${CHOICE} — block center aft of the front axle so the FRONT FACE clears the axle line: front-MID for real. The first solve caught the block sitting on the axle`),
    engineHeight: assumed(75, "mm", `${CHOICE} — crank above the rails, sump clearing the crossmember`),
    radiatorAhead: assumed(190, "mm", `${CHOICE} — core ahead of the axle, raked back into the nose`),
    radiatorHeight: assumed(95, "mm", `${CHOICE} — raised after the first solve reported the core reaching into the ground slab`),
    tankAheadOfRearAxle: assumed(330, "mm", `${CHOICE} — tank ahead of the rear axle, clear of the axle hardware`),
    tankHeight: assumed(165, "mm", `${CHOICE} — tank raised above the propshaft line after the solve found it sitting on the driveline`),
    heelStation: assumed(1180, "mm", `${CHOICE} — driver heel aft of the front axle: cab-rearward`),
    heelHeight: assumed(275, "mm", `${CHOICE} — heel above the ground; raised 25 mm after the first solve put the foot area into the ground slab`),
    pedalBoxStation: assumed(980, "mm", `${CHOICE} — pedal box at the firewall, tied to the heel`),
    pedalBoxHeight: assumed(150, "mm", CHOICE),
    rackStation: assumed(-95, "mm", `${CHOICE} — rack AHEAD of the axle line: the solve found it fouling the sump of a front-mid six`),
    rackHeight: assumed(-30, "mm", `${CHOICE} — rack just below the rail centerline`),
  },
};
