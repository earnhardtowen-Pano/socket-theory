import type { Curve } from './curve.js';
import { coonsPatch, creaseEdge, smoothEdge, type Patch, type PatchEdge } from './patch.js';
import { add, cross, dot, length, normalize, scale, sub, v3, type V3 } from './vec.js';

/**
 * The car as a network of named curves with panels skinned between them.
 *
 * The station loft this replaces had one thing to say about the whole body,
 * and said it everywhere: sweep a section along a spine. Everything it made
 * looked swept, because it was. There was no such thing as a hood — there was
 * a region of the sweep that happened to be over the engine. Nothing could be
 * a shutline, because a shutline is a boundary and the sweep had no boundaries
 * except its two ends.
 *
 * Here a curve is a first-class named object, a panel is four of them, and the
 * two facts that follow are the entire point:
 *
 * 1. Two panels that share a curve share it exactly. Watertight is structural,
 *    not something to test for and patch up afterwards.
 * 2. An edge is either smooth or a crease, and that is a property of the edge
 *    rather than of the mesh. A crease is where the two panels are allowed to
 *    disagree about which way is up — which is what a character line *is*.
 *    Loft geometry can only fake this by bending the surface very hard over a
 *    short distance, which is why creases used to be soft and why the shading
 *    rippled at them.
 *
 * The welding is what stops the bunching. Two patches sampled independently
 * along a shared curve produce the same points because they evaluate the same
 * curve object, so the seam has no gap and no duplicate row of vertices to
 * shade separately.
 *
 * ## Ribbons — why a smooth edge is now smooth in geometry
 *
 * Sharing a curve makes two panels agree about *where* they meet. It says
 * nothing about the *slope* at which they arrive, and for a long time this file
 * did not either: each patch worked out its own cross-boundary field by taking
 * a chord straight across itself, so two panels meeting on one rail wanted two
 * different slopes there and nothing reconciled them. Measured at 17.3° of
 * tangent-plane break on an edge the code called smooth. What hid it was the
 * normal averaging across the weld — a shading trick that paints over a surface
 * defect, which is why the zebra could never see it: the zebra was reflecting
 * the very normal fabricated to conceal the thing it was meant to find.
 *
 * The fix, and it is the standard one, is that the cross-boundary data belongs
 * to the *edge* rather than to either patch. An edge carries one shared unit
 * normal field N(t) — the average of what its incident panels naturally want,
 * aligned into one hemisphere so the average means something. Each panel then
 * projects its own transversal into the plane perpendicular to N and rescales
 * it to its own reach. Both panels therefore leave the seam inside the same
 * plane, which is what a common tangent plane *is*, while keeping magnitudes
 * free per side — and magnitude has to stay free, because a derivative lives in
 * its own patch's unit parameter space and two panels of different sizes need
 * different numbers to describe the same physical slope.
 *
 * The averaging runs in panel order, which is fixed, so the car is not subtly
 * different from one build to the next.
 *
 * What this still does not buy: exact G1 *at the corners*. The bicubic Coons
 * form reproduces its prescribed cross field along an edge only when the field
 * agrees at the corner with the adjacent boundary's own end tangent, and when
 * the twists agree — the classical twist-incompatibility problem, which Gregory
 * patches solve with rational blending and this does not. So the break collapses
 * along the run of a seam and what survives is concentrated at the four corners.
 * The number is measured in `continuity.test.ts` rather than asserted here.
 */

/**
 * What an edge does to the surface arriving at it.
 *
 * `mirror` is the centreline, and it is not a stylistic choice. A car is a
 * mirrored half, so along y = 0 the surface meets its own reflection. For the
 * two halves to be one surface the normal there must lie *in* the mirror
 * plane — no lateral component — and since the normal is the cross product of
 * the along-edge and across-edge directions, that requires the surface to
 * leave the centreline squarely sideways, with no vertical component at all.
 *
 * Left to the ruled chord it does not: the chord from the roof centreline to
 * the roof rail drops as it goes outboard, so the surface leaves the spine
 * tilted, and the reflection meets it at twice that angle. Measured at 14°.
 * That is a crease running the full length of the car — down the hood, over
 * the roof, along the decklid, and a second one down the keel — drawn by the
 * arithmetic rather than by anybody.
 */
export type EdgeKind = 'smooth' | 'crease' | 'mirror';

/** A named curve in the network. Panels refer to it; it belongs to no one. */
export interface NetCurve {
  readonly id: string;
  readonly curve: Curve;
  /** Plain words, for the layers panel and for a tooltip on the canvas. */
  readonly label: string;
}

/**
 * One panel: four curve ids, in the order south, east, north, west, walking
 * the boundary. Plus what each of its edges does to the shading.
 *
 * The `reversed` flags exist because a curve is shared and runs one way, while
 * a panel needs its south and north to run the *same* way and its west and
 * east to run the same way. Rather than duplicate a curve backwards — which
 * would break the shared-object identity that watertightness depends on — the
 * panel says "read this one backwards".
 */
export interface PanelSpec {
  readonly id: string;
  readonly label: string;
  /** Curve ids: [south, east, north, west]. */
  readonly boundary: readonly [string, string, string, string];
  /** Whether each boundary curve is traversed backwards. Same order. */
  readonly reversed?: readonly [boolean, boolean, boolean, boolean];
  /** Shading across each edge. Same order. Defaults to smooth. */
  readonly edges?: readonly [EdgeKind, EdgeKind, EdgeKind, EdgeKind];
  /** Which way the panel faces. Flip when the winding comes out inward. */
  readonly flip?: boolean;
  /** Colour key for the layers panel and the panel-shaded look. */
  readonly group?: string;
  /** How full this panel is. 1 is the Coons default; below 1 is tauter. */
  readonly fullness?: number;
}

export interface NetworkSpec {
  readonly curves: readonly NetCurve[];
  readonly panels: readonly PanelSpec[];
  /**
   * Samples across a panel in each direction. The tessellation is uniform per
   * panel and identical along a shared edge, which is what lets neighbouring
   * panels weld without a seam.
   */
  readonly density: number;
}

export interface NetworkMesh {
  readonly positions: Float32Array;
  readonly normals: Float32Array;
  readonly indices: Uint32Array;
  readonly vertexCount: number;
  readonly triangleCount: number;
  /** Triangle ranges per panel, so a panel can be coloured or picked. */
  readonly groups: readonly { readonly id: string; readonly label: string; readonly group: string; readonly start: number; readonly count: number }[];
}

/** A curve read backwards, without copying its points. */
function reverse(c: Curve): Curve {
  return {
    at: (u) => c.at(1 - u),
    tangentAt: (u) => scale(c.tangentAt(1 - u), -1),
    sample: (n) => c.sample(n).reverse(),
  };
}

function curveOf(spec: NetworkSpec, id: string): Curve {
  const found = spec.curves.find((c) => c.id === id);
  if (!found) throw new Error(`Panel refers to curve '${id}', which is not in the network.`);
  return found.curve;
}

/**
 * A vertex key for welding.
 *
 * Rounded to a hundredth of a millimetre. Two panels evaluating the same
 * shared curve at the same parameter agree to floating point, so the rounding
 * is not doing the work — it is insurance against the last bit of a
 * double differing between two evaluation paths, which would leave a hairline
 * of unwelded vertices down a seam that shades as a crease you never asked for.
 */
const WELD_SCALE = 100;
const keyOf = (p: V3): string =>
  `${Math.round(p.x * WELD_SCALE)},${Math.round(p.y * WELD_SCALE)},${Math.round(p.z * WELD_SCALE)}`;

/**
 * One panel's four sides, resolved: which curve each lies on, which way its
 * parameter runs relative to that curve, and the derivative the patch wants
 * there.
 *
 * Resolving this once is what lets the two passes agree. The ribbon pass needs
 * to know, for a given point on a shared curve, what slope each incident panel
 * naturally wants; the build pass needs to hand the patch a field in the
 * patch's own parameter. Both are the same information read from two ends, and
 * deriving it twice is how the north and east fields got signed backwards the
 * first time.
 */
interface PanelSide {
  readonly kind: EdgeKind;
  readonly curveId: string;
  /**
   * Curve parameter to patch-side parameter, and back.
   *
   * It is either the identity or `1 - t`, both of which are their own inverse,
   * so one function serves both directions.
   */
  readonly swap: (t: number) => number;
  /** The derivative the patch needs along this side, at the side's parameter. */
  readonly deriv: (s: number) => V3;
  /**
   * +1 when that derivative points into the panel, -1 when it points out.
   *
   * South and west sit at the low end of their parameter so the derivative
   * heads inward; north and east sit at the high end so it heads outward. The
   * ribbon needs the inward one to know which way this panel lies from the
   * seam; the patch needs the signed one because a derivative has a direction.
   */
  readonly inward: 1 | -1;
}

interface PanelFrame {
  readonly panel: PanelSpec;
  readonly kinds: readonly [EdgeKind, EdgeKind, EdgeKind, EdgeKind];
  readonly south: Curve;
  readonly north: Curve;
  readonly west: Curve;
  readonly east: Curve;
  /** [south, east, north, west] — the boundary order panels are written in. */
  readonly sides: readonly [PanelSide, PanelSide, PanelSide, PanelSide];
}

const same = (t: number): number => t;
const flip = (t: number): number => 1 - t;

function frameOf(spec: NetworkSpec, panel: PanelSpec): PanelFrame {
  const rev = panel.reversed ?? [false, false, false, false];
  const kinds = panel.edges ?? (['smooth', 'smooth', 'smooth', 'smooth'] as const);
  const raw = panel.boundary.map((id, i) => {
    const c = curveOf(spec, id);
    return rev[i] ? reverse(c) : c;
  });

  // Boundary order is [south, east, north, west] walking the loop, so north
  // and west arrive running the wrong way for the patch's convention (both
  // u-edges left to right, both v-edges bottom to top).
  const south = raw[0]!;
  const east = raw[1]!;
  const north = reverse(raw[2]!);
  const west = reverse(raw[3]!);

  // The cross field is a derivative with respect to the parameter running
  // AWAY from the edge, and that parameter increases in one direction only.
  // So the south and north edges share a field — both are ∂S/∂v, both point
  // from south to north — and west and east share ∂S/∂u pointing west to
  // east. Handing the far edge "the direction to the other side" instead
  // gives it the right line and the wrong sign, and the panel leaves two of
  // its four edges backwards: a shallow bulge that reads as a dent and shows
  // up under zebra as a stripe that doubles back.
  const dv = (t: number): V3 => sub(north.at(t), south.at(t));
  const du = (t: number): V3 => sub(east.at(t), west.at(t));

  // The double reversal on north and west is why their parameter maps look
  // inverted next to south and east: the panel already reversed the curve to
  // walk the loop, and the patch reversed it again to run left-to-right.
  const sides: [PanelSide, PanelSide, PanelSide, PanelSide] = [
    { kind: kinds[0], curveId: panel.boundary[0], swap: rev[0] ? flip : same, deriv: dv, inward: 1 },
    { kind: kinds[1], curveId: panel.boundary[1], swap: rev[1] ? flip : same, deriv: du, inward: -1 },
    { kind: kinds[2], curveId: panel.boundary[2], swap: rev[2] ? same : flip, deriv: dv, inward: -1 },
    { kind: kinds[3], curveId: panel.boundary[3], swap: rev[3] ? same : flip, deriv: du, inward: 1 },
  ];

  return { panel, kinds, south, north, west, east, sides };
}

/**
 * The shared unit normal field an edge owns, for every curve two or more
 * panels meet along smoothly.
 *
 * Each incident panel is asked, at the same physical point, which way it is
 * heading into itself. Crossed with the curve's own tangent that gives the
 * normal that panel would naturally have there. Two panels on opposite sides of
 * a seam head opposite ways, so their natural normals come out roughly
 * antiparallel — which makes a straight average meaningless. Aligning each into
 * the first one's hemisphere first is what turns them into two opinions about
 * the same plane rather than two vectors that cancel.
 *
 * Only smooth sides are collected. A crease has no opinion by definition, and a
 * mirror edge has a stronger one that comes from the reflection rather than
 * from a neighbour.
 */
function ribbonNormals(
  spec: NetworkSpec,
  frames: readonly PanelFrame[],
): Map<string, (t: number) => V3> {
  const uses = new Map<string, PanelSide[]>();
  for (const f of frames) {
    for (const side of f.sides) {
      if (side.kind !== 'smooth') continue;
      const list = uses.get(side.curveId);
      if (list) list.push(side);
      else uses.set(side.curveId, [side]);
    }
  }

  const out = new Map<string, (t: number) => V3>();
  for (const [id, list] of uses) {
    // One panel on its own is a network boundary — the nose opening, the tail.
    // It has nobody to agree with, so its own normal is already the answer and
    // projecting against it is the identity. Skipping keeps the work off the
    // hot path and keeps the field undefined rather than trivially defined.
    if (list.length < 2) continue;
    const curve = curveOf(spec, id);
    out.set(id, (t: number): V3 => {
      const tangent = curve.tangentAt(t);
      let acc = v3(0, 0, 0);
      let ref: V3 | null = null;
      for (const side of list) {
        const into = scale(side.deriv(side.swap(t)), side.inward);
        const nrm = normalize(cross(tangent, into));
        if (length(nrm) < 0.5) continue;
        const aligned: V3 = ref !== null && dot(nrm, ref) < 0 ? scale(nrm, -1) : nrm;
        if (ref === null) ref = aligned;
        acc = add(acc, aligned);
      }
      return normalize(acc);
    });
  }
  return out;
}

/**
 * A cross field that leaves the seam inside the edge's own tangent plane.
 *
 * The panel keeps its direction as far as the plane allows and keeps its reach
 * exactly: only the component along the shared normal is removed. That is the
 * whole of the G1 argument — remove the part of the slope that would tip this
 * panel out of the common plane, and leave everything else the panel wanted.
 */
function ribbonCross(side: PanelSide, normal: (t: number) => V3): (s: number) => V3 {
  return (s: number): V3 => {
    const d = side.deriv(s);
    const N = normal(side.swap(s));
    const reach = length(d);
    if (reach < 1e-9) return d;
    const planar = sub(d, scale(N, dot(d, N)));
    const l = length(planar);
    // Degenerate only if the panel wanted to leave straight along the shared
    // normal, which would mean it is not a surface there at all.
    return l < 1e-9 ? d : scale(planar, reach / l);
  };
}

/** A panel and the surface it actually became, boundaries and ribbons resolved. */
export interface NetworkPatch {
  readonly panel: PanelSpec;
  readonly patch: Patch;
  /** [south, east, north, west] — which curve each side lies on, and its kind. */
  readonly sides: readonly PanelSide[];
}

/**
 * Resolve the network into surfaces, without tessellating anything.
 *
 * Two passes, and the first one is why a seam is smooth. Pass one resolves
 * every panel's four sides and works out, for each curve that two panels meet
 * along, the one normal field they will both answer to. Pass two builds the
 * patches against it. Doing it in one pass is impossible: a panel cannot know
 * what slope to leave at a seam until its neighbour has also been read.
 *
 * Exported because the mesh is a sampling of this and not the thing itself.
 * Anything that wants to know what the *surface* does — a highlight line, a
 * continuity measurement, a section cut — has to ask here. Asking the mesh gets
 * you the welded vertex normal, which is an average fabricated for shading, and
 * a continuity check run against it is a check against the cosmetic that hides
 * the defect.
 */
export function networkPatches(spec: NetworkSpec): NetworkPatch[] {
  const frames = spec.panels.map((p) => frameOf(spec, p));
  const ribbons = ribbonNormals(spec, frames);

  return frames.map((frame) => {
    const { panel, south, north, west, east } = frame;

    const edge = (c: Curve, side: PanelSide): PatchEdge => {
      if (side.kind === 'crease') return creaseEdge(c);
      if (side.kind === 'mirror') {
        // Straight out sideways, carrying the chord's reach but none of its
        // rise. This is the ribbon written directly: on the centreline the
        // shared normal is the surface's own reflection partner, so the plane
        // both halves must leave in is the one containing the seam tangent and
        // the lateral axis. Saying "go sideways" is the same statement, and it
        // does not need a neighbour to be present to be true.
        return smoothEdge(
          c,
          (t) => v3(0, Math.sign(side.deriv(t).y) || 1, 0),
          (t) => length(side.deriv(t)),
        );
      }
      const normal = ribbons.get(side.curveId);
      // No ribbon means nobody is on the other side — an open boundary. The
      // panel's own chord is then the whole truth, which is what it used to be
      // everywhere.
      if (!normal) return smoothEdge(c, side.deriv, (t) => length(side.deriv(t)));
      return { curve: c, cross: ribbonCross(side, normal) };
    };

    const patch = coonsPatch({
      south: edge(south, frame.sides[0]),
      north: edge(north, frame.sides[2]),
      west: edge(west, frame.sides[3]),
      east: edge(east, frame.sides[1]),
      ...(panel.fullness !== undefined ? { fullness: panel.fullness } : {}),
    });

    return { panel, patch, sides: frame.sides };
  });
}

/**
 * Build the mesh: sample every patch on a uniform grid and weld.
 *
 * Positions are welded across smooth edges and deliberately *not* welded
 * across creases, because a crease is exactly two normals at one location. The
 * normal accumulation therefore happens per weld-group rather than per
 * position, and a crease vertex belongs to two groups.
 */
export function buildNetwork(spec: NetworkSpec): NetworkMesh {
  const n = Math.max(2, Math.floor(spec.density));

  const positions: number[] = [];
  const indices: number[] = [];
  const groups: { id: string; label: string; group: string; start: number; count: number }[] = [];
  // Weld key -> the vertex indices that share that position AND are allowed to
  // share a normal. Crease edges get their own bucket, so they never merge.
  const welds = new Map<string, number[]>();

  for (const { panel, patch, sides } of networkPatches(spec)) {
    const kinds = [sides[0]!.kind, sides[1]!.kind, sides[2]!.kind, sides[3]!.kind] as const;

    const base = positions.length / 3;
    const triStart = indices.length / 3;

    // Sample the patch. The grid includes both boundaries, so the row along a
    // shared curve is generated from that curve by both panels.
    for (let j = 0; j <= n; j += 1) {
      for (let i = 0; i <= n; i += 1) {
        const p = patch.at(i / n, j / n);
        positions.push(p.x, p.y, p.z);
      }
    }

    const at = (i: number, j: number): number => base + j * (n + 1) + i;
    for (let j = 0; j < n; j += 1) {
      for (let i = 0; i < n; i += 1) {
        const a = at(i, j);
        const b = at(i + 1, j);
        const c = at(i + 1, j + 1);
        const d = at(i, j + 1);
        if (panel.flip) {
          indices.push(a, c, b, a, d, c);
        } else {
          indices.push(a, b, c, a, c, d);
        }
      }
    }

    groups.push({
      id: panel.id,
      label: panel.label,
      group: panel.group ?? panel.id,
      start: triStart * 3,
      count: (indices.length / 3 - triStart) * 3,
    });

    // Register welds. A vertex on a crease edge is tagged with the panel id so
    // it can only ever weld to vertices of the same panel — which is to say,
    // not across the crease.
    for (let j = 0; j <= n; j += 1) {
      for (let i = 0; i <= n; i += 1) {
        const idx = at(i, j);
        const onCrease =
          (j === 0 && kinds[0] === 'crease') ||
          (i === n && kinds[1] === 'crease') ||
          (j === n && kinds[2] === 'crease') ||
          (i === 0 && kinds[3] === 'crease');
        const p = v3(positions[idx * 3]!, positions[idx * 3 + 1]!, positions[idx * 3 + 2]!);
        const k = onCrease ? `${panel.id}|${keyOf(p)}` : keyOf(p);
        const bucket = welds.get(k);
        if (bucket) bucket.push(idx);
        else welds.set(k, [idx]);
      }
    }
  }

  const pos = new Float32Array(positions);
  const idx = new Uint32Array(indices);
  return {
    positions: pos,
    normals: weldedNormals(pos, idx, welds),
    indices: idx,
    vertexCount: pos.length / 3,
    triangleCount: idx.length / 3,
    groups,
  };
}

/**
 * Area-weighted normals, averaged within a weld group rather than per vertex.
 *
 * The cross product of two edges is already twice the triangle's area, so
 * accumulating it unnormalised weights big triangles over slivers — which
 * keeps a highlight from kinking where the tessellation happens to get dense.
 *
 * Averaging by weld group is what makes a shared edge shade as one surface
 * while a crease stays hard: the two sides of a crease landed in different
 * buckets, so they never see each other's triangles.
 */
function weldedNormals(
  positions: Float32Array,
  indices: Uint32Array,
  welds: ReadonlyMap<string, readonly number[]>,
): Float32Array {
  const raw = new Float32Array(positions.length);
  const get = (i: number): V3 =>
    v3(positions[i * 3] ?? 0, positions[i * 3 + 1] ?? 0, positions[i * 3 + 2] ?? 0);

  for (let t = 0; t < indices.length; t += 3) {
    const ia = indices[t] ?? 0;
    const ib = indices[t + 1] ?? 0;
    const ic = indices[t + 2] ?? 0;
    const nrm = cross(sub(get(ib), get(ia)), sub(get(ic), get(ia)));
    for (const i of [ia, ib, ic]) {
      raw[i * 3] = (raw[i * 3] ?? 0) + nrm.x;
      raw[i * 3 + 1] = (raw[i * 3 + 1] ?? 0) + nrm.y;
      raw[i * 3 + 2] = (raw[i * 3 + 2] ?? 0) + nrm.z;
    }
  }

  const out = new Float32Array(positions.length);
  for (const bucket of welds.values()) {
    let sum = v3(0, 0, 0);
    for (const i of bucket) sum = add(sum, v3(raw[i * 3] ?? 0, raw[i * 3 + 1] ?? 0, raw[i * 3 + 2] ?? 0));
    const nrm = normalize(sum);
    for (const i of bucket) {
      out[i * 3] = nrm.x;
      out[i * 3 + 1] = nrm.y;
      out[i * 3 + 2] = nrm.z;
    }
  }
  // Any vertex that never landed in a weld bucket keeps its own accumulation.
  for (let i = 0; i < out.length; i += 3) {
    if (out[i] === 0 && out[i + 1] === 0 && out[i + 2] === 0) {
      const nrm = normalize(v3(raw[i] ?? 0, raw[i + 1] ?? 0, raw[i + 2] ?? 0));
      out[i] = nrm.x;
      out[i + 1] = nrm.y;
      out[i + 2] = nrm.z;
    }
  }
  return out;
}

/**
 * A vertex this close to the centre plane is on it.
 *
 * A tenth of a millimetre. The centreline rails are built from points whose y
 * is literally zero, so this is not a tolerance so much as insurance against
 * the last bit of a float.
 */
const MIRROR_TOLERANCE = 0.1;

/**
 * Mirror a network mesh across the centre plane and append it.
 *
 * The normals on the seam are squared up on the way through, and that is a
 * correction rather than a cosmetic. On the mirror plane the true surface
 * normal has no lateral component — it cannot, because the surface continues
 * into its own reflection — so any lateral component a triangle's normal picked
 * up there is an artefact of the tessellation, not the surface. Left in, the
 * two halves disagree by twice that angle and the car wears a crease down its
 * spine and its keel. Measured at 4.4° after the patch fields were fixed, which
 * is still a line you can see.
 */
export function mirrorNetwork(mesh: NetworkMesh): NetworkMesh {
  const n = mesh.vertexCount;
  const positions = new Float32Array(mesh.positions.length * 2);
  const normals = new Float32Array(mesh.normals.length * 2);
  positions.set(mesh.positions, 0);
  normals.set(mesh.normals, 0);

  for (let i = 0; i < n; i += 1) {
    positions[(n + i) * 3] = mesh.positions[i * 3]!;
    positions[(n + i) * 3 + 1] = -mesh.positions[i * 3 + 1]!;
    positions[(n + i) * 3 + 2] = mesh.positions[i * 3 + 2]!;
    normals[(n + i) * 3] = mesh.normals[i * 3]!;
    normals[(n + i) * 3 + 1] = -mesh.normals[i * 3 + 1]!;
    normals[(n + i) * 3 + 2] = mesh.normals[i * 3 + 2]!;
  }

  // Square the seam up — on both halves, after both exist. Doing it before the
  // copy corrects one side and then hands the mirrored side the uncorrected
  // original, which leaves exactly the disagreement this is here to remove.
  for (let i = 0; i < positions.length / 3; i += 1) {
    if (Math.abs(positions[i * 3 + 1]!) > MIRROR_TOLERANCE) continue;
    const nx = normals[i * 3]!;
    const nz = normals[i * 3 + 2]!;
    const len = Math.hypot(nx, nz);
    if (len < 1e-9) continue;
    normals[i * 3] = nx / len;
    normals[i * 3 + 1] = 0;
    normals[i * 3 + 2] = nz / len;
  }
  // Mirroring reverses handedness, so the winding has to be flipped back or
  // the whole left side of the car renders inside out.
  const indices = new Uint32Array(mesh.indices.length * 2);
  indices.set(mesh.indices, 0);
  const m = mesh.indices.length;
  for (let t = 0; t < m; t += 3) {
    indices[m + t] = mesh.indices[t]! + n;
    indices[m + t + 1] = mesh.indices[t + 2]! + n;
    indices[m + t + 2] = mesh.indices[t + 1]! + n;
  }
  const groups = [
    ...mesh.groups,
    ...mesh.groups.map((g) => ({ ...g, start: g.start + m })),
  ];
  return {
    positions,
    normals,
    indices,
    vertexCount: positions.length / 3,
    triangleCount: indices.length / 3,
    groups,
  };
}
