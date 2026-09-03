import { describe, expect, it } from "vitest";
import { closedMeshCheck } from "@car/mesh";

const mesh = (positions: number[], indices: number[]) => ({
  positions: new Float64Array(positions),
  indices: new Uint32Array(indices),
});

/** Tetrahedron with outward-consistent winding, vertices remapped by `map`. */
const tetTris = (map: readonly [number, number, number, number]): number[] => {
  const [a, b, c, d] = map;
  return [a, c, b, a, b, d, b, c, d, a, d, c];
};

const TET_POS = [0, 0, 0, 100, 0, 0, 0, 100, 0, 0, 0, 100];

describe("closedMeshCheck", () => {
  it("accepts a consistently wound tetrahedron", () => {
    const report = closedMeshCheck(mesh(TET_POS, tetTris([0, 1, 2, 3])));
    expect(report.violations).toEqual([]);
    expect(report.closed).toBe(true);
  });

  it("reports every boundary edge of an open sheet exactly once", () => {
    const report = closedMeshCheck(mesh(TET_POS.slice(0, 9), [0, 1, 2]));
    expect(report.closed).toBe(false);
    const kinds = report.violations.map((v) => v.kind);
    expect(kinds.filter((k) => k === "open-edge")).toHaveLength(3);
    expect(kinds.filter((k) => k === "open-fan")).toHaveLength(3);
  });

  it("reports same-direction reuse of an edge as inconsistent winding", () => {
    // both triangles traverse edge 0->1 in the same direction
    const report = closedMeshCheck(mesh(TET_POS, [0, 1, 2, 0, 1, 3]));
    expect(report.closed).toBe(false);
    const winding = report.violations.filter((v) => v.kind === "inconsistent-winding");
    expect(winding).toHaveLength(1);
    expect(winding[0]!.detail).toContain("0-1");
  });

  it("reports an edge used by three triangles as nonmanifold", () => {
    const positions = [...TET_POS, 50, 50, 50];
    const report = closedMeshCheck(mesh(positions, [0, 1, 2, 1, 0, 3, 0, 1, 4]));
    const kinds = report.violations.map((v) => v.kind);
    expect(kinds).toContain("nonmanifold-edge");
    expect(report.closed).toBe(false);
  });

  it("reports two closed fans meeting at one vertex as a split fan", () => {
    const positions = [
      0, 0, 0, // 0 — shared apex of two tetrahedra
      100, 0, 0, 0, 100, 0, 0, 0, 100,
      -100, 0, 0, 0, -100, 0, 0, 0, -100,
    ];
    const indices = [...tetTris([0, 1, 2, 3]), ...tetTris([0, 4, 5, 6])];
    const report = closedMeshCheck(mesh(positions, indices));
    expect(report.closed).toBe(false);
    expect(report.violations).toEqual([
      { kind: "split-fan", detail: "vertex 0 fan splits into multiple cycles" },
    ]);
  });

  it("reports degenerate and out-of-range triangles without mutating anything", () => {
    const m = mesh(TET_POS, [0, 0, 1, 0, 1, 9]);
    const before = [...m.indices];
    const report = closedMeshCheck(m);
    const kinds = report.violations.map((v) => v.kind);
    expect(kinds).toContain("degenerate-triangle");
    expect(kinds).toContain("bad-index");
    expect([...m.indices]).toEqual(before);
  });

  it("treats an empty mesh and unreferenced vertices as vacuously closed", () => {
    expect(closedMeshCheck(mesh(TET_POS, [])).closed).toBe(true);
  });
});
