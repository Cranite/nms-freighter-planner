import { GRID_SIZE, FLOORS, isLockedTile } from './data.js';
import { MODULE_BY_ID } from './modules.js';

/**
 * Module footprints.
 *
 * Most modules cover their own tile. Stairs cover 4 tiles: their own
 * tile (low end) and the next tile in the climb direction (high end),
 * plus the same 2 tiles on the floor above. Only the low end is stored
 * in the layout; the other 3 tiles are derived from it.
 *
 *   floor above:  [ A' ][ B' ]   top part, you arrive at B'
 *   own floor:    [ A  ][ B  ]   enter at A, climb towards B
 */

// Climb direction per rotation (degrees): one tile step [dx, dy]; 0 = north (up)
export const STEP = { 0: [0, -1], 90: [1, 0], 180: [0, 1], 270: [-1, 0] };

export const spansTwoFloors = (modDef) => modDef?.kind === 'stairs';

const inGrid = (x, y) => x >= 0 && x < GRID_SIZE && y >= 0 && y < GRID_SIZE;

/**
 * The module covering tile (x, y) as seen on `floor`, or null.
 * `floorBelow` (may be null) is needed for stairs coming up from below.
 *
 * Returns { floorNum, x, y, tile, modDef, part, end }:
 * - floorNum/x/y: where the module is stored (its low end for stairs)
 * - part: 'base' (own floor) | 'top' (stairs from the floor below)
 * - end:  'low' (the stored tile, or the tile above it) | 'high'
 */
export function coveringAt(floor, floorBelow, x, y) {
  if (!inGrid(x, y)) return null;

  for (const [part, source] of [['base', floor], ['top', floorBelow]]) {
    if (!source) continue;

    // Low end: a module stored on this tile (on the floor below: stairs only)
    const tile = source.tiles[y][x];
    const modDef = MODULE_BY_ID[tile.type];
    if (modDef && (part === 'base' || spansTwoFloors(modDef))) {
      return { floorNum: source.floor, x, y, tile, modDef, part, end: 'low' };
    }

    // High end: stairs stored one step back, climbing towards this tile
    for (const [rotation, [dx, dy]] of Object.entries(STEP)) {
      const ax = x - dx, ay = y - dy;
      if (!inGrid(ax, ay)) continue;

      const anchor = source.tiles[ay][ax];
      const anchorDef = MODULE_BY_ID[anchor.type];
      if (spansTwoFloors(anchorDef) && anchor.rotation === Number(rotation)) {
        return { floorNum: source.floor, x: ax, y: ay, tile: anchor, modDef: anchorDef, part, end: 'high' };
      }
    }
  }
  return null;
}

/**
 * Whether you can walk out of tile (x, y) on `floor` towards (dx, dy).
 * - Entrance ramp: all sides
 * - Interior modules (corridors, rooms): all sides; neighbours connect
 *   through doorways or merge into bigger rooms
 * - Stairs: only behind their low end, and past their high end on the floor above
 * - Exterior pieces: none, they need a Bulkhead Door (not supported yet)
 * Two neighbouring tiles connect when both open towards each other.
 */
export function opensTowards(floor, floorBelow, x, y, dx, dy) {
  if (isLockedTile(floor.floor, x, y)) return true;

  const cover = coveringAt(floor, floorBelow, x, y);
  if (!cover || cover.modDef.exterior || cover.modDef.kind === 'eraser') return false;
  if (!spansTwoFloors(cover.modDef)) return true;

  const [sx, sy] = STEP[cover.tile.rotation];
  if (cover.part === 'base' && cover.end === 'low') return dx === -sx && dy === -sy;
  if (cover.part === 'top' && cover.end === 'high') return dx === sx && dy === sy;
  return false;
}

/**
 * Whether `modDef` can be placed at (x, y) on floor `floorNum`:
 * every tile of its footprint must be inside the build area, not the
 * ramp, and free. Replacing the module already stored on (x, y) is fine.
 */
export function canPlace(freighter, modDef, floorNum, x, y, rotation) {
  const floors = freighter.floors;
  const isOwnTile = (cover) => cover.floorNum === floorNum && cover.x === x && cover.y === y;

  const tiles = [{ f: floorNum, x, y }];
  if (spansTwoFloors(modDef)) {
    if (floorNum >= FLOORS) return false; // nothing above to climb to

    const [dx, dy] = STEP[rotation];
    tiles.push({ f: floorNum, x: x + dx, y: y + dy }, { f: floorNum + 1, x, y }, { f: floorNum + 1, x: x + dx, y: y + dy });
  }

  return tiles.every(({ f, x: tx, y: ty }) => {
    if (!inGrid(tx, ty) || isLockedTile(f, tx, ty)) return false;

    const cover = coveringAt(floors[f - 1], floors[f - 2] ?? null, tx, ty);
    return !cover || isOwnTile(cover);
  });
}