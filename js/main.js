import { createEmptyFreighter, saveFreighter, loadFreighter } from './data.js';
import { setupUI } from './ui.js';
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
    renderer.drawModules(freighter.floors[currentFloor - 1]);
  },

  onSave: () => {
    saveFreighter(freighter);
    alert('Layout saved!');
  },

  onLoad: () => {
    const data = loadFreighter();

    if (data) {
      freighter = data;

      renderer.drawModules(freighter.floors[currentFloor - 1]);
      alert('Layout loaded!');
    } else {
      alert('No saved layout found.');
    }
  },
});


/**
 * Applies drawing action on grid
 * @param x tile x
 * @param y tile y
 * @param mode 'place' | 'remove'
 */
function applyDraw(x, y, mode) {
  const tile = freighter.floors[currentFloor - 1].tiles[y][x];

  if (mode === 'place' && selectedModule) {
    tile.type = selectedModule.id;
    tile.rotation = selectedRotation;

  } else if (mode === 'remove') {
    tile.type = null;
    tile.rotation = 0;
  }

  // Re-render after change
  renderer.drawModules(freighter.floors[currentFloor - 1]);
}

// Setup pointer interaction
renderer.setupInteraction(
  applyDraw,
  () => selectedModule,
  () => selectedRotation,
  (val) => selectedRotation = val,
);

// Initial render
renderer.drawModules(freighter.floors[currentFloor - 1]);