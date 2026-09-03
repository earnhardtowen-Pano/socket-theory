import { describe, expect, it } from "vitest";
import { idKind, makeAllocator } from "@car/schema";

describe("id allocator", () => {
  it("is deterministic and monotonic per kind", () => {
    const a = makeAllocator();
    expect(a.next("cell")).toBe("cell#0");
    expect(a.next("cell")).toBe("cell#1");
    expect(a.next("curve")).toBe("curve#0");
    expect(a.counters().cell).toBe(2);
  });

  it("replays identically from a counter snapshot", () => {
    const a = makeAllocator();
    a.next("cell");
    a.next("curve");
    const b = makeAllocator(a.counters());
    expect(b.next("cell")).toBe("cell#1");
    expect(b.next("curve")).toBe("curve#1");
  });

  it("recovers kind from an id", () => {
    expect(idKind("feature#12")).toBe("feature");
  });
});
