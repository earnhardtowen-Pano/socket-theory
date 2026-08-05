export { v3, add, sub, scale, dot, cross, length, normalize, lerp, mirrorY, type V3 } from './vec.js';
export {
  bspline,
  interpolate,
  resample,
  scalarSpline,
  clampedKnots,
  polylineLength,
  type Curve,
  type EndTangents,
} from './curve.js';
export {
  coonsPatch,
  creaseEdge,
  smoothEdge,
  type Patch,
  type PatchEdge,
  type PatchEdges,
} from './patch.js';
export {
  buildNetwork,
  networkPatches,
  mirrorNetwork,
  type EdgeKind,
  type NetCurve,
  type NetworkMesh,
  type NetworkPatch,
  type NetworkSpec,
  type PanelSpec,
} from './network.js';
export {
  buildCar,
  sectionAt,
  halfSection,
  vertexNormals,
  bounds,
  type CarInput,
  type CarBuild,
  type Displace,
  type Mesh,
  type SectionShape,
} from './body.js';
