/**
 * PANORAMIC P2 — front-mid twin-turbo V8, rear drive, four-door fastback GT.
 *
 * The second car with the company's name on it, and the first designed rather
 * than reproduced. Five cars stand in this repository already: one authored
 * from a brief (the P1) and four rebuilt from published envelopes. Every one
 * of those four was a test of whether the instrument could reach a shape
 * somebody else had already found. This one asks the other question — what
 * the instrument draws when the brief is its own.
 *
 * THE BRIEF. A grand tourer that seats four adults behind two doors a side,
 * carries their luggage under a fastback, and does it on the proportions a
 * front-mid V8 gives for nothing: three metres between the axles, a dash-to-
 * axle a coupe would envy, the hips at the rear wheels, and a roof that peaks
 * over the driver and never stops falling until the ducktail. Wider than the
 * M3 by 143 mm and lower by 47.
 *
 * EVERY VALUE HERE IS ASSUMED, because a brief is the owner's ask and nothing
 * else — charge §7. Nothing was surveyed; there is nothing to survey. The
 * fixture is honest about that on every line, and the reference table next
 * door is the same brief read as a profile, so the build can still be checked
 * against something it did not itself type.
 */

import type { CarConfig } from "@car/types";
import { assumed } from "@car/demand";

const CHOICE = "P2 authored placement";
const PROPORTION = "P2 proportion — owner's brief, front-mid four-door fastback GT";
const BRIEF = "P2 brief";

/** Overall diameter of a sidewall spec, mm: rim x 25.4 + 2 x width x aspect/100. */
const tireDiameter = (widthMm: number, aspectPct: number, rimIn: number): number =>
  rimIn * 25.4 + 2 * widthMm * (aspectPct / 100);

/**
 * 255/35 R21 front, 295/35 R21 rear: staggered on one rim size, the rear
 * pair 28 mm taller as well as 40 wider. Both facts reach the body — the
 * rear arch is the bigger opening and the rear lip is the widest thing on
 * the car, which is the M3's plan fact carried onto a car built to it.
 */
const FRONT_TIRE = { width: 255, aspect: 35, rim: 21, load: 98 };
const REAR_TIRE = { width: 295, aspect: 35, rim: 21, load: 105 };

export const P2_FRONT_TIRE_WIDTH = FRONT_TIRE.width;
export const P2_REAR_TIRE_WIDTH = REAR_TIRE.width;
export const P2_FRONT_DIAMETER = tireDiameter(FRONT_TIRE.width, FRONT_TIRE.aspect, FRONT_TIRE.rim);
export const P2_REAR_DIAMETER = tireDiameter(REAR_TIRE.width, REAR_TIRE.aspect, REAR_TIRE.rim);

export const P2_WHEELBASE = 3000;
export const P2_FRONT_OVERHANG = 920;
export const P2_REAR_OVERHANG = 1030;
export const P2_FRONT_TRACK = 1640;
export const P2_REAR_TRACK = 1650;
/** Floorpan longeron centreline above ground — a GT's floor is higher than a
 *  coupe's because four people's feet and a fuel tank share it. */
export const P2_RAIL_HEIGHT = 200;
export const P2_LENGTH = P2_FRONT_OVERHANG + P2_WHEELBASE + P2_REAR_OVERHANG;
/**
 * THE ENVELOPE, and it is the brief's rather than a survey's. 4950 x 1960 x
 * 1400: the tail is long because the fastback needs run-out, the width is
 * what a 295 on a 1650 track leaves 7.5 mm of daylight beside, and the height
 * is what a 95th-percentile male's head needs under a roof that has already
 * started to fall by the time it reaches him.
 */
export const P2_WIDTH = 1960;
export const P2_HEIGHT = 1400;

export const p2Config: CarConfig = {
  name: "Panoramic P2",
  substrate: {
    // A bonded-aluminium unibody in the real brief; v1 has one construction
    // style, so this declares it and the "rails" below are the floor's own
    // extruded longerons — the same accommodation every closed car here makes.
    style: "body-on-frame",
    wheelbase: assumed(P2_WHEELBASE, "mm", `${PROPORTION} — three metres between the axles, the number a four-seat GT is built on`),
    frontOverhang: assumed(P2_FRONT_OVERHANG, "mm", `${PROPORTION} — short, so the front axle sits under the leading edge of the door glass' reflection`),
    rearOverhang: assumed(P2_REAR_OVERHANG, "mm", `${PROPORTION} — long, because a fastback needs somewhere to finish falling`),
    railSpacing: assumed(960, "mm", `${CHOICE} — longerons outboard of a wide tunnel, under the seat rails`),
    crossmemberCount: assumed(5, "count", `${CHOICE} — front panel, tower bulkhead, seat crossmember, tank crossmember, rear panel`),
    railSectionHeight: assumed(120, "mm", CHOICE),
    railSectionWidth: assumed(80, "mm", CHOICE),
    tunnelWidth: assumed(260, "mm", `${CHOICE} — a propshaft, an exhaust either side of it, and the rear-seat armrest on top`),
    tunnelHeight: assumed(200, "mm", `${CHOICE} — the two-piece shaft's centre bearing sits in it`),
    rockerHeight: assumed(165, "mm", `${CHOICE} — an extruded sill under four door apertures`),
    rockerWidth: assumed(120, "mm", CHOICE),
  },
  engine: {
    layout: "V",
    cylinders: assumed(8, "count", "P2 powertrain — a 4.0 L twin-turbo V8, front-mid"),
    displacement: assumed(4.0, "L", "P2 powertrain — 4.0 L"),
    boreStrokeRatio: assumed(1.06, "ratio", "P2 powertrain — near-square, torque-biased for a turbocharged GT"),
    vAngleDeg: assumed(90, "deg", "P2 powertrain — 90 degree vee, hot side inboard"),
    orientation: "longitudinal",
    sumpDepth: assumed(115, "mm", `${CHOICE} — a shallow wet sump so the block sits low behind the axle`),
    turbo: true,
  },
  transmission: {
    type: "dct",
    gearCount: assumed(8, "count", "P2 powertrain — eight-speed dual-clutch, in unit with the engine"),
  },
  driveline: {
    torque: assumed(800, "Nm", "P2 powertrain — peak crank torque the propshaft carries"),
    layout: "longitudinal",
    shaftLength: assumed(1500, "mm", `${CHOICE} — two-piece propshaft, gearbox tail to the rear differential`),
    halfshaftLength: assumed(560, "mm", `${CHOICE} — diff flange to rear hub across the multilink`),
  },
  frontSuspension: {
    architecture: "double-wishbone",
    axle: "front",
    jounceTravel: assumed(80, "mm", "P2 chassis — GT travel, not a sports car's"),
    reboundTravel: assumed(90, "mm", "P2 chassis"),
    trackWidth: assumed(P2_FRONT_TRACK, "mm", PROPORTION),
    tireOverallDiameter: assumed(P2_FRONT_DIAMETER, "mm", "P2 chassis — 255/35R21 front"),
    tireSectionWidth: assumed(FRONT_TIRE.width, "mm", "P2 chassis — 255/35R21 front"),
  },
  rearSuspension: {
    architecture: "multilink",
    axle: "rear",
    jounceTravel: assumed(90, "mm", "P2 chassis — five-link travel"),
    reboundTravel: assumed(95, "mm", "P2 chassis"),
    trackWidth: assumed(P2_REAR_TRACK, "mm", PROPORTION),
    tireOverallDiameter: assumed(P2_REAR_DIAMETER, "mm", "P2 chassis — 295/35R21 rear"),
    tireSectionWidth: assumed(REAR_TIRE.width, "mm", "P2 chassis — 295/35R21 rear"),
  },
  steering: {
    rackPosition: "fore",
    ratio: assumed(13.0, "ratio", "P2 chassis — electric rack, variable; the on-centre figure"),
    trackWidth: assumed(P2_FRONT_TRACK, "mm", "front track carries the rack"),
  },
  brakes: {
    // The first car in the repository whose disc fits its rim with room to
    // spare: 410 under a 21 in rim against the rule's 431.8 ceiling. The M3
    // and the F1 both lost millimetres to the caliper clearance rule; a 21
    // in wheel is what makes a 410 disc an unremarkable choice.
    discDiameter: assumed(410, "mm", "P2 brakes — 410 mm front discs, six-piston fixed calipers, 21.8 mm inside the caliper-clearance ceiling"),
    wheelRimDiameter: assumed(FRONT_TIRE.rim * 25.4, "mm", "21 in forged wheels"),
    driverSide: "left",
  },
  cooling: {
    powertrain: "ice",
    power: assumed(500, "kW", "P2 powertrain — 500 kW from the twin-turbo V8"),
  },
  fuelTank: {
    kind: "fuel-tank",
    range: assumed(720, "km", "P2 brief — a grand tourer that crosses a country between stops"),
    consumption: assumed(11.2, "L/100km", "P2 brief — combined, for an 80 L tank"),
  },
  occupants: {
    rows: [
      {
        heel: [0, 0, 0],
        H30: assumed(255, "mm", "P2 package — a GT chair: lower than the M3's 300, higher than a sports car's floor"),
        hipAftOfHeel: assumed(470, "mm", "P2 package — a long-legged pedal reach under a low scuttle"),
        occupants: assumed(2, "count", "P2 brief — driver and front passenger"),
        label: "front row",
      },
      {
        // 720 aft of the front row's heel and 40 up onto the tank's floor.
        // The rear head lands under the falling roof at 3.2 m, which is what
        // the fastback's fall was drawn around.
        heel: [720, 0, 40],
        H30: assumed(280, "mm", "P2 package — rear chairs raised over the tank, and reclined to fit under the fall"),
        hipAftOfHeel: assumed(380, "mm", "P2 package — knees-up but not folded: a four-seat GT, not a 2+2"),
        seatBackAngleDeg: assumed(26, "deg", "P2 package — reclined further than a sedan's bench because the roof over it is a fastback's"),
        occupants: assumed(2, "count", "P2 brief — two individual rear chairs either side of the tunnel; no middle seat"),
        label: "rear row",
      },
    ],
  },
  frontTire: {
    sectionWidth: assumed(FRONT_TIRE.width, "mm", "255/35R21 front"),
    aspectPercent: assumed(FRONT_TIRE.aspect, "ratio", "255/35R21 front"),
    rimDiameterIn: assumed(FRONT_TIRE.rim, "count", "21 in forged"),
    loadIndex: assumed(FRONT_TIRE.load, "count", "load index for a 1900 kg car"),
  },
  rearTire: {
    sectionWidth: assumed(REAR_TIRE.width, "mm", "295/35R21 rear"),
    aspectPercent: assumed(REAR_TIRE.aspect, "ratio", "295/35R21 rear"),
    rimDiameterIn: assumed(REAR_TIRE.rim, "count", "21 in forged"),
    loadIndex: assumed(REAR_TIRE.load, "count", "load index, rear pair carries the V8's torque"),
  },
  brief: {
    cargoVolumeL: assumed(430, "L", `${BRIEF} — under the fastback, above the tank crossmember`),
    cargoAperture: {
      w: assumed(1020, "mm", `${BRIEF} — between the lamp band's ends`),
      h: assumed(420, "mm", `${BRIEF} — sill to lid`),
    },
    rangeKm: assumed(720, "km", BRIEF),
    groundClearanceMm: assumed(115, "mm", `${BRIEF} — a GT on adaptive springs, at its road height`),
    approachDeg: assumed(11, "deg", `${BRIEF} — the splitter sets it`),
    departureDeg: assumed(14, "deg", `${BRIEF} — the diffuser sets it`),
    massTargetKg: assumed(1890, "kg", `${BRIEF} — a bonded-aluminium four-seater with a twin-turbo V8 and 80 L of fuel`),
    seatCount: assumed(4, "count", `${BRIEF} — four doors, four chairs`),
  },
  placement: {
    railHeight: assumed(P2_RAIL_HEIGHT, "mm", `${CHOICE} — floorpan longeron centreline`),
    // Front-MID: the block entirely behind the front axle line, the way the
    // M3 did it and the P1 before that. 700 puts the block's face just aft
    // of the axle and its mass against the bulkhead.
    engineSetback: assumed(700, "mm", `${CHOICE} — block station aft of the front axle; the envelope hangs forward of it, so the V8 fills the bay between the axle and the pedal bulkhead`),
    engineHeight: assumed(200, "mm", `${CHOICE} — high enough that the gearbox behind the block rides in the tunnel rather than below the floor; the M3 found 190 was the number for a sump 5 mm deeper`),
    radiatorAhead: assumed(430, "mm", `${CHOICE} — core ahead of the engine's front face, behind the grille band`),
    radiatorHeight: assumed(215, "mm", `${CHOICE} — a 500 kW core is tall: at 240 its top lifted the bonnet 48 mm at the arch mouth, at 215 the bonnet drawn for it clears; its bottom still clears the road`),
    tankAheadOfRearAxle: assumed(300, "mm", `${CHOICE} — the tank under the rear chairs, ahead of the axle: the boot floor is luggage`),
    tankHeight: assumed(270, "mm", `${CHOICE} — above the propshaft it straddles`),
    heelStation: assumed(1080, "mm", `${CHOICE} — driver heel aft of the front axle, under the scuttle`),
    heelHeight: assumed(205, "mm", `${CHOICE} — heel above the ground on the floorpan`),
    pedalBoxStation: assumed(860, "mm", `${CHOICE} — pedal box on the bulkhead the engine bay ends at`),
    pedalBoxHeight: assumed(185, "mm", CHOICE),
    rackStation: assumed(-60, "mm", `${CHOICE} — rack just ahead of the axle line`),
    rackHeight: assumed(-30, "mm", `${CHOICE} — rack below the rail centreline`),
  },
};
