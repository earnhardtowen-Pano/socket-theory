/**
 * The control net against the evaluator.
 *
 * This is the claim of the whole export stage: the tensor-product tiles ARE
 * the surface, not an approximation of it fitted to a tolerance. So the test
 * is one sentence checked hard — sample `netAt` and `boundaryCoonsPoint` at
 * the same (u,v) and require agreement at the level the arithmetic can carry,
 * on a body large enough that a millimetre is a small number.
 *
 * The bar is 1e-9 mm. That is not a tolerance on the geometry; it is the
 * rounding of the elevations and products that carry the identity, on a
 * fixture whose coordinates run to a few hundred millimetres.
 *
 * Every fixture is synthetic. Nothing here reads the P1.
 */

import { describe, expect, it } from "vitest";
import type { QuiltSpec } from "@car/schema";
import { dist3 } from "@car/num";
import {
  boundaryCoonsPoint, cellBezier, cellBoundary, netAt, tangentField, NotPolynomial,
} from "@car/surface";
import {
  boxQuilt, curvedPairQuilt, foldedPairQuilt, nearDuplicateSplitQuilt, pyramidQuilt,
  splitTopBoxQuilt,
} from "../../mesh/test/fixtures.js";

const SMOOTH = { breakAngleDeg: 179 } as const;

/** Interior stations plus the four edges and the corners. */
const STATIONS: [number, number][] = [];
for (let i = 0; i <= 10; i++) {
  for (let j = 0; j <= 10; j++) STATIONS.push([i / 10, j / 10]);
}
// A few off-lattice points, so nothing passes by landing on a breakpoint.
for (const [u, v] of [[0.137, 0.611], [0.883, 0.049], [0.5001, 0.4999], [0.02, 0.98]] as const) {
  STATIONS.push([u, v]);
}

function worstGap(quilt: QuiltSpec, order: 1 | 2): { mm: number; tiles: number; degU: number; degV: number } {
  const cross = tangentField(quilt, { ...SMOOTH, order });
  let mm = 0, tiles = 0, degU = 0, degV = 0;
  for (const cell of quilt.cells) {
    const b = cellBoundary(cell, quilt, cross);
    const net = cellBezier(b, cross, { order });
    tiles += net.tiles.length * net.tiles[0]!.length;
    if (net.degreeU > degU) degU = net.degreeU;
    if (net.degreeV > degV) degV = net.degreeV;
    for (const [u, v] of STATIONS) {
      const d = dist3(netAt(net, u, v), boundaryCoonsPoint(b, u, v));
      if (d > mm) mm = d;
    }
  }
  return { mm, tiles, degU, degV };
}

describe("the control net is the surface", () => {
  it("reproduces the bare blend exactly", () => {
    // No field at all: the net is S₀ and nothing else, and the only arithmetic
    // between the two is the elevation of the four separable terms.
    const { quilt } = boxQuilt();
    for (const cell of quilt.cells) {
      const b = cellBoundary(cell, quilt);
      const net = cellBezier(b);
      expect(net.degreeU).toBe(3);
      expect(net.degreeV).toBe(3);
      expect(net.tiles.length).toBe(1);
      for (const [u, v] of STATIONS) {
        expect(dist3(netAt(net, u, v), boundaryCoonsPoint(b, u, v))).toBeLessThan(1e-9);
      }
    }
  });

  it("reproduces the G1-corrected surface", () => {
    for (const make of [foldedPairQuilt, curvedPairQuilt, pyramidQuilt]) {
      const { quilt } = make();
      const r = worstGap(quilt, 1);
      expect(r.mm).toBeLessThan(1e-9);
    }
  });

  it("reproduces the G2-corrected surface", () => {
    for (const make of [foldedPairQuilt, curvedPairQuilt]) {
      const { quilt } = make();
      const r = worstGap(quilt, 2);
      expect(r.mm).toBeLessThan(1e-9);
    }
  });

  it("lands on the bidegree the construction predicts", () => {
    // A closed box: every side of every cell has a neighbour, so every side
    // carries a field and every tile is a fade tile. (11,11) at order 1 and
    // (13,13) at order 2 — exactly what `scripts/patch-degree.ts` reads off
    // the construction, arrived at from the other end.
    const { quilt } = boxQuilt();
    const g1 = worstGap(quilt, 1);
    const g2 = worstGap(quilt, 2);
    expect([g1.degU, g1.degV]).toEqual([11, 11]);
    expect([g2.degU, g2.degV]).toEqual([13, 13]);

    // A side with no neighbour has no field, and then that direction stays
    // at the bare blend's own degree. The bidegree is a property of the
    // quilt, not a constant.
    const pair = worstGap(foldedPairQuilt().quilt, 1);
    expect([pair.degU, pair.degV]).toEqual([11, 3]);
  });

  it("keeps the boundary bit for bit, not to a tolerance", () => {
    // The patch edge IS the shared curve. If the net loses that, everything
    // downstream of it — watertightness, G0, the sew — is a tolerance again.
    const { quilt } = curvedPairQuilt();
    const cross = tangentField(quilt, SMOOTH);
    for (const cell of quilt.cells) {
      const b = cellBoundary(cell, quilt, cross);
      const net = cellBezier(b, cross);
      for (let i = 0; i <= 20; i++) {
        const s = i / 20;
        for (const [u, v] of [[s, 0], [1, s], [s, 1], [0, s]] as const) {
          expect(dist3(netAt(net, u, v), boundaryCoonsPoint(b, u, v))).toBeLessThan(1e-9);
        }
      }
      // And the corners, which are shared by reference between four sides.
      for (const [u, v] of [[0, 0], [1, 0], [1, 1], [0, 1]] as const) {
        expect(dist3(netAt(net, u, v), boundaryCoonsPoint(b, u, v))).toBeLessThan(1e-12);
      }
    }
  });

  it("breaks the net where the construction is piecewise, and nowhere else", () => {
    const { quilt } = boxQuilt();
    const cross = tangentField(quilt, SMOOTH);
    const b = cellBoundary(quilt.cells[0]!, quilt, cross);
    const net = cellBezier(b, cross);
    // One-span fields on straight edges, so the only breaks are the two fade
    // bands: in, across, out.
    expect(net.breaksU).toHaveLength(4);
    expect(net.breaksV).toHaveLength(4);
    for (const breaks of [net.breaksU, net.breaksV]) {
      expect(breaks[0]).toBe(0);
      expect(breaks[breaks.length - 1]).toBe(1);
      for (let i = 1; i < breaks.length; i++) {
        expect(breaks[i]!).toBeGreaterThan(breaks[i - 1]!);
      }
    }
  });

  it("survives a T-junction, where a side carries more than one claim", () => {
    // Two claims on one side means two field pieces, two τ normalisations and
    // two sets of knots mapped into the same loop parameter. Nothing in the
    // net may notice.
    for (const make of [splitTopBoxQuilt, nearDuplicateSplitQuilt]) {
      const r = worstGap(make().quilt, 2);
      expect(r.mm).toBeLessThan(1e-9);
    }
  });

  it("refuses a field that is not polynomial rather than inventing a net", () => {
    const { quilt } = foldedPairQuilt();
    const bisector = tangentField(quilt, { ...SMOOTH, polynomial: false });
    const b = cellBoundary(quilt.cells[0]!, quilt, bisector);
    expect(() => cellBezier(b, bisector)).toThrow(NotPolynomial);
  });

  it("reports what the net costs", () => {
    const { quilt } = curvedPairQuilt();
    const cross = tangentField(quilt, { ...SMOOTH, order: 2 });
    const b = cellBoundary(quilt.cells[0]!, quilt, cross);
    const net = cellBezier(b, cross, { order: 2 });
    const tiles = net.tiles.length * net.tiles[0]!.length;
    expect(net.controlPoints).toBe(tiles * (net.degreeU + 1) * (net.degreeV + 1));
    expect(net.controlPoints).toBeGreaterThan(0);
  });
});
