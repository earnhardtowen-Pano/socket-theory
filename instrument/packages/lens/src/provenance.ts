/**
 * The provenance report (charge §10) — "every print emits the provenance
 * report: which requirements bound which surfaces, which dimensions were free
 * choices, full ledger state."
 *
 * A print is the moment a design leaves the tool and becomes an object in
 * somebody's hand, and it is the moment the licences stop being an internal
 * discipline and start being the only thing standing between a plausible
 * model and a lie. So the report ships beside the STL, not in a menu.
 *
 * Three questions, answered in order:
 *
 *  1. WHAT WAS FORCED. Every clamp the packaging solve applied, with the
 *     demand that applied it and whose principal it was. These are the
 *     dimensions the designer did not choose — physics, law, a person, or the
 *     brief chose them, and the report says which.
 *  2. WHAT WAS FREE. Every ASSUMED quantity in the configuration, with the
 *     reason its author gave. A long list here is not a failure; it is an
 *     accurate picture of how much of a concept is still taste.
 *  3. WHAT IT WEIGHS. The full ledger: total, CG, axle split, the gap to
 *     target, and how many assumptions are still outstanding.
 *
 * No wall clock anywhere — a report that changes every time you regenerate it
 * cannot be diffed, and diffing two reports is most of what they are for.
 * The document's verb count and the model's own numbers identify the run.
 */

import type { ClampAttribution, DemandRecord, Quantity } from "@car/schema";
import { derived } from "@car/demand";

export interface LicensedEntry {
  readonly path: string;
  readonly value: number;
  readonly unit: string;
  readonly tag: string;
  readonly reason: string;
}

export interface ProvenanceInput {
  readonly carName: string;
  /** Anything holding Quantities: the CarConfig, the brief, the placement. */
  readonly config: unknown;
  readonly clamps: readonly ClampAttribution[];
  /** Demands the body answers rather than the placement solve. */
  readonly bodyChecks: readonly DemandRecord[];
  readonly ledgerLines: readonly string[];
  /** Facts about the run that identify it without a clock. */
  readonly modelFacts: readonly (readonly [string, string])[];
}

export interface ProvenanceReport {
  readonly entries: readonly LicensedEntry[];
  readonly assumedCount: number;
  readonly sourcedCount: number;
  readonly derivedCount: number;
  readonly text: string;
}

const isQuantity = (v: unknown): v is Quantity =>
  typeof v === "object" && v !== null &&
  (v as { __brand?: unknown }).__brand === "Quantity";

const reasonOf = (q: Quantity): string => {
  const l = q.license;
  if (l.tag === "DERIVED") return l.chain;
  if (l.tag === "SOURCED") return l.citation ? `${l.source} — ${l.citation}` : l.source;
  return l.note;
};

/** Walk any object and collect every licensed quantity in it, path and all. */
export function collectLicensed(root: unknown, prefix = ""): LicensedEntry[] {
  const out: LicensedEntry[] = [];
  const seen = new Set<unknown>();
  const walk = (node: unknown, path: string): void => {
    if (node === null || typeof node !== "object") return;
    if (seen.has(node)) return;
    seen.add(node);
    if (isQuantity(node)) {
      out.push({
        path, value: node.value, unit: node.unit,
        tag: node.license.tag, reason: reasonOf(node),
      });
      return;
    }
    if (Array.isArray(node)) {
      node.forEach((v, i) => walk(v, `${path}[${i}]`));
      return;
    }
    for (const k of Object.keys(node as Record<string, unknown>).sort()) {
      walk((node as Record<string, unknown>)[k], path ? `${path}.${k}` : k);
    }
  };
  walk(root, prefix);
  return out;
}

/**
 * Column widths. These are the only numbers in this file and they describe a
 * PAGE, not a car — the licence says exactly that, because the honesty police
 * are right to ask and "it lines up" is a true and sufficient answer.
 */
const LAYOUT = {
  rule: derived(60, "count", "report rule width, characters — layout, not a claim about the car"),
  fact: derived(30, "count", "run-facts label column — layout"),
  clampValue: derived(16, "count", "clamped-value column — layout"),
  demandId: derived(14, "count", "demand-id column — layout"),
  path: derived(42, "count", "quantity-path column — layout"),
  value: derived(14, "count", "quantity-value column — layout"),
} as const;

const pad = (s: string, n: number): string => s.length >= n ? s : s + " ".repeat(n - s.length);

export function provenanceReport(input: ProvenanceInput): ProvenanceReport {
  const entries = collectLicensed(input.config);
  const byTag = (t: string): LicensedEntry[] => entries.filter((e) => e.tag === t);
  const assumed = byTag("ASSUMED");
  const sourced = byTag("SOURCED");
  const derived = byTag("DERIVED");

  const lines: string[] = [];
  const rule = (title: string): void => {
    lines.push("", title, "-".repeat(Math.max(title.length, LAYOUT.rule.value)));
  };

  lines.push(`PROVENANCE REPORT — ${input.carName}`);
  lines.push("=".repeat(LAYOUT.rule.value));
  lines.push(
    "Read this before believing the model. Every number in the design carries",
    "a licence: DERIVED means it follows from others by stated arithmetic,",
    "SOURCED means somebody consulted something, ASSUMED means nobody did.",
    "This report is emitted with the print because a printed object stops",
    "looking like a model and starts looking like a fact.",
  );

  rule("THE RUN");
  for (const [k, v] of input.modelFacts) lines.push(`  ${pad(k, LAYOUT.fact.value)} ${v}`);

  rule("WHAT WAS FORCED — requirements that bound a dimension");
  if (input.clamps.length === 0) {
    lines.push(
      "  Nothing. The packaging solve clamped no dimension, which means every",
      "  placement below is a free choice and no requirement is holding it.",
    );
  } else {
    for (const c of input.clamps) {
      lines.push(`  ${pad(`${c.boundValue.value} ${c.boundValue.unit}`, LAYOUT.clampValue.value)} ${c.demandId}  (principal: ${c.principal})`);
      lines.push(`  ${" ".repeat(LAYOUT.clampValue.value)} ${c.reason}`);
    }
  }

  rule("WHAT THE BODY MUST ANSWER — demands no placement can settle");
  if (input.bodyChecks.length === 0) {
    lines.push("  None recorded.");
  } else {
    for (const d of input.bodyChecks) {
      lines.push(`  ${pad(d.id, LAYOUT.demandId.value)} ${d.kind}  (principal: ${d.principal})`);
      lines.push(`  ${" ".repeat(LAYOUT.demandId.value)} ${d.reason}`);
    }
  }

  rule(`WHAT WAS FREE — ${assumed.length} ASSUMED quantities`);
  lines.push(
    "  A long list is not a failure. It is an accurate picture of how much of",
    "  this concept is still taste, and every one of them is somewhere a",
    "  decision could be argued with.",
    "",
  );
  for (const e of assumed) {
    lines.push(`  ${pad(e.path, LAYOUT.path.value)} ${pad(`${e.value} ${e.unit}`, LAYOUT.value.value)} ${e.reason}`);
  }

  rule(`WHAT WAS CONSULTED — ${sourced.length} SOURCED quantities`);
  for (const e of sourced) {
    lines.push(`  ${pad(e.path, LAYOUT.path.value)} ${pad(`${e.value} ${e.unit}`, LAYOUT.value.value)} ${e.reason}`);
  }

  rule(`WHAT FOLLOWS — ${derived.length} DERIVED quantities`);
  lines.push("  Each of these is arithmetic on the two lists above.", "");
  for (const e of derived) {
    lines.push(`  ${pad(e.path, LAYOUT.path.value)} ${pad(`${e.value} ${e.unit}`, LAYOUT.value.value)} ${e.reason}`);
  }

  rule("WHAT IT WEIGHS — full ledger state");
  for (const l of input.ledgerLines) lines.push(`  ${l}`);

  lines.push("", "=".repeat(LAYOUT.rule.value));
  lines.push(
    `${assumed.length} assumed · ${sourced.length} sourced · ${derived.length} derived.`,
    "No wall clock in this report: regenerate it from the same document and it",
    "comes out byte-identical, which is what makes two of them comparable.",
  );

  return {
    entries,
    assumedCount: assumed.length,
    sourcedCount: sourced.length,
    derivedCount: derived.length,
    text: lines.join("\n") + "\n",
  };
}
