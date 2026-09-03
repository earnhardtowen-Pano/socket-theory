/**
 * Regulatory demand set — the law as principal (charge §6).
 *
 * One entry per regulated demand, each a pure SOURCED record with a citation:
 * bumper beam height band; headlamp and tail lamp height bands; mirror and
 * pillar vision fields; wiper wipe-zone coverage over the vision areas; plate
 * provisions front and rear plus the rear-plate height band; and the
 * pedestrian hood clearance — the air gap that couples installed engine
 * height to the hood line.
 *
 * Every value below was searched and retrieved during this run (2026-08-23);
 * each citation names the regulation and the verification trail. The one
 * number no regulation publishes as a length (the pedestrian gap — the law
 * binds HIC, a performance number) is SOURCED from named engineering
 * literature and says so. The only ASSUMED quantities in this file are the
 * plate-provision depths — a modeling depth no regulation states — and each
 * carries a loud note.
 *
 * Semantics of the shapes:
 *   - "band" entries are world Z bands (ground at Z = 0, Z up, mm): the named
 *     hardware must live inside [zMin, zMax].
 *   - vision-field entries carry their regulated scalar as `magnitude`
 *     (an angle or a lateral extent) and NO shape: the regulated corridors
 *     run to the horizon, and a finite box would fabricate an extent the law
 *     does not state. The full regulated geometry is in the reason and
 *     citation; the vision lens consumes it from the eye points downstream.
 *   - plate provisions are envelope boxes [depth, width, height] the body
 *     must reserve, unpositioned until mated (X aft, Y across, Z up).
 *
 * These records are world demands (SolveInput.worldDemands) — they are not
 * parts, carry no mass, and bear no mass (no massBearing anywhere here).
 */

import type { BandShape, BoxShape, DemandRecord, IdAllocator } from "@car/schema";
import { assumed, demand, sourced } from "@car/demand";

const RETRIEVED = "retrieved via web search 2026-08-23";

// ---------------------------------------------------------------------------
// Bumper beam height band — 49 CFR Part 581
// ---------------------------------------------------------------------------

const CFR581_SOURCE =
  "49 CFR Part 581 — Bumper Standard (NHTSA), §581.5 impact test heights";
const CFR581_CITE =
  "49 CFR §581.5: the pendulum-type test device contacts the bumper between 16 and 20 inches above " +
  "ground (impact lines at 16 in and 20 in device heights, 1.5/2.5 mph tests); 16 in × 25.4 = 406.4 mm " +
  "and 20 in × 25.4 = 508.0 mm, conversions exact. Verified against eCFR Part 581 and NHTSA report " +
  "DOT HS 812 942 'Vehicle Bumper Performance in Part 581' — " + RETRIEVED + ".";

/** The bumper beam must span the federal low-speed impact zone. */
export function bumperBeamHeightBand(alloc: IdAllocator): DemandRecord {
  const shape: BandShape = {
    kind: "band",
    zMin: sourced(406.4, "mm", CFR581_SOURCE, CFR581_CITE),
    zMax: sourced(508, "mm", CFR581_SOURCE, CFR581_CITE),
  };
  return demand({
    id: alloc.next("demand"),
    principal: "law",
    reason:
      "low-speed impact protection (49 CFR 581): bumpers must present a face in a common height zone " +
      "so car-to-car impacts engage beam-to-beam and damage stays limited — the beam lives inside the band",
    kind: "band",
    shape,
  });
}

// ---------------------------------------------------------------------------
// Lamp height bands — FMVSS 108 (49 CFR 571.108), Table I-a
// ---------------------------------------------------------------------------

const FMVSS108_SOURCE =
  "FMVSS No. 108 — Lamps, Reflective Devices, and Associated Equipment (49 CFR 571.108), Table I-a";
const FMVSS108_HEADLAMP_CITE =
  "FMVSS 108 Table I-a (required lamps, passenger cars/MPVs): lower beam headlamps mounted at a height " +
  "not less than 22 inches (55.9 cm) nor more than 54 inches (137.2 cm) above the road surface; " +
  "22 in × 25.4 = 558.8 mm, 54 in × 25.4 = 1371.6 mm, conversions exact. Verified via eCFR 49 CFR " +
  "571.108 search results and the Hawaii Admin. Rules exhibit reproducing FMVSS 108 Tables Ia–Ic — " +
  RETRIEVED + ".";
const FMVSS108_TAILLAMP_CITE =
  "FMVSS 108 Table I-a: taillamps mounted on the rear, symmetric about the vertical centerline, at a " +
  "height not less than 15 inches nor more than 72 inches above the road surface; 15 in × 25.4 = 381.0 mm, " +
  "72 in × 25.4 = 1828.8 mm, conversions exact. Verified via eCFR 49 CFR 571.108 search results and the " +
  "Hawaii Admin. Rules exhibit reproducing FMVSS 108 Tables Ia–Ic — " + RETRIEVED + ".";

/** Lower-beam headlamps must sit in the federal mounting-height band. */
export function headlampHeightBand(alloc: IdAllocator): DemandRecord {
  const shape: BandShape = {
    kind: "band",
    zMin: sourced(558.8, "mm", FMVSS108_SOURCE, FMVSS108_HEADLAMP_CITE),
    zMax: sourced(1371.6, "mm", FMVSS108_SOURCE, FMVSS108_HEADLAMP_CITE),
  };
  return demand({
    id: alloc.next("demand"),
    principal: "law",
    reason:
      "night vision and glare control (FMVSS 108): lower-beam headlamps must sit where they light the " +
      "road ahead without blinding oncoming drivers — lamp centers live inside the band",
    kind: "band",
    shape,
  });
}

/** Tail lamps must sit in the federal mounting-height band. */
export function tailLampHeightBand(alloc: IdAllocator): DemandRecord {
  const shape: BandShape = {
    kind: "band",
    zMin: sourced(381, "mm", FMVSS108_SOURCE, FMVSS108_TAILLAMP_CITE),
    zMax: sourced(1828.8, "mm", FMVSS108_SOURCE, FMVSS108_TAILLAMP_CITE),
  };
  return demand({
    id: alloc.next("demand"),
    principal: "law",
    reason:
      "rear conspicuity (FMVSS 108): tail lamps must sit where following drivers expect and can see " +
      "them, marking the vehicle's rear extent at night — lamp centers live inside the band",
    kind: "band",
    shape,
  });
}

// ---------------------------------------------------------------------------
// Mirror and pillar vision fields — FMVSS 111, UN R125
// ---------------------------------------------------------------------------

const FMVSS111_SOURCE =
  "FMVSS No. 111 — Rear Visibility (49 CFR 571.111), passenger-car mirror field-of-view requirements";
const FMVSS111_INSIDE_CITE =
  "FMVSS 111 (passenger cars): the inside mirror shall provide a field of view with an included " +
  "horizontal angle measured from the projected eye point of at least 20 degrees, and sufficient " +
  "vertical angle to see a level road surface extending to the horizon beginning at a point not " +
  "greater than 61 m to the rear (vehicle occupied by driver + four passengers at 68 kg each). " +
  "Verified via eCFR 49 CFR 571.111 search results and NHTSA TP-111V-01 — " + RETRIEVED + ".";
const FMVSS111_DRIVER_CITE =
  "FMVSS 111 (passenger cars): the driver's-side outside mirror (unit magnification) shall provide a " +
  "view of a level road surface extending to the horizon from a line perpendicular to a longitudinal " +
  "plane tangent to the driver's side at the widest point, extending 2.4 m out from the tangent plane, " +
  "10.7 m behind the driver's eyes, seat rearmost. 2.4 m = 2400 mm. Verified via eCFR 49 CFR 571.111 " +
  "search results and NHTSA TP-111V-01 — " + RETRIEVED + ".";
const R125_SOURCE =
  "UN Regulation No. 125 — Forward Field of Vision of the Motor Vehicle Driver (M1 vehicles)";
const R125_CITE =
  "UN R125: the angle of binocular obstruction of each A-pillar shall not exceed 6 degrees, measured " +
  "from the V points; R125 also requires the 180-degree forward direct field below the horizontal " +
  "V-plane (bounded by planes declined 4 degrees) to be free of obstruction other than the permitted " +
  "items. Verified via UNECE WP.29 GRSG working documents (ECE-TRANS-WP.29-GRSG-2021-12/13) and the " +
  "interregs.com summary of Regulation 125-00 — " + RETRIEVED + ".";

/**
 * Inside mirror rear vision corridor. Magnitude is the regulated included
 * horizontal angle; the corridor (level road from ≤ 61 m aft to the horizon)
 * runs unbounded, so no finite shape is published — the reason carries it.
 */
export function insideMirrorFieldDemand(alloc: IdAllocator): DemandRecord {
  return demand({
    id: alloc.next("demand"),
    principal: "law",
    reason:
      "rear vision (FMVSS 111): the driver must see the road behind through the inside mirror — a " +
      "20-degree included horizontal corridor from the eye point, seeing level road from at most 61 m " +
      "aft out to the horizon; glazing, head restraints and body structure must keep it clear",
    kind: "envelope",
    magnitude: sourced(20, "deg", FMVSS111_SOURCE, FMVSS111_INSIDE_CITE),
  });
}

/**
 * Driver's outside mirror field. Magnitude is the regulated lateral extent of
 * the level-road view (2400 mm out from the tangent plane, from 10.7 m behind
 * the driver's eyes to the horizon); corridor unbounded, so no finite shape.
 */
export function driverMirrorFieldDemand(alloc: IdAllocator): DemandRecord {
  return demand({
    id: alloc.next("demand"),
    principal: "law",
    reason:
      "lane-change safety (FMVSS 111): the driver's outside mirror must show the adjacent lane — level " +
      "road out to 2.4 m from the body-side tangent plane, from 10.7 m behind the driver's eyes to the " +
      "horizon, at unit magnification — so the mirror head and its sight line must clear the A-pillar and glazing",
    kind: "envelope",
    magnitude: sourced(2400, "mm", FMVSS111_SOURCE, FMVSS111_DRIVER_CITE),
  });
}

/**
 * A-pillar obstruction cap. Magnitude is the regulated maximum binocular
 * obstruction angle per pillar; angular, so no box shape exists honestly.
 */
export function pillarVisionDemand(alloc: IdAllocator): DemandRecord {
  return demand({
    id: alloc.next("demand"),
    principal: "law",
    reason:
      "forward vision (UN R125): the A-pillar may not blind the driver — each pillar's binocular " +
      "obstruction angle from the V points is capped at 6 degrees, which bounds pillar section width " +
      "at its distance from the eye; the 180-degree forward field below the V-plane stays clear",
    kind: "clearance",
    magnitude: sourced(6, "deg", R125_SOURCE, R125_CITE),
  });
}

// ---------------------------------------------------------------------------
// Wiper wipe zones over the vision areas — Commission Regulation (EU) 1008/2010
// ---------------------------------------------------------------------------

const EU1008_SOURCE =
  "Commission Regulation (EU) No 1008/2010, Annex III — windscreen wiper and washer system " +
  "type-approval (implementing (EC) No 661/2009)";
const EU1008_CITE_A =
  "EU 1008/2010 Annex III: 'The windscreen wiper field shall cover at least 98% of vision area A', " +
  "vision areas determined per Annex 18 to UNECE Regulation No 43 from the primary reference marks. " +
  "Verified via EUR-Lex CELEX:32010R1008 and legislation.gov.uk — " + RETRIEVED + ". US FMVSS 104 " +
  "(49 CFR 571.104 S4.1.2) imposes the same mechanism — minimum wiped percentages of areas A/B/C per " +
  "SAE J903a and width-dependent tables — but the exact US percentages were not retrievable this run.";
const EU1008_CITE_B =
  "EU 1008/2010 Annex III: 'The windscreen wiper field shall cover at least 80% of vision area B', " +
  "vision areas determined per Annex 18 to UNECE Regulation No 43 from the primary reference marks. " +
  "Verified via EUR-Lex CELEX:32010R1008 and legislation.gov.uk — " + RETRIEVED + ".";

/** The wiper must clear at least the sourced fraction of vision area A. */
export function wiperWipeZoneAreaA(alloc: IdAllocator): DemandRecord {
  return demand({
    id: alloc.next("demand"),
    principal: "law",
    reason:
      "wet-weather forward vision (EU 1008/2010): the wiper field must cover at least 98% of vision " +
      "area A — the primary sight area on the windshield derived downstream from the driver's eye " +
      "points (UNECE R43 Annex 18) — so the driver keeps the road view in rain",
    kind: "envelope",
    magnitude: sourced(0.98, "ratio", EU1008_SOURCE, EU1008_CITE_A),
  });
}

/** The wiper must clear at least the sourced fraction of vision area B. */
export function wiperWipeZoneAreaB(alloc: IdAllocator): DemandRecord {
  return demand({
    id: alloc.next("demand"),
    principal: "law",
    reason:
      "wet-weather forward vision (EU 1008/2010): the wiper field must cover at least 80% of the wider " +
      "vision area B derived from the eye points (UNECE R43 Annex 18), keeping peripheral road view usable in rain",
    kind: "envelope",
    magnitude: sourced(0.8, "ratio", EU1008_SOURCE, EU1008_CITE_B),
  });
}

// ---------------------------------------------------------------------------
// Plate provisions — AAMVA North American plate; EU 1003/2010 rear space
// ---------------------------------------------------------------------------

const AAMVA_SOURCE =
  "North American standard registration plate, 6 in × 12 in — standardized 1956 by AAMVA with the " +
  "Automobile Manufacturers Association and the US federal government";
const AAMVA_CITE =
  "Standard passenger plate 6 in × 12 in = 152.4 mm × 304.8 mm (conversions exact), the uniform size " +
  "across the US, Canada and Mexico since the 1956 AAMVA/AMA/federal agreement; confirmed across " +
  "public plate-dimension references (infotracer.com, lookupaplate.com US license-plate size guides) — " +
  RETRIEVED + ".";
const EU1003_SOURCE =
  "Commission Regulation (EU) No 1003/2010, Annex II — space for mounting and fixing of rear " +
  "registration plates (implementing (EC) No 661/2009)";
const EU1003_CITE_BAND =
  "EU 1003/2010: the height of the lower edge of the plate above the ground shall be not less than " +
  "0.30 m (300 mm); the height of the upper edge shall not exceed 1.20 m (1200 mm) — constructional " +
  "exception up to 2.00 m where 1.20 m is impracticable, staying as close to 1.20 m as the vehicle " +
  "allows. Verified via EUR-Lex CELEX:32010R1003 and legislation.gov.uk — " + RETRIEVED + ".";

function plateDepthAssumption() {
  return assumed(
    25,
    "mm",
    "ASSUMED: nominal depth reserved for plate + frame + mounting bosses proud of the body face — " +
      "modeling choice; no regulation states a provision depth (searched this run, not found)",
  );
}

/**
 * Front plate provision: a flat envelope the nose must reserve. Sized to the
 * North American standard plate; front display is mandated by many US states.
 */
export function frontPlateProvision(alloc: IdAllocator): DemandRecord {
  const shape: BoxShape = {
    kind: "box",
    size: [
      plateDepthAssumption(),
      sourced(304.8, "mm", AAMVA_SOURCE, AAMVA_CITE),
      sourced(152.4, "mm", AAMVA_SOURCE, AAMVA_CITE),
    ],
  };
  return demand({
    id: alloc.next("demand"),
    principal: "law",
    reason:
      "registration display (state vehicle codes; AAMVA standard plate): many US states mandate a " +
      "front plate, so the nose must reserve a flat 304.8 × 152.4 mm provision that does not block " +
      "cooling inlets or sensors",
    kind: "envelope",
    shape,
  });
}

/**
 * Rear plate provision: a flat envelope the tail must reserve. Sized to the
 * North American standard plate; the EU-market space (520 × 120 mm or
 * 340 × 240 mm per EU 1003/2010) is the named alternative in the citation.
 */
export function rearPlateProvision(alloc: IdAllocator): DemandRecord {
  const shape: BoxShape = {
    kind: "box",
    size: [
      plateDepthAssumption(),
      sourced(
        304.8,
        "mm",
        AAMVA_SOURCE,
        AAMVA_CITE +
          " EU-market alternative: EU 1003/2010 requires a rear space suiting a 520 × 120 mm or " +
          "340 × 240 mm plate — a world-market tail reserves the union.",
      ),
      sourced(152.4, "mm", AAMVA_SOURCE, AAMVA_CITE),
    ],
  };
  return demand({
    id: alloc.next("demand"),
    principal: "law",
    reason:
      "registration display (every US state and EU 1003/2010): the tail must reserve a flat, " +
      "illuminated, unobstructed 304.8 × 152.4 mm plate provision (EU variant space cited) readable " +
      "by people and cameras",
    kind: "envelope",
    shape,
  });
}

/** The rear plate space must sit inside the regulated height band. */
export function rearPlateHeightBand(alloc: IdAllocator): DemandRecord {
  const shape: BandShape = {
    kind: "band",
    zMin: sourced(300, "mm", EU1003_SOURCE, EU1003_CITE_BAND),
    zMax: sourced(1200, "mm", EU1003_SOURCE, EU1003_CITE_BAND),
  };
  return demand({
    id: alloc.next("demand"),
    principal: "law",
    reason:
      "plate legibility (EU 1003/2010): the rear plate must be readable from behind by people and " +
      "enforcement cameras — its space sits with lower edge at or above 300 mm and upper edge at or " +
      "below 1200 mm from the ground",
    kind: "band",
    shape,
  });
}

// ---------------------------------------------------------------------------
// Pedestrian hood clearance — the air gap coupling engine height to hood line
// ---------------------------------------------------------------------------

const PED_SOURCE =
  "EEVC-based pedestrian head-impact engineering literature: minimum underhood crush clearance for " +
  "HIC compliance";
const PED_CITE =
  "'An underhood clearance of 70 mm can guarantee the minimum HIC value under 800' — Friction Effects " +
  "in Pedestrian Headform Impacts with Engine Hoods (ScienceDirect, pii S1007021409701282), EEVC test " +
  "basis; deployable-hood patent literature cites a required gap 'of more than about 75 mm'; hood " +
  "design research shows HIC falling from ~5000 to ~500 as underhood distance grows from 20 to 100 mm " +
  "(NHTSA/ROSAP DOT-48700 active-hood assessment context). The binding regulations — UN R127 / GTR " +
  "No. 9 and NHTSA's proposed FMVSS pedestrian head protection rule — set HIC performance limits, not " +
  "a millimeter gap; 70 mm is the published engineering translation. " + RETRIEVED + ".";

/**
 * Pedestrian hood clearance: required air between the hood inner surface and
 * the highest engine hard points, so a struck head decelerates within HIC
 * limits. This is THE coupling from installed engine height to hood line.
 */
export function pedestrianHoodClearance(alloc: IdAllocator): DemandRecord {
  return demand({
    id: alloc.next("demand"),
    principal: "law",
    reason:
      "pedestrian head protection (UN R127 / GTR 9, HIC performance limits): the hood skin needs crush " +
      "space above engine hard points so a struck head decelerates over distance — this air gap couples " +
      "installed engine height to the hood line; the engine's heat/service envelope top face is the " +
      "surface it measures from",
    kind: "clearance",
    magnitude: sourced(70, "mm", PED_SOURCE, PED_CITE),
  });
}

// ---------------------------------------------------------------------------
// The whole set
// ---------------------------------------------------------------------------

/**
 * Every regulatory entry, in stable statute order (charge §6). These are
 * world demands: hand them to SolveInput.worldDemands and to the ledger.
 */
export function allRegulatory(alloc: IdAllocator): DemandRecord[] {
  return [
    bumperBeamHeightBand(alloc),
    headlampHeightBand(alloc),
    tailLampHeightBand(alloc),
    insideMirrorFieldDemand(alloc),
    driverMirrorFieldDemand(alloc),
    pillarVisionDemand(alloc),
    wiperWipeZoneAreaA(alloc),
    wiperWipeZoneAreaB(alloc),
    frontPlateProvision(alloc),
    rearPlateProvision(alloc),
    rearPlateHeightBand(alloc),
    pedestrianHoodClearance(alloc),
  ];
}
