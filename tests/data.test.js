import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  GRID_SIZE, FLOORS, SAVE_VERSION, createEmptyFreighter, serializeFreighter, deserializeFreighter,
} from '../js/data.js';
import { layout } from './helpers.js';

const typeAt = (freighter, floorNum, x, y) => freighter.floors[floorNum - 1].tiles[y][x];

// A saved layout as JSON, with `change` applied to the parsed data first
function savedWith(change) {
  const data = JSON.parse(serializeFreighter(createEmptyFreighter()));
  change(data);
  return JSON.stringify(data);
}

test('an empty freighter has 14 floors of 21 × 21 empty tiles', () => {
  const freighter = createEmptyFreighter();
  assert.equal(freighter.floors.length, FLOORS);
  assert.equal(freighter.floors[13].floor, 14);
  assert.equal(freighter.floors[0].tiles.length, GRID_SIZE);
  assert.equal(freighter.floors[0].tiles[0].length, GRID_SIZE);
  assert.deepEqual(freighter.floors[0].tiles[0][0], { type: null, rotation: 0 });
});

test('save and load give back the same layout', () => {
  const freighter = layout({ 1: [[10, 3, 'freighter_corridor']], 5: [[4, 4, 'freighter_stairs', 270]] });
  const { freighter: loaded, skipped } = deserializeFreighter(serializeFreighter(freighter));

  assert.equal(skipped, 0);
  assert.deepEqual(loaded, freighter);
});

test('saves carry the app id and format version', () => {
  const data = JSON.parse(serializeFreighter(createEmptyFreighter()));
  assert.equal(data.app, 'nms-freighter-planner');
  assert.equal(data.version, SAVE_VERSION);
});

test('unknown modules are skipped and counted', () => {
  const json = savedWith(d => { d.floors[0].tiles[5][5] = { type: 'removed_module', rotation: 0 }; });
  const { freighter, skipped } = deserializeFreighter(json);

  assert.equal(skipped, 1);
  assert.equal(typeAt(freighter, 1, 5, 5).type, null);
});

test('a module saved on the ramp tile is dropped', () => {
  const json = savedWith(d => { d.floors[0].tiles[2][10] = { type: 'scanner_room', rotation: 0 }; });
  assert.equal(typeAt(deserializeFreighter(json).freighter, 1, 10, 2).type, null);
});

test('stairs saved on the top floor are dropped', () => {
  const json = savedWith(d => { d.floors[13].tiles[5][5] = { type: 'freighter_stairs', rotation: 0 }; });
  assert.equal(typeAt(deserializeFreighter(json).freighter, 14, 5, 5).type, null);
});

test('rotation is only kept for rotatable modules, and only 0/90/180/270', () => {
  const json = savedWith(d => {
    d.floors[0].tiles[5][5] = { type: 'scanner_room', rotation: 90 };
    d.floors[0].tiles[7][7] = { type: 'freighter_stairs', rotation: 45 };
    d.floors[0].tiles[9][9] = { type: 'freighter_stairs', rotation: 180 };
  });
  const { freighter } = deserializeFreighter(json);

  assert.equal(typeAt(freighter, 1, 5, 5).rotation, 0);
  assert.equal(typeAt(freighter, 1, 7, 7).rotation, 0);
  assert.equal(typeAt(freighter, 1, 9, 9).rotation, 180);
});

test('a short or broken floor list still loads (missing parts stay empty)', () => {
  const json = savedWith(d => { d.floors = d.floors.slice(0, 2); d.floors[1].tiles = 'oops'; });
  const { freighter } = deserializeFreighter(json);
  assert.equal(freighter.floors.length, FLOORS);
});

test('unusable files give a clear error', () => {
  assert.throws(() => deserializeFreighter('not json'), /not valid JSON/);
  assert.throws(() => deserializeFreighter('{"app":"something-else","floors":[]}'), /not a freighter planner layout/);
  assert.throws(() => deserializeFreighter(savedWith(d => { d.version = 0; })), /invalid version/);
  assert.throws(() => deserializeFreighter(savedWith(d => { d.version = SAVE_VERSION + 1; })), /newer version/);
});
