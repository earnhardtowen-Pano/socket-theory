import { describe, expect, it } from "vitest";
import { makeSessionPort } from "../src/sessionPort";
import { pushPullDelta, TapeBoxTool } from "../src/tools";
import { gridCandidate, snapResolve } from "../src/snap";

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
