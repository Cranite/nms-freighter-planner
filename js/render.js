import { TILE_SIZE, GRID_SIZE, RAMP, isLockedTile } from './data.js';
import { STEP, spansTwoFloors, coveringAt, opensTowards } from './footprint.js';

/**
 * Corridor textures per shape. At rotation 0 they connect:
 * straight W+E, corner W+S, t W+E+S, cross all sides.
 */
const CORRIDOR_TEXTURES = {
  straight: 'assets/modules/corridor_straight.png',
  corner: 'assets/modules/corridor_corner.png',
  t: 'assets/modules/corridor_t.png',
  cross: 'assets/modules/corridor_cross.png',
};

const textureCache = {};

/**
 * Loads textures once and caches them.
 * Prevents repeated network calls.
 */
async function loadTextures() {
  for (const [shape, path] of Object.entries(CORRIDOR_TEXTURES)) {
    try {
      textureCache[shape] = await PIXI.Assets.load(path);
    } catch (err) {
      console.warn(`⚠️ Missing corridor texture '${shape}', using color fallback`);
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
 *   ├─ bridgeLabel     (marks the bridge side of the grid)
 *   ├─ rampMarker      (locked entrance ramp tile, floor 1 only)
 *   ├─ moduleContainer (placed modules, one display object per module start tile)
 *   ├─ problemMarkers  (validation problems on this floor)
 *   └─ ghost.container (preview module)
 */
function initRenderer(app) {
  const grid = drawGrid();
  const bridgeLabel = drawBridgeLabel();
  const rampMarker = drawRampMarker();
  const moduleContainer = new PIXI.Container();
  const problemMarkers = new PIXI.Graphics();
  const stageContainer = new PIXI.Container();

  const modules = createModuleLayer(moduleContainer, rampMarker);
  const ghost = createGhost(modules.getFloors);

  stageContainer.addChild(grid);
  stageContainer.addChild(bridgeLabel);
  stageContainer.addChild(rampMarker);
  stageContainer.addChild(moduleContainer);
  stageContainer.addChild(problemMarkers);
  stageContainer.addChild(ghost.container);
  app.stage.addChild(stageContainer);

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
    showProblemTiles: (tiles) => drawProblemMarkers(problemMarkers, tiles),
    setupInteraction: (handlers) => setupInteraction(grid, ghost, handlers),
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

// Tile label text (module short names, markers)
function createLabel(text, fontSize = Math.round(TILE_SIZE * 0.36)) {
  const label = new PIXI.Text(text, {
    fontFamily: 'sans-serif',
    fontSize,
    fontWeight: 'bold',
    fill: 0xffffff,
    stroke: 0x000000,
    strokeThickness: 3,
  });
  label.anchor.set(0.5);
  label.resolution = 2; // sharp when zoomed in
  return label;
}

/**
 * Marks the top of the grid as the bridge side (ramp entrance)
 */
function drawBridgeLabel() {
  const label = createLabel('▲ Bridge', Math.round(TILE_SIZE * 0.4));
  label.x = (GRID_SIZE * TILE_SIZE) / 2;
  label.y = -TILE_SIZE * 0.6;
  return label;
}

/**
 * Locked entrance ramp tile (can't be built on)
 */
function drawRampMarker() {
  const marker = new PIXI.Container();

  const g = new PIXI.Graphics();
  g.beginFill(0x1e8449);
  g.drawRoundedRect(2, 2, TILE_SIZE - 4, TILE_SIZE - 4, 4);
  g.endFill();
  marker.addChild(g);

  const label = createLabel('RAMP', Math.round(TILE_SIZE * 0.24));
  label.position.set(TILE_SIZE / 2, TILE_SIZE / 2);
  marker.addChild(label);

  marker.position.set(RAMP.x * TILE_SIZE, RAMP.y * TILE_SIZE);
  return marker;
}

/**
 * Red outline + light fill on tiles with a validation problem: [{ x, y }]
 */
function drawProblemMarkers(g, tiles) {
  g.clear();
  g.lineStyle(2, 0xff4d4d, 0.9);
  g.beginFill(0xff4d4d, 0.18);
  for (const { x, y } of tiles) {
    g.drawRect(x * TILE_SIZE + 1, y * TILE_SIZE + 1, TILE_SIZE - 2, TILE_SIZE - 2);
  }
  g.endFill();
}

// Degrees → radians
const toRadians = (degrees) => (degrees || 0) * Math.PI / 180;

// Neighbour directions as bit flags
const N = 1, E = 2, S = 4, W = 8;
const NEIGHBOURS = [[0, -1, N], [1, 0, E], [0, 1, S], [-1, 0, W]];

// Rotates a direction mask clockwise in 90° steps (N→E→S→W→N)
function rotateMask(mask, steps) {
  for (let i = 0; i < steps; i++) mask = ((mask << 1) | (mask >> 3)) & 15;
  return mask;
}

// Corridor textures and the sides they connect at rotation 0
const CORRIDOR_SHAPES = [['cross', N | E | S | W], ['t', W | E | S], ['corner', W | S], ['straight', W | E]];

/**
 * Picks the corridor shape + rotation that connects exactly the given sides
 */
function corridorShape(mask) {
  // Lone corridors and dead ends: straight piece along the connection
  if (mask === 0 || mask === E || mask === W) return { shape: 'straight', rotation: 0 };
  if (mask === N || mask === S) return { shape: 'straight', rotation: 90 };

  for (const [shape, base] of CORRIDOR_SHAPES) {
    for (let steps = 0; steps < 4; steps++) {
      if (rotateMask(base, steps) === mask) return { shape, rotation: steps * 90 };
    }
  }
}

/**
 * Sides of tile (x, y) whose neighbour opens towards it (see opensTowards:
 * ramp, interior modules, and stairs only at their ends)
 */
function corridorMask(floor, floorBelow, x, y) {
  let mask = 0;

  for (const [dx, dy, dir] of NEIGHBOURS) {
    const nx = x + dx, ny = y + dy;
    if (nx < 0 || nx >= GRID_SIZE || ny < 0 || ny >= GRID_SIZE) continue;

    if (opensTowards(floor, floorBelow, nx, ny, -dx, -dy)) mask |= dir;
  }
  return mask;
}

/**
 * How a module looks at tile (x, y):
 * - key: objects with the same key only differ in rotation
 * - shape: corridor texture (corridors only)
 * - top: stairs arriving from the floor below
 * - rotation: degrees
 */
function visualFor(modDef, floor, floorBelow, x, y, rotation, top = false) {
  if (modDef.kind === 'corridor') {
    const { shape, rotation: shapeRotation } = corridorShape(corridorMask(floor, floorBelow, x, y));
    return { key: `${modDef.id}:${shape}`, shape, rotation: shapeRotation };
  }

  // Stairs: rotation moves the 2-tile object, so it's part of the key
  if (spansTwoFloors(modDef)) {
    return { key: `${top ? 'top:' : ''}${modDef.id}@${rotation}`, top, rotation };
  }

  return { key: modDef.id, rotation: modDef.rotatable ? rotation : 0 };
}

/**
 * Creates the display object for a module, centered on tile (x, y).
 * `obj.body` is the rotated part; the label stays upright.
 */
function createModuleObject(modDef, visual, x, y) {
  if (spansTwoFloors(modDef)) return createStairsObject(modDef, visual, x, y);

  const obj = new PIXI.Container();
  const texture = visual.shape && textureCache[visual.shape];
  let body;

  if (texture) {
    // Corridor texture, colored by module (e.g. glass corridor)
    body = new PIXI.Sprite(texture);
    body.anchor.set(0.5);
    body.width = TILE_SIZE;
    body.height = TILE_SIZE;
    body.tint = modDef.color;

  } else {
    // Colored square, drawn around the center so rotation works the same
    const half = TILE_SIZE / 2;
    body = new PIXI.Graphics();

    // Exterior pieces get an outline (open deck outside the hull)
    if (modDef.exterior) body.lineStyle(1, 0xffffff, 0.5);
    body.beginFill(modDef.color);
    body.drawRoundedRect(-half + 2, -half + 2, TILE_SIZE - 4, TILE_SIZE - 4, 4);
    body.endFill();
  }

  body.rotation = toRadians(visual.rotation);
  obj.addChild(body);
  obj.body = body;

  if (modDef.short) obj.addChild(createLabel(modDef.short));

  obj.x = x * TILE_SIZE + TILE_SIZE / 2;
  obj.y = y * TILE_SIZE + TILE_SIZE / 2;

  return obj;
}

/**
 * Stairs: 1 × 2 tiles from (x, y) in the climb direction, with steps and
 * an arrowhead at the high end. `visual.top` draws the see-through part
 * on the floor above, where the stairs arrive.
 */
function createStairsObject(modDef, visual, x, y) {
  const obj = new PIXI.Container();
  const body = new PIXI.Graphics();

  // Drawn climbing north (rotation 0) around the center of its 2 tiles
  const halfWidth = TILE_SIZE / 2 - 2;
  const halfLength = TILE_SIZE - 2;

  if (visual.top) {
    body.lineStyle(2, modDef.color, 0.9);
    body.beginFill(modDef.color, 0.25);
  } else {
    // Exterior stairs get an outline (outside the hull)
    if (modDef.exterior) body.lineStyle(1, 0xffffff, 0.5);
    body.beginFill(modDef.color);
  }
  body.drawRoundedRect(-halfWidth, -halfLength, halfWidth * 2, halfLength * 2, 4);
  body.endFill();

  // Steps
  const steps = 6;
  body.lineStyle(1, 0xffffff, visual.top ? 0.2 : 0.3);
  for (let i = 1; i < steps; i++) {
    const stepY = -halfLength + (i * halfLength * 2) / steps;
    body.moveTo(-halfWidth + 3, stepY);
    body.lineTo(halfWidth - 3, stepY);
  }

  // Arrowhead at the high end
  const tip = -halfLength + 3;
  const base = tip + TILE_SIZE * 0.22;
  const width = TILE_SIZE * 0.22;
  body.lineStyle(0);
  body.beginFill(0xffffff, visual.top ? 0.6 : 0.9);
  body.drawPolygon([0, tip, width, base, -width, base]);
  body.endFill();

  body.rotation = toRadians(visual.rotation);
  obj.addChild(body);
  obj.body = body;

  if (modDef.short) obj.addChild(createLabel(modDef.short));

  // Center between the low end (x, y) and the high end one step further
  const [dx, dy] = STEP[visual.rotation];
  obj.x = (x + 0.5 + dx / 2) * TILE_SIZE;
  obj.y = (y + 0.5 + dy / 2) * TILE_SIZE;

  return obj;
}

/**
 * Placed modules layer.
 * Remembers the display object per cell, so only cells whose
 * look changed are rebuilt (partial rendering). Objects live on the tile
 * where a module starts; stairs extend from there over their other tile.
 */
function createModuleLayer(container, rampMarker) {
  // cells[y][x] = { key, obj } or null
  const cells = Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill(null));

  // Floor currently shown, and the one below it (for stairs coming up)
  let floor = null;
  let floorBelow = null;

  function drawCell(x, y) {
    // A module starting on this tile, or stairs from below arriving here.
    // Empty tiles, unknown module types and the far end of stairs render nothing.
    const cover = coveringAt(floor, floorBelow, x, y);
    const startsHere = cover && cover.end === 'low' && cover.modDef.kind !== 'eraser';
    const modDef = startsHere ? cover.modDef : null;
    const visual = modDef ? visualFor(modDef, floor, floorBelow, x, y, cover.tile.rotation, cover.part === 'top') : null;
    const cell = cells[y][x];

    if (!cell && !visual) return;

    // Same look: at most the rotation changed
    if (cell && visual && cell.key === visual.key) {
      cell.obj.body.rotation = toRadians(visual.rotation);
      return;
    }

    // destroy() also removes it from the container; children incl. label textures
    cell?.obj.destroy({ children: true });
    cells[y][x] = visual
      ? { key: visual.key, obj: container.addChild(createModuleObject(modDef, visual, x, y)) }
      : null;
  }

  // Redraw the area around a changed tile: stairs reach 1 tile further,
  // and corridor shapes depend on their neighbours
  function drawTile(x, y) {
    for (let ny = y - 2; ny <= y + 2; ny++) {
      for (let nx = x - 2; nx <= x + 2; nx++) {
        if (nx >= 0 && nx < GRID_SIZE && ny >= 0 && ny < GRID_SIZE) drawCell(nx, ny);
      }
    }
  }

  // Show a whole floor (floor switch, load/import); unchanged cells are skipped
  function drawFloor(newFloor, newFloorBelow = null) {
    floor = newFloor;
    floorBelow = newFloorBelow;
    rampMarker.visible = floor.floor === RAMP.floor;

    for (let y = 0; y < GRID_SIZE; y++) {
      for (let x = 0; x < GRID_SIZE; x++) {
        drawCell(x, y);
      }
    }
  }

  return { drawTile, drawFloor, getFloors: () => ({ floor, floorBelow }) };
}

/**
 * Ghost preview of the selected module under the pointer.
 * The display object is reused and only rebuilt when its look changes
 * (other module, corridor shape or stairs direction). Where the module
 * can't be placed, a red outline marks the tile.
 */
function createGhost(getFloors) {
  const container = new PIXI.Container();
  container.visible = false;

  const content = new PIXI.Container();
  content.alpha = 0.5; // transparency
  container.addChild(content);

  const invalidMark = new PIXI.Graphics();
  invalidMark.lineStyle(2, 0xff4d4d);
  invalidMark.drawRect(1, 1, TILE_SIZE - 2, TILE_SIZE - 2);
  container.addChild(invalidMark);

  let key = null;

  function show(x, y, module, rotation, valid = true) {
    const { floor, floorBelow } = getFloors();
    if (!module || !floor || isLockedTile(floor.floor, x, y)) return hide();

    const visual = visualFor(module, floor, floorBelow, x, y, rotation);

    if (visual.key !== key) {
      content.removeChildren().forEach(child => child.destroy({ children: true }));
      content.addChild(createModuleObject(module, visual, 0, 0));
      key = visual.key;
    }

    // Object is placed on tile (0, 0); move the container to tile (x, y)
    container.position.set(x * TILE_SIZE, y * TILE_SIZE);
    content.children[0].body.rotation = toRadians(visual.rotation);
    invalidMark.visible = !valid;
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

  // Right-click erases, so no browser menu on the canvas
  app.view.addEventListener('contextmenu', (e) => e.preventDefault());

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
 * - Right-click or Shift + click = remove
 * - Drag = continuous drawing
 * - R = rotate module
 *
 * One pointer handler on the grid works out the tile under the pointer.
 * `canPlaceAt(x, y)` tells the ghost preview whether placing is allowed there.
 */
function setupInteraction(grid, ghost, { applyDraw, getModule, getRotation, setRotation, onStrokeEnd, canPlaceAt }) {
  let isDrawing = false;
  let isErasing = false; // stroke started with the right mouse button

  // Pointer released: the stroke (click or drag) is complete
  const endStroke = () => {
    if (!isDrawing) return;
    isDrawing = false;
    onStrokeEnd();
  };

  let hoverTile = null; // { x, y } under the pointer
  let lastDrawn = null; // last tile drawn in the current stroke

  const updateGhost = () => {
    if (hoverTile) ghost.show(hoverTile.x, hoverTile.y, getModule(), getRotation(), canPlaceAt(hoverTile.x, hoverTile.y));
  };

  // Rotation hotkey
  window.addEventListener('keydown', (e) => {
    // Ignore while a form control has focus, and browser shortcuts (Ctrl+R)
    if (e.target.closest?.('input, select, textarea, [contenteditable]')) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;

    if (e.key.toLowerCase() === 'r') {
      const newRotation = (getRotation() + 90) % 360;
      setRotation(newRotation);

      updateGhost();
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
    const mode = isErasing || e.shiftKey ? 'remove' : 'place';

    // Also draw tiles skipped by fast pointer movement
    for (const t of tilesBetween(lastDrawn ?? tile, tile)) {
      applyDraw(t.x, t.y, mode);
    }
    lastDrawn = tile;

    // The layout changed, so placing may no longer be allowed here
    updateGhost();
  };

  const leaveGrid = () => {
    hoverTile = null;
    lastDrawn = null; // don't connect strokes across the outside of the grid
    ghost.hide();
  };

  grid.on('pointerdown', (e) => {
    // Left button places, right button erases (middle button pans)
    if (e.button !== 0 && e.button !== 2) return;

    const tile = tileAt(e);
    if (!tile) return;

    isDrawing = true;
    isErasing = e.button === 2;
    lastDrawn = null;
    drawTo(tile, e);
  });

  grid.on('pointermove', (e) => {
    const tile = tileAt(e);
    if (!tile) return leaveGrid();

    // Only act when entering a new tile
    if (hoverTile && hoverTile.x === tile.x && hoverTile.y === tile.y) return;
    hoverTile = tile;

    if (isDrawing) drawTo(tile, e);
    else updateGhost();
  });

  grid.on('pointerout', leaveGrid);
  grid.on('pointerup', endStroke);
  grid.on('pointerupoutside', endStroke);

  window.addEventListener('mouseup', endStroke);
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