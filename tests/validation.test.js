import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateLayout } from '../js/validation.js';
import { setWall, tileEdge } from '../js/walls.js';
import { layout, NORTH, EAST, SOUTH, WEST } from './helpers.js';

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

// Puts a wall piece on side (dx, dy) of tile (x, y) on floor `floorNum`
function wall(freighter, floorNum, x, y, [dx, dy], type = 'internal_wall') {
  setWall(freighter.floors[floorNum - 1], tileEdge(x, y, dx, dy), type);
  return freighter;
}

// Corridor from the ramp, a room beside it and a catwalk beside that:
// ramp (10, 2) → corridor (10, 3) → room (11, 3) → catwalk (12, 3)
const roomAndCatwalk = () => layout({ 1: [[10, 3, 'freighter_corridor'], [11, 3, 'scanner_room'], [12, 3, 'exterior_catwalk']] });

test('exterior pieces without a Bulkhead Door to the interior are reported', () => {
  const problems = validateLayout(roomAndCatwalk());
  assert.equal(problems.length, 1);
  assert.equal(problems[0].message, "Floor 1: 1 module can't be reached from the ramp (exterior pieces need a Bulkhead Door)");
  assert.deepEqual(problems[0].locations, [{ floor: 1, x: 12, y: 3 }]);
});

test('a Bulkhead Door connects the interior to the exterior', () => {
  const freighter = wall(roomAndCatwalk(), 1, 11, 3, EAST, 'bulkhead_door');
  freighter.floors[0].tiles[3][13] = { type: 'exterior_platform', rotation: 0 }; // joins the catwalk
  assert.deepEqual(validateLayout(freighter), []);
});

test('a wall or window blocks the way', () => {
  for (const type of ['internal_wall', 'reinforced_window']) {
    const freighter = wall(layout({ 1: [[10, 3, 'freighter_corridor'], [11, 3, 'scanner_room']] }), 1, 10, 3, EAST, type);
    const problems = validateLayout(freighter);
    assert.equal(problems.length, 1, type);
    assert.deepEqual(problems[0].locations, [{ floor: 1, x: 11, y: 3 }]);
  }
});

test('a wall around the ramp blocks it too; a door between rooms doesn\'t', () => {
  const blocked = wall(layout({ 1: [[10, 3, 'freighter_corridor']] }), 1, 10, 2, SOUTH);
  assert.equal(validateLayout(blocked).length, 1);

  const door = wall(layout({ 1: [[10, 3, 'freighter_corridor'], [11, 3, 'scanner_room']] }), 1, 10, 3, EAST, 'bulkhead_door');
  assert.deepEqual(validateLayout(door), []);
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

test('stairs with a wall across their entrance can\'t be reached', () => {
  const freighter = wall(layout({ ...stairsFromRamp, 2: [[10, 6, 'scanner_room']] }), 1, 10, 4, NORTH);
  const problems = validateLayout(freighter);
  assert.equal(problems.length, 2); // the stairs on floor 1, the room on floor 2
  assert.match(problems[0].message, /Floor 1: 1 module can't be reached/);
});

test('stairs with a wall across their exit are reported as not connecting', () => {
  const freighter = wall(layout({ ...stairsFromRamp, 2: [[10, 6, 'scanner_room']] }), 2, 10, 5, SOUTH);
  const messages = validateLayout(freighter).map(p => p.message);
  assert.ok(messages.includes('Freighter Stairs (floor 1): nothing connects at the top (floor 2)'));
});

test('exterior stairs lead the exterior up a floor', () => {
  // Door from the room onto a catwalk, exterior stairs climbing east to a catwalk on floor 2
  const freighter = wall(layout({
    1: [[10, 3, 'freighter_corridor'], [11, 3, 'scanner_room'], [12, 3, 'exterior_catwalk'], [13, 3, 'exterior_stairs', 90]],
    2: [[15, 3, 'exterior_catwalk']],
  }), 1, 11, 3, EAST, 'bulkhead_door');
  assert.deepEqual(validateLayout(freighter), []);
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
