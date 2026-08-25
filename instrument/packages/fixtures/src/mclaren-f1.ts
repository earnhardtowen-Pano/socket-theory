/**
 * McLaren F1 (1992) — mid-engined V12, carbon monocoque, three seats.
 *
 * The fourth car, and the first that is not front-engined. Everything the
 * other three share about their layout is wrong here, which is the point.
 *
 * THE PACKAGE IS INVERTED. On the P1, the MX-5 and the E-Type the engine is
 * ahead of the occupant and the tail is luggage; here the occupant is ahead of
 * the engine and the NOSE is luggage. The chain that now runs from the
 * powertrain's envelope through the frame to the roofline has never been asked
 * to point backwards, and on this car the thing it drives is the rear deck.
 *
 * THE DRIVER IS ON THE CENTRELINE. Three cars in, `DRIVER_Y` has been 370 mm
 * off the centre every time, and every cabin reading has been taken at a
 * driver's shoulder rather than the car's. Here it is zero, and the two
 * passengers sit outboard and BEHIND — which the occupant array cannot yet
 * express, and that limit is recorded below rather than smoothed over.
 *
 * IT IS A TUB, NOT A FRAME. A single carbon moulding with no rails in it at
 * all. `makeSubstrate` v1 knows one construction style and it is
 * `body-on-frame`, so that is what the config declares and the "rails" it
 * describes are the tub's own lower longerons. That is a fair reading for a
 * packaging solve, which is all the substrate feeds; the real structure —
 * tub, bonded front crash box, bolted rear subframe carrying engine and
 * gearbox — is authored in `scripts/build-mclaren-f1.ts`. Second car in a row
 * to want a construction style the tool does not have.
 *
 * PROVENANCE, AND ITS LIMIT. Every dimension here is ASSUMED. The published
 * figures are famous and these are them as recalled — 4287 x 1820 x 1140 on a
 * 2718 wheelbase, 1568/1472 tracks, 6064 cc, 627 PS, 1138 kg — but NO source
 * was consulted this run and none is cited, so nothing is marked `sourced`.
 * A survey would replace this file without changing anything that reads it.
 */

import type { CarConfig } from "@car/types";
import { assumed } from "@car/demand";

const CHOICE = "F1 authored placement";
const PROPORTION = "F1 proportion — published dimensions, ASSUMED from recall";

/** Overall diameter of a sidewall spec, mm: rim x 25.4 + 2 x width x aspect/100. */
const tireDiameter = (widthMm: number, aspectPct: number, rimIn: number): number =>
  rimIn * 25.4 + 2 * widthMm * (aspectPct / 100);

/** 235/45 ZR17 front, 315/45 ZR17 rear — and they are NOT the same diameter. */
const FRONT_TIRE = { width: 235, aspect: 45, rim: 17, load: 94 };
const REAR_TIRE = { width: 315, aspect: 45, rim: 17, load: 98 };

export const F1_FRONT_TIRE_WIDTH = FRONT_TIRE.width;
export const F1_REAR_TIRE_WIDTH = REAR_TIRE.width;
export const F1_FRONT_DIAMETER = tireDiameter(FRONT_TIRE.width, FRONT_TIRE.aspect, FRONT_TIRE.rim);
export const F1_REAR_DIAMETER = tireDiameter(REAR_TIRE.width, REAR_TIRE.aspect, REAR_TIRE.rim);

export const F1_WHEELBASE = 2718;
export const F1_FRONT_OVERHANG = 760;
export const F1_REAR_OVERHANG = 809;
export const F1_FRONT_TRACK = 1568;
/** NARROWER than the front, which almost nothing else is, and it shows in plan. */
export const F1_REAR_TRACK = 1472;
/** The tub's lower longeron centreline above the ground. */
export const F1_RAIL_HEIGHT = 235;
export const F1_LENGTH = F1_FRONT_OVERHANG + F1_WHEELBASE + F1_REAR_OVERHANG;
export const F1_WIDTH = 1820;
export const F1_HEIGHT = 1140;

export const mclarenF1Config: CarConfig = {
  name: "McLaren F1",
  substrate: {
    style: "body-on-frame",
    wheelbase: assumed(F1_WHEELBASE, "mm", `${PROPORTION} — 2718 mm between axles`),
    frontOverhang: assumed(F1_FRONT_OVERHANG, "mm", `${PROPORTION} — a short nose: the luggage is in it and nothing else`),
    rearOverhang: assumed(F1_REAR_OVERHANG, "mm", `${PROPORTION} — engine, gearbox and diffuser behind the axle`),
    railSpacing: assumed(760, "mm", `${CHOICE} — the tub's lower longerons, out at the seat edges rather than beside a tunnel: there is no tunnel on a car whose driver sits in the middle`),
    crossmemberCount: assumed(4, "count", `${CHOICE} — front bulkhead, dash, rear bulkhead, and the subframe's own`),
    railSectionHeight: assumed(120, "mm", `${CHOICE} — a deep carbon section, and it is the floor as well as the member`),
    railSectionWidth: assumed(90, "mm", CHOICE),
    tunnelWidth: assumed(150, "mm", `${CHOICE} — a spine for the loom and the gearchange, not a propshaft: the engine is BEHIND the driver`),
    tunnelHeight: assumed(90, "mm", `${CHOICE} — low, because nothing runs through it`),
    rockerHeight: assumed(230, "mm", `${CHOICE} — a very deep sill, which is where a tub with no roof rails carries its bending and why the doors have to open upwards`),
    rockerWidth: assumed(130, "mm", CHOICE),
  },
  engine: {
    layout: "V",
    cylinders: assumed(12, "count", "F1 powertrain — BMW S70/2, 60 degree V12, four cams"),
    displacement: assumed(6.1, "L", "F1 powertrain — 6064 cc"),
    boreStrokeRatio: assumed(0.99, "ratio", "F1 powertrain — 86 x 87 mm, square"),
    vAngleDeg: assumed(60, "deg", "F1 powertrain — 60 degree vee"),
    orientation: "longitudinal",
    sumpDepth: assumed(95, "mm", `${CHOICE} — dry sump, which is most of why the engine sits as low as it does`),
    turbo: false,
  },
  transmission: {
    type: "manual",
    gearCount: assumed(6, "count", "F1 powertrain — six-speed transaxle behind the engine"),
  },
  driveline: {
    torque: assumed(651, "Nm", "F1 powertrain — 651 Nm at 5600"),
    layout: "transverse",
    shaftLength: assumed(120, "mm", `${CHOICE} — there is no propshaft. The transaxle bolts to the block and the halfshafts leave it; 120 mm is the flange-to-flange the tool needs to place anything at all`),
    halfshaftLength: assumed(430, "mm", `${CHOICE} — diff flange to rear hub`),
  },
  frontSuspension: {
    architecture: "double-wishbone",
    axle: "front",
    jounceTravel: assumed(55, "mm", "F1 chassis — road car travel, but not much of it"),
    reboundTravel: assumed(60, "mm", "F1 chassis"),
    trackWidth: assumed(F1_FRONT_TRACK, "mm", PROPORTION),
    tireOverallDiameter: assumed(F1_FRONT_DIAMETER, "mm", "F1 chassis — 235/45 ZR17"),
    tireSectionWidth: assumed(FRONT_TIRE.width, "mm", "F1 chassis — 235/45 ZR17"),
  },
  rearSuspension: {
    architecture: "double-wishbone",
    axle: "rear",
    jounceTravel: assumed(55, "mm", "F1 chassis"),
    reboundTravel: assumed(60, "mm", "F1 chassis"),
    trackWidth: assumed(F1_REAR_TRACK, "mm", `${PROPORTION} — 96 mm narrower than the front`),
    tireOverallDiameter: assumed(F1_REAR_DIAMETER, "mm", "F1 chassis — 315/45 ZR17, 72 mm bigger than the front"),
    tireSectionWidth: assumed(REAR_TIRE.width, "mm", "F1 chassis — 315/45 ZR17"),
  },
  steering: {
    rackPosition: "fore",
    ratio: assumed(11, "ratio", "F1 chassis — unassisted rack, and deliberately quick"),
    trackWidth: assumed(F1_FRONT_TRACK, "mm", PROPORTION),
  },
  brakes: {
    // THE REAL CAR'S FRONT DISC IS 332 AND THE TOOL WILL NOT HAVE IT.
    // `makeBrakes` requires disc <= rim - 2 x 50.8 mm of caliper radial
    // clearance, and 50.8 is SOURCED — a caliper body plus the 5 mm
    // caliper-to-rim air gap EBC specifies. A 17 in rim is 431.8, so the
    // largest disc that clears is 330.2. The F1 misses by 1.8 mm.
    //
    // Which of the two is wrong is a real question and the answer is
    // probably neither: the F1's front caliper is a competition four-pot in
    // a road car, and a rule written for a generic caliper is 1.8 mm too
    // generous for it. The rule is not weakened for one car. 330 is typed,
    // the two millimetres are recorded here, and the build says so.
    discDiameter: assumed(330, "mm", "F1 chassis — the real front disc is 332 mm, which is 1.8 mm larger than a 17 in rim admits under the tool's sourced caliper clearance; 330 is the largest that fits and the difference is recorded rather than legislated away"),
    wheelRimDiameter: assumed(FRONT_TIRE.rim * 25.4, "mm", "F1 chassis — 17 in rim"),
    driverSide: "centre",
  },
  cooling: {
    powertrain: "ice",
    power: assumed(461, "kW", "F1 powertrain — 627 PS"),
  },
  fuelTank: {
    kind: "fuel-tank",
    range: assumed(430, "km", "F1 brief — 90 L at the consumption below"),
    consumption: assumed(21, "L/100km", "F1 brief — a 6.1 V12; ASSUMED until mass and drag exist"),
  },
  occupants: {
    rows: [{
      heel: [0, 0, 0],
      H30: assumed(190, "mm", "F1 package — you sit on the floor of a carbon tub"),
      // THE LIMIT THIS CAR FINDS. `makeOccupantArray` places its occupants
      // ABREAST at one station, and the F1's two passengers sit outboard AND
      // 300 mm behind the driver — which is the entire reason three people fit
      // in a car 1820 mm wide. Declared as three because three is what it
      // carries; the array's own width demand is therefore over-stated, and
      // the build reports it rather than quietly using a smaller number.
      occupants: assumed(3, "count", "F1 brief — three seats, driver central, passengers outboard and set back"),
      label: "front row",
    }],
  },
  frontTire: {
    sectionWidth: assumed(FRONT_TIRE.width, "mm", "F1 chassis — 235/45 ZR17"),
    aspectPercent: assumed(FRONT_TIRE.aspect, "ratio", "F1 chassis — 235/45 ZR17"),
    rimDiameterIn: assumed(FRONT_TIRE.rim, "count", "F1 chassis — 17 in"),
    loadIndex: assumed(FRONT_TIRE.load, "count", "F1 chassis"),
  },
  rearTire: {
    sectionWidth: assumed(REAR_TIRE.width, "mm", "F1 chassis — 315/45 ZR17"),
    aspectPercent: assumed(REAR_TIRE.aspect, "ratio", "F1 chassis — 315/45 ZR17"),
    rimDiameterIn: assumed(REAR_TIRE.rim, "count", "F1 chassis — 17 in"),
    loadIndex: assumed(REAR_TIRE.load, "count", "F1 chassis"),
  },
  brief: {
    cargoVolumeL: assumed(100, "L", "F1 brief — two small bays in the flanks, and the nose"),
    cargoAperture: {
      w: assumed(420, "mm", "F1 brief — a side locker, not a boot"),
      h: assumed(280, "mm", "F1 brief"),
    },
    rangeKm: assumed(430, "km", "F1 brief"),
    groundClearanceMm: assumed(120, "mm", "F1 brief — and it is a flat floor, so this is the whole of it"),
    approachDeg: assumed(9, "deg", "F1 brief — a low nose on a short overhang"),
    departureDeg: assumed(14, "deg", "F1 brief — the diffuser sets it"),
    massTargetKg: assumed(1138, "kg", "F1 brief — the number the whole car is about"),
    seatCount: assumed(3, "count", "F1 brief — three"),
  },
  placement: {
    railHeight: assumed(F1_RAIL_HEIGHT, "mm", `${CHOICE} — the tub's lower longeron centreline`),
    // POSITIVE AND LARGE, which no car in this repository has been. The block
    // sits BEHIND the cabin; every other config here puts it in front.
    engineSetback: assumed(2200, "mm", `${CHOICE} — block station aft of the front axle, which on a mid-engined car is most of the wheelbase. The envelope hangs forward of the station given, so this puts the V12 between the rear bulkhead and the rear axle`),
    engineHeight: assumed(120, "mm", `${CHOICE} — a dry-sumped V12 sits low, and this is the number the rear deck's height comes from`),
    radiatorAhead: assumed(-640, "mm", `${CHOICE} — the cores are BEHIND the front axle, in the leading edge of the side pods, fed by the flank ducts. A negative "ahead" is the tool being told the car is not a front-radiator car`),
    radiatorHeight: assumed(90, "mm", CHOICE),
    tankAheadOfRearAxle: assumed(1450, "mm", `${CHOICE} — the tank sits between the rear bulkhead and the engine's front face, which is the safest and heaviest place on the car and the reason the F1's balance barely moves as it empties. 760 put it straight through the block: the packer hangs the tank forward of the station given and the engine is aft of the cabin on this car, so the two boxes met`),
    tankHeight: assumed(140, "mm", CHOICE),
    heelStation: assumed(330, "mm", `${CHOICE} — driver heel aft of the front axle. You sit a long way FORWARD on this car`),
    heelHeight: assumed(190, "mm", `${CHOICE} — heel above the ground, on the floor of the tub`),
    pedalBoxStation: assumed(70, "mm", `${CHOICE} — pedal box near the front axle line, ahead of the footwell`),
    pedalBoxHeight: assumed(150, "mm", CHOICE),
    rackStation: assumed(-140, "mm", `${CHOICE} — rack ahead of the axle line`),
    rackHeight: assumed(-20, "mm", `${CHOICE} — rack just below the longeron centreline`),
  },
};
