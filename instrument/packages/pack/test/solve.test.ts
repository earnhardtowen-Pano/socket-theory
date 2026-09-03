import { describe, expect, it } from "vitest";
import { demand } from "@car/demand";
import { PackInputError, solve } from "@car/pack";
import { band, box, fixedAt, input, member, mm, part, pt } from "./rig";

describe("mate closure", () => {
  it("chain placement: substrate -> engine -> transmission land at exact origins", () => {
    const substrate = part("part#0", "substrate", {
      ports: [pt("port#0", "mount-front", [800, 0, 150])],
    });
    const engine = part("part#1", "engine", {
      ports: [pt("port#1", "mount", [150, 0, -100]), pt("port#2", "bellhousing", [400, 0, 0])],
    });
    const trans = part("part#2", "transmission", {
      ports: [pt("port#3", "input", [0, 0, 0]), pt("port#4", "output", [600, 0, 0])],
    });
    const r = solve(
      input({
        parts: [substrate, engine, trans],
        mates: [
          { a: { partId: "part#0", portId: "port#0" }, b: { partId: "part#1", portId: "port#1" } },
          {
            a: { partId: "part#1", portId: "port#2" },
            b: { partId: "part#2", portId: "port#3" },
            offset: [10, 0, 0],
          },
        ],
        fixed: fixedAt([["part#0", [0, 0, 0]]]),
      }),
    );
    expect(r.placements.get("part#0")).toEqual({ origin: [0, 0, 0] });
    expect(r.placements.get("part#1")).toEqual({ origin: [650, 0, 250] });
    expect(r.placements.get("part#2")).toEqual({ origin: [1060, 0, 250] });
    expect(r.violations).toEqual([]);
    expect(r.closed).toBe(true);
    // Hard points: every port origin at pose, labeled by port name.
    expect(r.hardPoints).toContainEqual({ at: [800, 0, 150], label: "mount-front" });
    expect(r.hardPoints).toContainEqual({ at: [1050, 0, 250], label: "bellhousing" });
    expect(r.hardPoints).toContainEqual({ at: [1060, 0, 250], label: "input" });
    expect(r.hardPoints).toContainEqual({ at: [1660, 0, 250], label: "output" });
  });

  it("a mated island without a fixed anchor is typed unplaced; a mate-less part is free at origin", () => {
    const a = part("part#0", "island-a", { ports: [pt("port#0", "p", [0, 0, 0])] });
    const b = part("part#1", "island-b", { ports: [pt("port#1", "q", [100, 0, 0])] });
    const lone = part("part#2", "lone", { envelope: box(50, 50, 50) });
    const r = solve(
      input({
        parts: [a, b, lone],
        mates: [
          { a: { partId: "part#0", portId: "port#0" }, b: { partId: "part#1", portId: "port#1" } },
        ],
      }),
    );
    const unplaced = r.violations.filter((v) => v.kind === "unplaced");
    expect(unplaced.map((v) => v.partIds)).toEqual([["part#0"], ["part#1"]]);
    expect(r.placements.has("part#0")).toBe(false);
    expect(r.placements.has("part#1")).toBe(false);
    expect(r.placements.get("part#2")).toEqual({ origin: [0, 0, 0] });
    expect(r.closed).toBe(false);
  });

  it("conflicting mates report a violation naming both mates; the first placement stands", () => {
    const substrate = part("part#0", "substrate", {
      ports: [pt("port#0", "front", [0, 0, 0]), pt("port#1", "rear", [500, 0, 0])],
    });
    const beam = part("part#1", "beam", {
      ports: [pt("port#2", "front", [0, 0, 0]), pt("port#3", "rear", [400, 0, 0])],
    });
    const r = solve(
      input({
        parts: [substrate, beam],
        mates: [
          { a: { partId: "part#0", portId: "port#0" }, b: { partId: "part#1", portId: "port#2" } },
          { a: { partId: "part#0", portId: "port#1" }, b: { partId: "part#1", portId: "port#3" } },
        ],
        fixed: fixedAt([["part#0", [0, 0, 0]]]),
      }),
    );
    expect(r.closed).toBe(false);
    const conflicts = r.violations.filter((v) => v.detail.includes("mate conflict"));
    expect(conflicts).toHaveLength(1);
    const v = conflicts[0]!;
    expect(v.kind).toBe("unplaced");
    expect(v.partIds).toEqual(["part#0", "part#1"]);
    // Both mates are named: the checked mate and the one that placed the part.
    expect(v.detail).toContain("mate(part#0.port#1 -> part#1.port#3)");
    expect(v.detail).toContain("mate(part#0.port#0 -> part#1.port#2)");
    expect(v.detail).toContain("100");
    // First placement stands, deterministically.
    expect(r.placements.get("part#1")).toEqual({ origin: [0, 0, 0] });
  });

  it("a mate disagreeing with two fixed poses names the mate and the fixed placements", () => {
    const a = part("part#0", "a", { ports: [pt("port#0", "p", [0, 0, 0])] });
    const b = part("part#1", "b", { ports: [pt("port#1", "q", [0, 0, 0])] });
    const r = solve(
      input({
        parts: [a, b],
        mates: [
          { a: { partId: "part#0", portId: "port#0" }, b: { partId: "part#1", portId: "port#1" } },
        ],
        fixed: fixedAt([
          ["part#0", [0, 0, 0]],
          ["part#1", [100, 0, 0]],
        ]),
      }),
    );
    expect(r.closed).toBe(false);
    const v = r.violations[0]!;
    expect(v.kind).toBe("unplaced");
    expect(v.detail).toContain("mate(part#0.port#0 -> part#1.port#1)");
    expect(v.detail).toContain("fixed-pose(part#0)");
    expect(v.detail).toContain("fixed-pose(part#1)");
  });
});

describe("clearance", () => {
  it("two free overlapping parts separate to exactly the demanded clearance, clamp attributed", () => {
    const a = part("part#0", "radiator", {
      envelope: box(200, 200, 200),
      demands: [
        demand({
          id: "demand#0",
          principal: "physics",
          reason: "radiator core needs service air",
          kind: "clearance",
          magnitude: mm(25),
        }),
      ],
    });
    const b = part("part#1", "box-b", { envelope: box(200, 200, 200, [50, 0, 0]) });
    const r = solve(input({ parts: [a, b] }));
    // Smallest-violation axis is X: penetration 100+25+100-50 = 175.
    // The non-demanding free part is pushed +X so the gap is exactly 25 mm.
    expect(r.placements.get("part#0")).toEqual({ origin: [0, 0, 0] });
    expect(r.placements.get("part#1")).toEqual({ origin: [175, 0, 0] });
    expect(r.violations).toEqual([]);
    expect(r.closed).toBe(true);
    expect(r.clamps).toHaveLength(1);
    const c = r.clamps[0]!;
    expect(c.demandId).toBe("demand#0");
    expect(c.principal).toBe("physics");
    expect(c.reason).toBe("radiator core needs service air");
    expect(c.boundValue.value).toBe(25);
    expect(c.boundValue.unit).toBe("mm");
  });

  it("both parts pinned: the push chain cannot move, a clearance violation is recorded", () => {
    const a = part("part#0", "a", {
      envelope: box(200, 200, 200),
      demands: [
        demand({
          id: "demand#0",
          principal: "physics",
          reason: "air gap",
          kind: "clearance",
          magnitude: mm(25),
        }),
      ],
    });
    const b = part("part#1", "b", { envelope: box(200, 200, 200) });
    const r = solve(
      input({
        parts: [a, b],
        fixed: fixedAt([
          ["part#0", [0, 0, 0]],
          ["part#1", [50, 0, 0]],
        ]),
      }),
    );
    expect(r.closed).toBe(false);
    const v = r.violations[0]!;
    expect(v.kind).toBe("clearance");
    expect(v.demandId).toBe("demand#0");
    expect(v.partIds).toEqual(["part#0", "part#1"]);
    expect(v.detail).toContain("pinned");
    // Nothing moved.
    expect(r.placements.get("part#1")).toEqual({ origin: [50, 0, 0] });
  });

  it("directly mated neighbors are exempt from each other's clearance", () => {
    const substrate = part("part#0", "substrate", {
      ports: [pt("port#0", "m", [0, 0, 0])],
      envelope: box(200, 200, 200),
    });
    const engine = part("part#1", "engine", {
      ports: [pt("port#1", "m", [0, 0, 0])],
      envelope: box(200, 200, 200),
      demands: [
        demand({
          id: "demand#0",
          principal: "physics",
          reason: "service clearance",
          kind: "clearance",
          magnitude: mm(10),
        }),
      ],
    });
    const r = solve(
      input({
        parts: [substrate, engine],
        mates: [
          { a: { partId: "part#0", portId: "port#0" }, b: { partId: "part#1", portId: "port#1" } },
        ],
        fixed: fixedAt([["part#0", [0, 0, 0]]]),
      }),
    );
    // Fully coincident envelopes, but the pair is mated: exempt, closed.
    expect(r.violations).toEqual([]);
    expect(r.clamps).toEqual([]);
    expect(r.closed).toBe(true);
  });

  it("a part without an envelope field falls back to its envelope-kind demand box", () => {
    const a = part("part#0", "a", {
      demands: [
        demand({
          id: "demand#0",
          principal: "physics",
          reason: "air gap",
          kind: "clearance",
          magnitude: mm(25),
        }),
        demand({
          id: "demand#1",
          principal: "person",
          reason: "claimed block volume",
          kind: "envelope",
          shape: box(200, 200, 200),
        }),
      ],
    });
    const b = part("part#1", "b", { envelope: box(200, 200, 200, [50, 0, 0]) });
    const r = solve(input({ parts: [a, b] }));
    expect(r.placements.get("part#1")).toEqual({ origin: [175, 0, 0] });
    expect(r.closed).toBe(true);
  });
});

describe("bands", () => {
  it("a free part is clamped into its Z band; the clamp carries the right principal", () => {
    const p = part("part#0", "beam", {
      envelope: box(200, 200, 300, [0, 0, 150]),
      demands: [
        demand({
          id: "demand#0",
          principal: "law",
          reason: "bumper beam height band",
          kind: "band",
          shape: band(100, 500),
        }),
      ],
    });
    const r = solve(input({ parts: [p] }));
    // z-range starts [0,300]; pushed up 100 so the low face lands at zMin.
    expect(r.placements.get("part#0")).toEqual({ origin: [0, 0, 100] });
    expect(r.violations).toEqual([]);
    expect(r.closed).toBe(true);
    expect(r.clamps).toHaveLength(1);
    const c = r.clamps[0]!;
    expect(c.demandId).toBe("demand#0");
    expect(c.principal).toBe("law");
    expect(c.boundValue.value).toBe(100);
  });

  it("a world band applies to every placed part (it has no owner)", () => {
    const p = part("part#0", "beam", { envelope: box(200, 200, 300, [0, 0, 150]) });
    const r = solve(
      input({
        parts: [p],
        worldDemands: [
          demand({
            id: "demand#0",
            principal: "law",
            reason: "world height band",
            kind: "band",
            shape: band(100, 1000),
          }),
        ],
      }),
    );
    expect(r.placements.get("part#0")).toEqual({ origin: [0, 0, 100] });
    expect(r.clamps).toHaveLength(1);
    expect(r.clamps[0]!.principal).toBe("law");
    expect(r.closed).toBe(true);
  });

  it("a pinned part outside its band is a typed band violation", () => {
    const p = part("part#0", "beam", {
      envelope: box(200, 200, 300, [0, 0, 150]),
      demands: [
        demand({
          id: "demand#0",
          principal: "law",
          reason: "bumper beam height band",
          kind: "band",
          shape: band(400, 900),
        }),
      ],
    });
    const r = solve(input({ parts: [p], fixed: fixedAt([["part#0", [0, 0, 0]]]) }));
    expect(r.closed).toBe(false);
    const v = r.violations[0]!;
    expect(v.kind).toBe("band");
    expect(v.demandId).toBe("demand#0");
    expect(v.partIds).toEqual(["part#0"]);
    expect(v.detail).toContain("pinned");
    expect(r.placements.get("part#0")).toEqual({ origin: [0, 0, 0] });
  });

  it("a band narrower than the envelope clamps at zMin and reports the top breach", () => {
    const p = part("part#0", "tall", {
      envelope: box(100, 100, 300, [0, 0, 150]),
      demands: [
        demand({
          id: "demand#0",
          principal: "law",
          reason: "narrow band",
          kind: "band",
          shape: band(0, 200),
        }),
      ],
    });
    const r = solve(input({ parts: [p] }));
    expect(r.closed).toBe(false);
    expect(r.violations[0]!.kind).toBe("band");
    // Bottom face sits exactly at zMin: active clamp attributed there.
    expect(r.clamps).toHaveLength(1);
    expect(r.clamps[0]!.boundValue.value).toBe(0);
  });
});

describe("protected zones", () => {
  it("a free intruder is pushed to exactly the zone face plus magnitude; clamp attributed", () => {
    const intruder = part("part#0", "loose-box", { envelope: box(100, 100, 100, [0, 750, 0]) });
    const r = solve(
      input({
        parts: [intruder],
        worldDemands: [
          demand({
            id: "demand#0",
            principal: "law",
            reason: "fuel tank keep-out",
            kind: "protected-zone",
            shape: box(400, 400, 400, [0, 800, 0]),
            magnitude: mm(30),
          }),
        ],
      }),
    );
    // Zone half 200 inflated to 230; intruder half 50 at y=750: pushed -Y by
    // 230 so |dc| = 280 = 230+50 exactly.
    expect(r.placements.get("part#0")).toEqual({ origin: [0, -230, 0] });
    expect(r.violations).toEqual([]);
    expect(r.closed).toBe(true);
    expect(r.clamps).toHaveLength(1);
    expect(r.clamps[0]!.demandId).toBe("demand#0");
    expect(r.clamps[0]!.boundValue.value).toBe(30);
  });

  it("a pinned intruder inside a world zone is a typed protected-zone violation", () => {
    const intruder = part("part#0", "stuck", { envelope: box(100, 100, 100) });
    const r = solve(
      input({
        parts: [intruder],
        fixed: fixedAt([["part#0", [0, 800, 0]]]),
        worldDemands: [
          demand({
            id: "demand#0",
            principal: "law",
            reason: "fuel tank keep-out",
            kind: "protected-zone",
            shape: box(400, 400, 400, [0, 800, 0]),
          }),
        ],
      }),
    );
    expect(r.closed).toBe(false);
    const v = r.violations[0]!;
    expect(v.kind).toBe("protected-zone");
    expect(v.demandId).toBe("demand#0");
    expect(v.partIds).toEqual(["part#0"]);
  });

  it("a part-owned zone rides its owner and expels a free intruder to exact contact", () => {
    const owner = part("part#0", "tank", {
      demands: [
        demand({
          id: "demand#0",
          principal: "law",
          reason: "tank crush zone",
          kind: "protected-zone",
          shape: box(300, 300, 300),
          magnitude: mm(20),
        }),
      ],
    });
    const intruder = part("part#1", "pipe", { envelope: box(100, 100, 100, [100, 0, 0]) });
    const r = solve(input({ parts: [owner, intruder], fixed: fixedAt([["part#0", [0, 0, 0]]]) }));
    // Zone half 150+20 = 170; intruder half 50 at x=100: pen_x = 120, pushed
    // +X to center 220 = 170+50 exactly.
    expect(r.placements.get("part#1")).toEqual({ origin: [120, 0, 0] });
    expect(r.closed).toBe(true);
    expect(r.clamps).toHaveLength(1);
    expect(r.clamps[0]!.boundValue.value).toBe(20);
  });
});

describe("anchorage law", () => {
  const engineWith = (anchorOffset: readonly [number, number, number]) =>
    part("part#0", "engine", {
      ports: [pt("port#0", "mount", [0, 0, 0])],
      demands: [
        demand({
          id: "demand#0",
          principal: "physics",
          reason: "engine mass load path",
          kind: "anchorage",
          massBearing: true,
          shape: box(20, 20, 20, [...anchorOffset]),
        }),
      ],
    });

  it("a massBearing anchor outside every reinforced member is a typed anchorage violation", () => {
    const r = solve(
      input({
        parts: [engineWith([0, 0, -100])],
        fixed: fixedAt([["part#0", [1000, 0, 300]]]),
        members: [member("feature#0", "front-rail", box(400, 100, 100), [200, 0, 200], true)],
      }),
    );
    expect(r.closed).toBe(false);
    expect(r.violations).toHaveLength(1);
    const v = r.violations[0]!;
    expect(v.kind).toBe("anchorage");
    expect(v.demandId).toBe("demand#0");
    expect(v.partIds).toEqual(["part#0"]);
    expect(v.detail).toContain("physics");
    expect(v.detail).toContain("feature#0"); // nearest member named
  });

  it("moving the member under the anchor closes the solve", () => {
    const r = solve(
      input({
        parts: [engineWith([0, 0, -100])],
        fixed: fixedAt([["part#0", [1000, 0, 300]]]),
        members: [member("feature#0", "front-rail", box(400, 100, 100), [1000, 0, 200], true)],
      }),
    );
    expect(r.violations).toEqual([]);
    expect(r.closed).toBe(true);
  });

  it("an unreinforced member containing the anchor does not satisfy the law", () => {
    const r = solve(
      input({
        parts: [engineWith([0, 0, -100])],
        fixed: fixedAt([["part#0", [1000, 0, 300]]]),
        members: [member("feature#0", "panel", box(400, 100, 100), [1000, 0, 200], false)],
      }),
    );
    expect(r.closed).toBe(false);
    expect(r.violations[0]!.kind).toBe("anchorage");
    expect(r.violations[0]!.detail).toContain("not reinforced");
  });

  it("a demand naming no shape offset anchors at the part's first port origin", () => {
    const p = part("part#0", "seat", {
      ports: [pt("port#0", "anchor", [5, 5, 5])],
      demands: [
        demand({
          id: "demand#0",
          principal: "law",
          reason: "belt anchor load rating",
          kind: "anchorage",
          massBearing: true,
        }),
      ],
    });
    const good = solve(
      input({
        parts: [p],
        fixed: fixedAt([["part#0", [50, 60, 70]]]),
        members: [member("feature#0", "sill", box(20, 20, 20), [55, 65, 75], true)],
      }),
    );
    expect(good.closed).toBe(true);
    const bad = solve(
      input({
        parts: [p],
        fixed: fixedAt([["part#0", [50, 60, 70]]]),
        members: [member("feature#0", "sill", box(20, 20, 20), [500, 65, 75], true)],
      }),
    );
    expect(bad.closed).toBe(false);
    expect(bad.violations[0]!.kind).toBe("anchorage");
  });
});

describe("hard points", () => {
  it("point-at demands publish snap points carrying their demandId", () => {
    const p = part("part#0", "column", {
      demands: [
        demand({
          id: "demand#0",
          principal: "person",
          reason: "wheel hub center",
          kind: "point-at",
          shape: box(1, 1, 1, [1, 2, 3]),
        }),
      ],
    });
    const r = solve(
      input({
        parts: [p],
        fixed: fixedAt([["part#0", [10, 20, 30]]]),
        worldDemands: [
          demand({
            id: "demand#1",
            principal: "brief",
            reason: "hitch point",
            kind: "point-at",
            shape: box(1, 1, 1, [5, 6, 7]),
          }),
        ],
      }),
    );
    expect(r.hardPoints).toContainEqual({ at: [11, 22, 33], demandId: "demand#0" });
    expect(r.hardPoints).toContainEqual({ at: [5, 6, 7], demandId: "demand#1" });
  });
});

describe("input validation", () => {
  it("throws PackInputError on duplicate part ids", () => {
    expect(() =>
      solve(input({ parts: [part("part#0", "a"), part("part#0", "b")] })),
    ).toThrow(PackInputError);
  });

  it("throws PackInputError on a fixed pose naming an unknown part", () => {
    expect(() =>
      solve(input({ parts: [part("part#0", "a")], fixed: fixedAt([["part#9", [0, 0, 0]]]) })),
    ).toThrow(PackInputError);
  });

  it("throws PackInputError on a mate referencing an unknown port", () => {
    const a = part("part#0", "a", { ports: [pt("port#0", "p", [0, 0, 0])] });
    const b = part("part#1", "b", { ports: [pt("port#1", "q", [0, 0, 0])] });
    expect(() =>
      solve(
        input({
          parts: [a, b],
          mates: [
            { a: { partId: "part#0", portId: "port#9" }, b: { partId: "part#1", portId: "port#1" } },
          ],
        }),
      ),
    ).toThrow(PackInputError);
  });

  it("throws PackInputError on a self-mate", () => {
    const a = part("part#0", "a", { ports: [pt("port#0", "p", [0, 0, 0])] });
    expect(() =>
      solve(
        input({
          parts: [a],
          mates: [
            { a: { partId: "part#0", portId: "port#0" }, b: { partId: "part#0", portId: "port#0" } },
          ],
        }),
      ),
    ).toThrow(PackInputError);
  });
});
