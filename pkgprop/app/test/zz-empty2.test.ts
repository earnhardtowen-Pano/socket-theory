import { describe, it } from 'vitest';
import { solve } from '@pkgprop/core';
import { ARCHITECTURES, SEATING_CONFIGS, buildSolveInput } from '@pkgprop/data';
import { buildCarBody } from '../src/model/body.js';
import { initialState } from '../src/state/store.js';
import type { NetworkMesh } from '@pkgprop/geometry';

const P = (m: NetworkMesh, i: number) => ({
  x: m.positions[i * 3]!,
  y: m.positions[i * 3 + 1]!,
  z: m.positions[i * 3 + 2]!,
});
const sub = (a: any, b: any) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const crs = (a: any, b: any) => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});
const dot = (a: any, b: any) => a.x * b.x + a.y * b.y + a.z * b.z;
const len = (a: any) => Math.hypot(a.x, a.y, a.z);

interface PanelGrid {
  id: string;
  label: string;
  group: string;
  n: number;
  r: number;
  c: number;
  at(i: number, j: number): number;
}
function panelGrids(m: NetworkMesh): PanelGrid[] {
  const out: PanelGrid[] = [];
  const seen = new Set<string>();
  for (const g of m.groups) {
    if (seen.has(g.id)) continue;
    seen.add(g.id);
    const n = Math.round(Math.sqrt(g.count / 3 / 2));
    const base = m.indices[g.start]!;
    const [, r, c] = g.id.split('-');
    out.push({
      id: g.id,
      label: g.label,
      group: g.group,
      n,
      r: Number(r),
      c: Number(c),
      at: (i: number, j: number) => base + j * (n + 1) + i,
    });
  }
  return out;
}

function buildFor(archId: string, seatId: string) {
  const st = initialState();
  const pkg = { ...st.now.pkg, architecture: archId, seating: seatId };
  const result = solve(buildSolveInput(pkg));
  return { result, body: buildCarBody(result, st.now.drawing, st.now.features) };
}

const ARCH_IDS = ARCHITECTURES.map((a) => a.id);
const SEAT_IDS = SEATING_CONFIGS.map((s) => s.id);

/** Face normal of the quad at (i, j) of a panel. */
function faceN(m: NetworkMesh, p: PanelGrid, i: number, j: number) {
  const a = P(m, p.at(i, j));
  const b = P(m, p.at(i + 1, j));
  const c = P(m, p.at(i + 1, j + 1));
  return crs(sub(b, a), sub(c, a));
}
const angle = (a: any, b: any) =>
  (Math.acos(Math.max(-1, Math.min(1, dot(a, b) / Math.max(1e-12, len(a) * len(b))))) * 180) / Math.PI;

describe('MEASUREMENT 6 — the two ends are uncapped', () => {
  it('measures the area you can see straight through', () => {
    for (const arch of ARCH_IDS) {
      const { result, body } = buildFor(arch, '2');
      const m = body.network!.mesh;
      const grids = panelGrids(m);
      const cols = grids.map((p) => p.c);
      const firstC = Math.min(...cols);
      const lastC = Math.max(...cols);
      for (const [end, c] of [
        ['nose', firstC],
        ['tail', lastC],
      ] as [string, number][]) {
        // The end cut's section: walk the rail bands in order, i = 0 (nose) or
        // i = n (tail), j = 0..n. That polyline plus its mirror is the opening.
        const i = end === 'nose' ? 0 : grids[0]!.n;
        const pts: { y: number; z: number }[] = [];
        for (let r = 0; r <= 4; r += 1) {
          const p = grids.find((q) => q.r === r && q.c === c);
          if (!p) continue;
          for (let j = 0; j <= p.n; j += 1) {
            const v = P(m, p.at(i, j));
            if (pts.length === 0 || Math.hypot(v.y - pts[pts.length - 1]!.y, v.z - pts[pts.length - 1]!.z) > 1e-6)
              pts.push({ y: v.y, z: v.z });
          }
        }
        // Mirror to close the loop, then shoelace.
        const loop = [...pts, ...[...pts].reverse().map((q) => ({ y: -q.y, z: q.z }))];
        let area = 0;
        for (let k = 0; k < loop.length; k += 1) {
          const a = loop[k]!;
          const b = loop[(k + 1) % loop.length]!;
          area += a.y * b.z - b.y * a.z;
        }
        area = Math.abs(area) / 2;
        const z0 = Math.min(...pts.map((q) => q.z));
        const z1 = Math.max(...pts.map((q) => q.z));
        const w = Math.max(...pts.map((q) => q.y)) * 2;
        console.log(
          `  ${arch.padEnd(3)} ${end.padEnd(4)} opening at x=${(end === 'nose' ? result.geometry.bumperX : result.geometry.tailX).toFixed(0).padStart(6)}: ` +
            `${(area / 1e6).toFixed(3)} m2  (${w.toFixed(0)}mm wide x ${(z1 - z0).toFixed(0)}mm tall, z ${z0.toFixed(0)}..${z1.toFixed(0)})`,
        );
      }
    }
  });
});

describe('MEASUREMENT 7 — the underfloor and sill over the wheel arches', () => {
  it('traces the centreline floor rail and the sill along the car', () => {
    for (const arch of ARCH_IDS) {
      const { result, body } = buildFor(arch, '2');
      const m = body.network!.mesh;
      const grids = panelGrids(m).filter((p) => p.r === 4).sort((a, b) => a.c - b.c);
      const floor: { x: number; z: number }[] = [];
      const sill: { x: number; z: number }[] = [];
      for (const p of grids) {
        for (let i = 0; i <= p.n; i += 1) {
          const f = P(m, p.at(i, p.n));
          const s = P(m, p.at(i, 0));
          floor.push({ x: f.x, z: f.z });
          sill.push({ x: s.x, z: s.z });
        }
      }
      floor.sort((a, b) => a.x - b.x);
      const zs = floor.map((q) => q.z);
      const lo = Math.min(...zs);
      const hi = Math.max(...zs);
      const hiAt = floor.find((q) => q.z === hi)!.x;
      const g = result.geometry;
      console.log(
        `  ${arch.padEnd(3)} underfloor at the centreline: z ${lo.toFixed(0)}..${hi.toFixed(0)}mm ` +
          `(rise ${(hi - lo).toFixed(0)}mm, peak at x=${hiAt.toFixed(0)}; front axle x=0, rear axle x=${g.wheelbase.toFixed(0)}; tire radius ${g.tireRadius.toFixed(0)})`,
      );
      const near = (x: number) => {
        let best = floor[0]!;
        for (const q of floor) if (Math.abs(q.x - x) < Math.abs(best.x - x)) best = q;
        return best.z;
      };
      console.log(
        `        floor z: nose ${near(g.bumperX).toFixed(0)} | front axle ${near(0).toFixed(0)} | mid ${near(g.wheelbase / 2).toFixed(0)} | rear axle ${near(g.wheelbase).toFixed(0)} | tail ${near(g.tailX).toFixed(0)}`,
      );
      // Biggest step between adjacent samples: a cliff in the floor.
      let step = 0;
      let stepAt = 0;
      for (let k = 1; k < floor.length; k += 1) {
        const d = Math.abs(floor[k]!.z - floor[k - 1]!.z);
        const dx = Math.abs(floor[k]!.x - floor[k - 1]!.x);
        if (dx > 0.5 && d > step) {
          step = d;
          stepAt = floor[k]!.x;
        }
      }
      console.log(`        steepest floor step between adjacent samples: ${step.toFixed(0)}mm at x=${stepAt.toFixed(0)}`);
    }
  });
});

describe('MEASUREMENT 8 — the cut list, column by column', () => {
  it('prints where each parting line lands, and whether the pillars survived', () => {
    for (const arch of ARCH_IDS) {
      for (const seat of ['2', '2+2', '5']) {
        const { body } = buildFor(arch, seat);
        const m = body.network!.mesh;
        const grids = panelGrids(m);
        const cols = [...new Set(grids.map((p) => p.c))].sort((a, b) => a - b);
        const rows: string[] = [];
        for (const c of cols) {
          const p = grids.find((q) => q.c === c && q.r === 3) ?? grids.find((q) => q.c === c)!;
          const x0 = P(m, p.at(0, 0)).x;
          const x1 = P(m, p.at(p.n, 0)).x;
          const glassPanel = grids.find((q) => q.c === c && q.r === 1);
          rows.push(
            `${String(c).padStart(2)}:${x0.toFixed(0)}..${x1.toFixed(0)}[${glassPanel?.group ?? '-'}]`,
          );
        }
        const pillars = grids.filter((p) => p.group === 'pillar').map((p) => p.label);
        console.log(`  ${arch}/${seat}  ${rows.join(' ')}`);
        console.log(`        pillars found: ${pillars.length ? pillars.join(', ') : 'NONE'}`);
      }
    }
  });
});

describe('MEASUREMENT 9 — where the flipped triangles are', () => {
  it('locates them and measures how much area they cover', () => {
    for (const arch of ARCH_IDS) {
      const { body } = buildFor(arch, '2');
      const m = body.network!.mesh;
      const grids = panelGrids(m);
      const N = (i: number) => ({ x: m.normals[i * 3]!, y: m.normals[i * 3 + 1]!, z: m.normals[i * 3 + 2]! });
      let total = 0;
      let flippedArea = 0;
      const hits: string[] = [];
      for (const p of grids) {
        for (let j = 0; j < p.n; j += 1) {
          for (let i = 0; i < p.n; i += 1) {
            for (const tri of [
              [p.at(i, j), p.at(i + 1, j), p.at(i + 1, j + 1)],
              [p.at(i, j), p.at(i + 1, j + 1), p.at(i, j + 1)],
            ]) {
              const [a, b, c] = tri as [number, number, number];
              const fn = crs(sub(P(m, b), P(m, a)), sub(P(m, c), P(m, a)));
              const area = len(fn) / 2;
              total += area;
              const vn = [a, b, c].map(N).reduce((s, q) => ({ x: s.x + q.x, y: s.y + q.y, z: s.z + q.z }));
              if (dot(fn, vn) < 0) {
                flippedArea += area;
                const q = P(m, a);
                hits.push(
                  `${p.id}(${p.group}) i=${i} j=${j} at x=${q.x.toFixed(0)} y=${q.y.toFixed(0)} z=${q.z.toFixed(0)} area=${area.toFixed(1)}mm2`,
                );
              }
            }
          }
        }
      }
      console.log(
        `  ${arch}: flipped area ${flippedArea.toFixed(0)}mm2 of ${(total / 1e6).toFixed(2)}m2 half-body ` +
          `(${((flippedArea / total) * 100).toFixed(4)}%), ${hits.length} triangles`,
      );
      for (const h of hits.slice(0, 6)) console.log(`     ${h}`);
    }
  });
});

describe('MEASUREMENT 10 — how hard the surface breaks at every seam', () => {
  it('measures the dihedral across each rail and each cut', () => {
    const { body } = buildFor('fr', '2');
    const m = body.network!.mesh;
    const grids = panelGrids(m);
    const cell = new Map<string, PanelGrid>();
    for (const p of grids) cell.set(`${p.r}-${p.c}`, p);
    const railName = ['crown(smooth)', 'roof-rail(CREASE)', 'DLO(CREASE)', 'shoulder(smooth)', 'sill(CREASE)'];

    console.log('  ACROSS RAILS (the seam runs along the car):');
    for (let r = 0; r < 4; r += 1) {
      const angs: number[] = [];
      for (let c = 0; c < 12; c += 1) {
        const up = cell.get(`${r}-${c}`);
        const dn = cell.get(`${r + 1}-${c}`);
        if (!up || !dn) continue;
        for (let i = 0; i < up.n; i += 1) angs.push(angle(faceN(m, up, i, up.n - 1), faceN(m, dn, i, 0)));
      }
      if (!angs.length) continue;
      angs.sort((a, b) => a - b);
      console.log(
        `    rail ${r + 1} ${railName[r + 1]!.padEnd(18)} between band ${r} and ${r + 1}: ` +
          `median ${angs[Math.floor(angs.length / 2)]!.toFixed(1)}deg  max ${angs[angs.length - 1]!.toFixed(1)}deg`,
      );
    }

    console.log('  ACROSS CUTS (the seam runs across the car):');
    for (let r = 0; r <= 4; r += 1) {
      for (let c = 0; c < 11; c += 1) {
        const a = cell.get(`${r}-${c}`);
        const b = cell.get(`${r}-${c + 1}`);
        if (!a || !b) continue;
        const angs: number[] = [];
        for (let j = 0; j < a.n; j += 1) angs.push(angle(faceN(m, a, a.n - 1, j), faceN(m, b, 0, j)));
        angs.sort((x, y) => x - y);
        const max = angs[angs.length - 1]!;
        if (max > 8)
          console.log(
            `    band ${r} cut ${c}|${c + 1} (${a.group} -> ${b.group}): median ${angs[Math.floor(angs.length / 2)]!.toFixed(1)}deg  MAX ${max.toFixed(1)}deg   [${a.label}]`,
          );
      }
    }
  });
});

describe('MEASUREMENT 11 — architecture switching, side by side', () => {
  it('reports the numbers that change when the architecture changes', () => {
    for (const arch of ARCH_IDS) {
      for (const seat of SEAT_IDS) {
        const { result, body } = buildFor(arch, seat);
        const g = result.geometry;
        const m = body.network!.mesh;
        const grids = panelGrids(m);
        const glassCols = grids.filter((p) => p.r === 1 && (p.group === 'glass' || p.group === 'pillar'));
        const xs = glassCols.flatMap((p) => [P(m, p.at(0, 0)).x, P(m, p.at(p.n, 0)).x]);
        const cabin = xs.length ? `${Math.min(...xs).toFixed(0)}..${Math.max(...xs).toFixed(0)}` : 'NONE';
        console.log(
          `  ${(arch + '/' + seat).padEnd(11)} L=${(g.tailX - g.bumperX).toFixed(0)} wb=${g.wheelbase.toFixed(0)} ` +
            `cowl=${g.cowl.x.toFixed(0)} greenhouse ${cabin.padEnd(12)} ` +
            `glass+pillar panels=${glassCols.length} roof=${grids.filter((p) => p.group === 'roof').length}`,
        );
      }
    }
  });
});
