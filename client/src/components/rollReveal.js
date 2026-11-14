// Tracks which roll is still being revealed at the table, so the roll display
// can play out the dice and the log can hold the numbers back until they land.
// Only a roll that arrives while the table is open animates: rolls already in
// the log when it opens (a join, a reload) show their result straight away.
import { useSyncExternalStore } from 'react';

const SECRET_MS = 1300;
const COUNT_UP_MS = 380;

// When each die lands and when the whole reveal ends, in ms from its start.
// A single die gets the longest slowdown, and a lone d20 longest of all.
export function timeline(roll) {
  if (roll.secret) return { lands: [], end: SECRET_MS };
  const n = roll.results.length;
  const rattle = n > 1 ? 650 : roll.sides === 20 ? 1500 : 1000;
  const stagger = n > 1 ? Math.min(170, 900 / n) : 0;
  const lands = roll.results.map((_, i) => rattle + i * stagger);
  return { lands, end: lands.at(-1) + COUNT_UP_MS, countUp: COUNT_UP_MS };
}

// A storyteller revealing a secret roll turns the players' placeholder into the
// real roll, which then gets its own reveal.
export const revealKey = (roll) => `${roll.id}${roll.secret ? ':secret' : ''}`;

const reveals = new Map(); // revealKey -> { start, end } | null (no animation)
const listeners = new Set();
let version = 0;
let primed = false;

function emit() {
  version++;
  for (const l of listeners) l();
}

const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Notice new rolls in the log. Safe to call from render: each roll is only
// ever noted once.
export function noteRolls(log) {
  const rolls = log.filter((e) => e.kind === 'roll');
  if (!primed) {
    for (const r of rolls) reveals.set(revealKey(r), null);
    primed = true;
    return;
  }
  const latest = rolls.at(-1);
  for (const r of rolls) {
    const key = revealKey(r);
    if (reveals.has(key)) continue;
    if (r !== latest || reduceMotion()) {
      reveals.set(key, null);
      continue;
    }
    const { end } = timeline(r);
    const start = performance.now();
    reveals.set(key, { start, end: start + end });
    setTimeout(emit, end + 20);
  }
}

// The roll's reveal while it's still playing, else null.
export function revealOf(roll) {
  const r = reveals.get(revealKey(roll));
  return r && performance.now() < r.end ? r : null;
}

// Re-render when a reveal finishes.
export function useRevealUpdates() {
  return useSyncExternalStore(
    (l) => { listeners.add(l); return () => listeners.delete(l); },
    () => version,
  );
}
