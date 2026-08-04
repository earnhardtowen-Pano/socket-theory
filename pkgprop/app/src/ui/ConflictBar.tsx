import type { SolveResult } from '@pkgprop/core';

/**
 * CONFLICT chips — a conflict never silently clamps. Each names both sides
 * and points at the ASSUMED knobs that could resolve it.
 */
export function ConflictBar({ result }: { result: SolveResult }) {
  if (result.conflicts.length === 0) return null;
  return (
    <div className="conflict-bar" data-testid="conflict-bar">
      {result.conflicts.map((k, i) => {
        const knobs = k.resolvers
          .map((id) => result.params.find((p) => p.id === id)?.label ?? id)
          .slice(0, 4);
        return (
          <div className="conflict-item" key={i}>
            <span className="vs">CONFLICT</span> {k.quantity}: “{k.lower.constraint.label}”
            needs {Math.round(k.lower.value)} but “{k.upper.constraint.label}” allows{' '}
            {Math.round(k.upper.value)} — short {Math.round(k.overlap)} mm.{' '}
            {knobs.length > 0 && <span className="fix">give ground with: {knobs.join(' · ')}</span>}
          </div>
        );
      })}
    </div>
  );
}
