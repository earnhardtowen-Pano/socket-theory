import { solve, type SolveResult, type ControlId } from '@pkgprop/core';
import { buildSolveInput, getBodyStyle, type PackageState } from '@pkgprop/data';
import { useMemo, useReducer } from 'react';
import { defaultFeatures, newFeature, type FeatureMap } from '../model/features.js';
import {
  DEFAULT_RENDER,
  defaultLines,
  type DrawingState,
  type LineId,
  type NormPt,
  type RenderState,
} from './lines.js';

/**
 * One store, one reducer, full undo. Package state and drawing state are the
 * project — a snapshot of both is what undo restores and what the project
 * file saves.
 */

export type PanelId = 'PACKAGE' | 'SIDE' | 'SECTIONS' | 'BODY' | 'BOUNCE' | 'LEDGER';

export interface Snapshot {
  readonly pkg: PackageState;
  readonly drawing: DrawingState;
  /** Parametric features: things with real parameters, not loose points. */
  readonly features: FeatureMap;
  /** How the car is presented. Authored, saved, undoable — never solved. */
  readonly render: RenderState;
}

/**
 * What is in your hand. The inspector shows this and nothing else, and only
 * this thing's handles are drawn — which is what stops the canvas from being
 * a field of interchangeable dots.
 */
export type Selection =
  | { readonly kind: 'feature'; readonly id: string }
  | { readonly kind: 'line'; readonly id: LineId; readonly point: number | null }
  | null;

export interface AppState {
  readonly now: Snapshot;
  /** Last committed snapshot while a drag is in flight, so undo lands on
   *  the state before the gesture, never mid-gesture. */
  readonly pendingBase: Snapshot | null;
  readonly history: readonly Snapshot[];
  readonly future: readonly Snapshot[];
  readonly panel: PanelId;
  readonly ledgerOpen: boolean;
  /** DRAFT shows the machinery; RENDER shows the car. Not part of the project. */
  readonly mode: ViewMode;
  readonly selection: Selection;
}

export type ViewMode = 'DRAFT' | 'RENDER';

export const INITIAL_PKG: PackageState = {
  architecture: 'fr',
  seating: '2',
};

/**
 * A selection is only valid while the thing it names still exists.
 *
 * Undo can remove the very part that is in your hand, and a loaded project has
 * its own parts and knows nothing about what was selected before it. Leaving a
 * stale id behind used to take the whole left rail down with it — the panel
 * that resolves a selection also wraps the rail, so an unresolvable id emptied
 * the column and collapsed the layout, with no error to explain it. Dropping
 * the selection instead is not a workaround: a part that no longer exists
 * cannot be the part in your hand.
 */
function keep(selection: Selection, snapshot: Snapshot): Selection {
  if (!selection) return null;
  if (selection.kind === 'feature') return snapshot.features[selection.id] ? selection : null;
  return selection;
}

export function initialState(): AppState {
  return {
    now: {
      pkg: INITIAL_PKG,
      drawing: defaultLines(),
      features: defaultFeatures(),
      render: DEFAULT_RENDER,
    },
    pendingBase: null,
    history: [],
    future: [],
    panel: 'SIDE',
    ledgerOpen: false,
    mode: 'RENDER',
    selection: null,
  };
}

export type Action =
  | { type: 'set-architecture'; id: string }
  | { type: 'set-seating'; id: string }
  | { type: 'set-tire'; designation: string }
  | { type: 'set-control'; id: ControlId; fraction: number; commit: boolean }
  | { type: 'set-override'; id: string; value: number | null }
  | { type: 'set-line'; line: LineId; pts: readonly NormPt[]; commit: boolean }
  | { type: 'set-tension'; line: LineId; tension: number; commit: boolean }
  | { type: 'reset-line'; line: LineId }
  | { type: 'reset-drawing' }
  | { type: 'set-feature-param'; id: string; key: string; value: number; commit: boolean }
  | { type: 'reset-feature'; id: string }
  | { type: 'add-feature'; kind: string }
  | { type: 'remove-feature'; id: string }
  | { type: 'body-style'; id: string }
  | { type: 'select'; selection: Selection }
  | { type: 'set-render'; patch: Partial<RenderState>; commit: boolean }
  | { type: 'load'; snapshot: Snapshot }
  | { type: 'panel'; id: PanelId }
  | { type: 'mode'; mode: ViewMode }
  | { type: 'ledger'; open: boolean }
  | { type: 'undo' }
  | { type: 'redo' };

const HISTORY_LIMIT = 200;

function push(state: AppState, next: Snapshot, commit: boolean): AppState {
  if (!commit) {
    return { ...state, now: next, pendingBase: state.pendingBase ?? state.now };
  }
  const base = state.pendingBase ?? state.now;
  return {
    ...state,
    now: next,
    pendingBase: null,
    history: [...state.history.slice(-HISTORY_LIMIT), base],
    future: [],
  };
}

function withPkg(state: AppState, pkg: PackageState, commit = true): AppState {
  return push(state, { ...state.now, pkg }, commit);
}

export function reducer(state: AppState, action: Action): AppState {
  const { pkg, drawing } = state.now;
  switch (action.type) {
    case 'set-architecture':
      return withPkg(state, { ...pkg, architecture: action.id });
    case 'set-seating':
      return withPkg(state, { ...pkg, seating: action.id });
    case 'set-tire':
      return withPkg(state, { ...pkg, tire: action.designation });
    case 'set-control':
      return withPkg(
        state,
        { ...pkg, controls: { ...pkg.controls, [action.id]: action.fraction } },
        action.commit,
      );
    case 'set-override': {
      const overrides = { ...pkg.overrides };
      if (action.value === null) delete overrides[action.id];
      else overrides[action.id] = action.value;
      return withPkg(state, { ...pkg, overrides });
    }
    case 'set-line': {
      const prev = drawing.lines[action.line];
      const entry = { pts: [...action.pts], ...(prev?.tension !== undefined ? { tension: prev.tension } : {}) };
      const next = {
        ...state.now,
        drawing: { lines: { ...drawing.lines, [action.line]: entry } },
      };
      return push(state, next, action.commit);
    }
    case 'set-tension': {
      const prev = drawing.lines[action.line];
      const entry = { pts: prev?.pts ?? [], tension: action.tension };
      // A line with no authored points keeps rendering its default set; the
      // tension still applies, so only store points when they already exist.
      const next = {
        ...state.now,
        drawing: { lines: { ...drawing.lines, [action.line]: entry } },
      };
      return push(state, next, action.commit);
    }
    case 'reset-line': {
      const lines = { ...drawing.lines };
      delete lines[action.line];
      return push(state, { ...state.now, drawing: { lines } }, true);
    }
    case 'reset-drawing':
      return push(state, { ...state.now, drawing: defaultLines() }, true);
    case 'set-feature-param': {
      const f = state.now.features[action.id];
      if (!f) return state;
      const next = {
        ...state.now,
        features: {
          ...state.now.features,
          [action.id]: { ...f, params: { ...f.params, [action.key]: action.value } },
        },
      };
      return push(state, next, action.commit);
    }
    case 'reset-feature': {
      const f = state.now.features[action.id];
      if (!f) return state;
      const fresh = defaultFeatures()[action.id];
      if (!fresh) return state;
      return push(
        state,
        { ...state.now, features: { ...state.now.features, [action.id]: fresh } },
        true,
      );
    }
    case 'add-feature': {
      // A new part lands selected, because the thing you just made is the
      // thing you want to shape.
      const f = newFeature(action.kind, state.now.features);
      const next = push(
        state,
        { ...state.now, features: { ...state.now.features, [f.id]: f } },
        true,
      );
      return { ...next, selection: { kind: 'feature', id: f.id } };
    }
    case 'remove-feature': {
      const rest = { ...state.now.features };
      if (!rest[action.id]) return state;
      delete rest[action.id];
      const next = push(state, { ...state.now, features: rest }, true);
      return { ...next, selection: null };
    }
    case 'body-style': {
      // A style is a whole car: the architecture, the pose, the section, and
      // the ASSUMED values it disagrees with. The drawing is cleared so the
      // live defaults regenerate against the new package — keeping the old
      // points would drag the previous car's roofline onto the new one.
      const style = getBodyStyle(action.id);
      const section = state.now.features['section-body'];
      return push(
        state,
        {
          ...state.now,
          pkg: {
            architecture: style.architecture,
            seating: style.seating,
            tire: style.tire,
            controls: { ...style.controls },
            overrides: { ...style.overrides },
          },
          drawing: defaultLines(),
          features: section
            ? {
                ...state.now.features,
                'section-body': { ...section, params: { ...section.params, ...style.section } },
              }
            : state.now.features,
        },
        true,
      );
    }
    case 'select':
      return { ...state, selection: action.selection };
    case 'set-render':
      return push(state, { ...state.now, render: { ...state.now.render, ...action.patch } }, action.commit);
    case 'mode':
      return { ...state, mode: action.mode };
    case 'load':
      return { ...push(state, action.snapshot, true), selection: keep(state.selection, action.snapshot) };
    case 'panel': {
      // Leaving the ledger closes it. It used to open on the way in and never
      // close on the way out, so one click on LEDGER left the overlay sitting
      // over every other panel — and because Escape peels one layer at a time,
      // the next Escape went to dismissing the ledger instead of putting down
      // the part in your hand, which read as Escape being broken.
      if (action.id === state.panel) return state;
      return { ...state, panel: action.id, ledgerOpen: action.id === 'LEDGER' };
    }
    case 'ledger':
      return { ...state, ledgerOpen: action.open };
    case 'undo': {
      const prev = state.history[state.history.length - 1];
      if (!prev) return state;
      return {
        ...state,
        now: prev,
        history: state.history.slice(0, -1),
        future: [state.now, ...state.future],
        selection: keep(state.selection, prev),
      };
    }
    case 'redo': {
      const next = state.future[0];
      if (!next) return state;
      return {
        ...state,
        now: next,
        history: [...state.history, state.now],
        future: state.future.slice(1),
        selection: keep(state.selection, next),
      };
    }
  }
}

export function useApp(): {
  state: AppState;
  dispatch: React.Dispatch<Action>;
  result: SolveResult;
} {
  const [state, dispatch] = useReducer(reducer, undefined, initialState);
  const result = useMemo(() => solve(buildSolveInput(state.now.pkg)), [state.now.pkg]);
  return { state, dispatch, result };
}
