import { CONTROL_IDS, type SolveResult } from '@pkgprop/core';
import { ARCHITECTURES, SEATING_CONFIGS, TIRE_CHOICES } from '@pkgprop/data';
import type { Action } from '../state/store.js';
import type { PackageState } from '@pkgprop/data';
import { ControlSlider } from './ControlSlider.js';

/** The PACKAGE panel: what the car is, then every control the package owns. */
export function PackageRail({
  pkg,
  result,
  dispatch,
}: {
  pkg: PackageState;
  result: SolveResult;
  dispatch: React.Dispatch<Action>;
}) {
  const tire = pkg.tire ?? ARCHITECTURES.find((a) => a.id === pkg.architecture)?.tire;
  return (
    <div className="rail" data-testid="package-rail">
      <div className="section-label">ARCHITECTURE</div>
      <div className="choice-row">
        {ARCHITECTURES.map((a) => (
          <button
            key={a.id}
            className={`chip ${a.id === pkg.architecture ? 'active' : ''}`}
            title={a.description}
            onClick={() => dispatch({ type: 'set-architecture', id: a.id })}
          >
            {a.label}
          </button>
        ))}
      </div>
      <div className="section-label">SEATS</div>
      <div className="choice-row">
        {SEATING_CONFIGS.map((s) => (
          <button
            key={s.id}
            className={`chip ${s.id === pkg.seating ? 'active' : ''}`}
            title={s.label}
            onClick={() => dispatch({ type: 'set-seating', id: s.id })}
          >
            {s.id}
          </button>
        ))}
      </div>
      <div className="section-label">TIRE</div>
      <div className="choice-row">
        <select
          value={tire}
          aria-label="tire designation"
          onChange={(e) => dispatch({ type: 'set-tire', designation: e.currentTarget.value })}
          style={{ font: 'inherit', width: '100%', border: '1px solid var(--line)', background: '#fff', padding: '3px 6px' }}
        >
          {[...new Set([tire, ...TIRE_CHOICES])].filter(Boolean).map((t) => (
            <option key={t} value={t as string}>
              {t}
            </option>
          ))}
        </select>
      </div>
      <div className="section-label">CONTROLS — fractions of live bounds</div>
      {CONTROL_IDS.map((id) => (
        <ControlSlider key={id} id={id} result={result} dispatch={dispatch} />
      ))}
    </div>
  );
}
