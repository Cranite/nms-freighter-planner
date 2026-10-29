import { GRID_SIZE, RAMP } from './data.js';
import { MODULE_BY_ID } from './modules.js';
import { STEP, spansTwoFloors, coveringAt, opensTowards } from './footprint.js';

/**
 * Layout validation. Problems are warnings: the planner never blocks
 * building, so half-finished plans are fine.
 *
 * Checks:
 * - Modules that can't be reached from the entrance ramp (walking through
 *   connected tiles and up/down stairs). Exterior pieces are skipped:
 *   they need a Bulkhead Door, which isn't supported yet.
 * - Storage Room numbers used more than once (each 0–9 once per freighter)
 * - Reachable stairs that lead nowhere at the bottom or the top
 *
 * Returns [{ message, locations: [{ floor, x, y }] }], sorted by floor.
 */
export function validateLayout(freighter) {
  const floors = freighter.floors;
  const floorPair = (f) => [floors[f - 1], floors[f - 2] ?? null];

  const reached = findReachable(floors, floorPair);
  const problems = [];

  // All stored modules, with the tiles they cover on their own floor
  const modules = [];
  floors.forEach((floor) => {
    for (let y = 0; y < GRID_SIZE; y++) {
      for (let x = 0; x < GRID_SIZE; x++) {
        const tile = floor.tiles[y][x];
        const modDef = MODULE_BY_ID[tile.type];
        if (!modDef || modDef.kind === 'eraser') continue;

        const locations = [{ floor: floor.floor, x, y }];
        if (spansTwoFloors(modDef)) {
          const [sx, sy] = STEP[tile.rotation];
          locations.push({ floor: floor.floor, x: x + sx, y: y + sy });
        }
        modules.push({ modDef, floor: floor.floor, x, y, rotation: tile.rotation, locations });
      }
    }
  });

  // Unreachable modules, one problem per floor
  const unreachableByFloor = new Map();
  for (const mod of modules) {
    if (mod.modDef.exterior || reached.has(cellKey(mod.floor, mod.x, mod.y))) continue;

    if (!unreachableByFloor.has(mod.floor)) unreachableByFloor.set(mod.floor, []);
    unreachableByFloor.get(mod.floor).push(mod);
  }
  for (const [floor, mods] of unreachableByFloor) {
    problems.push({
      message: `Floor ${floor}: ${mods.length} ${mods.length === 1 ? 'module' : 'modules'} can't be reached from the ramp`,
      locations: mods.flatMap(m => m.locations),
    });
  }

  // Storage Room numbers used more than once
  const storage = new Map();
  for (const mod of modules) {
    if (!mod.modDef.id.startsWith('storage_room_')) continue;
    if (!storage.has(mod.modDef.id)) storage.set(mod.modDef.id, []);
    storage.get(mod.modDef.id).push(mod);
  }
  for (const mods of storage.values()) {
    if (mods.length < 2) continue;
    problems.push({
      message: `${mods[0].modDef.label} is used ${mods.length} times (once per freighter)`,
      locations: mods.flatMap(m => m.locations),
    });
  }

  // Reachable stairs without a connection at an end
  for (const mod of modules) {
    if (!spansTwoFloors(mod.modDef) || mod.modDef.exterior || !reached.has(cellKey(mod.floor, mod.x, mod.y))) continue;

    const [sx, sy] = STEP[mod.rotation];
    const name = `${mod.modDef.label} (floor ${mod.floor})`;

    // Bottom: the tile behind the low end must open towards the stairs
    const [floor, below] = floorPair(mod.floor);
    if (!opensTowardsFrom(floor, below, mod.x - sx, mod.y - sy, sx, sy)) {
      problems.push({ message: `${name}: nothing connects at the bottom`, locations: mod.locations });
    }

    // Top: the tile past the high end, on the floor above
    const [above, aboveBelow] = floorPair(mod.floor + 1);
    if (!opensTowardsFrom(above, aboveBelow, mod.x + 2 * sx, mod.y + 2 * sy, -sx, -sy)) {
      problems.push({
        message: `${name}: nothing connects at the top (floor ${mod.floor + 1})`,
        locations: mod.locations.map(l => ({ ...l, floor: mod.floor + 1 })),
      });
    }
  }

  return problems.sort((a, b) => a.locations[0].floor - b.locations[0].floor);
}

const cellKey = (floor, x, y) => `${floor}:${x}:${y}`;
const inGrid = (x, y) => x >= 0 && x < GRID_SIZE && y >= 0 && y < GRID_SIZE;

// Tile (x, y) exists and opens towards (dx, dy)
function opensTowardsFrom(floor, floorBelow, x, y, dx, dy) {
  return !!floor && inGrid(x, y) && opensTowards(floor, floorBelow, x, y, dx, dy);
}

/**
 * All tiles you can walk to from the ramp (breadth-first search).
 * Moves: to a neighbouring tile when both open towards each other, and
 * between the low end of stairs and their exit on the floor above.
 */
function findReachable(floors, floorPair) {
  const reached = new Set([cellKey(RAMP.floor, RAMP.x, RAMP.y)]);
  const queue = [{ f: RAMP.floor, x: RAMP.x, y: RAMP.y }];

  const visit = (f, x, y) => {
    const key = cellKey(f, x, y);
    if (f < 1 || f > floors.length || !inGrid(x, y) || reached.has(key)) return;
    reached.add(key);
    queue.push({ f, x, y });
  };

  for (let i = 0; i < queue.length; i++) {
    const { f, x, y } = queue[i];
    const [floor, below] = floorPair(f);

    for (const [dx, dy] of Object.values(STEP)) {
      if (opensTowards(floor, below, x, y, dx, dy) && opensTowardsFrom(floor, below, x + dx, y + dy, -dx, -dy)) {
        visit(f, x + dx, y + dy);
      }
    }

    // Climb or descend stairs: low end ↔ high end on the floor above
    const cover = coveringAt(floor, below, x, y);
    if (cover && spansTwoFloors(cover.modDef) && !cover.modDef.exterior) {
      const [sx, sy] = STEP[cover.tile.rotation];
      if (cover.part === 'base' && cover.end === 'low') visit(f + 1, x + sx, y + sy);
      if (cover.part === 'top' && cover.end === 'high') visit(f - 1, x - sx, y - sy);
    }
  }

  return reached;
}