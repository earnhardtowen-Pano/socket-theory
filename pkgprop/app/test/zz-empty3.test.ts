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
const angle = (a: any, b: any) =>
  (Math.acos(Math.max(-1, Math.min(1, dot(a, b) / Math.max(1e-12, len(a) * len(b))))) * 180) / Math.PI;
const med = (a: number[]) => (a.length ? [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)]! : NaN);

interface PanelGrid {
  id: string; label: string; group: string; n: number; r: number; c: number;
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
    out.push({ id: g.id, label: g.label, group: g.group, n, r: Number(r), c: Number(c),
      at: (i: number, j: number) => base + j * (n + 1) + i });
  }
  return out;
}
function buildFor(archId: string, seatId: string) {
  const st = initialState();
  const pkg = { ...st.now.pkg, architecture: archId, seating: seatId };
  const result = solve(buildSolveInput(pkg));
  return { result, body: buildCarBody(result, st.now.drawing, st.now.features) };
}
const faceN = (m: NetworkMesh, p: PanelGrid, i: number, j: number) => {
  const a = P(m, p.at(i, j));
  return crs(sub(P(m, p.at(i + 1, j)), a), sub(P(m, p.at(i + 1, j + 1)), a));
};
const ARCH_IDS = ARCHITECTURES.map((a) => a.id);
const SEAT_IDS = SEATING_CONFIGS.map((s) => s.id);

describe('MEASUREMENT 12 — is a "smooth" seam actually smooth?', () => {
  it('compares the angle across the seam with the surface curvature either side of it', () => {
    const { body } = buildFor('fr', '2');
    const m = body.network!.mesh;
    const grids = panelGrids(m);
    const cell = new Map<string, PanelGrid>();
    for (const p of grids) cell.set(`${p.r}-${p.c}`, p);
    const railKind = ['crown smooth', 'roof-rail CREASE', 'DLO CREASE', 'shoulder SMOOTH', 'sill CREASE'];

    console.log('  seam                                      across-seam   curvature step within panels   EXCESS');
    for (let r = 0; r < 4; r += 1) {
      const across: number[] = [];
      const within: number[] = [];
      for (let c = 0; c < 12; c += 1) {
        const up = cell.get(`${r}-${c}`);
        const dn = cell.get(`${r + 1}-${c}`);
        if (!up || !dn) continue;
        for (let i = 0; i < up.n; i += 1) {
          across.push(angle(faceN(m, up, i, up.n - 1), faceN(m, dn, i, 0)));
          within.push(angle(faceN(m, up, i, up.n - 2), faceN(m, up, i, up.n - 1)));
          within.push(angle(faceN(m, dn, i, 0), faceN(m, dn, i, 1)));
        }
      }
      const a = med(across);
      const w = med(within);
      console.log(
        `    rail ${r + 1} ${railKind[r + 1]!.padEnd(34)} ${a.toFixed(1).padStart(6)}deg      ${w.toFixed(1).padStart(6)}deg              ${(a - w).toFixed(1).padStart(6)}deg`,
      );
    }
    for (let r = 0; r <= 4; r += 1) {
      const across: number[] = [];
      const within: number[] = [];
      for (let c = 0; c < 11; c += 1) {
        const a = cell.get(`${r}-${c}`);
        const b = cell.get(`${r}-${c + 1}`);
        if (!a || !b) continue;
        for (let j = 0; j < a.n; j += 1) {
          across.push(angle(faceN(m, a, a.n - 1, j), faceN(m, b, 0, j)));
          within.push(angle(faceN(m, a, a.n - 2, j), faceN(m, a, a.n - 1, j)));
          within.push(angle(faceN(m, b, 0, j), faceN(m, b, 1, j)));
        }
      }
      const x = med(across);
      const w = med(within);
      console.log(
        `    band ${r} across all its transverse cuts`.padEnd(48) +
          `${x.toFixed(1).padStart(6)}deg      ${w.toFixed(1).padStart(6)}deg              ${(x - w).toFixed(1).padStart(6)}deg`,
      );
    }
  });
});

describe('MEASUREMENT 13 — census over the whole matrix', () => {
  it('sliver columns, lost pillars, floor rise, hole area', () => {
    console.log(
      '  arch/seat  | narrowest column | slivers<40mm | A B C pillar | floor rise | nose+tail hole | worst fold',
    );
    for (const arch of ARCH_IDS) {
      for (const seat of SEAT_IDS) {
        const { body } = buildFor(arch, seat);
        const m = body.network!.mesh;
        const grids = panelGrids(m);
        const cols = new Map<number, number>();
        for (const p of grids) {
          if (p.r !== 3) continue;
          cols.set(p.c, Math.abs(P(m, p.at(p.n, 0)).x - P(m, p.at(0, 0)).x));
        }
        const widths = [...cols.values()];
        const slivers = widths.filter((w) => w < 40).length;
        const pillarLabels = grids.filter((p) => p.group === 'pillar').map((p) => p.label);
        const has = (k: string) => (pillarLabels.some((l) => l.includes(k)) ? k : '-');
        const floor = grids.filter((p) => p.r === 4).flatMap((p) =>
          Array.from({ length: p.n + 1 }, (_, i) => P(m, p.at(i, p.n)).z),
        );
        // worst fold: largest dihedral anywhere across a transverse cut
        let fold = 0;
        const cell = new Map<string, PanelGrid>();
        for (const p of grids) cell.set(`${p.r}-${p.c}`, p);
        for (let r = 0; r <= 4; r += 1)
          for (let c = 0; c < 14; c += 1) {
            const a = cell.get(`${r}-${c}`);
            const b = cell.get(`${r}-${c + 1}`);
            if (!a || !b) continue;
            for (let j = 0; j < a.n; j += 1) fold = Math.max(fold, angle(faceN(m, a, a.n - 1, j), faceN(m, b, 0, j)));
          }
        console.log(
          `  ${(arch + '/' + seat).padEnd(10)} | ${Math.min(...widths).toFixed(0).padStart(15)}mm | ${String(slivers).padStart(12)} | ` +
            `${has('A-pillar')} ${has('B-pillar')} ${has('C-pillar')}`.padEnd(40) +
            `| ${(Math.max(...floor) - Math.min(...floor)).toFixed(0).padStart(9)}mm | ${''.padStart(4)} | ${fold.toFixed(0).padStart(9)}deg`,
        );
      }
    }
  });
});

describe('MEASUREMENT 14 — the sill and floor rails traced station by station', () => {
  it('prints the lower edge of the body along the car', () => {
    const { result, body } = buildFor('fr', '2');
    const m = body.network!.mesh;
    const grids = panelGrids(m).filter((p) => p.r === 4).sort((a, b) => a.c - b.c);
    const g = result.geometry;
    console.log(`  fr/2: front axle x=0, rear axle x=${g.wheelbase.toFixed(0)}, tire radius ${g.tireRadius.toFixed(0)}mm`);
    console.log('    x      sill z    floor z (centreline)');
    const rows: string[] = [];
    for (const p of grids) {
      for (let i = 0; i <= p.n; i += 1) {
        const s = P(m, p.at(i, 0));
        const f = P(m, p.at(i, p.n));
        rows.push(`   ${s.x.toFixed(0).padStart(6)}  ${s.z.toFixed(0).padStart(7)}  ${f.z.toFixed(0).padStart(9)}   (y_sill=${s.y.toFixed(0)})`);
      }
    }
    for (const r of rows) console.log(r);
  });
});
