import type { License } from './license.js';
import type { Registry } from './registry.js';

/**
 * Bounds as contribution sets — Law 3 made structural.
 *
 * A constraint never writes "the wall is X because of me" as a string.
 * It emits a contribution: {quantity, lower|upper, value, who, why, chain}.
 * The bound on a quantity is max(lowers) / min(uppers), and whichever
 * contribution wins IS the attribution. Nothing is narrated; everything
 * is computed.
 */

export interface ConstraintMeta {
  readonly id: string;
  /** Plain words, instrument-panel register: "driver sight line over cowl". */
  readonly label: string;
  /** Why this constraint exists. The licensed demand — Law 1. */
  readonly reason: string;
  /** The constraint's own license. DERIVED when it is geometry/physics. */
  readonly license: License;
}

export interface Contribution {
  readonly quantity: string;
  readonly kind: 'lower' | 'upper';
  readonly value: number;
  readonly constraint: ConstraintMeta;
  /** Param ids actually read while computing this value — the true chain. */
  readonly chain: readonly string[];
}

/** A resolved wall: the winning contribution for one side of a quantity. */
export interface Wall {
  readonly value: number;
  readonly constraint: ConstraintMeta;
  readonly chain: readonly string[];
  /** ASSUMED params in the chain — the knobs that can move this wall. */
  readonly assumedKnobs: readonly string[];
}

export interface Bound {
  readonly quantity: string;
  readonly lower: Wall | null;
  readonly upper: Wall | null;
  /** All contributions, for inspection — the walls behind the wall. */
  readonly contributions: readonly Contribution[];
}

export interface Conflict {
  readonly quantity: string;
  readonly lower: Wall;
  readonly upper: Wall;
  /** How far past each other the two walls sit, in the quantity's unit. */
  readonly overlap: number;
  /** ASSUMED params from both chains — where the user can give ground. */
  readonly resolvers: readonly string[];
}

export class ContributionSet {
  private items: Contribution[] = [];

  constructor(private registry: Registry) {}

  /**
   * Evaluate `f` with a read-trace and record its result as a contribution.
   * Returns the computed value so constraint code can keep using it.
   */
  contribute(
    quantity: string,
    kind: 'lower' | 'upper',
    constraint: ConstraintMeta,
    f: () => number,
  ): number {
    const end = this.registry.beginTrace();
    const value = f();
    const chain = end();
    if (!Number.isFinite(value)) {
      throw new Error(
        `Constraint '${constraint.id}' produced a non-finite ${kind} bound for '${quantity}'.`,
      );
    }
    this.items.push({ quantity, kind, value, constraint, chain });
    return value;
  }

  all(): readonly Contribution[] {
    return this.items;
  }

  private wall(c: Contribution): Wall {
    const assumedKnobs = c.chain.filter(
      (id) => this.registry.param(id).license === 'ASSUMED',
    );
    return { value: c.value, constraint: c.constraint, chain: c.chain, assumedKnobs };
  }

  /** Assemble the bound for one quantity from everything contributed to it. */
  bound(quantity: string): Bound {
    const mine = this.items.filter((c) => c.quantity === quantity);
    let lo: Contribution | null = null;
    let hi: Contribution | null = null;
    for (const c of mine) {
      if (c.kind === 'lower') {
        if (!lo || c.value > lo.value) lo = c;
      } else {
        if (!hi || c.value < hi.value) hi = c;
      }
    }
    return {
      quantity,
      lower: lo ? this.wall(lo) : null,
      upper: hi ? this.wall(hi) : null,
      contributions: mine,
    };
  }

  quantities(): string[] {
    return [...new Set(this.items.map((c) => c.quantity))];
  }

  bounds(): Bound[] {
    return this.quantities().map((q) => this.bound(q));
  }

  /** Every quantity whose floor sits above its ceiling, with both walls named. */
  conflicts(): Conflict[] {
    const out: Conflict[] = [];
    for (const b of this.bounds()) {
      if (b.lower && b.upper && b.lower.value > b.upper.value) {
        const resolvers = [
          ...new Set([...b.lower.assumedKnobs, ...b.upper.assumedKnobs]),
        ];
        out.push({
          quantity: b.quantity,
          lower: b.lower,
          upper: b.upper,
          overlap: b.lower.value - b.upper.value,
          resolvers,
        });
      }
    }
    return out;
  }
}

/**
 * Place a control inside its bound. Controls live as fractions of the live
 * band (the seed contract): 0 = on the floor wall, 1 = on the ceiling wall.
 * When the band collapses or inverts, the value pins to the floor and the
 * conflict machinery reports the rest.
 */
export interface PlacedControl {
  readonly quantity: string;
  readonly fraction: number;
  readonly value: number;
  /** Wall being touched, if the control is at (or clamped to) a wall. */
  readonly touching: { side: 'lower' | 'upper'; wall: Wall } | null;
}

export function placeControl(bound: Bound, fraction: number): PlacedControl {
  const f = Math.min(1, Math.max(0, fraction));
  const lo = bound.lower?.value;
  const hi = bound.upper?.value;
  if (lo === undefined || hi === undefined) {
    throw new Error(
      `Control '${bound.quantity}' needs both walls; got ` +
        `${lo === undefined ? 'no floor' : 'no ceiling'}. A control without ` +
        `bounds is an unlicensed demand.`,
    );
  }
  const span = hi - lo;
  const value = span > 0 ? lo + f * span : lo;
  // Touch detection: within a hair of a wall (or clamped) names the wall.
  const eps = span > 0 ? span * 1e-3 : 0;
  let touching: PlacedControl['touching'] = null;
  if (span <= 0 || value - lo <= eps) touching = { side: 'lower', wall: bound.lower! };
  else if (hi - value <= eps) touching = { side: 'upper', wall: bound.upper! };
  return { quantity: bound.quantity, fraction: f, value, touching };
}
