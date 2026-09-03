/**
 * The package envelope — what the body must be big enough to contain.
 *
 * Boxes, so every expected answer is arithmetic. The point of the file under
 * test is that the CONTENTS decide the minimum body, so each case is a part
 * moving and the bound moving with it.
 */

import { describe, expect, it } from "vitest";
import { packageAt, packageEnvelope, packageMisses, type PackageBox } from "../src/index.js";

const box = (name: string, lo: [number, number, number], hi: [number, number, number]): PackageBox =>
  ({ name, lo, hi });

/** An engine amidships and a tank behind it. */
const carried: PackageBox[] = [
  box("engine", [1000, -180, 200], [1600, 180, 800]),
  box("tank", [2600, -350, 400], [3000, 350, 650]),
];

describe("packageAt", () => {
  it("reports the bound and NAMES the part that set it", () => {
    const p = packageAt(carried, 1200, { skinGap: 50 });
    expect(p.top).toBe(850);
    expect(p.halfWidth).toBe(230);
    expect(p.bottom).toBe(150);
    expect(p.topDriver).toBe("engine");
    expect(p.widthDriver).toBe("engine");
  });

  it("is empty where the car carries nothing", () => {
    const p = packageAt(carried, 2000, { skinGap: 50 });
    expect(p.top).toBe(0);
    expect(p.halfWidth).toBe(0);
    expect(p.bottom).toBe(Infinity);
    expect(p.topDriver).toBeNull();
  });

  it("takes the union where two parts overlap a station", () => {
    const both = [...carried, box("airbox", [1400, -260, 700], [1800, 260, 950])];
    const p = packageAt(both, 1500, { skinGap: 50 });
    expect(p.top).toBe(1000);         // airbox is taller
    expect(p.topDriver).toBe("airbox");
    expect(p.halfWidth).toBe(310);    // airbox is wider
    expect(p.bottom).toBe(150);       // engine is lower
    expect(p.bottomDriver).toBe("engine");
  });

  it("moves when the part moves, which is the whole point", () => {
    const taller = [box("engine", [1000, -180, 200], [1600, 180, 980])];
    expect(packageAt(taller, 1200, { skinGap: 50 }).top).toBe(1030);
  });
});

describe("packageMisses", () => {
  const stations = [1200, 2000, 2800];
  const need = packageEnvelope(carried, stations, { skinGap: 50 });

  it("says nothing when the drawn body already contains its parts", () => {
    const drawn = stations.map((x) => ({ x, halfWidth: 900, top: 1200, floor: 100 }));
    expect(packageMisses(drawn, need)).toEqual([]);
  });

  it("names the station, the bound, the shortfall and the part", () => {
    const drawn = stations.map((x) => ({ x, halfWidth: 900, top: 640, floor: 100 }));
    const m = packageMisses(drawn, need);
    expect(m).toHaveLength(2);           // 1200 and 2800; nothing is at 2000
    expect(m[0]).toEqual({ x: 1200, what: "top", by: 210, driver: "engine" });
    expect(m[1]).toEqual({ x: 2800, what: "top", by: 60, driver: "tank" });
  });

  it("catches a floor drawn above the sump", () => {
    const drawn = stations.map((x) => ({ x, halfWidth: 900, top: 1200, floor: 300 }));
    const m = packageMisses(drawn, need).filter((q) => q.what === "floor");
    expect(m[0]).toEqual({ x: 1200, what: "floor", by: 150, driver: "engine" });
  });
});
