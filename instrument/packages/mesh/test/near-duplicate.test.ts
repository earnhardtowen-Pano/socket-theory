/**
 * Near-duplicate grid columns — the case no other fixture here produces.
 *
 * A curve's sample parameters are its base lattice UNION its trim endpoints.
 * Put a trim endpoint an ulp off a lattice point and the curve carries two
 * samples 1e-16 apart; any cell spanning them gets two grid columns that far
 * apart, and a column of zero-area quads between them. On a real body that was
 * 214 columns, 6,692 slivers of 32,612 triangles, and 980 vertices the
 * curvature lens could not measure at all.
 *
 * The obvious fix — drop the near-duplicate from the union — opens the mesh.
 * The seam polyline has to stay exactly the table polyline, and the cell across
 * that seam builds its own union from its own sides, so a column dropped here
 * and kept there is a T-gap. It opened 612 edges on that body while every one
 * of 585 tests stayed green, because none of them had a near-duplicate to find.
 *
 * This file is that missing fixture. It fails at 16 violations against the
 * dropped-column version and passes against the one that keeps the column and
 * reuses only the INTERIOR vertex.
 */

import { describe, expect, it } from "vitest";
import { closedMeshCheck, meshQuilt } from "../src/index.js";
import { nearDuplicateSplitQuilt } from "./fixtures.js";

/** Smallest positive gap between consecutive grid parameters, over all cells. */
function smallestColumnGap(quilt: ReturnType<typeof nearDuplicateSplitQuilt>["quilt"]): number {
  const mesh = meshQuilt(quilt, { baseDensity: 8 });
  let worst = 1;
  for (const cell of quilt.cells) {
    const sides = mesh.table.sidesOf(cell.id);
    for (const pair of [[0, 2], [3, 1]] as const) {
      const all: number[] = [0, 1];
      for (const i of pair) {
        const s = sides[i]!;
        if (!s.collapsed) all.push(...s.s, ...s.sOpp);
      }
      all.sort((a, b) => a - b);
      for (let i = 1; i < all.length; i++) {
        const g = all[i]! - all[i - 1]!;
        if (g > 0 && g < worst) worst = g;
      }
    }
  }
  return worst;
}

function triangleAreas(mesh: ReturnType<typeof meshQuilt>): number[] {
  const { positions: p, indices: ix } = mesh;
  const out: number[] = [];
  for (let t = 0; t < ix.length / 3; t++) {
    const i = ix[t * 3]!, j = ix[t * 3 + 1]!, k = ix[t * 3 + 2]!;
    const ux = p[j * 3]! - p[i * 3]!, uy = p[j * 3 + 1]! - p[i * 3 + 1]!, uz = p[j * 3 + 2]! - p[i * 3 + 2]!;
    const vx = p[k * 3]! - p[i * 3]!, vy = p[k * 3 + 1]! - p[i * 3 + 1]!, vz = p[k * 3 + 2]! - p[i * 3 + 2]!;
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    out.push(Math.hypot(nx, ny, nz) / 2);
  }
  return out;
}

describe("near-duplicate grid columns", () => {
  it("the fixture actually has one — otherwise it guards nothing", () => {
    const gap = smallestColumnGap(nearDuplicateSplitQuilt().quilt);
    expect(gap).toBeGreaterThan(0);
    expect(gap).toBeLessThan(1e-9);
  });

  it("stays closed — the seam is still exactly the table polyline", () => {
    // The assertion that the dropped-column version fails, at 16 violations.
    const mesh = meshQuilt(nearDuplicateSplitQuilt().quilt, { baseDensity: 8 });
    const report = closedMeshCheck(mesh);
    expect(report.violations).toHaveLength(0);
    expect(report.closed).toBe(true);
  });

  it("reuses the interior vertex instead of pushing one a femtometre away", () => {
    // The mechanism itself, rather than a percentage of slivers — a threshold
    // on the sliver count would be a number I picked, and this is the claim.
    // Whatever remains after this is the boundary rows, which have no choice:
    // two table vertices an ulp apart are two real points on the seam.
    const mesh = meshQuilt(nearDuplicateSplitQuilt().quilt, { baseDensity: 8 });
    const byCell = new Map<string, number[]>();
    for (let n = 0; n < mesh.interiorCell.length; n++) {
      const key = mesh.interiorCell[n]!;
      const list = byCell.get(key);
      if (list) list.push(n); else byCell.set(key, [n]);
    }
    let tooClose = 0;
    for (const list of byCell.values()) {
      for (let a = 0; a < list.length; a++) {
        for (let b = a + 1; b < list.length; b++) {
          const va = mesh.interiorBase + list[a]!, vb = mesh.interiorBase + list[b]!;
          const d = Math.hypot(
            mesh.positions[va * 3]! - mesh.positions[vb * 3]!,
            mesh.positions[va * 3 + 1]! - mesh.positions[vb * 3 + 1]!,
            mesh.positions[va * 3 + 2]! - mesh.positions[vb * 3 + 2]!,
          );
          if (d < 1e-9) tooClose++;
        }
      }
    }
    expect(tooClose).toBe(0);
  });

  it("leaves only the slivers the seam forces", () => {
    const mesh = meshQuilt(nearDuplicateSplitQuilt().quilt, { baseDensity: 8 });
    const areas = triangleAreas(mesh).sort((a, b) => a - b);
    const median = areas[Math.floor(areas.length / 2)]!;
    const slivers = areas.filter((a) => a < median / 100).length;
    // Two per near-duplicate column per boundary row it touches — a handful,
    // not a column's worth. Recorded as an absolute count on a fixture of
    // known size rather than as a ratio, so a change in density does not
    // quietly relax it.
    expect(slivers).toBeLessThan(24);
  });

  it("is deterministic", () => {
    const a = meshQuilt(nearDuplicateSplitQuilt().quilt, { baseDensity: 8 });
    const b = meshQuilt(nearDuplicateSplitQuilt().quilt, { baseDensity: 8 });
    expect([...a.indices]).toEqual([...b.indices]);
    expect([...a.positions]).toEqual([...b.positions]);
  });
});
