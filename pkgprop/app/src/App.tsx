import { useEffect, useRef, useState } from 'react';
import {
  clampLinePoint,
  denorm,
  frameOf,
  LINE_DEFS,
  linePoints,
  norm,
  type LineId,
} from './state/lines.js';
import { useApp, type PanelId, type Snapshot } from './state/store.js';
import { ConflictBar } from './ui/ConflictBar.js';
import { Ledger } from './ui/Ledger.js';
import { PackageRail } from './ui/PackageRail.js';
import { PlanView } from './ui/PlanView.js';
import { ReadoutStrip } from './ui/ReadoutStrip.js';
import { SideView } from './ui/SideView.js';

const PANELS: PanelId[] = ['PACKAGE', 'SIDE', 'SECTIONS', 'BODY', 'BOUNCE', 'LEDGER'];

export default function App() {
  const { state, dispatch, result } = useApp();
  const [selected, setSelected] = useState<{ line: LineId; index: number } | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') {
        if (e.key === 'Escape') (e.target as HTMLElement).blur();
        return;
      }
      if (e.key === 'l' || e.key === 'L') dispatch({ type: 'ledger', open: !state.ledgerOpen });
      else if (e.key === 'Escape') dispatch({ type: 'ledger', open: false });
      else if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        dispatch({ type: 'undo' });
      } else if ((e.metaKey || e.ctrlKey) && (e.key === 'Z' || (e.shiftKey && e.key === 'z'))) {
        e.preventDefault();
        dispatch({ type: 'redo' });
      } else if (selected && e.key.startsWith('Arrow')) {
        e.preventDefault();
        const def = LINE_DEFS.find((d) => d.id === selected.line);
        if (!def) return;
        const frame = frameOf(result);
        const pts = linePoints(selected.line, state.now.drawing, result);
        const p = pts[selected.index];
        if (!p) return;
        const step = e.shiftKey ? 25 : 5;
        const { x, z } = denorm(frame, p);
        const nx = x + (e.key === 'ArrowRight' ? step : e.key === 'ArrowLeft' ? -step : 0);
        const nz = z + (e.key === 'ArrowUp' ? step : e.key === 'ArrowDown' ? -step : 0);
        const c = clampLinePoint(def, result, nx, nz);
        dispatch({
          type: 'move-point',
          line: selected.line,
          index: selected.index,
          pt: norm(frame, c.x, c.z),
          commit: true,
        });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dispatch, state.ledgerOpen, state.now.drawing, selected, result]);

  const fileRef = useRef<HTMLInputElement | null>(null);
  const saveProject = () => {
    const blob = new Blob(
      [JSON.stringify({ format: 'pkgprop-project', version: 1, ...state.now }, null, 2)],
      { type: 'application/json' },
    );
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'car.pkgprop.json';
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const loadProject = async (file: File) => {
    const parsed = JSON.parse(await file.text()) as Partial<Snapshot> & { format?: string };
    if (parsed.format !== 'pkgprop-project' || !parsed.pkg) {
      alert('That file is not a pkgprop project.');
      return;
    }
    dispatch({ type: 'load', snapshot: { pkg: parsed.pkg, drawing: parsed.drawing ?? { lines: {} } } });
  };

  const c = result.counts;
  const panel = state.panel;

  return (
    <div className="app">
      <header className="header">
        <div className="brand">
          PKG→PROP <small>the solver closes; you draw</small>
        </div>
        <nav className="tabs">
          {PANELS.map((p) => (
            <button
              key={p}
              className={`tab ${panel === p ? 'active' : ''}`}
              onClick={() => dispatch({ type: 'panel', id: p })}
            >
              {p}
            </button>
          ))}
        </nav>
        <div className="header-right">
          <button className="chip" onClick={saveProject} data-testid="save-project">
            save
          </button>
          <button className="chip" onClick={() => fileRef.current?.click()}>
            load
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".json"
            style={{ display: 'none' }}
            onChange={(e) => {
              const f = e.currentTarget.files?.[0];
              if (f) void loadProject(f);
              e.currentTarget.value = '';
            }}
          />
          <span className="counts" data-testid="license-counts">
            <span>
              <b>{c.ASSUMED}</b> assumed
            </span>
            <span>
              <b>{c.SOURCED}</b> sourced
            </span>
            <span>
              <b>{result.readouts.length}</b> derived
            </span>
          </span>
          {result.conflicts.length > 0 ? (
            <span className="conflict-flag" data-testid="conflict-count">
              {result.conflicts.length} CONFLICT{result.conflicts.length > 1 ? 'S' : ''}
            </span>
          ) : (
            <span className="ok-flag">closed · 0 conflicts</span>
          )}
        </div>
      </header>
      <div className="main">
        <PackageRail pkg={state.now.pkg} result={result} dispatch={dispatch} />
        <div className="stage">
          <ConflictBar result={result} />
          <div className="views">
            {(panel === 'SIDE' || panel === 'PACKAGE' || panel === 'LEDGER') && (
              <>
                <SideView
                  result={result}
                  drawing={state.now.drawing}
                  dispatch={dispatch}
                  selected={selected}
                  onSelect={setSelected}
                />
                <PlanView result={result} drawing={state.now.drawing} dispatch={dispatch} />
              </>
            )}
            {panel === 'SECTIONS' && (
              <div className="placeholder">
                <h2>SECTIONS</h2>
                <p>
                  Half-sections at stations, clipped live to the envelope, feeding the loft.
                  Arrives at gate 2 — not built yet, and it will say so until it is.
                </p>
              </div>
            )}
            {panel === 'BODY' && (
              <div className="placeholder">
                <h2>BODY</h2>
                <p>
                  The lofted surface under a zebra shader, with the two verbs — shutline and
                  inset. Arrives at gate 2. Class-A surfacing is out of scope for V1.
                </p>
              </div>
            )}
            {panel === 'BOUNCE' && (
              <div className="placeholder">
                <h2>BOUNCE</h2>
                <p>
                  Watertight check, scale presets, print report, 3MF / STL / glTF export.
                  Arrives at gate 3.
                </p>
              </div>
            )}
          </div>
          <ReadoutStrip result={result} />
          <div className="hint-bar">
            drag points · sliders are fractions of live bounds · L ledger · ctrl+Z undo ·
            walls name themselves on contact
          </div>
          {state.ledgerOpen && <Ledger result={result} pkg={state.now.pkg} dispatch={dispatch} />}
        </div>
      </div>
    </div>
  );
}
