import { describe, expect, it } from "vitest";
import { makeAllocator } from "@car/schema";
import { assumed, derived } from "@car/demand";
import { makeSteering, turningCircleBackSolve, typicalSteeringRatio, type SteeringParams } from "../src/steering";
import { makeSuspension } from "../src/suspension";

function steering(over: Partial<SteeringParams> = {}) {
  return makeSteering(
    {
      rackPosition: "aft",
      ratio: assumed(15, "ratio", "test ratio"),
      trackWidth: assumed(1560, "mm", "test track"),
      ...over,
    },
    makeAllocator(),
  );
}

describe("turningCircleBackSolve — bicycle model, chain shown", () => {
  it("computes atan(wheelbase / (circle/2)) exactly", () => {
    const angle = turningCircleBackSolve(assumed(11, "m", "test brief circle"), assumed(2700, "mm", "test wheelbase"));
    expect(angle.unit).toBe("deg");
    expect(angle.value).toBeCloseTo((Math.atan2(2700, 5500) * 180) / Math.PI, 9);
    expect(angle.value).toBeCloseTo(26.148, 2);
  });

  it("is MONOTONE: a tighter circle demands more steer angle", () => {
    const wb = () => assumed(2700, "mm", "test wheelbase");
    const a12 = turningCircleBackSolve(assumed(12, "m", "t"), wb());
    const a11 = turningCircleBackSolve(assumed(11, "m", "t"), wb());
    const a10 = turningCircleBackSolve(assumed(10, "m", "t"), wb());
    const a9 = turningCircleBackSolve(assumed(9, "m", "t"), wb());
    expect(a11.value).toBeGreaterThan(a12.value);
    expect(a10.value).toBeGreaterThan(a11.value);
    expect(a9.value).toBeGreaterThan(a10.value);
  });

  it("a longer wheelbase needs more angle for the same circle", () => {
    const short = turningCircleBackSolve(assumed(11, "m", "t"), assumed(2500, "mm", "t"));
    const long = turningCircleBackSolve(assumed(11, "m", "t"), assumed(3000, "mm", "t"));
    expect(long.value).toBeGreaterThan(short.value);
  });

  it("the chain states the model and its simplifications", () => {
    const angle = turningCircleBackSolve(assumed(11, "m", "t"), assumed(2700, "mm", "t"));
    expect(angle.license.tag).toBe("DERIVED");
    const chain = angle.license.tag === "DERIVED" ? angle.license.chain : "";
    expect(chain).toContain("bicycle-model");
    expect(chain).toContain("atan(wheelbase / R)");
    expect(chain).toMatch(/no Ackermann/);
  });

  it("accepts mm circles too, and rejects degenerate geometry", () => {
    const fromMm = turningCircleBackSolve(assumed(11000, "mm", "t"), assumed(2700, "mm", "t"));
    expect(fromMm.value).toBeCloseTo(26.148, 2);
    expect(() => turningCircleBackSolve(assumed(5, "m", "t"), assumed(2700, "mm", "t"))).toThrow(/degenerates/);
    expect(() => turningCircleBackSolve(assumed(-11, "m", "t"), assumed(2700, "mm", "t"))).toThrow(/positive/);
  });

  it("closes the charge chain: back-solved angle WIDENS the front swept envelope", () => {
    const tight = turningCircleBackSolve(assumed(9.5, "m", "tight brief"), assumed(2700, "mm", "t"));
    const loose = turningCircleBackSolve(assumed(12.5, "m", "loose brief"), assumed(2700, "mm", "t"));
    const mk = (angle: typeof tight) =>
      makeSuspension(
        {
          architecture: "strut",
          axle: "front",
          jounceTravel: assumed(100, "mm", "t"),
          reboundTravel: assumed(100, "mm", "t"),
          trackWidth: assumed(1560, "mm", "t"),
          tireOverallDiameter: derived(631.9, "mm", "t"),
          tireSectionWidth: derived(205, "mm", "t"),
          steerAngleDeg: angle,
        },
        makeAllocator(),
      );
    const wide = mk(tight);
    const narrow = mk(loose);
    expect(wide.dims.sweptWheelWidth.value).toBeGreaterThan(narrow.dims.sweptWheelWidth.value);
  });
});

describe("makeSteering — rack, column, demands", () => {
  it("rack sits fore or aft of the axle per the param, sign shown in the chain", () => {
    const fore = steering({ rackPosition: "fore" });
    const aftR = steering({ rackPosition: "aft" });
    expect(fore.dims.rackStationX.value).toBeLessThan(0);
    expect(aftR.dims.rackStationX.value).toBeGreaterThan(0);
    expect(fore.dims.rackStationX.value).toBeCloseTo(-aftR.dims.rackStationX.value, 6);
  });

  it("publishes the column as a TRUE routed-path demand from hub to pinion", () => {
    const s = steering();
    const path = s.demands.find((d) => d.kind === "routed-path")!;
    expect(path).toBeDefined();
    expect(path.principal).toBe("person");
    expect(path.reason).toMatch(/firewall/);
    expect(path.reason).toMatch(/engine envelope/);
    expect(path.shape!.kind).toBe("path");
    if (path.shape!.kind === "path") {
      expect(path.shape!.waypoints.length).toBeGreaterThanOrEqual(2);
      // first waypoint = wheel hub (matches dims), last = pinion at the rack station
      expect(path.shape!.waypoints[0]).toEqual(s.dims.wheelHub);
      expect(path.shape!.waypoints[path.shape!.waypoints.length - 1]![0]).toBeCloseTo(s.dims.rackStationX.value, 6);
      expect(path.shape!.radius.value).toBe(s.dims.columnRadius.value);
    }
  });

  it("column radius default is ASSUMED loudly; a passed radius wins", () => {
    const s = steering();
    expect(s.dims.columnRadius.license.tag).toBe("ASSUMED");
    const note = s.dims.columnRadius.license.tag === "ASSUMED" ? s.dims.columnRadius.license.note : "";
    expect(note).toMatch(/no dimensioned source|no source/);
    const given = steering({ columnRadius: assumed(45, "mm", "test radius") });
    expect(given.dims.columnRadius.value).toBe(45);
  });

  it("authored waypoints are used verbatim", () => {
    const s = steering({
      columnWaypoints: [
        [1400, 370, 640],
        [900, 340, 350],
        [140, 330, 0],
      ],
    });
    const path = s.demands.find((d) => d.kind === "routed-path")!;
    if (path.shape!.kind === "path") {
      expect(path.shape!.waypoints).toHaveLength(3);
      expect(path.shape!.waypoints[1]).toEqual([900, 340, 350]);
    }
    expect(s.dims.wheelHub).toEqual([1400, 370, 640]);
  });

  it("rack mounts are massBearing anchorages, both sides", () => {
    const s = steering();
    const anchors = s.demands.filter((d) => d.kind === "anchorage");
    expect(anchors).toHaveLength(2);
    for (const a of anchors) {
      expect(a.massBearing).toBe(true);
      expect(a.reason).toMatch(/anchorage law/);
    }
  });

  it("rack length = track − 2×tie-rod, and tie-rod/mount ports sit on the rack line", () => {
    const s = steering();
    expect(s.dims.rackLength.value).toBeCloseTo(1560 - 2 * 320, 6);
    const tieL = s.ports.find((p) => p.name === "tie-rod-L")!;
    const tieR = s.ports.find((p) => p.name === "tie-rod-R")!;
    expect(tieL.frame.origin[0]).toBeCloseTo(s.dims.rackStationX.value, 6);
    expect(tieL.frame.origin[1]).toBeCloseTo(-tieR.frame.origin[1], 6);
    for (const name of ["rack-pinion", "column-top", "mount-L", "mount-R"]) {
      expect(s.ports.some((p) => p.name === name)).toBe(true);
    }
  });

  it("typicalSteeringRatio is SOURCED with the range in the citation", () => {
    const r = typicalSteeringRatio();
    expect(r.value).toBe(14);
    expect(r.license.tag).toBe("SOURCED");
    const cit = r.license.tag === "SOURCED" ? r.license.citation ?? "" : "";
    expect(cit).toMatch(/12:1|20:1/);
  });

  it("every demand carries a principal and a non-empty reason; throws on bad params", () => {
    const s = steering();
    for (const d of s.demands) {
      expect(["person", "physics", "law", "brief"]).toContain(d.principal);
      expect(d.reason.trim().length).toBeGreaterThan(0);
    }
    expect(() => steering({ trackWidth: assumed(500, "mm", "t") })).toThrow(/too narrow/);
    expect(() => steering({ ratio: assumed(0, "ratio", "t") })).toThrow(/positive/);
  });
});
