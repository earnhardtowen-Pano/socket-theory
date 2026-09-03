/**
 * A parity test cannot check its own ray, and a wheel arch is where it shows.
 *
 * `insideSection` casts one horizontal ray and counts crossings to the left.
 * That is exact for a closed section under one condition the ray cannot verify
 * for itself: that it meets the boundary transversally. Where a surface FOLDS
 * — the lip of a wheel arch is the case that found this — the two faces either
 * side of the fold are nearly parallel to the scan line, and the mesher
 * reports the same crossing twice, a couple of millimetres apart. `scanAt`
 * already collapses duplicates within a millimetre; two is outside that and is
 * still one wall.
 *
 * One extra crossing flips the parity for the whole rest of the section. On the
 * McLaren it put the front rails 191 mm outside a bonnet they sit in the middle
 * of, and nothing else in the file disagreed, because every other probe asks
 * the same function.
 *
 * SYNTHETIC, and deliberately so: this is a fold reduced to four line segments,
 * with nothing about a car in it. The cars are witnesses, not tests.
 */
import { describe, it, expect } from "vitest";
import { insideSection, scanAt, scanUp, type Seg2 } from "../src/index.js";

/** A closed box from y=-100..100, z=0..100, as segments. */
const boxWalls = (leftY: number): Seg2[] => [
  { a: [leftY, 0], b: [100, 0] },          // floor
  { a: [leftY, 100], b: [100, 100] },      // roof
  { a: [leftY, 0], b: [leftY, 100] },      // left wall
  { a: [100, 0], b: [100, 100] },          // right wall
];

/**
 * The same box with its left wall FOLDED: two faces two millimetres apart,
 * which is one wall reported twice and is what a mesher hands back at an arch
 * lip. The interior is unchanged; only the ray's view of it is.
 */
const folded: Seg2[] = [
  ...boxWalls(-100),
  { a: [-98, 0], b: [-98, 100] },
];

describe("insideSection under a grazing ray", () => {
  it("the fold really does double the crossing, which is the defect", () => {
    const across = scanAt(folded, 50);
    expect(across).toEqual([-100, -98, 100]);
    // Two crossings to the left of the centreline where the truth is one.
    expect(across.filter((c) => c < 0).length).toBe(2);
  });

  it("the vertical ray through the same point is clean", () => {
    const up = scanUp(folded, 0);
    expect(up).toEqual([0, 100]);
  });

  it("a point in the middle of the box is inside, fold or no fold", () => {
    expect(insideSection(boxWalls(-100), 0, 50)).toBe(true);
    expect(insideSection(folded, 0, 50)).toBe(true);
  });

  it("a point outside the box is still outside", () => {
    expect(insideSection(folded, 140, 50)).toBe(false);
    expect(insideSection(folded, -140, 50)).toBe(false);
    expect(insideSection(folded, 0, 140)).toBe(false);
  });

  it("a clean section is answered by the horizontal ray exactly as before", () => {
    // A box with a well cut into its roof: two interior walls at y=+-40 from
    // z=60 up, so a scan at z=80 crosses four times and the well is air.
    const well: Seg2[] = [
      ...boxWalls(-100),
      { a: [-40, 60], b: [-40, 100] },
      { a: [40, 60], b: [40, 100] },
      { a: [-40, 60], b: [40, 60] },
    ];
    expect(scanAt(well, 80)).toEqual([-100, -40, 40, 100]);
    expect(insideSection(well, 0, 80)).toBe(false);    // in the well: air
    expect(insideSection(well, 70, 80)).toBe(true);     // in the side wall
    expect(insideSection(well, 0, 30)).toBe(true);      // under the well floor
  });
});
