/**
 * @car/mesh — the conforming quilt mesher (charge §10).
 *
 * QuiltSpec in (frozen seam from @car/surface); watertight-by-index triangle
 * mesh out, plus the closed-mesh report and the binary STL export surface.
 * Deterministic throughout: stable-ID traversal order, one evaluation per
 * (curveId, param), no wall clock, no randomness, transcendentals via @car/num.
 */

export { compareId, sortedIds } from "./ids.js";
export {
  buildSampleTable,
  type CellSides,
  type GlobalSampleTable,
  type SideSamples,
} from "./table.js";
export {
  DEFAULT_BASE_DENSITY,
  meshQuilt,
  type MeshOptions,
  type QuiltMesh,
} from "./coons.js";
export {
  closedMeshCheck,
  type ClosedMeshReport,
  type MeshViolation,
  type MeshViolationKind,
  type TriangleMesh,
} from "./closed.js";
export { writeStlBinary, type StlMesh } from "./stl.js";
export {
  mirrorSymmetry,
  type MirrorSymmetry,
  type MirrorSymmetryOptions,
} from "./symmetry.js";
export {
  creaseNormals,
  DEFAULT_CREASE_ANGLE,
  type CreaseNormalResult,
  type NormalMesh,
} from "./normals.js";
export {
  engraveGrooves,
  type GrooveMesh,
  type GrooveOptions,
  type GrooveResult,
} from "./groove.js";
