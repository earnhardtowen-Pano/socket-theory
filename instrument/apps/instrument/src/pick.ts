/**
 * Picking — pure, DOM-free, over the RenderFeed directly.
 *
 * Ortho views make picking exact 2D work: the pick ray runs along the view
 * normal, so a cursor hits a triangle iff its view-plane projection contains
 * the cursor, and the nearest hit is the one closest to the eye along the
 * normal (eyeSign). Curves are picked by 2D distance to their projected
 * segments within a tolerance, and an in-tolerance curve always beats a
 * surface — edges must stay pickable over the faces they bound.
 *
 * This module is the seam a GPU ID-buffer picker would replace; keep the
 * signature, swap the internals. INSPECT never edits, so it never picks.
 */

import type { Id, OrthoView, Pt2, Pt3, RenderFeed } from "@car/schema";
import { compareIds } from "./ids";
import { eyeSign, viewAlong, viewToWorld, worldToView } from "./view";

export interface PickHit {
  readonly id: Id;
  readonly kind: "cell" | "curve";
  /** World point: cursor lifted to the hit's depth along the view normal. */
  readonly at: Pt3;
  /** Depth along the view normal at the hit. */
  readonly along: number;
}

const EPS = 1e-9;

export function pickAt(
  feed: RenderFeed,
  view: OrthoView,
  p: Pt2,
  tolMm: number,
): PickHit | null {
  return pickCurve(feed, view, p, tolMm) ?? pickSurface(feed, view, p);
}

// ---------------------------------------------------------------------------

function pickCurve(feed: RenderFeed, view: OrthoView, p: Pt2, tolMm: number): PickHit | null {
  const pos = feed.lines.positions;
  const es = eyeSign(view);
  const ranges = [...feed.lines.ranges].sort((a, b) => compareIds(a.id, b.id));
  let best: { id: Id; d: number; along: number } | null = null;
  for (const r of ranges) {
    for (let i = r.start; i + 5 < r.start + r.count; i += 6) {
      const w0: Pt3 = [pos[i]!, pos[i + 1]!, pos[i + 2]!];
      const w1: Pt3 = [pos[i + 3]!, pos[i + 4]!, pos[i + 5]!];
      const a = worldToView(view, w0);
      const b = worldToView(view, w1);
      const { d, t } = pointSegDist(p, a, b);
      if (d > tolMm) continue;
      const along = viewAlong(view, w0) * (1 - t) + viewAlong(view, w1) * t;
      if (
        best === null ||
        d < best.d - EPS ||
        (Math.abs(d - best.d) <= EPS &&
          (es * along > es * best.along + EPS ||
            (Math.abs(along - best.along) <= EPS && compareIds(r.id, best.id) < 0)))
      ) {
        best = { id: r.id, d, along };
      }
    }
  }
  if (best === null) return null;
  return { id: best.id, kind: "curve", at: viewToWorld(view, p, best.along), along: best.along };
}

function pickSurface(feed: RenderFeed, view: OrthoView, p: Pt2): PickHit | null {
  const { positions, indices } = feed.surfaces;
  const es = eyeSign(view);
  const ranges = [...feed.surfaces.ranges].sort((a, b) => compareIds(a.id, b.id));
  let best: { id: Id; along: number } | null = null;
  for (const r of ranges) {
    for (let i = r.start; i + 2 < r.start + r.count; i += 3) {
      const ia = indices[i]! * 3;
      const ib = indices[i + 1]! * 3;
      const ic = indices[i + 2]! * 3;
      const wa: Pt3 = [positions[ia]!, positions[ia + 1]!, positions[ia + 2]!];
      const wb: Pt3 = [positions[ib]!, positions[ib + 1]!, positions[ib + 2]!];
      const wc: Pt3 = [positions[ic]!, positions[ic + 1]!, positions[ic + 2]!];
      const bary = baryAt(p, worldToView(view, wa), worldToView(view, wb), worldToView(view, wc));
      if (bary === null) continue; // edge-on or outside
      const along =
        bary[0] * viewAlong(view, wa) + bary[1] * viewAlong(view, wb) + bary[2] * viewAlong(view, wc);
      if (
        best === null ||
        es * along > es * best.along + EPS ||
        (Math.abs(along - best.along) <= EPS && compareIds(r.id, best.id) < 0)
      ) {
        best = { id: r.id, along };
      }
    }
  }
  if (best === null) return null;
  return { id: best.id, kind: "cell", at: viewToWorld(view, p, best.along), along: best.along };
}

// ---------------------------------------------------------------------------
// 2D primitives — plain arithmetic only.
// ---------------------------------------------------------------------------

/** Barycentric weights of p in triangle abc, or null if outside/degenerate. */
function baryAt(p: Pt2, a: Pt2, b: Pt2, c: Pt2): Pt3 | null {
  const v0x = b[0] - a[0], v0y = b[1] - a[1];
  const v1x = c[0] - a[0], v1y = c[1] - a[1];
  const det = v0x * v1y - v1x * v0y;
  if (Math.abs(det) < 1e-12) return null; // degenerate in this view (edge-on face)
  const px = p[0] - a[0], py = p[1] - a[1];
  const u = (px * v1y - v1x * py) / det;
  const v = (v0x * py - px * v0y) / det;
  const w = 1 - u - v;
  const tol = -1e-9;
  if (u < tol || v < tol || w < tol) return null;
  return [w, u, v];
}

function pointSegDist(p: Pt2, a: Pt2, b: Pt2): { d: number; t: number } {
  const abx = b[0] - a[0], aby = b[1] - a[1];
  const apx = p[0] - a[0], apy = p[1] - a[1];
  const len2 = abx * abx + aby * aby;
  let t = len2 > 0 ? (apx * abx + apy * aby) / len2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const dx = apx - t * abx, dy = apy - t * aby;
  return { d: Math.sqrt(dx * dx + dy * dy), t };
}
