import { useEffect, useState } from 'react';
import { EQUIPMENT_SLOTS, PLAYER_CONTROLS } from '@shared/presets.js';
import { useGame, statModifier } from '../game.js';
import { Modal, Portrait, ResourceBar } from './common.jsx';
import {
  EquipmentEditor, InventoryEditor, PortraitPicker, ResourcesEditor, StatsEditor, VisibilityButton,
} from './editors.jsx';

const FULL_CONTROL = Object.fromEntries(PLAYER_CONTROLS.map((c) => [c.id, true]));

// In read-only lists, owners may still pocket or reveal items if the storyteller
// allows it; everyone else sees a badge (other players never receive pocketed items).
function ItemVisibility({ item, member }) {
  const { you, room, send } = useGame();
  if (member.id === you && room.controls.pocket) {
    return <VisibilityButton hidden={!!item.hidden} onClick={() => send('setItemVisibility', { itemId: item.id, hidden: !item.hidden })} />;
  }
  return item.hidden ? <span className="badge">pocketed</span> : null;
}

// The storyteller can edit everything. Owners can edit whatever the storyteller
// has opened up in player controls. Everyone else gets a read-only view.
export default function CharacterSheet({ member, onClose }) {
  const { room, you, isStoryteller, send } = useGame();
  const config = room.config;
  const isOwner = member.id === you;
  const can = isStoryteller ? FULL_CONTROL : isOwner ? room.controls : {};
  const canSave = isStoryteller || (isOwner && (can.identity || can.stats || can.resources || can.items));
  const live = member.character;

  const [draft, setDraft] = useState(live);
  const [dirty, setDirty] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);

  // Follow live updates until the user starts editing.
  useEffect(() => { if (!dirty) setDraft(live); }, [live, dirty]);

  if (!draft || !live) return null;
  const set = (patch) => { setDraft((d) => ({ ...d, ...patch })); setDirty(true); };

  function save() {
    send(isStoryteller ? 'editCharacter' : 'editOwnCharacter', { userId: member.id, character: draft });
    setDirty(false);
  }

  function remove() {
    if (!confirmRemove) return setConfirmRemove(true);
    send('removeCharacter', { userId: member.id });
    onClose();
  }

  const footer = canSave && (
    <>
      {isStoryteller && (
        <button className="btn danger ghost" onClick={remove}>{confirmRemove ? 'Click again to remove' : 'Remove character'}</button>
      )}
      <span className="spacer" />
      <button className="btn ghost" disabled={!dirty} onClick={() => { setDirty(false); setDraft(live); }}>Discard</button>
      <button className="btn primary" disabled={!dirty} onClick={save}>Save changes</button>
    </>
  );

  const allowedForMe = PLAYER_CONTROLS.filter((c) => room.controls[c.id]).map((c) => c.label.toLowerCase());
  const title = isStoryteller ? 'Edit character' : isOwner ? 'Your character' : 'Character sheet';
  // Read-only sections render from live state so they never show stale data.
  const shown = (part) => (can[part] ? draft : live);

  return (
    <Modal title={title} onClose={onClose} footer={footer} wide>
      {isOwner && !isStoryteller && (
        <p className="sheet-controls-note muted">
          {allowedForMe.length
            ? `The storyteller lets you change your ${allowedForMe.join(', ')}.`
            : 'Only the storyteller can change your sheet right now.'}
        </p>
      )}

      <div className="sheet-header">
        <Portrait portrait={shown('identity').portrait} member={member} size={88} />
        <div className="sheet-identity">
          {can.identity
            ? <input className="sheet-name-input" value={draft.name} maxLength={40} onChange={(e) => set({ name: e.target.value })} />
            : <h3 className="sheet-name" style={{ color: member.color }}>{live.name}</h3>}
          <span className="muted">played by {member.username}{member.online ? '' : ' (away)'}</span>
          {can.identity && (
            <details className="sheet-portrait-edit">
              <summary>Change portrait</summary>
              <PortraitPicker portrait={draft.portrait} member={member} onChange={(portrait) => set({ portrait })} />
            </details>
          )}
        </div>
      </div>

      <h4>Stats</h4>
      {can.stats ? (
        <StatsEditor config={config} stats={draft.stats} onChange={(stats) => set({ stats })} unlocked={isStoryteller} />
      ) : (
        <div className="stat-grid">
          {config.stats.map((s) => (
            <div className="stat-card" key={s}>
              <div className="stat-name">{s}</div>
              <div className="stat-value">{live.stats[s]}</div>
              {config.showModifiers && <div className="stat-mod">{statModifier(live.stats[s])}</div>}
            </div>
          ))}
        </div>
      )}

      {config.resources.length > 0 && (
        <>
          <h4>Resources</h4>
          {can.resources ? (
            <ResourcesEditor
              config={config}
              resources={draft.resources}
              onChange={(resources) => set({ resources })}
              unlocked={isStoryteller}
              currentOnly={!isStoryteller}
            />
          ) : (
            <div className="resource-list">
              {config.resources.filter((r) => live.resources[r.id]?.max > 0).map((r) => (
                <ResourceBar key={r.id} resource={r} value={live.resources[r.id]} />
              ))}
              {!config.resources.some((r) => live.resources[r.id]?.max > 0) && <p className="muted">None.</p>}
            </div>
          )}
        </>
      )}

      {config.equipment.length > 0 && (
        <>
          <h4>Equipment</h4>
          {can.items ? (
            <EquipmentEditor config={config} equipment={draft.equipment} onChange={(equipment) => set({ equipment })} allowHide={!!can.pocket} />
          ) : (
            <ul className="item-list">
              {EQUIPMENT_SLOTS.filter((s) => config.equipment.includes(s.id)).map((s) => {
                const item = live.equipment[s.id];
                return (
                  <li key={s.id} className={item?.hidden ? 'is-hidden' : ''}>
                    <span className="slot-label">{s.label}</span>
                    {item ? <span className="item-text"><strong>{item.name}</strong>{item.description && <span className="muted"> · {item.description}</span>}</span> : <span className="muted item-text">Empty</span>}
                    {item && <ItemVisibility item={item} member={member} />}
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}

      {config.inventory.enabled && (
        <>
          <h4>Inventory</h4>
          {can.items ? (
            <InventoryEditor config={config} inventory={draft.inventory} onChange={(inventory) => set({ inventory })} allowHide={!!can.pocket} />
          ) : live.inventory.length ? (
            <ul className="item-list">
              {live.inventory.map((item) => (
                <li key={item.id} className={item.hidden ? 'is-hidden' : ''}>
                  <span className="item-text">
                    <strong>{item.name}</strong>{item.qty > 1 && ` ×${item.qty}`}
                    {item.description && <span className="muted"> · {item.description}</span>}
                  </span>
                  <ItemVisibility item={item} member={member} />
                </li>
              ))}
            </ul>
          ) : <p className="muted">Nothing in the pack.</p>}
        </>
      )}
    </Modal>
  );
}
