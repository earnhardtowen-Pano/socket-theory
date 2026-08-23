/**
 * @car/frame records — the in-memory frame state shapes.
 *
 * These are working state, not wire format: the saved document is the verb
 * history (statute §3); everything here is rebuilt by replay. IDs come from
 * the document allocator, so replay reproduces them exactly.
 */

import type { CurveChain, Id, JsonValue, LineSpec, Pt3 } from "@car/schema";

/** A junction record: box corners and tape-split crossing points. */
export interface Vertex {
  readonly id: Id;
  at: Pt3;
}

/**
 * One cell's claim on a sub-range of a shared curve. t0 < t1 always;
 * `reversed` means the cell's loop runs the curve from t1 down to t0.
 * T-junctions are extra trims on the same curve — never a second curve.
 */
export interface Trim {
  readonly cellId: Id;
  t0: number;
  t1: number;
  reversed: boolean;
}

/** ONE curve object owned by all its neighbors (statute clause 17). */
export interface SharedCurve {
  readonly id: Id;
  chain: CurveChain;
  trims: Trim[];
  crease: boolean;
  gap: boolean;
}

/** A side of a cell loop: same sub-range convention as Trim. */
export interface SideRef {
  curveId: Id;
  t0: number;
  t1: number;
  reversed: boolean;
}

export type MirrorMode = "auto" | "detached";

/**
 * Four-edge cell. Sides are in loop order, counter-clockwise seen from
 * outside; the end of side k coincides with the start of side k+1.
 */
export interface Cell {
  readonly id: Id;
  sides: [SideRef, SideRef, SideRef, SideRef];
  readonly parent?: Id;
  groupId?: Id;
  materialId?: Id;
  mirror: MirrorMode;
  /** How hard this patch leaves its seams, as a multiple of the natural
   *  amount. Absent means 1 — the Coons blend's own answer. See
   *  `FrameState.setFullness`. */
  fullness?: number;
}

export interface Group {
  readonly id: Id;
  name: string;
  cellIds: Id[];
}

export type DatumKind = "through-line" | "sketch-line";

export interface Datum {
  readonly id: Id;
  readonly kind: DatumKind;
  readonly line: { readonly point: Pt3; readonly dir: Pt3 } | LineSpec;
}

export interface Material {
  readonly id: Id;
  readonly name: string;
  readonly color: string;
}

/**
 * A recorded boolean, bound to frame IDs plus its recorded sketch geometry
 * (the cut-binding law). Evaluation happens downstream in the engine lane;
 * the frame only stores and exposes these.
 */
export interface FeatureOp {
  readonly id: Id;
  readonly verbSeq: number;
  readonly kind: "cut";
  readonly args: JsonValue;
}

/** Push-pull target kinds — the single drag verb's address space. */
export type PushPullTarget =
  | { readonly kind: "cell"; readonly id: Id }
  | { readonly kind: "curve"; readonly id: Id }
  | { readonly kind: "vertex"; readonly id: Id }
  | { readonly kind: "ctrl"; readonly id: Id; readonly seg: number; readonly idx: 0 | 1 | 2 | 3 };

/** Stable-ID comparator — matches @car/ci-tools hash traversal order. */
export function idCompare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
