/**
 * mirrorSymmetry — the lens that was missing.
 *
 * Synthetic fixtures: a box authored down both sides is symmetric, the same
 * box with one flank nudged is not, and the report says by how much and where.
 */

import { describe, expect, it } from "vitest";
import { mirrorSymmetry } from "../src/index.js";

/** A slab of vertices at ±y, plus a centreline row. */
function slab(nudge = 0): Float64Array {
  const out: number[] = [];
  for (let i = 0; i <= 10; i++) {
    const x = i * 100;
    for (const z of [0, 200, 400]) {
      out.push(x, 500, z);
      out.push(x, -500 - nudge, z);
      out.push(x, 0, z);
    }
  }
  return Float64Array.from(out);
}

describe("mirrorSymmetry", () => {
  it("reads zero on a body authored down both sides", () => {
    const r = mirrorSymmetry({ positions: slab() });
    expect(r.worst).toBe(0);
    expect(r.median).toBe(0);
    expect(r.over).toBe(0);
    expect(r.vertices).toBe(99);
  });

  it("reads the nudge, in millimetres, and says where", () => {
    const r = mirrorSymmetry({ positions: slab(0.4) });
    // Every -y vertex is 0.4 from where its +y twin reflects to, and every
    // +y vertex is 0.4 from where the -y one reflects to. The centreline is
    // its own reflection and stays at zero.
    expect(r.worst).toBeCloseTo(0.4, 9);
    expect(r.over).toBe(66);
    // The offender is a flank vertex, never the centreline row.
    expect(Math.abs(r.worstAt[1]!)).toBeGreaterThan(400);
  });

  it("leaves a nudge under the tolerance uncounted, and still reports it", () => {
    const r = mirrorSymmetry({ positions: slab(0.01) });
    expect(r.over).toBe(0);
    expect(r.worst).toBeCloseTo(0.01, 9);
  });

  it("does not pretend a vertex with no reflection is close", () => {
    // One lonely vertex far off the mirror plane, out of reach of the hash.
    const p = Float64Array.from([0, 0, 0, 100, 900, 0]);
    const r = mirrorSymmetry({ positions: p }, { cell: 4 });
    expect(r.worst).toBe(4);           // the search horizon, not Infinity
    expect(Number.isFinite(r.worst)).toBe(true);
  });

  it("is empty-safe", () => {
    const r = mirrorSymmetry({ positions: new Float64Array(0) });
    expect(r.vertices).toBe(0);
    expect(r.worst).toBe(0);
  });
});
