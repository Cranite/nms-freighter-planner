// Grid is square (21x21)
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

// Module id that acts as an eraser
export const EMPTY_ID = 'empty';


/**
 * Defines all module types.
 * Each module has:
 * - id (internal identifier)
 * - label (UI display)
 * - color fallback (if texture fails)
 * - image (optional texture)
 */
export const MODULE_TYPES = [
  { id: 'corridor_1', label: 'Corridor straight', color: 0x3498db, image: 'assets/modules/corridor_straight.png' },
  { id: 'corridor_2', label: 'Corridor corner', color: 0x3498db, image: 'assets/modules/corridor_corner.png' },
  { id: 'corridor_3', label: 'Corridor t-junction', color: 0x3498db, image: 'assets/modules/corridor_t.png' },
  { id: 'corridor_4', label: 'Corridor cross', color: 0x3498db, image: 'assets/modules/corridor_cross.png' },
  // No textures yet → color fallback
  { id: 'storage', label: 'Storage', color: 0xf1c40f, image: null },
  { id: 'command', label: 'Command', color: 0x9b59b6, image: null },
  { id: 'refiner', label: 'Refiner', color: 0xe67e22, image: null },

  // Eraser: placing it clears the tile
  { id: EMPTY_ID, label: 'Empty', color: 0x1a1a1a, image: null },
];

// Lookup by id (undefined for unknown/removed module types)
export const MODULE_BY_ID = Object.fromEntries(MODULE_TYPES.map(m => [m.id, m]));

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
 *   version: 1,
 *   floors: [{ floor: 1, tiles: [[null | { type, rotation }, ...], ...] }, ...]
 * }
 *
 * Bump SAVE_VERSION when the format changes and add a migration
 * from the previous version to MIGRATIONS.
 */
export const SAVE_VERSION = 1;
const SAVE_APP_ID = 'nms-freighter-planner';
const STORAGE_KEY = 'freighterLayout';

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
        if (!saved?.type || saved.type === EMPTY_ID) return;

        if (!MODULE_BY_ID[saved.type]) {
          skipped++;
          return;
        }

        tile.type = saved.type;
        tile.rotation = ROTATIONS.includes(saved.rotation) ? saved.rotation : 0;
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