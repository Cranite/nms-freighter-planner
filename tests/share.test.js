import { test } from 'node:test';
import assert from 'node:assert/strict';
import { serializeFreighter } from '../js/data.js';
import { layoutToHash, layoutFromHash } from '../js/share.js';
import { setWall, tileEdge } from '../js/walls.js';
import { layout, EAST } from './helpers.js';

test('a link opens the same layout, walls included', async () => {
  const freighter = layout({ 1: [[10, 0, 'freighter_corridor'], [11, 0, 'scanner_room']], 3: [[5, 5, 'freighter_stairs', 90]] });
  setWall(freighter.floors[0], tileEdge(10, 0, ...EAST), 'bulkhead_door');

  const { freighter: opened, skipped } = await layoutFromHash(await layoutToHash(freighter));
  assert.equal(skipped, 0);
  assert.equal(serializeFreighter(opened), serializeFreighter(freighter));
});

test('the link only uses characters that are safe in a URL', async () => {
  const hash = await layoutToHash(layout({ 1: [[10, 0, 'freighter_corridor']] }));
  assert.match(hash, /^#layout=[A-Za-z0-9_-]+$/);
});

test('an empty layout makes a short link', async () => {
  assert.ok((await layoutToHash(layout())).length < 600);
});

test('other hashes are not a shared layout', async () => {
  assert.equal(await layoutFromHash(''), null);
  assert.equal(await layoutFromHash('#floor=2'), null);
});

test('a cut-off or damaged link gives a clear error', async () => {
  const hash = await layoutToHash(layout({ 1: [[10, 0, 'freighter_corridor']] }));
  for (const broken of [hash.slice(0, hash.length / 2), '#layout=not*base64', '#layout=AAAA']) {
    await assert.rejects(layoutFromHash(broken), /incomplete or damaged/);
  }
});
