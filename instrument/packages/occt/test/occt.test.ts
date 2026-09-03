/**
 * @car/occt acceptance evidence. One wasm init serves the whole file (seconds
 * of startup, shared via the node.ts singleton).
 *
 * The closed-mesh assertion is local law for this suite: every undirected
 * edge of the merged triangle mesh must be used by exactly two triangles.
 * (@car/mesh owns the instrument-wide check; this suite must not import it.)
 */

import { beforeAll, describe, expect, it } from "vitest";
import type { Pt3 } from "@car/schema";
import type { Engine, MeshData } from "../src/api.js";
import { initEngineNode } from "../src/node.js";

// ---------------------------------------------------------------------------
// Local mesh assertions
// ---------------------------------------------------------------------------

function assertClosed(mesh: MeshData): void {
  expect(mesh.indices.length).toBeGreaterThan(0);
  expect(mesh.indices.length % 3).toBe(0);
  expect(mesh.positions.length % 3).toBe(0);
  const vertexCount = mesh.positions.length / 3;
  const edgeUse = new Map<string, number>();
  for (let i = 0; i < mesh.indices.length; i += 3) {
    const a = mesh.indices[i]!;
    const b = mesh.indices[i + 1]!;
    const c = mesh.indices[i + 2]!;
    expect(a).toBeLessThan(vertexCount);
    expect(b).toBeLessThan(vertexCount);
    expect(c).toBeLessThan(vertexCount);
    for (const [u, v] of [[a, b], [b, c], [c, a]] as const) {
      const key = u < v ? `${u}-${v}` : `${v}-${u}`;
      edgeUse.set(key, (edgeUse.get(key) ?? 0) + 1);
    }
  }
  for (const [edge, uses] of edgeUse) {
    if (uses !== 2) throw new Error(`mesh not closed: edge ${edge} used ${uses} times`);
  }
}

function bounds(mesh: MeshData): { min: Pt3; max: Pt3 } {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < mesh.positions.length; i += 3) {
    for (let axis = 0; axis < 3; axis++) {
      const v = mesh.positions[i + axis]!;
      if (v < min[axis]!) min[axis] = v;
      if (v > max[axis]!) max[axis] = v;
    }
  }
  return { min: min as unknown as Pt3, max: max as unknown as Pt3 };
}

/** Divergence-theorem volume; positive iff triangles wind CCW seen from outside. */
function signedVolume(mesh: MeshData): number {
  const p = mesh.positions;
  let six = 0;
  for (let i = 0; i < mesh.indices.length; i += 3) {
    const a = mesh.indices[i]! * 3;
    const b = mesh.indices[i + 1]! * 3;
    const c = mesh.indices[i + 2]! * 3;
    const ax = p[a]!, ay = p[a + 1]!, az = p[a + 2]!;
    const bx = p[b]!, by = p[b + 1]!, bz = p[b + 2]!;
    const cx = p[c]!, cy = p[c + 1]!, cz = p[c + 2]!;
    six += ax * (by * cz - bz * cy) + ay * (bz * cx - bx * cz) + az * (bx * cy - by * cx);
  }
  return six / 6;
}

function assertBytesEqual(a: Float64Array | Uint32Array, b: Float64Array | Uint32Array): void {
  expect(b.byteLength).toBe(a.byteLength);
  const ba = new Uint8Array(a.buffer, a.byteOffset, a.byteLength);
  const bb = new Uint8Array(b.buffer, b.byteOffset, b.byteLength);
  let firstDiff = -1;
  for (let i = 0; i < ba.length; i++) {
    if (ba[i] !== bb[i]) { firstDiff = i; break; }
  }
  expect(firstDiff).toBe(-1);
}

// ---------------------------------------------------------------------------

let engine: Engine;

beforeAll(async () => {
  engine = await initEngineNode();
}, 120_000);

const DEFLECTION = 5; // mm — coarse; planar-faced fixtures mesh exactly anyway

describe("engine lifecycle", () => {
  it("initEngineNode is a per-process singleton", async () => {
    const again = await initEngineNode();
    expect(again).toBe(engine);
  });

  it("the @car/occt index exposes the same singleton through its lazy loader", async () => {
    const pkg = await import("@car/occt");
    const viaIndex = await pkg.initEngineNode();
    expect(viaIndex).toBe(engine);
  });

  it("dispose kills a handle and later use throws", () => {
    const h = engine.makeBox([10, 10, 10], [0, 0, 0]);
    expect(h.kind).toBe("occt-shape");
    expect(h.alive).toBe(true);
    h.dispose();
    expect(h.alive).toBe(false);
    expect(() => engine.meshShape(h, DEFLECTION)).toThrow(/dispose/);
    h.dispose(); // idempotent
    expect(h.alive).toBe(false);
  });
});

describe("makeBox → meshShape", () => {
  it("meshes a located box into a closed, welded, outward-wound solid", () => {
    const h = engine.makeBox([100, 60, 40], [10, 20, 30]);
    const mesh = engine.meshShape(h, DEFLECTION);

    assertClosed(mesh);
    // Exact weld must collapse the 6 face triangulations to the 8 corners.
    expect(mesh.positions.length).toBe(8 * 3);
    expect(mesh.indices.length).toBe(12 * 3);

    const { min, max } = bounds(mesh);
    expect(min).toEqual([10, 20, 30]);
    expect(max).toEqual([110, 80, 70]);

    // Positive signed volume proves outward CCW winding (orientation flip
    // for TopAbs_REVERSED faces is doing its job).
    expect(signedVolume(mesh)).toBeCloseTo(100 * 60 * 40, 6);
    h.dispose();
  });

  it("rejects non-positive sizes and non-finite corners", () => {
    expect(() => engine.makeBox([0, 10, 10], [0, 0, 0])).toThrow(/positive/);
    expect(() => engine.makeBox([10, -1, 10], [0, 0, 0])).toThrow(/positive/);
    expect(() => engine.makeBox([10, 10, 10], [Number.NaN, 0, 0])).toThrow(/finite/);
  });
});

describe("cutPrism", () => {
  it("cuts a square hole through: closed, more triangles, same bounds, less volume", () => {
    const box = engine.makeBox([100, 60, 40], [10, 20, 30]);
    const boxMesh = engine.meshShape(box, DEFLECTION);

    // 30×20 profile below the box, swept along +Z through the whole solid.
    const profile: Pt3[] = [
      [40, 40, 25],
      [70, 40, 25],
      [70, 60, 25],
      [40, 60, 25],
    ];
    const holed = engine.cutPrism(box, profile, [0, 0, 1], 60);
    const holedMesh = engine.meshShape(holed, DEFLECTION);

    assertClosed(holedMesh);
    expect(holedMesh.indices.length / 3).toBeGreaterThan(boxMesh.indices.length / 3);

    const before = bounds(boxMesh);
    const after = bounds(holedMesh);
    expect(after.min).toEqual(before.min);
    expect(after.max).toEqual(before.max);

    // Volume drops by exactly the prism's intersection: 30 × 20 × 40.
    expect(signedVolume(holedMesh)).toBeCloseTo(100 * 60 * 40 - 30 * 20 * 40, 6);

    // The cut derives a new shape; the input solid is untouched.
    expect(box.alive).toBe(true);
    box.dispose();
    holed.dispose();
  });

  it("rejects degenerate inputs before touching the kernel", () => {
    const box = engine.makeBox([10, 10, 10], [0, 0, 0]);
    const square: Pt3[] = [[2, 2, -1], [8, 2, -1], [8, 8, -1], [2, 8, -1]];
    expect(() => engine.cutPrism(box, square.slice(0, 2), [0, 0, 1], 12)).toThrow(/at least 3/);
    expect(() => engine.cutPrism(box, square, [0, 0, 0], 12)).toThrow(/non-zero/);
    expect(() => engine.cutPrism(box, square, [0, 0, 1], 0)).toThrow(/depth/);
    expect(() => engine.cutPrism(box, square, [0, 0, 1], -5)).toThrow(/depth/);
    box.dispose();
  });

  it("refuses a non-planar profile", () => {
    const box = engine.makeBox([10, 10, 10], [0, 0, 0]);
    const skew: Pt3[] = [[2, 2, -1], [8, 2, -1], [8, 8, 3], [2, 8, -1]];
    expect(() => engine.cutPrism(box, skew, [0, 0, 1], 12)).toThrow(/planar/);
    box.dispose();
  });
});

describe("fuse", () => {
  it("fuses two overlapping boxes into one closed solid", () => {
    const a = engine.makeBox([100, 100, 100], [0, 0, 0]);
    const b = engine.makeBox([100, 100, 100], [50, 50, 50]);
    const fused = engine.fuse([a, b]);
    const mesh = engine.meshShape(fused, DEFLECTION);

    assertClosed(mesh);
    // Union volume = 2·100³ − 50³ overlap.
    expect(signedVolume(mesh)).toBeCloseTo(2_000_000 - 125_000, 6);

    a.dispose();
    b.dispose();
    fused.dispose();
  });

  it("requires at least two handles", () => {
    const a = engine.makeBox([10, 10, 10], [0, 0, 0]);
    expect(() => engine.fuse([a])).toThrow(/two/);
    expect(() => engine.fuse([])).toThrow(/two/);
    a.dispose();
  });
});

describe("stepExport", () => {
  it("emits an ISO-10303-21 STEP text with a pinned timestamp", () => {
    const h = engine.makeBox([100, 60, 40], [10, 20, 30]);
    const text = engine.stepExport(h);
    expect(text.startsWith("ISO-10303-21")).toBe(true);
    expect(text).toContain("END-ISO-10303-21");
    expect(text.length).toBeGreaterThan(1000);
    // Wall clock never reaches exported bytes: the one clock-bearing STEP
    // field (FILE_NAME time_stamp) is pinned to the epoch.
    expect(text).toContain("'1970-01-01T00:00:00'");
    h.dispose();
  });

  it("is byte-identical across exports of the same shape", () => {
    const h = engine.makeBox([100, 60, 40], [10, 20, 30]);
    const a = engine.stepExport(h);
    const b = engine.stepExport(h);
    expect(b).toBe(a);
    h.dispose();
  });
});

describe("determinism", () => {
  it("meshShape twice on the same fresh shape is byte-identical", () => {
    const h = engine.makeBox([100, 60, 40], [10, 20, 30]);
    const first = engine.meshShape(h, DEFLECTION);
    const second = engine.meshShape(h, DEFLECTION);
    assertBytesEqual(first.positions, second.positions);
    assertBytesEqual(first.indices, second.indices);
    expect(first.positions).not.toBe(second.positions); // fresh buffers each call
    h.dispose();
  });

  it("a boolean result meshed twice is byte-identical too", () => {
    const box = engine.makeBox([100, 60, 40], [10, 20, 30]);
    const profile: Pt3[] = [[40, 40, 25], [70, 40, 25], [70, 60, 25], [40, 60, 25]];
    const holed = engine.cutPrism(box, profile, [0, 0, 1], 60);
    const first = engine.meshShape(holed, DEFLECTION);
    const second = engine.meshShape(holed, DEFLECTION);
    assertBytesEqual(first.positions, second.positions);
    assertBytesEqual(first.indices, second.indices);
    box.dispose();
    holed.dispose();
  });

  it("two separately built identical shapes mesh byte-identically", () => {
    const build = (): MeshData => {
      const box = engine.makeBox([100, 60, 40], [10, 20, 30]);
      const profile: Pt3[] = [[40, 40, 25], [70, 40, 25], [70, 60, 25], [40, 60, 25]];
      const holed = engine.cutPrism(box, profile, [0, 0, 1], 60);
      const mesh = engine.meshShape(holed, 2);
      box.dispose();
      holed.dispose();
      return mesh;
    };
    const first = build();
    const second = build();
    assertBytesEqual(first.positions, second.positions);
    assertBytesEqual(first.indices, second.indices);
  });
});
