import { useEffect, useRef, useState } from 'react';
import { displayName, useGame } from '../game.js';

export const MAX_CHAT_CHARS = 300;

// Message composer pinned to the bottom of the side panel. Messages go to the
// whole table, or privately to the people picked under "To".
export default function ChatBox() {
  const { room, you, send } = useGame();
  const [text, setText] = useState('');
  const [picked, setPicked] = useState([]); // empty = everyone
  const [pickerOpen, setPickerOpen] = useState(false);
  const boxRef = useRef(null);

  // Anyone seated at the table, apart from yourself; the storyteller first.
  const people = room.members
    .filter((m) => m.id !== you && m.role)
    .sort((a, b) => (b.id === room.storytellerId) - (a.id === room.storytellerId));
  // Drop recipients who have since left the table.
  const recipients = picked.filter((id) => people.some((m) => m.id === id));
  const isPrivate = recipients.length > 0;

  useEffect(() => {
    if (!pickerOpen) return undefined;
    const close = (e) => {
      if (e.type === 'keydown' ? e.key === 'Escape' : !boxRef.current?.contains(e.target)) setPickerOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [pickerOpen]);

  function toggle(id) {
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  }

  function submit(e) {
    e.preventDefault();
    const message = text.trim();
    if (!message) return;
    send('chat', isPrivate ? { text: message, to: recipients } : { text: message });
    setText('');
  }

  const toLabel = !isPrivate
    ? 'Everyone'
    : recipients.length === 1 ? displayName(room, recipients[0]) : `${recipients.length} people`;

  return (
    <form className={`chat-box${isPrivate ? ' private' : ''}`} onSubmit={submit} ref={boxRef}>
      <div className="chat-to-row">
        <button
          type="button"
          className="chat-to"
          aria-haspopup="true"
          aria-expanded={pickerOpen}
          onClick={() => setPickerOpen(!pickerOpen)}
          title="Choose who receives your message"
        >
          <span className="muted">To:</span> <strong>{toLabel}</strong>
          {isPrivate && <span className="tag">private</span>}
          <span aria-hidden="true"> ▴</span>
        </button>
        {text.length > MAX_CHAT_CHARS - 50 && <span className="muted chat-count">{MAX_CHAT_CHARS - text.length}</span>}
      </div>

      {pickerOpen && (
        <div className="chat-picker" role="group" aria-label="Recipients">
          <label className="chat-pick">
            <input type="radio" checked={!isPrivate} onChange={() => setPicked([])} />
            <span>Everyone <span className="muted">(public)</span></span>
          </label>
          <div className="chat-picker-divider muted">Private to…</div>
          {!people.length && <p className="muted chat-picker-empty">Nobody else is at the table yet.</p>}
          {people.map((m) => (
            <label key={m.id} className="chat-pick">
              <input type="checkbox" checked={recipients.includes(m.id)} onChange={() => toggle(m.id)} />
              <span style={{ color: m.color, fontWeight: 700 }}>{displayName(room, m.id)}</span>
              {m.id !== room.storytellerId && m.character && <span className="muted">{m.username}</span>}
              {!m.online && <span className="muted">· away</span>}
            </label>
          ))}
        </div>
      )}

      <div className="chat-input-row">
        <input
          className="chat-input"
          value={text}
          maxLength={MAX_CHAT_CHARS}
          onChange={(e) => setText(e.target.value)}
          placeholder={isPrivate ? `Whisper to ${toLabel}…` : 'Message the table…'}
          aria-label="Message"
        />
        <button type="submit" className="btn small primary" disabled={!text.trim()}>Send</button>
      </div>
    </form>
  );
}
