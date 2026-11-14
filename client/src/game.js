import { createContext, useContext } from 'react';
import { BACKGROUNDS, PORTRAITS, TABLE_PRESETS } from '@shared/presets.js';
import { MAX_SOURCE_FILE_BYTES, UPLOAD_LIMITS } from '@shared/uploads.js';
import { sceneCss } from './scenes.js';

export const GameContext = createContext(null);
export const useGame = () => useContext(GameContext);

// The server re-checks these limits and strips image metadata before sharing.
export const BACKGROUND_UPLOAD = UPLOAD_LIMITS.background;
export const TABLE_UPLOAD = UPLOAD_LIMITS.table;

// CSS `background` values and a label for a scene layer ({ type, id | dataUrl }).
export function backgroundCss(layer) {
  if (layer?.type === 'upload') {
    // Darken uploads slightly so seats and text stay readable on bright images.
    return `linear-gradient(rgba(0,0,0,.2), rgba(0,0,0,.45)), url("${layer.dataUrl}") center / cover no-repeat`;
  }
  return sceneCss((BACKGROUNDS.find((b) => b.id === layer?.id) || BACKGROUNDS[0]).id);
}

export function tableCss(layer) {
  if (layer?.type === 'upload') return `url("${layer.dataUrl}") center / cover no-repeat`;
  return (TABLE_PRESETS.find((t) => t.id === layer?.id) || TABLE_PRESETS[0]).css;
}

export function layerLabel(layer, presets) {
  return layer?.type === 'upload' ? 'Custom' : (presets.find((p) => p.id === layer?.id) || presets[0]).label;
}

export function defaultScene(backgroundId) {
  const bg = BACKGROUNDS.find((b) => b.id === backgroundId) || BACKGROUNDS[0];
  return { background: { type: 'preset', id: bg.id }, table: { type: 'preset', id: bg.table } };
}

export const memberColor = (room, userId) => room.members.find((m) => m.id === userId)?.color || 'var(--muted)';

export function displayName(room, userId) {
  const m = room.members.find((x) => x.id === userId);
  if (!m) return 'Someone';
  if (userId === room.storytellerId) return 'Storyteller';
  return m.character?.name || m.username;
}

export const newItem = () => ({ id: Math.random().toString(36).slice(2, 10), name: '', description: '', qty: 1 });

export function blankCharacter(config) {
  return {
    name: '',
    portrait: { type: 'preset', key: PORTRAITS[0].key },
    stats: Object.fromEntries(config.stats.map((s) => [s, config.statDefault])),
    resources: Object.fromEntries(config.resources.map((r) => [r.id, { current: r.max, max: r.max }])),
    equipment: Object.fromEntries(config.equipment.map((s) => [s, null])),
    inventory: [],
  };
}

export const statModifier = (score) => {
  const mod = Math.floor((score - 10) / 2);
  return mod >= 0 ? `+${mod}` : `${mod}`;
};

export function rollFormula(roll) {
  const mod = roll.modifier ? (roll.modifier > 0 ? ` + ${roll.modifier}` : ` − ${-roll.modifier}`) : '';
  return `${roll.count}d${roll.sides}${mod}`;
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) return reject(new Error('Use a PNG, JPEG or WebP image.'));
    if (file.size > MAX_SOURCE_FILE_BYTES) return reject(new Error('That file is too large (25 MB max).'));
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read that file.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('That file is not an image.'));
      img.onload = () => resolve(img);
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

// Center-crop an uploaded image to a small square JPEG so it stays light to sync.
export async function resizeImage(file, size = UPLOAD_LIMITS.portrait.maxSide) {
  const img = await loadImage(file);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const side = Math.min(img.width, img.height);
  canvas.getContext('2d').drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, size, size);
  return canvas.toDataURL('image/jpeg', 0.85);
}

// Scale an image to fit within maxSide, then lower quality and size until the
// JPEG data URL fits in maxChars.
export async function fitImage(file, { maxSide, maxChars }) {
  const img = await loadImage(file);
  let scale = Math.min(1, maxSide / Math.max(img.width, img.height));
  const canvas = document.createElement('canvas');
  for (let attempt = 0; attempt < 6; attempt++) {
    canvas.width = Math.max(1, Math.round(img.width * scale));
    canvas.height = Math.max(1, Math.round(img.height * scale));
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.82, 0.7, 0.58]) {
      const url = canvas.toDataURL('image/jpeg', quality);
      if (url.length <= maxChars) return url;
    }
    scale *= 0.75;
  }
  throw new Error('That image is too large, even after shrinking it.');
}
