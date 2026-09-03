/**
 * Inequality phase — deterministic Gauss-Seidel projection, then an audit.
 *
 * Projection (fixed pass cap, ID-sorted traversal, only FREE parts move):
 *   - band: clamp the constrained part's envelope Z-range into [zMin, zMax];
 *   - clearance: the demanding part's envelope inflated by its magnitude must
 *     not intersect any other part's envelope (directly mated neighbors are
 *     exempt — they legitimately meet at the shared face); on intersection
 *     the free party is pushed along the smallest-violation axis so the gap
 *     lands exactly at the demanded clearance;
 *   - protected-zone: keep-out boxes, same push treatment; a part-owned zone
 *     rides its owner, a world zone is pinned at the world origin.
 *
 * Audit (after the passes): every bound sitting exactly at contact becomes a
 * ClampAttribution via clamp() from @car/demand; every residual breach —
 * including any push chain pinned at both ends, which the projection could
 * not move — becomes a typed violation. Nothing is iterated away silently.
 *
 * World demands have no owning part, so they apply to every placed part.
 * routed-path, swept-envelope, and aperture demands are accepted but NOT
 * enforced in v1 — stated here so the tool never claims a capability it lacks.
 */

import type {
  BandShape,
  BoxShape,
  ClampAttribution,
  DemandRecord,
  Id,
  Quantity,
  SolveInput,
  SolveViolation,
} from "@car/schema";
import { clamp as attributeClamp, derived } from "@car/demand";
import { nabs } from "@car/num";
import {
  ORIGIN3,
  idCompare,
  inflate,
  intersects,
  minPenetration,
  penetrations,
  worldBox,
  type WorldBox,
} from "./geometry.js";
import {
  isMated,
  magnitudeMm,
  sortedDemands,
  translatePart,
  worldEnvelope,
  type PackState,
} from "./state.js";
import { CONTACT_TOL_MM, PROJECTION_PASS_CAP } from "./policy.js";

export interface InequalityAudit {
  readonly clamps: readonly ClampAttribution[];
  readonly violations: readonly SolveViolation[];
}

interface PartConstraint {
  readonly partId: Id;
  readonly demand: DemandRecord;
}

function orderedWorldDemands(input: SolveInput): DemandRecord[] {
  return [...input.worldDemands].sort((a, b) => idCompare(a.id, b.id));
}

function orderedPartConstraints(state: PackState): PartConstraint[] {
  const out: PartConstraint[] = [];
  for (const partId of state.placedIds) {
    const part = state.parts.get(partId);
    if (part === undefined) continue;
    for (const demand of sortedDemands(part)) out.push({ partId, demand });
  }
  return out;
}

/**
 * Push `targetId` so `targetBox` (which rides it) exits `otherBox` along the
 * smallest-penetration axis, landing at exact face contact. Direction moves
 * the target away from the other box's center; a dead tie pushes positive.
 */
function pushApart(state: PackState, targetId: Id, targetBox: WorldBox, otherBox: WorldBox): void {
  const pen = penetrations(targetBox, otherBox);
  let axis = 0;
  if (pen[1] < pen[axis]!) axis = 1;
  if (pen[2] < pen[axis]!) axis = 2;
  const sign = targetBox.center[axis]! >= otherBox.center[axis]! ? 1 : -1;
  const delta: [number, number, number] = [0, 0, 0];
  delta[axis] = sign * pen[axis]!;
  translatePart(state, targetId, delta);
}

/** Project a part into a Z band. Returns true when the part moved. */
function projectBand(state: PackState, partId: Id, band: BandShape): boolean {
  if (!state.free.has(partId)) return false;
  const env = worldEnvelope(state, partId);
  const hi = env.center[2] + env.half[2];
  const lo = env.center[2] - env.half[2];
  const zMax = band.zMax.value;
  const zMin = band.zMin.value;
  let dz = 0;
  if (hi > zMax) dz = zMax - hi;
  if (lo + dz < zMin) dz += zMin - (lo + dz);
  if (dz === 0) return false;
  translatePart(state, partId, [0, 0, dz]);
  return true;
}

function projectClearance(state: PackState, aId: Id, d: DemandRecord): boolean {
  const mag = magnitudeMm(d);
  let moved = false;
  for (const bId of state.placedIds) {
    if (bId === aId || isMated(state, aId, bId)) continue;
    const boxA = inflate(worldEnvelope(state, aId), mag);
    const boxB = worldEnvelope(state, bId);
    if (!intersects(boxA, boxB)) continue;
    if (state.free.has(bId)) {
      pushApart(state, bId, boxB, boxA);
      moved = true;
    } else if (state.free.has(aId)) {
      pushApart(state, aId, boxA, boxB);
      moved = true;
    }
    // Both pinned: the audit records the violation; nothing moves.
  }
  return moved;
}

function projectPartZone(state: PackState, aId: Id, d: DemandRecord, shape: BoxShape): boolean {
  const mag = magnitudeMm(d);
  let moved = false;
  for (const bId of state.placedIds) {
    if (bId === aId || isMated(state, aId, bId)) continue;
    const ownerOrigin = state.origins.get(aId);
    if (ownerOrigin === undefined) continue;
    const zone = inflate(worldBox(shape, ownerOrigin), mag);
    const envB = worldEnvelope(state, bId);
    if (!intersects(zone, envB)) continue;
    if (state.free.has(bId)) {
      pushApart(state, bId, envB, zone);
      moved = true;
    } else if (state.free.has(aId)) {
      pushApart(state, aId, zone, envB);
      moved = true;
    }
  }
  return moved;
}

function projectWorldZone(state: PackState, d: DemandRecord, shape: BoxShape): boolean {
  const zone = inflate(worldBox(shape, ORIGIN3), magnitudeMm(d));
  let moved = false;
  for (const pid of state.placedIds) {
    const env = worldEnvelope(state, pid);
    if (!intersects(zone, env)) continue;
    if (state.free.has(pid)) {
      pushApart(state, pid, env, zone);
      moved = true;
    }
  }
  return moved;
}

/** Run the capped projection passes. Mutates state.origins for free parts only. */
export function project(state: PackState, input: SolveInput): void {
  const worldOrdered = orderedWorldDemands(input);
  const partOrdered = orderedPartConstraints(state);
  for (let pass = 0; pass < PROJECTION_PASS_CAP; pass++) {
    let moved = false;
    for (const d of worldOrdered) {
      if (d.kind === "band" && d.shape !== undefined && d.shape.kind === "band") {
        for (const pid of state.placedIds) {
          if (projectBand(state, pid, d.shape)) moved = true;
        }
      } else if (d.kind === "protected-zone" && d.shape !== undefined && d.shape.kind === "box") {
        if (projectWorldZone(state, d, d.shape)) moved = true;
      }
    }
    for (const { partId, demand } of partOrdered) {
      if (demand.kind === "band" && demand.shape !== undefined && demand.shape.kind === "band") {
        if (projectBand(state, partId, demand.shape)) moved = true;
      } else if (demand.kind === "clearance") {
        if (projectClearance(state, partId, demand)) moved = true;
      } else if (
        demand.kind === "protected-zone" &&
        demand.shape !== undefined &&
        demand.shape.kind === "box"
      ) {
        if (projectPartZone(state, partId, demand, demand.shape)) moved = true;
      }
    }
    if (!moved) break;
  }
}

function contactBound(d: DemandRecord, what: string): Quantity {
  return (
    d.magnitude ??
    derived(0, "mm", `${what} demand ${d.id} carries no magnitude — the bound is zero-gap contact at the face`)
  );
}

/** Audit the final state: attribute active clamps, report residual breaches. */
export function auditInequalities(state: PackState, input: SolveInput): InequalityAudit {
  const clamps: ClampAttribution[] = [];
  const clampSeen = new Set<string>();
  const violations: SolveViolation[] = [];

  const addClamp = (key: string, bound: Quantity, d: DemandRecord): void => {
    if (clampSeen.has(key)) return;
    clampSeen.add(key);
    clamps.push(attributeClamp(bound, d));
  };

  const auditBand = (pid: Id, d: DemandRecord, band: BandShape): void => {
    const env = worldEnvelope(state, pid);
    const hi = env.center[2] + env.half[2];
    const lo = env.center[2] - env.half[2];
    const zMax = band.zMax.value;
    const zMin = band.zMin.value;
    const overTop = hi - zMax;
    const underBottom = zMin - lo;
    if (overTop > CONTACT_TOL_MM || underBottom > CONTACT_TOL_MM) {
      violations.push({
        kind: "band",
        demandId: d.id,
        partIds: [pid],
        detail:
          `band ${d.id} (principal: ${d.principal}): part ${pid} envelope spans z [${lo}, ${hi}] mm, ` +
          `outside [${zMin}, ${zMax}] mm` +
          (state.free.has(pid) ? "" : " — the part is pinned and could not be clamped"),
      });
    }
    if (nabs(overTop) <= CONTACT_TOL_MM) addClamp(`${d.id}@zMax`, band.zMax, d);
    if (nabs(underBottom) <= CONTACT_TOL_MM) addClamp(`${d.id}@zMin`, band.zMin, d);
  };

  const auditClearance = (aId: Id, d: DemandRecord): void => {
    const mag = magnitudeMm(d);
    for (const bId of state.placedIds) {
      if (bId === aId || isMated(state, aId, bId)) continue;
      const boxA = inflate(worldEnvelope(state, aId), mag);
      const boxB = worldEnvelope(state, bId);
      const pen = minPenetration(boxA, boxB);
      if (pen > CONTACT_TOL_MM) {
        violations.push({
          kind: "clearance",
          demandId: d.id,
          partIds: [aId, bId],
          detail:
            `clearance ${d.id} (principal: ${d.principal}): ${aId} demands ${mag} mm of air but ` +
            `${bId} penetrates the inflated envelope by ${pen} mm` +
            (state.free.has(aId) || state.free.has(bId)
              ? ""
              : " — both ends of the push chain are pinned; nothing could move"),
        });
      } else if (nabs(pen) <= CONTACT_TOL_MM) {
        addClamp(`${d.id}@clearance`, contactBound(d, "clearance"), d);
      }
    }
  };

  const auditZoneIntruder = (
    intruderId: Id,
    d: DemandRecord,
    zone: WorldBox,
    ownerId: Id | undefined,
  ): void => {
    const env = worldEnvelope(state, intruderId);
    const pen = minPenetration(zone, env);
    if (pen > CONTACT_TOL_MM) {
      const chain =
        (ownerId === undefined || !state.free.has(ownerId)) && !state.free.has(intruderId)
          ? " — both ends of the push chain are pinned; nothing could move"
          : "";
      violations.push({
        kind: "protected-zone",
        demandId: d.id,
        partIds: ownerId !== undefined ? [ownerId, intruderId] : [intruderId],
        detail:
          `protected-zone ${d.id} (principal: ${d.principal}): ${intruderId} penetrates the ` +
          `keep-out box by ${pen} mm${chain}`,
      });
    } else if (nabs(pen) <= CONTACT_TOL_MM) {
      addClamp(`${d.id}@zone`, contactBound(d, "protected-zone"), d);
    }
  };

  for (const d of orderedWorldDemands(input)) {
    if (d.kind === "band" && d.shape !== undefined && d.shape.kind === "band") {
      for (const pid of state.placedIds) auditBand(pid, d, d.shape);
    } else if (d.kind === "protected-zone" && d.shape !== undefined && d.shape.kind === "box") {
      const zone = inflate(worldBox(d.shape, ORIGIN3), magnitudeMm(d));
      for (const pid of state.placedIds) auditZoneIntruder(pid, d, zone, undefined);
    }
  }
  for (const { partId, demand } of orderedPartConstraints(state)) {
    if (demand.kind === "band" && demand.shape !== undefined && demand.shape.kind === "band") {
      auditBand(partId, demand, demand.shape);
    } else if (demand.kind === "clearance") {
      auditClearance(partId, demand);
    } else if (
      demand.kind === "protected-zone" &&
      demand.shape !== undefined &&
      demand.shape.kind === "box"
    ) {
      const ownerOrigin = state.origins.get(partId);
      if (ownerOrigin === undefined) continue;
      const zone = inflate(worldBox(demand.shape, ownerOrigin), magnitudeMm(demand));
      for (const bId of state.placedIds) {
        if (bId === partId || isMated(state, partId, bId)) continue;
        auditZoneIntruder(bId, demand, zone, partId);
      }
    }
  }

  return { clamps, violations };
}
