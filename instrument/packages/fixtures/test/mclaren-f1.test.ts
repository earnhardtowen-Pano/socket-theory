/**
 * Two things a car cannot be, checked against the F1's own reference table.
 *
 * Both of these were WRONG at some point in writing that table and both were
 * caught by hand — one by arithmetic and one by looking at a render. A recalled
 * proportion is a guess; a track width plus a section width is not, and where
 * they disagree the arithmetic wins. So the arithmetic is a test now.
 *
 * Nothing here reads the build script. The reference table exists precisely so
 * that it is derived from something OTHER than the body, and a test that let
 * the body reach in would give that up.
 */
import { describe, expect, it } from "vitest";
import {
  F1_PROFILE, F1_LENGTH, F1_WIDTH, F1_FRONT_DIAMETER, F1_REAR_DIAMETER,
  F1_FRONT_TIRE_WIDTH, F1_REAR_TIRE_WIDTH, F1_FRONT_TRACK, F1_REAR_TRACK,
  F1_FRONT_OVERHANG, F1_WHEELBASE,
} from "../src/index.js";

const AXLES = [
  {
    name: "front",
    x: F1_FRONT_OVERHANG,
    radius: F1_FRONT_DIAMETER / 2,
    outerFace: F1_FRONT_TRACK / 2 + F1_FRONT_TIRE_WIDTH / 2,
  },
  {
    name: "rear",
    x: F1_FRONT_OVERHANG + F1_WHEELBASE,
    radius: F1_REAR_DIAMETER / 2,
    outerFace: F1_REAR_TRACK / 2 + F1_REAR_TIRE_WIDTH / 2,
  },
] as const;

/** Linear read of the table at a station, which is how a profile is used. */
const at = (x: number, key: "halfWidth" | "top"): number => {
  const f = x / F1_LENGTH;
  let lo = F1_PROFILE[0]!, hi = F1_PROFILE[F1_PROFILE.length - 1]!;
  for (let i = 0; i < F1_PROFILE.length - 1; i++) {
    if (F1_PROFILE[i]!.at <= f && f <= F1_PROFILE[i + 1]!.at) {
      lo = F1_PROFILE[i]!; hi = F1_PROFILE[i + 1]!; break;
    }
  }
  const t = hi.at === lo.at ? 0 : (f - lo.at) / (hi.at - lo.at);
  return lo[key] + (hi[key] - lo[key]) * t;
};

describe("the McLaren F1's reference profile is a shape a car could have", () => {
  it("no tyre is wider than the car it is inside", () => {
    for (const a of AXLES) {
      expect(a.outerFace, `${a.name} tyre outer face`).toBeLessThanOrEqual(F1_WIDTH / 2);
    }
  });

  it("the bodywork is at least as wide as the tyre at every station a tyre reaches", () => {
    // A wheel is a disc: it is present from a radius ahead of its axle to a
    // radius behind. The first draft of the table put 700 mm at 0.10 and 870
    // at 0.88, both of which are inside a tyre; before that it put 790 at the
    // front axle, which stood the tyre 111 mm outside its own wing.
    for (const a of AXLES) {
      for (const st of F1_PROFILE) {
        const x = st.at * F1_LENGTH;
        if (Math.abs(x - a.x) > a.radius) continue;
        expect(st.halfWidth, `${a.name} axle, station ${st.at}`).toBeGreaterThanOrEqual(a.outerFace);
      }
    }
  });

  it("there is room for bodywork above each tyre", () => {
    // The failure this catches is subtler and cost a render to find: an arch
    // is a semicircle about the axle, so its crown sits a radius plus a
    // clearance ABOVE the tyre. Where that lands above the top of the body,
    // the section's rocker ends up above its own beltline and the whole flank
    // band turns inside out. 25 mm is a panel and a hair; less than that is
    // not a car, whatever the table says.
    for (const a of AXLES) {
      const over = at(a.x, "top") - a.radius * 2;
      expect(over, `body above the ${a.name} tyre`).toBeGreaterThan(25);
    }
  });

  it("is monotone in neither width nor height, which is the point of it", () => {
    // A car with a waist and a roof peak is not a wedge. If either of these
    // ever comes back monotone, somebody has flattened the table.
    const widths = F1_PROFILE.map((s) => s.halfWidth);
    const tops = F1_PROFILE.map((s) => s.top);
    const rises = (v: number[]) => v.some((q, i) => i > 0 && q > v[i - 1]!);
    const falls = (v: number[]) => v.some((q, i) => i > 0 && q < v[i - 1]!);
    expect(rises(widths) && falls(widths)).toBe(true);
    expect(rises(tops) && falls(tops)).toBe(true);
  });

  it("peaks forward of the middle, which is what makes it this car", () => {
    const peak = F1_PROFILE.reduce((a, b) => (b.top > a.top ? b : a));
    expect(peak.at).toBeLessThan(0.5);
    expect(peak.top).toBe(Math.max(...F1_PROFILE.map((s) => s.top)));
  });
});
