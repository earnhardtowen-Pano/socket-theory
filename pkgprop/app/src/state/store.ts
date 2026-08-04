import { solve, type SolveResult, type ControlId } from '@pkgprop/core';
import { buildSolveInput, type PackageState } from '@pkgprop/data';
import { useMemo, useReducer } from 'react';
import { defaultLines, type DrawingState, type LineId, type NormPt } from './lines.js';

/**
 * One store, one reducer, full undo. Package state and drawing state are the
 * project — a snapshot of both is what undo restores and what the project
 * file saves.
 */

export type PanelId = 'PACKAGE' | 'SIDE' | 'SECTIONS' | 'BODY' | 'BOUNCE' | 'LEDGER';

export interface Snapshot {
  readonly pkg: PackageState;
  readonly drawing: DrawingState;
}

export interface AppState {
  readonly now: Snapshot;
  /** Last committed snapshot while a drag is in flight, so undo lands on
   *  the state before the gesture, never mid-gesture. */
  readonly pendingBase: Snapshot | null;
  readonly history: readonly Snapshot[];
  readonly future: readonly Snapshot[];
  readonly panel: PanelId;
  readonly ledgerOpen: boolean;
}

export const INITIAL_PKG: PackageState = {
  architecture: 'fr',
  seating: '2',
};

export function initialState(): AppState {
  return {
    now: { pkg: INITIAL_PKG, drawing: defaultLines() },
    pendingBase: null,
    history: [],
    future: [],
    panel: 'SIDE',
    ledgerOpen: false,
  };
}

export type Action =
  | { type: 'set-architecture'; id: string }
  | { type: 'set-seating'; id: string }
  | { type: 'set-tire'; designation: string }
  | { type: 'set-control'; id: ControlId; fraction: number; commit: boolean }
  | { type: 'set-override'; id: string; value: number | null }
  | { type: 'set-line'; line: LineId; pts: readonly NormPt[]; commit: boolean }
  | { type: 'reset-line'; line: LineId }
  | { type: 'reset-drawing' }
  | { type: 'load'; snapshot: Snapshot }
  | { type: 'panel'; id: PanelId }
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
      const next = {
        ...state.now,
        drawing: { lines: { ...drawing.lines, [action.line]: [...action.pts] } },
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
    case 'load':
      return push(state, action.snapshot, true);
    case 'panel':
      return { ...state, panel: action.id, ledgerOpen: action.id === 'LEDGER' ? true : state.ledgerOpen };
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
