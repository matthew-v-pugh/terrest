// Presets shared by the client (setup screens) and the server (validation).

export const DICE = [4, 6, 8, 10, 12, 20, 100];

export const RESOURCE_PRESETS = [
  { id: 'health', name: 'Health', renewable: true, max: 20, color: '#a8443a' },
  { id: 'mana', name: 'Mana', renewable: true, max: 10, color: '#46679a' },
  { id: 'stamina', name: 'Stamina', renewable: true, max: 10, color: '#b5813a' },
  { id: 'shields', name: 'Shields', renewable: true, max: 10, color: '#3f8391' },
  { id: 'composure', name: 'Composure', renewable: true, max: 10, color: '#7a5a94' },
  { id: 'battery', name: 'Battery', renewable: false, max: 100, color: '#6b8a3a' },
  { id: 'ammo', name: 'Ammo', renewable: false, max: 30, color: '#8a7a62' },
  { id: 'humanity', name: 'Humanity', renewable: false, max: 10, color: '#a0566e' },
];

export const GAME_TYPES = {
  fantasy: {
    label: 'Classic Fantasy',
    blurb: 'Swords, sorcery and six classic ability scores.',
    stats: ['Strength', 'Dexterity', 'Constitution', 'Intelligence', 'Wisdom', 'Charisma'],
    statMin: 0, statMax: 20, statDefault: 10,
    showModifiers: true,
    resources: ['health', 'mana', 'stamina'],
    background: 'organic',
  },
  scifi: {
    label: 'Sci-Fi',
    blurb: 'Starships, blasters and the cold dark between worlds.',
    stats: ['Strength', 'Agility', 'Tech', 'Intellect', 'Charisma', 'Perception'],
    statMin: 0, statMax: 10, statDefault: 5,
    resources: ['health', 'shields', 'battery'],
    background: 'space',
  },
  horror: {
    label: 'Horror',
    blurb: 'Fragile investigators against things that should not be.',
    stats: ['Might', 'Speed', 'Knowledge', 'Sanity'],
    statMin: 0, statMax: 8, statDefault: 4,
    resources: ['health', 'composure', 'ammo'],
    background: 'lava',
  },
  cyberpunk: {
    label: 'Cyberpunk',
    blurb: 'Chrome, neon and a city that never forgives.',
    stats: ['Body', 'Reflex', 'Tech', 'Cool', 'Intelligence', 'Empathy'],
    statMin: 0, statMax: 10, statDefault: 5,
    resources: ['health', 'battery', 'humanity', 'ammo'],
    background: 'ocean',
  },
  custom: {
    label: 'Custom',
    blurb: 'Name your own stats and build the rules from scratch.',
    stats: ['Body', 'Mind', 'Spirit'],
    statMin: 0, statMax: 20, statDefault: 10,
    resources: ['health'],
    background: 'organic',
  },
};

export const EQUIPMENT_SLOTS = [
  { id: 'weapon', label: 'Weapon' },
  { id: 'headgear', label: 'Headgear' },
  { id: 'chestgear', label: 'Chest Gear' },
  { id: 'leggear', label: 'Leg Gear' },
  { id: 'shoes', label: 'Shoes' },
];

// Name colors, handed out in order so no two people at a table share one.
// Deep, earthy tones that stay readable (4.5:1+) on the sand and paper surfaces.
export const PLAYER_COLORS = [
  '#9c2f2f', '#1f5f8b', '#3d6b2a', '#a2520f', '#6b3f8f', '#17695e',
  '#7a6510', '#9a3466', '#4f6b12', '#4b3f9a', '#1d6a80', '#7d4a2a',
];

// Parts of their own sheet the storyteller can let players change mid-game.
export const PLAYER_CONTROLS = [
  { id: 'resources', label: 'Resources', description: 'Spend and recover their own resources (up to their max).' },
  { id: 'items', label: 'Items', description: 'Add, edit and remove their own equipment and inventory.' },
  { id: 'pocket', label: 'Pocketing', description: 'Hide or reveal their own items.' },
  { id: 'stats', label: 'Stats', description: 'Change their own stats within the range you set.' },
  { id: 'identity', label: 'Name & portrait', description: 'Rename their character or change its portrait.' },
];

export const DEFAULT_PLAYER_CONTROLS = { resources: false, items: false, pocket: true, stats: false, identity: false };

// Painted scene backgrounds; the artwork itself is drawn on the client (scenes.js).
export const BACKGROUNDS = [
  { id: 'organic', label: 'Organic', table: 'mossy' },
  { id: 'lava', label: 'Lava', table: 'stone' },
  { id: 'space', label: 'Space', table: 'obsidian' },
  { id: 'ocean', label: 'Ocean', table: 'sandstone' },
];

// Table surfaces. Each background names a matching default via its `table` id.
export const TABLE_PRESETS = [
  { id: 'oak', label: 'Oak', css: 'radial-gradient(ellipse at 50% 35%, #8a5a32 0%, #6a4123 55%, #4a2c16 100%)' },
  { id: 'stone', label: 'Stone', css: 'radial-gradient(ellipse at 50% 35%, #6e6a64 0%, #4f4b46 60%, #34312d 100%)' },
  { id: 'mossy', label: 'Mossy Wood', css: 'radial-gradient(ellipse at 50% 35%, #7a6a45 0%, #5a4c2f 60%, #3c321e 100%)' },
  { id: 'velvet', label: 'Royal Velvet', css: 'radial-gradient(ellipse at 50% 35%, #7b2430 0%, #5a1a24 60%, #3a1018 100%)' },
  { id: 'walnut', label: 'Old Walnut', css: 'radial-gradient(ellipse at 50% 35%, #4a3a33 0%, #33271f 60%, #1f1712 100%)' },
  { id: 'steel', label: 'Steel Console', css: 'radial-gradient(ellipse at 50% 35%, #3a4a66 0%, #26324a 60%, #161e30 100%)' },
  { id: 'obsidian', label: 'Black Glass', css: 'radial-gradient(ellipse at 50% 35%, #2a2a3a 0%, #1a1a28 60%, #0e0e18 100%)' },
  { id: 'sandstone', label: 'Sandstone', css: 'radial-gradient(ellipse at 50% 35%, #9a7a52 0%, #7a5c38 60%, #553e24 100%)' },
  { id: 'felt', label: 'Green Felt', css: 'radial-gradient(ellipse at 50% 35%, #2f7a4a 0%, #1f5a35 60%, #123a22 100%)' },
];

export const PORTRAITS = [
  { key: 'knight', emoji: '🛡️', color: '#5a6b8c' },
  { key: 'wizard', emoji: '🧙', color: '#4b3b8c' },
  { key: 'elf', emoji: '🧝', color: '#3d7a4a' },
  { key: 'rogue', emoji: '🗡️', color: '#3a3a3a' },
  { key: 'ranger', emoji: '🏹', color: '#6b5a2e' },
  { key: 'cleric', emoji: '✨', color: '#a08a3a' },
  { key: 'bard', emoji: '🎻', color: '#8c3b5a' },
  { key: 'vampire', emoji: '🧛', color: '#6b1a24' },
  { key: 'merfolk', emoji: '🧜', color: '#2e6b7a' },
  { key: 'robot', emoji: '🤖', color: '#4a5a66' },
  { key: 'alien', emoji: '👽', color: '#3a6b3a' },
  { key: 'astronaut', emoji: '🧑‍🚀', color: '#2a3a5c' },
  { key: 'detective', emoji: '🕵️', color: '#5c4a3a' },
  { key: 'ghost', emoji: '👻', color: '#56506b' },
  { key: 'dragon', emoji: '🐉', color: '#7a3a1a' },
  { key: 'fox', emoji: '🦊', color: '#a0522d' },
];
