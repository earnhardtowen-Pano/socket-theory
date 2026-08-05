import type { SolveResult } from '@pkgprop/core';
import {
  buildNetwork,
  halfSection,
  interpolate,
  mirrorNetwork,
  v3,
  type Curve,
  type EdgeKind,
  type NetCurve,
  type NetworkMesh,
  type PanelSpec,
  type SectionShape,
  type V3,
} from '@pkgprop/geometry';

/**
 * The car as a grid of named curves, and a panel in every cell.
 *
 * The trick that keeps this honest is that the section is the only source of
 * truth about shape. A rail — the rocker, the shoulder, the beltline, the hood
 * shutline — is not a separate curve someone drew and hoped would agree with
 * the surface; it is the section evaluated at a fixed parameter, swept along
 * the car. A transverse cut is the same section restricted between two of
 * those parameters. So every boundary in the network comes off one curve, and
 * two panels that meet cannot disagree about where they meet, because they are
 * reading the same function at the same numbers.
 *
 * What that buys, in the owner's words: panels that are their own panels, and
 * a greenhouse that is a windscreen and three pillars and two pieces of side
 * glass rather than a balloon. A pillar is not a bulge in a taper any more. It
 * is a patch, with a crease down each side, and the crease is why you can see
 * it.
 */

/**
 * A longitudinal rail, named by what it is on a car and located by where it
 * sits across the section.
 *
 * Parameter, not height: the section runs from the centreline over the crown
 * and down the flank to the sill as one curve, so a fixed parameter tracks the
 * same *feature* as the car changes shape. Pinning a rail to a height instead
 * would let the shoulder wander onto the roof the moment someone lowered the
 * belt.
 */
interface Rail {
  readonly id: string;
  readonly label: string;
  /** Where across the half-section, 0 at the centreline, 1 at the sill. */
  readonly f: number;
  /** Whether the surface breaks along this rail. */
  readonly kind: EdgeKind;
}

/** A transverse cut: a station, and whether the surface breaks across it. */
interface Cut {
  readonly id: string;
  readonly label: string;
  readonly x: number;
  readonly kind: EdgeKind;
}

/**
 * Where the named rails sit across the half-section.
 *
 * These are the four control points `halfSection` is built from, and the
 * parameters are where those points land under chord-length interpolation —
 * near enough evenly spaced, because the four points are roughly evenly spaced
 * around the section. They are stated rather than solved for because the
 * section's own control structure is not exposed, and because a rail wants to
 * sit at a *named* place on the car whether or not the section happens to have
 * a control point there.
 *
 * The hood shutline is the one that is genuinely a choice: it is the line where
 * the hood stops being the hood and starts being the fender top, and on a real
 * car it sits just outboard of the crown roll-off.
 */
const F_CENTRELINE = 0;
const F_HOOD_SHUT = 0.3;
const F_SHOULDER = 0.6;
const F_SILL = 1;

/**
 * The greenhouse's own section, from the DLO up over the roof.
 *
 * Separate from the body's because it is a separate volume with its own lean —
 * a cabin let into a body, not a continuation of it. The rails are the DLO
 * lower edge, the roof rail where the glass stops and the roof begins, and the
 * roof centreline.
 */
const G_CENTRELINE = 0;
const G_ROOF_RAIL = 0.42;
const G_DLO_LOWER = 1;

/** Samples along a curve when turning a rail or a cut into a network curve. */
const CURVE_SAMPLES = 14;

/**
 * How wide a pillar is, across the daylight opening.
 *
 * This is a real design decision rather than a modelling constant — it trades
 * directly against how much the driver cannot see — and it wants to become a
 * solved band between structure and obstruction. Until then it is one number,
 * named, and the same for all three pillars.
 */
const PILLAR_WIDTH = 110;

const clamp01 = (t: number): number => Math.min(1, Math.max(0, t));

export interface CarNetworkInput {
  /** Upper silhouette at a station — the drawn hood/roof/deck chain. */
  readonly topZ: (x: number) => number;
  readonly beltZ: (x: number) => number;
  readonly halfWidth: (x: number) => number;
  readonly rockerZ: (x: number) => number;
  readonly shape: SectionShape;
  readonly cabin: { readonly x0: number; readonly x1: number } | null;
  readonly bumperX: number;
  readonly tailX: number;
  readonly wheelbase: number;
  /** Arch rim height at a station, where an opening is cut. */
  readonly archZ: ((x: number) => number) | null;
  /** Fore and aft extent of each wheel opening. */
  readonly arches: readonly { readonly slot: string; readonly x0: number; readonly x1: number }[];
  /** Where the rear seats begin, if there are any — the B-pillar station. */
  readonly secondRowX: number | null;
  readonly density: number;
}

/** The body's half-section at a station, capped at the belt inside the cabin. */
function bodySectionAt(input: CarNetworkInput, x: number): Curve {
  const top = input.topZ(x);
  const belt = input.beltZ(x);
  const inCabin = input.cabin !== null && x > input.cabin.x0 && x < input.cabin.x1;
  const bottom = input.archZ ? Math.max(input.rockerZ(x), input.archZ(x)) : input.rockerZ(x);
  const upper = inCabin ? Math.min(top, belt) : top;
  return halfSection(
    Math.max(bottom + 60, upper),
    bottom,
    Math.max(20, input.halfWidth(x)),
    input.shape,
  );
}

/** The greenhouse's half-section at a station, or null where there is no cabin. */
function glassSectionAt(input: CarNetworkInput, x: number): Curve | null {
  const { cabin } = input;
  // Inclusive at both ends. The windscreen base and the backlight base are
  // cuts that sit exactly on the cabin boundary, so an exclusive test deletes
  // every panel that touches them — which was silently costing the car its
  // windscreen, its backlight and two thirds of its roof.
  if (!cabin || x < cabin.x0 - 1e-6 || x > cabin.x1 + 1e-6) return null;
  const base = input.beltZ(x);
  const top = input.topZ(x);
  if (top < base + 60) return null;
  // The cabin sits inboard of the shoulder — that step is what makes it read
  // as a cabin let into a body rather than a bubble sat on top of one.
  const inset = clamp01(input.shape.glassInset);
  const half = Math.max(16, input.halfWidth(x) * (1 - 0.24 * inset));
  return halfSection(top, base, half, {
    crown: 0.4,
    shoulder: 0.34,
    tumblehome: 0.34,
    glassInset: 0,
  });
}

/** A rail: one section parameter swept between two stations. */
function railCurve(
  section: (x: number) => Curve | null,
  f: number,
  x0: number,
  x1: number,
): Curve | null {
  const pts: V3[] = [];
  for (let i = 0; i <= CURVE_SAMPLES; i += 1) {
    const x = x0 + ((x1 - x0) * i) / CURVE_SAMPLES;
    const sec = section(x);
    if (!sec) return null;
    const p = sec.at(f);
    pts.push(v3(x, p.y, p.z));
  }
  return interpolate(pts);
}

/** A cut: one station's section, restricted between two rails. */
function cutCurve(
  section: (x: number) => Curve | null,
  x: number,
  f0: number,
  f1: number,
): Curve | null {
  const sec = section(x);
  if (!sec) return null;
  const pts: V3[] = [];
  for (let i = 0; i <= CURVE_SAMPLES; i += 1) {
    const p = sec.at(f0 + ((f1 - f0) * i) / CURVE_SAMPLES);
    pts.push(v3(x, p.y, p.z));
  }
  return interpolate(pts);
}

/**
 * Cross a rail list with a cut list and put a panel in every cell.
 *
 * The whole topology is this loop. A two-seater and a four-door differ only in
 * how many cuts are in the list, which is why neither of them is a special
 * case in the code.
 */
function grid(
  section: (x: number) => Curve | null,
  rails: readonly Rail[],
  cuts: readonly Cut[],
  names: (rail: number, cut: number) => { id: string; label: string; group: string } | null,
): { curves: NetCurve[]; panels: PanelSpec[] } {
  const curves: NetCurve[] = [];
  const panels: PanelSpec[] = [];
  const seen = new Set<string>();
  const push = (id: string, curve: Curve | null, label: string): boolean => {
    if (!curve) return false;
    if (!seen.has(id)) {
      seen.add(id);
      curves.push({ id, curve, label });
    }
    return true;
  };

  for (let r = 0; r < rails.length - 1; r += 1) {
    for (let c = 0; c < cuts.length - 1; c += 1) {
      const named = names(r, c);
      if (!named) continue;
      const lo = rails[r]!;
      const hi = rails[r + 1]!;
      const fwd = cuts[c]!;
      const aft = cuts[c + 1]!;
      if (aft.x - fwd.x < 1) continue;

      const loId = `${lo.id}@${fwd.id}-${aft.id}`;
      const hiId = `${hi.id}@${fwd.id}-${aft.id}`;
      const fwdId = `${fwd.id}@${lo.id}-${hi.id}`;
      const aftId = `${aft.id}@${lo.id}-${hi.id}`;

      const ok =
        push(loId, railCurve(section, lo.f, fwd.x, aft.x), lo.label) &&
        push(hiId, railCurve(section, hi.f, fwd.x, aft.x), hi.label) &&
        push(fwdId, cutCurve(section, fwd.x, lo.f, hi.f), fwd.label) &&
        push(aftId, cutCurve(section, aft.x, lo.f, hi.f), aft.label);
      if (!ok) continue;

      // Boundary order is [south, east, north, west] walking the loop: along
      // the low rail aft, up the aft cut, back along the high rail, down the
      // forward cut.
      panels.push({
        id: named.id,
        label: named.label,
        group: named.group,
        boundary: [loId, aftId, hiId, fwdId],
        reversed: [false, false, true, true],
        edges: [lo.kind, aft.kind, hi.kind, fwd.kind],
      });
    }
  }
  return { curves, panels };
}

export interface CarNetwork {
  readonly mesh: NetworkMesh;
  readonly panelCount: number;
  readonly creaseCount: number;
}

/**
 * Where the greenhouse actually has height.
 *
 * The cabin span comes from the drawn silhouette's cowl and backlight
 * stations, and at the very ends of that span the glass has closed down to
 * nothing — the backlight has already met the decklid by the time it reaches
 * its last drawn point. Building panels out to the nominal ends therefore asks
 * for a patch with no height, which is dropped, and the car quietly loses its
 * backlight. Scanning for the live span instead is also what makes a fastback
 * and a speedster fall out of the same code: a speedster's live span is empty
 * and it simply has no greenhouse.
 */
function liveCabin(input: CarNetworkInput): { x0: number; x1: number } | null {
  const { cabin } = input;
  if (!cabin) return null;
  const STEPS = 60;
  let lo: number | null = null;
  let hi: number | null = null;
  for (let i = 0; i <= STEPS; i += 1) {
    const x = cabin.x0 + ((cabin.x1 - cabin.x0) * i) / STEPS;
    if (input.topZ(x) >= input.beltZ(x) + 60) {
      if (lo === null) lo = x;
      hi = x;
    }
  }
  return lo !== null && hi !== null && hi - lo > 200 ? { x0: lo, x1: hi } : null;
}

export function buildCarNetwork(rawInput: CarNetworkInput): CarNetwork {
  const live = liveCabin(rawInput);
  const input: CarNetworkInput = { ...rawInput, cabin: live };
  const body = (x: number): Curve | null => bodySectionAt(input, x);
  const glass = (x: number): Curve | null => glassSectionAt(input, x);

  // ---- the body: hood, fender, doors, quarter, rocker ---------------------
  const bodyRails: Rail[] = [
    { id: 'centreline', label: 'centreline', f: F_CENTRELINE, kind: 'smooth' },
    // The hood shutline is where the hood ends and the fender begins. It is a
    // gap on a real car, so it is a crease here.
    { id: 'hood-shut', label: 'hood shutline', f: F_HOOD_SHUT, kind: 'crease' },
    { id: 'shoulder', label: 'shoulder', f: F_SHOULDER, kind: 'smooth' },
    { id: 'sill', label: 'sill', f: F_SILL, kind: 'smooth' },
  ];

  const cowlX = input.cabin?.x0 ?? input.wheelbase * 0.35;
  const backX = input.cabin?.x1 ?? input.wheelbase * 0.85;
  const bodyCuts: Cut[] = [{ id: 'nose', label: 'front parting', x: input.bumperX, kind: 'smooth' }];
  for (const a of input.arches) {
    bodyCuts.push({ id: `arch-${a.slot}-fore`, label: `${a.slot} arch, fore`, x: a.x0, kind: 'smooth' });
    bodyCuts.push({ id: `arch-${a.slot}-aft`, label: `${a.slot} arch, aft`, x: a.x1, kind: 'smooth' });
  }
  // The cowl is where the hood stops. It is a shutline across the whole car.
  bodyCuts.push({ id: 'cowl', label: 'cowl shutline', x: cowlX, kind: 'crease' });
  if (input.secondRowX !== null && input.secondRowX > cowlX + 200 && input.secondRowX < backX - 200) {
    bodyCuts.push({ id: 'b-shut', label: 'centre door shutline', x: input.secondRowX, kind: 'crease' });
  }
  bodyCuts.push({ id: 'quarter-shut', label: 'rear door shutline', x: backX, kind: 'crease' });
  bodyCuts.push({ id: 'tail', label: 'rear parting', x: input.tailX, kind: 'smooth' });
  bodyCuts.sort((a, b) => a.x - b.x);

  /** What a cell is called, in car language, given where it sits. */
  const bodyName = (r: number, c: number) => {
    const fwd = bodyCuts[c]!;
    const aft = bodyCuts[c + 1]!;
    const mid = (fwd.x + aft.x) / 2;
    const band = r === 0 ? 'upper' : r === 1 ? 'outer' : 'side';
    const where =
      mid < cowlX
        ? band === 'upper'
          ? 'hood'
          : band === 'outer'
            ? 'fender top'
            : 'front fender'
        : mid > backX
          ? band === 'upper'
            ? 'decklid'
            : band === 'outer'
              ? 'quarter top'
              : 'rear quarter'
          : band === 'upper'
            ? 'roof band'
            : band === 'outer'
              ? 'shoulder'
              : 'door';
    return {
      id: `body-${r}-${c}`,
      label: `${where} · ${fwd.label} to ${aft.label}`,
      group: where,
    };
  };

  const bodyGrid = grid(body, bodyRails, bodyCuts, bodyName);

  // ---- the greenhouse: windscreen, pillars, side glass, backlight ---------
  const glassRails: Rail[] = [
    { id: 'roof-crown', label: 'roof centreline', f: G_CENTRELINE, kind: 'smooth' },
    // The drip rail: where the roof stops and the glass starts. A hard line on
    // every car ever made, and the reason a roof reads as a roof.
    { id: 'roof-rail', label: 'roof rail', f: G_ROOF_RAIL, kind: 'crease' },
    { id: 'dlo-lower', label: 'DLO lower edge', f: G_DLO_LOWER, kind: 'crease' },
  ];

  const glassCuts: Cut[] = [];
  const pillarAt = (id: string, label: string, x: number): void => {
    glassCuts.push({ id: `${id}-fore`, label: `${label} leading edge`, x: x - PILLAR_WIDTH / 2, kind: 'crease' });
    glassCuts.push({ id: `${id}-aft`, label: `${label} trailing edge`, x: x + PILLAR_WIDTH / 2, kind: 'crease' });
  };
  if (input.cabin) {
    const { x0, x1 } = input.cabin;
    glassCuts.push({ id: 'cowl-line', label: 'windscreen base', x: x0, kind: 'crease' });
    pillarAt('a-pillar', 'A-pillar', x0 + PILLAR_WIDTH * 1.4);
    if (input.secondRowX !== null && input.secondRowX > x0 + 400 && input.secondRowX < x1 - 400) {
      pillarAt('b-pillar', 'B-pillar', input.secondRowX);
    }
    pillarAt('c-pillar', 'C-pillar', x1 - PILLAR_WIDTH * 1.4);
    glassCuts.push({ id: 'backlight-base', label: 'backlight base', x: x1, kind: 'crease' });
    glassCuts.sort((a, b) => a.x - b.x);
  }

  const glassName = (r: number, c: number) => {
    const fwd = glassCuts[c]!;
    const aft = glassCuts[c + 1]!;
    const pillar = fwd.id.endsWith('-fore') && aft.id.endsWith('-aft') && fwd.id.split('-')[0] === aft.id.split('-')[0];
    const name = fwd.id.replace('-fore', '');
    if (r === 0) {
      // Above the roof rail: this is roof, whatever is happening below it.
      return { id: `roof-${c}`, label: `roof · ${fwd.label} to ${aft.label}`, group: 'roof' };
    }
    if (pillar) {
      return { id: `${name}-${c}`, label: `${name.replace('-', ' ')}`, group: 'pillar' };
    }
    if (fwd.id === 'cowl-line') return { id: `windscreen-${c}`, label: 'windscreen', group: 'glass' };
    if (aft.id === 'backlight-base') return { id: `backlight-${c}`, label: 'backlight', group: 'glass' };
    return { id: `sideglass-${c}`, label: 'side glass', group: 'glass' };
  };

  const glassGrid = input.cabin && glassCuts.length >= 2 ? grid(glass, glassRails, glassCuts, glassName) : { curves: [], panels: [] };

  const half = buildNetwork({
    curves: [...bodyGrid.curves, ...glassGrid.curves],
    panels: [...bodyGrid.panels, ...glassGrid.panels],
    density: Math.max(3, Math.floor(input.density)),
  });

  const panels = bodyGrid.panels.length + glassGrid.panels.length;
  const creases = [...bodyGrid.panels, ...glassGrid.panels].reduce(
    (sum, p) => sum + (p.edges ?? []).filter((e) => e === 'crease').length,
    0,
  );

  return { mesh: mirrorNetwork(half), panelCount: panels, creaseCount: creases };
}

export { PILLAR_WIDTH };

/** Build the network input from a solve, the drawn rails, and the features. */
export function networkInputFrom(
  result: SolveResult,
  rails: {
    topZ: (x: number) => number;
    beltZ: (x: number) => number;
    halfWidth: (x: number) => number;
    rockerZ: (x: number) => number;
  },
  shape: SectionShape,
  cabin: { x0: number; x1: number } | null,
  archZ: ((x: number) => number) | null,
  arches: readonly { slot: string; x0: number; x1: number }[],
  density: number,
): CarNetworkInput {
  const g = result.geometry;
  // The B-pillar stands where the second row's heels are: that is the station
  // a rear door has to open behind, so it needs no number of its own.
  const secondRow = g.occupants[1]?.hpoint.x ?? null;
  return {
    ...rails,
    shape,
    cabin,
    bumperX: g.bumperX,
    tailX: g.tailX,
    wheelbase: g.wheelbase,
    archZ,
    arches,
    secondRowX: secondRow,
    density,
  };
}
