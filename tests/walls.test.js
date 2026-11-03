import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { GRID_SIZE } from '../js/data.js';
import {
  tileEdge, edgeTiles, getWall, setWall, canHaveWall, pruneWalls, pruneWallsAround, boxOutline, edgesAround,
} from '../js/walls.js';
import { layout, floorPair, NORTH, EAST, SOUTH, WEST } from './helpers.js';

const WALL = 'internal_wall';

// Can a wall piece go on side (dx, dy) of tile (x, y) on floor `floorNum`?
const canWallBeside = (freighter, floorNum, x, y, [dx, dy]) =>
  canHaveWall(...floorPair(freighter, floorNum), tileEdge(x, y, dx, dy));

describe('edges: every side between two tiles has one name', () => {
  test('north and west are the tile\'s own edges', () => {
    assert.deepEqual(tileEdge(5, 5, ...NORTH), { x: 5, y: 5, side: 'N' });
    assert.deepEqual(tileEdge(5, 5, ...WEST), { x: 5, y: 5, side: 'W' });
  });

  test('south and east are the edges of the next tile', () => {
    assert.deepEqual(tileEdge(5, 5, ...SOUTH), tileEdge(5, 6, ...NORTH));
    assert.deepEqual(tileEdge(5, 5, ...EAST), tileEdge(6, 5, ...WEST));
  });

  test('an edge separates two tiles, each facing the other', () => {
    assert.deepEqual(edgeTiles({ x: 5, y: 5, side: 'N' }), [{ x: 5, y: 4, dx: 0, dy: 1 }, { x: 5, y: 5, dx: 0, dy: -1 }]);
    assert.deepEqual(edgeTiles({ x: 5, y: 5, side: 'W' }), [{ x: 4, y: 5, dx: 1, dy: 0 }, { x: 5, y: 5, dx: -1, dy: 0 }]);
  });

  test('a floor stores walls on its N and W edges', () => {
    const floor = layout().floors[0];
    setWall(floor, tileEdge(3, 3, ...EAST), WALL);
    assert.equal(getWall(floor, tileEdge(4, 3, ...WEST)), WALL);
    assert.equal(floor.walls.W[3][4], WALL);
  });
});

describe('canHaveWall: where a wall piece can go', () => {
  test('rooms and corridors take one on every side', () => {
    const freighter = layout({ 1: [[5, 5, 'scanner_room'], [8, 8, 'freighter_corridor']] });
    for (const dir of [NORTH, EAST, SOUTH, WEST]) {
      assert.equal(canWallBeside(freighter, 1, 5, 5, dir), true);
      assert.equal(canWallBeside(freighter, 1, 8, 8, dir), true);
    }
  });

  test('also between two interior tiles (inside a merged room, or a doorway)', () => {
    const freighter = layout({ 1: [[5, 5, 'scanner_room'], [6, 5, 'scanner_room'], [5, 6, 'freighter_corridor']] });
    assert.equal(canWallBeside(freighter, 1, 5, 5, EAST), true);
    assert.equal(canWallBeside(freighter, 1, 5, 5, SOUTH), true);
  });

  test('on the outer border of the build area', () => {
    const freighter = layout({ 1: [[0, 0, 'scanner_room'], [GRID_SIZE - 1, GRID_SIZE - 1, 'scanner_room']] });
    assert.equal(canWallBeside(freighter, 1, 0, 0, NORTH), true);
    assert.equal(canWallBeside(freighter, 1, 0, 0, WEST), true);
    assert.equal(canWallBeside(freighter, 1, GRID_SIZE - 1, GRID_SIZE - 1, SOUTH), true);
    assert.equal(canWallBeside(freighter, 1, GRID_SIZE - 1, GRID_SIZE - 1, EAST), true);
  });

  test('between the bridge and the module in front of it', () => {
    assert.equal(canWallBeside(layout({ 1: [[10, 0, 'freighter_corridor']] }), 1, 10, 0, NORTH), true);
    assert.equal(canWallBeside(layout(), 1, 10, 0, NORTH), false); // nothing built there yet
  });

  test('not between empty tiles', () => {
    assert.equal(canWallBeside(layout(), 1, 5, 5, NORTH), false);
  });

  test('between the interior and an exterior piece, but not between two exterior pieces', () => {
    const freighter = layout({ 1: [[5, 5, 'scanner_room'], [6, 5, 'exterior_catwalk'], [7, 5, 'exterior_platform']] });
    assert.equal(canWallBeside(freighter, 1, 5, 5, EAST), true);
    assert.equal(canWallBeside(freighter, 1, 6, 5, EAST), false);
    assert.equal(canWallBeside(freighter, 1, 7, 5, EAST), false); // platform and empty space
  });

  test('stairs: at their entrance and exit, not along their sides', () => {
    // Climbing north from (5, 5): enter from (5, 6), arrive at (5, 4) on floor 2, leave towards (5, 3)
    const freighter = layout({ 1: [[5, 5, 'freighter_stairs', 0], [4, 5, 'scanner_room']] });
    assert.equal(canWallBeside(freighter, 1, 5, 5, SOUTH), true);
    assert.equal(canWallBeside(freighter, 1, 5, 5, WEST), false); // even with a room on the other side
    assert.equal(canWallBeside(freighter, 1, 5, 4, NORTH), false); // high end on its own floor
    assert.equal(canWallBeside(freighter, 2, 5, 4, NORTH), true);
    assert.equal(canWallBeside(freighter, 2, 5, 5, SOUTH), false); // the opening on the floor above
  });

  test('edges outside the grid don\'t exist', () => {
    const freighter = layout({ 1: [[0, 0, 'scanner_room']] });
    assert.equal(canHaveWall(...floorPair(freighter, 1), { x: 0, y: -1, side: 'N' }), false);
    assert.equal(canHaveWall(...floorPair(freighter, 1), { x: GRID_SIZE + 1, y: 0, side: 'W' }), false);
  });
});

describe('pruneWalls: walls go when the interior next to them does', () => {
  test('removing a room removes its walls, except those still next to the interior', () => {
    const freighter = layout({ 1: [[5, 5, 'scanner_room'], [6, 5, 'scanner_room']] });
    const floor = freighter.floors[0];
    setWall(floor, tileEdge(5, 5, ...NORTH), WALL);
    setWall(floor, tileEdge(5, 5, ...EAST), 'bulkhead_door');

    floor.tiles[5][5].type = null;
    const removed = pruneWalls(freighter, 1);

    assert.deepEqual(removed, [{ floor: 1, edge: { x: 5, y: 5, side: 'N' }, before: WALL }]);
    assert.equal(getWall(floor, tileEdge(5, 5, ...NORTH)), null);
    assert.equal(getWall(floor, tileEdge(5, 5, ...EAST)), 'bulkhead_door'); // room (6, 5) is still there
  });

  test('only the edges around the area are checked', () => {
    const freighter = layout();
    setWall(freighter.floors[0], tileEdge(0, 0, ...NORTH), WALL); // nothing next to it
    assert.deepEqual(pruneWalls(freighter, 1, { x0: 10, y0: 10, x1: 12, y1: 12 }), []);
    assert.equal(pruneWalls(freighter, 1).length, 1);
  });

  test('removing stairs also removes the wall at their exit on the floor above', () => {
    const freighter = layout({ 1: [[5, 5, 'freighter_stairs', 0]] });
    setWall(freighter.floors[1], tileEdge(5, 4, ...NORTH), WALL);

    freighter.floors[0].tiles[5][5].type = null;
    const removed = pruneWallsAround(freighter, 1, 5, 5);

    assert.deepEqual(removed.map(r => r.floor), [2]);
  });

  test('replacing a room with stairs removes the walls along their sides', () => {
    const freighter = layout({ 1: [[5, 5, 'scanner_room']] });
    const floor = freighter.floors[0];
    setWall(floor, tileEdge(5, 5, ...WEST), WALL);
    setWall(floor, tileEdge(5, 5, ...SOUTH), WALL);

    floor.tiles[5][5] = { type: 'freighter_stairs', rotation: 0 };
    pruneWallsAround(freighter, 1, 5, 5);

    assert.equal(getWall(floor, tileEdge(5, 5, ...WEST)), null);
    assert.equal(getWall(floor, tileEdge(5, 5, ...SOUTH)), WALL); // the entrance
  });
});

describe('box edges (Ctrl + drag with a wall piece)', () => {
  const key = ({ x, y, side }) => `${side}${x},${y}`;

  test('the outline of a 2 × 1 box: 6 edges around it, none inside', () => {
    const edges = [...boxOutline({ x0: 5, y0: 5, x1: 6, y1: 5 })].map(key).sort();
    assert.deepEqual(edges, ['N5,5', 'N5,6', 'N6,5', 'N6,6', 'W5,5', 'W7,5']);
  });

  test('the outline of one tile is its 4 sides', () => {
    const edges = [...boxOutline({ x0: 3, y0: 3, x1: 3, y1: 3 })].map(key).sort();
    const sides = [NORTH, EAST, SOUTH, WEST].map(([dx, dy]) => key(tileEdge(3, 3, dx, dy))).sort();
    assert.deepEqual(edges, sides);
  });

  test('all edges of a 2 × 1 box: the outline plus the one between the tiles', () => {
    const edges = [...edgesAround({ x0: 5, y0: 5, x1: 6, y1: 5 })].map(key).sort();
    assert.deepEqual(edges, ['N5,5', 'N5,6', 'N6,5', 'N6,6', 'W5,5', 'W6,5', 'W7,5']);
  });
});
