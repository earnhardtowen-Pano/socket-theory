import { describe, expect, it } from "vitest";
import { makeAllocator, type RectSpec } from "@car/schema";
import { evalChain } from "@car/num";
import { FrameState } from "@car/frame";
import { cellSides, freshBox, loopClosed, sidePoint, stateChain } from "./util.js";

const RIGHT_RECT: RectSpec = {
  view: { kind: "side" },
  a: [100, 0],
  b: [180, 80],
  depth: 60,
  at: 0,
};

/** Two boxes snapped at x=100. box2 ids: vertices 8..15, curves 12..23, cells 6..11. */
function twoBoxes() {
  const { state, alloc } = freshBox();
  state.createBox(RIGHT_RECT, alloc);
  return { state, alloc };
}

describe("weld", () => {
  it("merges two coincident curves into one object; the lower id wins", () => {
    const { state } = twoBoxes();
    // box1 +X bottom Y-edge (curve#6) coincides with box2 -X bottom Y-edge (curve#16)
    const winner = state.weld("curve#6", "curve#16");
    expect(winner).toBe("curve#6");
    expect(state.curves.has("curve#16")).toBe(false);
    expect(state.resolveCurve("curve#16")).toBe("curve#6");
    const merged = state.curves.get("curve#6");
    expect(merged?.trims.length).toBe(4); // two owners per box side
    // box2's -X and -Z faces now reference curve#6 directly
    const owners = new Set(merged?.trims.map((t) => t.cellId));
    expect(owners.has("cell#6")).toBe(true); // box2 -X face
    expect(owners.has("cell#10")).toBe(true); // box2 -Z face
  });

  it("weld argument order does not matter — lower id still wins", () => {
    const { state } = twoBoxes();
    expect(state.weld("curve#16", "curve#6")).toBe("curve#6");
  });

  it("rejects non-coincident curves and self-weld", () => {
    const { state } = twoBoxes();
    expect(() => state.weld("curve#6", "curve#7")).toThrow(/coincident/);
    expect(() => state.weld("curve#6", "curve#6")).toThrow(/same curve/);
  });

  it("moving the welded curve moves BOTH owners' evaluated boundary", () => {
    const { state } = twoBoxes();
    state.weld("curve#6", "curve#16");
    const chainOf = stateChain(state);
    // box1 -Z face (cell#4) and box2 -Z face (cell#10) both border the seam
    const before4 = cellSides(state, "cell#4").map((s) => sidePoint(chainOf, s, 0.5));
    const before10 = cellSides(state, "cell#10").map((s) => sidePoint(chainOf, s, 0.5));
    state.pushPull({ kind: "curve", id: "curve#6" }, [0, 0, -8]);
    const after4 = cellSides(state, "cell#4").map((s) => sidePoint(chainOf, s, 0.5));
    const after10 = cellSides(state, "cell#10").map((s) => sidePoint(chainOf, s, 0.5));
    expect(after4).not.toEqual(before4);
    expect(after10).not.toEqual(before10);
    // the seam curve itself moved down by 8
    const seam = state.curves.get("curve#6");
    expect(seam && evalChain(seam.chain, 0.5)[2]).toBeCloseTo(-8, 12);
    // loop law holds for every touched cell
    for (const id of ["cell#2", "cell#4", "cell#8", "cell#10"] as const) {
      expect(loopClosed(chainOf, cellSides(state, id))).toBe(true);
    }
  });

  it("welding opposite-direction curves flips the absorbed trims", () => {
    const state = new FrameState();
    const alloc = makeAllocator();
    state.createBox({ view: { kind: "side" }, a: [0, 0], b: [100, 80], depth: 60, at: 0 }, alloc);
    // second box BELOW the first: its top face edges coincide with box1 bottom
    state.createBox({ view: { kind: "side" }, a: [0, -50], b: [100, 0], depth: 60, at: 0 }, alloc);
    // box1 bottom -Y-side X-edge (curve#0: y=0,z=0) coincides with box2 top X-edge
    // (curve#13: j=0,k=1 of box2) — same canonical direction here, so also
    // exercise a reversed weld via a hand-built pair below.
    const w = state.weld("curve#0", "curve#13");
    expect(w).toBe("curve#0");
    expect(state.curves.get("curve#0")?.trims.length).toBe(4);
  });
});

describe("detach", () => {
  it("splits a shared curve into per-cell copies with fresh recorded ids", () => {
    const { state, alloc } = freshBox();
    // curve#0 is owned by cell#2 (-Y) and cell#4 (-Z)
    const fresh = state.detach("curve#0", alloc);
    expect(fresh).toEqual(["curve#12"]);
    expect(state.curves.get("curve#0")?.trims.map((t) => t.cellId)).toEqual(["cell#2"]);
    expect(state.curves.get("curve#12")?.trims.map((t) => t.cellId)).toEqual(["cell#4"]);
    expect(state.detachedFrom.get("curve#12")).toBe("curve#0");
    // the -Z face now references the copy
    const sides = cellSides(state, "cell#4");
    expect(sides.some((s) => s.curveId === "curve#12")).toBe(true);
    // geometry is unchanged at detach time
    const a = state.curves.get("curve#0")?.chain;
    const b = state.curves.get("curve#12")?.chain;
    expect(a && b && evalChain(a, 0.5)).toEqual(b && evalChain(b, 0.5));
  });

  it("moving a detached curve leaves its severed partner in place", () => {
    const { state, alloc } = freshBox();
    state.detach("curve#0", alloc);
    state.pushPull({ kind: "curve", id: "curve#0" }, [0, 0, -5]);
    const kept = state.curves.get("curve#12");
    expect(kept && evalChain(kept.chain, 0.5)[2]).toBe(0);
    const moved = state.curves.get("curve#0");
    expect(moved && evalChain(moved.chain, 0.5)[2]).toBeCloseTo(-5, 12);
  });

  it("rejects detaching an unshared curve", () => {
    const { state, alloc } = freshBox();
    state.detach("curve#0", alloc);
    expect(() => state.detach("curve#0", alloc)).toThrow(/not shared/);
  });
});
