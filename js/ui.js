import { FLOORS, MODULE_TYPES } from './data.js';

export function setupUI({ onSelectModule, onSelectFloor, onSave, onLoad }) {
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

    btn.style.borderColor = colorHex;
    paletteContainer.appendChild(btn);
  });
  paletteContainer.lastChild.classList.add('selected');

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
}