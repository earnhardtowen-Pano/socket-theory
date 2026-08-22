import { describe, expect, it } from "vitest";
import { makeAllocator } from "@car/schema";
import type { BoxShape, Pt3 } from "@car/schema";
import { assumed, derived } from "@car/demand";
import { makeEngineICE, type EngineICEParams } from "../src/engine-ice";

function v6_3L(over: Partial<EngineICEParams> = {}) {
  return makeEngineICE(
    {
      layout: "V",
      cylinders: derived(6, "count", "test: six cylinders"),
      displacement: assumed(3.0, "L", "test displacement"),
      boreStrokeRatio: assumed(1.1, "ratio", "test oversquare ratio"),
      vAngleDeg: assumed(60, "deg", "test V angle"),
      orientation: "longitudinal",
      ...over,
    },
    makeAllocator(),
  );
}

describe("makeEngineICE — derivation chains", () => {
  it("derives bore and stroke with the chain shown, mentioning the inputs", () => {
    const e = v6_3L();
    expect(e.dims.bore.license.tag).toBe("DERIVED");
    expect(e.dims.stroke.license.tag).toBe("DERIVED");
    const boreChain = e.dims.bore.license.tag === "DERIVED" ? e.dims.bore.license.chain : "";
    expect(boreChain).toContain("displacement");
    expect(boreChain).toContain("cbrt(4*Vcyl*R/pi)");
    expect(boreChain).toContain("3 L"); // displacement value surfaced
    const strokeChain = e.dims.stroke.license.tag === "DERIVED" ? e.dims.stroke.license.chain : "";
    expect(strokeChain).toContain("div"); // composed licensed arithmetic
  });

  it("3.0L V6 lands a plausible bore (80–100 mm) and stroke consistent with the ratio", () => {
    const e = v6_3L();
    expect(e.dims.bore.value).toBeGreaterThan(80);
    expect(e.dims.bore.value).toBeLessThan(100);
    expect(e.dims.stroke.value).toBeCloseTo(e.dims.bore.value / 1.1, 6);
    // pi/4 * bore^2 * stroke * 6 cylinders ≈ 3.0 L
    const rebuilt = (Math.PI / 4) * e.dims.bore.value ** 2 * e.dims.stroke.value * 6;
    expect(rebuilt).toBeCloseTo(3.0e6, 0);
  });

  it("bore spacing is SOURCED with a citation and block length = cylinders-per-bank x spacing", () => {
    const e = v6_3L();
    expect(e.dims.boreSpacing.license.tag).toBe("DERIVED"); // bore x sourced ratio
    const chain = e.dims.boreSpacing.license.tag === "DERIVED" ? e.dims.boreSpacing.license.chain : "";
    expect(chain).toContain("[SOURCED]");
    expect(e.dims.cylindersPerBank.value).toBe(3);
    expect(e.dims.blockLength.value).toBeCloseTo(e.dims.cylindersPerBank.value * e.dims.boreSpacing.value, 6);
    expect(e.dims.blockLength.license.tag).toBe("DERIVED");
  });

  it("block length grows with cylinder count (same layout, same displacement per cylinder scaling)", () => {
    const six = v6_3L();
    const eight = v6_3L({
      cylinders: derived(8, "count", "test: eight cylinders"),
      displacement: assumed(4.0, "L", "test displacement keeping Vcyl constant"),
      vAngleDeg: assumed(90, "deg", "test V8 angle"),
    });
    expect(eight.dims.blockLength.value).toBeGreaterThan(six.dims.blockLength.value);
    const i4 = v6_3L({ layout: "I", cylinders: derived(4, "count", "test"), displacement: assumed(2.0, "L", "test") });
    const i6 = v6_3L({ layout: "I", cylinders: derived(6, "count", "test"), displacement: assumed(3.0, "L", "test") });
    expect(i6.dims.blockLength.value).toBeGreaterThan(i4.dims.blockLength.value);
  });

  it("V-angle widens the envelope and lowers it", () => {
    const v60 = v6_3L({ vAngleDeg: assumed(60, "deg", "test") });
    const v90 = v6_3L({ vAngleDeg: assumed(90, "deg", "test") });
    expect(v90.dims.width.value).toBeGreaterThan(v60.dims.width.value);
    expect(v90.dims.height.value).toBeLessThan(v60.dims.height.value);
    const flat = v6_3L({ layout: "flat" });
    expect(flat.dims.width.value).toBeGreaterThan(v90.dims.width.value);
  });

  it("an inline block is narrower than a V of the same displacement", () => {
    const i6 = v6_3L({ layout: "I" });
    const v6 = v6_3L();
    expect(i6.dims.width.value).toBeLessThan(v6.dims.width.value);
  });

  it("tilt inflates the cross-section envelope", () => {
    const upright = v6_3L();
    const tilted = v6_3L({ tiltDeg: assumed(20, "deg", "test tilt") });
    expect(tilted.dims.width.value).toBeGreaterThan(upright.dims.width.value);
  });

  it("requires vAngleDeg for V layouts", () => {
    expect(() =>
      makeEngineICE(
        {
          layout: "V",
          cylinders: derived(6, "count", "test"),
          displacement: assumed(3.0, "L", "test"),
          boreStrokeRatio: assumed(1.1, "ratio", "test"),
          orientation: "longitudinal",
        },
        makeAllocator(),
      ),
    ).toThrow(/vAngleDeg/);
  });
});

describe("makeEngineICE — ports and envelope consistency", () => {
  function envelopeBounds(env: BoxShape): { min: Pt3; max: Pt3 } {
    const off = env.offset ?? [0, 0, 0];
    const half = env.size.map((q) => q.value / 2);
    return {
      min: [off[0] - half[0]!, off[1] - half[1]!, off[2] - half[2]!],
      max: [off[0] + half[0]!, off[1] + half[1]!, off[2] + half[2]!],
    };
  }

  it("publishes the full port set with the bellhousing at the datum", () => {
    const e = v6_3L();
    const names = e.ports.map((p) => p.name);
    for (const n of ["bellhousing", "mount-front-L", "mount-front-R", "exhaust-flange-L", "exhaust-flange-R", "coolant-in", "coolant-out", "intake-mouth"]) {
      expect(names).toContain(n);
    }
    const bell = e.ports.find((p) => p.name === "bellhousing")!;
    expect(bell.frame.origin).toEqual([0, 0, 0]);
    expect(bell.frame.xAxis).toEqual([1, 0, 0]); // aft, out of the rear face
  });

  it("an inline engine publishes a single exhaust flange", () => {
    const i4 = v6_3L({ layout: "I", cylinders: derived(4, "count", "test"), displacement: assumed(2.0, "L", "test") });
    const names = i4.ports.map((p) => p.name);
    expect(names).toContain("exhaust-flange-L");
    expect(names).not.toContain("exhaust-flange-R");
  });

  it("every port origin lies within (or on) the envelope box", () => {
    const e = v6_3L();
    const { min, max } = envelopeBounds(e.envelope!);
    const eps = 1e-6;
    for (const p of e.ports) {
      const [x, y, z] = p.frame.origin;
      expect(x, `${p.name} x`).toBeGreaterThanOrEqual(min[0] - eps);
      expect(x, `${p.name} x`).toBeLessThanOrEqual(max[0] + eps);
      expect(y, `${p.name} y`).toBeGreaterThanOrEqual(min[1] - eps);
      expect(y, `${p.name} y`).toBeLessThanOrEqual(max[1] + eps);
      expect(z, `${p.name} z`).toBeGreaterThanOrEqual(min[2] - eps);
      expect(z, `${p.name} z`).toBeLessThanOrEqual(max[2] + eps);
    }
  });

  it("exhaust flanges sit on the envelope side faces, mirrored", () => {
    const e = v6_3L();
    const L = e.ports.find((p) => p.name === "exhaust-flange-L")!;
    const R = e.ports.find((p) => p.name === "exhaust-flange-R")!;
    expect(L.frame.origin[1]).toBeGreaterThan(0);
    expect(R.frame.origin[1]).toBeLessThan(0);
    expect(L.frame.origin[1]).toBeCloseTo(-R.frame.origin[1], 6);
  });

  it("transverse orientation swaps the envelope footprint and turns the bellhousing to +Y", () => {
    const lon = v6_3L();
    const tra = v6_3L({ orientation: "transverse" });
    expect(tra.envelope!.size[0].value).toBeCloseTo(lon.envelope!.size[1].value, 6);
    expect(tra.envelope!.size[1].value).toBeCloseTo(lon.envelope!.size[0].value, 6);
    const bell = tra.ports.find((p) => p.name === "bellhousing")!;
    expect(bell.frame.xAxis).toEqual([0, 1, 0]);
  });
});

describe("makeEngineICE — demands, mass, licenses", () => {
  it("publishes mass-bearing anchorage demands for both mounts", () => {
    const e = v6_3L();
    const anchors = e.demands.filter((d) => d.kind === "anchorage");
    expect(anchors).toHaveLength(2);
    for (const a of anchors) {
      expect(a.massBearing).toBe(true);
      expect(a.principal).toBe("physics");
      expect(a.reason.length).toBeGreaterThan(0);
    }
  });

  it("publishes envelope, heat clearance per exhaust bank, and person-principal service clearance", () => {
    const e = v6_3L();
    expect(e.demands.some((d) => d.kind === "envelope" && d.principal === "physics")).toBe(true);
    const heat = e.demands.filter((d) => d.kind === "clearance" && d.principal === "physics");
    expect(heat).toHaveLength(2); // V engine: both banks
    const service = e.demands.find((d) => d.kind === "clearance" && d.principal === "person");
    expect(service).toBeDefined();
    expect(service!.reason).toMatch(/technician|reach/);
    const i4 = v6_3L({ layout: "I", cylinders: derived(4, "count", "test"), displacement: assumed(2.0, "L", "test") });
    expect(i4.demands.filter((d) => d.kind === "clearance" && d.principal === "physics")).toHaveLength(1);
  });

  it("carries a plausible derived mass from the sourced specific mass", () => {
    const e = v6_3L();
    expect(e.mass).toBeDefined();
    expect(e.mass!.value).toBeCloseTo(3.0 * 46.5, 3);
    expect(e.mass!.license.tag).toBe("DERIVED");
    const chain = e.mass!.license.tag === "DERIVED" ? e.mass!.license.chain : "";
    expect(chain).toContain("[SOURCED]");
  });

  it("every demand carries a principal and a non-empty reason", () => {
    const e = v6_3L({ turbo: true });
    for (const d of e.demands) {
      expect(["person", "physics", "law", "brief"]).toContain(d.principal);
      expect(d.reason.trim().length).toBeGreaterThan(0);
    }
  });

  it("turbo widens the envelope via the per-bank bubble", () => {
    const na = v6_3L();
    const turbo = v6_3L({ turbo: true });
    expect(turbo.dims.width.value).toBeGreaterThan(na.dims.width.value);
  });
});
