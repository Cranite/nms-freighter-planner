import {
  createEmptyFreighter, saveFreighter, loadFreighter, autosaveFreighter, loadAutosave,
  serializeFreighter, deserializeFreighter, isLockedTile,
} from './data.js';
import { EMPTY_ID, MODULE_BY_ID } from './modules.js';
import { canPlace, coveringAt, spansTwoFloors } from './footprint.js';
import { setupUI, downloadTextFile } from './ui.js';
import { createRenderer } from './render.js';
import { createHistory } from './history.js';
import { validateLayout } from './validation.js';
import { copyFloor, pasteFloor, clearFloor } from './floorTools.js';

// Application state; continues where the last session left off (auto-save)
let freighter = loadAutosave() ?? createEmptyFreighter();
let currentFloor = 1;

// Currently selected module + rotation
let selectedModule = null;
let selectedRotation = 0; // 0, 90, 180, 270

// Floor copied with "Copy floor" (kept until the page is closed)
let copiedFloor = null;

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

  onSelectFloor: (n) => goToFloor(n),

  onOnionSkinChange: (settings) => renderer.setOnionSkin(settings),

  // Clicked a problem in the list
  onGoToFloor: (n) => {
    goToFloor(n);
    ui.setFloor(n);
  },

  onCopyFloor: () => {
    copiedFloor = copyFloor(freighter, currentFloor);
    ui.setCopiedFloor(currentFloor);
  },

  onPasteFloor: () => {
    if (!copiedFloor) return;
    const hasContent = floorsWithContent()[currentFloor - 1];
    if (hasContent && !confirm(`Replace floor ${currentFloor} with the copy of floor ${copiedFloor.floor}? (Ctrl+Z undoes this)`)) return;

    const result = pasteFloor(freighter, currentFloor, copiedFloor);
    replaceFreighter(result);
    if (result.skipped) {
      alert(`${result.skipped} ${result.skipped === 1 ? 'module was' : 'modules were'} not pasted: `
        + 'something is in the way here (the ramp, or stairs from the floor below or above), or stairs on the top floor.');
    }
  },

  onClearFloor: () => {
    if (!floorsWithContent()[currentFloor - 1]) return;
    if (!confirm(`Clear floor ${currentFloor}? (Ctrl+Z undoes this)`)) return;

    replaceFreighter({ freighter: clearFloor(freighter, currentFloor) });
  },

  onNew: () => {
    const hasContent = floorsWithContent().some(Boolean);
    if (hasContent && !confirm('Start a new, empty layout? (Ctrl+Z undoes this)')) return;

    replaceFreighter({ freighter: createEmptyFreighter() });
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
  drawCurrentFloor();
  onLayoutChanged();
}

function goToFloor(n) {
  history.endStroke();
  currentFloor = n;
  drawCurrentFloor();
}

// The renderer also needs the floor below, for stairs coming up from it
function drawCurrentFloor() {
  renderer.drawFloor(freighter.floors, currentFloor);
  showProblemMarkers();
}

/**
 * Called after every change to the layout (drawing, undo/redo, load/import)
 */
function onLayoutChanged() {
  ui.setFloorsWithContent(floorsWithContent());
  scheduleAutosave();
  scheduleValidation();
}

/**
 * Validation, debounced like auto-save: checks the whole freighter, so
 * run it once a drag pauses rather than for every tile
 */
const VALIDATION_DELAY = 100; // ms
let validationTimer = null;
let problems = [];

function scheduleValidation() {
  clearTimeout(validationTimer);
  validationTimer = setTimeout(() => {
    problems = validateLayout(freighter);
    ui.showProblems(problems);
    showProblemMarkers();
  }, VALIDATION_DELAY);
}

// Red markers on the current floor's problem tiles
function showProblemMarkers() {
  renderer.showProblemTiles(problems.flatMap(p => p.locations).filter(l => l.floor === currentFloor));
}

// Per floor: does it have any module on it?
function floorsWithContent() {
  return freighter.floors.map(floor => floor.tiles.some(row => row.some(tile => tile.type)));
}

/**
 * Auto-save, debounced: a drag changes many tiles in a row, so save
 * once things are quiet, and right away when the page is left.
 */
const AUTOSAVE_DELAY = 500; // ms
let autosaveTimer = null;

function scheduleAutosave() {
  clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(flushAutosave, AUTOSAVE_DELAY);
}

function flushAutosave() {
  clearTimeout(autosaveTimer);
  autosaveTimer = null;
  autosaveFreighter(freighter);
}

// Closing or switching away from the tab: don't lose the last change
window.addEventListener('pagehide', () => { if (autosaveTimer) flushAutosave(); });
document.addEventListener('visibilitychange', () => {
  if (document.hidden && autosaveTimer) flushAutosave();
});

/**
 * Restores the before (undo) or after (redo) state of a history entry
 * @param side 'before' | 'after'
 */
function applyHistoryEntry(entry, side) {
  if (entry.kind === 'layout') {
    freighter = entry[side];
    drawCurrentFloor();
    onLayoutChanged();
    return;
  }

  // Undo in reverse order: a stroke can pass over the same tile more than once
  const changes = side === 'before' ? [...entry.changes].reverse() : entry.changes;
  const floor = freighter.floors[entry.floor - 1];

  for (const change of changes) {
    Object.assign(floor.tiles[change.y][change.x], change[side]);
  }

  // Stairs changed on the floor below also show on this floor (their top part)
  const touchesStairs = entry.changes.some(c => spansTwoFloors(MODULE_BY_ID[c.before.type]) || spansTwoFloors(MODULE_BY_ID[c.after.type]));
  const visibleHere = entry.floor === currentFloor || (entry.floor === currentFloor - 1 && touchesStairs);

  if (visibleHere) {
    changes.forEach(({ x, y }) => renderer.drawTile(x, y));
  } else {
    // Switch to the floor the change was made on, so it's visible
    currentFloor = entry.floor;
    ui.setFloor(currentFloor);
    drawCurrentFloor();
  }

  onLayoutChanged();
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
  // Entrance ramp can't be built on
  if (isLockedTile(currentFloor, x, y)) return;

  // 'Empty' module works as an eraser
  if (mode === 'place' && selectedModule?.id === EMPTY_ID) {
    mode = 'remove';
  }

  if (mode === 'remove') {
    // Removing any tile of a module removes the whole module (stairs cover 4 tiles)
    const cover = coveringAt(freighter.floors[currentFloor - 1], freighter.floors[currentFloor - 2] ?? null, x, y);
    if (cover) setTile(cover.floorNum, cover.x, cover.y, null, 0);
    return;
  }

  if (!selectedModule) return;

  // Only some modules have a direction (e.g. stairs); corridors shape themselves
  const rotation = selectedModule.rotatable ? selectedRotation : 0;

  // Every tile the module covers must be free (stairs: 2 tiles here, 2 above)
  if (!canPlace(freighter, selectedModule, currentFloor, x, y, rotation)) return;

  setTile(currentFloor, x, y, selectedModule.id, rotation);
}

/**
 * Eyedropper: selects the module covering a tile, with its rotation.
 * Empty tiles and the ramp are ignored.
 */
function pickAt(x, y) {
  const cover = coveringAt(freighter.floors[currentFloor - 1], freighter.floors[currentFloor - 2] ?? null, x, y);
  if (!cover) return;

  selectedModule = cover.modDef;
  selectedRotation = cover.tile.rotation;
  ui.selectModule(cover.modDef.id);
}

/**
 * Stores a module (or null) on a tile, records it for undo and redraws.
 * `floorNum` can be the floor below, when erasing stairs from their top part.
 */
function setTile(floorNum, x, y, type, rotation) {
  const tile = freighter.floors[floorNum - 1].tiles[y][x];
  if (tile.type === type && tile.rotation === rotation) return;

  const before = { type: tile.type, rotation: tile.rotation };
  tile.type = type;
  tile.rotation = rotation;

  // Part of the current stroke's undo step
  history.recordTile(floorNum, x, y, before, { type, rotation });

  // Re-render the area around the tile (stairs and corridor shapes reach beyond it)
  renderer.drawTile(x, y);
  onLayoutChanged();
}

// Setup pointer interaction
renderer.setupInteraction({
  applyDraw,
  pickAt,
  getModule: () => selectedModule,
  getRotation: () => selectedRotation,
  setRotation: (val) => selectedRotation = val,
  onStrokeEnd: () => history.endStroke(),

  // For the ghost preview: red outline where the selected module can't go
  canPlaceAt: (x, y) => !selectedModule || selectedModule.id === EMPTY_ID
    || canPlace(freighter, selectedModule, currentFloor, x, y, selectedModule.rotatable ? selectedRotation : 0),
});

// Initial render, with the onion skin settings remembered in this browser
renderer.setOnionSkin(ui.getOnionSkin());
drawCurrentFloor();
onLayoutChanged();