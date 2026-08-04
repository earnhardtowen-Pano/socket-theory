import type { ControlId, SolveResult } from '@pkgprop/core';
import type { Action } from '../state/store.js';
import { WallChip } from './WallChip.js';

const LABELS: Record<ControlId, string> = {
  front_overhang: 'front overhang',
  h30: 'seat height H30',
  heel_x: 'heel station',
  roof_z: 'roof height',
  cowl_z: 'cowl height',
  hood_z: 'hood height',
  header_x: 'header station',
  belt_z: 'belt height',
  wheelbase: 'wheelbase',
  rear_overhang: 'rear overhang',
  deck_z: 'deck height',
  overall_width: 'overall width',
  rocker_z: 'rocker height',
};

export const CONTROL_LABELS = LABELS;

/**
 * A fraction-of-live-bounds slider (the seed contract). The position is a
 * fraction; the band re-derives every solve; pushing into a wall turns the
 * thumb accent and prints the wall's name, license, and reason.
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
  return (
    <div className="control" data-testid={`control-${id}`}>
      <div className="control-head">
        <span className="control-name">{LABELS[id]}</span>
        <span className="control-value">
          {Math.round(placed.value)}
          <span className="unit">mm</span>
        </span>
      </div>
      <div className="track-wrap">
        <input
          type="range"
          min={0}
          max={1000}
          value={Math.round(placed.fraction * 1000)}
          className={touching ? 'touching' : ''}
          aria-label={LABELS[id]}
          onChange={(e) =>
            dispatch({
              type: 'set-control',
              id,
              fraction: Number(e.currentTarget.value) / 1000,
              commit: false,
            })
          }
          onPointerUp={(e) =>
            dispatch({
              type: 'set-control',
              id,
              fraction: Number(e.currentTarget.value) / 1000,
              commit: true,
            })
          }
          onKeyUp={(e) =>
            dispatch({
              type: 'set-control',
              id,
              fraction: Number(e.currentTarget.value) / 1000,
              commit: true,
            })
          }
        />
      </div>
      <div className="band-note">
        <span>{lo ? `${Math.round(lo.value)} · ${lo.constraint.label}` : '—'}</span>
        <span>{hi ? `${hi.constraint.label} · ${Math.round(hi.value)}` : '—'}</span>
      </div>
      {touching && <WallChip wall={touching.wall} side={touching.side} result={result} />}
    </div>
  );
}
