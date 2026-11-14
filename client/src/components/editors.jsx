// Character editors shared by the player's creation screen and the
// storyteller's edit sheet. `unlocked` lifts the creation limits for storytellers.
import { useRef, useState } from 'react';
import { EQUIPMENT_SLOTS, PORTRAITS } from '@shared/presets.js';
import { discordAvatarUrl } from '../discord.js';
import { newItem, resizeImage, statModifier } from '../game.js';
import { Portrait, Stepper } from './common.jsx';

export function PortraitPicker({ portrait, member, onChange }) {
  const fileRef = useRef(null);
  const [error, setError] = useState(null);
  const isSelected = (p) => portrait.type === p.type && portrait.key === p.key;

  async function upload(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      setError(null);
      onChange({ type: 'upload', dataUrl: await resizeImage(file) });
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div>
      <div className="portrait-grid">
        {PORTRAITS.map((p) => (
          <button
            type="button"
            key={p.key}
            className={`portrait-option${isSelected({ type: 'preset', key: p.key }) ? ' selected' : ''}`}
            onClick={() => onChange({ type: 'preset', key: p.key })}
            title={p.key}
          >
            <Portrait portrait={{ type: 'preset', key: p.key }} size={48} />
          </button>
        ))}
        {discordAvatarUrl(member) && (
          <button
            type="button"
            className={`portrait-option${portrait.type === 'discord' ? ' selected' : ''}`}
            onClick={() => onChange({ type: 'discord' })}
            title="Use my Discord avatar"
          >
            <Portrait portrait={{ type: 'discord' }} member={member} size={48} />
          </button>
        )}
        <button
          type="button"
          className={`portrait-option upload${portrait.type === 'upload' ? ' selected' : ''}`}
          onClick={() => fileRef.current?.click()}
          title="Upload an image"
        >
          {portrait.type === 'upload' ? <Portrait portrait={portrait} size={48} /> : <span>+<small>Upload</small></span>}
        </button>
        <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={upload} />
      </div>
      {error && <p className="error-text">{error}</p>}
    </div>
  );
}

export function StatsEditor({ config, stats, onChange, unlocked }) {
  const min = unlocked ? -999 : config.statMin;
  const max = unlocked ? 9999 : config.statMax;
  return (
    <div className="stat-grid">
      {config.stats.map((s) => (
        <div className="stat-card" key={s}>
          <div className="stat-name">{s}</div>
          <Stepper value={stats[s] ?? config.statDefault} min={min} max={max} onChange={(v) => onChange({ ...stats, [s]: v })} />
          {config.showModifiers && <div className="stat-mod">{statModifier(stats[s] ?? config.statDefault)}</div>}
        </div>
      ))}
    </div>
  );
}

// Three modes: creation (set max, start full), `currentOnly` (players spending
// resources mid-game) and `unlocked` (storyteller: current and max).
export function ResourcesEditor({ config, resources, onChange, unlocked, currentOnly }) {
  const creating = !unlocked && !currentOnly;
  const update = (id, patch) => {
    const next = { ...resources[id], ...patch };
    if (creating) next.current = next.max;
    next.current = Math.min(next.current, next.max);
    onChange({ ...resources, [id]: next });
  };
  const shown = currentOnly ? config.resources.filter((r) => resources[r.id]?.max > 0) : config.resources;
  return (
    <div className="resource-editor">
      {shown.map((r) => {
        const v = resources[r.id] || { current: r.max, max: r.max };
        return (
          <div className="resource-row" key={r.id}>
            <span className="swatch" style={{ background: r.color }} />
            <span className="resource-name">
              {r.name}
              <small className="muted">{r.renewable ? ' ↻ renewable' : ' non-renewable'}</small>
            </span>
            {!creating && (
              <>
                <Stepper small value={v.current} min={0} max={v.max} onChange={(current) => update(r.id, { current })} />
                <span className="muted">/</span>
              </>
            )}
            {currentOnly
              ? <span className="resource-max">{v.max}</span>
              : <Stepper small value={v.max} min={0} max={unlocked ? 99999 : r.max} onChange={(max) => update(r.id, { max })} />}
            {creating && <small className="muted">up to {r.max}</small>}
            {v.max === 0 && <small className="muted">(not used)</small>}
          </div>
        );
      })}
    </div>
  );
}

export function VisibilityButton({ hidden, onClick, disabled }) {
  return (
    <button
      type="button"
      className={`visibility-btn${hidden ? ' pocketed' : ''}`}
      onClick={onClick}
      disabled={disabled}
      aria-pressed={hidden}
      title={hidden ? 'Pocketed: hidden from other players (the storyteller can still see it)' : 'Visible to everyone at the table'}
    >
      {hidden ? 'Pocketed' : 'Visible'}
    </button>
  );
}

function ItemFields({ item, onChange, onRemove, showQty, placeholder, canHide = true }) {
  return (
    <div className={`item-fields${showQty ? ' with-qty' : ''}${item.hidden ? ' is-hidden' : ''}`}>
      <input
        className="item-name"
        value={item.name}
        maxLength={40}
        placeholder={placeholder || 'Item name'}
        onChange={(e) => onChange({ ...item, name: e.target.value })}
      />
      {showQty && (
        <input
          className="item-qty"
          type="number"
          min={1}
          max={999}
          value={item.qty}
          title="Quantity"
          onChange={(e) => onChange({ ...item, qty: Math.max(1, Math.min(999, Math.round(Number(e.target.value)) || 1)) })}
        />
      )}
      <input
        className="item-desc"
        value={item.description}
        maxLength={200}
        placeholder="Description (optional)"
        onChange={(e) => onChange({ ...item, description: e.target.value })}
      />
      <VisibilityButton hidden={!!item.hidden} disabled={!canHide} onClick={() => onChange({ ...item, hidden: !item.hidden })} />
      {onRemove && <button type="button" className="icon-btn" onClick={onRemove} aria-label="Remove item">✕</button>}
    </div>
  );
}

export function EquipmentEditor({ config, equipment, onChange, allowHide = true }) {
  return (
    <div className="equipment-editor">
      {EQUIPMENT_SLOTS.filter((s) => config.equipment.includes(s.id)).map((slot) => {
        const item = equipment[slot.id] || { ...newItem(), id: slot.id };
        return (
          <div className="equipment-row" key={slot.id}>
            <span className="slot-label">{slot.label}</span>
            <ItemFields
              item={item}
              placeholder="Empty"
              canHide={allowHide && !!equipment[slot.id]}
              onChange={(next) => onChange({ ...equipment, [slot.id]: next.name || next.description ? next : null })}
              onRemove={equipment[slot.id] ? () => onChange({ ...equipment, [slot.id]: null }) : null}
            />
          </div>
        );
      })}
    </div>
  );
}

export function InventoryEditor({ config, inventory, onChange, allowHide = true }) {
  const full = inventory.length >= config.inventory.slots;
  return (
    <div className="inventory-editor">
      {inventory.map((item, i) => (
        <ItemFields
          key={item.id}
          item={item}
          showQty
          canHide={allowHide}
          onChange={(next) => onChange(inventory.map((x, j) => (j === i ? next : x)))}
          onRemove={() => onChange(inventory.filter((_, j) => j !== i))}
        />
      ))}
      <div className="inventory-footer">
        <span className="muted">{inventory.length} / {config.inventory.slots} slots used</span>
        <button type="button" className="btn small" disabled={full} onClick={() => onChange([...inventory, newItem()])}>+ Add item</button>
      </div>
    </div>
  );
}
