import { describe, expect, it } from "vitest";
import type { QuiltSpec } from "@car/schema";
import { evalChain } from "@car/num";
import { closedMeshCheck, meshQuilt } from "@car/mesh";
import {
  boxQuilt,
  curvedPairQuilt,
  pyramidQuilt,
  rangeVertexSet,
  splitTopBoxQuilt,
} from "./fixtures.js";

const noNaN = (a: Float64Array): boolean => {
  for (const x of a) if (Number.isNaN(x)) return false;
  return true;
};

describe("meshQuilt — watertight by index sharing", () => {
  it("G1 WATERTIGHT: the welded six-cell box meshes closed", () => {
    const { quilt } = boxQuilt(100);
    const mesh = meshQuilt(quilt, { baseDensity: 3 });
    expect(noNaN(mesh.positions)).toBe(true);
    expect(mesh.ranges).toHaveLength(6);
    expect(mesh.indices.length).toBe(108 * 3); // 6 faces x 3x3 quads x 2 tris
    const report = closedMeshCheck(mesh);
    expect(report.violations).toEqual([]);
    expect(report.closed).toBe(true);
  });

  it("meshes closed at the default density too", () => {
    const { quilt } = boxQuilt(100);
    const report = closedMeshCheck(meshQuilt(quilt));
    expect(report.closed).toBe(true);
  });

  it("T-JUNCTION: a split face against whole-trim neighbors stays closed", () => {
    // The top face is split at t=0.5 of curves 4-5 and 6-7; the y0 and y1
    // faces keep whole trims over those curves. Density 3 is odd, so t=0.5 is
    // NOT on the base lattice: the ONLY reason the whole-trim neighbors carry
    // a vertex at the T point is the union step in buildParams (table.ts),
    // which folds every side's t0/t1 into the curve's ONE global param list.
    // A per-cell sampler would give the neighbor 4 samples, the split pair 5,
    // and this check would report open edges along the seam.
    const { quilt } = splitTopBoxQuilt(100);
    const mesh = meshQuilt(quilt, { baseDensity: 3 });
    expect(noNaN(mesh.positions)).toBe(true);
    expect(mesh.ranges).toHaveLength(7);
    const report = closedMeshCheck(mesh);
    expect(report.violations).toEqual([]);
    expect(report.closed).toBe(true);
  });

  it("T-JUNCTION: the whole-trim neighbor consumes the T vertex itself", () => {
    const { quilt, curve, cell } = splitTopBoxQuilt(100);
    const mesh = meshQuilt(quilt, { baseDensity: 3 });
    const tVert = mesh.table.vertexAt(curve.get("4-5")!, 0.5);
    const byId = new Map(mesh.ranges.map((r) => [r.id, r]));
    for (const name of ["topA", "topB", "y0"]) {
      const used = rangeVertexSet(mesh.indices, byId.get(cell.get(name)!)!);
      expect(used.has(tVert)).toBe(true);
    }
  });

  it("INDEX SHARING: both cells on a curved chain reference identical vertices", () => {
    const { quilt, curve, cell } = curvedPairQuilt();
    const mesh = meshQuilt(quilt, { baseDensity: 4 });
    const sId = curve.get("S")!;
    const chain = quilt.curves.get(sId)!;
    const byId = new Map(mesh.ranges.map((r) => [r.id, r]));
    const upper = rangeVertexSet(mesh.indices, byId.get(cell.get("upper")!)!);
    const lower = rangeVertexSet(mesh.indices, byId.get(cell.get("lower")!)!);
    for (const t of mesh.table.paramsOf(sId)) {
      const v = mesh.table.vertexAt(sId, t);
      expect(upper.has(v)).toBe(true); // same index on both sides of the weld
      expect(lower.has(v)).toBe(true);
    }
    // and nobody made a private copy: each interior curve sample's exact
    // position occurs exactly once in the whole vertex buffer
    const params = mesh.table.paramsOf(sId);
    for (const t of params.slice(1, params.length - 1)) {
      const p = evalChain(chain, t);
      let hits = 0;
      for (let v = 0; v < mesh.positions.length / 3; v++) {
        if (
          mesh.positions[3 * v] === p[0] &&
          mesh.positions[3 * v + 1] === p[1] &&
          mesh.positions[3 * v + 2] === p[2]
        ) hits++;
      }
      expect(hits).toBe(1);
    }
  });

  it("TAPER: pyramid of four collapsed-side cells plus base meshes closed", () => {
    const { quilt, curve } = pyramidQuilt(100, 80);
    const mesh = meshQuilt(quilt, { baseDensity: 3 });
    expect(noNaN(mesh.positions)).toBe(true);
    const report = closedMeshCheck(mesh);
    expect(report.violations).toEqual([]);
    expect(report.closed).toBe(true);
    // all four tapered cells fan into the one apex vertex
    const apexVert = mesh.table.vertexAt(curve.get("apex")!, 0);
    let apexTris = 0;
    for (let t = 0; t < mesh.indices.length / 3; t++) {
      const tri = [mesh.indices[3 * t]!, mesh.indices[3 * t + 1]!, mesh.indices[3 * t + 2]!];
      if (tri.includes(apexVert)) apexTris++;
      // no degenerate triangle survives the drop
      expect(new Set(tri).size).toBe(3);
    }
    expect(apexTris).toBe(4 * 3); // 3 fan triangles per tapered cell at density 3
  });

  it("DETERMINISM: input ordering of cells and curves does not reach the output", () => {
    const { quilt } = splitTopBoxQuilt(100);
    const shuffled: QuiltSpec = {
      ...quilt,
      cells: [...quilt.cells].reverse(),
      curves: new Map([...quilt.curves.entries()].reverse()),
    };
    const a = meshQuilt(quilt, { baseDensity: 3 });
    const b = meshQuilt(shuffled, { baseDensity: 3 });
    expect(Array.from(a.positions)).toEqual(Array.from(b.positions));
    expect(Array.from(a.indices)).toEqual(Array.from(b.indices));
    expect(a.ranges).toEqual(b.ranges);
  });

  it("winds outward: signed volume of closed fixtures is positive and exact", () => {
    const volume = (m: { positions: Float64Array; indices: Uint32Array }): number => {
      let v6 = 0;
      const p = m.positions;
      for (let t = 0; t < m.indices.length / 3; t++) {
        const a = 3 * m.indices[3 * t]!;
        const b = 3 * m.indices[3 * t + 1]!;
        const c = 3 * m.indices[3 * t + 2]!;
        v6 +=
          p[a]! * (p[b + 1]! * p[c + 2]! - p[b + 2]! * p[c + 1]!) -
          p[a + 1]! * (p[b]! * p[c + 2]! - p[b + 2]! * p[c]!) +
          p[a + 2]! * (p[b]! * p[c + 1]! - p[b + 1]! * p[c]!);
      }
      return v6 / 6;
    };
    const box = meshQuilt(boxQuilt(100).quilt, { baseDensity: 3 });
    expect(volume(box)).toBeCloseTo(100 * 100 * 100, 6);
    const pyr = meshQuilt(pyramidQuilt(100, 80).quilt, { baseDensity: 3 });
    expect(volume(pyr)).toBeCloseTo((100 * 100 * 80) / 3, 6);
  });

  it("table vertices are the prefix of the mesh vertex buffer", () => {
    const { quilt } = curvedPairQuilt();
    const mesh = meshQuilt(quilt, { baseDensity: 4 });
    const n = mesh.table.positions.length;
    expect(Array.from(mesh.positions.slice(0, n))).toEqual(Array.from(mesh.table.positions));
  });

  it("ranges partition the index buffer in stable cell-id order", () => {
    const { quilt } = boxQuilt(50);
    const mesh = meshQuilt(quilt, { baseDensity: 2 });
    let cursor = 0;
    for (const r of mesh.ranges) {
      expect(r.start).toBe(cursor);
      cursor += r.count;
    }
    expect(cursor).toBe(mesh.indices.length);
    const ids = mesh.ranges.map((r) => r.id);
    expect(ids).toEqual([...ids].sort());
  });
});
