/**
 * @car/schema — the frozen seams of the instrument.
 *
 * This package imports nothing and everything imports it. It defines:
 *   - stable IDs and the deterministic allocator
 *   - the verb envelope and the saved document format (verb history + authored inputs)
 *   - sketch geometry wire shapes (points, rects, lines, cubic Bézier chains)
 *   - the license / principal / demand / port record shapes (NO part-type field —
 *     solver blindness is structural: there is nothing to branch on)
 *   - the RenderFeed one-way buffer contract from model to render
 *
 * Changing anything here after fan-out is a merge event across every package:
 * treat this file as frozen law and amend deliberately.
 */

// ---------------------------------------------------------------------------
// IDs — deterministic, monotonic per document. No randomness, no wall clock.
// ---------------------------------------------------------------------------

export type IdKind =
  | "cell"
  | "curve"
  | "vertex"
  | "datum"
  | "group"
  | "material"
  | "feature"
  | "demand"
  | "port"
  | "part"
  | "constraint";

export type Id = `${IdKind}#${number}`;

export interface IdAllocator {
  /** Allocate the next id of a kind. Pure counter state; part of authored state. */
  next(kind: IdKind): Id;
  /** Snapshot counters for serialization. */
  counters(): Readonly<Record<IdKind, number>>;
}

export function makeAllocator(seed?: Partial<Record<IdKind, number>>): IdAllocator {
  const counters: Record<IdKind, number> = {
    cell: 0, curve: 0, vertex: 0, datum: 0, group: 0, material: 0,
    feature: 0, demand: 0, port: 0, part: 0, constraint: 0,
    ...seed,
  };
  return {
    next(kind: IdKind): Id {
      const n = counters[kind];
      counters[kind] = n + 1;
      return `${kind}#${n}`;
    },
    counters() {
      return { ...counters };
    },
  };
}

export function idKind(id: Id): IdKind {
  return id.slice(0, id.indexOf("#")) as IdKind;
}

// ---------------------------------------------------------------------------
// Geometry wire shapes. Millimeters everywhere; the grid is a convenience,
// never a rounding (statute clause 8).
// ---------------------------------------------------------------------------

export type Pt2 = readonly [number, number];
export type Pt3 = readonly [number, number, number];

/** Cubic Bézier segment — the single curve wire format. */
export interface CubicSeg {
  readonly p0: Pt3;
  readonly p1: Pt3;
  readonly p2: Pt3;
  readonly p3: Pt3;
}

/** A chain of cubic segments, uniformly parameterized over [0,1]. */
export interface CurveChain {
  readonly segs: readonly CubicSeg[];
}

/** Orthographic authoring views. Sections carry their station. */
export type OrthoView =
  | { readonly kind: "side" }        // looking along +Y (car's lateral axis)
  | { readonly kind: "plan" }        // looking along -Z (down)
  | { readonly kind: "front" }       // looking along -X
  | { readonly kind: "section"; readonly stationX: number };

/** Axis-aligned rect authored in a view, with the view recorded. */
export interface RectSpec {
  readonly view: OrthoView;
  readonly a: Pt2;      // one corner in view coordinates
  readonly b: Pt2;      // opposite corner
  readonly depth: number; // extrusion of the frame's space, along the view normal
  readonly at: number;    // position of the near face along the view normal
}

export type LineClass = "tape" | "sketch";

export interface LineSpec {
  readonly view: OrthoView;
  readonly a: Pt2;
  readonly b: Pt2;
  readonly lineClass: LineClass;
}

// Car frame axes convention, fixed: X aft (station), Y left-to-right (buck line,
// centerline at Y=0), Z up (waterline). Units mm.

// ---------------------------------------------------------------------------
// Verb envelope — the closed set, ratified. The saved file is this history.
// ---------------------------------------------------------------------------

export type VerbName =
  | "tape"            // lays lines and boxes; a tape line across a cell splits it
  | "constrain"       // the fenced seven
  | "weld"            // merge two edges into one shared curve
  | "detach"          // break a weld, or detach from mirror (recorded asymmetry)
  | "push-pull"       // move a cell face, edge, vertex, or contact point
  | "rotate"
  | "taper"
  | "cut"             // crude-mode boolean; binds to frame IDs + recorded sketch
  | "place-point"     // add a control point to a curve
  | "fit-through-line" // datum by orthogonal least squares
  | "group"           // panel group; borders bind to gap curves
  | "assign-material"
  | "mirror-detach"   // Article VIII asymmetry
  | "crease"          // mark an edge as a deliberate crease / character line
  | "gap"             // mark a curve as a panel gap — a shutline (amendment A10)
  | "fair-corners"    // bring crossing curves coplanar at vertices (amendment A11)
  | "apply-entry";    // splice a catalog entry (itself a verb document) — one grammar

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [k: string]: JsonValue };

export interface VerbRecord {
  readonly seq: number;
  readonly verb: VerbName;
  /** Verb arguments: IDs plus recorded sketch geometry. Never evaluated topology. */
  readonly args: JsonValue;
}

export interface CarDocument {
  readonly format: "car";
  readonly version: 1;
  readonly title: string;
  /** Counter snapshot so replay allocates identical IDs. */
  readonly counters: Readonly<Record<IdKind, number>>;
  readonly verbs: readonly VerbRecord[];
}

export const DOCUMENT_VERSION = 1 as const;

// ---------------------------------------------------------------------------
// Licenses, principals, quantities — the atom (charge §2, amendment A9).
// ---------------------------------------------------------------------------

export type Principal = "person" | "physics" | "law" | "brief";

export type License =
  | { readonly tag: "DERIVED"; readonly chain: string }
  | { readonly tag: "SOURCED"; readonly source: string; readonly citation?: string }
  | { readonly tag: "ASSUMED"; readonly note: string };

export type Unit =
  | "mm" | "mm2" | "mm3" | "m" | "m2" | "deg" | "rad"
  | "kg" | "N" | "Nm" | "kW" | "W" | "kWh" | "L"
  | "mm/kW" | "kW/m2" | "kg/L" | "g/cm3" | "kg/m3" | "km" | "km/h"
  | "L/100km" | "kWh/100km"
  | "count" | "ratio" | "MPa";
// m2, kg/m3 and km/h were added for the aero lens (charge §9): frontal area,
// air density, and the speed the MPH box rescales by. Additive amendment to a
// frozen seam — nothing existing changes meaning.

/**
 * Branded quantity. The brand field makes bare numbers fail typecheck wherever
 * a Quantity is expected; the factories in @car/demand are the only sanctioned
 * constructors. This is the primary no-bare-constants enforcement; the lint is
 * the backstop.
 */
export interface Quantity<U extends Unit = Unit> {
  readonly value: number;
  readonly unit: U;
  readonly license: License;
  readonly __brand: "Quantity";
}

// ---------------------------------------------------------------------------
// Demands and ports. NO part-type field anywhere in these records.
// ---------------------------------------------------------------------------

/** Local frame for a port: origin plus orthonormal axes, in part space. */
export interface PortFrame {
  readonly origin: Pt3;
  readonly xAxis: Pt3;
  readonly zAxis: Pt3;
}

export type PortKind = "face" | "point" | "axis";

export interface PortRecord {
  readonly id: Id;               // port#n
  readonly name: string;         // e.g. "bellhousing", "mount-L" — descriptive, never branched on
  readonly kind: PortKind;
  readonly frame: PortFrame;
}

/** Geometric predicate kinds the packaging solver understands. Closed set. */
export type DemandKind =
  | "envelope"        // box the part claims (position solved)
  | "clearance"       // required air around a face/box
  | "anchorage"       // must terminate in a reinforced member
  | "protected-zone"  // regulated keep-out (tank, pack)
  | "routed-path"     // a swept path that must be collision-free (column, linkage)
  | "swept-envelope"  // wheel + travel + articulation
  | "band"            // a height band in Z (bumper, lamps)
  | "aperture"        // an opening that must admit a box (entry, cargo)
  | "point-at";       // a point that must land at a solved position (hard point)

export interface BoxShape {
  readonly kind: "box";
  readonly size: readonly [Quantity<"mm">, Quantity<"mm">, Quantity<"mm">];
  readonly offset?: Pt3; // in part space
}

export interface PathShape {
  readonly kind: "path";
  readonly waypoints: readonly Pt3[];
  readonly radius: Quantity<"mm">;
}

export interface BandShape {
  readonly kind: "band";
  readonly zMin: Quantity<"mm">;
  readonly zMax: Quantity<"mm">;
}

export type DemandShape = BoxShape | PathShape | BandShape;

export interface DemandRecord {
  readonly id: Id;                 // demand#n
  readonly principal: Principal;
  readonly reason: string;         // the stateable reason — required, never empty
  readonly kind: DemandKind;
  readonly shape?: DemandShape;
  readonly magnitude?: Quantity;   // e.g. clearance distance, load rating
  /** True when the demand bears mass — anchorage law applies. */
  readonly massBearing?: boolean;
}

/** Clamp attribution: every solved bound reports what bound it, and whose. */
export interface ClampAttribution {
  readonly boundValue: Quantity;
  readonly demandId: Id;
  readonly principal: Principal;
  readonly reason: string;
}

// ---------------------------------------------------------------------------
// RenderFeed — the one-way seam from model to render. Typed arrays + stable
// IDs out; nothing returns except verb proposals from tools. GPU floats can
// never reach the hashed model path.
// ---------------------------------------------------------------------------

export interface FeedRange {
  readonly id: Id;
  readonly start: number;  // index into indices (triangles) or positions (lines)
  readonly count: number;
}

export interface SurfaceFeed {
  /** Model-side positions, mm, Float64. Render may downcast to Float32. */
  readonly positions: Float64Array;
  readonly normals: Float64Array;
  readonly indices: Uint32Array;
  readonly ranges: readonly FeedRange[]; // per cell
}

export interface LineFeed {
  readonly positions: Float64Array;      // polyline soup, pairs
  readonly ranges: readonly FeedRange[]; // per curve / datum
}

export interface RenderFeed {
  readonly surfaces: SurfaceFeed;
  readonly lines: LineFeed;
  /** Snap points published into the grids (requirement-linked or grid). */
  readonly snaps: readonly SnapPoint[];
}

export interface SnapPoint {
  readonly at: Pt3;
  /** Present when the snap traces to a requirement — links placement to demand. */
  readonly demandId?: Id;
  readonly label?: string;
}

// ---------------------------------------------------------------------------
// QuiltSpec — the frozen seam between @car/surface (producer) and @car/mesh
// (consumer). Sides are given in loop order, counter-clockwise seen from
// outside; the end of side k coincides exactly with the start of side k+1.
// A side traverses its shared curve's sub-range [t0,t1]; `reversed` means the
// loop runs the curve from t1 down to t0. T-junctions appear as multiple
// owners trimming the same curveId — the mesher's global sample table takes
// the union of samples per curve so neighbors consume identical vertices.
// ---------------------------------------------------------------------------

export interface QuiltSide {
  readonly curveId: Id;
  readonly t0: number;
  readonly t1: number;
  readonly reversed: boolean;
}

export interface QuiltCell {
  readonly id: Id;
  readonly sides: readonly [QuiltSide, QuiltSide, QuiltSide, QuiltSide];
}

export interface QuiltSpec {
  readonly cells: readonly QuiltCell[];
  readonly curves: ReadonlyMap<Id, CurveChain>;
  readonly creases: ReadonlySet<Id>;
  readonly gaps: ReadonlySet<Id>;
}

// ---------------------------------------------------------------------------
// Packaging — the blind solver's entire world. It consumes these records and
// nothing else; they carry NO part-type field, so there is nothing to branch
// on. Layout is read back after placement, never chosen as a mode.
// v1 poses are translation-only: parts author their ports in world-aligned
// part frames and mates carry any fixed relative orientation in their offsets.
// ---------------------------------------------------------------------------

export interface Pose {
  readonly origin: Pt3;
}

export interface PartInstance {
  readonly id: Id; // part#n
  /** Descriptive only — the solver must treat it as opaque (rename-fuzz test). */
  readonly label: string;
  readonly ports: readonly PortRecord[];
  readonly demands: readonly DemandRecord[];
  readonly mass?: Quantity<"kg">;
  /** Envelope the part claims, for pairwise separation. */
  readonly envelope?: BoxShape;
}

export interface PortRef {
  readonly partId: Id;
  readonly portId: Id;
}

export interface Mate {
  readonly a: PortRef;
  readonly b: PortRef;
  /** Offset of b's port origin from a's, in world axes, mm. */
  readonly offset?: Pt3;
}

/** Substrate member — reinforced structure that anchorages must terminate in. */
export interface MemberRecord {
  readonly id: Id;
  readonly label: string;
  readonly box: BoxShape;
  readonly at: Pt3;
  readonly reinforced: boolean;
}

export interface SolveInput {
  readonly parts: readonly PartInstance[];
  readonly mates: readonly Mate[];
  /** Parts pinned in world space (the substrate chain root). */
  readonly fixed: ReadonlyMap<Id, Pose>;
  readonly members: readonly MemberRecord[];
  /** World-scoped demands: bands, protected zones, ground line. */
  readonly worldDemands: readonly DemandRecord[];
}

export interface SolveViolation {
  readonly kind: "clearance" | "band" | "protected-zone" | "anchorage" | "unplaced";
  readonly detail: string;
  readonly demandId?: Id;
  readonly partIds: readonly Id[];
}

export interface SolveResult {
  readonly placements: ReadonlyMap<Id, Pose>;
  /** Every active bound, attributed: which demand, whose, why. */
  readonly clamps: readonly ClampAttribution[];
  readonly violations: readonly SolveViolation[];
  /** Ports and point-at demands published into the grids. */
  readonly hardPoints: readonly SnapPoint[];
  /** True when every inequality is satisfied and every anchorage terminates. */
  readonly closed: boolean;
}

// ---------------------------------------------------------------------------
// Provenance — monotone; the print report carries it (statute clauses 7, 41).
// ---------------------------------------------------------------------------

export interface ProvenanceEntry {
  readonly subject: Id | string;
  readonly license: License;
  readonly boundBy?: ClampAttribution;
}

export interface ProvenanceReport {
  readonly entries: readonly ProvenanceEntry[];
  readonly freeChoices: readonly string[];   // off-grid authored choices, recorded
  readonly assumedOutstanding: readonly string[]; // every ASSUMED surfaced, never buried
}
