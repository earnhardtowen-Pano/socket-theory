import { describe, expect, it } from "vitest";
import type { Id, QuiltSpec } from "@car/schema";
import { evalChain } from "@car/num";
import { buildSampleTable } from "@car/mesh";
import { boxQuilt, curvedPairQuilt, pyramidQuilt, side, splitTopBoxQuilt } from "./fixtures.js";

describe("GlobalSampleTable", () => {
  it("per curve: sorted union of the base lattice with every trim endpoint", () => {
    const { quilt, curve } = splitTopBoxQuilt(100);
    const table = buildSampleTable(quilt, 3);
    // curve 4-5 is split-trimmed at 0.5 by topA/topB; density 3 is odd, so 0.5
    // can only come from the trim-endpoint union, never the base lattice
    const params = table.paramsOf(curve.get("4-5")!);
    expect(params).toEqual([0, 1 / 3, 0.5, 2 / 3, 1]);
    // an untouched curve keeps the bare lattice
    expect(table.paramsOf(curve.get("0-1")!)).toEqual([0, 1 / 3, 2 / 3, 1]);
    // strictly ascending — duplicates removed
    for (const id of table.curveIds) {
      const p = table.paramsOf(id);
      for (let i = 1; i < p.length; i++) expect(p[i]!).toBeGreaterThan(p[i - 1]!);
    }
  });

  it("one vertex per (curveId, param), evaluated once, exact position", () => {
    const { quilt, curve } = curvedPairQuilt();
    const table = buildSampleTable(quilt, 4);
    const sId = curve.get("S")!;
    const chain = quilt.curves.get(sId)!;
    for (const t of table.paramsOf(sId)) {
      const v = table.vertexAt(sId, t);
      const p = table.posOf(v);
      const q = evalChain(chain, t);
      expect(p).toEqual(q); // bitwise: the table holds the single evaluation
    }
  });

  it("welds the endpoint samples of adjacent sides into one vertex (corners)", () => {
    const { quilt, curve } = boxQuilt(100);
    const table = buildSampleTable(quilt, 3);
    // three edges meet at box corner 0 = (0,0,0); all their t=0 samples must be
    // one mesh vertex, established by loop adjacency, not coordinate matching
    const a = table.vertexAt(curve.get("0-1")!, 0);
    const b = table.vertexAt(curve.get("0-2")!, 0);
    const c = table.vertexAt(curve.get("0-4")!, 0);
    expect(a).toBe(b);
    expect(b).toBe(c);
    // welded box: 12 curves x 4 params, minus 2 merged samples per corner
    expect(table.vertexCount).toBe(12 * 4 - 8 * 2);
  });

  it("collapses a tapered side to its single lowest-param vertex", () => {
    const { quilt, cell, curve } = pyramidQuilt(100, 80);
    const table = buildSampleTable(quilt, 3);
    const apexVert = table.vertexAt(curve.get("apex")!, 0);
    for (const name of ["y0", "x1", "y1", "x0"]) {
      const sides = table.sidesOf(cell.get(name)!);
      const top = sides[2];
      expect(top.collapsed).toBe(true);
      expect(top.verts).toEqual([apexVert]);
    }
    // the slant edges' apex ends weld into the same vertex
    expect(table.vertexAt(curve.get("0-a")!, 1)).toBe(apexVert);
    expect(table.vertexAt(curve.get("3-a")!, 1)).toBe(apexVert);
  });

  it("side samples respect sub-range and reversal", () => {
    const { quilt, cell, curve } = splitTopBoxQuilt(100);
    const table = buildSampleTable(quilt, 3);
    const sides = table.sidesOf(cell.get("topA")!);
    // side 0: curve 4-5 over [0, 0.5] forward -> table params {0, 1/3, 0.5}
    const south = sides[0];
    expect(south.s).toEqual([0, (1 / 3 - 0) / 0.5, 1]);
    expect(south.verts[0]).toBe(table.vertexAt(curve.get("4-5")!, 0));
    expect(south.verts[2]).toBe(table.vertexAt(curve.get("4-5")!, 0.5));
    // side 2: curve 6-7 over [0, 0.5] reversed -> loop starts at t=0.5
    const north = sides[2];
    expect(north.verts[0]).toBe(table.vertexAt(curve.get("6-7")!, 0.5));
    expect(north.verts[north.verts.length - 1]).toBe(table.vertexAt(curve.get("6-7")!, 0));
    expect(north.s[0]).toBe(0);
    expect(north.s[north.s.length - 1]).toBe(1);
  });

  it("throws on a side that references an unknown curve", () => {
    const { quilt } = boxQuilt(10);
    const c0 = quilt.cells[0]!;
    const broken: QuiltSpec = {
      ...quilt,
      cells: [{
        id: c0.id,
        sides: [side("curve#99" as Id, 0, 1, false), c0.sides[1]!, c0.sides[2]!, c0.sides[3]!],
      }],
    };
    expect(() => buildSampleTable(broken, 3)).toThrow(/unknown curve/);
  });
});
