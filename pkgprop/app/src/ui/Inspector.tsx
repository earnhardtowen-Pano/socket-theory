import type { SolveResult } from '@pkgprop/core';
import { generateFeature, defOf, labelOf } from '../model/features.js';
import { LINE_DEFS, lineTension, linePoints, type DrawingState } from '../state/lines.js';
import { ADDABLE } from '../model/features.js';
import { Scrub } from './ds/Scrub.js';
import type { Action, Selection, Snapshot } from '../state/store.js';

/**
 * The inspector shows what is in your hand, and nothing else.
 *
 * With nothing selected it shows the package — what the car is. Select a
 * feature and it shows that feature's own parameters in the language of the
 * trade. This is why the thirteen-slider wall is gone without a single
 * control being lost: the panel's size now tracks what you are touching, not
 * what the program can do.
 */
export function Inspector({
  snapshot,
  selection,
  result,
  dispatch,
  children,
}: {
  snapshot: Snapshot;
  selection: Selection;
  result: SolveResult;
  dispatch: React.Dispatch<Action>;
  /** The package panel, shown when nothing is selected. */
  children: React.ReactNode;
}) {
  if (!selection) {
    return (
      <div className="rail" data-testid="inspector">
        <div className="inspect-head">
          <span className="inspect-title">PACKAGE</span>
          <span className="inspect-blurb">what the car is · click a part to shape it</span>
        </div>
        {children}
      </div>
    );
  }

  if (selection.kind === 'feature') {
    const feature = snapshot.features[selection.id];
    if (!feature) return null;
    const def = defOf(feature.kind);
    const geo = generateFeature(feature, result);
    return (
      <div className="rail" data-testid="inspector">
        <div className="inspect-head">
          <button className="inspect-back" onClick={() => dispatch({ type: 'select', selection: null })}>
            ←
          </button>
          <span className="inspect-title">{labelOf(feature)}</span>
          <span className="inspect-blurb">{def.blurb}</span>
        </div>
        {geo.binding && (
          <div className="wall-chip" data-testid="feature-wall-chip">
            <span className="who">{geo.binding.constraint.label}</span>
            <span className={`tag ${geo.binding.constraint.license}`}>
              {geo.binding.constraint.license}
            </span>
            <div className="why">{geo.binding.constraint.reason}</div>
          </div>
        )}
        {def.params.map((spec) => {
          const value = feature.params[spec.key] ?? 0;
          return (
            <div className="control param" key={spec.key} data-testid={`param-${spec.key}`}>
              <Scrub
                label={spec.label}
                value={value}
                min={spec.min}
                max={spec.max}
                decimals={spec.unit === 'ratio' ? 2 : 0}
                {...(spec.unit === 'ratio' ? {} : { unit: spec.unit })}
                hint={spec.hint}
                testid={`scrub-${spec.key}`}
                onChange={(v, commit) =>
                  dispatch({
                    type: 'set-feature-param',
                    id: feature.id,
                    key: spec.key,
                    value: v,
                    commit,
                  })
                }
              />
            </div>
          );
        })}
        <div className="inspect-foot">
          <button className="chip" onClick={() => dispatch({ type: 'reset-feature', id: feature.id })}>
            reset this part
          </button>
          {ADDABLE.some((a) => a.kind === feature.kind) && (
            <button
              className="chip"
              data-testid="remove-part"
              onClick={() => dispatch({ type: 'remove-feature', id: feature.id })}
            >
              remove
            </button>
          )}
        </div>
      </div>
    );
  }

  // A drawn line: freeform by nature, so the inspector offers its curve and
  // its points rather than pretending it has parameters it does not have.
  const def = LINE_DEFS.find((d) => d.id === selection.id);
  if (!def) return null;
  const pts = linePoints(selection.id, snapshot.drawing as DrawingState, result);
  const tension = lineTension(selection.id, snapshot.drawing as DrawingState);
  return (
    <div className="rail" data-testid="inspector">
      <div className="inspect-head">
        <button className="inspect-back" onClick={() => dispatch({ type: 'select', selection: null })}>
          ←
        </button>
        <span className="inspect-title">{def.label}</span>
        <span className="inspect-blurb">
          a drawn line · {pts.length} points
          {selection.point !== null ? ` · point ${selection.point + 1} held` : ''}
        </span>
      </div>
      <div className="control param">
        <Scrub
          label="curve"
          value={tension}
          min={0}
          max={1}
          decimals={2}
          display={tension < 0.05 ? 'straight' : tension > 0.95 ? 'full' : tension.toFixed(2)}
          testid="scrub-curve"
          onChange={(v, commit) =>
            dispatch({ type: 'set-tension', line: def.id, tension: v, commit })
          }
        />
      </div>
      <div className="param-hint block">
        double-click the line to add a point · alt-click a point to remove it · arrows nudge
      </div>
      <div className="inspect-foot">
        <button className="chip" onClick={() => dispatch({ type: 'reset-line', line: def.id })}>
          reset this line
        </button>
      </div>
    </div>
  );
}
