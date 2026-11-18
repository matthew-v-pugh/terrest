import { useEffect, useRef, useState } from 'react';
import { DICE } from '@shared/presets.js';
import {
  displayName, memberColor, rollFormula, useGame,
} from '../game.js';
import { Die, Stepper, Toggle } from './common.jsx';
import {
  noteRolls, revealKey, revealOf, timeline, useRevealUpdates,
} from './rollReveal.js';

export function DiceTray() {
  const { send, isStoryteller } = useGame();
  const [sides, setSides] = useState(20);
  const [count, setCount] = useState(1);
  const [modifier, setModifier] = useState(0);
  const [label, setLabel] = useState('');
  const [hidden, setHidden] = useState(false);
  // Collapsed by default so the log gets the room; the bar still rolls in one click.
  const [open, setOpen] = useState(false);

  function roll(e) {
    e.preventDefault();
    send('roll', { sides, count, modifier, label, hidden: isStoryteller && hidden });
  }

  const formula = `${count}d${sides}${modifier ? (modifier > 0 ? `+${modifier}` : modifier) : ''}`;

  return (
    <form className={`dice-tray${open ? ' open' : ''}`} onSubmit={roll}>
      <div className="dice-bar">
        <button type="button" className="dice-toggle" onClick={() => setOpen(!open)} aria-expanded={open} title={open ? 'Hide dice options' : 'Choose dice, modifier and label'}>
          <Die sides={sides} size={30} />
          <span className="dice-toggle-text">
            <strong>{formula}</strong>
            {(label || (isStoryteller && hidden)) && (
              <span className="muted">{[label, isStoryteller && hidden && 'secret'].filter(Boolean).join(' · ')}</span>
            )}
          </span>
          <span className="dice-chevron" aria-hidden>{open ? '▴' : '▾'}</span>
        </button>
        <button className="btn primary roll-btn">Roll</button>
      </div>
      {open && <DiceOptions {...{ sides, setSides, count, setCount, modifier, setModifier, label, setLabel, hidden, setHidden, isStoryteller }} />}
    </form>
  );
}

function DiceOptions({
  sides, setSides, count, setCount, modifier, setModifier, label, setLabel, hidden, setHidden, isStoryteller,
}) {
  return (
    <div className="dice-options-panel">
      <div className="dice-picker">
        {DICE.map((d) => (
          <button type="button" key={d} className={`dice-pick${sides === d ? ' selected' : ''}`} onClick={() => setSides(d)} title={`d${d}`}>
            <Die sides={d} size={38} />
          </button>
        ))}
      </div>
      <div className="dice-options">
        <label className="field row">
          <span>How many</span>
          <Stepper small value={count} min={1} max={20} onChange={setCount} />
        </label>
        <label className="field row">
          <span>Modifier</span>
          <Stepper small value={modifier} min={-99} max={99} onChange={setModifier} />
        </label>
      </div>
      <input className="dice-label" value={label} maxLength={40} placeholder="What's this roll for? (optional)" onChange={(e) => setLabel(e.target.value)} />
      {isStoryteller && <Toggle checked={hidden} onChange={setHidden} label="Roll in secret" />}
    </div>
  );
}

function critClass(roll) {
  if (roll.sides !== 20 || roll.count !== 1) return '';
  if (roll.results[0] === 20) return ' crit';
  if (roll.results[0] === 1) return ' fumble';
  return '';
}

const randomFace = (sides, not) => {
  const v = 1 + Math.floor(Math.random() * sides);
  return v === not && sides > 1 ? (v % sides) + 1 : v;
};
const easeOut = (t) => 1 - (1 - t) ** 3;

// Plays a reveal: dice rattle with their faces flickering, the flicker slowing
// like a wheel losing speed, then each die lands on its real face in turn
// (jolting the table) and the total counts up. Returns what to draw right now.
function useReveal(roll, reveal, surfaceRef) {
  // Start on random faces, so the real result never shows before the first tick.
  const [frame, setFrame] = useState(() => reveal && {
    t: performance.now() - reveal.start,
    faces: (roll.results || []).map(() => randomFace(roll.sides)),
  });

  // Runs once per reveal. (The roll object is replaced by every state update,
  // but its dice never change, so it isn't a dependency.)
  useEffect(() => {
    if (!reveal) return undefined;
    const { lands } = timeline(roll);
    const slowest = roll.results?.length === 1 && roll.sides === 20 ? 360 : 210;
    const dice = lands.map(() => ({ face: randomFace(roll.sides), next: 0 }));
    let landed = 0;
    let raf = 0;
    const tick = () => {
      const t = performance.now() - reveal.start;
      dice.forEach((d, i) => {
        if (t >= lands[i] || t < d.next) return;
        d.face = randomFace(roll.sides, d.face);
        d.next = t + 45 + slowest * (t / lands[i]) ** 2.4;
      });
      const nowLanded = lands.filter((at) => t >= at).length;
      if (nowLanded > landed) {
        landed = nowLanded;
        surfaceRef.current?.closest('.table-surface')?.animate(
          [{ transform: 'translateY(0)' }, { transform: 'translateY(2px)' }, { transform: 'translateY(0)' }],
          { duration: 150, easing: 'ease-out' },
        );
      }
      setFrame({ t, faces: dice.map((d) => d.face) });
      if (performance.now() < reveal.end) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [reveal]);

  return reveal ? frame : null;
}

// The latest roll, shown in the middle of the table for everyone.
export function RollDisplay() {
  const { room } = useGame();
  noteRolls(room.log);
  useRevealUpdates();
  const roll = room.log.findLast((e) => e.kind === 'roll');
  if (!roll) return <div className="table-hint">Roll the dice to begin…</div>;
  // Keyed by reveal key so a storyteller's reveal of a secret roll starts fresh.
  return <RollCard key={revealKey(roll)} roll={roll} reveal={revealOf(roll)} />;
}

function RollCard({ roll, reveal }) {
  const { room } = useGame();
  const ref = useRef(null);
  // Whether this card played a reveal: only then do crits and fumbles celebrate.
  const [revealed] = useState(!!reveal);
  const frame = useReveal(roll, reveal, ref);
  const who = <span style={{ color: memberColor(room, roll.userId) }}>{displayName(room, roll.userId)}</span>;

  if (roll.secret) {
    return (
      <div className="roll-display secret" ref={ref}>
        <Die sides={20} value="?" size={56} className={`secret-screen${reveal ? ' rattling' : ''}`} />
        <div className="roll-who">{who} rolls behind the screen…</div>
      </div>
    );
  }

  const { lands, countUp } = timeline(roll);
  const t = frame?.t ?? Infinity;
  const allLanded = t >= lands.at(-1);
  let total = roll.total;
  if (!allLanded) total = '…';
  else if (t < lands.at(-1) + countUp) total = Math.round(roll.total * easeOut((t - lands.at(-1)) / countUp));
  const done = !reveal;

  return (
    <div className={`roll-display${done ? critClass(roll) : ''}${done && revealed ? ' celebrate' : ''}`} ref={ref}>
      <div className="roll-who">
        {who}{roll.label && <span className="muted"> · {roll.label}</span>}
        {roll.hidden && !roll.revealed && <span className="badge">secret</span>}
      </div>
      <div className="roll-dice" aria-hidden={!done}>
        {roll.results.map((v, i) => {
          const landed = t >= lands[i];
          let state = '';
          if (frame) state = landed ? ' landed' : ' rattling';
          return (
            <Die
              key={i}
              sides={roll.sides}
              value={landed ? v : frame.faces[i]}
              size={roll.results.length > 6 ? 34 : 46}
              className={state}
              style={{ animationDelay: landed ? '0ms' : `${-i * 47}ms` }}
            />
          );
        })}
      </div>
      <div className={`roll-total${allLanded ? '' : ' pending'}`}>{total}</div>
      <div className="roll-formula muted">{rollFormula(roll)}</div>
    </div>
  );
}
