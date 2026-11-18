import { useEffect, useState } from 'react';
import { BACKGROUNDS, GAME_TYPES } from '@shared/presets.js';
import CharacterSheet from '../components/CharacterSheet.jsx';
import ChatBox from '../components/ChatBox.jsx';
import Creature, { CreatureButton, useCreatureChoice } from '../components/Creature.jsx';
import { Modal, Portrait, ResourceBar } from '../components/common.jsx';
import { DiceTray, RollDisplay } from '../components/Dice.jsx';
import PlayerControlsList from '../components/PlayerControls.jsx';
import ScenePicker from '../components/ScenePicker.jsx';
import TableLog from '../components/TableLog.jsx';
import {
  backgroundCss, layerLabel, tableCss, useGame,
} from '../game.js';

export default function Table() {
  const { room, me, you, scene, isStoryteller, send } = useGame();
  const [selectedId, setSelectedId] = useState(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [fullScreen, setFullScreen] = useState(false);
  // Creatures belong to the scene's biome; at the table they can also be turned off.
  const biome = scene?.background?.type === 'upload' ? 'custom' : scene?.background?.id;
  const [creature, nextCreature] = useCreatureChoice(biome, true);

  const storyteller = room.members.find((m) => m.id === room.storytellerId);
  const players = room.members.filter((m) => m.role === 'player' && m.character);
  const joining = room.members.filter((m) => m.role === 'player' && !m.character && m.online);
  const seats = [
    ...(storyteller ? [{ member: storyteller, storyteller: true }] : []),
    ...players.map((member) => ({ member })),
  ];
  const selected = players.find((m) => m.id === selectedId);

  // Esc leaves full screen, unless it's closing a sheet or used in a text field.
  useEffect(() => {
    if (!fullScreen || selected) return undefined;
    const onKey = (e) => {
      if (e.key !== 'Escape' || e.target.closest?.('input, textarea, select')) return;
      setFullScreen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [fullScreen, selected]);

  return (
    <div className={`table-screen${fullScreen ? ' full' : ''}`} style={{ background: backgroundCss(scene?.background) }}>
      {!fullScreen && <header className="topbar">
        <div className="topbar-title">
          <strong>{GAME_TYPES[room.config.gameType]?.label}</strong>
          <span className="muted">· {layerLabel(scene?.background, BACKGROUNDS)}</span>
          {!storyteller && <span className="badge warn">No storyteller</span>}
        </div>
        {joining.length > 0 && (
          <div className="joining muted">{joining.map((m) => m.username).join(', ')} {joining.length === 1 ? 'is' : 'are'} creating a character…</div>
        )}
        <div className="topbar-actions">
          {isStoryteller && <StorytellerTools />}
          {me.character && me.role === 'player' && (
            <button className="btn small" onClick={() => setSelectedId(you)}>My sheet</button>
          )}
          <button className="btn small ghost" onClick={() => send('releaseRole')}>Leave seat</button>
        </div>
      </header>}

      <div className="table-layout">
        <div className="table-area">
          <div className="table-surface" style={{ background: tableCss(scene?.table) }}>
            <RollDisplay />
          </div>
          {creature !== 'none' && <Creature kind={creature} />}
          <CreatureButton choice={creature} onNext={nextCreature} />
          <button
            type="button"
            className="btn small full-screen-btn"
            onClick={() => setFullScreen(!fullScreen)}
            title={fullScreen ? 'Show the top bar again (Esc)' : 'Hide the top bar to give the table more room'}
          >
            {fullScreen ? 'Exit full screen' : 'Full screen'}
          </button>
          {seats.map((seat, i) => {
            const angle = -Math.PI / 2 + (2 * Math.PI * i) / seats.length;
            const style = { left: `${50 + 40 * Math.cos(angle)}%`, top: `${50 + 40 * Math.sin(angle)}%` };
            return seat.storyteller
              ? <StorytellerSeat key={seat.member.id} member={seat.member} style={style} />
              : <PlayerSeat key={seat.member.id} member={seat.member} style={style} isMe={seat.member.id === you} onClick={() => setSelectedId(seat.member.id)} />;
          })}
          {!players.length && <div className="table-empty muted">Players will appear around the table once they've made their characters.</div>}
        </div>

        <aside className={`side-panel${panelOpen ? ' open' : ''}`}>
          <button className="side-panel-toggle" onClick={() => setPanelOpen(!panelOpen)}>
            {panelOpen ? 'Hide panel ▾' : 'Dice, log & chat ▴'}
          </button>
          <DiceTray />
          <TableLog />
          <ChatBox />
        </aside>
      </div>

      {selected && <CharacterSheet member={selected} onClose={() => setSelectedId(null)} />}
    </div>
  );
}

function StorytellerSeat({ member, style }) {
  return (
    <div className={`seat storyteller${member.online ? '' : ' offline'}`} style={style}>
      <Portrait portrait={{ type: 'discord' }} member={member} size={52} />
      <div className="seat-name" style={{ color: member.color }}>Storyteller</div>
      <div className="seat-user">{member.username}</div>
    </div>
  );
}

function PlayerSeat({ member, style, isMe, onClick }) {
  const { room } = useGame();
  const c = member.character;
  return (
    <button className={`seat${isMe ? ' me' : ''}${member.online ? '' : ' offline'}`} style={style} onClick={onClick}>
      <Portrait portrait={c.portrait} member={member} size={56} />
      <div className="seat-name" style={{ color: member.color }}>{c.name}</div>
      <div className="seat-user">{member.username}{member.online ? '' : ' · away'}</div>
      <div className="seat-resources">
        {room.config.resources.filter((r) => c.resources[r.id]?.max > 0).slice(0, 3).map((r) => (
          <ResourceBar key={r.id} resource={r} value={c.resources[r.id]} compact />
        ))}
      </div>
    </button>
  );
}

function StorytellerTools() {
  const { room, scene, send } = useGame();
  const [confirmReset, setConfirmReset] = useState(false);
  const [controlsOpen, setControlsOpen] = useState(false);
  const [sceneOpen, setSceneOpen] = useState(false);
  const hasRenewables = room.config.resources.some((r) => r.renewable);

  function reset() {
    if (!confirmReset) {
      setConfirmReset(true);
      setTimeout(() => setConfirmReset(false), 4000);
      return;
    }
    send('resetGame');
  }

  return (
    <>
      <button className="btn small scene-btn" onClick={() => setSceneOpen(true)}>
        <span className="scene-btn-swatch" style={{ background: backgroundCss(scene?.background) }}>
          <span style={{ background: tableCss(scene?.table) }} />
        </span>
        Scene
      </button>
      {hasRenewables && (
        <button className="btn small" onClick={() => send('refreshRenewables')} title="Refill every renewable resource for all players">
          Rest
        </button>
      )}
      <button className="btn small" onClick={() => setControlsOpen(true)}>Player controls</button>
      <button className="btn small danger ghost" onClick={reset}>{confirmReset ? 'Click again to reset' : 'Reset game'}</button>
      {sceneOpen && scene && (
        <Modal title="Set the scene" onClose={() => setSceneOpen(false)} wide>
          <ScenePicker scene={scene} onChange={(change) => send('setScene', { scene: change })} />
        </Modal>
      )}
      {controlsOpen && (
        <Modal title="Player controls" onClose={() => setControlsOpen(false)}>
          <p className="muted">Choose which parts of their own sheet players can change during the game. Every change shows up in the table log.</p>
          <PlayerControlsList controls={room.controls} onChange={(controls) => send('setPlayerControls', { controls })} />
        </Modal>
      )}
    </>
  );
}
