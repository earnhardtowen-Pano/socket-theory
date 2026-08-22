/**
 * @car/pack — the blind packaging solver.
 *
 * Blindness is law, three layers:
 *   1. the records consumed here (@car/schema) carry no part-type field —
 *      there is structurally nothing to branch on;
 *   2. imports are @car/schema, @car/num, @car/demand and this package's own
 *      files only — the CI boundary lint fails anything else;
 *   3. the rename-fuzz test (test/blindness.test.ts) proves behavior is
 *      invariant under arbitrary relabeling. Labels and port names are opaque
 *      strings: echoed into SnapPoint labels and violation prose, never read.
 *
 * v1 semantics (translation-only poses per the schema):
 *   - MATE CLOSURE: fixed parts pin the graph; BFS in ID-sorted order assigns
 *     origins by poseA + a.port.origin + offset = poseB + b.port.origin.
 *     Paths disagreeing beyond MATE_AGREEMENT_TOL_MM are a typed violation
 *     naming both placements. The closed SolveViolation kind set carries no
 *     mate kind, so conflicts are typed "unplaced" — an over-determined part
 *     is not soundly placed. Mated-but-unreachable parts are typed
 *     "unplaced" and omitted from placements; mate-less, un-fixed parts are
 *     FREE — placed at the world origin, movable by the inequality phase.
 *   - INEQUALITIES: deterministic capped Gauss-Seidel projection (see
 *     inequalities.ts): clearance, band, protected-zone. World demands have
 *     no owner and apply to every placed part. routed-path, swept-envelope,
 *     and aperture demands are accepted but NOT enforced in v1 — stated so
 *     the tool never claims a capability it lacks.
 *   - BOX CONVENTION: a BoxShape's CENTER sits at carrier + offset with
 *     half-extents size/2 (part shapes ride the pose origin, member boxes
 *     ride member.at, world shapes ride the world origin).
 *   - ANCHORAGE LAW: every massBearing demand's anchor point must land
 *     inside a reinforced member — typed violation otherwise, never a crash.
 *   - OUTPUTS: placements for every placed part; hardPoints = every port
 *     origin at pose (label = port name) plus every point-at demand (carrying
 *     its demandId); clamps = every active bound, attributed via clamp();
 *     closed = no violations of any kind.
 *   - DETERMINISM: identical inputs give bit-identical results. ID-sorted
 *     iteration, fixed pass caps, no wall clock, no randomness; -0 is
 *     canonicalized to 0 in all published coordinates.
 */

import type {
  Id,
  PartInstance,
  Pose,
  Pt3,
  SnapPoint,
  SolveInput,
  SolveResult,
  SolveViolation,
} from "@car/schema";
import { add3 } from "@car/num";
import { ORIGIN3, canon3, idCompare } from "./geometry.js";
import { closeMates } from "./closure.js";
import { auditInequalities, project } from "./inequalities.js";
import { auditAnchorage } from "./anchorage.js";
import { anchorPointOf, makeState, sortedDemands, type PackState } from "./state.js";

export { MATE_AGREEMENT_TOL_MM, CONTACT_TOL_MM, PROJECTION_PASS_CAP } from "./policy.js";
export { idCompare, worldBox, containsPoint, pointBoxDistance, type WorldBox } from "./geometry.js";
export { mateName } from "./closure.js";

/** Malformed input (dangling references, duplicates) — thrown, since the
 * input is a programming error upstream, not a solvable packaging state. */
export class PackInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PackInputError";
  }
}

function validate(input: SolveInput): Map<Id, PartInstance> {
  const parts = new Map<Id, PartInstance>();
  for (const p of input.parts) {
    if (parts.has(p.id)) throw new PackInputError(`duplicate part id ${p.id}`);
    parts.set(p.id, p);
  }
  for (const id of input.fixed.keys()) {
    if (!parts.has(id)) throw new PackInputError(`fixed pose names unknown part ${id}`);
  }
  input.mates.forEach((m, i) => {
    if (m.a.partId === m.b.partId) {
      throw new PackInputError(`mate[${i}] joins part ${m.a.partId} to itself`);
    }
    for (const ref of [m.a, m.b]) {
      const part = parts.get(ref.partId);
      if (part === undefined) {
        throw new PackInputError(`mate[${i}] references unknown part ${ref.partId}`);
      }
      if (!part.ports.some((pt) => pt.id === ref.portId)) {
        throw new PackInputError(
          `mate[${i}] references unknown port ${ref.portId} on part ${ref.partId}`,
        );
      }
    }
  });
  return parts;
}

function buildHardPoints(state: PackState, input: SolveInput): SnapPoint[] {
  const out: SnapPoint[] = [];
  for (const pid of state.placedIds) {
    const part = state.parts.get(pid);
    const origin = state.origins.get(pid);
    if (part === undefined || origin === undefined) continue;
    for (const port of [...part.ports].sort((a, b) => idCompare(a.id, b.id))) {
      out.push({ at: canon3(add3(origin, port.frame.origin)), label: port.name });
    }
  }
  for (const pid of state.placedIds) {
    const part = state.parts.get(pid);
    const origin = state.origins.get(pid);
    if (part === undefined || origin === undefined) continue;
    for (const d of sortedDemands(part)) {
      if (d.kind !== "point-at") continue;
      out.push({ at: canon3(anchorPointOf(part, d, origin)), demandId: d.id });
    }
  }
  for (const d of [...input.worldDemands].sort((a, b) => idCompare(a.id, b.id))) {
    if (d.kind !== "point-at") continue;
    const at: Pt3 =
      d.shape !== undefined && d.shape.kind === "box" && d.shape.offset !== undefined
        ? d.shape.offset
        : ORIGIN3;
    out.push({ at: canon3(at), demandId: d.id });
  }
  return out;
}

export function solve(input: SolveInput): SolveResult {
  const partsById = validate(input);
  const portOrigin = (partId: Id, portId: Id): Pt3 => {
    const part = partsById.get(partId);
    const port = part?.ports.find((p) => p.id === portId);
    if (port === undefined) throw new PackInputError(`unknown port ${portId} on ${partId}`);
    return port.frame.origin;
  };

  const closure = closeMates(input, portOrigin);
  const state = makeState(input, partsById, closure.origins, closure.pinned);
  project(state, input);
  const inequalities = auditInequalities(state, input);
  const anchorage = auditAnchorage(state, input.members);

  const violations: SolveViolation[] = [
    ...closure.violations,
    ...inequalities.violations,
    ...anchorage,
  ];

  const placements = new Map<Id, Pose>();
  for (const pid of state.placedIds) {
    const origin = state.origins.get(pid);
    if (origin !== undefined) placements.set(pid, { origin: canon3(origin) });
  }

  return {
    placements,
    clamps: inequalities.clamps,
    violations,
    hardPoints: buildHardPoints(state, input),
    closed: violations.length === 0,
  };
}
