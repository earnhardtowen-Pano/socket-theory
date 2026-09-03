import { describe, expect, it } from "vitest";
import { makeAllocator, type Quantity } from "@car/schema";
import { assumed, carriesAssumption, derived } from "@car/demand";
import {
  makeEnergyStore,
  makeEVPack,
  makeFuelTank,
  type CellFormat,
} from "../src/energy-store";

function tank(rangeKm: number, lPer100: number) {
  return makeFuelTank(
    {
      kind: "fuel-tank",
      range: derived(rangeKm, "km", "test brief range"),
      consumption: assumed(lPer100, "L/100km", "test: assumed until mass and drag exist — ledger-iterated"),
    },
    makeAllocator(),
  );
}

function pack(kwh: number, format: CellFormat) {
  return makeEVPack(
    { kind: "ev-pack", energy: derived(kwh, "kWh", "test pack energy"), format },
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

describe("makeFuelTank — volume follows the range/consumption chain", () => {
  it("600 km at 8 L/100km makes a 48 L tank", () => {
    const t = tank(600, 8);
    expect(t.dims.volume.value).toBeCloseTo(48, 9);
    expect(t.dims.volume.license.tag).toBe("DERIVED");
  });

  it("the ASSUMED consumption rides the volume chain — surfaced, never buried", () => {
    const t = tank(600, 8);
    expect(carriesAssumption(t.dims.volume)).toBe(true);
    const chain = t.dims.volume.license.tag === "DERIVED" ? t.dims.volume.license.chain : "";
    expect(chain).toContain("[ASSUMED]");
    expect(chain).toMatch(/ledger|mass and drag/);
  });

  it("volume scales with range and with consumption (the ledger iteration knob)", () => {
    expect(tank(1000, 5).dims.volume.value).toBeCloseTo(50, 9);
    expect(tank(600, 10).dims.volume.value).toBeCloseTo(60, 9);
    expect(tank(300, 8).dims.volume.value).toBeCloseTo(24, 9);
  });

  it("box dims reproduce the volume: length x width x height = volume", () => {
    const t = tank(600, 8);
    const mm3 = t.dims.length.value * t.dims.width.value * t.dims.height.value;
    expect(mm3).toBeCloseTo(48e6, 0);
    expect(t.dims.width.value).toBeGreaterThan(t.dims.length.value); // wider than long
  });

  it("mass is fuel (sourced EN 228 density) plus shell", () => {
    const t = tank(600, 8);
    expect(t.dims.fuelMass.value).toBeCloseTo(48 * 0.745, 6);
    expect(t.dims.mass.value).toBeCloseTo(48 * 0.745 + 10, 6);
    expect(t.mass!.value).toBe(t.dims.mass.value);
    const fuelChain = t.dims.fuelMass.license.tag === "DERIVED" ? t.dims.fuelMass.license.chain : "";
    expect(fuelChain).toContain("[SOURCED]");
  });

  it("publishes the law-principal protected zone citing FMVSS 301", () => {
    const t = tank(600, 8);
    const zone = t.demands.find((d) => d.kind === "protected-zone")!;
    expect(zone).toBeDefined();
    expect(zone.principal).toBe("law");
    expect(zone.reason).toMatch(/FMVSS 301/);
    expect(zone.reason).toMatch(/571\.301/);
    expect(zone.magnitude!.license.tag).toBe("ASSUMED"); // standoff mm is assumed — 301 is performance-based
    expect(zone.shape!.kind).toBe("box");
    if (zone.shape!.kind === "box") {
      // zone strictly contains the envelope
      expect(zone.shape!.size[0].value).toBeGreaterThan(t.envelope!.size[0].value);
      expect(zone.shape!.size[2].value).toBeGreaterThan(t.envelope!.size[2].value);
    }
  });

  it("tank straps are mass-bearing anchorages; filler and outlet ports publish", () => {
    const t = tank(600, 8);
    const anchors = t.demands.filter((d) => d.kind === "anchorage");
    expect(anchors.length).toBe(2);
    for (const a of anchors) {
      expect(a.massBearing).toBe(true);
      expect(a.reason).toMatch(/strap/);
    }
    for (const name of ["strap-front", "strap-rear", "filler-neck", "fuel-out"]) {
      expect(t.ports.some((p) => p.name === name), name).toBe(true);
    }
  });

  it("rejects non-positive range or consumption", () => {
    expect(() => tank(0, 8)).toThrow(/positive/);
    expect(() => tank(600, 0)).toThrow(/positive/);
  });
});

describe("makeEVPack — thickness and plan from kWh and cell format", () => {
  it("format sets the thickness: cylindrical 110, prismatic 130, pouch 140 mm", () => {
    expect(pack(75, "cylindrical").dims.thickness.value).toBeCloseTo(70 + 40, 6);
    expect(pack(75, "prismatic").dims.thickness.value).toBeCloseTo(90 + 40, 6);
    expect(pack(75, "pouch").dims.thickness.value).toBeCloseTo(100 + 40, 6);
  });

  it("75 kWh prismatic reproduces the sourced 206 Wh/L pack volume", () => {
    const p = pack(75, "prismatic");
    expect(p.dims.packEnergyDensity.value).toBeCloseTo(206, 6);
    expect(p.dims.volume.value).toBeCloseTo(75000 / 206, 4);
  });

  it("format packing factors order the effective density: prismatic > pouch > cylindrical", () => {
    const pr = pack(75, "prismatic").dims.packEnergyDensity.value;
    const po = pack(75, "pouch").dims.packEnergyDensity.value;
    const cy = pack(75, "cylindrical").dims.packEnergyDensity.value;
    expect(pr).toBeGreaterThan(po);
    expect(po).toBeGreaterThan(cy);
    expect(po).toBeCloseTo(206 * 0.93, 4);
    expect(cy).toBeCloseTo(206 * (Math.PI / (2 * Math.sqrt(3))), 4);
  });

  it("plan area = cell field / thickness plus case overhead; width x length = plan area", () => {
    const p = pack(75, "prismatic");
    const vMm3 = p.dims.volume.value * 1e6;
    expect(p.dims.planArea.value).toBeCloseTo((vMm3 / p.dims.thickness.value) * 1.1, 3);
    expect(p.dims.length.value * p.dims.width.value).toBeCloseTo(p.dims.planArea.value, 3);
    expect(p.dims.width.value).toBeCloseTo(1350, 6);
  });

  it("volume and plan scale with kWh; thickness does not", () => {
    const a = pack(50, "prismatic");
    const b = pack(100, "prismatic");
    expect(b.dims.volume.value / a.dims.volume.value).toBeCloseTo(2, 9);
    expect(b.dims.length.value / a.dims.length.value).toBeCloseTo(2, 9);
    expect(b.dims.thickness.value).toBe(a.dims.thickness.value);
  });

  it("mass follows the sourced pack-level Wh/kg", () => {
    const p = pack(75, "prismatic");
    expect(p.dims.mass.value).toBeCloseTo(75000 / 160, 6);
    expect(p.mass!.value).toBe(p.dims.mass.value);
  });

  it("publishes pack-top at exactly the pack thickness — THE H30 coupling", () => {
    for (const format of ["pouch", "prismatic", "cylindrical"] as const) {
      const p = pack(75, format);
      const top = p.ports.find((x) => x.name === "pack-top")!;
      expect(top, format).toBeDefined();
      expect(top.kind).toBe("face");
      expect(top.frame.origin[2]).toBeCloseTo(p.dims.thickness.value, 9);
      expect(top.frame.zAxis).toEqual([0, 0, 1]);
    }
  });

  it("publishes the law-principal under-floor protected zone citing FMVSS 305", () => {
    const p = pack(75, "prismatic");
    const zone = p.demands.find((d) => d.kind === "protected-zone")!;
    expect(zone).toBeDefined();
    expect(zone.principal).toBe("law");
    expect(zone.reason).toMatch(/FMVSS 305/);
    expect(zone.reason).toMatch(/571\.305/);
    expect(zone.magnitude!.license.tag).toBe("ASSUMED");
  });

  it("four corner mounts, all mass-bearing (the heaviest single part); coolant ports publish", () => {
    const p = pack(75, "prismatic");
    const anchors = p.demands.filter((d) => d.kind === "anchorage");
    expect(anchors.length).toBe(4);
    for (const a of anchors) {
      expect(a.massBearing).toBe(true);
      expect(a.principal).toBe("physics");
    }
    for (const name of ["mount-FL", "mount-FR", "mount-RL", "mount-RR", "hv-out", "coolant-in", "coolant-out"]) {
      expect(p.ports.some((x) => x.name === name), name).toBe(true);
    }
  });

  it("rejects a non-positive energy", () => {
    expect(() => pack(0, "prismatic")).toThrow(/positive/);
  });
});

describe("makeEnergyStore — dispatcher and honesty invariants", () => {
  it("dispatches on kind and tags the instance", () => {
    const t = makeEnergyStore(
      {
        kind: "fuel-tank",
        range: derived(600, "km", "test"),
        consumption: assumed(8, "L/100km", "test assumption"),
      },
      makeAllocator(),
    );
    const p = makeEnergyStore(
      { kind: "ev-pack", energy: derived(75, "kWh", "test"), format: "prismatic" },
      makeAllocator(),
    );
    expect(t.storeKind).toBe("fuel-tank");
    expect(p.storeKind).toBe("ev-pack");
  });

  it("every demand carries a principal and a stateable reason (both variants)", () => {
    for (const part of [tank(600, 8), pack(75, "pouch"), pack(60, "cylindrical")]) {
      for (const d of part.demands) {
        expect(["person", "physics", "law", "brief"]).toContain(d.principal);
        expect(d.reason.trim().length).toBeGreaterThan(0);
      }
    }
  });

  it("every quantity carries a well-formed license; sourced values name sources", () => {
    for (const part of [tank(600, 8), pack(75, "prismatic"), pack(75, "cylindrical")]) {
      const qs = walkQuantities(part);
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
