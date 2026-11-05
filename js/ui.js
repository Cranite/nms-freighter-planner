import { FLOORS } from './data.js';
import { MODULE_TYPES, MODULE_BY_ID, CATEGORIES, EMPTY_ID } from './modules.js';
import { countTotals } from './summary.js';
import {
  HOTBAR_KEYS, ERASER_SLOT, slotForKey, moduleInSlot, assignSlot, clearSlot, loadHotbar, saveHotbar,
} from './hotbar.js';

/**
 * Builds the sidebar and wires up its controls.
 * Returns functions to update UI state from the app.
 */
export function setupUI({ onSelectModule, onSelectFloor, onOnionSkinChange, onViewTurn, onCopyFloor, onPasteFloor, onClearFloor, onNew, onSave, onLoad, onExport, onImport, onShare, onExportImage, onUndo, onRedo, onGoToFloor }) {
  // Selecting a module: from the palette, the hotbar or its number keys
  let selectedId = null;
  const markSelected = (id) => {
    selectedId = id;
    palette.select(id);
    hotbar.draw();
  };
  const chooseModule = (mod) => {
    markSelected(mod.id);
    onSelectModule(mod);
  };

  const palette = buildPalette(chooseModule);
  const hotbar = buildHotbar(chooseModule, () => selectedId);
  const moduleCount = buildModuleCount();

  // Floor Selector
  const floorSelect = document.getElementById('floorSelect');
  for (let i = 1; i <= FLOORS; i++) {
    const opt = document.createElement('option');
    opt.value = i;
    opt.textContent = `Floor ${i}`;
    floorSelect.appendChild(opt);
  }
  floorSelect.addEventListener('change', e => onSelectFloor(parseInt(e.target.value)));

  // Onion skin checkboxes, remembered in this browser
  const onionBelow = document.getElementById('onionBelow');
  const onionAbove = document.getElementById('onionAbove');
  const onionSkin = loadOnionSkin();
  onionBelow.checked = onionSkin.below;
  onionAbove.checked = onionSkin.above;

  const getOnionSkin = () => ({ below: onionBelow.checked, above: onionAbove.checked });
  [onionBelow, onionAbove].forEach(box => box.addEventListener('change', () => {
    saveOnionSkin(getOnionSkin());
    onOnionSkinChange(getOnionSkin());
  }));

  // View rotation (quarter turns clockwise), remembered in this browser
  let viewTurns = loadViewTurns();
  const turnView = (delta) => {
    viewTurns = (viewTurns + delta + 4) % 4;
    saveViewTurns(viewTurns);
    onViewTurn(viewTurns);
  };
  document.getElementById('turnLeftBtn').addEventListener('click', () => turnView(-1));
  document.getElementById('turnRightBtn').addEventListener('click', () => turnView(1));

  // Whole-floor tools; Paste is enabled once a floor is copied
  const pasteFloorBtn = document.getElementById('pasteFloorBtn');
  document.getElementById('copyFloorBtn').addEventListener('click', onCopyFloor);
  pasteFloorBtn.addEventListener('click', onPasteFloor);
  document.getElementById('clearFloorBtn').addEventListener('click', onClearFloor);

  // Buttons
  document.getElementById('newBtn').addEventListener('click', onNew);
  document.getElementById('saveBtn').addEventListener('click', onSave);
  document.getElementById('loadBtn').addEventListener('click', onLoad);
  document.getElementById('exportBtn').addEventListener('click', onExport);
  document.getElementById('shareBtn').addEventListener('click', onShare);
  document.getElementById('exportFloorImageBtn').addEventListener('click', () => onExportImage(false));
  document.getElementById('exportAllImageBtn').addEventListener('click', () => onExportImage(true));

  // Import: button opens hidden file picker, file text is passed on
  const importInput = document.getElementById('importInput');
  document.getElementById('importBtn').addEventListener('click', () => importInput.click());
  importInput.addEventListener('change', async () => {
    const file = importInput.files[0];
    importInput.value = ''; // allow re-importing the same file
    if (file) onImport(await file.text());
  });

  // Undo/redo: buttons + Ctrl+Z, Ctrl+Y / Ctrl+Shift+Z
  const undoBtn = document.getElementById('undoBtn');
  const redoBtn = document.getElementById('redoBtn');
  undoBtn.addEventListener('click', onUndo);
  redoBtn.addEventListener('click', onRedo);

  // Change floor by one, as if picked in the floor selector
  const stepFloor = (delta) => {
    const n = parseInt(floorSelect.value) + delta;
    if (n < 1 || n > FLOORS) return;
    floorSelect.value = n;
    onSelectFloor(n);
  };

  window.addEventListener('keydown', (e) => {
    // Leave text fields their own undo and Page Up/Down
    if (isTypingTarget(e.target)) return;

    // Page Up / Page Down: floor above / below (also while the floor selector has focus)
    if ((e.key === 'PageUp' || e.key === 'PageDown') && !(e.ctrlKey || e.metaKey || e.altKey || e.shiftKey)) {
      e.preventDefault();
      stepFloor(e.key === 'PageUp' ? 1 : -1);
      return;
    }

    // 1–9, 0: select from the hotbar; Shift + 1–9: store the selected module there
    const slot = slotForKey(e.code);
    if (slot !== -1 && !(e.ctrlKey || e.metaKey || e.altKey)) {
      e.preventDefault(); // e.g. no jumping to an option in the floor selector
      if (e.shiftKey) hotbar.store(slot);
      else hotbar.choose(slot);
      return;
    }

    // Q / E: turn the view left / right
    const plainKey = e.key.toLowerCase();
    if ((plainKey === 'q' || plainKey === 'e') && !(e.ctrlKey || e.metaKey || e.altKey)) {
      turnView(plainKey === 'q' ? -1 : 1);
      return;
    }

    if (!(e.ctrlKey || e.metaKey) || e.altKey) return;

    const key = e.key.toLowerCase();
    if (key === 'z' && !e.shiftKey) {
      e.preventDefault();
      onUndo();
    } else if (key === 'y' || (key === 'z' && e.shiftKey)) {
      e.preventDefault();
      onRedo();
    }
  });

  return {
    setUndoRedoState(canUndo, canRedo) {
      undoBtn.disabled = !canUndo;
      redoBtn.disabled = !canRedo;
    },

    // Reflect a floor change made by the app (e.g. undo on another floor)
    setFloor(n) {
      floorSelect.value = n;
    },

    // { below, above }: which neighbouring floors to show
    getOnionSkin,

    // View rotation in quarter turns clockwise (0-3)
    getViewTurns: () => viewTurns,

    // A floor was copied: enable Paste and say which floor it pastes
    setCopiedFloor(n) {
      pasteFloorBtn.disabled = false;
      pasteFloorBtn.title = `Replace this floor with the copy of floor ${n}`;
      document.getElementById('copiedFloor').textContent = `Copied: floor ${n}`;
    },

    // Result of copying a share link, under the Share button
    setShareStatus(text) {
      document.getElementById('shareStatus').textContent = text;
    },

    // Reflect a module picked by the app (eyedropper)
    selectModule(id) {
      markSelected(id);
    },

    // Validation problems: [{ message, locations: [{ floor, x, y }] }]
    showProblems(problems) {
      const container = document.getElementById('problems');
      container.replaceChildren();

      if (problems.length === 0) {
        const ok = document.createElement('p');
        ok.className = 'problems-ok';
        ok.textContent = '✓ No problems found';
        container.appendChild(ok);
        return;
      }

      const heading = document.createElement('p');
      heading.className = 'problems-heading';
      heading.textContent = `⚠ ${problems.length} ${problems.length === 1 ? 'problem' : 'problems'}`;
      container.appendChild(heading);

      const list = document.createElement('ul');
      for (const problem of problems) {
        const floor = problem.locations[0].floor;
        const item = document.createElement('li');
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'problem';
        btn.textContent = problem.message;
        btn.title = `Go to floor ${floor}`;
        btn.addEventListener('click', () => onGoToFloor(floor));
        item.appendChild(btn);
        list.appendChild(item);
      }
      container.appendChild(list);
    },

    // Module count: { floorNum, floor, all } with counts from summary.js
    showModuleCount(data) {
      moduleCount.show(data);
    },

    // Mark floors that have modules on them: "Floor 3 •"
    setFloorsWithContent(hasContent) {
      [...floorSelect.options].forEach((opt, i) => {
        const text = `Floor ${i + 1}${hasContent[i] ? ' •' : ''}`;
        if (opt.textContent !== text) opt.textContent = text;
      });
    },
  };
}

/**
 * Does keyboard focus sit in a field where keys type text? Shortcuts skip those.
 * Checkboxes, buttons and the floor selector don't count: R or Ctrl+Z there
 * should still work, which is why this isn't just "any input".
 */
export function isTypingTarget(target) {
  return !!target.closest?.('input[type="text"], input[type="search"], textarea, [contenteditable]');
}

// Onion skin settings: a view preference, so stored apart from the layout.
// Storage can be blocked (private mode); then the defaults are used.
const ONION_SKIN_KEY = 'freighterOnionSkin';
const ONION_SKIN_DEFAULT = { below: true, above: false };

function loadOnionSkin() {
  try {
    const saved = JSON.parse(localStorage.getItem(ONION_SKIN_KEY));
    return {
      below: typeof saved?.below === 'boolean' ? saved.below : ONION_SKIN_DEFAULT.below,
      above: typeof saved?.above === 'boolean' ? saved.above : ONION_SKIN_DEFAULT.above,
    };
  } catch {
    return { ...ONION_SKIN_DEFAULT };
  }
}

function saveOnionSkin(settings) {
  try {
    localStorage.setItem(ONION_SKIN_KEY, JSON.stringify(settings));
  } catch (err) {
    console.warn('⚠️ Onion skin setting could not be saved', err);
  }
}

// View rotation: a view preference too, stored apart from the layout
const VIEW_TURNS_KEY = 'freighterViewTurns';

function loadViewTurns() {
  try {
    const saved = JSON.parse(localStorage.getItem(VIEW_TURNS_KEY));
    return [0, 1, 2, 3].includes(saved) ? saved : 0;
  } catch {
    return 0;
  }
}

function saveViewTurns(turns) {
  try {
    localStorage.setItem(VIEW_TURNS_KEY, JSON.stringify(turns));
  } catch (err) {
    console.warn('⚠️ View rotation could not be saved', err);
  }
}

// Module count panel: which counts it shows (this floor or all floors) and
// whether it's open, remembered in this browser
const MODULE_COUNT_KEY = 'freighterModuleCount';

function loadModuleCountSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(MODULE_COUNT_KEY));
    return {
      open: saved?.open === true,
      scope: saved?.scope === 'all' ? 'all' : 'floor',
    };
  } catch {
    return { open: false, scope: 'floor' };
  }
}

function saveModuleCountSettings(settings) {
  try {
    localStorage.setItem(MODULE_COUNT_KEY, JSON.stringify(settings));
  } catch (err) {
    console.warn('⚠️ Module count setting could not be saved', err);
  }
}

/**
 * Module count panel (collapsible): what this floor or the whole freighter
 * uses, grouped like the palette, with the totals on top
 */
function buildModuleCount() {
  const panel = document.getElementById('moduleCount');
  const list = document.getElementById('moduleCountList');
  const scopeButtons = {
    floor: document.getElementById('countFloorBtn'),
    all: document.getElementById('countAllBtn'),
  };

  const settings = loadModuleCountSettings();
  panel.open = settings.open;
  let data = null;

  panel.addEventListener('toggle', () => {
    settings.open = panel.open;
    saveModuleCountSettings(settings);
  });
  for (const [scope, btn] of Object.entries(scopeButtons)) {
    btn.addEventListener('click', () => {
      settings.scope = scope;
      saveModuleCountSettings(settings);
      draw();
    });
  }

  const line = (className, text) => Object.assign(document.createElement('p'), { className, textContent: text });

  function draw() {
    for (const [scope, btn] of Object.entries(scopeButtons)) {
      btn.setAttribute('aria-pressed', String(scope === settings.scope));
    }
    if (!data) return;

    scopeButtons.floor.textContent = `Floor ${data.floorNum}`;
    const counts = settings.scope === 'all' ? data.all : data.floor;
    list.replaceChildren();

    if (counts.length === 0) {
      list.appendChild(line('hint', settings.scope === 'all' ? 'Nothing built yet.' : `Nothing on floor ${data.floorNum} yet.`));
      return;
    }

    const { modules, wallPieces } = countTotals(counts);
    const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
    list.appendChild(line('count-total', [modules && plural(modules, 'module'), wallPieces && plural(wallPieces, 'wall piece')].filter(Boolean).join(', ')));

    let category = null;
    for (const { modDef, count } of counts) {
      if (modDef.category !== category) {
        category = modDef.category;
        list.appendChild(line('count-heading', CATEGORIES.find(c => c.id === category)?.label ?? ''));
      }

      const row = document.createElement('div');
      row.className = 'count-row';
      row.title = modDef.label;
      const label = Object.assign(document.createElement('span'), { className: 'count-label', textContent: modDef.label });
      const number = Object.assign(document.createElement('span'), { className: 'count-number', textContent: `×${count}` });
      row.append(createModuleIcon(modDef), label, number);
      list.appendChild(row);
    }

    if (counts.some(({ modDef }) => modDef.kind === 'stairs')) {
      list.appendChild(line('hint', 'Stairs count on the floor they start on.'));
    }
  }

  return {
    show(newData) {
      data = newData;
      draw();
    },
  };
}

// Drag data type for a module dragged onto the hotbar (from the palette or another slot)
const MODULE_DRAG_TYPE = 'application/x-freighter-module';

// localStorage itself can throw when site data is blocked; hotbar.js then uses its defaults
function browserStorage() {
  try {
    return localStorage;
  } catch {
    return null;
  }
}

/**
 * Hotbar along the bottom of the drawing area: slots 1–9 hold modules you
 * choose, 0 is the eraser (see hotbar.js). Click a slot to select it,
 * drag a module onto a slot to store it there (or a slot onto another to
 * swap them), right-click to empty it.
 */
function buildHotbar(onChoose, getSelectedId) {
  const bar = document.getElementById('hotbar');
  const storage = browserStorage();
  let slots = loadHotbar(storage);

  const update = (next) => {
    slots = next;
    saveHotbar(storage, slots);
    draw();
  };

  const choose = (index) => {
    const id = moduleInSlot(slots, index);
    if (id) onChoose(MODULE_BY_ID[id]);
  };

  const buttons = HOTBAR_KEYS.map((key, index) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'hotbar-slot';
    btn.addEventListener('click', () => choose(index));

    if (index === ERASER_SLOT) {
      btn.classList.add('eraser-slot');
    } else {
      btn.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        update(clearSlot(slots, index));
      });

      btn.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData(MODULE_DRAG_TYPE, slots[index]);
      });
      btn.addEventListener('dragover', (e) => {
        if (!e.dataTransfer.types.includes(MODULE_DRAG_TYPE)) return;
        e.preventDefault(); // allows the drop
        btn.classList.add('drop-target');
      });
      btn.addEventListener('dragleave', () => btn.classList.remove('drop-target'));
      btn.addEventListener('drop', (e) => {
        e.preventDefault();
        btn.classList.remove('drop-target');
        update(assignSlot(slots, index, e.dataTransfer.getData(MODULE_DRAG_TYPE)));
      });
    }

    bar.appendChild(btn);
    return btn;
  });

  function draw() {
    const selectedId = getSelectedId();

    buttons.forEach((btn, index) => {
      const key = HOTBAR_KEYS[index];
      const id = moduleInSlot(slots, index);
      const mod = id ? MODULE_BY_ID[id] : null;

      const keyLabel = document.createElement('span');
      keyLabel.className = 'hotbar-key';
      keyLabel.textContent = key;
      const icon = mod ? createModuleIcon(mod) : Object.assign(document.createElement('span'), { className: 'module-icon' });
      btn.replaceChildren(keyLabel, icon);

      btn.classList.toggle('empty', !mod);
      btn.classList.toggle('selected', !!mod && id === selectedId);
      btn.draggable = !!mod && index !== ERASER_SLOT;
      btn.title = !mod ? `Empty slot ${key}: select a module and press Shift+${key}, or drag one here`
        : index === ERASER_SLOT ? `${mod.label} (${key})`
        : `${mod.label} (${key})\nShift+${key} stores the selected module here, right-click empties the slot`;
    });
  }

  draw();

  return {
    draw,
    choose,

    // Store the selected module in a slot (Shift + number); the eraser has its own key
    store(index) {
      const id = getSelectedId();
      if (!id || id === EMPTY_ID || index === ERASER_SLOT) return;

      update(assignSlot(slots, index, id));
      // Short flash so you see where it went (restarted on a repeat press)
      const btn = buttons[index];
      btn.classList.remove('stored');
      void btn.offsetWidth;
      btn.classList.add('stored');
    },
  };
}

/**
 * Module palette: eraser on top, then one collapsible group per category,
 * filtered by the search box. Modules can be dragged onto the hotbar.
 */
function buildPalette(onSelectModule) {
  const paletteContainer = document.getElementById('modulePalette');
  const buttons = [];

  const highlight = (btn) => {
    buttons.forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
  };

  const addButton = (mod, parent) => {
    const btn = createModuleButton(mod);
    btn.dataset.id = mod.id;

    // Selection behavior (highlighting comes back through select())
    btn.addEventListener('click', () => onSelectModule(mod));

    // Drag onto a hotbar slot to store it there
    if (mod.id !== EMPTY_ID) {
      btn.draggable = true;
      btn.addEventListener('dragstart', (e) => e.dataTransfer.setData(MODULE_DRAG_TYPE, mod.id));
    }

    buttons.push(btn);
    parent.appendChild(btn);
  };

  addButton(MODULE_TYPES.find(m => m.id === EMPTY_ID), paletteContainer);

  const groups = CATEGORIES.map(category => {
    const group = document.createElement('details');
    group.className = 'module-group';
    group.open = true;

    const summary = document.createElement('summary');
    summary.textContent = category.label;
    group.appendChild(summary);

    MODULE_TYPES
      .filter(m => m.category === category.id)
      .forEach(mod => addButton(mod, group));

    paletteContainer.appendChild(group);
    return group;
  });

  // Search: hide non-matching modules and empty groups, open groups with matches
  document.getElementById('moduleSearch').addEventListener('input', (e) => {
    const query = e.target.value.trim().toLowerCase();

    buttons.forEach(btn => {
      btn.hidden = query !== '' && !btn.dataset.label.toLowerCase().includes(query);
    });

    groups.forEach(group => {
      const hasMatches = [...group.querySelectorAll('.module-btn')].some(btn => !btn.hidden);
      group.hidden = !hasMatches;
      if (query && hasMatches) group.open = true;
    });
  });

  return {
    // Highlight a module's button without selecting it again (keeps rotation)
    select(id) {
      const btn = buttons.find(b => b.dataset.id === id);
      if (!btn) return;

      highlight(btn);
      const group = btn.closest('details');
      if (group) group.open = true;
      if (!btn.hidden) btn.scrollIntoView({ block: 'nearest' });
    },
  };
}

/**
 * Palette button: icon (image tinted with the module color, or a color
 * block with the tile's short label) + name
 */
function createModuleButton(mod) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'module-btn';
  btn.dataset.label = mod.label;
  btn.title = mod.label;

  // Via CSS variable so the .selected border can still override it
  btn.style.setProperty('--module-color', colorHex(mod));

  const icon = createModuleIcon(mod);

  const label = document.createElement('span');
  label.className = 'module-label';
  label.textContent = mod.label;

  btn.appendChild(icon);
  btn.appendChild(label);
  return btn;
}

// Numeric module color → CSS hex string
const colorHex = (mod) => `#${mod.color.toString(16).padStart(6, '0')}`;

/**
 * Module icon (palette and hotbar): image tinted with the module color,
 * or a color block with the tile's short label; the eraser gets a cross
 */
function createModuleIcon(mod) {
  const icon = document.createElement('span');
  icon.className = 'module-icon';
  icon.style.backgroundColor = colorHex(mod);

  if (mod.icon) {
    const img = document.createElement('img');
    img.src = mod.icon;
    img.alt = '';
    img.onerror = () => img.remove(); // color block remains
    icon.appendChild(img);
  } else {
    icon.textContent = mod.kind === 'eraser' ? '✕' : mod.short;
  }
  return icon;
}

/**
 * Lets the browser download text as a file
 */
export function downloadTextFile(filename, text, mimeType = 'application/json') {
  downloadFile(filename, new Blob([text], { type: mimeType }));
}

/**
 * Lets the browser download a Blob (e.g. a picture) as a file
 */
export function downloadFile(filename, blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;

  // Link must be in the document for Firefox; revoke after the download has started
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}