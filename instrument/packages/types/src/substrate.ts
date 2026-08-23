/**
 * makeSubstrate — the chassis substrate as MemberRecords (charge §4, §5).
 *
 * Construction style v1: "body-on-frame" — two longitudinal rails plus N
 * crossmembers, all REINFORCED members sized by params (the anchorage law
 * terminates mass-bearing demands inside them). Rail section defaults are
 * SOURCED from a published ladder-chassis design example; the crush-stroke
 * planning bands are ASSUMED with the note the charge requires: the band is
 * non-derivable here, and the tool says so, pending the owner's crash-band
 * source table per class (charge §4, §15).
 *
 * Publishes: crush-stroke bands ahead of the front and behind the rear hard
 * points; the tunnel section along the centerline; rocker sections whose
 * reasons state the trade against the occupant array's entry aperture (two
 * demands referencing each other, per the charge); tower ports at the axle
 * stations where suspension and load paths meet.
 *
 * TORSIONAL STIFFNESS — DELIBERATELY OUT (charge §4, §14): members exist and
 * are sized; NO stiffness number is computed or claimed anywhere in this file.
 * See TORSIONAL_STIFFNESS_EXCLUSION.
 *
 * Datum: front axle center at rail-centerline height. +X aft, +Y left, +Z up;
 * world-aligned. Units mm, kg.
 */

import type {
  BoxShape,
  DemandRecord,
  IdAllocator,
  MemberRecord,
  PartInstance,
  PortRecord,
  Pt3,
  Quantity,
} from "@car/schema";
import { assumed, demand, derived, port, qDiv, qMul, sourced } from "@car/demand";
import { nmax, nmin, nround } from "@car/num";

// ---------------------------------------------------------------------------
// Scope statement — the charge requires the exclusion stated in code.
// ---------------------------------------------------------------------------

export const TORSIONAL_STIFFNESS_EXCLUSION =
  "Torsional stiffness in v1 is topology and section parameters only: the members exist and are sized, " +
  "and NO stiffness number is computed or claimed (charge §4, §14). A stiffness solve is deliberately " +
  "out of scope and the tool says so where a user would expect the number.";

export const SUBSTRATE_EXCLUSIONS: readonly string[] = [TORSIONAL_STIFFNESS_EXCLUSION];

// ---------------------------------------------------------------------------
// Parameters
// ---------------------------------------------------------------------------

export type ConstructionStyle = "body-on-frame";

export interface SubstrateParams {
  readonly style: ConstructionStyle;
  readonly wheelbase: Quantity<"mm">;
  /** Rail length ahead of the front axle. */
  readonly frontOverhang: Quantity<"mm">;
  /** Rail length behind the rear axle. */
  readonly rearOverhang: Quantity<"mm">;
  /** Rail center-to-center across the car. */
  readonly railSpacing: Quantity<"mm">;
  /** Crossmembers, evenly spaced along the rails. Minimum 2. */
  readonly crossmemberCount: Quantity<"count">;
  /**
   * Optional authored crossmember stations, X in substrate space, instead of
   * even spacing. This exists because the anchorage law is a law and the
   * grammar had no way to satisfy it: the substrate laid members on a fixed
   * grid, the type library published anchorages wherever a part's mounts fell,
   * and nothing reconciled the two — so every car in the six-car battery
   * reported thirty-five anchorage violations at once. A car is not built that
   * way round. The crossmember goes where the load is. Stations outside the
   * rail tips are clamped to them; duplicates within a rail width collapse;
   * `crossmemberCount` is ignored when this is given, and the count reported
   * in the dims is what was actually laid.
   */
  readonly crossmemberStations?: readonly Quantity<"mm">[];
  /** Rail box section. Defaults SOURCED from a published ladder-chassis example. */
  readonly railSectionHeight?: Quantity<"mm">;
  readonly railSectionWidth?: Quantity<"mm">;
  readonly wallThickness?: Quantity<"mm">;
  /** Crush planning bands. Defaults ASSUMED pending the owner's crash-band table. */
  readonly crushStrokeFront?: Quantity<"mm">;
  readonly crushStrokeRear?: Quantity<"mm">;
  /** Tunnel section the floor opens along the centerline. Defaults ASSUMED. */
  readonly tunnelWidth?: Quantity<"mm">;
  readonly tunnelHeight?: Quantity<"mm">;
  /** Rocker (sill) section — trades against the entry aperture. Defaults ASSUMED. */
  readonly rockerHeight?: Quantity<"mm">;
  readonly rockerWidth?: Quantity<"mm">;
}

export interface SubstrateDims {
  readonly railLength: Quantity<"mm">;
  readonly railSectionHeight: Quantity<"mm">;
  readonly railSectionWidth: Quantity<"mm">;
  readonly wallThickness: Quantity<"mm">;
  readonly crossmemberCount: Quantity<"count">;
  readonly crushStrokeFront: Quantity<"mm">;
  readonly crushStrokeRear: Quantity<"mm">;
  readonly tunnelWidth: Quantity<"mm">;
  readonly tunnelHeight: Quantity<"mm">;
  readonly rockerHeight: Quantity<"mm">;
  readonly rockerWidth: Quantity<"mm">;
  readonly mass: Quantity<"kg">;
}

export interface SubstrateInstance extends PartInstance {
  /** The reinforced members the anchorage law terminates in (SolveInput.members). */
  readonly members: readonly MemberRecord[];
  readonly dims: SubstrateDims;
  /** Stated exclusions — surfaced, never silent (charge §14). */
  readonly exclusions: readonly string[];
}

// ---------------------------------------------------------------------------
// SOURCED / ASSUMED defaults
// ---------------------------------------------------------------------------

const RAIL_SECTION_CITE =
  "'Design and Crash Analysis of Ladder Chassis' (DiVA portal thesis, diva2:1337405): longitudinal rail " +
  "rectangular box section 100 × 50 × 6 mm wall. Retrieved 2026-08-22.";

function defaultRailHeight(): Quantity<"mm"> {
  return sourced(100, "mm", "Ladder-frame rail box-section height, published design example", RAIL_SECTION_CITE);
}
function defaultRailWidth(): Quantity<"mm"> {
  return sourced(50, "mm", "Ladder-frame rail box-section width, published design example", RAIL_SECTION_CITE);
}
function defaultWall(): Quantity<"mm"> {
  return sourced(6, "mm", "Ladder-frame rail box-section wall thickness, published design example", RAIL_SECTION_CITE);
}

/**
 * The crush planning band note. The charge is explicit: this number is
 * non-derivable here, and the tool says so — the per-class band table is
 * reserved to the owner (charge §4, §15). The note carries that statement.
 */
function crushBandNote(which: "front" | "rear", mm: number): string {
  return (
    `${which} crush-stroke planning band — NON-DERIVABLE HERE, and the tool says so (charge §4): ` +
    `pending the owner's crash-band source table per class (charge §15). Placeholder ${mm} mm. ` +
    `Retrieved context only, not adopted as a source: ScienceDirect 'Crumple Zone' overview cites ` +
    `500–800 mm typical front crush at 35 mph full-frontal.`
  );
}

function steelDensity(): Quantity<"kg/L"> {
  return sourced(
    7.85,
    "kg/L",
    "Engineering reference density of mild/carbon steel",
    "7.85 g/cm3 = 7.85 kg/L = 7850 kg/m3, the universal engineering default: aimsindustrial.com.au 'Material Density Chart'; " +
      "amardeepsteel.com 'Density of Steel'; niftyalloys.com 'Density of Steel'. Retrieved 2026-08-22.",
  );
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function makeSubstrate(params: SubstrateParams, alloc: IdAllocator): SubstrateInstance {
  const { style, wheelbase, frontOverhang, rearOverhang, railSpacing } = params;
  if (style !== "body-on-frame") {
    throw new Error(`makeSubstrate: construction style '${style as string}' not in v1 — body-on-frame only`);
  }
  if (wheelbase.value <= 0 || railSpacing.value <= 0) {
    throw new Error("makeSubstrate: wheelbase and railSpacing must be positive");
  }
  const nCross = nround(params.crossmemberCount.value);
  if (nCross !== params.crossmemberCount.value || nCross < 2) {
    throw new Error("makeSubstrate: crossmemberCount must be an integer ≥ 2 (front and rear at minimum)");
  }

  const railH = params.railSectionHeight ?? defaultRailHeight();
  const railW = params.railSectionWidth ?? defaultRailWidth();
  const wall = params.wallThickness ?? defaultWall();
  const crushF = params.crushStrokeFront ?? assumed(600, "mm", crushBandNote("front", 600));
  const crushR = params.crushStrokeRear ?? assumed(450, "mm", crushBandNote("rear", 450));
  const tunnelW = params.tunnelWidth ?? assumed(250, "mm", "tunnel section width — sized to admit the driveline routed-path (shaft + running clearance) and exhaust; no source found this run, 250 mm ASSUMED");
  const tunnelH = params.tunnelHeight ?? assumed(270, "mm", "tunnel section height above the floor — no source found this run, 270 mm ASSUMED");
  const rockerH = params.rockerHeight ?? assumed(120, "mm", "rocker (sill) section height — no source found this run, 120 mm ASSUMED");
  const rockerW = params.rockerWidth ?? assumed(100, "mm", "rocker (sill) section width — no source found this run, 100 mm ASSUMED");

  const railLength = derived(
    frontOverhang.value + wheelbase.value + rearOverhang.value,
    "mm",
    `rail length = front overhang + wheelbase + rear overhang; ` +
      `${frontOverhang.value} mm [${frontOverhang.license.tag}] + ${wheelbase.value} mm [${wheelbase.license.tag}] + ${rearOverhang.value} mm [${rearOverhang.license.tag}]`,
  );

  const x0 = -frontOverhang.value; // front rail tip
  const x1 = wheelbase.value + rearOverhang.value; // rear rail tip
  const railMidX = (x0 + x1) / 2;
  const halfSpacing = railSpacing.value / 2;

  // --- members: two rails + N crossmembers, all reinforced ------------------
  const members: MemberRecord[] = [
    {
      id: alloc.next("feature"),
      label: "rail-L",
      box: { kind: "box", size: [railLength, railW, railH] },
      at: [railMidX, halfSpacing, 0],
      reinforced: true,
    },
    {
      id: alloc.next("feature"),
      label: "rail-R",
      box: { kind: "box", size: [railLength, railW, railH] },
      at: [railMidX, -halfSpacing, 0],
      reinforced: true,
    },
  ];
  // Crossmembers carry the rail section in v1 (stated derived choice), spanning rail to rail.
  const crossSpan = derived(
    railSpacing.value,
    "mm",
    `crossmember span = rail spacing (${railSpacing.value} mm [${railSpacing.license.tag}]), rail center to rail center`,
  );
  const authored = params.crossmemberStations;
  const stations: number[] = [];
  if (authored && authored.length > 0) {
    // Clamp inside the rails, sort, and collapse anything closer together
    // than a rail width — two crossmembers 3 mm apart is one crossmember.
    const sorted = authored
      .map((q) => nmin(nmax(q.value, x0), x1))
      .sort((a, b) => a - b);
    for (const x of sorted) {
      const last = stations[stations.length - 1];
      if (last === undefined || x - last >= railW.value) stations.push(x);
    }
    // The tips still need closing out, whatever the author asked for.
    if (stations.length === 0 || stations[0]! - x0 >= railW.value) stations.unshift(x0);
    if (x1 - stations[stations.length - 1]! >= railW.value) stations.push(x1);
  } else {
    for (let k = 0; k < nCross; k++) stations.push(x0 + ((x1 - x0) * k) / (nCross - 1));
  }
  for (let k = 0; k < stations.length; k++) {
    const xk = stations[k]!;
    members.push({
      id: alloc.next("feature"),
      label: `crossmember-${k}`,
      box: { kind: "box", size: [railW, crossSpan, railH] },
      at: [xk, 0, 0],
      reinforced: true,
    });
  }

  // --- mass: thin-wall section area × length × steel density ----------------
  const sectionArea = derived(
    railH.value * railW.value - (railH.value - wall.value * 2) * (railW.value - wall.value * 2),
    "mm2",
    `hollow box section area = H×W − (H−2t)(W−2t); H = ${railH.value} mm [${railH.license.tag}], ` +
      `W = ${railW.value} mm [${railW.license.tag}], t = ${wall.value} mm [${wall.license.tag}]`,
  );
  const totalMemberLength = derived(
    railLength.value * 2 + crossSpan.value * nCross,
    "mm",
    `total member run = 2 rails × ${railLength.value.toFixed(0)} mm [${railLength.license.tag}] + ` +
      `${nCross} crossmembers × ${crossSpan.value} mm [${crossSpan.license.tag}]`,
  );
  const volumeMm3 = qMul(sectionArea, totalMemberLength, "mm3");
  const volumeL = qDiv(volumeMm3, derived(1000000, "ratio", "1 L = 10^6 mm3 (SI definition of the litre)"), "L");
  const mass = qMul(volumeL, steelDensity(), "kg"); // L × kg/L = kg

  // --- ports: rail tips + tower positions at the axle stations --------------
  const zUp: Pt3 = [0, 0, 1];
  const aft: Pt3 = [1, 0, 0];
  const fwd: Pt3 = [-1, 0, 0];
  const rearX = wheelbase.value;
  const ports: PortRecord[] = [
    port(alloc.next("port"), "rail-tip-front-L", "point", { origin: [x0, halfSpacing, 0], xAxis: fwd, zAxis: zUp }),
    port(alloc.next("port"), "rail-tip-front-R", "point", { origin: [x0, -halfSpacing, 0], xAxis: fwd, zAxis: zUp }),
    port(alloc.next("port"), "rail-tip-rear-L", "point", { origin: [x1, halfSpacing, 0], xAxis: aft, zAxis: zUp }),
    port(alloc.next("port"), "rail-tip-rear-R", "point", { origin: [x1, -halfSpacing, 0], xAxis: aft, zAxis: zUp }),
    port(alloc.next("port"), "tower-front-L", "point", { origin: [0, halfSpacing, railH.value / 2], xAxis: aft, zAxis: zUp }),
    port(alloc.next("port"), "tower-front-R", "point", { origin: [0, -halfSpacing, railH.value / 2], xAxis: aft, zAxis: zUp }),
    port(alloc.next("port"), "tower-rear-L", "point", { origin: [rearX, halfSpacing, railH.value / 2], xAxis: aft, zAxis: zUp }),
    port(alloc.next("port"), "tower-rear-R", "point", { origin: [rearX, -halfSpacing, railH.value / 2], xAxis: aft, zAxis: zUp }),
  ];

  // --- demands --------------------------------------------------------------
  const frameWidth = derived(
    railSpacing.value + railW.value,
    "mm",
    `frame width over the rails = spacing + one rail width; spacing = ${railSpacing.value} mm [${railSpacing.license.tag}], rail W = ${railW.value} mm [${railW.license.tag}]`,
  );

  const rockerStandoff = assumed(180, "mm", "rocker line outboard of the rail centerline — no source found this run, 180 mm ASSUMED");
  const crushPadZ = assumed(250, "mm", "vertical extent of the crush band (rail tip + bumper beam depth) — no source found this run, 250 mm ASSUMED");

  const demands: DemandRecord[] = [
    demand({
      id: alloc.next("demand"),
      principal: "physics",
      reason: "solid bodies exclude one another: the frame claims its rails and crossmembers",
      kind: "envelope",
      shape: { kind: "box", size: [railLength, frameWidth, railH], offset: [railMidX, 0, 0] },
    }),
    demand({
      id: alloc.next("demand"),
      principal: "physics",
      reason:
        "front crush stroke: crash energy is absorbed over fold length AHEAD of the front hard points — " +
        "no rigid part may claim this band (the band value is a planning figure pending the owner's crash-band table; see its ASSUMED note)",
      // A crush band is a keep-out REGION at a stated place, not a halo around
      // the rails: "clearance" inflates the part envelope by the magnitude in
      // every direction and ignores this box. (Found at the P1's first solve.)
      kind: "protected-zone",
      shape: {
        kind: "box",
        size: [crushF, frameWidth, crushPadZ],
        offset: [x0 - crushF.value / 2, 0, 0],
      },
    }),
    demand({
      id: alloc.next("demand"),
      principal: "physics",
      reason:
        "rear crush stroke: crash energy is absorbed over fold length BEHIND the rear hard points — " +
        "no rigid part may claim this band (the band value is a planning figure pending the owner's crash-band table; see its ASSUMED note)",
      kind: "protected-zone",
      shape: {
        kind: "box",
        size: [crushR, frameWidth, crushPadZ],
        offset: [x1 + crushR.value / 2, 0, 0],
      },
    }),
    demand({
      id: alloc.next("demand"),
      principal: "physics",
      reason:
        "tunnel section: the floor opens a centerline tunnel between the axles so the longitudinal driveline's " +
        "routed-path demand and tunnel-adjacent exhaust routing can close (charge §5 driveline / intake-exhaust)",
      kind: "aperture",
      shape: {
        kind: "box",
        size: [wheelbase, tunnelW, tunnelH],
        offset: [wheelbase.value / 2, 0, railH.value / 2 + tunnelH.value / 2],
      },
      magnitude: tunnelW,
    }),
    demand({
      id: alloc.next("demand"),
      principal: "physics",
      reason:
        "rocker section, left: the sill carries bending and side-impact load along the door opening — and its height " +
        "trades one-for-one against the occupant array's entry aperture demand: every mm of rocker section above the " +
        "floor is a mm off the entry opening (see 'entry aperture')",
      kind: "envelope",
      shape: {
        kind: "box",
        size: [wheelbase, rockerW, rockerH],
        offset: [wheelbase.value / 2, halfSpacing + rockerStandoff.value, railH.value / 2 + rockerH.value / 2],
      },
      magnitude: rockerH,
    }),
    demand({
      id: alloc.next("demand"),
      principal: "physics",
      reason:
        "rocker section, right: the sill carries bending and side-impact load along the door opening — and its height " +
        "trades one-for-one against the occupant array's entry aperture demand: every mm of rocker section above the " +
        "floor is a mm off the entry opening (see 'entry aperture')",
      kind: "envelope",
      shape: {
        kind: "box",
        size: [wheelbase, rockerW, rockerH],
        offset: [wheelbase.value / 2, -(halfSpacing + rockerStandoff.value), railH.value / 2 + rockerH.value / 2],
      },
      magnitude: rockerH,
    }),
  ];

  const envelope: BoxShape = {
    kind: "box",
    size: [
      derived(
        railLength.value + crushF.value + crushR.value,
        "mm",
        `substrate envelope length = rail length + both crush bands; rails ${railLength.value.toFixed(0)} mm [${railLength.license.tag}], ` +
          `front band ${crushF.value} mm [${crushF.license.tag}], rear band ${crushR.value} mm [${crushR.license.tag}]`,
      ),
      derived(
        railSpacing.value + railW.value + (rockerStandoff.value + rockerW.value) * 2,
        "mm",
        `substrate envelope width = frame width + rocker lines both sides [${rockerStandoff.license.tag}]`,
      ),
      derived(
        railH.value + tunnelH.value,
        "mm",
        `substrate envelope height = rail section + tunnel rise; rail ${railH.value} mm [${railH.license.tag}], tunnel ${tunnelH.value} mm [${tunnelH.license.tag}]`,
      ),
    ],
    offset: [railMidX + (crushR.value - crushF.value) / 2, 0, tunnelH.value / 2],
  };

  const dims: SubstrateDims = {
    railLength,
    railSectionHeight: railH,
    railSectionWidth: railW,
    wallThickness: wall,
    crossmemberCount: params.crossmemberCount,
    crushStrokeFront: crushF,
    crushStrokeRear: crushR,
    tunnelWidth: tunnelW,
    tunnelHeight: tunnelH,
    rockerHeight: rockerH,
    rockerWidth: rockerW,
    mass,
  };

  return {
    id: alloc.next("part"),
    label: `substrate body-on-frame wb${wheelbase.value}`,
    ports,
    demands,
    mass,
    envelope,
    members,
    dims,
    exclusions: SUBSTRATE_EXCLUSIONS,
  };
}
