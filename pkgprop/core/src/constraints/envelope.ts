import type { Conflict } from '../graph.js';
import { CeilingProfile, FloorProfile, type Segment } from '../profile.js';
import { floorOf, tireRadiusOf } from './chains.js';
import type { Ctx, Pt } from './ctx.js';
import { M } from './metas.js';
import type { OccupantRow } from './occupants.js';
import type { Box } from './structure.js';
import { sightLineZ } from './vision.js';
import { headTangency } from './windshield.js';

/**
 * The buildable space — Law 2's floor plan. The floor profile is everything
 * the body must cover; the ceiling profile is everything it must stay under.
 * Every segment carries its constraint, so the drawing layer can clamp an
 * authored point and print exactly which wall pushed back.
 *
 * The solver never draws the car. This is the space the car is drawn on.
 */

export interface EnvelopeInputs {
  readonly eye: Pt;
  readonly cowl: Pt;
  readonly headerX: number;
  readonly roofZ: number;
  readonly bumperX: number;
  readonly tailX: number;
  readonly wheelbase: number;
  readonly occupants: readonly OccupantRow[];
  readonly frontBox: Box | null;
  readonly rearBox: Box | null;
}

export interface Envelope {
  readonly floor: FloorProfile;
  readonly ceiling: CeilingProfile;
  /** Floor for centerline surfaces: hard masses, heads, glass tangent, cargo. */
  readonly floorCenter: FloorProfile;
  /** Floor for outboard surfaces (fenders, rocker): the wheels are the only
   *  hard mass out there — the engine sits inboard of a fender line. */
  readonly floorOutboard: FloorProfile;
  /** Stations where the floor rises above the ceiling: nothing is buildable. */
  readonly conflicts: readonly Conflict[];
}

export function buildEnvelope(ctx: Ctx, e: EnvelopeInputs): Envelope {
  const r = ctx.reg;
  const floorSegs: Segment[] = [];
  const outboardSegs: Segment[] = [];
  const ceilSegs: Segment[] = [];

  const tireR = tireRadiusOf(r);
  const jounce = r.value('body_tire_jounce');
  const arcR = tireR + jounce;

  // Wheels and their travel bind every lane — fenders most of all.
  outboardSegs.push({
    kind: 'arc', cx: 0, cz: tireR, r: arcR,
    x0: -arcR, x1: arcR, constraint: M.tireClearance,
  });
  outboardSegs.push({
    kind: 'arc', cx: e.wheelbase, cz: tireR, r: arcR,
    x0: e.wheelbase - arcR, x1: e.wheelbase + arcR, constraint: M.tireClearance,
  });

  // ...the hard masses plus their air gaps...
  const hoodGap = r.value('body_hood_clearance');
  if (e.frontBox) {
    floorSegs.push({
      kind: 'line', x0: e.frontBox.x0, x1: e.frontBox.x1,
      z0: e.frontBox.z1 + hoodGap, z1: e.frontBox.z1 + hoodGap,
      constraint: M.hoodOverPowertrain,
    });
  }
  if (e.rearBox) {
    floorSegs.push({
      kind: 'line', x0: e.rearBox.x0, x1: e.rearBox.x1,
      z0: e.rearBox.z1 + hoodGap, z1: e.rearBox.z1 + hoodGap,
      constraint: M.engineUnderDeck,
    });
  }

  // ...every occupant's head sphere plus roof structure...
  const headRoom = r.value('anthro_headroom_clearance') + r.value('body_roof_stack');
  for (const row of e.occupants) {
    const rr = r.value('anthro_head_radius') + headRoom;
    floorSegs.push({
      kind: 'arc', cx: row.headCenter.x, cz: row.headCenter.z, r: rr,
      x0: row.headCenter.x - rr, x1: row.headCenter.x + rr,
      constraint: M.occupantRoof(row.row),
    });
  }

  // ...the glass tangent over the driver's head, cowl to header...
  const clearance = r.value('anthro_head_radius') + r.value('glass_head_clearance');
  const row1 = e.occupants[0];
  if (row1 && e.headerX > e.cowl.x) {
    const t = headTangency(e.cowl, row1.headCenter, clearance);
    if (!t.impossible && t.angleRad > 0 && t.angleRad < Math.PI / 2) {
      const slope = Math.tan(t.angleRad);
      floorSegs.push({
        kind: 'line', x0: e.cowl.x, x1: e.headerX,
        z0: e.cowl.z, z1: e.cowl.z + slope * (e.headerX - e.cowl.x),
        constraint: M.headTangency,
      });
    }
  }

  // ...and the cargo hold, when the tail carries no engine.
  if (!e.rearBox || ctx.arch.powertrain === 'under-floor') {
    ctxCargo(ctx, e, floorSegs);
  }

  // Ceiling: the forward sight line from the eye over the cowl to the road...
  {
    const dz = e.eye.z - e.cowl.z;
    if (dz > 0) {
      const groundX = e.eye.x - (e.eye.z * (e.eye.x - e.cowl.x)) / dz;
      ceilSegs.push({
        kind: 'line', x0: e.bumperX, x1: e.cowl.x,
        z0: sightLineZ(e.eye, groundX, e.bumperX), z1: e.cowl.z,
        constraint: M.sightOverHood,
      });
    }
  }

  // ...the owner's height target over the whole car...
  {
    const h = r.value('style_overall_height_max');
    ceilSegs.push({
      kind: 'line', x0: e.bumperX, x1: e.tailX, z0: h, z1: h,
      constraint: M.styleHeight,
    });
  }

  // ...and the rearward sight line over the opaque deck. The backlight
  // transmits the view, so the ceiling begins where the glass ends.
  {
    const last = e.occupants[e.occupants.length - 1];
    if (last) {
      const backlightX = last.hpoint.x + r.value('glass_backlight_aft_of_last_hip');
      const groundX = e.eye.x + r.value('vision_rear_ground_sight');
      if (backlightX < e.tailX) {
        ceilSegs.push({
          kind: 'line', x0: backlightX, x1: e.tailX,
          z0: sightLineZ(e.eye, groundX, backlightX), z1: sightLineZ(e.eye, groundX, e.tailX),
          constraint: M.sightOverDeck,
        });
      }
    }
  }

  const floor = new FloorProfile([...floorSegs, ...outboardSegs]);
  const ceiling = new CeilingProfile(ceilSegs);
  return {
    floor,
    ceiling,
    floorCenter: new FloorProfile([...floorSegs, ...outboardSegs]),
    floorOutboard: new FloorProfile(outboardSegs),
    conflicts: scanConflicts(floor, ceiling),
  };
}

function ctxCargo(ctx: Ctx, e: EnvelopeInputs, floorSegs: Segment[]): void {
  const r = ctx.reg;
  const z = floorOf(r, ctx.arch) + r.value('cargo_deck_height');
  floorSegs.push({
    kind: 'line', x0: e.wheelbase, x1: e.tailX, z0: z, z1: z,
    constraint: M.cargoUnderDeck,
  });
}

/**
 * The hood scan, generalized: walk every segment boundary and check the
 * floor still fits under the ceiling. A crossing names both walls.
 */
function scanConflicts(floor: FloorProfile, ceiling: CeilingProfile): Conflict[] {
  const stations = new Set<number>();
  for (const s of [...floor.segments, ...ceiling.segments]) {
    stations.add(s.x0);
    stations.add(s.x1);
    if (s.kind === 'arc') stations.add(s.cx);
  }
  const out: Conflict[] = [];
  for (const x of [...stations].sort((a, b) => a - b)) {
    const f = floor.at(x);
    const c = ceiling.at(x);
    if (f && c && f.z > c.z) {
      out.push({
        quantity: `buildable space at x=${Math.round(x)}`,
        lower: { value: f.z, constraint: f.constraint, chain: [], assumedKnobs: [] },
        upper: { value: c.z, constraint: c.constraint, chain: [], assumedKnobs: [] },
        overlap: f.z - c.z,
        resolvers: [],
      });
    }
  }
  // Adjacent stations pinched by the same pair collapse to one report.
  const seen = new Set<string>();
  return out.filter((k) => {
    const key = `${k.lower.constraint.id}|${k.upper.constraint.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
