import { describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";
import {
  diffHashes,
  hashObjects,
  scanBareConstants,
  scanDeterminism,
  scanPackImports,
} from "@car/ci-tools";

const root = fileURLToPath(new URL("../../..", import.meta.url));
const pkg = (name: string) => `${root}packages/${name}/src`;

describe("honesty police", () => {
  it("no bare constants in the licensed packages", () => {
    const violations = scanBareConstants([pkg("demand"), pkg("types"), pkg("pack"), pkg("lens")]);
    expect(violations).toEqual([]);
  });

  it("the packaging solver imports only schema/num/demand", () => {
    const violations = scanPackImports(pkg("pack"));
    expect(violations).toEqual([]);
  });

  it("no wall clock, randomness, or raw transcendentals in the model cone", () => {
    const cone = [
      "schema", "num", "history", "frame", "constrain", "surface",
      "mesh", "skin", "demand", "types", "pack", "lens", "occt", "fixtures",
    ].map(pkg);
    const violations = scanDeterminism(cone, pkg("num"));
    expect(violations).toEqual([]);
  });
});

describe("canonical hashing", () => {
  it("normalizes -0 and is order-independent across object listing", () => {
    const a = hashObjects([
      { id: "cell#1", buffers: [new Float64Array([1, -0, 3])] },
      { id: "cell#0", buffers: [new Float64Array([5])] },
    ]);
    const b = hashObjects([
      { id: "cell#0", buffers: [new Float64Array([5])] },
      { id: "cell#1", buffers: [new Float64Array([1, 0, 3])] },
    ]);
    expect(a.root).toBe(b.root);
    expect(diffHashes(a, b)).toBeNull();
  });

  it("rejects NaN in evaluated buffers", () => {
    expect(() =>
      hashObjects([{ id: "cell#0", buffers: [new Float64Array([Number.NaN])] }]),
    ).toThrow(/NaN/);
  });

  it("names the first divergent object", () => {
    const a = hashObjects([{ id: "cell#0", buffers: [new Float64Array([1])] }]);
    const b = hashObjects([{ id: "cell#0", buffers: [new Float64Array([2])] }]);
    expect(diffHashes(a, b)).toContain("cell#0");
  });
});
