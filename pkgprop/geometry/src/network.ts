import type { Curve } from './curve.js';
import { coonsPatch, creaseEdge, smoothEdge, type Patch, type PatchEdge } from './patch.js';
import { add, cross, length, normalize, scale, sub, v3, type V3 } from './vec.js';

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
 * WHAT THIS DOES NOT DO YET, stated plainly because the difference matters and
 * is easy to miss. A smooth edge here is smooth in *shading* and not in
 * *geometry*. Both patches meeting at a smooth edge are given the ruled cross
 * field, which each of them computes across itself — so they agree on where
 * the seam is, exactly, but not on the slope at which they arrive, and the
 * seam is tangent-continuous only to the extent the two panels happened to
 * want the same thing. What hides the difference is that the normals are
 * averaged across the weld, which is a shading trick, not surface continuity.
 *
 * The real fix is to move the cross field from the patch to the edge: one
 * shared unit normal field along the edge, each side projecting its own
 * transversal into the plane perpendicular to it and scaling by its own
 * extent. Until that lands, a zebra stripe crossing a smooth seam can still
 * kink, and calling an edge smooth changes which vertices share a normal
 * rather than where the surface goes.
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
 * Build the mesh.
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

  for (const panel of spec.panels) {
    const rev = panel.reversed ?? [false, false, false, false];
    const kinds = panel.edges ?? (['smooth', 'smooth', 'smooth', 'smooth'] as const);
    const raw = panel.boundary.map((id, i) => {
      const c = curveOf(spec, id);
      return rev[i] ? reverse(c) : c;
    });

    // boundary order is [south, east, north, west] walking the loop, so north
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

    const edge = (c: Curve, kind: EdgeKind, field: (t: number) => V3): PatchEdge => {
      if (kind === 'crease') return creaseEdge(c);
      if (kind === 'mirror') {
        // Straight out sideways, carrying the chord's reach but none of its
        // rise. This is what makes the two halves one surface.
        return smoothEdge(
          c,
          (t) => v3(0, Math.sign(field(t).y) || 1, 0),
          (t) => length(field(t)),
        );
      }
      // The ruled slope, said explicitly rather than left to the patch's
      // fallback, so a later step can retune an edge without changing the
      // shape this one currently produces.
      return smoothEdge(c, field, (t) => length(field(t)));
    };

    const patch: Patch = coonsPatch({
      south: edge(south, kinds[0], dv),
      north: edge(north, kinds[2], dv),
      west: edge(west, kinds[3], du),
      east: edge(east, kinds[1], du),
    });

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
