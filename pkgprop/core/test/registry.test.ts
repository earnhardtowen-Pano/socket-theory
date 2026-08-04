import { describe, expect, it } from 'vitest';
import { Registry } from '../src/registry.js';

const assumed = {
  id: 'demo_gap',
  label: 'a demo gap',
  unit: 'mm',
  value: 50,
  license: 'ASSUMED',
  note: 'test value',
  range: [10, 100],
} as const;

describe('registry (Law 4)', () => {
  it('refuses to read a number that has no license', () => {
    const reg = new Registry();
    expect(() => reg.value('nobody_registered_me')).toThrow(/license/i);
  });

  it('refuses a SOURCED definition with no source named', () => {
    const reg = new Registry();
    expect(() =>
      reg.define({ id: 'x', label: 'x', unit: 'mm', value: 1, license: 'SOURCED' }),
    ).toThrow(/source/i);
  });

  it('refuses duplicate definitions', () => {
    const reg = new Registry();
    reg.define(assumed);
    expect(() => reg.define(assumed)).toThrow(/twice/i);
  });

  it('only ASSUMED values are editable', () => {
    const reg = new Registry();
    reg.define(assumed);
    reg.define({
      id: 'fixed',
      label: 'fixed',
      unit: 'mm',
      value: 25.4,
      license: 'SOURCED',
      source: 'a real source',
    });
    reg.override('demo_gap', 60);
    expect(reg.value('demo_gap')).toBe(60);
    expect(reg.param('demo_gap').overridden).toBe(true);
    expect(() => reg.override('fixed', 1)).toThrow(/ASSUMED/);
  });

  it('traces record exactly the params read, and nest', () => {
    const reg = new Registry();
    reg.define(assumed);
    reg.define({ ...assumed, id: 'demo_other' });
    const endOuter = reg.beginTrace();
    reg.value('demo_gap');
    const endInner = reg.beginTrace();
    reg.value('demo_other');
    expect(endInner().sort()).toEqual(['demo_other']);
    expect(endOuter().sort()).toEqual(['demo_gap', 'demo_other']);
  });

  it('counts by license for the ledger header', () => {
    const reg = new Registry();
    reg.define(assumed);
    reg.define({
      id: 's',
      label: 's',
      unit: 'mm',
      value: 1,
      license: 'SOURCED',
      source: 'somewhere real',
    });
    reg.override('demo_gap', 55);
    const c = reg.counts();
    expect(c.ASSUMED).toBe(1);
    expect(c.SOURCED).toBe(1);
    expect(c.overridden).toBe(1);
  });
});
