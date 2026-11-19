import {
  memo, useEffect, useRef, useState,
} from 'react';
import { DICE } from '@shared/presets.js';
import {
  displayName, memberColor, rollFormula, useGame,
} from '../game.js';
import { Die, Stepper, Toggle } from './common.jsx';
import {
  cardKeyOf, noteRolls, pendingReveal, revealOf, startPending, throwOf, timeline, useRevealUpdates,
} from './rollReveal.js';
import { DEFAULT_POWER, frameIndex } from './diceThrow.js';

export function DiceTray() {
  const { send, isStoryteller, you } = useGame();
  const [sides, setSides] = useState(20);
  const [count, setCount] = useState(1);
  const [modifier, setModifier] = useState(0);
  const [label, setLabel] = useState('');
  const [hidden, setHidden] = useState(false);
  // Collapsed by default so the log gets the room; the bar still rolls in one click.
  const [open, setOpen] = useState(false);

  function roll(power) {
    const dice = {
      sides, count, modifier, label, hidden: isStoryteller && hidden, power,
    };
    startPending(you, dice);
    send('roll', dice);
  }

  const formula = `${count}d${sides}${modifier ? (modifier > 0 ? `+${modifier}` : modifier) : ''}`;

  return (
    <form className={`dice-tray${open ? ' open' : ''}`} onSubmit={(e) => { e.preventDefault(); roll(DEFAULT_POWER); }}>
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
        <RollButton onRoll={roll} />
      </div>
      {open && <DiceOptions {...{ sides, setSides, count, setCount, modifier, setModifier, label, setLabel, hidden, setHidden, isStoryteller }} />}
    </form>
  );
}

// Holding Roll winds up a harder throw: the button fills, then holds at full
// strength for a moment. Hold on past that and the throw fizzles out. A plain
// click throws at the usual strength.
const CHARGE_MS = 900;
const PEAK_MS = 450;
const FIZZLE_POWER = 0.1;
const PHASE_TEXT = { charging: 'Roll', peak: 'Let go!', fizzled: 'Fizzled' };

function chargeAt(ms) {
  if (ms < CHARGE_MS) {
    const k = ms / CHARGE_MS;
    return { phase: 'charging', fill: k, power: DEFAULT_POWER + (1 - DEFAULT_POWER) * k * (2 - k) };
  }
  if (ms < CHARGE_MS + PEAK_MS) return { phase: 'peak', fill: 1, power: 1 };
  return { phase: 'fizzled', fill: 1, power: FIZZLE_POWER };
}

function RollButton({ onRoll }) {
  const btn = useRef(null);
  const text = useRef(null);
  const hold = useRef(null); // { t0, raf, phase } while the button is held
  const onRollRef = useRef(onRoll);
  onRollRef.current = onRoll;

  function show(phase, fill) {
    const el = btn.current;
    if (!el) return;
    el.style.setProperty('--fill', fill);
    if (el.dataset.phase !== phase) {
      if (phase) el.dataset.phase = phase;
      else delete el.dataset.phase;
      text.current.textContent = PHASE_TEXT[phase] ?? 'Roll';
    }
  }

  function start() {
    if (hold.current) return;
    const h = { t0: performance.now(), raf: 0 };
    hold.current = h;
    const tick = () => {
      const { phase, fill } = chargeAt(performance.now() - h.t0);
      show(phase, fill);
      h.raf = requestAnimationFrame(tick);
    };
    tick();
  }

  function stop(throwIt) {
    const h = hold.current;
    if (!h) return;
    hold.current = null;
    cancelAnimationFrame(h.raf);
    show(null, 0);
    if (throwIt) onRollRef.current(chargeAt(performance.now() - h.t0).power);
  }

  useEffect(() => () => cancelAnimationFrame(hold.current?.raf), []);

  const isKey = (e) => e.key === ' ' || e.key === 'Enter';
  return (
    <button
      type="button"
      ref={btn}
      className="btn primary roll-btn"
      title="Click to roll. Hold to throw harder, but let go before it fizzles."
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        start();
      }}
      onPointerUp={() => stop(true)}
      onPointerCancel={() => stop(false)}
      onKeyDown={(e) => {
        if (!isKey(e)) return;
        e.preventDefault();
        if (!e.repeat) start();
      }}
      onKeyUp={(e) => {
        if (!isKey(e)) return;
        e.preventDefault();
        stop(true);
      }}
      onBlur={() => stop(false)}
      onContextMenu={(e) => e.preventDefault()}
    >
      <span className="roll-charge" aria-hidden />
      <span className="roll-btn-text" ref={text}>Roll</span>
    </button>
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
const spread = (n) => (Math.random() * 2 - 1) * n;

// A tumbling die's pose. The shake shrinks as the die slows, from a hard
// rattle to a last small wobble, so the landing feels earned.
function tumble(progress) {
  const amp = 1 - 0.8 * Math.min(1, progress) ** 1.5;
  return { x: spread(2.5 * amp), y: spread(2.5 * amp), rot: spread(11 * amp) };
}

// Plays a reveal: dice rattle with their faces flickering, the flicker and the
// shake slowing together like a wheel losing speed, then each die lands on its
// real face in turn (jolting the table). Returns what to draw right now. For a
// thrown roll the dice are drawn by <ThrownDice>, so this only keeps time.
function useReveal(roll, reveal, surfaceRef) {
  // Start on random faces, so the real result never shows before the first tick.
  const [frame, setFrame] = useState(() => reveal && {
    t: performance.now() - reveal.start,
    faces: (roll.results || []).map(() => randomFace(roll.sides)),
    poses: (roll.results || []).map(() => tumble(0)),
  });

  // Runs once per reveal. (The roll object is replaced by every state update,
  // but its dice never change, so it isn't a dependency.) A pending roll hands
  // over to the real one mid-rattle, which restarts this with real landings.
  useEffect(() => {
    if (!reveal) return undefined;
    if (reveal.sim) {
      let raf = 0;
      const tick = () => {
        setFrame({ t: performance.now() - reveal.start });
        if (performance.now() < reveal.end) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
      return () => cancelAnimationFrame(raf);
    }
    const { lands } = timeline(roll, reveal);
    const slowest = roll.results?.length === 1 && roll.sides === 20 ? 360 : 210;
    const dice = lands.map(() => ({
      face: randomFace(roll.sides), next: 0, pose: tumble(0), gap: 45,
    }));
    let landed = lands.filter((at) => performance.now() - reveal.start >= at).length;
    let raf = 0;
    const tick = () => {
      const t = performance.now() - reveal.start;
      dice.forEach((d, i) => {
        if (t >= lands[i] || t < d.next) return;
        const progress = t / lands[i];
        d.face = randomFace(roll.sides, d.face);
        d.pose = tumble(progress);
        d.gap = 45 + slowest * progress ** 2.4;
        d.next = t + d.gap;
      });
      const nowLanded = lands.filter((at) => t >= at).length;
      if (nowLanded > landed) {
        landed = nowLanded;
        surfaceRef.current?.closest('.table-surface')?.animate(
          [{ transform: 'translateY(0)' }, { transform: 'translateY(2px)' }, { transform: 'translateY(0)' }],
          { duration: 150, easing: 'ease-out' },
        );
      }
      setFrame({
        t, faces: dice.map((d) => d.face), poses: dice.map((d) => d.pose), gaps: dice.map((d) => d.gap),
      });
      if (performance.now() < reveal.end) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [reveal]);

  return reveal ? frame : null;
}

const signed = (n) => (n > 0 ? `+${n}` : `−${-n}`);

// The latest roll, shown in the middle of the table for everyone. Your own roll
// shows up rattling as soon as you press Roll.
export function RollDisplay() {
  const { room } = useGame();
  noteRolls(room.log);
  useRevealUpdates();
  const pending = pendingReveal();
  if (pending) return <RollCard key={pending.key} roll={pending.roll} reveal={pending} />;
  const roll = room.log.findLast((e) => e.kind === 'roll');
  if (!roll) return <div className="table-hint">Roll the dice to begin…</div>;
  // Keyed so a storyteller's reveal of a secret roll starts fresh, and a roll
  // that took over your pending rattle keeps its card.
  return <RollCard key={cardKeyOf(roll)} roll={roll} reveal={revealOf(roll)} />;
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

  const {
    lands, modIn, modAt, modMs,
  } = timeline(roll, reveal);
  // Thrown dice lie on the table, so the card doesn't show them again.
  const thrown = !!(reveal?.sim ?? throwOf(roll));
  const t = frame?.t ?? Infinity;
  const landedCount = lands.filter((at) => t >= at).length;
  const allLanded = landedCount === lands.length;
  // The total builds up die by die, then any modifier slides in and folds into it.
  const diceSum = roll.results.reduce((sum, v, i) => (t >= lands[i] ? sum + v : sum), 0);
  let total = roll.total;
  let totalClass = '';
  let mod = null;
  if (!landedCount) {
    total = '…';
    totalClass = ' pending';
  } else if (!allLanded) {
    total = diceSum;
    totalClass = ' running';
  } else if (roll.modifier && frame) {
    // Sum alone → modifier pops in and holds → it folds in as the total counts → total pops.
    const fold = Math.min(1, Math.max(0, (t - modAt) / modMs));
    total = Math.round(diceSum + roll.modifier * easeOut(fold));
    if (fold >= 1) totalClass = ' boosted';
    else if (t >= modIn) {
      mod = (
        <span
          className={`roll-mod${roll.modifier < 0 ? ' neg' : ''}${t >= modAt ? ' merging' : ''}`}
          style={{ animationDuration: t >= modAt ? `${modMs}ms` : undefined }}
        >
          {signed(roll.modifier)}
        </span>
      );
    }
  }
  const done = !reveal;
  const size = roll.results.length > 6 ? 34 : 46;

  return (
    <div className={`roll-display${done ? critClass(roll) : ''}${done && revealed ? ' celebrate' : ''}`} ref={ref}>
      <div className="roll-who">
        {who}{roll.label && <span className="muted"> · {roll.label}</span>}
        {roll.hidden && !roll.revealed && <span className="badge">secret</span>}
      </div>
      {!thrown && <div className="roll-dice" aria-hidden={!done}>
        {roll.results.map((v, i) => {
          if (!frame || t >= lands[i]) {
            return <Die key={i} sides={roll.sides} value={v} size={size} className={frame ? 'landed' : ''} />;
          }
          const pose = frame.poses?.[i];
          const style = pose && {
            transform: `translate(${pose.x}px, ${pose.y}px) rotate(${pose.rot}deg)`,
            transitionDuration: `${Math.min(110, (frame.gaps?.[i] ?? 45) * 0.7)}ms`,
          };
          return <Die key={i} sides={roll.sides} value={frame.faces[i]} size={size} className="rattling" style={style} />;
        })}
      </div>}
      <div className="roll-total-row">
        {/* Re-keyed on each landing while the total builds, so it bumps. */}
        <div key={totalClass === ' running' ? landedCount : 'total'} className={`roll-total${totalClass}`}>{total}</div>
        {mod}
      </div>
      <div className="roll-formula muted">{rollFormula(roll)}</div>
    </div>
  );
}

// The latest throw's dice, tumbling across the table and then lying where they
// stopped until the next roll. Drawn over the whole table area.
export function ThrownDice() {
  const { room } = useGame();
  noteRolls(room.log);
  useRevealUpdates();
  const pending = pendingReveal();
  const roll = room.log.findLast((e) => e.kind === 'roll');
  const sim = pending ? pending.sim : roll && throwOf(roll);
  if (!sim?.frames) return null;
  return <ThrowLayer key={sim.id} sim={sim} />;
}

// Plays a planned throw back, writing straight to the dice elements each frame.
// Memoised on the throw: when your pending throw gets its real numbers, the same
// throw object is updated in place, and it carries on without a re-render.
const ThrowLayer = memo(({ sim }) => {
  const ref = useRef(null);

  useEffect(() => {
    const layer = ref.current;
    const dice = [...layer.children].map((el) => ({
      el, svg: el.querySelector('svg'), text: el.querySelector('text'), shadow: el.firstElementChild, rest: false,
    }));
    const surface = layer.closest('.table-area')?.querySelector('.table-surface');
    const half = sim.size / 2;
    let hit = sim.hits.findIndex(([at]) => at > ((performance.now() - sim.start) / 1000) * sim.speed);
    if (hit < 0) hit = sim.hits.length;
    let lastJolt = -Infinity;
    let raf = 0;

    const tick = () => {
      if (!sim.frames) return; // a newer throw took the table
      const t = performance.now() - sim.start;
      const k = frameIndex(sim, t);
      const frame = sim.frames[k];
      dice.forEach((d, i) => {
        const f = frame[i];
        d.el.style.opacity = f.shown ? '1' : '0';
        d.el.style.transform = `translate(${f.x}px, ${f.y}px)`;
        d.svg.style.transform = `translate(${-half}px, ${-half - f.z}px) rotate(${f.angle}deg) scale(${1 + f.z / 180})`;
        d.shadow.style.transform = `translate(${-sim.size * 0.45}px, ${half * 0.5}px) scale(${Math.max(0.4, 1 - f.z / 140)})`;
        d.shadow.style.opacity = String(Math.max(0.25, 0.9 - f.z / 110));
        const label = String(f.face);
        if (d.text.textContent !== label) {
          d.text.textContent = label;
          d.text.setAttribute('font-size', label.length > 2 ? 26 : 34);
        }
        // A little squash as each die settles.
        const resting = !!sim.results && t >= sim.lands[i];
        if (resting !== d.rest) {
          d.rest = resting;
          d.el.classList.toggle('rest', resting);
        }
      });
      // Thuds on the table, from landings, the rim and dice knocking together.
      const tau = (t / 1000) * sim.speed;
      while (hit < sim.hits.length && sim.hits[hit][0] <= tau) {
        const [, strength] = sim.hits[hit++];
        if (strength > 0.3 && t - lastJolt > 70) {
          lastJolt = t;
          const px = Math.min(1.6, Math.max(0.4, strength)) * 2;
          surface?.animate(
            [{ transform: 'translate(0, 0)' }, { transform: `translate(${(Math.random() - 0.5) * px}px, ${px}px)` }, { transform: 'translate(0, 0)' }],
            { duration: 140, easing: 'ease-out' },
          );
        }
      }
      // Keep going until every die has stopped with its real number showing.
      if (k < sim.frames.length - 1 || !sim.results || dice.some((d) => !d.rest)) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [sim]);

  return (
    <div className="thrown-dice" ref={ref} aria-hidden="true">
      {Array.from({ length: sim.count }, (_, i) => (
        <div className="thrown-die" key={i} style={{ opacity: 0 }}>
          <div className="thrown-shadow" style={{ width: sim.size * 0.9, height: sim.size * 0.34 }} />
          <Die sides={sim.sides} size={sim.size} />
        </div>
      ))}
    </div>
  );
});
