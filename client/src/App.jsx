import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Die } from './components/common.jsx';
import { authenticateDiscord, inDiscord } from './discord.js';
import { GameContext, useGame } from './game.js';
import { connect } from './net.js';
import CharacterCreator from './screens/CharacterCreator.jsx';
import DevLogin from './screens/DevLogin.jsx';
import RoleSelect from './screens/RoleSelect.jsx';
import StorytellerSetup from './screens/StorytellerSetup.jsx';
import Table from './screens/Table.jsx';
import Waiting from './screens/Waiting.jsx';

export default function App() {
  const [session, setSession] = useState(null);
  const [bootError, setBootError] = useState(null);
  const [snapshot, setSnapshot] = useState(null);
  const [scene, setScene] = useState(null);
  const [connected, setConnected] = useState(false);
  const [toast, setToast] = useState(null);
  // Outside Discord: null while asking the server, then whether test login is on.
  const [devLogin, setDevLogin] = useState(null);
  const connRef = useRef(null);

  useEffect(() => {
    if (inDiscord) {
      authenticateDiscord()
        .then(({ instanceId, accessToken }) => setSession({ instanceId, accessToken }))
        .catch((err) => setBootError(err?.message || String(err)));
      return;
    }
    fetch('/api/config')
      .then((res) => (res.ok ? res.json() : {}))
      .then((config) => setDevLogin(config.devLogin === true))
      .catch(() => setDevLogin(false));
  }, []);

  useEffect(() => {
    if (!session) return undefined;
    const conn = connect({
      join: session,
      onState: setSnapshot,
      onScene: setScene,
      onStatus: setConnected,
      onError: (message) => setToast({ message, id: Date.now() }),
    });
    connRef.current = conn;
    return () => conn.close();
  }, [session]);

  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  const send = useCallback((type, payload) => connRef.current?.send(type, payload), []);

  const ctx = useMemo(() => {
    if (!snapshot) return null;
    const { room, you } = snapshot;
    return {
      room,
      you,
      me: room.members.find((m) => m.id === you),
      scene,
      send,
      isStoryteller: room.storytellerId === you,
    };
  }, [snapshot, scene, send]);

  let content;
  if (bootError) content = <Splash title="Couldn't connect to Discord" detail={bootError} />;
  else if (!session) {
    if (inDiscord || devLogin === null) content = <Splash title="Summoning the table…" />;
    else if (devLogin) content = <DevLogin onJoin={setSession} />;
    else content = <Splash title="Open Terrest in Discord" detail="Terrest runs as a Discord Activity. Join a voice channel and launch it from the Activities menu." />;
  }
  else if (!ctx?.me) content = <Splash title="Pulling up a chair…" />;
  else content = <CurrentScreen />;

  return (
    <GameContext.Provider value={ctx}>
      {content}
      {session && !connected && <div className="banner">Reconnecting…</div>}
      {toast && <div className="toast" key={toast.id} role="alert">{toast.message}</div>}
    </GameContext.Provider>
  );
}

function CurrentScreen() {
  const { room, me, isStoryteller } = useGame();
  if (!me.role) return <RoleSelect />;
  if (isStoryteller) return room.config ? <Table /> : <StorytellerSetup />;
  if (!room.config) return <Waiting />;
  if (!me.character) return <CharacterCreator />;
  return <Table />;
}

function Splash({ title, detail }) {
  return (
    <div className="screen center">
      <div className="splash">
        <Die sides={20} value="" size={64} className="splash-die" />
        <h2>{title}</h2>
        {detail && <p className="muted">{detail}</p>}
      </div>
    </div>
  );
}
