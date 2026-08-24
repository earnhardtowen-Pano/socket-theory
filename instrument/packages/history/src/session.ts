/**
 * @car/history session — the verb log and replay engine.
 *
 * The saved document is the ordered verb record plus authored inputs;
 * evaluated geometry is derivation, never storage (statute §3). load()
 * replays from an empty state with a fresh allocator and asserts the
 * counters match — the persistent-naming and determinism integrity check.
 *
 * apply-entry splices a catalog entry (itself a verb document) by replaying
 * its verbs with all ids offset by this session's counters at splice time:
 * entries are authored from blank, so entry-local kind#n lands at
 * kind#(n + offset). Only the apply-entry record itself is appended to the
 * log — the spliced verbs execute without recording, and replaying the host
 * document re-splices them identically.
 */

import type { CarDocument, Id, IdKind, JsonValue, VerbName, VerbRecord } from "@car/schema";
import { DOCUMENT_VERSION, makeAllocator, type IdAllocator } from "@car/schema";
import { computeQuilt, FrameState } from "@car/frame";
import { cornerFairing } from "@car/surface";

/** Fairing passes per `fair-corners`. See the verb's note on why it is fixed. */
const FAIR_PASSES = 2;
import {
  ID_PATTERN,
  validateDocumentShape,
  validateVerbArgs,
  type VerbArgs,
} from "./verbs.js";

export interface Session {
  readonly title: string;
  readonly state: FrameState;
  readonly log: VerbRecord[];
  readonly alloc: IdAllocator;
  /** Validate, execute against state, and append the record with its seq. */
  apply<V extends VerbName>(verb: V, args: VerbArgs[V]): void;
  save(): CarDocument;
}

const ID_KINDS: readonly IdKind[] = [
  "cell", "curve", "vertex", "datum", "group", "material",
  "feature", "demand", "port", "part", "constraint",
];

/** Deep-clone JSON-safe args so the log never aliases caller structures. */
function cloneArgs<T>(x: T): T {
  return structuredClone(x);
}

/** Offset every id-shaped string in a JSON tree by the splice-time counters. */
function remapIds(value: JsonValue, offsets: Readonly<Record<IdKind, number>>): JsonValue {
  if (typeof value === "string") {
    const m = ID_PATTERN.exec(value);
    if (m && (ID_KINDS as readonly string[]).includes(m[1] ?? "")) {
      const kind = m[1] as IdKind;
      return `${kind}#${Number(m[2]) + offsets[kind]}`;
    }
    return value;
  }
  if (Array.isArray(value)) return value.map((v) => remapIds(v, offsets));
  if (typeof value === "object" && value !== null) {
    const out: { [k: string]: JsonValue } = {};
    for (const k of Object.keys(value)) {
      const v = (value as { [k: string]: JsonValue })[k];
      if (v !== undefined) out[k] = remapIds(v, offsets);
    }
    return out;
  }
  return value;
}

class SessionImpl implements Session {
  readonly title: string;
  readonly state = new FrameState();
  readonly log: VerbRecord[] = [];
  readonly alloc = makeAllocator();

  constructor(title: string) {
    this.title = title;
  }

  apply<V extends VerbName>(verb: V, args: VerbArgs[V]): void {
    const seq = this.log.length;
    const valid = validateVerbArgs(verb, args);
    this.execute(verb, valid, seq);
    this.log.push({ seq, verb, args: cloneArgs(valid) as unknown as JsonValue });
  }

  save(): CarDocument {
    return {
      format: "car",
      version: DOCUMENT_VERSION,
      title: this.title,
      counters: this.alloc.counters(),
      verbs: [...this.log],
    };
  }

  /** Execute a validated verb against state. Never appends to the log. */
  private execute<V extends VerbName>(verb: V, args: VerbArgs[V], seq: number): void {
    const state = this.state;
    const alloc = this.alloc;
    switch (verb) {
      case "tape": {
        const a = args as VerbArgs["tape"];
        if (a.kind === "box") {
          state.createBox(a.rect, alloc);
          return;
        }
        if (a.line.lineClass === "sketch") {
          // Sketch lines are construction: they snap and guide, NEVER split.
          if (a.targets.length > 0) {
            throw new Error("tape: sketch lines never split — targets must be empty");
          }
          state.addSketchLine(a.line, alloc);
          return;
        }
        if (a.targets.length === 0) throw new Error("tape: a tape line needs target cells");
        for (const target of a.targets) {
          const leaves = state.resolveCell(target);
          if (leaves.length === 1 && leaves[0] !== undefined) {
            state.splitCell(leaves[0], a.line, alloc);
            continue;
          }
          // Persistent naming: a target that has since split applies to the
          // children the line actually crosses. splitCell throws its
          // "crossed 0" miss before any mutation or allocation, so skipping
          // a missed leaf is state-safe and deterministic.
          let hits = 0;
          for (const leaf of leaves) {
            try {
              state.splitCell(leaf, a.line, alloc);
              hits += 1;
            } catch (err) {
              if (!(err instanceof Error) || !/crossed 0\)$/.test(err.message)) throw err;
            }
          }
          if (hits === 0) throw new Error(`tape: line crosses no descendant of ${target}`);
        }
        return;
      }
      case "constrain":
        // Recorded for the ledger; solving happens tool-side pre-verb.
        return;
      case "weld": {
        const a = args as VerbArgs["weld"];
        state.weld(a.curveA, a.curveB);
        return;
      }
      case "detach": {
        const a = args as VerbArgs["detach"];
        state.detach(a.curveId, alloc);
        return;
      }
      case "push-pull": {
        const a = args as VerbArgs["push-pull"];
        state.pushPull(a.target, a.delta);
        return;
      }
      case "rotate": {
        const a = args as VerbArgs["rotate"];
        state.rotate(a.cellIds, a.origin, a.axis, a.angleDeg);
        return;
      }
      case "taper": {
        const a = args as VerbArgs["taper"];
        state.taper(a.cellId, a.side, a.scale);
        return;
      }
      case "cut": {
        const a = args as VerbArgs["cut"];
        // The cut-binding law: record against frame IDs + the recorded sketch
        // geometry, never evaluated topology. Targets must resolve today so a
        // dangling binding cannot be authored; the stored ids stay authored.
        for (const target of a.targets) state.resolveCell(target);
        state.recordCut(cloneArgs(a) as unknown as JsonValue, seq, alloc);
        return;
      }
      case "place-point": {
        const a = args as VerbArgs["place-point"];
        state.placePoint(a.curveId, a.t);
        return;
      }
      case "fit-through-line": {
        const a = args as VerbArgs["fit-through-line"];
        state.fitThroughLine(a.points, alloc);
        return;
      }
      case "group": {
        const a = args as VerbArgs["group"];
        state.group(a.cellIds, a.name, alloc);
        return;
      }
      case "fullness": {
        const a = args as VerbArgs["fullness"];
        state.setFullness(a.cellIds, a.amount);
        return;
      }
      case "split-curve": {
        const a = args as VerbArgs["split-curve"];
        state.splitCurve(a.curveId, a.t, alloc);
        return;
      }
      case "assign-material": {
        const a = args as VerbArgs["assign-material"];
        state.assignMaterial(a.targetId, { name: a.name, color: a.color }, alloc);
        return;
      }
      case "mirror-detach": {
        const a = args as VerbArgs["mirror-detach"];
        state.mirrorDetach(a.cellId);
        return;
      }
      case "crease": {
        const a = args as VerbArgs["crease"];
        state.markCrease(a.curveId);
        return;
      }
      case "gap": {
        const a = args as VerbArgs["gap"];
        state.markGap(a.curveId);
        return;
      }
      case "fair-corners": {
        const a = args as VerbArgs["fair-corners"];
        // TWO passes, and not more. Moving a control point moves any trim
        // endpoint at an interior parameter, which moves other cells' corners
        // — so the second pass is measuring a network the first one changed.
        // A fixed count keeps the verb a deterministic function of the state;
        // iterating to convergence would make the result depend on a
        // tolerance, and the residual is reported instead of chased.
        for (let pass = 0; pass < FAIR_PASSES; pass++) {
          const plan = cornerFairing(computeQuilt(state), { breakAngleDeg: a.maxBreakDeg });
          if (plan.moves.length === 0) break;
          for (const m of plan.moves) state.setEndTangent(m.curveId, m.chainEnd, m.direction);
        }
        return;
      }
      case "apply-entry": {
        const a = args as VerbArgs["apply-entry"];
        this.splice(a.entry, seq);
        return;
      }
      default:
        throw new Error(`unknown verb ${String(verb)}`);
    }
  }

  /** Replay an entry's verbs into this session under offset ids. One grammar. */
  private splice(entry: CarDocument, hostSeq: number): void {
    const offsets = this.alloc.counters();
    for (const rec of entry.verbs) {
      const verb = rec.verb;
      // A nested entry is self-contained: its args carry entry-local ids that
      // get their own offsets at the nested splice — never remap them here.
      const rawArgs = verb === "apply-entry" ? rec.args : remapIds(rec.args, offsets);
      const valid = validateVerbArgs(verb, rawArgs);
      this.execute(verb, valid, hostSeq);
    }
  }
}

export function createSession(title: string): Session {
  return new SessionImpl(title);
}

/**
 * Replay a document from an empty state with a fresh allocator, then assert
 * the allocator counters equal the document's — the integrity check that
 * catches any drift in persistent naming or executor determinism.
 */
export function load(doc: CarDocument): Session {
  const checked = validateDocumentShape(doc, "load");
  const session = new SessionImpl(checked.title);
  for (const rec of checked.verbs) {
    session.apply(rec.verb, rec.args as unknown as VerbArgs[typeof rec.verb]);
  }
  const got = session.alloc.counters();
  for (const kind of ID_KINDS) {
    if (got[kind] !== checked.counters[kind]) {
      throw new Error(
        `replay integrity: counter mismatch for ${kind} (got ${got[kind]}, want ${checked.counters[kind]})`,
      );
    }
  }
  return session;
}
