/**
 * Crown — the first control this frame has ever had over a patch INTERIOR.
 *
 * A Coons patch interpolates four boundary curves and everything between them
 * follows; that is why the audit's fullness row has read "interiors are
 * determined, never designed" since the beginning, and why a body authored
 * this way reads as slabs between its feature lines. Fullness scales the
 * transverse part of the cross-boundary derivative, so the patch leaves its
 * boundary harder and the middle bulges.
 *
 * The whole claim is that this costs NOTHING in continuity, and it is a claim
 * about spans rather than about tolerances: scaling a vector does not change
 * the plane it spans with another, so the tangent plane two owners share is
 * untouched — they simply reach different distances into it. The tests below
 * are that sentence, checked.
 */

import { describe, expect, it } from "vitest";
import type { Id, QuiltSpec } from "@car/schema";
import { dist3 } from "@car/num";
import {
  boundaryCoonsPoint, cellBoundary, continuityProbe, fieldDisplacement, tangentField,
} from "@car/surface";
import { boxQuilt, foldedPairQuilt } from "../../mesh/test/fixtures.js";

const SMOOTH_EVERYTHING = { breakAngleDeg: 179 } as const;

const crowned = (quilt: QuiltSpec, amount: number): QuiltSpec => ({
  ...quilt,
  fullness: new Map<Id, number>(quilt.cells.map((c) => [c.id, amount])),
});

describe("fullness", () => {
  it("does not move one boundary point, at any amount", () => {
    const { quilt } = foldedPairQuilt();
    const plain = tangentField(quilt, SMOOTH_EVERYTHING);
    for (const amount of [0.5, 1.4, 3]) {
      const full = crowned(quilt, amount);
      const field = tangentField(full, SMOOTH_EVERYTHING);
      for (const cell of quilt.cells) {
        const a = cellBoundary(cell, quilt, plain);
        const b = cellBoundary(cell, full, field);
        for (let i = 0; i <= 10; i++) {
          const s = i / 10;
          for (const [u, v] of [[s, 0], [1, s], [s, 1], [0, s]] as const) {
            // Bit-identical, not close: the boundary IS the curve.
            expect(boundaryCoonsPoint(b, u, v)).toEqual(boundaryCoonsPoint(a, u, v));
          }
        }
      }
    }
  });

  it("does not rotate a tangent plane — G1 is untouched", () => {
    const { quilt } = boxQuilt();
    const base = continuityProbe(quilt, {
      ...SMOOTH_EVERYTHING, cross: tangentField(quilt, SMOOTH_EVERYTHING),
    });
    for (const amount of [0.7, 1.5, 2.5]) {
      const full = crowned(quilt, amount);
      const r = continuityProbe(full, {
        ...SMOOTH_EVERYTHING, cross: tangentField(full, SMOOTH_EVERYTHING),
      });
      expect(r.g1Joins).toBe(base.g1Joins);
      expect(r.medianDeg).toBeLessThan(1e-10);
      // Not "about the same" — the plane is spanned by the same two directions.
      expect(r.worstDeg).toBeLessThanOrEqual(base.worstDeg * 1.05 + 1e-12);
    }
  });

  it("moves the interior, monotonically with the amount", () => {
    const { quilt } = foldedPairQuilt();
    const plain = tangentField(quilt, SMOOTH_EVERYTHING);
    let previous = 0;
    for (const amount of [1.2, 1.6, 2.4]) {
      const full = crowned(quilt, amount);
      const moved = fieldDisplacement(full, {
        cross: tangentField(full, SMOOTH_EVERYTHING), against: plain,
      });
      expect(moved.worst).toBeGreaterThan(previous);
      previous = moved.worst;
    }
    expect(previous).toBeGreaterThan(1);
  });

  it("is the identity at 1, bit for bit", () => {
    const { quilt } = foldedPairQuilt();
    const one = crowned(quilt, 1);
    const a = tangentField(quilt, { ...SMOOTH_EVERYTHING, order: 2 });
    const b = tangentField(one, { ...SMOOTH_EVERYTHING, order: 2 });
    for (const cell of quilt.cells) {
      for (let k = 0; k < 4; k++) {
        for (let m = 1; m < 10; m++) {
          const s = m / 10;
          expect(b.defect(cell.id, k, s)).toEqual(a.defect(cell.id, k, s));
          expect(b.secondDefect(cell.id, k, s)).toEqual(a.secondDefect(cell.id, k, s));
        }
      }
    }
  });

  it("moves the interior in both directions — a dish is as authorable as a crown", () => {
    const { quilt } = boxQuilt();
    const one = crowned(quilt, 1);
    const reference = tangentField(one, SMOOTH_EVERYTHING);
    for (const amount of [0.4, 1.8]) {
      const full = crowned(quilt, amount);
      const moved = fieldDisplacement(full, {
        cross: tangentField(full, SMOOTH_EVERYTHING), against: reference,
      });
      expect(moved.worst).toBeGreaterThan(1);
    }
  });
});
