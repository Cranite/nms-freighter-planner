# Freighter Planner (No Man's Sky Inspired)

A browser-based planning tool for designing freighter layouts using a grid system.

## 🚀 Features
- Multi-floor support (14 floors)
- Drag & place modules
- Rotation system (R key)
- Zoom & pan (mouse)
- Save/load via localStorage
- Export/import layout as JSON file (versioned format, older saves are upgraded automatically)
- Texture-based rendering with fallback colors

## 🧠 Tech Stack
- JavaScript (ES Modules)
- PIXI.js (2D rendering)
- HTML/CSS

## 🏗 Architecture
The project is structured into clear layers:

- `data.js` → state management & configuration
- `render.js` → PIXI rendering & interaction logic
- `ui.js` → DOM-based UI
- `main.js` → orchestration / application logic

## 🔮 Future Improvements
Planned order:
1. ~~Export/import layout as JSON file~~ ✅
2. ~~Performance optimization (partial rendering instead of full redraw)~~ ✅
3. Undo/redo system
4. Adding more modules to plan design
5. Module snapping / validation logic
6. 3D visualization of freighter layout

See [ROADMAP.md](ROADMAP.md) for details and the full list of ideas.

## 🌐 Live Demo
https://cranite.github.io/nms-freighter-planner/
