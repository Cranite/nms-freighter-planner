import { test } from 'node:test';
import assert from 'node:assert/strict';
import { countModules, countTotals } from '../js/summary.js';
import { setWall, tileEdge } from '../js/walls.js';
import { layout, EAST, SOUTH } from './helpers.js';

// { id: count } for easy comparing
const asObject = (counts) => Object.fromEntries(counts.map(({ modDef, count }) => [modDef.id, count]));

test('an empty layout counts nothing', () => {
  const freighter = layout();
  assert.deepEqual(countModules(freighter.floors), []);
  assert.deepEqual(countTotals([]), { modules: 0, wallPieces: 0 });
});

test('modules are counted per type', () => {
  const freighter = layout({ 1: [[10, 0, 'freighter_corridor'], [10, 1, 'freighter_corridor'], [11, 1, 'scanner_room']] });
  assert.deepEqual(asObject(countModules(freighter.floors)), { freighter_corridor: 2, scanner_room: 1 });
});

test('stairs count once, on the floor they start on', () => {
  const freighter = layout({ 2: [[5, 5, 'freighter_stairs', 90]] });
  assert.deepEqual(asObject(countModules([freighter.floors[1]])), { freighter_stairs: 1 });
  assert.deepEqual(countModules([freighter.floors[2]]), []); // they arrive on floor 3
  assert.deepEqual(asObject(countModules(freighter.floors)), { freighter_stairs: 1 });
});

test('wall pieces count once per edge', () => {
  const freighter = layout({ 1: [[10, 0, 'freighter_corridor'], [11, 0, 'scanner_room']] });
  const floor = freighter.floors[0];
  setWall(floor, tileEdge(10, 0, ...EAST), 'bulkhead_door');
  setWall(floor, tileEdge(10, 0, ...SOUTH), 'internal_wall');
  setWall(floor, tileEdge(11, 0, ...SOUTH), 'internal_wall');

  const counts = countModules(freighter.floors);
  assert.deepEqual(asObject(counts), { freighter_corridor: 1, scanner_room: 1, internal_wall: 2, bulkhead_door: 1 });
  assert.deepEqual(countTotals(counts), { modules: 2, wallPieces: 3 });
});

test('the count follows the palette order', () => {
  const freighter = layout({ 1: [[3, 3, 'nutrition_room'], [4, 3, 'scanner_room'], [5, 3, 'freighter_corridor']] });
  assert.deepEqual(countModules(freighter.floors).map(c => c.modDef.id), ['freighter_corridor', 'scanner_room', 'nutrition_room']);
});

test('floors add up', () => {
  const freighter = layout({ 1: [[3, 3, 'refiner_room']], 4: [[3, 3, 'refiner_room'], [4, 3, 'refiner_room']] });
  assert.deepEqual(asObject(countModules(freighter.floors)), { refiner_room: 3 });
  assert.deepEqual(asObject(countModules([freighter.floors[3]])), { refiner_room: 2 });
});

test('unknown module types are skipped', () => {
  const freighter = layout({ 1: [[3, 3, 'no_such_module'], [4, 3, 'scanner_room']] });
  assert.deepEqual(asObject(countModules(freighter.floors)), { scanner_room: 1 });
});
