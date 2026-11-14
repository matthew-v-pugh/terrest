import { useState } from 'react';
import {
  displayName, memberColor, rollFormula, useGame,
} from '../game.js';
import { noteRolls, revealOf, useRevealUpdates } from './rollReveal.js';

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'roll', label: 'Rolls' },
  { id: 'event', label: 'Changes' },
  { id: 'chat', label: 'Messages' },
];

const timeOf = (ts) => new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

function RollEntry({ entry: r }) {
  const { room, isStoryteller, send } = useGame();
  const rolling = !!revealOf(r);
  return (
    <li className={`log-entry roll${r.secret ? ' secret' : ''}`} style={{ '--accent': memberColor(room, r.userId) }}>
      <div className="log-head">
        <span className="log-who">{displayName(room, r.userId)}</span>
        <time className="muted">{timeOf(r.ts)}</time>
      </div>
      {r.secret ? (
        <div className="muted">rolled in secret</div>
      ) : (
        <div className="log-roll-body">
          <span className="log-roll">
            {rollFormula(r)}{r.label && <span className="muted"> · {r.label}</span>}
            <span className="muted">{rolling ? ' rolling…' : ` [${r.results.join(', ')}]`}</span>
          </span>
          {!rolling && <span className="log-total">{r.total}</span>}
          {!rolling && isStoryteller && r.hidden && !r.revealed && (
            <button className="btn tiny" onClick={() => send('revealRoll', { rollId: r.id })}>Reveal</button>
          )}
        </div>
      )}
    </li>
  );
}

function EventEntry({ entry: e }) {
  const { room } = useGame();
  const target = e.targetId && e.targetId !== e.actorId ? displayName(room, e.targetId) : null;
  return (
    <li className="log-entry event" style={{ '--accent': memberColor(room, e.actorId) }}>
      <div className="log-head">
        <span className="log-who">{displayName(room, e.actorId)}</span>
        {target && (
          <>
            <span className="muted">→</span>
            <span className="log-target" style={{ color: memberColor(room, e.targetId) }}>{target}</span>
          </>
        )}
        <time className="muted">{timeOf(e.ts)}</time>
      </div>
      <ul className="log-lines">
        {e.lines.map((l, i) => (
          <li key={i} className={l.private ? 'private' : ''} title={l.private ? 'Only the owner and the storyteller can see this' : undefined}>
            {l.text}{l.private && <span className="tag">private</span>}
          </li>
        ))}
      </ul>
    </li>
  );
}

function ChatEntry({ entry: c }) {
  const { room } = useGame();
  const recipients = c.to?.map((id) => displayName(room, id)).join(', ');
  return (
    <li className={`log-entry chat${c.to ? ' private' : ''}`} style={{ '--accent': memberColor(room, c.userId) }}>
      <div className="log-head">
        <span className="log-who">{displayName(room, c.userId)}</span>
        {c.to && (
          <>
            <span className="muted">→</span>
            <span className="log-target">{recipients}</span>
            <span className="tag" title="Only the sender and the people it was sent to can see this">private</span>
          </>
        )}
        <time className="muted">{timeOf(c.ts)}</time>
      </div>
      <p className="log-message">{c.text}</p>
    </li>
  );
}

const ENTRY = { roll: RollEntry, event: EventEntry, chat: ChatEntry };

export default function TableLog() {
  const { room } = useGame();
  // Hold a roll's numbers back until its dice have landed at the table.
  noteRolls(room.log);
  useRevealUpdates();
  const [filter, setFilter] = useState('all');
  const entries = room.log.filter((e) => filter === 'all' || e.kind === filter).reverse();

  return (
    <div className="table-log">
      <div className="table-log-header">
        <h3>Table log</h3>
        <div className="segmented">
          {FILTERS.map((f) => (
            <button key={f.id} className={filter === f.id ? 'on' : ''} onClick={() => setFilter(f.id)}>{f.label}</button>
          ))}
        </div>
      </div>
      {!entries.length && <p className="muted">Nothing here yet.</p>}
      <ul className="log-list">
        {entries.map((e) => {
          const Entry = ENTRY[e.kind] || EventEntry;
          return <Entry key={e.id} entry={e} />;
        })}
      </ul>
    </div>
  );
}
