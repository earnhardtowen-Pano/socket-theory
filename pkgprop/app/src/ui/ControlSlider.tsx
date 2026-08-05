import type { ControlId, SolveResult } from '@pkgprop/core';
import type { Action } from '../state/store.js';
import { Scrub } from './ds/Scrub.js';
import { WallChip } from './WallChip.js';

const LABELS: Record<ControlId, string> = {
  front_overhang: 'front overhang',
  h30: 'seat height H30',
  heel_x: 'heel station',
  roof_z: 'roof height',
  cowl_z: 'cowl height',
  hood_z: 'hood height',
  header_x: 'header station',
  belt_z: 'beltline height',
  wheelbase: 'wheelbase',
  rear_overhang: 'rear overhang',
  deck_z: 'decklid height',
  overall_width: 'overall width',
  rocker_z: 'rocker height',
};

export const CONTROL_LABELS = LABELS;

/**
 * A package control, scrubbed in millimetres.
 *
 * The value is stored as a fraction of the live band — that is what lets a
 * pose survive a package change — but nobody thinks in fractions. So the
 * scrubber works in millimetres and converts at the edge, which means the
 * number you drag is the number on the drawing, and the walls show up on the
 * meter as the millimetre positions they actually are.
 */
export function ControlSlider({
  id,
  result,
  dispatch,
}: {
  id: ControlId;
  result: SolveResult;
  dispatch: React.Dispatch<Action>;
}) {
  const bound = result.bounds[id];
  const placed = result.controls[id];
  if (!bound || !placed) return null;
  const lo = bound.lower;
  const hi = bound.upper;
  const touching = placed.touching;
  const min = lo?.value ?? placed.value;
  const max = hi?.value ?? placed.value;
  const span = Math.max(1e-9, max - min);

  const send = (mm: number, commit: boolean): void =>
    dispatch({ type: 'set-control', id, fraction: (mm - min) / span, commit });

  const walls: { at: number; label: string; side: 'lower' | 'upper' }[] = [];
  if (lo) walls.push({ at: lo.value, label: lo.constraint.label, side: 'lower' });
  if (hi) walls.push({ at: hi.value, label: hi.constraint.label, side: 'upper' });

  return (
    <div className="control" data-testid={`control-${id}`}>
      <Scrub
        label={LABELS[id]}
        value={placed.value}
        min={min}
        max={max}
        unit="mm"
        walls={walls}
        {...(touching ? { touching: true } : {})}
        testid={`scrub-${id}`}
        onChange={send}
      />
      <div className="band-note">
        <span title={lo ? lo.constraint.reason : ''}>
          {lo ? `${Math.round(lo.value)} · ${lo.constraint.label}` : '—'}
        </span>
        <span title={hi ? hi.constraint.reason : ''}>
          {hi ? `${hi.constraint.label} · ${Math.round(hi.value)}` : '—'}
        </span>
      </div>
      {touching && <WallChip wall={touching.wall} side={touching.side} result={result} />}
    </div>
  );
}
