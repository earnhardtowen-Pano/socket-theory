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
  /**
   * Lower edge of the *body side* at a station — where the visible flank
   * stops. The rocker, riding up over a wheel arch where one is cut.
   *
   * This is how an opening gets cut without CSG: the bodyside simply is not
   * there below the arch. It is deliberately separate from `floorZ`, because
   * raising the whole section over a wheel puts a shelf clean across the car
   * and the body stops reading as one object.
   */
  readonly sillZ: (x: number) => number;
  /**
   * The underfloor at a station. Stays down at the rocker under an arch — the
   * space between the two is the wheel well.
   */
  readonly floorZ: (x: number) => number;
  /**
   * How far inboard the wheel well's inner wall stands, as a half-width in
   * millimetres. Omitted, the well wall sits halfway out, which is a guess;
   * supply it from the track and the tire section and it is not.
   */
  readonly wellY?: (x: number) => number;
  /** Greenhouse span, cowl to backlight base. Null for a car with no cabin. */
  readonly cabin: { readonly x0: number; readonly x1: number } | null;
  readonly shape: SectionShape;
  /** Points across one half-section. More is smoother, costs linearly. */
  readonly ribPoints: number;
  /**
   * How far past the first and last station the nose and tail round off.
   *
   * The caller owns the car's legal length, so the caller reserves this: stop
   * the stations short by `capDepth` and the body ends exactly where it should,
   * with a rounded nose instead of a flat face. Omitted, the caps are flat and
   * the body ends on its end stations.
   */
  readonly capDepth?: number;
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
 * `Math.max` with the corner taken off, blending over `k` millimetres.
 *
 * A hard max between two smooth rails is smooth everywhere except the one
 * station where they cross — and at that station the slope jumps. A slope jump
 * is invisible in the numbers and glaring in the render: it draws a hard line
 * across the panel wherever it lands, because shading reads the first
 * derivative. Every place two rails compete for the same boundary goes through
 * here instead.
 */
function softMax(a: number, b: number, k: number): number {
  const hi = Math.max(a, b);
  if (k <= 0) return hi;
  const d = Math.abs(a - b);
  if (d >= k) return hi;
  const t = 1 - d / k;
  return hi + k * 0.25 * t * t;
}

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

/**
 * Where the wheel well's inner wall stands when nobody says, as a fraction of
 * the sill half-width. A caller who knows the track and the tire section
 * should say instead — this is the fallback, not the answer.
 */
const WELL_Y_FRACTION = 0.52;

/** Points down one wall of the wheel well, from the arch lip to the floor. */
const WALL_POINTS = 6;

/**
 * Two stations closer together than this are the same station.
 *
 * Station lists get assembled from several sources — a regular grid, the
 * end-crowding near the caps, refinement around whatever is being sculpted —
 * and those sources collide. A duplicated station lofts a band of zero-area
 * triangles between two identical ribs: they contribute nothing to the vertex
 * normals and nothing to the picture, but they are real triangles that ship in
 * the mesh and would ship in an export.
 */
const MIN_STATION_GAP = 4;

function dedupe(stations: readonly number[]): number[] {
  const sorted = [...stations].sort((a, b) => a - b);
  return sorted.filter((x, i) => i === 0 || x - sorted[i - 1]! > MIN_STATION_GAP);
}

interface LoftSpec {
  readonly stations: readonly number[];
  readonly top: (x: number) => number;
  /** Lower edge of the visible flank. Rises over a wheel arch. */
  readonly sill: (x: number) => number;
  /** Underfloor. Stays down under an arch, so the well has a roof and a wall. */
  readonly floor: (x: number) => number;
  readonly half: (x: number) => number;
  readonly wellY?: (x: number) => number;
  readonly shape: SectionShape;
  readonly ribPoints: number;
  /** How far past the end ribs the nose and tail round off. */
  readonly capDepth?: number;
  readonly displace?: Displace;
}

/**
 * A full rib as a closed loop: up the left side, over the top, down the right,
 * then back across the underside. The loop must close or the loft is an open
 * tube — visible straight up into the car, caps that never seal, no solid
 * export.
 *
 * The underside is not a straight span. Where the sill has risen over a wheel
 * arch, the return path drops back to the underfloor first, so the section
 * reads as a body with a wheel well cut into it rather than a body that got
 * shorter. Spanning straight across at sill height instead puts a shelf the
 * full width of the car over each axle, and the body stops reading as one
 * object — it becomes a nose, a middle and a tail with hoops between them.
 *
 * The sculpt field is applied to the half-section before mirroring, so any
 * authored cut or crease lands identically on both sides of the car.
 */
export function halfRib(x: number, spec: LoftSpec): V3[] {
  const n = Math.max(4, spec.ribPoints);
  const floor = spec.floor(x);
  const sill = Math.max(floor, spec.sill(x));
  const curve = halfSection(spec.top(x), sill, Math.max(1, spec.half(x)), spec.shape);
  const flank = curve.sample(n - 1).map((p) => {
    if (!spec.displace) return v3(x, p.y, p.z);
    const d = spec.displace(x, p.y, p.z);
    return v3(x, Math.max(0, d.y), d.z);
  });

  // Under the arch lip and down the well's inner wall. The wall gets real
  // points rather than one edge: spanning from the lip straight to the floor
  // in a single quad band gave the opening a shading comb — a 600mm wall
  // carried by one strip of triangles, whose normals alternate with the quad's
  // diagonal. Under zebra it read as a saw. It is also the wrong shape: an
  // arch lip rolls under before the wall drops.
  const sillPt = flank[flank.length - 1]!;
  const sy = Math.abs(sillPt.y);
  const wellY = Math.min(sy * 0.98, spec.wellY?.(x) ?? sy * WELL_Y_FRACTION);
  const out = [...flank];
  for (let i = 1; i <= WALL_POINTS; i += 1) {
    const a = ((i / WALL_POINTS) * Math.PI) / 2;
    out.push(
      v3(
        x,
        wellY + (sy - wellY) * Math.cos(a),
        floor + (sillPt.z - floor) * (1 - Math.sin(a)),
      ),
    );
  }
  return out;
}

function rib(x: number, spec: LoftSpec): V3[] {
  const right = halfRib(x, spec);
  const left: V3[] = [];
  for (let i = right.length - 1; i >= 1; i -= 1) {
    const p = right[i]!;
    left.push(v3(p.x, -p.y, p.z));
  }
  const loop = [...left, ...right];
  // Across the floor to close the loop. The point count is fixed whatever the
  // sill does, because the loft indexes ribs against each other and a rib that
  // changes length would shear the mesh.
  const last = loop[loop.length - 1]!;
  for (let i = 1; i < FLOOR_POINTS; i += 1) {
    const t = i / FLOOR_POINTS;
    loop.push(v3(x, last.y - 2 * last.y * t, last.z));
  }
  return loop;
}

/** Fraction the cap ring shrinks by — the corner radius of a nose or tail. */
const CAP_SHRINK = 0.55;

function loft(spec: LoftSpec): Mesh {
  const stations = dedupe(spec.stations);
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

  // A rounded cap: a shrunken ring set out along the car from the end rib, and
  // a hub beyond that.
  //
  // The ring used to sit at the end rib's own station, so it shrank in section
  // but travelled nowhere — a flat annulus and a flat disc, closing the nose
  // with a vertical face the width of the bumper. Edge-on that face caught the
  // key light as a bright blade sticking out of the front of the car. Pushing
  // the ring and the hub out along x is what turns the corner.
  const depth = Math.max(0, spec.capDepth ?? 0);
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
    // Outward is away from the car: toward smaller x at the nose, larger at
    // the tail.
    const out = flip ? -1 : 1;
    const ring = pos.length / 3;
    for (const p of r) {
      pos.push(
        p.x + out * depth * 0.52,
        c.y + (p.y - c.y) * CAP_SHRINK,
        c.z + (p.z - c.z) * CAP_SHRINK,
      );
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
    pos.push(c.x + out * depth, c.y, c.z);
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

/** How far either side of the cabin the body top slides onto the beltline. */
const COWL_RUN = 260;

/**
 * The top of the body volume at a station.
 *
 * Inside the cabin the body stops at the belt and the greenhouse carries on
 * above it — that split is the whole reason there are two volumes. Outside the
 * cabin there is no glass, so the body's top is the drawn silhouette: the hood
 * ahead of the cowl and the decklid behind the backlight.
 *
 * Capping at the belt everywhere, as this used to, flattened the hood into a
 * slab the moment the belt sat lower than the cowl — which it does on anything
 * with a raised cowl, so the entire front of the car went flat. Switching hard
 * at the cabin edge instead puts a cliff at the cowl. The ramp is the cowl:
 * the body top slides off the hood and onto the belt over a couple of hundred
 * millimetres, which is what the panel does.
 */
function bodyTopOf(input: CarInput): (x: number) => number {
  const { cabin } = input;
  if (!cabin) return (x) => input.topZ(x);
  return (x: number): number => {
    const top = input.topZ(x);
    const capped = Math.min(top, input.beltZ(x));
    const w =
      smooth((x - cabin.x0) / COWL_RUN) * smooth((cabin.x1 - x) / COWL_RUN);
    return top + (capped - top) * w;
  };
}

/**
 * The thinnest the body is allowed to get where its lower edge rises to meet
 * its top — over a wheel arch, in practice. Below this it stops reading as a
 * fender and starts reading as a torn edge.
 */
const MIN_SECTION = 60;

/**
 * How far either side of the crossover the fender blends into the hood.
 *
 * Where an arch reaches the drawn silhouette the body has to swell over the
 * wheel. Taking the maximum of the two puts a crease across the fender at the
 * exact station they cross; blending over a couple of hundred millimetres
 * makes it the swell it is meant to be.
 */
const FENDER_BLEND = 190;

/**
 * The body volume's loft spec, in one place.
 *
 * SECTIONS draws from this too. When the two had their own copies of the top
 * rule they drifted, and a section panel that disagrees with the surface is
 * worse than no section panel — it is a drawing you would trust and shouldn't.
 */
function bodySpec(input: CarInput): LoftSpec {
  const bodyTop = bodyTopOf(input);
  return {
    stations: input.stations,
    top: (x) => softMax(input.sillZ(x) + MIN_SECTION, bodyTop(x), FENDER_BLEND),
    sill: input.sillZ,
    floor: input.floorZ,
    half: (x) => Math.max(20, input.halfWidth(x)),
    shape: input.shape,
    ribPoints: input.ribPoints,
    ...(input.wellY ? { wellY: input.wellY } : {}),
    ...(input.capDepth ? { capDepth: input.capDepth } : {}),
    ...(input.displace ? { displace: input.displace } : {}),
  };
}

export function buildCar(input: CarInput): CarBuild {
  const { cabin } = input;
  const body = loft(bodySpec(input));

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
    const live = dedupe(stations).filter((x) => gTop(x) > gBase(x) + 40 && span > 0);
    if (live.length >= 2) {
      greenhouse = loft({
        stations: live,
        top: gTop,
        // Glass has no wheel well; sill and floor are the same tucked base.
        sill: gBase,
        floor: gBase,
        half: (x) => Math.max(16, input.halfWidth(x) * (1 - 0.24 * inset) * taper(x)),
        // The greenhouse is its own volume with its own lean: strongly domed,
        // carried high, leaned hard — the DLO wrapping over the driver.
        shape: { crown: 0.4, shoulder: 0.34, tumblehome: 0.34, glassInset: 0 },
        ribPoints: Math.max(8, Math.round(input.ribPoints * 0.75)),
        // The sculpt field runs across the whole car, not only below the
        // belt. Without this a crease authored high simply vanished at the
        // shoulder, which reads as the control being broken.
        ...(input.displace ? { displace: input.displace } : {}),
      });
    }
  }

  return { body, greenhouse };
}

/**
 * The composed half-section at one station — body, and glass where there is
 * glass.
 *
 * This is literally the rib the loft builds, not a second drawing of it. The
 * two used to compute the body's top separately and they drifted; a section
 * panel that disagrees with the surface is worse than none, because it is a
 * drawing you would trust and shouldn't. The half runs centreline-top, out and
 * down the flank to the sill, under the arch lip and inboard along the wheel
 * well — so an opening shows up here as the well it is.
 */
export function sectionAt(
  input: CarInput,
  x: number,
  samples = 40,
): { body: V3[]; greenhouse: V3[] | null } {
  const body = halfRib(x, { ...bodySpec(input), ribPoints: Math.max(8, samples) });
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
