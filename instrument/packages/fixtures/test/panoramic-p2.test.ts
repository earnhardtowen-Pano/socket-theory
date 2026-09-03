/**
 * What the Panoramic P2's reference table cannot be, checked as arithmetic.
 *
 * Same instrument as the four published cars' tests, with the fastback's own
 * claims added: the roof must peak over the DRIVER — at or before 0.6 of the
 * length — and FALL from there without a hold, because nobody sits under the
 * back of a fastback at full height; and the widest station of the whole
 * table must be the rear axle, because the brief put the hips there.
 *
 * Nothing here reads the build script. The table is derived from the brief,
 * the build from its own tables, and the profile check in the build is what
 * compares them.
 */
import { describe, expect, it } from "vitest";
import {
  P2_PROFILE, P2_LENGTH, P2_WIDTH, P2_FRONT_DIAMETER, P2_REAR_DIAMETER,
  P2_FRONT_TIRE_WIDTH, P2_REAR_TIRE_WIDTH, P2_FRONT_TRACK, P2_REAR_TRACK,
  P2_FRONT_OVERHANG, P2_REAR_OVERHANG, P2_WHEELBASE, P2_HEIGHT,
} from "../src/index.js";

const AXLES = [
  {
    name: "front",
    x: P2_FRONT_OVERHANG,
    radius: P2_FRONT_DIAMETER / 2,
    outerFace: P2_FRONT_TRACK / 2 + P2_FRONT_TIRE_WIDTH / 2,
  },
  {
    name: "rear",
    x: P2_FRONT_OVERHANG + P2_WHEELBASE,
    radius: P2_REAR_DIAMETER / 2,
    outerFace: P2_REAR_TRACK / 2 + P2_REAR_TIRE_WIDTH / 2,
  },
] as const;

const at = (x: number, key: "halfWidth" | "top"): number => {
  const f = x / P2_LENGTH;
  let lo = P2_PROFILE[0]!, hi = P2_PROFILE[P2_PROFILE.length - 1]!;
  for (let i = 0; i < P2_PROFILE.length - 1; i++) {
    if (P2_PROFILE[i]!.at <= f && f <= P2_PROFILE[i + 1]!.at) {
      lo = P2_PROFILE[i]!; hi = P2_PROFILE[i + 1]!; break;
    }
  }
  const t = hi.at === lo.at ? 0 : (f - lo.at) / (hi.at - lo.at);
  return lo[key] + (hi[key] - lo[key]) * t;
};

describe("the Panoramic P2's reference profile is a shape a car could have", () => {
  it("the overhangs and the wheelbase sum to the length", () => {
    expect(P2_FRONT_OVERHANG + P2_WHEELBASE + P2_REAR_OVERHANG).toBe(P2_LENGTH);
  });

  it("no tyre is wider than the car it is inside — by under 10 mm at the rear", () => {
    for (const a of AXLES) {
      expect(a.outerFace, `${a.name} tyre outer face`).toBeLessThanOrEqual(P2_WIDTH / 2);
    }
    // The rear pair very nearly is not: the width was CHOSEN to leave the
    // 295 this little room, so that the flare over it is the widest thing on
    // the car for a reason and not by decoration.
    const rear = AXLES[1];
    expect(P2_WIDTH / 2 - rear.outerFace).toBeLessThan(10);
  });

  it("the bodywork is at least as wide as the tyre at every station a tyre reaches", () => {
    for (const a of AXLES) {
      for (const st of P2_PROFILE) {
        const x = st.at * P2_LENGTH;
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
    const widest = P2_PROFILE.reduce((a, b) => (b.halfWidth > a.halfWidth ? b : a));
    const rearF = (P2_FRONT_OVERHANG + P2_WHEELBASE) / P2_LENGTH;
    expect(Math.abs(widest.at - rearF)).toBeLessThan(0.03);
  });

  it("the roof peaks over the driver and falls from there without a hold — a fastback", () => {
    const peak = P2_PROFILE.reduce((a, b) => (b.top > a.top ? b : a));
    expect(peak.at).toBeLessThanOrEqual(0.6);
    expect(peak.top).toBe(P2_HEIGHT);
    // No hold: every station after the peak is lower than the one before
    // it, and the first step down is more than a sedan's 15 mm.
    const i = P2_PROFILE.indexOf(peak);
    expect(peak.top - P2_PROFILE[i + 1]!.top).toBeGreaterThan(15);
    for (let k = i + 1; k < P2_PROFILE.length; k++) {
      expect(P2_PROFILE[k]!.top, `station ${P2_PROFILE[k]!.at}`).toBeLessThan(P2_PROFILE[k - 1]!.top);
    }
  });

  it("starts and ends short of the tips — both ends are domed", () => {
    expect(P2_PROFILE[0]!.at).toBeGreaterThan(0);
    expect(P2_PROFILE[P2_PROFILE.length - 1]!.at).toBeLessThan(1);
  });

  it("is monotone in neither width nor height", () => {
    const widths = P2_PROFILE.map((s) => s.halfWidth);
    const tops = P2_PROFILE.map((s) => s.top);
    const rises = (v: number[]) => v.some((q, i) => i > 0 && q > v[i - 1]!);
    const falls = (v: number[]) => v.some((q, i) => i > 0 && q < v[i - 1]!);
    expect(rises(widths) && falls(widths)).toBe(true);
    expect(rises(tops) && falls(tops)).toBe(true);
  });
});
