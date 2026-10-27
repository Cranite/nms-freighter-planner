import {
  createEmptyFreighter, saveFreighter, loadFreighter,
  serializeFreighter, deserializeFreighter, EMPTY_ID,
} from './data.js';
import { setupUI, downloadTextFile } from './ui.js';
import { createRenderer } from './render.js';

// Application state
let freighter = createEmptyFreighter();
let currentFloor = 1;

// Currently selected module + rotation
let selectedModule = null;
let selectedRotation = 0; // 0, 90, 180, 270

// Initialize PIXI renderer (async because textures load)
const renderer = await createRenderer();

// Setup UI callbacks
setupUI({
  onSelectModule: (mod) => {
    selectedModule = mod;
    selectedRotation = 0; // reset rotation on new selection
  },

  onSelectFloor: (n) => {
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
});

/**
 * Swaps in a loaded/imported layout and redraws
 */
function replaceFreighter({ freighter: loaded }) {
  freighter = loaded;
  renderer.drawFloor(freighter.floors[currentFloor - 1]);
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

  // Re-render only the changed tile
  renderer.drawTile(x, y, tile);
}

// Setup pointer interaction
renderer.setupInteraction(
  applyDraw,
  () => selectedModule,
  () => selectedRotation,
  (val) => selectedRotation = val,
);

// Initial render
renderer.drawFloor(freighter.floors[currentFloor - 1]);