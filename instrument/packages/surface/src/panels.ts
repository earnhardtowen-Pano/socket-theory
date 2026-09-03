/**
 * Panels — which cells are the same piece of metal.
 *
 * The quilt is a set of four-sided cells, and every seam between two of them
 * has been one undifferentiated thing: "creased" or "not". That is not enough
 * to say anything true about a body, because three completely different things
 * look identical to it:
 *
 *   SHUTLINE      the two cells are DIFFERENT PANELS. A door against a quarter.
 *                 There is a real gap between them, they are stamped
 *                 separately, and asking whether their tangent planes agree is
 *                 asking the wrong question — what matters is gap and flush.
 *   FEATURE LINE  the two cells are the SAME panel, with a crease running
 *                 through it. One piece of metal, folded. The break is
 *                 authored and correct, and both sides have to come out of one
 *                 die.
 *   SMOOTH SEAM   the two cells are the same panel and there is nothing there
 *                 at all. The seam is a surfacing subdivision and it must be
 *                 invisible: G1 at least, and the field's whole job.
 *
 * The mark that separates them already exists — amendment A10 gave `gap` its
 * own verb precisely so a shutline would stop being a crease — and nothing was
 * reading it. A panel is a connected component of the cell graph with the
 * GAP curves cut, and that one sentence is the whole of this file.
 *
 * WHAT IT BUYS. Continuity is judged inside a panel and gap is judged across
 * one. Fullness is a property of a panel, not of a cell — a door skin is
 * crowned as one piece. Draft is asked of a panel, because a panel is what
 * comes out of a die. None of those questions can even be phrased without
 * this partition.
 *
 * Deterministic: cells in ID order, components numbered in the order their
 * lowest-ID member is reached, so the same quilt always yields the same panels
 * with the same names.
 */

import type { Id, QuiltSpec } from "@car/schema";
import { idCompare } from "@car/frame";
import { quiltAdjacency, type QuiltAdjacency, type SharedEdge } from "./adjacency.js";

export type SeamKind = "shutline" | "feature" | "smooth";

export interface Seam {
  readonly edge: SharedEdge;
  readonly kind: SeamKind;
  /** Panel index of each side. Equal for everything but a shutline. */
  readonly panelA: number;
  readonly panelB: number;
}

export interface Panel {
  readonly index: number;
  /** Cells making up this piece, ID-ordered. */
  readonly cells: readonly Id[];
  /** Seams inside it — the ones continuity is judged on. */
  readonly interiorSeams: number;
  /** Of those, the ones authored as feature lines. */
  readonly featureSeams: number;
  /** Shutlines on its border. */
  readonly shutlines: number;
}

export interface PanelReport {
  readonly panels: readonly Panel[];
  readonly seams: readonly Seam[];
  readonly shutlines: number;
  readonly features: number;
  readonly smooth: number;
  /** Cells that touch no other cell — a panel of one. */
  readonly isolated: number;
  readonly note: string;
}

export function panelsOf(quilt: QuiltSpec, adjacency?: QuiltAdjacency): PanelReport {
  const adj = adjacency ?? quiltAdjacency(quilt);
  const cells = [...quilt.cells].map((c) => c.id).sort(idCompare);
  const index = new Map<Id, number>();
  cells.forEach((id, i) => index.set(id, i));

  // Union-find over cells, joining across every seam that is NOT a shutline.
  const parent = cells.map((_, i) => i);
  const find = (i: number): number => {
    let r = i;
    while (parent[r] !== r) r = parent[r]!;
    while (parent[i] !== r) { const next = parent[i]!; parent[i] = r; i = next; }
    return r;
  };
  const union = (a: number, b: number): void => {
    const ra = find(a), rb = find(b);
    // Lower root wins, so the component's identity is its lowest-ID member and
    // the numbering below is a function of the quilt rather than of the walk.
    if (ra < rb) parent[rb] = ra; else if (rb < ra) parent[ra] = rb;
  };

  const kindOf = (e: SharedEdge): SeamKind =>
    quilt.gaps.has(e.curveId) ? "shutline" : e.creased ? "feature" : "smooth";

  for (const e of adj.edges) {
    if (kindOf(e) === "shutline") continue;
    const a = index.get(e.a.cellId), b = index.get(e.b.cellId);
    if (a === undefined || b === undefined) continue;
    union(a, b);
  }

  // Number the components by the order their root appears in ID order.
  const number = new Map<number, number>();
  for (let i = 0; i < cells.length; i++) {
    const r = find(i);
    if (!number.has(r)) number.set(r, number.size);
  }
  const members: Id[][] = Array.from({ length: number.size }, () => []);
  for (let i = 0; i < cells.length; i++) members[number.get(find(i))!]!.push(cells[i]!);

  const seams: Seam[] = adj.edges.map((edge) => {
    const a = index.get(edge.a.cellId), b = index.get(edge.b.cellId);
    return {
      edge,
      kind: kindOf(edge),
      panelA: a === undefined ? -1 : number.get(find(a))!,
      panelB: b === undefined ? -1 : number.get(find(b))!,
    };
  });

  const interior = new Int32Array(number.size);
  const feature = new Int32Array(number.size);
  const shut = new Int32Array(number.size);
  for (const s of seams) {
    if (s.kind === "shutline") {
      if (s.panelA >= 0) shut[s.panelA]!++;
      if (s.panelB >= 0 && s.panelB !== s.panelA) shut[s.panelB]!++;
      continue;
    }
    if (s.panelA >= 0) {
      interior[s.panelA]!++;
      if (s.kind === "feature") feature[s.panelA]!++;
    }
  }

  const panels: Panel[] = members.map((cs, i) => ({
    index: i,
    cells: cs,
    interiorSeams: interior[i]!,
    featureSeams: feature[i]!,
    shutlines: shut[i]!,
  }));

  return {
    panels,
    seams,
    shutlines: seams.filter((s) => s.kind === "shutline").length,
    features: seams.filter((s) => s.kind === "feature").length,
    smooth: seams.filter((s) => s.kind === "smooth").length,
    isolated: panels.filter((p) => p.cells.length === 1).length,
    note:
      "A panel is a connected component of the cell graph with the GAP curves " +
      "cut. Continuity is judged inside a panel; gap and flush are judged " +
      "across one. A creased curve that is not gapped is a feature line — one " +
      "piece of metal with a fold in it — and both sides still have to come " +
      "out of the same die.",
  };
}

/** Panels ordered largest first — the way a body is read. */
export const bySize = (r: PanelReport): readonly Panel[] =>
  [...r.panels].sort((a, b) => b.cells.length - a.cells.length || a.index - b.index);
