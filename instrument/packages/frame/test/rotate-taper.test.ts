import { describe, expect, it } from "vitest";
import { chainEnd, chainStart, evalChain } from "@car/num";
import { cellSides, freshBox, loopClosed, stateChain } from "./util.js";

const ALL_CELLS = ["cell#0", "cell#1", "cell#2", "cell#3", "cell#4", "cell#5"] as const;

describe("rotate (statute clause 17)", () => {
  it("throws, naming the curve, when a weld crosses the rotation boundary", () => {
    const { state } = freshBox();
    expect(() => state.rotate(["cell#0"], [0, 0, 0], [0, 1, 0], 15)).toThrow(
      /rotation requires explicit detach of curve#\d+/,
    );
    // and nothing moved
    const c = state.curves.get("curve#8");
    expect(c && chainStart(c.chain)).toEqual([0, 0, 0]);
  });

  it("rotating the whole welded box carries every weld along", () => {
    const { state } = freshBox();
    state.rotate([...ALL_CELLS], [0, 0, 0], [0, 0, 1], 90);
    // [100,0,0] rotates to [0,100,0]
    const c0 = state.curves.get("curve#0");
    const end = c0 && chainEnd(c0.chain);
    expect(end?.[0]).toBeCloseTo(0, 9);
    expect(end?.[1]).toBeCloseTo(100, 9);
    // vertices carried
    const v4 = state.vertices.get("vertex#4");
    expect(v4?.at[1]).toBeCloseTo(100, 9);
    const chainOf = stateChain(state);
    for (const id of ALL_CELLS) {
      expect(loopClosed(chainOf, cellSides(state, id))).toBe(true);
    }
  });

  it("after explicit detach the freed cell rotates and the body stays", () => {
    const { state, alloc } = freshBox();
    for (const id of ["curve#8", "curve#9", "curve#4", "curve#5"] as const) {
      state.detach(id, alloc);
    }
    state.rotate(["cell#0"], [0, 30, 0], [0, 1, 0], 45);
    // the flap's own top edge moved
    const flapTop = state.curves.get("curve#5"); // [0,0,80] -> [0,60,80] pre-rotation
    const p = flapTop && chainStart(flapTop.chain);
    expect(p?.[2]).not.toBe(80);
    // the body-side detach copies stayed put
    for (const id of ["curve#12", "curve#13", "curve#14", "curve#15"] as const) {
      const copy = state.curves.get(id);
      expect(copy).toBeDefined();
    }
    const bodyCopy = state.curves.get("curve#14"); // cell#4's copy of curve#4
    expect(bodyCopy && chainStart(bodyCopy.chain)).toEqual([0, 0, 0]);
    // both the flap and the body faces keep closed loops
    const chainOf = stateChain(state);
    for (const id of ALL_CELLS) {
      expect(loopClosed(chainOf, cellSides(state, id))).toBe(true);
    }
    // shared corner vertices stay with the body (leave-behind rule)
    expect(state.vertices.get("vertex#0")?.at).toEqual([0, 0, 0]);
  });

  it("rejects a zero axis", () => {
    const { state } = freshBox();
    expect(() => state.rotate([...ALL_CELLS], [0, 0, 0], [0, 0, 0], 10)).toThrow(/zero axis/);
  });
});

const expectPt = (p: readonly number[] | undefined | false, want: readonly number[]): void => {
  expect(p).toBeTruthy();
  if (!p) return;
  for (let i = 0; i < 3; i++) expect(p[i]).toBeCloseTo(want[i] ?? Number.NaN, 9);
};

describe("taper", () => {
  it("scales the side curve toward its own midpoint and drags welded neighbors", () => {
    const { state } = freshBox();
    // cell#5 (+Z) side 0 is curve#1: [0,0,80] -> [100,0,80], midpoint [50,0,80]
    state.taper("cell#5", 0, 0.5);
    const c1 = state.curves.get("curve#1");
    expectPt(c1 && chainStart(c1.chain), [25, 0, 80]);
    expectPt(c1 && chainEnd(c1.chain), [75, 0, 80]);
    // neighbors terminating at the old endpoints followed
    const c5 = state.curves.get("curve#5"); // started at [0,0,80]
    expectPt(c5 && chainStart(c5.chain), [25, 0, 80]);
    const c8 = state.curves.get("curve#8"); // ended at [0,0,80]
    expectPt(c8 && chainEnd(c8.chain), [25, 0, 80]);
    const chainOf = stateChain(state);
    for (const id of ALL_CELLS) {
      expect(loopClosed(chainOf, cellSides(state, id))).toBe(true);
    }
  });

  it("scale 0 is the blunt taper-to-a-point", () => {
    const { state } = freshBox();
    state.taper("cell#5", 0, 0);
    const c1 = state.curves.get("curve#1");
    expectPt(c1 && chainStart(c1.chain), [50, 0, 80]);
    expectPt(c1 && chainEnd(c1.chain), [50, 0, 80]);
    expectPt(c1 && evalChain(c1.chain, 0.5), [50, 0, 80]);
  });

  it("rejects negative or non-finite scales", () => {
    const { state } = freshBox();
    expect(() => state.taper("cell#5", 0, -1)).toThrow(/scale/);
    expect(() => state.taper("cell#5", 0, Number.NaN)).toThrow(/scale/);
  });
});
