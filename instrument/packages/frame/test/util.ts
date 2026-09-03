/** Shared helpers for @car/frame tests. Not a test file. */

import { makeAllocator, type CurveChain, type Id, type Pt3, type RectSpec } from "@car/schema";
import { evalChain } from "@car/num";
import { FrameState, samePt, type SideRef } from "@car/frame";

export const SIDE_RECT: RectSpec = {
  view: { kind: "side" },
  a: [0, 0],
  b: [100, 80],
  depth: 60,
  at: 0,
};

export function freshBox(rect: RectSpec = SIDE_RECT) {
  const state = new FrameState();
  const alloc = makeAllocator();
  const result = state.createBox(rect, alloc);
  return { state, alloc, result };
}

export function sidePoint(
  chainOf: (id: Id) => CurveChain,
  side: SideRef,
  u: number,
): Pt3 {
  const t = side.reversed ? side.t1 + u * (side.t0 - side.t1) : side.t0 + u * (side.t1 - side.t0);
  return evalChain(chainOf(side.curveId), t);
}

export function stateChain(state: FrameState): (id: Id) => CurveChain {
  return (id: Id) => {
    const c = state.curves.get(state.resolveCurve(id));
    if (!c) throw new Error(`missing curve ${id}`);
    return c.chain;
  };
}

/** The loop law: end of side k coincides with start of side k+1. */
export function loopClosed(chainOf: (id: Id) => CurveChain, sides: readonly SideRef[]): boolean {
  for (let k = 0; k < sides.length; k++) {
    const a = sides[k];
    const b = sides[(k + 1) % sides.length];
    if (!a || !b) return false;
    if (!samePt(sidePoint(chainOf, a, 1), sidePoint(chainOf, b, 0))) return false;
  }
  return true;
}

export function cellSides(state: FrameState, id: Id): readonly SideRef[] {
  const cell = state.cells.get(id);
  if (!cell) throw new Error(`missing cell ${id}`);
  return cell.sides;
}
