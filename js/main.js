import {
  createEmptyFreighter, saveFreighter, loadFreighter,
  serializeFreighter, deserializeFreighter, EMPTY_ID,
} from './data.js';
import { setupUI, downloadTextFile } from './ui.js';
import { createRenderer } from './render.js';
import { createHistory } from './history.js';

// Application state
let freighter = createEmptyFreighter();
let currentFloor = 1;

// Currently selected module + rotation
let selectedModule = null;
let selectedRotation = 0; // 0, 90, 180, 270

// Undo/redo; keeps the Undo/Redo buttons in sync
const history = createHistory(() => ui.setUndoRedoState(history.canUndo(), history.canRedo()));

// Initialize PIXI renderer (async because textures load)
const renderer = await createRenderer();

// Setup UI callbacks
const ui = setupUI({
  onSelectModule: (mod) => {
    selectedModule = mod;
    selectedRotation = 0; // reset rotation on new selection
  },

  onSelectFloor: (n) => {
    history.endStroke();
    currentFloor = n;

    // Redraw selected floor
    renderer.drawFloor(freighter.floors[currentFloor - 1]);
  },

  onSave: () => {
    saveFreighter(freighter);
    alert('Layout saved!');
  },

  onLoad: () => {
    let result;
    try {
      result = loadFreighter();
    } catch (err) {
      alert(`Saved layout could not be loaded: ${err.message}`);
      return;
    }

    if (result) {
      replaceFreighter(result);
      alert(`Layout loaded!${skippedNote(result.skipped)}`);
    } else {
      alert('No saved layout found.');
    }
  },

  onExport: () => {
    const date = new Date().toISOString().slice(0, 10);
    downloadTextFile(`freighter-layout-${date}.json`, serializeFreighter(freighter));
  },

  onImport: (text) => {
    let result;
    try {
      result = deserializeFreighter(text);
    } catch (err) {
      alert(`Import failed: ${err.message}`);
      return;
    }

    replaceFreighter(result);
    alert(`Layout imported!${skippedNote(result.skipped)}`);
  },

  onUndo: () => {
    const entry = history.undo();
    if (entry) applyHistoryEntry(entry, 'before');
  },

  onRedo: () => {
    const entry = history.redo();
    if (entry) applyHistoryEntry(entry, 'after');
  },
});

ui.setUndoRedoState(history.canUndo(), history.canRedo());

/**
 * Swaps in a loaded/imported layout (undoable) and redraws
 */
function replaceFreighter({ freighter: loaded }) {
  history.recordLayout(freighter, loaded);
  freighter = loaded;
  renderer.drawFloor(freighter.floors[currentFloor - 1]);
}

/**
 * Restores the before (undo) or after (redo) state of a history entry
 * @param side 'before' | 'after'
 */
function applyHistoryEntry(entry, side) {
  if (entry.kind === 'layout') {
    freighter = entry[side];
    renderer.drawFloor(freighter.floors[currentFloor - 1]);
    return;
  }

  // Undo in reverse order: a stroke can pass over the same tile more than once
  const changes = side === 'before' ? [...entry.changes].reverse() : entry.changes;
  const floor = freighter.floors[entry.floor - 1];

  for (const change of changes) {
    Object.assign(floor.tiles[change.y][change.x], change[side]);
  }

  if (entry.floor === currentFloor) {
    changes.forEach(({ x, y }) => renderer.drawTile(x, y, floor.tiles[y][x]));
  } else {
    // Switch to the floor the change was made on, so it's visible
    currentFloor = entry.floor;
    ui.setFloor(currentFloor);
    renderer.drawFloor(floor);
  }
}

/**
 * Message suffix for tiles dropped because their module type no longer exists
 */
function skippedNote(skipped) {
  return skipped ? ` (${skipped} tile(s) with unknown modules were skipped)` : '';
}


/**
 * Applies drawing action on grid
 * @param x tile x
 * @param y tile y
 * @param mode 'place' | 'remove'
 */
function applyDraw(x, y, mode) {
  const tile = freighter.floors[currentFloor - 1].tiles[y][x];
  const before = { type: tile.type, rotation: tile.rotation };

  // 'Empty' module works as an eraser
  if (mode === 'place' && selectedModule?.id === EMPTY_ID) {
    mode = 'remove';
  }

  if (mode === 'place' && selectedModule) {
    tile.type = selectedModule.id;
    tile.rotation = selectedRotation;

  } else if (mode === 'remove') {
    tile.type = null;
    tile.rotation = 0;
  }

  if (tile.type === before.type && tile.rotation === before.rotation) return;

  // Part of the current stroke's undo step
  history.recordTile(currentFloor, x, y, before, { type: tile.type, rotation: tile.rotation });

  // Re-render only the changed tile
  renderer.drawTile(x, y, tile);
}

// Setup pointer interaction
renderer.setupInteraction(
  applyDraw,
  () => selectedModule,
  () => selectedRotation,
  (val) => selectedRotation = val,
  () => history.endStroke(),
);

// Initial render
renderer.drawFloor(freighter.floors[currentFloor - 1]);