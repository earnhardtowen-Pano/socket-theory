/**
 * The end caps, on a box that is nobody's car.
 *
 * Three claims, each checked on a synthetic box rather than on the P2:
 *
 *   A DOME MOVES THE MIDDLE AND NOT THE CORNERS. Every corner of the face is
 *   where a master line ends, and a weld that moved would open the print.
 *
 *   THE INTERIOR REACHES THE DEPTH THE FORMULA SAYS. The header's formula is
 *   the claim; the Coons evaluator is the independent witness.
 *
 *   A BAND CUT LEAVES THE DOME WHERE IT WAS. The two halves are the dome,
 *   split — sampled against the surface the cap had before the cut, to a
 *   tenth of a micron — and the print is still closed.
 */
import { describe, expect, it } from "vitest";
import { createSession } from "@car/history";
import { computeQuilt } from "@car/frame";
import { boundaryCoonsPoint, cellBoundary, tangentField } from "@car/surface";
import { closedMeshCheck, meshQuilt } from "@car/mesh";
import { evalChain } from "@car/num";
import type { Id, Pt3 } from "@car/schema";
import { capBand, domeEndCap, type CapDeps } from "./caps.js";

const box = () => {
  const s = createSession("cap fixture");
  s.apply("tape", {
    kind: "box",
    rect: { view: { kind: "side" }, a: [0, 100], b: [2000, 900], depth: 1200, at: -600 },
  });
  for (const id of [...s.state.cells.keys()] as Id[]) s.apply("mirror-detach", { cellId: id });
  // The two plan cuts every closed car makes on its top face — so the cap's
  // top edge carries two rail ends welded at interior parameters, exactly as
  // it does on a body. A dome that opened THOSE welds would pass a plain box.
  {
    const topFace = ([...s.state.cells.keys()] as Id[]).find((id) => {
      const cell = s.state.cells.get(id)!;
      return cell.sides.every((sd) => {
        const c = s.state.curves.get(s.state.resolveCurve(sd.curveId))!;
        return evalChain(c.chain, 0.5)[2] > 899;
      });
    })!;
    for (const y of [330, -330]) {
      s.apply("tape", {
        kind: "line",
        line: { view: { kind: "plan" }, a: [-40, y], b: [2040, y], lineClass: "tape" },
        targets: [topFace],
      });
    }
  }
  const ctrlsOf = (id: Id): [Pt3, Pt3, Pt3, Pt3] => {
    const c = s.state.curves.get(s.state.resolveCurve(id))!;
    const seg = c.chain.segs[0]!;
    return [seg.p0, seg.p1, seg.p2, seg.p3];
  };
  const setCtrl = (id: Id, idx: 0 | 1 | 2 | 3, to: Pt3): void => {
    const at = ctrlsOf(id)[idx];
    const d: Pt3 = [to[0] - at[0], to[1] - at[1], to[2] - at[2]];
    if (d[0] === 0 && d[1] === 0 && d[2] === 0) return;
    s.apply("push-pull", { target: { kind: "ctrl", id, seg: 0, idx }, delta: d });
  };
  const fitThrough = (id: Id, f: (t: number) => Pt3, endsToo = true): void => {
    const A = f(0), B = f(1 / 3), C = f(2 / 3), D = f(1);
    const p1 = [0, 1, 2].map((k) => 3 * B[k]! - 1.5 * C[k]! - (5 / 6) * A[k]! + (1 / 3) * D[k]!) as unknown as Pt3;
    const p2 = [0, 1, 2].map((k) => 3 * C[k]! - 1.5 * B[k]! - (5 / 6) * D[k]! + (1 / 3) * A[k]!) as unknown as Pt3;
    if (endsToo) { setCtrl(id, 0, A); setCtrl(id, 3, D); }
    setCtrl(id, 1, p1);
    setCtrl(id, 2, p2);
  };
  const deps: CapDeps = {
    apply: (verb, args) => s.apply(verb as never, args as never),
    cellIds: () => [...s.state.cells.keys()] as Id[],
    curveIds: () => [...s.state.curves.keys()] as Id[],
    sidesOf: (cellId) => s.state.cells.get(cellId)!.sides.map((sd) => s.state.resolveCurve(sd.curveId)),
    pointAt: (id, t) => evalChain(s.state.curves.get(s.state.resolveCurve(id))!.chain, t),
    fitThrough,
  };
  /** Mark every edge of the cap's cells, as a build does: the field then
   *  prescribes nothing across them and the cap is its own bare blend. */
  const creaseCap = (cells: readonly Id[]): void => {
    const done = new Set<Id>();
    for (const cellId of cells) for (const id of deps.sidesOf(cellId)) {
      if (done.has(id)) continue;
      done.add(id);
      s.apply("crease", { curveId: id });
    }
  };
  const endCell = (atX: number): Id => {
    for (const [id, cell] of s.state.cells) {
      const xs: number[] = [];
      for (const sd of cell.sides) {
        const c = s.state.curves.get(s.state.resolveCurve(sd.curveId))!;
        for (const t of [0, 0.5, 1]) xs.push(evalChain(c.chain, sd.t0 + (sd.t1 - sd.t0) * t)[0]);
      }
      if (xs.every((x) => Math.abs(x - atX) < 1e-9)) return id as Id;
    }
    throw new Error(`no end cell at x=${atX}`);
  };
  const endsOf = (id: Id): [Pt3, Pt3] => [deps.pointAt(id, 0), deps.pointAt(id, 1)];
  return { s, deps, endCell, creaseCap, endsOf };
};

/** Sample one cell's surface on a grid, through the bare Coons blend. */
const surface = (s: ReturnType<typeof createSession>, cellId: Id, n = 8): Pt3[] => {
  const quilt = computeQuilt(s.state);
  const cross = tangentField(quilt, { order: 1 });
  const cell = quilt.cells.find((c) => c.id === cellId)!;
  const b = cellBoundary(cell, quilt, cross);
  const out: Pt3[] = [];
  for (let i = 0; i <= n; i++) for (let j = 0; j <= n; j++) out.push(boundaryCoonsPoint(b, i / n, j / n));
  return out;
};

describe("domeEndCap", () => {
  it("bows the middle of every edge by what was asked and moves no corner", () => {
    const { s, deps, endCell, endsOf } = box();
    const nose = endCell(0);
    const before = deps.sidesOf(nose).map((id) => endsOf(id));
    const cap = domeEndCap(deps, nose, { sign: -1, top: 30, bottom: 20, side: 25 });
    const after = deps.sidesOf(nose).map((id) => endsOf(id));
    for (let i = 0; i < 4; i++) {
      for (let e = 0; e < 2; e++) {
        for (let k = 0; k < 3; k++) expect(after[i]![e]![k]).toBeCloseTo(before[i]![e]![k], 9);
      }
    }
    // The middle of each edge went where it was told, and nowhere else.
    for (const id of deps.sidesOf(nose)) {
      const c = s.state.curves.get(s.state.resolveCurve(id))!;
      const [a, b] = endsOf(id);
      const mid = evalChain(c.chain, 0.5);
      const across = Math.abs(b[1] - a[1]) > Math.abs(b[2] - a[2]);
      const want = across ? (a[2] > 500 ? 30 : 20) : 25;
      expect(mid[0]).toBeCloseTo(-want, 6);
      expect(mid[1]).toBeCloseTo((a[1] + b[1]) / 2, 6);
      expect(mid[2]).toBeCloseTo((a[2] + b[2]) / 2, 6);
    }
    expect(cap.depth).toBe(50);
    expect(cap.zBottom).toBe(100);
    expect(cap.zTop).toBe(900);
  });

  it("the interior reaches the formula's depth, read through the Coons evaluator", () => {
    const { s, deps, endCell, creaseCap } = box();
    const tail = endCell(2000);
    const cap = domeEndCap(deps, tail, { sign: 1, top: 40, bottom: 10, side: 22 });
    creaseCap(cap.cells);
    const pts = surface(s, tail, 10);
    // At the middle of the face, u = v = ½: (10 + 40)/2 + 22 = 47. The
    // DEEPEST point of the dome is not there when top and bottom differ —
    // it sits toward the deeper edge — which is why `depth` says "at the
    // middle" and this reads the middle.
    const quilt = computeQuilt(s.state);
    const cross = tangentField(quilt, { order: 1 });
    const cell = quilt.cells.find((c) => c.id === tail)!;
    const mid = boundaryCoonsPoint(cellBoundary(cell, quilt, cross), 0.5, 0.5);
    expect(mid[0]).toBeCloseTo(2000 + cap.depth, 6);
    expect(cap.depth).toBe(47);
    // The deepest point is past the middle, toward the 40 mm top edge, and
    // nothing bows the wrong way.
    const deepest = Math.max(...pts.map((p) => p[0]));
    expect(deepest).toBeGreaterThan(2000 + cap.depth);
    expect(deepest).toBeLessThan(2000 + cap.depth + 4);
    expect(Math.min(...pts.map((p) => p[0]))).toBeGreaterThanOrEqual(2000 - 1e-9);
  });

  it("refuses a face that is not flat, by name", () => {
    const { deps, endCell } = box();
    const nose = endCell(0);
    domeEndCap(deps, nose, { sign: -1, top: 10, bottom: 10, side: 10 });
    expect(() => domeEndCap(deps, nose, { sign: -1, top: 10, bottom: 10, side: 10 }))
      .toThrow(/not flat/);
  });
});

describe("capBand", () => {
  it("splits a domed cap into two halves that are the same dome, and the print stays closed", () => {
    const { s, deps, endCell, creaseCap, endsOf } = box();
    const nose = endCell(0);
    const cap = domeEndCap(deps, nose, { sign: -1, top: 34, bottom: 24, side: 31 });
    creaseCap(cap.cells);
    const whole = surface(s, nose, 12);
    const { lower, upper, seam } = capBand(deps, cap, nose, 380);
    creaseCap(cap.cells);
    expect(cap.cells).toEqual([lower, upper]);
    expect(cap.seams).toEqual([seam]);
    // Every sample of both halves lies on the original dome: nearest point
    // of the pre-cut grid within a tenth of a micron once the grid is fine
    // enough — so sample the halves at the SAME heights the whole was
    // sampled at, by asking the whole surface's evaluator directly.
    const quilt = computeQuilt(s.state);
    const cross = tangentField(quilt, { order: 1 });
    const zOf = (p: Pt3) => p[2];
    const wholeAt = (y: number, z: number): number => {
      // The dome's own formula, in the cap's parameters.
      const v = (z - 100) / 800;
      const halfW = 600;
      const u = (y + halfW) / (2 * halfW);
      const hump = (t: number) => 4 * t * (1 - t);
      return -(hump(u) * ((1 - v) * 24 + v * 34) + hump(v) * 31);
    };
    for (const id of [lower, upper]) {
      const cell = quilt.cells.find((c) => c.id === id)!;
      const b = cellBoundary(cell, quilt, cross);
      for (let i = 0; i <= 9; i++) {
        for (let j = 0; j <= 9; j++) {
          const p = boundaryCoonsPoint(b, i / 9, j / 9);
          expect(p[0]).toBeCloseTo(wholeAt(p[1], zOf(p)), 7);
        }
      }
    }
    // The whole was on the formula too — the test would be vacuous otherwise.
    for (const p of whole) expect(p[0]).toBeCloseTo(wholeAt(p[1], p[2]), 7);
    const mesh = meshQuilt(quilt, { baseDensity: 8, cross: null });
    const check = closedMeshCheck(mesh);
    expect(check.closed).toBe(true);
    // The seam's ends sit on the bowed sides, not on the box's plane.
    const [a, b2] = endsOf(seam);
    expect(a[0]).toBeLessThan(-1);
    expect(b2[0]).toBeCloseTo(a[0], 9);
  });

  it("refuses a band outside the cap's height, by name", () => {
    const { deps, endCell } = box();
    const nose = endCell(0);
    const cap = domeEndCap(deps, nose, { sign: -1, top: 10, bottom: 10, side: 10 });
    expect(() => capBand(deps, cap, nose, 950)).toThrow(/outside/);
  });
});
