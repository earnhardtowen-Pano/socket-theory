import { describe, expect, it } from "vitest";
import type { LineSpec } from "@car/schema";
import { FrameState } from "@car/frame";
import { cellSides, freshBox, loopClosed, sidePoint, stateChain } from "./util.js";

const vline = (x: number): LineSpec => ({
  view: { kind: "side" },
  a: [x, -10],
  b: [x, 90],
  lineClass: "tape",
});

/** Split the +Y face (cell#3) of the standard box at x=40. */
function splitBox() {
  const { state, alloc } = freshBox();
  const result = state.splitCell("cell#3", vline(40), alloc);
  return { state, alloc, result };
}

describe("splitCell", () => {
  it("replaces the parent with two children and resolves parent -> children", () => {
    const { state, result } = splitBox();
    expect(result.children).toEqual(["cell#6", "cell#7"]);
    expect(state.cells.has("cell#3")).toBe(false);
    expect(state.cells.has("cell#6")).toBe(true);
    expect(state.cells.has("cell#7")).toBe(true);
    expect(state.resolveCell("cell#3")).toEqual(["cell#6", "cell#7"]);
    expect(state.cells.get("cell#6")?.parent).toBe("cell#3");
    expect(state.cells.get("cell#7")?.parent).toBe("cell#3");
  });

  it("nested splits resolve transitively", () => {
    const { state, alloc } = splitBox();
    state.splitCell("cell#6", vline(70), alloc);
    expect(state.resolveCell("cell#3")).toEqual(["cell#8", "cell#9", "cell#7"]);
  });

  it("the interior curve is ONE object shared by both children (2 trims)", () => {
    const { state, result } = splitBox();
    const interior = state.curves.get(result.interiorCurveId);
    expect(interior).toBeDefined();
    expect(interior?.trims.map((t) => t.cellId).sort()).toEqual(["cell#6", "cell#7"]);
    // both trims cover the whole curve, opposite directions
    expect(interior?.trims.every((t) => t.t0 === 0 && t.t1 === 1)).toBe(true);
    expect(new Set(interior?.trims.map((t) => t.reversed)).size).toBe(2);
  });

  it("T-junction: crossed curves get subdivided child trims, the neighbor trim stays whole", () => {
    const { state } = splitBox();
    // curve#3 (top edge of the +Y face) is also owned by cell#5 (+Z face)
    const top = state.curves.get("curve#3");
    expect(top?.trims.length).toBe(3);
    const byCell = new Map(top?.trims.map((t) => [t.cellId, t]));
    const whole = byCell.get("cell#5");
    expect(whole?.t0).toBe(0);
    expect(whole?.t1).toBe(1);
    const a = byCell.get("cell#6");
    const b = byCell.get("cell#7");
    // crossing at x=40 on a 0..100 edge -> curve param 0.4
    expect(a?.t0).toBeCloseTo(0.4, 6);
    expect(a?.t1).toBe(1);
    expect(b?.t0).toBe(0);
    expect(b?.t1).toBeCloseTo(0.4, 6);
    // the bottom crossed curve (curve#2) likewise keeps cell#4's whole trim
    const bottom = state.curves.get("curve#2");
    expect(bottom?.trims.length).toBe(3);
    const bottomWhole = bottom?.trims.find((t) => t.cellId === "cell#4");
    expect(bottomWhole?.t0).toBe(0);
    expect(bottomWhole?.t1).toBe(1);
  });

  it("NEIGHBOR cells are not split", () => {
    const { state } = splitBox();
    for (const id of ["cell#0", "cell#1", "cell#2", "cell#4", "cell#5"] as const) {
      expect(state.cells.has(id)).toBe(true);
      expect(state.resolveCell(id)).toEqual([id]);
    }
  });

  it("children carry closed CCW loops and inherit mirror mode", () => {
    const { state } = splitBox();
    const chainOf = stateChain(state);
    expect(loopClosed(chainOf, cellSides(state, "cell#6"))).toBe(true);
    expect(loopClosed(chainOf, cellSides(state, "cell#7"))).toBe(true);
    expect(state.cells.get("cell#6")?.mirror).toBe("auto");
    // split vertices sit at the crossing points
    const va = state.vertices.get("vertex#8");
    const vc = state.vertices.get("vertex#9");
    expect(va?.at[0]).toBeCloseTo(40, 9);
    expect(va?.at[1]).toBe(60);
    expect(va?.at[2]).toBe(80);
    expect(vc?.at[0]).toBeCloseTo(40, 9);
    expect(vc?.at[2]).toBe(0);
  });

  it("children partition the parent geometry at the tape line", () => {
    const { state } = splitBox();
    const chainOf = stateChain(state);
    for (const [cellId, xLo, xHi] of [["cell#6", 40, 100], ["cell#7", 0, 40]] as const) {
      for (const side of cellSides(state, cellId)) {
        for (const u of [0, 0.5, 1]) {
          const p = sidePoint(chainOf, side, u);
          expect(p[0]).toBeGreaterThanOrEqual(xLo - 1e-9);
          expect(p[0]).toBeLessThanOrEqual(xHi + 1e-9);
        }
      }
    }
  });

  it("throws on a corner crossing, an adjacent-side crossing, and a miss", () => {
    const box1 = freshBox();
    expect(() => box1.state.splitCell("cell#3", vline(0), box1.alloc)).toThrow(/corner/);
    const box2 = freshBox();
    const diagonal: LineSpec = {
      view: { kind: "side" },
      a: [-10, 40],
      b: [50, 90],
      lineClass: "tape",
    };
    expect(() => box2.state.splitCell("cell#3", diagonal, box2.alloc)).toThrow(/opposite/);
    const box3 = freshBox();
    expect(() => box3.state.splitCell("cell#3", vline(500), box3.alloc)).toThrow(/exactly two/);
  });

  it("sketch lines never split", () => {
    const { state, alloc } = freshBox();
    const sketch: LineSpec = { view: { kind: "side" }, a: [40, -10], b: [40, 90], lineClass: "sketch" };
    expect(() => state.splitCell("cell#3", sketch, alloc)).toThrow(/sketch/);
    expect(state.cells.size).toBe(6);
  });
});

describe("persistent naming through splits", () => {
  it("unknown cells throw", () => {
    const state = new FrameState();
    expect(() => state.resolveCell("cell#0")).toThrow(/unknown cell/);
  });
});
