import type { Curve } from './curve.js';
import { add, cross, normalize, scale, sub, v3, type V3 } from './vec.js';

/**
 * The Coons patch — a surface that is nothing but its boundary curves.
 *
 * This is the whole thesis of the surface layer. A station loft says "give me
 * a spine and a section and I will sweep one along the other", and everything
 * it produces looks swept: one continuous blob whose only features are the
 * ones the section happened to have. A car is not swept. A car is panels, and
 * a panel is a region bounded by lines a designer draws on purpose — a
 * shutline, a crease, the top of a rocker, the base of the glass.
 *
 * A Coons patch takes four boundary curves and fills the middle. Which means
 * the boundaries are the design and the interior is a consequence, and that is
 * exactly backwards from a loft, and exactly right. Tool the boundary, tool
 * the surface. Two patches that share a boundary curve share it *exactly*, so
 * the body is watertight by construction rather than by luck.
 *
 * Bilinear blending alone leaves the interior slack — it is the ruled surface
 * in each direction minus the bilinear corner term, so it has no idea what
 * slope to leave at an edge, which is what makes bilinear Coons patchwork look
 * like a paper model. The bicubic form fixes that by taking a cross-boundary
 * tangent field along each edge as well, and honouring it. That field is what
 * makes two patches meet smoothly instead of tenting, and withholding it is
 * what makes an edge read as a crease.
 */

/** Cubic Hermite blending. H0 and H1 carry position, H2 and H3 carry slope. */
const H0 = (t: number): number => 2 * t * t * t - 3 * t * t + 1;
const H1 = (t: number): number => -2 * t * t * t + 3 * t * t;
const H2 = (t: number): number => t * t * t - 2 * t * t + t;
const H3 = (t: number): number => t * t * t - t * t;

/**
 * One side of a patch: the curve itself, and how fast the surface should be
 * leaving it.
 *
 * `cross` is the derivative of the surface with respect to the parameter that
 * runs *away* from this edge, sampled along the edge. Its magnitude matters,
 * not just its direction — it is a derivative in a unit-parameter domain, so
 * it scales with the patch's size in that direction. Getting the magnitude
 * wrong is the difference between a fair panel and one that bulges near its
 * edge and goes flat in the middle.
 *
 * Null means "no opinion": the patch falls back to the ruled slope, which is
 * what a plain bilinear Coons patch would have done. That is the correct
 * behaviour for an edge that is meant to be a crease, because the neighbour
 * across a crease is not trying to agree with anything.
 */
export interface PatchEdge {
  readonly curve: Curve;
  readonly cross: ((t: number) => V3) | null;
}

/**
 * A patch's four sides, named by where they sit in the unit square.
 *
 * `south` runs along v = 0 in the +u direction, `north` along v = 1 in the +u
 * direction, `west` along u = 0 in the +v direction, `east` along u = 1 in the
 * +v direction. Both u-edges run the same way and both v-edges run the same
 * way, so the corners are unambiguous: south(0) and west(0) are the same
 * point, and so on around.
 */
export interface PatchEdges {
  readonly south: PatchEdge;
  readonly north: PatchEdge;
  readonly west: PatchEdge;
  readonly east: PatchEdge;
}

export interface Patch {
  /** The surface point at (u, v), both clamped to [0, 1]. */
  at(u: number, v: number): V3;
  /** Outward-facing unit normal, by finite difference of the surface itself. */
  normalAt(u: number, v: number): V3;
  readonly edges: PatchEdges;
}

const clamp01 = (t: number): number => Math.min(1, Math.max(0, t));

/**
 * How far apart two points have to be before the patch calls its corners
 * inconsistent.
 *
 * A tenth of a millimetre. Curves in this tool are built from solved
 * millimetre values, so corners that are meant to coincide agree to floating
 * point; anything as large as this is a topology mistake — two curves that
 * were supposed to share an end and do not. Left unchecked it does not throw,
 * it just tears a seam open somewhere on the car and leaves you hunting for
 * it in a render.
 */
const CORNER_TOLERANCE = 0.1;

const far = (a: V3, b: V3): boolean =>
  Math.abs(a.x - b.x) > CORNER_TOLERANCE ||
  Math.abs(a.y - b.y) > CORNER_TOLERANCE ||
  Math.abs(a.z - b.z) > CORNER_TOLERANCE;

/**
 * Check the four boundary curves actually close a quadrilateral.
 *
 * Called once per patch at build time rather than per sample. A patch whose
 * corners disagree still evaluates — the algebra does not care — and produces
 * a surface that misses its own boundary, which is invisible until it is a
 * hole in an export.
 */
function assertCorners(e: PatchEdges): void {
  const pairs: [string, V3, V3][] = [
    ['south start / west start', e.south.curve.at(0), e.west.curve.at(0)],
    ['south end / east start', e.south.curve.at(1), e.east.curve.at(0)],
    ['north start / west end', e.north.curve.at(0), e.west.curve.at(1)],
    ['north end / east end', e.north.curve.at(1), e.east.curve.at(1)],
  ];
  for (const [what, a, b] of pairs) {
    if (far(a, b)) {
      throw new Error(
        `Patch corners disagree at ${what}: ` +
          `(${a.x.toFixed(2)}, ${a.y.toFixed(2)}, ${a.z.toFixed(2)}) vs ` +
          `(${b.x.toFixed(2)}, ${b.y.toFixed(2)}, ${b.z.toFixed(2)}).`,
      );
    }
  }
}

/** The four cross-boundary derivative fields, once the fallbacks are resolved. */
interface Crosses {
  /** ∂S/∂v along v = 0. */ readonly s: (u: number) => V3;
  /** ∂S/∂v along v = 1. */ readonly n: (u: number) => V3;
  /** ∂S/∂u along u = 0. */ readonly w: (v: number) => V3;
  /** ∂S/∂u along u = 1. */ readonly e: (v: number) => V3;
}

/**
 * The corner-correction term: a bicubic Hermite patch that is subtracted to
 * undo the double-counting in Coons' construction.
 *
 * The construction is "ruled one way, plus ruled the other way, minus the bit
 * you counted twice", and this is the bit counted twice. Everything rests on
 * it cancelling *exactly* along all four boundaries, because that is what
 * makes the patch interpolate the curves it was built from — and interpolating
 * them is the entire point, since two patches share a curve to stay watertight.
 *
 * The trap: the correction's tangent entries must be the *cross-boundary
 * fields the ruled terms actually used*, not the boundary curves' own
 * derivatives. They look interchangeable and are not. Feed it `d(south)/du`
 * where it wanted `west.cross(0)` and the cancellation is only exact when the
 * two happen to agree — which is to say, when the boundary is a straight line
 * with uniform parameterisation. Everywhere else the patch quietly misses its
 * own edge by a fraction of a millimetre, and the body develops seams that no
 * amount of staring at the topology explains.
 *
 * Writing the boundary conditions out fixes the whole matrix. Requiring
 * C(u,0) = B(u,0) and C(u,1) = B(u,1) pins the first two columns; requiring
 * C(0,v) = A(0,v) and C(1,v) = A(1,v) pins the first two rows. Nothing
 * constrains the remaining 2×2 block — those are the twists.
 *
 * Twists are held at zero, the Ferguson choice. Adini's and Bessel's estimates
 * earn their keep when a patch is one of a grid being fitted to sampled data;
 * here the boundaries are authored curves that already carry the shape, and a
 * twist estimated from them mostly buys a way to bulge a corner nobody asked
 * to bulge.
 */
function cornerTerm(e: PatchEdges, c: Crosses, u: number, v: number): V3 {
  const p00 = e.south.curve.at(0);
  const p10 = e.south.curve.at(1);
  const p01 = e.north.curve.at(0);
  const p11 = e.north.curve.at(1);

  const hu = [H0(u), H1(u), H2(u), H3(u)] as const;
  const hv = [H0(v), H1(v), H2(v), H3(v)] as const;

  //   [ P00    P01    Cs(0)  Cn(0) ]
  //   [ P10    P11    Cs(1)  Cn(1) ]
  //   [ Cw(0)  Cw(1)  0      0     ]
  //   [ Ce(0)  Ce(1)  0      0     ]
  const zero = v3(0, 0, 0);
  const G: readonly (readonly V3[])[] = [
    [p00, p01, c.s(0), c.n(0)],
    [p10, p11, c.s(1), c.n(1)],
    [c.w(0), c.w(1), zero, zero],
    [c.e(0), c.e(1), zero, zero],
  ];

  let out = zero;
  for (let i = 0; i < 4; i += 1) {
    const row = G[i]!;
    for (let j = 0; j < 4; j += 1) {
      const w = hu[i]! * hv[j]!;
      if (w !== 0) out = add(out, scale(row[j]!, w));
    }
  }
  return out;
}

/**
 * The ruled cross-slope an edge falls back to when nothing tells it better.
 *
 * Straight from one boundary to the one opposite — which is what a bilinear
 * Coons patch does everywhere, and is the right neutral answer for a crease.
 */
function ruledCross(from: Curve, to: Curve, t: number): V3 {
  return sub(to.at(t), from.at(t));
}

export function coonsPatch(edges: PatchEdges): Patch {
  assertCorners(edges);
  const { south, north, west, east } = edges;

  // Resolve the fallbacks once. The correction term has to see exactly the
  // same fields the ruled terms do, so they are settled here rather than
  // recomputed in two places that could drift apart.
  const c: Crosses = {
    s: south.cross ?? ((u) => ruledCross(south.curve, north.curve, u)),
    n: north.cross ?? ((u) => ruledCross(south.curve, north.curve, u)),
    w: west.cross ?? ((v) => ruledCross(west.curve, east.curve, v)),
    e: east.cross ?? ((v) => ruledCross(west.curve, east.curve, v)),
  };

  const at = (uRaw: number, vRaw: number): V3 => {
    const u = clamp01(uRaw);
    const v = clamp01(vRaw);

    // Ruled in v: interpolate between the south and north boundary curves,
    // honouring the slope each one wants the surface to leave at.
    const ruledV = add(
      add(scale(south.curve.at(u), H0(v)), scale(north.curve.at(u), H1(v))),
      add(scale(c.s(u), H2(v)), scale(c.n(u), H3(v))),
    );

    // Ruled in u: the same between west and east.
    const ruledU = add(
      add(scale(west.curve.at(v), H0(u)), scale(east.curve.at(v), H1(u))),
      add(scale(c.w(v), H2(u)), scale(c.e(v), H3(u))),
    );

    return sub(add(ruledV, ruledU), cornerTerm(edges, c, u, v));
  };

  /**
   * Normals by finite difference of the surface, not of the boundaries.
   *
   * The step is one-thousandth of the parameter domain and it is taken
   * one-sided at the edges, so a normal on a boundary is the normal of the
   * surface arriving at that boundary rather than of the curve lying along it.
   * That matters: two patches meeting at a crease must be allowed to disagree
   * here, and they can only disagree if each one asked its own surface.
   */
  const normalAt = (u: number, v: number): V3 => {
    const h = 1e-3;
    const u0 = Math.max(0, u - h);
    const u1 = Math.min(1, u + h);
    const v0 = Math.max(0, v - h);
    const v1 = Math.min(1, v + h);
    const du = sub(at(u1, v), at(u0, v));
    const dv = sub(at(u, v1), at(u, v0));
    return normalize(cross(du, dv));
  };

  return { at, normalAt, edges };
}

/**
 * A patch edge that wants the surface to leave it smoothly, matching a
 * neighbour.
 *
 * The magnitude question is the whole of it. A cross-boundary derivative lives
 * in the patch's own unit parameter space, so two patches of different sizes
 * meeting at one curve need *different* magnitudes to describe the same
 * physical slope. Handing both of them the same vector tents the seam. So this
 * takes a physical direction and the patch's own extent across that direction,
 * and returns the derivative that means "leave along this direction, and cover
 * that much ground doing it".
 */
export function smoothEdge(
  curve: Curve,
  direction: (t: number) => V3,
  extent: (t: number) => number,
): PatchEdge {
  return {
    curve,
    cross: (t: number): V3 => scale(normalize(direction(t)), extent(t)),
  };
}

/** An edge with no opinion about slope — a crease, a shutline, a hard feature. */
export function creaseEdge(curve: Curve): PatchEdge {
  return { curve, cross: null };
}

export { clamp01 as clampParam };
