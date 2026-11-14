import { useState } from 'react';
import { GAME_TYPES } from '@shared/presets.js';
import { Portrait } from '../components/common.jsx';
import {
  EquipmentEditor, InventoryEditor, PortraitPicker, ResourcesEditor, StatsEditor,
} from '../components/editors.jsx';
import { backgroundCss, blankCharacter, useGame } from '../game.js';

const rollBetween = (min, max) => min + Math.floor(Math.random() * (max - min + 1));

// Classic 4d6-drop-lowest for fantasy games; a flat roll within the range otherwise.
function rollStat(config) {
  if (config.gameType === 'fantasy' && config.statMin <= 3 && config.statMax >= 18) {
    const dice = Array.from({ length: 4 }, () => rollBetween(1, 6)).sort((a, b) => a - b);
    return dice[1] + dice[2] + dice[3];
  }
  return rollBetween(config.statMin, config.statMax);
}

export default function CharacterCreator() {
  const { room, me, scene, send } = useGame();
  const config = room.config;
  const [draft, setDraft] = useState(() => blankCharacter(config));
  const set = (patch) => setDraft((d) => ({ ...d, ...patch }));

  const rollStats = () => set({ stats: Object.fromEntries(config.stats.map((s) => [s, rollStat(config)])) });

  return (
    <div className="screen scroll scenic" style={{ background: backgroundCss(scene?.background) }}>
      <div className="page">
        <header className="page-header">
          <p className="eyebrow">{GAME_TYPES[config.gameType]?.label} · Character creation</p>
          <h1>Who are you?</h1>
        </header>

        <section className="panel identity">
          <Portrait portrait={draft.portrait} member={me} size={96} />
          <div className="identity-fields">
            <label className="field">
              <span>Character name</span>
              <input value={draft.name} maxLength={40} placeholder="e.g. Elowen Thistlefoot" onChange={(e) => set({ name: e.target.value })} />
            </label>
            <PortraitPicker portrait={draft.portrait} member={me} onChange={(portrait) => set({ portrait })} />
          </div>
        </section>

        <section className="panel">
          <div className="panel-title-row">
            <h2>Stats</h2>
            <button className="btn small" onClick={rollStats}>Roll for stats</button>
          </div>
          <p className="muted">Each stat can be from {config.statMin} to {config.statMax}.</p>
          <StatsEditor config={config} stats={draft.stats} onChange={(stats) => set({ stats })} />
        </section>

        {config.resources.length > 0 && (
          <section className="panel">
            <h2>Resources</h2>
            <p className="muted">You start at full. Set a resource to 0 if your character doesn't have it.</p>
            <ResourcesEditor config={config} resources={draft.resources} onChange={(resources) => set({ resources })} />
          </section>
        )}

        {config.equipment.length > 0 && (
          <section className="panel">
            <h2>Equipment</h2>
            <p className="muted">Pocketed items are hidden from other players. The storyteller can always see them.</p>
            <EquipmentEditor config={config} equipment={draft.equipment} onChange={(equipment) => set({ equipment })} />
          </section>
        )}

        {config.inventory.enabled && (
          <section className="panel">
            <h2>Inventory</h2>
            <InventoryEditor config={config} inventory={draft.inventory} onChange={(inventory) => set({ inventory })} />
          </section>
        )}

        <div className="page-actions">
          <button className="btn ghost" onClick={() => send('releaseRole')}>← Change role</button>
          <button className="btn primary" disabled={!draft.name.trim()} onClick={() => send('saveCharacter', { character: draft })}>
            Take a seat at the table
          </button>
        </div>
      </div>
    </div>
  );
}
