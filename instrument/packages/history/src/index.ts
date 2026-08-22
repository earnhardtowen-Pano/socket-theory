/**
 * @car/history — the verb log and replay engine. One grammar: sessions apply
 * verbs, save() emits the replayable document, load() replays it byte-
 * identically and proves it with the allocator-counter integrity check.
 */

export { createSession, load, type Session } from "./session.js";
export {
  validateVerbArgs,
  validateDocumentShape,
  ID_PATTERN,
  type VerbArgs,
  type TapeArgs,
  type ConstrainArgs,
  type WeldArgs,
  type DetachArgs,
  type PushPullArgs,
  type PushPullTargetArgs,
  type RotateArgs,
  type TaperArgs,
  type CutArgs,
  type CutProfile,
  type PlacePointArgs,
  type FitThroughLineArgs,
  type GroupArgs,
  type AssignMaterialArgs,
  type MirrorDetachArgs,
  type CreaseArgs,
  type ApplyEntryArgs,
} from "./verbs.js";
export { buildFixture, fixtureNames, type FixtureName } from "./fixtures.js";
