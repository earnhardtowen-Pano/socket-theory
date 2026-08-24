/**
 * Split a shared curve, then MOVE one of the halves — and require the body to
 * stay closed.
 *
 * This is the fixture the wheel arches needed and did not have. Amendment A13
 * splits a long edge so a feature can own part of it; an arch then lifts that
 * part over the wheel. Splitting alone is provably clean — `split-curve.test`
 * samples every boundary point before and after and gets them all back. What
 * was never tested is the step after: does the mesh survive the piece being
 * shaped?
 *
 * On the MX-5 it did not. Splitting the rocker and creasing the arch spans
 * left the print mesh closed with 0 violations and 90 of 90 joins smooth; the
 * moment the arch spans were fitted to a circle — at ANY displacement, five
 * per cent of the arch was enough — 400 edges opened. So the failure is
 * geometric and it is downstream of the split. This is the smallest thing
 * that asks the question.
 */

import { describe, expect, it } from "vitest";
import { makeAllocator, type Id, type Pt3 } from "@car/schema";
import { evalChain } from "@car/num";
import { FrameState } from "@car/frame";
import { closedMeshCheck, meshQuilt } from "../src/index.js";

const side = { kind: "side" as const };

function boxWithCuts(xs: readonly number[]): { state: FrameState; alloc: ReturnType<typeof makeAllocator>; long: Id } {
  const alloc = makeAllocator();
  const state = new FrameState();
  state.createBox({ view: side, a: [0, 0], b: [1200, 400], depth: 600, at: -300 }, alloc);
  const long = [...state.curves.keys()].find((id) => {
    const c = state.curves.get(id as Id)!;
    const a = evalChain(c.chain, 0), b = evalChain(c.chain, 1);
    return Math.abs(b[0] - a[0]) > 1000;
  }) as Id;
  for (const x of xs) {
    const spans = [...state.cells.values()].filter((c) => {
      let lo = Infinity, hi = -Infinity;
      for (const sd of c.sides) {
        const cu = state.curves.get(state.resolveCurve(sd.curveId))!;
        for (const t of [sd.t0, 0.5 * (sd.t0 + sd.t1), sd.t1]) {
          const p = evalChain(cu.chain, t);
          lo = Math.min(lo, p[0]); hi = Math.max(hi, p[0]);
        }
      }
      return lo < x && hi > x;
    }).map((c) => c.id);
    for (const id of spans) {
      state.splitCell(id, { view: side, a: [x, -200], b: [x, 600], lineClass: "tape" }, alloc);
    }
  }
  return { state, alloc, long };
}

const closedCount = (state: FrameState): number =>
  closedMeshCheck(meshQuilt(state.quilt(), { baseDensity: 10, cross: null })).violations.length;

const ctrl = (state: FrameState, id: Id): [Pt3, Pt3, Pt3, Pt3] => {
  const seg = state.curves.get(state.resolveCurve(id))!.chain.segs[0]!;
  return [seg.p0, seg.p1, seg.p2, seg.p3];
};
const moveCtrl = (state: FrameState, id: Id, idx: 0 | 1 | 2 | 3, d: Pt3): void => {
  state.pushPull({ kind: "ctrl", id, seg: 0, idx }, d);
};

describe("moving a split piece", () => {
  it("is closed before anything is split", () => {
    const { state } = boxWithCuts([400, 800]);
    expect(closedCount(state)).toBe(0);
  });

  it("is closed after the split, which is what A13 already promises", () => {
    const { state, alloc, long } = boxWithCuts([400, 800]);
    state.splitCurve(long, 400 / 1200, alloc);
    expect(closedCount(state)).toBe(0);
  });

  // ── the defect these three record ──────────────────────────────────────
  // Shaping a shared curve AFTER its cells have been cut opens the print mesh.
  // It is not about splitting: the last case here moves an interior control
  // point of the UNSPLIT edge and opens 168 edges. It is a threshold, not a
  // slope — 1e-9 mm is clean and 1e-4 mm is not, which puts it at
  // COINCIDENT_EPS — and the openings are along the CUT curve, not along the
  // curve that moved.
  //
  // No build has ever hit it because none has shaped a master line after
  // cutting it: the P1 shapes its rockers and beltlines before any station
  // cut exists, shapes station curves that are themselves never cut, and fits
  // wheel arcs on a fresh box. A wheel arch is the first thing that needs it.
  //
  // `it.fails` rather than a comment, so the day someone fixes the mesher this
  // goes red and says so.
  it.fails("stays closed when the middle piece is lifted", () => {
    const { state, alloc, long } = boxWithCuts([400, 800]);
    const [, tail] = state.splitCurve(long, 400 / 1200, alloc);
    // The middle piece runs 400 to 800; split the tail again to isolate it.
    const [middle] = state.splitCurve(tail, (800 - 400) / (1200 - 400), alloc);
    const before = ctrl(state, middle);
    // Interior points only — no junction moves at all.
    moveCtrl(state, middle, 1, [0, 0, 40]);
    moveCtrl(state, middle, 2, [0, 0, 40]);
    expect(ctrl(state, middle)[1]![2]).toBeCloseTo(before[1]![2]! + 40, 9);
    expect(closedCount(state)).toBe(0);
  });

  it.fails("stays closed when the middle piece's ENDS are lifted too", () => {
    const { state, alloc, long } = boxWithCuts([400, 800]);
    const [, tail] = state.splitCurve(long, 400 / 1200, alloc);
    const [middle] = state.splitCurve(tail, (800 - 400) / (1200 - 400), alloc);
    for (const idx of [0, 1, 2, 3] as const) moveCtrl(state, middle, idx, [0, 0, 60]);
    expect(closedCount(state)).toBe(0);
  });

  it.fails("stays closed when the piece is fitted to an arc, which is the arch", () => {
    const { state, alloc, long } = boxWithCuts([400, 800]);
    const [, tail] = state.splitCurve(long, 400 / 1200, alloc);
    const [middle] = state.splitCurve(tail, (800 - 400) / (1200 - 400), alloc);
    const [p0, , , p3] = ctrl(state, middle);
    // A crown 150 mm above the chord, set through the interior points only.
    const lift: Pt3 = [0, 0, 200];
    moveCtrl(state, middle, 1, lift);
    moveCtrl(state, middle, 2, lift);
    const after = ctrl(state, middle);
    expect(after[0]).toEqual(p0);
    expect(after[3]).toEqual(p3);
    expect(closedCount(state)).toBe(0);
  });

  it.fails("stays closed when an UNSPLIT shared curve is shaped after cutting", () => {
    // The control: no split anywhere. This is what proves the defect is the
    // mesher's and not A13's.
    const { state, long } = boxWithCuts([400, 800]);
    moveCtrl(state, long, 1, [0, 0, 40]);
    expect(closedCount(state)).toBe(0);
  });
});
