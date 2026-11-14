import { useState } from 'react';
import {
  DEFAULT_PLAYER_CONTROLS, EQUIPMENT_SLOTS, GAME_TYPES, RESOURCE_PRESETS,
} from '@shared/presets.js';
import { Stepper, Toggle } from '../components/common.jsx';
import PlayerControlsList from '../components/PlayerControls.jsx';
import ScenePicker from '../components/ScenePicker.jsx';
import { defaultScene, useGame } from '../game.js';

const MAX_RESOURCES = 8;

function presetResources(gameType) {
  const enabled = new Set(GAME_TYPES[gameType].resources);
  return RESOURCE_PRESETS.map((r) => ({ ...r, enabled: enabled.has(r.id) }));
}

const rangeOf = (t) => ({ min: t.statMin, max: t.statMax, def: t.statDefault });

export default function StorytellerSetup() {
  const { send } = useGame();
  const [step, setStep] = useState(0);
  const [gameType, setGameType] = useState('fantasy');
  const [stats, setStats] = useState(GAME_TYPES.fantasy.stats);
  const [newStat, setNewStat] = useState('');
  const [range, setRange] = useState(rangeOf(GAME_TYPES.fantasy));
  const [resources, setResources] = useState(() => presetResources('fantasy'));
  const [inventory, setInventory] = useState({ enabled: true, slots: 10 });
  const [equipment, setEquipment] = useState(EQUIPMENT_SLOTS.map((s) => s.id));
  const [scene, setScene] = useState(() => defaultScene(GAME_TYPES.fantasy.background));
  const [controls, setControls] = useState(DEFAULT_PLAYER_CONTROLS);

  const enabledResources = resources.filter((r) => r.enabled);
  const canContinue = stats.length > 0 && enabledResources.length <= MAX_RESOURCES;

  function chooseType(key) {
    const t = GAME_TYPES[key];
    setGameType(key);
    setStats(t.stats);
    setRange(rangeOf(t));
    setResources(presetResources(key));
    setScene(defaultScene(t.background));
  }

  function addStat(e) {
    e.preventDefault();
    const name = newStat.trim().slice(0, 24);
    if (name && !stats.includes(name) && stats.length < 12) setStats([...stats, name]);
    setNewStat('');
  }

  const updateResource = (id, patch) => setResources(resources.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  function addCustomResource() {
    const id = `custom${Date.now().toString(36)}`;
    setResources([...resources, { id, name: 'New Resource', renewable: true, max: 10, color: '#9a7d3a', enabled: true, custom: true }]);
  }

  function setRangeField(field, value) {
    const next = { ...range, [field]: value };
    if (next.max < next.min) next.max = next.min;
    next.def = Math.min(next.max, Math.max(next.min, next.def));
    setRange(next);
  }

  function openTable() {
    send('setupGame', {
      config: {
        gameType,
        stats,
        statMin: range.min,
        statMax: range.max,
        statDefault: range.def,
        resources: enabledResources.map(({ id, name, renewable, max, color }) => ({ id, name, renewable, max, color })),
        equipment,
        inventory,
      },
      scene,
      controls,
    });
  }

  if (step === 1) {
    return (
      <div className="screen scroll">
        <div className="page">
          <header className="page-header">
            <p className="eyebrow">Step 2 of 2</p>
            <h1>Set the scene</h1>
            <p className="muted">
              Pick where tonight's story takes place and what everyone gathers around. Choose presets or upload your own images.
              You can change both later with the Scene button at the table.
            </p>
          </header>
          <div className="panel">
            <ScenePicker scene={scene} onChange={(change) => setScene((s) => ({ ...s, ...change }))} />
          </div>
          <div className="page-actions">
            <button className="btn ghost" onClick={() => setStep(0)}>← Back to rules</button>
            <button className="btn primary" onClick={openTable}>Open the table</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="screen scroll">
      <div className="page">
        <header className="page-header">
          <p className="eyebrow">Step 1 of 2</p>
          <h1>Write the rules</h1>
          <p className="muted">Choose how characters are built. Players create their heroes from what you allow here.</p>
        </header>

        <section className="panel">
          <h2>Game type</h2>
          <div className="choice-grid">
            {Object.entries(GAME_TYPES).map(([key, t]) => (
              <button key={key} className={`choice${gameType === key ? ' selected' : ''}`} onClick={() => chooseType(key)}>
                <strong>{t.label}</strong>
                <span>{t.blurb}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="panel">
          <h2>Stats</h2>
          <div className="chip-list">
            {stats.map((s) => (
              <span className="chip" key={s}>
                {s}
                <button onClick={() => setStats(stats.filter((x) => x !== s))} aria-label={`Remove ${s}`}>✕</button>
              </span>
            ))}
            <form onSubmit={addStat} className="chip-add">
              <input value={newStat} maxLength={24} placeholder="Add a stat…" onChange={(e) => setNewStat(e.target.value)} />
              <button className="btn small" disabled={!newStat.trim() || stats.length >= 12}>Add</button>
            </form>
          </div>
          {!stats.length && <p className="error-text">Add at least one stat.</p>}
          <div className="inline-fields">
            <label className="field">
              <span>Lowest</span>
              <Stepper value={range.min} min={-99} max={999} onChange={(v) => setRangeField('min', v)} />
            </label>
            <label className="field">
              <span>Highest</span>
              <Stepper value={range.max} min={range.min} max={999} onChange={(v) => setRangeField('max', v)} />
            </label>
            <label className="field">
              <span>Starting value</span>
              <Stepper value={range.def} min={range.min} max={range.max} onChange={(v) => setRangeField('def', v)} />
            </label>
          </div>
        </section>

        <section className="panel">
          <h2>Resources</h2>
          <p className="muted">
            Renewable resources (↻) refill when you call a rest at the table. Non-renewable ones only change when you change them.
            The max is the most a player can start with. Players can set any resource to 0 if their character doesn't have it.
          </p>
          <div className="resource-config">
            {resources.map((r) => (
              <div className={`resource-config-row${r.enabled ? '' : ' disabled'}`} key={r.id}>
                <Toggle checked={r.enabled} onChange={(enabled) => updateResource(r.id, { enabled })} />
                <input
                  type="color"
                  value={r.color}
                  onChange={(e) => updateResource(r.id, { color: e.target.value })}
                  aria-label={`${r.name} color`}
                />
                <input
                  className="resource-config-name"
                  value={r.name}
                  maxLength={24}
                  onChange={(e) => updateResource(r.id, { name: e.target.value })}
                />
                <div className="segmented">
                  <button className={r.renewable ? 'on' : ''} onClick={() => updateResource(r.id, { renewable: true })}>Renewable</button>
                  <button className={!r.renewable ? 'on' : ''} onClick={() => updateResource(r.id, { renewable: false })}>Non-renewable</button>
                </div>
                <label className="max-field">
                  <span className="muted">Max</span>
                  <Stepper small value={r.max} min={1} max={9999} onChange={(max) => updateResource(r.id, { max })} />
                </label>
                {r.custom && (
                  <button className="icon-btn" onClick={() => setResources(resources.filter((x) => x.id !== r.id))} aria-label="Remove resource">✕</button>
                )}
              </div>
            ))}
          </div>
          <button className="btn small" onClick={addCustomResource}>+ Custom resource</button>
          {enabledResources.length > MAX_RESOURCES && <p className="error-text">Pick at most {MAX_RESOURCES} resources.</p>}
        </section>

        <section className="panel">
          <h2>Equipment &amp; inventory</h2>
          <p className="muted">Equipment slots each hold one worn or wielded item.</p>
          <div className="chip-list">
            {EQUIPMENT_SLOTS.map((s) => {
              const on = equipment.includes(s.id);
              return (
                <button
                  key={s.id}
                  className={`chip toggleable${on ? ' on' : ''}`}
                  onClick={() => setEquipment(on ? equipment.filter((x) => x !== s.id) : EQUIPMENT_SLOTS.map((x) => x.id).filter((x) => x === s.id || equipment.includes(x)))}
                >
                  {s.label}
                </button>
              );
            })}
          </div>
          <div className="inline-fields">
            <Toggle checked={inventory.enabled} onChange={(enabled) => setInventory({ ...inventory, enabled })} label="Allow a backpack inventory" />
            {inventory.enabled && (
              <label className="field row">
                <span>Slots</span>
                <Stepper value={inventory.slots} min={1} max={40} onChange={(slots) => setInventory({ ...inventory, slots })} />
              </label>
            )}
          </div>
        </section>

        <section className="panel moss">
          <h2>Player controls</h2>
          <p className="muted">
            Once the game starts, which parts of their own sheet can players change themselves? You can always edit everything,
            and you can change these at any time from the table.
          </p>
          <PlayerControlsList controls={controls} onChange={setControls} />
        </section>

        <div className="page-actions">
          <button className="btn ghost" onClick={() => send('releaseRole')}>← Change role</button>
          <button className="btn primary" disabled={!canContinue} onClick={() => setStep(1)}>Next: choose a background →</button>
        </div>
      </div>
    </div>
  );
}
