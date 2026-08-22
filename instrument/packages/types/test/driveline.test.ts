import { describe, expect, it } from "vitest";
import { makeAllocator } from "@car/schema";
import { assumed, derived } from "@car/demand";
import { makeDriveline, type DrivelineParams } from "../src/driveline";

function make(over: Partial<DrivelineParams> = {}) {
  return makeDriveline(
    {
      torque: derived(400, "Nm", "test peak torque"),
      layout: "longitudinal",
      ...over,
    },
    makeAllocator(),
  );
}

describe("makeDriveline — shaft diameter from allowable shear", () => {
  it("shows the derivation chain: tau = 16T/(pi d^3) solved for d", () => {
    const d = make();
    expect(d.dims.shaftDiameter.license.tag).toBe("DERIVED");
    const chain = d.dims.shaftDiameter.license.tag === "DERIVED" ? d.dims.shaftDiameter.license.chain : "";
    expect(chain).toContain("tau = 16T/(pi d^3) solved for d");
    expect(chain).toContain("400 Nm"); // input torque surfaced
    expect(chain).toContain("SOURCED"); // allowable shear provenance surfaced
  });

  it("matches the closed form on the sourced allowable (153 MPa = min(0.3*655, 0.18*850))", () => {
    const d = make();
    expect(d.dims.allowableShear.value).toBeCloseTo(153, 6);
    expect(d.dims.allowableShear.license.tag).toBe("DERIVED"); // min of two sourced products
    const expected = Math.cbrt((16 * 400 * 1.5 * 1000) / (Math.PI * 153));
    expect(d.dims.shaftDiameter.value).toBeCloseTo(expected, 6);
    expect(d.dims.shaftDiameter.value).toBeGreaterThan(15);
    expect(d.dims.shaftDiameter.value).toBeLessThan(45); // plausible passenger-car solid shaft
  });

  it("diameter grows with torque as T^(1/3)", () => {
    const small = make({ torque: derived(200, "Nm", "test") });
    const big = make({ torque: derived(1600, "Nm", "test") });
    expect(big.dims.shaftDiameter.value).toBeCloseTo(small.dims.shaftDiameter.value * 2, 6);
  });
});

describe("makeDriveline — layout demands and ports", () => {
  it("longitudinal publishes the tunnel-section routed path (physics) sized shaft radius + clearance", () => {
    const d = make();
    const tunnel = d.demands.find((x) => x.kind === "routed-path");
    expect(tunnel).toBeDefined();
    expect(tunnel!.principal).toBe("physics");
    expect(tunnel!.reason).toMatch(/tunnel/);
    expect(tunnel!.shape!.kind).toBe("path");
    if (tunnel!.shape!.kind === "path") {
      expect(tunnel!.shape!.radius.value).toBeGreaterThan(d.dims.shaftDiameter.value / 2);
      const last = tunnel!.shape!.waypoints[tunnel!.shape!.waypoints.length - 1]!;
      expect(last[0]).toBeCloseTo(d.dims.shaftLength.value, 6);
    }
  });

  it("transverse publishes no tunnel demand and keeps the diff at the datum", () => {
    const d = make({ layout: "transverse" });
    expect(d.demands.some((x) => x.kind === "routed-path")).toBe(false);
    const diff = d.ports.find((p) => p.name === "diff")!;
    expect(diff.frame.origin[0]).toBe(0);
  });

  it("puts the diff port at the shaft end and mirrors the halfshaft ports", () => {
    const d = make({ shaftLength: assumed(1400, "mm", "test span") });
    const diff = d.ports.find((p) => p.name === "diff")!;
    expect(diff.frame.origin[0]).toBeCloseTo(1400, 6);
    const L = d.ports.find((p) => p.name === "halfshaft-L")!;
    const R = d.ports.find((p) => p.name === "halfshaft-R")!;
    expect(L.frame.origin[1]).toBeGreaterThan(0);
    expect(L.frame.origin[1]).toBeCloseTo(-R.frame.origin[1], 6);
    expect(L.frame.origin[0]).toBeCloseTo(diff.frame.origin[0], 6);
    expect(L.frame.xAxis).toEqual([0, 1, 0]);
    expect(R.frame.xAxis).toEqual([0, -1, 0]);
  });

  it("publishes a mass-bearing anchorage for the final drive", () => {
    const d = make();
    const anchor = d.demands.find((x) => x.kind === "anchorage");
    expect(anchor).toBeDefined();
    expect(anchor!.massBearing).toBe(true);
    expect(anchor!.principal).toBe("physics");
  });

  it("publishes swept-envelope articulation demands per halfshaft with the sourced joint limit as magnitude", () => {
    const d = make();
    const sweeps = d.demands.filter((x) => x.kind === "swept-envelope");
    expect(sweeps).toHaveLength(2);
    for (const s of sweeps) {
      expect(s.principal).toBe("physics");
      expect(s.magnitude!.value).toBe(22);
      expect(s.magnitude!.license.tag).toBe("SOURCED");
      expect(s.reason).toMatch(/GKN/);
    }
  });
});

describe("makeDriveline — sourced articulation limits and mass", () => {
  it("carries GKN joint limits as SOURCED defaults, overridable by the caller", () => {
    const d = make();
    expect(d.dims.articulationFixedDeg.value).toBe(47);
    expect(d.dims.articulationFixedDeg.license.tag).toBe("SOURCED");
    expect(d.dims.articulationPlungeDeg.value).toBe(22);
    expect(d.dims.plungeTravel.value).toBe(50);
    expect(d.dims.plungeTravel.license.tag).toBe("SOURCED");
    const custom = make({ articulationFixedDeg: assumed(40, "deg", "test override") });
    expect(custom.dims.articulationFixedDeg.value).toBe(40);
  });

  it("derives shaft mass from volume x sourced density, plus diff and halfshafts", () => {
    const d = make({ shaftLength: assumed(1500, "mm", "test span") });
    expect(d.mass!.license.tag).toBe("DERIVED");
    const dia = d.dims.shaftDiameter.value;
    const area = (Math.PI / 4) * dia * dia;
    const shaftKg = area * 1500 * 7.85e-6;
    const halfshaftsKg = area * d.dims.halfshaftLength.value * 7.85e-6 * 2;
    expect(d.mass!.value).toBeCloseTo(shaftKg + 35 + halfshaftsKg, 3);
    const tra = make({ layout: "transverse" });
    // no propshaft, diff counted in the transaxle — halfshafts remain
    expect(tra.mass!.value).toBeCloseTo(halfshaftsKg, 3);
    expect(tra.mass!.value).toBeGreaterThan(0);
  });

  it("every demand carries a principal and a stateable reason", () => {
    for (const layout of ["longitudinal", "transverse"] as const) {
      for (const d of make({ layout }).demands) {
        expect(["person", "physics", "law", "brief"]).toContain(d.principal);
        expect(d.reason.trim().length).toBeGreaterThan(0);
      }
    }
  });
});
