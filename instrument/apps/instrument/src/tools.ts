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

export type ToolName =
  | "select" | "tape-box" | "tape-line" | "push-pull" | "pinch"
  | "crease" | "gap" | "split" | "fair";

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
// select / crease / gap: click resolution over picks.
// ---------------------------------------------------------------------------

export function selectAt(hit: PickHit | null): ToolResult {
  return { selection: hit ? hit.id : null };
}

export function creaseAt(hit: PickHit | null): ToolResult {
  if (!hit || hit.kind !== "curve") return { status: "crease: pick a curve" };
  return { proposal: { verb: "crease", args: { curveId: hit.id } }, selection: hit.id };
}

/**
 * Mark a curve as a panel gap — a shutline.
 *
 * The mark next to crease, not a variant of it. A crease is a tangent break in
 * one continuous panel; a gap is where the panel stops and another starts.
 * They coincide often — a door cut is usually both — and the statute keeps
 * them apart because they do different work: a crease breaks flow, a gap does
 * not (amendment A2), and only a gap gets engraved as a shutline.
 */
export function gapAt(hit: PickHit | null): ToolResult {
  if (!hit || hit.kind !== "curve") return { status: "gap: pick a curve" };
  return { proposal: { verb: "gap", args: { curveId: hit.id } }, selection: hit.id };
}

/**
 * Split a shared curve where you clicked, so a mark can own part of it (A13).
 *
 * The gesture that panel gaps needed and did not have. A door outline is a
 * CLOSED LOOP of gap-marked curves, and closing one round a door means
 * marking the beltline between the two shuts and not beyond them — which is
 * impossible while the beltline is one curve from nose to tail. Split it at
 * each shut and the middle stretch is a curve of its own that GAP can take.
 *
 * Two things it refuses, both from the frame rather than from here: an end
 * (there is nothing to split) and a parameter some cell claims across (a cell
 * has four sides by statute, and the refusal names the cell). Both come back
 * as ledger text, which is where a refusal belongs.
 *
 * Splitting moves nothing. Every point of every cell boundary lands where it
 * landed before, bit for bit — `split-curve.test` samples them all and gets
 * them all back — so this is safe on a cut body in a way that SHAPING is not.
 */
export function splitAt(
  hit: PickHit | null,
  paramOf: (curveId: Id, at: Pt3) => number | null,
  legalPoints: (curveId: Id) => number[],
): ToolResult {
  if (!hit || hit.kind !== "curve") return { status: "split: pick a curve" };
  const t = paramOf(hit.id, hit.at);
  if (t === null) return { status: "split: that point is not on the curve" };

  // SNAP, because the legal set is discrete and a person cannot see it. Where
  // a cell claims across the click there is nothing to accept, so proposing
  // the raw parameter would be proposing a refusal — correct and useless. The
  // nearest place a station already crosses is what was meant.
  const legal = legalPoints(hit.id);
  if (legal.length === 0) {
    return { status: "split: nothing crosses this curve yet — tape a station across it first" };
  }
  let at = legal[0]!;
  for (const p of legal) if (Math.abs(p - t) < Math.abs(at - t)) at = p;
  if (at <= SPLIT_END_MM_T || at >= 1 - SPLIT_END_MM_T) {
    return { status: "split: the only crossing here is at an end, and an end has nothing to split" };
  }
  const moved = Math.abs(at - t);
  const note = moved < 1e-6
    ? `split: ${hit.id} at ${at.toFixed(4)}`
    : `split: ${hit.id} at ${at.toFixed(4)} — snapped ${(moved * 100).toFixed(1)}% along to the nearest crossing`;
  return { proposal: { verb: "split-curve", args: { curveId: hit.id, t: at } }, selection: hit.id, status: note };
}

/** How close to an end is too close. The frame refuses at 1e-9; this refuses
 *  earlier and says why, because a one-nanometre stub is not what was meant. */
const SPLIT_END_MM_T = 0.02;

/**
 * Bring crossing curves coplanar at every vertex the network turns badly.
 *
 * Whole-network, not a pick: a corner belongs to two curves and four cells,
 * and closing one moves the trims of others, so there is no sensible "this
 * one" to click. It is the one gesture in the set that fixes a property of the
 * model rather than a place in it — which is also why it takes the break angle
 * as its argument, and why what it leaves alone is worth as much as what it
 * moves.
 */
export function fairCorners(maxBreakDeg: number): ToolResult {
  return { proposal: { verb: "fair-corners", args: { maxBreakDeg } } };
}
