/**
 * Snap resolution — pure, DOM-free.
 *
 * All coordinates (cursor, candidates, radius) share ONE space. The shell
 * resolves in view millimeters and passes radius = SNAP_RADIUS_PX * mmPerPx,
 * so the catch circle stays a constant size on screen at any zoom.
 *
 * Priority is absolute by kind — vertex > intersection > curve > grid — a
 * farther vertex beats a nearer grid node as long as both are in radius.
 * Within a kind the nearest wins; exact ties break on stable id (id-less
 * candidates sort after id'd ones) so resolution is deterministic.
 */

import type { Pt2 } from "@car/schema";
import { compareIds } from "./ids";

export type SnapKind = "vertex" | "intersection" | "curve" | "grid";

export interface SnapCandidate {
  readonly at: Pt2;
  readonly kind: SnapKind;
  readonly id?: string;
}

const KIND_RANK: Record<SnapKind, number> = {
  vertex: 0,
  intersection: 1,
  curve: 2,
  grid: 3,
};

const d2 = (a: Pt2, b: Pt2): number => {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  return dx * dx + dy * dy;
};

export function snapResolve(
  cursor: Pt2,
  candidates: readonly SnapCandidate[],
  radius: number,
): SnapCandidate | null {
  const r2 = radius * radius;
  let best: SnapCandidate | null = null;
  let bestD2 = 0;
  for (const c of candidates) {
    const dd = d2(cursor, c.at);
    if (dd > r2) continue;
    if (best === null) {
      best = c;
      bestD2 = dd;
      continue;
    }
    const dr = KIND_RANK[c.kind] - KIND_RANK[best.kind];
    if (dr < 0 || (dr === 0 && (dd < bestD2 || (dd === bestD2 && tieBreak(c, best) < 0)))) {
      best = c;
      bestD2 = dd;
    }
  }
  return best;
}

function tieBreak(a: SnapCandidate, b: SnapCandidate): number {
  if (a.id !== undefined && b.id !== undefined) return compareIds(a.id, b.id);
  if (a.id !== undefined) return -1;
  if (b.id !== undefined) return 1;
  return 0;
}

/** The grid node nearest the cursor, at the current pitch. */
export function gridCandidate(cursor: Pt2, pitch: number): SnapCandidate {
  return {
    at: [Math.round(cursor[0] / pitch) * pitch, Math.round(cursor[1] / pitch) * pitch],
    kind: "grid",
  };
}
