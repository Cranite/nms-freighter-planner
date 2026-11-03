import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHistory } from '../js/history.js';

const EMPTY = { type: null, rotation: 0 };
const ROOM = { type: 'scanner_room', rotation: 0 };

// One stroke that places a room on each of `count` tiles in row 0
function stroke(history, floor = 1, count = 1) {
  for (let x = 0; x < count; x++) history.recordTile(floor, x, 0, EMPTY, ROOM);
  history.endStroke();
}

test('a new history has nothing to undo or redo', () => {
  const history = createHistory();
  assert.equal(history.canUndo(), false);
  assert.equal(history.canRedo(), false);
  assert.equal(history.undo(), null);
  assert.equal(history.redo(), null);
});

test('a whole stroke undoes as one step', () => {
  const history = createHistory();
  stroke(history, 1, 3);

  const entry = history.undo();
  assert.equal(entry.kind, 'tiles');
  assert.equal(entry.changes.length, 3);
  assert.equal(history.canUndo(), false);
});

test('a stroke still in progress can be undone (undo ends it first)', () => {
  const history = createHistory();
  history.recordTile(1, 0, 0, EMPTY, ROOM);

  assert.equal(history.canUndo(), true);
  assert.equal(history.undo().changes.length, 1);
});

test('undo then redo returns the same entry', () => {
  const history = createHistory();
  stroke(history);
  const undone = history.undo();

  assert.equal(history.canRedo(), true);
  assert.equal(history.redo(), undone);
});

test('a new change after undo clears the redo list', () => {
  const history = createHistory();
  stroke(history);
  history.undo();
  stroke(history);

  assert.equal(history.canRedo(), false);
});

test('changing floor mid-stroke splits it into two steps', () => {
  const history = createHistory();
  history.recordTile(1, 0, 0, EMPTY, ROOM);
  history.recordTile(2, 0, 0, EMPTY, ROOM);
  history.endStroke();

  assert.equal(history.undo().floor, 2);
  assert.equal(history.undo().floor, 1);
});

test('layout entries keep the floor they changed (paste/clear), or null', () => {
  const history = createHistory();
  history.recordLayout({ name: 'before' }, { name: 'after' }, 4);
  history.recordLayout({ name: 'before' }, { name: 'after' });

  assert.equal(history.undo().floor, null);
  const pasted = history.undo();
  assert.equal(pasted.kind, 'layout');
  assert.equal(pasted.floor, 4);
  assert.equal(pasted.before.name, 'before');
});

test('only the last 100 steps are kept', () => {
  const history = createHistory();
  for (let i = 0; i < 105; i++) stroke(history);

  let undone = 0;
  while (history.undo()) undone++;
  assert.equal(undone, 100);
});

test('onChange is called when undo/redo availability may change', () => {
  let calls = 0;
  const history = createHistory(() => calls++);
  stroke(history);
  history.undo();
  history.redo();

  assert.equal(calls, 3);
});

test('wall changes join the stroke, each with its own floor', () => {
  const history = createHistory();
  const edge = { x: 0, y: 0, side: 'N' };
  history.recordTile(1, 0, 0, EMPTY, ROOM);
  history.recordWall(2, edge, 'internal_wall', null); // e.g. removed with stairs, on the floor above
  history.endStroke();

  const entry = history.undo();
  assert.equal(entry.floor, 1);
  assert.deepEqual(entry.changes[1], { floor: 2, edge, before: 'internal_wall', after: null });
});

test('a stroke of only wall changes is one step too', () => {
  const history = createHistory();
  history.recordWall(3, { x: 0, y: 0, side: 'N' }, null, 'internal_wall');
  history.recordWall(3, { x: 1, y: 0, side: 'N' }, null, 'internal_wall');
  history.endStroke();

  const entry = history.undo();
  assert.equal(entry.floor, 3);
  assert.equal(entry.changes.length, 2);
  assert.equal(history.canUndo(), false);
});
