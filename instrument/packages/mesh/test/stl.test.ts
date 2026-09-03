import { describe, expect, it } from "vitest";
import { meshQuilt, writeStlBinary } from "@car/mesh";
import { boxQuilt } from "./fixtures.js";

describe("writeStlBinary", () => {
  const { quilt } = boxQuilt(100);
  const mesh = meshQuilt(quilt, { baseDensity: 3 });

  it("golden layout: byte length and the first 84 bytes are stable", () => {
    const bytes = writeStlBinary(mesh, "box-g1");
    // 84-byte preamble + 50 bytes per triangle; the closed box has 108 triangles
    expect(mesh.indices.length / 3).toBe(108);
    expect(bytes.length).toBe(84 + 108 * 50);
    expect(bytes.length).toBe(5484);
    const expectedHead = new Uint8Array(84);
    const name = "box-g1";
    for (let i = 0; i < name.length; i++) expectedHead[i] = name.charCodeAt(i);
    new DataView(expectedHead.buffer).setUint32(80, 108, true);
    expect([...bytes.slice(0, 84)]).toEqual([...expectedHead]);
  });

  it("triangle count in the header equals indices/3", () => {
    const bytes = writeStlBinary(mesh, "box-g1");
    const count = new DataView(bytes.buffer, bytes.byteOffset).getUint32(80, true);
    expect(count).toBe(mesh.indices.length / 3);
  });

  it("identical input produces identical bytes", () => {
    const a = writeStlBinary(mesh, "box-g1");
    const b = writeStlBinary(meshQuilt(boxQuilt(100).quilt, { baseDensity: 3 }), "box-g1");
    expect(a.length).toBe(b.length);
    expect([...a]).toEqual([...b]);
  });

  it("downcasts to Float32 little-endian without NaN, unit normals outward", () => {
    const bytes = writeStlBinary(mesh, "box-g1");
    const view = new DataView(bytes.buffer, bytes.byteOffset);
    for (let t = 0; t < 108; t++) {
      const off = 84 + 50 * t;
      let n2 = 0;
      for (let k = 0; k < 12; k++) {
        const f = view.getFloat32(off + 4 * k, true);
        expect(Number.isNaN(f)).toBe(false);
        if (k < 3) n2 += f * f;
      }
      expect(Math.abs(n2 - 1)).toBeLessThan(1e-6); // box facets: exact unit axes
      expect(view.getUint16(off + 48, true)).toBe(0);
    }
  });

  it("a zero-area facet gets the null normal, never NaN", () => {
    const degenerate = {
      positions: new Float64Array([0, 0, 0, 50, 0, 0, 100, 0, 0]),
      indices: new Uint32Array([0, 1, 2]), // distinct indices, collinear points
    };
    const bytes = writeStlBinary(degenerate, "sliver");
    const view = new DataView(bytes.buffer, bytes.byteOffset);
    expect(view.getFloat32(84, true)).toBe(0);
    expect(view.getFloat32(88, true)).toBe(0);
    expect(view.getFloat32(92, true)).toBe(0);
  });

  it("clamps the name into the 80-byte header", () => {
    const bytes = writeStlBinary(mesh, "x".repeat(200));
    expect(bytes.length).toBe(5484);
    expect(bytes[79]).toBe("x".charCodeAt(0));
    expect(new DataView(bytes.buffer, bytes.byteOffset).getUint32(80, true)).toBe(108);
  });
});
