/**
 * A trim end an ulp off a lattice point, on the same curve, read backwards.
 *
 * The defect the P2's tail cap found — see `ulpOffLatticeQuilt` for the
 * mechanism. Three claims:
 *
 *   THE FIXTURE HAS THE COLLISION. Otherwise it guards nothing: `1 - t` must
 *   land on one double for both of the curve's two parameters.
 *
 *   THE TABLE CARRIES ONE VERTEX THERE, NOT TWO. Two parameters closer than
 *   any authored trim could ever be are one sample, whichever arithmetic
 *   wrote them.
 *
 *   THE PRINT IS CLOSED, at the density that puts a lattice point on the
 *   collision. The mesh that shipped every car before this one opened at
 *   exactly one triangle here.
 */
import { describe, expect, it } from "vitest";
import { buildSampleTable, closedMeshCheck, meshQuilt } from "../src/index.js";
import { ulpOffLatticeQuilt } from "./fixtures.js";

const DENSITY = 10;

describe("a trim end an ulp off a lattice point", () => {
  it("the fixture actually collides under the reversed parameterization", () => {
    const lattice = 3 / 10;
    const split = 0.1 + 0.2;
    expect(split).not.toBe(lattice);
    expect(1 - split).toBe(1 - lattice);
  });

  it("the table samples the curve once there, whichever way the trim was written", () => {
    const fx = ulpOffLatticeQuilt();
    const table = buildSampleTable(fx.quilt, DENSITY);
    for (const key of ["4-5", "6-7"]) {
      const near = table.paramsOf(fx.curve.get(key)!).filter((t) => Math.abs(t - 0.3) < 1e-6);
      expect(near, `params of ${key} near 0.3`).toHaveLength(1);
      // Both spellings resolve to the same vertex.
      expect(table.vertexAt(fx.curve.get(key)!, 0.1 + 0.2)).toBe(table.vertexAt(fx.curve.get(key)!, 3 / 10));
    }
  });

  it("stays closed", () => {
    const mesh = meshQuilt(ulpOffLatticeQuilt().quilt, { baseDensity: DENSITY, cross: null });
    const report = closedMeshCheck(mesh);
    expect(report.violations).toHaveLength(0);
    expect(report.closed).toBe(true);
  });

  it("stays closed at every density, collision or not", () => {
    for (const density of [4, 7, 10, 20, 30]) {
      const mesh = meshQuilt(ulpOffLatticeQuilt().quilt, { baseDensity: density, cross: null });
      expect(closedMeshCheck(mesh).closed, `density ${density}`).toBe(true);
    }
  });
});
