import type { ControlId, License, SolveResult } from '@pkgprop/core';
import type { Action } from '../state/store.js';
import { WallChip } from './WallChip.js';

const LABELS: Record<ControlId, string> = {
  front_overhang: 'front overhang',
  h30: 'seat height H30',
  heel_x: 'heel station',
  roof_z: 'roof height',
  cowl_z: 'cowl height',
  hood_z: 'hood height',
  header_x: 'header station (A-pillar top)',
  belt_z: 'beltline height',
  wheelbase: 'wheelbase',
  rear_overhang: 'rear overhang',
  deck_z: 'decklid height',
  overall_width: 'overall width',
  rocker_z: 'rocker height',
};

export const CONTROL_LABELS = LABELS;

const licenseVar: Record<License, string> = {
  DERIVED: 'var(--derived)',
  SOURCED: 'var(--sourced)',
  ASSUMED: 'var(--assumed)',
};

/**
 * A fraction-of-live-bounds slider drawn as an instrument track: the band
 * to scale, a wall post at each end colored by the wall's license, ticks,
 * and a thumb that goes accent on contact. A native range input rides
 * invisibly on top so keyboard, pointer, and tests all speak to the real
 * control.
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
  const W = 272;
  const H = 26;
  const PAD = 5;
  const trackW = W - PAD * 2;
  const x = PAD + placed.fraction * trackW;
  const mid = H / 2;

  const send = (fraction: number, commit: boolean) =>
    dispatch({ type: 'set-control', id, fraction, commit });

  return (
    <div className="control" data-testid={`control-${id}`}>
      <div className="control-head">
        <span className="control-name">{LABELS[id]}</span>
        <span className="control-value">
          {Math.round(placed.value)}
          <span className="unit">mm</span>
        </span>
      </div>
      <div className="track-wrap" style={{ height: H }}>
        <svg className="track-svg" viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
          {/* band */}
          <line x1={PAD} y1={mid} x2={W - PAD} y2={mid} className="track-band" />
          {/* ticks at tenths */}
          {Array.from({ length: 9 }, (_, i) => {
            const tx = PAD + ((i + 1) * trackW) / 10;
            return <line key={i} x1={tx} y1={mid - 2.5} x2={tx} y2={mid + 2.5} className="track-tick" />;
          })}
          {/* wall posts, colored by the wall's license */}
          {lo && (
            <g style={{ color: touching?.side === 'lower' ? 'var(--accent)' : licenseVar[lo.constraint.license] }}>
              <line x1={PAD} y1={mid - 7} x2={PAD} y2={mid + 7} className="track-post" />
              <rect x={PAD - 2} y={mid - 7} width={4} height={4} className="track-post-cap" />
            </g>
          )}
          {hi && (
            <g style={{ color: touching?.side === 'upper' ? 'var(--accent)' : licenseVar[hi.constraint.license] }}>
              <line x1={W - PAD} y1={mid - 7} x2={W - PAD} y2={mid + 7} className="track-post" />
              <rect x={W - PAD - 2} y={mid - 7} width={4} height={4} className="track-post-cap" />
            </g>
          )}
          {/* thumb */}
          <rect
            x={x - 5}
            y={mid - 5}
            width={10}
            height={10}
            className={`track-thumb ${touching ? 'touching' : ''}`}
          />
        </svg>
        <input
          type="range"
          min={0}
          max={1000}
          value={Math.round(placed.fraction * 1000)}
          className={touching ? 'touching' : ''}
          aria-label={LABELS[id]}
          onChange={(e) => send(Number(e.currentTarget.value) / 1000, false)}
          onPointerUp={(e) => send(Number(e.currentTarget.value) / 1000, true)}
          onKeyUp={(e) => send(Number(e.currentTarget.value) / 1000, true)}
        />
      </div>
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
