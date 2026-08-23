/**
 * The two Coons evaluators must land in the same place.
 *
 * `@car/surface` blends the four boundary CURVES analytically and feeds the
 * render, the lenses and the continuity probe. `@car/mesh` blends the four
 * sampled boundary POLYLINES over the shared table and feeds the print. They
 * have always been two separate pieces of code, and nothing checked that they
 * described the same surface — which is how a tangent-plane correction could
 * have been added to one, measured as a win, and shipped in an STL that never
 * received it.
 *
 * This is that check. It leans on a fixture whose boundary curves are all
 * straight lines: sampling a straight line and lerping between the samples is
 * exact, so the discrete blend and the analytic blend are the SAME arithmetic
 * and any disagreement is a bug rather than a discretisation. The curved
 * fixture then pins the discretisation itself: the gap must shrink as the
 * sampling density rises.
 */

import { describe, expect, it } from "vitest";
import type { Id, QuiltSpec } from "@car/schema";
import { chainOf, dist3, splitChain } from "@car/num";
import { boundaryCoonsPoint, cellBoundary, tangentField, type CrossPrescription } from "@car/surface";
import { meshQuilt } from "../src/index.js";
import { closedMeshCheck } from "../src/closed.js";
import { boxQuilt, foldedPairQuilt, splitTopBoxQuilt } from "./fixtures.js";

/** A box turns 90° at every join; raise the bar so the field engages at all. */
const SMOOTH_EVERYTHING = { breakAngleDeg: 179 } as const;

/** Worst distance between the two evaluators, over every interior vertex. */
function worstGap(quilt: QuiltSpec, cross: CrossPrescription | undefined, density: number): number {
  // `cross: null` rather than omitting it — meshQuilt DERIVES a field when
  // none is given, so the unfielded comparison has to be asked for.
  const mesh = meshQuilt(quilt, { baseDensity: density, cross: cross ?? null });
  const boundaries = new Map<Id, ReturnType<typeof cellBoundary>>();
  const bOf = (id: Id): ReturnType<typeof cellBoundary> => {
    let hit = boundaries.get(id);
    if (!hit) {
      const cell = quilt.cells.find((c) => c.id === id);
      if (!cell) throw new Error(`no cell ${id}`);
      hit = cross ? cellBoundary(cell, quilt, cross) : cellBoundary(cell, quilt);
      boundaries.set(id, hit);
    }
    return hit;
  };
  let worst = 0;
  let seen = 0;
  for (let n = 0; n < mesh.interiorCell.length; n++) {
    const v = mesh.interiorBase + n;
    const discrete = [
      mesh.positions[v * 3]!, mesh.positions[v * 3 + 1]!, mesh.positions[v * 3 + 2]!,
    ] as const;
    const u = mesh.interiorUV[n * 2]!;
    const w = mesh.interiorUV[n * 2 + 1]!;
    const analytic = boundaryCoonsPoint(bOf(mesh.interiorCell[n]!), u, w);
    worst = Math.max(worst, dist3(discrete as never, analytic));
    seen++;
  }
  expect(seen).toBeGreaterThan(0);
  return worst;
}

describe("the analytic and discrete Coons evaluators agree", () => {
  it("exactly, on straight-edged cells, with no field", () => {
    const { quilt } = boxQuilt();
    expect(worstGap(quilt, undefined, 8)).toBeLessThan(1e-9);
  });

  it("exactly, on straight-edged cells, WITH the field", () => {
    const { quilt } = boxQuilt();
    const field = tangentField(quilt, SMOOTH_EVERYTHING);
    // The field has to be doing something, or this test proves nothing.
    expect(field.stats.edges).toBeGreaterThan(0);
    expect(worstGap(quilt, field, 8)).toBeLessThan(1e-9);
  });

  it("exactly, across a T-junction, with the field", () => {
    const { quilt } = splitTopBoxQuilt();
    const field = tangentField(quilt, SMOOTH_EVERYTHING);
    expect(field.stats.edges).toBeGreaterThan(0);
    expect(worstGap(quilt, field, 8)).toBeLessThan(1e-9);
  });

  it("exactly on curved cells too, wherever both opposite sides sample the grid", () => {
    // The mesher's grid axis is the UNION of the two opposite sides' sample
    // parameters. When those lattices coincide — which they do whenever the
    // two curves carry the same number of chain segments — every grid point
    // lands on a table vertex on both sides, nothing is interpolated, and the
    // discrete blend is the analytic blend arithmetic for arithmetic.
    const { quilt } = foldedPairQuilt();
    const field = tangentField(quilt, SMOOTH_EVERYTHING);
    expect(worstGap(quilt, field, 4)).toBeLessThan(1e-9);
  });

  it("to a gap that shrinks with density where a side must be interpolated", () => {
    // Give one side twice the segments of the side opposite it. Now half the
    // grid columns fall between that side's samples and get a chord instead
    // of the curve — the only place the two evaluators can legitimately
    // differ. The gap is the sagitta, and it is second order in the spacing.
    const { quilt, curve } = foldedPairQuilt();
    const uneven = new Map(quilt.curves);
    const north = uneven.get(curve.get("upper-n")!)!;
    const [lo, hi] = splitChain(north, 0.5);
    uneven.set(curve.get("upper-n")!, chainOf(...lo.segs, ...hi.segs));
    const spec: QuiltSpec = { ...quilt, curves: uneven };
    const field = tangentField(spec, SMOOTH_EVERYTHING);
    const coarse = worstGap(spec, field, 4);
    const fine = worstGap(spec, field, 16);
    expect(coarse).toBeGreaterThan(1e-6);
    expect(fine).toBeLessThan(coarse / 8);
  });
});

describe("the field does not disturb what the print depends on", () => {
  it("leaves every shared table vertex bit-identical", () => {
    const { quilt } = boxQuilt();
    const field = tangentField(quilt, SMOOTH_EVERYTHING);
    const plain = meshQuilt(quilt, { baseDensity: 8, cross: null });
    const fixed = meshQuilt(quilt, { baseDensity: 8, cross: field });
    expect(fixed.interiorBase).toBe(plain.interiorBase);
    for (let i = 0; i < plain.interiorBase * 3; i++) {
      expect(fixed.positions[i]).toBe(plain.positions[i]);
    }
  });

  it("moves interior vertices — otherwise it is not doing anything", () => {
    const { quilt } = boxQuilt();
    const field = tangentField(quilt, SMOOTH_EVERYTHING);
    const plain = meshQuilt(quilt, { baseDensity: 8, cross: null });
    const fixed = meshQuilt(quilt, { baseDensity: 8, cross: field });
    let moved = 0;
    for (let i = plain.interiorBase * 3; i < plain.positions.length; i++) {
      if (fixed.positions[i] !== plain.positions[i]) moved++;
    }
    expect(moved).toBeGreaterThan(0);
  });

  it("keeps the mesh closed and the triangle count identical", () => {
    const { quilt } = boxQuilt();
    const field = tangentField(quilt, SMOOTH_EVERYTHING);
    const plain = meshQuilt(quilt, { baseDensity: 8, cross: null });
    const fixed = meshQuilt(quilt, { baseDensity: 8, cross: field });
    expect(fixed.indices.length).toBe(plain.indices.length);
    expect([...fixed.indices]).toEqual([...plain.indices]);
    expect(closedMeshCheck(fixed).closed).toBe(true);
  });

  it("is ON by default — the printed body is the model, not the bare blend", () => {
    // The whole failure this layer exists to prevent is a probe measuring one
    // body while the printer makes another. A caller who says nothing gets the
    // model; the bare blend has to be asked for.
    const { quilt } = foldedPairQuilt();
    const derived = meshQuilt(quilt, { baseDensity: 8 });
    const bare = meshQuilt(quilt, { baseDensity: 8, cross: null });
    expect(derived.positions.length).toBe(bare.positions.length);
    let moved = 0;
    for (let i = 0; i < bare.positions.length; i++) {
      if (derived.positions[i] !== bare.positions[i]) moved++;
    }
    expect(moved).toBeGreaterThan(0);
  });

  it("is deterministic: two meshes of the same quilt are byte-identical", () => {
    const { quilt } = boxQuilt();
    const a = meshQuilt(quilt, { baseDensity: 8, cross: tangentField(quilt, SMOOTH_EVERYTHING) });
    const b = meshQuilt(quilt, { baseDensity: 8, cross: tangentField(quilt, SMOOTH_EVERYTHING) });
    expect([...a.positions]).toEqual([...b.positions]);
  });
});
