import { describe, expect, it } from "vitest";
import { makeAllocator, type Quantity } from "@car/schema";
import { assumed, derived } from "@car/demand";
import { makeCooling, type CoolingPowertrain } from "../src/cooling";

function make(powertrain: CoolingPowertrain, kw: number) {
  return makeCooling(
    { powertrain, power: derived(kw, "kW", "test power") },
    makeAllocator(),
  );
}

const FLUX = 1155.8; // kW/m2 — the sourced street rule, 1 in2 per hp

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

describe("makeCooling — rejected heat via sourced split / efficiency", () => {
  it("ICE: rejected heat equals brake power (the one-third rule, sourced)", () => {
    const c = make("ice", 110);
    expect(c.dims.rejectedHeat.value).toBeCloseTo(110, 9);
    expect(c.dims.heatBasis.license.tag).toBe("SOURCED");
    if (c.dims.heatBasis.license.tag === "SOURCED") {
      expect(c.dims.heatBasis.license.citation ?? "").toMatch(/National Academies|three equal/);
    }
  });

  it("EV: rejected heat is the loss fraction of a sourced efficiency — far below ICE", () => {
    const ev = make("ev", 150);
    expect(ev.dims.rejectedHeat.value).toBeCloseTo((150 * (1 - 0.9)) / 0.9, 6);
    const ice = make("ice", 150);
    expect(ev.dims.rejectedHeat.value).toBeLessThan(ice.dims.rejectedHeat.value);
    expect(ev.dims.frontalArea.value).toBeLessThan(ice.dims.frontalArea.value);
    expect(ev.dims.heatBasis.license.tag).toBe("SOURCED");
  });

  it("EV efficiency can be overridden; out-of-range efficiency throws", () => {
    const eff = makeCooling(
      {
        powertrain: "ev",
        power: derived(150, "kW", "test"),
        drivetrainEfficiency: assumed(0.95, "ratio", "owner override"),
      },
      makeAllocator(),
    );
    expect(eff.dims.rejectedHeat.value).toBeCloseTo((150 * 0.05) / 0.95, 6);
    expect(() =>
      makeCooling(
        {
          powertrain: "ev",
          power: derived(150, "kW", "test"),
          drivetrainEfficiency: assumed(1.2, "ratio", "bad"),
        },
        makeAllocator(),
      ),
    ).toThrow(/efficiency/);
  });

  it("rejects a non-positive power", () => {
    expect(() => make("ice", 0)).toThrow(/positive/);
  });
});

describe("makeCooling — radiator area from the sourced flux coefficient", () => {
  it("area = heat / flux, in mm2", () => {
    const c = make("ice", 110);
    expect(c.dims.frontalArea.value).toBeCloseTo((110 / FLUX) * 1e6, 1);
    expect(c.dims.fluxCoefficient.unit).toBe("kW/m2");
    expect(c.dims.fluxCoefficient.value).toBeCloseTo(FLUX, 6);
  });

  it("radiator area grows monotonically with power", () => {
    const a = make("ice", 80);
    const b = make("ice", 160);
    const c = make("ice", 320);
    expect(b.dims.frontalArea.value / a.dims.frontalArea.value).toBeCloseTo(2, 6);
    expect(c.dims.frontalArea.value).toBeGreaterThan(b.dims.frontalArea.value);
    expect(b.dims.coreWidth.value).toBeGreaterThan(a.dims.coreWidth.value);
    expect(b.dims.coreHeight.value).toBeGreaterThan(a.dims.coreHeight.value);
  });

  it("core width x height reproduces the frontal area at the declared aspect", () => {
    const c = make("ice", 110);
    expect(c.dims.coreWidth.value * c.dims.coreHeight.value).toBeCloseTo(c.dims.frontalArea.value, 3);
    expect(c.dims.coreWidth.value / c.dims.coreHeight.value).toBeCloseTo(1.4, 6);
  });

  it("depth stacks condenser + core + fan shroud; envelope spans the depth", () => {
    const plain = make("ice", 110);
    expect(plain.dims.depth.value).toBeCloseTo(32 + 60, 6);
    const withCond = makeCooling(
      {
        powertrain: "ice",
        power: derived(110, "kW", "test"),
        condenserThickness: assumed(20, "mm", "test condenser"),
      },
      makeAllocator(),
    );
    expect(withCond.dims.depth.value).toBeCloseTo(20 + 32 + 60, 6);
    expect(withCond.envelope!.size[0].value).toBeCloseTo(withCond.dims.depth.value, 6);
    expect(withCond.dims.mass.value).toBeGreaterThan(plain.dims.mass.value);
  });
});

describe("makeCooling — inlet, exit path, mounts", () => {
  it("publishes the inlet aperture demand: physics, sized to admit the cooling airflow", () => {
    const c = make("ice", 110);
    const inlet = c.demands.find((d) => d.kind === "aperture")!;
    expect(inlet).toBeDefined();
    expect(inlet.principal).toBe("physics");
    expect(inlet.reason).toMatch(/inlet must admit the cooling airflow/);
    expect(inlet.magnitude!.value).toBeCloseTo(c.dims.frontalArea.value, 6);
    expect(inlet.shape!.kind).toBe("box");
    if (inlet.shape!.kind === "box") {
      expect(inlet.shape!.size[1].value).toBeCloseTo(c.dims.coreWidth.value, 6);
      expect(inlet.shape!.size[2].value).toBeCloseTo(c.dims.coreHeight.value, 6);
      expect(inlet.shape!.offset![0]).toBeLessThan(0); // ahead of the core face
    }
  });

  it("publishes the exit-path demand: physics, a routed path dropping aft and down", () => {
    const c = make("ice", 110);
    const exit = c.demands.find((d) => d.kind === "routed-path")!;
    expect(exit).toBeDefined();
    expect(exit.principal).toBe("physics");
    expect(exit.reason).toMatch(/exit|leave/);
    expect(exit.shape!.kind).toBe("path");
    if (exit.shape!.kind === "path") {
      const wps = exit.shape!.waypoints;
      expect(wps.length).toBeGreaterThanOrEqual(2);
      expect(wps[0]![0]).toBeCloseTo(c.dims.depth.value, 6); // starts at the pack rear
      expect(wps[wps.length - 1]![2]).toBeLessThan(wps[0]![2]); // drops
      expect(wps[wps.length - 1]![0]).toBeGreaterThan(wps[0]![0]); // runs aft
      expect(exit.shape!.radius.value).toBeCloseTo(Math.sqrt(c.dims.frontalArea.value / Math.PI), 4);
    }
  });

  it("both variants publish the same demand grammar (EV = same shape, smaller numbers)", () => {
    for (const pt of ["ice", "ev"] as const) {
      const c = make(pt, 150);
      expect(c.demands.filter((d) => d.kind === "anchorage").length, pt).toBe(2);
      expect(c.demands.some((d) => d.kind === "aperture"), pt).toBe(true);
      expect(c.demands.some((d) => d.kind === "routed-path"), pt).toBe(true);
      expect(c.demands.some((d) => d.kind === "envelope"), pt).toBe(true);
      for (const a of c.demands.filter((d) => d.kind === "anchorage")) {
        expect(a.massBearing).toBe(true);
      }
      for (const name of ["inlet-face", "coolant-in", "coolant-out", "mount-lower-L", "mount-lower-R"]) {
        expect(c.ports.some((p) => p.name === name), `${pt}:${name}`).toBe(true);
      }
    }
  });

  it("the inlet face port looks forward from the datum", () => {
    const c = make("ice", 110);
    const face = c.ports.find((p) => p.name === "inlet-face")!;
    expect(face.kind).toBe("face");
    expect(face.frame.origin).toEqual([0, 0, 0]);
    expect(face.frame.xAxis).toEqual([-1, 0, 0]);
  });

  it("every demand carries a principal and a stateable reason", () => {
    for (const pt of ["ice", "ev"] as const) {
      for (const d of make(pt, 150).demands) {
        expect(["person", "physics", "law", "brief"]).toContain(d.principal);
        expect(d.reason.trim().length).toBeGreaterThan(0);
      }
    }
  });

  it("every quantity carries a well-formed license; sourced values name sources", () => {
    for (const pt of ["ice", "ev"] as const) {
      const qs = walkQuantities(make(pt, 150));
      expect(qs.length).toBeGreaterThan(8);
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
    }
  });
});
