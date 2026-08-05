import type { SolveResult } from '@pkgprop/core';
import {
  lineTension,
  linePoints,
  paramValue,
  smoothPath,
  type DrawingState,
  type LineId,
  type NormPt,
  type RenderState,
} from '../../state/lines.js';
import type { Mapper } from '../viewport/ViewportSvg.js';
import { paletteOf, sunScreenPos } from './paint.js';

/**
 * The marker render — the authored side view, painted.
 *
 * Nothing here decides where anything is: every outline comes from the lines
 * the human drew, already clamped to the solver's walls. This layer only
 * answers "what does that shape look like in light".
 */

export interface RenderInput {
  readonly result: SolveResult;
  readonly drawing: DrawingState;
  readonly render: RenderState;
  /** Clamped, denormalized points per line, in mm. */
  readonly pts: Readonly<Record<string, readonly { x: number; z: number }[]>>;
}

const TOP_CHAIN: LineId[] = ['hood', 'glass', 'roof', 'backlight', 'deck'];
const GLASS_CHAIN: LineId[] = ['glass', 'roof', 'backlight'];

function chainPts(
  input: RenderInput,
  ids: readonly LineId[],
): { x: number; z: number }[] {
  const out: { x: number; z: number }[] = [];
  for (const id of ids) {
    const pts = input.pts[id] ?? [];
    for (const p of pts) {
      const prev = out[out.length - 1];
      if (!prev || Math.hypot(prev.x - p.x, prev.z - p.z) > 1) out.push(p);
    }
  }
  return out;
}

/** Read an authored polyline's z at a station, clamped to its ends. */
function zAt(pts: readonly { x: number; z: number }[], x: number, fallback: number): number {
  if (pts.length === 0) return fallback;
  if (pts.length === 1) return pts[0]!.z;
  for (let i = 0; i < pts.length - 1; i += 1) {
    const a = pts[i]!;
    const b = pts[i + 1]!;
    if (x >= Math.min(a.x, b.x) && x <= Math.max(a.x, b.x)) {
      const u = b.x === a.x ? 0 : (x - a.x) / (b.x - a.x);
      return a.z + u * (b.z - a.z);
    }
  }
  return x < pts[0]!.x ? pts[0]!.z : pts[pts.length - 1]!.z;
}

/**
 * The body outline: over the authored top chain, down the tail, then forward
 * along the bottom edge — which is the rocker interrupted by the two wheel
 * arches the human drew. The arches become real openings, so the wheels sit
 * inside the body instead of on top of it.
 */
function bodyOutline(input: RenderInput, m: Mapper): string {
  const g = input.result.geometry;
  const top = chainPts(input, TOP_CHAIN);
  if (top.length < 2) return '';
  const rocker = input.pts['rocker'] ?? [];
  const rockerZ = rocker[0]?.z ?? g.rockerZ;
  const nose = top[0]!;
  const tail = top[top.length - 1]!;
  const archF = [...(input.pts['arch_front'] ?? [])].sort((a, b) => a.x - b.x);
  const archR = [...(input.pts['arch_rear'] ?? [])].sort((a, b) => a.x - b.x);

  const P = (p: { x: number; z: number }) => `${m.sx(p.x).toFixed(1)} ${m.sy(p.z).toFixed(1)}`;
  let d = smoothPath(top.map((p) => ({ x: m.sx(p.x), y: m.sy(p.z) })), 1);

  // Down the tail face to the rocker.
  d += ` L ${P({ x: g.tailX, z: Math.min(tail.z, rockerZ + 120) })}`;
  d += ` L ${P({ x: g.tailX, z: rockerZ })}`;

  // Forward along the bottom, arcing over each wheel opening. The arches are
  // the human's own curves, walked back to front and drawn with the same
  // spline as everywhere else — a straight-line version reads as a notch.
  for (const arch of [archR, archF]) {
    if (arch.length < 2) continue;
    const reversed = [...arch].reverse();
    d += ` L ${P(reversed[0]!)}`;
    const curve = smoothPath(reversed.map((p) => ({ x: m.sx(p.x), y: m.sy(p.z) })), 1);
    d += curve.slice(curve.indexOf('C') - 1);
    d += ` L ${P({ x: reversed[reversed.length - 1]!.x, z: rockerZ })}`;
  }

  // Round the nose up to where the hood begins.
  d += ` L ${P({ x: g.bumperX, z: rockerZ })}`;
  const noseMid = Math.max(rockerZ, nose.z - (nose.z - rockerZ) * 0.45);
  d += ` Q ${P({ x: g.bumperX - 30, z: noseMid })} ${P(nose)}`;
  d += ' Z';
  return d;
}

/**
 * The glasshouse: the glass chain above, the authored beltline below. Points
 * never dip under the belt — the backlight meets the deck, not the rocker.
 */
function glassOutline(input: RenderInput, m: Mapper): string {
  const glass = chainPts(input, GLASS_CHAIN);
  const belt = input.pts['belt'] ?? [];
  if (glass.length < 2 || belt.length < 2) return '';
  const beltZ = (x: number) => zAt(belt, x, glass[0]!.z);
  const upper = glass.map((p) => ({ x: p.x, z: Math.max(p.z, beltZ(p.x) + 10) }));
  const first = upper[0]!;
  const last = upper[upper.length - 1]!;
  let d = smoothPath(upper.map((p) => ({ x: m.sx(p.x), y: m.sy(p.z) })), 1);
  d += ` L ${m.sx(last.x).toFixed(1)} ${m.sy(beltZ(last.x)).toFixed(1)}`;
  d += ` L ${m.sx(first.x).toFixed(1)} ${m.sy(beltZ(first.x)).toFixed(1)}`;
  d += ' Z';
  return d;
}

export function MarkerRender({ input, m }: { input: RenderInput; m: Mapper }) {
  const g = input.result.geometry;
  const r = input.render;
  const pal = paletteOf(r);
  const frameTop = input.result.bounds.roof_z.upper?.value ?? g.roofZ;
  const sun = sunScreenPos(r, { x0: g.bumperX, x1: g.tailX, zTop: frameTop });

  const belt = input.pts['belt'] ?? [];
  const beltZ = belt.length > 0 ? belt.reduce((s, p) => s + p.z, 0) / belt.length : g.beltZ;
  const rockerZ = (input.pts['rocker'] ?? [])[0]?.z ?? g.rockerZ;
  const roofZ = Math.max(...chainPts(input, TOP_CHAIN).map((p) => p.z), g.roofZ);

  // Gradient stops in view space: sky at the roof, horizon at the belt.
  const yTop = m.sy(roofZ);
  const yBelt = m.sy(beltZ);
  const yRocker = m.sy(rockerZ);
  const yGround = m.sy(0);

  const jounce = paramValue(input.result, 'body_tire_jounce', 70);
  const wellR = g.tireRadius + jounce * 0.5;

  // Ground shadow: skewed by the sun's azimuth, longer as the sun drops.
  const shadowSkew = -r.sunAz * (1 - r.sunEl) * 0.9;
  const shadowLen = 1 + (1 - r.sunEl) * 0.6;
  const shadowCx = (g.bumperX + g.tailX) / 2 + shadowSkew * (g.tailX - g.bumperX) * 0.32;
  const shadowRx = ((g.tailX - g.bumperX) / 2) * shadowLen;

  const specX = m.sx(Math.max(g.bumperX, Math.min(g.tailX, (g.bumperX + g.tailX) / 2 + r.sunAz * (g.tailX - g.bumperX) * 0.42)));

  // Gradient stops as fractions of the body's own vertical span.
  const span = Math.max(1, yGround - yTop);
  const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
  const beltStop = clamp01((yBelt - yTop) / span);
  const rockerStop = clamp01((yRocker - yTop) / span);
  const stops: [number, string][] = [
    [0, pal.skyTop],
    [clamp01(beltStop - 0.16), pal.skyMid],
    [beltStop, pal.horizon],
    [clamp01(rockerStop - 0.06), pal.sideMid],
    [rockerStop, pal.sideLow],
    [1, pal.bounce],
  ];
  // Offsets must never step backwards or the gradient renders flat.
  let lastStop = 0;
  const bodyStops = stops.map(([o, c]) => {
    lastStop = Math.max(lastStop, o);
    return { offset: lastStop, color: c };
  });

  return (
    <g data-testid="marker-render">
      <defs>
        <linearGradient id="mr-body" x1="0" y1={yTop} x2="0" y2={yGround} gradientUnits="userSpaceOnUse">
          {bodyStops.map((s, i) => (
            <stop key={i} offset={s.offset.toFixed(4)} stopColor={s.color} />
          ))}
        </linearGradient>
        <linearGradient id="mr-glass" x1="0" y1={yTop} x2="0" y2={yBelt} gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor={pal.glass} />
          <stop offset="1" stopColor={pal.glassLow} />
        </linearGradient>
        <radialGradient id="mr-shadow">
          <stop offset="0" stopColor={pal.shadow} stopOpacity={0.5 + r.sunEl * 0.28} />
          <stop offset="0.65" stopColor={pal.shadow} stopOpacity={0.22} />
          <stop offset="1" stopColor={pal.shadow} stopOpacity="0" />
        </radialGradient>
        <linearGradient id="mr-spec" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={pal.spec} stopOpacity="0" />
          <stop offset="0.5" stopColor={pal.spec} stopOpacity={0.55 + r.sunEl * 0.3} />
          <stop offset="1" stopColor={pal.spec} stopOpacity="0" />
        </linearGradient>
        <clipPath id="mr-body-clip">
          <path d={bodyOutline(input, m)} />
        </clipPath>
      </defs>

      {/* ground shadow */}
      <ellipse
        cx={m.sx(shadowCx)}
        cy={m.sy(0)}
        rx={shadowRx / m.mmPerPx}
        ry={(90 + (1 - r.sunEl) * 70) / m.mmPerPx}
        fill="url(#mr-shadow)"
      />

      {/* Wheel wells: the shadowed volume behind each authored arch. Shaped by
          the arch itself — a circle leaves a sliver of daylight at the crown. */}
      {(['arch_front', 'arch_rear'] as const).map((id) => {
        const arch = [...(input.pts[id] ?? [])].sort((a, b) => a.x - b.x);
        if (arch.length < 2) return null;
        const screen = arch.map((p) => ({ x: m.sx(p.x), y: m.sy(p.z) }));
        const curve = smoothPath(screen, 1);
        const last = screen[screen.length - 1]!;
        const first = screen[0]!;
        // Stop at the rocker: below it the tire stands against open air.
        const floor = m.sy(rockerZ);
        return (
          <path
            key={id}
            d={`${curve} L ${last.x} ${floor} L ${first.x} ${floor} Z`}
            fill={pal.glassLow}
          />
        );
      })}

      {/* the body */}
      <path d={bodyOutline(input, m)} fill="url(#mr-body)" />

      {/* specular streak along the upper surfaces, keyed to the sun */}
      <g clipPath="url(#mr-body-clip)">
        <rect
          x={specX - (240 / m.mmPerPx)}
          y={yTop - 8}
          width={480 / m.mmPerPx}
          height={Math.max(6, yBelt - yTop)}
          fill="url(#mr-spec)"
          opacity={0.7}
          transform={`skewX(${-r.sunAz * 16})`}
          transform-origin={`${specX} ${yTop}`}
        />
        {/* horizon band — the hard edge that makes a body side read as metal */}
        <rect
          x={0}
          y={yBelt - 2}
          width={m.pxW}
          height={3}
          fill={pal.spec}
          opacity={0.28 + r.sunEl * 0.2}
        />
      </g>

      {/* glasshouse */}
      <path d={glassOutline(input, m)} fill="url(#mr-glass)" opacity={0.55 + r.tint * 0.45} />
      <g clipPath="url(#mr-body-clip)">
        <rect
          x={specX - (300 / m.mmPerPx)}
          y={yTop}
          width={200 / m.mmPerPx}
          height={Math.max(4, yBelt - yTop)}
          fill={pal.spec}
          opacity={0.16}
          transform={`skewX(${-24 - r.sunAz * 10})`}
          transform-origin={`${specX} ${yTop}`}
        />
      </g>

      {/* wheels */}
      {[0, g.wheelbase].map((ax) => (
        <g key={`w${ax}`}>
          <circle cx={m.sx(ax)} cy={m.sy(g.tireRadius)} r={g.tireRadius / m.mmPerPx} fill={pal.shadow} />
          <circle
            cx={m.sx(ax)}
            cy={m.sy(g.tireRadius)}
            r={(g.tireRadius * 0.63) / m.mmPerPx}
            fill={pal.skyMid}
            opacity={0.9}
          />
          {Array.from({ length: 7 }, (_, i) => {
            const a = (i / 7) * Math.PI * 2 + Math.PI / 14;
            const r1 = (g.tireRadius * 0.16) / m.mmPerPx;
            const r2 = (g.tireRadius * 0.58) / m.mmPerPx;
            return (
              <line
                key={i}
                x1={m.sx(ax) + r1 * Math.cos(a)}
                y1={m.sy(g.tireRadius) + r1 * Math.sin(a)}
                x2={m.sx(ax) + r2 * Math.cos(a)}
                y2={m.sy(g.tireRadius) + r2 * Math.sin(a)}
                stroke={pal.shadow}
                strokeWidth={Math.max(1, 26 / m.mmPerPx)}
                opacity={0.5}
              />
            );
          })}
          <circle cx={m.sx(ax)} cy={m.sy(g.tireRadius)} r={Math.max(2, 40 / m.mmPerPx)} fill={pal.shadow} />
          {/* contact shadow */}
          <ellipse
            cx={m.sx(ax)}
            cy={m.sy(0)}
            rx={(g.tireRadius * 0.8) / m.mmPerPx}
            ry={Math.max(2, 36 / m.mmPerPx)}
            fill={pal.shadow}
            opacity={0.45}
          />
        </g>
      ))}

      {/* the drawn lines, faint, so the author's hand still reads */}
      <path
        d={smoothPath(chainPts(input, TOP_CHAIN).map((p) => ({ x: m.sx(p.x), y: m.sy(p.z) })), 1)}
        fill="none"
        stroke={pal.shadow}
        strokeWidth={1.2}
        opacity={0.4}
      />

      {/* the sun */}
      <g data-testid="sun-handle" style={{ cursor: 'grab' }}>
        <circle cx={m.sx(sun.x)} cy={m.sy(sun.z)} r={13} fill={pal.spec} opacity={0.9} />
        <circle cx={m.sx(sun.x)} cy={m.sy(sun.z)} r={20} fill="none" stroke={pal.spec} strokeWidth={1.5} opacity={0.5} />
        {Array.from({ length: 8 }, (_, i) => {
          const a = (i / 8) * Math.PI * 2;
          return (
            <line
              key={i}
              x1={m.sx(sun.x) + 24 * Math.cos(a)}
              y1={m.sy(sun.z) + 24 * Math.sin(a)}
              x2={m.sx(sun.x) + 30 * Math.cos(a)}
              y2={m.sy(sun.z) + 30 * Math.sin(a)}
              stroke={pal.spec}
              strokeWidth={1.5}
              opacity={0.55}
            />
          );
        })}
        <title>drag the sun</title>
      </g>
    </g>
  );
}

export type { NormPt };
