/**
 * The cabin lens — does the body fit the person the packaging solve placed?
 *
 * Every cabin number this project has quoted so far was a station in a table
 * that somebody typed. `roof: 1232` is a height; it is not headroom. Headroom
 * is a distance between a body and a HEAD, and the head has been sitting in
 * the model the whole time — `@car/types/occupants` builds it from sourced
 * anthropometry (NCSU sitting height and eye height, SAE J4004's 25 degree
 * back angle, SAE J1100's H30 range) and the blind packer places it. Nothing
 * had ever asked the two to agree.
 *
 * HOW IT MEASURES. The arithmetic is in `@car/skin/section` — plane cuts
 * triangle, scan line cuts section — because a plane-triangle intersection is
 * not a design decision. What lives HERE is everything that is: how much
 * elbow room a person wants, how far below a beltline a tumblehome is read,
 * how far a relaxed occupant slumps. Every one of those is licensed and can
 * be argued with, which is the difference between a lens and a number.
 *
 * WHAT IT WILL NOT DO. It reports clearances; it never moves anything. And it
 * cannot see a seat, because there is no seat in the model — the H-point is
 * where a person's hip is, and the floor below it is the body's floor, not a
 * cushion. Every reading that involves the floor says so.
 *
 * Datum: the BODY frame — x aft from the nose, y lateral, z up from the road.
 * The occupant ports come out of the packaging frame (x from the front axle),
 * so the caller converts. Millimetres and degrees throughout.
 */

import type { Pt3 } from "@car/schema";
import { assumed } from "@car/demand";
import {
  evenStations, scanUp, sectionAt, sliceSection, type SectionMesh, type StationSection,
} from "@car/skin";

export type { SectionMesh, StationSection };

/** The person, in body coordinates. */
export interface CabinPerson {
  readonly heel: Pt3;
  /** The H-point. Every other reading is relative to it. */
  readonly hip: Pt3;
  readonly eye: Pt3;
  /** Vertex of the head, erect. */
  readonly head: Pt3;
  /** Seated shoulder half-breadth, per side. */
  readonly shoulderHalfBreadth: number;
  /** Acromial height above the H-point, along the torso. */
  readonly shoulderAboveHip: number;
}

export interface CabinReport {
  readonly person: CabinPerson;
  /**
   * How far the head vertex stands above the body beside it.
   *
   * The sign means OPPOSITE things on the two kinds of car, which is why
   * `roofed` exists and why this number must never be read without it. On an
   * open car positive is a head in the wind, which is the point of the car;
   * on a closed one positive is a head through the roof.
   */
  readonly headAboveBody: number;
  /**
   * Does the body close over the occupant at the head's station?
   *
   * True when there is meaningfully more body above the beltline than the
   * beltline itself. Two cars in, every reading this lens published about a
   * head was "+464 mm, in the open air, which a roadster means", because both
   * of them were open and nothing had ever needed to tell the difference. A
   * coupe was the first body that could be wrong about it — and the first
   * version of this lens called a head 358 mm through an E-Type's roof a
   * head in the open air, and raised nothing.
   */
  readonly roofed: boolean;
  /**
   * Air between the head vertex and the roof over it, mm. Null on an open car,
   * where the answer is the sky.
   */
  readonly headroom: number | null;
  /** Eye above the beltline at the eye's own station. */
  readonly eyeAboveBelt: number;
  /** Eye above the screen header, if there is one. Negative = looking through. */
  readonly eyeAboveHeader: number | null;
  /** The same, for a relaxed occupant. This is the one the fault is raised on. */
  readonly eyeAboveHeaderRelaxed: number | null;
  /** H-point above the cockpit floor below it — seat cushion NOT included. */
  readonly hipAboveWell: number | null;
  /** Interior width at shoulder height, at the H-point's station. */
  readonly shoulderRoom: number | null;
  /**
   * The height that reading was actually taken at.
   *
   * On an open car the shoulders are ABOVE the beltline — that is what a
   * roadster is — so asking for the cockpit's width at shoulder height asks
   * about thin air and gets null. The reading drops to just under the belt
   * and says so, because "no cockpit at the H-point" and "your shoulders are
   * in the wind" are opposite findings and the first one is alarming.
   */
  readonly shoulderRoomAtZ: number;
  /** What the shoulders need: the breadths plus the elbow gap. */
  readonly shoulderRoomNeeded: number;
  /** Interior width at the H-point's own height. */
  readonly hipRoom: number | null;
  /** Beltline above the H-point — a roadster wants roughly an elbow. */
  readonly beltAboveHip: number;
  /** Where the cockpit opening starts and ends, by the first and last station
   *  whose section has an interior at all. Null if there is no cockpit. */
  readonly aperture: { readonly fore: number; readonly aft: number } | null;
  readonly sections: readonly StationSection[];
  /** Every reading that failed its own test, in words. Empty is the good case. */
  readonly faults: readonly string[];
}

export interface CabinOptions {
  /** Stations to section at. Defaults to 40 evenly across the body. */
  readonly stations?: readonly number[];
  /** Elbow-to-elbow slack wanted on top of the shoulder breadths. */
  readonly elbowGap?: number;
  /** How many people sit abreast. The lens is handed ONE person and must not
   *  guess how many of them there are. Default 1. */
  readonly seatsAbreast?: number;
  /** Top of the screen header, if the car has one. */
  readonly headerTopZ?: number;
  /** How far below the beltline to read the tumblehome. */
  readonly tumblehomeDropMm?: number;
  /**
   * How far a relaxed occupant's eye sits below the erect one.
   *
   * The anthropometry is erect by construction — a sitting eye height is
   * measured with the subject sat up straight — and nobody drives like that.
   * `@car/types/occupants` already carries the figure and its source (FAA
   * HFDS ch.14: relaxed sitting loses up to 65 mm) and then does not use it.
   * A screen header is exactly the place it decides an answer, so the erect
   * reading is reported and the RELAXED one is what raises a fault. Default
   * 0, which is the conservative reading.
   */
  readonly eyeSlumpMm?: number;
}

/**
 * Elbow-to-elbow slack over the shoulder breadths.
 *
 * ASSUMED. Two people at their bideltoid breadth touch; nobody drives like
 * that. No standard was consulted for how much room they want between them,
 * so the number sits here to be argued with rather than buried inside a
 * comparison.
 */
const DEFAULT_ELBOW_GAP = assumed(
  120, "mm",
  "elbow-to-elbow slack between two seated occupants — no source consulted; 120 mm ASSUMED",
);

/**
 * How far below the beltline the tumblehome is read.
 *
 * ASSUMED, and it matters: read too close and the answer is the fillet at the
 * top of the panel, read too far and it is the widest point of the section.
 * 60 mm is a body side's upper third on a car this size.
 */
const DEFAULT_TUMBLEHOME_DROP = assumed(
  60, "mm",
  "distance below the beltline at which a body side's lean is read — no convention found; 60 mm ASSUMED",
);

/** How far under the beltline an open car's cockpit width is read. */
const BELT_MARGIN = assumed(
  20, "mm",
  "how far below the beltline an open car's cockpit width is read, so the scan runs inside the walls rather than along their lip — 20 mm ASSUMED",
);

/**
 * How far above the occupant's own SHOULDER bodywork must reach to be a roof.
 *
 * ASSUMED, and the second attempt. The first compared the section's top to
 * its beltline, which works on an open car and fails on a closed one for a
 * reason worth writing down: `beltZ` is read off the outer QUARTER of the
 * half-width, and a coupe with real tumblehome has climbed a long way into
 * its side glass by the time it is a quarter of the way in. An E-Type's
 * beltline came back at 1044 mm against a true beltline near 958, the gap to
 * the roof read as 87 mm rather than 173, and a head 206 mm through the roof
 * was reported as a head in the open air.
 *
 * A person is a better datum than a body feature. There is a roof over an
 * occupant when there is bodywork in the occupant's OWN COLUMN above the
 * occupant's own shoulder — which is exactly what a roof is, needs no
 * threshold on a body dimension, and gives the right answer on a roadster
 * whose shoulders are in the wind by construction.
 */
const ROOF_MARGIN = assumed(
  0, "mm",
  "how far above a seated occupant's shoulder bodywork must reach in their own column before it is a roof — the shoulder itself is the datum, so no margin; 0 mm ASSUMED",
);

/** The whole reading: the body against the person the packer placed. */
export function cabinLens(
  mesh: SectionMesh,
  person: CabinPerson,
  opts: CabinOptions = {},
): CabinReport {
  const elbowGap = opts.elbowGap ?? DEFAULT_ELBOW_GAP.value;
  const drop = { tumblehomeDropMm: opts.tumblehomeDropMm ?? DEFAULT_TUMBLEHOME_DROP.value };
  // How finely to look is arithmetic, so it lives next door: see evenStations.
  const stations = opts.stations ?? evenStations(mesh);

  const shoulderZ = person.hip[2] + person.shoulderAboveHip;
  // Where the body still surrounds the person. A closed car reads at the
  // shoulder; an open one reads a little under its own beltline, which is the
  // highest the cockpit walls go.
  const atHipRaw = sectionAt(mesh, person.hip[0], shoulderZ, drop);
  const shoulderRoomAtZ = shoulderZ <= atHipRaw.top - 1
    ? shoulderZ
    : Math.max(person.hip[2], atHipRaw.beltZ - BELT_MARGIN.value);
  const sections = stations.map((x) => sectionAt(mesh, x, shoulderRoomAtZ, drop));

  const nearest = (x: number): StationSection =>
    sections.reduce((best, s) => (Math.abs(s.x - x) < Math.abs(best.x - x) ? s : best), sections[0]!);

  const atHead = nearest(person.head[0]);
  // Is anything above the occupant's shoulder, in the occupant's own column,
  // at the head's own station? That is the whole test, and several readings
  // below branch on it, so it is settled first.
  const overhead = scanUp(sliceSection(mesh, atHead.x), person.hip[1]);
  const roofed = overhead.some((z) => z > shoulderZ + ROOF_MARGIN.value);
  const atEye = nearest(person.eye[0]);
  const atHip = sectionAt(mesh, person.hip[0], shoulderRoomAtZ, drop);
  const hipOwn = sectionAt(mesh, person.hip[0], person.hip[2], drop);

  const headAboveBody = person.head[2] - atHead.top;
  const headroom = roofed ? -headAboveBody : null;
  const eyeAboveBelt = person.eye[2] - atEye.beltZ;
  const eyeAboveHeader = opts.headerTopZ === undefined ? null : person.eye[2] - opts.headerTopZ;
  const eyeAboveHeaderRelaxed = opts.headerTopZ === undefined
    ? null
    : person.eye[2] - (opts.eyeSlumpMm ?? 0) - opts.headerTopZ;
  // A ROOFED body has no well. `wellFloor` scans up for the first height with
  // an interior and on a closed car the first thing it finds is a wheelhouse
  // or a tunnel void — which is how an E-Type reported its H-point 30 mm
  // below a cockpit floor it does not have. Same limit as `shoulderRoom`, so
  // the same guard: unreadable, and said so, rather than a number.
  const hipAboveWell = roofed || atHip.wellFloor === null
    ? null
    : person.hip[2] - atHip.wellFloor;
  const shoulderRoom = atHip.interiorHalfWidth === null ? null : atHip.interiorHalfWidth * 2;
  const hipRoom = hipOwn.interiorHalfWidth === null ? null : hipOwn.interiorHalfWidth * 2;
  const seats = opts.seatsAbreast ?? 1;
  const shoulderRoomNeeded = seats * (2 * person.shoulderHalfBreadth) + elbowGap;
  const beltAboveHip = atHip.beltZ - person.hip[2];

  const open = sections.filter((s) => s.interiorHalfWidth !== null && s.interiorHalfWidth > 0);
  const aperture = open.length === 0
    ? null
    : { fore: open[0]!.x, aft: open[open.length - 1]!.x };

  const faults: string[] = [];
  // The same number, read two ways, and which way depends on the body. On a
  // closed car the head must be UNDER the roof and the margin is headroom; on
  // an open one it must be ABOVE the body and anything else is bodywork
  // closing over a cockpit.
  if (roofed && headAboveBody > 0) {
    faults.push(`the head is ${headAboveBody.toFixed(0)} mm THROUGH the roof — the body closes over the occupant at this station and its top is ${atHead.top.toFixed(0)}`);
  } else if (!roofed && headAboveBody < 0) {
    faults.push(`head is ${(-headAboveBody).toFixed(0)} mm INSIDE the body — there is no roof here, so this is the body closing over an open cockpit`);
  }
  // On a ROOFED body a solid section is the normal case and not a finding: a
  // cabin is a void, the mesher hands back a solid, and no closed car in this
  // tool has an interior to scan. Saying "the person is inside the bodywork"
  // there is true of every coupe ever modelled here and tells nobody anything.
  if (shoulderRoom === null && !roofed) {
    faults.push(`no cockpit at the H-point station x = ${person.hip[0].toFixed(0)}, read at z = ${shoulderRoomAtZ.toFixed(0)} — the section is solid there, so the person is inside the bodywork`);
  } else if (shoulderRoom !== null && shoulderRoom < shoulderRoomNeeded) {
    faults.push(`shoulder room ${shoulderRoom.toFixed(0)} mm against ${shoulderRoomNeeded.toFixed(0)} needed for ${seats} seated shoulder${seats === 1 ? "" : "s"} plus ${elbowGap} mm of elbow`);
  }
  if (hipAboveWell !== null && hipAboveWell < 0) {
    faults.push(`the H-point is ${(-hipAboveWell).toFixed(0)} mm BELOW the cockpit floor`);
  }
  if (eyeAboveHeaderRelaxed !== null && eyeAboveHeaderRelaxed > 0) {
    faults.push(`the eye is ${eyeAboveHeaderRelaxed.toFixed(0)} mm above the screen header even relaxed — the driver looks over the glass, not through it`);
  }
  // Only when there IS an aperture to sit aft of. A closed body reports a
  // degenerate one — a single station wide, wherever the section machinery
  // last saw four crossings — and faulting an occupant for being behind it
  // said nothing except that the car has a roof.
  const apertureLength = aperture === null ? 0 : aperture.aft - aperture.fore;
  if (aperture !== null && apertureLength > 1 && person.hip[0] > aperture.aft) {
    faults.push(`the H-point at x = ${person.hip[0].toFixed(0)} sits aft of the cockpit opening, which ends at ${aperture.aft.toFixed(0)}`);
  }

  return {
    person, headAboveBody, roofed, headroom, eyeAboveBelt, eyeAboveHeader, eyeAboveHeaderRelaxed,
    hipAboveWell, shoulderRoom, shoulderRoomAtZ, shoulderRoomNeeded, hipRoom,
    beltAboveHip, aperture, sections, faults,
  };
}
