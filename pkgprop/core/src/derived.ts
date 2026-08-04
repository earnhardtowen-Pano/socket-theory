import type { License } from './license.js';
import type { Registry } from './registry.js';

/**
 * Readouts — derived numbers shown on the panel. Each carries its license
 * (always DERIVED), a plain-word derivation, and the true chain of params
 * read while computing it, captured by trace. Law 3 for numbers that are
 * results rather than walls.
 */
export interface Readout {
  readonly id: string;
  readonly label: string;
  readonly unit: string;
  readonly value: number;
  readonly license: License;
  readonly derivation: string;
  readonly chain: readonly string[];
}

export class Readouts {
  private items: Readout[] = [];

  constructor(private registry: Registry) {}

  derive(id: string, label: string, unit: string, derivation: string, f: () => number): number {
    const end = this.registry.beginTrace();
    const value = f();
    const chain = end();
    if (!Number.isFinite(value)) {
      throw new Error(`Readout '${id}' came out non-finite. The derivation is broken.`);
    }
    this.items.push({ id, label, unit, value, license: 'DERIVED', derivation, chain });
    return value;
  }

  all(): readonly Readout[] {
    return this.items;
  }
}
