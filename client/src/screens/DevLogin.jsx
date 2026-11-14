import { useState } from 'react';

const storage = {
  get(key) { try { return sessionStorage.getItem(key); } catch { return null; } },
  set(key, value) { try { sessionStorage.setItem(key, value); } catch { /* private mode */ } },
};

// Shown only outside Discord. Each browser tab gets its own identity, so you can
// open several tabs to play every seat at the table yourself.
export default function DevLogin({ onJoin }) {
  const [name, setName] = useState(() => storage.get('terrest:name') || '');
  const [room, setRoom] = useState(() => new URLSearchParams(window.location.search).get('room') || 'local');

  function submit(e) {
    e.preventDefault();
    const username = name.trim();
    if (!username) return;
    let id = storage.get('terrest:id');
    if (!id) {
      id = Math.random().toString(36).slice(2, 10);
      storage.set('terrest:id', id);
    }
    storage.set('terrest:name', username);
    // Table codes are letters, digits and dashes; anything else becomes a dash.
    const code = room.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-').slice(0, 60) || 'local';
    onJoin({ instanceId: code, devUser: { id, username } });
  }

  return (
    <div className="screen center">
      <form className="panel narrow" onSubmit={submit}>
        <h1 className="title small">Terrest</h1>
        <p className="muted">Local test mode: you're outside Discord. Open more tabs to add more people to the table.</p>
        <label className="field">
          <span>Your name</span>
          <input autoFocus value={name} maxLength={32} onChange={(e) => setName(e.target.value)} placeholder="e.g. Morgan" />
        </label>
        <label className="field">
          <span>Table code</span>
          <input value={room} maxLength={60} onChange={(e) => setRoom(e.target.value)} />
        </label>
        <button className="btn primary" disabled={!name.trim()}>Join table</button>
      </form>
    </div>
  );
}
