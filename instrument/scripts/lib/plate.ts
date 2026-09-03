/**
 * The plate — one camera, one palette, one layout for every lens sheet.
 *
 * WHY THIS EXISTS. The first two lens pictures were written twice, and the
 * third would have been written a third time: the same projection, the same
 * painter's algorithm, the same log ramp, the same header. That is how a set of
 * readings stops looking like an instrument and starts looking like a pile of
 * scripts — each one slightly different in a way that means nothing, so a
 * reader has to re-learn the drawing before they can read the number.
 *
 * So the camera, the ramps, the body shading and the sheet furniture live here
 * and nowhere else. A lens script says what to colour and by how much; it does
 * not get to choose where the light is.
 *
 * WHAT IS FIXED, AND WHY EACH ONE IS FIXED
 *
 *  - THE CAMERA. A three-quarter from above and behind, the angle a designer
 *    walks around a clay to. Fixed so two sheets can be laid side by side and
 *    the same panel is the same panel.
 *  - THE LIGHT. One direction for the grey body shading in every panel, so a
 *    dark patch is a dark patch and never the lighting.
 *  - THE RAMPS. Two, and only two. `heat` for "how much", logarithmic because
 *    every quantity on a car body spans four orders of magnitude and a linear
 *    ramp shows one red cell on a black car. `signed` for quantities with a
 *    zero that means something — draft, where the sign is the difference
 *    between a part that comes out of the tool and one that does not.
 *  - THE BODY. Near-black, lit only enough to read the form. The reading is
 *    the colour; the car is the ground it sits on.
 *
 * Deterministic: no clock, no randomness, and the projection is arithmetic.
 */

import { cross3, len3, ncos, nfloor, nsin, PI } from "@car/num";
import type { Pt3 } from "@car/schema";

// ── the camera ─────────────────────────────────────────────────────────────

/** Three-quarter from above and behind — the angle you walk round a clay to. */
export const YAW_DEG = -34;
export const PITCH_DEG = 20;

/**
 * The direction in model space along which `project`'s depth increases — which
 * is toward the camera, since the sort draws largest depth last.
 *
 * Read straight off the depth row of the projection rather than re-derived, so
 * a change to the camera cannot leave the culling pointing somewhere else.
 */
export function viewDirection(yawDeg = YAW_DEG, pitchDeg = PITCH_DEG): Pt3 {
  const yaw = (yawDeg * PI) / 180;
  const pitch = (pitchDeg * PI) / 180;
  return [nsin(yaw) * ncos(pitch), ncos(yaw) * ncos(pitch), -nsin(pitch)];
}

export function project(p: Pt3, yawDeg = YAW_DEG, pitchDeg = PITCH_DEG): [number, number, number] {
  const yaw = (yawDeg * PI) / 180;
  const pitch = (pitchDeg * PI) / 180;
  const cx = p[0] * ncos(yaw) - p[1] * nsin(yaw);
  const cy = p[0] * nsin(yaw) + p[1] * ncos(yaw);
  // Screen y runs down, so the vertical axis is negated once, here.
  return [cx, -(cy * nsin(pitch) + p[2] * ncos(pitch)), cy * ncos(pitch) - p[2] * nsin(pitch)];
}

export interface Plate {
  readonly width: number;
  readonly panelHeight: number;
  readonly pad: number;
  readonly gap: number;
  readonly headHeight: number;
  readonly footHeight: number;
}

export const PLATE: Plate = {
  width: 1180, panelHeight: 330, pad: 62, gap: 30, headHeight: 118, footHeight: 76,
};

export interface View {
  readonly yawDeg: number;
  readonly pitchDeg: number;
  readonly screen: readonly [number, number, number][];
  readonly scale: number;
  readonly ox: number;
  readonly minY: number;
  /** Screen coordinates of a projected point inside a panel at y0. */
  at(i: number, y0: number): [number, number];
  place(p: Pt3, y0: number): [number, number];
}

/**
 * A view of the model, fitted to a panel.
 *
 * The camera defaults to the plate's, so panels are comparable by default. A
 * panel that overrides it is answering a question the standard view cannot
 * show — the draft reading asks what faces DOWN, and there is no arrangement
 * of a top three-quarter that answers that — and it says so in its caption.
 */
export function fitView(
  points: readonly Pt3[], plate: Plate = PLATE,
  yawDeg = YAW_DEG, pitchDeg = PITCH_DEG,
): View {
  const screen = points.map((p) => project(p, yawDeg, pitchDeg));
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const [x, y] of screen) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const scale = Math.min(
    (plate.width - plate.pad * 2) / (maxX - minX),
    (plate.panelHeight - 14) / (maxY - minY),
  );
  const ox = plate.pad + ((plate.width - plate.pad * 2) - (maxX - minX) * scale) / 2 - minX * scale;
  const at = (i: number, y0: number): [number, number] => {
    const q = screen[i]!;
    return [ox + q[0] * scale, y0 + (q[1] - minY) * scale];
  };
  const place = (p: Pt3, y0: number): [number, number] => {
    const q = project(p, yawDeg, pitchDeg);
    return [ox + q[0] * scale, y0 + (q[1] - minY) * scale];
  };
  return { yawDeg, pitchDeg, screen, scale, ox, minY, at, place };
}

// ── the palette ────────────────────────────────────────────────────────────

type Stop = readonly [number, number, number, number];

function mix(stops: readonly Stop[], t: number): string {
  const u = t < 0 ? 0 : t > 1 ? 1 : t;
  let a = stops[0]!, b = stops[stops.length - 1]!;
  for (let i = 1; i < stops.length; i++) {
    if (u <= stops[i]![0]) { a = stops[i - 1]!; b = stops[i]!; break; }
  }
  const f = b[0] === a[0] ? 0 : (u - a[0]) / (b[0] - a[0]);
  const c = (k: number): number => Math.round(a[k]! + (b[k]! - a[k]!) * f);
  return `rgb(${c(1)},${c(2)},${c(3)})`;
}

const HEAT: readonly Stop[] = [
  [0, 28, 111, 122], [0.35, 60, 170, 150], [0.62, 235, 165, 45],
  [0.82, 255, 80, 40], [1, 255, 250, 245],
];
const SIGNED: readonly Stop[] = [
  [0, 255, 70, 50], [0.34, 210, 120, 70], [0.5, 120, 120, 124],
  [0.66, 60, 150, 175], [1, 175, 225, 235],
];

export interface Ramp {
  (v: number): string;
  readonly lo: number;
  readonly hi: number;
  readonly log: boolean;
}

/** "How much", logarithmic. Values at or under `lo` are the floor colour. */
export function heatRamp(lo: number, hi: number): Ramp {
  const f = ((v: number): string => {
    if (!(v > lo)) return mix(HEAT, 0);
    return mix(HEAT, Math.log10(v / lo) / Math.log10(hi / lo));
  }) as { (v: number): string; lo: number; hi: number; log: boolean };
  f.lo = lo; f.hi = hi; f.log = true;
  return f;
}

/** A signed quantity with a meaningful zero, linear across it. */
export function signedRamp(lo: number, hi: number): Ramp {
  const f = ((v: number): string => mix(SIGNED, (v - lo) / (hi - lo))) as
    { (v: number): string; lo: number; hi: number; log: boolean };
  f.lo = lo; f.hi = hi; f.log = false;
  return f;
}

// ── the body ───────────────────────────────────────────────────────────────

export const LIGHT: Pt3 = [0.30, -0.45, 0.84];

export interface BodyMesh {
  readonly positions: Float64Array;
  readonly indices: Uint32Array;
}

const vertexOf = (m: BodyMesh, i: number): Pt3 =>
  [m.positions[i * 3]!, m.positions[i * 3 + 1]!, m.positions[i * 3 + 2]!];

/**
 * Every triangle, far first, coloured by `colourOf` — or as bare dark form when
 * that is omitted, which is the ground a seam drawing sits on.
 *
 * Painter's algorithm rather than a z-buffer: the body is closed, so sorting by
 * centroid depth is exact enough at this scale and it keeps the output a flat
 * list of paths that any renderer will take.
 */
export interface Drawable { readonly d: number; readonly s: string }

/** Sort far-to-near and join. Anything with a depth can go in the same list —
 *  a contour line drawn this way is hidden by the body in front of it, which
 *  is the only way an overlay on a closed form reads correctly. */
export const compose = (items: readonly Drawable[]): string =>
  [...items].sort((a, b) => a.d - b.d).map((t) => t.s).join("");

export function bodyDrawables(
  mesh: BodyMesh, y0: number, view: View,
  colourOf?: (tri: number, a: number, b: number, c: number) => string,
): Drawable[] {
  const tris: { d: number; s: string }[] = [];
  for (let t = 0; t + 2 < mesh.indices.length; t += 3) {
    const ia = mesh.indices[t]!, ib = mesh.indices[t + 1]!, ic = mesh.indices[t + 2]!;
    const A = vertexOf(mesh, ia), B = vertexOf(mesh, ib), C = vertexOf(mesh, ic);
    const n = cross3(
      [B[0] - A[0], B[1] - A[1], B[2] - A[2]],
      [C[0] - A[0], C[1] - A[1], C[2] - A[2]],
    );
    const L = len3(n) || 1;
    const lit = Math.max(0.05,
      (n[0] / L) * LIGHT[0] + (n[1] / L) * LIGHT[1] + (n[2] / L) * LIGHT[2]);
    const pa = view.at(ia, y0), pb = view.at(ib, y0), pc = view.at(ic, y0);
    const path = `M${pa[0].toFixed(1)},${pa[1].toFixed(1)}` +
      `L${pb[0].toFixed(1)},${pb[1].toFixed(1)}L${pc[0].toFixed(1)},${pc[1].toFixed(1)}Z`;
    const fill = colourOf
      ? colourOf(t / 3, ia, ib, ic)
      : `rgb(${nfloor(14 + lit * 40)},${nfloor(14 + lit * 40)},${nfloor(16 + lit * 40)})`;
    tris.push({
      d: (view.screen[ia]![2] + view.screen[ib]![2] + view.screen[ic]![2]) / 3,
      // Stroke matches fill: without it the SVG rasteriser leaves hairlines
      // between adjacent triangles and the body reads as a mesh drawing.
      s: `<path d="${path}" fill="${fill}" stroke="${fill}" stroke-width="0.4"/>`,
    });
  }
  return tris;
}

export function paintBody(
  mesh: BodyMesh, y0: number, view: View,
  colourOf?: (tri: number, a: number, b: number, c: number) => string,
): string {
  return compose(bodyDrawables(mesh, y0, view, colourOf));
}

/**
 * Line segments as drawables, biased toward the camera so a contour is not
 * z-fought by the triangle it was extracted from.
 *
 * The bias is a fraction of the model's depth range rather than a constant:
 * a fixed one is either invisible on a large body or lifts lines off a small
 * one, and neither failure announces itself.
 */
export function segmentDrawables(
  segments: Float64Array, y0: number, view: View,
  stroke: string, width = 1.1, biasFraction = 3e-3,
  stride = 6, cull?: (i: number) => boolean,
): Drawable[] {
  let lo = Infinity, hi = -Infinity;
  for (const q of view.screen) { if (q[2] < lo) lo = q[2]; if (q[2] > hi) hi = q[2]; }
  const bias = (hi - lo) * biasFraction;
  const out: Drawable[] = [];
  for (let i = 0; i + stride - 1 < segments.length; i += stride) {
    if (cull && cull(i)) continue;
    const a: Pt3 = [segments[i]!, segments[i + 1]!, segments[i + 2]!];
    const b: Pt3 = [segments[i + 3]!, segments[i + 4]!, segments[i + 5]!];
    const pa = view.place(a, y0), pb = view.place(b, y0);
    const d = (project(a, view.yawDeg, view.pitchDeg)[2]
      + project(b, view.yawDeg, view.pitchDeg)[2]) / 2 + bias;
    out.push({
      d,
      s: `<line x1="${pa[0].toFixed(1)}" y1="${pa[1].toFixed(1)}" x2="${pb[0].toFixed(1)}" ` +
        `y2="${pb[1].toFixed(1)}" stroke="${stroke}" stroke-width="${width}" stroke-linecap="round"/>`,
    });
  }
  return out;
}

/** Shade a triangle's colour by how the light falls on it, so a painted body
 *  still reads as a body and not as a flat map. */
export function litBy(colour: string, lit: number): string {
  const m = /rgb\((\d+),(\d+),(\d+)\)/.exec(colour);
  if (!m) return colour;
  const k = 0.45 + 0.55 * Math.max(0, Math.min(1, lit));
  return `rgb(${Math.round(+m[1]! * k)},${Math.round(+m[2]! * k)},${Math.round(+m[3]! * k)})`;
}

// ── the sheet ──────────────────────────────────────────────────────────────

export interface Panel {
  readonly title: string;
  readonly subtitle: string;
  /** SVG for this panel, drawn with its top at y0. */
  draw(y0: number): string;
}

export interface SheetOptions {
  readonly title: string;
  readonly lines: readonly string[];
  readonly panels: readonly Panel[];
  readonly ramp?: Ramp;
  readonly rampLabel?: string;
  readonly rampTicks?: readonly number[];
  readonly footer?: readonly string[];
  readonly plate?: Plate;
}

export function sheet(opts: SheetOptions): string {
  const plate = opts.plate ?? PLATE;
  const rows = opts.panels.length;
  const H = plate.headHeight + rows * (plate.panelHeight + plate.gap) + plate.footHeight;
  const W = plate.width;

  const caption = (p: Panel, y: number): string =>
    `<text class="cap" x="${plate.pad}" y="${y}">${p.title}</text>` +
    `<text class="ax" x="${plate.pad}" y="${y + 16}">${p.subtitle}</text>`;

  const body = opts.panels.map((p, i) => {
    const y0 = plate.headHeight + i * (plate.panelHeight + plate.gap);
    return caption(p, y0 - 14) + p.draw(y0 + 8);
  }).join("\n");

  let legend = "";
  if (opts.ramp) {
    const r = opts.ramp;
    const x0 = W - plate.pad - 300, y = H - plate.footHeight + 36;
    const bar = Array.from({ length: 150 }, (_, i) => {
      const f = i / 149;
      const v = r.log ? r.lo * Math.pow(r.hi / r.lo, f) : r.lo + (r.hi - r.lo) * f;
      return `<rect x="${(x0 + i * 2).toFixed(1)}" y="${y - 12}" width="2.2" height="12" fill="${r(v)}"/>`;
    }).join("");
    const ticks = (opts.rampTicks ?? []).map((v) => {
      const f = r.log
        ? Math.log10(v / r.lo) / Math.log10(r.hi / r.lo)
        : (v - r.lo) / (r.hi - r.lo);
      const label = Math.abs(v) >= 1 || v === 0 ? String(v) : String(v);
      return `<text class="ax" x="${(x0 + f * 300).toFixed(1)}" y="${y + 13}" text-anchor="middle">${label}</text>`;
    }).join("");
    legend = `${bar}${ticks}<text class="ax" x="${x0 - 10}" y="${y - 2}" text-anchor="end">${opts.rampLabel ?? ""}</text>`;
  }

  const foot = (opts.footer ?? []).map((t, i) =>
    `<text class="ax" x="${plate.pad}" y="${H - plate.footHeight + 36 + i * 14}">${t}</text>`).join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<style>
  text { font-family: ui-monospace, Menlo, monospace; fill: #8f8f88; }
  .t   { fill: #e6e6e0; font-size: 18px; letter-spacing: .26em; text-transform: uppercase; }
  .s   { font-size: 12.5px; letter-spacing: .12em; }
  .cap { font-size: 13px; letter-spacing: .16em; fill: #d8d8d2; }
  .ax  { font-size: 10.5px; letter-spacing: .06em; }
</style>
<rect width="${W}" height="${H}" fill="#08080a"/>
<text class="t" x="${plate.pad}" y="44">${opts.title}</text>
${opts.lines.map((l, i) => `<text class="s" x="${plate.pad}" y="${70 + i * 20}">${l}</text>`).join("")}
${body}
${legend}
${foot}
</svg>
`;
}
