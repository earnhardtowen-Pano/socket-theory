/**
 * BMW E90 M3 LCI (2009-2011) — the M3 sedan, S65 V8, six-speed manual.
 *
 * The fifth car, and the first SEDAN: four doors, two seat rows, a boot. Every
 * car before it had one row and at most three occupants at one station; this
 * one exercises the occupant array's rows for the first time, and the body
 * over it needs two door shuts per side and a deck that is neither a
 * clamshell nor a tailgate.
 *
 * IT IS ALSO THE FIRST CAR WITH A SURVEY. Every previous config is ASSUMED
 * end to end — "no source was consulted this run and none is cited". This one
 * was: the overall dimensions, wheelbase, wheel and tyre fitment, disc
 * diameters, engine output and kerb weight were checked against published
 * pages this run, and those figures are `sourced` with the URL in the
 * citation. What the survey could not reach (several spec databases sat
 * behind a blocked egress) stays `assumed` with its confidence named. The
 * overhang split is the honest example: length minus wheelbase is exactly
 * 1819 mm SOURCED, and how it divides front/rear is nowhere published, so the
 * split is ASSUMED against side-view proportion and says so.
 *
 * THE PACKAGE IS THE CLASSIC ONE, DONE PROPERLY. Front-mid V8 — the whole
 * block behind the front axle line under a long bonnet — gearbox against it,
 * propshaft down a real tunnel to the rear axle, tank AHEAD of the rear axle
 * under the rear seat, boot behind. The dash-to-axle this produces is most of
 * what makes an M3 look like an M3.
 */

import type { CarConfig } from "@car/types";
import { assumed, sourced } from "@car/demand";

const CHOICE = "E90 M3 authored placement";
const SPECS = "https://www.ultimatespecs.com/car-specs/BMW/10029/BMW-E90-3-Series-LCI-M3.html";
const AUTOEVO = "https://www.autoevolution.com/cars/bmw-m3-sedan-e90-2008.html";
const BMWM = "https://www.bmw-m.com/en/topics/magazine-article-pool/bmw-m3-e92-e90-and-e93.html";
const NOSTALGIA = "https://supercarnostalgia.com/blog/bmw-e90-e92-e93-m3";
const APEX = "https://apexwheels.com/fitment-guides/bmw/m3/bmw-e90-e92-e93-m3-wheel-and-tire-fitment-guide";

/** Overall diameter of a sidewall spec, mm: rim x 25.4 + 2 x width x aspect/100. */
const tireDiameter = (widthMm: number, aspectPct: number, rimIn: number): number =>
  rimIn * 25.4 + 2 * widthMm * (aspectPct / 100);

/** 245/40 R18 front, 265/40 R18 rear — staggered on Style 219M double-spokes. */
const FRONT_TIRE = { width: 245, aspect: 40, rim: 18, load: 93 };
const REAR_TIRE = { width: 265, aspect: 40, rim: 18, load: 96 };

export const E90_FRONT_TIRE_WIDTH = FRONT_TIRE.width;
export const E90_REAR_TIRE_WIDTH = REAR_TIRE.width;
export const E90_FRONT_DIAMETER = tireDiameter(FRONT_TIRE.width, FRONT_TIRE.aspect, FRONT_TIRE.rim);
export const E90_REAR_DIAMETER = tireDiameter(REAR_TIRE.width, REAR_TIRE.aspect, REAR_TIRE.rim);

export const E90_WHEELBASE = 2761;
/**
 * The pair sums to 4580 - 2761 = 1819, which is exact and SOURCED; the split
 * is not published anywhere the survey reached and is ASSUMED from side-view
 * proportion. Moving it moves the axles under the body, so the profile check
 * would catch a bad guess as two arches sitting wrong against the table.
 */
export const E90_FRONT_OVERHANG = 950;
export const E90_REAR_OVERHANG = 869;
export const E90_FRONT_TRACK = 1538;
export const E90_REAR_TRACK = 1539;
/** Floorpan longeron centreline above ground — a unibody's rails are pressed
 *  into its floor, not bolted under it. */
export const E90_RAIL_HEIGHT = 170;
export const E90_LENGTH = E90_FRONT_OVERHANG + E90_WHEELBASE + E90_REAR_OVERHANG;
export const E90_WIDTH = 1817;
export const E90_HEIGHT = 1447;

export const e90M3Config: CarConfig = {
  name: "BMW E90 M3 LCI",
  substrate: {
    // A unibody, declared as the one style v1 has. The E90 is the THIRD car
    // to want a construction style the tool does not model — the "rails" here
    // are the floorpan's pressed longerons, which is a fair reading for a
    // packaging solve and is the same accommodation the F1's tub made.
    style: "body-on-frame",
    wheelbase: sourced(E90_WHEELBASE, "mm", "BMW E90 M3 published wheelbase", SPECS),
    frontOverhang: assumed(E90_FRONT_OVERHANG, "mm", "front share of the sourced 1819 mm overhang total — split ASSUMED from side-view proportion; the sum is exact"),
    rearOverhang: assumed(E90_REAR_OVERHANG, "mm", "rear share of the sourced 1819 mm overhang total — see frontOverhang"),
    railSpacing: assumed(940, "mm", `${CHOICE} — floorpan longerons either side of a real transmission tunnel`),
    crossmemberCount: assumed(5, "count", `${CHOICE} — front panel, suspension towers' bulkhead, seat crossmember, tank crossmember, rear panel`),
    railSectionHeight: assumed(110, "mm", CHOICE),
    railSectionWidth: assumed(70, "mm", CHOICE),
    tunnelWidth: assumed(240, "mm", `${CHOICE} — a propshaft and an exhaust run down it; this car is the reason the tunnel field exists`),
    tunnelHeight: assumed(190, "mm", `${CHOICE} — tall enough for the two-piece shaft's centre bearing`),
    rockerHeight: assumed(160, "mm", `${CHOICE} — a pressed-steel sill under four door apertures`),
    rockerWidth: assumed(110, "mm", CHOICE),
  },
  engine: {
    layout: "V",
    cylinders: sourced(8, "count", "S65B40: 4.0 L 90-degree V8, individual throttle bodies", BMWM),
    displacement: assumed(4.0, "L", "S65B40 — 3999 cc; displacement page reached, cc figure recalled to one decimal"),
    boreStrokeRatio: assumed(1.22, "ratio", "S65B40 — 92.0 x 75.2 mm, oversquare; bore/stroke RECALLED, high confidence"),
    vAngleDeg: assumed(90, "deg", "S65B40 — 90 degree vee, RECALLED high"),
    orientation: "longitudinal",
    sumpDepth: assumed(120, "mm", `${CHOICE} — wet sump with twin pickups; shallower than a road V8 because the car sits low`),
    turbo: false,
  },
  transmission: {
    type: "manual",
    gearCount: sourced(6, "count", "Getrag six-speed manual standard; seven-speed M-DCT optional", NOSTALGIA),
  },
  driveline: {
    torque: sourced(400, "Nm", "S65B40 peak torque", BMWM),
    layout: "longitudinal",
    shaftLength: assumed(1350, "mm", `${CHOICE} — two-piece propshaft, gearbox tail to the M differential`),
    halfshaftLength: assumed(520, "mm", `${CHOICE} — diff flange to rear hub across the multilink`),
  },
  frontSuspension: {
    architecture: "strut",
    axle: "front",
    jounceTravel: assumed(85, "mm", "E90 M3 chassis — strut travel, road car"),
    reboundTravel: assumed(95, "mm", "E90 M3 chassis"),
    trackWidth: assumed(E90_FRONT_TRACK, "mm", "E90 M3 front track — press-data figure, RECALLED medium-high (1538/1539 F/R)"),
    tireOverallDiameter: assumed(E90_FRONT_DIAMETER, "mm", "245/40 R18 on the standard Style 219M — sizes sourced, diameter derived"),
    tireSectionWidth: sourced(FRONT_TIRE.width, "mm", "245/40 R18 front fitment", APEX),
  },
  rearSuspension: {
    architecture: "multilink",
    axle: "rear",
    jounceTravel: assumed(95, "mm", "E90 M3 chassis — five-link travel"),
    reboundTravel: assumed(100, "mm", "E90 M3 chassis"),
    trackWidth: assumed(E90_REAR_TRACK, "mm", "E90 M3 rear track — press-data figure, RECALLED medium-high"),
    tireOverallDiameter: assumed(E90_REAR_DIAMETER, "mm", "265/40 R18 on the standard Style 219M — sizes sourced, diameter derived"),
    tireSectionWidth: sourced(REAR_TIRE.width, "mm", "265/40 R18 rear fitment", APEX),
  },
  steering: {
    rackPosition: "fore",
    ratio: assumed(12.5, "ratio", "E90 M3 chassis — M-specific hydraulic rack, RECALLED medium"),
    trackWidth: assumed(E90_FRONT_TRACK, "mm", "front track carries the rack"),
  },
  brakes: {
    // THE REAL FRONT DISC IS 360 AND THE TOOL WILL NOT HAVE IT — the same
    // collision the F1 had at 332. `makeBrakes` requires disc <= rim - 2 x
    // 50.8 mm of SOURCED caliper radial clearance; an 18 in rim is 457.2, so
    // the largest disc that clears is 355.6. The M3's single-piston
    // swing-caliper is slimmer than the rule's generic four-pot, which is
    // exactly how BMW fitted 360 under an 18 — but the rule is not weakened
    // for one car. 355 is typed and the five millimetres are recorded here.
    discDiameter: assumed(355, "mm", "E90 M3 brakes — the real front disc is 360 mm (sourced, supercarnostalgia.com), 4.4 mm larger than an 18 in rim admits under the tool's sourced caliper clearance; 355 is the largest that fits and the difference is recorded rather than legislated away"),
    wheelRimDiameter: sourced(FRONT_TIRE.rim * 25.4, "mm", "18 in Style 219M standard fitment", APEX),
    driverSide: "left",
  },
  cooling: {
    powertrain: "ice",
    power: sourced(309, "kW", "S65B40 — 420 PS at 8300 rpm", BMWM),
  },
  fuelTank: {
    kind: "fuel-tank",
    range: assumed(508, "km", "E90 M3 brief — 63 L (RECALLED high) at the consumption below"),
    consumption: assumed(12.4, "L/100km", "E90 M3 brief — EU combined for the manual sedan, RECALLED medium"),
  },
  occupants: {
    rows: [
      {
        heel: [0, 0, 0],
        H30: assumed(300, "mm", "E90 package — a sports sedan chair, not a sports car floor: hip 300 mm above the heel"),
        hipAftOfHeel: assumed(430, "mm", "E90 package — a sedan pedal reach, not the module's 800 mm default, which put the driver's head under the C-pillar"),
        occupants: assumed(2, "count", "E90 M3 brief — driver and front passenger"),
        label: "front row",
      },
      {
        heel: [640, 0, 55],
        H30: assumed(310, "mm", "E90 package — rear bench slightly theatre-raised over the tank"),
        hipAftOfHeel: assumed(360, "mm", "E90 package — knees-up rear legroom, which is what a 3-series rear seat is"),
        seatBackAngleDeg: assumed(22, "deg", "E90 package — a rear bench sits more upright than the driver, and the falling roof is why"),
        occupants: assumed(3, "count", "E90 M3 brief — a three-seat bench, and the transmission tunnel makes the middle one honest only for short trips"),
        label: "rear row",
      },
    ],
  },
  frontTire: {
    sectionWidth: sourced(FRONT_TIRE.width, "mm", "245/40 R18 front", APEX),
    aspectPercent: sourced(FRONT_TIRE.aspect, "ratio", "245/40 R18 front", APEX),
    rimDiameterIn: sourced(FRONT_TIRE.rim, "count", "18 in Style 219M", APEX),
    loadIndex: assumed(FRONT_TIRE.load, "count", "load index for a 1605 kg car, RECALLED"),
  },
  rearTire: {
    sectionWidth: sourced(REAR_TIRE.width, "mm", "265/40 R18 rear", APEX),
    aspectPercent: sourced(REAR_TIRE.aspect, "ratio", "265/40 R18 rear", APEX),
    rimDiameterIn: sourced(REAR_TIRE.rim, "count", "18 in Style 219M", APEX),
    loadIndex: assumed(REAR_TIRE.load, "count", "load index, RECALLED"),
  },
  brief: {
    cargoVolumeL: assumed(450, "L", "E90 brief — the sedan boot, RECALLED high"),
    cargoAperture: {
      w: assumed(980, "mm", "E90 brief — boot aperture between the lamp clusters"),
      h: assumed(430, "mm", "E90 brief — sill to lid"),
    },
    rangeKm: assumed(508, "km", "E90 M3 brief"),
    groundClearanceMm: assumed(120, "mm", "E90 M3 brief — an M car on road springs"),
    approachDeg: assumed(10, "deg", "E90 M3 brief — the front apron's lower lip sets it"),
    departureDeg: assumed(16, "deg", "E90 M3 brief"),
    massTargetKg: assumed(1605, "kg", "E90 M3 sedan DIN kerb weight — the figure is sourced (supercarnostalgia.com) but a BRIEF is the owner's own ask, so it is carried as ASSUMED by charge §7"),
    seatCount: assumed(5, "count", "E90 M3 brief — four doors, five belts"),
  },
  placement: {
    railHeight: assumed(E90_RAIL_HEIGHT, "mm", `${CHOICE} — floorpan longeron centreline`),
    // Front-MID: the S65 sits entirely behind the front axle line, which is
    // the layout BMW M shouted about in period. The envelope hangs forward of
    // the station given, so 640 puts the block's face just behind the axle
    // and its mass against the bulkhead.
    engineSetback: assumed(640, "mm", `${CHOICE} — block station aft of the front axle; the envelope hangs forward of it, so the V8 fills the bay between the axle line and the pedal bulkhead`),
    engineHeight: assumed(190, "mm", `${CHOICE} — high enough that the gearbox behind the block rides in the tunnel instead of below the floor: at 90 the floor had to scoop up 97 mm over four stations to clear it, at 150 still 37. The real car answers the same question with a saddle tank and a deep tunnel this tool cannot yet draw`),
    radiatorAhead: assumed(380, "mm", `${CHOICE} — core ahead of the engine's front face, behind the kidney line`),
    radiatorHeight: assumed(225, "mm", `${CHOICE} — at 80 the core bottom sat 13 mm below the road and twelve stations had to refuse it`),
    tankAheadOfRearAxle: assumed(280, "mm", `${CHOICE} — the tank lies under the rear bench, AHEAD of the axle: the boot floor is luggage, not fuel`),
    tankHeight: assumed(260, "mm", `${CHOICE} — above the propshaft it straddles; at 160 the two boxes met, which on the real car is why the tank is saddle-shaped`),
    heelStation: assumed(1000, "mm", `${CHOICE} — driver heel aft of the front axle, in the footwell under the scuttle; at 1150 the head landed under the falling roof aft of the B-pillar`),
    heelHeight: assumed(200, "mm", `${CHOICE} — heel above the ground on the floorpan`),
    pedalBoxStation: assumed(780, "mm", `${CHOICE} — pedal box on the bulkhead the engine bay ends at`),
    pedalBoxHeight: assumed(180, "mm", CHOICE),
    rackStation: assumed(-60, "mm", `${CHOICE} — rack just ahead of the axle line`),
    rackHeight: assumed(-30, "mm", `${CHOICE} — rack below the rail centreline`),
  },
};
