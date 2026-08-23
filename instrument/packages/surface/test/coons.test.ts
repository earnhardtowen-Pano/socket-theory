import { describe, expect, it } from "vitest";
import { makeAllocator } from "@car/schema";
import { FrameState } from "@car/frame";
import { dist3, evalChain, lerp3 } from "@car/num";
import { cellBoundary, chainsOf, coonsNormal, coonsPoint, buildRenderFeed } from "@car/surface";

function box(): { state: FrameState; alloc: ReturnType<typeof makeAllocator> } {
  const state = new FrameState();
  const alloc = makeAllocator();
  state.createBox({ view: { kind: "side" }, a: [0, 0], b: [400, 300], depth: 200, at: -100 }, alloc);
  return { state, alloc };
}

const cellOf = (state: FrameState, id: string) => {
  const c = state.cells.get(id as never);
  if (!c) throw new Error(`no ${id}`);
  return c;
};

describe("Coons evaluation (the one surface evaluator)", () => {
  it("interpolates the four corners exactly", () => {
    const { state } = box();
    const cell = cellOf(state, "cell#5"); // +Z face
    const b = cellBoundary(cell, state);
    expect(coonsPoint(cell, state, 0, 0)).toEqual(b.corners[0]);
    expect(coonsPoint(cell, state, 1, 0)).toEqual(b.corners[1]);
    expect(coonsPoint(cell, state, 1, 1)).toEqual(b.corners[2]);
    expect(coonsPoint(cell, state, 0, 1)).toEqual(b.corners[3]);
  });

  it("a straight-edged frame's patch IS the flat panel (bilinear)", () => {
    const { state } = box();
    const cell = cellOf(state, "cell#5");
    const b = cellBoundary(cell, state);
    for (const [u, v] of [[0.25, 0.5], [0.5, 0.5], [0.7, 0.2], [0.9, 0.9]] as const) {
      const bilinear = lerp3(lerp3(b.corners[0], b.corners[1], u), lerp3(b.corners[3], b.corners[2], u), v);
      expect(dist3(coonsPoint(cell, state, u, v), bilinear)).toBeLessThan(1e-9);
    }
  });

  it("two welded cells agree bit-for-bit along their shared curve", () => {
    const { state } = box();
    // +Z face (cell#5) and +X face (cell#1) share one curve of the box frame.
    const a = cellOf(state, "cell#5");
    const c = cellOf(state, "cell#1");
    const shared = a.sides
      .map((s) => state.resolveCurve(s.curveId))
      .find((id) => c.sides.some((s) => state.resolveCurve(s.curveId) === id));
    expect(shared).toBeDefined();
    const chain = chainsOf(state)(shared!);
    for (const t of [0, 0.2, 0.5, 0.8, 1]) {
      const p = evalChain(chain, t);
      const ba = cellBoundary(a, state);
      const bc = cellBoundary(c, state);
      const sideA = ba.sides.find((s) => s.curveId === shared)!;
      const sideC = bc.sides.find((s) => s.curveId === shared)!;
      // Edge short-circuit: the patch edge is the shared curve itself.
      expect(sideA.chain).toBe(chain);
      expect(sideC.chain).toBe(chain);
      expect(p).toBeDefined();
    }
  });

  it("T-junction: after a split, the untouched neighbor still meets both children", () => {
    const { state, alloc } = box();
    // Split the -Y face (cell#2) with a vertical tape line in side view.
    const split = state.splitCell("cell#2" as never, { view: { kind: "side" }, a: [200, -50], b: [200, 350], lineClass: "tape" }, alloc);
    const [childA, childB] = split.children;
    // The crossed boundary curves kept ONE object; the neighbor cells' trims
    // stay whole. Sample each child's sub-side and the underlying curve at the
    // same resolved parameter: identical points.
    const chains = chainsOf(state);
    for (const childId of [childA, childB]) {
      const child = cellOf(state, childId);
      for (const side of child.sides) {
        const resolved = state.resolveCurve(side.curveId);
        const chain = chains(resolved);
        const bnd = cellBoundary(child, state);
        const bSide = bnd.sides.find((s) => s.curveId === resolved);
        expect(bSide).toBeDefined();
        // Sub-range endpoints land exactly on the shared curve.
        const t0 = bSide!.reversed ? bSide!.t1 : bSide!.t0;
        expect(dist3(bSide!.start, evalChain(chain, t0))).toBeLessThan(1e-9);
      }
    }
  });

  it("a control-point pinch moves both neighbors and they still agree", () => {
    const { state } = box();
    const a = cellOf(state, "cell#5");
    const c = cellOf(state, "cell#1");
    const shared = a.sides
      .map((s) => state.resolveCurve(s.curveId))
      .find((id) => c.sides.some((s) => state.resolveCurve(s.curveId) === id))!;
    const before = coonsPoint(a, state, 0.5, 0.5);
    state.pushPull({ kind: "ctrl", id: shared, seg: 0, idx: 1 }, [0, 0, 40]);
    const afterA = coonsPoint(a, state, 0.5, 0.5);
    expect(dist3(before, afterA)).toBeGreaterThan(1e-6); // the surface moved
    // Both neighbors' boundary along the shared curve is the same chain object.
    const ba = cellBoundary(a, state).sides.find((s) => s.curveId === shared)!;
    const bc = cellBoundary(c, state).sides.find((s) => s.curveId === shared)!;
    expect(ba.chain).toBe(bc.chain);
  });

  it("outward normals on the box point away from the center", () => {
    const { state } = box();
    // Box spans x 0..400, z 0..300, y -100..100; center at (200, 0, 150).
    const top = cellOf(state, "cell#5");
    const n = coonsNormal(top, state, 0.5, 0.5);
    expect(n[2]).toBeGreaterThan(0.99); // +Z face looks up
  });

  it("render feed is deterministic and internally consistent", () => {
    const { state } = box();
    const f1 = buildRenderFeed(state);
    const f2 = buildRenderFeed(state);
    expect(Buffer.from(f1.surfaces.positions.buffer).equals(Buffer.from(f2.surfaces.positions.buffer))).toBe(true);
    const vertCount = f1.surfaces.positions.length / 3;
    for (let i = 0; i < f1.surfaces.indices.length; i++) {
      expect(f1.surfaces.indices[i]).toBeLessThan(vertCount);
    }
    expect(f1.surfaces.ranges.length).toBe(state.cells.size);
    expect(f1.lines.ranges.length).toBeGreaterThanOrEqual(state.curves.size);
  });
});
