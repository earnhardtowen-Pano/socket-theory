import { describe, expect, it } from "vitest";
import { aeroLens, dragAndPower, inletAdequacy, AIR_DENSITY } from "@car/lens";
import { assumed, derived, sourced } from "@car/demand";

/** A closed axis-aligned box, `n` subdivisions per edge, as a mesh. */
function boxMesh(sx: number, sy: number, sz: number, n: number) {
  const pos: number[] = [];
  const idx: number[] = [];
  const add = (x: number, y: number, z: number): number => {
    pos.push(x, y, z);
    return pos.length / 3 - 1;
  };
  // Six faces, each an n×n grid, wound outward. Vertices are not shared
  // between faces — the lens never asks for a welded mesh.
  const face = (o: [number, number, number], u: [number, number, number], v: [number, number, number]) => {
    const g: number[][] = [];
    for (let i = 0; i <= n; i++) {
      const row: number[] = [];
      for (let j = 0; j <= n; j++) {
        row.push(add(
          o[0] + (u[0] * i) / n + (v[0] * j) / n,
          o[1] + (u[1] * i) / n + (v[1] * j) / n,
          o[2] + (u[2] * i) / n + (v[2] * j) / n,
        ));
      }
      g.push(row);
    }
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        idx.push(g[i]![j]!, g[i + 1]![j]!, g[i + 1]![j + 1]!);
        idx.push(g[i]![j]!, g[i + 1]![j + 1]!, g[i]![j + 1]!);
      }
    }
  };
  face([0, 0, 0], [0, sy, 0], [sx, 0, 0]);            // -Z
  face([0, 0, sz], [sx, 0, 0], [0, sy, 0]);           // +Z
  face([0, 0, 0], [sx, 0, 0], [0, 0, sz]);            // -Y
  face([0, sy, 0], [0, 0, sz], [sx, 0, 0]);           // +Y
  face([0, 0, 0], [0, 0, sz], [0, sy, 0]);            // -X
  face([sx, 0, 0], [0, sy, 0], [0, 0, sz]);           // +X
  return { positions: new Float64Array(pos), indices: new Uint32Array(idx) };
}

describe("aero lens (charge §9)", () => {
  const mesh = boxMesh(4000, 1800, 1200, 8);

  it("solves and carries its own method statement", () => {
    const r = aeroLens(mesh, { targetPanels: 120, groundPlane: false });
    expect(r.panelCount).toBeGreaterThan(20);
    expect(r.method).toContain("source panels");
    expect(r.method).toContain("self term");
    expect(Number.isFinite(r.cpMin)).toBe(true);
    expect(Number.isFinite(r.cpMax)).toBe(true);
  });

  it("drives the normal velocity to near zero — the boundary condition it set", () => {
    const r = aeroLens(mesh, { targetPanels: 120, groundPlane: false });
    expect(r.residual).toBeLessThan(0.15);
  });

  it("puts a stagnation point on the nose and never exceeds Cp = 1", () => {
    // Potential flow: Cp is 1 where the flow stops and cannot be higher.
    const r = aeroLens(mesh, { targetPanels: 120, groundPlane: false });
    expect(r.cpMax).toBeGreaterThan(0.5);
    expect(r.cpMax).toBeLessThanOrEqual(1.0001);
  });

  it("is speed-independent by construction — it takes no speed at all", () => {
    const a = aeroLens(mesh, { targetPanels: 120, groundPlane: false });
    const b = aeroLens(mesh, { targetPanels: 120, groundPlane: false });
    expect(Array.from(a.cpPanel)).toEqual(Array.from(b.cpPanel));
  });

  it("gives every triangle the Cp of its panel", () => {
    const r = aeroLens(mesh, { targetPanels: 120, groundPlane: false });
    expect(r.cpTriangle).toHaveLength(mesh.indices.length / 3);
    for (let i = 0; i < r.cpTriangle.length; i++) expect(Number.isFinite(r.cpTriangle[i]!)).toBe(true);
  });

  it("derives the frontal area from the model, and shows its convergence", () => {
    const r = aeroLens(mesh, { targetPanels: 120, groundPlane: false, frontalCellMm: 4 });
    // A 1800 × 1200 box projects to 2.16 m² exactly.
    expect(r.frontalArea.value).toBeCloseTo(2.16, 1);
    expect(r.frontalArea.license.tag).toBe("DERIVED");
    expect(r.frontalAreaConvergence).toBeLessThan(0.05);
  });

  it("says on itself that separation is beyond the method", () => {
    const r = aeroLens(mesh, { targetPanels: 120, groundPlane: false });
    expect(r.notes.join(" ")).toContain("Separation is beyond this method");
    expect(r.notes.join(" ")).toContain("never come from this map");
    expect(r.separated).toHaveLength(r.panelCount);
  });

  it("the ground plane changes the answer, which is the point of having one", () => {
    const free = aeroLens(mesh, { targetPanels: 120, groundPlane: false });
    const road = aeroLens(mesh, { targetPanels: 120, groundPlane: true });
    expect(road.method).toContain("ground-plane image");
    expect(Array.from(road.cpPanel)).not.toEqual(Array.from(free.cpPanel));
  });
});

describe("drag and power (never from the map)", () => {
  const area = derived(2.16, "m2", "test");

  it("is ½ρv²CdA, and the chain shows every licence", () => {
    const d = dragAndPower(sourced(100, "km/h", "test"), sourced(0.33, "ratio", "test"), area);
    const v = 100 / 3.6;
    expect(d.drag.value).toBeCloseTo(0.5 * AIR_DENSITY.value * v * v * 0.33 * 2.16, 6);
    expect(d.power.value).toBeCloseTo(d.drag.value * v, 6);
    expect(d.drag.license.tag).toBe("DERIVED");
    expect(String((d.drag.license as { chain?: string }).chain ?? d.drag.license)).toContain("SOURCED");
  });

  it("scales by v², which is the only thing speed touches", () => {
    const cd = sourced(0.33, "ratio", "test");
    const a = dragAndPower(sourced(50, "km/h", "test"), cd, area);
    const b = dragAndPower(sourced(100, "km/h", "test"), cd, area);
    expect(b.drag.value / a.drag.value).toBeCloseTo(4, 9);
    expect(b.power.value / a.power.value).toBeCloseTo(8, 9);
  });

  it("carries a caveat when the Cd is a guess, instead of dropping it", () => {
    const guessed = dragAndPower(sourced(100, "km/h", "test"), assumed(0.33, "ratio", "guess"), area);
    expect(guessed.caveat).toContain("ASSUMED");
    const known = dragAndPower(sourced(100, "km/h", "test"), sourced(0.33, "ratio", "test"), area);
    expect(known.caveat).toBe("");
  });
});

describe("inlet versus cooling demand", () => {
  it("is area against area, with the chain stated", () => {
    const c = inletAdequacy(derived(90000, "mm2", "test"), assumed(200, "kW", "test"), sourced(100, "km/h", "test"));
    expect(c.required.value).toBeGreaterThan(0);
    expect(c.chain).toContain("kg/s");
    expect(c.adequate).toBe(c.available.value >= c.required.value);
  });

  it("needs more inlet the slower you go", () => {
    const kw = assumed(200, "kW", "test");
    const slow = inletAdequacy(derived(1, "mm2", "t"), kw, sourced(30, "km/h", "test"));
    const fast = inletAdequacy(derived(1, "mm2", "t"), kw, sourced(120, "km/h", "test"));
    expect(slow.required.value).toBeCloseTo(fast.required.value * 4, 6);
  });
});
