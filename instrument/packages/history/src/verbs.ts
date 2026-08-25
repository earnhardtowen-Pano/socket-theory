/**
 * @car/history verb wire shapes — the canonical VerbArgs for every verb in
 * the closed set, plus structural validation. Documents load from JSON, so
 * every executor validates before touching state.
 */

import type {
  CarDocument,
  Id,
  IdKind,
  JsonValue,
  LineSpec,
  OrthoView,
  Pt2,
  Pt3,
  RectSpec,
  VerbName,
} from "@car/schema";
import { DOCUMENT_VERSION } from "@car/schema";

// ---------------------------------------------------------------------------
// Canonical argument shapes
// ---------------------------------------------------------------------------

export type TapeArgs =
  | { kind: "box"; rect: RectSpec }
  | { kind: "line"; line: LineSpec; targets: Id[] };

export interface ConstrainArgs {
  note: string;
  spec: JsonValue;
}

export interface WeldArgs {
  curveA: Id;
  curveB: Id;
}

export interface DetachArgs {
  curveId: Id;
}

export type PushPullTargetArgs =
  | { kind: "cell" | "curve" | "vertex"; id: Id }
  | { kind: "ctrl"; id: Id; seg: number; idx: 0 | 1 | 2 | 3 };

export interface PushPullArgs {
  target: PushPullTargetArgs;
  delta: Pt3;
}

export interface RotateArgs {
  cellIds: Id[];
  origin: Pt3;
  axis: Pt3;
  angleDeg: number;
}

export interface TaperArgs {
  cellId: Id;
  side: 0 | 1 | 2 | 3;
  scale: number;
}

export type CutProfile =
  | { kind: "rect"; rect: RectSpec }
  | { kind: "half-circle"; center: Pt2; radius: number; view: OrthoView; at: number; depth: number };

export interface CutArgs {
  profile: CutProfile;
  targets: Id[];
  taperToPoint?: boolean;
}

export interface PlacePointArgs {
  curveId: Id;
  t: number;
}

export interface FitThroughLineArgs {
  points: Pt3[];
}

/**
 * Crown. The multiplier on how hard the named cells leave their seams.
 *
 * The first control this instrument has ever had over a patch INTERIOR: a
 * Coons patch interpolates four curves and everything between them follows,
 * which is why the audit's fullness row has read "interiors are determined,
 * never designed" from the start. Scaling the transverse part of the
 * cross-boundary derivative bulges the middle without moving a boundary point
 * or rotating a tangent plane.
 */
export interface FullnessArgs {
  readonly cellIds: readonly Id[];
  /** 1 is the blend's own answer. Above 1 is fuller, below 1 is flatter. */
  readonly amount: number;
}

/**
 * Split one shared curve into two at `t` — amendment A13.
 *
 * The head keeps the original id and the tail gets a fresh one, so a mark can
 * finally own PART of a long edge: an arch over one stretch of the rocker, a
 * door outline over one stretch of the beltline, a screen aperture over one
 * stretch of the cowl. Refused where a cell claims across `t`, because a cell
 * has four sides by statute and splitting one it holds would make it five.
 */
export interface SplitCurveArgs {
  readonly curveId: Id;
  /** Strictly inside (0,1), in the curve's own uniform parameter. */
  readonly t: number;
}

export interface GroupArgs {
  cellIds: Id[];
  name: string;
}

export interface AssignMaterialArgs {
  targetId: Id;
  name: string;
  color: string;
}

export interface MirrorDetachArgs {
  cellId: Id;
}

export interface CreaseArgs {
  curveId: Id;
}

/**
 * A panel GAP — a shutline, where two pieces of bodywork stop and the eye sees
 * daylight or a seal.
 *
 * Deliberately not the same mark as `crease`, because the statute already
 * treats them as different things and depends on the difference. A crease is a
 * TANGENT BREAK: a beltline, a sill, the edge of a wheel box. A gap is a HOLE
 * between two panels. Clause 24 has panels either side of a gap referencing the
 * same authored gap curve; amendment A2 rules that a shutline does NOT break
 * flow unless it happens to sit on a character line.
 *
 * `FrameState.markGap` has been there since the frame was written. Until
 * amendment A10 there was no verb to reach it, so no curve in any document
 * could be a gap, `quilt.gaps` was empty on every car, and the groove pass fell
 * back to the crease set — which is why the P1 engraved a groove down its own
 * beltline.
 */
export interface GapArgs {
  curveId: Id;
}

/**
 * Give a feature line a radius, in millimetres — amendment A12.
 *
 * WHAT THE TOOL COULD SAY BEFORE THIS. Two things. `crease` switched the
 * tangent field off across a curve, and the two patches met at whatever angle
 * their boundaries gave: a knife edge, the same knife edge for the whole
 * length, ending dead wherever the curve did. Nothing switched it off and the
 * seam was invisible. There was no third thing, and real bodies are almost
 * entirely the third thing — a line that is crisp over a wing, opens across a
 * door, and is gone before the quarter.
 *
 * The McLaren made the case in one build. Its wing crown creased engraved a
 * chine down the length of a bonnet that is a single pressing; uncreased there
 * was no line at all. Both are in the commit history and neither is the car.
 *
 * `radius` is at the curve's t = 0 and `endRadius` at t = 1, ramped between by
 * a smootherstep so a radius profile does not put a curvature step at either
 * end of its own run. Both in millimetres, because that is what a stylist says
 * and what a section shows.
 *
 *   radius 0     a knife edge — the same instruction as `crease` alone
 *   radius small crisp: the turn is packed into a narrow band
 *   radius large soft: the turn is spread across the panel and the line goes
 *
 * AND THE LINE DIES ON ITS OWN WHERE ITS BREAK DOES. The delivered radius goes
 * as band·speed/(2·break), so a feature line whose two surfaces drift into one
 * plane grows its radius without being asked. That is how a real one runs out
 * and it costs nothing to author.
 *
 * WHAT IT IS NOT. Not a rolling-ball fillet cut into the body: the edge stays
 * exactly on the shared curve, because that bit-for-bit identity is the whole
 * of how G0 holds here and trimming it away for a sewing tolerance is not a
 * trade worth making. The gap between this and a true fillet is r(sec(φ/2)−1)
 * and `blendProbe` publishes it per edge — 69 microns on a 15° line at 8 mm,
 * 0.41 mm on a 45° break at 5.
 */
export interface SoftenArgs {
  curveId: Id;
  /** Radius at the curve's t = 0, mm. Zero is a knife edge. */
  radius: number;
  /** Radius at t = 1, mm. Absent means constant along the line. */
  endRadius?: number;
}

/**
 * Bring the curve network coplanar where two curves cross.
 *
 * A patch has no freedom at a corner — its tangent plane there is spanned by
 * the two curves meeting at the vertex — so a corner the network turns badly
 * pins a tangent break no surfacing pass can remove. This rotates each
 * adjacent curve's END tangent just far enough to bring the two planes into
 * one, by moving a single control point. The endpoint never moves, so every
 * weld holds.
 *
 * MINIMAL, NOT TIDY. It does not make the crossing curves tangent to each
 * other, which would be a restyle: coplanarity is what the surfacing needs and
 * it costs a fraction of the swing that tangency would.
 *
 * `maxBreakDeg` is the line between a fault and a feature — corners turning
 * sharper than this are left exactly as authored. It is the same judgment the
 * render's crease angle makes, and defaults to the same number.
 */
export interface FairCornersArgs {
  maxBreakDeg: number;
}

export interface ApplyEntryArgs {
  entry: CarDocument;
}

/** The verb -> args map. These are the canonical wire shapes. */
export interface VerbArgs {
  tape: TapeArgs;
  constrain: ConstrainArgs;
  weld: WeldArgs;
  detach: DetachArgs;
  "push-pull": PushPullArgs;
  rotate: RotateArgs;
  taper: TaperArgs;
  cut: CutArgs;
  "place-point": PlacePointArgs;
  "fit-through-line": FitThroughLineArgs;
  group: GroupArgs;
  fullness: FullnessArgs;
  "assign-material": AssignMaterialArgs;
  "split-curve": SplitCurveArgs;
  "mirror-detach": MirrorDetachArgs;
  crease: CreaseArgs;
  gap: GapArgs;
  soften: SoftenArgs;
  "fair-corners": FairCornersArgs;
  "apply-entry": ApplyEntryArgs;
}

// ---------------------------------------------------------------------------
// Structural validation
// ---------------------------------------------------------------------------

const ID_KINDS: readonly IdKind[] = [
  "cell", "curve", "vertex", "datum", "group", "material",
  "feature", "demand", "port", "part", "constraint",
];

export const ID_PATTERN = /^([a-z-]+)#(\d+)$/;

function fail(verb: string, msg: string): never {
  throw new Error(`${verb}: ${msg}`);
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

function checkId(verb: string, x: unknown, kind: IdKind, field: string): Id {
  if (typeof x !== "string") fail(verb, `${field} must be an id string`);
  const m = ID_PATTERN.exec(x);
  if (!m || !ID_KINDS.includes(m[1] as IdKind)) fail(verb, `${field} is not a valid id: ${x}`);
  if (m[1] !== kind) fail(verb, `${field} must be a ${kind} id, got ${x}`);
  return x as Id;
}

function checkNum(verb: string, x: unknown, field: string): number {
  if (typeof x !== "number" || !Number.isFinite(x)) fail(verb, `${field} must be a finite number`);
  return x;
}

function checkPt2(verb: string, x: unknown, field: string): Pt2 {
  if (!Array.isArray(x) || x.length !== 2) fail(verb, `${field} must be a Pt2`);
  return [checkNum(verb, x[0], field), checkNum(verb, x[1], field)];
}

function checkPt3(verb: string, x: unknown, field: string): Pt3 {
  if (!Array.isArray(x) || x.length !== 3) fail(verb, `${field} must be a Pt3`);
  return [checkNum(verb, x[0], field), checkNum(verb, x[1], field), checkNum(verb, x[2], field)];
}

function checkString(verb: string, x: unknown, field: string): string {
  if (typeof x !== "string" || x.length === 0) fail(verb, `${field} must be a non-empty string`);
  return x;
}

function checkView(verb: string, x: unknown, field: string): OrthoView {
  if (!isRecord(x)) fail(verb, `${field} must be a view`);
  const kind = x["kind"];
  if (kind === "side" || kind === "plan" || kind === "front") return { kind };
  if (kind === "section") {
    return { kind, stationX: checkNum(verb, x["stationX"], `${field}.stationX`) };
  }
  return fail(verb, `${field}.kind must be side/plan/front/section`);
}

function checkRect(verb: string, x: unknown, field: string): RectSpec {
  if (!isRecord(x)) fail(verb, `${field} must be a rect`);
  return {
    view: checkView(verb, x["view"], `${field}.view`),
    a: checkPt2(verb, x["a"], `${field}.a`),
    b: checkPt2(verb, x["b"], `${field}.b`),
    depth: checkNum(verb, x["depth"], `${field}.depth`),
    at: checkNum(verb, x["at"], `${field}.at`),
  };
}

function checkLine(verb: string, x: unknown, field: string): LineSpec {
  if (!isRecord(x)) fail(verb, `${field} must be a line`);
  const lineClass = x["lineClass"];
  if (lineClass !== "tape" && lineClass !== "sketch") {
    fail(verb, `${field}.lineClass must be "tape" or "sketch"`);
  }
  return {
    view: checkView(verb, x["view"], `${field}.view`),
    a: checkPt2(verb, x["a"], `${field}.a`),
    b: checkPt2(verb, x["b"], `${field}.b`),
    lineClass,
  };
}

function checkIdArray(verb: string, x: unknown, kind: IdKind, field: string): Id[] {
  if (!Array.isArray(x)) fail(verb, `${field} must be an array of ids`);
  return x.map((v, i) => checkId(verb, v, kind, `${field}[${i}]`));
}

function checkJson(verb: string, x: unknown, field: string): JsonValue {
  if (x === null || typeof x === "string" || typeof x === "boolean") return x;
  if (typeof x === "number") return checkNum(verb, x, field);
  if (Array.isArray(x)) return x.map((v, i) => checkJson(verb, v, `${field}[${i}]`));
  if (isRecord(x)) {
    const out: { [k: string]: JsonValue } = {};
    for (const k of Object.keys(x)) out[k] = checkJson(verb, x[k], `${field}.${k}`);
    return out;
  }
  return fail(verb, `${field} must be JSON-serializable`);
}

export function validateDocumentShape(x: unknown, context: string): CarDocument {
  if (!isRecord(x)) fail(context, "document must be an object");
  if (x["format"] !== "car") fail(context, `format must be "car"`);
  if (x["version"] !== DOCUMENT_VERSION) fail(context, `unsupported document version ${String(x["version"])}`);
  if (typeof x["title"] !== "string") fail(context, "title must be a string");
  const counters = x["counters"];
  if (!isRecord(counters)) fail(context, "counters must be an object");
  for (const kind of ID_KINDS) {
    const v = counters[kind];
    if (typeof v !== "number" || !Number.isInteger(v) || v < 0) {
      fail(context, `counters.${kind} must be a non-negative integer`);
    }
  }
  const verbs = x["verbs"];
  if (!Array.isArray(verbs)) fail(context, "verbs must be an array");
  verbs.forEach((rec, i) => {
    if (!isRecord(rec)) fail(context, `verbs[${i}] must be an object`);
    if (rec["seq"] !== i) fail(context, `verbs[${i}].seq must be ${i} (replay order is array order)`);
    if (typeof rec["verb"] !== "string") fail(context, `verbs[${i}].verb must be a string`);
  });
  return x as unknown as CarDocument;
}

/** Validate args for a verb; returns the typed shape or throws. */
export function validateVerbArgs<V extends VerbName>(verb: V, raw: unknown): VerbArgs[V] {
  const a = raw as Record<string, unknown>;
  const done = (v: unknown): VerbArgs[V] => v as VerbArgs[V];
  if (!isRecord(raw)) fail(verb, "args must be an object");
  switch (verb) {
    case "tape": {
      if (a["kind"] === "box") {
        return done({ kind: "box", rect: checkRect(verb, a["rect"], "rect") });
      }
      if (a["kind"] === "line") {
        return done({
          kind: "line",
          line: checkLine(verb, a["line"], "line"),
          targets: checkIdArray(verb, a["targets"], "cell", "targets"),
        });
      }
      return fail(verb, `kind must be "box" or "line"`);
    }
    case "constrain":
      return done({
        note: checkString(verb, a["note"], "note"),
        spec: checkJson(verb, a["spec"], "spec"),
      });
    case "weld":
      return done({
        curveA: checkId(verb, a["curveA"], "curve", "curveA"),
        curveB: checkId(verb, a["curveB"], "curve", "curveB"),
      });
    case "detach":
      return done({ curveId: checkId(verb, a["curveId"], "curve", "curveId") });
    case "push-pull": {
      const t = a["target"];
      if (!isRecord(t)) fail(verb, "target must be an object");
      const kind = t["kind"];
      let target: PushPullTargetArgs;
      if (kind === "cell" || kind === "curve" || kind === "vertex") {
        target = { kind, id: checkId(verb, t["id"], kind, "target.id") };
      } else if (kind === "ctrl") {
        const seg = checkNum(verb, t["seg"], "target.seg");
        const idx = t["idx"];
        if (!Number.isInteger(seg) || seg < 0) fail(verb, "target.seg must be a non-negative integer");
        if (idx !== 0 && idx !== 1 && idx !== 2 && idx !== 3) fail(verb, "target.idx must be 0..3");
        target = { kind, id: checkId(verb, t["id"], "curve", "target.id"), seg, idx };
      } else {
        return fail(verb, "target.kind must be cell/curve/vertex/ctrl");
      }
      return done({ target, delta: checkPt3(verb, a["delta"], "delta") });
    }
    case "rotate":
      return done({
        cellIds: checkIdArray(verb, a["cellIds"], "cell", "cellIds"),
        origin: checkPt3(verb, a["origin"], "origin"),
        axis: checkPt3(verb, a["axis"], "axis"),
        angleDeg: checkNum(verb, a["angleDeg"], "angleDeg"),
      });
    case "taper": {
      const side = a["side"];
      if (side !== 0 && side !== 1 && side !== 2 && side !== 3) fail(verb, "side must be 0..3");
      return done({
        cellId: checkId(verb, a["cellId"], "cell", "cellId"),
        side,
        scale: checkNum(verb, a["scale"], "scale"),
      });
    }
    case "cut": {
      const p = a["profile"];
      if (!isRecord(p)) fail(verb, "profile must be an object");
      let profile: CutProfile;
      if (p["kind"] === "rect") {
        profile = { kind: "rect", rect: checkRect(verb, p["rect"], "profile.rect") };
      } else if (p["kind"] === "half-circle") {
        const radius = checkNum(verb, p["radius"], "profile.radius");
        if (radius <= 0) fail(verb, "profile.radius must be positive");
        profile = {
          kind: "half-circle",
          center: checkPt2(verb, p["center"], "profile.center"),
          radius,
          view: checkView(verb, p["view"], "profile.view"),
          at: checkNum(verb, p["at"], "profile.at"),
          depth: checkNum(verb, p["depth"], "profile.depth"),
        };
      } else {
        return fail(verb, `profile.kind must be "rect" or "half-circle"`);
      }
      const targets = checkIdArray(verb, a["targets"], "cell", "targets");
      if (targets.length === 0) fail(verb, "cut needs at least one target");
      const out: CutArgs = { profile, targets };
      if (a["taperToPoint"] !== undefined) {
        if (typeof a["taperToPoint"] !== "boolean") fail(verb, "taperToPoint must be boolean");
        out.taperToPoint = a["taperToPoint"];
      }
      return done(out);
    }
    case "place-point": {
      const t = checkNum(verb, a["t"], "t");
      if (t < 0 || t > 1) fail(verb, "t must be in [0,1]");
      return done({ curveId: checkId(verb, a["curveId"], "curve", "curveId"), t });
    }
    case "fit-through-line": {
      const pts = a["points"];
      if (!Array.isArray(pts) || pts.length < 2) fail(verb, "points must hold at least 2 points");
      return done({ points: pts.map((p, i) => checkPt3(verb, p, `points[${i}]`)) });
    }
    case "group":
      return done({
        cellIds: checkIdArray(verb, a["cellIds"], "cell", "cellIds"),
        name: checkString(verb, a["name"], "name"),
      });
    case "fullness": {
      const amount = a["amount"];
      if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) {
        fail(verb, "amount must be a positive finite number");
      }
      return done({
        cellIds: checkIdArray(verb, a["cellIds"], "cell", "cellIds"),
        amount: amount as number,
      });
    }
    case "split-curve": {
      const t = a["t"];
      if (typeof t !== "number" || !Number.isFinite(t) || t <= 0 || t >= 1) {
        fail(verb, "t must be a finite number strictly inside (0,1)");
      }
      return done({ curveId: checkId(verb, a["curveId"], "curve", "curveId"), t: t as number });
    }
    case "assign-material": {
      const targetId = a["targetId"];
      if (typeof targetId !== "string" || !ID_PATTERN.test(targetId)) {
        fail(verb, "targetId must be an id");
      }
      return done({
        targetId: targetId as Id,
        name: checkString(verb, a["name"], "name"),
        color: checkString(verb, a["color"], "color"),
      });
    }
    case "mirror-detach":
      return done({ cellId: checkId(verb, a["cellId"], "cell", "cellId") });
    case "crease":
    case "gap":
      return done({ curveId: checkId(verb, a["curveId"], "curve", "curveId") });
    case "soften": {
      const curveId = checkId(verb, a["curveId"], "curve", "curveId");
      const radius = checkNum(verb, a["radius"], "radius");
      if (!(radius >= 0)) fail(verb, "radius must be zero or more, in millimetres");
      const hasEnd = a["endRadius"] !== undefined;
      const endRadius = hasEnd ? checkNum(verb, a["endRadius"], "endRadius") : radius;
      if (!(endRadius >= 0)) fail(verb, "endRadius must be zero or more, in millimetres");
      return done(hasEnd ? { curveId, radius, endRadius } : { curveId, radius });
    }
    case "fair-corners": {
      const maxBreakDeg = checkNum(verb, a["maxBreakDeg"], "maxBreakDeg");
      if (maxBreakDeg <= 0 || maxBreakDeg >= 180) {
        fail(verb, "maxBreakDeg must be in (0,180)");
      }
      return done({ maxBreakDeg });
    }
    case "apply-entry":
      return done({ entry: validateDocumentShape(a["entry"], "apply-entry") });
    default:
      return fail(String(verb), "unknown verb");
  }
}
