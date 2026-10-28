# Roadmap & Ideas

Tracking list for planned features and ideas. Tick items off as they land.

## 🗺 Roadmap (in order)

Each step makes the next one cheaper, so the order matters.

- [x] **1. Export/import layout as JSON file**
  - Add a `version` field to the save format + migration hook, so later data model changes can upgrade old saves
  - Format and migrations live in `js/data.js` (`SAVE_VERSION`, `MIGRATIONS`)
- [x] **2. Partial rendering instead of full redraw**
  - Keep one sprite per cell, update only changed cells
  - Gives a per-cell layer for validation highlights later
  - Grid is one Graphics with a single pointer handler (was 441 objects + handlers); fast drags fill skipped tiles
- [x] **3. Undo/redo system**
  - Record changes at the single mutation point (`applyDraw`)
  - A drag stroke undoes as one step
  - Load/import are undoable; undo on another floor switches to that floor; 100 steps kept (`js/history.js`)
- [x] **4. More modules**
  - 37 modules from the wiki's Freighter Base Building list (`js/modules.js`), grouped by category, searchable palette
  - Corridors shape themselves from their neighbours (as in the game since Endurance); rotation only for stairs
  - Locked entrance ramp tile on floor 1; save format v2 migrates the old placeholder modules
  - Open question: do stairs take a tile on both floors they connect? (currently one tile + direction)
- [ ] **5. Module snapping / validation**
  - Start with highlighting problems (corridor opening into a wall, unreachable rooms), auto-snapping later
  - Each Storage Room number (0–9) only once per freighter
  - Exterior Catwalk/Platform need a Bulkhead Door to be reachable
- [ ] **Wall pieces: Internal Freighter Wall, Bulkhead Door, Reinforced Window**
  - They sit on the edges between tiles, so they need an edge layer (4 sides per tile) in data, rendering and saves
- [ ] **6. 3D visualization of freighter layout**
  - Separate renderer (e.g. three.js) stacking the floors
  - Cheap 2D precursor: "onion skin" showing the floor below faintly

## 💾 Saving & sharing

- [ ] Share by link: compress layout into the URL `#hash` (no server needed, works on GitHub Pages)
- [x] Auto-save (own slot, separate from the Save/Load checkpoint; plus a "New layout" button)
- [ ] Multiple named save slots
- [ ] Export floor (or all floors side by side) as PNG

## ✏️ Editing tools

- [ ] Rectangle fill
- [ ] Line tool for corridors
- [ ] Eyedropper: pick module + rotation from a placed tile
- [ ] Copy / paste / clear a whole floor
- [ ] Right-click to erase (instead of Shift+click)
- [ ] Keyboard shortcuts: `1`–`9` select module, PgUp/PgDn change floor (Ctrl+Z / Ctrl+Y undo/redo ✅ done)

## 🧭 Planning helpers

- [ ] Build cost summary: module counts + total materials as a shopping list
- [x] Mark which floors have content in the floor picker
- [ ] Stairs/lifts between floors that must line up with the floor above/below (ties into validation)
- [ ] Freighter type switch: capital freighter (21×21, 14 floors) vs system freighter (19×21, 15 floors)

## 🔧 Quality

- [x] Pin PIXI to an exact version (7.4.3, with integrity hash)
- [ ] Palette buttons as real `<button>` elements (keyboard accessible)
- [ ] Touch support: pinch zoom, two-finger pan
- [ ] Unit tests for non-drawing logic (save loading, validation, undo)
- [x] Update in-app hint text with all controls (Shift+click remove, R rotate, middle-drag pan)
