import { batterySlab, rearOverhangBound, rearPowertrainBox, wheelbaseBound } from './constraints/chassis.js';
import type { Ctx, Pt } from './constraints/ctx.js';
import { buildEnvelope, type Envelope } from './constraints/envelope.js';
import { buildPlanEnvelope, widthBound, type PlanEnvelope } from './constraints/plan.js';
import { eyePoint, placeOccupants, roofBound, type OccupantRow } from './constraints/occupants.js';
import {
  floorHeight,
  frontOverhangBound,
  frontPowertrainBox,
  h30Bound,
  heelBound,
  rockerBound,
  type Box,
} from './constraints/structure.js';
import { tireGeometry } from './constraints/tires.js';
import {
  beltBound,
  cowlBound,
  deckBound,
  groundSightActual,
  hoodBound,
} from './constraints/vision.js';
import { headerBound, rakeReadouts } from './constraints/windshield.js';
import type { Readout } from './derived.js';
import { Readouts } from './derived.js';
import { ContributionSet, placeControl, type Bound, type Conflict, type PlacedControl } from './graph.js';
import type { ControlId, SolveInput } from './inputs.js';
import type { Param } from './license.js';
import { Registry } from './registry.js';

/**
 * solve(state) → the buildable space and its hard points.
 *
 * Deterministic, one pass, dependency order. Controls are placed as
 * fractions of their live bands as soon as each band is known, and placed
 * values feed the bands that come after — so a moved cowl really does move
 * the hood ceiling, live. The solver closes constraints and halts; it never
 * draws the car.
 */

/** Defaults chosen for the ten-minute test: a sane car with no touching walls. */
const DEFAULT_CONTROLS: Record<ControlId, number> = {
  front_overhang: 0.35,
  h30: 0.4,
  heel_x: 0.15,
  roof_z: 0.15,
  cowl_z: 0.85,
  hood_z: 0.5,
  header_x: 0.7,
  belt_z: 0.4,
  wheelbase: 0.35,
  rear_overhang: 0.35,
  deck_z: 0.3,
  overall_width: 0.4,
  rocker_z: 0.3,
};

export interface SideGeometry {
  readonly bumperX: number;
  readonly tailX: number;
  readonly wheelbase: number;
  readonly tireRadius: number;
  readonly floorZ: number;
  readonly roofZ: number;
  readonly hoodZ: number;
  readonly beltZ: number;
  readonly deckZ: number;
  readonly cowl: Pt;
  readonly header: Pt;
  readonly eye: Pt;
  readonly occupants: readonly OccupantRow[];
  readonly frontBox: Box | null;
  readonly rearBox: Box | null;
  readonly battery: Box | null;
  readonly overallWidth: number;
  readonly track: number;
  readonly rockerZ: number;
}

export interface SolveResult {
  readonly params: readonly Param[];
  readonly counts: ReturnType<Registry['counts']>;
  readonly bounds: Readonly<Record<ControlId, Bound>>;
  readonly controls: Readonly<Record<ControlId, PlacedControl>>;
  readonly conflicts: readonly Conflict[];
  readonly readouts: readonly Readout[];
  readonly geometry: SideGeometry;
  readonly envelope: Envelope;
  readonly plan: PlanEnvelope;
}

export function solve(input: SolveInput): SolveResult {
  const reg = new Registry();
  reg.defineAll(input.architecture.params);
  reg.defineAll(input.seating.params);
  reg.defineAll(input.tireParams);
  if (input.globalParams) reg.defineAll(input.globalParams);
  for (const [id, v] of Object.entries(input.overrides ?? {})) {
    reg.override(id, v);
  }

  const cs = new ContributionSet(reg);
  const out = new Readouts(reg);
  const ctx: Ctx = { reg, cs, out, arch: input.architecture, seating: input.seating };

  const fr = (id: ControlId): number =>
    input.controls?.[id] ?? DEFAULT_CONTROLS[id];

  const bounds = {} as Record<ControlId, Bound>;
  const controls = {} as Record<ControlId, PlacedControl>;
  const place = (id: ControlId, bound: Bound): PlacedControl => {
    bounds[id] = bound;
    const placed = placeControl(bound, fr(id));
    controls[id] = placed;
    return placed;
  };

  // 1 — wheels and floor
  const tire = tireGeometry(ctx);
  const floorZ = floorHeight(ctx);

  // 2 — nose
  const frontOverhang = place('front_overhang', frontOverhangBound(ctx));
  const frontBox = frontPowertrainBox(ctx, frontOverhang);

  // 3 — driver
  const h30 = place('h30', h30Bound(ctx));
  const heel = place('heel_x', heelBound(ctx, frontOverhang, h30.value));
  const occupants = placeOccupants(ctx, heel.value, h30.value);
  const row1 = occupants[0];
  if (!row1) throw new Error('Seating configuration has no rows.');
  const eye = eyePoint(ctx, row1);

  // 4 — roof over every head
  const roof = place('roof_z', roofBound(ctx, heel.value, h30.value));

  // 5 — cowl under the sight line
  const cowlX = out.derive(
    'cowl_x',
    'cowl station',
    'mm',
    'driver heel station minus the cowl setback',
    () => heel.value - reg.value('structure_cowl_ahead_of_heel'),
  );
  const cowl = place('cowl_z', cowlBound(ctx, eye, cowlX));
  const cowlPt: Pt = { x: cowlX, z: cowl.value };
  groundSightActual(ctx, eye, cowlPt);

  // 6 — hood between the hardware and the sight line
  const hood = place('hood_z', hoodBound(ctx, eye, cowlPt, frontBox, 0));

  // 7 — glass between upright and head tangency
  const header = place('header_x', headerBound(ctx, cowlPt, row1.headCenter, roof.value));
  rakeReadouts(ctx, cowlPt, row1.headCenter, header.value, roof.value);

  // 8 — belt between door stack and eye
  const belt = place('belt_z', beltBound(ctx, eye, row1.hpoint.z));

  // 9 — the tail
  const wheelbase = place('wheelbase', wheelbaseBound(ctx, heel.value, h30.value));
  const rearOverhang = place('rear_overhang', rearOverhangBound(ctx));
  const tailX = wheelbase.value + rearOverhang.value;
  const deck = place('deck_z', deckBound(ctx, eye, tailX));
  const rearBox = rearPowertrainBox(ctx, wheelbase.value, rearOverhang.value);
  const battery = batterySlab(ctx, wheelbase.value);
  const width = place('overall_width', widthBound(ctx, occupants));
  const rocker = place('rocker_z', rockerBound(ctx));

  // 10 — the buildable space
  const bumperX = -frontOverhang.value;
  const envelope = buildEnvelope(ctx, {
    eye,
    cowl: cowlPt,
    headerX: header.value,
    roofZ: roof.value,
    bumperX,
    tailX,
    wheelbase: wheelbase.value,
    occupants,
    frontBox,
    rearBox,
  });
  const plan = buildPlanEnvelope(ctx, bumperX, tailX, wheelbase.value, occupants);

  out.derive(
    'overall_length',
    'overall length',
    'mm',
    'front overhang plus wheelbase plus rear overhang',
    () => frontOverhang.value + wheelbase.value + rearOverhang.value,
  );

  const geometry: SideGeometry = {
    bumperX,
    tailX,
    wheelbase: wheelbase.value,
    tireRadius: tire.radius,
    floorZ,
    roofZ: roof.value,
    hoodZ: hood.value,
    beltZ: belt.value,
    deckZ: deck.value,
    cowl: cowlPt,
    header: { x: header.value, z: roof.value },
    eye,
    occupants,
    frontBox,
    rearBox,
    battery,
    overallWidth: width.value,
    track: reg.value('chassis_track'),
    rockerZ: rocker.value,
  };

  return {
    params: reg.list(),
    counts: reg.counts(),
    bounds,
    controls,
    conflicts: [...cs.conflicts(), ...envelope.conflicts],
    readouts: out.all(),
    geometry,
    envelope,
    plan,
  };
}
