import { describe, expect, it } from "vitest";
import { makeSessionPort } from "../src/sessionPort";
import { fairCorners, gapAt, pushPullDelta, splitAt, TapeBoxTool } from "../src/tools";
import { gridCandidate, snapResolve } from "../src/snap";
import { evalChain } from "@car/num";
import type { Id, Pt3 } from "@car/schema";

/** A taped box, and the one edge that runs its length. */
function boxPort(): { port: ReturnType<typeof makeSessionPort>; long: Id } {
  const port = makeSessionPort(false);
  port.propose("tape", {
    kind: "box",
    rect: { view: { kind: "side" }, a: [0, 0], b: [1200, 400], depth: 600, at: -300 },
  });
  const long = [...port.session.state.curves.keys()].find((id) => {
    const c = port.session.state.curves.get(id)!;
    const a = evalChain(c.chain, 0), b = evalChain(c.chain, 1);
    return Math.abs(b[0] - a[0]) > 1000;
  })!;
  return { port, long };
}

describe("split — A13 reaches a designer's hand", () => {
  // The verb has existed since the wheel arches and the only way to call it
  // was to edit a build script. A verb nobody can invoke is not shipped.

  it("turns a click on a curve into a parameter on that curve", () => {
    const { port, long } = boxPort();
    const chain = port.session.state.curves.get(long)!.chain;
    const at = evalChain(chain, 0.37);
    const t = port.curveParamAt!(long, at);
    expect(t).not.toBeNull();
    expect(t!).toBeCloseTo(0.37, 6);
  });

  it("says a point off the curve is off the curve, rather than snapping", () => {
    const { port, long } = boxPort();
    expect(port.curveParamAt!(long, [600, 9000, 9000] as Pt3)).toBeNull();
  });

  it("refuses everything that is not a curve pick, and says why", () => {
    const paramOf = () => 0.5;
    const legal = () => [0.5];
    const curve = { kind: "curve", id: "curve#0" } as never;
    expect(splitAt(null, paramOf, legal).status).toMatch(/pick a curve/);
    expect(splitAt({ kind: "cell", id: "cell#0" } as never, paramOf, legal).status).toMatch(/pick a curve/);
    expect(splitAt(curve, () => null, legal).status).toMatch(/not on the curve/);
    expect(splitAt(curve, paramOf, () => []).status).toMatch(/nothing crosses/);
    expect(splitAt(curve, paramOf, () => [0.005]).status).toMatch(/at an end/);
  });

  it("snaps to the nearest crossing, because the legal set is discrete", () => {
    // The whole reason the tool takes the legal set at all. A cell claiming
    // across a split is refused, so a raw click is a refusal nine times in ten
    // and the frame's "cell#41 claims across" is true and useless to a hand.
    const curve = { kind: "curve", id: "curve#7" } as never;
    const r = splitAt(curve, () => 0.44, () => [0.2, 0.5, 0.8]);
    expect(r.proposal).toEqual({ verb: "split-curve", args: { curveId: "curve#7", t: 0.5 } });
    expect(r.status).toMatch(/snapped 6.0% along/);
    // A click already on a crossing says so without the snap note.
    expect(splitAt(curve, () => 0.5, () => [0.2, 0.5, 0.8]).status).not.toMatch(/snapped/);
  });

  it("splits for real, and the split moves nothing", () => {
    const { port, long } = boxPort();
    // Cut the box first: a cell claiming across the split is refused by law.
    for (const id of [...port.session.state.cells.keys()]) {
      port.propose("tape", {
        kind: "line",
        line: { view: { kind: "side" }, a: [600, -200], b: [600, 600], lineClass: "tape" },
        targets: [id],
      });
    }
    const before = port.feed().surfaces.positions.slice();
    const curves = port.session.state.curves.size;

    const chain = port.session.state.curves.get(long)!.chain;
    const r = splitAt(
      { kind: "curve", id: long, at: evalChain(chain, 0.5) } as never,
      (id, at) => port.curveParamAt!(id, at),
      (id) => port.curveSplitPoints!(id),
    );
    expect(r.proposal?.verb).toBe("split-curve");
    port.propose(r.proposal!.verb, r.proposal!.args);
    expect(port.lastError()).toBeNull();
    expect(port.session.state.curves.size).toBe(curves + 1);

    // The whole claim of A13: bookkeeping changed, geometry did not.
    const after = port.feed().surfaces.positions;
    expect(after.length).toBe(before.length);
    for (let i = 0; i < before.length; i++) expect(after[i]!).toBeCloseTo(before[i]!, 6);
  });

  it("passes the frame's refusal through as ledger text, not a crash", () => {
    const { port, long } = boxPort();   // no cut: a cell claims the whole edge
    port.propose("split-curve", { curveId: long, t: 0.5 });
    expect(port.lastError()).toMatch(/claims .* across/);
  });
});

describe("material — what a panel is made of, in the viewport", () => {
  it("is empty for a car that has never assigned one", () => {
    const { port } = boxPort();
    expect(port.cellMaterials!().size).toBe(0);
  });

  it("reports name and colour per cell once assigned", () => {
    const { port } = boxPort();
    const cell = [...port.session.state.cells.keys()][0]!;
    port.propose("assign-material", { targetId: cell, name: "screen glass", color: "#1b2226" });
    expect(port.lastError()).toBeNull();
    const mats = port.cellMaterials!();
    expect(mats.get(cell)).toEqual({ name: "screen glass", color: "#1b2226" });
    // ...and the twin wears it too, or the only unpainted cells on a car are
    // the ones authored down a single side.
    expect(mats.get(`${cell}~m` as Id)).toEqual({ name: "screen glass", color: "#1b2226" });
  });
});

describe("session port (the real model behind the seam)", () => {
  it("opens on a rolling chassis, never empty space", () => {
    const port = makeSessionPort(true);
    const t = port.tree();
    expect(t.cells.length).toBeGreaterThan(0);
    // One authored rail; the feed carries its mirror twin as derivation.
    const feed = port.feed();
    expect(feed.surfaces.ranges.some((r) => r.id.endsWith("~m"))).toBe(true);
  });

  it("proposals become history; rejected proposals become ledger text", () => {
    const port = makeSessionPort(false);
    const before = port.session.log.length;
    port.propose("tape", { kind: "box", rect: { view: { kind: "side" }, a: [0, 0], b: [100, 80], depth: 60, at: -30 } });
    expect(port.session.log.length).toBe(before + 1);
    expect(port.lastError()).toBeNull();
    port.propose("crease", { curveId: "curve#9999" });
    expect(port.lastError()).toBeTruthy();
    expect(port.session.log.length).toBe(before + 1); // nothing recorded
  });

  it("a designer can reach the gap mark, not only the crease", () => {
    // A verb nobody can call is not shipped. The gap mark existed in the frame
    // and in the verb set before it existed in the instrument, which meant the
    // only way to set one was to edit a build script.
    const port = makeSessionPort(false);
    port.propose("tape", { kind: "box", rect: { view: { kind: "side" }, a: [0, 0], b: [100, 80], depth: 60, at: -30 } });
    const curveId = [...port.session.state.curves.keys()][0]!;

    expect(gapAt(null).proposal).toBeUndefined();
    expect(gapAt({ kind: "cell", id: "cell#0" } as never).proposal).toBeUndefined();
    const hit = gapAt({ kind: "curve", id: curveId } as never);
    expect(hit.proposal).toEqual({ verb: "gap", args: { curveId } });

    port.propose(hit.proposal!.verb, hit.proposal!.args);
    expect(port.lastError()).toBeNull();
    expect(port.gapIds().has(curveId)).toBe(true);
    // ...and it is a different mark from a crease, all the way to the viewport.
    expect(port.creaseIds().has(curveId)).toBe(false);
    expect(port.describe(curveId)).toContain("gap curve");
  });

  it("a designer can reach the fairing, and it reports what it left alone", () => {
    const port = makeSessionPort(false);
    port.propose("tape", { kind: "box", rect: { view: { kind: "side" }, a: [0, 0], b: [100, 80], depth: 60, at: -30 } });
    const before = port.session.log.length;

    // A box turns 90° at every corner. At the render's own crease angle those
    // are features, so the verb records and does nothing — which is the
    // behaviour worth pinning: a fairing tool that rounds off a shoebox is
    // worse than no fairing tool.
    const result = fairCorners(48);
    expect(result.proposal).toEqual({ verb: "fair-corners", args: { maxBreakDeg: 48 } });
    port.propose(result.proposal!.verb, result.proposal!.args);
    expect(port.lastError()).toBeNull();
    expect(port.session.log.length).toBe(before + 1);
  });

  it("describe never throws, selection or not", () => {
    const port = makeSessionPort(true);
    for (const id of [...port.tree().cells, "cell#404", "curve#0", "nonsense"]) {
      expect(() => port.describe(id)).not.toThrow();
    }
  });

  it("undo replays history without the last verb, down to the seed floor", () => {
    const port = makeSessionPort(true);
    const seeded = port.tree().cells.length;
    port.propose("tape", { kind: "box", rect: { view: { kind: "side" }, a: [0, 400], b: [600, 800], depth: 500, at: -250 } });
    expect(port.tree().cells.length).toBe(seeded + 6);
    expect(port.undo()).toBe(true);
    expect(port.tree().cells.length).toBe(seeded);
    expect(port.undo()).toBe(false); // the site never opens on empty space
    expect(port.tree().cells.length).toBe(seeded);
  });

  it("the saved document round-trips through the port", () => {
    const port = makeSessionPort(true);
    port.propose("tape", { kind: "box", rect: { view: { kind: "side" }, a: [0, 300], b: [500, 700], depth: 400, at: -200 } });
    const doc = port.saveDocument();
    expect(doc.verbs.length).toBe(port.session.log.length);
  });
});

describe("tools", () => {
  it("tape-box builds the exact rect from a drag, typed depth honored", () => {
    const t = new TapeBoxTool();
    t.down([100, 200]);
    const r = t.up([400, 500], { kind: "side" }, { at: -750, depth: 1500 });
    expect(r.proposal).toBeDefined();
    const args = r.proposal!.args as { kind: string; rect: { a: number[]; b: number[]; at: number; depth: number } };
    expect(args.kind).toBe("box");
    expect(args.rect.a).toEqual([100, 200]);
    expect(args.rect.b).toEqual([400, 500]);
    expect(args.rect.at).toBe(-750);
    expect(args.rect.depth).toBe(1500);
  });

  it("degenerate drags are discarded, not proposed", () => {
    const t = new TapeBoxTool();
    t.down([100, 200]);
    const r = t.up([100.5, 500], { kind: "side" }, { at: 0, depth: 100 });
    expect(r.proposal).toBeUndefined();
    expect(r.status).toContain("degenerate");
  });

  it("push-pull deltas map through the view; N locks to the view normal", () => {
    expect(pushPullDelta({ kind: "side" }, [0, 0], [10, 20], false)).toEqual([10, 0, 20]);
    expect(pushPullDelta({ kind: "side" }, [0, 0], [10, 20], true)).toEqual([0, 20, 0]);
    expect(pushPullDelta({ kind: "plan" }, [0, 0], [10, 20], false)).toEqual([10, 20, 0]);
  });

  it("pinch grabs the nearest contact point and emits a ctrl push-pull", async () => {
    const { PinchTool } = await import("../src/tools");
    const t = new PinchTool();
    const controls = [
      { seg: 0, idx: 0 as const, at: [0, 0, 0] as const },
      { seg: 0, idx: 1 as const, at: [100, 0, 0] as const },
    ];
    const down = t.down(
      [95, 5],
      { id: "curve#7", kind: "curve", at: [95, 0, 5], along: 0 },
      () => controls as never,
      (w) => [w[0], w[2]],
    );
    expect(down.selection).toBe("curve#7");
    const up = t.up([120, 30], { kind: "side" }, false);
    const args = up.proposal!.args as { target: { kind: string; id: string; seg: number; idx: number }; delta: number[] };
    expect(args.target).toEqual({ kind: "ctrl", id: "curve#7", seg: 0, idx: 1 });
    expect(args.delta).toEqual([25, 0, 25]);
  });

  it("snap priority: vertex beats curve beats grid inside tolerance", () => {
    const winner = snapResolve(
      [10, 10],
      [
        gridCandidate([10, 10], 10),
        { at: [11, 11], kind: "curve", id: "curve#1" },
        { at: [12, 12], kind: "vertex", id: "vertex#1" },
      ],
      8,
    );
    expect(winner?.kind).toBe("vertex");
  });
});
