/**
 * Ortho view math — pure, DOM-free.
 *
 * The world/view mapping duplicates the ratified law in @car/frame/views.ts
 * (apps may not import @car/frame; any change there is a merge event here):
 *   side    — view x -> X, view y -> Z, normal +Y
 *   plan    — view x -> X, view y -> Y, normal +Z
 *   front   — view x -> Y, view y -> Z, normal +X
 *   section — front mapping with the normal coordinate measured from stationX
 *
 * Screen law (lane charge): view x always reads screen-right. Side and front
 * read view y up-screen; plan reads view y down-screen (paper plan). The
 * cameras that realize this mirror one projection axis, since three of the
 * ratified screen mappings are left-handed as drafting projections.
 * Eye sides: side looks along -Y (eye +Y), plan along -Z (eye +Z), front and
 * section along +X (eye -X).
 */

import type { OrthoView, Pt2, Pt3 } from "@car/schema";

export type ViewName = "side" | "plan" | "front" | "section" | "inspect";
export type OrthoName = Exclude<ViewName, "inspect">;

export function orthoViewOf(name: OrthoName, stationX: number): OrthoView {
  switch (name) {
    case "side": return { kind: "side" };
    case "plan": return { kind: "plan" };
    case "front": return { kind: "front" };
    case "section": return { kind: "section", stationX };
  }
}

export function viewToWorld(view: OrthoView, p: Pt2, along: number): Pt3 {
  switch (view.kind) {
    case "side": return [p[0], along, p[1]];
    case "plan": return [p[0], p[1], along];
    case "front": return [along, p[0], p[1]];
    case "section": return [view.stationX + along, p[0], p[1]];
  }
}

/** Drop the normal coordinate. */
export function worldToView(view: OrthoView, p: Pt3): Pt2 {
  switch (view.kind) {
    case "side": return [p[0], p[2]];
    case "plan": return [p[0], p[1]];
    case "front":
    case "section": return [p[1], p[2]];
  }
}

/** Coordinate of a world point along the view normal. */
export function viewAlong(view: OrthoView, p: Pt3): number {
  switch (view.kind) {
    case "side": return p[1];
    case "plan": return p[2];
    case "front": return p[0];
    case "section": return p[0] - view.stationX;
  }
}

export function viewNormal(view: OrthoView): Pt3 {
  switch (view.kind) {
    case "side": return [0, 1, 0];
    case "plan": return [0, 0, 1];
    case "front":
    case "section": return [1, 0, 0];
  }
}

/** World directions of the in-plane view axes (x, y). */
export function inPlaneAxes(view: OrthoView): { x: Pt3; y: Pt3 } {
  switch (view.kind) {
    case "side": return { x: [1, 0, 0], y: [0, 0, 1] };
    case "plan": return { x: [1, 0, 0], y: [0, 1, 0] };
    case "front":
    case "section": return { x: [0, 1, 0], y: [0, 0, 1] };
  }
}

/** +1 when view y grows down-screen (plan), -1 when it grows up-screen. */
export function yDownFactor(view: OrthoView): 1 | -1 {
  return view.kind === "plan" ? 1 : -1;
}

/**
 * Which side of the view plane the eye sits on, along the view normal.
 * +1: eye at +normal looking back (side, plan). -1: eye at -normal looking
 * forward (front, section). Picking prefers hits nearest the eye.
 */
export function eyeSign(view: OrthoView): 1 | -1 {
  switch (view.kind) {
    case "side":
    case "plan": return 1;
    case "front":
    case "section": return -1;
  }
}

// ---------------------------------------------------------------------------
// Screen <-> view. mmPerPx is CSS pixels; screen y grows down (DOM).
// ---------------------------------------------------------------------------

export interface CamState {
  readonly center: Pt2;   // view coordinates at the canvas center, mm
  readonly mmPerPx: number;
}

export interface ScreenSize {
  readonly w: number;
  readonly h: number;
}

export function screenToView(view: OrthoView, cam: CamState, size: ScreenSize, s: Pt2): Pt2 {
  const yd = yDownFactor(view);
  return [
    cam.center[0] + (s[0] - size.w / 2) * cam.mmPerPx,
    cam.center[1] + yd * (s[1] - size.h / 2) * cam.mmPerPx,
  ];
}

export function viewToScreen(view: OrthoView, cam: CamState, size: ScreenSize, v: Pt2): Pt2 {
  const yd = yDownFactor(view);
  return [
    size.w / 2 + (v[0] - cam.center[0]) / cam.mmPerPx,
    size.h / 2 + yd * (v[1] - cam.center[1]) / cam.mmPerPx,
  ];
}

// ---------------------------------------------------------------------------
// Adaptive grid pitch: 1 / 10 / 100 mm by zoom. The finest pitch whose lines
// sit at least MIN_GRID_PX apart wins; fully zoomed out the grid stays 100 mm.
// ---------------------------------------------------------------------------

export const GRID_PITCHES = [1, 10, 100] as const;
export const MIN_GRID_PX = 8;

export function gridPitchFor(mmPerPx: number): number {
  for (const p of GRID_PITCHES) {
    if (p / mmPerPx >= MIN_GRID_PX) return p;
  }
  return GRID_PITCHES[GRID_PITCHES.length - 1] as number;
}
