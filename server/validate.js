// Everything a client sends is untrusted: these helpers coerce input into the
// shapes the room expects, clamping numbers and trimming strings.
import { randomUUID } from 'node:crypto';
import {
  BACKGROUNDS, DEFAULT_PLAYER_CONTROLS, EQUIPMENT_SLOTS, GAME_TYPES, PLAYER_CONTROLS, PORTRAITS, TABLE_PRESETS,
} from '../shared/presets.js';
import { UPLOAD_LIMITS } from '../shared/uploads.js';
import { cleanJpegDataUrl } from './images.js';

export class GameError extends Error {}

export const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
export const arr = (v) => (Array.isArray(v) ? v : []);
export const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

export function clampInt(v, min, max, fallback) {
  const n = Math.round(Number(v));
  return v !== null && v !== '' && Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

const ID_RE = /^[a-z0-9_-]{1,24}$/i;
// RegExp#test coerces its argument, so `undefined` would pass as the string "undefined".
const isId = (v) => typeof v === 'string' && ID_RE.test(v);
const COLOR_RE = /^#[0-9a-f]{6}$/i;

export function sanitizeConfig(input) {
  const c = obj(input);
  const gameType = GAME_TYPES[c.gameType] ? c.gameType : 'custom';

  const stats = [...new Set(arr(c.stats).map((s) => str(s, 24)).filter(Boolean))].slice(0, 12);
  if (!stats.length) throw new GameError('Add at least one stat.');
  const statMin = clampInt(c.statMin, -99, 999, 1);
  const statMax = clampInt(c.statMax, statMin, 999, Math.max(statMin, 20));
  const statDefault = clampInt(c.statDefault, statMin, statMax, statMin);

  const usedIds = new Set();
  const resources = arr(c.resources).slice(0, 8).map((raw, i) => {
    const r = obj(raw);
    let id = isId(r.id) ? r.id : `res${i}`;
    if (usedIds.has(id)) id = `${id}-${i}`;
    usedIds.add(id);
    return {
      id,
      name: str(r.name, 24) || `Resource ${i + 1}`,
      renewable: !!r.renewable,
      max: clampInt(r.max, 1, 9999, 10),
      color: COLOR_RE.test(r.color) ? r.color : '#9a7d3a',
    };
  });

  const slotIds = EQUIPMENT_SLOTS.map((s) => s.id);
  const equipment = slotIds.filter((id) => arr(c.equipment).includes(id));
  const inv = obj(c.inventory);

  return {
    gameType,
    stats,
    statMin,
    statMax,
    statDefault,
    showModifiers: gameType === 'fantasy' && !!GAME_TYPES.fantasy.showModifiers,
    resources,
    equipment,
    inventory: { enabled: !!inv.enabled, slots: clampInt(inv.slots, 1, 40, 10) },
  };
}

export function sanitizeControls(input) {
  const c = obj(input);
  return Object.fromEntries(PLAYER_CONTROLS.map(({ id }) => [id, typeof c[id] === 'boolean' ? c[id] : DEFAULT_PLAYER_CONTROLS[id]]));
}

// Uploaded images arrive as JPEG data URLs, downsized by the client to fit
// UPLOAD_LIMITS. cleanJpegDataUrl verifies, size-checks and strips them; anything
// that fails falls back to a preset.
function sanitizeSceneLayer(v, presets, limits, fallbackId) {
  const s = obj(v);
  const dataUrl = s.type === 'upload' && cleanJpegDataUrl(s.dataUrl, limits);
  if (dataUrl) return { type: 'upload', dataUrl };
  return { type: 'preset', id: presets.some((p) => p.id === s.id) ? s.id : fallbackId };
}

export const sanitizeSceneBackground = (v) => sanitizeSceneLayer(v, BACKGROUNDS, UPLOAD_LIMITS.background, BACKGROUNDS[0].id);

export function sanitizeSceneTable(v, background) {
  const fallback = BACKGROUNDS.find((b) => b.id === background?.id)?.table || TABLE_PRESETS[0].id;
  return sanitizeSceneLayer(v, TABLE_PRESETS, UPLOAD_LIMITS.table, fallback);
}

export function sanitizeScene(input) {
  const s = obj(input);
  const background = sanitizeSceneBackground(s.background);
  return { background, table: sanitizeSceneTable(s.table, background) };
}

function sanitizeItem(v) {
  const i = obj(v);
  const name = str(i.name, 40);
  if (!name) return null;
  return {
    id: isId(i.id) ? i.id : randomUUID().slice(0, 8),
    name,
    description: str(i.description, 200),
    qty: clampInt(i.qty, 1, 999, 1),
    hidden: !!i.hidden,
  };
}

function sanitizePortrait(v) {
  const p = obj(v);
  const dataUrl = p.type === 'upload' && cleanJpegDataUrl(p.dataUrl, UPLOAD_LIMITS.portrait);
  if (dataUrl) return { type: 'upload', dataUrl };
  if (p.type === 'discord') return { type: 'discord' };
  const key = PORTRAITS.some((x) => x.key === p.key) ? p.key : PORTRAITS[0].key;
  return { type: 'preset', key };
}

// `trusted` is true for storyteller edits, which may go beyond the limits the
// storyteller set for character creation.
export function sanitizeCharacter(input, config, trusted) {
  const c = obj(input);
  const srcStats = obj(c.stats);
  const srcResources = obj(c.resources);
  const srcEquipment = obj(c.equipment);

  const stats = {};
  for (const s of config.stats) {
    stats[s] = trusted
      ? clampInt(srcStats[s], -999, 9999, config.statDefault)
      : clampInt(srcStats[s], config.statMin, config.statMax, config.statDefault);
  }

  const resources = {};
  for (const r of config.resources) {
    const src = obj(srcResources[r.id]);
    // A max of 0 means this character doesn't have the resource at all.
    const max = clampInt(src.max, 0, trusted ? 99999 : r.max, r.max);
    resources[r.id] = { current: clampInt(src.current, 0, max, max), max };
  }

  const equipment = {};
  for (const slot of config.equipment) equipment[slot] = sanitizeItem(srcEquipment[slot]);

  const inventory = config.inventory.enabled
    ? arr(c.inventory).map(sanitizeItem).filter(Boolean).slice(0, config.inventory.slots)
    : [];

  return {
    name: str(c.name, 40) || 'Nameless Wanderer',
    portrait: sanitizePortrait(c.portrait),
    stats,
    resources,
    equipment,
    inventory,
  };
}
