import { Die } from '../components/common.jsx';
import { useGame } from '../game.js';

export default function Waiting() {
  const { room, send } = useGame();
  const storyteller = room.members.find((m) => m.id === room.storytellerId);
  return (
    <div className="screen center">
      <div className="panel narrow centered">
        <Die sides={20} value="" size={56} className="splash-die" />
        <h2>Waiting for the storyteller</h2>
        <p className="muted">
          {storyteller
            ? `${storyteller.username} is setting up the game. You'll create your character as soon as the rules are set.`
            : 'Nobody has taken the storyteller seat yet. Someone needs to set up the game before characters can be made.'}
        </p>
        <button className="btn ghost" onClick={() => send('releaseRole')}>Back to role select</button>
      </div>
    </div>
  );
}
