/**
 * How far a continuity correction moves the body.
 *
 * WHY THIS WAS MISSING AND WHY THAT MATTERED. Every probe in this package
 * measures agreement at a seam: do the tangent planes match, do the curvatures
 * match, how badly does the network obstruct. None of them measures the thing
 * the designer would notice first — that the surface is no longer where it was
 * put. A correction can drive every seam to machine zero and inflate a panel by
 * a hand's width, and the instrument would report a perfect body.
 *
 * That is not hypothetical. On the P1 the curvature term moves 26 of 80 cells
 * by more than a millimetre, which is ordinary and correct, and moves `cell#1`
 * — the tail panel carrying the four corners the curve network cannot close —
 * by EIGHTY-NINE MILLIMETRES. Δ² is proportional to the transverse length
 * SQUARED times the curvature disagreement, so a join that disagrees badly gets
 * a correction of thousands, and Ψ carries it into the middle of the patch. The
 * defect had been shipping since the G2 layer landed and nothing here could see
 * it, because nothing here was looking at position.
 *
 * WHAT IT DOES NOT DO. It does not cap anything. A correction that moves the
 * body a long way is sometimes right — the whole point of the field is to move
 * the surface — and deciding where the line is means choosing a threshold,
 * which is a design decision and belongs to whoever owns the car. This reports
 * and ranks, worst first, and lets that decision be made on evidence.
 *
 * INTERIOR ONLY. The boundaries are bit-identical by construction in every
 * form, so sampling them would only dilute the numbers with a column of exact
 * zeros. The grid is strictly inside the patch.
 */

import type { Id, QuiltSpec } from "@car/schema";
import { dist3 } from "@car/num";
import { idCompare } from "@car/frame";
import { cellBoundary, type CrossPrescription } from "./boundary.js";
import { boundaryCoonsPoint } from "./coons.js";

export interface CellDisplacement {
  readonly cellId: Id;
  /** Largest distance between the two surfaces over the interior grid, mm. */
  readonly mm: number;
}

export interface DisplacementReport {
  /** Every cell, worst first. */
  readonly cells: readonly CellDisplacement[];
  readonly median: number;
  readonly p90: number;
  readonly worst: number;
  readonly worstCell: Id | null;
  /** Cells moved further than 1 mm, and further than 10 mm. */
  readonly overMillimetre: number;
  readonly overCentimetre: number;
  readonly samplesPerCell: number;
  readonly note: string;
}

export interface DisplacementOptions {
  /** The correction being measured. */
  readonly cross: CrossPrescription;
  /** What to measure it against. Omit for the plain Coons blend. */
  readonly against?: CrossPrescription;
  /** Interior grid resolution per direction. */
  readonly grid?: number;
}

const DEFAULT_GRID = 16;

export function fieldDisplacement(
  quilt: QuiltSpec,
  opts: DisplacementOptions,
): DisplacementReport {
  const n = Math.max(3, Math.floor(opts.grid ?? DEFAULT_GRID));
  const cells: CellDisplacement[] = [];
  for (const cell of [...quilt.cells].sort((a, b) => idCompare(a.id, b.id))) {
    const a = cellBoundary(cell, quilt, opts.against);
    const b = cellBoundary(cell, quilt, opts.cross);
    let worst = 0;
    for (let i = 1; i < n; i++) {
      for (let j = 1; j < n; j++) {
        const d = dist3(boundaryCoonsPoint(a, i / n, j / n), boundaryCoonsPoint(b, i / n, j / n));
        if (d > worst) worst = d;
      }
    }
    cells.push({ cellId: cell.id, mm: worst });
  }

  const sorted = [...cells].sort((x, y) => y.mm - x.mm || idCompare(x.cellId, y.cellId));
  const byValue = cells.map((c) => c.mm).sort((x, y) => x - y);
  const at = (f: number): number =>
    byValue.length === 0 ? 0 : byValue[Math.min(byValue.length - 1, Math.floor(f * byValue.length))]!;

  return {
    cells: sorted,
    median: at(0.5),
    p90: at(0.9),
    worst: sorted.length === 0 ? 0 : sorted[0]!.mm,
    worstCell: sorted.length === 0 ? null : sorted[0]!.cellId,
    overMillimetre: cells.filter((c) => c.mm > 1).length,
    overCentimetre: cells.filter((c) => c.mm > 10).length,
    samplesPerCell: (n - 1) * (n - 1),
    note:
      "Largest distance between the corrected surface and what it is measured " +
      "against, per cell, over an interior grid. Boundaries are excluded " +
      "because they are bit-identical by construction and would only dilute it.",
  };
}
