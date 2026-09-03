/**
 * The two lenses that read the surface NORMAL rather than the surface: what a
 * highlight does, and whether the part comes out of the tool.
 */

import { describe, expect, it } from "vitest";
import { draftMap, isophoteContours, isophoteField, isophoteGradient, shallowFraction, undercutFraction } from "../src/index.js";

/** A unit hemisphere-ish patch: normals that sweep a known range. */
function dome(n = 24): { positions: Float64Array; normals: Float64Array; indices: Uint32Array } {
  const pos: number[] = [], nor: number[] = [], idx: number[] = [];
  for (let j = 0; j <= n; j++) {
    for (let i = 0; i <= n; i++) {
      const u = (i / n) * Math.PI * 2, v = (j / n) * (Math.PI / 2);
      const x = Math.cos(u) * Math.cos(v), y = Math.sin(u) * Math.cos(v), z = Math.sin(v);
      pos.push(x * 100, y * 100, z * 100);
      nor.push(x, y, z);
    }
  }
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const a = j * (n + 1) + i, b = a + 1, c = a + n + 1, d = c + 1;
      idx.push(a, b, d, a, d, c);
    }
  }
  return {
    positions: Float64Array.from(pos), normals: Float64Array.from(nor), indices: Uint32Array.from(idx),
  };
}

describe("isophotes", () => {
  it("puts the pole facing the light in the first band and the rim in the last", () => {
    const m = dome();
    const f = isophoteField(m, { light: [0, 0, 1], bands: 18 });
    // The top of the dome has n̂ = +Z, dead on the light: angle 0.
    const top = f.angleDeg.indexOf(Math.min(...Array.from(f.angleDeg)));
    expect(f.angleDeg[top]).toBeLessThan(1);
    expect(f.band[top]).toBe(0);
    expect(Math.max(...Array.from(f.angleDeg))).toBeGreaterThan(88);
  });

  it("normalises the light and rejects a zero one", () => {
    const m = dome(8);
    const a = isophoteField(m, { light: [0, 0, 5] });
    const b = isophoteField(m, { light: [0, 0, 1] });
    expect(Array.from(a.cosine)).toEqual(Array.from(b.cosine));
    expect(a.light).toEqual([0, 0, 1]);
    expect(() => isophoteField(m, { light: [0, 0, 0] })).toThrow();
  });

  it("draws contours that lie ON the surface they came from", () => {
    const m = dome();
    const f = isophoteField(m, { light: [0, 0, 1], bands: 12 });
    const c = isophoteContours(m, f);
    expect(c.length).toBeGreaterThan(0);
    expect(c.length % 9).toBe(0);
    // Every endpoint is a convex combination of two dome vertices, so it sits
    // inside the mesh — on a sphere of radius 100 that means a radius at or
    // just under 100, never outside.
    for (let i = 0; i + 8 < c.length; i += 9) {
      for (const o of [0, 3]) {
        const r = Math.hypot(c[i + o]!, c[i + o + 1]!, c[i + o + 2]!);
        expect(r).toBeGreaterThan(95);
        expect(r).toBeLessThanOrEqual(100.0001);
      }
    }
  });

  it("reads a flat surface as having nowhere for a highlight to travel", () => {
    const n = 6;
    const pos: number[] = [], nor: number[] = [], idx: number[] = [];
    for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) {
      pos.push(i * 10, j * 10, 0); nor.push(0, 0, 1);
    }
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const a = j * (n + 1) + i;
      idx.push(a, a + 1, a + n + 2, a, a + n + 2, a + n + 1);
    }
    const m = {
      positions: Float64Array.from(pos), normals: Float64Array.from(nor), indices: Uint32Array.from(idx),
    };
    const f = isophoteField(m, { light: [0.3, 0.2, 0.9], bands: 24 });
    const g = isophoteGradient(m, f);
    expect(Math.max(...Array.from(g))).toBeLessThan(1e-12);
    expect(isophoteContours(m, f).length).toBe(0);
  });

  it("counts a normal it cannot use rather than inventing one", () => {
    const m = dome(4);
    const holed = { ...m, normals: Float64Array.from(m.normals) };
    holed.normals[0] = 0; holed.normals[1] = 0; holed.normals[2] = 0;
    const f = isophoteField(holed);
    expect(f.degenerate).toBe(1);
    expect(f.band[0]).toBe(-1);
  });
});

describe("draft", () => {
  it("reads a dome pulled along its axis as fully drafted", () => {
    const m = dome();
    const r = draftMap(m, { pull: [0, 0, 1], minDraftDeg: 3 });
    expect(undercutFraction(r)).toBe(0);
    expect(r.worstDeg).toBeGreaterThanOrEqual(-1e-9);
  });

  it("reads the same dome pulled sideways as half undercut", () => {
    const m = dome();
    const r = draftMap(m, { pull: [1, 0, 0] });
    // Half of any closed-ish surface faces away from any direction you pick.
    expect(undercutFraction(r)).toBeGreaterThan(0.4);
    expect(undercutFraction(r)).toBeLessThan(0.6);
  });

  it("calls a wall parallel to the pull shallow, not undercut", () => {
    const n = 4;
    const pos: number[] = [], nor: number[] = [], idx: number[] = [];
    for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) {
      pos.push(i * 10, 0, j * 10); nor.push(0, 1, 0);   // a wall facing +Y
    }
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const a = j * (n + 1) + i;
      idx.push(a, a + 1, a + n + 2, a, a + n + 2, a + n + 1);
    }
    const m = {
      positions: Float64Array.from(pos), normals: Float64Array.from(nor), indices: Uint32Array.from(idx),
    };
    const r = draftMap(m, { pull: [0, 0, 1], minDraftDeg: 3 });
    expect(undercutFraction(r)).toBe(0);
    expect(shallowFraction(r)).toBeCloseTo(1, 9);
    expect(r.worstDeg).toBeCloseTo(0, 9);
  });

  it("normalises the pull and rejects a zero one", () => {
    const m = dome(6);
    expect(draftMap(m, { pull: [0, 0, 7] }).pull).toEqual([0, 0, 1]);
    expect(() => draftMap(m, { pull: [0, 0, 0] })).toThrow();
  });

  it("weighs a triangle by its area, not by its count", () => {
    const m = dome(20);
    const r = draftMap(m, { pull: [1, 0, 0] });
    expect(r.totalAreaMm2).toBeGreaterThan(0);
    expect(r.undercutAreaMm2 + r.shallowAreaMm2).toBeLessThanOrEqual(r.totalAreaMm2 + 1e-6);
  });
});
