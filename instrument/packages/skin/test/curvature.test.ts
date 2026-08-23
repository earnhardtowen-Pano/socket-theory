import { describe, expect, it } from "vitest";
import { curvatureMap } from "@car/skin";

/** An icosphere-ish sphere: subdivided octahedron, projected onto radius r. */
function sphere(r: number, subdiv: number) {
  let verts: [number, number, number][] = [
    [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1],
  ];
  let faces: [number, number, number][] = [
    [0, 2, 4], [2, 1, 4], [1, 3, 4], [3, 0, 4],
    [2, 0, 5], [1, 2, 5], [3, 1, 5], [0, 3, 5],
  ];
  for (let s = 0; s < subdiv; s++) {
    const mid = new Map<string, number>();
    const midpoint = (a: number, b: number): number => {
      const key = a < b ? `${a}-${b}` : `${b}-${a}`;
      const seen = mid.get(key);
      if (seen !== undefined) return seen;
      const p: [number, number, number] = [
        (verts[a]![0] + verts[b]![0]) / 2,
        (verts[a]![1] + verts[b]![1]) / 2,
        (verts[a]![2] + verts[b]![2]) / 2,
      ];
      const l = Math.hypot(...p);
      verts.push([p[0] / l, p[1] / l, p[2] / l]);
      const i = verts.length - 1;
      mid.set(key, i);
      return i;
    };
    const next: [number, number, number][] = [];
    for (const [a, b, c] of faces) {
      const ab = midpoint(a, b), bc = midpoint(b, c), ca = midpoint(c, a);
      next.push([a, ab, ca], [ab, b, bc], [ca, bc, c], [ab, bc, ca]);
    }
    faces = next;
  }
  const positions = new Float64Array(verts.length * 3);
  verts.forEach((v, i) => { positions[i * 3] = v[0] * r; positions[i * 3 + 1] = v[1] * r; positions[i * 3 + 2] = v[2] * r; });
  const indices = new Uint32Array(faces.length * 3);
  faces.forEach((f, i) => { indices[i * 3] = f[0]; indices[i * 3 + 1] = f[1]; indices[i * 3 + 2] = f[2]; });
  return { positions, indices };
}

/** A flat square in the XY plane, n×n quads. */
function plane(size: number, n: number) {
  const pos: number[] = [], idx: number[] = [];
  for (let i = 0; i <= n; i++) {
    for (let j = 0; j <= n; j++) pos.push((size * i) / n, (size * j) / n, 0);
  }
  const at = (i: number, j: number) => i * (n + 1) + j;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      idx.push(at(i, j), at(i + 1, j), at(i + 1, j + 1));
      idx.push(at(i, j), at(i + 1, j + 1), at(i, j + 1));
    }
  }
  return { positions: new Float64Array(pos), indices: new Uint32Array(idx) };
}

/** Interior vertices only — a boundary vertex has no closed ring to measure. */
const interior = (m: { positions: Float64Array; indices: Uint32Array }): number[] => {
  const count = new Map<string, number>();
  for (let t = 0; t < m.indices.length; t += 3) {
    for (let e = 0; e < 3; e++) {
      const a = m.indices[t + e]!, b = m.indices[t + ((e + 1) % 3)]!;
      const k = a < b ? `${a}-${b}` : `${b}-${a}`;
      count.set(k, (count.get(k) ?? 0) + 1);
    }
  }
  const onBoundary = new Set<number>();
  for (const [k, n] of count) {
    if (n === 1) { const [a, b] = k.split("-"); onBoundary.add(Number(a)); onBoundary.add(Number(b)); }
  }
  const out: number[] = [];
  for (let v = 0; v < m.positions.length / 3; v++) if (!onBoundary.has(v)) out.push(v);
  return out;
};

describe("curvature lens", () => {
  it("reads 1/r mean curvature on a sphere", () => {
    // The one shape with an analytic answer: H = 1/r everywhere.
    const r = 500;
    const m = sphere(r, 3);
    const c = curvatureMap(m);
    const vs = interior(m);
    const vals = vs.map((v) => Math.abs(c.mean[v]!)).sort((a, b) => a - b);
    const median = vals[Math.floor(vals.length / 2)]!;
    expect(median).toBeGreaterThan(0.9 / r);
    expect(median).toBeLessThan(1.15 / r);
  });

  it("reads 1/r² Gaussian curvature on the same sphere", () => {
    const r = 500;
    const m = sphere(r, 3);
    const c = curvatureMap(m);
    const vs = interior(m);
    const vals = vs.map((v) => c.gaussian[v]!).sort((a, b) => a - b);
    const median = vals[Math.floor(vals.length / 2)]!;
    expect(median).toBeGreaterThan(0.8 / (r * r));
    expect(median).toBeLessThan(1.3 / (r * r));
  });

  it("reads flat on a plane — both operators, not just one", () => {
    const m = plane(1000, 8);
    const c = curvatureMap(m);
    for (const v of interior(m)) {
      expect(Math.abs(c.mean[v]!)).toBeLessThan(1e-9);
      expect(Math.abs(c.gaussian[v]!)).toBeLessThan(1e-9);
    }
  });

  it("gives a percentile range, so one bad vertex cannot set the scale", () => {
    const c = curvatureMap(sphere(500, 3));
    expect(c.meanP98).toBeGreaterThanOrEqual(c.meanP02);
    expect(c.note).toContain("DERIVED mesh");
  });

  it("is deterministic", () => {
    const m = sphere(500, 2);
    expect(Array.from(curvatureMap(m).mean)).toEqual(Array.from(curvatureMap(m).mean));
  });
});
