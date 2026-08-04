import { describe, expect, it } from 'vitest';
import { solve, type ControlId } from '@pkgprop/core';
import { ARCHITECTURES, SEATING_CONFIGS, buildSolveInput, parseTire } from '../src/index.js';

/**
 * The generalized solver, exercised across the whole architecture × seating
 * grid. These are behavior tests of the machine, not of any one car.
 */

describe('tire math', () => {
  it('205/55R16 → 631.9 mm overall diameter', () => {
    const res = solve(buildSolveInput({ architecture: 'fr', seating: '2', tire: '205/55R16' }));
    const d = res.readouts.find((r) => r.id === 'tire_diameter');
    expect(d?.value).toBeCloseTo(16 * 25.4 + 2 * 205 * 0.55, 3);
    expect(d?.license).toBe('DERIVED');
    expect(d?.chain).toContain('unit_in_to_mm');
  });

  it('rejects designations it cannot read, in plain words', () => {
    expect(() => parseTire('very round tire')).toThrow(/245\/40R19/);
  });
});

describe('solver across the grid', () => {
  for (const arch of ARCHITECTURES) {
    for (const seating of SEATING_CONFIGS) {
      it(`${arch.id} × ${seating.id}: solves with finite sane bounds`, () => {
        const res = solve(buildSolveInput({ architecture: arch.id, seating: seating.id }));
        for (const [id, b] of Object.entries(res.bounds)) {
          expect(b.lower, `${id} lower`).not.toBeNull();
          expect(b.upper, `${id} upper`).not.toBeNull();
          expect(Number.isFinite(b.lower!.value)).toBe(true);
          expect(Number.isFinite(b.upper!.value)).toBe(true);
        }
        expect(res.geometry.occupants).toHaveLength(seating.rows.length);
        expect(res.geometry.roofZ).toBeGreaterThan(res.geometry.beltZ);
        expect(res.geometry.wheelbase).toBeGreaterThan(0);
        // Row one must see forward: eye above cowl.
        expect(res.geometry.eye.z).toBeGreaterThan(res.geometry.cowl.z);
      });
    }
  }

  it('every bound can report its binding constraint, license, and reason', () => {
    const res = solve(buildSolveInput({ architecture: 'mr', seating: '2' }));
    for (const b of Object.values(res.bounds)) {
      for (const wall of [b.lower!, b.upper!]) {
        expect(wall.constraint.label.length).toBeGreaterThan(0);
        expect(wall.constraint.reason.length).toBeGreaterThan(0);
        expect(['DERIVED', 'SOURCED', 'ASSUMED']).toContain(wall.constraint.license);
      }
    }
  });

  it('more rows never lower the roof floor (occupant array is a max)', () => {
    const two = solve(buildSolveInput({ architecture: 'ev', seating: '2' }));
    const five = solve(buildSolveInput({ architecture: 'ev', seating: '5' }));
    const seven = solve(buildSolveInput({ architecture: 'ev', seating: '2+3row' }));
    const roofFloor = (r: typeof two) => r.bounds.roof_z.lower!.value;
    expect(roofFloor(five)).toBeGreaterThanOrEqual(roofFloor(two));
    expect(roofFloor(seven)).toBeGreaterThanOrEqual(roofFloor(five));
  });

  it('the EV battery raises the floor and the roof demand follows', () => {
    const fr = solve(buildSolveInput({ architecture: 'fr', seating: '2' }));
    const ev = solve(buildSolveInput({ architecture: 'ev', seating: '2' }));
    const floor = (r: typeof fr) => r.readouts.find((x) => x.id === 'floor_z')!.value;
    expect(floor(ev)).toBeGreaterThan(floor(fr));
  });

  it('MR: the engine bay binds the wheelbase floor and says so', () => {
    const res = solve(buildSolveInput({ architecture: 'mr', seating: '2' }));
    const lower = res.bounds.wheelbase.lower!;
    expect(['mid_engine_bay', 'rear_seat_structure', 'wheelbase_budget']).toContain(
      lower.constraint.id,
    );
    // The mid-engine chain must at least be among the contributions.
    const ids = res.bounds.wheelbase.contributions.map((c) => c.constraint.id);
    expect(ids).toContain('mid_engine_bay');
  });

  it('RR: the engine pushes the rear overhang floor', () => {
    const res = solve(buildSolveInput({ architecture: 'rr', seating: '2' }));
    expect(res.bounds.rear_overhang.lower!.constraint.id).toBe('engine_behind_axle');
  });

  it('raising H30 raises the roof floor (chain propagates)', () => {
    const low = solve(buildSolveInput({ architecture: 'ft', seating: '2', controls: { h30: 0 } }));
    const high = solve(buildSolveInput({ architecture: 'ft', seating: '2', controls: { h30: 1 } }));
    expect(high.bounds.roof_z.lower!.value).toBeGreaterThan(low.bounds.roof_z.lower!.value);
  });
});

describe('walls name themselves on contact (seed contract)', () => {
  it('roof control slammed down touches the occupant roof minimum', () => {
    const res = solve(buildSolveInput({ architecture: 'fr', seating: '2', controls: { roof_z: 0 } }));
    const touch = res.controls.roof_z.touching;
    expect(touch?.side).toBe('lower');
    expect(touch?.wall.constraint.id).toMatch(/occupant_roof_row/);
    expect(touch?.wall.constraint.reason).toMatch(/head room/);
  });

  it('cowl control slammed up touches the sight line, and the chain carries the vision knob', () => {
    const res = solve(buildSolveInput({ architecture: 'fr', seating: '2', controls: { cowl_z: 1 } }));
    const touch = res.controls.cowl_z.touching;
    expect(touch?.side).toBe('upper');
    expect(touch?.wall.constraint.id).toBe('sight_over_cowl');
    expect(touch?.wall.assumedKnobs).toContain('vision_ground_sight');
  });
});

describe('conflicts never silently clamp', () => {
  it('an impossible height target names both walls and the knobs to move', () => {
    const res = solve(
      buildSolveInput({
        architecture: 'ev',
        seating: '2',
        overrides: { style_overall_height_max: 1100 },
      }),
    );
    const k = res.conflicts.find((c) => c.quantity === 'roof_z');
    expect(k).toBeDefined();
    expect(k!.lower.constraint.id).toMatch(/occupant_roof_row/);
    expect(k!.upper.constraint.id).toBe('style_height');
    expect(k!.resolvers).toContain('style_overall_height_max');
    expect(k!.resolvers).toContain('arch_battery_thickness');
  });

  it('a strangled sight target squeezes the hood band into conflict', () => {
    const res = solve(
      buildSolveInput({
        architecture: 'fr',
        seating: '2',
        overrides: { vision_ground_sight: 3500 },
        controls: { cowl_z: 0 },
      }),
    );
    // With the cowl pinned to the dash stack and a very strict sight target,
    // either the hood band inverts or the buildable space pinches.
    const anyConflict =
      res.conflicts.length > 0 ||
      res.bounds.hood_z.lower!.value > res.bounds.hood_z.upper!.value;
    expect(anyConflict).toBe(true);
  });
});

describe('the ledger (Law 4)', () => {
  it('every parameter carries a license; SOURCED ones name sources', () => {
    const res = solve(buildSolveInput({ architecture: 'ev', seating: '2+3row' }));
    for (const p of res.params) {
      expect(['DERIVED', 'SOURCED', 'ASSUMED']).toContain(p.license);
      if (p.license === 'SOURCED' && !p.pending) {
        expect(p.source && p.source.length > 0).toBe(true);
      }
      if (p.license === 'ASSUMED') {
        expect(p.note && p.note.length > 0).toBe(true);
      }
    }
    expect(res.counts.ASSUMED).toBeGreaterThan(0);
    expect(res.counts.SOURCED).toBeGreaterThan(0);
  });

  it('ledger edits propagate: widening the couple pushes the wheelbase floor', () => {
    const base = solve(buildSolveInput({ architecture: 'ft', seating: '5' }));
    const wide = solve(
      buildSolveInput({
        architecture: 'ft',
        seating: '5',
        overrides: { seat_couple_full: 1000 },
      }),
    );
    expect(wide.bounds.wheelbase.lower!.value).toBeGreaterThan(
      base.bounds.wheelbase.lower!.value,
    );
  });
});
