/**
 * Node loader for the opencascade.js 1.1.1 wasm build.
 *
 * The published glue (dist/opencascade.wasm.js) is a UMD-style body with a
 * trailing `export default`, so Node ≥ 22 module-syntax detection loads it as
 * ESM — where the factory then crashes at call time on `__dirname` and
 * `require`, which exist only in CommonJS scope. We therefore evaluate the
 * glue ourselves in true CJS scope with vm.compileFunction (the exact wrapper
 * the CJS loader uses), rewriting the ESM tail to `module.exports`. The wasm
 * binary is read here and passed in, so the glue never touches the
 * filesystem, and stdout/stderr chatter (STEP writer statistics) is silenced.
 */

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname } from "node:path";
import { compileFunction } from "node:vm";
import type { Engine } from "./api.js";
import { makeEngine, type OcModule } from "./engine.js";

type GlueFactory = (init: {
  wasmBinary: Uint8Array;
  print?: (line: string) => void;
  printErr?: (line: string) => void;
}) => Promise<OcModule>;

const silent = (): void => {};

function evaluateGlue(): { factory: GlueFactory; wasmBinary: Uint8Array } {
  const require = createRequire(import.meta.url);
  const gluePath = require.resolve("opencascade.js/dist/opencascade.wasm.js");
  const wasmBinary = readFileSync(require.resolve("opencascade.js/dist/opencascade.wasm.wasm"));
  const source = readFileSync(gluePath, "utf8");
  const cjsSource = source.replace(
    /export\s+default\s+opencascade\s*;?\s*$/,
    "module.exports = opencascade;\n",
  );
  if (cjsSource === source) {
    throw new Error("occt: opencascade.js glue tail changed — expected a final `export default opencascade`");
  }
  const run = compileFunction(
    cjsSource,
    ["exports", "require", "module", "__filename", "__dirname"],
    { filename: gluePath },
  );
  const mod: { exports: unknown } = { exports: {} };
  run(mod.exports, createRequire(gluePath), mod, gluePath, dirname(gluePath));
  return { factory: mod.exports as GlueFactory, wasmBinary };
}

let singleton: Promise<Engine> | undefined;

/**
 * Initialize (once per process) and return the shared engine. Wasm init costs
 * seconds; every caller shares the same instance and heap. A failed init
 * clears the cache so a later call can retry.
 */
export function initEngineNode(): Promise<Engine> {
  singleton ??= (async () => {
    const { factory, wasmBinary } = evaluateGlue();
    const oc = await factory({ wasmBinary, print: silent, printErr: silent });
    return makeEngine(oc);
  })().catch((err: unknown) => {
    singleton = undefined;
    throw err;
  });
  return singleton;
}
