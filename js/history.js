// Max number of undo steps kept
const MAX_ENTRIES = 100;

/**
 * Undo/redo history.
 *
 * Entries:
 * - { kind: 'tiles', floor, changes: [{ x, y, before, after }] }
 *   One drawing stroke (click or drag) on one floor; before/after are { type, rotation }
 * - { kind: 'layout', before, after }
 *   Whole layout replaced (load/import); before/after are freighter objects
 *
 * Tile changes of a stroke are collected until endStroke(), so a whole
 * drag undoes as one step.
 *
 * @param onChange called whenever canUndo/canRedo may have changed
 */
export function createHistory(onChange = () => {}) {
  const undoStack = [];
  const redoStack = [];

  // Stroke in progress, not yet undoable
  let pending = null;

  function push(entry) {
    undoStack.push(entry);
    if (undoStack.length > MAX_ENTRIES) undoStack.shift();

    // A new action invalidates anything that was undone
    redoStack.length = 0;
    onChange();
  }

  function recordTile(floor, x, y, before, after) {
    // A stroke never spans floors
    if (pending && pending.floor !== floor) endStroke();

    if (!pending) pending = { kind: 'tiles', floor, changes: [] };
    pending.changes.push({ x, y, before, after });
  }

  function endStroke() {
    if (pending?.changes.length) push(pending);
    pending = null;
  }

  function recordLayout(before, after) {
    endStroke();
    push({ kind: 'layout', before, after });
  }

  /**
   * Moves the latest entry to the redo stack and returns it (null if none).
   * The caller applies the entry's `before` state.
   */
  function undo() {
    endStroke();

    const entry = undoStack.pop();
    if (!entry) return null;

    redoStack.push(entry);
    onChange();
    return entry;
  }

  /**
   * Moves the latest undone entry back and returns it (null if none).
   * The caller applies the entry's `after` state.
   */
  function redo() {
    endStroke();

    const entry = redoStack.pop();
    if (!entry) return null;

    undoStack.push(entry);
    onChange();
    return entry;
  }

  return {
    recordTile,
    endStroke,
    recordLayout,
    undo,
    redo,
    canUndo: () => undoStack.length > 0 || !!pending?.changes.length,
    canRedo: () => redoStack.length > 0,
  };
}
