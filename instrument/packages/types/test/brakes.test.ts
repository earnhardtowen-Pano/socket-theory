import { describe, expect, it } from "vitest";
import { makeAllocator, type Quantity } from "@car/schema";
import { derived } from "@car/demand";
import { caliperRadialClearance, deriveMinWheelDiameter, makeBrakes } from "../src/brakes";

const mm = (v: number, why: string) => derived(v, "mm", why);

function make(discMm: number, rimMm: number, side?: "left" | "right") {
  return makeBrakes(
    {
      discDiameter: mm(discMm, "test disc"),
      wheelRimDiameter: mm(rimMm, "test rim"),
      ...(side !== undefined ? { driverSide: side } : {}),
    },
    makeAllocator(),
  );
}

function walkQuantities(x: unknown, out: Quantity[] = []): Quantity[] {
  if (x && typeof x === "object") {
    const rec = x as Record<string, unknown>;
    if (rec["__brand"] === "Quantity") {
      out.push(x as Quantity);
      return out;
    }
    for (const v of Object.values(rec)) walkQuantities(v, out);
  }
  return out;
}

describe("brakes set the wheel floor", () => {
  it("deriveMinWheelDiameter = disc + 2 x 50.8 mm sourced caliper clearance", () => {
    expect(deriveMinWheelDiameter(mm(300, "t")).value).toBeCloseTo(300 + 101.6, 9);
    expect(deriveMinWheelDiameter(mm(330, "t")).value).toBeCloseTo(431.6, 9);
    // the +4 in industry rule: an 11 in rotor (279.4) needs at least a 15 in wheel (381)
    expect(deriveMinWheelDiameter(mm(279.4, "t")).value).toBeCloseTo(381, 9);
  });

  it("the floor is DERIVED from a SOURCED clearance and says so in its chain", () => {
    const floor = deriveMinWheelDiameter(mm(330, "t"));
    expect(floor.license.tag).toBe("DERIVED");
    const chain = floor.license.tag === "DERIVED" ? floor.license.chain : "";
    expect(chain).toContain("[SOURCED]");
    const clearance = caliperRadialClearance();
    expect(clearance.license.tag).toBe("SOURCED");
    if (clearance.license.tag === "SOURCED") {
      expect(clearance.license.source.trim().length).toBeGreaterThan(0);
      expect(clearance.license.citation ?? "").toMatch(/4 in|EBC/);
    }
  });

  it("a 330 disc fits a 17 in rim (431.8) but not a 15 in rim (381)", () => {
    const fits = make(330, 431.8);
    expect(fits.dims.minWheelRimDiameter.value).toBeCloseTo(431.6, 9);
    expect(() => make(330, 381)).toThrow(/wheel floor/);
    expect(() => make(330, 381)).toThrow(/431\.6/);
  });

  it("the boundary is exact: disc + 101.6 = rim is legal, one tenth more is not", () => {
    expect(() => make(330.2, 431.8)).not.toThrow();
    expect(() => make(330.3, 431.8)).toThrow(/wheel floor/);
  });

  it("rejects a non-positive disc", () => {
    expect(() => make(0, 431.8)).toThrow(/positive/);
  });
});

describe("makeBrakes — pedal box, booster envelope, masses", () => {
  it("publishes the pedal-box port at the datum, pushrod aft into the cabin", () => {
    const b = make(330, 431.8);
    const pedal = b.ports.find((p) => p.name === "pedal-box")!;
    expect(pedal).toBeDefined();
    expect(pedal.kind).toBe("point");
    expect(pedal.frame.origin).toEqual([0, 0, 0]);
    expect(pedal.frame.xAxis).toEqual([1, 0, 0]);
    const mcOut = b.ports.find((p) => p.name === "master-cylinder-out")!;
    expect(mcOut.frame.origin[0]).toBeCloseTo(-342.9, 6);
  });

  it("the point-at demand is the person's and states the heel point as the reason", () => {
    const b = make(330, 431.8);
    const pin = b.demands.find((d) => d.kind === "point-at")!;
    expect(pin).toBeDefined();
    expect(pin.principal).toBe("person");
    expect(pin.reason).toMatch(/heel point/);
    expect(pin.reason).toMatch(/cannot move|moving the driver/);
  });

  it("records the driver side in the claim", () => {
    const right = make(330, 431.8, "right");
    const pin = right.demands.find((d) => d.kind === "point-at")!;
    expect(pin.reason).toMatch(/right-side/);
    expect(right.label).toMatch(/right/);
  });

  it("booster + MC claim the firewall: envelope extends forward of the datum", () => {
    const b = make(330, 431.8);
    const env = b.envelope!;
    expect(env.size[0].value).toBeCloseTo(342.9, 6); // 13.5 in sourced combo length
    expect(env.size[1].value).toBeCloseTo(203.2, 6); // 8 in sourced dual-diaphragm booster
    expect(env.size[2].value).toBeCloseTo(203.2, 6);
    expect(env.offset![0]).toBeLessThan(0); // forward (−X), engine-bay side of the firewall
    expect(b.demands.some((d) => d.kind === "envelope" && d.principal === "physics")).toBe(true);
  });

  it("the firewall joint is a mass-bearing anchorage (pedal reaction + hung mass)", () => {
    const b = make(330, 431.8);
    const anchor = b.demands.find((d) => d.kind === "anchorage")!;
    expect(anchor).toBeDefined();
    expect(anchor.massBearing).toBe(true);
    expect(anchor.principal).toBe("physics");
    expect(anchor.reason).toMatch(/reinforced member/);
  });

  it("disc mass follows the sourced grey-cast-iron density and the disc geometry", () => {
    const b = make(330, 431.8);
    const expected =
      ((Math.PI / 4) * (330 * 330 - (0.6 * 330) * (0.6 * 330)) * 28 * 7.2) / 1e6;
    expect(b.dims.discMassEach.value).toBeCloseTo(expected, 4);
    // pair of discs + pair of calipers + booster/MC
    expect(b.dims.mass.value).toBeCloseTo(2 * expected + 2 * 4.5 + 5.5, 4);
    expect(b.mass!.value).toBe(b.dims.mass.value);
    const chain = b.dims.discMassEach.license.tag === "DERIVED" ? b.dims.discMassEach.license.chain : "";
    expect(chain).toContain("[SOURCED]");
  });

  it("bigger discs weigh more and demand bigger wheels", () => {
    const small = make(280, 431.8);
    const big = make(355, 480);
    expect(big.dims.discMassEach.value).toBeGreaterThan(small.dims.discMassEach.value);
    expect(big.dims.minWheelRimDiameter.value).toBeGreaterThan(small.dims.minWheelRimDiameter.value);
  });

  it("every demand carries a principal and a stateable reason", () => {
    for (const d of make(330, 431.8).demands) {
      expect(["person", "physics", "law", "brief"]).toContain(d.principal);
      expect(d.reason.trim().length).toBeGreaterThan(0);
    }
  });

  it("every quantity carries a well-formed license; sourced values name sources", () => {
    const qs = walkQuantities(make(330, 431.8));
    expect(qs.length).toBeGreaterThan(8);
    let sourcedCount = 0;
    for (const q of qs) {
      if (q.license.tag === "SOURCED") {
        sourcedCount += 1;
        expect(q.license.source.trim().length).toBeGreaterThan(0);
      } else if (q.license.tag === "DERIVED") {
        expect(q.license.chain.trim().length).toBeGreaterThan(0);
      } else {
        expect(q.license.note.trim().length).toBeGreaterThan(0);
      }
    }
    expect(sourcedCount).toBeGreaterThan(0);
  });
});
