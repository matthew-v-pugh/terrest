import Creature, { CreatureButton, useCreatureChoice } from '../components/Creature.jsx';
import OrganicField from '../components/OrganicField.jsx';
import { useGame } from '../game.js';

export default function RoleSelect() {
  const { room, me, send } = useGame();
  // Role select sits on the organic background, so it shows organic creatures.
  const [creature, nextCreature] = useCreatureChoice('organic');
  const storyteller = room.members.find((m) => m.id === room.storytellerId);
  const storytellerTaken = storyteller && storyteller.id !== me.id && storyteller.online;

  let storytellerNote = 'Set up the rules and the game.';
  if (storytellerTaken) storytellerNote = `${storyteller.username} is already telling this story.`;
  else if (storyteller && storyteller.id !== me.id) storytellerNote = `${storyteller.username} stepped away. Take over the story.`;

  return (
    <div className="screen center role-screen">
      <OrganicField />
      <Creature kind={creature} />
      <CreatureButton choice={creature} onNext={nextCreature} />
      <div className="role-select">
        <h1 className="title">Terrest</h1>
        <p className="subtitle">Gather round the table, {me.username}. Who will you be tonight?</p>
        <div className="role-tray">
          <div className="role-cards">
            <button className="role-card moss" onClick={() => send('chooseRole', { role: 'player' })}>
              <h2>Player</h2>
              <p>{me.character ? `Return as ${me.character.name}.` : 'Create a hero and join the adventure.'}</p>
            </button>
            <button
              className="role-card clay"
              disabled={storytellerTaken}
              onClick={() => send('chooseRole', { role: 'storyteller' })}
            >
              <h2>Storyteller</h2>
              <p>{storytellerNote}</p>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
