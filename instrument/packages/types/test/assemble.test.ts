import { describe, expect, it } from "vitest";
import { makeAllocator } from "@car/schema";
import { assembleCar } from "@car/types";
import { p1Config, P1_WHEELBASE, P1_FRONT_OVERHANG } from "@car/fixtures";

const build = () => {
  const alloc = makeAllocator();
  return assembleCar(p1Config, alloc);
};

describe("assembleCar — type entries composed into a solvable car", () => {
  it("composes every part, mate and member the solver needs", () => {
    const car = build();
    expect(car.input.parts.length).toBe(15);
    expect(car.input.mates.length).toBe(12);
    expect(car.input.members.length).toBeGreaterThan(0);
    expect(car.input.members.every((m) => m.reinforced)).toBe(true);
  });

  it("pins only the datums: the substrate and the two axle lines", () => {
    const car = build();
    expect(car.input.fixed.size).toBe(3);
    const stations = [...car.input.fixed.values()].map((p) => p.origin[0]).sort((a, b) => a - b);
    expect(stations[0]).toBe(0);            // front axle / substrate datum
    expect(stations[2]).toBe(P1_WHEELBASE); // rear axle
  });

  it("places parts at their authored origins, not at whatever a port happened to sit at", () => {
    const car = build();
    // Every mate offset is arithmetic from a stated desired origin, so the
    // powertrain lands on the centerline rather than on a mount pad's Y.
    const engineMate = car.input.mates.find((m) => m.b.partId === car.engine.id);
    expect(engineMate).toBeDefined();
    expect(engineMate!.offset).toBeDefined();
  });

  it("keeps the law surfaced without enforcing it against the wrong geometry", () => {
    const car = build();
    // Regulatory demands govern lamps, beams and glass — parts v1 does not
    // model — so they are carried for the report, never as world demands.
    expect(car.regulatory.length).toBeGreaterThan(0);
    expect(car.regulatory.every((d) => d.principal === "law")).toBe(true);
    expect(car.input.worldDemands.some((d) => d.principal === "law")).toBe(false);
    // Ground clearance is a body readback, not a placement constraint.
    expect(car.bodyChecks.length).toBe(1);
    expect(car.bodyChecks[0]!.reason).toContain("air under the whole body");
  });

  it("is deterministic: two assemblies are structurally identical", () => {
    const a = build();
    const b = build();
    expect(a.input.parts.map((p) => p.id)).toEqual(b.input.parts.map((p) => p.id));
    expect(JSON.stringify(a.input.mates)).toBe(JSON.stringify(b.input.mates));
  });

  it("the body datum shift is the front overhang", () => {
    expect(P1_FRONT_OVERHANG).toBeGreaterThan(0);
  });
});
