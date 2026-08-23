/**
 * Tool state machines — DOM-free and pure so they unit-test without a
 * browser. Each consumes pointer events in VIEW millimeters (already
 * snapped by the caller) and returns what happened: a ghost to draw, a verb
 * proposal to emit, or a selection. The shell owns the DOM; tools own the
 * grammar of a gesture.
 */

import type { Id, LineSpec, OrthoView, Pt2, Pt3, RectSpec } from "@car/schema";
import type { PickHit } from "./pick";
import type { PushPullTarget } from "./port";
import { inPlaneAxes, viewNormal } from "./view";

export type ToolName = "select" | "tape-box" | "tape-line" | "push-pull" | "pinch" | "crease";

export interface Ghost {
  readonly kind: "rect" | "line";
  readonly a: Pt2;
  readonly b: Pt2;
}

export interface ToolResult {
  readonly ghost?: Ghost;
  readonly proposal?: { verb: string; args: unknown };
  readonly selection?: Id | null;
  readonly status?: string;
}

const DRAG_MIN_MM = 2;

// ---------------------------------------------------------------------------
// tape-box: drag a rectangle; depth and near-face come from the typed depth
// setting (exact values are legal everywhere — the grid is a convenience).
// ---------------------------------------------------------------------------

export interface DepthSetting {
  readonly at: number;
  readonly depth: number;
}

export class TapeBoxTool {
  private anchor: Pt2 | null = null;

  down(p: Pt2): ToolResult {
    this.anchor = p;
    return {};
  }

  move(p: Pt2): ToolResult {
    if (!this.anchor) return {};
    return { ghost: { kind: "rect", a: this.anchor, b: p } };
  }

  up(p: Pt2, view: OrthoView, depth: DepthSetting): ToolResult {
    const a = this.anchor;
    this.anchor = null;
    if (!a) return {};
    if (Math.abs(p[0] - a[0]) < DRAG_MIN_MM || Math.abs(p[1] - a[1]) < DRAG_MIN_MM) {
      return { status: "tape box: degenerate rectangle discarded" };
    }
    const rect: RectSpec = { view, a, b: p, depth: depth.depth, at: depth.at };
    return { proposal: { verb: "tape", args: { kind: "box", rect } } };
  }
}

// ---------------------------------------------------------------------------
// tape-line: two clicks; the caller supplies the cells the segment crosses
// (from picking along the segment). Sketch class never splits, by law.
// ---------------------------------------------------------------------------

export class TapeLineTool {
  private first: Pt2 | null = null;

  click(
    p: Pt2,
    view: OrthoView,
    lineClass: "tape" | "sketch",
    targetsFor: (a: Pt2, b: Pt2) => Id[],
  ): ToolResult {
    if (!this.first) {
      this.first = p;
      return { status: "tape line: second point sets the line" };
    }
    const a = this.first;
    this.first = null;
    const line: LineSpec = { view, a, b: p, lineClass };
    const targets = lineClass === "tape" ? targetsFor(a, p) : [];
    if (lineClass === "tape" && targets.length === 0) {
      return { status: "tape line: crosses no cell — nothing to split" };
    }
    return { proposal: { verb: "tape", args: { kind: "line", line, targets } } };
  }

  move(p: Pt2): ToolResult {
    return this.first ? { ghost: { kind: "line", a: this.first, b: p } } : {};
  }

  cancel(): void {
    this.first = null;
  }
}

// ---------------------------------------------------------------------------
// push-pull: drag a picked cell/curve/vertex. In-plane drags map through the
// view axes; holding the normal modifier pushes along the view normal by the
// drag's vertical component — "push or pull it to create the space".
// ---------------------------------------------------------------------------

export function pushPullDelta(view: OrthoView, from: Pt2, to: Pt2, alongNormal: boolean): Pt3 {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  if (alongNormal) {
    const n = viewNormal(view);
    return [n[0] * dy, n[1] * dy, n[2] * dy];
  }
  const { x, y } = inPlaneAxes(view);
  return [x[0] * dx + y[0] * dy, x[1] * dx + y[1] * dy, x[2] * dx + y[2] * dy];
}

export class PushPullTool {
  private start: Pt2 | null = null;
  private target: PushPullTarget | null = null;

  down(p: Pt2, hit: PickHit | null): ToolResult {
    if (!hit) return { status: "push-pull: nothing under the cursor" };
    this.start = p;
    this.target = { kind: hit.kind, id: hit.id };
    return { selection: hit.id };
  }

  move(p: Pt2): ToolResult {
    return this.start ? { ghost: { kind: "line", a: this.start, b: p } } : {};
  }

  up(p: Pt2, view: OrthoView, alongNormal: boolean): ToolResult {
    const start = this.start;
    const target = this.target;
    this.start = null;
    this.target = null;
    if (!start || !target) return {};
    const delta = pushPullDelta(view, start, p, alongNormal);
    if (Math.abs(delta[0]) + Math.abs(delta[1]) + Math.abs(delta[2]) < DRAG_MIN_MM) {
      return { status: "push-pull: drag too small, discarded" };
    }
    return { proposal: { verb: "push-pull", args: { target, delta } } };
  }
}

// ---------------------------------------------------------------------------
// pinch: smooth mode's hand — grab the nearest control point of a picked
// curve and move it (statute clause 20: surfaces are controlled by pinching
// and moving contact points). The drag maps in-plane; N locks to the normal.
// ---------------------------------------------------------------------------

export interface ControlRef {
  readonly curveId: Id;
  readonly seg: number;
  readonly idx: 0 | 1 | 2 | 3;
}

export class PinchTool {
  private start: Pt2 | null = null;
  private ctrl: ControlRef | null = null;

  down(
    p: Pt2,
    hit: PickHit | null,
    controlsOf: (curveId: Id) => { seg: number; idx: 0 | 1 | 2 | 3; at: Pt3 }[],
    toView: (w: Pt3) => Pt2,
  ): ToolResult {
    if (!hit || hit.kind !== "curve") return { status: "pinch: pick a curve" };
    const controls = controlsOf(hit.id);
    if (controls.length === 0) return { status: "pinch: curve has no control points" };
    let best: { ref: ControlRef; d: number } | null = null;
    for (const c of controls) {
      const v = toView(c.at);
      const d = Math.hypot(v[0] - p[0], v[1] - p[1]);
      if (!best || d < best.d) best = { ref: { curveId: hit.id, seg: c.seg, idx: c.idx }, d };
    }
    this.start = p;
    this.ctrl = best!.ref;
    return { selection: hit.id, status: `pinch: ${hit.id} seg ${best!.ref.seg} point ${best!.ref.idx}` };
  }

  move(p: Pt2): ToolResult {
    return this.start ? { ghost: { kind: "line", a: this.start, b: p } } : {};
  }

  up(p: Pt2, view: OrthoView, alongNormal: boolean): ToolResult {
    const start = this.start;
    const ctrl = this.ctrl;
    this.start = null;
    this.ctrl = null;
    if (!start || !ctrl) return {};
    const delta = pushPullDelta(view, start, p, alongNormal);
    if (Math.abs(delta[0]) + Math.abs(delta[1]) + Math.abs(delta[2]) < DRAG_MIN_MM) {
      return { status: "pinch: drag too small, discarded" };
    }
    return {
      proposal: {
        verb: "push-pull",
        args: { target: { kind: "ctrl", id: ctrl.curveId, seg: ctrl.seg, idx: ctrl.idx }, delta },
      },
    };
  }
}

// ---------------------------------------------------------------------------
// select / crease: click resolution over picks.
// ---------------------------------------------------------------------------

export function selectAt(hit: PickHit | null): ToolResult {
  return { selection: hit ? hit.id : null };
}

export function creaseAt(hit: PickHit | null): ToolResult {
  if (!hit || hit.kind !== "curve") return { status: "crease: pick a curve" };
  return { proposal: { verb: "crease", args: { curveId: hit.id } }, selection: hit.id };
}
