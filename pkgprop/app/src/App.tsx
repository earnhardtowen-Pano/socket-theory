import { solve } from '@pkgprop/core';
import { buildSolveInput } from '@pkgprop/data';
import { useEffect, useRef, useState } from 'react';
import {
  clampLinePoint,
  DEFAULT_RENDER,
  denorm,
  frameOf,
  LINE_DEFS,
  linePoints,
  migrateDrawing,
  norm,
  type LineId,
} from './state/lines.js';
import { defaultFeatures, labelOf } from './model/features.js';
import { useApp, type PanelId, type Snapshot } from './state/store.js';
import { ConflictBar } from './ui/ConflictBar.js';
import { Ledger } from './ui/Ledger.js';
import { Inspector } from './ui/Inspector.js';
import { PackageRail } from './ui/PackageRail.js';
import { PlanView } from './ui/PlanView.js';
import { ReadoutStrip } from './ui/ReadoutStrip.js';
import { SideView } from './ui/SideView.js';
import { BodyView } from './ui/body/BodyView.js';
import { SectionsView } from './ui/SectionsView.js';
import { Toolbar } from './ui/Toolbar.js';
import { CameraProvider, useCamera } from './ui/viewport/ViewportSvg.js';

const PANELS: PanelId[] = ['PACKAGE', 'SIDE', 'SECTIONS', 'BODY', 'BOUNCE', 'LEDGER'];

export default function App() {
  return (
    <CameraProvider>
      <Shell />
    </CameraProvider>
  );
}

function Shell() {
  const { state, dispatch, result } = useApp();
  const { cam, requestFit } = useCamera();
  const selection = state.selection;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const tag = el?.tagName;
      const isRange = el instanceof HTMLInputElement && el.type === 'range';
      if ((tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') && !isRange) {
        if (e.key === 'Escape') el?.blur();
        return;
      }
      if (isRange && e.key.startsWith('Arrow')) return;
      if (e.key === 'l' || e.key === 'L') dispatch({ type: 'ledger', open: !state.ledgerOpen });
      else if (e.key === 'f' || e.key === 'F') requestFit();
      else if (e.key === 'Escape') {
        // Escape backs out one layer at a time: the ledger first, then
        // whatever is in your hand. Putting a part down is how the package
        // controls come back, so it needs a key and not only the back arrow.
        if (state.ledgerOpen) dispatch({ type: 'ledger', open: false });
        else if (selection) dispatch({ type: 'select', selection: null });
      }
      else if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        dispatch({ type: 'undo' });
      } else if ((e.metaKey || e.ctrlKey) && (e.key === 'Z' || (e.shiftKey && e.key === 'z'))) {
        e.preventDefault();
        dispatch({ type: 'redo' });
      } else if (selection?.kind === 'line' && selection.point !== null && e.key.startsWith('Arrow')) {
        e.preventDefault();
        const def = LINE_DEFS.find((d) => d.id === selection.id);
        if (!def) return;
        const frame = frameOf(result);
        const pts = linePoints(selection.id, state.now.drawing, result);
        const p = pts[selection.point];
        if (!p) return;
        const step = e.shiftKey ? 25 : 5;
        const { x, z } = denorm(frame, p);
        const nx = x + (e.key === 'ArrowRight' ? step : e.key === 'ArrowLeft' ? -step : 0);
        const nz = z + (e.key === 'ArrowUp' ? step : e.key === 'ArrowDown' ? -step : 0);
        const c = clampLinePoint(def, result, nx, nz);
        const next = [...pts];
        next[selection.point] = norm(frame, c.x, c.z);
        dispatch({ type: 'set-line', line: selection.id, pts: next, commit: true });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dispatch, state.ledgerOpen, state.now.drawing, selection, result, requestFit]);

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
  /**
   * Load a project, and refuse anything that would not survive being loaded.
   *
   * Three separate ways this used to fail. Malformed JSON threw out of an
   * async handler and vanished — no alert, no message, nothing on screen, so
   * the file simply appeared not to load. A file whose `format` passed but
   * whose package the solver rejects took the entire app down to a blank page,
   * because the solve runs during render and there is nobody above it to
   * catch. And loading while a part was selected left the selection naming a
   * part the new project has never heard of.
   *
   * So the snapshot is solved here, before it is committed. If it will not
   * solve, the project on screen is untouched and the reason is said out loud.
   */
  const loadProject = async (file: File) => {
    let parsed: (Partial<Snapshot> & { format?: string }) | null = null;
    try {
      parsed = JSON.parse(await file.text()) as Partial<Snapshot> & { format?: string };
    } catch (e) {
      alert(`That file is not valid JSON.\n\n${e instanceof Error ? e.message : String(e)}`);
      return;
    }
    if (!parsed || parsed.format !== 'pkgprop-project' || !parsed.pkg) {
      alert('That file is not a pkgprop project.');
      return;
    }
    const snapshot: Snapshot = {
      pkg: parsed.pkg,
      drawing: migrateDrawing(parsed.drawing),
      features: { ...defaultFeatures(), ...(parsed.features ?? {}) },
      render: { ...DEFAULT_RENDER, ...(parsed.render ?? {}) },
    };
    try {
      solve(buildSolveInput(snapshot.pkg));
    } catch (e) {
      alert(
        `That project will not solve, so it has not been loaded.\n\n` +
          `${e instanceof Error ? e.message : String(e)}\n\n` +
          `Your current car is untouched.`,
      );
      return;
    }
    dispatch({ type: 'load', snapshot });
  };

  const c = result.counts;
  const panel = state.panel;
  const selectedLabel =
    selection?.kind === 'line'
      ? LINE_DEFS.find((d) => d.id === selection.id)?.label
      : selection?.kind === 'feature'
        ? labelOf(state.now.features[selection.id])
        : null;

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
        <Inspector
          snapshot={state.now}
          selection={selection}
          result={result}
          dispatch={dispatch}
        >
          <PackageRail
            pkg={state.now.pkg}
            drawing={state.now.drawing}
            render={state.now.render}
            mode={state.mode}
            result={result}
            features={state.now.features}
            selectedId={selection?.kind === 'feature' ? selection.id : null}
            dispatch={dispatch}
          />
        </Inspector>
        <div className="stage">
          <div className="stage-top">
            <Toolbar
              state={state}
              dispatch={dispatch}
              onSave={saveProject}
              onLoad={() => fileRef.current?.click()}
              onFit={requestFit}
            />
          </div>
          <ConflictBar result={result} />
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
          <div className="views">
            {(panel === 'SIDE' || panel === 'PACKAGE' || panel === 'LEDGER') && (
              <>
                <SideView
                  result={result}
                  drawing={state.now.drawing}
                  features={state.now.features}
                  render={state.now.render}
                  mode={state.mode}
                  selection={selection}
                  dispatch={dispatch}
                />
                {state.mode === 'DRAFT' && (
                  <PlanView result={result} drawing={state.now.drawing} dispatch={dispatch} />
                )}
              </>
            )}
            {panel === 'SECTIONS' && (
              <SectionsView
                result={result}
                drawing={state.now.drawing}
                features={state.now.features}
                dispatch={dispatch}
              />
            )}
            {panel === 'BODY' && (
              <BodyView
                result={result}
                drawing={state.now.drawing}
                features={state.now.features}
                render={state.now.render}
                dispatch={dispatch}
              />
            )}
            {panel === 'BOUNCE' && (
              <RoadmapCard
                title="BOUNCE"
                body="Watertight check through manifold, scale presets 1:24 / 1:10 / 1:5, a print-readiness report in plain words, and one-click 3MF / STL / glTF. Gate 3."
              />
            )}
          </div>
          <ReadoutStrip result={result} />
          <div className="hint-bar">
            <span>
              1px = {cam.mmPerPx.toFixed(1)}mm · wheel zooms · space-drag pans · F fits
            </span>
            <span>{selectedLabel ? `selected: ${selectedLabel}` : 'click a part to shape it'}</span>
            <span>L ledger · ctrl+Z undo</span>
          </div>
          {state.ledgerOpen && <Ledger result={result} pkg={state.now.pkg} dispatch={dispatch} />}
        </div>
      </div>
    </div>
  );
}

function RoadmapCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="roadmap-card">
      <h2>{title}</h2>
      <p>{body}</p>
      <div className="roadmap-dormant">dormant instrument — arrives on schedule</div>
    </div>
  );
}
