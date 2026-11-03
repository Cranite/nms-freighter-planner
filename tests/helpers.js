import { createEmptyFreighter } from '../js/data.js';

/**
 * Builds a freighter for a test: { floorNumber: [[x, y, type, rotation?], ...] }
 *
 *   layout({ 1: [[10, 3, 'freighter_corridor']], 2: [[5, 5, 'freighter_stairs', 90]] })
 */
export function layout(placements = {}) {
  const freighter = createEmptyFreighter();
  for (const [floorNum, modules] of Object.entries(placements)) {
    for (const [x, y, type, rotation = 0] of modules) {
      freighter.floors[floorNum - 1].tiles[y][x] = { type, rotation };
    }
  }
  return freighter;
}

// Floor `floorNum` and the floor below it, as most footprint functions want them
export function floorPair(freighter, floorNum) {
  return [freighter.floors[floorNum - 1], freighter.floors[floorNum - 2] ?? null];
}

// Short names for the directions (dx, dy)
export const NORTH = [0, -1], EAST = [1, 0], SOUTH = [0, 1], WEST = [-1, 0];
