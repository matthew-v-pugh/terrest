import { createPortal } from 'react-dom';
import { PORTRAITS } from '@shared/presets.js';
import { discordAvatarUrl } from '../discord.js';

export function Portrait({ portrait, member, size = 56 }) {
  const style = { width: size, height: size, fontSize: size * 0.55 };
  if (portrait?.type === 'upload') return <img className="portrait" style={style} src={portrait.dataUrl} alt="" />;
  const avatar = discordAvatarUrl(member);
  if (portrait?.type === 'discord' && avatar) return <img className="portrait" style={style} src={avatar} alt="" />;
  const preset = PORTRAITS.find((p) => p.key === portrait?.key);
  if (preset) return <div className="portrait" style={{ ...style, background: preset.color }}>{preset.emoji}</div>;
  return (
    <div className="portrait" style={{ ...style, background: '#4a3b2a', fontSize: size * 0.4 }}>
      {[...(member?.username || '?')][0].toUpperCase()}
    </div>
  );
}

export function Stepper({ value, min = -Infinity, max = Infinity, onChange, small }) {
  const set = (v) => onChange(Math.min(max, Math.max(min, v)));
  return (
    <div className={`stepper${small ? ' small' : ''}`}>
      <button type="button" onClick={() => set(value - 1)} disabled={value <= min} aria-label="Decrease">−</button>
      <input
        type="number"
        value={value}
        min={Number.isFinite(min) ? min : undefined}
        max={Number.isFinite(max) ? max : undefined}
        onChange={(e) => e.target.value !== '' && set(Math.round(Number(e.target.value)) || 0)}
      />
      <button type="button" onClick={() => set(value + 1)} disabled={value >= max} aria-label="Increase">+</button>
    </div>
  );
}

export function Toggle({ checked, onChange, label }) {
  return (
    <label className="toggle">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="toggle-track" />
      {label && <span>{label}</span>}
    </label>
  );
}

export function ResourceBar({ resource, value, compact }) {
  const pct = value.max ? Math.max(0, Math.min(100, (value.current / value.max) * 100)) : 0;
  return (
    <div className={`resource-bar${compact ? ' compact' : ''}`} title={`${resource.name}: ${value.current}/${value.max}`}>
      {!compact && (
        <div className="resource-bar-label">
          <span>{resource.name} {resource.renewable ? <span className="renew" title="Renewable">↻</span> : null}</span>
          <span>{value.current} / {value.max}</span>
        </div>
      )}
      <div className="resource-bar-track">
        <div className="resource-bar-fill" style={{ width: `${pct}%`, background: resource.color }} />
      </div>
    </div>
  );
}

// Simple SVG silhouettes so each die type is recognisable at a glance.
const DIE_SHAPES = {
  4: 'M50 6 L95 90 L5 90 Z',
  6: 'M12 12 H88 V88 H12 Z',
  8: 'M50 4 L94 50 L50 96 L6 50 Z',
  10: 'M50 4 L94 42 L50 96 L6 42 Z',
  12: 'M50 4 L95 37 L78 92 L22 92 L5 37 Z',
  20: 'M50 3 L92 27 L92 73 L50 97 L8 73 L8 27 Z',
  100: 'M50 4 L79 13 L96 38 L96 62 L79 87 L50 96 L21 87 L4 62 L4 38 L21 13 Z',
};

export function Die({ sides, value, size = 44, className = '', style }) {
  const textY = sides === 4 ? 70 : 54;
  const label = value ?? `d${sides}`;
  const fontSize = String(label).length > 2 ? 26 : 34;
  return (
    <svg className={`die ${className}`} width={size} height={size} viewBox="0 0 100 100" style={style} aria-label={`d${sides}${value != null ? ` showing ${value}` : ''}`}>
      <path d={DIE_SHAPES[sides] || DIE_SHAPES[6]} />
      <text x="50" y={textY} textAnchor="middle" dominantBaseline="middle" fontSize={fontSize}>{label}</text>
    </svg>
  );
}

// Portaled to <body>: an ancestor with backdrop-filter (like the top bar) would
// otherwise become the containing block for position: fixed and trap the modal.
export function Modal({ title, onClose, children, footer, wide }) {
  return createPortal(
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal${wide ? ' wide' : ''}`} role="dialog" aria-modal="true">
        <div className="modal-header">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
