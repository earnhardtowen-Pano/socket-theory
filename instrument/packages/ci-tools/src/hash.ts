/**
 * Replay-determinism hashing. Canonicalization rules (ratified):
 *   - hash raw Float64 little-endian bit patterns, never decimal formatting
 *   - normalize -0 to +0 at buffer emit
 *   - assert zero NaNs
 *   - traversal sorted by stable ID
 *   - per-object sub-hashes so a mismatch names the first divergent object
 */

import { createHash } from "node:crypto";

export interface HashedObject {
  readonly id: string;
  readonly buffers: readonly Float64Array[];
}

export interface EvalHash {
  readonly root: string;
  readonly perObject: ReadonlyMap<string, string>;
}

function canonicalBytes(buf: Float64Array, owner: string): Uint8Array {
  const out = new Float64Array(buf.length);
  for (let i = 0; i < buf.length; i++) {
    const v = buf[i]!;
    if (Number.isNaN(v)) {
      throw new Error(`NaN in evaluated buffer of ${owner} at index ${i}`);
    }
    out[i] = v === 0 ? 0 : v; // normalizes -0 to +0
  }
  // Little-endian canonical byte order regardless of platform.
  const bytes = new Uint8Array(out.length * 8);
  const dv = new DataView(bytes.buffer);
  for (let i = 0; i < out.length; i++) dv.setFloat64(i * 8, out[i]!, true);
  return bytes;
}

export function hashObjects(objects: readonly HashedObject[]): EvalHash {
  const sorted = [...objects].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const perObject = new Map<string, string>();
  const root = createHash("sha256");
  for (const obj of sorted) {
    const h = createHash("sha256");
    h.update(obj.id);
    for (const buf of obj.buffers) h.update(canonicalBytes(buf, obj.id));
    const digest = h.digest("hex");
    perObject.set(obj.id, digest);
    root.update(obj.id);
    root.update(digest);
  }
  return { root: root.digest("hex"), perObject };
}

/** Diff two hashes; names the first divergent object for the CI report. */
export function diffHashes(a: EvalHash, b: EvalHash): string | null {
  if (a.root === b.root) return null;
  const ids = new Set([...a.perObject.keys(), ...b.perObject.keys()]);
  for (const id of [...ids].sort()) {
    const ha = a.perObject.get(id);
    const hb = b.perObject.get(id);
    if (ha !== hb) {
      return `first divergent object: ${id} (${ha ?? "absent"} vs ${hb ?? "absent"})`;
    }
  }
  return "roots differ but all objects match — traversal order bug";
}
