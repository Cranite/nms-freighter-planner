// Grid is square (21x21)
export const GRID_SIZE = 21;

// Number of floors in freighter
export const FLOORS = 14;


/**
 * Calculates tile size based on viewport.
 * Keeps tiles between min/max for usability.
 */
function calculateTileSize() {
  const canvasWidth = window.innerWidth - 200; // subtract UI width
  const canvasHeight = window.innerHeight;
  
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
  { id: 'storage', label: 'Storage', color: 0xf1c40f, image: 'assets/modules/storage.png' },
  { id: 'command', label: 'Command', color: 0x9b59b6, image: 'assets/modules/command.png' },
  { id: 'refiner', label: 'Refiner', color: 0xe67e22, image: 'assets/modules/refiner.png' },

  // Represents an empty tile
  { id: 'empty', label: 'Empty', color: 0x1a1a1a, image: null },
];


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
          color: null
        }))
      ),
    })),
  };
}


/**
 * Saves layout to browser localStorage
 */
export function saveFreighter(freighter) {
  localStorage.setItem('freighterLayout', JSON.stringify(freighter));
}

/**
 * Loads layout from localStorage
 */
export function loadFreighter() {
  const data = localStorage.getItem('freighterLayout');
  return data ? JSON.parse(data) : null;
}