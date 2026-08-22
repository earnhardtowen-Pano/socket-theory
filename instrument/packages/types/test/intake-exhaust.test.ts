import { describe, expect, it } from "vitest";
import { makeAllocator } from "@car/schema";
import { assumed, derived } from "@car/demand";
import { makeIntakeExhaust, type IntakeExhaustParams } from "../src/intake-exhaust";

function make(over: Partial<IntakeExhaustParams> = {}) {
  return makeIntakeExhaust(
    {
      filterVolume: assumed(4.0, "L", "test filter volume"),
      displacement: assumed(3.0, "L", "test displacement"),
      ...over,
    },
    makeAllocator(),
  );
}

describe("makeIntakeExhaust — sized volumes and chains", () => {
  it("sizes the muffler at the sourced 10x displacement and boxes it near the tail", () => {
    const x = make();
    expect(x.dims.mufflerVolume.value).toBeCloseTo(3.0e6 * 10, 0);
    const chain = x.dims.mufflerVolume.license.tag === "DERIVED" ? x.dims.mufflerVolume.license.chain : "";
    expect(chain).toContain("[SOURCED]");
    // 1x1x3 brick recovers the volume
    expect(x.dims.mufflerSide.value ** 2 * x.dims.mufflerLength.value).toBeCloseTo(x.dims.mufflerVolume.value, 0);
    const muffler = x.ports.find((p) => p.name === "muffler")!;
    expect(muffler.frame.origin[0]).toBeCloseTo(x.dims.runLength.value - x.dims.mufflerLength.value / 2, 6);
  });

  it("sizes the catalyst at the sourced 1.2x displacement, close-coupled", () => {
    const x = make();
    expect(x.dims.catalystVolume.value).toBeCloseTo(3.0e6 * 1.2, 0);
    // volume recovered from diameter and length
    const v = (Math.PI / 4) * x.dims.catalystDiameter.value ** 2 * x.dims.catalystLength.value;
    expect(v).toBeCloseTo(x.dims.catalystVolume.value, 0);
    const cat = x.ports.find((p) => p.name === "catalyst")!;
    expect(cat.frame.origin[0]).toBeLessThan(x.dims.runLength.value / 4); // near the manifold, not the tail
  });

  it("sizes the airbox as a cube on the filter volume with the chain shown", () => {
    const x = make();
    expect(x.dims.airboxSide.value ** 3).toBeCloseTo(4.0e6, 0);
    const chain = x.dims.airboxSide.license.tag === "DERIVED" ? x.dims.airboxSide.license.chain : "";
    expect(chain).toContain("filter volume");
    // bigger filter, bigger airbox
    expect(make({ filterVolume: assumed(8.0, "L", "test") }).dims.airboxSide.value).toBeGreaterThan(x.dims.airboxSide.value);
  });

  it("muffler and catalyst scale with displacement", () => {
    const small = make({ displacement: assumed(1.5, "L", "test") });
    const big = make({ displacement: assumed(4.5, "L", "test") });
    expect(big.dims.mufflerVolume.value).toBeCloseTo(small.dims.mufflerVolume.value * 3, 0);
    expect(big.dims.catalystLength.value).toBeCloseTo(small.dims.catalystLength.value * 3, 3);
  });
});

describe("makeIntakeExhaust — the four charged demands", () => {
  it("publishes the catalyst heat bubble near the manifold (physics)", () => {
    const x = make();
    const heat = x.demands.find((d) => d.kind === "clearance" && d.principal === "physics");
    expect(heat).toBeDefined();
    expect(heat!.reason).toMatch(/catalyst|430/);
    expect(heat!.magnitude!.license.tag).toBe("ASSUMED"); // standoff distance not found — flagged, not invented
    expect(heat!.shape!.kind).toBe("box");
    if (heat!.shape!.kind === "box") {
      expect(heat!.shape!.offset![0]).toBeLessThan(x.dims.runLength.value / 4); // near the manifold
    }
  });

  it("publishes the ground-clearance band with the BRIEF principal, reading stated in the reason", () => {
    const x = make({ groundLineZ: assumed(-280, "mm", "test ground line") });
    const band = x.demands.find((d) => d.kind === "band");
    expect(band).toBeDefined();
    expect(band!.principal).toBe("brief");
    expect(band!.reason).toMatch(/charge §7|owner/);
    expect(band!.shape!.kind).toBe("band");
    if (band!.shape!.kind === "band") {
      expect(band!.shape!.zMin.value).toBe(-280);
      expect(band!.shape!.zMax.value).toBe(0); // the flange/floor datum
    }
  });

  it("publishes the muffler-volume envelope near the tail (physics)", () => {
    const x = make();
    const muf = x.demands.filter((d) => d.kind === "envelope" && d.reason.includes("silencing"));
    expect(muf).toHaveLength(1);
    expect(muf[0]!.principal).toBe("physics");
    if (muf[0]!.shape!.kind === "box") {
      expect(muf[0]!.shape!.offset![0]).toBeGreaterThan(x.dims.runLength.value / 2); // near the tail
    }
  });

  it("publishes the heat-shield demand past the tank zone with the LAW principal", () => {
    const x = make({
      tankZoneStartX: assumed(1700, "mm", "test tank zone"),
      tankZoneEndX: assumed(2300, "mm", "test tank zone"),
    });
    const shield = x.demands.find((d) => d.principal === "law");
    expect(shield).toBeDefined();
    expect(shield!.kind).toBe("clearance");
    expect(shield!.reason).toMatch(/FMVSS 301/);
    expect(shield!.magnitude!.license.tag).toBe("ASSUMED"); // gap flagged, not invented
    if (shield!.shape!.kind === "box") {
      expect(shield!.shape!.offset![0]).toBeCloseTo(2000, 6); // spans the tank zone
      expect(shield!.shape!.size[0].value).toBeCloseTo(600, 6);
    }
  });
});

describe("makeIntakeExhaust — ports, hangers, envelope, mass", () => {
  it("publishes flange at the datum, tailpipe at the run end, intake mouth high and dry", () => {
    const x = make();
    const flange = x.ports.find((p) => p.name === "manifold-flange")!;
    const tail = x.ports.find((p) => p.name === "tailpipe")!;
    const mouth = x.ports.find((p) => p.name === "intake-mouth")!;
    expect(flange.frame.origin).toEqual([0, 0, 0]);
    expect(tail.frame.origin[0]).toBeCloseTo(x.dims.runLength.value, 6);
    expect(tail.frame.xAxis).toEqual([1, 0, 0]);
    expect(mouth.frame.origin[2]).toBeGreaterThan(0); // above the flange datum: high and dry
  });

  it("hangs the run from two mass-bearing anchorages (front and rear)", () => {
    const x = make();
    const hangers = x.demands.filter((d) => d.kind === "anchorage");
    expect(hangers).toHaveLength(2);
    for (const h of hangers) {
      expect(h.massBearing).toBe(true);
      expect(h.principal).toBe("physics");
    }
    const xs = hangers.map((h) => (h.shape!.kind === "box" ? h.shape!.offset![0] : Number.NaN));
    expect(Math.min(...xs)).toBeLessThan(x.dims.runLength.value / 4);
    expect(Math.max(...xs)).toBeGreaterThan(x.dims.runLength.value / 2);
  });

  it("envelope spans the run and the airbox height", () => {
    const x = make();
    const env = x.envelope!;
    expect(env.size[0].value).toBeGreaterThanOrEqual(x.dims.runLength.value);
    expect(env.size[2].value).toBeGreaterThan(x.dims.mufflerSide.value); // reaches up to the airbox
  });

  it("carries a licensed mass that grows with run length", () => {
    const short = make({ runLength: assumed(2000, "mm", "test") });
    const long = make({ runLength: assumed(4000, "mm", "test") });
    expect(short.mass!.value).toBeGreaterThan(0);
    expect(long.mass!.value).toBeGreaterThan(short.mass!.value);
    expect(short.mass!.license.tag).toBe("DERIVED"); // assumed coefficient x length, chain carries [ASSUMED]
    const chain = short.mass!.license.tag === "DERIVED" ? short.mass!.license.chain : "";
    expect(chain).toContain("[ASSUMED]");
  });

  it("every demand carries a principal and a stateable reason", () => {
    for (const d of make().demands) {
      expect(["person", "physics", "law", "brief"]).toContain(d.principal);
      expect(d.reason.trim().length).toBeGreaterThan(0);
    }
  });
});
