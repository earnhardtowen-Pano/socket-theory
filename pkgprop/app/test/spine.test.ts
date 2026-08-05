import { describe, expect, it } from 'vitest';
import { solve } from '@pkgprop/core';
import { ARCHITECTURES, buildSolveInput } from '@pkgprop/data';
import { buildCarBody } from '../src/model/body.js';
import { initialState } from '../src/state/store.js';

/**
 * The car is a mirrored half. Where the two halves meet, the surface has to be
 * one surface — which means every vertex on the centreline needs a normal that
 * lies in the mirror plane. A normal with a sideways component there is a
 * crease running the length of the car, and it is drawn by the maths rather
 * than by the designer.
 */
describe('the spine and the keel', () => {
  it('the surface meets its own reflection square, on every architecture', () => {
    for (const arch of ARCHITECTURES) {
      const st = initialState();
      const result = solve(buildSolveInput({ ...st.now.pkg, architecture: arch.id }));
      const b = buildCarBody(result, st.now.drawing, st.now.features);
      const m = b.network!.mesh;

      let worst = 0;
      let n = 0;
      for (let i = 0; i < m.vertexCount; i += 1) {
        // On the centreline, within a tenth of a millimetre.
        if (Math.abs(m.positions[i * 3 + 1]!) > 0.1) continue;
        n += 1;
        // A normal in the mirror plane has no y component. The angle out of
        // that plane is the half-angle of the crease the mirror would make.
        const ny = Math.abs(m.normals[i * 3 + 1]!);
        worst = Math.max(worst, (Math.asin(Math.min(1, ny)) * 180) / Math.PI);
      }
      expect(n, `${arch.id} has no centreline vertices`).toBeGreaterThan(10);
      console.log(`${arch.id.padEnd(4)} ${n} centreline vertices, worst tilt ${worst.toFixed(2)}°`);
      // Measured at 9.9-27° before the section was clamped to leave the mirror
      // plane perpendicular. Two degrees is invisible; ten is a ridge.
      expect(worst, `${arch.id} spine tilt`).toBeLessThan(2);
    }
  });
});
