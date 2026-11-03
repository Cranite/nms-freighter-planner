import { GRID_SIZE, RAMP, isLockedTile } from './data.js';
import { STEP, spansTwoFloors, coveringAt, opensTowards, exteriorOpensTowards } from './footprint.js';
import { EMPTY_ID, MODULE_BY_ID } from './modules.js';
import { tileEdge, getWall, boxOutline } from './walls.js';
import { isTypingTarget } from './ui.js';

/**
 * Calculates tile size based on viewport.
 * Keeps tiles between min/max for usability.
 * Lives here, not in data.js: it measures the page, and data.js
 * must also load without one (unit tests run in Node).
 */
function calculateTileSize() {
  // Measure the actual canvas area (sidebar width incl. padding/border excluded)
  const canvasContainer = document.getElementById('canvasContainer');
  const canvasWidth = canvasContainer.clientWidth;
  const canvasHeight = canvasContainer.clientHeight;
  
  const minSize = 24;
  const maxSize = 48;

  return Math.max(
    minSize,
    Math.min(
      maxSize,
      Math.floor(Math.min(canvasWidth, canvasHeight) / GRID_SIZE) - 2
    )
  );
}

const TILE_SIZE = calculateTileSize();

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
 *   ├─ belowContainer  (onion skin: the floor below, faint: its modules and walls)
 *   ├─ rampMarker      (locked entrance ramp tile, floor 1 only)
 *   ├─ moduleContainer (placed modules, one display object per module start tile)
 *   ├─ wallLayer       (wall pieces on the edges between tiles)
 *   ├─ aboveOutlines   (onion skin: outlines of the floor above, and its walls as thin lines)
 *   ├─ problemMarkers  (validation problems on this floor)
 *   ├─ boxPreview      (box being drawn with Ctrl + drag)
 *   ├─ ghost.container (preview module)
 *   └─ edgeGhost.container (preview wall piece)
 */
function initRenderer(app) {
  const grid = drawGrid();
  const bridgeLabel = drawBridgeLabel();
  const rampMarker = drawRampMarker();
  const belowContainer = new PIXI.Container();
  const belowModules = new PIXI.Container();
  const belowWalls = new PIXI.Graphics();
  belowContainer.addChild(belowModules, belowWalls);
  const moduleContainer = new PIXI.Container();
  const wallLayer = new PIXI.Graphics();
  const aboveOutlines = new PIXI.Graphics();
  const problemMarkers = new PIXI.Graphics();
  const stageContainer = new PIXI.Container();

  const modules = createModuleLayer(moduleContainer, rampMarker);
  const below = createModuleLayer(belowModules);
  belowContainer.alpha = 0.28;
  const ghost = createGhost(modules.getFloors);
  const boxPreview = createBoxPreview();
  const edgeGhost = createEdgeGhost();

  stageContainer.addChild(grid);
  stageContainer.addChild(bridgeLabel);
  stageContainer.addChild(belowContainer);
  stageContainer.addChild(rampMarker);
  stageContainer.addChild(moduleContainer);
  stageContainer.addChild(wallLayer);
  stageContainer.addChild(aboveOutlines);
  stageContainer.addChild(problemMarkers);
  stageContainer.addChild(boxPreview.container);
  stageContainer.addChild(ghost.container);
  stageContainer.addChild(edgeGhost.container);
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

  // Onion skin: neighbouring floors shown for reference (never edited)
  let onionSkin = { below: true, above: false };
  let floors = null;   // all floors of the layout
  let floorNum = 1;    // floor being edited

  function drawOnionSkin() {
    const floorBelow = onionSkin.below ? floors[floorNum - 2] : null;
    belowContainer.visible = !!floorBelow;
    if (floorBelow) {
      below.drawFloor(floorBelow, floors[floorNum - 3] ?? null);
      drawWallLayer(belowWalls, floorBelow);
    }

    drawAboveOutlines(aboveOutlines, onionSkin.above ? floors[floorNum] : null, floors[floorNum - 1]);
  }

  return {
    // Show floor `n` of `allFloors` (with its onion skin)
    drawFloor(allFloors, n) {
      floors = allFloors;
      floorNum = n;
      modules.drawFloor(floors[n - 1], floors[n - 2] ?? null);
      drawWallLayer(wallLayer, floors[n - 1]);
      drawOnionSkin();
    },

    // Redraw around a changed tile; the onion skin can change too (erasing stairs from their top),
    // and so can the walls (removed along with a module, also on the floors around)
    drawTile(x, y) {
      modules.drawTile(x, y);
      drawWallLayer(wallLayer, floors[floorNum - 1]);
      if (belowContainer.visible) {
        below.drawTile(x, y);
        drawWallLayer(belowWalls, floors[floorNum - 2]);
      }
      drawAboveOutlines(aboveOutlines, onionSkin.above ? floors[floorNum] : null, floors[floorNum - 1]);
    },

    // Redraw the walls of the current floor (cheap: one Graphics)
    drawWalls() {
      drawWallLayer(wallLayer, floors[floorNum - 1]);
    },

    // { below, above }: which neighbouring floors to show
    setOnionSkin(settings) {
      onionSkin = settings;
      if (floors) drawOnionSkin();
    },

    showProblemTiles: (tiles) => drawProblemMarkers(problemMarkers, tiles),
    setupInteraction: (handlers) => setupInteraction(grid, ghost, edgeGhost, boxPreview, handlers),
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

/**
 * Onion skin: dashed outlines of the modules on the floor above, and its
 * wall pieces as thin lines.
 * Stairs from this floor arriving there are skipped (already drawn here).
 */
function drawAboveOutlines(g, floorAbove, floor) {
  g.clear();
  if (!floorAbove) return;

  g.lineStyle(1.5, 0xc9c9c9, 0.7);
  for (let y = 0; y < GRID_SIZE; y++) {
    for (let x = 0; x < GRID_SIZE; x++) {
      const cover = coveringAt(floorAbove, floor, x, y);
      if (!cover || cover.part !== 'base' || cover.modDef.kind === 'eraser') continue;
      drawDashedRect(g, x * TILE_SIZE + 3, y * TILE_SIZE + 3, TILE_SIZE - 6, TILE_SIZE - 6);
    }
  }

  for (const [side, rows] of Object.entries(floorAbove.walls)) {
    rows.forEach((row, y) => row.forEach((type, x) => {
      if (!type) return;
      g.lineStyle(2, MODULE_BY_ID[type].color, 0.8);
      g.moveTo(x * TILE_SIZE, y * TILE_SIZE);
      g.lineTo((x + (side === 'N' ? 1 : 0)) * TILE_SIZE, (y + (side === 'W' ? 1 : 0)) * TILE_SIZE);
    }));
  }
}

// PIXI has no dashed lines: draw each side as short segments
function drawDashedRect(g, x, y, width, height, dash = 3, gap = 3) {
  const sides = [[x, y, 1, 0, width], [x + width, y, 0, 1, height], [x + width, y + height, -1, 0, width], [x, y + height, 0, -1, height]];
  for (const [sx, sy, dx, dy, length] of sides) {
    for (let d = 0; d < length; d += dash + gap) {
      const end = Math.min(d + dash, length);
      g.moveTo(sx + dx * d, sy + dy * d);
      g.lineTo(sx + dx * end, sy + dy * end);
    }
  }
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
 * Sides of tile (x, y) whose neighbour opens towards it.
 * `opens` is the rule: opensTowards for corridors (ramp, interior modules,
 * stairs only at their ends), exteriorOpensTowards for catwalks and platforms.
 * A wall or window closes a side; a Bulkhead Door joins whatever is behind it,
 * inside or outside (a corridor out onto a catwalk, a catwalk up to a door).
 */
function neighbourMask(floor, floorBelow, x, y, opens = opensTowards) {
  let mask = 0;

  for (const [dx, dy, dir] of NEIGHBOURS) {
    const nx = x + dx, ny = y + dy;
    if (nx < 0 || nx >= GRID_SIZE || ny < 0 || ny >= GRID_SIZE) continue;

    const piece = MODULE_BY_ID[getWall(floor, tileEdge(x, y, dx, dy))];
    if (piece && !piece.door) continue;

    const joined = piece
      ? opensTowards(floor, floorBelow, nx, ny, -dx, -dy) || exteriorOpensTowards(floor, floorBelow, nx, ny, -dx, -dy)
      : opens(floor, floorBelow, nx, ny, -dx, -dy);
    if (joined) mask |= dir;
  }
  return mask;
}

/**
 * How a module looks at tile (x, y):
 * - key: objects with the same key only differ in rotation
 * - shape: corridor texture (corridors only)
 * - mask: sides joined to other exterior pieces (catwalks and platforms only)
 * - top: stairs arriving from the floor below
 * - rotation: degrees
 */
function visualFor(modDef, floor, floorBelow, x, y, rotation, top = false) {
  if (modDef.kind === 'corridor') {
    const { shape, rotation: shapeRotation } = corridorShape(neighbourMask(floor, floorBelow, x, y));
    return { key: `${modDef.id}:${shape}`, shape, rotation: shapeRotation };
  }

  // Catwalks and platforms join the exterior pieces around them
  if (modDef.kind === 'exterior') {
    const mask = neighbourMask(floor, floorBelow, x, y, exteriorOpensTowards);
    return { key: `${modDef.id}:${mask}`, mask, rotation: 0 };
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
  if (modDef.kind === 'exterior') return createExteriorObject(modDef, visual, x, y);

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

// Railing along the open sides of exterior pieces
const RAILING_COLOR = 0xdfe3e4;
const RAILING_WIDTH = 2;

/**
 * Exterior Catwalk / Platform: open deck outside the hull that joins the
 * exterior pieces around it (`visual.mask`), with a railing on the other sides.
 * - Platform: the whole tile, so neighbouring platforms merge into one deck
 * - Catwalk: a narrow path from the center to each joined side
 */
function createExteriorObject(modDef, visual, x, y) {
  const obj = new PIXI.Container();
  const body = new PIXI.Graphics();
  const half = TILE_SIZE / 2;

  if (modDef.id === 'exterior_platform') {
    body.beginFill(modDef.color);
    body.drawRect(-half, -half, TILE_SIZE, TILE_SIZE);
    body.endFill();

    // Railing just inside each side without an exterior neighbour
    const edge = half - RAILING_WIDTH / 2;
    body.lineStyle(RAILING_WIDTH, RAILING_COLOR);
    for (const [dx, dy, dir] of NEIGHBOURS) {
      if (visual.mask & dir) continue;
      // The side's two corners: along the side is (-dy, dx)
      body.moveTo(dx * edge - dy * half, dy * edge + dx * half);
      body.lineTo(dx * edge + dy * half, dy * edge - dx * half);
    }
  } else {
    // Railing color first, slightly wider, then the deck on top:
    // what stays visible of the railing color is the railing
    drawPath(body, visual.mask, TILE_SIZE * 0.4 + RAILING_WIDTH * 2, RAILING_COLOR);
    drawPath(body, visual.mask, TILE_SIZE * 0.4, modDef.color);
  }

  obj.addChild(body);
  obj.body = body;
  obj.x = x * TILE_SIZE + half;
  obj.y = y * TILE_SIZE + half;
  return obj;
}

// Catwalk path of `width`: a center square plus an arm to each side in `mask`
function drawPath(g, mask, width, color) {
  const half = TILE_SIZE / 2;
  const w = width / 2;

  g.beginFill(color);
  g.drawRect(-w, -w, width, width);
  if (mask & N) g.drawRect(-w, -half, width, half);
  if (mask & S) g.drawRect(-w, 0, width, half);
  if (mask & W) g.drawRect(-half, -w, half, width);
  if (mask & E) g.drawRect(0, -w, half, width);
  g.endFill();
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
function createModuleLayer(container, rampMarker = null) {
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
    if (rampMarker) rampMarker.visible = floor.floor === RAMP.floor;

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

// Thickness of a wall piece, centered on its edge
const WALL_WIDTH = Math.max(4, Math.round(TILE_SIZE * 0.14));

/**
 * All wall pieces of a floor, redrawn as a whole (a few hundred at most)
 */
function drawWallLayer(g, floor) {
  g.clear();
  for (const [side, rows] of Object.entries(floor.walls)) {
    rows.forEach((row, y) => row.forEach((type, x) => {
      if (type) drawWallPiece(g, MODULE_BY_ID[type], { x, y, side });
    }));
  }
}

/**
 * One wall piece along an edge, in its module color with a dark outline:
 * - wall: solid
 * - window: with a light line of glass along the middle
 * - door: open in the middle, with a thin door leaf across the opening
 * Pieces overlap half their width past the corners, so walls meeting there join up.
 */
function drawWallPiece(g, modDef, { x, y, side }, color = modDef.color) {
  const horizontal = side === 'N';
  const w = WALL_WIDTH;

  // Part of the edge from `from` to `to` (px along it), `width` thick
  const segment = (from, to, width = w) => horizontal
    ? g.drawRect(x * TILE_SIZE + from, y * TILE_SIZE - width / 2, to - from, width)
    : g.drawRect(x * TILE_SIZE - width / 2, y * TILE_SIZE + from, width, to - from);

  const start = -w / 2, end = TILE_SIZE + w / 2;

  g.lineStyle(1, 0x000000, 0.6);
  g.beginFill(color);
  if (modDef.door) {
    segment(start, TILE_SIZE * 0.3);
    segment(TILE_SIZE * 0.7, end);
    g.endFill();
    g.lineStyle(0);
    g.beginFill(color);
    segment(TILE_SIZE * 0.3, TILE_SIZE * 0.7, Math.max(1, w / 3));
  } else {
    segment(start, end);
    if (modDef.id === 'reinforced_window') {
      g.endFill();
      g.lineStyle(0);
      g.beginFill(0xffffff, 0.7);
      segment(TILE_SIZE * 0.1, TILE_SIZE * 0.9, Math.max(1, w / 4));
    }
  }
  g.endFill();
  g.lineStyle(0);
}

/**
 * Preview of the selected wall piece on the edge under the pointer;
 * red where it can't go
 */
function createEdgeGhost() {
  const container = new PIXI.Graphics();
  container.visible = false;
  container.alpha = 0.7;

  function show(edge, modDef, valid = true) {
    container.clear();
    drawWallPiece(container, modDef, edge, valid ? modDef.color : 0xff4d4d);
    container.visible = true;
  }

  function hide() {
    container.visible = false;
  }

  return { container, show, hide };
}

/**
 * Box drawn with Ctrl + drag: faint fill and outline, red marks on tiles
 * the module can't go, and the box size in the middle.
 * With a wall piece: the pieces along the outline instead, red where one can't go.
 */
function createBoxPreview() {
  const container = new PIXI.Container();
  container.visible = false;

  const g = new PIXI.Graphics();
  const sizeLabel = createLabel('', Math.round(TILE_SIZE * 0.5));
  container.addChild(g, sizeLabel);

  /**
   * @param box { x0, y0, x1, y1 } tile corners, inclusive
   * @param erasing red box, no per-tile marks (erasing works everywhere)
   * @param canPlaceAt (x, y) → can the selected module go there?
   * @param wall optional { piece, canWallAt }: a wall piece's outline instead
   */
  function show(box, erasing, canPlaceAt, wall = null) {
    const { x0, y0, x1, y1 } = box;
    const color = erasing ? 0xff4d4d : 0xffffff;
    const width = (x1 - x0 + 1) * TILE_SIZE;
    const height = (y1 - y0 + 1) * TILE_SIZE;

    g.clear();
    g.beginFill(color, 0.12);
    g.drawRect(x0 * TILE_SIZE, y0 * TILE_SIZE, width, height);
    g.endFill();

    if (wall && !erasing) {
      for (const edge of boxOutline(box)) {
        drawWallPiece(g, wall.piece, edge, wall.canWallAt(edge) ? wall.piece.color : 0xff4d4d);
      }
    } else if (!erasing) {
      g.lineStyle(2, 0xff4d4d);
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          if (!canPlaceAt(x, y)) g.drawRect(x * TILE_SIZE + 1, y * TILE_SIZE + 1, TILE_SIZE - 2, TILE_SIZE - 2);
        }
      }
    }

    g.lineStyle(2, color);
    g.drawRect(x0 * TILE_SIZE, y0 * TILE_SIZE, width, height);

    sizeLabel.text = `${x1 - x0 + 1} × ${y1 - y0 + 1}`;
    sizeLabel.position.set(x0 * TILE_SIZE + width / 2, y0 * TILE_SIZE + height / 2);
    container.visible = true;
  }

  function hide() {
    container.visible = false;
  }

  return { container, show, hide };
}

// Box corners from two tiles in any order: { x0, y0, x1, y1 }, inclusive
function boxBetween(from, to) {
  return {
    x0: Math.min(from.x, to.x), y0: Math.min(from.y, to.y),
    x1: Math.max(from.x, to.x), y1: Math.max(from.y, to.y),
  };
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
 * - Middle-click or Alt + click = pick the module (and rotation) from a tile
 *   (middle-drag still pans)
 * - Drag = continuous drawing
 * - Ctrl + drag = fill a box when released (with right button / Shift: erase it);
 *   Esc cancels. Stairs can't fill a box, so for them it's a normal drag.
 * - R = rotate module
 * - Wall pieces go on the edge nearest to the pointer instead of a tile:
 *   click places, drag places a straight run along that grid line,
 *   right-click / Shift removes. Ctrl + drag puts them along the outline of a
 *   box, Ctrl + right-drag clears every wall piece in it. The eyedropper picks
 *   a wall piece when the pointer is right by its edge.
 *
 * One pointer handler on the grid works out the tile (or edge) under the pointer.
 * `canPlaceAt(x, y)` / `canWallAt(edge)` tell the ghost previews whether placing is allowed there.
 */
function setupInteraction(grid, ghost, edgeGhost, boxPreview, {
  applyDraw, fillBox, pickAt, applyWall, canWallAt, pickWallAt, getModule, getRotation, setRotation, onStrokeEnd, canPlaceAt,
}) {
  let isDrawing = false;
  let isErasing = false; // stroke started with the right mouse button

  // Box being drawn with Ctrl + drag: { from, to, mode } (tiles), or null
  let box = null;

  const showBox = () => {
    const erasing = box.mode === 'remove' || getModule()?.id === EMPTY_ID;
    const wall = isWallTool() ? { piece: getModule(), canWallAt } : null;
    boxPreview.show(boxBetween(box.from, box.to), erasing, canPlaceAt, wall);
  };

  // Released: fill the box (one undo step). Esc: drop it.
  const endBox = (apply) => {
    if (apply) fillBox(boxBetween(box.from, box.to), box.mode);
    box = null;
    boxPreview.hide();
    onStrokeEnd();
    updateGhost();
  };

  // Wall pieces: the edge under the pointer, and the run being drawn:
  // { side, line, last, mode }, a straight run of edges along one grid line
  const isWallTool = () => getModule()?.kind === 'wall';
  let hoverEdge = null;
  let wallRun = null;

  // Pointer released: the stroke (click, drag, wall run or box) is complete
  const endStroke = () => {
    if (box) return endBox(true);
    if (!isDrawing) return;
    isDrawing = false;
    wallRun = null;
    onStrokeEnd();
  };

  let hoverTile = null; // { x, y } under the pointer
  let lastDrawn = null; // last tile drawn in the current stroke

  const updateGhost = () => {
    if (isWallTool()) {
      ghost.hide();
      if (hoverEdge) edgeGhost.show(hoverEdge, getModule(), canWallAt(hoverEdge));
      return;
    }

    edgeGhost.hide();
    if (hoverTile && !box) ghost.show(hoverTile.x, hoverTile.y, getModule(), getRotation(), canPlaceAt(hoverTile.x, hoverTile.y));
  };

  // Rotation hotkey
  window.addEventListener('keydown', (e) => {
    // Ignore while typing text (search box), and browser shortcuts (Ctrl+R)
    if (isTypingTarget(e.target)) return;
    if (e.key === 'Escape' && box) return endBox(false);
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

  // A box keeps its last corner, so releasing outside the grid still fills it.
  // A wall run continues when the pointer comes back.
  const leaveGrid = () => {
    hoverTile = null;
    hoverEdge = null;
    lastDrawn = null; // don't connect strokes across the outside of the grid
    ghost.hide();
    edgeGhost.hide();
  };

  // The side of the tile under the pointer nearest to it: { edge, distance } (distance in tiles)
  const nearestEdge = (e) => {
    const tile = tileAt(e);
    if (!tile) return null;

    const pos = grid.toLocal(e.global);
    const ox = pos.x / TILE_SIZE - tile.x;
    const oy = pos.y / TILE_SIZE - tile.y;
    const [distance, dx, dy] = [[oy, 0, -1], [1 - oy, 0, 1], [ox, -1, 0], [1 - ox, 1, 0]]
      .reduce((best, side) => (side[0] < best[0] ? side : best));

    return { edge: tileEdge(tile.x, tile.y, dx, dy), distance };
  };

  // Edge number `i` along the wall run's grid line
  const runEdge = (i) => (wallRun.side === 'N' ? { x: i, y: wallRun.line, side: 'N' } : { x: wallRun.line, y: i, side: 'W' });

  const startWallRun = (edge, mode) => {
    isDrawing = true;
    wallRun = edge.side === 'N'
      ? { side: 'N', line: edge.y, last: edge.x, mode }
      : { side: 'W', line: edge.x, last: edge.y, mode };

    applyWall(edge, mode);
    hoverEdge = edge;
    updateGhost();
  };

  // Follow the pointer along the run's line, also placing the edges a fast move skipped
  const continueWallRun = (e) => {
    const pos = grid.toLocal(e.global);
    const along = (wallRun.side === 'N' ? pos.x : pos.y) / TILE_SIZE;
    const i = Math.max(0, Math.min(GRID_SIZE - 1, Math.floor(along)));
    if (i === wallRun.last) return;

    const step = Math.sign(i - wallRun.last);
    for (let j = wallRun.last + step; j !== i + step; j += step) applyWall(runEdge(j), wallRun.mode);
    wallRun.last = i;

    hoverEdge = runEdge(i);
    updateGhost();
  };

  // Eyedropper: select the wall piece on the edge right by the pointer,
  // or else the module on this tile, instead of drawing
  const PICK_EDGE_DISTANCE = 0.25; // tiles
  const pick = (tile, e) => {
    const near = nearestEdge(e);
    if (!(near && near.distance <= PICK_EDGE_DISTANCE && pickWallAt(near.edge))) pickAt(tile.x, tile.y);

    hoverEdge = near?.edge ?? null;
    updateGhost();
  };

  // Middle button: a click picks, a drag pans (see setupZoomAndDrag)
  const MAX_CLICK_MOVE = 4; // px; more movement counts as a drag
  let middleDown = null; // pointer position where the middle button went down

  grid.on('pointerdown', (e) => {
    if (e.button === 1) {
      middleDown = { x: e.global.x, y: e.global.y };
      return;
    }

    // Left button places, right button erases
    if (e.button !== 0 && e.button !== 2) return;

    const tile = tileAt(e);
    if (!tile) return;

    if (e.altKey && e.button === 0) return pick(tile, e);

    // Ctrl (Cmd on Mac) + drag: a box instead of a stroke (wall pieces: its outline)
    const mode = e.button === 2 || e.shiftKey ? 'remove' : 'place';
    if ((e.ctrlKey || e.metaKey) && (mode === 'remove' || !spansTwoFloors(getModule()))) {
      box = { from: tile, to: tile, mode };
      ghost.hide();
      edgeGhost.hide();
      showBox();
      return;
    }

    if (isWallTool()) return startWallRun(nearestEdge(e).edge, mode);

    isDrawing = true;
    isErasing = e.button === 2;
    lastDrawn = null;
    drawTo(tile, e);
  });

  grid.on('pointermove', (e) => {
    const tile = tileAt(e);
    if (!tile) return leaveGrid();

    // Wall pieces follow the pointer within a tile too (a box still goes by tile)
    if (wallRun) return continueWallRun(e);
    if (isWallTool() && !box) {
      hoverTile = null; // so the module ghost shows again once another module is selected
      const { edge } = nearestEdge(e);
      if (!hoverEdge || edge.x !== hoverEdge.x || edge.y !== hoverEdge.y || edge.side !== hoverEdge.side) {
        hoverEdge = edge;
        updateGhost();
      }
      return;
    }

    // Only act when entering a new tile
    if (hoverTile && hoverTile.x === tile.x && hoverTile.y === tile.y) return;
    hoverTile = tile;

    if (box) {
      box.to = tile;
      showBox();
    } else if (isDrawing) drawTo(tile, e);
    else updateGhost();
  });

  grid.on('pointerout', leaveGrid);
  grid.on('pointerup', (e) => {
    if (e.button === 1 && middleDown) {
      const moved = Math.hypot(e.global.x - middleDown.x, e.global.y - middleDown.y);
      const tile = tileAt(e);
      if (moved <= MAX_CLICK_MOVE && tile) pick(tile, e);
    }
    endStroke();
  });
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