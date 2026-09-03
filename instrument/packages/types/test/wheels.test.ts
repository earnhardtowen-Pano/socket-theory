import { describe, expect, it } from "vitest";
import { makeAllocator } from "@car/schema";
import { assumed, derived, sourced } from "@car/demand";
import { loadIndexCapacityKg, makeWheelTire, type WheelTireParams } from "../src/wheels";

function tire205_55_16(over: Partial<WheelTireParams> = {}) {
  return makeWheelTire(
    {
      sectionWidth: assumed(205, "mm", "test section"),
      aspectPercent: assumed(55, "ratio", "test aspect"),
      rimDiameterIn: assumed(16, "count", "test rim"),
      loadIndex: derived(91, "count", "test load index"),
      ...over,
    },
    makeAllocator(),
  );
}

describe("makeWheelTire — the sidewall formula, exact", () => {
  it("205/55R16: diameter = 16×25.4 + 2×205×0.55 = 631.9 mm, exact", () => {
    const t = tire205_55_16();
    expect(t.dims.overallDiameter.value).toBeCloseTo(16 * 25.4 + 2 * 205 * 0.55, 9);
    expect(t.dims.overallDiameter.value).toBeCloseTo(631.9, 9);
    expect(t.dims.rimDiameterMm.value).toBeCloseTo(406.4, 9);
    expect(t.dims.sidewallHeight.value).toBeCloseTo(112.75, 9);
  });

  it("the chain is DERIVED and shows the composition down to the inputs", () => {
    const t = tire205_55_16();
    const d = t.dims.overallDiameter;
    expect(d.license.tag).toBe("DERIVED");
    const chain = d.license.tag === "DERIVED" ? d.license.chain : "";
    expect(chain).toContain("add("); // rim×25.4 + doubled sidewall, both DERIVED
    expect(chain).toContain("[DERIVED]");
    // sidewall chain carries the width×aspect/100 composition
    expect(t.dims.sidewallHeight.license.tag).toBe("DERIVED");
    const sw = t.dims.sidewallHeight.license;
    expect(sw.tag === "DERIVED" ? sw.chain : "").toContain("div(");
  });

  it("another size lands the formula too: 265/70R17 ≈ 802.8 mm", () => {
    const t = tire205_55_16({
      sectionWidth: assumed(265, "mm", "test"),
      aspectPercent: assumed(70, "ratio", "test"),
      rimDiameterIn: assumed(17, "count", "test"),
      loadIndex: derived(112, "count", "test"),
    });
    expect(t.dims.overallDiameter.value).toBeCloseTo(17 * 25.4 + 2 * 265 * 0.7, 9);
  });

  it("rejects non-positive sidewall numbers", () => {
    expect(() => tire205_55_16({ sectionWidth: assumed(-205, "mm", "test") })).toThrow(/positive/);
  });
});

describe("makeWheelTire — load index table (SOURCED)", () => {
  it("spot-check: LI 91 → 615 kg, as the standard table says", () => {
    const t = tire205_55_16();
    expect(t.dims.loadCapacityKg.value).toBe(615);
    expect(t.dims.loadCapacityKg.license.tag).toBe("SOURCED");
    const lic = t.dims.loadCapacityKg.license;
    expect(lic.tag === "SOURCED" ? lic.source : "").toMatch(/load-index table/i);
    expect(lic.tag === "SOURCED" && lic.citation ? lic.citation : "").toMatch(/91 = 615/);
  });

  it("more table anchors: 60→250, 80→450, 100→800, 108→1000, 125→1650", () => {
    expect(loadIndexCapacityKg(derived(60, "count", "t")).value).toBe(250);
    expect(loadIndexCapacityKg(derived(80, "count", "t")).value).toBe(450);
    expect(loadIndexCapacityKg(derived(100, "count", "t")).value).toBe(800);
    expect(loadIndexCapacityKg(derived(108, "count", "t")).value).toBe(1000);
    expect(loadIndexCapacityKg(derived(125, "count", "t")).value).toBe(1650);
  });

  it("capacity is strictly monotone over the whole transcribed table", () => {
    let prev = 0;
    for (let liv = 60; liv <= 125; liv++) {
      const cap = loadIndexCapacityKg(derived(liv, "count", "t")).value;
      expect(cap).toBeGreaterThan(prev);
      prev = cap;
    }
  });

  it("refuses indices outside the transcribed table and non-integers, loudly", () => {
    expect(() => loadIndexCapacityKg(derived(59, "count", "t"))).toThrow(/outside the transcribed table/);
    expect(() => loadIndexCapacityKg(derived(126, "count", "t"))).toThrow(/outside the transcribed table/);
    expect(() => loadIndexCapacityKg(derived(91.5, "count", "t"))).toThrow(/integer/);
  });
});

describe("makeWheelTire — envelope, ports, mass, licenses", () => {
  it("envelope is the rolling cylinder's box: [dia, section, dia] at the wheel center", () => {
    const t = tire205_55_16();
    expect(t.envelope).toBeDefined();
    expect(t.envelope!.size[0].value).toBeCloseTo(631.9, 6);
    expect(t.envelope!.size[1].value).toBe(205);
    expect(t.envelope!.size[2].value).toBeCloseTo(631.9, 6);
  });

  it("publishes hub axis and ground-contact point at -radius", () => {
    const t = tire205_55_16();
    const hub = t.ports.find((p) => p.name === "hub")!;
    expect(hub.kind).toBe("axis");
    expect(hub.frame.origin).toEqual([0, 0, 0]);
    const ground = t.ports.find((p) => p.name === "ground-contact")!;
    expect(ground.frame.origin[2]).toBeCloseTo(-631.9 / 2, 6);
  });

  it("default mass derives from the sourced baseline and flags the assumed scaling", () => {
    const t = tire205_55_16();
    expect(t.mass).toBeDefined();
    // at the baseline size the estimate is the baseline mass itself
    expect(t.mass!.value).toBeCloseTo(16.4, 3);
    expect(t.mass!.license.tag).toBe("DERIVED");
    const chain = t.mass!.license.tag === "DERIVED" ? t.mass!.license.chain : "";
    expect(chain).toContain("[SOURCED]");
    expect(chain).toContain("[ASSUMED]"); // the scaling exponent is assumed and surfaced
  });

  it("a bigger tire estimates heavier; massOverride wins when given", () => {
    const big = tire205_55_16({
      sectionWidth: assumed(265, "mm", "t"),
      aspectPercent: assumed(70, "ratio", "t"),
      rimDiameterIn: assumed(17, "count", "t"),
      loadIndex: derived(112, "count", "t"),
    });
    expect(big.mass!.value).toBeGreaterThan(16.4);
    const known = tire205_55_16({ massOverride: sourced(18.2, "kg", "test scale reading") });
    expect(known.mass!.value).toBe(18.2);
  });

  it("every demand carries a principal and a non-empty reason", () => {
    const t = tire205_55_16();
    expect(t.demands.length).toBeGreaterThan(0);
    for (const d of t.demands) {
      expect(["person", "physics", "law", "brief"]).toContain(d.principal);
      expect(d.reason.trim().length).toBeGreaterThan(0);
    }
  });
});
