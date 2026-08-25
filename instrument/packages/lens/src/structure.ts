/**
 * Is the structure one structure, and does it reach the things it carries?
 *
 * `chassisFit` asks where the structure sits relative to the SKIN. It answers
 * containment, clearance and registration, and it is silent about the two
 * questions that decide whether a chassis is a chassis at all:
 *
 *   CONNECTEDNESS  is it one body? Six members that never touch are six
 *                  members, not a frame. Nothing in this package had ever
 *                  asked — a rail authored 200 mm from the crossmember it is
 *                  supposed to meet renders identically, sections
 *                  identically, and passes every probe there was.
 *
 *   ANCHORAGE      does every part the car carries have structure to hang
 *                  from? An engine floating 300 mm from the nearest tube is
 *                  an engine nobody has mounted. So is a wheel — and a wheel
 *                  is the case that made this file exist, because on all
 *                  three cars in this repository the wheels were solids
 *                  placed at the track and the axle station with no member
 *                  within half a metre of them. They were drawn, not carried.
 *
 * WHAT IT IS NOT, and the exclusion is the same one `makeSubstrate` states in
 * code: this is not a strength check. There is no load path, no section
 * property and no material. It says the members TOUCH and that they reach
 * what they carry, which is a topology and a distance. Whether the thing
 * would hold the car up is a stiffness question and is deliberately out of
 * scope (charge §4, §14).
 *
 * Members and parts are axis-aligned boxes because that is what the authoring
 * verbs make and what the packing solve publishes. A sheared strut is passed
 * as the box it sweeps, which OVER-states its reach — a diagonal tube nearly
 * touches more than its own volume does — so a connection this lens reports
 * is at least as real as the boxes, and a gap it reports is a true gap.
 *
 * Body frame: x aft from the nose, y lateral, z up from the road. Millimetres.
 */

import type { Pt3 } from "@car/schema";
import { assumed } from "@car/demand";

/** One structural member, as the box it occupies. */
export interface StructureMember {
  readonly name: string;
  readonly lo: Pt3;
  readonly hi: Pt3;
}

/** One thing the car carries and the structure has to hold. */
export interface CarriedPart {
  readonly name: string;
  readonly lo: Pt3;
  readonly hi: Pt3;
  /** Mass, kg, where the assembly published one. Orphans are reported heaviest first. */
  readonly massKg?: number;
}

/** A wheel centre — the one "part" that is a point and not a box. */
export interface Corner {
  readonly name: string;
  readonly at: Pt3;
}

export interface Anchorage {
  readonly name: string;
  /** Distance from the part to the nearest member, mm. Zero means they overlap. */
  readonly gap: number;
  readonly nearest: string | null;
  readonly carried: boolean;
  readonly massKg: number | null;
}

export interface CornerFit {
  readonly name: string;
  readonly gap: number;
  readonly nearest: string | null;
  /** Is the member that reaches it part of the LARGEST island, or an offcut? */
  readonly onMainIsland: boolean;
}

export interface StructureReport {
  readonly members: number;
  /**
   * Connected components, largest first, each as its members' names.
   *
   * One island is the good case and the only one. Two means the car has two
   * structures that do not touch, which is either a defect or a bolted joint
   * the model has not authored — and the lens cannot tell those apart, so it
   * reports and the caller decides.
   */
  readonly islands: readonly (readonly string[])[];
  readonly anchorage: readonly Anchorage[];
  readonly corners: readonly CornerFit[];
  /** Total mass of parts with no structure in reach. */
  readonly orphanedKg: number;
  readonly faults: readonly string[];
}

export interface StructureOptions {
  /** Members this close are one body — a weld, a bolt, or a bracket. */
  readonly weldGap?: number;
  /** A part further than this from every member is not mounted to anything. */
  readonly reach?: number;
  /** A corner further than this from every member is not carried. */
  readonly cornerReach?: number;
}

/**
 * How close two members must come to count as joined.
 *
 * ASSUMED. Two boxes that touch are welded; two that miss by a millimetre are
 * a weld with a fit-up gap, which every car has and no drawing shows. Beyond
 * this they are two parts with something between them that has not been
 * modelled, and the lens should say so rather than round it away.
 */
const WELD_GAP = assumed(
  6, "mm",
  "how close two structural members must come before they count as joined — a weld's fit-up gap; no source consulted, 6 mm ASSUMED",
);

/**
 * How far a part may sit from the nearest member and still be mounted to it.
 *
 * ASSUMED, and generous on purpose. A gearbox hangs off a crossmember on a
 * rubber mount; a tank sits in a cradle; a radiator hangs on brackets. All of
 * those are real structure this model does not author, and 120 mm covers a
 * mount and its bracket without covering a part that is simply nowhere near
 * anything.
 */
const REACH = assumed(
  120, "mm",
  "how far a carried part may sit from the nearest structural member and still be considered mounted to it, allowing for a mount and its bracket — no source consulted; 120 mm ASSUMED",
);

/**
 * How far a wheel centre may sit from the nearest member.
 *
 * ASSUMED and TIGHTER than a part's reach, because what closes this gap is a
 * suspension link and a link is structure that must be authored rather than
 * assumed. An upright is at the wheel centre; a wishbone reaches it. If
 * nothing is within this, the wheel is not attached to the car.
 */
const CORNER_REACH = assumed(
  90, "mm",
  "how far a wheel centre may sit from the nearest structural member before the wheel is not attached to anything — an upright's own half-width; no source consulted, 90 mm ASSUMED",
);

/**
 * How many member names an island fault lists before eliding.
 *
 * ASSUMED, and it is a legibility choice rather than a claim about a car —
 * but the licensed packages take no bare numbers at all, and a number that
 * shapes what a person reads is exactly the kind that should have to say so.
 */
const NAMES_SHOWN = assumed(
  3, "count",
  "how many member names an island fault lists before eliding — a legibility choice, not a fact about a car; 3 ASSUMED",
);

/** Axis-aligned box-to-box distance. Zero when they overlap or touch. */
function boxGap(a: { lo: Pt3; hi: Pt3 }, b: { lo: Pt3; hi: Pt3 }): number {
  let sum = 0;
  for (let k = 0; k < 3; k++) {
    const d = Math.max(0, a.lo[k]! - b.hi[k]!, b.lo[k]! - a.hi[k]!);
    sum += d * d;
  }
  return Math.sqrt(sum);
}

/** Point-to-box distance. Zero when the point is inside. */
function pointGap(p: Pt3, b: { lo: Pt3; hi: Pt3 }): number {
  let sum = 0;
  for (let k = 0; k < 3; k++) {
    const d = Math.max(0, b.lo[k]! - p[k]!, p[k]! - b.hi[k]!);
    sum += d * d;
  }
  return Math.sqrt(sum);
}

export function structureFit(
  members: readonly StructureMember[],
  parts: readonly CarriedPart[] = [],
  corners: readonly Corner[] = [],
  opts: StructureOptions = {},
): StructureReport {
  const weld = opts.weldGap ?? WELD_GAP.value;
  const reach = opts.reach ?? REACH.value;
  const cornerReach = opts.cornerReach ?? CORNER_REACH.value;
  const n = members.length;

  // Union-find over the member graph. Quadratic in the member count, which is
  // a hundred on the largest car here and would be a hundred on any car: a
  // frame is drawn by a person and there are only ever so many tubes.
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (i: number): number => {
    let r = i;
    while (parent[r] !== r) r = parent[r]!;
    while (parent[i] !== r) { const up = parent[i]!; parent[i] = r; i = up; }
    return r;
  };
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (boxGap(members[i]!, members[j]!) <= weld) {
        const a = find(i), b = find(j);
        if (a !== b) parent[a] = b;
      }
    }
  }
  const groups = new Map<number, string[]>();
  for (let i = 0; i < n; i++) {
    const r = find(i);
    const at = groups.get(r);
    if (at) at.push(members[i]!.name); else groups.set(r, [members[i]!.name]);
  }
  // Largest first, and ties broken by the first member's name so the report is
  // the same on every run.
  const islands = [...groups.values()].sort((a, b) => b.length - a.length || a[0]!.localeCompare(b[0]!));
  const mainIsland = new Set(islands[0] ?? []);

  const nearestTo = (gap: (m: StructureMember) => number): { name: string | null; gap: number } => {
    let best: string | null = null, bestGap = Infinity;
    for (const m of members) {
      const g = gap(m);
      if (g < bestGap) { bestGap = g; best = m.name; }
    }
    return { name: best, gap: Number.isFinite(bestGap) ? bestGap : Infinity };
  };

  const anchorage: Anchorage[] = parts.map((p) => {
    const { name, gap } = nearestTo((m) => boxGap(p, m));
    return { name: p.name, gap, nearest: name, carried: gap <= reach, massKg: p.massKg ?? null };
  });
  const cornerFits: CornerFit[] = corners.map((c) => {
    const { name, gap } = nearestTo((m) => pointGap(c.at, m));
    return { name: c.name, gap, nearest: name, onMainIsland: name !== null && mainIsland.has(name) };
  });

  let orphanedKg = 0;
  for (const a of anchorage) if (!a.carried) orphanedKg += a.massKg ?? 0;

  const faults: string[] = [];
  if (islands.length > 1) {
    faults.push(
      `the structure is ${islands.length} separate bodies, not one — ` +
      islands.map((g) => `${g.length} member${g.length === 1 ? "" : "s"} ` +
        `(${g.slice(0, NAMES_SHOWN.value).join(", ")}${g.length > NAMES_SHOWN.value ? ", …" : ""})`).join(" · ") +
      `. Members closer than ${weld} mm count as joined, so these genuinely do not touch`,
    );
  }
  for (const a of [...anchorage].filter((q) => !q.carried).sort((x, y) => (y.massKg ?? 0) - (x.massKg ?? 0))) {
    faults.push(
      `${a.name} is ${a.gap.toFixed(0)} mm from the nearest member (${a.nearest ?? "none"}), against ${reach} of reach` +
      (a.massKg === null ? "" : ` — ${a.massKg.toFixed(0)} kg with nothing under it`),
    );
  }
  for (const c of cornerFits) {
    if (c.gap > cornerReach) {
      faults.push(
        `${c.name} is ${c.gap.toFixed(0)} mm from the nearest member (${c.nearest ?? "none"}) — the wheel is drawn, not carried. ` +
        "An upright and its links are structure and have to be authored",
      );
    } else if (!c.onMainIsland) {
      faults.push(`${c.name} is reached by ${c.nearest}, which is not part of the main structure`);
    }
  }

  return { members: n, islands, anchorage, corners: cornerFits, orphanedKg, faults };
}
