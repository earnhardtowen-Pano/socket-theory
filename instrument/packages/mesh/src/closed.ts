/**
 * closedMeshCheck — reports, never mutates.
 *
 * Verifies over vertex INDICES (coordinates play no part, per the index-sharing
 * law):
 *   (a) every undirected edge is used by exactly two triangles,
 *   (b) the two uses run in opposite directions (consistent winding),
 *   (c) every vertex's link (the directed opposite edges of its incident
 *       triangles) forms a single closed cycle — one manifold fan.
 * Vertices no triangle references (e.g. unreferenced table samples of a
 * collapsed curve) are vacuously fine. Triangles with a repeated index are
 * reported as degenerate and excluded from (a)-(c); meshQuilt drops them
 * before this check ever runs.
 */

export type MeshViolationKind =
  | "degenerate-triangle"
  | "bad-index"
  | "open-edge"
  | "nonmanifold-edge"
  | "inconsistent-winding"
  | "nonmanifold-vertex"
  | "open-fan"
  | "split-fan";

export interface MeshViolation {
  readonly kind: MeshViolationKind;
  readonly detail: string;
}

export interface ClosedMeshReport {
  readonly closed: boolean;
  readonly violations: readonly MeshViolation[];
}

export interface TriangleMesh {
  readonly positions: Float64Array;
  readonly indices: Uint32Array;
}

interface EdgeUse {
  forward: number; // uses as (min -> max)
  backward: number; // uses as (max -> min)
}

export function closedMeshCheck(mesh: TriangleMesh): ClosedMeshReport {
  const violations: MeshViolation[] = [];
  const vertexCount = Math.floor(mesh.positions.length / 3);
  const triCount = Math.floor(mesh.indices.length / 3);

  const edges = new Map<string, EdgeUse>();
  // per-vertex link: vertex -> (fromNeighbor -> toNeighbor)
  const links = new Map<number, Map<number, number>>();
  const nonmanifoldVertex = new Set<number>();

  for (let t = 0; t < triCount; t++) {
    const a = mesh.indices[3 * t]!;
    const b = mesh.indices[3 * t + 1]!;
    const c = mesh.indices[3 * t + 2]!;
    if (a >= vertexCount || b >= vertexCount || c >= vertexCount) {
      violations.push({ kind: "bad-index", detail: `triangle ${t} references vertex beyond positions` });
      continue;
    }
    if (a === b || b === c || a === c) {
      violations.push({ kind: "degenerate-triangle", detail: `triangle ${t} repeats a vertex index` });
      continue;
    }
    const dir: readonly [number, number][] = [[a, b], [b, c], [c, a]];
    for (const [p, q] of dir) {
      const lo = Math.min(p, q);
      const hi = Math.max(p, q);
      const key = `${lo}-${hi}`;
      const use = edges.get(key) ?? { forward: 0, backward: 0 };
      if (p === lo) use.forward++;
      else use.backward++;
      edges.set(key, use);
    }
    // link edges: at corner v, the opposite edge directed with the triangle
    const wedges: readonly [number, number, number][] = [[a, b, c], [b, c, a], [c, a, b]];
    for (const [v, nxt, prv] of wedges) {
      // walking the fan around v with triangle orientation goes prv -> nxt
      let link = links.get(v);
      if (!link) {
        link = new Map();
        links.set(v, link);
      }
      if (link.has(prv)) nonmanifoldVertex.add(v);
      else link.set(prv, nxt);
    }
  }

  // (a) + (b): deterministic edge order — ascending (lo, hi)
  const edgeKeys = [...edges.keys()].sort((x, y) => {
    const [xa, xb] = x.split("-").map(Number) as [number, number];
    const [ya, yb] = y.split("-").map(Number) as [number, number];
    return xa !== ya ? xa - ya : xb - yb;
  });
  for (const key of edgeKeys) {
    const use = edges.get(key)!;
    const total = use.forward + use.backward;
    if (total === 1) {
      violations.push({ kind: "open-edge", detail: `edge ${key} used by one triangle` });
    } else if (total > 2) {
      violations.push({ kind: "nonmanifold-edge", detail: `edge ${key} used by ${total} triangles` });
    } else if (use.forward !== 1 || use.backward !== 1) {
      violations.push({ kind: "inconsistent-winding", detail: `edge ${key} used twice in the same direction` });
    }
  }

  // (c): fan closure, vertices ascending
  const fanVertices = [...links.keys()].sort((x, y) => x - y);
  for (const v of fanVertices) {
    if (nonmanifoldVertex.has(v)) {
      violations.push({ kind: "nonmanifold-vertex", detail: `vertex ${v} has two fan wedges leaving the same neighbor` });
      continue;
    }
    const link = links.get(v)!;
    let open = false;
    for (const to of link.values()) {
      if (!link.has(to)) {
        violations.push({ kind: "open-fan", detail: `vertex ${v} fan does not return through neighbor ${to}` });
        open = true;
      }
    }
    if (open) continue;
    // every neighbor has in-degree and out-degree 1; count the cycle from the
    // smallest neighbor — fewer steps than wedges means the fan is split
    const startNbr = Math.min(...link.keys());
    let cursor = startNbr;
    let steps = 0;
    do {
      cursor = link.get(cursor)!;
      steps++;
    } while (cursor !== startNbr && steps <= link.size);
    if (steps !== link.size) {
      violations.push({ kind: "split-fan", detail: `vertex ${v} fan splits into multiple cycles` });
    }
  }

  return { closed: violations.length === 0, violations };
}
