/**
 * Residual rows and analytic gradients for the fenced seven.
 *
 * Each active constraint contributes scalar rows r_i(x) driven to zero by
 * the Levenberg-Marquardt loop in solve.ts. Row units: mm for coincident /
 * distance / symmetric, radians for angle, and sin/cos of the between-angle
 * for parallel / perpendicular (the cross/dot normalized by segment lengths;
 * the normalization is frozen per evaluation — a per-row preconditioner, not
 * differentiated — which keeps mixed rows comparably scaled without
 * complicating the Jacobian).
 *
 * onGrid contributes NO row: it is a quantization pre-pass in solve.ts.
 */

import type { Pt2 } from "@car/schema";
import { DEG, TAU, natan2, nmax, nround, nsqrt } from "@car/num";
import type { Constraint } from "./types.js";

/** One scalar residual: value plus ∂value/∂point per involved point id. */
export interface ResidualRow {
  readonly value: number;
  readonly grads: ReadonlyArray<readonly [id: string, gx: number, gy: number]>;
}

/** Floor for degenerate-length divisions; deterministic, input-independent. */
const EPS_LEN = 1e-12;

/** Wrap to (−π, π] so angle residuals pull toward the nearest turn. */
const wrapPi = (x: number): number => x - TAU * nround(x / TAU);

function pt(points: ReadonlyMap<string, Pt2>, id: string): Pt2 {
  const p = points.get(id);
  if (!p) throw new Error(`constraint references unknown point "${id}"`);
  return p;
}

export function buildRows(
  points: ReadonlyMap<string, Pt2>,
  constraints: readonly Constraint[],
): ResidualRow[] {
  const rows: ResidualRow[] = [];
  for (const c of constraints) {
    switch (c.kind) {
      case "coincident": {
        const a = pt(points, c.a);
        const b = pt(points, c.b);
        rows.push({ value: a[0] - b[0], grads: [[c.a, 1, 0], [c.b, -1, 0]] });
        rows.push({ value: a[1] - b[1], grads: [[c.a, 0, 1], [c.b, 0, -1]] });
        break;
      }
      case "distance": {
        const a = pt(points, c.a);
        const b = pt(points, c.b);
        const ux = a[0] - b[0];
        const uy = a[1] - b[1];
        const len = nsqrt(ux * ux + uy * uy);
        // coincident-but-apart degenerate: push along +x, deterministically
        const dx = len < EPS_LEN ? 1 : ux / len;
        const dy = len < EPS_LEN ? 0 : uy / len;
        rows.push({ value: len - c.d, grads: [[c.a, dx, dy], [c.b, -dx, -dy]] });
        break;
      }
      case "angle": {
        const a = pt(points, c.a);
        const b = pt(points, c.b);
        const cc = pt(points, c.c);
        const ux = a[0] - b[0];
        const uy = a[1] - b[1];
        const vx = cc[0] - b[0];
        const vy = cc[1] - b[1];
        const theta = natan2(ux * vy - uy * vx, ux * vx + uy * vy); // signed u→v
        const lu2 = nmax(ux * ux + uy * uy, EPS_LEN);
        const lv2 = nmax(vx * vx + vy * vy, EPS_LEN);
        // ∂θ/∂a = perp(u)ᵀ/|u|² with the sign that shrinks θ as a rotates toward c
        const gax = uy / lu2;
        const gay = -ux / lu2;
        const gcx = -vy / lv2;
        const gcy = vx / lv2;
        rows.push({
          value: wrapPi(theta - c.deg * DEG),
          grads: [[c.a, gax, gay], [c.c, gcx, gcy], [c.b, -(gax + gcx), -(gay + gcy)]],
        });
        break;
      }
      case "parallel": {
        const a = pt(points, c.a);
        const b = pt(points, c.b);
        const p = pt(points, c.c);
        const q = pt(points, c.d);
        const ux = b[0] - a[0];
        const uy = b[1] - a[1];
        const vx = q[0] - p[0];
        const vy = q[1] - p[1];
        const w = 1 / nmax(nsqrt((ux * ux + uy * uy) * (vx * vx + vy * vy)), EPS_LEN);
        rows.push({
          value: (ux * vy - uy * vx) * w, // sin(angle between)
          grads: [
            [c.a, -vy * w, vx * w],
            [c.b, vy * w, -vx * w],
            [c.c, uy * w, -ux * w],
            [c.d, -uy * w, ux * w],
          ],
        });
        break;
      }
      case "perpendicular": {
        const a = pt(points, c.a);
        const b = pt(points, c.b);
        const p = pt(points, c.c);
        const q = pt(points, c.d);
        const ux = b[0] - a[0];
        const uy = b[1] - a[1];
        const vx = q[0] - p[0];
        const vy = q[1] - p[1];
        const w = 1 / nmax(nsqrt((ux * ux + uy * uy) * (vx * vx + vy * vy)), EPS_LEN);
        rows.push({
          value: (ux * vx + uy * vy) * w, // cos(angle between)
          grads: [
            [c.a, -vx * w, -vy * w],
            [c.b, vx * w, vy * w],
            [c.c, -ux * w, -uy * w],
            [c.d, ux * w, uy * w],
          ],
        });
        break;
      }
      case "symmetric": {
        // Reflection across line PQ ⇔ midpoint of ab on the line ∧ ab ⊥ line.
        const a = pt(points, c.a);
        const b = pt(points, c.b);
        const p = pt(points, c.lineP);
        const q = pt(points, c.lineQ);
        const dx = q[0] - p[0];
        const dy = q[1] - p[1];
        const w = 1 / nmax(nsqrt(dx * dx + dy * dy), EPS_LEN);
        const mx = (a[0] + b[0]) / 2 - p[0];
        const my = (a[1] + b[1]) / 2 - p[1];
        // signed distance of the midpoint from the line, mm
        rows.push({
          value: (mx * dy - my * dx) * w,
          grads: [
            [c.a, (dy / 2) * w, (-dx / 2) * w],
            [c.b, (dy / 2) * w, (-dx / 2) * w],
            [c.lineP, (my - dy) * w, (dx - mx) * w],
            [c.lineQ, -my * w, mx * w],
          ],
        });
        const sx = b[0] - a[0];
        const sy = b[1] - a[1];
        // component of a→b along the line direction, mm (zero ⇔ perpendicular)
        rows.push({
          value: (sx * dx + sy * dy) * w,
          grads: [
            [c.a, -dx * w, -dy * w],
            [c.b, dx * w, dy * w],
            [c.lineP, -sx * w, -sy * w],
            [c.lineQ, sx * w, sy * w],
          ],
        });
        break;
      }
      case "onGrid":
        break; // pre-pass only — no residual row, ever (the fence holds here too)
      default: {
        const never: never = c;
        throw new Error(`unreachable constraint kind: ${String(never)}`);
      }
    }
  }
  return rows;
}
