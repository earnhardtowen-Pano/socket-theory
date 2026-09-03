/**
 * @car/occt engine — every embind call lives here, behind the narrow Engine
 * interface from api.ts. Loader-agnostic: node.ts and worker.ts hand this
 * module an initialized wasm instance and nothing else.
 *
 * opencascade.js 1.1.1 ownership semantics, established empirically for this
 * exact build (suffixed embind constructors, ~19900 keys):
 *   - every class value RETURNED by a bound call is a fresh wasm-heap copy
 *     owned by JS (Shape(), Wire(), Face(), Current(), Nodes(), Triangles(),
 *     Value(), Transformation(), Triangulation(), Transformed() all yield a
 *     new pointer per call) — each must be .delete()d or it leaks;
 *   - Handle_*.get() returns a raw pointer into the refcounted object (same
 *     pointer every call) — never delete what it yields;
 *   - enum members are singletons: compare with ===.
 * Builders are therefore deleted as soon as their result copy is extracted;
 * a Handle owns exactly one TopoDS_Shape copy and frees it on dispose().
 */

import type { Pt3 } from "@car/schema";
import { len3, norm3, scale3 } from "@car/num";
import type { Engine, Handle, MeshData } from "./api.js";

// ---------------------------------------------------------------------------
// Structural typings for the slice of the embind surface we touch. The full
// build ships no .d.ts; these are the verified shapes of the members used.
// ---------------------------------------------------------------------------

export interface OcDeletable {
  delete(): void;
}

/** Embind enum member — a singleton object carrying its numeric value. */
export interface OcEnumValue {
  readonly value: number;
}

export interface OcPnt extends OcDeletable {
  X(): number;
  Y(): number;
  Z(): number;
}

export type OcVec = OcDeletable;

export interface OcTrsf extends OcDeletable {
  /** 1-based row (1..3) / column (1..4) of the affine transform. */
  Value(row: number, col: number): number;
}

export interface OcLocation extends OcDeletable {
  IsIdentity(): boolean;
  Transformation(): OcTrsf;
}

export interface OcShape extends OcDeletable {
  IsNull(): boolean;
  Orientation_1(): OcEnumValue;
}

export interface OcPntArray extends OcDeletable {
  /** 1-based. Returns an owned copy — delete it. */
  Value(i: number): OcPnt;
}

export interface OcTriangleRef extends OcDeletable {
  /** 1-based corner (1..3) → 1-based node index. */
  Value(corner: number): number;
}

export interface OcTriangleArray extends OcDeletable {
  Value(i: number): OcTriangleRef;
}

/** Raw pointee of a Handle_Poly_Triangulation — never deleted directly. */
export interface OcTriangulation {
  NbNodes(): number;
  NbTriangles(): number;
  Nodes(): OcPntArray;
  Triangles(): OcTriangleArray;
}

export interface OcTriangulationHandle extends OcDeletable {
  IsNull(): boolean;
  get(): OcTriangulation;
}

export interface OcShapeBuilder extends OcDeletable {
  Build(): void;
  IsDone(): boolean;
  Shape(): OcShape;
}

export interface OcMakePolygon extends OcDeletable {
  Add_1(p: OcPnt): void;
  Close(): void;
  IsDone(): boolean;
  Wire(): OcShape;
}

export interface OcMakeFace extends OcDeletable {
  IsDone(): boolean;
  Face(): OcShape;
}

export interface OcExplorer extends OcDeletable {
  More(): boolean;
  Next(): void;
  Current(): OcShape;
}

export interface OcStepWriter extends OcDeletable {
  Transfer(shape: OcShape, mode: OcEnumValue, compgraph: boolean): OcEnumValue;
  Write(path: string): OcEnumValue;
}

/** The initialized wasm module, narrowed to the members the engine calls. */
export interface OcModule {
  readonly gp_Pnt_3: new (x: number, y: number, z: number) => OcPnt;
  readonly gp_Vec_4: new (x: number, y: number, z: number) => OcVec;
  readonly BRepPrimAPI_MakeBox_2: new (corner: OcPnt, dx: number, dy: number, dz: number) => OcShapeBuilder;
  readonly BRepAlgoAPI_Fuse_3: new (a: OcShape, b: OcShape) => OcShapeBuilder;
  readonly BRepAlgoAPI_Cut_3: new (a: OcShape, b: OcShape) => OcShapeBuilder;
  readonly BRepBuilderAPI_MakePolygon_1: new () => OcMakePolygon;
  readonly BRepBuilderAPI_MakeFace_15: new (wire: OcShape, onlyPlane: boolean) => OcMakeFace;
  readonly BRepPrimAPI_MakePrism_1: new (profile: OcShape, v: OcVec, copy: boolean, canonize: boolean) => OcShapeBuilder;
  readonly BRepMesh_IncrementalMesh_2: new (
    shape: OcShape,
    linDeflection: number,
    isRelative: boolean,
    angDeflection: number,
    inParallel: boolean,
  ) => OcDeletable;
  readonly TopExp_Explorer_2: new (shape: OcShape, toFind: OcEnumValue, toAvoid: OcEnumValue) => OcExplorer;
  readonly TopLoc_Location_1: new () => OcLocation;
  readonly STEPControl_Writer_1: new () => OcStepWriter;
  readonly TopoDS: { Face_1(shape: OcShape): OcShape };
  readonly BRep_Tool: { Triangulation(face: OcShape, loc: OcLocation): OcTriangulationHandle };
  readonly TopAbs_ShapeEnum: { readonly TopAbs_FACE: OcEnumValue; readonly TopAbs_SHAPE: OcEnumValue };
  readonly TopAbs_Orientation: { readonly TopAbs_REVERSED: OcEnumValue };
  readonly STEPControl_StepModelType: { readonly STEPControl_AsIs: OcEnumValue };
  readonly IFSelect_ReturnStatus: { readonly IFSelect_RetDone: OcEnumValue };
  readonly FS: {
    readFile(path: string, opts: { encoding: "utf8" }): string;
    unlink(path: string): void;
  };
}

// ---------------------------------------------------------------------------
// Handles
// ---------------------------------------------------------------------------

class ShapeHandle implements Handle {
  readonly kind = "occt-shape" as const;
  #shape: OcShape | null;

  constructor(shape: OcShape) {
    this.#shape = shape;
  }

  get alive(): boolean {
    return this.#shape !== null;
  }

  /** Engine-internal access; throws after dispose so stale handles are loud. */
  get shape(): OcShape {
    if (this.#shape === null) throw new Error("occt: handle used after dispose()");
    return this.#shape;
  }

  dispose(): void {
    if (this.#shape !== null) {
      this.#shape.delete();
      this.#shape = null;
    }
  }
}

function unwrap(h: Handle): OcShape {
  if (!(h instanceof ShapeHandle)) {
    throw new Error("occt: foreign object passed where an engine Handle was expected");
  }
  return h.shape;
}

// ---------------------------------------------------------------------------
// Scratch bin: temporaries registered with own() are deleted in reverse order
// by the enclosing finally, so no error path leaks wasm heap.
// ---------------------------------------------------------------------------

interface Bin {
  own<T extends OcDeletable>(x: T): T;
  drain(): void;
}

function makeBin(): Bin {
  const items: OcDeletable[] = [];
  return {
    own<T extends OcDeletable>(x: T): T {
      items.push(x);
      return x;
    },
    drain(): void {
      for (let i = items.length - 1; i >= 0; i--) items[i]?.delete();
      items.length = 0;
    },
  };
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function assertFinite3(p: Pt3, what: string): void {
  if (!Number.isFinite(p[0]) || !Number.isFinite(p[1]) || !Number.isFinite(p[2])) {
    throw new Error(`occt: ${what} must be finite, got [${p[0]}, ${p[1]}, ${p[2]}]`);
  }
}

function assertPositive3(p: Pt3, what: string): void {
  assertFinite3(p, what);
  if (p[0] <= 0 || p[1] <= 0 || p[2] <= 0) {
    throw new Error(`occt: ${what} must be strictly positive, got [${p[0]}, ${p[1]}, ${p[2]}]`);
  }
}

// Angular deflection is a fixed engine parameter, not authored data: one value
// for every mesh call keeps identical inputs producing identical output.
const ANGULAR_DEFLECTION_RAD = 0.5;

/**
 * Fixed emscripten-FS path for STEP round-trips; calls are synchronous so one
 * path suffices. MUST stay at most 10 characters: this build's Write(path)
 * string marshalling corrupts longer paths (the file lands under a garbage
 * name while Write still reports RetDone — verified empirically, boundary at
 * 11 chars).
 */
const STEP_SCRATCH_PATH = "/out.step";

/**
 * Two byte-varying regions in OCCT's STEP output are session noise, not
 * geometry (verified by cross-run and same-process diffs — nothing else
 * varies): the mandatory FILE_NAME time_stamp carries wall-clock time, and
 * the PRODUCT name carries a per-transfer session counter ("Open CASCADE
 * STEP translator 7.4 1", "… 2", …). Below the render seam output carries
 * neither clock nor session state, so the stamp is pinned to the epoch and
 * the counter is stripped: identical shapes export identical bytes.
 * (Interface_Static.SetCVal("write.step.product.name", …) cannot do this
 * in-kernel here — it returns false in this build.)
 */
const STEP_TIMESTAMP_RE = /^(FILE_NAME\('[^']*',)'[^']*'/m;
const STEP_PINNED_TIMESTAMP = "'1970-01-01T00:00:00'";
const STEP_SESSION_COUNTER_RE = /(Open CASCADE STEP translator [0-9]+\.[0-9]+) [0-9]+/g;

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

export function makeEngine(oc: OcModule): Engine {
  const FACE = oc.TopAbs_ShapeEnum.TopAbs_FACE;
  const ANY = oc.TopAbs_ShapeEnum.TopAbs_SHAPE;
  const REVERSED = oc.TopAbs_Orientation.TopAbs_REVERSED;
  const RET_DONE = oc.IFSelect_ReturnStatus.IFSelect_RetDone;

  function makeBox(size: Pt3, at: Pt3): Handle {
    assertPositive3(size, "box size");
    assertFinite3(at, "box corner");
    const bin = makeBin();
    try {
      const corner = bin.own(new oc.gp_Pnt_3(at[0], at[1], at[2]));
      const builder = bin.own(new oc.BRepPrimAPI_MakeBox_2(corner, size[0], size[1], size[2]));
      builder.Build(); // BRepPrimAPI builders are lazy; algo-API ones build in their ctor
      if (!builder.IsDone()) throw new Error("occt: MakeBox failed");
      return new ShapeHandle(builder.Shape());
    } finally {
      bin.drain();
    }
  }

  function fuse(handles: readonly Handle[]): Handle {
    if (handles.length < 2) throw new Error("occt: fuse needs at least two handles");
    const shapes = handles.map(unwrap);
    let acc = shapes[0]!;
    let accOwned = false;
    try {
      for (let i = 1; i < shapes.length; i++) {
        const op = new oc.BRepAlgoAPI_Fuse_3(acc, shapes[i]!);
        let next: OcShape;
        try {
          if (!op.IsDone()) throw new Error(`occt: fuse failed at operand ${i}`);
          next = op.Shape();
        } finally {
          op.delete();
        }
        if (accOwned) acc.delete();
        acc = next;
        accOwned = true;
      }
      return new ShapeHandle(acc);
    } catch (err) {
      if (accOwned) acc.delete();
      throw err;
    }
  }

  function cutPrism(solid: Handle, profile: readonly Pt3[], dir: Pt3, depth: number): Handle {
    const solidShape = unwrap(solid);
    if (profile.length < 3) throw new Error("occt: cutPrism profile needs at least 3 points");
    for (const p of profile) assertFinite3(p, "cutPrism profile point");
    assertFinite3(dir, "cutPrism dir");
    if (len3(dir) === 0) throw new Error("occt: cutPrism dir must be non-zero");
    if (!Number.isFinite(depth) || depth <= 0) {
      throw new Error(`occt: cutPrism depth must be > 0, got ${depth}`);
    }
    const sweep = scale3(norm3(dir), depth);

    const bin = makeBin();
    try {
      const poly = bin.own(new oc.BRepBuilderAPI_MakePolygon_1());
      for (const [x, y, z] of profile) {
        const p = bin.own(new oc.gp_Pnt_3(x, y, z));
        poly.Add_1(p);
      }
      poly.Close();
      if (!poly.IsDone()) throw new Error("occt: cutPrism profile did not close into a wire");
      const wire = bin.own(poly.Wire());

      const faceB = bin.own(new oc.BRepBuilderAPI_MakeFace_15(wire, true));
      if (!faceB.IsDone()) {
        throw new Error("occt: cutPrism profile must be a planar closed polygon");
      }
      const face = bin.own(faceB.Face());

      const vec = bin.own(new oc.gp_Vec_4(sweep[0], sweep[1], sweep[2]));
      const prismB = bin.own(new oc.BRepPrimAPI_MakePrism_1(face, vec, false, true));
      if (!prismB.IsDone()) throw new Error("occt: cutPrism sweep failed");
      const prism = bin.own(prismB.Shape());

      const cutB = bin.own(new oc.BRepAlgoAPI_Cut_3(solidShape, prism));
      if (!cutB.IsDone()) throw new Error("occt: cutPrism boolean subtract failed");
      const out = cutB.Shape();
      if (out.IsNull()) {
        out.delete();
        throw new Error("occt: cutPrism produced a null shape");
      }
      return new ShapeHandle(out);
    } finally {
      bin.drain();
    }
  }

  function meshShape(handle: Handle, linearDeflection: number): MeshData {
    const shape = unwrap(handle);
    if (!Number.isFinite(linearDeflection) || linearDeflection <= 0) {
      throw new Error(`occt: linearDeflection must be > 0, got ${linearDeflection}`);
    }

    // Construction runs the mesher; triangulation attaches to the shape.
    new oc.BRepMesh_IncrementalMesh_2(shape, linearDeflection, false, ANGULAR_DEFLECTION_RAD, false).delete();

    const positions: number[] = [];
    const indices: number[] = [];
    const vertexIndex = new Map<string, number>();

    const walkBin = makeBin();
    try {
      const ex = walkBin.own(new oc.TopExp_Explorer_2(shape, FACE, ANY));
      for (; ex.More(); ex.Next()) {
        const bin = makeBin();
        try {
          const cur = bin.own(ex.Current());
          const face = bin.own(oc.TopoDS.Face_1(cur));
          const loc = bin.own(new oc.TopLoc_Location_1());
          const ht = bin.own(oc.BRep_Tool.Triangulation(face, loc));
          if (ht.IsNull()) {
            // A face the mesher produced nothing for cannot yield a closed
            // mesh; failing loudly beats shipping a silently open surface.
            throw new Error("occt: face without triangulation after meshing");
          }
          const tri = ht.get(); // raw pointee — not owned, never deleted

          // Face location as a row-major 3x4 affine, applied in JS (pure
          // mul/add, deterministic); identity skips the arithmetic entirely
          // so untransformed faces keep exact node coordinates.
          type Affine34 = readonly [
            number, number, number, number,
            number, number, number, number,
            number, number, number, number,
          ];
          let m: Affine34 | null = null;
          if (!loc.IsIdentity()) {
            const t = bin.own(loc.Transformation());
            m = [
              t.Value(1, 1), t.Value(1, 2), t.Value(1, 3), t.Value(1, 4),
              t.Value(2, 1), t.Value(2, 2), t.Value(2, 3), t.Value(2, 4),
              t.Value(3, 1), t.Value(3, 2), t.Value(3, 3), t.Value(3, 4),
            ];
          }

          const nb = tri.NbNodes();
          const localToMerged = new Uint32Array(nb + 1); // 1-based node ids
          const nodes = bin.own(tri.Nodes());
          for (let i = 1; i <= nb; i++) {
            const p = nodes.Value(i);
            let x = p.X();
            let y = p.Y();
            let z = p.Z();
            p.delete();
            if (m !== null) {
              const tx = m[0] * x + m[1] * y + m[2] * z + m[3];
              const ty = m[4] * x + m[5] * y + m[6] * z + m[7];
              const tz = m[8] * x + m[9] * y + m[10] * z + m[11];
              x = tx; y = ty; z = tz;
            }
            // Exact-coordinate weld. BRepMesh discretizes each shared edge
            // once and both adjacent faces consume those nodes, so boundary
            // coordinates match bit-for-bit and the weld closes the mesh.
            // String(-0) === "0" also welds signed zeros, which only helps.
            const key = x + ":" + y + ":" + z;
            let merged = vertexIndex.get(key);
            if (merged === undefined) {
              merged = vertexIndex.size;
              vertexIndex.set(key, merged);
              positions.push(x, y, z);
            }
            localToMerged[i] = merged;
          }

          const reversed = face.Orientation_1() === REVERSED;
          const nt = tri.NbTriangles();
          const tris = bin.own(tri.Triangles());
          for (let k = 1; k <= nt; k++) {
            const t = tris.Value(k);
            const a = localToMerged[t.Value(1)]!;
            const b = localToMerged[t.Value(2)]!;
            const c = localToMerged[t.Value(3)]!;
            t.delete();
            // Nodes distinct in the triangulation can weld to one vertex
            // (e.g. surface seams); such triangles are zero-area and would
            // break the two-manifold edge count.
            if (a === b || b === c || c === a) continue;
            if (reversed) indices.push(a, c, b);
            else indices.push(a, b, c);
          }
        } finally {
          bin.drain();
        }
      }
    } finally {
      walkBin.drain();
    }

    return {
      positions: new Float64Array(positions),
      indices: new Uint32Array(indices),
    };
  }

  function stepExport(handle: Handle): string {
    const shape = unwrap(handle);
    const writer = new oc.STEPControl_Writer_1();
    try {
      const transferred = writer.Transfer(shape, oc.STEPControl_StepModelType.STEPControl_AsIs, true);
      if (transferred !== RET_DONE) {
        throw new Error(`occt: STEP transfer failed (status ${transferred.value})`);
      }
      const written = writer.Write(STEP_SCRATCH_PATH);
      if (written !== RET_DONE) {
        throw new Error(`occt: STEP write failed (status ${written.value})`);
      }
      const text = oc.FS.readFile(STEP_SCRATCH_PATH, { encoding: "utf8" });
      oc.FS.unlink(STEP_SCRATCH_PATH);
      return text
        .replace(STEP_TIMESTAMP_RE, `$1${STEP_PINNED_TIMESTAMP}`)
        .replace(STEP_SESSION_COUNTER_RE, "$1");
    } finally {
      writer.delete();
    }
  }

  return { makeBox, fuse, cutPrism, meshShape, stepExport };
}
