import type { SolveResult } from '@pkgprop/core';
import {
  squarenessExponent,
  superellipseTop,
  type FeatureCtx,
  type FeatureDef,
  type FeatureGeometry,
  type Handle,
  type Pt,
} from '../feature.js';

/**
 * The wheel opening — the feature that proves the model.
 *
 * It is an arch around a known wheel: a superellipse whose radius, centre
 * rise, squareness, and termination height are the only things a designer
 * touches. The wheel's own radius plus its jounce travel is the floor on the
 * opening radius, and that floor is the solver's existing tire-clearance
 * wall, so pulling the opening in too far names the wall that stopped it.
 */

export interface WheelOpeningParams {
  /** Opening radius measured from the arch centre. */
  readonly radius: number;
  /** Arch centre above the wheel centre — lifts the crown without fattening it. */
  readonly centerRise: number;
  /** Arch centre fore/aft of the wheel centre. */
  readonly centerShift: number;
  /** 0 is a true circle; 1 is a squared-off opening. */
  readonly squareness: number;
  /** Where the opening's ends meet the body. */
  readonly lowerZ: number;
  [key: string]: number;
}

export const WHEEL_OPENING: FeatureDef<WheelOpeningParams> = {
  kind: 'wheel-opening',
  label: 'wheel opening',
  blurb: 'the arch cut around the wheel',
  params: [
    {
      key: 'radius',
      label: 'opening radius',
      unit: 'mm',
      min: 300,
      max: 700,
      step: 5,
      hint: 'how far the arch stands off the wheel centre. The tire and its travel set the floor.',
    },
    {
      key: 'centerRise',
      label: 'centre rise',
      unit: 'mm',
      min: -60,
      max: 160,
      step: 5,
      hint: 'lifts the arch centre above the wheel centre — a taller crown without a wider opening.',
    },
    {
      key: 'centerShift',
      label: 'centre shift',
      unit: 'mm',
      min: -120,
      max: 120,
      step: 5,
      hint: 'slides the arch fore or aft of the wheel centre.',
    },
    {
      key: 'squareness',
      label: 'squareness',
      unit: 'ratio',
      min: 0,
      max: 1,
      step: 0.05,
      hint: 'round at zero, squared-off at one. Never a corner.',
    },
    {
      key: 'lowerZ',
      label: 'opening bottom',
      unit: 'mm',
      min: 60,
      max: 500,
      step: 5,
      hint: 'where the arch ends meet the body side.',
    },
  ],
  defaults: {
    radius: 430,
    centerRise: 20,
    centerShift: 0,
    squareness: 0.25,
    lowerZ: 200,
  },
  generate,
};

function generate(
  params: WheelOpeningParams,
  result: SolveResult,
  ctx: FeatureCtx,
): FeatureGeometry {
  const g = result.geometry;
  const axleX = ctx.slot === 'rear' ? g.wheelbase : 0;
  const tireR = g.tireRadius;
  const jounce = ctx.value('body_tire_jounce', 70);

  // The wall: the opening must clear the tire crown plus its travel. Measured
  // from the arch centre, which the rise has already moved.
  const cz = tireR + params.centerRise;
  const cx = axleX + params.centerShift;
  const clearanceFloor = Math.hypot(params.centerShift, tireR + jounce - cz) + jounce * 0.15;
  const minRadius = Math.max(tireR + jounce - params.centerRise, clearanceFloor);

  const radius = Math.max(params.radius, minRadius);
  const clamped = radius > params.radius + 0.5;

  const exponent = squarenessExponent(params.squareness);
  const full = superellipseTop(cx, cz, radius, radius, exponent);

  // Trim the arch where it drops below its termination height, then close the
  // ends down onto the body so the opening reads as an opening.
  const curve: Pt[] = [];
  for (const p of full) {
    if (p.z >= params.lowerZ) curve.push(p);
  }
  if (curve.length === 0) curve.push({ x: cx, z: cz + radius });
  const first = curve[0]!;
  const last = curve[curve.length - 1]!;
  curve.unshift({ x: first.x, z: params.lowerZ });
  curve.push({ x: last.x, z: params.lowerZ });

  const crown = curve.reduce((best, p) => (p.z > best.z ? p : best), curve[0]!);

  const handles: Handle[] = [
    { id: 'crown', at: crown, label: 'opening radius', param: 'radius', axis: 'z' },
    {
      id: 'front-edge',
      at: { x: cx - radius, z: Math.max(params.lowerZ, cz) },
      label: 'centre shift',
      param: 'centerShift',
      axis: 'x',
    },
    {
      id: 'bottom',
      at: { x: cx, z: params.lowerZ },
      label: 'opening bottom',
      param: 'lowerZ',
      axis: 'z',
    },
  ];

  const tireWall = result.envelope.floorOutboard.segments.find(
    (s) => s.constraint.id === 'tire_clearance',
  );

  return {
    curve,
    handles,
    binding:
      clamped && tireWall
        ? { param: 'radius', constraint: tireWall.constraint, side: 'floor' }
        : null,
  };
}
