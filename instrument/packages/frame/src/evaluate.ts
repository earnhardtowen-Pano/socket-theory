/**
 * Evaluated output of a FrameState — pure derivation, never storage.
 *
 * Symmetry law (statute §3 / Article VIII): the car mirrors across Y=0 at
 * evaluation only. Cells with mirror=="auto" whose own geometry is not
 * centered on the centerline emit a derived twin under "<cellId>~m", with
 * their curves mirrored under "<curveId>~m". mirror-detach records the
 * asymmetry and suppresses the twin. Nothing here is ever saved.
 *
 * All traversals that produce output are sorted by stable ID.
 */

import type { CurveChain, Id, QuiltCell, QuiltSide, QuiltSpec } from "@car/schema";
import { evalChain, mapChain, mirrorY } from "@car/num";
import type { Pt3 } from "@car/schema";
import { chainControlBuffer, samePt, sideParamToCurveParam, subChain } from "./geometry.js";
import { idCompare, type Cell, type SideRef } from "./records.js";
import type { FrameState } from "./state.js";

export interface EvaluatedObject {
  readonly id: string;
  readonly buffers: Float64Array[];
}

const MIRROR_SUFFIX = "~m";
export const mirrorId = (id: Id): Id => `${id}${MIRROR_SUFFIX}` as Id;

/** Fixed side sampling for the centered-on-centerline test. */
const CENTER_SAMPLES = [0, 0.25, 0.5, 0.75, 1] as const;

function sideSamplePoints(state: FrameState, side: SideRef): Pt3[] {
  const curve = state.curves.get(state.resolveCurve(side.curveId));
  if (!curve) throw new Error(`evaluate: unknown curve ${side.curveId}`);
  return CENTER_SAMPLES.map((u) =>
    evalChain(curve.chain, sideParamToCurveParam(side.t0, side.t1, side.reversed, u)),
  );
}

/**
 * A cell is centered on the centerline when mirroring its sampled boundary
 * maps the point bag onto itself — such a cell IS its own mirror and gets
 * no twin.
 */
export function isCenteredOnCenterline(state: FrameState, cell: Cell): boolean {
  const bag: Pt3[] = [];
  for (const side of cell.sides) bag.push(...sideSamplePoints(state, side));
  const mirrored = bag.map(mirrorY);
  const sortKey = (a: Pt3, b: Pt3): number => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
  const a = [...bag].sort(sortKey);
  const b = [...mirrored].sort(sortKey);
  for (let i = 0; i < a.length; i++) {
    const pa = a[i];
    const pb = b[i];
    if (!pa || !pb || !samePt(pa, pb)) return false;
  }
  return true;
}

export interface MirrorTwin {
  readonly id: Id; // "<cellId>~m"
  readonly sides: readonly [SideRef, SideRef, SideRef, SideRef];
}

/**
 * Quantized canonical signature of a sampled boundary point bag.
 *
 * The quantizer has to be SIGN-SYMMETRIC, because the only thing this
 * signature is ever asked is whether a bag equals its own y-mirror.
 * Math.round breaks ties toward +Infinity, so a coordinate landing exactly on
 * a half-step rounds to a different magnitude on the two sides of the car:
 * +928.4285715 and -928.4285715 come back 928.428572 and -928.428571, the
 * signatures miss, and a self-symmetric cell is handed a phantom twin that
 * double-covers it and opens the mesh. Two deck cells out of thirteen hit it
 * on the P1 windshield, which is exactly how a tie-break bug presents: rare,
 * geometry-dependent, and nothing to do with the cells that fail.
 * Rounding the magnitude and restoring the sign is symmetric by construction.
 */
function bagSignature(points: readonly Pt3[]): string {
  const q = (x: number): number => {
    const a = Math.abs(x);
    if (a === 0) return 0;
    // Two rounds, and both are load-bearing. toPrecision(12) collapses the
    // 1-ULP difference between the two sides — 553.9453125 on one flank came
    // back 553.94531249999994 on the other — so the magnitudes are BIT-EQUAL
    // before the grid round, which makes every step after this identical for
    // +y and -y. Rounding the magnitude and restoring the sign then breaks
    // ties the same way on both sides, where Math.round(x * 1e6) breaks them
    // toward +Infinity and hands the two sides different buckets.
    const snapped = Number(a.toPrecision(12));
    const r = Math.round(snapped * 1e6) / 1e6;
    return r === 0 ? 0 : x < 0 ? -r : r;   // never -0: it stringifies apart from 0
  };
  const sortKey = (a: Pt3, b: Pt3): number => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
  return points
    .map((p): Pt3 => [q(p[0]), q(p[1]), q(p[2])])
    .sort(sortKey)
    .map((p) => `${p[0]},${p[1]},${p[2]}`)
    .join(";");
}

function cellBag(state: FrameState, cell: Cell): Pt3[] {
  const bag: Pt3[] = [];
  for (const side of cell.sides) bag.push(...sideSamplePoints(state, side));
  return bag;
}

export interface MirrorEvaluation {
  readonly twins: readonly MirrorTwin[];
  /** "<curveId>~m" -> mirrored chain, for every curve a twin references. */
  readonly mirroredCurves: ReadonlyMap<Id, CurveChain>;
  /** "<curveId>~m" -> the source curve id (for crease/gap propagation). */
  readonly mirroredSource: ReadonlyMap<Id, Id>;
}

/**
 * Derive the mirror twins. Loop order is reversed so twins stay CCW from
 * outside. A cell earns a twin only when its mirror image does not already
 * exist in the model: a self-symmetric cell is its own mirror, and a body
 * that straddles the centerline already contains the mirror of each of its
 * side faces — emitting twins there would double panels and open the mesh
 * (found at first end-to-end integration; the per-cell centered test alone
 * double-emitted the side faces of centered boxes).
 */
export function evaluateMirrors(state: FrameState): MirrorEvaluation {
  const twins: MirrorTwin[] = [];
  const mirroredCurves = new Map<Id, CurveChain>();
  const mirroredSource = new Map<Id, Id>();
  const cellIds = [...state.cells.keys()].sort(idCompare);
  const existing = new Set<string>();
  for (const cellId of cellIds) {
    const cell = state.cells.get(cellId);
    if (cell) existing.add(bagSignature(cellBag(state, cell)));
  }
  for (const cellId of cellIds) {
    const cell = state.cells.get(cellId);
    if (!cell || cell.mirror !== "auto") continue;
    if (existing.has(bagSignature(cellBag(state, cell).map(mirrorY)))) continue;
    const flipped = [...cell.sides].reverse().map((s): SideRef => {
      const sourceId = state.resolveCurve(s.curveId);
      const mId = mirrorId(sourceId);
      if (!mirroredCurves.has(mId)) {
        const curve = state.curves.get(sourceId);
        if (!curve) throw new Error(`evaluate: unknown curve ${sourceId}`);
        mirroredCurves.set(mId, mapChain(curve.chain, mirrorY));
        mirroredSource.set(mId, sourceId);
      }
      return { curveId: mId, t0: s.t0, t1: s.t1, reversed: !s.reversed };
    }) as [SideRef, SideRef, SideRef, SideRef];
    twins.push({ id: mirrorId(cellId), sides: flipped });
  }
  return { twins, mirroredCurves, mirroredSource };
}

function sideBuffers(
  sides: readonly SideRef[],
  chainOf: (curveId: Id) => CurveChain,
): Float64Array[] {
  return sides.map((s) => chainControlBuffer(subChain(chainOf(s.curveId), s.t0, s.t1, s.reversed)));
}

/**
 * The replay-hash feed: for every cell (and mirror twin) the four side
 * sub-chain control polygons; for every curve (and mirrored curve) its chain
 * control points flattened. Deterministic and ID-sorted.
 */
export function computeEvaluatedBuffers(state: FrameState): EvaluatedObject[] {
  const mirrors = evaluateMirrors(state);
  const liveChain = (curveId: Id): CurveChain => {
    const c = state.curves.get(state.resolveCurve(curveId));
    if (!c) throw new Error(`evaluate: unknown curve ${curveId}`);
    return c.chain;
  };
  const twinChain = (curveId: Id): CurveChain => {
    const c = mirrors.mirroredCurves.get(curveId);
    if (!c) throw new Error(`evaluate: missing mirrored curve ${curveId}`);
    return c;
  };

  const out: EvaluatedObject[] = [];
  for (const cellId of [...state.cells.keys()].sort(idCompare)) {
    const cell = state.cells.get(cellId);
    if (!cell) continue;
    out.push({ id: cellId, buffers: sideBuffers(cell.sides, liveChain) });
  }
  for (const twin of mirrors.twins) {
    out.push({ id: twin.id, buffers: sideBuffers(twin.sides, twinChain) });
  }
  for (const curveId of [...state.curves.keys()].sort(idCompare)) {
    const curve = state.curves.get(curveId);
    if (!curve) continue;
    out.push({ id: curveId, buffers: [chainControlBuffer(curve.chain)] });
  }
  for (const mId of [...mirrors.mirroredCurves.keys()].sort(idCompare)) {
    out.push({ id: mId, buffers: [chainControlBuffer(twinChain(mId))] });
  }
  out.sort((a, b) => idCompare(a.id, b.id));
  return out;
}

/** The QuiltSpec seam: cells (twins included), curve map, crease and gap sets. */
export function computeQuilt(state: FrameState): QuiltSpec {
  const mirrors = evaluateMirrors(state);
  const cells: QuiltCell[] = [];
  const toQuiltSides = (sides: readonly SideRef[]): [QuiltSide, QuiltSide, QuiltSide, QuiltSide] =>
    sides.map((s) => ({
      curveId: s.curveId, t0: s.t0, t1: s.t1, reversed: s.reversed,
    })) as [QuiltSide, QuiltSide, QuiltSide, QuiltSide];

  for (const cellId of [...state.cells.keys()].sort(idCompare)) {
    const cell = state.cells.get(cellId);
    if (!cell) continue;
    const resolved = cell.sides.map((s): SideRef => ({ ...s, curveId: state.resolveCurve(s.curveId) }));
    cells.push({ id: cellId, sides: toQuiltSides(resolved) });
  }
  for (const twin of mirrors.twins) {
    cells.push({ id: twin.id, sides: toQuiltSides(twin.sides) });
  }
  cells.sort((a, b) => idCompare(a.id, b.id));

  const curves = new Map<Id, CurveChain>();
  const creases = new Set<Id>();
  const gaps = new Set<Id>();
  for (const curveId of [...state.curves.keys()].sort(idCompare)) {
    const curve = state.curves.get(curveId);
    if (!curve) continue;
    curves.set(curveId, curve.chain);
    if (curve.crease) creases.add(curveId);
    if (curve.gap) gaps.add(curveId);
  }
  for (const mId of [...mirrors.mirroredCurves.keys()].sort(idCompare)) {
    const chain = mirrors.mirroredCurves.get(mId);
    const sourceId = mirrors.mirroredSource.get(mId);
    if (!chain || !sourceId) continue;
    curves.set(mId, chain);
    const source = state.curves.get(sourceId);
    if (source?.crease) creases.add(mId);
    if (source?.gap) gaps.add(mId);
  }
  return { cells, curves, creases, gaps };
}
