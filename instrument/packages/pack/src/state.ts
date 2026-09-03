/**
 * @car/pack solver state — the mutable placement table plus the derived,
 * ID-sorted views every phase iterates over. Labels are carried only to be
 * echoed into outputs; nothing in this package reads them for behavior.
 */

import type { BoxShape, DemandRecord, Id, PartInstance, Pt3, SolveInput } from "@car/schema";
import { add3 } from "@car/num";
import { idCompare, sortIds, worldBox, type WorldBox } from "./geometry.js";

export interface PackState {
  readonly parts: ReadonlyMap<Id, PartInstance>;
  /** part id -> pose origin (world mm). Mutable during projection only. */
  readonly origins: Map<Id, Pt3>;
  /** Transitively pinned: fixed parts plus everything mate-reached from them. */
  readonly pinned: ReadonlySet<Id>;
  /** Placed but not pinned — the only parts the inequality phase may move. */
  readonly free: ReadonlySet<Id>;
  /** Every placed part, ID-sorted; the master iteration order. */
  readonly placedIds: readonly Id[];
  /** Unordered pair keys of directly mated parts (clearance exemption). */
  readonly matedPairs: ReadonlySet<string>;
}

export function pairKey(a: Id, b: Id): string {
  return idCompare(a, b) <= 0 ? `${a}~${b}` : `${b}~${a}`;
}

export function isMated(state: PackState, a: Id, b: Id): boolean {
  return state.matedPairs.has(pairKey(a, b));
}

export function makeState(
  input: SolveInput,
  parts: ReadonlyMap<Id, PartInstance>,
  origins: Map<Id, Pt3>,
  pinned: ReadonlySet<Id>,
): PackState {
  const matedPairs = new Set<string>();
  for (const m of input.mates) matedPairs.add(pairKey(m.a.partId, m.b.partId));
  const free = new Set<Id>();
  for (const id of origins.keys()) {
    if (!pinned.has(id)) free.add(id);
  }
  return { parts, origins, pinned, free, placedIds: sortIds(origins.keys()), matedPairs };
}

export function sortedDemands(part: PartInstance): DemandRecord[] {
  return [...part.demands].sort((a, b) => idCompare(a.id, b.id));
}

/**
 * The box a part claims: the envelope field when present, else the first
 * (ID-sorted) envelope-kind demand carrying a box shape, else none.
 */
export function envelopeShapeOf(part: PartInstance): BoxShape | undefined {
  if (part.envelope !== undefined) return part.envelope;
  for (const d of sortedDemands(part)) {
    if (d.kind === "envelope" && d.shape !== undefined && d.shape.kind === "box") return d.shape;
  }
  return undefined;
}

/**
 * A part's envelope in world space. A part without any envelope is treated as
 * a degenerate point box at its pose origin — it can still trip clearances.
 */
export function worldEnvelope(state: PackState, id: Id): WorldBox {
  const part = state.parts.get(id);
  const origin = state.origins.get(id);
  if (part === undefined || origin === undefined) {
    throw new Error(`worldEnvelope: ${id} is not a placed part`);
  }
  const shape = envelopeShapeOf(part);
  return shape !== undefined ? worldBox(shape, origin) : { center: origin, half: [0, 0, 0] };
}

export function translatePart(state: PackState, id: Id, delta: Pt3): void {
  const origin = state.origins.get(id);
  if (origin === undefined) throw new Error(`translatePart: ${id} is not a placed part`);
  state.origins.set(id, add3(origin, delta));
}

/** Magnitude in mm; a demand without a magnitude binds at zero gap. */
export function magnitudeMm(d: DemandRecord): number {
  return d.magnitude?.value ?? 0;
}

/**
 * Anchor point of a demand at a pose: the shape offset at pose when the
 * demand's box shape names one, else the part's first (ID-sorted) port origin
 * at pose, else the pose origin itself.
 */
export function anchorPointOf(part: PartInstance, d: DemandRecord, origin: Pt3): Pt3 {
  if (d.shape !== undefined && d.shape.kind === "box" && d.shape.offset !== undefined) {
    return add3(origin, d.shape.offset);
  }
  const ports = [...part.ports].sort((a, b) => idCompare(a.id, b.id));
  const first = ports[0];
  return first !== undefined ? add3(origin, first.frame.origin) : origin;
}
