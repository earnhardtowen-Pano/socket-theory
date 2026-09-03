/**
 * makeOccupantArray — rows of people as demands (type library, charge §5).
 *
 * Per row: heel point (authored), hip point (H30 above the heel — SAE J1100's
 * chair height, its Class-A validity range SOURCED), eye and head points from
 * anthropometric offsets rotated by the design seat-back angle (SAE J4004's
 * 25° recommendation, SOURCED). Anthropometry is SOURCED from the NCSU
 * Ergonomics Center summary tables and the FSAE anthropometric reference;
 * offsets with no findable source are ASSUMED loudly.
 *
 * Publishes: head clearance per row; reach sphere demands from the driver to
 * wheel and pedals (person principal — DemandShape has no sphere, so each is
 * encoded as the sphere's bounding cube with the radius in `magnitude` and the
 * sphere semantics stated in the reason); entry aperture per row per side
 * (aperture kind, against the sill — its reason names the substrate's rocker
 * trade); seat and belt anchor demands, massBearing, law principal (FMVSS 207
 * seating systems; FMVSS 210 seat belt assembly anchorages — both found and
 * cited).
 *
 * Datum: part origin — row heel points are authored in part space by the
 * caller. +X aft, +Y left (LHD driver at +Y), +Z up. Units mm, kg, deg.
 */

import type {
  BoxShape,
  DemandRecord,
  IdAllocator,
  PartInstance,
  PortRecord,
  Pt3,
  Quantity,
} from "@car/schema";
import { assumed, demand, derived, port, qAdd, qMul, sourced } from "@car/demand";
import { DEG, ncos, nmax, nmin, nsin } from "@car/num";

// ---------------------------------------------------------------------------
// SOURCED anthropometry and packaging references (all retrieved 2026-08-22)
// ---------------------------------------------------------------------------

/** SAE J1100 Class-A H30 (chair height) validity range — lower bound. */
export function h30ClassAMin(): Quantity<"mm"> {
  return sourced(
    127,
    "mm",
    "SAE J1100 Class-A vehicles: H30 range lower bound",
    "SAE J1100 (2001) 'Motor Vehicle Dimensions' (law.resource.org copy): H30 — SgRP to heel, vertical — Class A range 127–405 mm. Retrieved 2026-08-22.",
  );
}

/** SAE J1100 Class-A H30 validity range — upper bound. */
export function h30ClassAMax(): Quantity<"mm"> {
  return sourced(
    405,
    "mm",
    "SAE J1100 Class-A vehicles: H30 range upper bound",
    "SAE J1100 (2001) 'Motor Vehicle Dimensions' (law.resource.org copy): H30 — SgRP to heel, vertical — Class A range 127–405 mm. Retrieved 2026-08-22.",
  );
}

const NCSU_CITE =
  "NC State University Ergonomics Center, 'Anthropometric Summary Data Tables' (2017), retrieved via search excerpts 2026-08-22";

function sittingHeight95M(): Quantity<"mm"> {
  return sourced(
    976.9,
    "mm",
    "Sitting height (erect, seat surface to vertex), 95th-percentile male",
    `${NCSU_CITE}: 38.46 in = 976.9 mm.`,
  );
}

function sittingEyeHeight95M(): Quantity<"mm"> {
  return sourced(
    860.0,
    "mm",
    "Sitting eye height (erect, seat surface to eye), 95th-percentile male",
    `${NCSU_CITE}: 33.86 in = 860.0 mm.`,
  );
}

export function hipBreadth95F(): Quantity<"mm"> {
  return sourced(
    400.1,
    "mm",
    "Hip breadth seated, 95th-percentile female (wider than the male 95th: 15.24 in = 387 mm)",
    `${NCSU_CITE}: 15.75 in = 400.1 mm.`,
  );
}

/**
 * Bideltoid (shoulder) breadth, seated, 95th-percentile male.
 *
 * ASSUMED, loudly: the NCSU tables this module cites for sitting height and
 * eye height were not consulted for this dimension in the run that added it,
 * and a number from memory with a citation attached would be worse than a
 * number with none. It is the dimension that decides whether two people fit
 * abreast, so a cabin lens that used the SOURCED HIP breadth instead — 400 mm,
 * narrower — would flatter every cabin it measured.
 */
export function shoulderBreadth95M(): Quantity<"mm"> {
  return assumed(
    505,
    "mm",
    "bideltoid (shoulder) breadth seated, 95th-percentile male — no source consulted this run; 505 mm ASSUMED",
  );
}

/** Acromion above the H-point along the torso line. ASSUMED — see the body. */
export function shoulderAboveHip95M(): Quantity<"mm"> {
  return assumed(
    590,
    "mm",
    "seated acromial (shoulder) height above the H-point along the torso line — no citable source found; 590 mm ASSUMED between hip (0) and eye (860 sourced)",
  );
}

function functionalReach5F(): Quantity<"mm"> {
  return sourced(
    677,
    "mm",
    "Functional reach, shoulder blade to thumb tip, 5th-percentile female",
    "Formula SAE Anthropometric Reference Data, 5th percentile female & 95th percentile male (fsaeonline.com, 2016): 26.7 in = 677 mm. Retrieved 2026-08-22.",
  );
}

function designBackAngle(): Quantity<"deg"> {
  return sourced(
    25,
    "deg",
    "Design torso (seat back) angle from vertical",
    "SAE J4004 'Positioning the H-Point Design Tool' recommends a 25° design back angle (engineeringcheatsheet.com summary); " +
      "also the FMVSS 202a measurement attitude. Retrieved 2026-08-22.",
  );
}

function headClearanceMin(): Quantity<"mm"> {
  return sourced(
    50.8,
    "mm",
    "Head-to-headliner comfort clearance, lower bound of the 2–3 in recommendation",
    "hatchback101.com 'Headroom in Cars: Meaning, Calculation & More': aim for at least 2–3 in between head and roof; 2 in = 50.8 mm taken. Retrieved 2026-08-22.",
  );
}

function occupantMass(): Quantity<"kg"> {
  return sourced(
    68,
    "kg",
    "Standard occupant mass",
    "ISO 2416:1992 occupant/luggage split as cited in UNECE type-approval texts (EUR-Lex 42018X0116; UNECE R107): " +
      "driver mass 75 kg = 68 kg occupant + 7 kg luggage. Retrieved 2026-08-22.",
  );
}

function beltAnchorLoad(): Quantity<"N"> {
  return sourced(
    13345,
    "N",
    "FMVSS No. 210 seat belt anchorage test load (per belt portion)",
    "49 CFR 571.210 'Seat belt assembly anchorages' (eCFR): 13,345 N (3,000 lb) applied to the lap portion " +
      "simultaneously with 13,345 N to the shoulder portion, reached within 30 s and held 10 s. Retrieved 2026-08-22.",
  );
}

// ---------------------------------------------------------------------------
// Parameters
// ---------------------------------------------------------------------------

export interface OccupantRowParams {
  /** Heel point of the row (AHP for the driver row), part space. */
  readonly heel: Pt3;
  /** SAE J1100 H30: hip (H-point) height above the heel. Validated against the sourced Class-A range. */
  readonly H30: Quantity<"mm">;
  /** Seats in this row. */
  readonly occupants: Quantity<"count">;
  /** Torso angle from vertical. Default SOURCED 25° (SAE J4004). */
  readonly seatBackAngleDeg?: Quantity<"deg">;
  /** Horizontal setback, heel to hip. Default ASSUMED. */
  readonly hipAftOfHeel?: Quantity<"mm">;
  readonly label?: string;
}

export interface OccupantArrayParams {
  /** Rows front to rear; row 0 holds the driver unless driverRow says otherwise. */
  readonly rows: readonly OccupantRowParams[];
  readonly driverRow?: number;
  /** Driver lateral position (+Y left, LHD). Default ASSUMED. */
  readonly driverY?: Quantity<"mm">;
  /** Steering-wheel hub target for the reach demand. Default derived from the driver hip via ASSUMED offsets. */
  readonly wheelHub?: Pt3;
}

export interface OccupantRowDims {
  readonly heel: Pt3;
  readonly hip: Pt3;
  readonly eye: Pt3;
  readonly head: Pt3;
  /** The H30 the hip stands on — echoed so the chain is auditable. */
  readonly H30: Quantity<"mm">;
  /** Vertical eye offset above the hip, derived from sourced anthropometry × back angle. */
  readonly eyeAboveHip: Quantity<"mm">;
  readonly headAboveHip: Quantity<"mm">;
  readonly occupants: Quantity<"count">;
}

export interface OccupantArrayDims {
  readonly rows: readonly OccupantRowDims[];
  readonly totalOccupants: Quantity<"count">;
  readonly mass: Quantity<"kg">;
  readonly wheelHub: Pt3;
}

export interface OccupantArrayInstance extends PartInstance {
  readonly dims: OccupantArrayDims;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function makeOccupantArray(params: OccupantArrayParams, alloc: IdAllocator): OccupantArrayInstance {
  if (params.rows.length === 0) throw new Error("makeOccupantArray: at least one row");
  const driverRow = params.driverRow ?? 0;
  if (driverRow < 0 || driverRow >= params.rows.length) {
    throw new Error(`makeOccupantArray: driverRow ${driverRow} outside rows 0..${params.rows.length - 1}`);
  }

  const h30Min = h30ClassAMin();
  const h30Max = h30ClassAMax();
  const sittingHeight = sittingHeight95M();
  const sittingEye = sittingEyeHeight95M();
  const hipBreadth = hipBreadth95F();
  const reach = functionalReach5F();
  const headGap = headClearanceMin();
  const perOccupant = occupantMass();
  const beltLoad = beltAnchorLoad();

  const driverY =
    params.driverY ?? assumed(370, "mm", "driver centerline offset from vehicle centerline (LHD, +Y left) — no source found this run, 370 mm ASSUMED");

  const seatWidth = assumed(520, "mm", "seat width per occupant across the row — no source found this run, 520 mm ASSUMED");
  const zUp: Pt3 = [0, 0, 1];
  const aft: Pt3 = [1, 0, 0];

  const ports: PortRecord[] = [];
  const demands: DemandRecord[] = [];
  const rowDims: OccupantRowDims[] = [];

  let totalCount = 0;
  const countChains: string[] = [];

  for (let i = 0; i < params.rows.length; i++) {
    const row = params.rows[i]!;
    const rowName = row.label ?? `row${i}`;

    // --- H30 validity: the sourced SAE J1100 Class-A range --------------------
    if (row.H30.value < h30Min.value || row.H30.value > h30Max.value) {
      throw new Error(
        `makeOccupantArray: ${rowName} H30 = ${row.H30.value} mm outside the SAE J1100 Class-A range ` +
          `${h30Min.value}–${h30Max.value} mm [SOURCED] — not a passenger-car chair height`,
      );
    }

    const backAngle = row.seatBackAngleDeg ?? designBackAngle();
    const hipAft =
      row.hipAftOfHeel ??
      assumed(
        800,
        "mm",
        "horizontal heel-to-hip setback (leg reach over the pedals) — SAE J1517 seat-track curves would derive this; not modeled v1, 800 mm ASSUMED",
      );

    // --- the point chain: heel → hip (H30 up, setback aft) --------------------
    const hip: Pt3 = [row.heel[0] + hipAft.value, row.heel[1], row.heel[2] + row.H30.value];

    // torso line leans AFT of vertical by the back angle
    const aRad = backAngle.value * DEG;
    const eyeAboveHip = derived(
      sittingEye.value * ncos(aRad),
      "mm",
      `eye above hip = sitting eye height × cos(back angle); sitting eye = ${sittingEye.value} mm [${sittingEye.license.tag}], ` +
        `back angle = ${backAngle.value} deg [${backAngle.license.tag}] (erect posture taken — relaxed sitting loses up to 65 mm, FAA HFDS ch.14)`,
    );
    const eyeAftOfHip = derived(
      sittingEye.value * nsin(aRad),
      "mm",
      `eye aft of hip = sitting eye height × sin(back angle); sitting eye = ${sittingEye.value} mm [${sittingEye.license.tag}], back angle = ${backAngle.value} deg [${backAngle.license.tag}]`,
    );
    const headAboveHip = derived(
      sittingHeight.value * ncos(aRad),
      "mm",
      `head (vertex) above hip = sitting height × cos(back angle); sitting height = ${sittingHeight.value} mm [${sittingHeight.license.tag}], ` +
        `back angle = ${backAngle.value} deg [${backAngle.license.tag}]`,
    );
    const headAftOfHip = derived(
      sittingHeight.value * nsin(aRad),
      "mm",
      `head aft of hip = sitting height × sin(back angle); sitting height = ${sittingHeight.value} mm [${sittingHeight.license.tag}], back angle = ${backAngle.value} deg [${backAngle.license.tag}]`,
    );

    const eye: Pt3 = [hip[0] + eyeAftOfHip.value, hip[1], hip[2] + eyeAboveHip.value];
    const head: Pt3 = [hip[0] + headAftOfHip.value, hip[1], hip[2] + headAboveHip.value];

    // --- ports: the packaging hard points the grids will show ----------------
    ports.push(
      port(alloc.next("port"), `heel-${rowName}`, "point", { origin: row.heel, xAxis: aft, zAxis: zUp }),
      port(alloc.next("port"), `hip-${rowName}`, "point", { origin: hip, xAxis: aft, zAxis: zUp }),
      port(alloc.next("port"), `eye-${rowName}`, "point", { origin: eye, xAxis: aft, zAxis: zUp }),
      port(alloc.next("port"), `head-${rowName}`, "point", { origin: head, xAxis: aft, zAxis: zUp }),
    );

    // --- head clearance demand ------------------------------------------------
    const headPad = assumed(250, "mm", "head motion envelope pad (fore-aft / lateral) — no source found this run, 250 mm ASSUMED");
    demands.push(
      demand({
        id: alloc.next("demand"),
        principal: "person",
        reason:
          `${rowName}: a 95th-percentile male head (sitting height ${sittingHeight.value} mm, NCSU tables) needs the ` +
          `2–3 in comfort gap to the headliner — the inner roof cannot come closer than ${headGap.value} mm above the head point ` +
          `(erect posture; relaxed sitting recovers up to 65 mm, FAA HFDS ch.14)`,
        kind: "clearance",
        shape: {
          kind: "box",
          size: [headPad, headPad, headGap],
          offset: [head[0], head[1], head[2] + headGap.value / 2],
        },
        magnitude: headGap,
      }),
    );

    // --- entry aperture per side, against the sill ---------------------------
    const entryMargin = assumed(250, "mm", "swing space for hips and legs through the door opening beyond static hip breadth — no source found this run, 250 mm ASSUMED");
    const apertureLength = qAdd(hipBreadth, entryMargin);
    const apertureDepth = assumed(150, "mm", "aperture test-box depth through the body side — nominal, ASSUMED");
    const apertureHeight = derived(
      head[2] - row.heel[2],
      "mm",
      `entry opening vertical extent = head point z − heel z at this row (heel-to-head pass-through), from the row's licensed H30/anthropometry chain`,
    );
    const rowWidthHalf = (row.occupants.value * seatWidth.value) / 2;
    for (const side of [1, -1] as const) {
      demands.push(
        demand({
          id: alloc.next("demand"),
          principal: "person",
          reason:
            `${rowName}, ${side === 1 ? "left" : "right"} side: the entry aperture over the sill must admit a ` +
            `95th-percentile-female hip breadth (${hipBreadth.value} mm, NCSU tables) plus swing space — and its lower edge ` +
            `rides the rocker: this demand trades one-for-one against the substrate's rocker-section demand ` +
            `(every mm of rocker section above the floor is a mm off this opening)`,
          kind: "aperture",
          shape: {
            kind: "box",
            size: [apertureLength, apertureDepth, apertureHeight],
            offset: [hip[0], side * rowWidthHalf, row.heel[2] + apertureHeight.value / 2],
          },
          magnitude: apertureLength,
        }),
      );
    }

    // --- seat and belt anchors: massBearing, LAW principal -------------------
    const rowWidth = qMul(row.occupants, seatWidth, "mm");
    const seatRailSpan = assumed(400, "mm", "seat rail fore-aft anchor span — no source found this run, 400 mm ASSUMED");
    const anchorPad = assumed(80, "mm", "anchor bolt pad depth into the floor structure — no source found this run, 80 mm ASSUMED");
    demands.push(
      demand({
        id: alloc.next("demand"),
        principal: "law",
        reason:
          `${rowName}: FMVSS No. 207 'Seating systems' (49 CFR 571.207) — seats and their attachment anchorages must ` +
          `withstand the prescribed impact loads and stay attached; the anchors must terminate in a reinforced member (anchorage law)`,
        kind: "anchorage",
        shape: {
          kind: "box",
          size: [seatRailSpan, rowWidth, anchorPad],
          offset: [hip[0], row.heel[1], row.heel[2]],
        },
        massBearing: true,
      }),
      demand({
        id: alloc.next("demand"),
        principal: "law",
        reason:
          `${rowName}: FMVSS No. 210 'Seat belt assembly anchorages' (49 CFR 571.210) — anchorages must carry ` +
          `${beltLoad.value.toFixed(0)} N on the lap portion simultaneously with ${beltLoad.value.toFixed(0)} N on the shoulder portion; ` +
          `each anchor must terminate in a reinforced member (anchorage law)`,
        kind: "anchorage",
        shape: {
          kind: "box",
          size: [seatRailSpan, rowWidth, anchorPad],
          offset: [hip[0], row.heel[1], hip[2]],
        },
        magnitude: beltLoad,
        massBearing: true,
      }),
    );

    totalCount += row.occupants.value;
    countChains.push(`${row.occupants.value}[${row.occupants.license.tag}]`);
    rowDims.push({
      heel: row.heel,
      hip,
      eye,
      head,
      H30: row.H30,
      eyeAboveHip,
      headAboveHip,
      occupants: row.occupants,
    });
  }

  // --- driver reach demands (person) ------------------------------------------
  const driver = rowDims[driverRow]!;
  const driverHip: Pt3 = [driver.hip[0], driverY.value, driver.hip[2]];
  const driverHeel: Pt3 = [driver.heel[0], driverY.value, driver.heel[2]];

  const shoulderAlongTorso = assumed(
    590,
    "mm",
    "seated acromial (shoulder) height above the H-point along the torso line — no citable source found this run; 590 mm ASSUMED between hip (0) and eye (860 sourced)",
  );
  const driverBack = params.rows[driverRow]!.seatBackAngleDeg ?? designBackAngle();
  const dRad = driverBack.value * DEG;
  const shoulder: Pt3 = [
    driverHip[0] + shoulderAlongTorso.value * nsin(dRad),
    driverHip[1],
    driverHip[2] + shoulderAlongTorso.value * ncos(dRad),
  ];

  const hubForward = assumed(430, "mm", "steering-wheel hub forward of the driver hip — no source found this run, 430 mm ASSUMED");
  const hubAbove = assumed(330, "mm", "steering-wheel hub above the driver hip — no source found this run, 330 mm ASSUMED");
  const wheelHub: Pt3 =
    params.wheelHub ?? [driverHip[0] - hubForward.value, driverHip[1], driverHip[2] + hubAbove.value];

  const reachCube = qMul(reach, derived(2, "count", "bounding cube side = 2 × sphere radius"), "mm");
  demands.push(
    demand({
      id: alloc.next("demand"),
      principal: "person",
      reason:
        "reach sphere to the wheel (encoded as its bounding cube — DemandShape has no sphere): the steering-wheel hub " +
        `must land within ${reach.value} mm functional reach (5th-percentile female, FSAE anthropometric reference) of the driver's shoulder`,
      kind: "point-at",
      shape: { kind: "box", size: [reachCube, reachCube, reachCube], offset: shoulder },
      magnitude: reach,
    }),
  );

  const legReach = assumed(
    920,
    "mm",
    "hip-to-pedal-face leg reach, 5th-percentile female with seat travel — SAE J1517 seat-track curves would derive this; not modeled v1, 920 mm ASSUMED",
  );
  const legCube = qMul(legReach, derived(2, "count", "bounding cube side = 2 × sphere radius"), "mm");
  demands.push(
    demand({
      id: alloc.next("demand"),
      principal: "person",
      reason:
        "reach sphere to the pedals (encoded as its bounding cube — DemandShape has no sphere): the pedal faces at the " +
        `driver heel point must land within ${legReach.value} mm leg reach of the driver's hip`,
      kind: "point-at",
      shape: { kind: "box", size: [legCube, legCube, legCube], offset: driverHip },
      magnitude: legReach,
    }),
  );

  ports.push(
    port(alloc.next("port"), "wheel-hub-target", "point", { origin: wheelHub, xAxis: [-1, 0, 0], zAxis: zUp }),
    port(alloc.next("port"), "pedal-plane", "point", { origin: driverHeel, xAxis: [-1, 0, 0], zAxis: zUp }),
  );

  // --- mass: standard occupants (ISO 2416 via UNECE) ---------------------------
  const totalOccupants = derived(
    totalCount,
    "count",
    `total occupants = ${countChains.join(" + ")} across ${params.rows.length} row(s)`,
  );
  const mass = qMul(totalOccupants, perOccupant, "kg");

  // --- envelope: bounding box of the seated array ------------------------------
  let minX = Number.POSITIVE_INFINITY, maxX = Number.NEGATIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY, maxZ = Number.NEGATIVE_INFINITY;
  let maxHalfWidth = 0;
  for (const r of rowDims) {
    for (const p of [r.heel, r.hip, r.eye, r.head]) {
      minX = nmin(minX, p[0]);
      maxX = nmax(maxX, p[0]);
      minZ = nmin(minZ, p[2]);
      maxZ = nmax(maxZ, p[2]);
    }
    maxHalfWidth = nmax(maxHalfWidth, (r.occupants.value * seatWidth.value) / 2);
  }
  const bodyMargin = assumed(100, "mm", "knee/torso bulk beyond the point skeleton — no source found this run, 100 mm ASSUMED");
  const envLength = derived(
    maxX - minX + bodyMargin.value * 2,
    "mm",
    `array envelope length = span of authored row points (${(maxX - minX).toFixed(0)} mm) + margins [${bodyMargin.license.tag}]`,
  );
  const envWidth = derived(
    maxHalfWidth * 2 + bodyMargin.value * 2,
    "mm",
    `array envelope width = widest row (occupants × seat width [${seatWidth.license.tag}]) + margins [${bodyMargin.license.tag}]`,
  );
  const envHeight = derived(
    maxZ - minZ + bodyMargin.value,
    "mm",
    `array envelope height = heel-to-head span of the rows (${(maxZ - minZ).toFixed(0)} mm) + margin [${bodyMargin.license.tag}]`,
  );
  const envelope: BoxShape = {
    kind: "box",
    size: [envLength, envWidth, envHeight],
    offset: [(minX + maxX) / 2, 0, (minZ + maxZ) / 2],
  };

  demands.push(
    demand({
      id: alloc.next("demand"),
      principal: "person",
      reason: "people occupy this volume: the seated array claims heel-to-head, knee-to-backrest space no solid may share",
      kind: "envelope",
      shape: envelope,
    }),
  );

  const dims: OccupantArrayDims = { rows: rowDims, totalOccupants, mass, wheelHub };

  return {
    id: alloc.next("part"),
    label: `occupant-array ${params.rows.length} row(s), ${totalCount} occupant(s)`,
    ports,
    demands,
    mass,
    envelope,
    dims,
  };
}
