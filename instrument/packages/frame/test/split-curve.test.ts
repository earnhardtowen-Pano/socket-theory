/**
 * A13 · split-curve — one shared curve becomes two.
 *
 * The whole claim is that a split changes BOOKKEEPING and not geometry: every
 * point of every cell boundary must land where it landed before, bit for bit,
 * because a document that moves a car when you rename part of it is not a
 * document. Everything else here is the guard rails — a cell has four sides
 * by statute, so a split under a claim that straddles it is refused and says
 * which cell.
 *
 * Synthetic fixtures only.
 */

import { describe, expect, it } from "vitest";
import { makeAllocator, type Id, type Pt3 } from "@car/schema";
import { evalChain } from "@car/num";
import { FrameState } from "../src/index.js";

const side = { kind: "side" as const };

/** A taped box, and the ids of its four long edges. */
function boxState(): { state: FrameState; alloc: ReturnType<typeof makeAllocator> } {
  const alloc = makeAllocator();
  const state = new FrameState();
  state.createBox(
    { view: side, a: [0, 0], b: [1000, 400], depth: 600, at: -300 },
    alloc,
  );
  return { state, alloc };
}


/** The one edge running the length of the box. */
const longEdge = (state: FrameState): Id =>
  [...state.curves.keys()].find((id) => {
    const c = state.curves.get(id as Id)!;
    const a = evalChain(c.chain, 0), b = evalChain(c.chain, 1);
    return Math.abs(b[0] - a[0]) > 900;
  }) as Id;

/**
 * Cut EVERY cell that touches the long edge, at station x.
 *
 * Cutting one of them is not enough and the refusal says so: the neighbour on
 * the other side of a shared curve still claims across the split. That is the
 * same law the build scripts obey when they hand `tape` all four faces of the
 * ring at once — a cut that stops at one face leaves its neighbours holding a
 * T-junction they were never told about.
 */
function cutRing(state: FrameState, alloc: ReturnType<typeof makeAllocator>, x: number): void {
  const target = longEdge(state);
  const spansX = (c: { sides: readonly { curveId: Id; t0: number; t1: number }[] }): boolean => {
    let lo = Infinity, hi = -Infinity;
    for (const sd of c.sides) {
      const cu = state.curves.get(state.resolveCurve(sd.curveId))!;
      for (const t of [sd.t0, 0.5 * (sd.t0 + sd.t1), sd.t1]) {
        const p = evalChain(cu.chain, t);
        lo = Math.min(lo, p[0]); hi = Math.max(hi, p[0]);
      }
    }
    return lo < x && hi > x;
  };
  const touching = [...state.cells.values()]
    .filter((c) => c.sides.some((sd) => sd.curveId === target) && spansX(c))
    .map((c) => c.id);
  for (const id of touching) {
    state.splitCell(id, { view: side, a: [x, -200], b: [x, 600], lineClass: "tape" }, alloc);
  }
}

/** Every cell boundary point, sampled densely, in a stable order. */
function boundaryPoints(state: FrameState): Pt3[] {
  const out: Pt3[] = [];
  const cells = [...state.cells.keys()].sort();
  for (const id of cells) {
    const cell = state.cells.get(id as Id)!;
    for (const s of cell.sides) {
      const c = state.curves.get(state.resolveCurve(s.curveId))!;
      for (let i = 0; i <= 24; i++) {
        const t = s.t0 + (s.t1 - s.t0) * (i / 24);
        out.push(evalChain(c.chain, t));
      }
    }
  }
  return out;
}

describe("split-curve", () => {
  it("moves no point of the body", () => {
    const { state, alloc } = boxState();
    // Cut the box first so no cell claims across the middle of the edge —
    // which is the legal precondition, and the reason the cut comes first.
    const long = longEdge(state);
    cutRing(state, alloc, 500);

    const before = boundaryPoints(state);
    const [head, tail] = state.splitCurve(long, 0.5, alloc);
    expect(head).toBe(long);
    expect(tail).not.toBe(long);
    const after = boundaryPoints(state);

    expect(after.length).toBe(before.length);
    for (let i = 0; i < before.length; i++) {
      // Bit for bit where the arithmetic is the same, and within a nanometre
      // where a parameter had to be rescaled.
      expect(after[i]![0]).toBeCloseTo(before[i]![0], 9);
      expect(after[i]![1]).toBeCloseTo(before[i]![1], 9);
      expect(after[i]![2]).toBeCloseTo(before[i]![2], 9);
    }
  });

  it("hands the two halves the geometry they had", () => {
    const { state, alloc } = boxState();
    const long = longEdge(state);
    const whole = state.curves.get(long)!.chain;
    const at = [0, 0.25, 0.5, 0.75, 1].map((t) => evalChain(whole, t));

    cutRing(state, alloc, 500);
    const [head, tail] = state.splitCurve(long, 0.5, alloc);
    const h = state.curves.get(head)!.chain, t = state.curves.get(tail)!.chain;

    expect(evalChain(h, 0)).toEqual(at[0]);
    expect(evalChain(t, 1)).toEqual(at[4]);
    // The join: the head's end and the tail's start are the same point.
    const jh = evalChain(h, 1), jt = evalChain(t, 0);
    for (let k = 0; k < 3; k++) expect(jh[k]!).toBeCloseTo(jt[k]!, 9);
    for (let k = 0; k < 3; k++) expect(jh[k]!).toBeCloseTo(at[2]![k]!, 9);
    // Midpoints of the halves are the quarter points of the whole.
    for (let k = 0; k < 3; k++) {
      expect(evalChain(h, 0.5)[k]!).toBeCloseTo(at[1]![k]!, 6);
      expect(evalChain(t, 0.5)[k]!).toBeCloseTo(at[3]![k]!, 6);
    }
  });

  it("refuses a split a cell claims across, and says which cell", () => {
    const { state, alloc } = boxState();
    const long = longEdge(state);
    // No cut: the flank still claims the whole edge.
    expect(() => state.splitCurve(long, 0.5, alloc)).toThrow(/claims .* across/);
    expect(() => state.splitCurve(long, 0.5, alloc)).toThrow(/cell#/);
  });

  it("refuses an end", () => {
    const { state, alloc } = boxState();
    const any = [...state.curves.keys()][0] as Id;
    expect(() => state.splitCurve(any, 0, alloc)).toThrow(/strictly inside/);
    expect(() => state.splitCurve(any, 1, alloc)).toThrow(/strictly inside/);
  });

  it("carries the marks onto both halves", () => {
    const { state, alloc } = boxState();
    const long = longEdge(state);
    state.markCrease(long);
    state.markGap(long);
    cutRing(state, alloc, 500);
    const [head, tail] = state.splitCurve(long, 0.5, alloc);
    // A split is a change of bookkeeping. It must not change what the
    // document SAYS about the geometry, in either direction.
    for (const id of [head, tail]) {
      expect(state.curves.get(id)!.crease).toBe(true);
      expect(state.curves.get(id)!.gap).toBe(true);
    }
  });

  it("leaves every cell with exactly four sides", () => {
    const { state, alloc } = boxState();
    const long = longEdge(state);
    cutRing(state, alloc, 500);
    state.splitCurve(long, 0.5, alloc);
    for (const cell of state.cells.values()) expect(cell.sides).toHaveLength(4);
    // And every side still points at a curve that exists.
    for (const cell of state.cells.values()) {
      for (const s of cell.sides) {
        expect(state.curves.get(state.resolveCurve(s.curveId))).toBeDefined();
        expect(s.t0).toBeGreaterThanOrEqual(0);
        expect(s.t1).toBeLessThanOrEqual(1);
      }
    }
  });

  it("splits again, so a stretch can be isolated between two cuts", () => {
    // The real use: two cuts and a split at each gives a middle curve that
    // one feature owns — an arch mouth, a door top, a screen base.
    const { state, alloc } = boxState();
    const long = longEdge(state);
    for (const x of [350, 650]) cutRing(state, alloc, x);
    const before = boundaryPoints(state);
    const [, first] = state.splitCurve(long, 0.35, alloc);
    const [middle] = state.splitCurve(first, (0.65 - 0.35) / (1 - 0.35), alloc);
    expect(middle).toBe(first);
    const after = boundaryPoints(state);
    expect(after.length).toBe(before.length);
    for (let i = 0; i < before.length; i++) {
      for (let k = 0; k < 3; k++) expect(after[i]![k]!).toBeCloseTo(before[i]![k]!, 8);
    }
    // The middle stretch is now its own curve and can be marked alone.
    state.markGap(middle);
    expect(state.curves.get(middle)!.gap).toBe(true);
    expect(state.curves.get(long)!.gap).toBe(false);
  });
});
