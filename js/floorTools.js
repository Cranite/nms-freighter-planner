import { GRID_SIZE } from './data.js';
import { MODULE_BY_ID } from './modules.js';
import { canPlace } from './footprint.js';

/**
 * Whole-floor tools: copy, paste and clear.
 *
 * Paste and clear return a new freighter instead of changing the given
 * one, so the app can swap it in as a single undo step (like load/import).
 *
 * Stairs belong to the floor they're stored on: copying or clearing a
 * floor includes its own stairs (and so their top part on the floor
 * above), but not stairs arriving from the floor below.
 */

/**
 * Copies the modules stored on floor `floorNum`:
 * { floor, tiles: [[{ type, rotation }]] }
 */
export function copyFloor(freighter, floorNum) {
  const tiles = freighter.floors[floorNum - 1].tiles.map(row => row.map(tile => ({ ...tile })));
  return { floor: floorNum, tiles };
}

/**
 * Empties floor `floorNum`. Returns the new freighter.
 */
export function clearFloor(freighter, floorNum) {
  const result = structuredClone(freighter);
  for (const row of result.floors[floorNum - 1].tiles) {
    for (const tile of row) {
      tile.type = null;
      tile.rotation = 0;
    }
  }
  return result;
}

/**
 * Replaces floor `floorNum` with a copied floor.
 * Modules that don't fit here are skipped: the ramp, stairs arriving
 * from the floor below, something in the way on the floor above, or
 * stairs on the top floor. Returns { freighter, skipped }.
 */
export function pasteFloor(freighter, floorNum, copied) {
  const result = clearFloor(freighter, floorNum);
  const tiles = result.floors[floorNum - 1].tiles;
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

  return { freighter: result, skipped };
}
