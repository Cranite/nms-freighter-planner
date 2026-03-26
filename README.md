# Freighter Planner (No Man's Sky Inspired)

A browser-based planning tool for designing freighter layouts using a grid system.

## 🚀 Features
- Multi-floor support (14 floors)
- Drag & place modules
- Rotation system (R key)
- Zoom & pan (mouse)
- Save/load via localStorage
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
- Adding more modules to plan design
- Export/import layout as JSON file
- Undo/redo system
- Performance optimization (partial rendering instead of full redraw)
- Module snapping / validation logic
- 3D visualization of freighter layout

## 🌐 Live Demo
https://cranite.github.io/nms-freighter-planner/
