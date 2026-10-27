/**
 * Freighter base building modules.
 *
 * Source: No Man's Sky wiki, "Freighter Base Building" (Endurance, 2022),
 * excluding small-scale technology, plants, furnishings, decoration,
 * wall art and legacy structures. Wall pieces (Internal Wall, Bulkhead
 * Door, Reinforced Window) sit between tiles and are not included yet.
 *
 * Each module has:
 * - id        internal identifier, stored in saves (don't rename without a save migration)
 * - label     UI display name
 * - short     2–3 character label drawn on the tile
 * - category  palette group (see CATEGORIES)
 * - kind      'corridor' | 'stairs' | 'ladder' | 'exterior' | 'room' | 'eraser'
 * - color     tile color (tint for corridor textures)
 * - rotatable optional, rotation (R key) matters, e.g. stairs climb direction
 * - exterior  optional, outside the hull (doesn't connect to corridors)
 * - icon      optional palette image
 */

// Module id that acts as an eraser
export const EMPTY_ID = 'empty';

export const CATEGORIES = [
  { id: 'structure', label: 'Structure' },
  { id: 'hightech', label: 'High-Tech Rooms' },
  { id: 'industrial', label: 'Industrial Rooms' },
  { id: 'agricultural', label: 'Agricultural Rooms' },
];

// Shared colors per category; expansion rooms are a darker shade
const HIGHTECH = 0x8e44ad;
const HIGHTECH_EXPANSION = 0x5b2c6f;
const INDUSTRIAL = 0xd35400;
const INDUSTRIAL_EXPANSION = 0x873600;
const STORAGE = 0xd4ac0d;
const AGRICULTURAL = 0x27ae60;
const AGRICULTURAL_EXPANSION = 0x196f3d;

const room = (id, label, short, category, color) => ({ id, label, short, category, kind: 'room', color });

export const MODULE_TYPES = [
  // Structure
  { id: 'freighter_corridor', label: 'Freighter Corridor', short: '', category: 'structure', kind: 'corridor', color: 0x9fc6e8, icon: 'assets/modules/corridor_cross.png' },
  { id: 'glass_corridor', label: 'Freighter Glass Corridor', short: '', category: 'structure', kind: 'corridor', color: 0x76e4f2, icon: 'assets/modules/corridor_cross.png' },
  { id: 'freighter_stairs', label: 'Freighter Stairs', short: 'ST', category: 'structure', kind: 'stairs', color: 0x2e86c1, rotatable: true },
  { id: 'glass_stairs', label: 'Freighter Glass Stairs', short: 'GS', category: 'structure', kind: 'stairs', color: 0x17a589, rotatable: true },
  { id: 'external_stairs', label: 'Freighter External Stairs', short: 'ES', category: 'structure', kind: 'stairs', color: 0x707b7c, rotatable: true, exterior: true },
  { id: 'ladder', label: 'Ladder Module', short: 'LD', category: 'structure', kind: 'ladder', color: 0x5d6d7e },
  { id: 'exterior_catwalk', label: 'Exterior Catwalk', short: 'CW', category: 'structure', kind: 'exterior', color: 0x839192, exterior: true },
  { id: 'exterior_platform', label: 'Exterior Platform', short: 'PL', category: 'structure', kind: 'exterior', color: 0xa6acaf, exterior: true },

  // High-Tech Room Modules
  room('fleet_command_room', 'Fleet Command Room', 'FC', 'hightech', HIGHTECH),
  room('scanner_room', 'Scanner Room', 'SC', 'hightech', HIGHTECH),
  room('teleport_chamber', 'Teleport Chamber', 'TP', 'hightech', HIGHTECH),
  room('appearance_modifier_room', 'Appearance Modifier Room', 'AM', 'hightech', HIGHTECH),
  room('science_specialist_room', "Science Specialist's Room", 'SS', 'hightech', HIGHTECH),
  room('construction_specialist_room', "Construction Specialist's Room", 'CS', 'hightech', HIGHTECH),
  room('galactic_trade_room', 'Galactic Trade Room', 'GT', 'hightech', HIGHTECH),
  room('technology_room_expansion', 'Technology Room (Expansion)', 'T+', 'hightech', HIGHTECH_EXPANSION),

  // Industrial Rooms
  room('refiner_room', 'Refiner Room', 'RF', 'industrial', INDUSTRIAL),
  room('stellar_extractor_room', 'Stellar Extractor Room', 'SX', 'industrial', INDUSTRIAL),
  room('orbital_exocraft_materialiser', 'Orbital Exocraft Materialiser', 'EX', 'industrial', INDUSTRIAL),
  room('exocraft_specialist_room', "Exocraft Specialist's Room", 'XS', 'industrial', INDUSTRIAL),
  room('weapons_terminal_room', 'Weapons Terminal Room', 'WT', 'industrial', INDUSTRIAL),
  room('industrial_room_expansion', 'Industrial Room (Expansion)', 'I+', 'industrial', INDUSTRIAL_EXPANSION),

  // Storage Room 0–9 (each number once per freighter)
  ...Array.from({ length: 10 }, (_, n) => room(`storage_room_${n}`, `Storage Room ${n}`, `S${n}`, 'industrial', STORAGE)),

  // Agricultural Room Modules
  room('cultivation_chamber', 'Cultivation Chamber', 'CC', 'agricultural', AGRICULTURAL),
  room('double_cultivation_chamber', 'Double Cultivation Chamber', 'DC', 'agricultural', AGRICULTURAL),
  room('nutrition_room', 'Nutrition Room', 'NR', 'agricultural', AGRICULTURAL),
  room('agricultural_specialist_room', "Agricultural Specialist's Room", 'AS', 'agricultural', AGRICULTURAL),
  room('biological_room_expansion', 'Biological Room (Expansion)', 'B+', 'agricultural', AGRICULTURAL_EXPANSION),

  // Eraser: placing it clears the tile
  { id: EMPTY_ID, label: 'Empty (eraser)', short: '', category: null, kind: 'eraser', color: 0x1a1a1a },
];

// Lookup by id (undefined for unknown/removed module types)
export const MODULE_BY_ID = Object.fromEntries(MODULE_TYPES.map(m => [m.id, m]));

/**
 * Whether a corridor on a neighbouring tile connects to this module
 * (exterior pieces need a Bulkhead Door, so they don't).
 */
export function connectsToCorridor(modDef) {
  return !!modDef && !modDef.exterior && ['corridor', 'stairs', 'ladder', 'room'].includes(modDef.kind);
}
