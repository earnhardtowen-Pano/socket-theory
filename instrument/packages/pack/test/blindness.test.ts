/**
 * Blindness layer 3 (rename-fuzz) and determinism.
 *
 * The rig is a full scenario: a fixed substrate with a reinforced member, a
 * mated engine and transmission, two free boxes negotiating a clearance and a
 * band, a free box expelled from a world protected zone, one satisfied and
 * one violated anchorage, and point-at demands. Every part label, port name,
 * and member label is then replaced with arbitrary strings: the SolveResult
 * must be identical modulo labels — placements, clamps, and violations
 * compared structurally by id.
 */

import { describe, expect, it } from "vitest";
import type { SolveInput, SolveResult } from "@car/schema";
import { demand } from "@car/demand";
import { solve } from "@car/pack";
import { band, box, fixedAt, input, member, mm, part, pt } from "./rig";

function buildRig(rn: (label: string) => string): SolveInput {
  const substrate = part("part#0", rn("substrate"), {
    ports: [pt("port#0", rn("mount-front"), [600, 0, 120])],
  });
  const engine = part("part#1", rn("engine"), {
    ports: [pt("port#1", rn("mount"), [0, 0, 0]), pt("port#2", rn("bellhousing"), [550, 0, 150])],
    demands: [
      demand({
        id: "demand#0",
        principal: "physics",
        reason: "engine mass load path, front mount",
        kind: "anchorage",
        massBearing: true,
        shape: box(30, 30, 30, [0, 0, -80]),
      }),
      demand({
        id: "demand#1",
        principal: "physics",
        reason: "engine mass load path, rear mount",
        kind: "anchorage",
        massBearing: true,
        shape: box(30, 30, 30, [900, 0, 0]),
      }),
      demand({
        id: "demand#5",
        principal: "person",
        reason: "intake mouth hard point",
        kind: "point-at",
        shape: box(10, 10, 10, [100, 0, 350]),
      }),
    ],
  });
  const trans = part("part#2", rn("transmission"), {
    ports: [pt("port#3", rn("input"), [0, 0, 0])],
  });
  const freeA = part("part#3", rn("free-a"), {
    envelope: box(200, 200, 200, [-500, 0, 0]),
    demands: [
      demand({
        id: "demand#2",
        principal: "physics",
        reason: "service air around the core",
        kind: "clearance",
        magnitude: mm(25),
      }),
      demand({
        id: "demand#3",
        principal: "law",
        reason: "height band",
        kind: "band",
        shape: band(-80, 1000),
      }),
    ],
  });
  const freeB = part("part#4", rn("free-b"), { envelope: box(200, 200, 200, [-450, 0, 0]) });
  const zoneBox = part("part#5", rn("loose-box"), { envelope: box(100, 100, 100, [0, 750, 0]) });

  return input({
    parts: [substrate, engine, trans, freeA, freeB, zoneBox],
    mates: [
      {
        a: { partId: "part#0", portId: "port#0" },
        b: { partId: "part#1", portId: "port#1" },
        offset: [0, 0, 80],
      },
      {
        a: { partId: "part#1", portId: "port#2" },
        b: { partId: "part#2", portId: "port#3" },
        offset: [15, 0, 0],
      },
    ],
    fixed: fixedAt([["part#0", [0, 0, 0]]]),
    members: [
      member("feature#0", rn("front-rail"), box(400, 200, 200), [600, 0, 120], true),
      member("feature#1", rn("rear-panel"), box(200, 200, 200), [1400, 0, 200], false),
    ],
    worldDemands: [
      demand({
        id: "demand#4",
        principal: "law",
        reason: "fuel tank keep-out",
        kind: "protected-zone",
        shape: box(400, 400, 400, [0, 800, 0]),
        magnitude: mm(30),
      }),
      demand({
        id: "demand#6",
        principal: "brief",
        reason: "hitch hard point",
        kind: "point-at",
        shape: box(10, 10, 10, [123, 45, 67]),
      }),
    ],
  });
}

/** Structural projection of a result: everything except opaque label text. */
function structure(r: SolveResult) {
  return {
    placements: [...r.placements.entries()],
    clamps: r.clamps.map((c) => ({
      value: c.boundValue.value,
      unit: c.boundValue.unit,
      demandId: c.demandId,
      principal: c.principal,
      reason: c.reason,
    })),
    violations: r.violations.map((v) => ({
      kind: v.kind,
      demandId: v.demandId,
      partIds: v.partIds,
    })),
    hardPoints: r.hardPoints.map((h) => ({ at: h.at, demandId: h.demandId })),
    closed: r.closed,
  };
}

function serialize(r: SolveResult): string {
  return JSON.stringify({
    placements: [...r.placements.entries()],
    clamps: r.clamps,
    violations: r.violations,
    hardPoints: r.hardPoints,
    closed: r.closed,
  });
}

describe("rig sanity — pins down the semantics the fuzz preserves", () => {
  it("solves the rig to the hand-computed state", () => {
    const r = solve(buildRig((s) => s));
    expect(r.placements.get("part#0")).toEqual({ origin: [0, 0, 0] });
    expect(r.placements.get("part#1")).toEqual({ origin: [600, 0, 200] });
    expect(r.placements.get("part#2")).toEqual({ origin: [1165, 0, 350] });
    expect(r.placements.get("part#3")).toEqual({ origin: [0, 0, 20] });
    expect(r.placements.get("part#4")).toEqual({ origin: [175, 0, 0] });
    expect(r.placements.get("part#5")).toEqual({ origin: [0, -230, 0] });

    expect(r.clamps.map((c) => [c.demandId, c.boundValue.value])).toEqual([
      ["demand#4", 30],
      ["demand#2", 25],
      ["demand#3", -80],
    ]);

    expect(r.violations).toHaveLength(1);
    expect(r.violations[0]!.kind).toBe("anchorage");
    expect(r.violations[0]!.demandId).toBe("demand#1");
    expect(r.violations[0]!.partIds).toEqual(["part#1"]);
    expect(r.closed).toBe(false);

    expect(r.hardPoints).toContainEqual({ at: [600, 0, 120], label: "mount-front" });
    expect(r.hardPoints).toContainEqual({ at: [1150, 0, 350], label: "bellhousing" });
    expect(r.hardPoints).toContainEqual({ at: [700, 0, 550], demandId: "demand#5" });
    expect(r.hardPoints).toContainEqual({ at: [123, 45, 67], demandId: "demand#6" });
  });
});

describe("blindness layer 3 — rename fuzz", () => {
  const scramble = (s: string): string =>
    `zz-${s.length}-${s.split("").reverse().join("")}-${s.toUpperCase()}`;

  it("relabeling every part, port, and member changes nothing but labels", () => {
    const plain = solve(buildRig((s) => s));
    const fuzzed = solve(buildRig(scramble));
    expect(structure(fuzzed)).toEqual(structure(plain));
    // Labels DID change where they are echoed — proves the fuzz actually bit.
    expect(fuzzed.hardPoints.some((h) => h.label === scramble("bellhousing"))).toBe(true);
    expect(plain.hardPoints.some((h) => h.label === "bellhousing")).toBe(true);
  });

  it("a second, hostile relabeling (labels that look like directives) is equally inert", () => {
    const hostile = (s: string): string => `if-layout-then:${s}:engine:transmission:battery`;
    const plain = solve(buildRig((s) => s));
    const fuzzed = solve(buildRig(hostile));
    expect(structure(fuzzed)).toEqual(structure(plain));
  });
});

describe("determinism", () => {
  it("two runs over identical input are bit-identical", () => {
    const a = solve(buildRig((s) => s));
    const b = solve(buildRig((s) => s));
    expect(serialize(a)).toBe(serialize(b));
    expect(a).toEqual(b);
  });

  it("placement map iteration order is ID-sorted and stable", () => {
    const r = solve(buildRig((s) => s));
    expect([...r.placements.keys()]).toEqual([
      "part#0",
      "part#1",
      "part#2",
      "part#3",
      "part#4",
      "part#5",
    ]);
  });
});
