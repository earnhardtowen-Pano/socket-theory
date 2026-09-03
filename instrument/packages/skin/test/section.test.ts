/**
 * Sectioning a mesh — slices, scans, beltline and tumblehome.
 *
 * Every fixture is built out of triangles by hand, so the expected answer is
 * arithmetic rather than a car. A slab with a trough cut in it is a roadster
 * for these purposes: outer walls, a cockpit between them, and a beltline at
 * the top of each wall with a known lean.
 */

import { describe, expect, it } from "vitest";
import {
  coverClearance, sampledVertices, scanAt, sectionAt, sectionCache, sliceSection, wallClearance,
} from "../src/index.js";

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

describe("sliceSection", () => {
  it("cuts a box into a rectangle of segments", () => {
    const b = merge(box([0, -500, 0], [1000, 500, 400]));
    const segs = sliceSection(b, 500);
    expect(segs.length).toBeGreaterThan(0);
    let yLo = Infinity, yHi = -Infinity, zLo = Infinity, zHi = -Infinity;
    for (const s of segs) for (const q of [s.a, s.b]) {
      yLo = Math.min(yLo, q[0]); yHi = Math.max(yHi, q[0]);
      zLo = Math.min(zLo, q[1]); zHi = Math.max(zHi, q[1]);
    }
    expect(yLo).toBeCloseTo(-500, 9);
    expect(yHi).toBeCloseTo(500, 9);
    expect(zLo).toBeCloseTo(0, 9);
    expect(zHi).toBeCloseTo(400, 9);
  });

  it("returns nothing where the plane misses the body", () => {
    const b = merge(box([0, -500, 0], [1000, 500, 400]));
    expect(sliceSection(b, 2000)).toHaveLength(0);
  });
});

describe("scanAt", () => {
  it("reads two crossings through a solid and four through a trough", () => {
    const solid = sliceSection(merge(box([0, -500, 0], [1000, 500, 400])), 500);
    expect(scanAt(solid, 200)).toHaveLength(2);

    const open = sliceSection(trough, 1500);
    const ys = scanAt(open, 500);              // above the floor, between walls
    expect(ys).toHaveLength(4);
    expect(ys[0]).toBeCloseTo(-400, 6);
    expect(ys[1]).toBeCloseTo(-300, 6);
    expect(ys[2]).toBeCloseTo(300, 6);
    expect(ys[3]).toBeCloseTo(400, 6);
  });

  it("collapses the duplicate two triangles of one face produce", () => {
    // Every quad face is two triangles and a scan line crossing their shared
    // diagonal is reported by both. Without the collapse a plain box reads as
    // four walls, and four walls is a cockpit that is not there.
    const solid = sliceSection(merge(box([0, -500, 0], [1000, 500, 400])), 500);
    for (const z of [1, 100, 200, 399]) expect(scanAt(solid, z)).toHaveLength(2);
  });

  it("reports an abutting pair as three walls, because that is three walls", () => {
    // Two solids sharing a face is not one solid, and a lens that quietly
    // merged them would be inventing geometry to make a number nicer.
    const pair = merge(box([0, -400, 0], [1000, 0, 400]), box([0, 0, 0], [1000, 400, 400]));
    expect(scanAt(sliceSection(pair, 500), 200)).toHaveLength(3);
  });
});

describe("sectionAt", () => {
  it("finds the beltline at the top of the outer wall", () => {
    const s = sectionAt(trough, 1500, 500);
    expect(s.top).toBeCloseTo(800, 6);
    expect(s.width).toBeCloseTo(800, 6);
    expect(s.beltZ).toBeGreaterThan(700);
    expect(s.beltY).toBeCloseTo(400, 0);
  });

  it("reads zero tumblehome on a vertical wall", () => {
    const s = sectionAt(trough, 1500, 500);
    expect(Math.abs(s.tumblehomeDeg)).toBeLessThan(0.5);
  });

  it("reads the lean of a wall that tucks in, and the sign of one that flares", () => {
    // A wedge: outer face runs from y = 400 at the bottom to y = 300 at the
    // top over 400 mm of rise — atan(100/400) = 14.04 degrees of tumblehome.
    const wedge = {
      positions: [
        0, 400, 0, 3000, 400, 0, 3000, 300, 400, 0, 300, 400,
        0, -400, 0, 3000, -400, 0, 3000, -300, 400, 0, -300, 400,
      ],
      indices: [0, 1, 2, 0, 2, 3, 4, 6, 5, 4, 7, 6],
    };
    const s = sectionAt(merge(wedge), 1500, 200, { tumblehomeDropMm: 300 });
    expect(s.tumblehomeDeg).toBeCloseTo(14.04, 1);

    const flared = {
      positions: [0, 300, 0, 3000, 300, 0, 3000, 400, 400, 0, 400, 400],
      indices: [0, 1, 2, 0, 2, 3],
    };
    expect(sectionAt(merge(flared), 1500, 200, { tumblehomeDropMm: 300 }).tumblehomeDeg)
      .toBeCloseTo(-14.04, 1);
  });

  it("finds the cockpit and its floor", () => {
    const s = sectionAt(trough, 1500, 500);
    expect(s.interiorHalfWidth).toBeCloseTo(300, 6);
    expect(s.wellFloor).toBeGreaterThanOrEqual(200);
    expect(s.wellFloor).toBeLessThan(230);
  });

  it("reports no cockpit where the section is solid", () => {
    const solid = merge(box([0, -400, 0], [3000, 400, 800]));
    expect(sectionAt(solid, 1500, 500).interiorHalfWidth).toBeNull();
    expect(sectionAt(solid, 1500, 500).wellFloor).toBeNull();
  });
});

describe("coverClearance", () => {
  // A hollow-ish body: walls at +-800, a floor at 350, a deck at 900.
  const carried = merge(box([0, -800, 350], [3000, 800, 900]));
  const at = (y: number, z: number): number =>
    coverClearance(sliceSection(carried, 1500), y, z);

  it("ignores skin below the point, which is what it is standing on", () => {
    // 40 mm above the floor: `wallClearance` says 40, and 40 is the weld.
    expect(wallClearance(sliceSection(carried, 1500), 0, 390)).toBeCloseTo(40, 6);
    expect(at(0, 390)).toBeCloseTo(510, 6);   // the deck at 900, not the floor
  });

  it("counts skin beside the point, which is the flat-spot defect", () => {
    expect(at(795, 600)).toBeCloseTo(5, 6);
  });

  it("looks past the pan to the panel, for a rail slung under the car", () => {
    // 150 mm under the floor. Without the floor rule that pan is the answer
    // and the rail reads as tight; with it the nearest PANEL is the deck 700
    // above, which is a clearance nobody will ever fault.
    expect(at(0, 200)).toBeCloseTo(150, 6);
    expect(coverClearance(sliceSection(carried, 1500), 0, 200, () => 350)).toBeCloseTo(700, 6);
  });

  it("returns Infinity where nothing at all is above the point", () => {
    // Out past the flank: no skin over it, so no read-through to measure.
    expect(at(2000, 1200)).toBe(Infinity);
  });

  it("skips the floor pan when told where the floor is", () => {
    const section = sliceSection(carried, 1500);
    const floorAt = (): number => 350;
    // Directly under the pan and nowhere near a flank: without the floor rule
    // this is 10 mm and a fault, with it the deck 540 above.
    expect(coverClearance(section, 0, 340)).toBeCloseTo(10, 6);
    expect(coverClearance(section, 0, 340, floorAt)).toBeCloseTo(560, 6);
  });
});

describe("sectionCache and sampledVertices", () => {
  const carried = merge(box([0, -800, 350], [3000, 800, 900]));

  it("gives the same section as slicing it directly", () => {
    const { sectionAtX } = sectionCache(carried);
    expect(sectionAtX(1500).length).toBe(sliceSection(carried, 1500).length);
    // And the same object twice: the cache is the point.
    expect(sectionAtX(1500)).toBe(sectionAtX(1500));
  });

  it("reads the body's underside off a column", () => {
    const { floorAtX } = sectionCache(carried);
    expect(floorAtX(1500)(0)).toBeCloseTo(350, 6);
    expect(floorAtX(1500)(2000)).toBe(-Infinity);   // no body out there
  });

  it("samples every vertex when it can afford to, and thins when it cannot", () => {
    expect(sampledVertices(carried).length).toBe(8);
    expect(sampledVertices(carried, 2).length).toBeLessThanOrEqual(2);
  });
});
