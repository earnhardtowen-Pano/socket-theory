import { describe, expect, it } from "vitest";
import { makeAllocator, type Quantity } from "@car/schema";
import { assumed, derived } from "@car/demand";
import { makeEVMotor } from "../src/ev-motor";

function make(kw: number, stages?: number) {
  return makeEVMotor(
    {
      peakPower: derived(kw, "kW", "test peak power"),
      ...(stages !== undefined ? { reductionStages: derived(stages, "count", "test stages") } : {}),
    },
    makeAllocator(),
  );
}

function walkQuantities(x: unknown, out: Quantity[] = []): Quantity[] {
  if (x && typeof x === "object") {
    const rec = x as Record<string, unknown>;
    if (rec["__brand"] === "Quantity") {
      out.push(x as Quantity);
      return out;
    }
    for (const v of Object.values(rec)) walkQuantities(v, out);
  }
  return out;
}

describe("makeEVMotor — kW to dimensions via sourced power density", () => {
  it("150 kW machine reproduces the ORNL-density volume, diameter, and length", () => {
    const m = make(150);
    // volume = 150 / 5.7 kW/L (2017 Prius benchmark)
    expect(m.dims.volume.value).toBeCloseTo(150 / 5.7, 6);
    // D = cbrt(4V / (pi * AR)) with AR = 0.8
    const vMm3 = (150 / 5.7) * 1e6;
    const expectedD = Math.cbrt((4 * vMm3) / (Math.PI * 0.8));
    expect(m.dims.diameter.value).toBeCloseTo(expectedD, 6);
    expect(m.dims.activeLength.value).toBeCloseTo(0.8 * expectedD, 6);
  });

  it("scales with kW: volume linear, diameter cube-root, mass linear", () => {
    const a = make(150);
    const b = make(300);
    expect(b.dims.volume.value / a.dims.volume.value).toBeCloseTo(2, 9);
    expect(b.dims.diameter.value / a.dims.diameter.value).toBeCloseTo(Math.cbrt(2), 9);
    expect(b.dims.motorMass.value / a.dims.motorMass.value).toBeCloseTo(2, 9);
    expect(b.dims.diameter.value).toBeGreaterThan(a.dims.diameter.value);
  });

  it("mass comes from the sourced gravimetric density plus the reduction stage", () => {
    const m = make(150);
    expect(m.dims.motorMass.value).toBeCloseTo(150 / 1.6, 6);
    expect(m.dims.mass.value).toBeCloseTo(150 / 1.6 + 25, 6);
    expect(m.mass).toBeDefined();
    expect(m.mass!.value).toBe(m.dims.mass.value);
    expect(m.dims.motorMass.license.tag).toBe("DERIVED");
    const chain = m.dims.motorMass.license.tag === "DERIVED" ? m.dims.motorMass.license.chain : "";
    expect(chain).toContain("[SOURCED]");
  });

  it("the reduction-stage parameter adds axial length per stage", () => {
    const none = make(150, 0);
    const one = make(150, 1);
    const twoStage = make(150, 2);
    expect(none.dims.axialLength.value).toBeCloseTo(none.dims.activeLength.value, 6);
    expect(one.dims.axialLength.value).toBeCloseTo(one.dims.activeLength.value + 120, 6);
    expect(twoStage.dims.axialLength.value).toBeCloseTo(twoStage.dims.activeLength.value + 240, 6);
    expect(twoStage.dims.reductionMass.value).toBeCloseTo(50, 6);
  });

  it("power densities are SOURCED with the ORNL benchmark named", () => {
    const m = make(150);
    const rv = m.dims.volumetricPowerDensity;
    const rm = m.dims.gravimetricPowerDensity;
    expect(rv.license.tag).toBe("SOURCED");
    expect(rm.license.tag).toBe("SOURCED");
    if (rv.license.tag === "SOURCED") {
      expect(rv.license.source.length).toBeGreaterThan(0);
      expect(rv.license.citation ?? "").toMatch(/ORNL|Burress/);
    }
    if (rm.license.tag === "SOURCED") {
      expect(rm.license.citation ?? "").toMatch(/ORNL|Burress/);
    }
  });

  it("an owner override of the density flips the sizing basis to the override", () => {
    const hot = makeEVMotor(
      {
        peakPower: derived(150, "kW", "test peak power"),
        volumetricPowerDensity: assumed(20, "ratio", "owner override: modern 800V machine, kW/L carrier"),
      },
      makeAllocator(),
    );
    expect(hot.dims.volume.value).toBeCloseTo(150 / 20, 9);
    expect(hot.dims.volume.license.tag).toBe("DERIVED");
    const chain = hot.dims.volume.license.tag === "DERIVED" ? hot.dims.volume.license.chain : "";
    expect(chain).toContain("[ASSUMED]");
  });

  it("rejects a non-positive power", () => {
    expect(() => make(0)).toThrow(/positive/);
    expect(() => make(-50)).toThrow(/positive/);
  });
});

describe("makeEVMotor — ports and demands", () => {
  it("publishes output shafts on both sides along the motor axis", () => {
    const m = make(150);
    const outL = m.ports.find((p) => p.name === "output-L")!;
    const outR = m.ports.find((p) => p.name === "output-R")!;
    expect(outL.kind).toBe("axis");
    expect(outR.kind).toBe("axis");
    expect(outL.frame.xAxis).toEqual([0, 1, 0]);
    expect(outR.frame.xAxis).toEqual([0, -1, 0]);
    // opposite ends of the axial stack
    expect(outL.frame.origin[1]).toBeGreaterThan(0);
    expect(outR.frame.origin[1]).toBeLessThan(0);
    expect(outL.frame.origin[1]).toBeCloseTo(m.dims.activeLength.value / 2, 6);
    expect(-outR.frame.origin[1]).toBeCloseTo(
      m.dims.activeLength.value / 2 + m.dims.reductionLength.value,
      6,
    );
  });

  it("publishes mounts and coolant ports", () => {
    const m = make(150);
    for (const name of ["mount-L", "mount-R", "mount-torque", "coolant-in", "coolant-out", "hv-in"]) {
      expect(m.ports.some((p) => p.name === name), name).toBe(true);
    }
  });

  it("every mount carries a mass-bearing anchorage demand (anchorage law)", () => {
    const m = make(150);
    const anchors = m.demands.filter((d) => d.kind === "anchorage");
    expect(anchors.length).toBe(3);
    for (const a of anchors) {
      expect(a.massBearing).toBe(true);
      expect(a.principal).toBe("physics");
      expect(a.reason).toMatch(/reinforced member/);
    }
  });

  it("claims an envelope sized by the derived dims plus the terminal box", () => {
    const m = make(150);
    expect(m.envelope).toBeDefined();
    const env = m.envelope!;
    expect(env.size[0].value).toBeCloseTo(m.dims.diameter.value, 6);
    expect(env.size[1].value).toBeCloseTo(m.dims.axialLength.value, 6);
    expect(env.size[2].value).toBeCloseTo(m.dims.diameter.value + 70, 6);
    expect(m.demands.some((d) => d.kind === "envelope")).toBe(true);
    expect(m.demands.some((d) => d.kind === "clearance")).toBe(true); // HV bend radius
  });

  it("every demand carries a principal and a stateable reason", () => {
    for (const d of make(150).demands) {
      expect(["person", "physics", "law", "brief"]).toContain(d.principal);
      expect(d.reason.trim().length).toBeGreaterThan(0);
    }
  });

  it("every quantity in the instance carries a well-formed license; sourced values name sources", () => {
    const m = make(150);
    const qs = walkQuantities(m);
    expect(qs.length).toBeGreaterThan(10);
    let sourcedCount = 0;
    for (const q of qs) {
      if (q.license.tag === "SOURCED") {
        sourcedCount += 1;
        expect(q.license.source.trim().length).toBeGreaterThan(0);
      } else if (q.license.tag === "DERIVED") {
        expect(q.license.chain.trim().length).toBeGreaterThan(0);
      } else {
        expect(q.license.note.trim().length).toBeGreaterThan(0);
      }
    }
    expect(sourcedCount).toBeGreaterThan(0);
  });
});
