/**
 * The chassis fit — containment, clearance, registration.
 *
 * Synthetic throughout: a hollow-topped shell for the body and plain bars for
 * the structure, so every expected number is arithmetic. The point of the file
 * under test is that a body and a structure can DISAGREE; these are the ways
 * they disagree.
 */

import { describe, expect, it } from "vitest";
import { chassisFit, type BodyMount } from "../src/index.js";

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

/** A body: 3000 long, 1600 wide, 900 tall, sitting on the road. */
const body = merge(box([0, -800, 0], [3000, 800, 900]));
/** A rail well inside it. */
const rail = merge(box([300, -400, 200], [2700, -330, 310]));
/** A rail that has burst out of the side. */
const burst = merge(box([300, -900, 200], [2700, -830, 310]));
/** A rail pressed right up under the skin. */
const tight = merge(box([300, -795, 200], [2700, -725, 310]));
/**
 * A body CARRIED on a frame: floor at z = 350, deck at 900.
 *
 * The plain `body` above sits on the road, which makes every rail under it
 * a rail inside a solid and hides the whole registration question. A car
 * with a frame under it has bodywork that starts above the road, and the
 * gap between the two is what a body mount exists to close.
 */
const carried = merge(box([0, -800, 350], [3000, 800, 900]));
/** The frame under it: pads at z = 310, so 40 mm of daylight. */
const under = merge(box([300, -400, 200], [2700, -330, 310]));

describe("chassisFit: containment", () => {
  it("passes structure buried in the body", () => {
    const r = chassisFit(body, rail);
    expect(r.outside).toBe(0);
    expect(r.worstProtrusion).toBe(0);
    expect(r.outsideVisible).toBe(0);
    expect(r.faults.filter((f) => f.includes("SHOWS"))).toEqual([]);
  });

  it("catches structure that has burst out, and says how far", () => {
    const r = chassisFit(body, burst);
    expect(r.outside).toBeGreaterThan(0);
    expect(r.worstProtrusion).toBeCloseTo(100, 0);   // y = -900 against a wall at -800
    expect(r.outsideVisible).toBe(r.outside);
    expect(r.exposedBelow).toBe(0);
    expect(r.faults.join(" ")).toMatch(/outside the body where it SHOWS/);
  });

  it("calls a frame slung UNDER the body normal, not a protrusion", () => {
    // The reading the first version of this lens got wrong. Every point of
    // the frame is outside the body's envelope — that is what body-on-frame
    // MEANS — and none of it is visible from anywhere but underneath.
    const r = chassisFit(carried, under);
    expect(r.outside).toBe(r.points);
    expect(r.exposedBelow).toBe(r.points);
    expect(r.outsideVisible).toBe(0);
    expect(r.faults.join(" ")).not.toMatch(/SHOWS/);
  });

  it("still catches a frame that has burst out sideways from under a body", () => {
    // Below the floor AND past the flank. The flank is the one that shows.
    const wide = merge(box([300, -900, 200], [2700, -830, 310]));
    const r = chassisFit(carried, wide);
    expect(r.outsideVisible).toBeGreaterThan(0);
    expect(r.faults.join(" ")).toMatch(/outside the body where it SHOWS/);
  });

  it("counts structure entirely off the end of the body as outside", () => {
    const ahead = merge(box([-900, -400, 200], [-300, -330, 310]));
    const r = chassisFit(body, ahead);
    expect(r.outside).toBe(r.points);
  });
});

describe("chassisFit: clearance", () => {
  it("reports how close the structure comes to the skin that COVERS it", () => {
    // The rail's outer face is at y = -400 and the body's wall at -800, so
    // 400 mm. The floor 200 below it is nearer and does not count: a rail
    // resting on a floor is resting on it, and the read-through defect needs
    // a panel between the eye and the structure.
    const r = chassisFit(body, rail);
    expect(r.minClearance).toBeCloseTo(400, 0);
    expect(r.medianClearance).toBeGreaterThan(0);
  });

  it("does not count the floor pan a rail is welded to", () => {
    // The rail's top face at z = 310 sits 40 mm under the carried body's pan
    // at 350 — nearer than anything else in the section, and a weld rather
    // than a flat spot. Excluding it, the answer is the flank 400 mm outboard
    // reached around the body's own bottom corner, so the claim is hundreds
    // of millimetres rather than forty.
    const r = chassisFit(carried, under);
    expect(r.minClearance).toBeGreaterThan(390);
    expect(r.faults.filter((f) => f.includes("reads the structure"))).toEqual([]);
  });

  it("counts a rail tight against a rocker, which is the defect it exists for", () => {
    // Same geometry, moved outboard until the FLANK is the near surface.
    const rocker = merge(box([300, -795, 400], [2700, -725, 510]));
    const r = chassisFit(carried, rocker);
    expect(r.minClearance).toBeLessThan(10);
    expect(r.tight).toBeGreaterThan(r.covered * 0.02);
    expect(r.faults.join(" ")).toMatch(/That is a region, not a joint/);
  });

  it("lets a handful of tight points pass as joints rather than a region", () => {
    const r = chassisFit(carried, under, [], { tightFraction: 1 });
    expect(r.faults.filter((f) => f.includes("region, not a joint"))).toEqual([]);
  });

  it("faults a panel drawn tight over a rail", () => {
    const r = chassisFit(body, tight, [], { minSkinClearance: 25 });
    expect(r.outside).toBe(0);
    expect(r.minClearance).toBeLessThan(25);
    expect(r.faults.join(" ")).toMatch(/reads the structure through it/);
  });

  it("does not raise the clearance fault while anything is outside", () => {
    // A protrusion is the louder finding and a zero clearance is its
    // consequence; reporting both would be reporting one thing twice.
    const r = chassisFit(body, burst, [], { minSkinClearance: 25 });
    expect(r.faults.filter((f) => f.includes("reads the structure"))).toEqual([]);
  });
});

describe("chassisFit: coverage", () => {
  it("faults a frame that runs under half the car", () => {
    const stub = merge(box([100, -400, 200], [900, -330, 310]));
    const r = chassisFit(body, stub);
    expect(r.spanCoverage).toBeLessThan(0.5);
    expect(r.faults.join(" ")).toMatch(/spans only/);
  });

  it("passes a frame that runs most of it", () => {
    expect(chassisFit(body, rail).spanCoverage).toBeGreaterThan(0.75);
  });
});

describe("chassisFit: registration", () => {
  const mount = (name: string, at: [number, number, number]): BodyMount => ({ name, at });

  it("reads zero when the body sits on the pad, and raises nothing", () => {
    // The whole ask, in one number: pad top and floor pan at the same height.
    const r = chassisFit(carried, under, [mount("front-L", [1500, -365, 350])]);
    expect(r.mounts[0]!.bodyUnderside).toBeCloseTo(350, 0);
    expect(r.mounts[0]!.standoff).toBeCloseTo(0, 0);
    expect(r.faults.filter((f) => f.includes("mount"))).toEqual([]);
  });

  it("signs a pad the body never reaches NEGATIVE, and names it a gap", () => {
    const r = chassisFit(carried, under, [mount("front-L", [1500, -365, 310])]);
    expect(r.mounts[0]!.inside).toBe(false);
    expect(r.mounts[0]!.standoff).toBeCloseTo(-40, 0);
    expect(r.faults.join(" ")).toMatch(/a gap the mount does not fill/);
  });

  it("signs a pad driven up into the bodywork POSITIVE, and says so", () => {
    const r = chassisFit(carried, under, [mount("front-L", [1500, -365, 420])]);
    expect(r.mounts[0]!.inside).toBe(true);
    expect(r.mounts[0]!.standoff).toBeCloseTo(70, 0);
    expect(r.faults.join(" ")).toMatch(/pad buried in the bodywork/);
  });

  it("lets a pad inside the tolerance pass", () => {
    const r = chassisFit(carried, under, [mount("front-L", [1500, -365, 342])]);
    expect(r.mounts[0]!.standoff).toBeCloseTo(-8, 0);
    expect(r.faults.filter((f) => f.includes("mount"))).toEqual([]);
  });

  it("does not call a pad in the sky BURIED", () => {
    // A pad at z = 1200 over a body whose deck is 900. The lowest crossing in
    // its column is the floor at 350, so reading the column bottom-up would
    // report the mount as buried 850 mm inside a car it is nowhere near.
    // Nothing is above it, so nothing is what it is holding up.
    const r = chassisFit(carried, under, [mount("floating", [1500, -365, 1200])]);
    expect(r.mounts[0]!.bodyUnderside).toBeNull();
    expect(r.mounts[0]!.standoff).toBeNull();
    expect(r.faults.join(" ")).toMatch(/mount floating .* has no body in its column/);
  });

  it("catches a mount out past the flank", () => {
    const r = chassisFit(carried, under, [mount("stray", [1500, -1200, 310])]);
    expect(r.mounts[0]!.inside).toBe(false);
    expect(r.mounts[0]!.bodyUnderside).toBeNull();
    expect(r.faults.join(" ")).toMatch(/mount stray .* has no body in its column/);
  });

  it("survives a mount at a station with no body at all", () => {
    const r = chassisFit(carried, under, [mount("beyond", [9000, -365, 310])]);
    expect(r.mounts[0]!.standoff).toBeNull();
    expect(r.mounts[0]!.inside).toBe(false);
    expect(r.faults.join(" ")).toMatch(/mount beyond .* has no body in its column/);
  });

  it("reports a solid body's underside as the road, which is the caveat", () => {
    // `body` sits ON the road, so the lowest bodywork in any column is z = 0
    // and a pad at 310 really IS buried 310 mm inside the solid. The reading
    // is right; what it means is that this body has no floor pan to land on.
    const r = chassisFit(body, rail, [mount("front-L", [1500, -365, 310])]);
    expect(r.mounts[0]!.inside).toBe(true);
    expect(r.mounts[0]!.bodyUnderside).toBeCloseTo(0, 0);
    expect(r.mounts[0]!.standoff).toBeCloseTo(310, 0);
  });
});
