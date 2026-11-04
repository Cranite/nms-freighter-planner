import { MODULE_BY_ID, EMPTY_ID } from './modules.js';

/**
 * Hotbar: quick-select slots for modules, on the number keys.
 * Keys 1–9 hold modules you choose (Shift + number, or drag one onto a slot);
 * key 0 is always the eraser. The slots are a tool setting, remembered in
 * this browser apart from the layout, so they don't go into saves or links.
 *
 * Slots are module ids (or null for an empty slot), keys 1–9 in order.
 */
export const SLOT_COUNT = 9;

// Keys shown on the bar, in order; the last one is the eraser
export const HOTBAR_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];
export const ERASER_SLOT = SLOT_COUNT;

// Ready to use on a first visit: the pieces you place most
export const DEFAULT_SLOTS = [
  'freighter_corridor',
  'freighter_stairs',
  'glass_corridor',
  'internal_wall',
  'bulkhead_door',
  'reinforced_window',
  'exterior_catwalk',
  'exterior_platform',
  null,
];

/**
 * Hotbar slot for a key press (KeyboardEvent.code), or -1.
 * Uses the physical key, not the character: on AZERTY keyboards the number
 * row types & é " ... without Shift, and Shift + number must still work.
 */
export function slotForKey(code) {
  const match = /^(?:Digit|Numpad)(\d)$/.exec(code);
  if (!match) return -1;
  return match[1] === '0' ? ERASER_SLOT : Number(match[1]) - 1;
}

// The module id in a slot, the eraser included (null when empty)
export function moduleInSlot(slots, index) {
  return index === ERASER_SLOT ? EMPTY_ID : slots[index] ?? null;
}

/**
 * Puts a module in a slot. A module is only in one slot at a time: if it
 * was in another one, the two slots swap (so dragging between slots
 * reorders them). The eraser has its own key and isn't stored.
 * @returns new slots (unchanged copy when nothing can be stored)
 */
export function assignSlot(slots, index, moduleId) {
  const next = [...slots];
  if (index < 0 || index >= SLOT_COUNT || !MODULE_BY_ID[moduleId] || moduleId === EMPTY_ID) return next;

  const previous = next.indexOf(moduleId);
  if (previous !== -1) next[previous] = next[index];
  next[index] = moduleId;
  return next;
}

// Empties a slot
export function clearSlot(slots, index) {
  const next = [...slots];
  if (index >= 0 && index < SLOT_COUNT) next[index] = null;
  return next;
}

// Stored slots; storage can be blocked (private mode), then the defaults are used
const HOTBAR_KEY = 'freighterHotbar';

/**
 * The saved slots, or the defaults. Unknown module ids (renamed or removed
 * modules) become empty slots instead of breaking the bar.
 */
export function loadHotbar(storage) {
  try {
    const saved = JSON.parse(storage.getItem(HOTBAR_KEY));
    if (!Array.isArray(saved) || saved.length !== SLOT_COUNT) return [...DEFAULT_SLOTS];

    const seen = new Set();
    return saved.map(id => {
      const usable = typeof id === 'string' && MODULE_BY_ID[id] && id !== EMPTY_ID && !seen.has(id);
      if (!usable) return null;
      seen.add(id);
      return id;
    });
  } catch {
    return [...DEFAULT_SLOTS];
  }
}

export function saveHotbar(storage, slots) {
  try {
    storage.setItem(HOTBAR_KEY, JSON.stringify(slots));
  } catch (err) {
    console.warn('⚠️ Hotbar could not be saved', err);
  }
}
