/**
 * ModelPort — the ONLY seam between the shell and the model.
 *
 * The shell renders whatever feed() serves, proposes verbs through propose(),
 * and repaints on onChange(). Integration replaces the stub behind this
 * interface with the real @car/history session + @car/frame evaluation;
 * nothing else in apps/instrument may know which one is bound.
 *
 * propose() args follow the canonical @car/history VerbArgs dialect exactly
 * (re-declared below from @car/schema parts, since the shell may not import
 * @car/history). The shapes the shell's tools emit today:
 *   "tape"            TapeBoxProposal | TapeLineProposal
 *   "push-pull"       PushPullProposal
 *   "crease"          CreaseProposal
 *   "gap"             CreaseProposal (same shape — one curve id)
 *   "split-curve"     SplitCurveProposal
 *   "group"           GroupProposal
 *   "assign-material" AssignMaterialProposal
 */

import type { Id, LineSpec, Pt3, RectSpec, RenderFeed } from "@car/schema";

export interface ModelPort {
  /** Current evaluated geometry, one-way. The shell never mutates it. */
  feed(): RenderFeed;
  /** Emit a verb proposal. The model decides what becomes history. */
  propose(verb: string, args: unknown): void;
  /** Subscribe to feed invalidation; returns the unsubscriber. */
  onChange(cb: () => void): () => void;
  /** Stable IDs for the site tree, each list sorted by stable ID. */
  tree(): { cells: string[]; groups: string[]; datums: string[] };
  /** One provenance line for the ledger strip. Never throws. */
  describe(id: string): string;
  /**
   * Control points of a curve for the pinch gesture (smooth mode is
   * "controlled by pinching and moving contact points" — statute clause 20).
   * Optional so a display-only port can omit it.
   */
  curveControls?(curveId: Id): { seg: number; idx: 0 | 1 | 2 | 3; at: Pt3 }[];
  /**
   * Where along a curve a picked world point falls, as the chain's own
   * parameter — what SPLIT needs and picking cannot give it. The pick returns
   * a point on a rendered polyline; the split verb wants a parameter on the
   * exact chain, and only the model knows the difference.
   *
   * Null when the point is not on the curve at all.
   */
  curveParamAt?(curveId: Id, at: Pt3): number | null;
  /**
   * The parameters at which a split on this curve would be accepted. Discrete,
   * because a cell claiming across a split is refused — see the implementation.
   * Empty means nothing crosses the curve yet.
   */
  curveSplitPoints?(curveId: Id): number[];
  /**
   * What each cell is made of, for the material view. Empty for a car that has
   * never called `assign-material` — which is most of them, and which must
   * render exactly as it did before materials existed.
   */
  cellMaterials?(): ReadonlyMap<Id, { name: string; color: string }>;
}

// ---------------------------------------------------------------------------
// Proposal wire shapes (mirror @car/history VerbArgs — keep in sync by law).
// ---------------------------------------------------------------------------

export interface TapeBoxProposal {
  kind: "box";
  rect: RectSpec;
}

export interface TapeLineProposal {
  kind: "line";
  line: LineSpec;
  /** Cells the line crosses, from picking; sorted by stable ID. */
  targets: Id[];
}

export type PushPullTarget = { kind: "cell" | "curve" | "vertex"; id: Id };

export interface PushPullProposal {
  target: PushPullTarget;
  delta: Pt3;
}

export interface CreaseProposal {
  curveId: Id;
}

/** One shared curve becomes two, so a mark can own part of it (A13). */
export interface SplitCurveProposal {
  curveId: Id;
  /** Strictly inside (0,1) — the frame refuses an end. */
  t: number;
}

export interface GroupProposal {
  cellIds: Id[];
  name: string;
}

export interface AssignMaterialProposal {
  targetId: Id;
  name: string;
  color: string;
}
