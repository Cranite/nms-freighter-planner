import { FLOORS, MODULE_TYPES } from './data.js';

/**
 * Builds the sidebar and wires up its controls.
 * Returns functions to update UI state from the app.
 */
export function setupUI({ onSelectModule, onSelectFloor, onSave, onLoad, onExport, onImport, onUndo, onRedo }) {
  // Palette
  const paletteContainer = document.getElementById('modulePalette');
  MODULE_TYPES.forEach(mod => {
    const btn = document.createElement('div');
    btn.className = 'module-btn';

    // Convert numeric color → hex string
    const colorHex = `#${mod.color.toString(16).padStart(6, '0')}`;

    // Icon container (image or fallback)
    const iconWrapper = document.createElement('div');
    iconWrapper.className = 'icon-wrapper';
    iconWrapper.style.width = '32px';
    iconWrapper.style.height = '32px';
    iconWrapper.style.borderRadius = '6px';
    iconWrapper.style.flexShrink = '0';
    iconWrapper.style.overflow = 'hidden';

    if (mod.image) {
      const img = document.createElement('img');
      img.src = mod.image;
      img.alt = mod.label;
      img.width = 32;
      img.height = 32;

      // Fallback if image fails to load
      img.onerror = () => {
        iconWrapper.innerHTML = '';
        const colorBlock = document.createElement('div');
        colorBlock.className = 'color-fallback';
        colorBlock.style.backgroundColor = colorHex;
        colorBlock.style.width = '100%';
        colorBlock.style.height = '100%';
        colorBlock.style.borderRadius = '6px';
        iconWrapper.appendChild(colorBlock);
      };

      iconWrapper.appendChild(img);
    } else {
      // No image → always fallback
      const colorBlock = document.createElement('div');
      colorBlock.className = 'color-fallback';
      colorBlock.style.backgroundColor = colorHex;
      colorBlock.style.width = '100%';
      colorBlock.style.height = '100%';
      colorBlock.style.borderRadius = '6px';
      iconWrapper.appendChild(colorBlock);
    }

    // Label
    const label = document.createElement('span');
    label.textContent = mod.label;
    label.className = 'module-label';

    btn.appendChild(iconWrapper);
    btn.appendChild(label);

    // Selection behavior
    btn.addEventListener('click', () => {
      document.querySelectorAll('.module-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      onSelectModule(mod);
    });

    // Via CSS variable so the .selected border can still override it
    btn.style.setProperty('--module-color', colorHex);
    paletteContainer.appendChild(btn);
  });

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
  };
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