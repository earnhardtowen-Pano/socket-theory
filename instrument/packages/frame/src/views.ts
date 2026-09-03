/**
 * Fixed orthographic view mapping (ratified):
 *   side  — x->X, y->Z, normal +Y
 *   plan  — x->X, y->Y, normal +Z
 *   front — x->Y, y->Z, normal +X
 * `along` is the coordinate on the view normal. A section view maps like
 * front with `along` measured from its stationX.
 */

import type { OrthoView, Pt2, Pt3 } from "@car/schema";

export function viewToWorld(view: OrthoView, p: Pt2, along: number): Pt3 {
  switch (view.kind) {
    case "side":
      return [p[0], along, p[1]];
    case "plan":
      return [p[0], p[1], along];
    case "front":
      return [along, p[0], p[1]];
    case "section":
      return [view.stationX + along, p[0], p[1]];
  }
}

/** Drop the normal coordinate: the projection used to test lines against cells. */
export function worldToView(view: OrthoView, p: Pt3): Pt2 {
  switch (view.kind) {
    case "side":
      return [p[0], p[2]];
    case "plan":
      return [p[0], p[1]];
    case "front":
    case "section":
      return [p[1], p[2]];
  }
}

/** Unit world normal of a view. */
export function viewNormal(view: OrthoView): Pt3 {
  switch (view.kind) {
    case "side":
      return [0, 1, 0];
    case "plan":
      return [0, 0, 1];
    case "front":
    case "section":
      return [1, 0, 0];
  }
}
