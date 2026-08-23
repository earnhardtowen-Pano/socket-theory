import { describe, expect, it } from "vitest";
import { creaseNormals, DEFAULT_CREASE_ANGLE } from "@car/mesh";

const mesh = (positions: number[], indices: number[]) => ({
  positions: new Float64Array(positions),
  indices: new Uint32Array(indices),
});

/** Unit cube, outward winding, 8 shared vertices — every edge is 90 degrees. */
const CUBE_POS = [
  0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0,
  0, 0, 1, 1, 0, 1, 1, 1, 1, 0, 1, 1,
];
const CUBE_IDX = [
  0, 2, 1, 0, 3, 2, // -Z
  4, 5, 6, 4, 6, 7, // +Z
  0, 1, 5, 0, 5, 4, // -Y
  3, 7, 6, 3, 6, 2, // +Y
  0, 4, 7, 0, 7, 3, // -X
  1, 2, 6, 1, 6, 5, // +X
];

/**
 * A strip of `n` quads hinged about Y, each turning `stepDeg` from the last —
 * a panel that curves gently, the case that must read as one surface.
 */
const fan = (n: number, stepDeg: number) => {
  const pos: number[] = [];
  const idx: number[] = [];
  let x = 0, z = 0;
  for (let i = 0; i <= n; i++) {
    pos.push(x, 0, z, x, 100, z);
    if (i < n) {
      const a = i * 2, b = a + 1;
      idx.push(a, b + 2, b, a, a + 2, b + 2); // wound so the strip faces +Z
      const th = ((i * stepDeg) * Math.PI) / 180;
      x += 100 * Math.cos(th);
      z += 100 * Math.sin(th);
    }
  }
  return mesh(pos, idx);
};

const nrm = (r: { normals: Float64Array }, v: number) =>
  [r.normals[v * 3]!, r.normals[v * 3 + 1]!, r.normals[v * 3 + 2]!] as const;

describe("creaseNormals", () => {
  it("splits a cube corner into one normal per face", () => {
    const r = creaseNormals(mesh(CUBE_POS, CUBE_IDX));
    // Every corner carries three faces at 90 degrees: 8 base + 16 duplicates.
    expect(r.split).toBe(16);
    expect(r.positions.length / 3).toBe(24);
    expect(r.normals.length / 3).toBe(24);
    // Each emitted normal is axis-aligned and unit — no averaged corner mush.
    for (let v = 0; v < 24; v++) {
      const n = nrm(r, v);
      expect(Math.hypot(...n)).toBeCloseTo(1, 12);
      expect(n.map((c) => Math.abs(Math.round(c))).reduce((a, b) => a + b)).toBe(1);
    }
  });

  it("shares one normal across a shallow bend", () => {
    const r = creaseNormals(fan(2, 20));
    expect(r.split).toBe(0);
    expect(r.positions.length).toBe(fan(2, 20).positions.length);
    // The shared hinge normal is the average of the two panels, not either one.
    const n = nrm(r, 2);
    expect(n[2]).toBeGreaterThan(0.9);
    expect(n[0]).toBeLessThan(0);
  });

  it("splits the same bend once it exceeds the crease angle", () => {
    expect(creaseNormals(fan(2, DEFAULT_CREASE_ANGLE - 5)).split).toBe(0);
    expect(creaseNormals(fan(2, DEFAULT_CREASE_ANGLE + 5)).split).toBe(2);
  });

  it("honours an explicit angle in both directions", () => {
    const m = fan(2, 30);
    expect(creaseNormals(m, 20).split).toBe(2);
    expect(creaseNormals(m, 40).split).toBe(0);
  });

  it("leaves the print path alone: triangle count and winding preserved", () => {
    const src = mesh(CUBE_POS, CUBE_IDX);
    const r = creaseNormals(src);
    expect(r.indices.length).toBe(src.indices.length);
    // Each corner still sits at the position it was welded to, whichever slot
    // it was rewritten into — the surface itself never moves.
    for (let t = 0; t < r.indices.length; t += 3) {
      for (let e = 0; e < 3; e++) {
        const from = src.indices[t + e]!, to = r.indices[t + e]!;
        for (let c = 0; c < 3; c++) {
          expect(r.positions[to * 3 + c]).toBe(src.positions[from * 3 + c]);
        }
      }
    }
  });

  it("says where every split vertex came from", () => {
    const src = mesh(CUBE_POS, CUBE_IDX);
    const r = creaseNormals(src);
    expect(r.sourceOf).toHaveLength(r.positions.length / 3);
    for (let v = 0; v < r.sourceOf.length; v++) {
      const from = r.sourceOf[v]!;
      if (v < 8) expect(from).toBe(v);            // originals map to themselves
      else expect(from).toBeLessThan(8);          // splits name their original
      for (let c = 0; c < 3; c++) {
        expect(r.positions[v * 3 + c]).toBe(src.positions[from * 3 + c]);
      }
    }
  });

  it("is deterministic across runs", () => {
    const a = creaseNormals(mesh(CUBE_POS, CUBE_IDX));
    const b = creaseNormals(mesh(CUBE_POS, CUBE_IDX));
    expect(Array.from(a.positions)).toEqual(Array.from(b.positions));
    expect(Array.from(a.normals)).toEqual(Array.from(b.normals));
    expect(Array.from(a.indices)).toEqual(Array.from(b.indices));
  });

  it("survives an open sheet, where edges have a single face", () => {
    const r = creaseNormals(mesh([0, 0, 0, 100, 0, 0, 0, 100, 0], [0, 1, 2]));
    expect(r.split).toBe(0);
    expect(nrm(r, 0)[2]).toBeCloseTo(1, 12);
  });
});
