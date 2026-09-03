/**
 * Shared fixtures for @car/lens tests. Test files are exempt from the
 * bare-constants lint; quantities still go through the factories because the
 * branded Quantity type admits no other constructor. Neutral fixture values
 * use derived() (an ASSUMED fixture mass would rightly show up in the
 * outstanding strip and pollute the negative tests).
 */

import type { BoxShape, Id, PartInstance, Pose, Pt3, Quantity } from "@car/schema";
import { derived } from "@car/demand";
import type { MassLedgerInput, WheelStation } from "../src/mass";

export const kg = (v: number): Quantity<"kg"> =>
  derived(v, "kg", "test fixture value — fixed by the test");

export const mm = (v: number): Quantity<"mm"> =>
  derived(v, "mm", "test fixture value — fixed by the test");

export const box = (sx: number, sy: number, sz: number, offset?: Pt3): BoxShape => ({
  kind: "box",
  size: [mm(sx), mm(sy), mm(sz)],
  ...(offset !== undefined ? { offset } : {}),
});

export const part = (
  id: Id,
  label: string,
  mass?: Quantity<"kg">,
  envelope?: BoxShape,
): PartInstance => ({
  id,
  label,
  ports: [],
  demands: [],
  ...(mass !== undefined ? { mass } : {}),
  ...(envelope !== undefined ? { envelope } : {}),
});

export const places = (entries: readonly (readonly [Id, Pt3])[]): ReadonlyMap<Id, Pose> =>
  new Map(entries.map(([id, origin]) => [id, { origin }]));

export const wheel = (label: string, at: Pt3, capacityKg: Quantity<"kg">): WheelStation => ({
  label,
  at,
  loadCapacityKg: capacityKg,
});

/** Four wheels: front axle at x=0, rear at x=4000, y=±750, uniform capacity. */
export const fourWheels = (capacityKg: Quantity<"kg">): WheelStation[] => [
  wheel("FL", [0, -750, 0], capacityKg),
  wheel("FR", [0, 750, 0], capacityKg),
  wheel("RL", [4000, -750, 0], capacityKg),
  wheel("RR", [4000, 750, 0], capacityKg),
];

export const ledgerInput = (partial: Partial<MassLedgerInput>): MassLedgerInput => ({
  parts: [],
  placements: new Map(),
  wheels: [],
  massTarget: kg(1000),
  ...partial,
});
