/**
 * Panels — the partition that lets the instrument tell three different things
 * apart instead of calling them all "creased".
 *
 * A shutline is a gap between two pieces of metal. A feature line is a fold in
 * one piece. A smooth seam is a surfacing subdivision that must be invisible.
 * Continuity is judged inside a panel and gap across one, and neither question
 * can be asked without knowing which cells are the same piece.
 */

import { describe, expect, it } from "vitest";
import type { Id, QuiltSpec } from "@car/schema";
import { panelsOf, bySize, quiltAdjacency } from "@car/surface";
import { boxQuilt, splitTopBoxQuilt } from "../../mesh/test/fixtures.js";

const withMarks = (
  quilt: QuiltSpec, creases: readonly Id[], gaps: readonly Id[],
): QuiltSpec => ({ ...quilt, creases: new Set(creases), gaps: new Set(gaps) });

describe("panels", () => {
  it("is one panel when nothing is gapped, however much is creased", () => {
    const { quilt } = boxQuilt();
    const every = [...quilt.curves.keys()];
    const bare = panelsOf(withMarks(quilt, [], []));
    const creased = panelsOf(withMarks(quilt, every, []));
    expect(bare.panels.length).toBe(1);
    expect(creased.panels.length).toBe(1);
    // Creasing every curve changes what the seams ARE without splitting the
    // body: a fold is not a gap.
    expect(bare.features).toBe(0);
    expect(creased.features).toBe(creased.seams.length);
    expect(creased.smooth).toBe(0);
    expect(creased.shutlines).toBe(0);
  });

  it("splits at a gap, and only at a gap", () => {
    const { quilt } = boxQuilt();
    const adj = quiltAdjacency(quilt);
    const onOneSeam = adj.edges[0]!.curveId;
    const split = panelsOf(withMarks(quilt, [], [onOneSeam]));
    expect(split.shutlines).toBeGreaterThan(0);
    // A box is a closed shell, so cutting one curve does not always disconnect
    // it — what must hold is that every seam on that curve is a shutline and
    // no other seam is.
    for (const s of split.seams) {
      expect(s.kind).toBe(s.edge.curveId === onOneSeam ? "shutline" : "smooth");
    }
  });

  it("cuts a body into the pieces the gaps describe", () => {
    // Gap every curve: every cell is then its own panel.
    const { quilt } = boxQuilt();
    const all = panelsOf(withMarks(quilt, [], [...quilt.curves.keys()]));
    expect(all.panels.length).toBe(quilt.cells.length);
    expect(all.isolated).toBe(quilt.cells.length);
    expect(all.smooth).toBe(0);
    expect(all.features).toBe(0);
  });

  it("a gapped curve is a shutline even when it is also creased", () => {
    // A door cut is both — hard edge and real gap — and the gap is what
    // decides whether the two sides are the same piece of metal.
    const { quilt } = boxQuilt();
    const adj = quiltAdjacency(quilt);
    const id = adj.edges[0]!.curveId;
    const both = panelsOf(withMarks(quilt, [id], [id]));
    for (const s of both.seams) {
      if (s.edge.curveId === id) expect(s.kind).toBe("shutline");
    }
  });

  it("gives every cell exactly one panel, and names them from the quilt alone", () => {
    const { quilt } = splitTopBoxQuilt();
    const marked = withMarks(quilt, [], [...quilt.curves.keys()].slice(0, 2));
    const a = panelsOf(marked);
    const b = panelsOf(marked);
    const seen = new Set<Id>();
    for (const p of a.panels) for (const c of p.cells) {
      expect(seen.has(c)).toBe(false);
      seen.add(c);
    }
    expect(seen.size).toBe(quilt.cells.length);
    // Deterministic: same quilt, same partition, same numbering.
    expect(a.panels.map((p) => p.cells)).toEqual(b.panels.map((p) => p.cells));
  });

  it("counts a panel's own seams against itself", () => {
    const { quilt } = boxQuilt();
    const r = panelsOf(withMarks(quilt, [], []));
    const p = bySize(r)[0]!;
    expect(p.cells.length).toBe(quilt.cells.length);
    expect(p.interiorSeams).toBe(r.seams.length);
    expect(p.shutlines).toBe(0);
  });
});
