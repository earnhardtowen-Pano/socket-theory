/**
 * Hand-built QuiltSpec fixtures. No @car/surface, no @car/frame — the quilts
 * here are authored directly against the frozen seam: welded shared curves,
 * loop-ordered sides, CCW seen from outside, end of side k = start of side k+1.
 */

import type { CurveChain, Id, Pt3, QuiltCell, QuiltSide, QuiltSpec } from "@car/schema";
import { makeAllocator } from "@car/schema";
import { chainOf, lineChain } from "@car/num";

export const side = (curveId: Id, t0: number, t1: number, reversed: boolean): QuiltSide => ({
  curveId, t0, t1, reversed,
});

export interface Fixture {
  readonly quilt: QuiltSpec;
  /** curve id by fixture-local key (e.g. "4-5" for a box edge, "M", "apex"). */
  readonly curve: ReadonlyMap<string, Id>;
  /** cell id by fixture-local face name. */
  readonly cell: ReadonlyMap<string, Id>;
}

class Builder {
  private readonly alloc = makeAllocator();
  readonly curves = new Map<Id, CurveChain>();
  readonly cells: QuiltCell[] = [];
  readonly curveKey = new Map<string, Id>();
  readonly cellKey = new Map<string, Id>();

  addCurve(key: string, chain: CurveChain): Id {
    const id = this.alloc.next("curve");
    this.curves.set(id, chain);
    this.curveKey.set(key, id);
    return id;
  }
  c(key: string): Id {
    const id = this.curveKey.get(key);
    if (!id) throw new Error(`fixture curve ${key} missing`);
    return id;
  }
  addCell(key: string, sides: readonly [QuiltSide, QuiltSide, QuiltSide, QuiltSide]): Id {
    const id = this.alloc.next("cell");
    this.cells.push({ id, sides });
    this.cellKey.set(key, id);
    return id;
  }
  done(): Fixture {
    return {
      quilt: {
        cells: this.cells,
        curves: this.curves,
        creases: new Set<Id>(),
        gaps: new Set<Id>(),
      },
      curve: this.curveKey,
      cell: this.cellKey,
    };
  }
}

/** Box corner i = bx + 2*by + 4*bz, scaled to size s. */
const boxCorner = (i: number, s: number): Pt3 => [(i & 1) * s, ((i >> 1) & 1) * s, ((i >> 2) & 1) * s];

/** The 12 box edges, keyed "a-b" with a < b, chain stored a → b. */
const BOX_EDGES: readonly [number, number][] = [
  [0, 1], [2, 3], [4, 5], [6, 7],
  [0, 2], [1, 3], [4, 6], [5, 7],
  [0, 4], [1, 5], [2, 6], [3, 7],
];

/** Face loops, corner indices, CCW seen from outside the box. */
const BOX_FACES: readonly [string, readonly [number, number, number, number]][] = [
  ["bottom", [0, 2, 3, 1]],
  ["top", [4, 5, 7, 6]],
  ["y0", [0, 1, 5, 4]],
  ["y1", [2, 6, 7, 3]],
  ["x0", [0, 4, 6, 2]],
  ["x1", [1, 3, 7, 5]],
];

function addBoxEdges(b: Builder, s: number): void {
  for (const [p, q] of BOX_EDGES) {
    b.addCurve(`${p}-${q}`, lineChain(boxCorner(p, s), boxCorner(q, s)));
  }
}

/** A whole-trim side along box edge from corner `from` to corner `to`. */
function edgeSide(b: Builder, from: number, to: number): QuiltSide {
  const key = from < to ? `${from}-${to}` : `${to}-${from}`;
  return side(b.c(key), 0, 1, from > to);
}

function loopSides(b: Builder, loop: readonly [number, number, number, number]):
  [QuiltSide, QuiltSide, QuiltSide, QuiltSide] {
  return [
    edgeSide(b, loop[0], loop[1]),
    edgeSide(b, loop[1], loop[2]),
    edgeSide(b, loop[2], loop[3]),
    edgeSide(b, loop[3], loop[0]),
  ];
}

/** Six-cell welded box quilt — the G1 watertight fixture. */
export function boxQuilt(s = 100): Fixture {
  const b = new Builder();
  addBoxEdges(b, s);
  for (const [name, loop] of BOX_FACES) b.addCell(name, loopSides(b, loop));
  return b.done();
}

/**
 * The same box with the top face split at x = s/2 into topA (x <= s/2) and
 * topB. Curves 4-5 and 6-7 now carry trim endpoints at 0.5 while the y0 and
 * y1 faces keep whole trims over them — the T-junction fixture.
 */
export function splitTopBoxQuilt(s = 100): Fixture {
  const b = new Builder();
  addBoxEdges(b, s);
  b.addCurve("M", lineChain([s / 2, 0, s], [s / 2, s, s]));
  for (const [name, loop] of BOX_FACES) {
    if (name === "top") continue;
    b.addCell(name, loopSides(b, loop));
  }
  // topA loop: (0,0,s) -> (s/2,0,s) -> (s/2,s,s) -> (0,s,s), CCW from +Z
  b.addCell("topA", [
    side(b.c("4-5"), 0, 0.5, false),
    side(b.c("M"), 0, 1, false),
    side(b.c("6-7"), 0, 0.5, true),
    side(b.c("4-6"), 0, 1, true),
  ]);
  // topB loop: (s/2,0,s) -> (s,0,s) -> (s,s,s) -> (s/2,s,s)
  b.addCell("topB", [
    side(b.c("4-5"), 0.5, 1, false),
    side(b.c("5-7"), 0, 1, false),
    side(b.c("6-7"), 0.5, 1, true),
    side(b.c("M"), 0, 1, true),
  ]);
  return b.done();
}

/**
 * Square pyramid = the box with its top collapsed to an apex: base cell plus
 * four tapered cells whose fourth side is one shared point-curve at the apex.
 */
export function pyramidQuilt(s = 100, h = 80): Fixture {
  const b = new Builder();
  const apex: Pt3 = [s / 2, s / 2, h];
  const base: readonly [number, number][] = [[0, 1], [0, 2], [1, 3], [2, 3]];
  for (const [p, q] of base) {
    b.addCurve(`${p}-${q}`, lineChain(boxCorner(p, s), boxCorner(q, s)));
  }
  for (const i of [0, 1, 2, 3]) {
    b.addCurve(`${i}-a`, lineChain(boxCorner(i, s), apex));
  }
  b.addCurve("apex", lineChain(apex, apex));
  b.addCell("base", loopSides(b, [0, 2, 3, 1]));
  const slant = (key: string): Id => b.c(key);
  const apexSide = side(b.c("apex"), 0, 1, false);
  // each loop: base edge in the direction opposite the base cell, up, apex, down
  b.addCell("y0", [
    side(b.c("0-1"), 0, 1, false), side(slant("1-a"), 0, 1, false),
    apexSide, side(slant("0-a"), 0, 1, true),
  ]);
  b.addCell("x1", [
    side(b.c("1-3"), 0, 1, false), side(slant("3-a"), 0, 1, false),
    apexSide, side(slant("1-a"), 0, 1, true),
  ]);
  b.addCell("y1", [
    side(b.c("2-3"), 0, 1, true), side(slant("2-a"), 0, 1, false),
    apexSide, side(slant("3-a"), 0, 1, true),
  ]);
  b.addCell("x0", [
    side(b.c("0-2"), 0, 1, true), side(slant("0-a"), 0, 1, false),
    apexSide, side(slant("2-a"), 0, 1, true),
  ]);
  return b.done();
}

/**
 * Two flat cells welded along one arc-ish cubic S — open sheet, used to assert
 * both cells consume identical vertex indices along the shared curve.
 */
export function curvedPairQuilt(): Fixture {
  const b = new Builder();
  const A: Pt3 = [0, 0, 0];
  const B: Pt3 = [100, 0, 0];
  b.addCurve("S", chainOf({ p0: A, p1: [25, 30, 0], p2: [75, 30, 0], p3: B }));
  b.addCurve("upper-e", lineChain(B, [100, 100, 0]));
  b.addCurve("upper-n", lineChain([100, 100, 0], [0, 100, 0]));
  b.addCurve("upper-w", lineChain([0, 100, 0], A));
  b.addCurve("lower-s", lineChain([0, -100, 0], [100, -100, 0]));
  b.addCurve("lower-e", lineChain([100, -100, 0], B));
  b.addCurve("lower-w", lineChain(A, [0, -100, 0]));
  b.addCell("upper", [
    side(b.c("S"), 0, 1, false), side(b.c("upper-e"), 0, 1, false),
    side(b.c("upper-n"), 0, 1, false), side(b.c("upper-w"), 0, 1, false),
  ]);
  b.addCell("lower", [
    side(b.c("lower-s"), 0, 1, false), side(b.c("lower-e"), 0, 1, false),
    side(b.c("S"), 0, 1, true), side(b.c("lower-w"), 0, 1, false),
  ]);
  return b.done();
}

/** Vertex indices referenced by one cell's triangle range. */
export function rangeVertexSet(
  indices: Uint32Array,
  range: { start: number; count: number },
): Set<number> {
  const out = new Set<number>();
  for (let i = range.start; i < range.start + range.count; i++) out.add(indices[i]!);
  return out;
}
