import { describe, it } from 'vitest';
import { solve } from '@pkgprop/core';
import { buildSolveInput } from '@pkgprop/data';
import { initialState } from '../src/state/store.js';
import { buildCarBody } from '../src/model/body.js';
import { interpolate, v3, type Mesh } from '@pkgprop/geometry';
import {
  clampLinePoint,
  denorm,
  LINE_DEFS,
  lineFrameOf,
  linePoints,
  type DrawingState,
  type LineId,
} from '../src/state/lines.js';
import type { SolveResult } from '@pkgprop/core';

const log = (...a: unknown[]): void => console.log(...a);
const f = (n: number, d = 3): string => (Number.isFinite(n) ? n.toFixed(d) : String(n));

interface Tri {
  readonly a: number;
  readonly b: number;
  readonly c: number;
  readonly nx: number;
  readonly ny: number;
  readonly nz: number;
  readonly area: number;
  readonly cx: number;
  readonly cy: number;
  readonly cz: number;
  readonly aspect: number;
  readonly emin: number;
  readonly emax: number;
}

function trisOf(m: Mesh): Tri[] {
  const p = m.positions;
  const out: Tri[] = [];
  for (let t = 0; t < m.indices.length; t += 3) {
    const ia = m.indices[t]!;
    const ib = m.indices[t + 1]!;
    const ic = m.indices[t + 2]!;
    const ax = p[ia * 3]!, ay = p[ia * 3 + 1]!, az = p[ia * 3 + 2]!;
    const bx = p[ib * 3]!, by = p[ib * 3 + 1]!, bz = p[ib * 3 + 2]!;
    const cx = p[ic * 3]!, cy = p[ic * 3 + 1]!, cz = p[ic * 3 + 2]!;
    const ux = bx - ax, uy = by - ay, uz = bz - az;
    const vx = cx - ax, vy = cy - ay, vz = cz - az;
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;
    const twoA = Math.hypot(nx, ny, nz);
    const e0 = Math.hypot(ux, uy, uz);
    const e1 = Math.hypot(cx - bx, cy - by, cz - bz);
    const e2 = Math.hypot(vx, vy, vz);
    const emax = Math.max(e0, e1, e2);
    const emin = Math.min(e0, e1, e2);
    // Radius ratio aspect: longest edge * perimeter / (4*sqrt(3)*area) == 1 for
    // an equilateral triangle, grows without bound as a triangle degenerates.
    const per = e0 + e1 + e2;
    const aspect = twoA > 0 ? (emax * per) / (2 * Math.sqrt(3) * twoA) : Infinity;
    out.push({
      a: ia, b: ib, c: ic,
      nx, ny, nz,
      area: twoA / 2,
      cx: (ax + bx + cx) / 3, cy: (ay + by + cy) / 3, cz: (az + bz + cz) / 3,
      aspect, emin, emax,
    });
  }
  return out;
}

function weldMap(m: Mesh): number[] {
  const key = new Map<string, number>();
  const map: number[] = [];
  for (let i = 0; i < m.vertexCount; i += 1) {
    const k = `${m.positions[i * 3]!.toFixed(3)}|${m.positions[i * 3 + 1]!.toFixed(3)}|${m.positions[i * 3 + 2]!.toFixed(3)}`;
    const seen = key.get(k);
    if (seen === undefined) { key.set(k, i); map.push(i); } else map.push(seen);
  }
  return map;
}

function dihedral(m: Mesh, label: string): void {
  const tris = trisOf(m);
  const w = weldMap(m);
  const edges = new Map<string, number[]>();
  for (let t = 0; t < tris.length; t += 1) {
    const tr = tris[t]!;
    for (const [i, j] of [[tr.a, tr.b], [tr.b, tr.c], [tr.c, tr.a]] as const) {
      const a = w[i]!, b = w[j]!;
      if (a === b) continue;
      const k = a < b ? `${a}_${b}` : `${b}_${a}`;
      const list = edges.get(k);
      if (list) list.push(t); else edges.set(k, [t]);
    }
  }
  const bins = new Array<number>(19).fill(0); // 0-5,5-10,...,90+
  const sharp: { ang: number; x: number; y: number; z: number }[] = [];
  let boundary = 0;
  let nonManifold = 0;
  let pairs = 0;
  for (const [, list] of edges) {
    if (list.length === 1) { boundary += 1; continue; }
    if (list.length > 2) { nonManifold += 1; continue; }
    const A = tris[list[0]!]!;
    const B = tris[list[1]!]!;
    const la = Math.hypot(A.nx, A.ny, A.nz);
    const lb = Math.hypot(B.nx, B.ny, B.nz);
    if (la === 0 || lb === 0) continue;
    const c = (A.nx * B.nx + A.ny * B.ny + A.nz * B.nz) / (la * lb);
    const ang = (Math.acos(Math.min(1, Math.max(-1, c))) * 180) / Math.PI;
    pairs += 1;
    bins[Math.min(18, Math.floor(ang / 5))] = (bins[Math.min(18, Math.floor(ang / 5))] ?? 0) + 1;
    sharp.push({ ang, x: (A.cx + B.cx) / 2, y: (A.cy + B.cy) / 2, z: (A.cz + B.cz) / 2 });
  }
  sharp.sort((a, b) => b.ang - a.ang);
  const p = (q: number): number => sharp[Math.min(sharp.length - 1, Math.floor(sharp.length * q))]?.ang ?? 0;
  log(`\n--- DIHEDRAL ${label}: ${tris.length} tris, ${pairs} interior edges, ${boundary} boundary, ${nonManifold} non-manifold`);
  log(`    median ${f(p(0.5), 2)} deg  p90 ${f(p(0.1), 2)}  p99 ${f(p(0.01), 2)}  p99.9 ${f(p(0.001), 2)}  max ${f(sharp[0]?.ang ?? 0, 2)}`);
  const names = bins.map((n, i) => (n > 0 ? `${i * 5}-${i * 5 + 5}:${n}` : '')).filter(Boolean);
  log(`    hist ${names.join('  ')}`);
  log('    worst 18 (car coords x aft / y outboard / z up):');
  for (const s of sharp.slice(0, 18)) {
    log(`      ${f(s.ang, 1).padStart(6)} deg  x=${f(s.x, 0).padStart(6)} y=${f(s.y, 0).padStart(6)} z=${f(s.z, 0).padStart(6)}`);
  }
  // Where do the >20 deg ones live, binned by x?
  const hot = sharp.filter((s) => s.ang > 20);
  const byX = new Map<number, number>();
  for (const s of hot) {
    const b = Math.round(s.x / 200) * 200;
    byX.set(b, (byX.get(b) ?? 0) + 1);
  }
  log(`    ${hot.length} edges over 20 deg, by x bucket (200mm):`);
  log(`      ${[...byX.entries()].sort((a, b) => a[0] - b[0]).map(([x, n]) => `${x}:${n}`).join(' ')}`);
}

function slivers(m: Mesh, label: string): void {
  const tris = trisOf(m).filter((t) => Number.isFinite(t.aspect));
  const zero = trisOf(m).filter((t) => t.area < 1e-6).length;
  const byAspect = [...tris].sort((a, b) => b.aspect - a.aspect);
  const byArea = [...tris].sort((a, b) => a.area - b.area);
  const q = (arr: Tri[], k: number): Tri => arr[Math.min(arr.length - 1, Math.floor(arr.length * k))]!;
  log(`\n--- TRIANGLE QUALITY ${label}: n=${tris.length}, degenerate(area<1e-6)=${zero}`);
  log(`    aspect (1=equilateral): median ${f(q(byAspect, 0.5).aspect, 2)}  p90 ${f(q(byAspect, 0.1).aspect, 2)}  p99 ${f(q(byAspect, 0.01).aspect, 2)}  max ${f(byAspect[0]!.aspect, 2)}`);
  log(`    area mm^2: min ${f(byArea[0]!.area, 3)}  p1 ${f(q(byArea, 0.01).area, 1)}  median ${f(q(byArea, 0.5).area, 1)}  p99 ${f(q(byArea, 0.99).area, 1)}  max ${f(byArea[byArea.length - 1]!.area, 1)}`);
  log(`    area ratio p99/p1 = ${f(q(byArea, 0.99).area / Math.max(1e-9, q(byArea, 0.01).area), 1)}`);
  log('    worst 10 by aspect:');
  for (const t of byAspect.slice(0, 10)) {
    log(`      aspect ${f(t.aspect, 1).padStart(9)}  area ${f(t.area, 2).padStart(9)}  emin ${f(t.emin, 2).padStart(7)} emax ${f(t.emax, 1).padStart(7)}  x=${f(t.cx, 0).padStart(6)} y=${f(t.cy, 0).padStart(6)} z=${f(t.cz, 0).padStart(6)}`);
  }
}

/** Replicated from geometry/src/body.ts dedupe + MIN_STATION_GAP. */
const MIN_STATION_GAP = 4;
function dedupe(stations: readonly number[]): number[] {
  const sorted = [...stations].sort((a, b) => a - b);
  return sorted.filter((x, i) => i === 0 || x - sorted[i - 1]! > MIN_STATION_GAP);
}

function ribsOf(m: Mesh, nRibs: number): { ribs: number[][]; perRib: number } {
  // loft(): nRibs*perRib vertices, then two caps of (perRib ring + 1 hub).
  const perRib = (m.vertexCount - 2) / (nRibs + 2);
  if (!Number.isInteger(perRib)) throw new Error(`perRib not integer: ${perRib} (verts ${m.vertexCount}, ribs ${nRibs})`);
  const ribs: number[][] = [];
  for (let s = 0; s < nRibs; s += 1) {
    const r: number[] = [];
    for (let i = 0; i < perRib; i += 1) r.push(s * perRib + i);
    ribs.push(r);
  }
  return { ribs, perRib };
}

function arcDrift(m: Mesh, nRibs: number, stations: number[], label: string): void {
  const { ribs, perRib } = ribsOf(m, nRibs);
  const p = m.positions;
  const fracs: number[][] = ribs.map((r) => {
    const cum = [0];
    for (let i = 1; i <= r.length; i += 1) {
      const a = r[i - 1]!;
      const b = r[i % r.length]!;
      cum.push(cum[i - 1]! + Math.hypot(
        p[b * 3]! - p[a * 3]!,
        p[b * 3 + 1]! - p[a * 3 + 1]!,
        p[b * 3 + 2]! - p[a * 3 + 2]!,
      ));
    }
    const total = cum[cum.length - 1]!;
    return cum.slice(0, r.length).map((c) => c / total);
  });
  log(`\n--- RIB CORRESPONDENCE ${label}: ${nRibs} ribs x ${perRib} pts`);
  let worstPair = { drift: 0, i: 0, j: 0, xa: 0, xb: 0 };
  const perPair: { i: number; drift: number; dx: number }[] = [];
  for (let i = 0; i + 1 < fracs.length; i += 1) {
    let d = 0;
    let jw = 0;
    for (let j = 0; j < perRib; j += 1) {
      const dd = Math.abs(fracs[i]![j]! - fracs[i + 1]![j]!);
      if (dd > d) { d = dd; jw = j; }
    }
    perPair.push({ i, drift: d, dx: stations[i + 1]! - stations[i]! });
    if (d > worstPair.drift) worstPair = { drift: d, i, j: jw, xa: stations[i]!, xb: stations[i + 1]! };
  }
  const sortedDrift = [...perPair].sort((a, b) => b.drift - a.drift);
  log(`    max arc-length-fraction drift between adjacent ribs: ${f(worstPair.drift * 100, 2)}% of rib perimeter`);
  log(`      at ribs ${worstPair.i}->${worstPair.i + 1} (x ${f(worstPair.xa, 0)} -> ${f(worstPair.xb, 0)}), vertex index ${worstPair.j}`);
  log('    worst 8 station pairs:');
  for (const s of sortedDrift.slice(0, 8)) {
    log(`      ribs ${String(s.i).padStart(3)}->${String(s.i + 1).padStart(3)}  x ${f(stations[s.i]!, 0).padStart(6)} -> ${f(stations[s.i + 1]!, 0).padStart(6)} (dx ${f(s.dx, 1).padStart(6)})  drift ${f(s.drift * 100, 2)}%`);
  }
  // Convert the worst drift to millimetres of shear along the rib.
  const perim = (() => {
    let sum = 0;
    const r = ribs[worstPair.i]!;
    for (let i = 1; i <= r.length; i += 1) {
      const a = r[i - 1]!;
      const b = r[i % r.length]!;
      sum += Math.hypot(p[b * 3]! - p[a * 3]!, p[b * 3 + 1]! - p[a * 3 + 1]!, p[b * 3 + 2]! - p[a * 3 + 2]!);
    }
    return sum;
  })();
  log(`    worst rib perimeter ${f(perim, 0)} mm -> shear ${f(worstPair.drift * perim, 1)} mm across a station gap of ${f(worstPair.xb - worstPair.xa, 1)} mm`);

  // Longitudinal smoothness: for each vertex index j, how many sign changes in
  // the second difference of y and z along the car. A smooth rail has few.
  let flipsY = 0;
  let flipsZ = 0;
  let maxCurvJumpY = 0;
  let maxCurvJumpZ = 0;
  let where = { j: 0, i: 0 };
  for (let j = 0; j < perRib; j += 1) {
    let prevSy = 0;
    let prevSz = 0;
    for (let i = 1; i + 1 < nRibs; i += 1) {
      const g = (k: number, o: number): number => p[ribs[k]![j]! * 3 + o]!;
      const h0 = stations[i]! - stations[i - 1]!;
      const h1 = stations[i + 1]! - stations[i]!;
      // Second derivative on a non-uniform grid.
      const sy = 2 * ((g(i + 1, 1) - g(i, 1)) / h1 - (g(i, 1) - g(i - 1, 1)) / h0) / (h0 + h1);
      const sz = 2 * ((g(i + 1, 2) - g(i, 2)) / h1 - (g(i, 2) - g(i - 1, 2)) / h0) / (h0 + h1);
      if (i > 1 && Math.sign(sy) !== Math.sign(prevSy) && Math.abs(sy) > 1e-9) flipsY += 1;
      if (i > 1 && Math.sign(sz) !== Math.sign(prevSz) && Math.abs(sz) > 1e-9) flipsZ += 1;
      if (Math.abs(sy) > maxCurvJumpY) { maxCurvJumpY = Math.abs(sy); where = { j, i }; }
      if (Math.abs(sz) > maxCurvJumpZ) maxCurvJumpZ = Math.abs(sz);
      prevSy = sy;
      prevSz = sz;
    }
  }
  log(`    longitudinal curvature sign flips: y ${flipsY}, z ${flipsZ}  (over ${perRib} rails x ${nRibs - 2} interior stations = ${perRib * (nRibs - 2)} samples)`);
  log(`    max |d2y/dx2| ${f(maxCurvJumpY, 5)} /mm  at rail ${where.j} station ${where.i} (x=${f(stations[where.i] ?? 0, 0)}); max |d2z/dx2| ${f(maxCurvJumpZ, 5)}`);
}

function normalsCheck(m: Mesh, label: string): void {
  const tris = trisOf(m);
  const acc = new Float64Array(m.vertexCount * 3);
  for (const t of tris) {
    for (const i of [t.a, t.b, t.c]) {
      acc[i * 3] += t.nx;
      acc[i * 3 + 1] += t.ny;
      acc[i * 3 + 2] += t.nz;
    }
  }
  // Scale-free degeneracy measure: |sum n_f| / sum |n_f|. Near 0 means the
  // contributions cancelled and the direction is noise.
  const denom = new Float64Array(m.vertexCount);
  for (const t of tris) {
    const l = Math.hypot(t.nx, t.ny, t.nz);
    for (const i of [t.a, t.b, t.c]) denom[i] += l;
  }
  const ratios: { r: number; i: number; len: number }[] = [];
  for (let i = 0; i < m.vertexCount; i += 1) {
    const l = Math.hypot(acc[i * 3]!, acc[i * 3 + 1]!, acc[i * 3 + 2]!);
    const d = denom[i]!;
    ratios.push({ r: d > 0 ? l / d : 0, i, len: l });
  }
  ratios.sort((a, b) => a.r - b.r);
  log(`\n--- VERTEX NORMALS ${label}`);
  log(`    coherence |sum n|/sum|n|: min ${f(ratios[0]!.r, 4)}  p1 ${f(ratios[Math.floor(ratios.length * 0.01)]!.r, 4)}  median ${f(ratios[Math.floor(ratios.length * 0.5)]!.r, 4)}`);
  const bad = ratios.filter((x) => x.r < 0.9);
  log(`    ${bad.length} vertices with coherence < 0.90 (normal averaged across a real fold)`);
  for (const b of bad.slice(0, 10)) {
    log(`      v${b.i} coherence ${f(b.r, 4)} raw len ${f(b.len, 2)}  x=${f(m.positions[b.i * 3]!, 0)} y=${f(m.positions[b.i * 3 + 1]!, 0)} z=${f(m.positions[b.i * 3 + 2]!, 0)}`);
  }
  const zero = ratios.filter((x) => x.len < 1e-9);
  log(`    ${zero.length} vertices whose accumulated normal length is < 1e-9 (normalize() returns (0,0,0))`);
  for (const z of zero.slice(0, 8)) {
    log(`      v${z.i} x=${f(m.positions[z.i * 3]!, 0)} y=${f(m.positions[z.i * 3 + 1]!, 0)} z=${f(m.positions[z.i * 3 + 2]!, 0)} -> shipped normal (${f(m.normals[z.i * 3]!, 3)}, ${f(m.normals[z.i * 3 + 1]!, 3)}, ${f(m.normals[z.i * 3 + 2]!, 3)})`);
  }
  // Faceting: angle between each face normal and the average of its three
  // vertex normals. Big => the shading disagrees with the geometry there.
  let worst = 0;
  let wt: Tri | null = null;
  for (const t of tris) {
    const l = Math.hypot(t.nx, t.ny, t.nz);
    if (l === 0) continue;
    let ax = 0, ay = 0, az = 0;
    for (const i of [t.a, t.b, t.c]) {
      ax += m.normals[i * 3]!;
      ay += m.normals[i * 3 + 1]!;
      az += m.normals[i * 3 + 2]!;
    }
    const al = Math.hypot(ax, ay, az);
    if (al === 0) continue;
    const c = (t.nx * ax + t.ny * ay + t.nz * az) / (l * al);
    const ang = (Math.acos(Math.min(1, Math.max(-1, c))) * 180) / Math.PI;
    if (ang > worst) { worst = ang; wt = t; }
  }
  log(`    max face-normal vs interpolated-normal angle: ${f(worst, 2)} deg at x=${f(wt?.cx ?? 0, 0)} y=${f(wt?.cy ?? 0, 0)} z=${f(wt?.cz ?? 0, 0)}`);
}

function pointsOf(id: LineId, drawing: DrawingState, result: SolveResult): { x: number; z: number }[] {
  const def = LINE_DEFS.find((d) => d.id === id)!;
  const frame = lineFrameOf(id, result);
  return linePoints(id, drawing, result).map((pt) => {
    const { x, z } = denorm(frame, pt);
    const c = clampLinePoint(def, result, x, z);
    return { x: c.x, z: c.z };
  });
}

/** Verbatim copy of app/src/model/body.ts tableOf, so the probe measures it. */
function tableOf(pairs: readonly { x: number; v: number }[]): {
  fn: (x: number) => number;
  grid: number[];
  first: { x: number; v: number };
  last: { x: number; v: number };
  samples: { x: number; y: number }[];
  pts: { x: number; v: number }[];
} {
  const sorted = [...pairs].sort((a, b) => a.x - b.x);
  const pts: { x: number; v: number }[] = [];
  for (const p of sorted) {
    const prev = pts[pts.length - 1];
    if (prev && Math.abs(p.x - prev.x) < 1) pts[pts.length - 1] = { x: prev.x, v: (prev.v + p.v) / 2 };
    else pts.push(p);
  }
  const first = pts[0]!;
  const last = pts[pts.length - 1]!;
  const curve = interpolate(pts.map((p) => v3(p.x, p.v, 0)));
  const GRID = 240;
  const grid: number[] = [];
  const samples = curve.sample(GRID * 2).map((s) => ({ x: s.x, y: s.y }));
  for (let i = 0; i <= GRID; i += 1) {
    const x = first.x + ((last.x - first.x) * i) / GRID;
    let best = samples[0]!;
    for (const s of samples) if (Math.abs(s.x - x) < Math.abs(best.x - x)) best = s;
    grid.push(best.y);
  }
  const fn = (x: number): number => {
    if (x <= first.x) return grid[0]!;
    if (x >= last.x) return grid[GRID]!;
    const t = ((x - first.x) / (last.x - first.x)) * GRID;
    const i = Math.min(GRID - 1, Math.floor(t));
    return grid[i]! + (grid[i + 1]! - grid[i]!) * (t - i);
  };
  return { fn, grid, first, last, samples, pts };
}

function tableProbe(name: string, pairs: { x: number; v: number }[]): void {
  const T = tableOf(pairs);
  const GRID = 240;
  const step = (T.last.x - T.first.x) / GRID;
  log(`\n--- TABLE ${name}: ${T.pts.length} authored pts, span ${f(T.first.x, 0)}..${f(T.last.x, 0)} mm, grid step ${f(step, 2)} mm`);

  // Is the spline's own x monotonic? A fold makes the nearest-x search pick
  // samples from the wrong branch.
  let back = 0;
  let worstBack = 0;
  for (let i = 1; i < T.samples.length; i += 1) {
    const d = T.samples[i]!.x - T.samples[i - 1]!.x;
    if (d < 0) { back += 1; worstBack = Math.min(worstBack, d); }
  }
  const dxs = T.samples.slice(1).map((s, i) => s.x - T.samples[i]!.x);
  log(`    spline sample dx: min ${f(Math.min(...dxs), 3)}  max ${f(Math.max(...dxs), 3)}  ratio ${f(Math.max(...dxs) / Math.max(1e-9, Math.min(...dxs)), 1)}  (${back} reversals, worst ${f(worstBack, 3)})`);

  // Nearest-x quantisation error: what x did the chosen sample actually have?
  let maxDx = 0;
  const err: number[] = [];
  for (let i = 0; i <= GRID; i += 1) {
    const x = T.first.x + ((T.last.x - T.first.x) * i) / GRID;
    let best = T.samples[0]!;
    for (const s of T.samples) if (Math.abs(s.x - x) < Math.abs(best.x - x)) best = s;
    maxDx = Math.max(maxDx, Math.abs(best.x - x));
    err.push(best.x - x);
  }
  log(`    nearest-x lookup: max |x_sample - x_grid| = ${f(maxDx, 2)} mm`);

  // Second difference of the shipped grid, in mm per (grid step)^2.
  const d2: number[] = [];
  for (let i = 1; i < GRID; i += 1) d2.push(T.grid[i + 1]! - 2 * T.grid[i]! + T.grid[i - 1]!);
  const flips = d2.slice(1).filter((v, i) => Math.sign(v) !== Math.sign(d2[i]!) && Math.abs(v) > 1e-9).length;
  const absd2 = d2.map(Math.abs).sort((a, b) => a - b);
  log(`    grid 2nd difference: median ${f(absd2[Math.floor(absd2.length / 2)]!, 5)} mm  p99 ${f(absd2[Math.floor(absd2.length * 0.99)]!, 5)}  max ${f(absd2[absd2.length - 1]!, 5)}`);
  log(`    2nd-difference SIGN FLIPS along the grid: ${flips} of ${d2.length} (a monotone-curvature rail would have ~${T.pts.length})`);

  // Compare the shipped grid against the same spline evaluated properly, by
  // inverting x(u) with a bisection instead of nearest-sample.
  const curve = interpolate(T.pts.map((p) => v3(p.x, p.v, 0)));
  const trueAt = (x: number): number => {
    let lo = 0, hi = 1;
    for (let k = 0; k < 60; k += 1) {
      const mid = (lo + hi) / 2;
      if (curve.at(mid).x < x) lo = mid; else hi = mid;
    }
    return curve.at((lo + hi) / 2).y;
  };
  let maxErr = 0;
  let maxErrX = 0;
  const errs: number[] = [];
  for (let i = 0; i <= GRID; i += 1) {
    const x = T.first.x + ((T.last.x - T.first.x) * i) / GRID;
    const e = T.grid[i]! - trueAt(x);
    errs.push(e);
    if (Math.abs(e) > Math.abs(maxErr)) { maxErr = e; maxErrX = x; }
  }
  const errFlips = errs.slice(1).filter((v, i) => Math.sign(v) !== Math.sign(errs[i]!) && Math.abs(v) > 1e-6).length;
  const rms = Math.sqrt(errs.reduce((s, e) => s + e * e, 0) / errs.length);
  log(`    grid vs exact spline: rms ${f(rms, 4)} mm, max ${f(maxErr, 4)} mm at x=${f(maxErrX, 0)}, error sign flips ${errFlips} (a sawtooth, not a bias)`);
  // Print a strip of the error so its period is visible.
  log(`    error samples i=80..119: ${errs.slice(80, 120).map((e) => f(e, 2)).join(' ')}`);
}

describe('ruffle probe', () => {
  it('measures', () => {
    const result = solve(buildSolveInput(initialState().now.pkg));
    const st = initialState();
    const build = buildCarBody(result, st.now.drawing, st.now.features);
    const g = result.geometry;
    log(`\n=== PACKAGE: wheelbase ${f(g.wheelbase, 0)} bumperX ${f(g.bumperX, 0)} tailX ${f(g.tailX, 0)} track ${f(g.track, 0)} overallWidth ${f(g.overallWidth, 0)}`);
    log(`=== ribPoints ${build.input.ribPoints}, raw stations ${build.input.stations.length}`);

    const stations = dedupe(build.input.stations);
    const gaps = stations.slice(1).map((x, i) => x - stations[i]!);
    const sortedGaps = [...gaps].sort((a, b) => a - b);
    log(`=== deduped stations ${stations.length}: gap min ${f(sortedGaps[0]!, 2)}  median ${f(sortedGaps[Math.floor(gaps.length / 2)]!, 2)}  max ${f(sortedGaps[gaps.length - 1]!, 2)}  ratio ${f(sortedGaps[gaps.length - 1]! / sortedGaps[0]!, 1)}`);
    log(`=== gap sequence: ${gaps.map((v) => f(v, 1)).join(' ')}`);
    // How abruptly does the spacing change from one band to the next?
    let worstJump = { r: 1, i: 0 };
    for (let i = 1; i < gaps.length; i += 1) {
      const r = Math.max(gaps[i]! / gaps[i - 1]!, gaps[i - 1]! / gaps[i]!);
      if (r > worstJump.r) worstJump = { r, i };
    }
    log(`=== worst adjacent gap ratio ${f(worstJump.r, 2)} at x=${f(stations[worstJump.i]!, 0)} (${f(gaps[worstJump.i - 1]!, 1)} mm band then ${f(gaps[worstJump.i]!, 1)} mm band)`);

    const body = build.car.body;
    const gh = build.car.greenhouse;
    log(`=== body mesh ${body.vertexCount} verts / ${body.triangleCount} tris; greenhouse ${gh ? `${gh.vertexCount}/${gh.triangleCount}` : 'none'}`);

    dihedral(body, 'BODY');
    slivers(body, 'BODY');
    arcDrift(body, stations.length, stations, 'BODY');
    normalsCheck(body, 'BODY');

    if (gh) {
      dihedral(gh, 'GREENHOUSE');
      slivers(gh, 'GREENHOUSE');
      normalsCheck(gh, 'GREENHOUSE');
    }

    // Rail tables, straight from the same sources buildCarBody uses.
    const drawing = st.now.drawing;
    const topPairs: { x: number; v: number }[] = [];
    for (const id of ['hood', 'glass', 'roof', 'backlight', 'deck'] as LineId[]) {
      for (const p of pointsOf(id, drawing, result)) topPairs.push({ x: p.x, v: p.z });
    }
    tableProbe('topZ (hood+glass+roof+backlight+deck)', topPairs);
    tableProbe('halfWidth (plan_side)', pointsOf('plan_side', drawing, result).map((p) => ({ x: p.x, v: Math.abs(p.z) })));
    tableProbe('beltZ', pointsOf('belt', drawing, result).map((p) => ({ x: p.x, v: p.z })));
    tableProbe('rockerZ', pointsOf('rocker', drawing, result).map((p) => ({ x: p.x, v: p.z })));

    // The composed rails as the loft actually sees them.
    log('\n--- COMPOSED RAILS as sampled by the loft (2nd difference over 5mm)');
    for (const [name, fn] of [
      ['topZ', build.input.topZ],
      ['beltZ', build.input.beltZ],
      ['halfWidth', build.input.halfWidth],
      ['sillZ', build.input.sillZ],
    ] as const) {
      const h = 5;
      const d2: number[] = [];
      const xs: number[] = [];
      for (let x = g.bumperX + h; x <= g.tailX - h; x += h) {
        d2.push((fn(x + h) - 2 * fn(x) + fn(x - h)) / (h * h));
        xs.push(x);
      }
      const flips = d2.slice(1).filter((v, i) => Math.sign(v) !== Math.sign(d2[i]!) && Math.abs(v) > 1e-12).length;
      const abs = d2.map(Math.abs).sort((a, b) => a - b);
      let wi = 0;
      d2.forEach((v, i) => { if (Math.abs(v) > Math.abs(d2[wi]!)) wi = i; });
      log(`    ${name.padEnd(10)} curvature sign flips ${String(flips).padStart(4)} / ${d2.length} samples;  |d2| median ${f(abs[Math.floor(abs.length / 2)]!, 7)}  max ${f(abs[abs.length - 1]!, 6)} at x=${f(xs[wi]!, 0)}`);
    }
  }, 120000);
});
