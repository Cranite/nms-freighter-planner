import { test } from 'node:test';
import assert from 'node:assert/strict';
import { copyFloor, clearFloor, pasteFloor } from '../js/floorTools.js';
import { layout } from './helpers.js';

const typeAt = (freighter, floorNum, x, y) => freighter.floors[floorNum - 1].tiles[y][x].type;

test('a copy is not affected by later changes to the floor', () => {
  const freighter = layout({ 2: [[5, 5, 'scanner_room']] });
  const copied = copyFloor(freighter, 2);
  freighter.floors[1].tiles[5][5].type = null;

  assert.equal(copied.floor, 2);
  assert.equal(copied.tiles[5][5].type, 'scanner_room');
});

test('clear empties the floor in a new freighter and leaves the original alone', () => {
  const freighter = layout({ 2: [[5, 5, 'scanner_room']], 3: [[5, 5, 'scanner_room']] });
  const cleared = clearFloor(freighter, 2);

  assert.equal(typeAt(cleared, 2, 5, 5), null);
  assert.equal(typeAt(cleared, 3, 5, 5), 'scanner_room');
  assert.equal(typeAt(freighter, 2, 5, 5), 'scanner_room');
});

test('paste replaces the floor with the copy', () => {
  const freighter = layout({ 2: [[5, 5, 'scanner_room']], 3: [[1, 1, 'teleport_chamber']] });
  const { freighter: result, skipped } = pasteFloor(freighter, 3, copyFloor(freighter, 2));

  assert.equal(skipped, 0);
  assert.equal(typeAt(result, 3, 5, 5), 'scanner_room');
  assert.equal(typeAt(result, 3, 1, 1), null);
});

test('paste onto floor 1 skips the ramp tile', () => {
  const freighter = layout({ 2: [[10, 2, 'scanner_room']] });
  const { freighter: result, skipped } = pasteFloor(freighter, 1, copyFloor(freighter, 2));

  assert.equal(skipped, 1);
  assert.equal(typeAt(result, 1, 10, 2), null);
});

test('paste skips stairs on the top floor', () => {
  const freighter = layout({ 2: [[5, 5, 'freighter_stairs', 0]] });
  const { skipped } = pasteFloor(freighter, 14, copyFloor(freighter, 2));
  assert.equal(skipped, 1);
});

test('paste skips modules where stairs from the floor below arrive', () => {
  const freighter = layout({ 1: [[5, 5, 'freighter_stairs', 0]], 3: [[5, 4, 'scanner_room'], [9, 9, 'scanner_room']] });
  const { freighter: result, skipped } = pasteFloor(freighter, 2, copyFloor(freighter, 3));

  assert.equal(skipped, 1);
  assert.equal(typeAt(result, 2, 9, 9), 'scanner_room');
});

const wallAt = (freighter, floorNum, side, x, y) => freighter.floors[floorNum - 1].walls[side][y][x];

test('copy and paste include the walls', () => {
  const freighter = layout({ 2: [[5, 5, 'scanner_room']] });
  freighter.floors[1].walls.N[5][5] = 'reinforced_window';
  const { freighter: result } = pasteFloor(freighter, 3, copyFloor(freighter, 2));

  assert.equal(wallAt(result, 3, 'N', 5, 5), 'reinforced_window');
});

test('paste drops walls that don\'t fit with the modules here', () => {
  // The copied wall is at the top of stairs from floor 1; on floor 3 there are none
  const freighter = layout({ 1: [[5, 5, 'freighter_stairs', 0]] });
  freighter.floors[1].walls.N[4][5] = 'internal_wall';
  const { freighter: result } = pasteFloor(freighter, 3, copyFloor(freighter, 2));

  assert.equal(wallAt(result, 3, 'N', 5, 4), null);
});

test('clear removes the floor\'s walls, and the walls at the exit of its stairs', () => {
  const freighter = layout({ 1: [[5, 5, 'freighter_stairs', 0]] });
  freighter.floors[0].walls.N[6][5] = 'internal_wall'; // entrance
  freighter.floors[1].walls.N[4][5] = 'internal_wall'; // exit, on floor 2
  const cleared = clearFloor(freighter, 1);

  assert.equal(wallAt(cleared, 1, 'N', 5, 6), null);
  assert.equal(wallAt(cleared, 2, 'N', 5, 4), null);
  assert.equal(wallAt(freighter, 2, 'N', 5, 4), 'internal_wall'); // the original is left alone
});

test('pasting a floor onto itself keeps the walls at its stairs exits', () => {
  const freighter = layout({ 1: [[5, 5, 'freighter_stairs', 0]] });
  freighter.floors[1].walls.N[4][5] = 'internal_wall';
  const { freighter: result } = pasteFloor(freighter, 1, copyFloor(freighter, 1));

  assert.equal(wallAt(result, 2, 'N', 5, 4), 'internal_wall');
});
