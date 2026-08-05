import type { SolveResult, Wall } from '@pkgprop/core';

/**
 * The attribution chip — Law 3 on screen. Everything printed here is
 * computed from the winning contribution: name, license, reason, and the
 * ASSUMED knobs in its chain. No narration.
 */
export function WallChip({
  wall,
  side,
  result,
}: {
  wall: Wall;
  side: 'floor' | 'ceiling' | 'lower' | 'upper';
  result: SolveResult;
}) {
  const knobLabels = wall.assumedKnobs
    .map((id) => result.params.find((p) => p.id === id)?.label ?? id)
    .slice(0, 3);
  const dir = side === 'floor' || side === 'lower' ? 'holding it up' : 'holding it down';
  return (
    <div className="wall-chip" data-testid="wall-chip">
      <div>
        <span className="who">{wall.constraint.label}</span>
        <span className={`tag ${wall.constraint.license}`}>{wall.constraint.license}</span>
        <span style={{ marginLeft: 6, color: 'var(--ink-soft)' }}>{dir}</span>
      </div>
      <div className="why">{wall.constraint.reason}</div>
      {knobLabels.length > 0 && (
        <div className="knobs">give ground with: {knobLabels.join(' · ')}</div>
      )}
    </div>
  );
}
