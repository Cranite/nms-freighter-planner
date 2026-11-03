import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { MODULE_BY_ID } from '../js/modules.js';
import { coveringAt, canPlace, opensTowards, exteriorOpensTowards } from '../js/footprint.js';
import { layout, floorPair, NORTH, EAST, SOUTH, WEST } from './helpers.js';

const stairs = MODULE_BY_ID.freighter_stairs;
const room = MODULE_BY_ID.scanner_room;

describe('coveringAt: which module covers a tile', () => {
  // Stairs stored at (5, 5) on floor 1, climbing north (rotation 0)
  const freighter = layout({ 1: [[5, 5, 'freighter_stairs', 0]] });

  test('stairs cover their own tile as the low end', () => {
    const cover = coveringAt(...floorPair(freighter, 1), 5, 5);
    assert.equal(cover.modDef.id, 'freighter_stairs');
    assert.equal(cover.part, 'base');
    assert.equal(cover.end, 'low');
  });

  test('stairs cover the next tile in the climb direction as the high end', () => {
    const cover = coveringAt(...floorPair(freighter, 1), 5, 4);
    assert.deepEqual([cover.x, cover.y, cover.end], [5, 5, 'high']);
  });

  test('stairs cover the same two tiles on the floor above as their top part', () => {
    const low = coveringAt(...floorPair(freighter, 2), 5, 5);
    const high = coveringAt(...floorPair(freighter, 2), 5, 4);
    assert.deepEqual([low.part, low.end, low.floorNum], ['top', 'low', 1]);
    assert.deepEqual([high.part, high.end, high.floorNum], ['top', 'high', 1]);
  });

  test('rotation turns the high end: 90 climbs east', () => {
    const turned = layout({ 1: [[5, 5, 'freighter_stairs', 90]] });
    assert.equal(coveringAt(...floorPair(turned, 1), 6, 5).end, 'high');
    assert.equal(coveringAt(...floorPair(turned, 1), 5, 4), null);
  });

  test('stairs don\'t reach two floors up', () => {
    assert.equal(coveringAt(...floorPair(freighter, 3), 5, 5), null);
  });

  test('empty tiles and tiles outside the grid are not covered', () => {
    assert.equal(coveringAt(...floorPair(freighter, 1), 0, 0), null);
    assert.equal(coveringAt(...floorPair(freighter, 1), -1, 5), null);
  });
});

describe('canPlace: can a module go here?', () => {
  test('a room fits on an empty tile', () => {
    assert.equal(canPlace(layout(), room, 1, 5, 5, 0), true);
  });

  test('nothing can be built on the entrance ramp', () => {
    assert.equal(canPlace(layout(), room, 1, 10, 2, 0), false);
  });

  test('the ramp tile is only locked on floor 1', () => {
    assert.equal(canPlace(layout(), room, 2, 10, 2, 0), true);
  });

  test('a module can replace the module on its own tile', () => {
    const freighter = layout({ 1: [[5, 5, 'teleport_chamber']] });
    assert.equal(canPlace(freighter, room, 1, 5, 5, 0), true);
  });

  test('stairs can\'t be placed on the top floor', () => {
    assert.equal(canPlace(layout(), stairs, 14, 5, 5, 0), false);
  });

  test('stairs can\'t stick out of the grid', () => {
    assert.equal(canPlace(layout(), stairs, 1, 5, 0, 0), false); // high end would be y = -1
  });

  test('stairs need their high end free', () => {
    const freighter = layout({ 1: [[5, 4, 'scanner_room']] });
    assert.equal(canPlace(freighter, stairs, 1, 5, 5, 0), false);
  });

  test('stairs need both tiles free on the floor above', () => {
    const freighter = layout({ 2: [[5, 4, 'scanner_room']] });
    assert.equal(canPlace(freighter, stairs, 1, 5, 5, 0), false);
  });

  test('nothing can go where stairs from the floor below arrive', () => {
    const freighter = layout({ 1: [[5, 5, 'freighter_stairs', 0]] });
    assert.equal(canPlace(freighter, room, 2, 5, 5, 0), false);
    assert.equal(canPlace(freighter, room, 2, 5, 4, 0), false);
  });
});

describe('opensTowards: where you can walk out of a tile (interior)', () => {
  test('rooms open on all sides', () => {
    const freighter = layout({ 1: [[5, 5, 'scanner_room']] });
    for (const [dx, dy] of [NORTH, EAST, SOUTH, WEST]) {
      assert.equal(opensTowards(...floorPair(freighter, 1), 5, 5, dx, dy), true);
    }
  });

  test('the ramp opens on all sides', () => {
    assert.equal(opensTowards(...floorPair(layout(), 1), 10, 2, ...SOUTH), true);
  });

  test('empty tiles don\'t open', () => {
    assert.equal(opensTowards(...floorPair(layout(), 1), 5, 5, ...NORTH), false);
  });

  test('exterior pieces don\'t open towards the interior', () => {
    const freighter = layout({ 1: [[5, 5, 'exterior_platform']] });
    assert.equal(opensTowards(...floorPair(freighter, 1), 5, 5, ...NORTH), false);
  });

  test('stairs open only behind their low end', () => {
    // Climbing north: you walk in from the south
    const freighter = layout({ 1: [[5, 5, 'freighter_stairs', 0]] });
    const pair = floorPair(freighter, 1);
    assert.equal(opensTowards(...pair, 5, 5, ...SOUTH), true);
    assert.equal(opensTowards(...pair, 5, 5, ...EAST), false);
    assert.equal(opensTowards(...pair, 5, 4, ...NORTH), false); // high end, on its own floor
  });

  test('stairs open past their high end on the floor above', () => {
    const freighter = layout({ 1: [[5, 5, 'freighter_stairs', 0]] });
    assert.equal(opensTowards(...floorPair(freighter, 2), 5, 4, ...NORTH), true);
    assert.equal(opensTowards(...floorPair(freighter, 2), 5, 5, ...SOUTH), false);
  });
});

describe('exteriorOpensTowards: how exterior pieces join up', () => {
  test('catwalks and platforms open on all sides', () => {
    const freighter = layout({ 1: [[5, 5, 'exterior_catwalk'], [7, 5, 'exterior_platform']] });
    for (const [dx, dy] of [NORTH, EAST, SOUTH, WEST]) {
      assert.equal(exteriorOpensTowards(...floorPair(freighter, 1), 5, 5, dx, dy), true);
      assert.equal(exteriorOpensTowards(...floorPair(freighter, 1), 7, 5, dx, dy), true);
    }
  });

  test('interior modules and the ramp never join the exterior', () => {
    const freighter = layout({ 1: [[5, 5, 'freighter_corridor']] });
    assert.equal(exteriorOpensTowards(...floorPair(freighter, 1), 5, 5, ...NORTH), false);
    assert.equal(exteriorOpensTowards(...floorPair(freighter, 1), 10, 2, ...SOUTH), false);
  });

  test('exterior stairs join only at their ends', () => {
    // Climbing east from (5, 5): enter from the west, arrive at (6, 5) on floor 2
    const freighter = layout({ 1: [[5, 5, 'exterior_stairs', 90]] });
    assert.equal(exteriorOpensTowards(...floorPair(freighter, 1), 5, 5, ...WEST), true);
    assert.equal(exteriorOpensTowards(...floorPair(freighter, 1), 5, 5, ...NORTH), false);
    assert.equal(exteriorOpensTowards(...floorPair(freighter, 1), 6, 5, ...EAST), false);
    assert.equal(exteriorOpensTowards(...floorPair(freighter, 2), 6, 5, ...EAST), true);
  });
});
