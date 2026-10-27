import { TILE_SIZE, GRID_SIZE, MODULE_TYPES, MODULE_BY_ID, EMPTY_ID } from './data.js';

const textureCache = {};

/**
 * Loads textures once and caches them.
 * Prevents repeated network calls.
 */
async function loadTextures() {
  for (const mod of MODULE_TYPES) {
    if (!mod.image) continue;

    try {
      const texture = await PIXI.Assets.load(mod.image);
      textureCache[mod.id] = texture;
    } catch (err) {
      console.warn(`⚠️ Missing texture for ${mod.id}, using color fallback`);
    }
  }
}

/**
 * Main renderer
 * - Creates PIXI app
 * - Injects canvas into DOM
 * - Initializes scene structure
 */
export async function createRenderer() {
  const canvasContainer = document.getElementById('canvasContainer');

  const app = new PIXI.Application({
    width: canvasContainer.clientWidth,
    height: canvasContainer.clientHeight,
    background: '#000',
    antialias: true,
  });

  canvasContainer.appendChild(app.view);

  await loadTextures();

  return initRenderer(app);
}

/**
 * Scene graph structure:
 * stageContainer
 *   ├─ grid            (static grid, single Graphics, receives pointer input)
 *   ├─ moduleContainer (placed modules, one display object per occupied cell)
 *   └─ ghost.container (preview module)
 */
function initRenderer(app) {
  const grid = drawGrid();
  const moduleContainer = new PIXI.Container();
  const ghost = createGhost();
  const stageContainer = new PIXI.Container();

  stageContainer.addChild(grid);
  stageContainer.addChild(moduleContainer);
  stageContainer.addChild(ghost.container);
  app.stage.addChild(stageContainer);

  const modules = createModuleLayer(moduleContainer);

  // Center and enable camera controls
  centerStage(stageContainer, app);
  setupZoomAndDrag(app, stageContainer);

  // Pivot centered → zoom around center
  stageContainer.pivot.set(
    (GRID_SIZE * TILE_SIZE) / 2,
    (GRID_SIZE * TILE_SIZE) / 2
  );

  // Follow container size; keep the grid in view.
  // ResizeObserver also fires once on observe, catching size changes during texture loading.
  new ResizeObserver(() => {
    const { clientWidth, clientHeight } = app.view.parentElement;
    app.renderer.resize(clientWidth, clientHeight);
    clampStagePosition(stageContainer, app);
  }).observe(app.view.parentElement);

  return {
    drawFloor: modules.drawFloor,
    drawTile: modules.drawTile,
    setupInteraction: (applyDraw, getModule, getRotation, setRotation) => setupInteraction(grid, applyDraw, getModule, getRotation, setRotation, ghost),
  };
}

/**
 * Draw empty grid as a single Graphics object
 */
function drawGrid() {
  const g = new PIXI.Graphics();
  g.lineStyle(1, 0x333333);
  g.beginFill(0x1a1a1a);

  for (let y = 0; y < GRID_SIZE; y++) {
    for (let x = 0; x < GRID_SIZE; x++) {
      g.drawRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
    }
  }

  g.endFill();
  return g;
}

// Degrees → radians
const toRadians = (degrees) => (degrees || 0) * Math.PI / 180;

/**
 * Creates the display object for a module, centered on tile (x, y).
 * Uses texture if available, fallback to colored rectangle otherwise.
 */
function createModuleObject(modDef, x, y, rotation) {
  const texture = textureCache[modDef.id];
  let obj;

  if (texture) {
    obj = new PIXI.Sprite(texture);

    // Centered positioning (important for rotation)
    obj.anchor.set(0.5);
    obj.width = TILE_SIZE;
    obj.height = TILE_SIZE;

  } else {
    // Fallback: colored square, drawn around the center so rotation works the same
    obj = new PIXI.Graphics();
    obj.beginFill(modDef.color);
    obj.drawRect(-TILE_SIZE / 2 + 2, -TILE_SIZE / 2 + 2, TILE_SIZE - 4, TILE_SIZE - 4);
    obj.endFill();
  }

  obj.x = x * TILE_SIZE + TILE_SIZE / 2;
  obj.y = y * TILE_SIZE + TILE_SIZE / 2;
  obj.rotation = toRadians(rotation);

  return obj;
}

/**
 * Placed modules layer.
 * Remembers the display object per cell, so only cells whose
 * module changed are rebuilt (partial rendering).
 */
function createModuleLayer(container) {
  // cells[y][x] = { type, obj } or null
  const cells = Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill(null));

  function drawTile(x, y, tile) {
    // Empty tiles and unknown module types render as nothing
    const modDef = MODULE_BY_ID[tile.type];
    const type = modDef && modDef.id !== EMPTY_ID ? modDef.id : null;
    const cell = cells[y][x];

    if (!cell && !type) return;

    // Same module: at most the rotation changed
    if (cell && cell.type === type) {
      cell.obj.rotation = toRadians(tile.rotation);
      return;
    }

    // destroy() also removes it from the container
    cell?.obj.destroy();
    cells[y][x] = type
      ? { type, obj: container.addChild(createModuleObject(modDef, x, y, tile.rotation)) }
      : null;
  }

  // Sync a whole floor (floor switch, load/import); unchanged cells are skipped
  function drawFloor(floor) {
    for (let y = 0; y < GRID_SIZE; y++) {
      for (let x = 0; x < GRID_SIZE; x++) {
        drawTile(x, y, floor.tiles[y][x]);
      }
    }
  }

  return { drawTile, drawFloor };
}

/**
 * Ghost preview of the selected module under the pointer.
 * The display object is reused and only rebuilt when the module changes.
 */
function createGhost() {
  const container = new PIXI.Container();
  container.alpha = 0.5; // transparency
  container.visible = false;

  let moduleId = null;

  function show(x, y, module, rotation) {
    if (!module) return hide();

    if (module.id !== moduleId) {
      container.removeChildren().forEach(child => child.destroy());
      container.addChild(createModuleObject(module, 0, 0, 0));
      moduleId = module.id;
    }

    // Object is centered on tile (0, 0); move the container to tile (x, y)
    container.position.set(x * TILE_SIZE, y * TILE_SIZE);
    container.children[0].rotation = toRadians(rotation);
    container.visible = true;
  }

  function hide() {
    container.visible = false;
  }

  return { container, show, hide };
}

// Zoom + drag handling
function setupZoomAndDrag(app, stageContainer) {
  let isDragging = false;
  let dragStart = { x: 0, y: 0 };

  app.view.addEventListener('mousedown', (e) => {
    if (e.button === 1) {
      isDragging = true;
      dragStart.x = e.clientX - stageContainer.x;
      dragStart.y = e.clientY - stageContainer.y;
      e.preventDefault();
    }
  });

  app.view.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    stageContainer.x = e.clientX - dragStart.x;
    stageContainer.y = e.clientY - dragStart.y;
    clampStagePosition(stageContainer, app);
  });

  app.view.addEventListener('mouseup', (e) => {
    if (e.button === 1) isDragging = false;
  });

  app.view.addEventListener('mouseleave', () => isDragging = false);

  let minScale = 0.5;
  let maxScale = 3;

  app.view.addEventListener('wheel', (e) => {
    e.preventDefault();

    const scaleFactor = e.deltaY > 0 ? 0.9 : 1.1;
    const oldScale = stageContainer.scale.x;
    let newScale = oldScale * scaleFactor;

    // Clamp zoom range
    newScale = Math.max(minScale, Math.min(maxScale, newScale));

    // Get mouse position in local (stage) coordinates
    const mousePos = { x: e.offsetX, y: e.offsetY };

    // Convert screen coords to world coords before zoom
    const worldPosBefore = {
      x: (mousePos.x - stageContainer.x) / oldScale,
      y: (mousePos.y - stageContainer.y) / oldScale,
    };

    // Apply zoom
    stageContainer.scale.set(newScale);

    // Convert back to screen coords to keep cursor fixed on same tile
    const worldPosAfter = {
      x: (mousePos.x - stageContainer.x) / newScale,
      y: (mousePos.y - stageContainer.y) / newScale,
    };

    // Adjust stage position so zoom centers on cursor
    stageContainer.x += (worldPosAfter.x - worldPosBefore.x) * newScale;
    stageContainer.y += (worldPosAfter.y - worldPosBefore.y) * newScale;

    // Clamp after all math
    clampStagePosition(stageContainer, app);
  });
}

/**
 * Constrains the stage position so the grid remains within view bounds.
 */
function clampStagePosition(stageContainer, app, margin = 50) {
  const stageWidth = GRID_SIZE * TILE_SIZE * stageContainer.scale.x;
  const stageHeight = GRID_SIZE * TILE_SIZE * stageContainer.scale.y;
  const viewWidth = app.renderer.width;
  const viewHeight = app.renderer.height;

  const halfW = stageWidth / 2;
  const halfH = stageHeight / 2;

  let minX, maxX, minY, maxY;

  if (stageWidth > viewWidth) {
    minX = viewWidth - halfW - margin;
    maxX = halfW + margin;
  } else {
    const centerX = viewWidth / 2;
    minX = maxX = centerX;
  }

  if (stageHeight > viewHeight) {
    minY = viewHeight - halfH - margin;
    maxY = halfH + margin;
  } else {
    const centerY = viewHeight / 2;
    minY = maxY = centerY;
  }

  stageContainer.x = Math.max(minX, Math.min(maxX, stageContainer.x));
  stageContainer.y = Math.max(minY, Math.min(maxY, stageContainer.y));
}

function centerStage(stageContainer, app) {
  stageContainer.x = app.renderer.width / 2;
  stageContainer.y = app.renderer.height / 2;
}

/**
 * Interaction system:
 * - Click = place
 * - Shift + click = remove
 * - Drag = continuous drawing
 * - R = rotate module
 *
 * One pointer handler on the grid works out the tile under the pointer.
 */
function setupInteraction(grid, applyDraw, getModule, getRotation, setRotation, ghost) {
  let isDrawing = false;

  let hoverTile = null; // { x, y } under the pointer
  let lastDrawn = null; // last tile drawn in the current stroke

  // Rotation hotkey
  window.addEventListener('keydown', (e) => {
    // Ignore while a form control has focus, and browser shortcuts (Ctrl+R)
    if (e.target.closest?.('input, select, textarea, [contenteditable]')) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;

    if (e.key.toLowerCase() === 'r') {
      const newRotation = (getRotation() + 90) % 360;
      setRotation(newRotation);

      // Update ghost preview
      if (hoverTile) {
        ghost.show(hoverTile.x, hoverTile.y, getModule(), getRotation());
      }
    }
  });

  grid.eventMode = 'static';
  grid.hitArea = new PIXI.Rectangle(0, 0, GRID_SIZE * TILE_SIZE, GRID_SIZE * TILE_SIZE);

  // Pointer position → tile coordinates (null outside the grid)
  const tileAt = (e) => {
    const pos = grid.toLocal(e.global);
    const x = Math.floor(pos.x / TILE_SIZE);
    const y = Math.floor(pos.y / TILE_SIZE);
    return x >= 0 && x < GRID_SIZE && y >= 0 && y < GRID_SIZE ? { x, y } : null;
  };

  const drawTo = (tile, e) => {
    const mode = e.shiftKey ? 'remove' : 'place';

    // Also draw tiles skipped by fast pointer movement
    for (const t of tilesBetween(lastDrawn ?? tile, tile)) {
      applyDraw(t.x, t.y, mode);
    }
    lastDrawn = tile;
  };

  const leaveGrid = () => {
    hoverTile = null;
    lastDrawn = null; // don't connect strokes across the outside of the grid
    ghost.hide();
  };

  grid.on('pointerdown', (e) => {
    if (e.button !== 0) return;

    const tile = tileAt(e);
    if (!tile) return;

    isDrawing = true;
    lastDrawn = null;
    drawTo(tile, e);
  });

  grid.on('pointermove', (e) => {
    const tile = tileAt(e);
    if (!tile) return leaveGrid();

    // Only act when entering a new tile
    if (hoverTile && hoverTile.x === tile.x && hoverTile.y === tile.y) return;
    hoverTile = tile;

    ghost.show(tile.x, tile.y, getModule(), getRotation());

    if (isDrawing) drawTo(tile, e);
  });

  grid.on('pointerout', leaveGrid);
  grid.on('pointerup', () => (isDrawing = false));
  grid.on('pointerupoutside', () => (isDrawing = false));

  window.addEventListener('mouseup', () => (isDrawing = false));
}

/**
 * Tiles on a straight line from `from` (exclusive) to `to` (inclusive).
 * Returns just `to` when both are the same tile.
 */
function tilesBetween(from, to) {
  const steps = Math.max(Math.abs(to.x - from.x), Math.abs(to.y - from.y));
  if (steps === 0) return [to];

  const tiles = [];
  for (let i = 1; i <= steps; i++) {
    tiles.push({
      x: Math.round(from.x + (to.x - from.x) * i / steps),
      y: Math.round(from.y + (to.y - from.y) * i / steps),
    });
  }
  return tiles;
}