import { describe, expect, it } from "vitest";
import { makeAllocator } from "@car/schema";
import { derived } from "@car/demand";
import { makeTransmission, type TransmissionType } from "../src/transmission";

function make(type: TransmissionType, gears: number) {
  return makeTransmission(
    { type, gearCount: derived(gears, "count", "test gear count") },
    makeAllocator(),
  );
}

describe("makeTransmission — case length from sourced per-type coefficients", () => {
  it("manual 6-speed reproduces the Tremec T-56 Magnum anchor length", () => {
    const t = make("manual", 6);
    expect(t.dims.caseLength.value).toBeCloseTo(864.4, 3);
    expect(t.dims.caseLength.license.tag).toBe("DERIVED");
    const chain = t.dims.caseLength.license.tag === "DERIVED" ? t.dims.caseLength.license.chain : "";
    expect(chain).toContain("[SOURCED]"); // anchored on a published dimension
  });

  it("auto 4-speed reproduces the GM 4L60E anchor length", () => {
    const t = make("auto", 4);
    expect(t.dims.caseLength.value).toBeCloseTo(556.3, 3);
  });

  it("cvt reproduces the Jatco CVT8 published length and ignores gear count", () => {
    const a = make("cvt", 1);
    const b = make("cvt", 8);
    expect(a.dims.caseLength.value).toBeCloseTo(362.3, 3);
    expect(b.dims.caseLength.value).toBeCloseTo(362.3, 3);
  });

  it("ev-reduction is the shortest case and ignores gear count", () => {
    const ev = make("ev-reduction", 1);
    for (const other of ["manual", "auto", "dct", "cvt"] as const) {
      expect(ev.dims.caseLength.value).toBeLessThan(make(other, 6).dims.caseLength.value);
    }
    expect(make("ev-reduction", 2).dims.caseLength.value).toBeCloseTo(ev.dims.caseLength.value, 6);
  });

  it("case length grows with gear count for geared types", () => {
    expect(make("manual", 7).dims.caseLength.value).toBeGreaterThan(make("manual", 6).dims.caseLength.value);
    expect(make("auto", 8).dims.caseLength.value).toBeGreaterThan(make("auto", 4).dims.caseLength.value);
    expect(make("dct", 8).dims.caseLength.value).toBeGreaterThan(make("dct", 7).dims.caseLength.value);
  });

  it("per-type masses come licensed (sourced where found, assumed where thin)", () => {
    expect(make("manual", 6).mass!.license.tag).toBe("SOURCED");
    expect(make("auto", 4).mass!.license.tag).toBe("SOURCED");
    expect(make("cvt", 1).mass!.license.tag).toBe("SOURCED");
    expect(make("dct", 7).mass!.license.tag).toBe("SOURCED");
    expect(make("ev-reduction", 1).mass!.license.tag).toBe("ASSUMED");
    expect(make("manual", 6).mass!.value).toBeCloseTo(61.2, 3);
  });
});

describe("makeTransmission — ports, demands, envelope", () => {
  it("publishes bellhousing at the datum, output at the case end, and a rear mount", () => {
    const t = make("manual", 6);
    const bell = t.ports.find((p) => p.name === "bellhousing")!;
    const out = t.ports.find((p) => p.name === "output")!;
    const mount = t.ports.find((p) => p.name === "mount-rear")!;
    expect(bell.frame.origin).toEqual([0, 0, 0]);
    expect(bell.frame.xAxis).toEqual([-1, 0, 0]); // faces forward, mates the engine's aft face
    expect(out.frame.origin[0]).toBeCloseTo(t.dims.caseLength.value, 6);
    expect(out.frame.xAxis).toEqual([1, 0, 0]);
    expect(mount.frame.origin[0]).toBeCloseTo(t.dims.caseLength.value, 6);
    expect(mount.frame.origin[2]).toBeLessThan(0); // under the case
  });

  it("envelope spans exactly the case aft of the bellhousing", () => {
    const t = make("auto", 4);
    const env = t.envelope!;
    expect(env.size[0].value).toBeCloseTo(t.dims.caseLength.value, 6);
    expect(env.offset![0]).toBeCloseTo(t.dims.caseLength.value / 2, 6);
  });

  it("publishes a mass-bearing anchorage at the rear mount for every type", () => {
    for (const type of ["manual", "auto", "dct", "cvt", "ev-reduction"] as const) {
      const t = make(type, 6);
      const anchor = t.demands.find((d) => d.kind === "anchorage");
      expect(anchor, type).toBeDefined();
      expect(anchor!.massBearing).toBe(true);
      expect(anchor!.principal).toBe("physics");
    }
  });

  it("manual publishes the person-principal shift-linkage routed path into the cabin; others do not", () => {
    const manual = make("manual", 6);
    const routed = manual.demands.find((d) => d.kind === "routed-path");
    expect(routed).toBeDefined();
    expect(routed!.principal).toBe("person");
    expect(routed!.reason).toMatch(/cabin|driver/);
    expect(routed!.shape!.kind).toBe("path");
    if (routed!.shape!.kind === "path") {
      const [a, b] = routed!.shape!.waypoints;
      expect(b![2]).toBeGreaterThan(a![2]); // rises out of the tunnel
    }
    for (const type of ["auto", "dct", "cvt", "ev-reduction"] as const) {
      expect(make(type, 6).demands.some((d) => d.kind === "routed-path")).toBe(false);
    }
  });

  it("every demand carries a principal and a stateable reason", () => {
    for (const type of ["manual", "auto", "dct", "cvt", "ev-reduction"] as const) {
      for (const d of make(type, 6).demands) {
        expect(["person", "physics", "law", "brief"]).toContain(d.principal);
        expect(d.reason.trim().length).toBeGreaterThan(0);
      }
    }
  });
});
