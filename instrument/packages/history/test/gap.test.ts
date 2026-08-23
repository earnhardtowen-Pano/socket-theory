/**
 * The gap mark — amendment A10.
 *
 * A crease is a TANGENT BREAK. A gap is a HOLE between two panels. The statute
 * has always treated them as different things and depended on the difference:
 * clause 24 has panels either side of a gap referencing the same authored gap
 * curve, and amendment A2 rules that a shutline does not break flow unless it
 * sits on a character line. `FrameState.markGap` was always there. The verb to
 * reach it was not, so no curve in any document could be a gap and everything
 * downstream that wanted one read the crease set instead.
 *
 * These tests pin the two marks apart, in both directions.
 */

import { describe, expect, it } from "vitest";
import { buildFixture, load, type Session } from "@car/history";
import { computeQuilt } from "@car/frame";
import type { Id } from "@car/schema";

const boxSession = (): Session => buildFixture("single-box");
const firstCurve = (s: Session): Id => [...s.state.curves.keys()][0]!;

describe("the gap mark", () => {
  it("is a different mark from a crease, in both directions", () => {
    const s = boxSession();
    const [a, b] = [...s.state.curves.keys()] as [Id, Id];
    s.apply("crease", { curveId: a });
    s.apply("gap", { curveId: b });

    const q = computeQuilt(s.state);
    expect(q.creases.has(a)).toBe(true);
    expect(q.gaps.has(a)).toBe(false);
    expect(q.gaps.has(b)).toBe(true);
    expect(q.creases.has(b)).toBe(false);
  });

  it("carries both when a shutline sits on a character line (A2)", () => {
    const s = boxSession();
    const c = firstCurve(s);
    s.apply("crease", { curveId: c });
    s.apply("gap", { curveId: c });
    const q = computeQuilt(s.state);
    expect(q.creases.has(c)).toBe(true);
    expect(q.gaps.has(c)).toBe(true);
  });

  it("replays — it is in the document, not in the evaluation", () => {
    const s = boxSession();
    const c = firstCurve(s);
    s.apply("gap", { curveId: c });
    const doc = s.save();
    expect(doc.verbs.some((v) => v.verb === "gap")).toBe(true);
    expect(computeQuilt(load(doc).state).gaps.has(c)).toBe(true);
  });

  it("rejects a non-curve id, like every other verb that takes one", () => {
    const s = boxSession();
    expect(() => s.apply("gap", { curveId: "cell#0" as Id })).toThrow();
  });

  it("survives a weld — the mark belongs to the surviving curve", () => {
    // Same rule crease already follows: `winner.gap = winner.gap || loser.gap`.
    const s = boxSession();
    const c = firstCurve(s);
    s.apply("gap", { curveId: c });
    const q = computeQuilt(s.state);
    for (const id of q.gaps) expect(q.curves.has(id)).toBe(true);
  });
});
