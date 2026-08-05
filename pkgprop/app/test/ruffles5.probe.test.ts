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

describe('ruffle probe 5', () => {
  it('finds where my reconstruction and the shipped rail diverge', () => {
    const result = solve(buildSolveInput(initialState().now.pkg));
    const st = initialState();
    const drawing = st.now.drawing;
    const build = buildCarBody(result, drawing, st.now.features);

    for (const id of ['hood', 'glass', 'roof', 'backlight', 'deck'] as LineId[]) {
      log(`${id.padEnd(10)} ${pointsOf(id, drawing, result).map((p) => `(${f(p.x, 1)},${f(p.z, 1)})`).join(' ')}`);
    }
    const topPairs: { x: number; v: number }[] = [];
    for (const id of ['hood', 'glass', 'roof', 'backlight', 'deck'] as LineId[]) {
      for (const p of pointsOf(id, drawing, result)) topPairs.push({ x: p.x, v: p.z });
    }
    const sorted = [...topPairs].sort((a, b) => a.x - b.x);
    log(`sorted: ${sorted.map((p) => `(${f(p.x, 2)},${f(p.v, 1)})`).join(' ')}`);
    const pts: { x: number; v: number }[] = [];
    for (const p of sorted) {
      const prev = pts[pts.length - 1];
      if (prev && Math.abs(p.x - prev.x) < 1) pts[pts.length - 1] = { x: prev.x, v: (prev.v + p.v) / 2 };
      else pts.push(p);
    }
    log(`merged: ${pts.map((p) => `(${f(p.x, 2)},${f(p.v, 2)})`).join(' ')}`);

    const curve = interpolate(pts.map((p) => v3(p.x, p.v, 0)));
    const GRID = 240;
    const first = pts[0]!;
    const last = pts[pts.length - 1]!;
    const samples = curve.sample(GRID * 2);
    const grid: number[] = [];
    for (let i = 0; i <= GRID; i += 1) {
      const x = first.x + ((last.x - first.x) * i) / GRID;
      let best = samples[0]!;
      for (const s of samples) if (Math.abs(s.x - x) < Math.abs(best.x - x)) best = s;
      grid.push(best.y);
    }
    const mine = (x: number): number => {
      if (x <= first.x) return grid[0]!;
      if (x >= last.x) return grid[GRID]!;
      const t = ((x - first.x) / (last.x - first.x)) * GRID;
      const i = Math.min(GRID - 1, Math.floor(t));
      return grid[i]! + (grid[i + 1]! - grid[i]!) * (t - i);
    };
    let worst = 0, wx = 0;
    for (let x = -740; x <= 3370; x += 5) {
      const d = mine(x) - build.input.topZ(x);
      if (Math.abs(d) > Math.abs(worst)) { worst = d; wx = x; }
    }
    log(`\nmy reconstruction vs build.input.topZ: worst ${f(worst, 3)} mm at x=${f(wx, 0)}`);
    log('x, mine, shipped:');
    for (let x = 2300; x <= 2700; x += 40) log(`  ${f(x, 0).padStart(5)}  ${f(mine(x), 2).padStart(9)}  ${f(build.input.topZ(x), 2).padStart(9)}`);
    log(`raw curve.at over the deck: ${[0.62, 0.66, 0.7, 0.74, 0.78, 0.82].map((u) => `(u=${u} x=${f(curve.at(u).x, 0)} y=${f(curve.at(u).y, 1)})`).join(' ')}`);
    // The sample list around the deck: does the nearest-x pick jump backwards?
    log('\nnearest-x pick for nodes 175..200 (node x, chosen sample index, chosen x, chosen y):');
    for (let i = 175; i <= 200; i += 1) {
      const x = first.x + ((last.x - first.x) * i) / GRID;
      let bi = 0;
      for (let k = 0; k < samples.length; k += 1) if (Math.abs(samples[k]!.x - x) < Math.abs(samples[bi]!.x - x)) bi = k;
      log(`  node ${String(i).padStart(3)} x=${f(x, 1).padStart(8)}  -> sample ${String(bi).padStart(3)} x=${f(samples[bi]!.x, 1).padStart(8)} y=${f(samples[bi]!.y, 2).padStart(9)}`);
    }
  }, 120000);
});
