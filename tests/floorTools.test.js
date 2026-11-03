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
