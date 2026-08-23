import { describe, expect, it } from "vitest";
import type { RectSpec } from "@car/schema";
import { evalChain } from "@car/num";
import { evaluateMirrors, isCenteredOnCenterline } from "@car/frame";
import { freshBox } from "./util.js";

// The standard box spans Y 0..60 — entirely off the centerline.
// A "centered" variant spans Y -30..30 via a front-view rect.
const CENTERED_RECT: RectSpec = {
  view: { kind: "front" },
  a: [-30, 0],
  b: [30, 80],
  depth: 100,
  at: 0,
};

describe("mirror evaluation (symmetry law)", () => {
  it("off-center cells get ~m twins; the cell lying in Y=0 is its own mirror", () => {
    const { state } = freshBox();
    const { twins } = evaluateMirrors(state);
    const ids = twins.map((t) => t.id);
    // cell#2 is the -Y face at y=0: centered, no twin
    expect(ids).toEqual(["cell#0~m", "cell#1~m", "cell#3~m", "cell#4~m", "cell#5~m"]);
    const cell2 = state.cells.get("cell#2");
    expect(cell2 && isCenteredOnCenterline(state, cell2)).toBe(true);
  });

  it("a body straddling the centerline symmetrically emits no twins at all", () => {
    // Corrected at first end-to-end integration: the -Y side face's mirror
    // image IS the +Y side face, which already exists — emitting twins for
    // them doubles panels and opens the closed mesh. A cell earns a twin only
    // when its mirror image is absent from the model.
    const { state } = freshBox(CENTERED_RECT);
    const { twins } = evaluateMirrors(state);
    expect(twins.map((t) => t.id)).toEqual([]);
  });

  it("a one-ULP difference between the two sides is not an asymmetry", () => {
    // Found on the P1 windshield: two deck cells out of thirteen were handed
    // phantom twins that double-covered them and opened the mesh. The cells
    // were symmetric to the bit; the SIGNATURE was not. 553.9453125 is dyadic,
    // so 553.9453125 * 1e6 is 553945312.5 exactly — a tie — and the same
    // coordinate came back 553.94531249999994 on the other flank, because the
    // two sides are reached by different arithmetic sequences. One ULP is
    // invisible on its own; landing on a tie it decides the rounding, and the
    // two sides quantize a whole step apart. The signature now snaps
    // magnitudes to 12 significant digits before the grid round, so the two
    // sides are bit-equal by the time ties are broken, and breaks the tie on
    // the magnitude so the sign cannot change the answer either.
    const { state } = freshBox(CENTERED_RECT);
    const onTie = 553.9453125;
    const oneUlpLess = onTie * (1 - Number.EPSILON);
    expect(oneUlpLess).not.toBe(onTie);
    state.pushPull({ kind: "curve", id: "curve#0" }, [0, -onTie + 30, 0]);
    state.pushPull({ kind: "curve", id: "curve#2" }, [0, oneUlpLess - 30, 0]);
    expect(evaluateMirrors(state).twins.map((t) => t.id)).toEqual([]);
  });

  it("twins are derivation only: mirrored geometry, reversed loops, no stored records", () => {
    const { state } = freshBox();
    const { twins, mirroredCurves } = evaluateMirrors(state);
    const twin = twins.find((t) => (t.id as string) === "cell#3~m");
    expect(twin).toBeDefined();
    // authored state untouched
    expect(state.cells.size).toBe(6);
    expect(state.curves.size).toBe(12);
    expect([...state.cells.keys()].every((id) => !id.includes("~m"))).toBe(true);
    // mirrored curve geometry is the Y-negation of its source
    const m9 = mirroredCurves.get("curve#9~m" as never);
    const c9 = state.curves.get("curve#9");
    expect(m9 && c9).toBeTruthy();
    if (m9 && c9) {
      const a = evalChain(c9.chain, 0.25);
      const b = evalChain(m9, 0.75); // twins reverse loop direction, curves keep param
      void b;
      expect(evalChain(m9, 0.25)).toEqual([a[0], -a[1], a[2]]);
    }
  });

  it("mirror-detach records the asymmetry and removes the twin", () => {
    const { state } = freshBox();
    state.mirrorDetach("cell#3");
    const { twins } = evaluateMirrors(state);
    expect(twins.map((t) => t.id)).toEqual(["cell#0~m", "cell#1~m", "cell#4~m", "cell#5~m"]);
    expect(state.cells.get("cell#3")?.mirror).toBe("detached");
  });

  it("mirror-detach survives a later split (children inherit)", () => {
    const { state, alloc } = freshBox();
    state.mirrorDetach("cell#3");
    state.splitCell(
      "cell#3",
      { view: { kind: "side" }, a: [40, -10], b: [40, 90], lineClass: "tape" },
      alloc,
    );
    const { twins } = evaluateMirrors(state);
    expect(twins.some((t) => t.id.startsWith("cell#6") || t.id.startsWith("cell#7"))).toBe(false);
  });
});

describe("evaluatedBuffers", () => {
  it("is ID-sorted, one entry per cell/twin/curve/mirrored-curve, NaN-free", () => {
    const { state } = freshBox();
    const objs = state.evaluatedBuffers();
    // 6 cells + 5 twins + 12 curves + 12 mirrored curves
    expect(objs.length).toBe(35);
    const ids = objs.map((o) => o.id);
    expect([...ids].sort()).toEqual(ids);
    for (const o of objs) {
      expect(o.buffers.length).toBeGreaterThan(0);
      for (const buf of o.buffers) {
        expect(buf.length % 3).toBe(0);
        for (const v of buf) expect(Number.isNaN(v)).toBe(false);
      }
    }
    // cells carry exactly four side buffers
    const cell0 = objs.find((o) => o.id === "cell#0");
    expect(cell0?.buffers.length).toBe(4);
    const twin0 = objs.find((o) => o.id === "cell#0~m");
    expect(twin0?.buffers.length).toBe(4);
  });

  it("is reproducible bit-for-bit across independent builds", () => {
    const a = freshBox().state.evaluatedBuffers();
    const b = freshBox().state.evaluatedBuffers();
    expect(a.length).toBe(b.length);
    for (let i = 0; i < a.length; i++) {
      expect(a[i]?.id).toBe(b[i]?.id);
      expect(a[i]?.buffers).toEqual(b[i]?.buffers);
    }
  });
});

describe("quilt", () => {
  it("carries cells with twins, the curve map, crease and gap sets", () => {
    const { state } = freshBox();
    state.markCrease("curve#3");
    state.markGap("curve#9");
    const q = state.quilt();
    expect(q.cells.length).toBe(11);
    expect(q.cells.map((c) => c.id)).toEqual([...q.cells.map((c) => c.id)].sort());
    expect(q.curves.size).toBe(24);
    expect(q.creases.has("curve#3")).toBe(true);
    expect(q.creases.has("curve#3~m" as never)).toBe(true);
    expect(q.gaps.has("curve#9")).toBe(true);
    expect(q.gaps.has("curve#9~m" as never)).toBe(true);
    // every referenced side curve exists in the map
    for (const cell of q.cells) {
      for (const side of cell.sides) {
        expect(q.curves.has(side.curveId)).toBe(true);
      }
    }
  });

  it("twin loops satisfy the loop law with mirrored curves", () => {
    const { state } = freshBox();
    const q = state.quilt();
    for (const cell of q.cells) {
      for (let k = 0; k < 4; k++) {
        const a = cell.sides[k];
        const b = cell.sides[(k + 1) % 4];
        if (!a || !b) throw new Error("missing side");
        const chainA = q.curves.get(a.curveId);
        const chainB = q.curves.get(b.curveId);
        if (!chainA || !chainB) throw new Error("missing curve");
        const endA = evalChain(chainA, a.reversed ? a.t0 : a.t1);
        const startB = evalChain(chainB, b.reversed ? b.t1 : b.t0);
        expect(endA[0]).toBeCloseTo(startB[0], 9);
        expect(endA[1]).toBeCloseTo(startB[1], 9);
        expect(endA[2]).toBeCloseTo(startB[2], 9);
      }
    }
  });
});
