export { v3, add, sub, scale, dot, cross, length, normalize, lerp, mirrorY, type V3 } from './vec.js';
export { bspline, interpolate, resample, clampedKnots, polylineLength, type Curve } from './curve.js';
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
