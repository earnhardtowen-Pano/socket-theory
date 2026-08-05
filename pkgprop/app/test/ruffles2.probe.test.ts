import { describe, it } from 'vitest';
import { solve, type SolveResult } from '@pkgprop/core';
import { buildSolveInput } from '@pkgprop/data';
import { initialState } from '../src/state/store.js';
import { buildCarBody } from '../src/model/body.js';
import { generateFeature } from '../src/model/features.js';
import { halfSection, interpolate, v3 } from '@pkgprop/geometry';
import {
  clampLinePoint,
  denorm,
  LINE_DEFS,
  lineFrameOf,
  linePoints,
  type DrawingState,
  type LineId,
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

const MIN_STATION_GAP = 4;
const dedupe = (s: readonly number[]): number[] => {
  const sorted = [...s].sort((a, b) => a - b);
  return sorted.filter((x, i) => i === 0 || x - sorted[i - 1]! > MIN_STATION_GAP);
};

describe('ruffle probe 2', () => {
  it('measures the rail as the loft samples it', () => {
    const result = solve(buildSolveInput(initialState().now.pkg));
    const st = initialState();
    const drawing = st.now.drawing;
    const build = buildCarBody(result, drawing, st.now.features);
    const stations = dedupe(build.input.stations);
    const g = result.geometry;

    // Where are the wheel openings, exactly?
    for (const id of ['opening-front', 'opening-rear']) {
      const pts = generateFeature(st.now.features[id]!, result).curve;
      let x0 = Infinity, x1 = -Infinity, zmax = -Infinity;
      for (const p of pts) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); zmax = Math.max(zmax, p.z); }
      log(`=== ${id}: x ${f(x0, 1)} .. ${f(x1, 1)}, crown z ${f(zmax, 1)}, ${pts.length} curve pts, arch grid step ${f((x1 - x0) / 96, 2)} mm`);
    }
    log(`=== rockerZ ${f(g.rockerZ, 1)}  beltZ ${f(g.beltZ, 1)}  roofZ ${f(g.roofZ, 1)}  cowl ${f(g.cowl.x, 1)},${f(g.cowl.z, 1)}`);

    // 1. The shipped rail is piecewise linear between 241 grid nodes.
    //    Measure the slope on each side of every node.
    const topPairs: { x: number; v: number }[] = [];
    for (const id of ['hood', 'glass', 'roof', 'backlight', 'deck'] as LineId[]) {
      for (const p of pointsOf(id, drawing, result)) topPairs.push({ x: p.x, v: p.z });
    }
    const spanFor = (pairs: { x: number; v: number }[]): { a: number; b: number } => {
      const xs = pairs.map((p) => p.x).sort((m, n) => m - n);
      return { a: xs[0]!, b: xs[xs.length - 1]! };
    };

    for (const [name, pairs, fn] of [
      ['topZ', topPairs, build.input.topZ],
      ['halfWidth', pointsOf('plan_side', drawing, result).map((p) => ({ x: p.x, v: Math.abs(p.z) })), build.input.halfWidth],
    ] as const) {
      const { a, b } = spanFor([...pairs]);
      const GRID = 240;
      const h = (b - a) / GRID;
      // Slope of each linear segment of the shipped table.
      const seg: number[] = [];
      for (let i = 0; i < GRID; i += 1) {
        const x0 = a + h * i + h * 0.25;
        const x1 = a + h * i + h * 0.75;
        seg.push((fn(x1) - fn(x0)) / (x1 - x0));
      }
      const kinks = seg.slice(1).map((s, i) => Math.abs(Math.atan(s) - Math.atan(seg[i]!)) * 180 / Math.PI);
      const sortedK = [...kinks].sort((m, n) => n - m);
      const flips = seg.slice(1).filter((s, i) => Math.sign(s - seg[i]!) !== Math.sign((seg[i + 2] ?? s) - s)).length;
      log(`\n--- RAIL ${name}: piecewise linear, ${GRID} segments of ${f(h, 2)} mm`);
      log(`    slope kink at nodes (deg): median ${f(sortedK[Math.floor(kinks.length / 2)]!, 3)}  p90 ${f(sortedK[Math.floor(kinks.length * 0.1)]!, 3)}  p99 ${f(sortedK[Math.floor(kinks.length * 0.01)]!, 3)}  max ${f(sortedK[0]!, 3)}`);
      log(`    slope-increment sign flips: ${flips} of ${GRID - 1} nodes (a fair curve flips only where curvature really reverses)`);
      const worstIdx = kinks.indexOf(sortedK[0]!);
      log(`    worst kink at x=${f(a + h * (worstIdx + 1), 0)}`);

      // 2. What the loft actually gets: the rail resampled at the station list.
      const zs = stations.map((x) => fn(x));
      const slopes = zs.slice(1).map((z, i) => (z - zs[i]!) / (stations[i + 1]! - stations[i]!));
      const dslope = slopes.slice(1).map((s, i) => (s - slopes[i]!) * 180 / Math.PI);
      const sortedD = [...dslope.map(Math.abs)].sort((m, n) => n - m);
      let sf = 0;
      for (let i = 1; i < dslope.length; i += 1) if (Math.sign(dslope[i]!) !== Math.sign(dslope[i - 1]!)) sf += 1;
      log(`    AT THE STATIONS: station-to-station slope change (deg): median ${f(sortedD[Math.floor(sortedD.length / 2)]!, 3)}  p90 ${f(sortedD[Math.floor(sortedD.length * 0.1)]!, 3)}  max ${f(sortedD[0]!, 3)}`);
      log(`    AT THE STATIONS: slope-change sign flips ${sf} of ${dslope.length} bands  <- every flip is one ruffle`);
      // Same thing on a rail with no table: the exact spline.
      const pts: { x: number; v: number }[] = [];
      for (const p of [...pairs].sort((m, n) => m.x - n.x)) {
        const prev = pts[pts.length - 1];
        if (prev && Math.abs(p.x - prev.x) < 1) pts[pts.length - 1] = { x: prev.x, v: (prev.v + p.v) / 2 };
        else pts.push(p);
      }
      const curve = interpolate(pts.map((p) => v3(p.x, p.v, 0)));
      const exact = (x: number): number => {
        let lo = 0, hi = 1;
        for (let k = 0; k < 50; k += 1) { const m = (lo + hi) / 2; if (curve.at(m).x < x) lo = m; else hi = m; }
        return curve.at((lo + hi) / 2).y;
      };
      const ez = stations.map((x) => exact(Math.min(Math.max(x, a), b)));
      const eslope = ez.slice(1).map((z, i) => (z - ez[i]!) / (stations[i + 1]! - stations[i]!));
      const ed = eslope.slice(1).map((s, i) => (s - eslope[i]!) * 180 / Math.PI);
      let esf = 0;
      for (let i = 1; i < ed.length; i += 1) if (Math.sign(ed[i]!) !== Math.sign(ed[i - 1]!)) esf += 1;
      const esort = [...ed.map(Math.abs)].sort((m, n) => n - m);
      log(`    SAME STATIONS, EXACT SPLINE (no table): slope change median ${f(esort[Math.floor(esort.length / 2)]!, 4)} deg  max ${f(esort[0]!, 3)}  sign flips ${esf}`);
    }

    // 3. sillZ: the arch table, 96 linear cells per opening, then softMax.
    {
      const fn = build.input.sillZ;
      const rows: { x: number; s: number }[] = [];
      for (let x = -600; x <= 3200; x += 2) rows.push({ x, s: fn(x) });
      const slopes = rows.slice(1).map((r, i) => (r.s - rows[i]!.s) / 2);
      const kinks = slopes.slice(1).map((s, i) => Math.abs(Math.atan(s) - Math.atan(slopes[i]!)) * 180 / Math.PI);
      const sk = [...kinks].sort((m, n) => n - m);
      log(`\n--- RAIL sillZ (arch table, 96 cells per opening + softMax blend)`);
      log(`    slope kink over 2mm steps (deg): median ${f(sk[Math.floor(kinks.length / 2)]!, 4)}  p99 ${f(sk[Math.floor(kinks.length * 0.01)]!, 3)}  max ${f(sk[0]!, 2)}`);
      const worst = kinks.map((k, i) => ({ k, x: rows[i + 1]!.x })).sort((m, n) => n.k - m.k).slice(0, 8);
      log(`    worst kinks at x = ${worst.map((w) => `${w.x}(${f(w.k, 1)}deg)`).join(' ')}`);
      // Sampled at the stations, which is what the loft sees.
      const zs = stations.map((x) => fn(x));
      const ss = zs.slice(1).map((z, i) => (z - zs[i]!) / (stations[i + 1]! - stations[i]!));
      const ds = ss.slice(1).map((s, i) => (Math.atan(s) - Math.atan(ss[i]!)) * 180 / Math.PI);
      let sf = 0;
      for (let i = 1; i < ds.length; i += 1) if (Math.sign(ds[i]!) !== Math.sign(ds[i - 1]!)) sf += 1;
      const dsorted = [...ds.map(Math.abs)].sort((m, n) => n - m);
      log(`    AT THE STATIONS: slope change median ${f(dsorted[Math.floor(ds.length / 2)]!, 3)} deg  max ${f(dsorted[0]!, 2)}  sign flips ${sf} of ${ds.length}`);
    }

    // 4. halfSection: the per-station peak rescale k, and how the uniform-u
    //    sampling redistributes along the flank arc.
    {
      const shape = { crown: 0.42, shoulder: 0.64, tumblehome: 0.3, glassInset: 0.5 };
      const ks: { x: number; k: number }[] = [];
      const fracs: { x: number; fr: number[] }[] = [];
      const N = 32;
      for (const x of stations) {
        const zt = Math.max(build.input.sillZ(x) + 60, build.input.topZ(x));
        const zb = build.input.sillZ(x);
        const hw = Math.max(20, build.input.halfWidth(x));
        const raw = interpolate([
          v3(0, 0, zt),
          v3(0, hw * (0.18 + 0.42 * (1 - shape.crown)), zt - Math.max(1, zt - zb) * (0.02 + 0.12 * shape.crown)),
          v3(0, hw, zb + Math.max(1, zt - zb) * shape.shoulder),
          v3(0, hw * (1 - 0.66 * shape.tumblehome), zb),
        ]);
        let peak = 0;
        for (let i = 0; i <= 64; i += 1) peak = Math.max(peak, raw.at(i / 64).y);
        ks.push({ x, k: peak > hw ? hw / peak : 1 });
        const s = halfSection(zt, zb, hw, shape).sample(N - 1);
        const cum = [0];
        for (let i = 1; i < s.length; i += 1) {
          cum.push(cum[i - 1]! + Math.hypot(s[i]!.y - s[i - 1]!.y, s[i]!.z - s[i - 1]!.z));
        }
        const tot = cum[cum.length - 1]!;
        fracs.push({ x, fr: cum.map((c) => c / tot) });
      }
      const kk = ks.map((e) => e.k);
      const kd = kk.slice(1).map((k, i) => k - kk[i]!);
      let kflips = 0;
      for (let i = 1; i < kd.length; i += 1) if (Math.sign(kd[i]!) !== Math.sign(kd[i - 1]!) && Math.abs(kd[i]!) > 1e-9) kflips += 1;
      log(`\n--- halfSection peak rescale k(x): min ${f(Math.min(...kk), 5)} max ${f(Math.max(...kk), 5)}  station-to-station sign flips ${kflips} of ${kd.length}`);
      log(`    max |dk| between adjacent stations ${f(Math.max(...kd.map(Math.abs)), 6)} -> half-width wobble ${f(Math.max(...kd.map(Math.abs)) * Math.max(...stations.map((x) => build.input.halfWidth(x))), 3)} mm`);

      // Flank-only correspondence drift: arc fraction of index j, rib to rib.
      let worst = { d: 0, i: 0, j: 0 };
      const drifts: number[] = [];
      for (let i = 0; i + 1 < fracs.length; i += 1) {
        let d = 0, jw = 0;
        for (let j = 0; j < N; j += 1) {
          const dd = Math.abs(fracs[i]!.fr[j]! - fracs[i + 1]!.fr[j]!);
          if (dd > d) { d = dd; jw = j; }
        }
        drifts.push(d);
        if (d > worst.d) worst = { d, i, j: jw };
      }
      const sd = [...drifts].sort((m, n) => n - m);
      log(`    FLANK-ONLY arc drift between adjacent ribs: median ${f(sd[Math.floor(sd.length / 2)]! * 100, 3)}%  p90 ${f(sd[Math.floor(sd.length * 0.1)]! * 100, 3)}%  max ${f(sd[0]! * 100, 2)}% at x=${f(stations[worst.i]!, 0)}->${f(stations[worst.i + 1]!, 0)} index ${worst.j}`);
      // End to end: does index j mean the same place on the section at the
      // cowl as it does at the rear axle?
      const at = (x: number): number[] => fracs.reduce((a, b) => (Math.abs(b.x - x) < Math.abs(a.x - x) ? b : a)).fr;
      const A = at(g.cowl.x);
      const B = at(g.wheelbase);
      let e2e = 0, e2ej = 0;
      for (let j = 0; j < N; j += 1) if (Math.abs(A[j]! - B[j]!) > e2e) { e2e = Math.abs(A[j]! - B[j]!); e2ej = j; }
      log(`    cowl (x=${f(g.cowl.x, 0)}) vs rear axle (x=${f(g.wheelbase, 0)}): index ${e2ej} sits ${f(e2e * 100, 2)}% of the section apart`);
      const arcAt = (x: number): number => {
        const zt = Math.max(build.input.sillZ(x) + 60, build.input.topZ(x));
        const zb = build.input.sillZ(x);
        const s = halfSection(zt, zb, Math.max(20, build.input.halfWidth(x)), shape).sample(N - 1);
        let t = 0;
        for (let i = 1; i < s.length; i += 1) t += Math.hypot(s[i]!.y - s[i - 1]!.y, s[i]!.z - s[i - 1]!.z);
        return t;
      };
      log(`    -> ${f(e2e * arcAt(g.wheelbase), 0)} mm of longitudinal shear in the isoparm between those two stations`);
    }

    // 5. The cap. Where do the 150 deg dihedrals come from?
    {
      const CAP_DEPTH = 95;
      const x0 = g.bumperX + CAP_DEPTH;
      log(`\n--- CAPS: first station x=${f(x0, 1)}, ring pushed to x=${f(x0 - CAP_DEPTH * 0.52, 1)}, hub at x=${f(x0 - CAP_DEPTH, 1)}`);
      log(`    ring shrink CAP_SHRINK=0.55 about the rib centroid. Half-width at first station ${f(build.input.halfWidth(x0), 1)} mm`);
      const dy = build.input.halfWidth(x0) * (1 - 0.55);
      log(`    outer point moves inboard ${f(dy, 1)} mm while moving forward ${f(CAP_DEPTH * 0.52, 1)} mm`);
      log(`    -> that band's face is tilted ${f(Math.atan2(dy, CAP_DEPTH * 0.52) * 180 / Math.PI, 1)} deg from the loft band's face`);
    }
  }, 120000);
});
