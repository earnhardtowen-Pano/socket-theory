import { describe, expect, it } from "vitest";
import type { VerbName } from "@car/schema";
import { createSession, load, validateVerbArgs, type TapeArgs } from "@car/history";

const BOX = {
  kind: "box",
  rect: { view: { kind: "side" }, a: [0, 0], b: [100, 80], depth: 60, at: 0 },
} as const;

const SPLIT_LINE: TapeArgs = {
  kind: "line",
  line: { view: { kind: "side" }, a: [40, -10], b: [40, 90], lineClass: "tape" },
  targets: ["cell#3"],
};

describe("session.apply", () => {
  it("executes and appends records with sequential seq", () => {
    const s = createSession("t");
    s.apply("tape", BOX);
    s.apply("crease", { curveId: "curve#0" });
    expect(s.log.map((r) => r.seq)).toEqual([0, 1]);
    expect(s.log[0]?.verb).toBe("tape");
    expect(s.state.cells.size).toBe(6);
    expect(s.state.curves.get("curve#0")?.crease).toBe(true);
  });

  it("a failed verb appends nothing", () => {
    const s = createSession("t");
    s.apply("tape", BOX);
    expect(() => s.apply("weld", { curveA: "curve#0", curveB: "curve#7" })).toThrow();
    expect(s.log.length).toBe(1);
  });

  it("save() emits the document: history + counters, no evaluated geometry", () => {
    const s = createSession("my car");
    s.apply("tape", BOX);
    const doc = s.save();
    expect(doc.format).toBe("car");
    expect(doc.version).toBe(1);
    expect(doc.title).toBe("my car");
    expect(doc.counters["cell"]).toBe(6);
    expect(doc.counters["curve"]).toBe(12);
    expect(doc.counters["vertex"]).toBe(8);
    expect(doc.verbs.length).toBe(1);
    expect(JSON.parse(JSON.stringify(doc))).toEqual(doc);
  });
});

describe("tape", () => {
  it("tape lines split their targets", () => {
    const s = createSession("t");
    s.apply("tape", BOX);
    s.apply("tape", SPLIT_LINE);
    expect(s.state.cells.has("cell#3")).toBe(false);
    expect(s.state.resolveCell("cell#3")).toEqual(["cell#6", "cell#7"]);
  });

  it("sketch lines create a datum and MUST NOT split", () => {
    const s = createSession("t");
    s.apply("tape", BOX);
    s.apply("tape", {
      kind: "line",
      line: { view: { kind: "side" }, a: [40, -10], b: [40, 90], lineClass: "sketch" },
      targets: [],
    });
    expect(s.state.cells.size).toBe(6);
    expect(s.state.datums.get("datum#0")?.kind).toBe("sketch-line");
    expect(() =>
      s.apply("tape", {
        kind: "line",
        line: { view: { kind: "side" }, a: [40, -10], b: [40, 90], lineClass: "sketch" },
        targets: ["cell#3"],
      }),
    ).toThrow(/never split/);
    expect(s.state.cells.size).toBe(6);
  });

  it("a tape line bound to a split parent splits the children it crosses", () => {
    const s = createSession("t");
    s.apply("tape", BOX);
    s.apply("tape", SPLIT_LINE);
    // cell#3 now resolves to cell#6 (x 40..100) and cell#7 (x 0..40);
    // a line at x=70 crosses only cell#6 — the miss on cell#7 is skipped
    s.apply("tape", {
      kind: "line",
      line: { view: { kind: "side" }, a: [70, -10], b: [70, 90], lineClass: "tape" },
      targets: ["cell#3"],
    });
    expect(s.state.resolveCell("cell#3")).toEqual(["cell#8", "cell#9", "cell#7"]);
  });
});

describe("persistent naming through the verb layer", () => {
  it("push-pull bound to a split parent moves both children", () => {
    const s = createSession("t");
    s.apply("tape", BOX);
    s.apply("tape", SPLIT_LINE);
    s.apply("push-pull", { target: { kind: "cell", id: "cell#3" }, delta: [0, 15, 0] });
    for (const id of ["cell#6", "cell#7"] as const) {
      const cell = s.state.cells.get(id);
      const side = cell?.sides[0];
      const curve = side && s.state.curves.get(s.state.resolveCurve(side.curveId));
      expect(curve?.chain.segs[0]?.p0[1]).toBeCloseTo(75, 9);
    }
  });

  it("verbs against a welded-away curve resolve through the alias", () => {
    const s = createSession("t");
    s.apply("tape", BOX);
    s.apply("tape", {
      kind: "box",
      rect: { view: { kind: "side" }, a: [100, 0], b: [180, 80], depth: 60, at: 0 },
    });
    s.apply("weld", { curveA: "curve#6", curveB: "curve#16" });
    s.apply("crease", { curveId: "curve#16" }); // the loser id
    expect(s.state.curves.get("curve#6")?.crease).toBe(true);
  });
});

describe("cut (the cut-binding law)", () => {
  it("records a FeatureOp bound to authored frame ids + sketch geometry", () => {
    const s = createSession("t");
    s.apply("tape", BOX);
    s.apply("constrain", { note: "hold roof", spec: { k: 1 } });
    s.apply("cut", {
      profile: {
        kind: "rect",
        rect: { view: { kind: "plan" }, a: [20, 10], b: [60, 50], depth: -30, at: 80 },
      },
      targets: ["cell#5"],
    });
    expect(s.state.features.size).toBe(1);
    const f = s.state.features.get("feature#0");
    expect(f?.kind).toBe("cut");
    expect(f?.verbSeq).toBe(2);
    const args = f?.args as { targets: string[]; profile: { kind: string } };
    expect(args.targets).toEqual(["cell#5"]);
    expect(args.profile.kind).toBe("rect");
    // no boolean evaluation here: geometry untouched
    expect(s.state.cells.size).toBe(6);
  });

  it("rejects a cut against an unknown cell", () => {
    const s = createSession("t");
    s.apply("tape", BOX);
    expect(() =>
      s.apply("cut", {
        profile: { kind: "half-circle", center: [0, 0], radius: 5, view: { kind: "front" }, at: 0, depth: 10 },
        targets: ["cell#99"],
      }),
    ).toThrow(/unknown cell/);
    expect(s.state.features.size).toBe(0);
  });
});

describe("remaining verbs", () => {
  it("group, assign-material, mirror-detach, place-point, fit-through-line, rotate, taper, detach", () => {
    const s = createSession("t");
    s.apply("tape", BOX);
    s.apply("group", { cellIds: ["cell#0", "cell#1"], name: "ends" });
    expect(s.state.groups.get("group#0")?.name).toBe("ends");
    s.apply("assign-material", { targetId: "group#0", name: "paint", color: "#fff" });
    expect(s.state.cells.get("cell#0")?.materialId).toBe("material#0");
    s.apply("mirror-detach", { cellId: "cell#3" });
    expect(s.state.cells.get("cell#3")?.mirror).toBe("detached");
    s.apply("place-point", { curveId: "curve#0", t: 0.5 });
    expect(s.state.curves.get("curve#0")?.chain.segs.length).toBe(2);
    s.apply("fit-through-line", { points: [[0, 0, 0], [10, 0, 0], [20, 0, 0]] });
    expect(s.state.datums.get("datum#0")?.kind).toBe("through-line");
    expect(() =>
      s.apply("rotate", { cellIds: ["cell#0"], origin: [0, 0, 0], axis: [0, 1, 0], angleDeg: 10 }),
    ).toThrow(/rotation requires explicit detach of curve#/);
    s.apply("detach", { curveId: "curve#0" });
    expect(s.state.detachedFrom.size).toBe(1);
    s.apply("taper", { cellId: "cell#5", side: 0, scale: 0.5 });
    expect(s.log.length).toBe(8); // the failed rotate recorded nothing
  });
});

describe("validation", () => {
  it("rejects malformed args before touching state", () => {
    const s = createSession("t");
    expect(() => s.apply("tape", { kind: "box" } as never)).toThrow(/rect/);
    expect(() => s.apply("weld", { curveA: "cell#0", curveB: "curve#1" } as never)).toThrow(/curve id/);
    expect(() => s.apply("push-pull", { target: { kind: "cell", id: "cell#0" }, delta: [0, Number.NaN, 0] } as never)).toThrow(/finite/);
    expect(() => s.apply("taper", { cellId: "cell#0", side: 4, scale: 1 } as never)).toThrow(/side/);
    expect(() => s.apply("place-point", { curveId: "curve#0", t: 2 } as never)).toThrow(/t must be/);
    expect(() => s.apply("nonsense" as VerbName, {} as never)).toThrow(/unknown verb/);
    expect(s.log.length).toBe(0);
  });

  it("validateVerbArgs returns the typed canonical shape", () => {
    const args = validateVerbArgs("tape", JSON.parse(JSON.stringify(BOX)));
    expect(args).toEqual(BOX);
  });
});

describe("apply-entry (one grammar: catalog entries are verb documents)", () => {
  it("splices an entry with ids offset to this session's counters", () => {
    const entry = createSession("entry: pushed box");
    entry.apply("tape", BOX);
    entry.apply("push-pull", { target: { kind: "cell", id: "cell#0" }, delta: [-20, 0, 0] });
    const entryDoc = entry.save();

    const host = createSession("host");
    // a displaced host box, so the spliced entry's geometry touches nothing
    host.apply("tape", {
      kind: "box",
      rect: { view: { kind: "side" }, a: [300, 0], b: [400, 80], depth: 60, at: 0 },
    });
    host.apply("apply-entry", { entry: entryDoc });
    // the entry's box landed as cells 6..11; its push-pull hit cell#6, not cell#0
    expect(host.state.cells.size).toBe(12);
    const hostCell0Curve = host.state.curves.get("curve#8"); // host box -X face edge
    expect(hostCell0Curve?.chain.segs[0]?.p0[0]).toBe(300);
    const spliced = host.state.curves.get("curve#20"); // entry box -X face edge (8+12)
    expect(spliced?.chain.segs[0]?.p0[0]).toBe(-20);
    // only the apply-entry record itself is in the log
    expect(host.log.length).toBe(2);
    expect(host.log[1]?.verb).toBe("apply-entry");
    // counters integrity: replay of the host reproduces the splice
    const reloaded = load(host.save());
    expect(reloaded.state.cells.size).toBe(12);
    expect(reloaded.save()).toEqual(host.save());
  });

  it("nested entries splice recursively", () => {
    const inner = createSession("inner");
    inner.apply("tape", BOX);
    const outer = createSession("outer");
    outer.apply("apply-entry", { entry: inner.save() });
    outer.apply("crease", { curveId: "curve#0" });
    const host = createSession("host");
    host.apply("tape", BOX);
    host.apply("apply-entry", { entry: outer.save() });
    expect(host.state.cells.size).toBe(12);
    // outer's crease on curve#0 remapped to the spliced box's curve#12
    expect(host.state.curves.get("curve#12")?.crease).toBe(true);
    expect(host.state.curves.get("curve#0")?.crease).toBe(false);
    expect(load(host.save()).state.curves.get("curve#12")?.crease).toBe(true);
  });

  it("rejects a malformed entry", () => {
    const s = createSession("t");
    expect(() => s.apply("apply-entry", { entry: { format: "nope" } as never })).toThrow(/format/);
  });
});
