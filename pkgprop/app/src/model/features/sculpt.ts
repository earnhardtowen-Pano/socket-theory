import type { SolveResult } from '@pkgprop/core';
import type { FeatureCtx, FeatureDef, FeatureGeometry, Pt } from '../feature.js';

/**
 * The sculpt verbs.
 *
 * Professional ideation form language is about three things: creases along a
 * curve with controlled sharpness, recessed regions bounded by an outline with
 * a rim treatment, and separately-modelled attachments placed on the surface.
 * True booleans are almost never used at this stage — they wreck the surface —
 * so a cut here is a displacement with a rim, which is exactly how it is done
 * in a subD sketch model, and which keeps the body watertight by construction.
 *
 * Every one of these is a normal feature: selectable, inspectable, undoable,
 * and removable. Add as many as you like, anywhere you like.
 */

const flat = (curve: Pt[]): FeatureGeometry => ({ curve, binding: null, handles: [] });

/**
 * CHARACTER LINE — the hero verb. A ridge or a valley running the flank at a
 * stated height, with a stated width and depth. Negative depth cuts instead of
 * raising, which is the difference between a shoulder line and a tornado line.
 */
export const CHARACTER_LINE: FeatureDef = {
  kind: 'character-line',
  view: 'side',
  label: 'character line',
  blurb: 'a crease running the flank',
  params: [
    {
      key: 'height',
      label: 'height above rocker',
      unit: 'mm',
      min: 40,
      max: 900,
      step: 5,
      hint: 'where the crease sits on the side. Low reads as a skirt, mid is a shoulder line, high tucks under the glass.',
    },
    {
      key: 'depth',
      label: 'relief',
      unit: 'mm',
      min: -40,
      max: 40,
      step: 0.5,
      hint: 'positive pushes the crease out as a ridge; negative pulls it in as a valley. Beyond about twenty either way it stops reading as a line and starts reading as a form change.',
    },
    {
      key: 'width',
      label: 'softness',
      unit: 'mm',
      min: 12,
      max: 260,
      step: 2,
      hint: 'how far the crease bleeds into the panel. Tight is a knife edge that catches one hard highlight; wide is a soft swell you read as tension rather than a line.',
    },
  ],
  defaults: { height: 430, depth: 9, width: 70 },
  generate(params, result: SolveResult, _ctx: FeatureCtx): FeatureGeometry {
    // Drawn on the side view where it actually runs, so it can be selected
    // from the canvas like any other part.
    const g = result.geometry;
    const z = g.rockerZ + (params.height ?? 430);
    const pts: Pt[] = [];
    const x0 = g.bumperX + 120;
    const x1 = g.tailX - 120;
    for (let i = 0; i <= 24; i += 1) {
      const t = i / 24;
      const fade = Math.sin(Math.PI * t) ** 0.35;
      pts.push({ x: x0 + (x1 - x0) * t, z: z + (params.depth ?? 9) * 0.35 * fade });
    }
    return flat(pts);
  },
};

/**
 * BODY CUT — an intake, a vent, a light pocket. A recessed patch with a rim,
 * the way it is authored in a subD sketch model rather than booleaned.
 */
export const BODY_CUT: FeatureDef = {
  kind: 'body-cut',
  view: 'side',
  label: 'body cut',
  blurb: 'a recess in the flank',
  params: [
    { key: 'station', label: 'station', unit: 'mm', min: -1200, max: 5200, step: 10, hint: 'where along the car the cut sits, measured from the front axle.' },
    { key: 'height', label: 'height', unit: 'mm', min: 40, max: 1400, step: 5, hint: 'how far up the side the cut sits.' },
    { key: 'width', label: 'length', unit: 'mm', min: 60, max: 1400, step: 10, hint: 'how long the opening runs along the car.' },
    { key: 'tall', label: 'height of opening', unit: 'mm', min: 30, max: 800, step: 5, hint: 'how tall the opening is.' },
    {
      key: 'depth',
      label: 'depth',
      unit: 'mm',
      min: 0,
      max: 220,
      step: 1,
      hint: 'how deep the recess goes. Shallow reads as a vent graphic; deep reads as a duct that swallows air.',
    },
    {
      key: 'rim',
      label: 'rim',
      unit: 'mm',
      min: 4,
      max: 160,
      step: 1,
      hint: 'how quickly the surface falls into the cut. Tight is a hard-edged aperture; wide is a scoop blended into the panel.',
    },
  ],
  defaults: { station: 1900, height: 520, width: 420, tall: 180, depth: 34, rim: 26 },
  generate(params, _result: SolveResult, _ctx: FeatureCtx): FeatureGeometry {
    const cx = params.station ?? 0;
    const cz = params.height ?? 500;
    const hw = (params.width ?? 420) / 2;
    const hh = (params.tall ?? 180) / 2;
    const r = Math.min(hw, hh) * 0.45;
    // A rounded rectangle, drawn where it cuts.
    const pts: Pt[] = [];
    const corner = (ox: number, oz: number, a0: number) => {
      for (let i = 0; i <= 6; i += 1) {
        const a = a0 + (Math.PI / 2) * (i / 6);
        pts.push({ x: cx + ox + Math.cos(a) * r, z: cz + oz + Math.sin(a) * r });
      }
    };
    corner(hw - r, hh - r, 0);
    corner(-(hw - r), hh - r, Math.PI / 2);
    corner(-(hw - r), -(hh - r), Math.PI);
    corner(hw - r, -(hh - r), -Math.PI / 2);
    pts.push(pts[0]!);
    return flat(pts);
  },
};

/** WING — an appendage over the deck. Drawn in side view, lofted in 3D. */
export const WING: FeatureDef = {
  kind: 'wing',
  view: 'side',
  label: 'wing',
  blurb: 'an aerofoil over the tail',
  params: [
    { key: 'station', label: 'station', unit: 'mm', min: -600, max: 5400, step: 10, hint: 'where the wing sits along the car.' },
    { key: 'height', label: 'height', unit: 'mm', min: 200, max: 1800, step: 5, hint: 'how high above the road the wing stands.' },
    { key: 'chord', label: 'chord', unit: 'mm', min: 80, max: 700, step: 5, hint: 'how deep the blade is front to back.' },
    { key: 'span', label: 'span', unit: 'mm', min: 300, max: 2200, step: 10, hint: 'how wide the wing runs across the car.' },
    { key: 'angle', label: 'angle of attack', unit: 'deg', min: -25, max: 25, step: 0.5, hint: 'how far the blade is tipped. More angle is more downforce and more drag, and it reads as intent.' },
    { key: 'thickness', label: 'thickness', unit: 'mm', min: 8, max: 120, step: 1, hint: 'blade section depth. Thin is a race blade; thick is a road-car spoiler.' },
  ],
  defaults: { station: 3900, height: 1150, chord: 260, span: 1500, angle: -8, thickness: 26 },
  generate(params, _result: SolveResult, _ctx: FeatureCtx): FeatureGeometry {
    const cx = params.station ?? 0;
    const cz = params.height ?? 1100;
    const c = (params.chord ?? 260) / 2;
    const t = (params.thickness ?? 26) / 2;
    const a = ((params.angle ?? -8) * Math.PI) / 180;
    const pts: Pt[] = [];
    for (let i = 0; i <= 32; i += 1) {
      const u = (i / 32) * Math.PI * 2;
      const lx = Math.cos(u) * c;
      const lz = Math.sin(u) * t;
      pts.push({ x: cx + lx * Math.cos(a) - lz * Math.sin(a), z: cz + lx * Math.sin(a) + lz * Math.cos(a) });
    }
    return flat(pts);
  },
};

/** SPLITTER — a blade at the nose, low and wide. */
export const SPLITTER: FeatureDef = {
  kind: 'splitter',
  view: 'side',
  label: 'splitter',
  blurb: 'a blade under the nose',
  params: [
    { key: 'station', label: 'station', unit: 'mm', min: -1600, max: 5400, step: 10, hint: 'where the blade sits along the car.' },
    { key: 'height', label: 'height', unit: 'mm', min: 20, max: 700, step: 5, hint: 'how far above the road the blade sits.' },
    { key: 'reach', label: 'reach', unit: 'mm', min: 40, max: 600, step: 5, hint: 'how far the blade juts out ahead of the bodywork.' },
    { key: 'span', label: 'span', unit: 'mm', min: 300, max: 2200, step: 10, hint: 'how wide the blade runs.' },
    { key: 'thickness', label: 'thickness', unit: 'mm', min: 4, max: 60, step: 1, hint: 'blade thickness.' },
  ],
  defaults: { station: -700, height: 105, reach: 190, span: 1700, thickness: 16 },
  generate(params, _result: SolveResult, _ctx: FeatureCtx): FeatureGeometry {
    const cx = params.station ?? 0;
    const cz = params.height ?? 105;
    const r = params.reach ?? 190;
    const t = params.thickness ?? 16;
    return flat([
      { x: cx - r, z: cz },
      { x: cx + r * 0.3, z: cz },
      { x: cx + r * 0.3, z: cz + t },
      { x: cx - r, z: cz + t },
      { x: cx - r, z: cz },
    ]);
  },
};
