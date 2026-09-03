import { describe, expect, it } from "vitest";
import { assumed, carriesAssumption, derived, qAdd, sourced } from "@car/demand";
import { massLedger } from "../src/mass";
import { box, fourWheels, kg, ledgerInput, part, places, wheel } from "./rig";

/** Two known masses on the standard wheelbase: every number below is exact in
 * IEEE doubles (ratios are dyadic), so the assertions are toBe, not closeTo. */
const twoMass = () =>
  ledgerInput({
    parts: [
      part("part#0", "nose box", kg(100), box(400, 400, 400)),
      part("part#1", "tail box", kg(300), box(400, 400, 400)),
    ],
    placements: places([
      ["part#0", [1000, 0, 500]],
      ["part#1", [3000, 0, 500]],
    ]),
    wheels: fourWheels(kg(200)),
    massTarget: kg(350),
  });

describe("massLedger — CG (mass-weighted mean of envelope centers at pose)", () => {
  it("two known masses land the exact CG", () => {
    const r = massLedger(twoMass());
    // (100·1000 + 300·3000)/400 = 2500; y = 0; z = 500 — exact.
    expect(r.cg).toEqual([2500, 0, 500]);
    expect(r.total.value).toBe(400);
    expect(r.total.unit).toBe("kg");
    expect(r.total.license.tag).toBe("DERIVED");
  });

  it("the total's chain lists every placed part with its license tag", () => {
    const r = massLedger(twoMass());
    const chain = r.total.license.tag === "DERIVED" ? r.total.license.chain : "";
    expect(chain).toContain("part#0 'nose box' 100kg[DERIVED]");
    expect(chain).toContain("part#1 'tail box' 300kg[DERIVED]");
  });

  it("an envelope offset shifts the contributing center", () => {
    const r = massLedger(
      ledgerInput({
        parts: [part("part#0", "offset box", kg(50), box(100, 100, 100, [10, 0, 100]))],
        placements: places([["part#0", [500, 200, 0]]]),
      }),
    );
    expect(r.cg).toEqual([510, 200, 100]);
  });

  it("a part without an envelope contributes at its pose origin (its datum)", () => {
    const r = massLedger(
      ledgerInput({
        parts: [part("part#0", "bare datum", kg(50))],
        placements: places([["part#0", [123, -45, 6]]]),
      }),
    );
    expect(r.cg).toEqual([123, -45, 6]);
  });

  it("published CG never carries -0", () => {
    const r = massLedger(
      ledgerInput({
        parts: [part("part#0", "left of center", kg(10))],
        placements: places([["part#0", [100, -0, 0]]]),
      }),
    );
    expect(Object.is(r.cg[1], -0)).toBe(false);
    expect(r.cg[1]).toBe(0);
  });
});

describe("massLedger — axle loads (static two-axle balance)", () => {
  it("splits by CG station and the loads sum exactly to the total", () => {
    const r = massLedger(twoMass());
    // front = 400·(4000−2500)/4000 = 150; rear = 400 − 150 = 250 — exact.
    expect(r.axleLoads.front.value).toBe(150);
    expect(r.axleLoads.rear.value).toBe(250);
    expect(r.axleLoads.front.value + r.axleLoads.rear.value).toBe(r.total.value);
    expect(r.axleLoads.front.license.tag).toBe("DERIVED");
    expect(r.axleLoads.rear.license.tag).toBe("DERIVED");
  });

  it("the front load's chain traces to the moment balance over the stations", () => {
    const r = massLedger(twoMass());
    const front = r.axleLoads.front;
    const chain = front.license.tag === "DERIVED" ? front.license.chain : "";
    expect(chain).toContain("scale(");
    // The moment derivation itself lives in the ratio quantity's chain, which
    // is composed from the stations — spot-check by recomputing.
    expect(front.value).toBe(r.total.value * ((4000 - r.cg[0]) / (4000 - 0)));
  });

  it("CG on the front axle puts the whole total on the front", () => {
    const r = massLedger(
      ledgerInput({
        parts: [part("part#0", "over front axle", kg(400))],
        placements: places([["part#0", [0, 0, 300]]]),
        wheels: fourWheels(kg(300)),
      }),
    );
    expect(r.axleLoads.front.value).toBe(400);
    expect(r.axleLoads.rear.value).toBe(0);
  });

  it("CG aft of the rear axle goes negative on the front and says so", () => {
    const r = massLedger(
      ledgerInput({
        parts: [part("part#0", "overhung mass", kg(400))],
        placements: places([["part#0", [4500, 0, 300]]]),
        wheels: fourWheels(kg(200)),
      }),
    );
    // front = 400·(4000−4500)/4000 = −50; rear = 450 — still sums to total.
    expect(r.axleLoads.front.value).toBe(-50);
    expect(r.axleLoads.rear.value).toBe(450);
    expect(r.axleLoads.front.value + r.axleLoads.rear.value).toBe(400);
    expect(r.assumedOutstanding.join("\n")).toContain("OUTSIDE the wheelbase");
  });
});

describe("massLedger — per-wheel loads and the capacity flag", () => {
  it("splits each axle symmetrically over its wheels, labels preserved", () => {
    const r = massLedger(twoMass());
    expect(r.perWheel).toHaveLength(4);
    const byLabel = new Map(r.perWheel.map((w) => [w.label, w]));
    expect(byLabel.get("FL")?.load.value).toBe(75);
    expect(byLabel.get("FR")?.load.value).toBe(75);
    expect(byLabel.get("RL")?.load.value).toBe(125);
    expect(byLabel.get("RR")?.load.value).toBe(125);
    // Rows come front axle first, then rear (canonical station order).
    expect(r.perWheel.map((w) => w.label)).toEqual(["FL", "FR", "RL", "RR"]);
  });

  it("ok flips when a wheel is overloaded, and holds at exact capacity", () => {
    const at200 = massLedger(twoMass()); // heaviest wheel carries 125 kg
    expect(at200.perWheel.every((w) => w.ok)).toBe(true);

    const at120 = massLedger(ledgerInput({ ...twoMass(), wheels: fourWheels(kg(120)) }));
    const rear = at120.perWheel.filter((w) => w.label.startsWith("R"));
    const front = at120.perWheel.filter((w) => w.label.startsWith("F"));
    expect(rear.every((w) => !w.ok)).toBe(true); // 125 > 120
    expect(front.every((w) => w.ok)).toBe(true); // 75 ≤ 120

    const at125 = massLedger(ledgerInput({ ...twoMass(), wheels: fourWheels(kg(125)) }));
    expect(at125.perWheel.every((w) => w.ok)).toBe(true); // load ≤ capacity, inclusive
  });

  it("each row carries its own capacity quantity", () => {
    const r = massLedger(twoMass());
    for (const row of r.perWheel) {
      expect(row.capacity.value).toBe(200);
      expect(row.capacity.unit).toBe("kg");
      expect(row.load.unit).toBe("kg");
      expect(row.load.license.tag).toBe("DERIVED");
    }
  });
});

describe("massLedger — target gap", () => {
  it("positive gap when overweight, licensed derived", () => {
    const r = massLedger(twoMass()); // total 400 vs target 350
    expect(r.targetGap.value).toBe(50);
    expect(r.targetGap.unit).toBe("kg");
    expect(r.targetGap.license.tag).toBe("DERIVED");
    const chain = r.targetGap.license.tag === "DERIVED" ? r.targetGap.license.chain : "";
    expect(chain).toContain("sub(");
  });

  it("negative gap when under target", () => {
    const r = massLedger(ledgerInput({ ...twoMass(), massTarget: kg(500) }));
    expect(r.targetGap.value).toBe(-100);
  });

  it("an ASSUMED target flows into the gap's assumption ancestry", () => {
    const r = massLedger(
      ledgerInput({ ...twoMass(), massTarget: assumed(350, "kg", "owner's first guess — iterate") }),
    );
    expect(carriesAssumption(r.targetGap)).toBe(true);
  });
});

describe("massLedger — assumed notes surface, never buried", () => {
  it("an ASSUMED part mass surfaces its note", () => {
    const r = massLedger(
      ledgerInput({
        parts: [
          part("part#0", "engine", assumed(180, "kg", "engine mass pending supplier sheet")),
        ],
        placements: places([["part#0", [1500, 0, 400]]]),
      }),
    );
    const strip = r.assumedOutstanding.join("\n");
    expect(strip).toContain("part#0 'engine' mass 180 kg: ASSUMED");
    expect(strip).toContain("engine mass pending supplier sheet");
    expect(carriesAssumption(r.total)).toBe(true);
  });

  it("a DERIVED mass carrying an assumption surfaces with its chain", () => {
    const carrying = qAdd(
      assumed(5, "kg", "bracketry estimate, no drawing yet"),
      kg(100),
    );
    const r = massLedger(
      ledgerInput({
        parts: [part("part#0", "motor + brackets", carrying)],
        placements: places([["part#0", [1000, 0, 300]]]),
      }),
    );
    const strip = r.assumedOutstanding.join("\n");
    expect(strip).toContain("DERIVED carrying [ASSUMED]");
    expect(strip).toContain("chain:");
    expect(carriesAssumption(r.total)).toBe(true);
  });

  it("the ASSUMED mass target surfaces as the owner's", () => {
    const r = massLedger(
      ledgerInput({
        ...twoMass(),
        massTarget: assumed(1200, "kg", "brief target, first pass — iterate as the ledger fills"),
      }),
    );
    const strip = r.assumedOutstanding.join("\n");
    expect(strip).toContain("mass target 1200 kg (owner's brief): ASSUMED");
    expect(strip).toContain("iterate as the ledger fills");
  });

  it("an ASSUMED wheel capacity surfaces", () => {
    const r = massLedger(
      ledgerInput({
        ...twoMass(),
        wheels: fourWheels(assumed(300, "kg", "tire load index not chosen yet")),
      }),
    );
    expect(r.assumedOutstanding.join("\n")).toContain(
      "wheel 'FL' load capacity 300 kg: ASSUMED",
    );
  });

  it("a part with no mass counts as ASSUMED 0 kg and is called out", () => {
    const r = massLedger(
      ledgerInput({
        parts: [
          part("part#0", "known", kg(100)),
          part("part#1", "massless bracket"),
        ],
        placements: places([
          ["part#0", [1000, 0, 0]],
          ["part#1", [2000, 0, 0]],
        ]),
      }),
    );
    expect(r.total.value).toBe(100);
    expect(r.cg).toEqual([1000, 0, 0]); // the 0 kg part cannot move the CG
    const strip = r.assumedOutstanding.join("\n");
    expect(strip).toContain("part#1 'massless bracket' carries NO mass");
    expect(carriesAssumption(r.total)).toBe(true); // the assumed 0 kg is in the chain
  });

  it("an unplaced part is EXCLUDED from every number and called out", () => {
    const r = massLedger(
      ledgerInput({
        parts: [
          part("part#0", "placed", kg(100)),
          part("part#1", "floating spare", kg(9)),
        ],
        placements: places([["part#0", [1000, 0, 0]]]),
        wheels: fourWheels(kg(200)),
      }),
    );
    expect(r.total.value).toBe(100); // not 109
    expect(r.axleLoads.front.value + r.axleLoads.rear.value).toBe(100);
    const strip = r.assumedOutstanding.join("\n");
    expect(strip).toContain("part#1 'floating spare' (9 kg) has NO placement");
    const chain = r.total.license.tag === "DERIVED" ? r.total.license.chain : "";
    expect(chain).toContain("EXCLUDED (no placement): part#1 'floating spare' 9kg");
  });

  it("a fully licensed ledger has an empty outstanding strip", () => {
    const r = massLedger(
      ledgerInput({
        parts: [
          part("part#0", "sourced mass", sourced(100, "kg", "test bench scale reading, this suite")),
          part("part#1", "derived mass", kg(300)),
        ],
        placements: places([
          ["part#0", [1000, 0, 500]],
          ["part#1", [3000, 0, 500]],
        ]),
        wheels: fourWheels(kg(200)),
        massTarget: kg(500),
      }),
    );
    expect(r.assumedOutstanding).toEqual([]);
  });

  it("an adversarial label cannot fake assumption ancestry in the total", () => {
    const r = massLedger(
      ledgerInput({
        parts: [part("part#0", "sneaky [ASSUMED] label", kg(10))],
        placements: places([["part#0", [0, 0, 0]]]),
      }),
    );
    expect(carriesAssumption(r.total)).toBe(false);
    const chain = r.total.license.tag === "DERIVED" ? r.total.license.chain : "";
    expect(chain).toContain("sneaky (ASSUMED) label"); // brackets neutralized
  });
});

describe("massLedger — degenerate wheel sets, reported not crashed", () => {
  it("no wheels: assumed-zero axle loads, empty per-wheel, loud gap line", () => {
    const r = massLedger(
      ledgerInput({
        parts: [part("part#0", "block", kg(400))],
        placements: places([["part#0", [2000, 0, 300]]]),
        wheels: [],
      }),
    );
    expect(r.perWheel).toEqual([]);
    expect(r.axleLoads.front.value).toBe(0);
    expect(r.axleLoads.rear.value).toBe(0);
    expect(r.axleLoads.front.license.tag).toBe("ASSUMED");
    expect(r.assumedOutstanding.join("\n")).toContain("no wheel stations provided");
  });

  it("all wheels on one station: full total on that axle, said loudly", () => {
    const r = massLedger(
      ledgerInput({
        parts: [part("part#0", "block", kg(400))],
        placements: places([["part#0", [1000, 0, 300]]]),
        wheels: [
          wheel("L", [1000, -750, 0], kg(300)),
          wheel("R", [1000, 750, 0], kg(300)),
        ],
      }),
    );
    expect(r.axleLoads.front.value).toBe(400);
    expect(r.axleLoads.rear.value).toBe(0);
    expect(r.perWheel).toHaveLength(2);
    expect(r.perWheel.every((w) => w.load.value === 200)).toBe(true);
    expect(r.assumedOutstanding.join("\n")).toContain("two-axle balance is degenerate");
  });

  it("a middle axle folded into the two-axle balance is flagged", () => {
    const r = massLedger(
      ledgerInput({
        parts: [part("part#0", "block", kg(600))],
        placements: places([["part#0", [2000, 0, 300]]]),
        wheels: [
          wheel("F", [0, 0, 0], kg(400)),
          wheel("M", [2000, 0, 0], kg(400)),
          wheel("R", [4000, 0, 0], kg(400)),
        ],
      }),
    );
    // The middle wheel groups front (tie goes front); loads still sum.
    expect(r.axleLoads.front.value + r.axleLoads.rear.value).toBe(600);
    expect(r.assumedOutstanding.join("\n")).toContain("off the front axle group's mean station");
  });

  it("empty part list: zero total, placeholder CG at origin, said loudly", () => {
    const r = massLedger(ledgerInput({ wheels: fourWheels(kg(200)), massTarget: kg(100) }));
    expect(r.total.value).toBe(0);
    expect(r.cg).toEqual([0, 0, 0]);
    expect(r.targetGap.value).toBe(-100);
    expect(r.axleLoads.front.value).toBe(0);
    expect(r.axleLoads.rear.value).toBe(0);
    expect(r.assumedOutstanding.join("\n")).toContain("no placed mass");
  });

  it("duplicate part ids are a programming error, thrown", () => {
    expect(() =>
      massLedger(
        ledgerInput({
          parts: [part("part#0", "a", kg(1)), part("part#0", "b", kg(2))],
        }),
      ),
    ).toThrow(/duplicate part id/);
  });

  it("non-finite geometry is a programming error, thrown", () => {
    expect(() =>
      massLedger(
        ledgerInput({
          parts: [part("part#0", "a", kg(1))],
          placements: places([["part#0", [Number.NaN, 0, 0]]]),
        }),
      ),
    ).toThrow(/non-finite/);
  });
});

describe("massLedger — determinism", () => {
  it("identical inputs give deep-equal results", () => {
    expect(massLedger(twoMass())).toEqual(massLedger(twoMass()));
  });

  it("the whole result is invariant under part and wheel permutation", () => {
    const base = ledgerInput({
      parts: [
        part("part#0", "a", kg(123.25), box(100, 100, 100)),
        part("part#1", "b", kg(77.5), box(100, 100, 100, [5, -3, 12])),
        part("part#2", "c", assumed(9.75, "kg", "estimate")),
      ],
      placements: places([
        ["part#0", [812, -140, 655]],
        ["part#1", [3120, 260, 480]],
        ["part#2", [2444, 0, 900]],
      ]),
      wheels: fourWheels(kg(200)),
      massTarget: assumed(200, "kg", "target guess"),
    });
    const shuffled = ledgerInput({
      ...base,
      parts: [...base.parts].reverse(),
      wheels: [...base.wheels].reverse(),
    });
    expect(massLedger(shuffled)).toEqual(massLedger(base));
  });
});
