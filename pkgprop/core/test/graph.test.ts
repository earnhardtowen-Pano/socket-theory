import { describe, expect, it } from 'vitest';
import { ContributionSet, placeControl } from '../src/graph.js';
import type { ConstraintMeta } from '../src/graph.js';
import { Registry } from '../src/registry.js';

function reg(): Registry {
  const r = new Registry();
  r.define({
    id: 'knob_a',
    label: 'knob a',
    unit: 'mm',
    value: 100,
    license: 'ASSUMED',
    note: 't',
  });
  r.define({
    id: 'src_b',
    label: 'source b',
    unit: 'mm',
    value: 40,
    license: 'SOURCED',
    source: 'test source',
  });
  return r;
}

const wallA: ConstraintMeta = {
  id: 'wall_a',
  label: 'wall a',
  reason: 'because a',
  license: 'DERIVED',
};
const wallB: ConstraintMeta = {
  id: 'wall_b',
  label: 'wall b',
  reason: 'because b',
  license: 'DERIVED',
};
const cap: ConstraintMeta = {
  id: 'cap',
  label: 'the cap',
  reason: 'style cap',
  license: 'ASSUMED',
};

describe('contribution graph (Law 3)', () => {
  it('the winning contribution IS the attribution — computed, not narrated', () => {
    const r = reg();
    const cs = new ContributionSet(r);
    cs.contribute('q', 'lower', wallA, () => r.value('knob_a'));
    cs.contribute('q', 'lower', wallB, () => r.value('src_b'));
    cs.contribute('q', 'upper', cap, () => r.value('knob_a') + r.value('src_b'));
    const b = cs.bound('q');
    expect(b.lower?.value).toBe(100);
    expect(b.lower?.constraint.id).toBe('wall_a');
    expect(b.lower?.chain).toEqual(['knob_a']);
    expect(b.lower?.assumedKnobs).toEqual(['knob_a']);
    expect(b.upper?.value).toBe(140);
    expect(b.upper?.constraint.id).toBe('cap');
  });

  it('a conflict names both sides and the ASSUMED knobs that can move them', () => {
    const r = reg();
    const cs = new ContributionSet(r);
    cs.contribute('q', 'lower', wallA, () => r.value('knob_a'));
    cs.contribute('q', 'upper', cap, () => r.value('src_b'));
    const conflicts = cs.conflicts();
    expect(conflicts).toHaveLength(1);
    const k = conflicts[0]!;
    expect(k.lower.constraint.id).toBe('wall_a');
    expect(k.upper.constraint.id).toBe('cap');
    expect(k.overlap).toBe(60);
    expect(k.resolvers).toContain('knob_a');
  });

  it('non-finite contributions fail loudly', () => {
    const r = reg();
    const cs = new ContributionSet(r);
    expect(() => cs.contribute('q', 'lower', wallA, () => Number.NaN)).toThrow(/non-finite/);
  });
});

describe('control placement (seed contract: fractions of live bounds)', () => {
  function bound(lo: number, hi: number) {
    const r = reg();
    const cs = new ContributionSet(r);
    cs.contribute('q', 'lower', wallA, () => lo * r.value('knob_a') * 0 + lo);
    cs.contribute('q', 'upper', cap, () => hi);
    return cs.bound('q');
  }

  it('fraction 0 sits on the floor and names its wall', () => {
    const p = placeControl(bound(10, 20), 0);
    expect(p.value).toBe(10);
    expect(p.touching?.side).toBe('lower');
    expect(p.touching?.wall.constraint.id).toBe('wall_a');
  });

  it('fraction 1 sits on the ceiling and names its wall', () => {
    const p = placeControl(bound(10, 20), 1);
    expect(p.value).toBe(20);
    expect(p.touching?.side).toBe('upper');
    expect(p.touching?.wall.constraint.id).toBe('cap');
  });

  it('mid fractions touch nothing', () => {
    const p = placeControl(bound(10, 20), 0.5);
    expect(p.value).toBe(15);
    expect(p.touching).toBeNull();
  });

  it('an inverted band pins to the floor; the conflict machinery reports it', () => {
    const p = placeControl(bound(30, 20), 0.5);
    expect(p.value).toBe(30);
    expect(p.touching?.side).toBe('lower');
  });

  it('fractions survive band changes — position is relative, not absolute', () => {
    const before = placeControl(bound(10, 20), 0.3);
    const after = placeControl(bound(100, 200), 0.3);
    expect(before.value).toBeCloseTo(13);
    expect(after.value).toBeCloseTo(130);
    expect(before.fraction).toBe(after.fraction);
  });
});
