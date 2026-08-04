import type { SolveResult } from '@pkgprop/core';
import { asDef, makeCtx, type Feature, type FeatureDef, type FeatureGeometry } from './feature.js';
import { BODY_CUT, CHARACTER_LINE, SPLITTER, WING } from './features/sculpt.js';
import { BODY_SECTION } from './features/section.js';
import { WHEEL_OPENING, type WheelOpeningParams } from './features/wheelOpening.js';

/**
 * The feature registry, and the car's default feature set.
 *
 * Two kinds of thing live in this car. Some parts have obvious parameters and
 * should never be freehand — a wheel opening is an arch around a wheel, full
 * stop. Others are genuinely freeform: a roofline is a curve a designer draws.
 * The model carries both, the way a vector editor carries both rectangles and
 * paths. Pretending a roofline is parametric would pamper; pretending a wheel
 * opening is freeform is what produced rounded triangles.
 */

export const FEATURE_DEFS: Record<string, FeatureDef> = {
  'wheel-opening': asDef(WHEEL_OPENING),
  'body-section': asDef(BODY_SECTION),
  'character-line': CHARACTER_LINE,
  'body-cut': BODY_CUT,
  wing: WING,
  splitter: SPLITTER,
};

/** The verbs you can add to a car, in the order the rail offers them. */
export const ADDABLE: readonly { kind: string; label: string; blurb: string }[] = [
  { kind: 'character-line', label: 'character line', blurb: 'a crease running the flank' },
  { kind: 'body-cut', label: 'body cut', blurb: 'an intake, a vent, a light pocket' },
  { kind: 'wing', label: 'wing', blurb: 'an aerofoil over the tail' },
  { kind: 'splitter', label: 'splitter', blurb: 'a blade under the nose' },
];

/** A fresh instance of a verb, with an id nothing else holds. */
export function newFeature(kind: string, existing: FeatureMap): Feature {
  const def = defOf(kind);
  let n = 1;
  while (existing[`${kind}-${n}`]) n += 1;
  return { id: `${kind}-${n}`, kind, slot: 'body', params: { ...def.defaults } };
}

export function defOf(kind: string): FeatureDef {
  const d = FEATURE_DEFS[kind];
  if (!d) throw new Error(`No feature definition for '${kind}'.`);
  return d;
}

/**
 * What to call one placed feature.
 *
 * The slot only earns its place in the name when it distinguishes two parts of
 * the same kind — a car has a front and a rear wheel opening and you need to
 * know which one you grabbed. Every authored part carries slot `'body'`, and
 * "body character line" is noise. Naming this once means the header, the
 * status line, and the part list cannot drift apart.
 */
export function labelOf(f: Feature | undefined): string | null {
  if (!f) return null;
  const label = defOf(f.kind).label;
  return f.slot === 'body' ? label : `${f.slot} ${label}`;
}

export type FeatureMap = Readonly<Record<string, Feature>>;

/** The parametric features every car starts with. */
export function defaultFeatures(): FeatureMap {
  return {
    'opening-front': {
      id: 'opening-front',
      kind: 'wheel-opening',
      slot: 'front',
      params: { ...WHEEL_OPENING.defaults },
    },
    'opening-rear': {
      id: 'opening-rear',
      kind: 'wheel-opening',
      slot: 'rear',
      params: { ...WHEEL_OPENING.defaults },
    },
    'section-body': {
      id: 'section-body',
      kind: 'body-section',
      slot: 'body',
      params: { ...BODY_SECTION.defaults },
    },
  };
}

/** Generate one feature's live geometry against the current solve. */
export function generateFeature(f: Feature, result: SolveResult): FeatureGeometry {
  return defOf(f.kind).generate(f.params, result, makeCtx(result, f.slot));
}

export type { Feature };
export type { WheelOpeningParams };
