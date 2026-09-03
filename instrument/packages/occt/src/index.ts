/**
 * @car/occt — the borrowed engine behind a narrow interface (charge §11:
 * OpenCascade for booleans and STEP only; we wrap that math, never write it).
 *
 * Browser-safe surface: types, the worker protocol, and makeEngine (for a
 * caller that loaded the wasm itself). The Node loader is exposed through a
 * lazy dynamic import so bundling this index for the browser never evaluates
 * node builtins; browser apps talk to src/worker.ts over postMessage instead.
 */

export type { Engine, EngineRequest, EngineResponse, Handle, MeshData } from "./api.js";
export { makeEngine } from "./engine.js";
export type { OcModule } from "./engine.js";

import type { Engine } from "./api.js";

/** Node-side engine, one shared wasm instance per process (init takes seconds). */
export async function initEngineNode(): Promise<Engine> {
  const loader = await import("./node.js");
  return loader.initEngineNode();
}
