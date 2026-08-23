/**
 * Corner fairing — amendment A11's capability, and its limits.
 *
 * The verb moves the model, so the tests are about what it refuses to do at
 * least as much as what it does: it must not round off a feature, must not
 * move an endpoint, must not touch a mirror twin, and must leave a watertight
 * body watertight.
 *
 * Every fixture here is synthetic. Nothing in this file reads a car.
 */

import { describe, expect, it } from "vitest";
import { buildFixture, load } from "@car/history";
import { computeQuilt } from "@car/frame";
import { chainEnd, chainStart, dist3 } from "@car/num";
import { closedMeshCheck, meshQuilt } from "@car/mesh";
import {
  continuityProbe, cornerFairing, networkObstruction, DEFAULT_CREASE_ANGLE,
} from "@car/surface";
import type { Id } from "@car/schema";

/** Force every corner to be treated as a fault, however sharp. */
const EVERYTHING = { breakAngleDeg: 179 } as const;

describe("corner fairing: what it refuses", () => {
  it("leaves a box alone — 90° corners are features, not faults", () => {
    const s = buildFixture("single-box");
    const plan = cornerFairing(computeQuilt(s.state));   // default break angle
    expect(plan.breakAngleDeg).toBe(DEFAULT_CREASE_ANGLE);
    expect(plan.open).toBe(0);
    expect(plan.moves).toHaveLength(0);
  });

  it("never proposes a move on a mirror twin", () => {
    // A twin is regenerated from its master every evaluation, so an edit to
    // one would be silently discarded — and would look like the verb failing.
    const plan = cornerFairing(computeQuilt(buildFixture("welded-push").state), EVERYTHING);
    expect(plan.mirrored).toBeGreaterThan(0);
    for (const m of plan.moves) expect(m.curveId.endsWith("~m")).toBe(false);
  });

  it("never moves an endpoint — every weld holds", () => {
    const s = buildFixture("welded-push");
    const ends = new Map<Id, [ReturnType<typeof chainStart>, ReturnType<typeof chainEnd>]>();
    for (const [id, c] of s.state.curves) ends.set(id, [chainStart(c.chain), chainEnd(c.chain)]);

    s.apply("fair-corners", { maxBreakDeg: DEFAULT_CREASE_ANGLE });

    for (const [id, c] of s.state.curves) {
      const [a, b] = ends.get(id)!;
      expect(chainStart(c.chain)).toEqual(a);
      expect(chainEnd(c.chain)).toEqual(b);
    }
  });

  it("keeps the tangent's weight, changing only its direction", () => {
    const s = buildFixture("welded-push");
    const reach = new Map<Id, number>();
    for (const [id, c] of s.state.curves) {
      const seg = c.chain.segs[0]!;
      reach.set(id, dist3(seg.p0, seg.p1));
    }
    s.apply("fair-corners", { maxBreakDeg: DEFAULT_CREASE_ANGLE });
    for (const [id, c] of s.state.curves) {
      const seg = c.chain.segs[0]!;
      expect(dist3(seg.p0, seg.p1)).toBeCloseTo(reach.get(id)!, 9);
    }
  });

  it("rejects a direction that is not one", () => {
    const s = buildFixture("single-box");
    const id = [...s.state.curves.keys()][0]!;
    expect(() => s.state.setEndTangent(id, 0, [0, 0, 0])).toThrow();
    expect(() => s.state.setEndTangent(id, 0, [NaN, 0, 0])).toThrow();
  });
});

describe("corner fairing: what it buys", () => {
  it("closes the obstruction, and the joins with it", () => {
    const s = buildFixture("welded-push");
    const before = networkObstruction(computeQuilt(s.state));
    const beforeJoins = continuityProbe(computeQuilt(s.state));
    expect(before.worstDeg).toBeGreaterThan(1);
    expect(beforeJoins.g1Joins).toBe(0);

    s.apply("fair-corners", { maxBreakDeg: DEFAULT_CREASE_ANGLE });

    const after = networkObstruction(computeQuilt(s.state));
    const afterJoins = continuityProbe(computeQuilt(s.state));
    expect(after.corners).toBe(before.corners);
    expect(after.cleanCorners).toBe(after.corners);
    expect(after.worstDeg).toBeLessThan(1e-9);
    // The point of closing a corner: the join through it becomes G1 end to
    // end, with no fade band left carrying anything.
    expect(afterJoins.g1Joins).toBe(afterJoins.joins);
    expect(afterJoins.worstDeg).toBeLessThan(1e-9);
  });

  it("asks for a small swing where the network is nearly right", () => {
    const plan = cornerFairing(computeQuilt(buildFixture("welded-push").state));
    expect(plan.moves.length).toBeGreaterThan(0);
    // Coplanarity, not tangency. Tangency on this fixture would be ~45°.
    expect(plan.medianSwingDeg).toBeLessThan(15);
  });

  it("changes positions and nothing else — the topology is untouched", () => {
    // The strongest true statement about this verb, and stronger than "the
    // mesh is still closed": because the endpoint never moves, the weld
    // structure and the sample table are identical, so the mesh comes out with
    // the same vertex count, the same index buffer, and the same closed-check
    // result down to the violation count. Only the positions differ.
    //
    // The claim holds for a fairing, not for arbitrary violence. The sample
    // table welds by POSITION, so a deformation large enough to make two
    // previously distinct trim endpoints coincide DOES change the vertex count
    // — forcing 179° onto a box moves it from 2169 to 2316. That is the table
    // working correctly, not the verb misbehaving, and it is why the threshold
    // exists: a fairing is a degree or two, and at that size the topology is
    // untouched.
    const s = buildFixture("welded-push");
    const q0 = computeQuilt(s.state);
    const m0 = meshQuilt(q0, { baseDensity: 8 });
    const r0 = closedMeshCheck(m0);

    s.apply("fair-corners", { maxBreakDeg: DEFAULT_CREASE_ANGLE });

    const m1 = meshQuilt(computeQuilt(s.state), { baseDensity: 8 });
    const r1 = closedMeshCheck(m1);
    expect(m1.positions.length).toBe(m0.positions.length);
    expect([...m1.indices]).toEqual([...m0.indices]);
    expect(r1.closed).toBe(r0.closed);
    expect(r1.violations.length).toBe(r0.violations.length);
    // ...and it did move the geometry, or the test proves nothing.
    let moved = 0;
    for (let i = 0; i < m0.positions.length; i++) {
      if (m1.positions[i] !== m0.positions[i]) moved++;
    }
    expect(moved).toBeGreaterThan(0);
  });

  it("replays — it is in the document, not in the evaluation", () => {
    const s = buildFixture("welded-push");
    s.apply("fair-corners", { maxBreakDeg: DEFAULT_CREASE_ANGLE });
    const doc = s.save();
    expect(doc.verbs.some((v) => v.verb === "fair-corners")).toBe(true);
    const live = networkObstruction(computeQuilt(s.state));
    const replayed = networkObstruction(computeQuilt(load(doc).state));
    expect(replayed.worstDeg).toBe(live.worstDeg);
    expect(replayed.cleanCorners).toBe(live.cleanCorners);
  });

  it("rejects a threshold that is not an angle", () => {
    const s = buildFixture("single-box");
    expect(() => s.apply("fair-corners", { maxBreakDeg: 0 })).toThrow();
    expect(() => s.apply("fair-corners", { maxBreakDeg: 180 })).toThrow();
    expect(() => s.apply("fair-corners", { maxBreakDeg: Number.NaN })).toThrow();
  });
});
