import { describe, expect, it } from "vitest";
import { makeAllocator } from "@car/schema";
import type { BandShape, BoxShape, DemandRecord, Quantity } from "@car/schema";
import {
  allRegulatory,
  bumperBeamHeightBand,
  driverMirrorFieldDemand,
  frontPlateProvision,
  headlampHeightBand,
  insideMirrorFieldDemand,
  pedestrianHoodClearance,
  pillarVisionDemand,
  rearPlateHeightBand,
  rearPlateProvision,
  tailLampHeightBand,
  wiperWipeZoneAreaA,
  wiperWipeZoneAreaB,
} from "../src/regulatory";

/** Every licensed quantity an entry carries: magnitude + shape components. */
function quantitiesOf(d: DemandRecord): Quantity[] {
  const out: Quantity[] = [];
  if (d.magnitude) out.push(d.magnitude);
  const s = d.shape;
  if (s) {
    if (s.kind === "band") out.push(s.zMin, s.zMax);
    else if (s.kind === "box") out.push(...s.size);
    else out.push(s.radius);
  }
  return out;
}

function bandOf(d: DemandRecord): BandShape {
  expect(d.shape).toBeDefined();
  expect(d.shape!.kind).toBe("band");
  return d.shape as BandShape;
}

function boxOf(d: DemandRecord): BoxShape {
  expect(d.shape).toBeDefined();
  expect(d.shape!.kind).toBe("box");
  return d.shape as BoxShape;
}

function citationOf(q: Quantity): string {
  expect(q.license.tag).toBe("SOURCED");
  return q.license.tag === "SOURCED" ? (q.license.citation ?? "") : "";
}

describe("allRegulatory — the law as principal, whole set", () => {
  const set = allRegulatory(makeAllocator());

  it("ships the full statute-§6 set: twelve entries", () => {
    expect(set).toHaveLength(12);
  });

  it("every entry is the law's, with a stateable reason", () => {
    for (const d of set) {
      expect(d.principal).toBe("law");
      expect(d.reason.trim().length).toBeGreaterThan(20);
    }
  });

  it("ids are demand-kind and unique", () => {
    const ids = set.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id.startsWith("demand#")).toBe(true);
  });

  it("every quantity is SOURCED with a real citation, or loud-ASSUMED — never bare, never DERIVED", () => {
    for (const d of set) {
      const qs = quantitiesOf(d);
      expect(qs.length).toBeGreaterThan(0);
      for (const q of qs) {
        expect(q.license.tag).not.toBe("DERIVED");
        if (q.license.tag === "SOURCED") {
          expect(q.license.source.trim().length).toBeGreaterThan(10);
          expect(q.license.citation).toBeDefined();
          expect(q.license.citation!.trim().length).toBeGreaterThan(40);
        } else {
          expect(q.license.tag).toBe("ASSUMED");
          const note = q.license.tag === "ASSUMED" ? q.license.note : "";
          expect(note).toMatch(/ASSUMED/);
          expect(note.trim().length).toBeGreaterThan(40);
        }
      }
    }
  });

  it("regulatory demands never bear mass — anchorage law has no business here", () => {
    for (const d of set) expect(d.massBearing).toBeUndefined();
  });

  it("is deterministic: same allocator seed, byte-identical records", () => {
    const a = allRegulatory(makeAllocator());
    const b = allRegulatory(makeAllocator());
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

describe("height bands — well-formed and exactly the regulated figures", () => {
  it("bumper beam band is 49 CFR 581's 16–20 in zone: 406.4–508.0 mm", () => {
    const d = bumperBeamHeightBand(makeAllocator());
    expect(d.kind).toBe("band");
    const band = bandOf(d);
    expect(band.zMin.value).toBeCloseTo(16 * 25.4, 9);
    expect(band.zMax.value).toBeCloseTo(20 * 25.4, 9);
    expect(band.zMin.value).toBeLessThan(band.zMax.value);
    expect(band.zMin.unit).toBe("mm");
    expect(band.zMax.unit).toBe("mm");
    expect(citationOf(band.zMin)).toMatch(/581/);
    expect(citationOf(band.zMin)).toMatch(/16 and 20 inches/);
  });

  it("headlamp band is FMVSS 108's 22–54 in: 558.8–1371.6 mm", () => {
    const d = headlampHeightBand(makeAllocator());
    const band = bandOf(d);
    expect(band.zMin.value).toBeCloseTo(22 * 25.4, 9);
    expect(band.zMax.value).toBeCloseTo(54 * 25.4, 9);
    expect(band.zMin.value).toBeLessThan(band.zMax.value);
    expect(citationOf(band.zMin)).toMatch(/Table I-a/);
    expect(citationOf(band.zMax)).toMatch(/22 inches/);
    const src = band.zMin.license.tag === "SOURCED" ? band.zMin.license.source : "";
    expect(src).toMatch(/FMVSS No\. 108/);
  });

  it("tail lamp band is FMVSS 108's 15–72 in: 381.0–1828.8 mm", () => {
    const d = tailLampHeightBand(makeAllocator());
    const band = bandOf(d);
    expect(band.zMin.value).toBeCloseTo(15 * 25.4, 9);
    expect(band.zMax.value).toBeCloseTo(72 * 25.4, 9);
    expect(band.zMin.value).toBeLessThan(band.zMax.value);
    expect(citationOf(band.zMin)).toMatch(/15 inches/);
    expect(citationOf(band.zMin)).toMatch(/72 inches/);
  });

  it("rear plate height band is EU 1003/2010's 0.30–1.20 m: 300–1200 mm", () => {
    const d = rearPlateHeightBand(makeAllocator());
    const band = bandOf(d);
    expect(band.zMin.value).toBe(300);
    expect(band.zMax.value).toBe(1200);
    expect(band.zMin.value).toBeLessThan(band.zMax.value);
    expect(citationOf(band.zMin)).toMatch(/1003\/2010/);
    expect(citationOf(band.zMax)).toMatch(/1\.20 m/);
  });

  it("every band in the set is well-formed: zMin < zMax, mm both sides", () => {
    for (const d of allRegulatory(makeAllocator())) {
      if (d.shape?.kind !== "band") continue;
      expect(d.shape.zMin.unit).toBe("mm");
      expect(d.shape.zMax.unit).toBe("mm");
      expect(d.shape.zMin.value).toBeLessThan(d.shape.zMax.value);
    }
  });
});

describe("vision fields — mirrors, pillar, wipe zones", () => {
  it("inside mirror: 20° included horizontal angle, FMVSS 111, honest no-shape corridor", () => {
    const d = insideMirrorFieldDemand(makeAllocator());
    expect(d.kind).toBe("envelope");
    expect(d.shape).toBeUndefined(); // to-horizon corridor: a finite box would lie
    expect(d.magnitude!.value).toBe(20);
    expect(d.magnitude!.unit).toBe("deg");
    expect(citationOf(d.magnitude!)).toMatch(/61 m/);
    expect(d.reason).toMatch(/61 m/);
  });

  it("driver outside mirror: 2400 mm lateral road view, FMVSS 111", () => {
    const d = driverMirrorFieldDemand(makeAllocator());
    expect(d.kind).toBe("envelope");
    expect(d.magnitude!.value).toBe(2400);
    expect(d.magnitude!.unit).toBe("mm");
    expect(citationOf(d.magnitude!)).toMatch(/10\.7 m/);
    expect(d.reason).toMatch(/10\.7 m/);
  });

  it("A-pillar: 6° binocular obstruction cap, UN R125, as a clearance", () => {
    const d = pillarVisionDemand(makeAllocator());
    expect(d.kind).toBe("clearance");
    expect(d.magnitude!.value).toBe(6);
    expect(d.magnitude!.unit).toBe("deg");
    const src = d.magnitude!.license.tag === "SOURCED" ? d.magnitude!.license.source : "";
    expect(src).toMatch(/125/);
    expect(citationOf(d.magnitude!)).toMatch(/6 degrees/);
  });

  it("wipe zones: ≥98% of area A and ≥80% of area B, EU 1008/2010, as ratios", () => {
    const a = wiperWipeZoneAreaA(makeAllocator());
    const b = wiperWipeZoneAreaB(makeAllocator());
    expect(a.magnitude!.value).toBe(0.98);
    expect(b.magnitude!.value).toBe(0.8);
    expect(a.magnitude!.unit).toBe("ratio");
    expect(b.magnitude!.unit).toBe("ratio");
    expect(citationOf(a.magnitude!)).toMatch(/1008\/2010/);
    expect(citationOf(a.magnitude!)).toMatch(/98%/);
    // the US mechanism is named honestly as searched-not-retrieved
    expect(citationOf(a.magnitude!)).toMatch(/FMVSS 104/);
    expect(citationOf(b.magnitude!)).toMatch(/80%/);
  });
});

describe("plate provisions and the pedestrian gap", () => {
  it("front and rear plate provisions reserve the AAMVA 304.8 × 152.4 mm plate", () => {
    for (const make of [frontPlateProvision, rearPlateProvision]) {
      const d = make(makeAllocator());
      expect(d.kind).toBe("envelope");
      const box = boxOf(d);
      const [depth, w, h] = box.size;
      expect(w.value).toBeCloseTo(12 * 25.4, 9);
      expect(h.value).toBeCloseTo(6 * 25.4, 9);
      expect(citationOf(w)).toMatch(/AAMVA/);
      // the depth is the one modeling number: loud-ASSUMED, never silently sourced
      expect(depth.license.tag).toBe("ASSUMED");
      const note = depth.license.tag === "ASSUMED" ? depth.license.note : "";
      expect(note).toMatch(/ASSUMED/);
      expect(note).toMatch(/not found/);
    }
  });

  it("rear plate citation names the EU-market alternative space", () => {
    const d = rearPlateProvision(makeAllocator());
    const box = boxOf(d);
    expect(citationOf(box.size[1])).toMatch(/520/);
    expect(citationOf(box.size[1])).toMatch(/340/);
  });

  it("pedestrian hood clearance: 70 mm SOURCED air gap, HIC basis named", () => {
    const d = pedestrianHoodClearance(makeAllocator());
    expect(d.kind).toBe("clearance");
    expect(d.magnitude!.value).toBe(70);
    expect(d.magnitude!.unit).toBe("mm");
    const cite = citationOf(d.magnitude!);
    expect(cite).toMatch(/HIC/);
    expect(cite).toMatch(/70 mm/);
    // the citation is honest that the binding law is performance-based
    expect(cite).toMatch(/performance limits, not/);
    // the reason states the coupling the charge names
    expect(d.reason).toMatch(/engine height to the hood line/);
  });
});

describe("individual exports agree with the assembled set", () => {
  it("allRegulatory is exactly the twelve entries in statute order", () => {
    const alloc = makeAllocator();
    const set = allRegulatory(alloc);
    const makers = [
      bumperBeamHeightBand,
      headlampHeightBand,
      tailLampHeightBand,
      insideMirrorFieldDemand,
      driverMirrorFieldDemand,
      pillarVisionDemand,
      wiperWipeZoneAreaA,
      wiperWipeZoneAreaB,
      frontPlateProvision,
      rearPlateProvision,
      rearPlateHeightBand,
      pedestrianHoodClearance,
    ];
    expect(set).toHaveLength(makers.length);
    for (let i = 0; i < makers.length; i++) {
      const maker = makers[i]!;
      const solo = maker(makeAllocator());
      const inSet = set[i]!;
      expect(inSet.reason).toBe(solo.reason);
      expect(inSet.kind).toBe(solo.kind);
      expect(inSet.magnitude?.value).toBe(solo.magnitude?.value);
    }
  });
});
