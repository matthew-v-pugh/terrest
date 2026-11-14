// Describes what changed between two versions of a character as log lines.
// A line is private (owner and storyteller only) when it would expose a
// pocketed item. Pocketing or revealing is public, since the rest of the table
// sees the item vanish or appear anyway.
import { EQUIPMENT_SLOTS } from '../shared/presets.js';

const MAX_LINES = 40;
const qty = (i) => (i.qty > 1 ? ` ×${i.qty}` : '');
const signed = (n) => (n > 0 ? `+${n}` : `${n}`);
const line = (text, isPrivate = false) => ({ text, private: !!isPrivate });

function itemLines(b, a) {
  const secret = b.hidden || a.hidden;
  const lines = [];
  if (b.name !== a.name) lines.push(line(`renamed ${b.name} → ${a.name}`, secret));
  if (b.qty !== a.qty) lines.push(line(`${a.name} ×${b.qty} → ×${a.qty}`, secret));
  if (b.description !== a.description) lines.push(line(`updated the description of ${a.name}`, secret));
  if (!b.hidden && a.hidden) lines.push(line(`pocketed ${b.name}`));
  if (b.hidden && !a.hidden) lines.push(line(`revealed ${a.name}`));
  return lines;
}

export function diffCharacter(before, after, config) {
  const lines = [];

  if (before.name !== after.name) lines.push(line(`renamed ${before.name} → ${after.name}`));
  if (JSON.stringify(before.portrait) !== JSON.stringify(after.portrait)) lines.push(line('changed portrait'));

  for (const s of config.stats) {
    const b = before.stats[s];
    const a = after.stats[s];
    if (b !== a) lines.push(line(`${s} ${b} → ${a} (${signed(a - b)})`));
  }

  for (const r of config.resources) {
    const b = before.resources[r.id];
    const a = after.resources[r.id];
    if (!b || !a || (b.current === a.current && b.max === a.max)) continue;
    lines.push(line(b.max === a.max
      ? `${r.name} ${b.current} → ${a.current} / ${a.max} (${signed(a.current - b.current)})`
      : `${r.name} ${b.current}/${b.max} → ${a.current}/${a.max}`));
  }

  for (const slot of EQUIPMENT_SLOTS.filter((s) => config.equipment.includes(s.id))) {
    const b = before.equipment[slot.id];
    const a = after.equipment[slot.id];
    if (b && a && b.id === a.id) {
      lines.push(...itemLines(b, a));
    } else {
      if (b) lines.push(line(`unequipped ${b.name} (${slot.label})`, b.hidden));
      if (a) lines.push(line(`equipped ${a.name}${a.hidden ? ' (pocketed)' : ''} (${slot.label})`, a.hidden));
    }
  }

  const beforeInv = new Map(before.inventory.map((i) => [i.id, i]));
  const afterIds = new Set(after.inventory.map((i) => i.id));
  for (const b of before.inventory) {
    if (!afterIds.has(b.id)) lines.push(line(`lost ${b.name}${qty(b)}`, b.hidden));
  }
  for (const a of after.inventory) {
    const b = beforeInv.get(a.id);
    if (b) lines.push(...itemLines(b, a));
    else lines.push(line(`gained ${a.name}${qty(a)}${a.hidden ? ' (pocketed)' : ''}`, a.hidden));
  }

  return lines.slice(0, MAX_LINES);
}
