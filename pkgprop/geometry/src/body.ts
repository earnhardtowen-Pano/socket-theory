import { interpolate, type Curve } from './curve.js';
import { cross, normalize, sub, v3, type V3 } from './vec.js';

/**
 * The body as two lofted volumes, the way a car actually decomposes.
 *
 * One loft from rocker to roof produces a blister, whatever the section shape
 * does at the beltline — the greenhouse break becomes a wiggle in one curve
 * instead of a boundary between two things. A car is a lower body running the
 * full length at full width, and a cabin sitting inboard of it between the
 * cowl and the backlight. Lofting them separately is what makes the hood a
 * hood, the DLO a DLO, and the shoulder a real ledge you could rest a hand on.
 *
 * Sculpting is a displacement field evaluated per section point. That is the
 * professional ideation grammar — creases along curves, recessed regions with
 * a rim, attachments placed on the surface — and none of it needs CSG, which
 * is why this stays watertight by construction no matter what is authored.
 */

export interface SectionShape {
  /** 0 flat across the roof, 1 strongly domed. */
  readonly crown: number;
  /** Height of maximum width, as a fraction from rocker (0) to top (1). */
  readonly shoulder: number;
  /** 0 slab sides, 1 strong tumblehome — the sill pulled in under the shoulder. */
  readonly tumblehome: number;
  /** How far the greenhouse sits inboard of the body at the belt, 0..1. */
  readonly glassInset: number;
}

/** A sculpt displacement: given a station and a half-section point, move it. */
export type Displace = (x: number, y: number, z: number) => { y: number; z: number };

export interface CarInput {
  /** Ascending station positions, nose to tail. */
  readonly stations: readonly number[];
  /** Upper silhouette height at a station — hood, roof, deck chain. */
  readonly topZ: (x: number) => number;
  /** Beltline height — where the body ends and the glass begins. */
  readonly beltZ: (x: number) => number;
  /** Plan half-width at a station. */
  readonly halfWidth: (x: number) => number;
  /** Lower edge of the body side. */
  readonly rockerZ: (x: number) => number;
  /** Greenhouse span, cowl to backlight base. Null for a car with no cabin. */
  readonly cabin: { readonly x0: number; readonly x1: number } | null;
  readonly shape: SectionShape;
  /** Points across one half-section. More is smoother, costs linearly. */
  readonly ribPoints: number;
  /** Sculpt field applied to the body volume. Symmetric by construction. */
  readonly displace?: Displace;
}

export interface Mesh {
  readonly positions: Float32Array;
  readonly normals: Float32Array;
  readonly indices: Uint32Array;
  readonly vertexCount: number;
  readonly triangleCount: number;
}

export interface CarBuild {
  readonly body: Mesh;
  /** Null when the roof never rises above the belt — a speedster has none. */
  readonly greenhouse: Mesh | null;
}

const clamp01 = (n: number): number => Math.min(1, Math.max(0, n));
const smooth = (t: number): number => {
  const s = clamp01(t);
  return s * s * (3 - 2 * s);
};

/**
 * One half-section, centreline outward and down to the sill. Four points, all
 * of them things a designer names out loud: the top, how quickly the crown
 * rolls off, where the car is widest, where the side meets the sill.
 */
export function halfSection(
  zTop: number,
  zBottom: number,
  halfWidth: number,
  shape: SectionShape,
): Curve {
  const crown = clamp01(shape.crown);
  const shoulder = clamp01(shape.shoulder);
  const tumble = clamp01(shape.tumblehome);
  const rise = Math.max(1, zTop - zBottom);
  const zShoulder = zBottom + rise * shoulder;

  const crownY = halfWidth * (0.18 + 0.42 * (1 - crown));
  const crownZ = zTop - rise * (0.02 + 0.12 * crown);
  const sillY = halfWidth * (1 - 0.66 * tumble);

  const raw = interpolate([
    v3(0, 0, zTop),
    v3(0, crownY, crownZ),
    v3(0, halfWidth, zShoulder),
    v3(0, sillY, zBottom),
  ]);

  // A cubic through four points overshoots past the widest one, and the plan
  // half-width is a solved wall. Scale back to the target rather than clamp,
  // which would leave a flat spot along the widest point.
  let peak = 0;
  for (let i = 0; i <= 64; i += 1) peak = Math.max(peak, raw.at(i / 64).y);
  const k = peak > halfWidth ? halfWidth / peak : 1;
  if (k === 1) return raw;
  return {
    at: (u) => {
      const p = raw.at(u);
      return v3(p.x, p.y * k, p.z);
    },
    tangentAt: (u) => raw.tangentAt(u),
    sample: (n) => raw.sample(n).map((p) => v3(p.x, p.y * k, p.z)),
  };
}

/** How many points span the underfloor when closing a rib into a loop. */
const FLOOR_POINTS = 3;

interface LoftSpec {
  readonly stations: readonly number[];
  readonly top: (x: number) => number;
  readonly bottom: (x: number) => number;
  readonly half: (x: number) => number;
  readonly shape: SectionShape;
  readonly ribPoints: number;
  readonly displace?: Displace;
}

/**
 * A full rib as a closed loop: up the left side, over the top, down the right,
 * back across the underside. The loop must close or the loft is an open tube
 * — visible straight up into the car, caps that never seal, no solid export.
 *
 * The sculpt field is applied to the half-section before mirroring, so any
 * authored cut or crease lands identically on both sides of the car.
 */
function rib(x: number, spec: LoftSpec): V3[] {
  const n = Math.max(4, spec.ribPoints);
  const curve = halfSection(spec.top(x), spec.bottom(x), Math.max(1, spec.half(x)), spec.shape);
  const right = curve.sample(n - 1).map((p) => {
    if (!spec.displace) return v3(x, p.y, p.z);
    const d = spec.displace(x, p.y, p.z);
    return v3(x, Math.max(0, d.y), d.z);
  });
  const left: V3[] = [];
  for (let i = right.length - 1; i >= 1; i -= 1) {
    const p = right[i]!;
    left.push(v3(p.x, -p.y, p.z));
  }
  const loop = [...left, ...right];
  const last = loop[loop.length - 1]!;
  const first = loop[0]!;
  for (let i = 1; i < FLOOR_POINTS; i += 1) {
    const t = i / FLOOR_POINTS;
    loop.push(v3(x, last.y + (first.y - last.y) * t, last.z + (first.z - last.z) * t));
  }
  return loop;
}

/** Fraction the cap ring shrinks by — the corner radius of a nose or tail. */
const CAP_SHRINK = 0.55;

function loft(spec: LoftSpec): Mesh {
  const stations = [...spec.stations].sort((a, b) => a - b);
  if (stations.length < 2) throw new Error('A loft needs at least two stations.');

  const ribs = stations.map((x) => rib(x, spec));
  const perRib = ribs[0]!.length;

  const pos: number[] = [];
  const idx: number[] = [];
  for (const r of ribs) for (const p of r) pos.push(p.x, p.y, p.z);

  for (let s = 0; s < ribs.length - 1; s += 1) {
    const a = s * perRib;
    const b = (s + 1) * perRib;
    for (let i = 0; i < perRib; i += 1) {
      const j = (i + 1) % perRib;
      idx.push(a + i, b + i, a + j);
      idx.push(a + j, b + i, b + j);
    }
  }

  // Rounded caps: one shrunken ring inboard of each end turns the corner over
  // a radius instead of fanning a flat disc square across the car.
  const capOf = (ribIndex: number, flip: boolean): void => {
    const r = ribs[ribIndex]!;
    let cx = 0;
    let cy = 0;
    let cz = 0;
    for (const p of r) {
      cx += p.x;
      cy += p.y;
      cz += p.z;
    }
    const c = v3(cx / r.length, cy / r.length, cz / r.length);
    const ring = pos.length / 3;
    for (const p of r) {
      pos.push(p.x, c.y + (p.y - c.y) * CAP_SHRINK, c.z + (p.z - c.z) * CAP_SHRINK);
    }
    const base = ribIndex * perRib;
    for (let i = 0; i < perRib; i += 1) {
      const j = (i + 1) % perRib;
      if (flip) {
        idx.push(base + i, ring + i, base + j);
        idx.push(base + j, ring + i, ring + j);
      } else {
        idx.push(base + j, ring + i, base + i);
        idx.push(ring + j, ring + i, base + j);
      }
    }
    const hub = pos.length / 3;
    pos.push(c.x, c.y, c.z);
    for (let i = 0; i < perRib; i += 1) {
      const j = (i + 1) % perRib;
      if (flip) idx.push(hub, ring + j, ring + i);
      else idx.push(hub, ring + i, ring + j);
    }
  };
  capOf(0, true);
  capOf(ribs.length - 1, false);

  const positions = new Float32Array(pos);
  const indices = new Uint32Array(idx);
  return {
    positions,
    normals: vertexNormals(positions, indices),
    indices,
    vertexCount: positions.length / 3,
    triangleCount: indices.length / 3,
  };
}

/** How far the greenhouse tucks below the belt, hidden inside the body. */
const GLASS_TUCK = 60;
/** Plan rounding run at the A-pillar and the backlight corners. */
const GLASS_END_RUN = 260;

export function buildCar(input: CarInput): CarBuild {
  const { cabin } = input;

  // With a cabin, the body volume is belt-capped everywhere: the hood and
  // deck sit below the belt on any real car, so the cap only ever bites where
  // the silhouette is glass — and glass belongs to the greenhouse. Blending
  // near the cabin edges instead lets the fender spike up the windshield
  // base, which is exactly the blister this split exists to kill.
  const bodyTop = (x: number): number => {
    const top = input.topZ(x);
    return cabin ? Math.min(top, input.beltZ(x)) : top;
  };

  const body = loft({
    stations: input.stations,
    top: (x) => Math.max(input.rockerZ(x) + 1, bodyTop(x)),
    bottom: (x) => input.rockerZ(x),
    half: (x) => Math.max(20, input.halfWidth(x)),
    shape: input.shape,
    ribPoints: input.ribPoints,
    ...(input.displace ? { displace: input.displace } : {}),
  });

  let greenhouse: Mesh | null = null;
  if (cabin && cabin.x1 - cabin.x0 > 200) {
    const inset = clamp01(input.shape.glassInset);
    const span = cabin.x1 - cabin.x0;
    // A real greenhouse is nearly as wide as the body — the DLO sits just
    // inboard of the shoulder, and the A- and C-pillars round it off over a
    // short run. Pinching it to two thirds turned the cabin into a fin
    // standing on the deck instead of a cabin let into the body.
    const taper = (x: number): number => {
      const a = smooth((x - cabin.x0) / GLASS_END_RUN);
      const b = smooth((cabin.x1 - x) / GLASS_END_RUN);
      return 0.82 + 0.18 * Math.min(a, b);
    };
    const gBase = (x: number): number => input.beltZ(x) - GLASS_TUCK;
    const gTop = (x: number): number => input.topZ(x);
    const stations: number[] = [];
    for (const d of [10, 40, 90, 160]) {
      stations.push(cabin.x0 + d, cabin.x1 - d);
    }
    for (const x of input.stations) {
      if (x > cabin.x0 + 160 && x < cabin.x1 - 160) stations.push(x);
    }
    const live = [...new Set(stations)]
      .sort((a, b) => a - b)
      .filter((x) => gTop(x) > gBase(x) + 40 && span > 0);
    if (live.length >= 2) {
      greenhouse = loft({
        stations: live,
        top: gTop,
        bottom: gBase,
        half: (x) => Math.max(16, input.halfWidth(x) * (1 - 0.24 * inset) * taper(x)),
        // The greenhouse is its own volume with its own lean: strongly domed,
        // carried high, leaned hard — the DLO wrapping over the driver.
        shape: { crown: 0.4, shoulder: 0.34, tumblehome: 0.34, glassInset: 0 },
        ribPoints: Math.max(8, Math.round(input.ribPoints * 0.75)),
      });
    }
  }

  return { body, greenhouse };
}

/**
 * The composed half-section at one station — body, and glass where there is
 * glass. This is what SECTIONS draws, and it is computed from the same tables
 * as the loft so the drawing and the surface can never disagree.
 */
export function sectionAt(
  input: CarInput,
  x: number,
  samples = 40,
): { body: V3[]; greenhouse: V3[] | null } {
  const bodyTop = input.cabin
    ? Math.min(input.topZ(x), input.beltZ(x))
    : input.topZ(x);
  const bodyCurve = halfSection(
    Math.max(input.rockerZ(x) + 1, bodyTop),
    input.rockerZ(x),
    Math.max(20, input.halfWidth(x)),
    input.shape,
  );
  const body = bodyCurve.sample(samples).map((p) => {
    if (!input.displace) return v3(x, p.y, p.z);
    const d = input.displace(x, p.y, p.z);
    return v3(x, Math.max(0, d.y), d.z);
  });
  let greenhouse: V3[] | null = null;
  const { cabin } = input;
  if (cabin && x > cabin.x0 && x < cabin.x1) {
    const inset = clamp01(input.shape.glassInset);
    const a = smooth((x - cabin.x0) / GLASS_END_RUN);
    const b = smooth((cabin.x1 - x) / GLASS_END_RUN);
    const taper = 0.82 + 0.18 * Math.min(a, b);
    const base = input.beltZ(x) - GLASS_TUCK;
    const top = input.topZ(x);
    if (top > base + 40) {
      const half = Math.max(16, input.halfWidth(x) * (1 - 0.24 * inset) * taper);
      greenhouse = halfSection(top, base, half, {
        crown: 0.4,
        shoulder: 0.34,
        tumblehome: 0.34,
        glassInset: 0,
      })
        .sample(samples)
        .map((p) => v3(x, p.y, p.z));
    }
  }
  return { body, greenhouse };
}


/**
 * Area-weighted vertex normals. The cross product of two edges is already
 * proportional to twice the triangle's area, so accumulating it unnormalised
 * weights big triangles over slivers — which keeps a highlight from kinking
 * where the tessellation happens to get dense.
 */
export function vertexNormals(positions: Float32Array, indices: Uint32Array): Float32Array {
  const out = new Float32Array(positions.length);
  const get = (i: number): V3 =>
    v3(positions[i * 3] ?? 0, positions[i * 3 + 1] ?? 0, positions[i * 3 + 2] ?? 0);

  for (let t = 0; t < indices.length; t += 3) {
    const ia = indices[t] ?? 0;
    const ib = indices[t + 1] ?? 0;
    const ic = indices[t + 2] ?? 0;
    const n = cross(sub(get(ib), get(ia)), sub(get(ic), get(ia)));
    for (const i of [ia, ib, ic]) {
      out[i * 3] = (out[i * 3] ?? 0) + n.x;
      out[i * 3 + 1] = (out[i * 3 + 1] ?? 0) + n.y;
      out[i * 3 + 2] = (out[i * 3 + 2] ?? 0) + n.z;
    }
  }
  for (let i = 0; i < out.length; i += 3) {
    const n = normalize(v3(out[i] ?? 0, out[i + 1] ?? 0, out[i + 2] ?? 0));
    out[i] = n.x;
    out[i + 1] = n.y;
    out[i + 2] = n.z;
  }
  return out;
}

/** Axis-aligned bounds, for framing a camera on the thing. */
export function bounds(mesh: Mesh): { min: V3; max: V3 } {
  let mnx = Infinity;
  let mny = Infinity;
  let mnz = Infinity;
  let mxx = -Infinity;
  let mxy = -Infinity;
  let mxz = -Infinity;
  for (let i = 0; i < mesh.positions.length; i += 3) {
    const x = mesh.positions[i] ?? 0;
    const y = mesh.positions[i + 1] ?? 0;
    const z = mesh.positions[i + 2] ?? 0;
    mnx = Math.min(mnx, x);
    mny = Math.min(mny, y);
    mnz = Math.min(mnz, z);
    mxx = Math.max(mxx, x);
    mxy = Math.max(mxy, y);
    mxz = Math.max(mxz, z);
  }
  return { min: v3(mnx, mny, mnz), max: v3(mxx, mxy, mxz) };
}
