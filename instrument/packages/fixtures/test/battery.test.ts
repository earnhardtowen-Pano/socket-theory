import { describe, expect, it } from "vitest";
import { makeAllocator } from "@car/schema";
import { assembleCar } from "@car/types";
import { solve } from "@car/pack";
import {
  battery, shoeboxEntry, configFromSpec, fitSubstrate,
  expectedWheelCentres, tireDiameterOf, BATTERY_TOLERANCE_MM,
} from "@car/fixtures";

const all = [...battery, shoeboxEntry];

describe("six-car battery (charge §12)", () => {
  it("is six real cars plus the stress config", () => {
    expect(battery).toHaveLength(6);
    expect(new Set(battery.map((e) => e.spec.key)).size).toBe(6);
  });

  it("licenses every acceptance-critical input as SOURCED", () => {
    // The ±15 mm tolerance is measured against wheelbase, track and tire size
    // alone. Those four may never be ASSUMED, or the acceptance test would be
    // measuring the author's guess against the author's guess.
    for (const { spec } of battery) {
      for (const q of [spec.wheelbase, spec.frontTrack, spec.rearTrack]) {
        expect(q.license.tag, `${spec.name}: ${q.license.tag}`).toBe("SOURCED");
      }
      for (const t of [spec.frontTire, spec.rearTire]) {
        for (const q of [t.widthMm, t.aspectPct, t.rimIn]) {
          expect(q.license.tag, `${spec.name} tire`).toBe("SOURCED");
        }
      }
    }
  });

  it("the shoebox is ASSUMED all the way down", () => {
    const { spec } = shoeboxEntry;
    for (const q of [spec.wheelbase, spec.frontTrack, spec.rearTrack, spec.power,
                     spec.displacementL, spec.cylinders, spec.fuelTank]) {
      expect(q.license.tag).toBe("ASSUMED");
    }
  });

  it.each(all.map((e) => [e.spec.name, e] as const))(
    "%s packages without crashing and lands its wheels", (_name, entry) => {
      const car = assembleCar(fitSubstrate(entry), makeAllocator());
      const packed = solve(car.input);
      expect(packed.placements.size).toBeGreaterThan(0);

      const want = [...expectedWheelCentres(entry.spec)]
        .sort((a, b) => (a.at[0] - b.at[0]) || (a.at[1] - b.at[1]));
      const got = [...car.frontWheels, ...car.rearWheels]
        .map((w) => packed.placements.get(w.id)!.origin)
        .sort((a, b) => (a[0] - b[0]) || (a[1] - b[1]));
      for (let i = 0; i < want.length; i++) {
        const d = Math.hypot(
          want[i]!.at[0] - got[i]![0], want[i]!.at[1] - got[i]![1], want[i]!.at[2] - got[i]![2]);
        expect(d, `${want[i]!.label}`).toBeLessThanOrEqual(BATTERY_TOLERANCE_MM.value);
      }
    });

  it("every violation is typed — the battery never relies on an exception", () => {
    for (const entry of all) {
      const car = assembleCar(fitSubstrate(entry), makeAllocator());
      const packed = solve(car.input);
      for (const v of packed.violations) {
        expect(typeof v.kind).toBe("string");
        expect(v.detail.length).toBeGreaterThan(0);
      }
    }
  });

  it("members reach the solver in world space, not the substrate's own frame", () => {
    // The regression that hid an entire law: members were handed over at
    // z = 0 while the substrate sat at rail height, so the anchorage audit
    // tested every mount against members that were not where it looked.
    const entry = battery[0]!;
    const config = configFromSpec(entry);
    const car = assembleCar(config, makeAllocator());
    const railZ = config.placement.railHeight.value;
    expect(railZ).toBeGreaterThan(0);
    for (const m of car.members) expect(m.at[2]).toBeCloseTo(railZ, 6);
  });

  it("tire diameters come from the sidewall math, not a table", () => {
    // 205/45R17: 17 × 25.4 + 2 × 205 × 0.45.
    expect(tireDiameterOf(battery[0]!.spec.frontTire)).toBeCloseTo(17 * 25.4 + 2 * 205 * 0.45, 9);
  });
});
