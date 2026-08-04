import type { ConstraintMeta, SolveResult } from '@pkgprop/core';

/**
 * A car is a tree of typed features, not a bag of loose points.
 *
 * Every feature knows what it is. A wheel opening knows there is a wheel
 * inside it; a beltline knows it runs the length of the body. Each one
 * exposes a few named automotive parameters, generates its own geometry from
 * them, and reports where the solver's walls stop it.
 *
 * The payoff is that a wheel opening cannot become a rounded triangle, because
 * a triangle is not expressible in its parameters.
 */

export interface Pt {
  readonly x: number;
  readonly z: number;
}

export type FeatureKind =
  | 'wheel-opening'
  | 'rocker'
  | 'beltline'
  | 'side-profile'
  | 'greenhouse';

/** A parameter a designer can actually reach, in the language of the trade. */
export interface ParamSpec {
  readonly key: string;
  readonly label: string;
  readonly unit: 'mm' | 'deg' | 'ratio';
  readonly min: number;
  readonly max: number;
  /** Step for the stepper; the slider is continuous. */
  readonly step: number;
  /** Plain words: what moving this actually does to the car. */
  readonly hint: string;
}

/** What a feature reports back after it has been generated against the solve. */
export interface FeatureGeometry {
  /** The feature's curve in mm, ready to draw. */
  readonly curve: readonly Pt[];
  /** Where the solver stopped this feature, if anywhere. */
  readonly binding: { param: string; constraint: ConstraintMeta; side: 'floor' | 'ceiling' } | null;
  /** Draggable handles, in mm, each writing back to one parameter. */
  readonly handles: readonly Handle[];
}

export interface Handle {
  readonly id: string;
  readonly at: Pt;
  readonly label: string;
  /** Which parameter this handle writes, and how a drag maps onto it. */
  readonly param: string;
  readonly axis: 'x' | 'z' | 'radial';
}

export type FeatureParams = Readonly<Record<string, number>>;

export interface FeatureDef<P extends FeatureParams = FeatureParams> {
  readonly kind: FeatureKind;
  readonly label: string;
  /** Plain words for the inspector header. */
  readonly blurb: string;
  readonly params: readonly ParamSpec[];
  readonly defaults: P;
  /** Build the curve and handles from parameters plus the live solve. */
  generate(params: P, result: SolveResult, ctx: FeatureCtx): FeatureGeometry;
}

/** What a generator may consult besides its own parameters. */
export interface FeatureCtx {
  /** Which axle a wheel opening belongs to, and similar per-instance facts. */
  readonly slot: string;
  /** Read a licensed parameter's live value. */
  value(id: string, fallback: number): number;
}

/** One placed feature in the car. */
export interface Feature {
  readonly id: string;
  readonly kind: FeatureKind;
  readonly slot: string;
  readonly params: FeatureParams;
}

export function makeCtx(result: SolveResult, slot: string): FeatureCtx {
  return {
    slot,
    value: (id, fallback) => result.params.find((p) => p.id === id)?.effective ?? fallback,
  };
}

/**
 * A superellipse quadrant exponent from a 0..1 "squareness" dial.
 * 0 gives a true circle; 1 gives a squared-off opening with soft corners.
 * Nothing in this range can produce a corner or a cusp.
 */
export function squarenessExponent(squareness: number): number {
  const s = Math.max(0, Math.min(1, squareness));
  return 2 + s * 3.2;
}

/** Sample the upper half of a superellipse, left to right. */
export function superellipseTop(
  cx: number,
  cz: number,
  rx: number,
  rz: number,
  exponent: number,
  steps = 48,
): Pt[] {
  const out: Pt[] = [];
  const p = 2 / exponent;
  for (let i = 0; i <= steps; i += 1) {
    const t = Math.PI - (i / steps) * Math.PI; // π → 0, so x runs left to right
    const c = Math.cos(t);
    const s = Math.sin(t);
    out.push({
      x: cx + rx * Math.sign(c) * Math.abs(c) ** p,
      z: cz + rz * Math.sign(s) * Math.abs(s) ** p,
    });
  }
  return out;
}
