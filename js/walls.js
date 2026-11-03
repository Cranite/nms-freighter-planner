import { GRID_SIZE } from './data.js';
import { coveringAt, opensTowards, spansTwoFloors, stairsOpenTowards } from './footprint.js';

/**
 * Wall pieces: Internal Freighter Wall, Reinforced Window, Bulkhead Door.
 *
 * They sit on the edge between two tiles. An edge is { x, y, side }:
 * side 'N' is the north side of tile (x, y), 'W' its west side. The south
 * and east sides are the N / W edge of the next tile (see tileEdge), so
 * every edge has one name and is stored once (floor.walls, see data.js).
 *
 * In game a wall piece needs the interior on at least one side:
 * - Rooms, corridors and the ramp take one on all 4 sides: also between two
 *   tiles of a merged room, and across the doorways between rooms and corridors
 * - Stairs only at their entrance and exit, not along their sides
 * - Never between two exterior pieces, or an exterior piece and empty space
 */

// The edge on side (dx, dy) of tile (x, y)
export function tileEdge(x, y, dx, dy) {
  if (dy === -1) return { x, y, side: 'N' };
  if (dy === 1) return { x, y: y + 1, side: 'N' };
  if (dx === -1) return { x, y, side: 'W' };
  return { x: x + 1, y, side: 'W' };
}

/**
 * The two tiles an edge separates, each with the direction (dx, dy)
 * towards the other. On the outer border one of them is outside the grid.
 */
export function edgeTiles({ x, y, side }) {
  return side === 'N'
    ? [{ x, y: y - 1, dx: 0, dy: 1 }, { x, y, dx: 0, dy: -1 }]
    : [{ x: x - 1, y, dx: 1, dy: 0 }, { x, y, dx: -1, dy: 0 }];
}

export const getWall = (floor, { x, y, side }) => floor.walls[side][y][x];

export function setWall(floor, { x, y, side }, type) {
  floor.walls[side][y][x] = type;
}

const inGrid = (x, y) => x >= 0 && x < GRID_SIZE && y >= 0 && y < GRID_SIZE;

// Does the edge exist? N edges have one extra row, W edges one extra column
function isEdge({ x, y, side }) {
  return side === 'N'
    ? x >= 0 && x < GRID_SIZE && y >= 0 && y <= GRID_SIZE
    : x >= 0 && x <= GRID_SIZE && y >= 0 && y < GRID_SIZE;
}

/**
 * Whether a wall piece can go on `edge` of `floor` (`floorBelow` may be
 * null; it's needed for stairs coming up from it):
 * an interior tile opens towards the edge on at least one side, and
 * neither side is the closed side of stairs.
 */
export function canHaveWall(floor, floorBelow, edge) {
  if (!isEdge(edge)) return false;

  const sides = edgeTiles(edge).filter(t => inGrid(t.x, t.y));
  if (!sides.some(t => opensTowards(floor, floorBelow, t.x, t.y, t.dx, t.dy))) return false;

  return !sides.some(t => {
    const cover = coveringAt(floor, floorBelow, t.x, t.y);
    return spansTwoFloors(cover?.modDef) && !stairsOpenTowards(cover, t.dx, t.dy);
  });
}

// Every edge around the tiles of an area { x0, y0, x1, y1 } (inclusive, clamped to the grid)
function* edgesAround({ x0, y0, x1, y1 }) {
  x0 = Math.max(x0, 0);
  y0 = Math.max(y0, 0);
  x1 = Math.min(x1, GRID_SIZE - 1);
  y1 = Math.min(y1, GRID_SIZE - 1);

  for (let y = y0; y <= y1 + 1; y++) {
    for (let x = x0; x <= x1; x++) yield { x, y, side: 'N' };
  }
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1 + 1; x++) yield { x, y, side: 'W' };
  }
}

const WHOLE_FLOOR = { x0: 0, y0: 0, x1: GRID_SIZE - 1, y1: GRID_SIZE - 1 };

/**
 * Removes the walls on floor `floorNum` whose edge can no longer hold one,
 * like the walls of a room that was removed. Only the edges around `area`
 * are checked (default: the whole floor).
 * Returns what was removed: [{ floor, edge, before }]
 */
export function pruneWalls(freighter, floorNum, area = WHOLE_FLOOR) {
  const floor = freighter.floors[floorNum - 1];
  if (!floor) return [];

  const floorBelow = freighter.floors[floorNum - 2] ?? null;
  const removed = [];

  for (const edge of edgesAround(area)) {
    const type = getWall(floor, edge);
    if (!type || canHaveWall(floor, floorBelow, edge)) continue;

    setWall(floor, edge, null);
    removed.push({ floor: floorNum, edge, before: type });
  }
  return removed;
}

/**
 * pruneWalls after the module stored on tile (x, y) of floor `floorNum`
 * changed. Stairs reach one tile further and also cover the floor above,
 * so that's checked too.
 */
export function pruneWallsAround(freighter, floorNum, x, y) {
  const area = { x0: x - 2, y0: y - 2, x1: x + 2, y1: y + 2 };
  return [...pruneWalls(freighter, floorNum, area), ...pruneWalls(freighter, floorNum + 1, area)];
}

// pruneWalls on every floor, e.g. for a loaded layout
export function pruneAllWalls(freighter) {
  return freighter.floors.flatMap(floor => pruneWalls(freighter, floor.floor));
}
