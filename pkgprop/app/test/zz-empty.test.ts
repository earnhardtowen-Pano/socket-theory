import { describe, expect, it } from 'vitest';
import { solve } from '@pkgprop/core';
import { ARCHITECTURES, SEATING_CONFIGS, buildSolveInput } from '@pkgprop/data';
import { buildCarBody } from '../src/model/body.js';
import { initialState } from '../src/state/store.js';
import type { NetworkMesh } from '@pkgprop/geometry';

/* ------------------------------------------------------------------ */
/* mesh helpers                                                        */
/* ------------------------------------------------------------------ */

const K = 100; // the network's own weld scale: 1/100 mm
const key = (m: NetworkMesh, i: number): string =>
  `${Math.round(m.positions[i * 3]! * K)},${Math.round(m.positions[i * 3 + 1]! * K)},${Math.round(m.positions[i * 3 + 2]! * K)}`;
const P = (m: NetworkMesh, i: number) => ({
  x: m.positions[i * 3]!,
  y: m.positions[i * 3 + 1]!,
  z: m.positions[i * 3 + 2]!,
});
const N = (m: NetworkMesh, i: number) => ({
  x: m.normals[i * 3]!,
  y: m.normals[i * 3 + 1]!,
  z: m.normals[i * 3 + 2]!,
});
const sub = (a: any, b: any) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const crs = (a: any, b: any) => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});
const dot = (a: any, b: any) => a.x * b.x + a.y * b.y + a.z * b.z;
const len = (a: any) => Math.hypot(a.x, a.y, a.z);
const dist = (a: any, b: any) => len(sub(a, b));

/** triangle index -> panel id, from the group ranges. */
function triPanel(m: NetworkMesh): string[] {
  const out: string[] = new Array(m.triangleCount).fill('?');
  for (const g of m.groups) {
    for (let t = g.start / 3; t < (g.start + g.count) / 3; t += 1) out[t] = g.id;
  }
  return out;
}

/**
 * Recover each panel's (i, j) sample grid. buildNetwork lays a panel's
 * (n+1)^2 vertices down contiguously starting at the index of its first
 * triangle's first corner, so the grid is exactly recoverable.
 */
interface PanelGrid {
  id: string;
  label: string;
  group: string;
  n: number;
  base: number;
  /** index of the vertex at grid position (i, j). */
  at(i: number, j: number): number;
}
function panelGrids(m: NetworkMesh, half = true): PanelGrid[] {
  const out: PanelGrid[] = [];
  const seen = new Set<string>();
  for (const g of m.groups) {
    if (half && seen.has(g.id)) continue; // the mirror repeats every group id
    seen.add(g.id);
    const tris = g.count / 3;
    const n = Math.round(Math.sqrt(tris / 2));
    const base = m.indices[g.start]!;
    out.push({
      id: g.id,
      label: g.label,
      group: g.group,
      n,
      base,
      at: (i: number, j: number) => base + j * (n + 1) + i,
    });
  }
  return out;
}

interface OpenEdge {
  a: number;
  b: number;
  panels: string[];
}

function edgeAudit(m: NetworkMesh) {
  const tp = triPanel(m);
  const counts = new Map<string, { n: number; a: number; b: number; panels: Set<string> }>();
  for (let t = 0; t < m.indices.length; t += 3) {
    const v = [m.indices[t]!, m.indices[t + 1]!, m.indices[t + 2]!];
    const panel = tp[t / 3]!;
    for (const [p, q] of [
      [v[0]!, v[1]!],
      [v[1]!, v[2]!],
      [v[2]!, v[0]!],
    ] as [number, number][]) {
      const ka = key(m, p);
      const kb = key(m, q);
      if (ka === kb) continue; // degenerate sliver: zero-length edge
      const k = ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
      const e = counts.get(k);
      if (e) {
        e.n += 1;
        e.panels.add(panel);
      } else counts.set(k, { n: 1, a: p, b: q, panels: new Set([panel]) });
    }
  }
  const open: OpenEdge[] = [];
  let nonManifold = 0;
  for (const e of counts.values()) {
    if (e.n === 1) open.push({ a: e.a, b: e.b, panels: [...e.panels] });
    else if (e.n > 2) nonManifold += 1;
  }
  return { open, nonManifold, edgeCount: counts.size };
}

/** Group open edges into connected rings by shared welded position. */
function clusters(m: NetworkMesh, open: OpenEdge[]) {
  const parent = new Map<string, string>();
  const find = (k: string): string => {
    let r = k;
    while (parent.get(r) !== r) r = parent.get(r) ?? r;
    return r;
  };
  const add = (k: string) => {
    if (!parent.has(k)) parent.set(k, k);
  };
  for (const e of open) {
    const ka = key(m, e.a);
    const kb = key(m, e.b);
    add(ka);
    add(kb);
    const ra = find(ka);
    const rb = find(kb);
    if (ra !== rb) parent.set(ra, rb);
  }
  const buckets = new Map<string, OpenEdge[]>();
  for (const e of open) {
    const r = find(key(m, e.a));
    const b = buckets.get(r);
    if (b) b.push(e);
    else buckets.set(r, [e]);
  }
  return [...buckets.values()].map((edges) => {
    let length = 0;
    const bb = { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity, z0: Infinity, z1: -Infinity };
    const panels = new Set<string>();
    for (const e of edges) {
      const a = P(m, e.a);
      const b = P(m, e.b);
      length += dist(a, b);
      for (const p of [a, b]) {
        bb.x0 = Math.min(bb.x0, p.x);
        bb.x1 = Math.max(bb.x1, p.x);
        bb.y0 = Math.min(bb.y0, p.y);
        bb.y1 = Math.max(bb.y1, p.y);
        bb.z0 = Math.min(bb.z0, p.z);
        bb.z1 = Math.max(bb.z1, p.z);
      }
      for (const q of e.panels) panels.add(q);
    }
    return { edges: edges.length, length, bb, panels: [...panels] };
  });
}

/** Vertices that sit within `eps` of another panel's vertex but did NOT weld. */
function nearMissWelds(m: NetworkMesh, eps = 1.0) {
  const cell = new Map<string, number[]>();
  const grid = (p: any) => `${Math.floor(p.x / eps)},${Math.floor(p.y / eps)},${Math.floor(p.z / eps)}`;
  const n = m.vertexCount;
  for (let i = 0; i < n; i += 1) {
    const g = grid(P(m, i));
    const b = cell.get(g);
    if (b) b.push(i);
    else cell.set(g, [i]);
  }
  let pairs = 0;
  let worst = 0;
  for (const b of cell.values()) {
    for (let a = 0; a < b.length; a += 1) {
      for (let c = a + 1; c < b.length; c += 1) {
        const ia = b[a]!;
        const ic = b[c]!;
        if (key(m, ia) === key(m, ic)) continue;
        const d = dist(P(m, ia), P(m, ic));
        if (d > 0 && d < eps) {
          pairs += 1;
          worst = Math.max(worst, d);
        }
      }
    }
  }
  return { pairs, worst };
}

/** Per-panel: is the winding-derived normal fighting the stored vertex normal? */
function insideOut(m: NetworkMesh) {
  const tp = triPanel(m);
  const acc = new Map<string, { dotSum: number; tris: number; bad: number }>();
  for (let t = 0; t < m.indices.length; t += 3) {
    const ia = m.indices[t]!;
    const ib = m.indices[t + 1]!;
    const ic = m.indices[t + 2]!;
    const fn = crs(sub(P(m, ib), P(m, ia)), sub(P(m, ic), P(m, ia)));
    const l = len(fn);
    if (l < 1e-9) continue;
    const f = { x: fn.x / l, y: fn.y / l, z: fn.z / l };
    const vn = { x: 0, y: 0, z: 0 };
    for (const i of [ia, ib, ic]) {
      const q = N(m, i);
      vn.x += q.x;
      vn.y += q.y;
      vn.z += q.z;
    }
    const d = dot(f, vn) / Math.max(1e-9, len(vn));
    const id = tp[t / 3]!;
    const a = acc.get(id) ?? { dotSum: 0, tris: 0, bad: 0 };
    a.dotSum += d;
    a.tris += 1;
    if (d < 0) a.bad += 1;
    acc.set(id, a);
  }
  return acc;
}

/* ------------------------------------------------------------------ */
/* the build                                                           */
/* ------------------------------------------------------------------ */

function buildFor(archId: string, seatId: string) {
  const st = initialState();
  const pkg = { ...st.now.pkg, architecture: archId, seating: seatId };
  const result = solve(buildSolveInput(pkg));
  const body = buildCarBody(result, st.now.drawing, st.now.features);
  return { result, body };
}

const ARCH_IDS = ARCHITECTURES.map((a) => a.id);
const SEAT_IDS = SEATING_CONFIGS.map((s) => s.id);

describe('MEASUREMENT 1 — open edges', () => {
  it('locates every hole in the default car', () => {
    const { result, body } = buildFor('fr', '2');
    const m = body.network!.mesh;
    const g = result.geometry;
    console.log(
      `fr/2  bumperX=${g.bumperX.toFixed(0)} tailX=${g.tailX.toFixed(0)} wb=${g.wheelbase.toFixed(0)} ` +
        `panels=${body.network!.panelCount} tris=${m.triangleCount} verts=${m.vertexCount}`,
    );
    const a = edgeAudit(m);
    console.log(`  unique edges ${a.edgeCount}, OPEN ${a.open.length}, non-manifold ${a.nonManifold}`);
    const cl = clusters(m, a.open).sort((p, q) => q.length - p.length);
    console.log(`  ${cl.length} open-edge cluster(s):`);
    for (const c of cl) {
      console.log(
        `   [${c.edges} edges, perimeter ${c.length.toFixed(0)}mm] ` +
          `x ${c.bb.x0.toFixed(0)}..${c.bb.x1.toFixed(0)}  y ${c.bb.y0.toFixed(0)}..${c.bb.y1.toFixed(0)}  z ${c.bb.z0.toFixed(0)}..${c.bb.z1.toFixed(0)}` +
          `  panels: ${c.panels.slice(0, 6).join(',')}${c.panels.length > 6 ? ` +${c.panels.length - 6}` : ''}`,
      );
    }
    const nm = nearMissWelds(m);
    console.log(`  vertices closer than 1mm but NOT welded: ${nm.pairs} pairs, worst ${nm.worst.toFixed(3)}mm`);
    expect(m.triangleCount).toBeGreaterThan(0);
  });
});

describe('MEASUREMENT 2 — the greenhouse gap', () => {
  it('measures body-top to glass-bottom, and the kink across every rail', () => {
    const { body } = buildFor('fr', '2');
    const m = body.network!.mesh;
    const grids = panelGrids(m);

    // Panel ids are p-<rail>-<cut>. Rail 1 = roof-rail..DLO (glass / pillar),
    // rail 2 = DLO..shoulder (the belt rail band), rail 3 = shoulder..sill.
    const byCell = new Map<string, PanelGrid>();
    for (const p of grids) byCell.set(p.id, p);

    const cols = [...new Set(grids.map((p) => Number(p.id.split('-')[2])))].sort((a, b) => a - b);
    console.log('  station | glass base -> belt top gap | DLO inset | belt band | dihedral at DLO');
    let worstGap = 0;
    for (const c of cols) {
      const glass = byCell.get(`p-1-${c}`);
      const belt = byCell.get(`p-2-${c}`);
      if (!glass || !belt) continue;
      if (glass.group !== 'glass' && glass.group !== 'pillar') continue;
      const n = glass.n;
      let gap = 0;
      let inset = 0;
      let band = 0;
      let ang = 0;
      let x = 0;
      for (let i = 0; i <= n; i += 1) {
        const lo = P(m, glass.at(i, n)); // glass bottom row = the DLO rail
        const hi = P(m, belt.at(i, 0)); // belt-rail panel top row = the DLO rail
        gap = Math.max(gap, dist(lo, hi));
        const sh = P(m, belt.at(i, belt.n)); // shoulder
        inset = Math.max(inset, sh.y - lo.y);
        band = Math.max(band, dist(lo, sh));
        x = lo.x;
        const seg = sub(sh, lo);
        ang = Math.max(ang, (Math.atan2(Math.abs(seg.z), Math.abs(seg.y)) * 180) / Math.PI);
      }
      // dihedral across the DLO crease: face normal above vs face normal below
      const fa = (() => {
        const a = P(m, glass.at(0, n - 1));
        const b = P(m, glass.at(1, n - 1));
        const c2 = P(m, glass.at(1, n));
        return crs(sub(b, a), sub(c2, a));
      })();
      const fb = (() => {
        const a = P(m, belt.at(0, 0));
        const b = P(m, belt.at(1, 0));
        const c2 = P(m, belt.at(1, 1));
        return crs(sub(b, a), sub(c2, a));
      })();
      const kink = (Math.acos(Math.max(-1, Math.min(1, dot(fa, fb) / (len(fa) * len(fb))))) * 180) / Math.PI;
      worstGap = Math.max(worstGap, gap);
      console.log(
        `  x=${x.toFixed(0).padStart(6)} | gap ${gap.toFixed(4).padStart(8)}mm | inset ${inset.toFixed(1).padStart(6)}mm | ` +
          `band ${band.toFixed(0).padStart(5)}mm at ${ang.toFixed(0).padStart(3)}deg from horizontal | kink ${kink.toFixed(1).padStart(6)}deg  (${glass.group}/${belt.group})`,
      );
    }
    console.log(`  worst body-top to glass-bottom gap anywhere: ${worstGap.toFixed(5)}mm`);
  });
});

describe('MEASUREMENT 3 — panel coverage', () => {
  it('lists (rail, cut) cells that produce no panel', () => {
    for (const arch of ARCH_IDS) {
      const { body } = buildFor(arch, '2');
      const m = body.network!.mesh;
      const grids = panelGrids(m);
      const have = new Set(grids.map((p) => p.id));
      let maxR = 0;
      let maxC = 0;
      for (const p of grids) {
        maxR = Math.max(maxR, Number(p.id.split('-')[1]));
        maxC = Math.max(maxC, Number(p.id.split('-')[2]));
      }
      // Column x-extent, from whichever panel in that column exists.
      const colX = new Map<number, { x0: number; x1: number; label: string }>();
      for (const p of grids) {
        const c = Number(p.id.split('-')[2]);
        const x0 = P(m, p.at(0, 0)).x;
        const x1 = P(m, p.at(p.n, 0)).x;
        colX.set(c, { x0: Math.min(x0, x1), x1: Math.max(x0, x1), label: p.label });
      }
      const missing: string[] = [];
      for (let r = 0; r <= maxR; r += 1) {
        for (let c = 0; c <= maxC; c += 1) {
          if (!have.has(`p-${r}-${c}`)) missing.push(`p-${r}-${c}`);
        }
      }
      const emptyCols: number[] = [];
      for (let c = 0; c <= maxC; c += 1) if (!colX.has(c)) emptyCols.push(c);
      const groups = new Map<string, number>();
      for (const p of grids) groups.set(p.group, (groups.get(p.group) ?? 0) + 1);
      console.log(
        `  ${arch.padEnd(4)} rails 0..${maxR} x cuts 0..${maxC + 1}: ${grids.length} panels, ` +
          `${missing.length} empty cells, whole columns missing: [${emptyCols.join(',')}]`,
      );
      console.log(
        `        groups: ${[...groups.entries()].map(([k, v]) => `${k}=${v}`).sort().join('  ')}`,
      );
      if (missing.length) console.log(`        empty cells: ${missing.join(' ')}`);
      for (const c of emptyCols) {
        const before = colX.get(c - 1);
        const after = colX.get(c + 1);
        console.log(
          `        column ${c} dropped: sits between x=${before?.x1.toFixed(1) ?? '?'} and x=${after?.x0.toFixed(1) ?? '?'}` +
            ` (span ${after && before ? (after.x0 - before.x1).toFixed(2) : '?'}mm)`,
        );
      }
    }
  });
});

describe('MEASUREMENT 4 — every architecture, every seat count', () => {
  it('sweeps the matrix', () => {
    console.log(
      '  arch/seats | panels | tris  | open | rings | pillars | glass | groups missing            | worst hole perimeter',
    );
    for (const arch of ARCH_IDS) {
      for (const seat of SEAT_IDS) {
        let line = `  ${arch}/${seat}`.padEnd(14);
        try {
          const { body } = buildFor(arch, seat);
          if (!body.network) {
            console.log(`${line}| NETWORK IS NULL — buildCarNetwork threw, BODY falls back to the loft`);
            continue;
          }
          const m = body.network.mesh;
          const a = edgeAudit(m);
          const cl = clusters(m, a.open).sort((p, q) => q.length - p.length);
          const grids = panelGrids(m);
          const groups = new Set(grids.map((p) => p.group));
          const pillars = grids.filter((p) => p.group === 'pillar').length;
          const glass = grids.filter((p) => p.group === 'glass').length;
          const want = ['hood', 'roof', 'glass', 'pillar', 'door', 'belt rail', 'underfloor', 'decklid'];
          const missing = want.filter((w) => !groups.has(w));
          line +=
            `| ${String(body.network.panelCount).padStart(6)} | ${String(m.triangleCount).padStart(5)} | ` +
            `${String(a.open.length).padStart(4)} | ${String(cl.length).padStart(5)} | ${String(pillars).padStart(7)} | ` +
            `${String(glass).padStart(5)} | ${missing.join(',').padEnd(25)} | ${(cl[0]?.length ?? 0).toFixed(0)}mm`;
          console.log(line);
        } catch (e) {
          console.log(`${line}| THREW: ${(e as Error).message}`);
        }
      }
    }
  });
});

describe('MEASUREMENT 5 — inside-out panels', () => {
  it('compares winding normal to stored vertex normal', () => {
    for (const arch of ARCH_IDS) {
      const { body } = buildFor(arch, '2');
      const m = body.network!.mesh;
      const acc = insideOut(m);
      const bad = [...acc.entries()].filter(([, v]) => v.bad > 0).sort((a, b) => b[1].bad - a[1].bad);
      const labels = new Map(m.groups.map((g) => [g.id, `${g.group} · ${g.label}`]));
      console.log(`  ${arch}: ${bad.length} of ${acc.size} panels have triangles whose face normal opposes the shaded normal`);
      for (const [id, v] of bad.slice(0, 10)) {
        console.log(
          `    ${id.padEnd(8)} ${v.bad}/${v.tris} tris flipped, mean dot ${(v.dotSum / v.tris).toFixed(3)}  ${labels.get(id) ?? ''}`,
        );
      }
    }
  });
});
