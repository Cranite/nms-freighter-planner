# Freighter Planner (No Man's Sky Inspired)

A browser-based planning tool for designing freighter layouts using a grid system.

## 🚀 Features
- Multi-floor support (14 floors, 21×21 capital freighter grid); Page Up / Page Down changes floor
- Onion skin: the floor below shows faintly, the floor above as outlines, both with their walls (each can be switched off)
- Copy, paste and clear a whole floor (undoable)
- 39 freighter modules from the game: corridors, stairs, exterior decks, High-Tech / Industrial / Agricultural rooms
- Wall pieces on the edges between tiles: Internal Freighter Wall, Reinforced Window and Bulkhead Door. Click or drag along an edge, or Ctrl+drag to put them around a box (Ctrl+right-drag clears a box). They only go where the game allows (next to the interior, at the ends of stairs) and are removed together with the room next to them. Corridors and catwalks shape themselves around them: a wall closes a side, a door opens onto what's behind it
- Stairs span 2 tiles and 2 floors, like in the game; occupied tiles can't be built on
- Validation: unreachable modules, duplicate storage numbers and dead-end stairs are listed and marked on the grid. Walls and windows block the way; the exterior (catwalks, platforms, exterior stairs) is only reachable through a Bulkhead Door
- Corridors shape themselves (straight, corner, T, cross) based on their neighbours
- Exterior catwalks form connected paths and platforms merge into decks, with a railing on their open sides
- Grouped, searchable module palette
- Drag & place modules; right-click (or Shift+click) to remove; the way in from the bridge is marked above tile (10, 0) on floor 1
- Box fill: Ctrl+drag fills a box with the selected module, Ctrl+right-drag erases it (one undo step, Esc cancels)
- Hotbar along the bottom: `1`–`9` select a module, `0` the eraser. Shift + number (or dragging a module onto a slot) stores the selected module there; right-click empties a slot. Remembered in this browser
- Eyedropper: middle-click (or Alt+click) a placed module to select it with its rotation
- Rotation system for stairs (R key)
- Zoom & pan (mouse)
- Turn the view in 90° steps (⟲ / ⟳ buttons, Q / E): only the picture turns, labels stay upright, and the layout and saves don't change; remembered in this browser
- Auto-save: your current work is restored when you come back (stored in this browser only)
- Save/load a checkpoint via localStorage; "New layout" starts fresh (undoable)
- Export/import layout as JSON file (versioned format)
- Export as PNG: a picture of the current floor, or of all floors with something on them side by side (modules and walls, in the turned view if you turned it)
- Share by link: "Copy share link" puts the whole layout in the link (`#layout=…`, compressed); opening it loads the layout (undoable, asks first if you have work open). No server needed
- Undo/redo (Ctrl+Z, Ctrl+Y / Ctrl+Shift+Z) — a drag undoes as one step, load/import can be undone too, and undo shows the floor that changed
- Texture-based rendering with fallback colors

## 🧠 Tech Stack
- JavaScript (ES Modules)
- PIXI.js (2D rendering)
- HTML/CSS

## 🏗 Architecture
The project is structured into clear layers:

- `data.js` → state management, configuration & save format
- `modules.js` → freighter module definitions (game data)
- `footprint.js` → which tiles a module covers (stairs: 2 tiles on 2 floors), where it can be placed and where you can walk out of a tile
- `walls.js` → wall pieces on the edges between tiles: where they can go, and cleaning up walls that lost their room
- `validation.js` → layout checks (reachability from the bridge, storage numbers, stairs ends)
- `floorTools.js` → copy, paste and clear a whole floor
- `hotbar.js` → hotbar slots on the number keys: assigning, saving, key mapping
- `share.js` → share links: the layout compressed into the URL #hash
- `render.js` → PIXI rendering & interaction logic
- `ui.js` → DOM-based UI
- `history.js` → undo/redo history
- `main.js` → orchestration / application logic

## 🧪 Tests
Unit tests for the logic (footprints, walls, validation, undo history, floor tools, save format, share links, hotbar) live in `tests/`. They use Node's built-in test runner, so there's nothing to install (Node 22 or newer):

```bash
npm test
```

Drawing and mouse handling (`render.js`, `ui.js`, `main.js`) need a browser and aren't covered; check those in the app.

## 🔮 Future Improvements
Planned order:
1. ~~Export/import layout as JSON file~~ ✅
2. ~~Performance optimization (partial rendering instead of full redraw)~~ ✅
3. ~~Undo/redo system~~ ✅
4. ~~Adding more modules to plan design~~ ✅
5. ~~Validation logic~~ ✅
6. 3D visualization of freighter layout

See [ROADMAP.md](ROADMAP.md) for details and the full list of ideas.

## 🌐 Live Demo
https://cranite.github.io/nms-freighter-planner/