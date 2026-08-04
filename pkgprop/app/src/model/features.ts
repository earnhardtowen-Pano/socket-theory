import type { SolveResult } from '@pkgprop/core';
import { asDef, makeCtx, type Feature, type FeatureDef, type FeatureGeometry } from './feature.js';
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
};

export function defOf(kind: string): FeatureDef {
  const d = FEATURE_DEFS[kind];
  if (!d) throw new Error(`No feature definition for '${kind}'.`);
  return d;
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

export type { WheelOpeningParams };
