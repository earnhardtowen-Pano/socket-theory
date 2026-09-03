/**
 * End caps — a nose and a tail as PROWS rather than plates.
 *
 * Every body in this repository starts as a box, and a box has two end
 * faces. Five cars in, all ten of them are still flat: a cross-car panel
 * whose four edges break hard against the bands around it, creased and
 * gapped so the field leaves it alone. That is a bumper drawn by somebody
 * who has never looked at one from above. A real nose is a prow — the face
 * bows forward from its corners in plan, and a tail does the same the other
 * way — and until this file there was no verb-level way to say so.
 *
 * It costs nothing the grammar does not already have. The end cell is a
 * Coons patch of its four boundary curves; bow each curve in x by a parabola
 * that vanishes at both ends and the interior follows, because a bilinearly
 * blended patch interpolates its boundary. Every corner stays put, so every
 * weld holds and the print stays closed by the same mechanism as before. The
 * dome's depth at the middle is the sum of what the boundary asks for:
 *
 *     x(u, v) = 4u(1−u) · [(1−v)·bottom + v·top]  +  4v(1−v) · side
 *
 * which is worth writing down because `capBand` needs it. Cutting the cap
 * across at a height z — a grille's top edge, a lamp band's two — hands the
 * tape verb a chord between the two side curves, and the chord is straight.
 * The surface it lies in is not. So the seam is re-bowed to the iso-curve of
 * the dome at that height, from the formula above; and because a Coons
 * patch reproduces any bilinearly blended surface exactly, the two halves
 * then ARE the original dome, split. Nothing moves that was not meant to.
 *
 * WHEN. Bow before any cut into the cap and after the box's own edges have
 * been straightened — the same window every master line is shaped in. A
 * band cut is a split and is safe afterwards; the seam it makes is claimed
 * end to end by both halves, so bowing it is the station-curve case, not
 * the split-then-move one.
 */

import type { Id, Pt3 } from "@car/schema";

/** The curve-level helpers a build already has. Passed rather than re-derived. */
export interface CapDeps {
  apply: (verb: string, args: unknown) => unknown;
  cellIds: () => Id[];
  curveIds: () => Id[];
  /** Resolved curve ids of a cell's sides, in side order. */
  sidesOf: (cellId: Id) => Id[];
  /** A point on a curve at parameter t, on its resolved chain. */
  pointAt: (curveId: Id, t: number) => Pt3;
  fitThrough: (id: Id, f: (t: number) => Pt3, endsToo?: boolean) => void;
}

export interface DomeSpec {
  /** +1 bows toward +x — a tail; −1 toward −x — a nose. */
  readonly sign: 1 | -1;
  /** How far the top edge's middle bows, mm. The bonnet's leading edge in plan. */
  readonly top: number;
  /** How far the bottom edge's middle bows. The valance's lower lip in plan. */
  readonly bottom: number;
  /** How far each side edge's middle bows. The corner's roll in side view. */
  readonly side: number;
}

/** A domed cap, remembered so bands can be cut into it afterwards. */
export interface EndCap {
  /** The cells the cap is made of — one until a band is cut. */
  readonly cells: Id[];
  /** Every seam a band cut made, in cut order. */
  readonly seams: Id[];
  readonly sign: 1 | -1;
  /** The face's x before the dome — where its four corners still are. */
  readonly x: number;
  readonly zBottom: number;
  readonly zTop: number;
  readonly bows: DomeSpec;
  /** How deep the dome stands at the middle of the face, mm. */
  readonly depth: number;
}

/** The parabola: 1 at the middle, 0 at both ends. */
const hump = (t: number): number => 4 * t * (1 - t);

const lerp3 = (a: Pt3, b: Pt3, t: number): Pt3 =>
  [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/**
 * Dome one end face. The cell must still be the box's own — four straight
 * sides at one x — which is what the check at the top enforces by name.
 */
export function domeEndCap(d: CapDeps, cellId: Id, spec: DomeSpec): EndCap {
  const sides = d.sidesOf(cellId);
  if (sides.length !== 4) throw new Error(`end cap ${cellId} has ${sides.length} sides, expected 4`);
  const ends = sides.map((id): [Pt3, Pt3] => [d.pointAt(id, 0), d.pointAt(id, 1)]);
  // Ends AND middles: a face that has already been domed still has every
  // corner at the box's x, and only its middles give it away.
  const xs = sides.flatMap((id) => [0, 0.5, 1].map((t) => d.pointAt(id, t)[0]));
  const x = xs[0]!;
  if (xs.some((v) => Math.abs(v - x) > 1e-6)) {
    throw new Error(`end cap ${cellId} is not flat: x runs ${Math.min(...xs).toFixed(2)}..${Math.max(...xs).toFixed(2)}`);
  }
  // Across-the-car edges are told from the side edges by which way they run,
  // and the top from the bottom by height. Nothing here is a tolerance.
  const across = sides.map((_, i) => {
    const [a, b] = ends[i]!;
    return Math.abs(b[1] - a[1]) > Math.abs(b[2] - a[2]);
  });
  const meanZ = (i: number): number => (ends[i]![0][2] + ends[i]![1][2]) / 2;
  const acrossIdx = sides.map((_, i) => i).filter((i) => across[i]);
  const sideIdx = sides.map((_, i) => i).filter((i) => !across[i]);
  if (acrossIdx.length !== 2 || sideIdx.length !== 2) {
    throw new Error(`end cap ${cellId}: ${acrossIdx.length} across + ${sideIdx.length} side edges`);
  }
  const [lo, hi] = meanZ(acrossIdx[0]!) < meanZ(acrossIdx[1]!) ? acrossIdx : [acrossIdx[1]!, acrossIdx[0]!];
  const bow = (i: number, amount: number): void => {
    const [a, b] = ends[i]!;
    d.fitThrough(sides[i]!, (t) => {
      const p = lerp3(a, b, t);
      return [x + spec.sign * amount * hump(t), p[1], p[2]];
    }, false);
  };
  bow(lo!, spec.bottom);
  bow(hi!, spec.top);
  for (const i of sideIdx) bow(i, spec.side);
  return {
    cells: [cellId], seams: [], sign: spec.sign, x,
    zBottom: meanZ(lo!), zTop: meanZ(hi!), bows: spec,
    depth: (spec.top + spec.bottom) / 2 + spec.side,
  };
}

/**
 * Cut a band across a domed cap at height z, and hand back the two halves
 * with the lower one first. The seam is bowed onto the dome so the halves
 * reproduce it exactly — see the header.
 */
export function capBand(d: CapDeps, cap: EndCap, cellId: Id, z: number): { lower: Id; upper: Id; seam: Id } {
  if (!cap.cells.includes(cellId)) throw new Error(`${cellId} is not a cell of this cap`);
  if (z <= cap.zBottom || z >= cap.zTop) {
    throw new Error(`band at z ${z} is outside the cap's ${cap.zBottom.toFixed(0)}..${cap.zTop.toFixed(0)}`);
  }
  const cellsBefore = new Set(d.cellIds());
  const curvesBefore = new Set(d.curveIds());
  // Wider than any car: the line only has to cross the cell's two sides.
  d.apply("tape", {
    kind: "line",
    line: { view: { kind: "front" }, a: [-5000, z], b: [5000, z], lineClass: "tape" },
    targets: [cellId],
  });
  // A cut RETIRES the cell it splits and makes two new ones, so the pieces
  // are whatever is new plus the original if the verb happened to keep it.
  const after = d.cellIds();
  const pieces = after.filter((id) => !cellsBefore.has(id) || id === cellId);
  const newCurves = d.curveIds().filter((id) => !curvesBefore.has(id));
  if (pieces.length !== 2 || newCurves.length !== 1) {
    throw new Error(`band cut left ${pieces.length} pieces and made ${newCurves.length} curves, expected 2 and 1`);
  }
  const seam = newCurves[0]!;
  // Which half is which: the one whose sides sit lower.
  const meanZ = (id: Id): number => {
    let acc = 0, n = 0;
    for (const sd of d.sidesOf(id)) for (const t of [0, 1]) { acc += d.pointAt(sd, t)[2]; n++; }
    return acc / n;
  };
  const [a0, a1] = pieces as [Id, Id];
  const [lower, upper] = meanZ(a0) < meanZ(a1) ? [a0, a1] : [a1, a0];
  // The iso-curve of the dome at this height: the sides' own bow is already
  // in the seam's ends (the cut landed on the bowed side curves), so what is
  // added is the across-bow at this v — bottom fading into top.
  const v = (z - cap.zBottom) / (cap.zTop - cap.zBottom);
  const amount = (1 - v) * cap.bows.bottom + v * cap.bows.top;
  const a = d.pointAt(seam, 0), b = d.pointAt(seam, 1);
  d.fitThrough(seam, (t) => {
    const p = lerp3(a, b, t);
    return [p[0] + cap.sign * amount * hump(t), p[1], p[2]];
  }, false);
  cap.cells.splice(cap.cells.indexOf(cellId), 1, lower, upper);
  cap.seams.push(seam);
  return { lower, upper, seam };
}
