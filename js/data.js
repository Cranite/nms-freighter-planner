import { MODULE_BY_ID, EMPTY_ID } from './modules.js';

// Grid is square (21x21, capital freighter)
export const GRID_SIZE = 21;

// Number of floors in freighter
export const FLOORS = 14;


/**
 * Calculates tile size based on viewport.
 * Keeps tiles between min/max for usability.
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

export const TILE_SIZE = calculateTileSize();

/**
 * Entrance ramp from the bridge: the one tile on a capital freighter
 * that can't be built on. Floor 1, centre column, two rows from the
 * bridge-side build limit (top of the grid = towards the bridge).
 */
export const RAMP = { floor: 1, x: (GRID_SIZE - 1) / 2, y: 2 };

export function isLockedTile(floor, x, y) {
  return floor === RAMP.floor && x === RAMP.x && y === RAMP.y;
}

const ROTATIONS = [0, 90, 180, 270];


/**
 * Creates empty freighter structure:
 * floors -> grid -> tiles
 */
export function createEmptyFreighter() {
  return {
    floors: Array.from({ length: FLOORS }, (_, i) => ({
      floor: i + 1,

      // 2D grid of tiles
      tiles: Array.from({ length: GRID_SIZE }, () =>
        Array.from({ length: GRID_SIZE }, () => ({
          type: null,
          rotation: 0
        }))
      ),
    })),
  };
}


/**
 * Save format
 *
 * {
 *   app: 'nms-freighter-planner',
 *   version: 2,
 *   floors: [{ floor: 1, tiles: [[null | { type, rotation }, ...], ...] }, ...]
 * }
 *
 * Bump SAVE_VERSION when the format changes (incl. renamed module ids)
 * and add a migration from the previous version to MIGRATIONS.
 */
export const SAVE_VERSION = 2;
const SAVE_APP_ID = 'nms-freighter-planner';
const STORAGE_KEY = 'freighterLayout';
const AUTOSAVE_KEY = 'freighterAutosave';

/**
 * Migrations: MIGRATIONS[n] upgrades version n → n + 1
 */
const MIGRATIONS = {
  // v0: raw in-memory state, no version field, empty tiles as { type: null }
  0: (data) => ({
    ...data,
    floors: data.floors.map(floor => ({
      ...floor,
      tiles: Array.isArray(floor?.tiles)
        ? floor.tiles.map(row => Array.isArray(row) ? row.map(t => (t?.type ? t : null)) : row)
        : floor?.tiles,
    })),
  }),

  // v1: placeholder modules → wiki-based modules (corridors now shape themselves)
  1: (data) => ({
    ...data,
    floors: data.floors.map(floor => ({
      ...floor,
      tiles: Array.isArray(floor?.tiles)
        ? floor.tiles.map(row => Array.isArray(row)
          ? row.map(t => (t?.type && V1_MODULE_IDS[t.type] ? { type: V1_MODULE_IDS[t.type], rotation: 0 } : t))
          : row)
        : floor?.tiles,
    })),
  }),
};

// Old (v1) module id → new module id
const V1_MODULE_IDS = {
  corridor_1: 'freighter_corridor',
  corridor_2: 'freighter_corridor',
  corridor_3: 'freighter_corridor',
  corridor_4: 'freighter_corridor',
  storage: 'storage_room_0',
  command: 'fleet_command_room',
  refiner: 'refiner_room',
};

/**
 * Converts freighter state to a versioned JSON string
 */
export function serializeFreighter(freighter) {
  return JSON.stringify({
    app: SAVE_APP_ID,
    version: SAVE_VERSION,
    floors: freighter.floors.map(floor => ({
      floor: floor.floor,
      tiles: floor.tiles.map(row =>
        row.map(tile => (tile.type ? { type: tile.type, rotation: tile.rotation || 0 } : null))
      ),
    })),
  });
}

/**
 * Parses a saved/exported layout.
 * Copies tiles into a fresh freighter, so a corrupt or outdated
 * file (wrong grid size, unknown module ids) can't break rendering.
 *
 * @returns {{ freighter: object, skipped: number }} skipped = tiles with unknown module types
 * @throws {Error} with a user-facing message if the data is unusable
 */
export function deserializeFreighter(json) {
  let data;
  try {
    data = JSON.parse(json);
  } catch {
    throw new Error('File is not valid JSON.');
  }

  if (data?.app !== undefined && data.app !== SAVE_APP_ID) {
    throw new Error('This is not a freighter planner layout.');
  }

  let version = data?.version ?? 0;
  if (!Number.isInteger(version) || version < 0) {
    throw new Error('Layout has an invalid version.');
  }
  if (version > SAVE_VERSION) {
    throw new Error('Layout was made with a newer version of the planner.');
  }
  if (!Array.isArray(data?.floors)) {
    throw new Error('This is not a freighter planner layout.');
  }

  while (version < SAVE_VERSION) {
    data = MIGRATIONS[version](data);
    version++;
  }

  const freighter = createEmptyFreighter();
  let skipped = 0;

  freighter.floors.forEach((floor, f) => {
    const savedRows = data.floors[f]?.tiles;
    if (!Array.isArray(savedRows)) return;

    floor.tiles.forEach((row, y) => {
      row.forEach((tile, x) => {
        const saved = savedRows[y]?.[x];
        if (!saved?.type || saved.type === EMPTY_ID || isLockedTile(floor.floor, x, y)) return;

        const modDef = MODULE_BY_ID[saved.type];
        if (!modDef) {
          skipped++;
          return;
        }

        tile.type = saved.type;
        tile.rotation = modDef.rotatable && ROTATIONS.includes(saved.rotation) ? saved.rotation : 0;
      });
    });
  });

  return { freighter, skipped };
}

/**
 * Saves layout to browser localStorage
 */
export function saveFreighter(freighter) {
  localStorage.setItem(STORAGE_KEY, serializeFreighter(freighter));
}

/**
 * Loads layout from localStorage.
 * Returns null if nothing is saved; throws like deserializeFreighter if unusable.
 */
export function loadFreighter() {
  const raw = localStorage.getItem(STORAGE_KEY);
  return raw ? deserializeFreighter(raw) : null;
}

/**
 * Auto-save: the current work, kept in its own slot so the manual
 * Save/Load checkpoint isn't overwritten.
 * Failures (storage full or blocked) only warn; the app keeps working.
 */
export function autosaveFreighter(freighter) {
  try {
    localStorage.setItem(AUTOSAVE_KEY, serializeFreighter(freighter));
  } catch (err) {
    console.warn('⚠️ Auto-save failed', err);
  }
}

/**
 * Restores the auto-saved layout; null if there is none or it's unusable
 */
export function loadAutosave() {
  try {
    const raw = localStorage.getItem(AUTOSAVE_KEY);
    return raw ? deserializeFreighter(raw).freighter : null;
  } catch (err) {
    console.warn('⚠️ Auto-saved layout could not be restored', err);
    return null;
  }
}