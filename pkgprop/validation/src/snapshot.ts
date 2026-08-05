import { solve, type Bound, type Segment, type SolveResult, type Wall } from '@pkgprop/core';
import { ARCHITECTURES, SEATING_CONFIGS, buildSolveInput } from '@pkgprop/data';

/**
 * The regression net.
 *
 * Phase 1 lifts a kernel out of a working car build. The risk in any such
 * move is that everything still runs and something quietly means something
 * else. This freezes what the solver says today so that a refactor which
 * changes any of it has to say so out loud.
 *
 * What it records is deliberately more than the numbers. A wall is a value
 * AND the constraint that set it AND the parameters that constraint read; if
 * a refactor keeps every value but changes which constraint wins, the tool is
 * broken in the way that matters most, because attribution is the product.
 * So the winning constraint id and the read-chain are snapshotted too.
 *
 * This validates against today's behavior, not against real vehicles. No car
 * in this repository has ever been checked against a measured one — see
 * INVENTORY.md. A green snapshot means "unchanged", never "correct".
 */

/** Millimetres, rounded so float reassociation during a refactor is not noise. */
const PLACES = 6;

function round(n: number): number {
  if (!Number.isFinite(n)) return n;
  const f = 10 ** PLACES;
  return Math.round(n * f) / f;
}

export interface WallSnapshot {
  readonly value: number;
  /** The winning constraint. A change here is a regression even at equal value. */
  readonly constraint: string;
  readonly license: string;
  /** Params actually read while computing this wall — the severance canary. */
  readonly chain: readonly string[];
  readonly assumedKnobs: readonly string[];
}

export interface BoundSnapshot {
  readonly lower: WallSnapshot | null;
  readonly upper: WallSnapshot | null;
  /** Every contributor, not just the winner, so a losing wall cannot vanish. */
  readonly contributions: readonly string[];
}

export interface CaseSnapshot {
  readonly id: string;
  readonly architecture: string;
  readonly seating: string;
  readonly tire: string;
  readonly counts: Readonly<Record<string, number>>;
  readonly bounds: Readonly<Record<string, BoundSnapshot>>;
  readonly controls: Readonly<Record<string, { value: number; touching: string | null }>>;
  readonly readouts: readonly { id: string; value: number; unit: string }[];
  readonly conflicts: readonly {
    quantity: string;
    lower: string;
    upper: string;
    overlap: number;
    resolvers: readonly string[];
  }[];
  readonly geometry: Readonly<Record<string, number>>;
  readonly envelope: {
    readonly floor: readonly string[];
    readonly ceiling: readonly string[];
    readonly floorOutboard: readonly string[];
  };
  readonly plan: { readonly floor: readonly string[]; readonly ceiling: readonly string[] };
}

function wallOf(w: Wall | null): WallSnapshot | null {
  if (!w) return null;
  return {
    value: round(w.value),
    constraint: w.constraint.id,
    license: w.constraint.license,
    chain: [...w.chain].sort(),
    assumedKnobs: [...w.assumedKnobs].sort(),
  };
}

function boundOf(b: Bound): BoundSnapshot {
  return {
    lower: wallOf(b.lower),
    upper: wallOf(b.upper),
    contributions: b.contributions
      .map((c) => `${c.kind}:${c.constraint.id}=${round(c.value)}`)
      .sort(),
  };
}

/** A segment reduced to a stable line: who authored it, and over what span. */
function segmentsOf(segments: readonly Segment[]): string[] {
  return segments
    .map((s) =>
      s.kind === 'line'
        ? `line ${s.constraint.id} x[${round(s.x0)},${round(s.x1)}] z[${round(s.z0)},${round(s.z1)}]`
        : `arc ${s.constraint.id} c[${round(s.cx)},${round(s.cz)}] r${round(s.r)} x[${round(s.x0)},${round(s.x1)}]`,
    )
    .sort();
}

/** Flatten the car-shaped geometry record to plain numbers we can diff. */
function geometryOf(g: SolveResult['geometry']): Record<string, number> {
  const out: Record<string, number> = {
    bumperX: round(g.bumperX),
    tailX: round(g.tailX),
    wheelbase: round(g.wheelbase),
    tireRadius: round(g.tireRadius),
    floorZ: round(g.floorZ),
    roofZ: round(g.roofZ),
    hoodZ: round(g.hoodZ),
    beltZ: round(g.beltZ),
    deckZ: round(g.deckZ),
    cowlX: round(g.cowl.x),
    cowlZ: round(g.cowl.z),
    headerX: round(g.header.x),
    eyeX: round(g.eye.x),
    eyeZ: round(g.eye.z),
    overallWidth: round(g.overallWidth),
    track: round(g.track),
    rockerZ: round(g.rockerZ),
    occupantCount: g.occupants.length,
  };
  g.occupants.forEach((o, i) => {
    out[`row${i + 1}HipX`] = round(o.hpoint.x);
    out[`row${i + 1}HipZ`] = round(o.hpoint.z);
    out[`row${i + 1}HeadTopZ`] = round(o.headTopZ);
    out[`row${i + 1}RoofMinZ`] = round(o.roofMinZ);
  });
  for (const [name, box] of [
    ['frontBox', g.frontBox],
    ['rearBox', g.rearBox],
    ['battery', g.battery],
  ] as const) {
    if (box) {
      out[`${name}X0`] = round(box.x0);
      out[`${name}X1`] = round(box.x1);
      out[`${name}Z0`] = round(box.z0);
      out[`${name}Z1`] = round(box.z1);
    }
  }
  return out;
}

export function snapshotOne(architecture: string, seating: string, tire?: string): CaseSnapshot {
  const state = { architecture, seating, ...(tire ? { tire } : {}) };
  const r = solve(buildSolveInput(state));
  const bounds: Record<string, BoundSnapshot> = {};
  for (const [q, b] of Object.entries(r.bounds)) bounds[q] = boundOf(b);
  const controls: Record<string, { value: number; touching: string | null }> = {};
  for (const [q, c] of Object.entries(r.controls)) {
    controls[q] = {
      value: round(c.value),
      touching: c.touching ? `${c.touching.side}:${c.touching.wall.constraint.id}` : null,
    };
  }
  return {
    id: tire ? `${architecture}/${seating}/${tire}` : `${architecture}/${seating}`,
    architecture,
    seating,
    tire: tire ?? '(architecture default)',
    counts: { ...r.counts },
    bounds,
    controls,
    readouts: r.readouts.map((d) => ({ id: d.id, value: round(d.value), unit: d.unit })),
    // Conflicts are correct output for some configurations, not failures, so
    // they are snapshotted rather than skipped — a config that stops
    // conflicting has changed just as much as one that starts.
    conflicts: r.conflicts.map((c) => ({
      quantity: c.quantity,
      lower: c.lower.constraint.id,
      upper: c.upper.constraint.id,
      overlap: round(c.overlap),
      resolvers: [...c.resolvers].sort(),
    })),
    geometry: geometryOf(r.geometry),
    envelope: {
      floor: segmentsOf(r.envelope.floor.segments),
      ceiling: segmentsOf(r.envelope.ceiling.segments),
      floorOutboard: segmentsOf(r.envelope.floorOutboard.segments),
    },
    plan: {
      floor: segmentsOf(r.plan.floor.segments),
      ceiling: segmentsOf(r.plan.ceiling.segments),
    },
  };
}

/** A representative tire per case, plus the whole architecture × seating grid. */
export const EXTRA_TIRES = ['175/65R14', '245/45R18'] as const;

export function allCases(): CaseSnapshot[] {
  const out: CaseSnapshot[] = [];
  for (const arch of ARCHITECTURES) {
    for (const seat of SEATING_CONFIGS) {
      out.push(snapshotOne(arch.id, seat.id));
    }
  }
  // Tire changes reach the floor, the fenders, and the plan envelope, so at
  // least one architecture is walked across the tire catalog too.
  for (const tire of EXTRA_TIRES) out.push(snapshotOne('fr', '2', tire));
  return out;
}
