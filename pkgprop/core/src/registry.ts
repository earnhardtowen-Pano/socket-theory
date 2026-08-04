import type { License, Param, ParamDef } from './license.js';

/**
 * The parameter registry — the only door a number may walk through to reach
 * constraint code. Definitions come from /data or architecture presets;
 * overrides come from the user editing ASSUMED values in the ledger.
 */
export class Registry {
  private defs = new Map<string, ParamDef>();
  private overrides = new Map<string, number>();
  /** Stack of live traces — every read lands in all of them. */
  private traces: Set<string>[] = [];
  /** Solved quantity → the params behind it. See publish/inherit below. */
  private provenance = new Map<string, readonly string[]>();

  define(def: ParamDef): void {
    if (this.defs.has(def.id)) {
      throw new Error(`Parameter '${def.id}' is defined twice. Each id is defined once.`);
    }
    // SOURCED means a source is recorded, with no exceptions. `pending` used to
    // excuse a missing one, which made the two tags mean the same thing from
    // the outside: a number nobody has checked, wearing the badge of one that
    // was. `pending` belongs on ASSUMED, where it means "we intend to source
    // this" — a promise, not a claim.
    if (def.license === 'SOURCED' && !def.source) {
      throw new Error(
        `Parameter '${def.id}' is tagged SOURCED but names no source. ` +
          `Name the source, or tag it ASSUMED and mark it pending.`,
      );
    }
    if (def.license !== 'ASSUMED' && def.pending) {
      throw new Error(
        `Parameter '${def.id}' is ${def.license} and pending. Pending is for ` +
          `ASSUMED values awaiting a source; a ${def.license} value is not awaiting anything.`,
      );
    }
    this.defs.set(def.id, def);
  }

  defineAll(defs: Iterable<ParamDef>): void {
    for (const d of defs) this.define(d);
  }

  has(id: string): boolean {
    return this.defs.has(id);
  }

  /** Set a user override. Only ASSUMED parameters are editable — Law 4. */
  override(id: string, value: number): void {
    const def = this.defs.get(id);
    if (!def) throw new Error(`Cannot edit '${id}': no such parameter.`);
    if (def.license !== 'ASSUMED') {
      throw new Error(
        `Cannot edit '${id}': it is ${def.license}. Only ASSUMED values are adjustable.`,
      );
    }
    this.overrides.set(id, value);
  }

  clearOverride(id: string): void {
    this.overrides.delete(id);
  }

  /** Read a parameter's effective value. Records the read for attribution. */
  value(id: string): number {
    const def = this.defs.get(id);
    if (!def) {
      throw new Error(
        `Unlicensed read: '${id}' is not in the registry. Every number needs a license.`,
      );
    }
    for (const t of this.traces) t.add(id);
    return this.overrides.get(id) ?? def.value;
  }

  param(id: string): Param {
    const def = this.defs.get(id);
    if (!def) throw new Error(`No such parameter: '${id}'.`);
    const ov = this.overrides.get(id);
    return { ...def, effective: ov ?? def.value, overridden: ov !== undefined };
  }

  list(): Param[] {
    return [...this.defs.keys()].map((id) => this.param(id));
  }

  counts(): Record<License, number> & { pending: number; overridden: number } {
    const out = { DERIVED: 0, SOURCED: 0, ASSUMED: 0, pending: 0, overridden: 0 };
    for (const p of this.list()) {
      out[p.license]++;
      if (p.pending) out.pending++;
      if (p.overridden) out.overridden++;
    }
    return out;
  }

  /**
   * Publish the provenance of a solved quantity — the params behind a placed
   * control or a derived readout — so anything computed from it downstream can
   * inherit that chain instead of losing it.
   *
   * A solve is a pipeline: the cowl is placed, then the hood's ceiling is
   * computed from where the cowl landed. Handing that placement downstream as
   * a bare number is what severs attribution, and a severed wall cannot name
   * a single knob when it conflicts.
   */
  publish(id: string, chain: readonly string[]): void {
    const merged = new Set(this.provenance.get(id) ?? []);
    for (const p of chain) merged.add(p);
    this.provenance.set(id, [...merged]);
  }

  /**
   * Read a solved quantity's provenance into every live trace. Constraint code
   * calls this when it consumes a placed value rather than a parameter, so the
   * wall it builds remembers the whole chain and not just its last step.
   */
  inherit(...ids: readonly string[]): void {
    for (const id of ids) {
      const chain = this.provenance.get(id);
      if (!chain) {
        throw new Error(
          `'${id}' has no published provenance. Either it is not solved yet — ` +
            `check the stage order in solve() — or its placement was never published.`,
        );
      }
      for (const t of this.traces) for (const p of chain) t.add(p);
    }
  }

  /** What has been published so far, for tests and for the ledger. */
  provenanceOf(id: string): readonly string[] | undefined {
    return this.provenance.get(id);
  }

  /** Begin recording which params are read. Returns a function that ends the
   *  trace and hands back the ids, so constraint evaluation can attach its
   *  true input chain to every contribution it emits. Traces nest. */
  beginTrace(): () => string[] {
    const mine = new Set<string>();
    this.traces.push(mine);
    return () => {
      const i = this.traces.indexOf(mine);
      if (i >= 0) this.traces.splice(i, 1);
      return [...mine];
    };
  }
}
