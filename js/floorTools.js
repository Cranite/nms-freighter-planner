import { GRID_SIZE, createEmptyWalls } from './data.js';
import { MODULE_BY_ID } from './modules.js';
import { canPlace } from './footprint.js';
import { canHaveWall, pruneWalls } from './walls.js';

/**
 * Whole-floor tools: copy, paste and clear.
 *
 * Paste and clear return a new freighter instead of changing the given
 * one, so the app can swap it in as a single undo step (like load/import).
 *
 * Stairs belong to the floor they're stored on: copying or clearing a
 * floor includes its own stairs (and so their top part on the floor
 * above), but not stairs arriving from the floor below.
 * Walls on the floor above that stood at the exit of removed stairs go too.
 */

/**
 * Copies the modules and walls stored on floor `floorNum`:
 * { floor, tiles: [[{ type, rotation }]], walls }
 */
export function copyFloor(freighter, floorNum) {
  const { tiles, walls } = structuredClone(freighter.floors[floorNum - 1]);
  return { floor: floorNum, tiles, walls };
}

/**
 * Empties floor `floorNum`. Returns the new freighter.
 */
export function clearFloor(freighter, floorNum) {
  const result = withEmptyFloor(freighter, floorNum);
  pruneWalls(result, floorNum + 1);
  return result;
}

// A copy of the freighter with floor `floorNum` empty (no modules, no walls)
function withEmptyFloor(freighter, floorNum) {
  const result = structuredClone(freighter);
  const floor = result.floors[floorNum - 1];
  for (const row of floor.tiles) {
    for (const tile of row) {
      tile.type = null;
      tile.rotation = 0;
    }
  }
  floor.walls = createEmptyWalls();
  return result;
}

/**
 * Replaces floor `floorNum` with a copied floor.
 * Modules that don't fit here are skipped: the ramp, stairs arriving
 * from the floor below, something in the way on the floor above, or
 * stairs on the top floor. Walls are pasted where they still fit with the
 * modules here (not counted in skipped). Returns { freighter, skipped }.
 */
export function pasteFloor(freighter, floorNum, copied) {
  const result = withEmptyFloor(freighter, floorNum);
  const floor = result.floors[floorNum - 1];
  const tiles = floor.tiles;
  let skipped = 0;

  for (let y = 0; y < GRID_SIZE; y++) {
    for (let x = 0; x < GRID_SIZE; x++) {
      const { type, rotation } = copied.tiles[y][x];
      const modDef = MODULE_BY_ID[type];
      if (!modDef) continue;

      // Checked against what's pasted so far, so modules can't overlap each other
      if (canPlace(result, modDef, floorNum, x, y, rotation)) {
        tiles[y][x] = { type, rotation };
      } else {
        skipped++;
      }
    }
  }

  // Walls once all modules are in, as they depend on the modules on both sides
  const floorBelow = result.floors[floorNum - 2] ?? null;
  for (const [side, rows] of Object.entries(copied.walls)) {
    rows.forEach((row, y) => row.forEach((type, x) => {
      if (type && canHaveWall(floor, floorBelow, { x, y, side })) floor.walls[side][y][x] = type;
    }));
  }
  pruneWalls(result, floorNum + 1);

  return { freighter: result, skipped };
}
