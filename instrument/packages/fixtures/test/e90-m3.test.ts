/**
 * What the E90 M3's reference table cannot be, checked as arithmetic.
 *
 * Same instrument as the F1's test one file over, with two sedan-specific
 * claims added: the roof must peak AFT of the middle and HOLD (two seat rows
 * live under it), and the widest station of the whole table must sit at the
 * REAR axle — the M3's flares put the hips there, and if the table ever
 * loses that, it has stopped being this car.
 *
 * Nothing here reads the build script. The reference table exists precisely
 * so that it is derived from something OTHER than the body, and a test that
 * let the body reach in would give that up.
 */
import { describe, expect, it } from "vitest";
import {
  E90_PROFILE, E90_LENGTH, E90_WIDTH, E90_FRONT_DIAMETER, E90_REAR_DIAMETER,
  E90_FRONT_TIRE_WIDTH, E90_REAR_TIRE_WIDTH, E90_FRONT_TRACK, E90_REAR_TRACK,
  E90_FRONT_OVERHANG, E90_REAR_OVERHANG, E90_WHEELBASE, E90_HEIGHT,
} from "../src/index.js";

const AXLES = [
  {
    name: "front",
    x: E90_FRONT_OVERHANG,
    radius: E90_FRONT_DIAMETER / 2,
    outerFace: E90_FRONT_TRACK / 2 + E90_FRONT_TIRE_WIDTH / 2,
  },
  {
    name: "rear",
    x: E90_FRONT_OVERHANG + E90_WHEELBASE,
    radius: E90_REAR_DIAMETER / 2,
    outerFace: E90_REAR_TRACK / 2 + E90_REAR_TIRE_WIDTH / 2,
  },
] as const;

const at = (x: number, key: "halfWidth" | "top"): number => {
  const f = x / E90_LENGTH;
  let lo = E90_PROFILE[0]!, hi = E90_PROFILE[E90_PROFILE.length - 1]!;
  for (let i = 0; i < E90_PROFILE.length - 1; i++) {
    if (E90_PROFILE[i]!.at <= f && f <= E90_PROFILE[i + 1]!.at) {
      lo = E90_PROFILE[i]!; hi = E90_PROFILE[i + 1]!; break;
    }
  }
  const t = hi.at === lo.at ? 0 : (f - lo.at) / (hi.at - lo.at);
  return lo[key] + (hi[key] - lo[key]) * t;
};

describe("the E90 M3's reference profile is a shape a car could have", () => {
  it("the overhang split sums to the sourced total exactly", () => {
    // Length minus wheelbase is exact and SOURCED; the split is assumed. The
    // one thing the assumption may never do is change the sum.
    expect(E90_FRONT_OVERHANG + E90_WHEELBASE + E90_REAR_OVERHANG).toBe(E90_LENGTH);
  });

  it("no tyre is wider than the car it is inside — by 6.5 mm at the rear", () => {
    for (const a of AXLES) {
      expect(a.outerFace, `${a.name} tyre outer face`).toBeLessThanOrEqual(E90_WIDTH / 2);
    }
    // And the rear pair very nearly is not: the flare exists because the
    // arithmetic leaves it 6.5 mm. If a tyre or track change ever widens
    // this, the flare has to grow with it or the car is impossible.
    const rear = AXLES[1];
    expect(E90_WIDTH / 2 - rear.outerFace).toBeLessThan(10);
  });

  it("the bodywork is at least as wide as the tyre at every station a tyre reaches", () => {
    for (const a of AXLES) {
      for (const st of E90_PROFILE) {
        const x = st.at * E90_LENGTH;
        if (Math.abs(x - a.x) > a.radius) continue;
        expect(st.halfWidth, `${a.name} axle, station ${st.at}`).toBeGreaterThanOrEqual(a.outerFace - 1);
      }
    }
  });

  it("there is room for bodywork above each tyre", () => {
    for (const a of AXLES) {
      const over = at(a.x, "top") - a.radius * 2;
      expect(over, `body above the ${a.name} tyre`).toBeGreaterThan(25);
    }
  });

  it("the widest station is at the rear axle — the hips are the car", () => {
    const widest = E90_PROFILE.reduce((a, b) => (b.halfWidth > a.halfWidth ? b : a));
    const rearF = (E90_FRONT_OVERHANG + E90_WHEELBASE) / E90_LENGTH;
    expect(Math.abs(widest.at - rearF)).toBeLessThan(0.03);
  });

  it("the roof peaks aft of the middle and holds — two rows live under it", () => {
    const peak = E90_PROFILE.reduce((a, b) => (b.top > a.top ? b : a));
    expect(peak.at).toBeGreaterThan(0.5);
    expect(peak.top).toBe(E90_HEIGHT);
    // The hold: the station after the peak is within 15 mm of it. A coupe
    // falls away at once; a sedan does not, because somebody sits there.
    const i = E90_PROFILE.indexOf(peak);
    expect(peak.top - E90_PROFILE[i + 1]!.top).toBeLessThan(15);
  });

  it("is monotone in neither width nor height", () => {
    const widths = E90_PROFILE.map((s) => s.halfWidth);
    const tops = E90_PROFILE.map((s) => s.top);
    const rises = (v: number[]) => v.some((q, i) => i > 0 && q > v[i - 1]!);
    const falls = (v: number[]) => v.some((q, i) => i > 0 && q < v[i - 1]!);
    expect(rises(widths) && falls(widths)).toBe(true);
    expect(rises(tops) && falls(tops)).toBe(true);
  });
});
