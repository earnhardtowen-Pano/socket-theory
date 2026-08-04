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

  define(def: ParamDef): void {
    if (this.defs.has(def.id)) {
      throw new Error(`Parameter '${def.id}' is defined twice. Each id is defined once.`);
    }
    if (def.license === 'SOURCED' && !def.source && !def.pending) {
      throw new Error(
        `Parameter '${def.id}' is tagged SOURCED but names no source. ` +
          `Name the source, or tag it ASSUMED, or mark it pending.`,
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
