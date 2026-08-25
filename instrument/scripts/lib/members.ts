/**
 * Structural members — the kit both cars author their chassis with.
 *
 * It exists because a capability that lives in one build script is a trick,
 * not a capability. `beam` was copied between two builds and `strut` did not
 * exist at all: until this file there was no way to author a member that does
 * not run along an axis, which is why three cars had frames made entirely of
 * ladders and no car had a wishbone. A car whose wheels are not attached to
 * anything is what that looks like from the outside.
 *
 * Two things it does that the raw verbs do not:
 *
 *   STRUT authors a member between two points. A box of the right length is
 *   taped along x and then rigidly MOVED onto the axis. Every curve is
 *   straight, so an affine map of its control points is exact rather than a
 *   fit — and every target is computed BEFORE any point moves, because the
 *   twelve curves share eight corners and mapping a corner that has already
 *   been mapped folds the box.
 *
 *   REGISTER writes every member down as the box it occupies, so a lens can
 *   read the structure without re-deriving it from a triangle soup. The
 *   register and the mesh are two descriptions of the same thing computed two
 *   different ways, which is the arrangement that catches a member that
 *   exists in one and not the other — and it caught exactly that the first
 *   time it ran: a front frame mirrored in the register and authored on one
 *   side only.
 *
 * MIRRORING IS PER MEMBER, and that is the whole reason for the flag. A tube
 * authored on the left wants a twin; a crossmember that spans the centreline
 * must not have one, because it would be its own reflection twice over. The
 * first version detached a whole frame in one loop after building it and put
 * every tube on the left and nowhere else.
 */

import type { Id, Pt3 } from "@car/schema";
import type { StructureMember } from "@car/lens";

/** The curve-level helpers a build already has. Passed rather than re-derived. */
export interface MemberDeps {
  apply: (verb: string, args: unknown) => unknown;
  cellIds: () => Id[];
  curveIds: () => Id[];
  straighten: (id: Id) => void;
  ctrlsOf: (id: Id) => [Pt3, Pt3, Pt3, Pt3];
  fitThrough: (id: Id, f: (t: number) => Pt3, endsToo?: boolean) => void;
}

export interface MemberRect {
  readonly view: { readonly kind: "side" | "front" };
  readonly a: readonly [number, number];
  readonly b: readonly [number, number];
  readonly depth: number;
  readonly at: number;
}

export interface MemberKit {
  /** Every member authored so far, as boxes, twins included. */
  readonly members: StructureMember[];
  /** An axis-aligned box. `mirror` leaves it on the mirror law. */
  beam: (name: string, rect: MemberRect, mirror?: boolean) => void;
  /** A member between two points — a wishbone, a damper, a tie rod, a diagonal. */
  strut: (name: string, from: Pt3, to: Pt3, w: number, h: number, mirror?: boolean) => void;
}

const lerp3 = (a: Pt3, b: Pt3, t: number): Pt3 =>
  [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

export function memberKit(d: MemberDeps): MemberKit {
  const members: StructureMember[] = [];
  const side = { kind: "side" as const };

  const record = (name: string, lo: Pt3, hi: Pt3, mirror: boolean): void => {
    members.push({ name, lo, hi });
    if (mirror) {
      members.push({ name: `${name}-R`, lo: [lo[0], -hi[1], lo[2]], hi: [hi[0], -lo[1], hi[2]] });
    }
  };
  const detachNew = (before: ReadonlySet<Id>): void => {
    for (const id of d.cellIds()) if (!before.has(id)) d.apply("mirror-detach", { cellId: id });
  };
  /** Straighten and crease everything a tape just made. Structure is straight. */
  const settle = (before: ReadonlySet<Id>): Id[] => {
    const made = d.curveIds().filter((id) => !before.has(id));
    for (const id of made) {
      d.straighten(id);
      d.apply("crease", { curveId: id });
    }
    return made;
  };

  const beam = (name: string, rect: MemberRect, mirror = false): void => {
    const curvesBefore = new Set(d.curveIds());
    const cellsBefore = new Set(d.cellIds());
    d.apply("tape", { kind: "box", rect });
    settle(curvesBefore);
    const [p, q] = [rect.a, rect.b];
    const alongLo = Math.min(rect.at, rect.at + rect.depth);
    const alongHi = Math.max(rect.at, rect.at + rect.depth);
    const lo: Pt3 = rect.view.kind === "side"
      ? [Math.min(p[0], q[0]), alongLo, Math.min(p[1], q[1])]
      : [alongLo, Math.min(p[0], q[0]), Math.min(p[1], q[1])];
    const hi: Pt3 = rect.view.kind === "side"
      ? [Math.max(p[0], q[0]), alongHi, Math.max(p[1], q[1])]
      : [alongHi, Math.max(p[0], q[0]), Math.max(p[1], q[1])];
    if (!mirror) detachNew(cellsBefore);
    record(name, lo, hi, mirror);
  };

  const strut = (name: string, from: Pt3, to: Pt3, w: number, h: number, mirror = false): void => {
    const v: Pt3 = [to[0] - from[0], to[1] - from[1], to[2] - from[2]];
    const len = Math.hypot(v[0], v[1], v[2]);
    if (len < 1) throw new Error(`strut ${name} has no length`);
    const curvesBefore = new Set(d.curveIds());
    const cellsBefore = new Set(d.cellIds());
    d.apply("tape", {
      kind: "box",
      rect: { view: side, a: [0, -h / 2], b: [len, h / 2], depth: w, at: -w / 2 },
    });
    const made = settle(curvesBefore);
    // An orthonormal frame on the member's own axis. The `up` choice only has
    // to be non-parallel; which perpendicular a square tube is rolled to is
    // not a fact about the car.
    const e0: Pt3 = [v[0] / len, v[1] / len, v[2] / len];
    const up: Pt3 = Math.abs(e0[2]) > 0.9 ? [1, 0, 0] : [0, 0, 1];
    const c: Pt3 = [
      e0[1] * up[2] - e0[2] * up[1], e0[2] * up[0] - e0[0] * up[2], e0[0] * up[1] - e0[1] * up[0],
    ];
    const cl = Math.hypot(c[0], c[1], c[2]);
    const eY: Pt3 = [c[0] / cl, c[1] / cl, c[2] / cl];
    const eZ: Pt3 = [
      eY[1] * e0[2] - eY[2] * e0[1], eY[2] * e0[0] - eY[0] * e0[2], eY[0] * e0[1] - eY[1] * e0[0],
    ];
    const map = (q: Pt3): Pt3 => [
      from[0] + e0[0] * q[0] + eY[0] * q[1] + eZ[0] * q[2],
      from[1] + e0[1] * q[0] + eY[1] * q[1] + eZ[1] * q[2],
      from[2] + e0[2] * q[0] + eY[2] * q[1] + eZ[2] * q[2],
    ];
    const target = new Map<Id, [Pt3, Pt3]>();
    for (const id of made) {
      const [p0, , , p3] = d.ctrlsOf(id);
      target.set(id, [map(p0), map(p3)]);
    }
    const lo: Pt3 = [Infinity, Infinity, Infinity];
    const hi: Pt3 = [-Infinity, -Infinity, -Infinity];
    for (const id of made) {
      const [A, B] = target.get(id)!;
      d.fitThrough(id, (t) => lerp3(A, B, t));
      for (const p of [A, B]) for (let k = 0; k < 3; k++) {
        lo[k] = Math.min(lo[k]!, p[k]!); hi[k] = Math.max(hi[k]!, p[k]!);
      }
    }
    if (!mirror) detachNew(cellsBefore);
    record(name, lo, hi, mirror);
  };

  return { members, beam, strut };
}

/**
 * One suspension corner: an upright at the wheel and the links that reach it.
 *
 * Named here because both cars have four of them and the geometry is the
 * same argument each time — a wishbone is two legs and a hub end, so it is
 * two struts and reads as the A it is. What differs between cars is where the
 * inboard pickups are, and those are passed.
 */
export interface CornerSpec {
  readonly tag: string;
  readonly axleX: number;
  readonly hubY: number;
  readonly axleZ: number;
  /** Inboard pickup for the lower wishbone. */
  readonly lowerIn: Pt3;
  /** Inboard pickup for the upper link. On a car whose halfshaft IS the upper
   *  link, this is the differential rather than a frame rail. */
  readonly upperIn: Pt3;
  /** Where the spring or damper lands on the structure. */
  readonly springTop: Pt3;
  readonly uprightHeight?: number;
  readonly linkSection?: number;
}

export function suspensionCorner(kit: MemberKit, c: CornerSpec): void {
  const H = c.uprightHeight ?? 300;
  const L = c.linkSection ?? 30;
  const top: Pt3 = [c.axleX, c.hubY, c.axleZ + H / 2];
  const bot: Pt3 = [c.axleX, c.hubY, c.axleZ - H / 2];
  // The upright is the one member that reaches the wheel. Everything else
  // reaches the car through it, which is why a bare link is not enough and
  // why the lens asks whether what touches the wheel is on the main island.
  kit.beam(`upright-${c.tag}`, {
    view: { kind: "side" }, a: [c.axleX - 52, bot[2]], b: [c.axleX + 52, top[2]],
    depth: 64, at: c.hubY - 32,
  }, true);
  kit.strut(`lower-arm-fwd-${c.tag}`, bot, [c.lowerIn[0] - 150, c.lowerIn[1], c.lowerIn[2]], L, L, true);
  kit.strut(`lower-arm-aft-${c.tag}`, bot, [c.lowerIn[0] + 150, c.lowerIn[1], c.lowerIn[2]], L, L, true);
  kit.strut(`upper-arm-fwd-${c.tag}`, top, [c.upperIn[0] - 110, c.upperIn[1], c.upperIn[2]], L, L, true);
  kit.strut(`upper-arm-aft-${c.tag}`, top, [c.upperIn[0] + 110, c.upperIn[1], c.upperIn[2]], L, L, true);
  // Off the lower arm rather than the upright, which is where a wishbone car
  // puts its spring.
  kit.strut(`spring-${c.tag}`, [c.axleX, c.hubY - 120, bot[2] + 30], c.springTop, 46, 46, true);
}
