import { describe, expect, it } from "vitest";
import { collectLicensed, provenanceReport } from "@car/lens";
import { assumed, derived, sourced } from "@car/demand";

const config = {
  brief: { mass: assumed(1450, "kg", "the owner picked it") },
  chassis: {
    wheelbase: sourced(2540, "mm", "a spec sheet", "100 in"),
    railLength: derived(4400, "mm", "overhang + wheelbase + overhang"),
  },
  tires: [
    { width: sourced(245, "mm", "a fitment table") },
    { width: sourced(275, "mm", "a fitment table") },
  ],
  name: "not a quantity",
  count: 7,
};

describe("provenance report (charge §10)", () => {
  it("finds every licensed quantity, at any depth, with its path", () => {
    const found = collectLicensed(config);
    expect(found.map((e) => e.path).sort()).toEqual([
      "brief.mass", "chassis.railLength", "chassis.wheelbase",
      "tires[0].width", "tires[1].width",
    ]);
  });

  it("carries the reason each licence gave, not just the tag", () => {
    const found = collectLicensed(config);
    const wb = found.find((e) => e.path === "chassis.wheelbase")!;
    expect(wb.tag).toBe("SOURCED");
    expect(wb.reason).toContain("a spec sheet");
    expect(wb.reason).toContain("100 in");
    expect(found.find((e) => e.path === "brief.mass")!.reason).toBe("the owner picked it");
    expect(found.find((e) => e.path === "chassis.railLength")!.reason).toContain("overhang");
  });

  it("counts the three licences separately", () => {
    const r = provenanceReport({
      carName: "Test", config, clamps: [], bodyChecks: [],
      ledgerLines: [], modelFacts: [],
    });
    expect(r.assumedCount).toBe(1);
    expect(r.sourcedCount).toBe(3);
    expect(r.derivedCount).toBe(1);
  });

  it("says plainly when nothing was forced, instead of leaving a blank", () => {
    const r = provenanceReport({
      carName: "Test", config, clamps: [], bodyChecks: [],
      ledgerLines: [], modelFacts: [],
    });
    expect(r.text).toContain("Nothing. The packaging solve clamped no dimension");
  });

  it("is byte-identical on a second run — no wall clock anywhere", () => {
    const make = () => provenanceReport({
      carName: "Test", config, clamps: [], bodyChecks: [],
      ledgerLines: ["total 1000 kg"], modelFacts: [["verbs", "12"]],
    }).text;
    expect(make()).toBe(make());
    expect(make()).not.toMatch(/\d{4}-\d{2}-\d{2}/);   // no date slipped in
  });

  it("survives a cycle without spinning", () => {
    const a: Record<string, unknown> = { q: assumed(1, "mm", "x") };
    a["self"] = a;
    expect(collectLicensed(a).map((e) => e.path)).toEqual(["q"]);
  });
});
