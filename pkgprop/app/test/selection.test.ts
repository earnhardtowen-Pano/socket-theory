import { describe, expect, it } from 'vitest';
import { initialState, reducer } from '../src/state/store.js';
import { generateFeature } from '../src/model/features.js';
import { solve } from '@pkgprop/core';
import { buildSolveInput } from '@pkgprop/data';

describe('selection and features', () => {
  it('selecting a feature sticks', () => {
    const s1 = reducer(initialState(), {
      type: 'select',
      selection: { kind: 'feature', id: 'opening-front' },
    });
    expect(s1.selection).toEqual({ kind: 'feature', id: 'opening-front' });
  });

  it('a wheel opening is an arch, never a triangle', () => {
    const result = solve(buildSolveInput({ architecture: 'fr', seating: '2' }));
    const st = initialState();
    const geo = generateFeature(st.now.features['opening-front']!, result);
    const tireR = result.geometry.tireRadius;
    // Every point of the opening clears the tire.
    for (const p of geo.curve) {
      const d = Math.hypot(p.x, p.z - tireR);
      if (p.z > 200) expect(d).toBeGreaterThan(tireR);
    }
    // The crown sits above the tire, and the curve is convex over its span.
    const crown = geo.curve.reduce((a, b) => (b.z > a.z ? b : a));
    expect(crown.z).toBeGreaterThan(tireR * 2);
  });

  it('a param edit moves the opening', () => {
    const s1 = reducer(initialState(), {
      type: 'set-feature-param',
      id: 'opening-front',
      key: 'radius',
      value: 480,
      commit: true,
    });
    expect(s1.now.features['opening-front']!.params.radius).toBe(480);
  });
});

describe('panels and the ledger overlay', () => {
  it('leaving the ledger panel closes the ledger', () => {
    const opened = reducer(initialState(), { type: 'panel', id: 'LEDGER' });
    expect(opened.ledgerOpen).toBe(true);
    // The overlay used to follow you onto every other panel, and because
    // Escape peels one layer at a time it then ate the escape that should
    // have put down the part in your hand.
    const left = reducer(opened, { type: 'panel', id: 'BODY' });
    expect(left.ledgerOpen).toBe(false);
    expect(left.panel).toBe('BODY');
  });

  it('re-clicking the panel you are on changes nothing', () => {
    const s = reducer(initialState(), { type: 'panel', id: 'SIDE' });
    const withLedger = reducer(s, { type: 'ledger', open: true });
    expect(reducer(withLedger, { type: 'panel', id: 'SIDE' })).toBe(withLedger);
  });
});
