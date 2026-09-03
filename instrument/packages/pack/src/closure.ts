/**
 * Mate closure — translation-only pose assignment.
 *
 * Fixed parts pin the graph. Breadth-first traversal from the fixed parts in
 * ID-sorted order assigns each reached part's origin by the port equality
 *
 *     poseA.origin + a.port.origin + offset = poseB.origin + b.port.origin
 *
 * When two paths disagree beyond MATE_AGREEMENT_TOL_MM the conflict is a
 * typed violation naming both placements (the mate being checked and whatever
 * placed each endpoint — an earlier mate or a fixed pose). The first
 * assignment stands so the result stays deterministic.
 *
 * A part WITH mates that is not reachable from any fixed part is typed
 * "unplaced". A part with NO mates and no fixed pose is FREE: it starts at
 * the world origin and only the inequality projection may move it.
 */

import type { Id, Mate, Pt3, SolveInput, SolveViolation } from "@car/schema";
import { add3, dist3, sub3 } from "@car/num";
import { ORIGIN3, idCompare, sortIds } from "./geometry.js";
import { MATE_AGREEMENT_TOL_MM } from "./policy.js";

export interface ClosureOutcome {
  readonly origins: Map<Id, Pt3>;
  /** What placed each part: "fixed-pose(...)", a mate name, or free-at-origin. */
  readonly placedBy: ReadonlyMap<Id, string>;
  readonly pinned: ReadonlySet<Id>;
  readonly violations: readonly SolveViolation[];
}

export function mateName(m: Mate): string {
  return `mate(${m.a.partId}.${m.a.portId} -> ${m.b.partId}.${m.b.portId})`;
}

interface Adjacent {
  readonly mate: Mate;
  readonly index: number;
}

export function closeMates(
  input: SolveInput,
  portOrigin: (partId: Id, portId: Id) => Pt3,
): ClosureOutcome {
  const origins = new Map<Id, Pt3>();
  const placedBy = new Map<Id, string>();
  const pinned = new Set<Id>();
  const violations: SolveViolation[] = [];

  // Adjacency, deterministically ordered: by the far part's id, then by the
  // mate's position in the input list.
  const adjacency = new Map<Id, Adjacent[]>();
  input.mates.forEach((mate, index) => {
    for (const end of [mate.a.partId, mate.b.partId]) {
      const list = adjacency.get(end) ?? [];
      list.push({ mate, index });
      adjacency.set(end, list);
    }
  });
  for (const [pid, list] of adjacency) {
    list.sort((x, y) => {
      const farX = x.mate.a.partId === pid ? x.mate.b.partId : x.mate.a.partId;
      const farY = y.mate.a.partId === pid ? y.mate.b.partId : y.mate.a.partId;
      const c = idCompare(farX, farY);
      return c !== 0 ? c : x.index - y.index;
    });
  }

  const fixedIds = sortIds(input.fixed.keys());
  for (const id of fixedIds) {
    const pose = input.fixed.get(id);
    if (pose === undefined) continue; // unreachable; keys came from the map
    origins.set(id, pose.origin);
    placedBy.set(id, `fixed-pose(${id})`);
    pinned.add(id);
  }

  const queue: Id[] = [...fixedIds];
  const processed = new Set<number>();
  while (queue.length > 0) {
    const cur = queue.shift();
    if (cur === undefined) break;
    for (const { mate, index } of adjacency.get(cur) ?? []) {
      if (processed.has(index)) continue;
      processed.add(index);
      const off = mate.offset ?? ORIGIN3;
      const aId = mate.a.partId;
      const bId = mate.b.partId;
      const aLocal = portOrigin(aId, mate.a.portId);
      const bLocal = portOrigin(bId, mate.b.portId);
      const aPose = origins.get(aId);
      const bPose = origins.get(bId);
      if (aPose !== undefined && bPose !== undefined) {
        const lhs = add3(add3(aPose, aLocal), off);
        const rhs = add3(bPose, bLocal);
        const gap = dist3(lhs, rhs);
        if (gap > MATE_AGREEMENT_TOL_MM) {
          violations.push({
            kind: "unplaced",
            detail:
              `mate conflict: ${mateName(mate)} disagrees with the placements already made by ` +
              `${placedBy.get(aId)} and ${placedBy.get(bId)} — the port equality misses by ${gap} mm`,
            partIds: [aId, bId],
          });
        }
      } else if (aPose !== undefined) {
        const origin = sub3(add3(add3(aPose, aLocal), off), bLocal);
        origins.set(bId, origin);
        placedBy.set(bId, mateName(mate));
        pinned.add(bId);
        queue.push(bId);
      } else if (bPose !== undefined) {
        const origin = sub3(sub3(add3(bPose, bLocal), off), aLocal);
        origins.set(aId, origin);
        placedBy.set(aId, mateName(mate));
        pinned.add(aId);
        queue.push(aId);
      }
      // Neither endpoint placed cannot occur: cur is placed and is an endpoint.
    }
  }

  for (const part of [...input.parts].sort((x, y) => idCompare(x.id, y.id))) {
    if (origins.has(part.id)) continue;
    if ((adjacency.get(part.id) ?? []).length > 0) {
      violations.push({
        kind: "unplaced",
        detail: `part ${part.id} is not reachable from any fixed part through mates — its pose is unconstrained and it was not placed`,
        partIds: [part.id],
      });
    } else {
      origins.set(part.id, ORIGIN3);
      placedBy.set(part.id, `free-at-origin(${part.id})`);
    }
  }

  return { origins, placedBy, pinned, violations };
}
