import { describe, expect, it } from "vitest";
import { chainEnd, chainStart, evalChain } from "@car/num";
import { cellSides, freshBox, loopClosed, stateChain } from "./util.js";

describe("push-pull cell", () => {
  it("moves the whole cell rigidly and welds drag the neighbors (box stretches)", () => {
    const { state } = freshBox();
    // pull the -X face (cell#0) 20mm further out
    state.pushPull({ kind: "cell", id: "cell#0" }, [-20, 0, 0]);
    // its four side curves moved rigidly to x=-20
    for (const s of cellSides(state, "cell#0")) {
      const chain = state.curves.get(s.curveId)?.chain;
      expect(chain && evalChain(chain, 0.5)[0]).toBe(-20);
    }
    // the perpendicular X-edges followed at their near end, stayed at the far end
    const xEdge = state.curves.get("curve#0"); // [0,0,0] -> [100,0,0]
    expect(xEdge && chainStart(xEdge.chain)).toEqual([-20, 0, 0]);
    expect(xEdge && chainEnd(xEdge.chain)).toEqual([100, 0, 0]);
    // vertices on the moved face followed
    expect(state.vertices.get("vertex#0")?.at).toEqual([-20, 0, 0]);
    expect(state.vertices.get("vertex#4")?.at).toEqual([100, 0, 0]);
    // every face loop stays closed — the watertightness mechanism
    const chainOf = stateChain(state);
    for (const id of ["cell#0", "cell#1", "cell#2", "cell#3", "cell#4", "cell#5"] as const) {
      expect(loopClosed(chainOf, cellSides(state, id))).toBe(true);
    }
    // X-edges stay straight under the linear-weight stretch drag
    const mid = xEdge && evalChain(xEdge.chain, 0.5);
    expect(mid?.[0]).toBeCloseTo(40, 9);
    expect(mid?.[1]).toBe(0);
    expect(mid?.[2]).toBe(0);
  });

  it("resolves a split parent: pushing the parent moves both children", () => {
    const { state, alloc } = freshBox();
    state.splitCell(
      "cell#3",
      { view: { kind: "side" }, a: [40, -10], b: [40, 90], lineClass: "tape" },
      alloc,
    );
    state.pushPull({ kind: "cell", id: "cell#3" }, [0, 15, 0]);
    const chainOf = stateChain(state);
    for (const id of ["cell#6", "cell#7"] as const) {
      for (const s of cellSides(state, id)) {
        expect(evalChain(chainOf(s.curveId), (s.t0 + s.t1) / 2)[1]).toBeCloseTo(75, 9);
      }
    }
  });
});

describe("push-pull curve", () => {
  it("translates one shared curve; adjoining curve endpoints follow", () => {
    const { state } = freshBox();
    state.pushPull({ kind: "curve", id: "curve#0" }, [0, 0, -10]);
    const moved = state.curves.get("curve#0");
    expect(moved && chainStart(moved.chain)).toEqual([0, 0, -10]);
    expect(moved && chainEnd(moved.chain)).toEqual([100, 0, -10]);
    // adjoining Z-edge (curve#8: [0,0,0]->[0,0,80]) followed at its start only
    const z = state.curves.get("curve#8");
    expect(z && chainStart(z.chain)).toEqual([0, 0, -10]);
    expect(z && chainEnd(z.chain)).toEqual([0, 0, 80]);
    const chainOf = stateChain(state);
    for (const id of ["cell#0", "cell#1", "cell#2", "cell#4"] as const) {
      expect(loopClosed(chainOf, cellSides(state, id))).toBe(true);
    }
  });

  it("dragging a host curve with a T-junction carries the interior curve endpoint", () => {
    const { state, alloc } = freshBox();
    const { interiorCurveId } = state.splitCell(
      "cell#3",
      { view: { kind: "side" }, a: [40, -10], b: [40, 90], lineClass: "tape" },
      alloc,
    );
    // curve#3 hosts the T at [40,60,80]; translate it upward
    state.pushPull({ kind: "curve", id: "curve#3" }, [0, 0, 12]);
    const interior = state.curves.get(interiorCurveId);
    const top = interior && chainStart(interior.chain);
    expect(top?.[2]).toBeCloseTo(92, 9);
    const chainOf = stateChain(state);
    expect(loopClosed(chainOf, cellSides(state, "cell#6"))).toBe(true);
    expect(loopClosed(chainOf, cellSides(state, "cell#7"))).toBe(true);
  });
});

describe("push-pull vertex", () => {
  it("moves the vertex and the endpoints of every adjoining curve", () => {
    const { state } = freshBox();
    state.pushPull({ kind: "vertex", id: "vertex#0" }, [-5, -5, -5]);
    expect(state.vertices.get("vertex#0")?.at).toEqual([-5, -5, -5]);
    // the three edges terminating at [0,0,0] followed
    for (const id of ["curve#0", "curve#4", "curve#8"] as const) {
      const c = state.curves.get(id);
      expect(c && chainStart(c.chain)).toEqual([-5, -5, -5]);
    }
    // far endpoints unchanged
    const c0 = state.curves.get("curve#0");
    expect(c0 && chainEnd(c0.chain)).toEqual([100, 0, 0]);
    const chainOf = stateChain(state);
    for (const id of ["cell#0", "cell#2", "cell#4"] as const) {
      expect(loopClosed(chainOf, cellSides(state, id))).toBe(true);
    }
  });
});

describe("push-pull ctrl", () => {
  it("moves one interior Bezier control point without touching junctions", () => {
    const { state } = freshBox();
    const before = state.curves.get("curve#0")?.chain.segs[0];
    state.pushPull({ kind: "ctrl", id: "curve#0", seg: 0, idx: 1 }, [0, 0, 9]);
    const after = state.curves.get("curve#0")?.chain.segs[0];
    expect(after?.p1).toEqual([before ? before.p1[0] : 0, 0, 9]);
    expect(after?.p0).toEqual(before?.p0);
    expect(after?.p3).toEqual(before?.p3);
    // neighbors untouched
    const z = state.curves.get("curve#8");
    expect(z && chainStart(z.chain)).toEqual([0, 0, 0]);
  });

  it("keeps C0 at interior seams after place-point", () => {
    const { state } = freshBox();
    state.placePoint("curve#0", 0.5);
    state.pushPull({ kind: "ctrl", id: "curve#0", seg: 0, idx: 3 }, [0, 0, 7]);
    const chain = state.curves.get("curve#0")?.chain;
    expect(chain?.segs.length).toBe(2);
    expect(chain?.segs[0]?.p3).toEqual(chain?.segs[1]?.p0);
    expect(chain?.segs[0]?.p3[2]).toBe(7);
  });

  it("a chain-end ctrl drag preserves weld coincidence", () => {
    const { state } = freshBox();
    state.pushPull({ kind: "ctrl", id: "curve#0", seg: 0, idx: 0 }, [0, 0, -4]);
    // curve#4 and curve#8 start at the same junction and must follow
    for (const id of ["curve#4", "curve#8"] as const) {
      const c = state.curves.get(id);
      expect(c && chainStart(c.chain)).toEqual([0, 0, -4]);
    }
    expect(state.vertices.get("vertex#0")?.at).toEqual([0, 0, -4]);
  });

  it("rejects out-of-range ctrl targets", () => {
    const { state } = freshBox();
    expect(() => state.pushPull({ kind: "ctrl", id: "curve#0", seg: 3, idx: 1 }, [0, 0, 1]))
      .toThrow(/out of range/);
  });
});
