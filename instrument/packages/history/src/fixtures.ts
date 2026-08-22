/**
 * Replay-determinism fixture documents (the G1 heart), built IN CODE via
 * session verbs. The JSON files under packages/history/fixtures/ and the
 * golden hashes in fixtures/goldens.json are generated from these builders
 * (REGEN=1 in the fixture test rewrites them).
 *
 * Deterministic id layout of the first box in a fresh session:
 *   vertices vertex#0..7  (v[i][j][k], id = i*4+j*2+k over x,y,z bits)
 *   curves   curve#0..11  (X-edges 0-3, Y-edges 4-7, Z-edges 8-11)
 *   cells    cell#0..5    (-X, +X, -Y, +Y, -Z, +Z)
 */

import type { RectSpec } from "@car/schema";
import { createSession, type Session } from "./session.js";

export const fixtureNames = [
  "single-box",
  "welded-push",
  "split-pinch",
  "cut-detach-group",
] as const;

export type FixtureName = (typeof fixtureNames)[number];

/** Box in side view: world X 0..100, Z 0..80, Y (normal) 0..60. */
const BOX_RECT: RectSpec = {
  view: { kind: "side" },
  a: [0, 0],
  b: [100, 80],
  depth: 60,
  at: 0,
};

function singleBox(): Session {
  const s = createSession("fixture: single box");
  s.apply("tape", { kind: "box", rect: BOX_RECT });
  return s;
}

/**
 * Two boxes snapped at x=100 and welded along the bottom seam edge, then the
 * shared curve pushed down: both owners' boundaries must follow.
 */
function weldedPush(): Session {
  const s = createSession("fixture: welded boxes, shared curve pushed");
  s.apply("tape", { kind: "box", rect: BOX_RECT });
  s.apply("tape", {
    kind: "box",
    rect: { view: { kind: "side" }, a: [100, 0], b: [180, 80], depth: 60, at: 0 },
  });
  // box1 +X-face bottom Y-edge and box2 -X-face bottom Y-edge coincide.
  s.apply("weld", { curveA: "curve#6", curveB: "curve#16" });
  s.apply("push-pull", { target: { kind: "curve", id: "curve#6" }, delta: [0, 0, -8] });
  return s;
}

/**
 * Tape-line split of the +Y face creating a T-junction (curve#3 and curve#2
 * keep their whole trims for cell#5 / cell#4), then a control-point pinch on
 * the new shared interior curve#12.
 */
function splitPinch(): Session {
  const s = createSession("fixture: tape split with T-junction, ctrl pinch");
  s.apply("tape", { kind: "box", rect: BOX_RECT });
  s.apply("tape", {
    kind: "line",
    line: { view: { kind: "side" }, a: [40, -10], b: [40, 90], lineClass: "tape" },
    targets: ["cell#3"],
  });
  s.apply("push-pull", {
    target: { kind: "ctrl", id: "curve#12", seg: 0, idx: 1 },
    delta: [0, 6, 0],
  });
  return s;
}

/** A recorded cut, a mirror-detach, a group, creases, and ledger extras. */
function cutDetachGroup(): Session {
  const s = createSession("fixture: cut, mirror-detach, group, creases");
  s.apply("tape", { kind: "box", rect: BOX_RECT });
  s.apply("constrain", {
    note: "roof height held at 80 for the blocking study",
    spec: { kind: "z-max", value: 80 },
  });
  s.apply("cut", {
    profile: {
      kind: "rect",
      rect: { view: { kind: "plan" }, a: [20, 10], b: [60, 50], depth: -30, at: 80 },
    },
    targets: ["cell#5"],
    taperToPoint: false,
  });
  s.apply("mirror-detach", { cellId: "cell#3" });
  s.apply("group", { cellIds: ["cell#0", "cell#1"], name: "ends" });
  s.apply("crease", { curveId: "curve#3" });
  s.apply("crease", { curveId: "curve#9" });
  s.apply("place-point", { curveId: "curve#0", t: 0.5 });
  s.apply("assign-material", { targetId: "cell#5", name: "paint", color: "#c8102e" });
  return s;
}

export function buildFixture(name: FixtureName): Session {
  switch (name) {
    case "single-box":
      return singleBox();
    case "welded-push":
      return weldedPush();
    case "split-pinch":
      return splitPinch();
    case "cut-detach-group":
      return cutDetachGroup();
  }
}
