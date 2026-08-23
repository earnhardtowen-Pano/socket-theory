/**
 * @car/surface — Coons evaluation over the frame, boundary extraction, and
 * the render feed. One evaluator serves crude and smooth: a straight-edged
 * frame's patch IS the flat panel. Position-watertight by construction:
 * patch edges short-circuit to the shared curve itself, bit for bit.
 */

export {
  cellBoundary,
  chainsOf,
  type BoundarySide,
  type CellBoundary,
  type CellLike,
  type ChainLookup,
  type ChainSource,
  type SideRange,
} from "./boundary.js";
export {
  boundaryCoonsNormal,
  boundaryCoonsPartials,
  boundaryCoonsPoint,
  coonsBlend,
  coonsNormal,
  coonsPartials,
  coonsPoint,
} from "./coons.js";
export {
  buildRenderFeed,
  tessellateQuilt,
  DEFAULT_RESOLUTION,
  type RenderFeedOptions,
} from "./feed.js";
