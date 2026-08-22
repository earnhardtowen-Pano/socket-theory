/**
 * The fenced solver: onGrid quantization pre-pass, then Levenberg-Marquardt
 * over the residual rows with a FIXED iteration count and a fixed
 * multiplicative damping schedule.
 *
 * Determinism contract: identical inputs give identical outputs bit-for-bit.
 * No wall clock, no randomness, no convergence-noise termination — the loop
 * runs exactly opts.maxIterations times (default 64) whenever there is
 * anything to iterate. Variable ordering is sorted point id; the output
 * record is emitted in sorted id order.
 */

import type { Pt2 } from "@car/schema";
import { nabs, nmax, nmin, nround, nsqrt, solveLinear } from "@car/num";
import { buildRows, type ResidualRow } from "./residuals.js";
import type { Constraint, ConstrainResult, Sketch, SolveOpts } from "./types.js";

const DEFAULT_ITERATIONS = 64;
const DEFAULT_TOL = 1e-8;

// Fixed damping schedule — the only "adaptivity" is deterministic
// accept/reject against the trial residual; the multipliers never change.
const LAMBDA_START = 1e-3;
const LAMBDA_SHRINK = 0.25; // applied on an accepted step
const LAMBDA_GROW = 4;      // applied on a rejected step
const LAMBDA_MIN = 1e-12;
const LAMBDA_MAX = 1e8;

// Absolute Tikhonov floor on the normal-equation diagonal: keeps variables
// untouched by any constraint pinned (their gradient is zero, so dx = 0)
// and the system nonsingular for @car/num solveLinear's 1e-12 pivot gate.
const DIAG_FLOOR = 1e-9;

// Relative pivot threshold for the rank sweep (under-constraint detection).
const RANK_TOL = 1e-9;

function refs(c: Constraint): readonly string[] {
  switch (c.kind) {
    case "coincident":
    case "distance":
      return [c.a, c.b];
    case "angle":
      return [c.a, c.b, c.c];
    case "parallel":
    case "perpendicular":
      return [c.a, c.b, c.c, c.d];
    case "symmetric":
      return [c.a, c.b, c.lineP, c.lineQ];
    case "onGrid":
      return [c.a];
  }
}

function mustGet(m: ReadonlyMap<string, Pt2>, id: string): Pt2 {
  const p = m.get(id);
  if (!p) throw new Error(`missing point "${id}"`);
  return p;
}

function sumSq(rows: readonly ResidualRow[]): number {
  let s = 0;
  for (const r of rows) s += r.value * r.value;
  return s;
}

/** Row-echelon rank with partial pivoting; relative threshold; deterministic. */
function matrixRank(J: readonly (readonly number[])[], n: number): number {
  const m = J.length;
  let scale = 0;
  for (const row of J) for (const v of row) scale = nmax(scale, nabs(v));
  if (scale === 0) return 0;
  const tol = scale * RANK_TOL;
  const M = J.map((r) => [...r]);
  let rank = 0;
  for (let col = 0; col < n && rank < m; col++) {
    let piv = rank;
    for (let r = rank + 1; r < m; r++) {
      if (nabs(M[r]![col]!) > nabs(M[piv]![col]!)) piv = r;
    }
    if (nabs(M[piv]![col]!) <= tol) continue;
    const t = M[rank]!;
    M[rank] = M[piv]!;
    M[piv] = t;
    const prow = M[rank]!;
    for (let r = rank + 1; r < m; r++) {
      const f = M[r]![col]! / prow[col]!;
      if (f === 0) continue;
      const row = M[r]!;
      for (let cc = col; cc < n; cc++) row[cc]! -= f * prow[cc]!;
    }
    rank++;
  }
  return rank;
}

export function solve(
  sketch: Sketch,
  constraints: readonly Constraint[],
  opts: SolveOpts = {},
): ConstrainResult {
  const cap = opts.maxIterations ?? DEFAULT_ITERATIONS;
  if (!Number.isInteger(cap) || cap < 0) {
    throw new Error(`maxIterations must be a non-negative integer, got ${cap}`);
  }
  const tol = opts.tol ?? DEFAULT_TOL;
  if (!(Number.isFinite(tol) && tol >= 0)) {
    throw new Error(`tol must be a non-negative finite number, got ${tol}`);
  }

  // Sorted-id traversal everywhere an ordering could leak into output.
  const ids = Object.keys(sketch.points).sort();
  const base = new Map<string, Pt2>();
  for (const id of ids) {
    const p = sketch.points[id];
    if (p) base.set(id, [p[0], p[1]]);
  }

  // Authored-input validation — fail loud before any numerics run.
  for (const c of constraints) {
    for (const id of refs(c)) {
      if (!base.has(id)) {
        throw new Error(`${c.kind} constraint references unknown point "${id}"`);
      }
    }
    if (c.kind === "distance" && !(Number.isFinite(c.d) && c.d >= 0)) {
      throw new Error(`distance must be a non-negative finite length, got ${c.d}`);
    }
    if (c.kind === "angle" && !Number.isFinite(c.deg)) {
      throw new Error(`angle must be finite degrees, got ${c.deg}`);
    }
    if (c.kind === "onGrid" && !(Number.isFinite(c.pitch) && c.pitch > 0)) {
      throw new Error(`onGrid pitch must be a positive finite length, got ${c.pitch}`);
    }
  }

  const fixed = new Set<string>();
  for (const id of opts.fixed ?? []) {
    if (!base.has(id)) throw new Error(`opts.fixed names unknown point "${id}"`);
    fixed.add(id);
  }

  // onGrid quantization pre-pass — BEFORE the solve, never after (statute
  // clause 8: the grid is a convenience, never a rounding of results).
  // Anchors are the author's exact positions; the snap never moves them.
  for (const c of constraints) {
    if (c.kind !== "onGrid" || fixed.has(c.a)) continue;
    const p = mustGet(base, c.a);
    base.set(c.a, [nround(p[0] / c.pitch) * c.pitch, nround(p[1] / c.pitch) * c.pitch]);
  }

  const freeIds = ids.filter((id) => !fixed.has(id));
  const n = freeIds.length * 2;
  const idx = new Map<string, number>();
  freeIds.forEach((id, i) => idx.set(id, 2 * i));

  const withX = (x: readonly number[]): Map<string, Pt2> => {
    const m = new Map(base);
    for (let i = 0; i < freeIds.length; i++) {
      m.set(freeIds[i]!, [x[2 * i]!, x[2 * i + 1]!]);
    }
    return m;
  };

  const jacobian = (rows: readonly ResidualRow[]): number[][] => {
    const J = rows.map(() => new Array<number>(n).fill(0));
    for (let ri = 0; ri < rows.length; ri++) {
      const jr = J[ri]!;
      for (const [id, gx, gy] of rows[ri]!.grads) {
        const vi = idx.get(id);
        if (vi === undefined) continue; // anchored point — not a variable
        jr[vi]! += gx;
        jr[vi + 1]! += gy;
      }
    }
    return J;
  };

  let x: number[] = [];
  for (const id of freeIds) {
    const p = mustGet(base, id);
    x.push(p[0], p[1]);
  }

  let rows = buildRows(withX(x), constraints);
  let r2 = sumSq(rows);
  let lambda = LAMBDA_START;
  let iterations = 0;

  if (n > 0 && rows.length > 0) {
    for (let k = 0; k < cap; k++) {
      iterations++;
      const J = jacobian(rows);
      const g = new Array<number>(n).fill(0);
      const A: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(0));
      for (let ri = 0; ri < rows.length; ri++) {
        const jr = J[ri]!;
        const rv = rows[ri]!.value;
        for (let i = 0; i < n; i++) {
          const ji = jr[i]!;
          if (ji === 0) continue;
          g[i]! += ji * rv;
          const Ai = A[i]!;
          for (let j = i; j < n; j++) Ai[j]! += ji * jr[j]!;
        }
      }
      for (let i = 0; i < n; i++) {
        const Ai = A[i]!;
        for (let j = 0; j < i; j++) Ai[j] = A[j]![i]!;
        Ai[i] = Ai[i]! * (1 + lambda) + DIAG_FLOOR;
      }
      let dx: number[];
      try {
        dx = solveLinear(A, g.map((v) => -v));
      } catch {
        lambda = nmin(lambda * LAMBDA_GROW, LAMBDA_MAX);
        continue;
      }
      const xt = x.map((v, i) => v + dx[i]!);
      const rowsT = buildRows(withX(xt), constraints);
      const r2t = sumSq(rowsT);
      // NaN/Inf trials fail this comparison and are rejected — the state
      // never absorbs a non-finite step.
      if (r2t <= r2) {
        x = xt;
        rows = rowsT;
        r2 = r2t;
        lambda = nmax(lambda * LAMBDA_SHRINK, LAMBDA_MIN);
      } else {
        lambda = nmin(lambda * LAMBDA_GROW, LAMBDA_MAX);
      }
    }
  }

  const residual = nsqrt(r2);
  const converged = residual <= tol;

  const rank = n === 0 ? 0 : matrixRank(jacobian(rows), n);
  const underConstrained = n > 0 && rank < n;
  const overConstrained = !converged;

  const notes: string[] = [];
  if (overConstrained) {
    notes.push(
      `over-constrained: residual ${residual.toExponential(3)} after ${iterations} iteration(s) — constraints conflict`,
    );
  }
  if (underConstrained) {
    notes.push(
      `under-constrained: ${n - rank} free degree(s) of freedom remain (rank ${rank} of ${n})`,
    );
  }
  if (!overConstrained && !underConstrained) {
    notes.push(
      n === 0
        ? `fully anchored: residual ${residual.toExponential(3)}`
        : `well-constrained: residual ${residual.toExponential(3)}`,
    );
  }

  const final = withX(x);
  const points: Record<string, Pt2> = {};
  for (const id of ids) {
    const p = mustGet(final, id);
    points[id] = [p[0], p[1]];
  }

  return {
    points,
    converged,
    iterations,
    residual,
    diagnostics: { overConstrained, underConstrained, note: notes.join("; ") },
  };
}
