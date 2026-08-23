import { describe, expect, it } from "vitest";
import { makeAllocator } from "@car/schema";
import { assumed, derived } from "@car/demand";
import {
  SUSPENSION_KINEMATICS_EXCLUSION,
  makeSuspension,
  sweptWheelBox,
  typicalMaxSteerAngle,
  type SuspensionParams,
} from "../src/suspension";

const tireDia = () => derived(631.9, "mm", "test: 205/55R16 overall diameter");
const tireSec = () => derived(205, "mm", "test: 205 section");

function axle(over: Partial<SuspensionParams> = {}) {
  return makeSuspension(
    {
      architecture: "strut",
      axle: "front",
      jounceTravel: assumed(100, "mm", "test jounce"),
      reboundTravel: assumed(110, "mm", "test rebound"),
      trackWidth: assumed(1560, "mm", "test track"),
      tireOverallDiameter: tireDia(),
      tireSectionWidth: tireSec(),
      ...over,
    },
    makeAllocator(),
  );
}

describe("makeSuspension — swept wheel envelope", () => {
  it("front swept envelope is WIDER than rear given the same tire (steering articulation)", () => {
    const front = axle({ axle: "front" });
    const rear = axle({ axle: "rear" });
    expect(front.dims.sweptWheelWidth.value).toBeGreaterThan(rear.dims.sweptWheelWidth.value);
    // rear at zero articulation is exactly the tire section
    expect(rear.dims.sweptWheelWidth.value).toBeCloseTo(205, 6);
    // and the reason states the charge's line
    const sw = front.demands.find((d) => d.kind === "swept-envelope")!;
    expect(sw.reason).toMatch(/front arches out-demand rears/);
  });

  it("swept height = tire diameter + jounce + rebound, chain composed", () => {
    const s = axle();
    expect(s.dims.sweptWheelHeight.value).toBeCloseTo(631.9 + 100 + 110, 6);
    expect(s.dims.sweptWheelHeight.license.tag).toBe("DERIVED");
    expect(s.dims.totalTravel.value).toBeCloseTo(210, 6);
  });

  it("sweptWheelBox is exact at zero angle and monotone in angle", () => {
    const zero = sweptWheelBox(tireDia(), tireSec(), derived(0, "deg", "t"), assumed(100, "mm", "t"), assumed(100, "mm", "t"));
    expect(zero.x.value).toBeCloseTo(631.9, 9);
    expect(zero.y.value).toBeCloseTo(205, 9);
    const a20 = sweptWheelBox(tireDia(), tireSec(), assumed(20, "deg", "t"), assumed(100, "mm", "t"), assumed(100, "mm", "t"));
    const a35 = sweptWheelBox(tireDia(), tireSec(), assumed(35, "deg", "t"), assumed(100, "mm", "t"), assumed(100, "mm", "t"));
    expect(a20.y.value).toBeGreaterThan(zero.y.value);
    expect(a35.y.value).toBeGreaterThan(a20.y.value);
    // exact trig at 35°
    const rad = (35 * Math.PI) / 180;
    expect(a35.y.value).toBeCloseTo(631.9 * Math.sin(rad) + 205 * Math.cos(rad), 9);
  });

  it("both swept-envelope demands exist (left and right), physics principal", () => {
    const s = axle();
    const swept = s.demands.filter((d) => d.kind === "swept-envelope");
    expect(swept).toHaveLength(2);
    for (const d of swept) expect(d.principal).toBe("physics");
    const offsets = swept.map((d) => (d.shape!.kind === "box" ? d.shape!.offset![1] : NaN));
    expect(offsets).toContain(780);
    expect(offsets).toContain(-780);
  });

  it("front default articulation is the SOURCED typical max steer angle", () => {
    const s = axle();
    expect(s.dims.steerAngleDeg.value).toBe(35);
    expect(s.dims.steerAngleDeg.license.tag).toBe("SOURCED");
    expect(typicalMaxSteerAngle().license.tag).toBe("SOURCED");
    // a back-solved angle passed in takes over
    const solved = axle({ steerAngleDeg: derived(28, "deg", "test back-solve") });
    expect(solved.dims.steerAngleDeg.value).toBe(28);
  });
});

describe("makeSuspension — type-shaped envelopes", () => {
  it("double wishbone is WIDER and LOWER than strut (charge §5 shapes)", () => {
    const strut = axle({ architecture: "strut" });
    const wish = axle({ architecture: "double-wishbone" });
    expect(wish.dims.archInboardWidthPerSide.value).toBeGreaterThan(strut.dims.archInboardWidthPerSide.value);
    expect(wish.dims.archHeightAboveWheelCenter.value).toBeLessThan(strut.dims.archHeightAboveWheelCenter.value);
  });

  it("strut towers demand the most height of the independent front architectures", () => {
    const strut = axle({ architecture: "strut" });
    const wish = axle({ architecture: "double-wishbone" });
    const multi = axle({ architecture: "multilink" });
    expect(strut.dims.archHeightAboveWheelCenter.value).toBeGreaterThan(wish.dims.archHeightAboveWheelCenter.value);
    expect(strut.dims.archHeightAboveWheelCenter.value).toBeGreaterThan(multi.dims.archHeightAboveWheelCenter.value);
  });

  it("twist beam reaches wheel-to-wheel: a transverse brick between the wheels", () => {
    const twist = axle({ architecture: "twist-beam", axle: "rear" });
    // inboard reach per side is a full tire section — the beam fills the space between wheels
    expect(twist.dims.archInboardWidthPerSide.value).toBeCloseTo(205, 6);
    const chain = twist.dims.archInboardWidthPerSide.license;
    expect(chain.tag === "DERIVED" ? chain.chain : "").toMatch(/wheel-to-wheel|between the wheels/);
  });

  it("solid axle spans the full half-track inboard", () => {
    const solid = axle({ architecture: "solid-axle", axle: "rear" });
    expect(solid.dims.archInboardWidthPerSide.value).toBeCloseTo(1560 / 2, 6);
  });

  it("envelope licenses: shape values are ASSUMED loudly or DERIVED — never bare", () => {
    for (const arch of ["strut", "double-wishbone", "multilink", "twist-beam", "solid-axle"] as const) {
      const s = axle({ architecture: arch, axle: arch === "twist-beam" || arch === "solid-axle" ? "rear" : "front" });
      const h = s.dims.archHeightAboveWheelCenter.license;
      expect(["ASSUMED", "DERIVED"]).toContain(h.tag);
      if (h.tag === "ASSUMED") expect(h.note).toMatch(/ASSUMED/);
      expect(s.envelope).toBeDefined();
      for (const q of s.envelope!.size) expect(q.license.tag).toBe("DERIVED");
    }
  });
});

describe("makeSuspension — pickup anchorages and scope", () => {
  it("every pickup publishes a massBearing anchorage demand, mirrored L/R", () => {
    const s = axle({ architecture: "double-wishbone" });
    const anchors = s.demands.filter((d) => d.kind === "anchorage");
    // 5 pickups per side for double wishbone
    expect(anchors).toHaveLength(10);
    for (const a of anchors) {
      expect(a.massBearing).toBe(true);
      expect(a.principal).toBe("physics");
      expect(a.reason).toMatch(/anchorage law/);
    }
    const ys = anchors.map((a) => (a.shape!.kind === "box" ? a.shape!.offset![1] : NaN));
    for (const y of ys) expect(ys).toContain(-y); // mirrored
  });

  it("pickup ports and anchorage demands agree in position", () => {
    const s = axle({ architecture: "strut" });
    const tower = s.ports.find((p) => p.name === "tower-L")!;
    const towerAnchor = s.demands.find(
      (d) => d.kind === "anchorage" && d.reason.includes("tower-L"),
    )!;
    expect(towerAnchor.shape!.kind).toBe("box");
    expect(towerAnchor.shape!.kind === "box" ? towerAnchor.shape!.offset : undefined).toEqual(tower.frame.origin);
  });

  it("publishes hub axes at half track, both sides", () => {
    const s = axle();
    const hubL = s.ports.find((p) => p.name === "hub-L")!;
    const hubR = s.ports.find((p) => p.name === "hub-R")!;
    expect(hubL.frame.origin[1]).toBeCloseTo(780, 6);
    expect(hubR.frame.origin[1]).toBeCloseTo(-780, 6);
    expect(hubL.kind).toBe("axis");
  });

  it("states the kinematics exclusion (charge §14) — and claims no kinematic number", () => {
    expect(SUSPENSION_KINEMATICS_EXCLUSION).toMatch(/out of scope/);
    expect(SUSPENSION_KINEMATICS_EXCLUSION).toMatch(/camber/);
    const s = axle();
    const dimKeys = Object.keys(s.dims);
    for (const k of dimKeys) {
      expect(k).not.toMatch(/camber|caster|toe|rollCenter/i);
    }
  });

  it("every demand carries a principal and a non-empty reason; mass present", () => {
    for (const arch of ["strut", "twist-beam", "solid-axle"] as const) {
      const s = axle({ architecture: arch, axle: "rear" });
      for (const d of s.demands) {
        expect(["person", "physics", "law", "brief"]).toContain(d.principal);
        expect(d.reason.trim().length).toBeGreaterThan(0);
      }
      expect(s.mass).toBeDefined();
      expect(s.mass!.value).toBeGreaterThan(0);
    }
  });

  it("rejects negative travel and non-positive track", () => {
    expect(() => axle({ jounceTravel: assumed(-5, "mm", "t") })).toThrow(/non-negative/);
    expect(() => axle({ trackWidth: assumed(0, "mm", "t") })).toThrow(/positive/);
  });
});
