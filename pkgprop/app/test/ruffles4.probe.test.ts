import { describe, it } from 'vitest';
import { solve, type SolveResult } from '@pkgprop/core';
import { buildSolveInput } from '@pkgprop/data';
import { initialState } from '../src/state/store.js';
import { buildCarBody } from '../src/model/body.js';
import { interpolate, v3 } from '@pkgprop/geometry';
import {
  clampLinePoint, denorm, LINE_DEFS, lineFrameOf, linePoints,
  type DrawingState, type LineId,
} from '../src/state/lines.js';

const log = (...a: unknown[]): void => console.log(...a);
const f = (n: number, d = 3): string => (Number.isFinite(n) ? n.toFixed(d) : String(n));

function pointsOf(id: LineId, drawing: DrawingState, result: SolveResult): { x: number; z: number }[] {
  const def = LINE_DEFS.find((d) => d.id === id)!;
  const frame = lineFrameOf(id, result);
  return linePoints(id, drawing, result).map((pt) => {
    const { x, z } = denorm(frame, pt);
    const c = clampLinePoint(def, result, x, z);
    return { x: c.x, z: c.z };
  });
}

describe('ruffle probe 4', () => {
  it('reconciles the table against the spline', () => {
    const result = solve(buildSolveInput(initialState().now.pkg));
    const st = initialState();
    const drawing = st.now.drawing;
    const build = buildCarBody(result, drawing, st.now.features);

    const topPairs: { x: number; v: number }[] = [];
    for (const id of ['hood', 'glass', 'roof', 'backlight', 'deck'] as LineId[]) {
      for (const p of pointsOf(id, drawing, result)) topPairs.push({ x: p.x, v: p.z });
    }
    const merged: { x: number; v: number }[] = [];
    for (const p of [...topPairs].sort((a, b) => a.x - b.x)) {
      const prev = merged[merged.length - 1];
      if (prev && Math.abs(p.x - prev.x) < 1) merged[merged.length - 1] = { x: prev.x, v: (prev.v + p.v) / 2 };
      else merged.push(p);
    }
    const curve = interpolate(merged.map((p) => v3(p.x, p.v, 0)));
    const GRID = 240;
    const first = merged[0]!;
    const last = merged[merged.length - 1]!;
    const samples = curve.sample(GRID * 2);
    const grid: number[] = [];
    const chosenX: number[] = [];
    for (let i = 0; i <= GRID; i += 1) {
      const x = first.x + ((last.x - first.x) * i) / GRID;
      let best = samples[0]!;
      for (const s of samples) if (Math.abs(s.x - x) < Math.abs(best.x - x)) best = s;
      grid.push(best.y);
      chosenX.push(best.x);
    }
    const exact = (x: number): number => {
      let lo = 0, hi = 1;
      for (let k = 0; k < 60; k += 1) { const m = (lo + hi) / 2; if (curve.at(m).x < x) lo = m; else hi = m; }
      return curve.at((lo + hi) / 2).y;
    };
    const h = (last.x - first.x) / GRID;
    log(`grid step ${f(h, 3)} mm, span ${f(first.x, 1)}..${f(last.x, 1)}`);
    log('   x      node_i   grid[i]   table(x)   exact(x)   table-exact   sampleX-nodeX');
    for (let x = 2300; x <= 2700; x += 20) {
      const t = ((x - first.x) / (last.x - first.x)) * GRID;
      const i = Math.floor(t);
      log(`  ${f(x, 0).padStart(5)}  ${String(i).padStart(4)}  ${f(grid[i]!, 2).padStart(9)}  ${f(build.input.topZ(x), 2).padStart(9)}  ${f(exact(x), 2).padStart(9)}  ${f(build.input.topZ(x) - exact(x), 2).padStart(9)}  ${f(chosenX[i]! - (first.x + h * i), 2).padStart(8)}`);
    }
    log('\nthe spline sampled at uniform u near there (u, x, y):');
    for (let k = 175; k <= 200; k += 1) {
      const s = samples[k]!;
      log(`   u=${f(k / (GRID * 2), 4)}  x=${f(s.x, 2).padStart(9)}  y=${f(s.y, 2).padStart(9)}`);
    }
    // Is x(u) monotone over the whole curve, and how fast does y move per sample?
    let rev = 0;
    let maxdy = 0;
    let at = 0;
    for (let k = 1; k < samples.length; k += 1) {
      if (samples[k]!.x < samples[k - 1]!.x) rev += 1;
      const dy = Math.abs(samples[k]!.y - samples[k - 1]!.y);
      if (dy > maxdy) { maxdy = dy; at = samples[k]!.x; }
    }
    log(`\nx reversals across ${samples.length} samples: ${rev}; max |dy| between adjacent samples ${f(maxdy, 2)} mm at x=${f(at, 0)}`);
    // Chord error of the 17mm linear interpolation against the true spline.
    let worst = 0, worstX = 0;
    for (let i = 0; i < GRID; i += 1) {
      for (let s = 1; s < 8; s += 1) {
        const x = first.x + h * (i + s / 8);
        const lin = grid[i]! + (grid[i + 1]! - grid[i]!) * (s / 8);
        const e = lin - exact(x);
        if (Math.abs(e) > Math.abs(worst)) { worst = e; worstX = x; }
      }
    }
    log(`worst table-vs-spline error anywhere (not only at nodes): ${f(worst, 2)} mm at x=${f(worstX, 0)}`);
  }, 120000);
});
