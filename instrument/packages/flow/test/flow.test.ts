import { describe, expect, it } from "vitest";
import { makeAllocator, type Pt3 } from "@car/schema";
import { FrameState, computeQuilt } from "@car/frame";
import { evalChain } from "@car/num";
import { flowMesh } from "@car/flow";
import { meshQuilt, closedMeshCheck } from "@car/mesh";

function body() {
  const state = new FrameState();
  const alloc = makeAllocator();
  state.createBox({ view: { kind: "side" }, a: [0, 0], b: [1000, 400], depth: 600, at: -300 }, alloc);
  // A plain box: closed, and faceted enough to fair. A split fixture would be
  // better exercise, but the minimal both-flank split currently meshes open
  // (see DESIGN-NOTES, "T-junction on an unsplit opposite face") and a flow
  // test must not depend on a defect it is not testing.
  void alloc;
  const quilt = computeQuilt(state);
  return { state, quilt, mesh: meshQuilt(quilt, {}) };
}

/** Sharpest angle between adjacent triangle normals — the worst kink. Mean is
 *  the wrong measure here: fairing trades one hard edge for a wide, gentle
 *  curve, so the mean over every edge can rise while the body gets smoother. */
function facetEnergy(positions: Float64Array, indices: Uint32Array): number {
  const normalOf = (t: number): Pt3 => {
    const a = indices[t]! * 3, b = indices[t + 1]! * 3, c = indices[t + 2]! * 3;
    const u = [positions[b]! - positions[a]!, positions[b + 1]! - positions[a + 1]!, positions[b + 2]! - positions[a + 2]!];
    const v = [positions[c]! - positions[a]!, positions[c + 1]! - positions[a + 1]!, positions[c + 2]! - positions[a + 2]!];
    const nx = u[1]! * v[2]! - u[2]! * v[1]!, ny = u[2]! * v[0]! - u[0]! * v[2]!, nz = u[0]! * v[1]! - u[1]! * v[0]!;
    const l = Math.hypot(nx, ny, nz) || 1;
    return [nx / l, ny / l, nz / l];
  };
  const edges = new Map<string, Pt3[]>();
  for (let t = 0; t + 2 < indices.length; t += 3) {
    const nrm = normalOf(t);
    const tri = [indices[t]!, indices[t + 1]!, indices[t + 2]!];
    for (let e = 0; e < 3; e++) {
      const a = tri[e]!, b = tri[(e + 1) % 3]!;
      const k = `${Math.min(a, b)}-${Math.max(a, b)}`;
      const list = edges.get(k);
      if (list) list.push(nrm); else edges.set(k, [nrm]);
    }
  }
  let worst = 0;
  for (const [, pair] of edges) {
    if (pair.length !== 2) continue;
    const [p, q] = pair as [Pt3, Pt3];
    const dot = Math.max(-1, Math.min(1, p[0] * q[0] + p[1] * q[1] + p[2] * q[2]));
    worst = Math.max(worst, Math.acos(dot));
  }
  return worst;
}

describe("flowMesh — the flow solve, on the surface where the kink actually is", () => {
  it("keeps a closed mesh closed: topology is never touched", () => {
    const { mesh } = body();
    const { positions } = flowMesh(mesh);
    expect(closedMeshCheck({ positions, indices: mesh.indices }).closed).toBe(true);
  });

  it("actually fairs: the sharpest kink softens", () => {
    const { mesh } = body();
    const before = facetEnergy(mesh.positions, mesh.indices);
    const { positions } = flowMesh(mesh);
    expect(facetEnergy(positions, mesh.indices)).toBeLessThan(before);
  });

  it("holds volume: Taubin, not a bar of soap", () => {
    const { mesh } = body();
    const bbox = (p: Float64Array): number => {
      let min = Infinity, max = -Infinity;
      for (let i = 0; i < p.length; i += 3) { min = Math.min(min, p[i]!); max = Math.max(max, p[i]!); }
      return max - min;
    };
    const before = bbox(mesh.positions);
    const after = bbox(flowMesh(mesh).positions);
    expect(after).toBeGreaterThan(before * 0.97);
  });

  it("pins creases: a kink somebody asked for survives", () => {
    const { quilt, mesh } = body();
    const samples: Pt3[] = [];
    const creased = [...quilt.curves.keys()][0]!;
    const chain = quilt.curves.get(creased)!;
    for (let i = 0; i <= 24; i++) samples.push(evalChain(chain, i / 24));
    const { positions, report } = flowMesh(mesh, samples);
    expect(report.pinned).toBeGreaterThan(0);
    for (let v = 0; v < positions.length / 3; v++) {
      const moved = Math.abs(positions[v * 3]! - mesh.positions[v * 3]!)
        + Math.abs(positions[v * 3 + 1]! - mesh.positions[v * 3 + 1]!)
        + Math.abs(positions[v * 3 + 2]! - mesh.positions[v * 3 + 2]!);
      const near = samples.some((sp) =>
        Math.hypot(sp[0] - mesh.positions[v * 3]!, sp[1] - mesh.positions[v * 3 + 1]!, sp[2] - mesh.positions[v * 3 + 2]!) <= 2);
      if (near) expect(moved).toBeLessThan(1e-9);
    }
  });

  it("is deterministic", () => {
    const { mesh } = body();
    const a = flowMesh(mesh).positions;
    const b = flowMesh(mesh).positions;
    expect(Buffer.from(a.buffer).equals(Buffer.from(b.buffer))).toBe(true);
  });
});
