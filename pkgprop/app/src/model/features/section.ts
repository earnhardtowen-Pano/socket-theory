import { halfSection } from '@pkgprop/geometry';
import type { SolveResult } from '@pkgprop/core';
import type { FeatureCtx, FeatureDef, FeatureGeometry, Pt } from '../feature.js';

/**
 * The body section — the shape of the car across its width.
 *
 * Side view and plan view together still do not say what a car looks like. Two
 * cars with identical silhouettes and identical plan outlines can read as a
 * taut sports car or a slab-sided van, and the whole difference is in the
 * section: how domed the roof crown is, how high the car carries its width,
 * and how far the sides lean in underneath.
 *
 * These three numbers drive the loft, so this is the feature that turns a pair
 * of drawings into a surface.
 */

export interface SectionParams {
  readonly crown: number;
  readonly shoulder: number;
  readonly tumblehome: number;
  readonly glassInset: number;
  readonly [k: string]: number;
}

export const BODY_SECTION: FeatureDef<SectionParams> = {
  kind: 'body-section',
  view: 'sections',
  label: 'body section',
  blurb: 'how the car is shaped across its width',
  params: [
    {
      key: 'crown',
      label: 'roof crown',
      unit: 'ratio',
      min: 0,
      max: 1,
      step: 0.01,
      hint: 'how domed the roof is across the car. Flat at zero reads as a van; full crown reads as a coupe and catches a long highlight down the centre.',
    },
    {
      key: 'shoulder',
      label: 'shoulder height',
      unit: 'ratio',
      min: 0.15,
      max: 0.95,
      step: 0.01,
      hint: 'how high the car carries its widest point, from rocker to roof. Low is a wide-hipped, planted stance; high pushes the volume up into the glass.',
    },
    {
      key: 'tumblehome',
      label: 'tumblehome',
      unit: 'ratio',
      min: 0,
      max: 1,
      step: 0.01,
      hint: 'how far the sides lean in below the shoulder. Zero is slab-sided; more pulls the sill under the body and makes the car look like it is standing on its wheels.',
    },
    {
      key: 'glassInset',
      label: 'glass inset',
      unit: 'ratio',
      min: 0,
      max: 1,
      step: 0.01,
      hint: 'how far the greenhouse sits inboard of the body at the beltline. This is the break that makes a car read as a body with a cabin on it rather than one smooth blister — at zero the two volumes merge and the shape stops looking like a car.',
    },
  ],
  defaults: { crown: 0.42, shoulder: 0.64, tumblehome: 0.3, glassInset: 0.5 },

  /**
   * Drawn at the widest station, where the section is most legible. This is a
   * preview of a 3D shape in a 2D view, so it carries no handles — the loft in
   * BODY is where you see what these actually do.
   */
  generate(params: SectionParams, result: SolveResult, _ctx: FeatureCtx): FeatureGeometry {
    const g = result.geometry;
    const halfWidth = g.overallWidth / 2;
    const curve = halfSection(g.beltZ, g.rockerZ, halfWidth, {
      crown: params.crown,
      shoulder: params.shoulder,
      tumblehome: params.tumblehome,
      glassInset: params.glassInset,
    });
    // The section lives in (y, z); the 2D viewport draws (x, z), so the
    // half-width reads along the horizontal axis the same way the plan does.
    const pts: Pt[] = curve.sample(48).map((p) => ({ x: p.y, z: p.z }));
    return { curve: pts, binding: null, handles: [] };
  },
};
