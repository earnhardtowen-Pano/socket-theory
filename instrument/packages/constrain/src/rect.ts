/**
 * constrainRect — the rectangle tool's exact-dimension convenience.
 *
 * Statute clause 8: typed exact values are legal everywhere; the grid is a
 * convenience, never a rounding. A typed width of 187.3 puts the far edge
 * at anchor + 187.3 exactly — constructed arithmetic, no iteration, no
 * quantization, on-grid or off.
 */

import type { Pt2 } from "@car/schema";
import { nabs } from "@car/num";

/** Axis-aligned rectangle as four corners in loop order; corners[0] is the anchor. */
export interface Rect {
  readonly corners: readonly [Pt2, Pt2, Pt2, Pt2];
}

/** Typed exact dimensions. width spans corner0→corner1, height corner0→corner3. */
export interface RectSpecs {
  readonly width?: number;
  readonly height?: number;
}

const sign = (v: number): number => (v < 0 ? -1 : 1);

/** Loop-order corners from two drag corners (a is the anchor). */
export const rectFromCorners = (a: Pt2, b: Pt2): Rect => ({
  corners: [
    [a[0], a[1]],
    [b[0], a[1]],
    [b[0], b[1]],
    [a[0], b[1]],
  ],
});

/**
 * Returns exact corner positions honoring the typed distances. The anchor
 * (corners[0]) never moves; drag direction is preserved via the sign of the
 * current spans; untyped dimensions keep their current absolute span. A
 * skewed input quad is squared up to the exact axis-aligned rectangle.
 */
export function constrainRect(rect: Rect, specs: RectSpecs): Rect {
  if (specs.width !== undefined && !(Number.isFinite(specs.width) && specs.width > 0)) {
    throw new Error(`typed width must be a positive finite length, got ${specs.width}`);
  }
  if (specs.height !== undefined && !(Number.isFinite(specs.height) && specs.height > 0)) {
    throw new Error(`typed height must be a positive finite length, got ${specs.height}`);
  }
  const [c0, c1, c2, c3] = rect.corners;
  const spanW = c1[0] - c0[0] !== 0 ? c1[0] - c0[0] : c2[0] - c0[0];
  const spanH = c3[1] - c0[1] !== 0 ? c3[1] - c0[1] : c2[1] - c0[1];
  const w = specs.width ?? nabs(spanW);
  const h = specs.height ?? nabs(spanH);
  const x1 = c0[0] + sign(spanW) * w;
  const y3 = c0[1] + sign(spanH) * h;
  return {
    corners: [
      [c0[0], c0[1]],
      [x1, c0[1]],
      [x1, y3],
      [c0[0], y3],
    ],
  };
}
