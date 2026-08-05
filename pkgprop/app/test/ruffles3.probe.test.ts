import { describe, it } from 'vitest';
import { solve, type SolveResult } from '@pkgprop/core';
import { buildSolveInput } from '@pkgprop/data';
import { initialState } from '../src/state/store.js';
import { buildCarBody } from '../src/model/body.js';
import { generateFeature } from '../src/model/features.js';
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
const dedupe = (s: readonly number[]): number[] => {
  const sorted = [...s].sort((a, b) => a - b);
  return sorted.filter((x, i) => i === 0 || x - sorted[i - 1]! > 4);
};

describe('ruffle probe 3', () => {
  it('dumps the arch table and the rail residual', () => {
    const result = solve(buildSolveInput(initialState().now.pkg));
    const st = initialState();
    const drawing = st.now.drawing;
    const build = buildCarBody(result, drawing, st.now.features);
    const stations = dedupe(build.input.stations);
    const g = result.geometry;

    // --- the arch table, cell by cell, exactly as app/src/model/body.ts builds it
    const pts = generateFeature(st.now.features['opening-front']!, result).curve;
    let x0 = Infinity, x1 = -Infinity;
    for (const p of pts) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); }
    const N = 96;
    const grid = new Array<number>(N + 1).fill(-Infinity);
    const hits = new Array<number>(N + 1).fill(0);
    for (const p of pts) {
      const i = Math.round(((p.x - x0) / (x1 - x0)) * N);
      grid[i] = Math.max(grid[i] ?? -Infinity, p.z);
      hits[i] = (hits[i] ?? 0) + 1;
    }
    const filled = hits.filter((h) => h > 0).length;
    const multi = hits.filter((h) => h > 1).length;
    log(`--- ARCH TABLE (opening-front): ${pts.length} curve points -> ${N + 1} cells over ${f(x1 - x0, 1)} mm`);
    log(`    ${filled} cells got a sample; ${N + 1 - filled} were CARRIED from a neighbour; ${multi} cells got 2+ samples (max wins)`);
    log(`    hit pattern: ${hits.map((h) => (h === 0 ? '.' : String(h))).join('')}`);
    for (let i = 1; i <= N; i += 1) if (grid[i] === -Infinity) grid[i] = grid[i - 1]!;
    for (let i = N - 1; i >= 0; i -= 1) if (grid[i] === -Infinity) grid[i] = grid[i + 1]!;
    // Second difference of the arch grid: a true superellipse would be smooth.
    const d2 = grid.slice(1, N).map((v, i) => grid[i + 2]! - 2 * v + grid[i]!);
    let flips = 0;
    for (let i = 1; i < d2.length; i += 1) if (Math.sign(d2[i]!) !== Math.sign(d2[i - 1]!) && Math.abs(d2[i]!) > 1e-9) flips += 1;
    const ad = d2.map(Math.abs).sort((a, b) => a - b);
    log(`    arch grid 2nd difference: median ${f(ad[Math.floor(ad.length / 2)]!, 4)} mm  max ${f(ad[ad.length - 1]!, 3)} mm  SIGN FLIPS ${flips} of ${d2.length}`);
    log(`    grid z (every 4th cell): ${grid.filter((_, i) => i % 4 === 0).map((v) => f(v, 1)).join(' ')}`);
    // x spacing of the source curve, which is what leaves cells empty
    const xs = pts.map((p) => p.x);
    const dxs = xs.slice(1).map((x, i) => Math.abs(x - xs[i]!));
    log(`    source curve dx: min ${f(Math.min(...dxs), 2)} max ${f(Math.max(...dxs), 2)} (cell width ${f((x1 - x0) / N, 2)})`);

    // --- the step at the arch ends
    log(`\n--- sillZ ACROSS THE ARCH ENDS (rockerZ ${f(g.rockerZ, 1)}, opening lowerZ param ${st.now.features['opening-front']!.params.lowerZ})`);
    for (const edge of [x0, x1, 2204.9, 3064.9]) {
      const before = build.input.sillZ(edge - 3);
      const after = build.input.sillZ(edge + 3);
      log(`    x=${f(edge, 1).padStart(8)}: sill ${f(before, 2)} -> ${f(after, 2)} over 6 mm = ${f(Math.abs(after - before), 1)} mm step, face tilt ${f(Math.atan2(Math.abs(after - before), 6) * 180 / Math.PI, 1)} deg`);
    }
    log(`    sillZ sampled every 5mm from ${f(x0 - 30, 0)}: ${Array.from({ length: 16 }, (_, i) => f(build.input.sillZ(x0 - 30 + i * 5), 1)).join(' ')}`);
    // Which loft stations straddle the step?
    const near = stations.filter((s) => Math.abs(s - x0) < 40 || Math.abs(s - x1) < 40);
    log(`    stations within 40mm of the front arch ends: ${near.map((s) => f(s, 1)).join(' ')}`);

    // --- topZ residual at the stations: the table vs the exact spline
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
    log(`\n--- topZ authored points (after the <1mm merge): ${merged.map((p) => `(${f(p.x, 0)},${f(p.v, 0)})`).join(' ')}`);
    const curve = interpolate(merged.map((p) => v3(p.x, p.v, 0)));
    const exact = (x: number): number => {
      let lo = 0, hi = 1;
      for (let k = 0; k < 50; k += 1) { const m = (lo + hi) / 2; if (curve.at(m).x < x) lo = m; else hi = m; }
      return curve.at((lo + hi) / 2).y;
    };
    const a = merged[0]!.x, b = merged[merged.length - 1]!.x;
    const res = stations.filter((s) => s > a && s < b).map((s) => ({ x: s, e: build.input.topZ(s) - exact(s) }));
    let rf = 0;
    for (let i = 1; i < res.length; i += 1) if (Math.sign(res[i]!.e) !== Math.sign(res[i - 1]!.e)) rf += 1;
    const rms = Math.sqrt(res.reduce((s, r) => s + r.e * r.e, 0) / res.length);
    log(`--- topZ table residual AT THE STATIONS: rms ${f(rms, 3)} mm, max ${f(Math.max(...res.map((r) => Math.abs(r.e))), 3)} mm, SIGN FLIPS ${rf} of ${res.length} stations`);
    log(`    residual over the rear arch (x 2200..3070): ${res.filter((r) => r.x > 2200 && r.x < 3070).map((r) => f(r.e, 2)).join(' ')}`);
    log(`    residual over the front arch (x -430..430): ${res.filter((r) => r.x > -430 && r.x < 430).map((r) => f(r.e, 2)).join(' ')}`);

    // --- the greenhouse loft's own station list
    const backlightPts = pointsOf('backlight', drawing, result);
    const cabinEnd = backlightPts[backlightPts.length - 1]?.x ?? g.wheelbase;
    const cabin = { x0: g.cowl.x, x1: Math.max(g.cowl.x + 300, cabinEnd) };
    const gs: number[] = [];
    for (const d of [10, 40, 90, 160]) gs.push(cabin.x0 + d, cabin.x1 - d);
    for (const x of build.input.stations) if (x > cabin.x0 + 160 && x < cabin.x1 - 160) gs.push(x);
    const gBase = (x: number): number => build.input.beltZ(x) - 60;
    const gTop = (x: number): number => build.input.topZ(x);
    const live = dedupe(gs).filter((x) => gTop(x) > gBase(x) + 40);
    log(`\n--- GREENHOUSE: cabin ${f(cabin.x0, 1)} .. ${f(cabin.x1, 1)}; ${dedupe(gs).length} candidate stations, ${live.length} live`);
    log(`    live span ${f(live[0]!, 1)} .. ${f(live[live.length - 1]!, 1)}  (${f(cabin.x1 - live[live.length - 1]!, 1)} mm short of the cabin's aft end)`);
    log(`    dropped (glass thinner than 40mm): ${dedupe(gs).filter((x) => !(gTop(x) > gBase(x) + 40)).map((x) => f(x, 0)).join(' ')}`);
    log(`    glass height at the last live station x=${f(live[live.length - 1]!, 0)}: ${f(gTop(live[live.length - 1]!) - gBase(live[live.length - 1]!), 1)} mm -> the cap closes a ${f(gTop(live[live.length - 1]!) - gBase(live[live.length - 1]!), 0)}mm tall section in ${f(0, 0)}mm of x (no capDepth passed)`);
    const gaps = live.slice(1).map((x, i) => x - live[i]!);
    log(`    greenhouse station gaps: ${gaps.map((v) => f(v, 1)).join(' ')}`);
  }, 120000);
});
