/**
 * @car/occt — the borrowed engine behind a narrow interface.
 *
 * OpenCascade does booleans, meshing of its own results, and STEP export;
 * we never write that math, we wrap it (charge §11). Everything below the
 * seam is deterministic: fixed mesh parameters in, byte-identical typed
 * arrays out for identical inputs within one wasm instance.
 *
 * Handles are opaque: callers hold them, pass them back, and dispose them.
 * Nothing inside a Handle is part of the saved document — evaluated
 * geometry is derivation, never storage.
 */

import type { Pt3 } from "@car/schema";

/** Triangle mesh read out of the engine. Millimeters, CCW seen from outside. */
export interface MeshData {
  /** Deduplicated vertices (exact-coordinate merge), xyz triples. */
  readonly positions: Float64Array;
  /** Triangle vertex indices, winding outward for a valid solid. */
  readonly indices: Uint32Array;
}

/**
 * Opaque reference to a shape living inside the wasm heap. Treat as a token:
 * never inspect, never structure-clone, always dispose when done — the wasm
 * heap does not garbage-collect.
 */
export interface Handle {
  readonly kind: "occt-shape";
  /** False after dispose(); every engine call on a dead handle throws. */
  readonly alive: boolean;
  dispose(): void;
}

export interface Engine {
  /** Axis-aligned box: `size` extents (mm, all > 0), `at` the min corner. */
  makeBox(size: Pt3, at: Pt3): Handle;
  /** Pairwise fuse, left fold in array order. Requires at least two handles. */
  fuse(handles: readonly Handle[]): Handle;
  /**
   * Subtract a prism from a solid. `profile` is a planar closed polygon
   * (first point NOT repeated at the end, at least 3 points); the prism
   * sweeps it along unit(dir) * depth (mm, depth > 0).
   */
  cutPrism(solid: Handle, profile: readonly Pt3[], dir: Pt3, depth: number): Handle;
  /**
   * BRepMesh_IncrementalMesh at the given linear deflection (mm), then a
   * merged, vertex-deduplicated mesh. Deflection acts as a ceiling: a shape
   * previously meshed finer keeps its finer triangulation.
   */
  meshShape(handle: Handle, linearDeflection: number): MeshData;
  /**
   * STEP text via STEPControl_Writer (this build's default schema:
   * AUTOMOTIVE_DESIGN / AP214, OCCT 7.4 processor). Starts with
   * "ISO-10303-21". Byte-deterministic: the FILE_NAME time_stamp (wall
   * clock) is pinned to the epoch and the PRODUCT name's per-session
   * transfer counter is stripped — the only two regions OCCT varies.
   */
  stepExport(handle: Handle): string;
}

// ---------------------------------------------------------------------------
// Worker protocol — the same five operations, handles as numeric tokens
// because real Handles cannot cross postMessage. The worker owns the table.
// ---------------------------------------------------------------------------

export type EngineRequest =
  | { readonly id: number; readonly op: "makeBox"; readonly size: Pt3; readonly at: Pt3 }
  | { readonly id: number; readonly op: "fuse"; readonly handles: readonly number[] }
  | {
      readonly id: number; readonly op: "cutPrism"; readonly solid: number;
      readonly profile: readonly Pt3[]; readonly dir: Pt3; readonly depth: number;
    }
  | { readonly id: number; readonly op: "meshShape"; readonly handle: number; readonly linearDeflection: number }
  | { readonly id: number; readonly op: "stepExport"; readonly handle: number }
  | { readonly id: number; readonly op: "dispose"; readonly handle: number };

export type EngineResponse =
  | { readonly id: number; readonly ok: true; readonly result: "handle"; readonly handle: number }
  | { readonly id: number; readonly ok: true; readonly result: "mesh"; readonly positions: Float64Array; readonly indices: Uint32Array }
  | { readonly id: number; readonly ok: true; readonly result: "step"; readonly text: string }
  | { readonly id: number; readonly ok: true; readonly result: "disposed" }
  | { readonly id: number; readonly ok: false; readonly error: string };
