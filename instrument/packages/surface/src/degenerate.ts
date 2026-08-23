/**
 * Degenerate patches — four-sided cells with a side of zero length.
 *
 * WHY IT IS WORTH A REPORT. A Coons patch with a collapsed side is a triangle
 * wearing a quadrilateral's clothes. At the collapsed corner it has no tangent
 * plane, no normal and no curvature: the two partials are parallel, their
 * cross product is zero, and every downstream measurement either reports
 * nonsense or reports nothing. The curvature lens on the P1 marks six per cent
 * of its print vertices unmeasurable for exactly this reason, and a Class-A
 * audit rejects a degenerate patch outright rather than measuring it.
 *
 * It is LEGAL here, and deliberately so — the `taper` verb makes one on
 * purpose, `pyramidQuilt` tests one, and a nose or a tail fan is the honest way
 * to close a form with the verbs that exist. So this is a report and not a
 * lint: it says where they are and how many, and leaves whether to re-author
 * them to whoever owns the car.
 *
 * THE TEST IS THE MESHER'S OWN. `buildSampleTable` decides a side is collapsed
 * when its trim is empty or its two endpoints land on the same point, exactly:
 * `lo === hi || samePos(...)`, no tolerance. This asks the same question of the
 * same numbers rather than inventing a second definition — a second one would
 * eventually disagree, and then the report would be about a body the mesher is
 * not building.
 */

import type { Id, Pt3, QuiltSpec } from "@car/schema";
import { idCompare } from "@car/frame";
import { cellBoundary } from "./boundary.js";

export interface CollapsedSide {
  readonly cellId: Id;
  /** Loop side index 0..3. */
  readonly k: number;
  readonly curveId: Id;
  /** Where the side collapses to. */
  readonly at: Pt3;
  readonly reason: "empty-trim" | "coincident-ends";
}

export interface DegenerateReport {
  /** Cells carrying at least one collapsed side. */
  readonly cells: number;
  readonly totalCells: number;
  /** Collapsed sides, which can be more than one per cell. */
  readonly sides: number;
  /** Every one of them, cell-ID ordered. The work list. */
  readonly list: readonly CollapsedSide[];
  readonly note: string;
}

const samePos = (a: Pt3, b: Pt3): boolean =>
  a[0] === b[0] && a[1] === b[1] && a[2] === b[2];

export function degeneratePatches(quilt: QuiltSpec): DegenerateReport {
  const list: CollapsedSide[] = [];
  const cells = [...quilt.cells].sort((a, b) => idCompare(a.id, b.id));
  let withOne = 0;

  for (const cell of cells) {
    const b = cellBoundary(cell, quilt);
    let any = false;
    for (let k = 0; k < 4; k++) {
      const side = b.sides[k]!;
      const lo = Math.min(side.t0, side.t1);
      const hi = Math.max(side.t0, side.t1);
      const atLo = side.atCurveParam(lo);
      const atHi = side.atCurveParam(hi);
      if (lo === hi) {
        list.push({ cellId: cell.id, k, curveId: side.curveId, at: atLo, reason: "empty-trim" });
        any = true;
      } else if (samePos(atLo, atHi)) {
        list.push({
          cellId: cell.id, k, curveId: side.curveId, at: atLo, reason: "coincident-ends",
        });
        any = true;
      }
    }
    if (any) withOne++;
  }

  return {
    cells: withOne,
    totalCells: cells.length,
    sides: list.length,
    list,
    note:
      "A cell side of zero length. The patch has no tangent plane at that " +
      "corner, so no normal and no curvature — legal under the statute, which " +
      "has a verb for making them, and rejected by a Class-A audit.",
  };
}
