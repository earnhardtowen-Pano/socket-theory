import type { SolveResult } from '@pkgprop/core';
import type { PackageState } from '@pkgprop/data';
import { useState } from 'react';
import type { Action } from '../state/store.js';

/**
 * THE LEDGER — every number in the instrument, tagged. ASSUMED values edit
 * in place and propagate through the graph live. One keystroke away from
 * anywhere (L).
 */
export function Ledger({
  result,
  pkg,
  dispatch,
}: {
  result: SolveResult;
  pkg: PackageState;
  dispatch: React.Dispatch<Action>;
}) {
  const c = result.counts;
  const groups = [
    { title: `ASSUMED — ${c.ASSUMED} adjustable guesses`, items: result.params.filter((p) => p.license === 'ASSUMED') },
    { title: `SOURCED — ${c.SOURCED} named sources`, items: result.params.filter((p) => p.license === 'SOURCED') },
    { title: `DERIVED — ${result.readouts.length} computed live`, items: [] },
  ];
  return (
    <div className="ledger" data-testid="ledger">
      <div className="ledger-head">
        <span>LEDGER</span>
        <span style={{ opacity: 0.7 }}>
          {c.ASSUMED} assumed · {c.SOURCED} sourced · {result.readouts.length} derived
          {c.pending > 0 ? ` · ${c.pending} pending sources` : ''}
        </span>
        <button className="close" onClick={() => dispatch({ type: 'ledger', open: false })}>
          esc
        </button>
      </div>
      {groups[0] && (
        <>
          <div className="ledger-section">{groups[0].title}</div>
          {groups[0].items.map((p) => (
            <AssumedRow
              key={p.id}
              id={p.id}
              label={p.label}
              unit={p.unit}
              value={p.effective}
              overridden={p.overridden}
              note={p.note}
              range={p.range}
              pending={p.pending}
              dispatch={dispatch}
            />
          ))}
        </>
      )}
      {groups[1] && (
        <>
          <div className="ledger-section">{groups[1].title}</div>
          {groups[1].items.map((p) => (
            <div className="ledger-row" key={p.id}>
              <span className="name">{p.label}</span>
              <span className="value">
                {p.effective} <span style={{ color: 'var(--ink-soft)' }}>{p.unit}</span>
              </span>
              <span className={`tag SOURCED`}>SRC</span>
              <span className="meta">{p.pending ? 'SOURCED-PENDING — owner to verify' : p.source}</span>
            </div>
          ))}
        </>
      )}
      <div className="ledger-section">{groups[2]!.title}</div>
      {result.readouts.map((r) => (
        <div className="ledger-row" key={r.id}>
          <span className="name">{r.label}</span>
          <span className="value">
            {Math.round(r.value * 10) / 10} <span style={{ color: 'var(--ink-soft)' }}>{r.unit}</span>
          </span>
          <span className="tag DERIVED">DRV</span>
          <span className="meta">{r.derivation}</span>
        </div>
      ))}
    </div>
  );
}

function AssumedRow({
  id,
  label,
  unit,
  value,
  overridden,
  note,
  range,
  pending,
  dispatch,
}: {
  id: string;
  label: string;
  unit: string;
  value: number;
  overridden: boolean;
  note: string | undefined;
  range: readonly [number, number] | undefined;
  pending: boolean | undefined;
  dispatch: React.Dispatch<Action>;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = (text: string) => {
    const v = Number(text);
    if (Number.isFinite(v) && v !== value) {
      const clamped = range ? Math.min(range[1], Math.max(range[0], v)) : v;
      dispatch({ type: 'set-override', id, value: clamped });
    }
    setDraft(null);
  };
  return (
    <div className="ledger-row" data-testid={`ledger-${id}`}>
      <span className="name">
        {label}
        {pending && <span className="pending"> PENDING</span>}
      </span>
      <input
        value={draft ?? String(value)}
        aria-label={label}
        onChange={(e) => setDraft(e.currentTarget.value)}
        onBlur={(e) => commit(e.currentTarget.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            commit(e.currentTarget.value);
            e.currentTarget.blur();
          }
          if (e.key === 'Escape') setDraft(null);
        }}
      />
      <span>
        <span className="tag ASSUMED">ASM</span>{' '}
        {overridden && (
          <button className="reset" title="back to the stock guess" onClick={() => dispatch({ type: 'set-override', id, value: null })}>
            reset
          </button>
        )}
      </span>
      <span className="meta">
        {unit}
        {range ? ` · ${range[0]}–${range[1]}` : ''} · {note ?? ''}
      </span>
    </div>
  );
}
