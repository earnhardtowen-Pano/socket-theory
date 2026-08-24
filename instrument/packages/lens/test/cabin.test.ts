/**
 * The cabin lens — sections, scans, tumblehome, and the person.
 *
 * Every fixture is built out of triangles by hand, so the expected answer is
 * arithmetic rather than a car. A slab with a trough cut in it is a roadster
 * for these purposes: outer walls, a cockpit between them, and a beltline at
 * the top of each wall with a known lean.
 */

import { describe, expect, it } from "vitest";
import { cabinLens, type CabinPerson } from "../src/index.js";
import { scanAt, sectionAt, sliceSection } from "@car/skin";

/** A closed box from lo to hi, as 12 triangles. */
function box(lo: [number, number, number], hi: [number, number, number]): {
  positions: number[]; indices: number[];
} {
  const [x0, y0, z0] = lo, [x1, y1, z1] = hi;
  const v = [
    [x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0],
    [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1],
  ];
  const f = [
    [0, 2, 1], [0, 3, 2], [4, 5, 6], [4, 6, 7],
    [0, 1, 5], [0, 5, 4], [2, 3, 7], [2, 7, 6],
    [1, 2, 6], [1, 6, 5], [0, 4, 7], [0, 7, 3],
  ];
  return { positions: v.flat(), indices: f.flat() };
}

function merge(...parts: { positions: number[]; indices: number[] }[]): {
  positions: Float64Array; indices: Uint32Array;
} {
  const positions: number[] = [];
  const indices: number[] = [];
  let base = 0;
  for (const p of parts) {
    positions.push(...p.positions);
    for (const i of p.indices) indices.push(i + base);
    base += p.positions.length / 3;
  }
  return { positions: Float64Array.from(positions), indices: Uint32Array.from(indices) };
}

/**
 * Extrude a closed (y, z) profile along x — side walls only.
 *
 * Three abutting BOXES would have been easier and would have been wrong: two
 * solids sharing a face put a real wall down the middle of the section, and a
 * scan line correctly reports it. A U-channel is one surface, so it has to be
 * built as one. The end caps are left off because a section strictly between
 * x0 and x1 never sees them.
 */
function extrude(profile: readonly (readonly [number, number])[], x0: number, x1: number): {
  positions: number[]; indices: number[];
} {
  const positions: number[] = [];
  const indices: number[] = [];
  for (const [y, z] of profile) { positions.push(x0, y, z); positions.push(x1, y, z); }
  const n = profile.length;
  for (let i = 0; i < n; i++) {
    const a = i * 2, b = i * 2 + 1;
    const c = ((i + 1) % n) * 2, d = c + 1;
    indices.push(a, b, d, a, d, c);
  }
  return { positions, indices };
}

/** A U-channel: walls 100 thick at y = +-400, a cockpit 600 wide, floor 200 up. */
const trough = merge(extrude([
  [-400, 0], [400, 0], [400, 800], [300, 800],
  [300, 200], [-300, 200], [-300, 800], [-400, 800],
], 0, 3000));

const person = (over: Partial<CabinPerson> = {}): CabinPerson => ({
  heel: [900, 0, 250],
  hip: [1500, 0, 300],
  eye: [1700, 0, 1000],
  head: [1750, 0, 1100],
  shoulderHalfBreadth: 230,
  shoulderAboveHip: 300,
  ...over,
});

describe("cabinLens", () => {
  it("passes one person who fits, and reports the room in millimetres", () => {
    // 600 mm of cockpit against one 460 mm shoulder breadth and 100 of elbow.
    const r = cabinLens(trough, person(), { elbowGap: 100 });
    expect(r.shoulderRoom).toBeCloseTo(600, 0);
    expect(r.shoulderRoomNeeded).toBe(560);
    expect(r.faults).toEqual([]);
  });

  it("names the fault when a second person will not fit beside the first", () => {
    const r = cabinLens(trough, person(), { elbowGap: 100, seatsAbreast: 2 });
    expect(r.shoulderRoomNeeded).toBe(1020);
    expect(r.faults.join(" ")).toMatch(/shoulder room 600 mm against 1020/);
  });

  it("calls a head above the body a head in the open, not a fault", () => {
    // The whole point of a roadster: head at 1100, body top at 800.
    const r = cabinLens(trough, person(), { elbowGap: 100 });
    expect(r.headAboveBody).toBeCloseTo(300, 0);
    expect(r.faults.join(" ")).not.toMatch(/INSIDE the body/);
  });

  it("catches a head inside a body that closed over it", () => {
    const closed = merge(box([0, -400, 0], [3000, 400, 1400]));
    const r = cabinLens(closed, person());
    expect(r.headAboveBody).toBeLessThan(0);
    expect(r.faults.join(" ")).toMatch(/INSIDE the body/);
    expect(r.faults.join(" ")).toMatch(/no cockpit at the H-point/);
  });

  it("says when the driver would look over the glass rather than through it", () => {
    const low = cabinLens(trough, person(), { headerTopZ: 900 });
    expect(low.eyeAboveHeader).toBeCloseTo(100, 0);
    expect(low.faults.join(" ")).toMatch(/over the glass/);
    const tall = cabinLens(trough, person(), { headerTopZ: 1200 });
    expect(tall.eyeAboveHeader).toBeCloseTo(-200, 0);
    expect(tall.faults.join(" ")).not.toMatch(/over the glass/);
  });

  it("finds the cockpit opening's ends", () => {
    const r = cabinLens(trough, person());
    expect(r.aperture).not.toBeNull();
    expect(r.aperture!.fore).toBeLessThan(200);
    expect(r.aperture!.aft).toBeGreaterThan(2800);
  });
});
