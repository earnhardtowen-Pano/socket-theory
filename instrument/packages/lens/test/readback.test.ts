import { describe, expect, it } from "vitest";
import type { SolveResult } from "@car/schema";
import { clamp, demand, derived, sourced } from "@car/demand";
import { clearanceReadback } from "../src/mass";

const emptySolve = (partial: Partial<SolveResult>): SolveResult => ({
  placements: new Map(),
  clamps: [],
  violations: [],
  hardPoints: [],
  closed: true,
  ...partial,
});

describe("clearanceReadback — the ledger strip over a SolveResult", () => {
  it("an empty, closed solve reads back empty", () => {
    const r = clearanceReadback(emptySolve({}));
    expect(r.violations).toEqual([]);
    expect(r.clamps).toEqual([]);
  });

  it("violations name kind, demand, parts, and echo the solver's detail", () => {
    const r = clearanceReadback(
      emptySolve({
        closed: false,
        violations: [
          {
            kind: "clearance",
            demandId: "demand#4",
            partIds: ["part#1", "part#2"],
            detail:
              "clearance demand#4 (principal: physics): part#1 demands 25 mm of air but part#2 penetrates the inflated envelope by 3 mm",
          },
          {
            kind: "unplaced",
            partIds: ["part#7"],
            detail: "part#7 is mated but unreachable from any fixed part",
          },
        ],
      }),
    );
    expect(r.violations).toHaveLength(2);
    expect(r.violations[0]).toContain("VIOLATION clearance demand#4");
    expect(r.violations[0]).toContain("[part#1, part#2]");
    expect(r.violations[0]).toContain("principal: physics");
    expect(r.violations[0]).toContain("penetrates the inflated envelope by 3 mm");
    // A violation without a demand (unplaced) still formats cleanly.
    expect(r.violations[1]).toContain("VIOLATION unplaced [part#7]");
    expect(r.violations[1]).not.toContain("undefined");
  });

  it("clamps name demand, principal, and reason, with the bound's license", () => {
    const bumperBand = demand({
      id: "demand#9",
      principal: "law",
      reason: "bumper beam must sit inside the regulated height band",
      kind: "band",
      magnitude: sourced(445, "mm", "test-fixture regulation stand-in, this suite"),
    });
    const r = clearanceReadback(
      emptySolve({
        clamps: [clamp(sourced(445, "mm", "test-fixture regulation stand-in, this suite"), bumperBand)],
      }),
    );
    expect(r.clamps).toHaveLength(1);
    const line = r.clamps[0] ?? "";
    expect(line).toContain("CLAMP demand#9");
    expect(line).toContain("(principal: law)");
    expect(line).toContain("bumper beam must sit inside the regulated height band");
    expect(line).toContain("445 mm");
    expect(line).toContain("[SOURCED]");
  });

  it("preserves the solver's deterministic ordering", () => {
    const mk = (n: number) =>
      clamp(
        derived(n, "mm", "test bound"),
        demand({
          id: `demand#${n}`,
          principal: "physics",
          reason: `reason ${n}`,
          kind: "clearance",
        }),
      );
    const r = clearanceReadback(emptySolve({ clamps: [mk(3), mk(1), mk(2)] }));
    expect(r.clamps.map((c) => c.slice(0, "CLAMP demand#X".length))).toEqual([
      "CLAMP demand#3",
      "CLAMP demand#1",
      "CLAMP demand#2",
    ]);
  });
});
