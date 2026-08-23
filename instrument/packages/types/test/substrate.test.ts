import { describe, expect, it } from "vitest";
import { makeAllocator } from "@car/schema";
import { assumed, derived } from "@car/demand";
import {
  SUBSTRATE_EXCLUSIONS,
  TORSIONAL_STIFFNESS_EXCLUSION,
  makeSubstrate,
  type SubstrateParams,
} from "../src/substrate";

function frame(over: Partial<SubstrateParams> = {}) {
  return makeSubstrate(
    {
      style: "body-on-frame",
      wheelbase: assumed(2900, "mm", "test wheelbase"),
      frontOverhang: assumed(800, "mm", "test front overhang"),
      rearOverhang: assumed(1000, "mm", "test rear overhang"),
      railSpacing: assumed(900, "mm", "test rail spacing"),
      crossmemberCount: derived(5, "count", "test: five crossmembers"),
      ...over,
    },
    makeAllocator(),
  );
}

describe("makeSubstrate — members", () => {
  it("builds two rails + N crossmembers, ALL reinforced", () => {
    const s = frame();
    expect(s.members).toHaveLength(2 + 5);
    for (const m of s.members) {
      expect(m.reinforced).toBe(true);
    }
    const rails = s.members.filter((m) => m.label.startsWith("rail"));
    expect(rails).toHaveLength(2);
    expect(rails[0]!.at[1]).toBeCloseTo(450, 6);
    expect(rails[1]!.at[1]).toBeCloseTo(-450, 6);
  });

  it("rails run overhang-to-overhang; crossmembers spread evenly from tip to tip", () => {
    const s = frame();
    const rail = s.members.find((m) => m.label === "rail-L")!;
    expect(rail.box.size[0].value).toBeCloseTo(800 + 2900 + 1000, 6);
    expect(rail.at[0]).toBeCloseTo((-800 + 3900) / 2, 6);
    const xs = s.members.filter((m) => m.label.startsWith("crossmember")).map((m) => m.at[0]);
    expect(xs[0]).toBeCloseTo(-800, 6);
    expect(xs[xs.length - 1]).toBeCloseTo(3900, 6);
    const gap = xs[1]! - xs[0]!;
    for (let i = 2; i < xs.length; i++) expect(xs[i]! - xs[i - 1]!).toBeCloseTo(gap, 6);
  });

  it("rail section defaults are SOURCED from the published ladder-chassis example", () => {
    const s = frame();
    expect(s.dims.railSectionHeight.value).toBe(100);
    expect(s.dims.railSectionWidth.value).toBe(50);
    expect(s.dims.wallThickness.value).toBe(6);
    for (const q of [s.dims.railSectionHeight, s.dims.railSectionWidth, s.dims.wallThickness]) {
      expect(q.license.tag).toBe("SOURCED");
      const cit = q.license.tag === "SOURCED" ? q.license.citation ?? "" : "";
      expect(cit).toMatch(/Ladder Chassis/);
    }
    // params override the section
    const custom = frame({ railSectionHeight: assumed(150, "mm", "test tall rail") });
    expect(custom.dims.railSectionHeight.value).toBe(150);
    const rail = custom.members.find((m) => m.label === "rail-L")!;
    expect(rail.box.size[2].value).toBe(150);
  });

  it("member ids are feature-kind (the pack rig's convention) and unique", () => {
    const s = frame();
    const ids = s.members.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id.startsWith("feature#")).toBe(true);
  });

  it("mass = thin-wall section × total member run × SOURCED steel density", () => {
    const s = frame();
    const area = 100 * 50 - (100 - 12) * (50 - 12); // 1656 mm2
    const totalRun = 2 * 4700 + 5 * 900;
    const expected = (area * totalRun * 7.85) / 1e6;
    expect(s.mass!.value).toBeCloseTo(expected, 3);
    expect(s.mass!.license.tag).toBe("DERIVED");
    const chain = s.mass!.license.tag === "DERIVED" ? s.mass!.license.chain : "";
    expect(chain).toContain("[SOURCED]");
  });
});

describe("makeSubstrate — crush strokes (the pending planning bands)", () => {
  it("publishes front and rear crush demands with the PENDING note, exactly as the charge requires", () => {
    const s = frame();
    const crush = s.demands.filter((d) => d.reason.includes("crush stroke"));
    expect(crush).toHaveLength(2);
    for (const c of crush) {
      expect(c.kind).toBe("clearance");
      expect(c.magnitude).toBeDefined();
      expect(c.magnitude!.license.tag).toBe("ASSUMED");
      const note = c.magnitude!.license.tag === "ASSUMED" ? c.magnitude!.license.note : "";
      expect(note).toMatch(/NON-DERIVABLE HERE/i);
      expect(note).toMatch(/the tool says so/);
      expect(note).toMatch(/pending the owner's crash-band source table/);
    }
  });

  it("front band sits ahead of the front rail tips; rear band behind the rear tips", () => {
    const s = frame();
    const front = s.demands.find((d) => d.reason.startsWith("front crush"))!;
    const rear = s.demands.find((d) => d.reason.startsWith("rear crush"))!;
    if (front.shape!.kind === "box") {
      expect(front.shape!.offset![0]).toBeCloseTo(-800 - 600 / 2, 6);
    }
    if (rear.shape!.kind === "box") {
      expect(rear.shape!.offset![0]).toBeCloseTo(3900 + 450 / 2, 6);
    }
  });

  it("an owner-supplied band replaces the placeholder but the demand still carries its license", () => {
    const s = frame({ crushStrokeFront: assumed(700, "mm", "owner's class table pending — trial value") });
    const front = s.demands.find((d) => d.reason.startsWith("front crush"))!;
    expect(front.magnitude!.value).toBe(700);
    expect(front.magnitude!.license.tag).toBe("ASSUMED");
  });
});

describe("makeSubstrate — tunnel, rockers, exclusion", () => {
  it("publishes the tunnel section between the axles along the centerline", () => {
    const s = frame();
    const tunnel = s.demands.find((d) => d.reason.includes("tunnel section"))!;
    expect(tunnel.kind).toBe("aperture");
    expect(tunnel.reason).toMatch(/driveline/);
    if (tunnel.shape!.kind === "box") {
      expect(tunnel.shape!.size[0].value).toBeCloseTo(2900, 6);
      expect(tunnel.shape!.offset![0]).toBeCloseTo(1450, 6);
      expect(tunnel.shape!.offset![1]).toBeCloseTo(0, 6);
    }
  });

  it("rocker demands L and R whose reasons state the entry-aperture trade (mutual reference)", () => {
    const s = frame();
    const rockers = s.demands.filter((d) => d.reason.includes("rocker section"));
    expect(rockers).toHaveLength(2);
    for (const r of rockers) {
      expect(r.reason).toMatch(/entry aperture/);
      expect(r.reason).toMatch(/every mm of rocker section/);
      expect(r.magnitude!.value).toBe(120);
    }
    const ys = rockers.map((r) => (r.shape!.kind === "box" ? r.shape!.offset![1] : NaN));
    expect(ys[0]).toBeCloseTo(-ys[1]!, 6);
  });

  it("torsional stiffness: members sized, NO stiffness number anywhere — exclusion stated", () => {
    const s = frame();
    expect(TORSIONAL_STIFFNESS_EXCLUSION).toMatch(/NO stiffness number/);
    expect(s.exclusions).toContain(TORSIONAL_STIFFNESS_EXCLUSION);
    expect(SUBSTRATE_EXCLUSIONS.length).toBeGreaterThan(0);
    for (const k of Object.keys(s.dims)) {
      expect(k.toLowerCase()).not.toContain("stiffness");
    }
  });

  it("publishes rail-tip and tower ports at the axle stations", () => {
    const s = frame();
    for (const n of [
      "rail-tip-front-L", "rail-tip-front-R", "rail-tip-rear-L", "rail-tip-rear-R",
      "tower-front-L", "tower-front-R", "tower-rear-L", "tower-rear-R",
    ]) {
      expect(s.ports.some((p) => p.name === n)).toBe(true);
    }
    const towerF = s.ports.find((p) => p.name === "tower-front-L")!;
    expect(towerF.frame.origin[0]).toBeCloseTo(0, 6); // front axle station is the datum
    const towerR = s.ports.find((p) => p.name === "tower-rear-L")!;
    expect(towerR.frame.origin[0]).toBeCloseTo(2900, 6);
  });

  it("every demand carries a principal and a non-empty reason; guards its params", () => {
    const s = frame();
    for (const d of s.demands) {
      expect(["person", "physics", "law", "brief"]).toContain(d.principal);
      expect(d.reason.trim().length).toBeGreaterThan(0);
    }
    expect(() => frame({ crossmemberCount: derived(1, "count", "t") })).toThrow(/≥ 2/);
    expect(() => frame({ wheelbase: assumed(0, "mm", "t") })).toThrow(/positive/);
  });
});
