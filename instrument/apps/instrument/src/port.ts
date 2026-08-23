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

export interface GroupProposal {
  cellIds: Id[];
  name: string;
}

export interface AssignMaterialProposal {
  targetId: Id;
  name: string;
  color: string;
}
