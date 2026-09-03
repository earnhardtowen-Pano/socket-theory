import { describe, expect, it } from "vitest";
import { makeAllocator, type RectSpec } from "@car/schema";
import { chainEnd, chainStart, cross3, dot3, evalChain, sub3 } from "@car/num";
import { FrameState, samePt, viewToWorld, worldToView, viewNormal } from "@car/frame";

const rect = (over: Partial<RectSpec> = {}): RectSpec => ({
  view: { kind: "side" },
  a: [0, 0],
  b: [100, 80],
  depth: 60,
  at: 0,
  ...over,
});

function box(over: Partial<RectSpec> = {}) {
  const state = new FrameState();
  const alloc = makeAllocator();
  const result = state.createBox(rect(over), alloc);
  return { state, alloc, result };
}

describe("view mapping (fixed law)", () => {
  it("side: x->X, y->Z, normal +Y", () => {
    expect(viewToWorld({ kind: "side" }, [3, 7], 5)).toEqual([3, 5, 7]);
    expect(viewNormal({ kind: "side" })).toEqual([0, 1, 0]);
    expect(worldToView({ kind: "side" }, [3, 5, 7])).toEqual([3, 7]);
  });
  it("plan: x->X, y->Y, normal +Z", () => {
    expect(viewToWorld({ kind: "plan" }, [3, 7], 5)).toEqual([3, 7, 5]);
    expect(viewNormal({ kind: "plan" })).toEqual([0, 0, 1]);
  });
  it("front: x->Y, y->Z, normal +X", () => {
    expect(viewToWorld({ kind: "front" }, [3, 7], 5)).toEqual([5, 3, 7]);
    expect(viewNormal({ kind: "front" })).toEqual([1, 0, 0]);
  });
  it("section maps like front from its station", () => {
    expect(viewToWorld({ kind: "section", stationX: 100 }, [3, 7], 5)).toEqual([105, 3, 7]);
  });
});

describe("createBox", () => {
  it("creates 6 cells, 12 curves, 8 vertices, every curve exactly 2 trims", () => {
    const { state } = box();
    expect(state.cells.size).toBe(6);
    expect(state.curves.size).toBe(12);
    expect(state.vertices.size).toBe(8);
    for (const curve of state.curves.values()) {
      expect(curve.trims.length).toBe(2);
    }
  });

  it("near face at rect.at, far face at rect.at + depth along the view normal", () => {
    const { state } = box({ at: 10, depth: 60 });
    // side view normal is +Y: all geometry spans Y in [10, 70]
    let yMin = Infinity;
    let yMax = -Infinity;
    for (const v of state.vertices.values()) {
      yMin = Math.min(yMin, v.at[1]);
      yMax = Math.max(yMax, v.at[1]);
    }
    expect(yMin).toBe(10);
    expect(yMax).toBe(70);
  });

  it("loop law: end of side k coincides with start of side k+1", () => {
    const { state } = box();
    for (const cell of state.cells.values()) {
      for (let k = 0; k < 4; k++) {
        const a = cell.sides[k];
        const b = cell.sides[(k + 1) % 4];
        if (!a || !b) throw new Error("missing side");
        const chainA = state.curves.get(a.curveId)?.chain;
        const chainB = state.curves.get(b.curveId)?.chain;
        if (!chainA || !chainB) throw new Error("missing curve");
        const endA = evalChain(chainA, a.reversed ? a.t0 : a.t1);
        const startB = evalChain(chainB, b.reversed ? b.t1 : b.t0);
        expect(samePt(endA, startB)).toBe(true);
      }
    }
  });

  it("loops run counter-clockwise seen from outside", () => {
    const { state } = box();
    const center: [number, number, number] = [50, 30, 40];
    for (const cell of state.cells.values()) {
      const corners = cell.sides.map((s) => {
        const chain = state.curves.get(s.curveId)?.chain;
        if (!chain) throw new Error("missing curve");
        return evalChain(chain, s.reversed ? s.t1 : s.t0);
      });
      const [c0, c1, c2] = corners;
      if (!c0 || !c1 || !c2) throw new Error("missing corner");
      const n = cross3(sub3(c1, c0), sub3(c2, c1));
      const outward = sub3(c0, center);
      expect(dot3(n, outward)).toBeGreaterThan(0);
    }
  });

  it("box edges are straight lines between their vertices", () => {
    const { state } = box();
    for (const curve of state.curves.values()) {
      const s = chainStart(curve.chain);
      const e = chainEnd(curve.chain);
      const mid = evalChain(curve.chain, 0.5);
      expect(mid[0]).toBeCloseTo((s[0] + e[0]) / 2, 9);
      expect(mid[1]).toBeCloseTo((s[1] + e[1]) / 2, 9);
      expect(mid[2]).toBeCloseTo((s[2] + e[2]) / 2, 9);
    }
  });

  it("rejects degenerate rects", () => {
    const state = new FrameState();
    expect(() => state.createBox(rect({ b: [0, 80] }), makeAllocator())).toThrow(/degenerate/);
    expect(() => state.createBox(rect({ depth: 0 }), makeAllocator())).toThrow(/degenerate/);
  });
});
