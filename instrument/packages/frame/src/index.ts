/**
 * @car/frame — frame state and topology ops: cells with welded shared curves,
 * tape splits with T-junctions, persistent naming (cell parentage, curve
 * aliases), mirror evaluation, and the evaluated-buffer / quilt outputs.
 */

export {
  FrameState,
  type BoxResult,
  type SplitResult,
} from "./state.js";
export { viewToWorld, worldToView, viewNormal } from "./views.js";
export {
  type Vertex,
  type Trim,
  type SharedCurve,
  type SideRef,
  type Cell,
  type MirrorMode,
  type Group,
  type Datum,
  type DatumKind,
  type Material,
  type FeatureOp,
  type PushPullTarget,
  idCompare,
} from "./records.js";
export {
  computeEvaluatedBuffers,
  computeQuilt,
  evaluateMirrors,
  isCenteredOnCenterline,
  isMirrorId,
  masterId,
  mirrorId,
  type EvaluatedObject,
  type MirrorTwin,
  type MirrorEvaluation,
} from "./evaluate.js";
export {
  COINCIDENT_EPS,
  PARAM_EPS,
  subChain,
  chainControlBuffer,
  dragChainEnd,
  samePt,
} from "./geometry.js";
