import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateLayout } from '../js/validation.js';
import { layout } from './helpers.js';

// The ramp is at (10, 2) on floor 1; (10, 3) is the tile just south of it

test('an empty freighter has no problems', () => {
  assert.deepEqual(validateLayout(layout()), []);
});

test('modules connected to the ramp are fine', () => {
  const freighter = layout({ 1: [[10, 3, 'freighter_corridor'], [10, 4, 'scanner_room'], [11, 4, 'teleport_chamber']] });
  assert.deepEqual(validateLayout(freighter), []);
});

test('modules not connected to the ramp are reported, per floor', () => {
  const freighter = layout({ 1: [[3, 15, 'scanner_room'], [4, 15, 'teleport_chamber']] });
  const problems = validateLayout(freighter);

  assert.equal(problems.length, 1);
  assert.equal(problems[0].message, "Floor 1: 2 modules can't be reached from the ramp");
  assert.deepEqual(problems[0].locations, [{ floor: 1, x: 3, y: 15 }, { floor: 1, x: 4, y: 15 }]);
});

test('exterior pieces are not reported as unreachable (they need a Bulkhead Door)', () => {
  const freighter = layout({ 1: [[3, 15, 'exterior_catwalk'], [4, 15, 'exterior_platform']] });
  assert.deepEqual(validateLayout(freighter), []);
});

test('a storage room number used twice is reported', () => {
  const freighter = layout({ 1: [[10, 3, 'storage_room_3'], [10, 4, 'storage_room_3'], [10, 5, 'storage_room_4']] });
  const problems = validateLayout(freighter);

  assert.equal(problems.length, 1);
  assert.equal(problems[0].message, 'Storage Room 3 is used 2 times (once per freighter)');
});

// Stairs at (10, 4) climbing south: entered from the corridor at (10, 3),
// they arrive at (10, 5) on floor 2, so the exit is (10, 6) on floor 2
const stairsFromRamp = { 1: [[10, 3, 'freighter_corridor'], [10, 4, 'freighter_stairs', 180]] };

test('stairs lead to modules on the floor above', () => {
  const freighter = layout({ ...stairsFromRamp, 2: [[10, 6, 'scanner_room']] });
  assert.deepEqual(validateLayout(freighter), []);
});

test('reachable stairs with nothing at the top are reported', () => {
  const problems = validateLayout(layout(stairsFromRamp));
  assert.equal(problems.length, 1);
  assert.equal(problems[0].message, 'Freighter Stairs (floor 1): nothing connects at the top (floor 2)');
  assert.equal(problems[0].locations[0].floor, 2);
});

test('a module next to the side of stairs is not connected to them', () => {
  // (11, 5) touches the high end from the side; stairs only open at their ends
  const freighter = layout({ ...stairsFromRamp, 2: [[10, 6, 'scanner_room']] });
  freighter.floors[0].tiles[5][11] = { type: 'teleport_chamber', rotation: 0 };

  const problems = validateLayout(freighter);
  assert.equal(problems.length, 1);
  assert.match(problems[0].message, /Floor 1: 1 module can't be reached/);
});

test('problems are sorted by floor', () => {
  const freighter = layout({ 3: [[0, 0, 'scanner_room']], 1: [[0, 0, 'scanner_room']] });
  const floors = validateLayout(freighter).map(p => p.locations[0].floor);
  assert.deepEqual(floors, [1, 3]);
});
