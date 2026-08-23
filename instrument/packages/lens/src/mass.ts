/**
 * @car/lens — the mass ledger (charge §8) and the clearance readback strip.
 *
 * Lenses are read-only (overlay law, charge §2): they consume placed parts and
 * report; they never author geometry, and nothing here feeds anything
 * downstream except human eyes and the provenance report.
 *
 * The ledger:
 *   - total mass: the sum of every PLACED part's mass, one DERIVED quantity
 *     whose chain lists each contribution with its license tag. A part with a
 *     placement but no mass enters as ASSUMED 0 kg, loudly. A part with no
 *     placement is EXCLUDED from every published number (total, CG, axles) and
 *     said so — the charge reads "sum at positions", and a part without a
 *     position cannot be summed at one.
 *   - CG: mass-weighted mean of envelope centers at pose. Box convention
 *     matches @car/pack: an envelope's CENTER sits at pose.origin +
 *     envelope.offset; a part without an envelope contributes at its pose
 *     origin (its datum), which is the same as an offset-less envelope.
 *     CG coordinates are geometry — plain numbers; mass values stay Quantities.
 *   - axle loads: static two-axle balance (derivation in the comment above
 *     splitAxles), licensed arithmetic all the way down.
 *   - per-wheel: each axle's reaction split symmetrically over the wheels
 *     grouped on it (v1 — lateral CG offset does not shift wheel loads, stated
 *     so the lens never claims more than it computes); ok = load ≤ capacity.
 *   - targetGap = total − massTarget; positive means overweight. The mass
 *     target is the owner's, ASSUMED first, and iterates (charge §7, §8).
 *   - assumedOutstanding: every ASSUMED license note across part masses, the
 *     target, and wheel capacities — plus every ledger gap (missing mass,
 *     missing placement, missing wheels, degenerate axles, CG outside the
 *     wheelbase). Surfaced, never buried.
 *
 * Determinism: no clock, no randomness; parts are walked in canonical ID
 * order and wheels in canonical (station, label) order, so the entire result —
 * numbers, chains, and note strings — is invariant under input permutation.
 * Published CG coordinates canonicalize -0 to 0.
 */

import type {
  Id,
  PartInstance,
  Pose,
  Pt3,
  Quantity,
  SolveResult,
} from "@car/schema";
import {
  assumed,
  carriesAssumption,
  derived,
  qDiv,
  qScale,
  qSub,
} from "@car/demand";
import { add3, nabs } from "@car/num";

// ---------------------------------------------------------------------------
// Ledger policy — licensed like every other number in the cone (house rule:
// ASSUMED internal policy, surfaced here loudly instead of hiding as a bare
// literal; no external engineering source exists for an internal tolerance).
// ---------------------------------------------------------------------------

/**
 * Wheel stations spanning no more than this many millimeters read as ONE axle
 * (the two-axle balance then degenerates and the ledger says so); a wheel
 * sitting more than this off its axle group's mean station is flagged as a
 * grouping stretch (e.g. a genuine third axle folded into the two-axle v1).
 */
export const AXLE_GROUP_TOL_MM: number = assumed(
  50,
  "mm",
  "LEDGER POLICY (ASSUMED): axle-grouping tolerance — wheel stations spanning ≤ 50 mm are one axle, and a wheel > 50 mm off its group's mean station is flagged. No road vehicle has a 50 mm wheelbase; internal mass-ledger policy v1, no external engineering source exists.",
).value;

// ---------------------------------------------------------------------------
// Contract
// ---------------------------------------------------------------------------

/** A wheel the car stands on: world position and sidewall load capacity. */
export interface WheelStation {
  readonly label: string;
  /** World position, mm — only the X (station) enters the axle balance in v1. */
  readonly at: Pt3;
  /** From the load-index table on the tire entry (charge §5 wheels/tires). */
  readonly loadCapacityKg: Quantity<"kg">;
}

export interface MassLedgerInput {
  readonly parts: readonly PartInstance[];
  /** Poses per part id — wire SolveResult.placements straight in. */
  readonly placements: ReadonlyMap<Id, Pose>;
  /** Four expected on a car; any N ≥ 0 supported, degenerates reported. */
  readonly wheels: readonly WheelStation[];
  /** The owner's target (charge §7) — ASSUMED first, iterate, show the gap. */
  readonly massTarget: Quantity<"kg">;
}

export interface WheelLoadRow {
  readonly label: string;
  readonly load: Quantity<"kg">;
  readonly capacity: Quantity<"kg">;
  /** load ≤ capacity — the per-tire legality check (charge §8). */
  readonly ok: boolean;
}

export interface AxleLoads {
  readonly front: Quantity<"kg">;
  readonly rear: Quantity<"kg">;
}

export interface MassLedgerResult {
  readonly total: Quantity<"kg">;
  /** Mass-weighted mean of envelope centers at pose. Geometry: plain mm. */
  readonly cg: Pt3;
  readonly axleLoads: AxleLoads;
  /** Front-axle wheels first, then rear; canonical (station, label) order. */
  readonly perWheel: readonly WheelLoadRow[];
  /** total − massTarget; positive = overweight. Licensed DERIVED. */
  readonly targetGap: Quantity<"kg">;
  /** Every ASSUMED note and every ledger gap — surfaced, never buried. */
  readonly assumedOutstanding: readonly string[];
}

// ---------------------------------------------------------------------------
// Canonical orders and small helpers
// ---------------------------------------------------------------------------

/** Compare Ids kind-lexicographically, then by numeric suffix (part#9 < part#10). */
function idOrder(a: Id, b: Id): number {
  const ha = a.indexOf("#");
  const hb = b.indexOf("#");
  const ka = a.slice(0, ha);
  const kb = b.slice(0, hb);
  if (ka !== kb) return ka < kb ? -1 : 1;
  return Number(a.slice(ha + 1)) - Number(b.slice(hb + 1));
}

/** Canonical wheel order: station, then label, then capacity value. */
function wheelOrder(a: WheelStation, b: WheelStation): number {
  if (a.at[0] !== b.at[0]) return a.at[0] - b.at[0];
  if (a.label !== b.label) return a.label < b.label ? -1 : 1;
  return a.loadCapacityKg.value - b.loadCapacityKg.value;
}

/** Canonicalize -0 to 0 in published geometry (house rule, matches @car/pack). */
const canon = (x: number): number => (x === 0 ? 0 : x);

/** Envelope center at pose: pose.origin + envelope.offset (box-center convention). */
function centerAtPose(part: PartInstance, pose: Pose): Pt3 {
  const off = part.envelope?.offset;
  return off !== undefined ? add3(pose.origin, off) : pose.origin;
}

/** Square brackets in labels are neutralized inside license chains so an
 * adversarial label can never fake an "[ASSUMED]" ancestry marker. */
function chainSafe(label: string): string {
  return label.replaceAll("[", "(").replaceAll("]", ")");
}

/** License tag for a total chain entry; propagates assumption ancestry so
 * carriesAssumption(total) stays true when any input carries one. */
function tagMark(q: Quantity): string {
  if (q.license.tag === "ASSUMED") return "ASSUMED";
  return carriesAssumption(q) ? `${q.license.tag} carrying [ASSUMED]` : q.license.tag;
}

/** The strip line for an ASSUMED or assumption-carrying quantity, else undefined. */
function licenseLine(subject: string, q: Quantity): string | undefined {
  if (q.license.tag === "ASSUMED") return `${subject}: ASSUMED — ${q.license.note}`;
  if (q.license.tag === "DERIVED" && carriesAssumption(q)) {
    return `${subject}: DERIVED carrying [ASSUMED] — chain: ${q.license.chain}`;
  }
  return undefined;
}

function assertFinite3(p: Pt3, what: string): void {
  if (!Number.isFinite(p[0]) || !Number.isFinite(p[1]) || !Number.isFinite(p[2])) {
    throw new Error(`massLedger: non-finite coordinate in ${what}: [${p[0]}, ${p[1]}, ${p[2]}]`);
  }
}

// ---------------------------------------------------------------------------
// Axle split
// ---------------------------------------------------------------------------

/**
 * Static two-axle balance — the derivation, stated (charge §8):
 *
 *   Model: rigid car of total mass W resting on a front axle at station xF
 *   and a rear axle at station xR, CG at station xG. X is aft-positive, so
 *   the front axle is the smaller station. Reactions are reported directly
 *   in kg — g multiplies both sides of every equation and cancels.
 *
 *   Vertical equilibrium:      F_front + F_rear = W
 *   Moments about the rear axle contact:
 *                              F_front · (xR − xF) − W · (xR − xG) = 0
 *   ⇒  F_front = W · (xR − xG) / (xR − xF)
 *   ⇒  F_rear  = W − F_front  [= W · (xG − xF) / (xR − xF)]
 *
 *   xG inside [xF, xR] puts both reactions in [0, W]; xG outside the
 *   wheelbase turns one reaction negative — a wheel lifts — and the ledger
 *   reports the numbers as they fall and says so, rather than clamping.
 *
 * Wheels group to axles by nearest end station (ties go front). Per-wheel v1
 * is the symmetric split of the axle reaction over that axle's wheels;
 * lateral CG offset does not shift wheel loads in v1 — stated so the lens
 * never claims more than it computes.
 */
function splitAxles(
  total: Quantity<"kg">,
  cg: Pt3,
  wheels: readonly WheelStation[],
  hasPlacedMass: boolean,
  notes: string[],
): { front: Quantity<"kg">; rear: Quantity<"kg">; perWheel: WheelLoadRow[] } {
  const first = wheels[0];
  if (first === undefined) {
    notes.push(
      "LEDGER GAP — no wheel stations provided: axle loads are undefined and reported as ASSUMED 0 kg; per-wheel checks are skipped. Add wheels to stand the car on its tires.",
    );
    return {
      front: assumed(0, "kg", "no wheel stations provided — front axle load undefined, reported 0 kg"),
      rear: assumed(0, "kg", "no wheel stations provided — rear axle load undefined, reported 0 kg"),
      perWheel: [],
    };
  }

  let xMin = first.at[0];
  let xMax = first.at[0];
  for (const w of wheels) {
    const x = w.at[0];
    if (x < xMin) xMin = x;
    if (x > xMax) xMax = x;
  }

  const rows = (
    group: readonly WheelStation[],
    axleLoad: Quantity<"kg">,
    axleName: string,
  ): WheelLoadRow[] => {
    if (group.length === 0) return [];
    const count = derived(
      group.length,
      "count",
      `${group.length} wheel(s) grouped on the ${axleName} axle — per-wheel load is the symmetric split (mass ledger v1)`,
    );
    const per = qDiv(axleLoad, count, "kg");
    return group.map((w) => ({
      label: w.label,
      load: per,
      capacity: w.loadCapacityKg,
      ok: per.value <= w.loadCapacityKg.value,
    }));
  };

  // Degenerate: every wheel on one station — no second axle to balance against.
  if (xMax - xMin <= AXLE_GROUP_TOL_MM) {
    const station = meanStation(wheels);
    notes.push(
      `LEDGER GAP — all ${wheels.length} wheel(s) sit at one station (~${station} mm, span ${xMax - xMin} mm ≤ ${AXLE_GROUP_TOL_MM} mm): the two-axle balance is degenerate; the full total is reported on that axle as 'front' and rear reads 0 kg.`,
    );
    const front = qScale(
      total,
      derived(1, "ratio", `single axle at station ${station} mm carries the full total — no second axle exists to take moment against`),
    );
    return { front, rear: qSub(total, front), perWheel: rows(wheels, front, "single (reported as front)") };
  }

  // Partition by nearest end station; X is aft-positive so xMin is the front.
  const frontWheels: WheelStation[] = [];
  const rearWheels: WheelStation[] = [];
  for (const w of wheels) {
    const x = w.at[0];
    if (x - xMin <= xMax - x) frontWheels.push(w);
    else rearWheels.push(w);
  }
  const xF = meanStation(frontWheels);
  const xR = meanStation(rearWheels);
  for (const [group, station, name] of [
    [frontWheels, xF, "front"],
    [rearWheels, xR, "rear"],
  ] as const) {
    for (const w of group) {
      if (nabs(w.at[0] - station) > AXLE_GROUP_TOL_MM) {
        notes.push(
          `wheel '${w.label}' sits ${nabs(w.at[0] - station)} mm off the ${name} axle group's mean station (${station} mm) — grouped into the two-axle balance anyway (v1 supports exactly two axles; a genuine third axle reads as a stretch here).`,
        );
      }
    }
  }

  if (!hasPlacedMass) {
    // CG is a placeholder with zero placed mass — a moment ratio from it would
    // look plausible and mean nothing. The zero total rides 'front' by stated
    // convention; every published load is 0 kg either way.
    const front = qScale(
      total,
      derived(1, "ratio", "no placed mass on the ledger — the moment balance is degenerate; the zero total is reported on the front axle by convention"),
    );
    const rear = qSub(total, front);
    return {
      front,
      rear,
      perWheel: [...rows(frontWheels, front, "front"), ...rows(rearWheels, rear, "rear")],
    };
  }

  const xG = cg[0];
  const ratioFront = (xR - xG) / (xR - xF);
  if (ratioFront < 0 || ratioFront > 1) {
    notes.push(
      `CG station ${xG} mm lies OUTSIDE the wheelbase [${xF}, ${xR}] mm — a static axle load is negative (a wheel lifts); the ledger reports the numbers as they fall.`,
    );
  }
  const front = qScale(
    total,
    derived(
      ratioFront,
      "ratio",
      `static two-axle moment balance about the rear contact: (xRear − xCG)/(xRear − xFront) = (${xR} − ${xG})/(${xR} − ${xF}) mm/mm`,
    ),
  );
  const rear = qSub(total, front); // vertical equilibrium: F_front + F_rear = W
  return {
    front,
    rear,
    perWheel: [...rows(frontWheels, front, "front"), ...rows(rearWheels, rear, "rear")],
  };
}

function meanStation(group: readonly WheelStation[]): number {
  let s = 0;
  for (const w of group) s += w.at[0];
  return s / group.length;
}

// ---------------------------------------------------------------------------
// The ledger
// ---------------------------------------------------------------------------

export function massLedger(input: MassLedgerInput): MassLedgerResult {
  // -- validate: duplicates and non-finite geometry are programming errors ----
  const seen = new Set<Id>();
  for (const p of input.parts) {
    if (seen.has(p.id)) throw new Error(`massLedger: duplicate part id ${p.id}`);
    seen.add(p.id);
    const off = p.envelope?.offset;
    if (off !== undefined) assertFinite3(off, `envelope offset of ${p.id}`);
  }
  for (const [id, pose] of input.placements) assertFinite3(pose.origin, `pose of ${id}`);
  for (const w of input.wheels) assertFinite3(w.at, `wheel '${w.label}' position`);

  const partNotes: string[] = [];
  const structureNotes: string[] = [];

  // -- walk parts in canonical ID order: masses, licenses, placements --------
  const parts = [...input.parts].sort((a, b) => idOrder(a.id, b.id));
  const chainEntries: string[] = [];
  const excludedEntries: string[] = [];
  let sum = 0;
  let mx = 0;
  let my = 0;
  let mz = 0;
  for (const p of parts) {
    const massQ =
      p.mass ??
      assumed(
        0,
        "kg",
        `part ${p.id} '${p.label}' carries NO mass — counted as 0 kg; charge §8 requires every part to carry mass (derived from volume × material density, or sourced from its entry)`,
      );
    const line = licenseLine(`${p.id} '${p.label}' mass ${massQ.value} kg`, massQ);
    if (line !== undefined) partNotes.push(line);

    const pose = input.placements.get(p.id);
    if (pose === undefined) {
      partNotes.push(
        `part ${p.id} '${p.label}' (${massQ.value} kg) has NO placement — EXCLUDED from the ledger: total, CG, and axle loads omit it until it is placed (the charge sums at positions).`,
      );
      excludedEntries.push(`${p.id} '${chainSafe(p.label)}' ${massQ.value}kg`);
      continue;
    }
    const center = centerAtPose(p, pose);
    sum += massQ.value;
    mx += massQ.value * center[0];
    my += massQ.value * center[1];
    mz += massQ.value * center[2];
    chainEntries.push(`${p.id} '${chainSafe(p.label)}' ${massQ.value}kg[${tagMark(massQ)}]`);
  }

  // -- total: one DERIVED quantity, the chain listing every contribution -----
  const excludedSuffix =
    excludedEntries.length === 0 ? "" : `; EXCLUDED (no placement): ${excludedEntries.join(", ")}`;
  const total = derived(
    sum,
    "kg",
    chainEntries.length === 0
      ? `sum of placed part masses at positions: none placed — total 0 kg${excludedSuffix}`
      : `sum of placed part masses at positions: ${chainEntries.join(" + ")}${excludedSuffix}`,
  );

  // -- CG: mass-weighted mean of envelope centers at pose (plain geometry) ---
  const hasPlacedMass = sum > 0;
  const cg: Pt3 = hasPlacedMass ? [canon(mx / sum), canon(my / sum), canon(mz / sum)] : [0, 0, 0];
  assertFinite3(cg, "computed CG");
  if (!hasPlacedMass) {
    structureNotes.push(
      "LEDGER GAP — no placed mass on the ledger: CG is reported at the origin as a placeholder and means nothing yet.",
    );
  }

  // -- axle balance and per-wheel checks -------------------------------------
  const wheels = [...input.wheels].sort(wheelOrder);
  const axleNotes: string[] = [];
  const { front, rear, perWheel } = splitAxles(total, cg, wheels, hasPlacedMass, axleNotes);

  // -- target gap: total − target, positive = overweight ---------------------
  const targetGap = qSub(total, input.massTarget);

  // -- outstanding strip: parts, target, wheel capacities, structure gaps ----
  const targetLine = licenseLine(
    `mass target ${input.massTarget.value} kg (owner's brief)`,
    input.massTarget,
  );
  const wheelNotes: string[] = [];
  for (const w of wheels) {
    const line = licenseLine(
      `wheel '${w.label}' load capacity ${w.loadCapacityKg.value} kg`,
      w.loadCapacityKg,
    );
    if (line !== undefined) wheelNotes.push(line);
  }
  const assumedOutstanding = [
    ...partNotes,
    ...(targetLine !== undefined ? [targetLine] : []),
    ...wheelNotes,
    ...structureNotes,
    ...axleNotes,
  ];

  return { total, cg, axleLoads: { front, rear }, perWheel, targetGap, assumedOutstanding };
}

// ---------------------------------------------------------------------------
// Clearance readback — the solver's clamps and violations, formatted for the
// ledger strip. Plain strings; read-only over SolveResult.
// ---------------------------------------------------------------------------

export interface ClearanceReadback {
  /** One line per solver violation: kind, demand (when the violation carries
   * one), the parts involved, and the solver's detail prose — which itself
   * states the demand's principal (see @car/pack audit messages). */
  readonly violations: readonly string[];
  /** One line per active clamp, each naming demand, principal, and reason,
   * plus the bound value with its unit and license tag. */
  readonly clamps: readonly string[];
}

export function clearanceReadback(solve: SolveResult): ClearanceReadback {
  const violations = solve.violations.map((v) => {
    const dem = v.demandId !== undefined ? ` ${v.demandId}` : "";
    const parts = v.partIds.length === 0 ? "" : ` [${v.partIds.join(", ")}]`;
    return `VIOLATION ${v.kind}${dem}${parts} — ${v.detail}`;
  });
  const clamps = solve.clamps.map(
    (c) =>
      `CLAMP ${c.demandId} (principal: ${c.principal}) at ${c.boundValue.value} ${c.boundValue.unit} [${c.boundValue.license.tag}] — ${c.reason}`,
  );
  return { violations, clamps };
}
