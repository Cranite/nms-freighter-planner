import { TILE_SIZE, GRID_SIZE, MODULE_TYPES  } from './data.js';

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
  const app = new PIXI.Application({
    width: window.innerWidth - 200,
    height: window.innerHeight,
    background: '#000',
    antialias: true,
  });

  document.getElementById('canvasContainer').appendChild(app.view);

  await loadTextures();

  return initRenderer(app);
}

/**
 * Scene graph structure:
 * stageContainer
 *   ├─ gridContainer   (static grid)
 *   ├─ moduleContainer (placed modules)
 *   └─ ghostContainer  (preview module)
 */
function initRenderer(app) {
  const gridContainer = new PIXI.Container();
  const moduleContainer = new PIXI.Container();
  const ghostContainer = new PIXI.Container();
  const stageContainer = new PIXI.Container();

  stageContainer.addChild(gridContainer);
  stageContainer.addChild(moduleContainer);
  stageContainer.addChild(ghostContainer);
  app.stage.addChild(stageContainer);

  drawGrid(gridContainer);

  // Center and enable camera controls
  centerStage(stageContainer, app);
  setupZoomAndDrag(app, stageContainer);

  // Pivot centered → zoom around center
  stageContainer.pivot.set(
    (GRID_SIZE * TILE_SIZE) / 2,
    (GRID_SIZE * TILE_SIZE) / 2
  );
  
  return {
    drawModules: (floor) => drawModules(moduleContainer, floor),
    setupInteraction: (applyDraw, getModule, getRotation, setRotation) => setupInteraction(gridContainer, applyDraw, getModule, getRotation, setRotation, ghostContainer),
    drawGhost: (tileX, tileY, module, rotation) => drawGhost(ghostContainer, tileX, tileY, module, rotation),
  };
}

/**
 * Draw empty grid
 */
function drawGrid(container) {
  for (let y = 0; y < GRID_SIZE; y++) {
    for (let x = 0; x < GRID_SIZE; x++) {
      const g = new PIXI.Graphics();
      g.lineStyle(1, 0x333333);
      g.beginFill(0x1a1a1a);
      g.drawRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
      g.endFill();
      container.addChild(g);
    }
  }
}

/**
 * Renders all modules for a floor.
 * Uses texture if available, fallback to colored rectangle otherwise.
 */
function drawModules(container, floor) {
  container.removeChildren();

  for (let y = 0; y < GRID_SIZE; y++) {
    for (let x = 0; x < GRID_SIZE; x++) {

      const tile = floor.tiles[y][x];
      if (!tile.type) continue;

      const modDef = MODULE_TYPES.find(m => m.id === tile.type);
      const texture = textureCache[tile.type];

      if (texture) {
        const sprite = new PIXI.Sprite(texture);

        // Centered positioning (important for rotation)
        sprite.anchor.set(0.5);

        sprite.x = x * TILE_SIZE + TILE_SIZE / 2;
        sprite.y = y * TILE_SIZE + TILE_SIZE / 2;

        sprite.width = TILE_SIZE;
        sprite.height = TILE_SIZE;

        // Convert degrees → radians
        sprite.rotation = (tile.rotation || 0) * Math.PI / 180;

        container.addChild(sprite);

      } else {
        // Fallback rendering
        const g = new PIXI.Graphics();
        g.beginFill(modDef.color || 0x33aaff);
        g.drawRect(
          x * TILE_SIZE + 2,
          y * TILE_SIZE + 2,
          TILE_SIZE - 4,
          TILE_SIZE - 4
        );
        g.endFill();

        container.addChild(g);
      }
    }
  }
}


/**
 * Draw ghost module on grid
 */
function drawGhost(container, x, y, module, rotation) {
  if (!container) return;
  container.removeChildren();
  
  if (!module) return;

  const texture = textureCache[module.id];

  let sprite;

  if (texture) {
    sprite = new PIXI.Sprite(texture);
  } else {
    // fallback color block
    sprite = new PIXI.Graphics();
    sprite.beginFill(module.color || 0xffffff, 0.5);
    sprite.drawRect(-TILE_SIZE/2, -TILE_SIZE/2, TILE_SIZE, TILE_SIZE);
    sprite.endFill();
  }

  // Center-based positioning
  sprite.anchor?.set?.(0.5);

  sprite.x = x * TILE_SIZE + TILE_SIZE / 2;
  sprite.y = y * TILE_SIZE + TILE_SIZE / 2;

  sprite.width = TILE_SIZE;
  sprite.height = TILE_SIZE;

  sprite.alpha = 0.5; // transparency

  sprite.rotation = (rotation || 0) * Math.PI / 180;

  container.addChild(sprite);
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
 */
function setupInteraction(container, applyDraw, getModule, getRotation, setRotation, ghostContainer) {
  let isDrawing = false;
  let drawMode = 'place';

  let hoverTile = { x: null, y: null };

  // Rotation hotkey
  window.addEventListener('keydown', (e) => {
    if (e.key.toLowerCase() === 'r') {
      const newRotation = (getRotation() + 90) % 360;
      setRotation(newRotation);

      // Update ghost preview
      if (hoverTile.x !== null) {
        drawGhost(ghostContainer, hoverTile.x, hoverTile.y, getModule(), getRotation());
      }
    }
  });

  container.interactiveChildren = true;

  container.children.forEach((g, index) => {
    const x = index % GRID_SIZE;
    const y = Math.floor(index / GRID_SIZE);

    g.interactive = true;
    g.on('pointerdown', (e) => {
      if (e.button !== 0) return;
      isDrawing = true;
      drawMode = e.data.originalEvent.shiftKey ? 'remove' : 'place';
      applyDraw(x, y, drawMode);
    });
    g.on('pointerover', (e) => {
      hoverTile.x = x;
      hoverTile.y = y;

      drawGhost(ghostContainer, x, y, getModule(), getRotation());

      if (isDrawing) {
        drawMode = e.data.originalEvent.shiftKey ? 'remove' : 'place';
        applyDraw(x, y, drawMode);
      }
    });
    g.on('pointerup', () => (isDrawing = false));
    g.on('pointerupoutside', () => (isDrawing = false));
  });

  container.on('pointerout', () => { 
    hoverTile.x = null;
    hoverTile.y = null;
    drawGhost(ghostContainer, null, null, null, null); 
  });

  window.addEventListener('mouseup', () => (isDrawing = false));
}