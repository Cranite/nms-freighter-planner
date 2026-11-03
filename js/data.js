import { MODULE_BY_ID, EMPTY_ID } from './modules.js';

// Grid is square (21x21, capital freighter)
export const GRID_SIZE = 21;

// Number of floors in freighter
export const FLOORS = 14;

/**
 * The bridge, where you walk in from: just outside the build area, north of
 * the centre column on floor 1 (top of the grid = towards the bridge).
 * The way in is the north edge of tile (BRIDGE.x, 0); the whole grid can be built on.
 */
export const BRIDGE = { floor: 1, x: (GRID_SIZE - 1) / 2, y: -1 };

export function isBridge(floor, x, y) {
  return floor === BRIDGE.floor && x === BRIDGE.x && y === BRIDGE.y;
}

const ROTATIONS = [0, 90, 180, 270];


/**
 * Creates empty freighter structure:
 * floors -> grid -> tiles, plus the walls on the edges between tiles
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

      walls: createEmptyWalls(),
    })),
  };
}

/**
 * Wall pieces on the edges between tiles. Neighbouring tiles share an edge,
 * so each edge is stored once:
 * - N[y][x]: north side of tile (x, y); row GRID_SIZE is the south side of the last row
 * - W[y][x]: west side of tile (x, y); column GRID_SIZE is the east side of the last column
 * Values: a wall piece's module id, or null. See walls.js for the rules.
 */
export function createEmptyWalls() {
  return {
    N: Array.from({ length: GRID_SIZE + 1 }, () => Array(GRID_SIZE).fill(null)),
    W: Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE + 1).fill(null)),
  };
}

// Size of each wall grid: [rows, columns]
const WALL_GRID_SIZE = { N: [GRID_SIZE + 1, GRID_SIZE], W: [GRID_SIZE, GRID_SIZE + 1] };


/**
 * Save format
 *
 * {
 *   app: 'nms-freighter-planner',
 *   version: 1,
 *   floors: [{
 *     floor: 1,
 *     tiles: [[null | { type, rotation }, ...], ...],
 *     walls: [[x, y, 'N' | 'W', type], ...]   only the edges with a wall piece
 *   }, ...]
 * }
 *
 * Once layouts are in use: bump SAVE_VERSION when the format changes
 * (incl. renamed module ids) and add a migration to MIGRATIONS.
 */
export const SAVE_VERSION = 1;
const SAVE_APP_ID = 'nms-freighter-planner';
const STORAGE_KEY = 'freighterLayout';
const AUTOSAVE_KEY = 'freighterAutosave';

/**
 * Migrations: MIGRATIONS[n] upgrades version n → n + 1 (none yet)
 */
const MIGRATIONS = {};

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
      walls: Object.entries(floor.walls).flatMap(([side, rows]) =>
        rows.flatMap((row, y) => row.flatMap((type, x) => (type ? [[x, y, side, type]] : [])))
      ),
    })),
  });
}

/**
 * Parses a saved/exported layout.
 * Copies tiles into a fresh freighter, so a corrupt or outdated
 * file (wrong grid size, unknown module ids) can't break rendering.
 *
 * Walls are only checked for their shape here; whether an edge may hold
 * one depends on the modules around it (pruneWalls in walls.js).
 *
 * @returns {{ freighter: object, skipped: number }} skipped = tiles and walls with unknown module types
 * @throws {Error} with a user-facing message if the data is unusable
 */
export function deserializeFreighter(json) {
  let data;
  try {
    data = JSON.parse(json);
  } catch {
    throw new Error('File is not valid JSON.');
  }

  if (data?.app !== SAVE_APP_ID || !Array.isArray(data.floors)) {
    throw new Error('This is not a freighter planner layout.');
  }

  let version = data.version;
  if (!Number.isInteger(version) || version < 1) {
    throw new Error('Layout has an invalid version.');
  }
  if (version > SAVE_VERSION) {
    throw new Error('Layout was made with a newer version of the planner.');
  }

  while (version < SAVE_VERSION) {
    if (!MIGRATIONS[version]) throw new Error('Layout version is no longer supported.');
    data = MIGRATIONS[version](data);
    version++;
  }

  const freighter = createEmptyFreighter();
  let skipped = 0;

  freighter.floors.forEach((floor, f) => {
    const savedWalls = data.floors[f]?.walls;
    if (Array.isArray(savedWalls)) skipped += loadWalls(floor.walls, savedWalls);

    const savedRows = data.floors[f]?.tiles;
    if (!Array.isArray(savedRows)) return;

    floor.tiles.forEach((row, y) => {
      row.forEach((tile, x) => {
        const saved = savedRows[y]?.[x];
        if (!saved?.type || saved.type === EMPTY_ID) return;

        // Wall pieces belong on edges, not tiles
        const modDef = MODULE_BY_ID[saved.type];
        if (!modDef || modDef.kind === 'wall') {
          skipped++;
          return;
        }

        // Stairs on the top floor have nothing to climb to
        if (modDef.kind === 'stairs' && floor.floor === FLOORS) return;

        tile.type = saved.type;
        tile.rotation = modDef.rotatable && ROTATIONS.includes(saved.rotation) ? saved.rotation : 0;
      });
    });
  });

  return { freighter, skipped };
}

/**
 * Copies saved walls [[x, y, side, type], ...] into a floor's wall grids.
 * Entries of the wrong shape are ignored. Returns the number of
 * entries with an unknown wall piece.
 */
function loadWalls(walls, saved) {
  let skipped = 0;

  for (const entry of saved) {
    if (!Array.isArray(entry)) continue;

    const [x, y, side, type] = entry;
    const size = Object.hasOwn(WALL_GRID_SIZE, side) && WALL_GRID_SIZE[side];
    if (!size || !Number.isInteger(x) || !Number.isInteger(y) || y < 0 || y >= size[0] || x < 0 || x >= size[1]) continue;

    if (MODULE_BY_ID[type]?.kind === 'wall') {
      walls[side][y][x] = type;
    } else {
      skipped++;
    }
  }
  return skipped;
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