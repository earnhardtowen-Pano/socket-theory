/**
 * The exact bidegree of a patch, by construction rather than by hand.
 *
 * `S = S₀ + Φ + Ψ (+ Ω)` is a sum of products of polynomials, so its degree is
 * a max over sums — arithmetic simple enough that everybody does it in their
 * head and gets it wrong. The plan's own estimate of (5,5) was wrong twice
 * over: it forgot that the corner window MULTIPLIES, and it predated the
 * fields being splines.
 *
 * So the construction is written here as a tiny expression tree and the degree
 * is READ OFF it. When the construction changes, this number changes with it,
 * and the number in the architecture note is a measurement.
 *
 *   npx tsx scripts/patch-degree.ts
 */

/** A term's degree in u and in v. */
type Bi = { readonly u: number; readonly v: number };

const mul = (...t: Bi[]): Bi => t.reduce((a, b) => ({ u: a.u + b.u, v: a.v + b.v }));
const max = (...t: Bi[]): Bi =>
  t.reduce((a, b) => ({ u: a.u > b.u ? a.u : b.u, v: a.v > b.v ? a.v : b.v }));
const inU = (d: number): Bi => ({ u: d, v: 0 });
const inV = (d: number): Bi => ({ u: 0, v: d });
const show = (b: Bi) => `(${b.u},${b.v})`;

// ── the pieces, each with the reason it is the degree it is ────────────────

const CUBIC = 3;                 // a chain segment — the wire format
const FIELD = 3;                 // a, λ, μ, ν: cubic B-splines, per span
const D_STAR = 3;                // the shared transverse direction, likewise
const WINDOW = 5;                // smootherstep: C² at both ends of the fade

const cPrime = CUBIC - 1;                       // C′ — 2
const eField = Math.max(FIELD + cPrime, FIELD + D_STAR);   // a·C′ or λ·D*  — 6
const mStar = cPrime + D_STAR;                  // M* = C′ × D*  — 5
const natural = CUBIC;                          // the bare Coons cross-derivative

const delta1 = Math.max(eField, natural);       // Δ  = E − N          — 6
const delta2 = FIELD + mStar;                   // Δ² = μ·M*           — 8
const delta3 = FIELD + mStar;                   // Δ³ = ν·M*           — 8

/** Hermite blends: value and derivatives 0 at both ends, one unit derivative. */
const blend = (order: number) => 2 * order + 1;  // 3 cubic · 5 quintic · 7 septic

interface Row { readonly what: string; readonly plain: Bi; readonly faded: Bi; readonly why: string }

const rows: Row[] = [];
const push = (what: string, why: string, plain: Bi, faded: Bi) =>
  rows.push({ what, why, plain, faded });

// S₀ — the bilinearly blended Coons patch.
push("S₀", "cubic boundaries, linear blend", max(
  mul(inV(1), inU(CUBIC)), mul(inU(1), inV(CUBIC)), { u: 1, v: 1 },
), max(mul(inV(1), inU(CUBIC)), mul(inU(1), inV(CUBIC)), { u: 1, v: 1 }));

// Φ — the G1 term. Δ carries the corner window on a fade span.
const phi = (d: number, windowed: boolean) => {
  const field = windowed ? d + WINDOW : d;
  return max(mul(inV(blend(1)), inU(field)), mul(inU(blend(1)), inV(field)));
};
push("Φ = g(v)Δ₀(u) + …", `Δ = ρ·(E − N), E = a·C′ + λ·D*  [Δ ${delta1}]`,
  phi(delta1, false), phi(delta1, true));

// Ψ — the G2 term.
const psi = (d: number, windowed: boolean) => {
  const field = windowed ? d + WINDOW : d;
  return max(mul(inV(blend(2)), inU(field)), mul(inU(blend(2)), inV(field)));
};
push("Ψ = q(v)Δ²₀(u) + …", `Δ² = μ·M*, M* = C′ × D*  [Δ² ${delta2}]`,
  psi(delta2, false), psi(delta2, true));

// Ω — the G3 term, not yet built. Same shape, septic blend.
const omega = (d: number, windowed: boolean) => {
  const field = windowed ? d + WINDOW : d;
  return max(mul(inV(blend(3)), inU(field)), mul(inU(blend(3)), inV(field)));
};
push("Ω = w(v)Δ³₀(u) + …", `Δ³ = ν·M*  [Δ³ ${delta3}]  — NOT BUILT`,
  omega(delta3, false), omega(delta3, true));

// ── report ────────────────────────────────────────────────────────────────

const pad = (s: string, n: number) => s + " ".repeat(n > s.length ? n - s.length : 0);
console.log("\nEXACT BIDEGREE OF A CELL, term by term\n");
console.log(pad("term", 22) + pad("interior", 11) + pad("on a fade span", 16) + "why");
console.log("─".repeat(96));
for (const r of rows) {
  console.log(pad(r.what, 22) + pad(show(r.plain), 11) + pad(show(r.faded), 16) + r.why);
}

const upTo = (n: number) => {
  const take = rows.slice(0, n + 1);
  return {
    plain: max(...take.map((r) => r.plain)),
    faded: max(...take.map((r) => r.faded)),
  };
};
console.log("─".repeat(96));
for (const [order, label] of [[1, "G1"], [2, "G2"], [3, "G3"]] as const) {
  const d = upTo(order);
  console.log(pad(`through ${label}`, 22) + pad(show(d.plain), 11) + pad(show(d.faded), 16) +
    `${(d.faded.u + 1) * (d.faded.v + 1)} control points per patch`);
}

// The textbook answer, for contrast: one tensor-product patch, no corner
// window, no spline fields — G^k needs k+1 control rows at each of two ends.
console.log("\nFOR CONTRAST — a bare tensor-product patch meeting G^k on all four sides\n");
console.log(pad("order", 16) + pad("rows needed", 14) + pad("min degree", 12) + "interior rows left");
console.log("─".repeat(96));
for (const k of [1, 2, 3]) {
  const rowsNeeded = 2 * (k + 1);
  console.log(pad(`G${k}`, 16) + pad(String(rowsNeeded), 14) +
    pad(`${rowsNeeded - 1}  ${["", "cubic", "quintic", "septic"][k]}`, 12) + "0 — fully determined");
}
for (const k of [1, 2, 3]) {
  const rowsNeeded = 2 * (k + 1) + 2;
  console.log(pad(`G${k} + fullness`, 16) + pad(String(rowsNeeded), 14) +
    pad(`${rowsNeeded - 1}`, 12) + "2");
}
console.log();
