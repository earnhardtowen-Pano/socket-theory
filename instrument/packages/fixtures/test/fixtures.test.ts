import { describe, expect, it } from "vitest";
import { acceptanceTolerance, car1, expectedHardPoints, shoeboxV16, tireRadius } from "@car/fixtures";

describe("car one — licensed public specs", () => {
  it("every spec value carries a SOURCED license with a named source", () => {
    const sourcedValues = [
      car1.wheelbase, car1.overallLength, car1.overallWidth, car1.overallHeight,
      car1.frontTrack, car1.rearTrack, car1.curbMass, car1.power,
      car1.displacementL, car1.cylinders, car1.fuelTank,
      car1.tire.widthMm, car1.tire.aspectPct, car1.tire.rimIn, car1.tire.loadIndex,
    ];
    for (const q of sourcedValues) {
      expect(q.license.tag).toBe("SOURCED");
      if (q.license.tag === "SOURCED") expect(q.license.source.length).toBeGreaterThan(5);
    }
    expect(car1.groundClearance.license.tag).toBe("ASSUMED"); // searched, not found — loud
  });

  it("tire radius follows the sidewall math with the chain shown", () => {
    // 17*25.4/2 + 205*45/100 = 215.9 + 92.25 = 308.15
    expect(tireRadius.value).toBeCloseTo(308.15, 2);
    expect(tireRadius.license.tag).toBe("DERIVED");
  });

  it("expected hard points are self-consistent with the inputs", () => {
    const fl = expectedHardPoints.find((h) => h.label === "wheel-center-FL")!;
    const rl = expectedHardPoints.find((h) => h.label === "wheel-center-RL")!;
    expect(rl.at[0] - fl.at[0]).toBeCloseTo(car1.wheelbase.value, 9);
    expect(Math.abs(fl.at[1]) * 2).toBeCloseTo(car1.frontTrack.value, 9);
    expect(fl.at[2]).toBeCloseTo(tireRadius.value, 9);
    expect(acceptanceTolerance.value).toBe(15);
    expect(acceptanceTolerance.license.tag).toBe("ASSUMED");
  });
});

describe("shoebox V16 — the stress config", () => {
  it("is ASSUMED throughout, loudly", () => {
    const all = [
      shoeboxV16.wheelbase, shoeboxV16.frontTrack, shoeboxV16.rearTrack,
      shoeboxV16.curbMassTarget, shoeboxV16.power, shoeboxV16.displacementL,
      shoeboxV16.cylinders, shoeboxV16.fuelTank, shoeboxV16.tire.widthMm,
      shoeboxV16.tire.aspectPct, shoeboxV16.tire.rimIn, shoeboxV16.tire.loadIndex,
      shoeboxV16.seats,
    ];
    for (const q of all) {
      expect(q.license.tag).toBe("ASSUMED");
      if (q.license.tag === "ASSUMED") expect(q.license.note).toContain("shoebox");
    }
  });

  it("is genuinely absurd (the grammar must not flinch)", () => {
    expect(shoeboxV16.cylinders.value).toBe(16);
    expect(shoeboxV16.wheelbase.value).toBeLessThan(2000);
    expect(shoeboxV16.power.value).toBeGreaterThan(700);
  });
});
