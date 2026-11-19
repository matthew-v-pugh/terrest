// Tracks which roll is still being revealed at the table, so the roll display
// can play out the dice and the log can hold the numbers back until they land.
// Only a roll that arrives while the table is open animates: rolls already in
// the log when it opens (a join, a reload) show their result straight away.
//
// A new roll is thrown across the table from the roller's seat (see
// diceThrow.js), when the table is on screen to measure. Otherwise its dice
// rattle in place on the roll card.
//
// Your own roll starts the moment you press Roll (a "pending" roll); when the
// real roll comes back from the server it takes over that reveal, so the dice
// keep going without a pause and land on the real result.
import { useSyncExternalStore } from 'react';
import { applyResults, frameIndex, planThrow } from './diceThrow.js';

const SECRET_MS = 1300;
const SETTLE_MS = 220; // the dice sum sits alone for a beat (the whole tail with no modifier)
// A modifier: the sum sits alone, the modifier pops in and holds so it can be
// read, then it folds into the total, which pops once it's added.
const MOD_IN_MS = 380;
const MOD_HOLD_MS = 700;
const MOD_FOLD_MS = 520;
const MOD_POP_MS = 320;
const LAND_LEAD_MS = 300; // a late server reply still leaves rattling dice this long to slow down and land
const PENDING_TIMEOUT_MS = 4000; // give up on a roll the server never sent back
const ROLL_COOLDOWN_MS = 450; // the server ignores rolls closer together than this

// When each die rattling in place lands: a single die gets the longest
// slowdown, and a lone d20 longest of all.
function rattleLands(roll) {
  const n = roll.results.length;
  const rattle = n > 1 ? 650 : roll.sides === 20 ? 1500 : 1000;
  const stagger = n > 1 ? Math.min(170, 900 / n) : 0;
  return roll.results.map((_, i) => rattle + i * stagger);
}

// When each die lands, when a modifier appears and starts folding in, and when
// the whole reveal ends, in ms from its start. A thrown roll's dice land when
// they stop rolling.
export function timeline(roll, reveal) {
  if (roll.secret) return { lands: [], end: SECRET_MS };
  if (roll.pending) {
    return {
      lands: roll.results.map(() => Infinity), modIn: Infinity, modAt: Infinity, end: Infinity,
    };
  }
  const lands = reveal?.sim?.lands ?? rattleLands(roll);
  const last = Math.max(...lands);
  if (!roll.modifier) return { lands, end: last + SETTLE_MS };
  const modIn = last + MOD_IN_MS;
  const modAt = modIn + MOD_HOLD_MS;
  return {
    lands, modIn, modAt, modMs: MOD_FOLD_MS, end: modAt + MOD_FOLD_MS + MOD_POP_MS,
  };
}

// A storyteller revealing a secret roll turns the players' placeholder into the
// real roll, which then gets its own reveal.
export const revealKey = (roll) => `${roll.id}${roll.secret ? ':secret' : ''}`;

const reveals = new Map(); // revealKey -> { start, end, cardKey?, sim? } | null (no animation)
const listeners = new Set();
let version = 0;
let primed = false;
let pending = null; // { key, userId, start, end, roll, sim? }
let lastPendingAt = -Infinity;
let measureTable = null; // set by the table while it's on screen
let currentSim = null; // only the latest throw stays on the table

function emit() {
  version++;
  for (const l of listeners) l();
}

const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// The table registers how to measure itself; returns a function to unregister.
export function setTableMeasure(fn) {
  measureTable = fn;
  return () => { if (measureTable === fn) measureTable = null; };
}

// Plan a throw on the table as it is right now, or null to rattle in place.
function plan(userId, count, sides, power) {
  const table = measureTable?.();
  if (!table) return null;
  const sim = planThrow(table, userId, count, sides, power);
  // The previous throw's dice leave the table (and its frames are let go).
  if (currentSim) currentSim.frames = null;
  currentSim = sim;
  return sim;
}

const matchesPending = (r) => pending && r.userId === pending.userId
  && r.sides === pending.roll.sides && r.results?.length === pending.roll.count;

// Start your own roll straight away, before the server answers.
export function startPending(userId, {
  sides, count, modifier, label, hidden, power,
}) {
  if (reduceMotion()) return;
  const now = performance.now();
  // A click the server will ignore as too soon mustn't start dice that never land.
  if (now - lastPendingAt < ROLL_COOLDOWN_MS) return;
  lastPendingAt = now;
  const sim = plan(userId, count, sides, power);
  if (sim) sim.start = now;
  const mine = {
    key: `pending:${now}`,
    userId,
    start: now,
    end: Infinity,
    sim,
    roll: {
      pending: true, userId, sides, count, modifier, label, hidden, results: Array(count).fill(null),
    },
  };
  pending = mine;
  setTimeout(() => {
    if (pending !== mine) return;
    pending = null;
    emit();
  }, PENDING_TIMEOUT_MS);
  emit();
}

// Your roll that's under way while the server works on it, if any.
export const pendingReveal = () => pending;

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
    const adopt = matchesPending(r) ? pending : null;
    if (adopt) pending = null;
    if (r !== latest || reduceMotion()) {
      reveals.set(key, null);
      continue;
    }
    const now = performance.now();
    let start = now;
    let sim = null;
    if (adopt?.sim?.frames) {
      // Your throw is already in the air: keep it going and give it the real numbers.
      ({ sim, start } = adopt);
      applyResults(sim, r.results, frameIndex(sim, now - start));
    } else if (!r.secret) {
      // (Also when someone else's throw swept your pending dice off the table.)
      sim = plan(r.userId, r.results.length, r.sides, r.power);
      if (sim) {
        sim.start = now;
        applyResults(sim, r.results);
      }
    }
    const { lands, end } = timeline(r, { sim });
    // Dice rattling in place carry on from the pending rattle, but never land
    // sooner than LAND_LEAD_MS from now.
    if (adopt && !sim && lands.length) start = Math.max(adopt.start, now + LAND_LEAD_MS - lands[0]);
    reveals.set(key, {
      start, end: start + end, cardKey: adopt?.key, sim,
    });
    setTimeout(emit, start + end - now + 20);
  }
}

// The roll's reveal while it's still playing, else null.
export function revealOf(roll) {
  const r = reveals.get(revealKey(roll));
  return r && performance.now() < r.end ? r : null;
}

// The throw whose dice are on the table for this roll, if they still are.
export function throwOf(roll) {
  const sim = reveals.get(revealKey(roll))?.sim;
  return sim?.frames ? sim : null;
}

// Which card shows this roll: a roll that took over a pending roll keeps that
// card, so nothing jumps when the server's answer arrives.
export const cardKeyOf = (roll) => reveals.get(revealKey(roll))?.cardKey ?? revealKey(roll);

// Re-render when a reveal starts or finishes.
export function useRevealUpdates() {
  return useSyncExternalStore(
    (l) => { listeners.add(l); return () => listeners.delete(l); },
    () => version,
  );
}
