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
  | "mm" | "mm2" | "mm3" | "m" | "deg" | "rad"
  | "kg" | "N" | "Nm" | "kW" | "W" | "kWh" | "L"
  | "mm/kW" | "kW/m2" | "kg/L" | "g/cm3" | "km" | "L/100km" | "kWh/100km"
  | "count" | "ratio" | "MPa";

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
