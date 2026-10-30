import { FLOORS } from './data.js';
import { MODULE_TYPES, CATEGORIES, EMPTY_ID } from './modules.js';

/**
 * Builds the sidebar and wires up its controls.
 * Returns functions to update UI state from the app.
 */
export function setupUI({ onSelectModule, onSelectFloor, onNew, onSave, onLoad, onExport, onImport, onUndo, onRedo, onGoToFloor }) {
  const palette = buildPalette(onSelectModule);

  // Floor Selector
  const floorSelect = document.getElementById('floorSelect');
  for (let i = 1; i <= FLOORS; i++) {
    const opt = document.createElement('option');
    opt.value = i;
    opt.textContent = `Floor ${i}`;
    floorSelect.appendChild(opt);
  }
  floorSelect.addEventListener('change', e => onSelectFloor(parseInt(e.target.value)));

  // Buttons
  document.getElementById('newBtn').addEventListener('click', onNew);
  document.getElementById('saveBtn').addEventListener('click', onSave);
  document.getElementById('loadBtn').addEventListener('click', onLoad);
  document.getElementById('exportBtn').addEventListener('click', onExport);

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

  window.addEventListener('keydown', (e) => {
    // Leave text fields their own undo
    if (e.target.closest?.('input, textarea, [contenteditable]')) return;
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

    // Reflect a module picked by the app (eyedropper)
    selectModule(id) {
      palette.select(id);
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
 * Module palette: eraser on top, then one collapsible group per category,
 * filtered by the search box.
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

    // Selection behavior
    btn.addEventListener('click', () => {
      highlight(btn);
      onSelectModule(mod);
    });

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

  // Convert numeric color → hex string
  const colorHex = `#${mod.color.toString(16).padStart(6, '0')}`;

  // Via CSS variable so the .selected border can still override it
  btn.style.setProperty('--module-color', colorHex);

  const icon = document.createElement('span');
  icon.className = 'module-icon';
  icon.style.backgroundColor = colorHex;

  if (mod.icon) {
    const img = document.createElement('img');
    img.src = mod.icon;
    img.alt = '';
    img.onerror = () => img.remove(); // color block remains
    icon.appendChild(img);
  } else {
    icon.textContent = mod.short;
  }

  const label = document.createElement('span');
  label.className = 'module-label';
  label.textContent = mod.label;

  btn.appendChild(icon);
  btn.appendChild(label);
  return btn;
}

/**
 * Lets the browser download text as a file
 */
export function downloadTextFile(filename, text, mimeType = 'application/json') {
  const url = URL.createObjectURL(new Blob([text], { type: mimeType }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;

  // Link must be in the document for Firefox; revoke after the download has started
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}