/**
 * @car/demand — the atom: licensed quantities, demands, ports, clamp attribution.
 *
 * The branded Quantity type (declared in @car/schema) is constructible only
 * through the factories here — an untagged number fails typecheck wherever a
 * Quantity is expected. That is the primary no-bare-constants enforcement;
 * the ci-tools lint is the backstop. Provenance is monotone: arithmetic
 * composes licenses; overriding a derived value flips it to ASSUMED, the
 * owner's (charge §2, amendment A9).
 *
 * These records carry NO part-type field. Solver blindness is structural.
 */

import type {
  ClampAttribution,
  DemandKind,
  DemandRecord,
  DemandShape,
  Id,
  License,
  PortFrame,
  PortKind,
  PortRecord,
  Principal,
  Quantity,
  Unit,
} from "@car/schema";

// ---------------------------------------------------------------------------
// Quantity factories — the only sanctioned constructors
// ---------------------------------------------------------------------------

function q<U extends Unit>(value: number, unit: U, license: License): Quantity<U> {
  if (!Number.isFinite(value)) {
    throw new Error(`non-finite quantity: ${value} ${unit} (${license.tag})`);
  }
  return { value, unit, license, __brand: "Quantity" } as Quantity<U>;
}

/** A value computed from other licensed values; the chain states the derivation. */
export function derived<U extends Unit>(value: number, unit: U, chain: string): Quantity<U> {
  if (!chain.trim()) throw new Error("DERIVED requires a shown derivation");
  return q(value, unit, { tag: "DERIVED", chain });
}

/** A value taken from a named source. Citation optional but preferred. */
export function sourced<U extends Unit>(
  value: number,
  unit: U,
  source: string,
  citation?: string,
): Quantity<U> {
  if (!source.trim()) throw new Error("SOURCED requires a named source");
  return q(value, unit, citation ? { tag: "SOURCED", source, citation } : { tag: "SOURCED", source });
}

/** A value assumed pending; always flagged, always surfaced, never buried. */
export function assumed<U extends Unit>(value: number, unit: U, note: string): Quantity<U> {
  if (!note.trim()) throw new Error("ASSUMED requires a note");
  return q(value, unit, { tag: "ASSUMED", note });
}

/** Owner override of any value: flips license to ASSUMED, the owner's. */
export function override<U extends Unit>(prev: Quantity<U>, value: number, note: string): Quantity<U> {
  return q(value, prev.unit, {
    tag: "ASSUMED",
    note: `owner override of ${prev.license.tag} value ${prev.value} ${prev.unit}: ${note}`,
  });
}

// ---------------------------------------------------------------------------
// Licensed arithmetic — provenance composes monotonically
// ---------------------------------------------------------------------------

function describe(x: Quantity): string {
  return `${x.value}${x.unit}[${x.license.tag}]`;
}

/** The composed license of a derivation over inputs: DERIVED, chain shows both. */
function composeChain(op: string, inputs: readonly Quantity[]): string {
  return `${op}(${inputs.map(describe).join(", ")})`;
}

export function qAdd<U extends Unit>(a: Quantity<U>, b: Quantity<U>): Quantity<U> {
  if (a.unit !== b.unit) throw new Error(`unit mismatch: ${a.unit} + ${b.unit}`);
  return derived(a.value + b.value, a.unit, composeChain("add", [a, b]));
}

export function qSub<U extends Unit>(a: Quantity<U>, b: Quantity<U>): Quantity<U> {
  if (a.unit !== b.unit) throw new Error(`unit mismatch: ${a.unit} - ${b.unit}`);
  return derived(a.value - b.value, a.unit, composeChain("sub", [a, b]));
}

/** Multiply with an explicit result unit — unit algebra stays human-audited. */
export function qMul<U extends Unit>(a: Quantity, b: Quantity, resultUnit: U): Quantity<U> {
  return derived(a.value * b.value, resultUnit, composeChain("mul", [a, b]));
}

export function qDiv<U extends Unit>(a: Quantity, b: Quantity, resultUnit: U): Quantity<U> {
  if (b.value === 0) throw new Error(`division by zero: ${describe(a)} / ${describe(b)}`);
  return derived(a.value / b.value, resultUnit, composeChain("div", [a, b]));
}

export function qScale<U extends Unit>(a: Quantity<U>, s: Quantity<"ratio" | "count">): Quantity<U> {
  return derived(a.value * s.value, a.unit, composeChain("scale", [a, s]));
}

export function qMax<U extends Unit>(a: Quantity<U>, b: Quantity<U>): Quantity<U> {
  return derived(a.value >= b.value ? a.value : b.value, a.unit, composeChain("max", [a, b]));
}

export function qMin<U extends Unit>(a: Quantity<U>, b: Quantity<U>): Quantity<U> {
  return derived(a.value <= b.value ? a.value : b.value, a.unit, composeChain("min", [a, b]));
}

/** True when any input in this quantity's ancestry was ASSUMED. */
export function carriesAssumption(x: Quantity): boolean {
  return x.license.tag === "ASSUMED" ||
    (x.license.tag === "DERIVED" && x.license.chain.includes("[ASSUMED]"));
}

// ---------------------------------------------------------------------------
// Demand and port constructors
// ---------------------------------------------------------------------------

export interface DemandInit {
  readonly id: Id;
  readonly principal: Principal;
  readonly reason: string;
  readonly kind: DemandKind;
  readonly shape?: DemandShape;
  readonly magnitude?: Quantity;
  readonly massBearing?: boolean;
}

export function demand(init: DemandInit): DemandRecord {
  if (!init.reason.trim()) {
    throw new Error(`demand ${init.id} has no stateable reason — the atom is the licensed demand`);
  }
  const rec: DemandRecord = {
    id: init.id,
    principal: init.principal,
    reason: init.reason,
    kind: init.kind,
    ...(init.shape !== undefined ? { shape: init.shape } : {}),
    ...(init.magnitude !== undefined ? { magnitude: init.magnitude } : {}),
    ...(init.massBearing !== undefined ? { massBearing: init.massBearing } : {}),
  };
  return rec;
}

export function port(id: Id, name: string, kind: PortKind, frame: PortFrame): PortRecord {
  return { id, name, kind, frame };
}

export function clamp(boundValue: Quantity, d: DemandRecord): ClampAttribution {
  return { boundValue, demandId: d.id, principal: d.principal, reason: d.reason };
}

// ---------------------------------------------------------------------------
// License display helpers (ledger strip, provenance report)
// ---------------------------------------------------------------------------

export function licenseLabel(x: Quantity): string {
  switch (x.license.tag) {
    case "DERIVED": return `DERIVED — ${x.license.chain}`;
    case "SOURCED": return `SOURCED — ${x.license.source}${x.license.citation ? ` (${x.license.citation})` : ""}`;
    case "ASSUMED": return `ASSUMED — ${x.license.note}`;
  }
}
