/**
 * The cross-boundary tangent field — its laws, stated as tests.
 *
 * The whole reason this layer is safe to add to a watertight quilt is a set
 * of exactness claims, not tolerances: Φ is zero on every edge, its
 * along-edge derivative is zero on every edge but its own, and the tangent
 * plane the two neighbours end up sharing is the SAME plane rather than two
 * planes that agree to a tolerance. Each of those is checked here.
 */

import { describe, expect, it } from "vitest";
import type { Id, Pt3, QuiltSpec } from "@car/schema";
import { cross3, dist3, dot3, len3, natan2 } from "@car/num";
import {
  boundaryCoonsNormal,
  boundaryCoonsPoint,
  cellBoundary,
  continuityProbe,
  quiltAdjacency,
  sideParamOf,
  tangentField,
  uvOnSide,
  DEFAULT_CREASE_ANGLE,
} from "@car/surface";
import { boxQuilt, curvedPairQuilt, foldedPairQuilt, pyramidQuilt, splitTopBoxQuilt } from "../../mesh/test/fixtures.js";

/** Every join in a box turns 90°; raise the bar so the field engages at all. */
const SMOOTH_EVERYTHING = { breakAngleDeg: 179 } as const;

const cellOf = (quilt: QuiltSpec, id: Id) => {
  const c = quilt.cells.find((x) => x.id === id);
  if (!c) throw new Error(`no cell ${id}`);
  return c;
};

const angleDeg = (a: Pt3, b: Pt3): number =>
  (natan2(len3(cross3(a, b)), dot3(a, b)) * 180) / Math.PI;

describe("tangent field: what it must never move", () => {
  it("leaves every boundary point bit-identical — Φ is exactly zero on the edges", () => {
    const { quilt } = curvedPairQuilt();
    const field = tangentField(quilt, SMOOTH_EVERYTHING);
    for (const cell of quilt.cells) {
      const plain = cellBoundary(cell, quilt);
      const fixed = cellBoundary(cell, quilt, field);
      for (let i = 0; i <= 12; i++) {
        const s = i / 12;
        for (const [u, v] of [[s, 0], [1, s], [s, 1], [0, s]] as const) {
          expect(boundaryCoonsPoint(fixed, u, v)).toEqual(boundaryCoonsPoint(plain, u, v));
        }
      }
    }
  });

  it("leaves a creased curve alone", () => {
    const { quilt, curve } = curvedPairQuilt();
    const creased: QuiltSpec = { ...quilt, creases: new Set<Id>([curve.get("S")!]) };
    const field = tangentField(creased, SMOOTH_EVERYTHING);
    expect(field.stats.edges).toBe(0);
    expect(field.stats.creasedEdges).toBeGreaterThan(0);
    for (const cell of creased.cells) {
      for (let k = 0; k < 4; k++) {
        expect(len3(field.defect(cell.id, k, 0.5))).toBe(0);
      }
    }
  });

  it("leaves a break sharper than the crease angle alone — a box stays a box", () => {
    const { quilt } = boxQuilt();
    const field = tangentField(quilt);   // default break angle
    expect(field.stats.breakAngleDeg).toBe(DEFAULT_CREASE_ANGLE);
    expect(field.stats.edges).toBe(0);
    expect(field.stats.sharpEdges).toBeGreaterThan(0);
    for (const cell of quilt.cells) {
      const plain = cellBoundary(cell, quilt);
      const fixed = cellBoundary(cell, quilt, field);
      expect(dist3(boundaryCoonsPoint(fixed, 0.5, 0.5), boundaryCoonsPoint(plain, 0.5, 0.5))).toBe(0);
    }
  });
});

describe("tangent field: the corner window", () => {
  it("vanishes to first order at both ends of every side", () => {
    const { quilt } = curvedPairQuilt();
    const field = tangentField(quilt, SMOOTH_EVERYTHING);
    for (const cell of quilt.cells) {
      for (let k = 0; k < 4; k++) {
        expect(len3(field.defect(cell.id, k, 0))).toBe(0);
        expect(len3(field.defect(cell.id, k, 1))).toBe(0);
        expect(len3(field.defectDeriv(cell.id, k, 0))).toBe(0);
        expect(len3(field.defectDeriv(cell.id, k, 1))).toBe(0);
      }
    }
  });

  it("is at full strength across the interior, so the raw ask survives there", () => {
    const { quilt } = curvedPairQuilt();
    const field = tangentField(quilt, { ...SMOOTH_EVERYTHING, cornerFade: 0.12 });
    const cell = quilt.cells[0]!;
    for (const s of [0.2, 0.5, 0.8]) {
      const windowed = field.defect(cell.id, 0, s);
      const raw = field.rawDefect(cell.id, 0, s);
      expect(dist3(windowed, raw)).toBeLessThan(1e-12);
    }
  });
});

describe("tangent field: what it buys", () => {
  it("makes two neighbours share ONE tangent plane, not two that nearly agree", () => {
    const { quilt } = foldedPairQuilt();
    const field = tangentField(quilt, SMOOTH_EVERYTHING);
    const adj = quiltAdjacency(quilt);
    const edge = adj.edges[0]!;
    const bA = cellBoundary(cellOf(quilt, edge.a.cellId), quilt, field);
    const bB = cellBoundary(cellOf(quilt, edge.b.cellId), quilt, field);
    let checked = 0;
    for (const f of [0.3, 0.4, 0.5, 0.6, 0.7]) {
      const t = edge.lo + (edge.hi - edge.lo) * f;
      const [ua, va] = uvOnSide(edge.a.k, sideParamOf(bA.sides[edge.a.k]!, t));
      const [ub, vb] = uvOnSide(edge.b.k, sideParamOf(bB.sides[edge.b.k]!, t));
      // Not "small": zero. The two patches are handed the same direction, so
      // their tangent planes are the same object, not two close ones.
      expect(angleDeg(boundaryCoonsNormal(bA, ua, va), boundaryCoonsNormal(bB, ub, vb)))
        .toBeLessThan(1e-10);
      checked++;
    }
    expect(checked).toBe(5);
  });

  it("collapses the measured defect on a folded pair", () => {
    const { quilt } = foldedPairQuilt();
    const before = continuityProbe(quilt, { breakAngleDeg: 179 });
    const after = continuityProbe(quilt, {
      breakAngleDeg: 179,
      cross: tangentField(quilt, SMOOTH_EVERYTHING),
    });
    expect(before.joins).toBe(after.joins);
    expect(before.medianDeg).toBeGreaterThan(1);
    expect(after.medianDeg).toBeLessThan(1e-10);
  });

  it("survives a T-junction, where the two sides span the curve differently", () => {
    const { quilt } = splitTopBoxQuilt();
    const field = tangentField(quilt, SMOOTH_EVERYTHING);
    expect(field.stats.edges).toBeGreaterThan(0);
    expect(field.stats.ambiguous).toBe(0);
    for (const cell of quilt.cells) {
      for (let k = 0; k < 4; k++) {
        for (const s of [0.25, 0.5, 0.75]) {
          expect(Number.isFinite(len3(field.defect(cell.id, k, s)))).toBe(true);
        }
      }
    }
  });

  it("produces no NaN on a collapsed (tapered) side", () => {
    const { quilt } = pyramidQuilt();
    const field = tangentField(quilt, SMOOTH_EVERYTHING);
    for (const cell of quilt.cells) {
      for (let k = 0; k < 4; k++) {
        for (const s of [0.1, 0.5, 0.9]) {
          const d = field.defect(cell.id, k, s);
          expect(Number.isFinite(d[0] + d[1] + d[2])).toBe(true);
          const p = boundaryCoonsPoint(cellBoundary(cell, quilt, field), 0.5, s);
          expect(Number.isFinite(p[0] + p[1] + p[2])).toBe(true);
        }
      }
    }
  });
});

describe("tangent field: determinism", () => {
  it("two builds of the same quilt give identical corrections", () => {
    const { quilt } = curvedPairQuilt();
    const a = tangentField(quilt, SMOOTH_EVERYTHING);
    const b = tangentField(quilt, SMOOTH_EVERYTHING);
    for (const cell of quilt.cells) {
      for (let k = 0; k < 4; k++) {
        for (let i = 0; i <= 8; i++) {
          expect(a.defect(cell.id, k, i / 8)).toEqual(b.defect(cell.id, k, i / 8));
          expect(a.defectDeriv(cell.id, k, i / 8)).toEqual(b.defectDeriv(cell.id, k, i / 8));
        }
      }
    }
  });
});
