import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SLOT_COUNT, ERASER_SLOT, DEFAULT_SLOTS,
  slotForKey, moduleInSlot, assignSlot, clearSlot, loadHotbar, saveHotbar,
} from '../js/hotbar.js';
import { MODULE_BY_ID, EMPTY_ID } from '../js/modules.js';

// Stand-in for localStorage
function memoryStorage(initial = {}) {
  const data = { ...initial };
  return {
    getItem: (key) => data[key] ?? null,
    setItem: (key, value) => { data[key] = String(value); },
  };
}

const empty = () => Array(SLOT_COUNT).fill(null);

test('the default slots are real modules, each once', () => {
  assert.equal(DEFAULT_SLOTS.length, SLOT_COUNT);
  const ids = DEFAULT_SLOTS.filter(Boolean);
  ids.forEach(id => assert.ok(MODULE_BY_ID[id], id));
  assert.equal(new Set(ids).size, ids.length);
});

test('number keys pick a slot, on the number row and the numpad; 0 is the eraser', () => {
  assert.equal(slotForKey('Digit1'), 0);
  assert.equal(slotForKey('Digit9'), 8);
  assert.equal(slotForKey('Numpad3'), 2);
  assert.equal(slotForKey('Digit0'), ERASER_SLOT);
  assert.equal(slotForKey('Numpad0'), ERASER_SLOT);
  assert.equal(slotForKey('KeyQ'), -1);
  assert.equal(slotForKey('F1'), -1);
});

test('the eraser slot always holds the eraser', () => {
  assert.equal(moduleInSlot(empty(), ERASER_SLOT), EMPTY_ID);
  assert.equal(moduleInSlot(empty(), 0), null);
  assert.equal(moduleInSlot(['scanner_room', ...empty().slice(1)], 0), 'scanner_room');
});

test('storing a module in a slot', () => {
  const slots = assignSlot(empty(), 4, 'scanner_room');
  assert.equal(slots[4], 'scanner_room');
  assert.equal(slots.filter(Boolean).length, 1);
});

test('a module already in another slot swaps places with what was there', () => {
  let slots = assignSlot(empty(), 0, 'scanner_room');
  slots = assignSlot(slots, 1, 'refiner_room');
  slots = assignSlot(slots, 1, 'scanner_room');
  assert.deepEqual(slots.slice(0, 2), ['refiner_room', 'scanner_room']);

  // Onto an empty slot: the old slot ends up empty
  slots = assignSlot(slots, 5, 'scanner_room');
  assert.deepEqual([slots[1], slots[5]], [null, 'scanner_room']);
});

test('the eraser, unknown modules and slots off the bar are not stored', () => {
  const slots = empty();
  assert.deepEqual(assignSlot(slots, 0, EMPTY_ID), slots);
  assert.deepEqual(assignSlot(slots, 0, 'no_such_module'), slots);
  assert.deepEqual(assignSlot(slots, ERASER_SLOT, 'scanner_room'), slots);
  assert.deepEqual(assignSlot(slots, -1, 'scanner_room'), slots);
});

test('emptying a slot', () => {
  const slots = clearSlot(assignSlot(empty(), 2, 'scanner_room'), 2);
  assert.deepEqual(slots, empty());
});

test('slots are saved and loaded again', () => {
  const storage = memoryStorage();
  const slots = assignSlot(empty(), 3, 'nutrition_room');
  saveHotbar(storage, slots);
  assert.deepEqual(loadHotbar(storage), slots);
});

test('nothing saved, or saved data that makes no sense, gives the default slots', () => {
  assert.deepEqual(loadHotbar(memoryStorage()), DEFAULT_SLOTS);
  assert.deepEqual(loadHotbar(memoryStorage({ freighterHotbar: '{oops' })), DEFAULT_SLOTS);
  assert.deepEqual(loadHotbar(memoryStorage({ freighterHotbar: '["scanner_room"]' })), DEFAULT_SLOTS);
  assert.deepEqual(loadHotbar({ getItem() { throw new Error('blocked'); } }), DEFAULT_SLOTS);
});

test('removed modules, the eraser and doubles load as empty slots', () => {
  const saved = ['scanner_room', 'removed_module', EMPTY_ID, 'scanner_room', 42, null, null, null, 'refiner_room'];
  assert.deepEqual(
    loadHotbar(memoryStorage({ freighterHotbar: JSON.stringify(saved) })),
    ['scanner_room', null, null, null, null, null, null, null, 'refiner_room']);
});
