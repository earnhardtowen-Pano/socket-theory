import { describe, expect, it } from "vitest";
import { makeAllocator } from "@car/schema";
import { evalChain } from "@car/num";
import { freshBox, sidePoint, stateChain } from "./util.js";

describe("placePoint", () => {
  it("subdivides the chain segment, preserving shape exactly", () => {
    const { state } = freshBox();
    const before = state.curves.get("curve#0")?.chain;
    if (!before) throw new Error("missing curve");
    const samples = Array.from({ length: 21 }, (_, i) => i / 20);
    const beforePts = samples.map((t) => evalChain(before, t));
    state.placePoint("curve#0", 0.3);
    const after = state.curves.get("curve#0")?.chain;
    expect(after?.segs.length).toBe(2);
    samples.forEach((t, i) => {
      const p = after && evalChain(after, remap(t));
      const q = beforePts[i];
      if (!p || !q) throw new Error("sample failed");
      for (let k = 0; k < 3; k++) expect(p[k]).toBeCloseTo(q[k] ?? Number.NaN, 9);
    });
    // param remap for a single-segment chain split at 0.3 into 2 segments
    function remap(t: number): number {
      return t <= 0.3 ? (t / 0.3) / 2 : (1 + (t - 0.3) / 0.7) / 2;
    }
  });

  it("remaps trims and side refs so trimmed side geometry is unchanged", () => {
    const { state, alloc } = freshBox();
    state.splitCell(
      "cell#3",
      { view: { kind: "side" }, a: [40, -10], b: [40, 90], lineClass: "tape" },
      alloc,
    );
    const chainOf = stateChain(state);
    const sideOf = (cellId: "cell#6" | "cell#7") => {
      const cell = state.cells.get(cellId);
      const s = cell?.sides.find((x) => x.curveId === "curve#3");
      if (!s) throw new Error("side on curve#3 missing");
      return s;
    };
    // The geometric sub-arc each trim denotes must survive the insertion:
    // uniform chain parameterization redistributes interior params, but the
    // remapped [t0,t1] boundaries land on identical points.
    const before6 = [sidePoint(chainOf, sideOf("cell#6"), 0), sidePoint(chainOf, sideOf("cell#6"), 1)];
    const before7 = [sidePoint(chainOf, sideOf("cell#7"), 0), sidePoint(chainOf, sideOf("cell#7"), 1)];
    state.placePoint("curve#3", 0.7);
    const after6 = [sidePoint(chainOf, sideOf("cell#6"), 0), sidePoint(chainOf, sideOf("cell#6"), 1)];
    const after7 = [sidePoint(chainOf, sideOf("cell#7"), 0), sidePoint(chainOf, sideOf("cell#7"), 1)];
    for (const [before, after] of [[before6, after6], [before7, after7]] as const) {
      for (let e = 0; e < 2; e++) {
        for (let k = 0; k < 3; k++) {
          expect(after[e]?.[k]).toBeCloseTo(before[e]?.[k] ?? Number.NaN, 9);
        }
      }
    }
    // trims stayed consistent objects on the curve
    const trims = state.curves.get("curve#3")?.trims;
    expect(trims?.length).toBe(3);
    const whole = trims?.find((t) => t.cellId === "cell#5");
    expect(whole?.t0).toBe(0);
    expect(whole?.t1).toBe(1);
  });

  it("is a no-op at an existing seam or endpoint", () => {
    const { state } = freshBox();
    state.placePoint("curve#0", 0);
    state.placePoint("curve#0", 1);
    expect(state.curves.get("curve#0")?.chain.segs.length).toBe(1);
    state.placePoint("curve#0", 0.5);
    state.placePoint("curve#0", 0.5); // t=0.5 now lands exactly on the new seam
    expect(state.curves.get("curve#0")?.chain.segs.length).toBe(2);
  });

  it("rejects out-of-range t", () => {
    const { state } = freshBox();
    expect(() => state.placePoint("curve#0", 1.5)).toThrow(/t must be/);
  });
});

describe("fitThroughLine", () => {
  it("creates a through-line datum via orthogonal least squares", () => {
    const { state } = freshBox();
    const alloc = makeAllocator();
    const id = state.fitThroughLine(
      [
        [0, 0, 0],
        [10, 0.1, -0.1],
        [20, -0.1, 0.1],
        [30, 0, 0],
      ],
      alloc,
    );
    expect(id).toBe("datum#0");
    const datum = state.datums.get(id);
    expect(datum?.kind).toBe("through-line");
    const line = datum?.line;
    if (!line || !("dir" in line)) throw new Error("expected a fitted line");
    expect(Math.abs(line.dir[0])).toBeCloseTo(1, 3);
    expect(line.point[0]).toBeCloseTo(15, 9);
  });

  it("records sketch lines as datums", () => {
    const { state } = freshBox();
    const alloc = makeAllocator();
    const id = state.addSketchLine(
      { view: { kind: "side" }, a: [0, 0], b: [50, 50], lineClass: "sketch" },
      alloc,
    );
    const datum = state.datums.get(id);
    expect(datum?.kind).toBe("sketch-line");
    expect(datum && "lineClass" in datum.line && datum.line.lineClass).toBe("sketch");
  });
});

describe("groups and materials", () => {
  it("stamps groupId on resolved members and keeps authored ids", () => {
    const { state, alloc } = freshBox();
    state.splitCell(
      "cell#3",
      { view: { kind: "side" }, a: [40, -10], b: [40, 90], lineClass: "tape" },
      alloc,
    );
    const gid = state.group(["cell#3", "cell#0"], "panels", alloc);
    expect(gid).toBe("group#0");
    expect(state.groups.get(gid)?.cellIds).toEqual(["cell#3", "cell#0"]);
    // resolved through parentage: both children stamped
    expect(state.cells.get("cell#6")?.groupId).toBe(gid);
    expect(state.cells.get("cell#7")?.groupId).toBe(gid);
    expect(state.cells.get("cell#0")?.groupId).toBe(gid);
  });

  it("assigns materials to cells and groups, reusing identical materials", () => {
    const { state, alloc } = freshBox();
    const m1 = state.assignMaterial("cell#0", { name: "paint", color: "#c8102e" }, alloc);
    const gid = state.group(["cell#4", "cell#5"], "skin", alloc);
    const m2 = state.assignMaterial(gid, { name: "paint", color: "#c8102e" }, alloc);
    expect(m1).toBe("material#0");
    expect(m2).toBe("material#0");
    expect(state.cells.get("cell#0")?.materialId).toBe(m1);
    expect(state.cells.get("cell#4")?.materialId).toBe(m1);
    expect(state.cells.get("cell#5")?.materialId).toBe(m1);
    expect(() =>
      state.assignMaterial("curve#0", { name: "x", color: "#fff" }, alloc),
    ).toThrow(/cell or group/);
  });
});
