import { describe, expect, it } from 'vitest';
import { initialState, reducer, type AppState } from '../src/state/store.js';

/**
 * The four defects that made the tool undrivable, pinned.
 *
 * Each of these was found by driving the shipped single-file build and
 * independently reproduced before being fixed. They are here rather than only
 * in an e2e spec because the cause of three of them is reducer state, and a
 * reducer test says what went wrong instead of just that something did.
 */

const addWing = (s: AppState): AppState => reducer(s, { type: 'add-feature', kind: 'wing' });

describe('a selection never outlives the thing it names', () => {
  it('undo that removes the selected part clears the selection', () => {
    // The rail is rendered by the component that resolves the selection, so a
    // selection pointing at a part that no longer exists used to delete the
    // whole left column and collapse the layout to a strip.
    const added = addWing(initialState());
    expect(added.selection).toEqual({ kind: 'feature', id: 'wing-1' });
    expect(added.now.features['wing-1']).toBeDefined();

    const undone = reducer(added, { type: 'undo' });
    expect(undone.now.features['wing-1']).toBeUndefined();
    expect(undone.selection).toBeNull();
  });

  it('redo that brings the part back leaves the selection valid', () => {
    const undone = reducer(addWing(initialState()), { type: 'undo' });
    const redone = reducer(undone, { type: 'redo' });
    expect(redone.now.features['wing-1']).toBeDefined();
    // Selection was dropped on the way out and is not resurrected — but
    // whatever it holds must resolve.
    if (redone.selection?.kind === 'feature') {
      expect(redone.now.features[redone.selection.id]).toBeDefined();
    }
  });

  it('loading a project while a part is held drops the stale selection', () => {
    const held = addWing(initialState());
    const fresh = initialState().now;
    const loaded = reducer(held, { type: 'load', snapshot: fresh });
    expect(loaded.now.features['wing-1']).toBeUndefined();
    expect(loaded.selection).toBeNull();
  });

  it('a line selection survives undo, because a line is always there', () => {
    const s = reducer(initialState(), {
      type: 'select',
      selection: { kind: 'line', id: 'roof', point: null },
    });
    const moved = reducer(s, { type: 'set-tension', line: 'roof', tension: 0.2, commit: true });
    const undone = reducer(moved, { type: 'undo' });
    expect(undone.selection).toEqual({ kind: 'line', id: 'roof', point: null });
  });
});

describe('undo after removing a part by hand', () => {
  it('leaves nothing dangling either way', () => {
    const added = addWing(initialState());
    const removed = reducer(added, { type: 'remove-feature', id: 'wing-1' });
    expect(removed.selection).toBeNull();
    const back = reducer(removed, { type: 'undo' });
    // Undo restores the part; the selection must still resolve or be null.
    if (back.selection?.kind === 'feature') {
      expect(back.now.features[back.selection.id]).toBeDefined();
    }
  });
});
