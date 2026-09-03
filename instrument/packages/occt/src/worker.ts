/**
 * Browser worker entry — the app-side home of the engine (charge §11: OCCT
 * runs in a worker, booleans and STEP only). Ships untested in this lane;
 * kept thin: it mirrors api.ts's EngineRequest/EngineResponse protocol and
 * delegates every operation to the same makeEngine() the Node tests cover.
 *
 * Spawn as a module worker so the dynamic glue import works:
 *   new Worker(new URL("./worker.js", import.meta.url), { type: "module" })
 *
 * Handles cross the seam as numeric tokens; the worker owns the table and
 * frees wasm memory on the "dispose" op. Mesh buffers transfer, not copy.
 */

import glueUrl from "opencascade.js/dist/opencascade.wasm.js?url";
import wasmUrl from "opencascade.js/dist/opencascade.wasm.wasm?url";
import type { Engine, EngineRequest, EngineResponse, Handle } from "./api.js";
import { makeEngine, type OcModule } from "./engine.js";

type GlueFactory = (init: {
  wasmBinary: Uint8Array;
  print?: (line: string) => void;
  printErr?: (line: string) => void;
}) => Promise<OcModule>;

const ctx = self as unknown as {
  onmessage: ((ev: MessageEvent) => void) | null;
  postMessage(msg: EngineResponse, transfer?: Transferable[]): void;
};

const silent = (): void => {};

const enginePromise: Promise<Engine> = (async () => {
  // The glue's ESM tail (`export default`) makes it directly importable in a
  // module worker; its Node branches are dead here (no `process`).
  const glueModule = (await import(/* @vite-ignore */ glueUrl)) as { default?: GlueFactory };
  const factory = glueModule.default ?? (glueModule as unknown as GlueFactory);
  const wasmBinary = new Uint8Array(await (await fetch(wasmUrl)).arrayBuffer());
  const oc = await factory({ wasmBinary, print: silent, printErr: silent });
  return makeEngine(oc);
})();

const handles = new Map<number, Handle>();
let nextToken = 1;

function keep(handle: Handle): number {
  const token = nextToken;
  nextToken += 1;
  handles.set(token, handle);
  return token;
}

function take(token: number): Handle {
  const handle = handles.get(token);
  if (handle === undefined) throw new Error(`occt worker: unknown handle token ${token}`);
  return handle;
}

function answer(engine: Engine, req: EngineRequest): void {
  switch (req.op) {
    case "makeBox":
      ctx.postMessage({ id: req.id, ok: true, result: "handle", handle: keep(engine.makeBox(req.size, req.at)) });
      return;
    case "fuse":
      ctx.postMessage({ id: req.id, ok: true, result: "handle", handle: keep(engine.fuse(req.handles.map(take))) });
      return;
    case "cutPrism":
      ctx.postMessage({
        id: req.id,
        ok: true,
        result: "handle",
        handle: keep(engine.cutPrism(take(req.solid), req.profile, req.dir, req.depth)),
      });
      return;
    case "meshShape": {
      const mesh = engine.meshShape(take(req.handle), req.linearDeflection);
      ctx.postMessage(
        { id: req.id, ok: true, result: "mesh", positions: mesh.positions, indices: mesh.indices },
        [mesh.positions.buffer as ArrayBuffer, mesh.indices.buffer as ArrayBuffer],
      );
      return;
    }
    case "stepExport":
      ctx.postMessage({ id: req.id, ok: true, result: "step", text: engine.stepExport(take(req.handle)) });
      return;
    case "dispose": {
      take(req.handle).dispose();
      handles.delete(req.handle);
      ctx.postMessage({ id: req.id, ok: true, result: "disposed" });
      return;
    }
  }
}

ctx.onmessage = (ev: MessageEvent): void => {
  const req = ev.data as EngineRequest;
  void enginePromise
    .then((engine) => answer(engine, req))
    .catch((err: unknown) => {
      ctx.postMessage({ id: req.id, ok: false, error: err instanceof Error ? err.message : String(err) });
    });
};
