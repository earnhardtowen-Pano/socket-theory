import { describe, expect, it } from "vitest";
import { makeAllocator } from "@car/schema";
import { assumed, derived } from "@car/demand";
import { h30ClassAMax, h30ClassAMin, makeOccupantArray, type OccupantArrayParams } from "../src/occupants";

function twoRows(over: Partial<OccupantArrayParams> = {}) {
  return makeOccupantArray(
    {
      rows: [
        {
          heel: [1200, 0, 0],
          H30: assumed(280, "mm", "test front H30"),
          occupants: derived(2, "count", "test front pair"),
        },
        {
          heel: [2150, 0, 60],
          H30: assumed(300, "mm", "test rear H30"),
          occupants: derived(3, "count", "test rear bench"),
        },
      ],
      ...over,
    },
    makeAllocator(),
  );
}

describe("makeOccupantArray — the H30 point chain", () => {
  it("hip stands exactly H30 above the heel (the SAE J1100 chair height)", () => {
    const o = twoRows();
    const front = o.dims.rows[0]!;
    const rear = o.dims.rows[1]!;
    expect(front.hip[2] - front.heel[2]).toBeCloseTo(280, 9);
    expect(rear.hip[2] - rear.heel[2]).toBeCloseTo(300, 9);
    // the licensed H30 rides along in dims for the audit
    expect(front.H30.value).toBe(280);
  });

  it("eye and head derive from SOURCED anthropometry × SOURCED back angle, chains shown", () => {
    const o = twoRows();
    const r = o.dims.rows[0]!;
    expect(r.eyeAboveHip.license.tag).toBe("DERIVED");
    const eyeChain = r.eyeAboveHip.license.tag === "DERIVED" ? r.eyeAboveHip.license.chain : "";
    expect(eyeChain).toContain("[SOURCED]");
    expect(eyeChain).toContain("cos(back angle)");
    // 860 × cos25°, 976.9 × cos25°
    const c25 = Math.cos((25 * Math.PI) / 180);
    expect(r.eyeAboveHip.value).toBeCloseTo(860.0 * c25, 6);
    expect(r.headAboveHip.value).toBeCloseTo(976.9 * c25, 6);
    // geometry: eye below head, both above hip; reclined torso puts them aft of the hip
    expect(r.eye[2]).toBeLessThan(r.head[2]);
    expect(r.eye[2]).toBeGreaterThan(r.hip[2]);
    expect(r.eye[0]).toBeGreaterThan(r.hip[0]);
    expect(r.head[0]).toBeGreaterThan(r.hip[0]);
  });

  it("an upright back angle raises the eye point", () => {
    const reclined = twoRows();
    const upright = twoRows({
      rows: [
        {
          heel: [1200, 0, 0],
          H30: assumed(280, "mm", "t"),
          occupants: derived(2, "count", "t"),
          seatBackAngleDeg: assumed(15, "deg", "test upright"),
        },
      ],
    });
    expect(upright.dims.rows[0]!.eyeAboveHip.value).toBeGreaterThan(reclined.dims.rows[0]!.eyeAboveHip.value);
  });

  it("H30 outside the SOURCED SAE J1100 Class-A range 127–405 mm throws", () => {
    expect(h30ClassAMin().value).toBe(127);
    expect(h30ClassAMax().value).toBe(405);
    expect(h30ClassAMin().license.tag).toBe("SOURCED");
    expect(() =>
      twoRows({
        rows: [{ heel: [0, 0, 0], H30: assumed(500, "mm", "t"), occupants: derived(1, "count", "t") }],
      }),
    ).toThrow(/SAE J1100 Class-A range/);
    expect(() =>
      twoRows({
        rows: [{ heel: [0, 0, 0], H30: assumed(100, "mm", "t"), occupants: derived(1, "count", "t") }],
      }),
    ).toThrow(/SAE J1100 Class-A range/);
  });

  it("publishes heel/hip/eye/head point ports per row — the grid hard points", () => {
    const o = twoRows();
    for (const n of ["heel-row0", "hip-row0", "eye-row0", "head-row0", "heel-row1", "hip-row1", "eye-row1", "head-row1"]) {
      expect(o.ports.some((p) => p.name === n)).toBe(true);
    }
    const hip = o.ports.find((p) => p.name === "hip-row0")!;
    expect(hip.frame.origin).toEqual(o.dims.rows[0]!.hip);
  });
});

describe("makeOccupantArray — clearance, reach, aperture demands", () => {
  it("head clearance demand per row, person principal, magnitude SOURCED", () => {
    const o = twoRows();
    const heads = o.demands.filter((d) => d.kind === "clearance" && d.reason.includes("headliner"));
    expect(heads).toHaveLength(2);
    for (const h of heads) {
      expect(h.principal).toBe("person");
      expect(h.magnitude!.value).toBeCloseTo(50.8, 6);
      expect(h.magnitude!.license.tag).toBe("SOURCED");
      expect(h.reason).toMatch(/95th-percentile/);
    }
  });

  it("reach spheres to wheel and pedals: person principal, sphere semantics stated, radii licensed", () => {
    const o = twoRows();
    const reaches = o.demands.filter((d) => d.kind === "point-at");
    expect(reaches).toHaveLength(2);
    const wheel = reaches.find((d) => d.reason.includes("wheel"))!;
    const pedals = reaches.find((d) => d.reason.includes("pedal"))!;
    expect(wheel.reason).toMatch(/sphere/);
    expect(wheel.reason).toMatch(/5th-percentile female/);
    expect(wheel.magnitude!.value).toBe(677);
    expect(wheel.magnitude!.license.tag).toBe("SOURCED");
    // bounding cube side = 2 × radius
    if (wheel.shape!.kind === "box") {
      expect(wheel.shape!.size[0].value).toBeCloseTo(2 * 677, 6);
    }
    expect(pedals.magnitude!.license.tag).toBe("ASSUMED");
    expect(pedals.reason).toMatch(/sphere/);
  });

  it("entry aperture per row per side, and its reason states the rocker trade", () => {
    const o = twoRows();
    const apertures = o.demands.filter((d) => d.kind === "aperture");
    expect(apertures).toHaveLength(4); // 2 rows × both sides
    for (const a of apertures) {
      expect(a.principal).toBe("person");
      expect(a.reason).toMatch(/rocker/);
      expect(a.reason).toMatch(/sill/);
      expect(a.reason).toMatch(/hip breadth/);
    }
    // width requirement = sourced 95F hip breadth + assumed swing margin
    const first = apertures[0]!;
    expect(first.magnitude!.value).toBeCloseTo(400.1 + 250, 6);
    expect(first.magnitude!.license.tag).toBe("DERIVED");
    const chain = first.magnitude!.license.tag === "DERIVED" ? first.magnitude!.license.chain : "";
    expect(chain).toContain("[SOURCED]");
    expect(chain).toContain("[ASSUMED]");
  });

  it("aperture spans heel-to-head vertically at the row", () => {
    const o = twoRows();
    const a = o.demands.filter((d) => d.kind === "aperture")[0]!;
    if (a.shape!.kind === "box") {
      const r = o.dims.rows[0]!;
      expect(a.shape!.size[2].value).toBeCloseTo(r.head[2] - r.heel[2], 6);
    }
  });
});

describe("makeOccupantArray — anchors, mass, envelope", () => {
  it("seat and belt anchors: massBearing, LAW principal, regulations named", () => {
    const o = twoRows();
    const anchors = o.demands.filter((d) => d.kind === "anchorage");
    expect(anchors).toHaveLength(4); // 2 rows × (seat + belt)
    for (const a of anchors) {
      expect(a.massBearing).toBe(true);
      expect(a.principal).toBe("law");
      expect(a.reason).toMatch(/anchorage law/);
    }
    const seat = anchors.filter((a) => a.reason.includes("FMVSS No. 207"));
    const belt = anchors.filter((a) => a.reason.includes("FMVSS No. 210"));
    expect(seat).toHaveLength(2);
    expect(belt).toHaveLength(2);
    for (const b of belt) {
      expect(b.magnitude!.value).toBe(13345);
      expect(b.magnitude!.unit).toBe("N");
      expect(b.magnitude!.license.tag).toBe("SOURCED");
    }
  });

  it("mass = occupants × SOURCED 68 kg (ISO 2416 via UNECE)", () => {
    const o = twoRows();
    expect(o.dims.totalOccupants.value).toBe(5);
    expect(o.mass!.value).toBeCloseTo(5 * 68, 6);
    expect(o.mass!.license.tag).toBe("DERIVED");
    const chain = o.mass!.license.tag === "DERIVED" ? o.mass!.license.chain : "";
    expect(chain).toContain("[SOURCED]");
  });

  it("envelope bounds all rows' points", () => {
    const o = twoRows();
    const env = o.envelope!;
    const off = env.offset!;
    const half = env.size.map((q) => q.value / 2);
    for (const r of o.dims.rows) {
      for (const p of [r.heel, r.hip, r.eye, r.head]) {
        expect(p[0]).toBeGreaterThanOrEqual(off[0] - half[0]!);
        expect(p[0]).toBeLessThanOrEqual(off[0] + half[0]!);
        expect(p[2]).toBeGreaterThanOrEqual(off[2] - half[2]!);
        expect(p[2]).toBeLessThanOrEqual(off[2] + half[2]!);
      }
    }
  });

  it("driver ports exist and the wheel-hub target sits forward of and above the driver hip", () => {
    const o = twoRows();
    expect(o.ports.some((p) => p.name === "wheel-hub-target")).toBe(true);
    expect(o.ports.some((p) => p.name === "pedal-plane")).toBe(true);
    const hub = o.dims.wheelHub;
    const driverHip = o.dims.rows[0]!.hip;
    expect(hub[0]).toBeLessThan(driverHip[0]); // forward = −X
    expect(hub[2]).toBeGreaterThan(driverHip[2]);
  });

  it("every demand carries a principal and a non-empty reason; rejects empty arrays", () => {
    const o = twoRows();
    for (const d of o.demands) {
      expect(["person", "physics", "law", "brief"]).toContain(d.principal);
      expect(d.reason.trim().length).toBeGreaterThan(0);
    }
    expect(() => makeOccupantArray({ rows: [] }, makeAllocator())).toThrow(/at least one row/);
  });
});
