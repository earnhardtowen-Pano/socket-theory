/**
 * Shared test fixtures for @car/pack. Test files are exempt from the
 * bare-constants lint; quantities still go through the factories because the
 * branded Quantity type admits no other constructor.
 */

import type {
  BandShape,
  BoxShape,
  Id,
  MemberRecord,
  PartInstance,
  PortRecord,
  Pose,
  Pt3,
  Quantity,
  SolveInput,
} from "@car/schema";
import { assumed, port } from "@car/demand";

export const mm = (v: number): Quantity<"mm"> => assumed(v, "mm", "test fixture value");

export const box = (sx: number, sy: number, sz: number, offset?: Pt3): BoxShape => ({
  kind: "box",
  size: [mm(sx), mm(sy), mm(sz)],
  ...(offset !== undefined ? { offset } : {}),
});

export const band = (zMin: number, zMax: number): BandShape => ({
  kind: "band",
  zMin: mm(zMin),
  zMax: mm(zMax),
});

export const pt = (id: Id, name: string, origin: Pt3): PortRecord =>
  port(id, name, "point", { origin, xAxis: [1, 0, 0], zAxis: [0, 0, 1] });

export const part = (id: Id, label: string, extra?: Partial<PartInstance>): PartInstance => ({
  id,
  label,
  ports: [],
  demands: [],
  ...extra,
});

export const member = (
  id: Id,
  label: string,
  b: BoxShape,
  at: Pt3,
  reinforced: boolean,
): MemberRecord => ({ id, label, box: b, at, reinforced });

export const fixedAt = (entries: readonly (readonly [Id, Pt3])[]): ReadonlyMap<Id, Pose> =>
  new Map(entries.map(([id, origin]) => [id, { origin }]));

export const input = (partial: Partial<SolveInput>): SolveInput => ({
  parts: [],
  mates: [],
  fixed: new Map(),
  members: [],
  worldDemands: [],
  ...partial,
});
