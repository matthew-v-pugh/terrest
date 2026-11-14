import { PLAYER_CONTROLS } from '@shared/presets.js';
import { Toggle } from './common.jsx';

export default function PlayerControlsList({ controls, onChange }) {
  return (
    <div className="controls-list">
      {PLAYER_CONTROLS.map((c) => (
        <div className="controls-row" key={c.id}>
          <Toggle checked={!!controls[c.id]} onChange={(on) => onChange({ ...controls, [c.id]: on })} label={c.label} />
          <span className="muted">{c.description}</span>
        </div>
      ))}
    </div>
  );
}
