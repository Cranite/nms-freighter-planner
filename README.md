# Freighter Planner (No Man's Sky Inspired)

A browser-based planning tool for designing freighter layouts using a grid system.

## 🚀 Features
- Multi-floor support (14 floors, 21×21 capital freighter grid)
- 40 freighter modules from the game: corridors, stairs, exterior decks, High-Tech / Industrial / Agricultural rooms
- Stairs span 2 tiles and 2 floors, like in the game; occupied tiles can't be built on
- Corridors shape themselves (straight, corner, T, cross) based on their neighbours
- Grouped, searchable module palette
- Drag & place modules; locked entrance ramp tile
- Rotation system for stairs (R key)
- Zoom & pan (mouse)
- Auto-save: your current work is restored when you come back (stored in this browser only)
- Save/load a checkpoint via localStorage; "New layout" starts fresh (undoable)
- Export/import layout as JSON file (versioned format)
- Undo/redo (Ctrl+Z, Ctrl+Y / Ctrl+Shift+Z) — a drag undoes as one step, load/import can be undone too
- Texture-based rendering with fallback colors

## 🧠 Tech Stack
- JavaScript (ES Modules)
- PIXI.js (2D rendering)
- HTML/CSS

## 🏗 Architecture
The project is structured into clear layers:

- `data.js` → state management, configuration & save format
- `modules.js` → freighter module definitions (game data)
- `footprint.js` → which tiles a module covers (stairs: 2 tiles on 2 floors) and where it can be placed
- `render.js` → PIXI rendering & interaction logic
- `ui.js` → DOM-based UI
- `history.js` → undo/redo history
- `main.js` → orchestration / application logic

## 🔮 Future Improvements
Planned order:
1. ~~Export/import layout as JSON file~~ ✅
2. ~~Performance optimization (partial rendering instead of full redraw)~~ ✅
3. ~~Undo/redo system~~ ✅
4. ~~Adding more modules to plan design~~ ✅
5. Module snapping / validation logic
6. 3D visualization of freighter layout

See [ROADMAP.md](ROADMAP.md) for details and the full list of ideas.

## 🌐 Live Demo
https://cranite.github.io/nms-freighter-planner/
