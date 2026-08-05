import { describe, expect, it } from 'vitest';
import { solve } from '@pkgprop/core';
import { ARCHITECTURES, buildSolveInput } from '@pkgprop/data';
import { buildCarBody } from '../src/model/body.js';
import { initialState } from '../src/state/store.js';

/** Edges used by exactly one triangle — a hole in the body. */
function openEdges(m: { indices: Uint32Array; positions: Float32Array }): number {
  const key = (a: number, b: number) => {
    // Weld by position, not index: two panels share a curve, not a vertex id.
    const P = (i: number) =>
      `${Math.round(m.positions[i * 3]! * 100)},${Math.round(m.positions[i * 3 + 1]! * 100)},${Math.round(m.positions[i * 3 + 2]! * 100)}`;
    const pa = P(a);
    const pb = P(b);
    return pa < pb ? `${pa}|${pb}` : `${pb}|${pa}`;
  };
  const counts = new Map<string, number>();
  for (let t = 0; t < m.indices.length; t += 3) {
    const [a, b, c] = [m.indices[t]!, m.indices[t + 1]!, m.indices[t + 2]!];
    for (const [p, q] of [[a, b], [b, c], [c, a]] as [number, number][]) {
      const k = key(p, q);
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
  }
  let open = 0;
  for (const c of counts.values()) if (c === 1) open += 1;
  return open;
}

describe('the panelled car', () => {
  it('builds for every architecture and names its panels', () => {
    for (const arch of ARCHITECTURES) {
      const st = initialState();
      const pkg = { ...st.now.pkg, architecture: arch.id };
      const result = solve(buildSolveInput(pkg));
      const b = buildCarBody(result, st.now.drawing, st.now.features);
      expect(b.network, `${arch.id} produced no network`).not.toBeNull();
      const n = b.network!;
      const groups = new Set(n.mesh.groups.map((g) => g.group));
      console.log(
        `${arch.id.padEnd(18)} ${String(n.panelCount).padStart(3)} panels  ${String(n.creaseCount).padStart(3)} creases  ` +
          `${String(n.mesh.triangleCount).padStart(5)} tris  open=${openEdges(n.mesh)}  ${[...groups].sort().join(' ')}`,
      );
      expect(n.panelCount).toBeGreaterThan(12);
      // Every car has a body and a way to see out of it.
      expect(groups.has('hood')).toBe(true);
      expect(groups.has('door')).toBe(true);
    }
  });
});
