/**
 * The real ModelPort: a live @car/history session evaluated through
 * @car/surface. New files open on a rolling chassis, never empty space
 * (statute clause 4) — the seed is itself a verb document spliced through
 * apply-entry, so the catalog grammar is exercised from the first frame.
 * The authored left rail arrives alone; the mirror law renders its twin.
 */

import type { CarDocument, Id, Pt3, RenderFeed } from "@car/schema";
import { createSession, load, type Session } from "@car/history";
import { evalChain } from "@car/num";
import { buildRenderFeed } from "@car/surface";
import type { ModelPort } from "./port";
import { sortedIds } from "./ids";

/**
 * How far a picked point may sit from a curve and still count as ON it. The
 * viewport picks within six pixels; at the loosest zoom that is 240 mm, and a
 * point further out than that was a miss, not a coarse hit.
 */
const MAX_PICK_MM = 240;

/** The starter chassis: two-rail body-on-frame, one grammar, five verbs. */
export function chassisEntry(): CarDocument {
  const s = createSession("entry:chassis/body-on-frame");
  // Left rail only — symmetry law supplies the right one at evaluation.
  s.apply("tape", { kind: "box", rect: { view: { kind: "side" }, a: [300, 150], b: [3900, 280], depth: 130, at: -715 } });
  // Crossmembers straddle the centerline: front, mid, rear.
  s.apply("tape", { kind: "box", rect: { view: { kind: "front" }, a: [-585, 160], b: [585, 270], depth: 120, at: 550 } });
  s.apply("tape", { kind: "box", rect: { view: { kind: "front" }, a: [-585, 160], b: [585, 270], depth: 120, at: 2050 } });
  s.apply("tape", { kind: "box", rect: { view: { kind: "front" }, a: [-585, 160], b: [585, 270], depth: 120, at: 3550 } });
  return s.save();
}

export interface SessionPort extends ModelPort {
  /** The live session — the ten-minute script drives this directly. */
  readonly session: Session;
  saveDocument(): CarDocument;
  creaseIds(): ReadonlySet<Id>;
  gapIds(): ReadonlySet<Id>;
  /** Last rejected proposal, for the ledger strip. Cleared by the next accept. */
  lastError(): string | null;
  /**
   * Undo the last verb by replaying history without it — the document IS the
   * replayable source of truth, so undo is derivation, not bookkeeping.
   * Returns false at the floor (the chassis seed stays; the site never opens
   * on empty space).
   */
  undo(): boolean;
}

export function makeSessionPort(seedChassis = true, fromDoc?: CarDocument): SessionPort {
  let session: Session;
  let undoFloor = 0;
  if (fromDoc) {
    session = load(fromDoc);
    undoFloor = 1; // assume a seed-shaped first verb; never undo to empty
  } else {
    session = createSession("untitled car");
    if (seedChassis) {
      session.apply("apply-entry", { entry: chassisEntry() as never });
      undoFloor = 1;
    }
  }

  let cachedFeed: RenderFeed | null = null;
  let error: string | null = null;
  const listeners = new Set<() => void>();
  const invalidate = (): void => {
    cachedFeed = null;
    for (const cb of listeners) cb();
  };

  return {
    get session(): Session {
      return session;
    },
    feed(): RenderFeed {
      cachedFeed ??= buildRenderFeed(session.state);
      return cachedFeed;
    },
    undo(): boolean {
      const doc = session.save();
      if (doc.verbs.length <= undoFloor) return false;
      const fresh = createSession(doc.title);
      for (const rec of doc.verbs.slice(0, -1)) {
        fresh.apply(rec.verb, rec.args as never);
      }
      session = fresh;
      error = null;
      invalidate();
      return true;
    },
    propose(verb: string, args: unknown): void {
      try {
        session.apply(verb as never, args as never);
        error = null;
        invalidate();
      } catch (e) {
        // A rejected verb is ledger content, never a crash: the model said no
        // and the reason is shown (e.g. clause-17 "rotation requires detach").
        error = e instanceof Error ? e.message : String(e);
        for (const cb of listeners) cb();
      }
    },
    onChange(cb: () => void): () => void {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    tree(): { cells: string[]; groups: string[]; datums: string[] } {
      const st = session.state;
      return {
        cells: sortedIds([...st.cells.keys()]),
        groups: sortedIds([...st.groups.keys()]),
        datums: sortedIds([...st.datums.keys()]),
      };
    },
    describe(id: string): string {
      const st = session.state;
      const cell = st.cells.get(id as Id);
      if (cell) {
        const bits = [id];
        if (cell.groupId) bits.push(`group ${st.groups.get(cell.groupId)?.name ?? cell.groupId}`);
        if (cell.materialId) bits.push(`material ${st.materials.get(cell.materialId)?.name ?? cell.materialId}`);
        bits.push(cell.mirror === "detached" ? "mirror: detached (recorded asymmetry)" : "mirror: auto");
        if (cell.parent) bits.push(`from ${cell.parent}`);
        return bits.join(" · ");
      }
      const curve = st.curves.get(id as Id);
      if (curve) {
        const bits = [id, `${curve.trims.length} owner${curve.trims.length === 1 ? "" : "s"}`];
        if (curve.crease) bits.push("deliberate crease");
        if (curve.gap) bits.push("gap curve");
        return bits.join(" · ");
      }
      const datum = st.datums.get(id as Id);
      if (datum) return `${id} · ${datum.kind}`;
      const group = st.groups.get(id as Id);
      if (group) return `${id} · "${group.name}" · ${group.cellIds.length} cells`;
      return `${id} · free authored geometry`;
    },
    saveDocument(): CarDocument {
      return session.save();
    },
    creaseIds(): ReadonlySet<Id> {
      const out = new Set<Id>();
      for (const [cid, c] of session.state.curves) if (c.crease) out.add(cid);
      return out;
    },
    gapIds(): ReadonlySet<Id> {
      const out = new Set<Id>();
      for (const [cid, c] of session.state.curves) if (c.gap) out.add(cid);
      return out;
    },
    lastError(): string | null {
      return error;
    },
    curveControls(curveId: Id): { seg: number; idx: 0 | 1 | 2 | 3; at: [number, number, number] }[] {
      const curve = session.state.curves.get(session.state.resolveCurve(curveId));
      if (!curve) return [];
      const out: { seg: number; idx: 0 | 1 | 2 | 3; at: [number, number, number] }[] = [];
      curve.chain.segs.forEach((s, seg) => {
        ([s.p0, s.p1, s.p2, s.p3] as const).forEach((p, idx) => {
          // Interior seam points appear once: skip p0 of every segment but the first.
          if (idx === 0 && seg > 0) return;
          out.push({ seg, idx: idx as 0 | 1 | 2 | 3, at: [p[0], p[1], p[2]] });
        });
      });
      return out;
    },
    /**
     * The chain parameter of a picked point.
     *
     * Coarse sample then bisect the winning bracket: the pick lands on a
     * rendered polyline and the answer wanted is on the exact chain, so
     * starting from the nearest of 64 stations and refining is both faster and
     * more honest than pretending the polyline's own parameter is the curve's.
     *
     * A point further from the curve than the pick tolerance could ever have
     * been is not on it, and says so rather than snapping to an end.
     */
    curveParamAt(curveId: Id, at: Pt3): number | null {
      const curve = session.state.curves.get(session.state.resolveCurve(curveId));
      if (!curve) return null;
      const d2 = (t: number): number => {
        const q = evalChain(curve.chain, t);
        const dx = q[0] - at[0], dy = q[1] - at[1], dz = q[2] - at[2];
        return dx * dx + dy * dy + dz * dz;
      };
      const N = 64;
      let best = 0, bestD = Infinity;
      for (let i = 0; i <= N; i++) {
        const d = d2(i / N);
        if (d < bestD) { bestD = d; best = i / N; }
      }
      let lo = Math.max(0, best - 1 / N), hi = Math.min(1, best + 1 / N);
      for (let i = 0; i < 40; i++) {
        const a = lo + (hi - lo) / 3, b = hi - (hi - lo) / 3;
        if (d2(a) < d2(b)) hi = b; else lo = a;
      }
      const t = 0.5 * (lo + hi);
      return Math.sqrt(d2(t)) > MAX_PICK_MM ? null : t;
    },
    /**
     * Where a split is LEGAL on this curve, in its own parameter.
     *
     * A cell has four sides by statute, so a split under a claim that straddles
     * it is refused — which means the legal set is not an interval, it is the
     * discrete set of trim boundaries where a station already crosses. Nothing
     * in the shell could know that, so SPLIT proposed the raw click and the
     * frame refused nearly every one: correct, and unusable by hand.
     *
     * Ends excluded; the frame refuses those separately and for its own reason.
     */
    curveSplitPoints(curveId: Id): number[] {
      const id = session.state.resolveCurve(curveId);
      const claims: [number, number][] = [];
      for (const cell of session.state.cells.values()) {
        for (const side of cell.sides) {
          if (session.state.resolveCurve(side.curveId) !== id) continue;
          claims.push([Math.min(side.t0, side.t1), Math.max(side.t0, side.t1)]);
        }
      }
      const out = new Set<number>();
      for (const [a, b] of claims) {
        for (const p of [a, b]) {
          if (p <= 1e-9 || p >= 1 - 1e-9) continue;
          if (claims.some(([lo, hi]) => p > lo + 1e-9 && p < hi - 1e-9)) continue;
          out.add(p);
        }
      }
      return [...out].sort((x, y) => x - y);
    },
    cellMaterials(): ReadonlyMap<Id, { name: string; color: string }> {
      const out = new Map<Id, { name: string; color: string }>();
      for (const [cid, cell] of session.state.cells) {
        if (cell.materialId === undefined) continue;
        const m = session.state.materials.get(cell.materialId);
        if (!m) continue;
        out.set(cid, { name: m.name, color: m.color });
        // The twin wears the master's material, by the same law that gives it
        // the master's geometry: a twin is a function of its master and is
        // regenerated every evaluation, so it can carry no assignment of its
        // own. Without this the wheels are the only cells on the car with no
        // material — because they are the only ones authored down one side.
        out.set(`${cid}~m` as Id, { name: m.name, color: m.color });
      }
      return out;
    },
  };
}

/** Reopen a saved document behind the same port shape (replay + integrity check). */
export function openSessionPort(doc: CarDocument): SessionPort {
  return makeSessionPort(false, doc);
}
