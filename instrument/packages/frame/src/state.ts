/**
 * FrameState — the evaluated frame: cells, shared curves, vertices, datums,
 * groups, materials, recorded feature ops, and the persistent-naming maps
 * (cell parentage, curve aliases, detach families).
 *
 * Everything here is derivation from the verb history; nothing is storage.
 * All mutating ops are called by verb executors in @car/history and must be
 * strictly deterministic: same call sequence, same state, bit for bit.
 *
 * Watertightness mechanism (statute clause 17): a shared curve is ONE object
 * owned by all neighbors — moving it moves every owner's boundary because
 * they reference it. Junction maintenance beyond that mechanism: rigid and
 * taper moves drag coincident endpoints of *welded* neighbor curves with a
 * linear-weight stretch (straight edges stay straight); rotation never drags
 * outside the rotating set — it either carries whole welds or throws,
 * demanding an explicit detach.
 */

import type {
  Id,
  IdAllocator,
  JsonValue,
  LineSpec,
  Pt2,
  Pt3,
  QuiltSpec,
  RectSpec,
} from "@car/schema";
import { idKind } from "@car/schema";
import {
  DEG,
  add3,
  chainEnd,
  chainStart,
  dist3,
  evalChain,
  fitLineOrtho,
  lerp,
  len3,
  lineChain,
  mapChain,
  norm3,
  rotate3,
  scale3,
  splitCubic,
  sub2,
  sub3,
} from "@car/num";
import {
  COINCIDENT_EPS,
  PARAM_EPS,
  dragChainEnd,
  remapParamAfterInsert,
  samePt,
  segAt,
  sideParamToCurveParam,
} from "./geometry.js";
import type {
  Cell,
  Datum,
  FeatureOp,
  Group,
  Material,
  PushPullTarget,
  SharedCurve,
  Trim,
  SideRef,
  Vertex,
} from "./records.js";
import { viewToWorld, worldToView } from "./views.js";
import { computeEvaluatedBuffers, computeQuilt, type EvaluatedObject } from "./evaluate.js";

// Fixed sampling/iteration counts — determinism over convergence noise.
const SPLIT_SAMPLES = 64;
const BISECT_ITERATIONS = 48;
const CORNER_U_EPS = 1e-7;

const numericId = (id: Id): number => Number(id.slice(id.indexOf("#") + 1));

export interface BoxResult {
  readonly cellIds: readonly Id[];
  readonly curveIds: readonly Id[];
  readonly vertexIds: readonly Id[];
}

export interface SplitResult {
  readonly children: readonly [Id, Id];
  readonly interiorCurveId: Id;
  readonly vertexIds: readonly [Id, Id];
}

export class FrameState {
  readonly cells = new Map<Id, Cell>();
  readonly curves = new Map<Id, SharedCurve>();
  readonly vertices = new Map<Id, Vertex>();
  readonly groups = new Map<Id, Group>();
  readonly datums = new Map<Id, Datum>();
  readonly materials = new Map<Id, Material>();
  readonly features = new Map<Id, FeatureOp>();

  /** Persistent naming: split parent -> its two children. */
  private readonly parentage = new Map<Id, readonly [Id, Id]>();
  /** Persistent naming: welded-away curve -> the surviving curve. */
  private readonly curveAliases = new Map<Id, Id>();
  /** Detach bookkeeping: every curve in a severed family -> family root. */
  private readonly detachFamily = new Map<Id, Id>();
  /** Provenance: detach copy -> the curve it was detached from. */
  readonly detachedFrom = new Map<Id, Id>();

  // -------------------------------------------------------------------------
  // Persistent naming
  // -------------------------------------------------------------------------

  /** A verb bound to a since-split cell resolves to its living descendants. */
  resolveCell(id: Id): Id[] {
    if (this.cells.has(id)) return [id];
    const kids = this.parentage.get(id);
    if (!kids) throw new Error(`unknown cell ${id}`);
    const out: Id[] = [];
    for (const k of kids) out.push(...this.resolveCell(k));
    return out;
  }

  /** A verb bound to a welded-away curve resolves through its aliases. */
  resolveCurve(id: Id): Id {
    let cur = id;
    let hops = 0;
    while (!this.curves.has(cur)) {
      const next = this.curveAliases.get(cur);
      if (!next) throw new Error(`unknown curve ${cur}`);
      cur = next;
      hops += 1;
      if (hops > this.curveAliases.size + 1) throw new Error(`curve alias cycle at ${id}`);
    }
    return cur;
  }

  private mustCurve(id: Id): SharedCurve {
    const c = this.curves.get(this.resolveCurve(id));
    if (!c) throw new Error(`unknown curve ${id}`);
    return c;
  }

  private mustCell(id: Id): Cell {
    const c = this.cells.get(id);
    if (!c) throw new Error(`unknown cell ${id}`);
    return c;
  }

  private familyRoot(id: Id): Id {
    return this.detachFamily.get(id) ?? id;
  }

  // -------------------------------------------------------------------------
  // createBox
  // -------------------------------------------------------------------------

  createBox(rect: RectSpec, alloc: IdAllocator): BoxResult {
    if (Math.abs(rect.a[0] - rect.b[0]) <= COINCIDENT_EPS ||
        Math.abs(rect.a[1] - rect.b[1]) <= COINCIDENT_EPS) {
      throw new Error("degenerate box rect: zero width or height");
    }
    if (Math.abs(rect.depth) <= COINCIDENT_EPS) {
      throw new Error("degenerate box rect: zero depth");
    }
    const lo2: Pt2 = [Math.min(rect.a[0], rect.b[0]), Math.min(rect.a[1], rect.b[1])];
    const hi2: Pt2 = [Math.max(rect.a[0], rect.b[0]), Math.max(rect.a[1], rect.b[1])];
    const w0 = Math.min(rect.at, rect.at + rect.depth);
    const w1 = Math.max(rect.at, rect.at + rect.depth);
    const cA = viewToWorld(rect.view, lo2, w0);
    const cB = viewToWorld(rect.view, hi2, w1);
    const lo: Pt3 = [Math.min(cA[0], cB[0]), Math.min(cA[1], cB[1]), Math.min(cA[2], cB[2])];
    const hi: Pt3 = [Math.max(cA[0], cB[0]), Math.max(cA[1], cB[1]), Math.max(cA[2], cB[2])];

    // Vertices v[i][j][k], allocated in lexicographic (i,j,k) order.
    const corner = (i: number, j: number, k: number): Pt3 => [
      i ? hi[0] : lo[0], j ? hi[1] : lo[1], k ? hi[2] : lo[2],
    ];
    const vertexIds: Id[] = [];
    const vertexAt: Pt3[] = [];
    for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) for (let k = 0; k < 2; k++) {
      const id = alloc.next("vertex");
      const at = corner(i, j, k);
      this.vertices.set(id, { id, at });
      vertexIds.push(id);
      vertexAt.push(at);
    }
    const vi = (i: number, j: number, k: number): number => i * 4 + j * 2 + k;

    // Edges in canonical direction; X-edges, then Y-edges, then Z-edges.
    const edgePairs: Array<readonly [number, number]> = [];
    for (let j = 0; j < 2; j++) for (let k = 0; k < 2; k++) edgePairs.push([vi(0, j, k), vi(1, j, k)]);
    for (let i = 0; i < 2; i++) for (let k = 0; k < 2; k++) edgePairs.push([vi(i, 0, k), vi(i, 1, k)]);
    for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) edgePairs.push([vi(i, j, 0), vi(i, j, 1)]);

    const curveIds: Id[] = [];
    const edgeByPair = new Map<string, { id: Id; reversed: boolean }>();
    for (const [a, b] of edgePairs) {
      const id = alloc.next("curve");
      const va = vertexAt[a];
      const vb = vertexAt[b];
      if (!va || !vb) throw new Error("box corner index out of range");
      this.curves.set(id, { id, chain: lineChain(va, vb), trims: [], crease: false, gap: false });
      curveIds.push(id);
      edgeByPair.set(`${a}-${b}`, { id, reversed: false });
      edgeByPair.set(`${b}-${a}`, { id, reversed: true });
    }

    // Faces in fixed order -X, +X, -Y, +Y, -Z, +Z; loops CCW seen from outside.
    const faceLoops: Array<readonly [number, number, number, number]> = [
      [vi(0, 0, 0), vi(0, 0, 1), vi(0, 1, 1), vi(0, 1, 0)], // -X
      [vi(1, 0, 0), vi(1, 1, 0), vi(1, 1, 1), vi(1, 0, 1)], // +X
      [vi(0, 0, 0), vi(1, 0, 0), vi(1, 0, 1), vi(0, 0, 1)], // -Y
      [vi(0, 1, 0), vi(0, 1, 1), vi(1, 1, 1), vi(1, 1, 0)], // +Y
      [vi(0, 0, 0), vi(0, 1, 0), vi(1, 1, 0), vi(1, 0, 0)], // -Z
      [vi(0, 0, 1), vi(1, 0, 1), vi(1, 1, 1), vi(0, 1, 1)], // +Z
    ];
    const cellIds: Id[] = [];
    for (const loop of faceLoops) {
      const id = alloc.next("cell");
      const sides = loop.map((va, idx) => {
        const vb = loop[(idx + 1) % 4];
        const edge = edgeByPair.get(`${va}-${vb}`);
        if (edge === undefined || vb === undefined) throw new Error("box loop edge missing");
        return { curveId: edge.id, t0: 0, t1: 1, reversed: edge.reversed } satisfies SideRef;
      }) as [SideRef, SideRef, SideRef, SideRef];
      const cell: Cell = { id, sides, mirror: "auto" };
      this.cells.set(id, cell);
      cellIds.push(id);
      for (const s of sides) {
        const curve = this.curves.get(s.curveId);
        if (!curve) throw new Error("box side curve missing");
        curve.trims.push({ cellId: id, t0: s.t0, t1: s.t1, reversed: s.reversed });
      }
    }
    return { cellIds, curveIds, vertexIds };
  }

  // -------------------------------------------------------------------------
  // splitCell — the tape split; creates the T-junction on neighbor curves
  // -------------------------------------------------------------------------

  splitCell(cellId: Id, line: LineSpec, alloc: IdAllocator): SplitResult {
    if (line.lineClass !== "tape") {
      throw new Error("sketch lines never split — only tape lines cross cells");
    }
    const cell = this.mustCell(cellId);
    const dir2 = sub2(line.b, line.a);
    const dirLen = Math.sqrt(dir2[0] * dir2[0] + dir2[1] * dir2[1]);
    if (dirLen <= COINCIDENT_EPS) throw new Error("degenerate tape line");
    const ux = dir2[0] / dirLen;
    const uy = dir2[1] / dirLen;
    // signed distance (mm) of a view point from the tape line
    const sideOf = (q: Pt2): number => ux * (q[1] - line.a[1]) - uy * (q[0] - line.a[0]);

    const sidePoint = (ref: SideRef, u: number): Pt3 => {
      const curve = this.mustCurve(ref.curveId);
      return evalChain(curve.chain, sideParamToCurveParam(ref.t0, ref.t1, ref.reversed, u));
    };

    const crossings: Array<{ side: number; u: number }> = [];
    for (let k = 0; k < 4; k++) {
      const ref = cell.sides[k];
      if (!ref) throw new Error("cell has fewer than four sides");
      const samples: number[] = [];
      for (let m = 0; m <= SPLIT_SAMPLES; m++) {
        samples.push(sideOf(worldToView(line.view, sidePoint(ref, m / SPLIT_SAMPLES))));
      }
      const s0 = samples[0];
      const sN = samples[SPLIT_SAMPLES];
      if (s0 === undefined || sN === undefined) throw new Error("sampling failed");
      if (Math.abs(s0) <= COINCIDENT_EPS || Math.abs(sN) <= COINCIDENT_EPS) {
        throw new Error(`tape line passes through a corner of ${cellId}`);
      }
      // sign-change brackets, skipping near-zero interior samples
      let lastSign = Math.sign(s0);
      let lastIdx = 0;
      const found: number[] = [];
      for (let m = 1; m <= SPLIT_SAMPLES; m++) {
        const s = samples[m];
        if (s === undefined || Math.abs(s) <= COINCIDENT_EPS) continue;
        const sign = Math.sign(s);
        if (sign !== lastSign) {
          // bisect [lastIdx, m] with a fixed iteration count
          let uLo = lastIdx / SPLIT_SAMPLES;
          let uHi = m / SPLIT_SAMPLES;
          let sLo = samples[lastIdx];
          if (sLo === undefined) throw new Error("sampling failed");
          for (let it = 0; it < BISECT_ITERATIONS; it++) {
            const uMid = (uLo + uHi) / 2;
            const sMid = sideOf(worldToView(line.view, sidePoint(ref, uMid)));
            if (sLo * sMid <= 0) uHi = uMid;
            else { uLo = uMid; sLo = sMid; }
          }
          found.push((uLo + uHi) / 2);
        }
        lastSign = sign;
        lastIdx = m;
      }
      if (found.length > 1) {
        throw new Error(`tape line crosses side ${k} of ${cellId} more than once`);
      }
      const u = found[0];
      if (u !== undefined) {
        if (u <= CORNER_U_EPS || u >= 1 - CORNER_U_EPS) {
          throw new Error(`tape line passes through a corner of ${cellId}`);
        }
        crossings.push({ side: k, u });
      }
    }

    if (crossings.length !== 2) {
      throw new Error(`tape line must cross exactly two sides of ${cellId} (crossed ${crossings.length})`);
    }
    const [c1, c2] = crossings as [{ side: number; u: number }, { side: number; u: number }];
    if ((c2.side - c1.side) % 4 !== 2) {
      throw new Error(`tape split must cross two opposite sides of ${cellId}`);
    }

    // Relabel so the loop reads q0(crossed), q1, q2(crossed), q3.
    const k0 = c1.side;
    const q = (n: number): SideRef => {
      const ref = cell.sides[(k0 + n) % 4];
      if (!ref) throw new Error("cell side missing");
      return ref;
    };
    const uA = c1.u;
    const uC = c2.u;
    const q0 = q(0), q1 = q(1), q2 = q(2), q3 = q(3);
    const tcA = sideParamToCurveParam(q0.t0, q0.t1, q0.reversed, uA);
    const tcC = sideParamToCurveParam(q2.t0, q2.t1, q2.reversed, uC);
    const pA = evalChain(this.mustCurve(q0.curveId).chain, tcA);
    const pC = evalChain(this.mustCurve(q2.curveId).chain, tcC);

    // Allocation order (fixed): interior curve, vertex at q0 crossing,
    // vertex at q2 crossing, child A, child B.
    const interiorId = alloc.next("curve");
    this.curves.set(interiorId, {
      id: interiorId, chain: lineChain(pA, pC), trims: [], crease: false, gap: false,
    });
    const vaId = alloc.next("vertex");
    this.vertices.set(vaId, { id: vaId, at: pA });
    const vcId = alloc.next("vertex");
    this.vertices.set(vcId, { id: vcId, at: pC });
    const childAId = alloc.next("cell");
    const childBId = alloc.next("cell");

    const sub = (ref: SideRef, u0: number, u1: number): SideRef =>
      ref.reversed
        ? { curveId: ref.curveId, t0: lerp(ref.t1, ref.t0, u1), t1: lerp(ref.t1, ref.t0, u0), reversed: true }
        : { curveId: ref.curveId, t0: lerp(ref.t0, ref.t1, u0), t1: lerp(ref.t0, ref.t1, u1), reversed: false };
    const copy = (ref: SideRef): SideRef => ({ ...ref });

    const sidesA: [SideRef, SideRef, SideRef, SideRef] = [
      sub(q0, uA, 1),
      copy(q1),
      sub(q2, 0, uC),
      { curveId: interiorId, t0: 0, t1: 1, reversed: true },
    ];
    const sidesB: [SideRef, SideRef, SideRef, SideRef] = [
      { curveId: interiorId, t0: 0, t1: 1, reversed: false },
      sub(q2, uC, 1),
      copy(q3),
      sub(q0, 0, uA),
    ];

    const inherit = (id: Id, sides: [SideRef, SideRef, SideRef, SideRef]): Cell => {
      const child: Cell = { id, sides, parent: cellId, mirror: cell.mirror };
      if (cell.groupId !== undefined) child.groupId = cell.groupId;
      if (cell.materialId !== undefined) child.materialId = cell.materialId;
      return child;
    };
    const childA = inherit(childAId, sidesA);
    const childB = inherit(childBId, sidesB);

    // Trim surgery. Crossed curves: the parent's trim subdivides for the two
    // children; every OTHER owner's trim stays whole — that is the T-junction.
    const retarget = (ref: SideRef, newCellId: Id): void => {
      const curve = this.mustCurve(ref.curveId);
      curve.trims = curve.trims.filter((t) => t.cellId !== cellId);
      curve.trims.push({ cellId: newCellId, t0: ref.t0, t1: ref.t1, reversed: ref.reversed });
    };
    // q0's curve carries both children's sub-trims; drop the parent trim once.
    const curveQ0 = this.mustCurve(q0.curveId);
    curveQ0.trims = curveQ0.trims.filter((t) => t.cellId !== cellId);
    const a0 = sidesA[0];
    const b3 = sidesB[3];
    curveQ0.trims.push({ cellId: childAId, t0: a0.t0, t1: a0.t1, reversed: a0.reversed });
    curveQ0.trims.push({ cellId: childBId, t0: b3.t0, t1: b3.t1, reversed: b3.reversed });
    const curveQ2 = this.mustCurve(q2.curveId);
    curveQ2.trims = curveQ2.trims.filter((t) => t.cellId !== cellId);
    const a2 = sidesA[2];
    const b1 = sidesB[1];
    curveQ2.trims.push({ cellId: childAId, t0: a2.t0, t1: a2.t1, reversed: a2.reversed });
    curveQ2.trims.push({ cellId: childBId, t0: b1.t0, t1: b1.t1, reversed: b1.reversed });
    retarget(sidesA[1], childAId);
    retarget(sidesB[2], childBId);
    const interior = this.mustCurve(interiorId);
    interior.trims.push({ cellId: childAId, t0: 0, t1: 1, reversed: true });
    interior.trims.push({ cellId: childBId, t0: 0, t1: 1, reversed: false });

    this.cells.delete(cellId);
    this.cells.set(childAId, childA);
    this.cells.set(childBId, childB);
    this.parentage.set(cellId, [childAId, childBId]);

    return { children: [childAId, childBId], interiorCurveId: interiorId, vertexIds: [vaId, vcId] };
  }

  // -------------------------------------------------------------------------
  // weld / detach
  // -------------------------------------------------------------------------

  weld(curveA: Id, curveB: Id): Id {
    const a = this.mustCurve(curveA);
    const b = this.mustCurve(curveB);
    if (a.id === b.id) throw new Error(`weld: ${curveA} and ${curveB} are the same curve`);
    const [winner, loser] = numericId(a.id) < numericId(b.id) ? [a, b] : [b, a];

    const wS = chainStart(winner.chain), wE = chainEnd(winner.chain), wM = evalChain(winner.chain, 0.5);
    const lS = chainStart(loser.chain), lE = chainEnd(loser.chain), lM = evalChain(loser.chain, 0.5);
    const sameDir = samePt(wS, lS) && samePt(wE, lE) && samePt(wM, lM);
    const oppDir = !sameDir && samePt(wS, lE) && samePt(wE, lS) && samePt(wM, lM);
    if (!sameDir && !oppDir) {
      throw new Error(`weld requires geometrically coincident curves (${winner.id} vs ${loser.id})`);
    }

    const flip = oppDir;
    for (const t of loser.trims) {
      winner.trims.push(
        flip
          ? { cellId: t.cellId, t0: 1 - t.t1, t1: 1 - t.t0, reversed: !t.reversed }
          : { cellId: t.cellId, t0: t.t0, t1: t.t1, reversed: t.reversed },
      );
    }
    for (const cell of this.cells.values()) {
      for (const s of cell.sides) {
        if (s.curveId === loser.id) {
          s.curveId = winner.id;
          if (flip) {
            const t0 = 1 - s.t1;
            const t1 = 1 - s.t0;
            s.t0 = t0;
            s.t1 = t1;
            s.reversed = !s.reversed;
          }
        }
      }
    }
    winner.crease = winner.crease || loser.crease;
    winner.gap = winner.gap || loser.gap;
    this.curves.delete(loser.id);
    this.curveAliases.set(loser.id, winner.id);
    return winner.id;
  }

  /**
   * Split a shared curve back into per-cell copies. The owner with the lowest
   * cell id keeps the original curve id; every other trim moves to a fresh
   * curve (recorded in detachedFrom). All copies join one severed family so
   * later drags never re-glue them.
   */
  detach(curveId: Id, alloc: IdAllocator): Id[] {
    const curve = this.mustCurve(curveId);
    if (curve.trims.length < 2) throw new Error(`detach: ${curve.id} is not shared`);
    const root = this.familyRoot(curve.id);
    this.detachFamily.set(curve.id, root);
    const ordered = [...curve.trims].sort(
      (x, y) => numericId(x.cellId) - numericId(y.cellId) || x.t0 - y.t0,
    );
    const keep = ordered[0];
    if (!keep) throw new Error("detach: empty trim list");
    const freshIds: Id[] = [];
    const rest = ordered.slice(1);
    for (const trim of rest) {
      const freshId = alloc.next("curve");
      freshIds.push(freshId);
      const fresh: SharedCurve = {
        id: freshId,
        chain: { segs: [...curve.chain.segs] },
        trims: [{ cellId: trim.cellId, t0: trim.t0, t1: trim.t1, reversed: trim.reversed }],
        crease: curve.crease,
        gap: curve.gap,
      };
      this.curves.set(freshId, fresh);
      this.detachFamily.set(freshId, root);
      this.detachedFrom.set(freshId, curve.id);
      const cell = this.mustCell(trim.cellId);
      for (const s of cell.sides) {
        if (s.curveId === curve.id && s.t0 === trim.t0 && s.t1 === trim.t1) {
          s.curveId = freshId;
        }
      }
    }
    curve.trims = [keep];
    return freshIds;
  }

  // -------------------------------------------------------------------------
  // Motion: push-pull, rotate, taper
  // -------------------------------------------------------------------------

  /**
   * Move a set of curves by `map`, then maintain junctions:
   *  - junction points are the moved curves' chain endpoints plus their
   *    interior trim boundaries (T-points)
   *  - dragOutside: endpoints of unmoved, un-severed curves coincident with a
   *    junction follow it (linear-weight stretch); vertices there follow
   *  - !dragOutside (rotation): nothing outside moves; a vertex moves only
   *    when no unmoved curve terminates on it
   */
  private deformCurves(ids: ReadonlySet<Id>, map: (p: Pt3) => Pt3, dragOutside: boolean): void {
    const junctions: Pt3[] = [];
    const pushJunction = (p: Pt3): void => {
      if (!junctions.some((j) => samePt(j, p))) junctions.push(p);
    };
    for (const id of ids) {
      const curve = this.mustCurve(id);
      pushJunction(chainStart(curve.chain));
      pushJunction(chainEnd(curve.chain));
      for (const trim of curve.trims) {
        for (const t of [trim.t0, trim.t1]) {
          if (t > PARAM_EPS && t < 1 - PARAM_EPS) pushJunction(evalChain(curve.chain, t));
        }
      }
    }
    const movedRoots = new Set<Id>();
    for (const id of ids) movedRoots.add(this.familyRoot(id));

    for (const id of ids) {
      const curve = this.mustCurve(id);
      curve.chain = mapChain(curve.chain, map);
    }

    if (dragOutside) {
      for (const curve of this.curves.values()) {
        if (ids.has(curve.id)) continue;
        if (movedRoots.has(this.familyRoot(curve.id)) && this.detachFamily.has(curve.id)) continue;
        const s = chainStart(curve.chain);
        const e = chainEnd(curve.chain);
        const dragStart = junctions.some((j) => samePt(j, s));
        const dragEnd = junctions.some((j) => samePt(j, e));
        if (dragStart) curve.chain = dragChainEnd(curve.chain, "start", sub3(map(s), s));
        if (dragEnd) curve.chain = dragChainEnd(curve.chain, "end", sub3(map(e), e));
      }
      for (const v of this.vertices.values()) {
        if (junctions.some((j) => samePt(j, v.at))) v.at = map(v.at);
      }
    } else {
      for (const v of this.vertices.values()) {
        if (!junctions.some((j) => samePt(j, v.at))) continue;
        let anchored = false;
        for (const curve of this.curves.values()) {
          if (ids.has(curve.id)) continue;
          // endpoints of unmoved curves are already at their new (= old) spots
          if (samePt(chainStart(curve.chain), v.at) || samePt(chainEnd(curve.chain), v.at)) {
            anchored = true;
            break;
          }
        }
        if (!anchored) v.at = map(v.at);
      }
    }
  }

  pushPull(target: PushPullTarget, delta: Pt3): void {
    const translate = (p: Pt3): Pt3 => add3(p, delta);
    switch (target.kind) {
      case "cell": {
        const leaves = this.resolveCell(target.id);
        const ids = new Set<Id>();
        for (const leafId of leaves) {
          for (const s of this.mustCell(leafId).sides) ids.add(this.resolveCurve(s.curveId));
        }
        this.deformCurves(ids, translate, true);
        return;
      }
      case "curve": {
        this.deformCurves(new Set([this.resolveCurve(target.id)]), translate, true);
        return;
      }
      case "vertex": {
        const v = this.vertices.get(target.id);
        if (!v) throw new Error(`unknown vertex ${target.id}`);
        const old = v.at;
        v.at = add3(old, delta);
        for (const curve of this.curves.values()) {
          if (samePt(chainStart(curve.chain), old)) {
            curve.chain = dragChainEnd(curve.chain, "start", delta);
          }
          if (samePt(chainEnd(curve.chain), old)) {
            curve.chain = dragChainEnd(curve.chain, "end", delta);
          }
        }
        return;
      }
      case "ctrl": {
        const curve = this.mustCurve(target.id);
        const segs = [...curve.chain.segs];
        const seg = segs[target.seg];
        if (!seg) throw new Error(`ctrl target out of range: seg ${target.seg} of ${curve.id}`);
        const points: [Pt3, Pt3, Pt3, Pt3] = [seg.p0, seg.p1, seg.p2, seg.p3];
        const old = points[target.idx];
        const moved = add3(old, delta);
        points[target.idx] = moved;
        segs[target.seg] = { p0: points[0], p1: points[1], p2: points[2], p3: points[3] };
        // preserve C0 at interior seams
        if (target.idx === 0 && target.seg > 0) {
          const prev = segs[target.seg - 1];
          if (prev) segs[target.seg - 1] = { ...prev, p3: moved };
        }
        if (target.idx === 3 && target.seg < segs.length - 1) {
          const next = segs[target.seg + 1];
          if (next) segs[target.seg + 1] = { ...next, p0: moved };
        }
        curve.chain = { segs };
        // a chain-end control point is a junction: preserve weld coincidence
        const isChainStart = target.seg === 0 && target.idx === 0;
        const isChainEnd = target.seg === segs.length - 1 && target.idx === 3;
        if (isChainStart || isChainEnd) {
          for (const other of this.curves.values()) {
            if (other.id === curve.id) continue;
            if (samePt(chainStart(other.chain), old)) {
              other.chain = dragChainEnd(other.chain, "start", delta);
            }
            if (samePt(chainEnd(other.chain), old)) {
              other.chain = dragChainEnd(other.chain, "end", delta);
            }
          }
          for (const v of this.vertices.values()) {
            if (samePt(v.at, old)) v.at = moved;
          }
        }
        return;
      }
    }
  }

  rotate(cellIds: readonly Id[], origin: Pt3, axis: Pt3, angleDeg: number): void {
    const unit = norm3(axis);
    if (unit[0] === 0 && unit[1] === 0 && unit[2] === 0) throw new Error("rotate: zero axis");
    const leaves = new Set<Id>();
    for (const id of cellIds) for (const leaf of this.resolveCell(id)) leaves.add(leaf);
    const moved = new Set<Id>();
    for (const leafId of [...leaves].sort((x, y) => numericId(x) - numericId(y))) {
      for (const s of this.mustCell(leafId).sides) moved.add(this.resolveCurve(s.curveId));
    }
    // Clause 17: rotation drags whole welds or demands an explicit detach.
    for (const curveId of [...moved].sort((x, y) => numericId(x) - numericId(y))) {
      for (const trim of this.mustCurve(curveId).trims) {
        if (!leaves.has(trim.cellId)) {
          throw new Error(`rotation requires explicit detach of ${curveId}`);
        }
      }
    }
    const angle = angleDeg * DEG;
    const map = (p: Pt3): Pt3 => add3(origin, rotate3(sub3(p, origin), unit, angle));
    this.deformCurves(moved, map, false);
  }

  taper(cellId: Id, side: 0 | 1 | 2 | 3, scale: number): void {
    if (!Number.isFinite(scale) || scale < 0) throw new Error("taper: scale must be finite and >= 0");
    const leaves = this.resolveCell(cellId).sort((x, y) => numericId(x) - numericId(y));
    for (const leafId of leaves) {
      const ref = this.mustCell(leafId).sides[side];
      if (!ref) throw new Error(`taper: cell ${leafId} has no side ${side}`);
      const curveId = this.resolveCurve(ref.curveId);
      const center = evalChain(this.mustCurve(curveId).chain, 0.5);
      this.deformCurves(new Set([curveId]), (p) => scaleChainTowardPoint(p, center, scale), true);
    }
  }

  // -------------------------------------------------------------------------
  // Marks, groups, materials, datums, points, features
  // -------------------------------------------------------------------------

  markCrease(curveId: Id): void {
    this.mustCurve(curveId).crease = true;
  }

  markGap(curveId: Id): void {
    this.mustCurve(curveId).gap = true;
  }

  /**
   * Set how hard the named cells leave their seams — crown, in the surfacer's
   * sense, and the first control this frame has ever had over a patch INTERIOR.
   *
   * A Coons patch interpolates four curves and everything between them follows;
   * that is why row 7 of the audit has read "interiors are determined, never
   * designed" from the beginning, and why the P1's flank reads as a slab. The
   * amount multiplies the transverse part of the cross-boundary derivative, so
   * the patch leaves its boundary harder and the middle bulges.
   *
   * It cannot move a boundary point — the boundary IS the curve — and it
   * cannot rotate a tangent plane, because scaling a vector does not change
   * the plane it spans with another. So it is a shape control that costs
   * nothing in continuity, which is the only kind worth having here.
   */
  setFullness(cellIds: readonly Id[], amount: number): void {
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error(`fullness: amount must be a positive number, got ${amount}`);
    }
    for (const id of cellIds) {
      const cell = this.cells.get(id);
      if (!cell) throw new Error(`fullness: unknown cell ${id}`);
      cell.fullness = amount;
    }
  }

  /**
   * Point one end of a curve's tangent in a new direction, by moving ONE
   * control point.
   *
   * `dir` is the outgoing direction from that endpoint into the chain. The
   * ENDPOINT ITSELF NEVER MOVES, which is the whole safety of this operation:
   * every weld still meets at the same point, every trim endpoint at t=0 or
   * t=1 is unchanged, and the quilt stays watertight by exactly the mechanism
   * it always used. What does move is the curve between — and any trim
   * endpoint at an INTERIOR parameter, which is a real consequence and the
   * reason a caller has to re-measure rather than assume.
   *
   * The control point keeps its distance from the endpoint, so this changes
   * the tangent's direction and not its weight.
   */
  setEndTangent(curveId: Id, end: 0 | 1, dir: Pt3): void {
    if (!dir.every((c) => Number.isFinite(c))) {
      throw new Error("setEndTangent: direction must be finite");
    }
    if (len3(dir) === 0) throw new Error("setEndTangent: direction must be non-zero");
    const curve = this.mustCurve(this.resolveCurve(curveId));
    const segs = [...curve.chain.segs];
    if (segs.length === 0) return;
    const unit = norm3(dir);
    if (end === 0) {
      const seg = segs[0]!;
      const reach = dist3(seg.p0, seg.p1);
      if (reach === 0) return;      // no tangent to point; a degenerate handle
      segs[0] = { ...seg, p1: add3(seg.p0, scale3(unit, reach)) };
    } else {
      const i = segs.length - 1;
      const seg = segs[i]!;
      const reach = dist3(seg.p3, seg.p2);
      if (reach === 0) return;
      segs[i] = { ...seg, p2: add3(seg.p3, scale3(unit, reach)) };
    }
    curve.chain = { segs };
  }

  group(cellIds: readonly Id[], name: string, alloc: IdAllocator): Id {
    if (cellIds.length === 0) throw new Error("group: needs at least one cell");
    const id = alloc.next("group");
    for (const cid of cellIds) {
      for (const leaf of this.resolveCell(cid)) this.mustCell(leaf).groupId = id;
    }
    this.groups.set(id, { id, name, cellIds: [...cellIds] });
    return id;
  }

  assignMaterial(targetId: Id, spec: { name: string; color: string }, alloc: IdAllocator): Id {
    let materialId: Id | undefined;
    for (const m of this.materials.values()) {
      if (m.name === spec.name && m.color === spec.color) {
        materialId = m.id;
        break;
      }
    }
    if (materialId === undefined) {
      materialId = alloc.next("material");
      this.materials.set(materialId, { id: materialId, name: spec.name, color: spec.color });
    }
    const kind = idKind(targetId);
    if (kind === "cell") {
      for (const leaf of this.resolveCell(targetId)) this.mustCell(leaf).materialId = materialId;
    } else if (kind === "group") {
      const g = this.groups.get(targetId);
      if (!g) throw new Error(`unknown group ${targetId}`);
      for (const cid of g.cellIds) {
        for (const leaf of this.resolveCell(cid)) this.mustCell(leaf).materialId = materialId;
      }
    } else {
      throw new Error(`assign-material target must be a cell or group, got ${targetId}`);
    }
    return materialId;
  }

  mirrorDetach(cellId: Id): void {
    for (const leaf of this.resolveCell(cellId)) this.mustCell(leaf).mirror = "detached";
  }

  /** Subdivide the chain segment at t via de Casteljau — shape preserved exactly. */
  placePoint(curveId: Id, t: number): void {
    if (!Number.isFinite(t) || t < 0 || t > 1) throw new Error("place-point: t must be in [0,1]");
    const curve = this.mustCurve(curveId);
    const { i, u } = segAt(curve.chain, t);
    if (u <= PARAM_EPS || u >= 1 - PARAM_EPS) return; // a control point already sits here
    const seg = curve.chain.segs[i];
    if (!seg) throw new Error("place-point: segment out of range");
    const [left, right] = splitCubic(seg, u);
    const oldCount = curve.chain.segs.length;
    curve.chain = {
      segs: [...curve.chain.segs.slice(0, i), left, right, ...curve.chain.segs.slice(i + 1)],
    };
    // Uniform parameterization shifted: remap every recorded param on this curve.
    const remap = (p: number): number => remapParamAfterInsert(p, oldCount, i, u);
    for (const trim of curve.trims) {
      trim.t0 = remap(trim.t0);
      trim.t1 = remap(trim.t1);
    }
    for (const cell of this.cells.values()) {
      for (const s of cell.sides) {
        if (s.curveId === curve.id) {
          s.t0 = remap(s.t0);
          s.t1 = remap(s.t1);
        }
      }
    }
  }

  /**
   * Split one shared curve into two at parameter `t` — amendment A13.
   *
   * A tape split subdivides a curve's TRIMS, never the curve, so a long edge
   * stays one curve for the life of the body however many times it is cut.
   * That is the right law for a master line and it is why the rocker and the
   * beltline survive sectioning. It is also, exactly, why three separate
   * features have been unbuildable: a wheel arch needs the rocker lifted over
   * ONE stretch, a door outline needs the beltline gapped over ONE stretch,
   * and a screen aperture needs the same of the cowl. A mark is per-curve, so
   * a feature that owns part of a curve cannot be marked at all.
   *
   * The head keeps the original id, so every reference to the stretch before
   * `t` survives untouched; the tail gets a fresh one. Both inherit the marks,
   * because a split is a change of BOOKKEEPING and must not change what the
   * document says about the geometry.
   *
   * REFUSED when any cell claims across `t`. A cell has four sides by statute,
   * so splitting a side it holds would make it five-sided — and the honest
   * answer is that the caller must cut the cell there first, which is what
   * `tape` already does. The error names the cell so that is actionable.
   */
  splitCurve(curveId: Id, t: number, alloc: IdAllocator): [Id, Id] {
    if (!Number.isFinite(t) || t <= PARAM_EPS || t >= 1 - PARAM_EPS) {
      throw new Error(`split-curve: t must be strictly inside (0,1), got ${t}`);
    }
    const curve = this.mustCurve(curveId);
    for (const cell of this.cells.values()) {
      for (const side of cell.sides) {
        if (side.curveId !== curve.id) continue;
        const lo = Math.min(side.t0, side.t1), hi = Math.max(side.t0, side.t1);
        if (lo < t - PARAM_EPS && hi > t + PARAM_EPS) {
          throw new Error(
            `split-curve: ${cell.id} claims ${curve.id} across t=${t} ` +
            `(its side runs ${lo} to ${hi}) — cut the cell there first`);
        }
      }
    }

    // A split has to land on a segment boundary, so put one there if the
    // chain has not already got one. `placePoint` remaps every recorded
    // parameter on the curve, so the split parameter is recomputed after.
    const before = segAt(curve.chain, t);
    let k: number;
    if (before.u <= PARAM_EPS) {
      k = before.i;
    } else if (before.u >= 1 - PARAM_EPS) {
      k = before.i + 1;
    } else {
      this.placePoint(curveId, t);
      k = before.i + 1;
    }
    const n = curve.chain.segs.length;
    if (k <= 0 || k >= n) throw new Error(`split-curve: t=${t} is at an end of ${curve.id}`);
    const tSplit = k / n;

    const headSegs = curve.chain.segs.slice(0, k);
    const tailSegs = curve.chain.segs.slice(k);
    const toHead = (p: number): number => Math.min(1, Math.max(0, p / tSplit));
    const toTail = (p: number): number => Math.min(1, Math.max(0, (p - tSplit) / (1 - tSplit)));
    const onTail = (a: number, b: number): boolean => Math.min(a, b) >= tSplit - PARAM_EPS;

    const tailId = alloc.next("curve");
    const tail: SharedCurve = {
      id: tailId,
      chain: { segs: tailSegs },
      trims: [],
      crease: curve.crease,
      gap: curve.gap,
    };

    const keptTrims: Trim[] = [];
    for (const trim of curve.trims) {
      if (onTail(trim.t0, trim.t1)) {
        tail.trims.push({
          cellId: trim.cellId, t0: toTail(trim.t0), t1: toTail(trim.t1), reversed: trim.reversed,
        });
      } else {
        trim.t0 = toHead(trim.t0);
        trim.t1 = toHead(trim.t1);
        keptTrims.push(trim);
      }
    }
    curve.trims = keptTrims;
    curve.chain = { segs: headSegs };

    for (const cell of this.cells.values()) {
      for (const side of cell.sides) {
        if (side.curveId !== curve.id) continue;
        if (onTail(side.t0, side.t1)) {
          side.curveId = tailId;
          side.t0 = toTail(side.t0);
          side.t1 = toTail(side.t1);
        } else {
          side.t0 = toHead(side.t0);
          side.t1 = toHead(side.t1);
        }
      }
    }

    this.curves.set(tailId, tail);
    // The tail belongs to the same detach family as the head: a split is not a
    // detach, and a later `detach` on either must still see one family.
    const root = this.familyRoot(curve.id);
    this.detachFamily.set(tailId, root);
    return [curve.id, tailId];
  }

  fitThroughLine(points: readonly Pt3[], alloc: IdAllocator): Id {
    const fit = fitLineOrtho(points);
    const id = alloc.next("datum");
    this.datums.set(id, { id, kind: "through-line", line: { point: fit.point, dir: fit.dir } });
    return id;
  }

  addSketchLine(line: LineSpec, alloc: IdAllocator): Id {
    if (line.lineClass !== "sketch") throw new Error("addSketchLine: lineClass must be sketch");
    const id = alloc.next("datum");
    this.datums.set(id, { id, kind: "sketch-line", line });
    return id;
  }

  /** Cuts are RECORDED here; boolean evaluation happens downstream. */
  recordCut(args: JsonValue, verbSeq: number, alloc: IdAllocator): Id {
    const id = alloc.next("feature");
    this.features.set(id, { id, verbSeq, kind: "cut", args });
    return id;
  }

  // -------------------------------------------------------------------------
  // Evaluated output — derivation only, ID-sorted, feeds the replay hash
  // -------------------------------------------------------------------------

  evaluatedBuffers(): EvaluatedObject[] {
    return computeEvaluatedBuffers(this);
  }

  quilt(): QuiltSpec {
    return computeQuilt(this);
  }
}

/** Point-wise taper map so deformCurves can use a plain (p)=>Pt3. */
function scaleChainTowardPoint(p: Pt3, center: Pt3, scaleFactor: number): Pt3 {
  return add3(center, scale3(sub3(p, center), scaleFactor));
}
