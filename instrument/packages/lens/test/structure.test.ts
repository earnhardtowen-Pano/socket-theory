/**
 * The structure lens — is it one body, and does it reach what it carries?
 *
 * Boxes throughout, because boxes are what the authoring verbs make and what
 * the packing solve publishes, and because the expected answer is then
 * arithmetic rather than a car.
 */

import { describe, expect, it } from "vitest";
import { structureFit, type StructureMember } from "../src/index.js";

const box = (name: string, lo: [number, number, number], hi: [number, number, number]): StructureMember =>
  ({ name, lo, hi });

/** Two rails and a crossmember that genuinely meet. */
const frame: StructureMember[] = [
  box("rail-L", [0, 200, 100], [3000, 270, 200]),
  box("rail-R", [0, -270, 100], [3000, -200, 200]),
  box("cross", [1400, -270, 100], [1460, 270, 200]),
];

describe("structureFit: connectedness", () => {
  it("calls a frame whose members touch ONE body", () => {
    const r = structureFit(frame);
    expect(r.islands.length).toBe(1);
    expect(r.islands[0]!.length).toBe(3);
    expect(r.faults).toEqual([]);
  });

  it("catches a crossmember that misses the rails, and says by how much", () => {
    // 40 mm short of each rail: renders identically, sections identically,
    // and is not a frame.
    const gapped = [frame[0]!, frame[1]!, box("cross", [1400, -160, 100], [1460, 160, 200])];
    const r = structureFit(gapped);
    expect(r.islands.length).toBe(3);
    expect(r.faults.join(" ")).toMatch(/3 separate bodies/);
  });

  it("joins members that miss by less than a weld's fit-up gap", () => {
    const nearly = [frame[0]!, frame[1]!, box("cross", [1400, -196, 100], [1460, 196, 200])];
    expect(structureFit(nearly).islands.length).toBe(1);
    expect(structureFit(nearly, [], [], { weldGap: 0 }).islands.length).toBe(3);
  });

  it("orders islands largest first, and deterministically", () => {
    const split = [...frame, box("stray-a", [9000, 0, 0], [9100, 100, 100])];
    const r = structureFit(split);
    expect(r.islands.map((g) => g.length)).toEqual([3, 1]);
    expect(structureFit(split).islands).toEqual(r.islands);
  });
});

describe("structureFit: anchorage", () => {
  const engine = { name: "engine", lo: [600, -200, 200] as [number, number, number],
                   hi: [1100, 200, 700] as [number, number, number], massKg: 210 };

  it("passes a part sitting on the structure", () => {
    const r = structureFit(frame, [engine]);
    expect(r.anchorage[0]!.gap).toBe(0);
    expect(r.anchorage[0]!.carried).toBe(true);
    expect(r.orphanedKg).toBe(0);
    expect(r.faults).toEqual([]);
  });

  it("names a part with nothing under it, and its mass", () => {
    const floating = { ...engine, lo: [600, -200, 900] as [number, number, number],
                       hi: [1100, 200, 1400] as [number, number, number] };
    const r = structureFit(frame, [floating]);
    expect(r.anchorage[0]!.gap).toBeCloseTo(700, 0);
    expect(r.orphanedKg).toBe(210);
    expect(r.faults.join(" ")).toMatch(/engine is 700 mm from the nearest member/);
    expect(r.faults.join(" ")).toMatch(/210 kg with nothing under it/);
  });

  it("reports the heaviest orphan first", () => {
    const far: [number, number, number] = [9000, 0, 0];
    const r = structureFit(frame, [
      { name: "light", lo: far, hi: [9100, 100, 100], massKg: 5 },
      { name: "heavy", lo: far, hi: [9100, 100, 100], massKg: 300 },
    ]);
    expect(r.faults[0]).toMatch(/^heavy/);
  });
});

describe("structureFit: corners", () => {
  it("calls a wheel with nothing near it DRAWN, not carried", () => {
    // The reading every car in this repository gave before there was any
    // suspension: a solid at the track and the axle station, and the nearest
    // structure a third of a metre away.
    const r = structureFit(frame, [], [{ name: "wheel-FL", at: [1430, 640, 337] }]);
    // 370 out to the rail's outer face and 137 up to its top face.
    expect(r.corners[0]!.gap).toBeCloseTo(395, 0);
    expect(r.faults.join(" ")).toMatch(/wheel-FL is 395 mm from the nearest member/);
    expect(r.faults.join(" ")).toMatch(/drawn, not carried/);
  });

  it("passes a wheel an upright reaches", () => {
    // The upright reaches the wheel AND the rail — which is what a suspension
    // link is for, and the reason a bare upright is not enough.
    const withUpright = [...frame, box("upright-FL", [1400, 270, 150], [1460, 600, 400])];
    const r = structureFit(withUpright, [], [{ name: "wheel-FL", at: [1430, 640, 337] }]);
    expect(r.corners[0]!.gap).toBeCloseTo(40, 0);
    expect(r.corners[0]!.onMainIsland).toBe(true);
    expect(r.faults).toEqual([]);
  });

  it("catches a wheel carried by structure that is itself an offcut", () => {
    // An upright and a link that reach the wheel but never reach the car.
    const detached = [...frame, box("upright-FL", [1400, 400, 280], [1460, 600, 400])];
    const r = structureFit(detached, [], [{ name: "wheel-FL", at: [1430, 640, 337] }]);
    expect(r.corners[0]!.onMainIsland).toBe(false);
    expect(r.faults.join(" ")).toMatch(/not part of the main structure/);
  });
});
