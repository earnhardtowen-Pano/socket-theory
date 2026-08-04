import type { AppState, Action } from '../state/store.js';
import { IconButton } from './ds/Icon.js';

/**
 * The history and file hardware — visible, not keyboard folklore.
 * Undo lands on the state before a gesture; reset asks before it wipes.
 */
export function Toolbar({
  state,
  dispatch,
  onSave,
  onLoad,
  onFit,
}: {
  state: AppState;
  dispatch: React.Dispatch<Action>;
  onSave: () => void;
  onLoad: () => void;
  onFit: () => void;
}) {
  return (
    <div className="toolbar" data-testid="toolbar">
      <div className="toolbar-group">
        <IconButton
          name="undo"
          label="undo (ctrl+Z)"
          testid="toolbar-undo"
          disabled={state.history.length === 0}
          onClick={() => dispatch({ type: 'undo' })}
        />
        <IconButton
          name="redo"
          label="redo (ctrl+shift+Z)"
          testid="toolbar-redo"
          disabled={state.future.length === 0}
          onClick={() => dispatch({ type: 'redo' })}
        />
        <IconButton
          name="reset"
          label="reset the drawing to the package defaults"
          testid="toolbar-reset"
          onClick={() => {
            if (window.confirm('Reset every drawn line to the package defaults? Undo can bring them back.')) {
              dispatch({ type: 'reset-drawing' });
            }
          }}
        />
      </div>
      <div className="toolbar-group">
        <IconButton name="fit" label="fit the car in view" testid="toolbar-fit" onClick={onFit} />
      </div>
      <div className="toolbar-group">
        <IconButton name="save" label="save project file" testid="save-project" onClick={onSave} />
        <IconButton name="load" label="load project file" onClick={onLoad} />
        <IconButton
          name="ledger"
          label="ledger (L)"
          onClick={() => dispatch({ type: 'ledger', open: !state.ledgerOpen })}
        />
      </div>
    </div>
  );
}
