/**
 * The chassis against the skin — where the two halves meet.
 *
 * A body and a structure are the two halves of one object, and until this file
 * existed they were two sets of boxes that happened to occupy the same space.
 * Nothing connected them. Move the rails 200 mm and the body would not notice;
 * nothing would complain; no number would change. Two things that cannot
 * disagree are not related, they are merely adjacent.
 *
 * WHAT THE RELATIONSHIP ACTUALLY IS, stated as three questions the geometry
 * can answer:
 *
 *   CONTAINMENT   is the structure inside the body's envelope? Structure that
 *                 pokes out is structure you can see, and a rail through a
 *                 wing is a defect nobody can argue with. This is the hard
 *                 one — it either holds or it does not.
 *
 *   CLEARANCE     how close does the structure come to the outer surface? Too
 *                 close and the panel reads the rail through it — the flat
 *                 spot every cheap car has over its sill. Too far and the
 *                 package is being wasted.
 *
 *                 It is a POPULATION reading, and the first version was not.
 *                 A car whose structure is welded to its floor touches its
 *                 own skin on purpose, at the mount pads, along the rail
 *                 flanges, over the tunnel; every one of those reads zero and
 *                 every one of them is a weld. Faulting the single closest
 *                 point called three welds a defect and said nothing about
 *                 the defect it exists for, which is a REGION of panel drawn
 *                 tight over structure. So the closest point is reported and
 *                 the fault is raised on how MANY points are tight.
 *
 *   REGISTRATION  a body does not float above a frame, it SITS on it, at
 *                 discrete mounts. Each mount is a place where the two are
 *                 supposed to touch, and the number that says whether they do
 *                 is the SIGNED gap between the pad and the bodywork it would
 *                 land on. Zero is the whole point: the body clicks on.
 *
 * WHAT IT IS NOT. It is not a strength check — there is no load path here and
 * no material. It says where the structure is relative to the skin, which is
 * the packaging question, and it says nothing at all about whether the
 * structure would hold the car up.
 *
 * THE SOLID CAVEAT, and it changes how a reading is read. The mesher hands
 * back a closed SOLID, not a shell with a thickness, so "inside the body"
 * means inside that solid and not "inside a floor pan". A rail buried in the
 * solid is hidden, which is what containment is asking. It is not evidence
 * that a floor exists above it, because in this model no floor does.
 *
 * Body frame: x aft from the nose, y lateral, z up from the road. Millimetres.
 */

import type { Pt3 } from "@car/schema";
import { assumed } from "@car/demand";
import {
  coverClearance, evenStations, insideSection, sampledVertices, scanUp,
  sectionCache, sliceSection, wallClearance, xRange,
  type SectionMesh, type Seg2,
} from "@car/skin";

/** One place the body is meant to sit on the structure. */
export interface BodyMount {
  readonly name: string;
  /** Top face of the pad — where the body would land. */
  readonly at: Pt3;
  /**
   * Half the pad's plan size, mm. Structure inside this box is CONTACT and is
   * left out of the clearance minimum: a pad is supposed to touch the body,
   * and a lens that faults it for touching reports the design as the defect.
   * Defaults to `DEFAULT_PAD_HALF`.
   */
  readonly padHalf?: number;
}

export interface MountFit {
  readonly name: string;
  readonly at: Pt3;
  /** True when the pad is buried in the bodywork rather than out in the air. */
  readonly inside: boolean;
  /**
   * The bodywork surface this pad would touch, as a height, mm.
   *
   * Which surface that IS depends on where the pad sits: a pad out in the air
   * meets the first bodywork ABOVE it, a pad already in the bodywork is
   * measured from the first surface BELOW it. Taking the lowest crossing in
   * the column either way reads a pad in the sky above the deck as buried
   * eight hundred millimetres deep in a car it is nowhere near.
   *
   * Null when the column holds nothing the pad could reach — a mount out past
   * the flank, or over the roof, both of which are holding up thin air.
   */
  readonly bodyUnderside: number | null;
  /**
   * Pad top minus the body's underside — the registration number.
   *
   * ZERO is the body sitting on the mount, which is what a body mount is for.
   * NEGATIVE is a gap the mount does not reach across; POSITIVE is the pad
   * buried up inside the bodywork. Both are misses, and they are opposite
   * misses, so the sign is carried rather than absolute value taken.
   */
  readonly standoff: number | null;
  /** Nearest bodywork in any direction, in the pad's own section. */
  readonly clearance: number;
}

export interface ChassisFitReport {
  /** Structure vertices tested. */
  readonly points: number;
  /** How many are outside the body's envelope at all. */
  readonly outside: number;
  /**
   * Of those, the ones outside where it MATTERS.
   *
   * A frame is meant to be visible from underneath — that is what body-on-
   * frame is — so structure below the underside is reported and is not a
   * fault. Structure out through a flank, up through a deck, or standing in
   * an open cockpit is a different thing entirely, and that is what this
   * counts. The first version of this lens had one number for both and
   * called a chassis doing its job a defect.
   */
  readonly outsideVisible: number;
  /** Structure hanging below the body's underside, which is normal for a frame. */
  readonly exposedBelow: number;
  /** Worst distance a structure point sits outside the skin, mm. */
  readonly worstProtrusion: number;
  readonly worstProtrusionAt: Pt3;
  /** Closest the structure comes to the skin, mm, and where. */
  readonly minClearance: number;
  readonly minClearanceAt: Pt3;
  /** Median clearance — the packaging headline, not the outlier. */
  readonly medianClearance: number;
  /** Covered points closer to the skin than the threshold, and how many were covered. */
  readonly tight: number;
  readonly covered: number;
  /** How much of the body's length has any structure under it, as a fraction. */
  readonly spanCoverage: number;
  readonly mounts: readonly MountFit[];
  readonly faults: readonly string[];
}

export interface ChassisFitOptions {
  /** Structure closer than this to the outer skin reads through the panel. */
  readonly minSkinClearance?: number;
  /** How many structure vertices to test. Sampling, not a claim. */
  readonly sampleLimit?: number;
  /** Stations to test coverage over. Defaults to 40. */
  readonly coverageStations?: number;
  /** Fraction of covered points that may sit tight before it reads as a region. */
  readonly tightFraction?: number;
}

/**
 * How close structure may come to the outer skin before the panel reads it.
 *
 * ASSUMED. A panel drawn tight over a rail shows a flat spot and a highlight
 * that stops — the giveaway on a cheap car — and no standard says how much
 * air prevents it. 25 mm is a body-in-white gap that stamping and paint both
 * survive, and it is here to be argued with rather than buried in a
 * comparison.
 */
export const MIN_SKIN_CLEARANCE = assumed(
  25, "mm",
  "air between structure and the outer skin before a panel reads the structure through it — no source consulted; 25 mm ASSUMED",
);

/**
 * How far a pad may miss the body's underside and still be carrying it.
 *
 * ASSUMED. A body mount lands on a floor pan through a rubber puck, and both
 * have tolerance; beyond this the body is near the mount rather than on it.
 */
const MOUNT_STANDOFF = assumed(
  15, "mm",
  "how far a mount pad may sit from the body's underside and still be carrying it — no source consulted; 15 mm ASSUMED",
);

/**
 * Half a body mount's plan size when the caller does not say.
 *
 * ASSUMED. A pad is whatever the frame it is welded to makes it; 100 mm square
 * is a mount on a car this size. It only decides how much structure around a
 * mount counts as CONTACT rather than clearance, so it wants to be near the
 * truth and does not want to be precise.
 */
const DEFAULT_PAD_HALF = assumed(
  50, "mm",
  "half a body mount pad's plan size, used to tell contact from clearance — no source consulted; 50 mm ASSUMED",
);

/**
 * How little of the body's length may have structure under it.
 *
 * ASSUMED. A frame under half a car is a car with an unsupported half, and
 * nothing published says where the line is. Half is a round number chosen to
 * be argued with.
 */
const MIN_SPAN_COVERAGE = assumed(
  0.5, "count",
  "least fraction of the body's length that must have structure under it — no source consulted; a half ASSUMED",
);

/**
 * How much of the structure may sit tight against the skin before it is a
 * REGION rather than a joint.
 *
 * ASSUMED. Welds, flanges and mount pads all touch on purpose and all read
 * zero; what shows through a panel is an area of them, not a point. 2% of the
 * covered sample is a couple of hundred square centimetres on a car this size
 * — enough to be a flat spot, too much to be a seam.
 */
const TIGHT_FRACTION = assumed(
  0.02, "count",
  "share of covered structure points that may sit inside the skin-clearance threshold before it reads as a panel drawn over structure rather than a joint — no source consulted; 2% ASSUMED",
);

/**
 * Test the structure against the skin.
 *
 * Both meshes are whole meshes — the caller separates skin from structure,
 * because only the caller knows which cells are which. The surface classes in
 * `@car/skin/finishes` are what make that a fact rather than a list of ids.
 */
export function chassisFit(
  skin: SectionMesh,
  structure: SectionMesh,
  mounts: readonly BodyMount[] = [],
  opts: ChassisFitOptions = {},
): ChassisFitReport {
  const minGap = opts.minSkinClearance ?? MIN_SKIN_CLEARANCE.value;
  // The default sample size lives with the sampler, next door: how many
  // vertices a walk can afford is a fact about machines, not about cars.
  const limit = opts.sampleLimit;

  // Sections and floor profiles, cached. Both the caching and its grids are
  // arithmetic and live in @car/skin: arithmetic there, claims here.
  const { sectionAtX: sectionOf, floorAtX: floorOf } = sectionCache(skin);

  // The vertices the STRUCTURE's indices reference, not every vertex in the
  // buffer it shares with the body. Walking positions measures the whole car.
  // A mount pad is in contact by design, so its own footprint is excluded from
  // the clearance minimum — the mount reading below is what covers it. Without
  // this the car reads "structure comes within 0 mm of the skin" at the exact
  // eight places where zero is the whole objective.
  const pads = mounts.map((m) => ({ at: m.at, half: m.padHalf ?? DEFAULT_PAD_HALF.value }));
  const onAPad = (x: number, y: number, z: number): boolean => pads.some((p) =>
    Math.abs(x - p.at[0]) <= p.half && Math.abs(y - p.at[1]) <= p.half && Math.abs(z - p.at[2]) <= p.half);

  const verts = sampledVertices(structure, limit);
  const n = verts.length;
  let points = 0, outside = 0, outsideVisible = 0, exposedBelow = 0;
  let worstProtrusion = 0;
  let worstProtrusionAt: Pt3 = [0, 0, 0];
  let minClearance = Infinity;
  let minClearanceAt: Pt3 = [0, 0, 0];
  const clearances: number[] = [];

  for (let k = 0; k < n; k++) {
    const i = verts[k]!;
    const x = structure.positions[i * 3]!;
    const y = structure.positions[i * 3 + 1]!;
    const z = structure.positions[i * 3 + 2]!;
    const section = sectionOf(x);
    if (section.length === 0) {
      // No body at this station at all: the structure is hanging out in front
      // of the car or behind it, which is as outside as outside gets.
      points++;
      outside++;
      outsideVisible++;
      continue;
    }
    points++;
    const gap = wallClearance(section, y, z);
    const within = insideSection(section, y, z);
    let protruding = false;
    if (!within) {
      outside++;
      // WHERE it is outside decides whether it matters. Below the underside is
      // a frame being a frame; anywhere else is structure somebody can see.
      const col = scanUp(section, y);
      protruding = !(col.length > 0 && z < col[0]!);
      if (protruding) {
        outsideVisible++;
        if (gap > worstProtrusion) { worstProtrusion = gap; worstProtrusionAt = [x, y, z]; }
      } else exposedBelow++;
    }
    // Clearance is a distance to the skin and does not care which side of it
    // you are on: a frame slung 8 mm under the floor reads the floor through
    // the carpet exactly as a rail 8 mm inside it reads through the panel.
    // Only a protrusion is excluded, because worstProtrusion already has it
    // and a point outside is not clearing anything.
    // Read-through is a question about the panel BETWEEN the eye and the
    // structure, so it is measured with `coverClearance` and not `gap`: a
    // rail welded to the floor pan under it is zero from the skin and is a
    // weld. Infinity means nothing covers this point, which is a frame in the
    // open air and not a clearance at all.
    if (!protruding && !onAPad(x, y, z)) {
      const cover = coverClearance(section, y, z, floorOf(x));
      if (Number.isFinite(cover)) {
        clearances.push(cover);
        if (cover < minClearance) { minClearance = cover; minClearanceAt = [x, y, z]; }
      }
    }
  }
  if (!Number.isFinite(minClearance)) minClearance = 0;
  clearances.sort((a, b) => a - b);
  const medianClearance = clearances.length === 0
    ? 0
    : clearances[Math.floor(clearances.length / 2)]!;
  const covered = clearances.length;
  let tight = 0;
  for (const c of clearances) { if (c < minGap) tight++; else break; }

  // Coverage: how much of the body's length has structure under it. A body
  // with a frame under half of it is a defect the other readings cannot see.
  const [sLo, sHi] = xRange(structure);
  const stations = evenStations(skin, opts.coverageStations);
  let spanned = 0;
  for (const x of stations) {
    if (x >= sLo && x <= sHi && sliceSection(structure, x).length > 0) spanned++;
  }
  const spanCoverage = stations.length === 0 ? 0 : spanned / stations.length;

  const mountFits: MountFit[] = mounts.map((m) => {
    const section = sectionOf(m.at[0]);
    if (section.length === 0) {
      return { name: m.name, at: m.at, inside: false, bodyUnderside: null, standoff: null, clearance: 0 };
    }
    const col = scanUp(section, m.at[1]);
    const z = m.at[2];
    const inside = insideSection(section, m.at[1], z);
    // The surface the pad would land on. A pad exactly ON a face satisfies
    // both searches with the same crossing, so the boundary case reads zero
    // whichever way `inside` happens to resolve it.
    let above: number | null = null, below: number | null = null;
    for (const c of col) {
      if (c >= z && (above === null || c < above)) above = c;
      if (c <= z && (below === null || c > below)) below = c;
    }
    const underside = inside ? (below ?? above) : above;
    return {
      name: m.name,
      at: m.at,
      inside,
      bodyUnderside: underside,
      standoff: underside === null ? null : z - underside,
      clearance: wallClearance(section, m.at[1], z),
    };
  });

  const faults: string[] = [];
  if (outsideVisible > 0) {
    faults.push(
      `${outsideVisible} of ${points} structure points are outside the body where it SHOWS — worst ` +
      `${worstProtrusion.toFixed(0)} mm at [${worstProtrusionAt.map((v) => v.toFixed(0)).join(", ")}]`,
    );
  }
  const tightShare = opts.tightFraction ?? TIGHT_FRACTION.value;
  if (covered > 0 && tight > covered * tightShare && outsideVisible === 0) {
    faults.push(
      `${tight} of ${covered} covered structure points sit inside ${minGap} mm of the skin — ` +
      `worst ${minClearance.toFixed(0)} mm at [${minClearanceAt.map((v) => v.toFixed(0)).join(", ")}]. ` +
      `That is a region, not a joint: a panel that tight reads the structure through it`,
    );
  }
  if (spanCoverage < MIN_SPAN_COVERAGE.value) {
    const [lo, hi] = xRange(skin);
    faults.push(
      `structure spans only ${(spanCoverage * (hi - lo)).toFixed(0)} mm of the body's ` +
      `${(hi - lo).toFixed(0)}, against ${MIN_SPAN_COVERAGE.value} of it wanted`,
    );
  }
  for (const f of mountFits) {
    if (f.standoff === null) {
      faults.push(`mount ${f.name} at [${f.at.map((v) => v.toFixed(0)).join(", ")}] has no body in its column at all`);
    } else if (Math.abs(f.standoff) > MOUNT_STANDOFF.value) {
      faults.push(
        `mount ${f.name} misses the body's underside by ${f.standoff.toFixed(0)} mm ` +
        `(${f.standoff > 0 ? "pad buried in the bodywork" : "a gap the mount does not fill"}), ` +
        `against ${MOUNT_STANDOFF.value} of tolerance`,
      );
    }
  }

  return {
    points, outside, outsideVisible, exposedBelow, worstProtrusion, worstProtrusionAt,
    minClearance, minClearanceAt, medianClearance, tight, covered, spanCoverage,
    mounts: mountFits, faults,
  };
}
