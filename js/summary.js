import { MODULE_TYPES, MODULE_BY_ID } from './modules.js';

/**
 * Module count: how many of each module a set of floors uses, to see what
 * a plan takes to build (and later what it costs).
 *
 * - Stairs count once, on the floor they start on (only their low end is
 *   stored; the other 3 tiles are derived, see footprint.js)
 * - Each wall piece counts once: neighbouring tiles share an edge
 * - Unknown module types and the eraser are skipped
 *
 * @param {object[]} floors the floors to count (one floor, or all of them)
 * @returns {{ modDef: object, count: number }[]} modules that occur, in palette order
 */
export function countModules(floors) {
  const counts = new Map();
  const add = (id) => {
    if (!id || !MODULE_BY_ID[id] || MODULE_BY_ID[id].kind === 'eraser') return;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  };

  for (const floor of floors) {
    floor.tiles.forEach(row => row.forEach(tile => add(tile?.type)));
    Object.values(floor.walls).forEach(rows => rows.forEach(row => row.forEach(add)));
  }

  return MODULE_TYPES
    .filter(modDef => counts.has(modDef.id))
    .map(modDef => ({ modDef, count: counts.get(modDef.id) }));
}

/**
 * Totals for a count: { modules, wallPieces }. Wall pieces are kept apart:
 * a few rooms quickly take dozens of them.
 */
export function countTotals(counts) {
  let modules = 0, wallPieces = 0;
  for (const { modDef, count } of counts) {
    if (modDef.kind === 'wall') wallPieces += count;
    else modules += count;
  }
  return { modules, wallPieces };
}
