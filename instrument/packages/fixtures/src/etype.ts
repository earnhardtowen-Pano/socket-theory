/**
 * Jaguar E-Type Series 1 3.8 — front engine, rear drive, two-seat fixed-head coupe.
 *
 * The third car, and it was chosen for the two things the first two could not
 * ask.
 *
 * IT HAS A ROOF. The P1's greenhouse is a fastback that never closes and the
 * MX-5 is authored top-down, so in two cars nothing has ever put a body OVER
 * an occupant's head. `cabinLens` has a headroom branch, a fault string for a
 * head through a roof, and until now no car that could fire either. Every
 * reading it has published about a head has been "+464 mm, in the open air,
 * which a roadster means".
 *
 * IT IS TWO STRUCTURES, NOT ONE. An E-Type is a monocoque tub from the
 * scuttle back with a bolted tubular front frame ahead of it carrying the
 * engine, the front suspension and the bonnet. That is not a detail, it is
 * the car: the joint at the scuttle bulkhead is a real interface with real
 * registration, and `chassisFit` was built last week for exactly this
 * question against a car that only had one structure to ask it of.
 *
 * And it disagrees with both predecessors on proportion in the way that
 * matters to a surfacer. The wheel is 674 mm against the MX-5's 592 and the
 * track is 1270 under a body 1657 wide — so the flank stands 111 mm outboard
 * of the tyre where the MX-5 has 35, and the arch has somewhere to go for the
 * first time. The nose is 1240 mm of overhang ahead of the front axle: more
 * than a quarter of the car is bonnet, where the MX-5's whole front overhang
 * is 790.
 *
 * PROVENANCE, AND ITS LIMIT. Every dimension here is ASSUMED. The published
 * figures for a Series 1 3.8 coupe are well known and these are them as
 * recalled — 4453 x 1657 x 1219 on a 2438 wheelbase, 1270 tracks, 6.40-15
 * tyres — but NO source was consulted in this run and none is cited, so none
 * of it is marked `sourced`. They are good to a few millimetres and should be
 * treated as a brief rather than a measurement. A survey would replace this
 * file without changing anything that consumes it.
 *
 * THE SUBSTRATE LIES A LITTLE, and says so here. `makeSubstrate` v1 knows one
 * construction style, `body-on-frame`, so that is what the config declares.
 * The tub's floor longerons either side of the tunnel are what the "rails"
 * describe and the reading is fair for a packaging solve, which is all the
 * substrate feeds. The car's REAL structure — tub aft, tubular frame forward,
 * bolted at the bulkhead — is authored in `scripts/build-etype.ts` where the
 * geometry lives, and the gap between the two is recorded as an open item
 * rather than papered over. A monocoque style is the amendment this car asks
 * for.
 */

import type { CarConfig } from "@car/types";
import { assumed } from "@car/demand";

const CHOICE = "E-Type authored placement";
const PROPORTION = "E-Type proportion — published Series 1 dimensions, ASSUMED from recall";

/** Overall diameter of a sidewall spec, mm: rim x 25.4 + 2 x width x aspect/100. */
const tireDiameter = (widthMm: number, aspectPct: number, rimIn: number): number =>
  rimIn * 25.4 + 2 * widthMm * (aspectPct / 100);

/**
 * 6.40-15 crossply on a 15 in wire wheel, as a modern sidewall spec.
 *
 * A crossply is not quoted this way and never was — 6.40 is a section width
 * in inches and the aspect ratio is whatever the casing does. The metric
 * equivalent below reproduces the overall DIAMETER, which is the only thing
 * the arch geometry cares about, and the licence says so rather than implying
 * Dunlop ever printed it.
 */
const TIRE = { width: 163, aspect: 90, rim: 15, load: 88 };

export const ETYPE_TIRE_WIDTH = TIRE.width;
export const ETYPE_DIAMETER = tireDiameter(TIRE.width, TIRE.aspect, TIRE.rim);

export const ETYPE_WHEELBASE = 2438;
export const ETYPE_FRONT_OVERHANG = 1240;
export const ETYPE_REAR_OVERHANG = 775;
export const ETYPE_FRONT_TRACK = 1270;
export const ETYPE_REAR_TRACK = 1270;
/** Floor longeron centreline above the ground — the tub's, not a ladder's. */
export const ETYPE_RAIL_HEIGHT = 245;
export const ETYPE_LENGTH = ETYPE_FRONT_OVERHANG + ETYPE_WHEELBASE + ETYPE_REAR_OVERHANG;
export const ETYPE_WIDTH = 1657;
export const ETYPE_HEIGHT = 1219;

export const etypeConfig: CarConfig = {
  name: "E-Type S1 FHC",
  substrate: {
    style: "body-on-frame",
    wheelbase: assumed(ETYPE_WHEELBASE, "mm", `${PROPORTION} — 2438 mm (96 in) between axles`),
    frontOverhang: assumed(ETYPE_FRONT_OVERHANG, "mm", `${PROPORTION} — more than a quarter of the car is bonnet`),
    rearOverhang: assumed(ETYPE_REAR_OVERHANG, "mm", `${PROPORTION} — the coupe's tail is short and tapers`),
    railSpacing: assumed(620, "mm", `${CHOICE} — floor longerons either side of a wide tunnel, close in`),
    crossmemberCount: assumed(4, "count", `${CHOICE} — bulkhead, seat, rear bulkhead, and the frame's own front`),
    railSectionHeight: assumed(95, "mm", `${CHOICE} — a monocoque floor member, shallower than a ladder rail`),
    railSectionWidth: assumed(70, "mm", CHOICE),
    tunnelWidth: assumed(300, "mm", `${CHOICE} — a big tunnel: propshaft, the Moss box's bellhousing and twin pipes`),
    tunnelHeight: assumed(215, "mm", `${CHOICE} — you sit either side of it, not over it`),
    rockerHeight: assumed(165, "mm", `${CHOICE} — the sill IS the structure on a tub with a shallow floor`),
    rockerWidth: assumed(95, "mm", CHOICE),
  },
  engine: {
    layout: "I",
    cylinders: assumed(6, "count", "E-Type powertrain — XK twin-cam straight six"),
    displacement: assumed(3.8, "L", "E-Type powertrain — 3781 cc"),
    boreStrokeRatio: assumed(0.79, "ratio", "E-Type powertrain — 87 x 106 mm, long stroke"),
    orientation: "longitudinal",
    sumpDepth: assumed(150, "mm", `${CHOICE} — a tall iron six needs the sump the frame is built around`),
    turbo: false,
  },
  transmission: {
    type: "manual",
    gearCount: assumed(4, "count", "E-Type powertrain — four-speed Moss box, first without synchromesh"),
  },
  driveline: {
    torque: assumed(352, "Nm", "E-Type powertrain — 260 lb-ft peak crank torque"),
    layout: "longitudinal",
    shaftLength: assumed(880, "mm", `${CHOICE} — short shaft to an inboard-braked IRS cage`),
    halfshaftLength: assumed(480, "mm", `${CHOICE} — the halfshaft IS the upper link on this car`),
  },
  frontSuspension: {
    architecture: "double-wishbone",
    axle: "front",
    jounceTravel: assumed(85, "mm", "E-Type chassis — torsion-bar wishbone travel"),
    reboundTravel: assumed(90, "mm", "E-Type chassis — torsion-bar wishbone travel"),
    trackWidth: assumed(ETYPE_FRONT_TRACK, "mm", PROPORTION),
    tireOverallDiameter: assumed(ETYPE_DIAMETER, "mm", "E-Type chassis — 6.40-15 as a metric equivalent"),
    tireSectionWidth: assumed(TIRE.width, "mm", "E-Type chassis — 6.40-15 as a metric equivalent"),
  },
  rearSuspension: {
    architecture: "multilink",
    axle: "rear",
    jounceTravel: assumed(80, "mm", "E-Type chassis — twin coilovers per side in a subframe cage"),
    reboundTravel: assumed(85, "mm", "E-Type chassis — twin coilovers per side in a subframe cage"),
    trackWidth: assumed(ETYPE_REAR_TRACK, "mm", `${PROPORTION} — tracks equal front and rear`),
    tireOverallDiameter: assumed(ETYPE_DIAMETER, "mm", "E-Type chassis — 6.40-15 as a metric equivalent"),
    tireSectionWidth: assumed(TIRE.width, "mm", "E-Type chassis — 6.40-15 as a metric equivalent"),
  },
  steering: {
    rackPosition: "fore",
    ratio: assumed(14, "ratio", "E-Type chassis — unassisted rack and pinion"),
    trackWidth: assumed(ETYPE_FRONT_TRACK, "mm", PROPORTION),
  },
  brakes: {
    // 279.4 and not 280, which the tool insisted on. `makeBrakes` requires a
    // rim at least the disc plus two inches of caliper clearance, and 280 mm
    // asks for 381.6 against a 15 in rim's 381.0. Rounding 11 inches up by
    // six tenths of a millimetre made the car impossible; the real figure
    // fits with four tenths to spare, which is about how much room a Series 1
    // actually had in there.
    discDiameter: assumed(279.4, "mm", "E-Type chassis — 11 in Dunlop front disc; it sets the wheel-diameter floor and on this car it very nearly does not fit"),
    wheelRimDiameter: assumed(TIRE.rim * 25.4, "mm", "E-Type chassis — 15 in wire wheel"),
    driverSide: "right",
  },
  cooling: {
    powertrain: "ice",
    power: assumed(198, "kW", "E-Type powertrain — 265 bhp gross as claimed in period"),
  },
  fuelTank: {
    kind: "fuel-tank",
    range: assumed(430, "km", "E-Type brief — 63 L tank at the consumption below"),
    consumption: assumed(14.5, "L/100km", "E-Type brief — a 3.8 six on triple SUs; ASSUMED until mass and drag exist"),
  },
  occupants: {
    rows: [{
      heel: [0, 0, 0],
      H30: assumed(200, "mm", "E-Type package — hip 200 mm above the heel: a low car with a reclined seat"),
      occupants: assumed(2, "count", "E-Type brief — two seats, two doors"),
      label: "front row",
    }],
  },
  frontTire: {
    sectionWidth: assumed(TIRE.width, "mm", "E-Type chassis — 6.40-15 as a metric equivalent"),
    aspectPercent: assumed(TIRE.aspect, "ratio", "E-Type chassis — aspect chosen to reproduce the crossply's overall diameter"),
    rimDiameterIn: assumed(TIRE.rim, "count", "E-Type chassis — 15 in wire wheel"),
    loadIndex: assumed(TIRE.load, "count", "E-Type chassis — load index for a 1234 kg car"),
  },
  rearTire: {
    sectionWidth: assumed(TIRE.width, "mm", "E-Type chassis — 6.40-15 as a metric equivalent"),
    aspectPercent: assumed(TIRE.aspect, "ratio", "E-Type chassis — aspect chosen to reproduce the crossply's overall diameter"),
    rimDiameterIn: assumed(TIRE.rim, "count", "E-Type chassis — 15 in wire wheel"),
    loadIndex: assumed(TIRE.load, "count", "E-Type chassis — load index for a 1234 kg car"),
  },
  brief: {
    cargoVolumeL: assumed(230, "L", "E-Type brief — the coupe's whole virtue over the roadster: a load bay under the tailgate"),
    cargoAperture: {
      w: assumed(880, "mm", "E-Type brief — side-hinged tailgate aperture"),
      h: assumed(520, "mm", "E-Type brief — side-hinged tailgate aperture"),
    },
    rangeKm: assumed(430, "km", "E-Type brief"),
    groundClearanceMm: assumed(127, "mm", "E-Type brief — 5 in, and it is a road car of 1961"),
    approachDeg: assumed(11, "deg", "E-Type brief — 1240 mm of nose ahead of the axle buys a poor approach angle and the car is famous for it"),
    departureDeg: assumed(20, "deg", "E-Type brief — the tail is short"),
    massTargetKg: assumed(1234, "kg", "E-Type brief — kerb weight of a Series 1 3.8 coupe"),
    seatCount: assumed(2, "count", "E-Type brief — two seats"),
  },
  placement: {
    railHeight: assumed(ETYPE_RAIL_HEIGHT, "mm", `${CHOICE} — floor longeron centreline above the ground`),
    engineSetback: assumed(-120, "mm", `${CHOICE} — block centre AHEAD of the front axle. This is the E-Type's packaging in one number and the reason it understeers: the tall six sits forward of the axle line inside the tubular frame`),
    engineHeight: assumed(150, "mm", `${CHOICE} — a 106 mm stroke six stands tall; the crank is well above the floor`),
    radiatorAhead: assumed(420, "mm", `${CHOICE} — core far ahead of the axle, upright behind the mouth`),
    radiatorHeight: assumed(60, "mm", CHOICE),
    tankAheadOfRearAxle: assumed(-330, "mm", `${CHOICE} — the tank is BEHIND the rear axle, under the boot floor`),
    tankHeight: assumed(180, "mm", CHOICE),
    heelStation: assumed(1160, "mm", `${CHOICE} — driver heel aft of the front axle. The footwell runs FORWARD under the scuttle, ahead of the line the bonnet shuts on, which is what lets the H-point land under the roof rather than behind it. Put the heel behind the bulkhead instead and the packer places a head 340 mm aft of the tailgate shut`),
    heelHeight: assumed(215, "mm", `${CHOICE} — heel above the ground`),
    pedalBoxStation: assumed(930, "mm", `${CHOICE} — pedal box well forward, under the bonnet line`),
    pedalBoxHeight: assumed(150, "mm", CHOICE),
    rackStation: assumed(-105, "mm", `${CHOICE} — rack ahead of the axle line`),
    rackHeight: assumed(-30, "mm", `${CHOICE} — rack just below the longeron centreline`),
  },
};
