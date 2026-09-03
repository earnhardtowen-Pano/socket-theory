/**
 * Draft — whether the body can come out of the tool it would be made in.
 *
 * The audit row for manufacturability has read "not modelled" since the
 * beginning, and this is the first honest thing to put in it. A pressed panel,
 * a moulding and a printed part all fail the same way: a face whose normal
 * leans back toward the pull direction cannot be withdrawn, and one that is
 * merely close to parallel with the pull will drag, scuff and stick.
 *
 * The reading is one angle per vertex:
 *
 *     draft = 90° − angle(n̂, P̂)
 *
 * where P̂ is the pull direction and the angle is taken in 0..180°. So:
 *
 *   +90°   the face looks straight along the pull. Comes out freely.
 *     0°   the face is parallel to the pull — a vertical wall. Drags.
 *   −ve    the face leans back under the pull. UNDERCUT: it does not come out
 *          at all without a slide, a lifter, or a second tool half.
 *
 * A body is normally split into two halves pulled opposite ways, so this is
 * reported against ONE direction at a time and the caller says which. Nothing
 * here decides where a parting line should be — that is a design decision with
 * consequences for the shape, and it belongs to whoever owns the car.
 *
 * SIGN CONVENTION AND WHY IT MATTERS. `pull` is the direction the tool moves to
 * come OFF the part. That is exactly the sign of n̂·P̂, so the arithmetic is one
 * dot product and there is nowhere for a convention error to hide.
 *
 * WHAT IT CANNOT SEE, STATED HERE RATHER THAN DISCOVERED LATER. This is LOCAL
 * draft — the same reading every CAD package calls draft analysis — and a
 * normal knows only about itself. A face can be perfectly drafted and still
 * trapped, because something else on the body is in front of it: a wheel arch
 * lip over the arch behind it, a spoiler over the deck. Finding those needs a
 * visibility test along the pull, and a visibility test is a different piece of
 * work with a different cost. So a clean sheet here means "no face leans the
 * wrong way", not "the part comes out", and the two are not the same claim.
 *
 * The other thing to keep in mind reading it: pulled ONE way, roughly half of
 * any closed body is undercut by construction, because half of a closed
 * surface faces away from any direction you choose. That number is arithmetic,
 * not information. A body is split into halves pulled opposite ways, and the
 * useful question is asked of one half at a time — or against the direction a
 * printed part leaves its bed, which is a single pull and genuinely one-sided.
 *
 * A lens: read-only, authors nothing, feeds nothing downstream.
 * Deterministic: index-ordered traversal, no wall clock, no randomness.
 */

import { nabs, nasin, nsqrt, PI } from "@car/num";

export interface DraftMesh {
  /** Per-vertex surface normals, 3 per vertex. Need not be unit. */
  readonly normals: Float64Array;
  readonly positions: Float64Array;
  readonly indices: Uint32Array;
}

export interface DraftOptions {
  /** Direction the tool withdraws. Normalised here. */
  readonly pull?: readonly [number, number, number];
  /** Below this, a face drags even though it is not undercut. */
  readonly minDraftDeg?: number;
}

export interface DraftResult {
  /** Draft angle per vertex, degrees. Negative is undercut. */
  readonly draftDeg: Float64Array;
  readonly pull: readonly [number, number, number];
  readonly minDraftDeg: number;
  /** Triangles wholly undercut, and the area they cover, mm². */
  readonly undercutTriangles: number;
  readonly undercutAreaMm2: number;
  /** Triangles drafted but under the minimum. */
  readonly shallowTriangles: number;
  readonly shallowAreaMm2: number;
  readonly totalTriangles: number;
  readonly totalAreaMm2: number;
  /** Worst (most negative) draft found, and where. */
  readonly worstDeg: number;
  readonly worstAt: readonly [number, number, number] | null;
  readonly degenerate: number;
  readonly note: string;
}

/** Straight up: the direction a printed part leaves its bed, and the default
 *  a body-in-white half is pulled in when nobody has said otherwise. */
const DEFAULT_PULL: readonly [number, number, number] = [0, 0, 1];
const DEFAULT_MIN_DRAFT = 3;

export function draftMap(mesh: DraftMesh, opts: DraftOptions = {}): DraftResult {
  const raw = opts.pull ?? DEFAULT_PULL;
  const pl = nsqrt(raw[0] * raw[0] + raw[1] * raw[1] + raw[2] * raw[2]);
  if (!(pl > 0)) throw new Error("draft: pull direction is zero");
  const pull: readonly [number, number, number] = [raw[0] / pl, raw[1] / pl, raw[2] / pl];
  const minDraft = opts.minDraftDeg ?? DEFAULT_MIN_DRAFT;

  const n = mesh.normals.length / 3;
  const draftDeg = new Float64Array(n);
  let degenerate = 0;
  let worstDeg = Infinity;
  let worstVert = -1;

  for (let i = 0; i < n; i++) {
    const x = mesh.normals[i * 3]!, y = mesh.normals[i * 3 + 1]!, z = mesh.normals[i * 3 + 2]!;
    const len = nsqrt(x * x + y * y + z * z);
    if (!(len > 0)) {
      degenerate++;
      draftDeg[i] = NaN;
      continue;
    }
    const c = (x * pull[0] + y * pull[1] + z * pull[2]) / len;
    const clamped = c > 1 ? 1 : c < -1 ? -1 : c;
    // 90° − acos(c) is asin(c), and asin is the better-conditioned of the two
    // near zero draft, which is exactly where the answer matters.
    const deg = (nasin(clamped) * 180) / PI;
    draftDeg[i] = deg;
    if (deg < worstDeg) { worstDeg = deg; worstVert = i; }
  }

  let undercutTriangles = 0, undercutAreaMm2 = 0;
  let shallowTriangles = 0, shallowAreaMm2 = 0;
  let totalTriangles = 0, totalAreaMm2 = 0;
  for (let t = 0; t + 2 < mesh.indices.length; t += 3) {
    const ia = mesh.indices[t]!, ib = mesh.indices[t + 1]!, ic = mesh.indices[t + 2]!;
    const da = draftDeg[ia]!, db = draftDeg[ib]!, dc = draftDeg[ic]!;
    if (!Number.isFinite(da) || !Number.isFinite(db) || !Number.isFinite(dc)) continue;
    const area = triArea(mesh.positions, ia, ib, ic);
    totalTriangles++;
    totalAreaMm2 += area;
    // Judged on the triangle's worst corner: a face is only as withdrawable as
    // its most locked-in point.
    const worst = Math.min(da, db, dc);
    if (worst < 0) { undercutTriangles++; undercutAreaMm2 += area; }
    else if (worst < minDraft) { shallowTriangles++; shallowAreaMm2 += area; }
  }

  return {
    draftDeg, pull, minDraftDeg: minDraft,
    undercutTriangles, undercutAreaMm2,
    shallowTriangles, shallowAreaMm2,
    totalTriangles, totalAreaMm2,
    worstDeg: Number.isFinite(worstDeg) ? worstDeg : 0,
    worstAt: worstVert < 0 ? null : [
      mesh.positions[worstVert * 3]!,
      mesh.positions[worstVert * 3 + 1]!,
      mesh.positions[worstVert * 3 + 2]!,
    ],
    degenerate,
    note:
      `Draft against [${pull.map((v) => v.toFixed(2)).join(", ")}]: 90° means the ` +
      "face looks straight along the pull, 0° is a wall parallel to it, and " +
      "negative is an undercut that does not come out without a slide. " +
      "Judged per triangle on its worst corner. It reports against ONE " +
      "direction; where a body is split is a design decision, not this lens's.",
  };
}

function triArea(p: Float64Array, a: number, b: number, c: number): number {
  const ux = p[b * 3]! - p[a * 3]!, uy = p[b * 3 + 1]! - p[a * 3 + 1]!, uz = p[b * 3 + 2]! - p[a * 3 + 2]!;
  const vx = p[c * 3]! - p[a * 3]!, vy = p[c * 3 + 1]! - p[a * 3 + 1]!, vz = p[c * 3 + 2]! - p[a * 3 + 2]!;
  const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
  return nsqrt(cx * cx + cy * cy + cz * cz) / 2;
}

/** The share of the body, by area, that a tool pulled this way cannot release. */
export const undercutFraction = (r: DraftResult): number =>
  r.totalAreaMm2 > 0 ? r.undercutAreaMm2 / r.totalAreaMm2 : 0;

/** …and the share that would come out but drag on the way. */
export const shallowFraction = (r: DraftResult): number =>
  r.totalAreaMm2 > 0 ? r.shallowAreaMm2 / r.totalAreaMm2 : 0;

/** Absolute draft, for a body that will be split into two halves pulled
 *  opposite ways: what matters then is the angle, not which half it belongs to. */
export const twoSidedDraftDeg = (r: DraftResult, i: number): number => nabs(r.draftDeg[i]!);
