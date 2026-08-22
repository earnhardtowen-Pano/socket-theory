/**
 * Replay-determinism fixtures — the G1 acceptance evidence.
 *
 * For every fixture document under packages/history/fixtures/:
 *   - the in-code builder reproduces the saved file exactly
 *   - load() replays it and the evaluated-buffer hash equals the golden
 *   - save(load(doc)) round-trips the document
 *   - two independent replays agree bit-for-bit
 *
 * REGEN=1 rewrites the fixture JSONs and goldens.json from the builders.
 * (JSON.stringify is used for SAVING documents only — hashing goes through
 * @car/ci-tools hashObjects over raw Float64 bit patterns.)
 */

import { beforeAll, describe, expect, it } from "vitest";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { CarDocument } from "@car/schema";
import { diffHashes, hashObjects } from "@car/ci-tools";
import { buildFixture, fixtureNames, load, type FixtureName } from "@car/history";

const fixturesDir = fileURLToPath(new URL("../fixtures/", import.meta.url));
const fixturePath = (name: FixtureName): string => `${fixturesDir}${name}.json`;
const goldensPath = `${fixturesDir}goldens.json`;

const REGEN = process.env["REGEN"] === "1";

beforeAll(() => {
  if (!REGEN) return;
  mkdirSync(fixturesDir, { recursive: true });
  const goldens: Record<string, string> = {};
  for (const name of fixtureNames) {
    const doc = buildFixture(name).save();
    writeFileSync(fixturePath(name), `${JSON.stringify(doc, null, 2)}\n`);
    goldens[name] = hashObjects(load(doc).state.evaluatedBuffers()).root;
  }
  writeFileSync(goldensPath, `${JSON.stringify(goldens, null, 2)}\n`);
});

function readFixture(name: FixtureName): CarDocument {
  return JSON.parse(readFileSync(fixturePath(name), "utf8")) as CarDocument;
}

function readGoldens(): Record<string, string> {
  return JSON.parse(readFileSync(goldensPath, "utf8")) as Record<string, string>;
}

describe("replay determinism (golden hashes)", () => {
  for (const name of fixtureNames) {
    describe(name, () => {
      it("the in-code builder reproduces the saved fixture", () => {
        const built = buildFixture(name).save();
        expect(JSON.parse(JSON.stringify(built))).toEqual(readFixture(name));
      });

      it("replay reproduces the golden evaluated-buffer hash", () => {
        const doc = readFixture(name);
        const replayed = hashObjects(load(doc).state.evaluatedBuffers());
        const golden = readGoldens()[name];
        expect(golden).toBeDefined();
        expect(replayed.root).toBe(golden);
      });

      it("save(load(doc)) round-trips the document", () => {
        const doc = readFixture(name);
        expect(JSON.parse(JSON.stringify(load(doc).save()))).toEqual(doc);
      });

      it("two independent replays agree bit-for-bit", () => {
        const doc = readFixture(name);
        const a = hashObjects(load(doc).state.evaluatedBuffers());
        const b = hashObjects(load(doc).state.evaluatedBuffers());
        expect(diffHashes(a, b)).toBeNull();
      });
    });
  }

  it("the live session hash equals the replayed hash (no save/load drift)", () => {
    for (const name of fixtureNames) {
      const live = buildFixture(name);
      const a = hashObjects(live.state.evaluatedBuffers());
      const b = hashObjects(load(live.save()).state.evaluatedBuffers());
      expect(diffHashes(a, b), name).toBeNull();
    }
  });

  it("counter integrity: a tampered counter fails the replay check", () => {
    const doc = readFixture("single-box");
    const tampered = {
      ...doc,
      counters: { ...doc.counters, cell: doc.counters.cell + 1 },
    };
    expect(() => load(tampered)).toThrow(/counter mismatch/);
  });

  it("a tampered authored input changes the hash (the hash sees geometry)", () => {
    const doc = readFixture("single-box");
    const mutated = JSON.parse(JSON.stringify(doc)) as {
      verbs: Array<{ args: { rect: { b: [number, number] } } }>;
    };
    const rect = mutated.verbs[0]?.args.rect;
    if (!rect) throw new Error("fixture shape changed");
    rect.b = [rect.b[0] + 1, rect.b[1]];
    const a = hashObjects(load(doc).state.evaluatedBuffers());
    const b = hashObjects(load(mutated as unknown as CarDocument).state.evaluatedBuffers());
    expect(a.root).not.toBe(b.root);
  });
});
