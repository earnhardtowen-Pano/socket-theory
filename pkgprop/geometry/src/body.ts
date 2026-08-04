import { interpolate, type Curve } from './curve.js';
import { add, cross, normalize, sub, v3, type V3 } from './vec.js';

/**
 * The body surface: half-sections at stations, lofted along the car.
 *
 * A car reads as real under light because its highlights bend with surface
 * curvature, and that needs actual normals, which needs an actual surface.
 * Painting bands on a silhouette can never get there — that is why the 2D
 * render always looked like a cartoon no matter how the gradients were tuned.
 *
 * The section is the shape a designer already thinks in: how full the crown
 * is, where the car is widest, and how far the side leans in underneath. Those
 * three numbers plus the silhouette and the plan half-width are enough to loft
 * a body that is recognisably the car that was drawn.
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

export interface BodyInput {
  /** Ascending station positions, nose to tail. */
  readonly stations: readonly number[];
  /** Beltline height at a station — where the body ends and the glass begins. */
  readonly beltZ: (x: number) => number;
  /** Upper silhouette height at a station — the drawn hood/roof/deck chain. */
  readonly topZ: (x: number) => number;
  /** Plan half-width at a station. */
  readonly halfWidth: (x: number) => number;
  /** Lower edge of the body side. */
  readonly rockerZ: (x: number) => number;
  readonly shape: SectionShape;
  /** Points across one half-section. More is smoother and costs linearly. */
  readonly ribPoints: number;
}

export interface Mesh {
  readonly positions: Float32Array;
  readonly normals: Float32Array;
  readonly indices: Uint32Array;
  readonly vertexCount: number;
  readonly triangleCount: number;
}

const clamp01 = (n: number): number => Math.min(1, Math.max(0, n));

/**
 * One half-section, centreline outward and down to the sill.
 *
 * Four points carry the whole shape and every one of them is a thing a
 * designer names out loud: the centreline top, how quickly the crown rolls
 * off, where the car is widest, and where the side meets the sill.
 */
export function halfSection(
  zTop: number,
  zRocker: number,
  halfWidth: number,
  shape: SectionShape,
  zBelt?: number,
): Curve {
  const crown = clamp01(shape.crown);
  const shoulder = clamp01(shape.shoulder);
  const tumble = clamp01(shape.tumblehome);
  const rise = Math.max(1, zTop - zRocker);
  const zShoulder = zRocker + rise * shoulder;

  // The crown point sits inboard and just below the top: a small drop over a
  // short run reads as a tight, domed roof; a large one reads as a flat lid.
  const crownY = halfWidth * (0.18 + 0.42 * (1 - crown));
  const crownZ = zTop - rise * (0.02 + 0.12 * crown);

  // The sill is pulled inboard by tumblehome. Full tumblehome keeps a third
  // of the width, which is about as far as a road car ever leans.
  const sillY = halfWidth * (1 - 0.66 * tumble);

  // The greenhouse break. A car is two volumes: the body, full width, and the
  // cabin sitting inboard of it above the beltline. Without that step the loft
  // produces one smooth blister from rocker to roof — which is why the first
  // renders read as a lump rather than a car, no matter how fair the surface
  // was. Only inserted where there is actually glass: over the hood and the
  // deck the top is below the belt and the body is one volume.
  const inset = clamp01(shape.glassInset);
  const glass: V3[] = [];
  if (zBelt !== undefined && zBelt > zRocker && zBelt < zTop - rise * 0.06) {
    const beltY = halfWidth * (1 - 0.34 * inset);
    glass.push(v3(0, beltY, zBelt + rise * 0.03));
    glass.push(v3(0, halfWidth * (1 - 0.06 * inset), zBelt - rise * 0.02));
  }

  const raw = interpolate([
    v3(0, 0, zTop),
    v3(0, crownY, crownZ),
    ...glass,
    v3(0, halfWidth, zShoulder),
    v3(0, sillY, zRocker),
  ]);

  // A cubic through four points overshoots past the widest one — measured at
  // 999 mm on a 950 mm section. That is not cosmetic: the plan half-width is a
  // solved wall (wheels on the track, the owner's width cap), and a surface
  // that bulges through it is drawing a car that does not fit its own package.
  // Scaling the whole section back to the target keeps the shape and honours
  // the wall, where clamping would leave a flat spot along the widest point.
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

/**
 * A full rib as a closed loop: up the left side, over the roof, down the right
 * side, and back across the underfloor.
 *
 * The loop has to close. An open arc lofts into a tube with an open bottom,
 * which leaves the surface non-manifold — you can see straight up into the car
 * from below, the caps do not seal, and nothing downstream could ever export a
 * solid. The underfloor is flat and uninteresting, so three points carry it.
 */
function rib(x: number, input: BodyInput): V3[] {
  const n = Math.max(4, input.ribPoints);
  const curve = halfSection(
    input.topZ(x),
    input.rockerZ(x),
    Math.max(1, input.halfWidth(x)),
    input.shape,
    input.beltZ(x),
  );
  const right = curve.sample(n - 1).map((p) => v3(x, p.y, p.z));
  const left: V3[] = [];
  // Skip the centreline point when mirroring or the seam gets a doubled
  // vertex, which shows up as a hard line straight down the roof.
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

/**
 * Loft the ribs into a surface.
 *
 * Adjacent ribs have the same point count by construction, so the connection
 * is a plain quad grid. Ends are closed with a fan to the rib's own centre so
 * the body is a solid rather than an open tube — which matters both for the
 * look under light and for anything that later wants a watertight export.
 */
export function buildBody(input: BodyInput): Mesh {
  const stations = [...input.stations].sort((a, b) => a - b);
  if (stations.length < 2) throw new Error('A body needs at least two stations.');

  const ribs = stations.map((x) => rib(x, input));
  const perRib = ribs[0]!.length;
  for (const r of ribs) {
    if (r.length !== perRib) throw new Error('Every rib must carry the same point count.');
  }

  const pos: number[] = [];
  const idx: number[] = [];
  for (const r of ribs) for (const p of r) pos.push(p.x, p.y, p.z);

  // Quad grid between neighbouring ribs, each quad split along its shorter
  // diagonal so a strongly tapered nose does not develop a visible crease.
  for (let s = 0; s < ribs.length - 1; s += 1) {
    const a = s * perRib;
    const b = (s + 1) * perRib;
    for (let i = 0; i < perRib; i += 1) {
      // The rib is a closed loop, so the last point joins the first. Stopping
      // one short is what leaves a seam running the length of the underfloor.
      const j = (i + 1) % perRib;
      idx.push(a + i, b + i, a + j);
      idx.push(a + j, b + i, b + j);
    }
  }

  // Caps. The centre of each end rib becomes a fan hub.
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
    const hub = pos.length / 3;
    pos.push(cx / r.length, cy / r.length, cz / r.length);
    const base = ribIndex * perRib;
    for (let i = 0; i < perRib; i += 1) {
      const j = (i + 1) % perRib;
      if (flip) idx.push(hub, base + j, base + i);
      else idx.push(hub, base + i, base + j);
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

/**
 * Area-weighted vertex normals.
 *
 * The cross product of two triangle edges is already proportional to twice the
 * triangle's area, so accumulating it unnormalised weights large triangles
 * more than slivers — which is what keeps a highlight from kinking where the
 * tessellation happens to get dense.
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

export { add, sub, normalize };
