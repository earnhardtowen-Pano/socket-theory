/**
 * Camera math, pure. One scale and one x-center are SHARED between the side
 * and plan views — pan or zoom the station axis and both views move as one
 * instrument. Each view keeps its own vertical center. Camera state never
 * enters undo history or the project file.
 */

export interface CameraState {
  /** mm per on-screen pixel. Same in x and y — drawings keep aspect. */
  readonly mmPerPx: number;
  /** World x (mm) at the horizontal center of every viewport. */
  readonly cx: number;
  /** Per-view world y/z (mm) at the vertical center, keyed by view id. */
  readonly cy: Readonly<Record<string, number>>;
}

export const MIN_MM_PER_PX = 0.35;
export const MAX_MM_PER_PX = 30;

export function zoomAt(
  cam: CameraState,
  view: string,
  pxW: number,
  pxH: number,
  px: number,
  py: number,
  factor: number,
  yUp: boolean,
): CameraState {
  const next = Math.min(MAX_MM_PER_PX, Math.max(MIN_MM_PER_PX, cam.mmPerPx * factor));
  if (next === cam.mmPerPx) return cam;
  // Keep the world point under the cursor fixed while the scale changes.
  const wx = cam.cx + (px - pxW / 2) * cam.mmPerPx;
  const cyv = cam.cy[view] ?? 0;
  const wy = yUp ? cyv - (py - pxH / 2) * cam.mmPerPx : cyv + (py - pxH / 2) * cam.mmPerPx;
  const cx = wx - (px - pxW / 2) * next;
  const cy = yUp ? wy + (py - pxH / 2) * next : wy - (py - pxH / 2) * next;
  return { mmPerPx: next, cx, cy: { ...cam.cy, [view]: cy } };
}

export function panBy(
  cam: CameraState,
  view: string,
  dxPx: number,
  dyPx: number,
  yUp: boolean,
): CameraState {
  return {
    ...cam,
    cx: cam.cx - dxPx * cam.mmPerPx,
    cy: {
      ...cam.cy,
      [view]: (cam.cy[view] ?? 0) + (yUp ? dyPx : -dyPx) * cam.mmPerPx,
    },
  };
}

export function fit(
  cam: CameraState,
  view: string,
  bbox: { x0: number; x1: number; y0: number; y1: number },
  pxW: number,
  pxH: number,
  marginPx: number,
): CameraState {
  const w = bbox.x1 - bbox.x0;
  const h = bbox.y1 - bbox.y0;
  const mmPerPx = Math.min(
    MAX_MM_PER_PX,
    Math.max(
      MIN_MM_PER_PX,
      Math.max(w / Math.max(1, pxW - marginPx * 2), h / Math.max(1, pxH - marginPx * 2)),
    ),
  );
  return {
    mmPerPx,
    cx: (bbox.x0 + bbox.x1) / 2,
    cy: { ...cam.cy, [view]: (bbox.y0 + bbox.y1) / 2 },
  };
}

/** Grid step in mm chosen so lines land a readable distance apart. */
export function gridStep(mmPerPx: number, targetPx: number): number {
  const steps = [10, 25, 50, 100, 250, 500, 1000, 2500];
  const want = mmPerPx * targetPx;
  for (const s of steps) if (s >= want) return s;
  return steps[steps.length - 1]!;
}
