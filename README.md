# Terrest

A tabletop role-playing Discord Activity. One person is the **Storyteller**, who sets
the rules and the scene. Everyone else is a **Player**, who builds a character and
takes a seat. Everyone rolls dice at a shared table.

## Features

- **Role select.** Choose Player or Storyteller. There is one storyteller per table.
  If the storyteller disconnects, anyone can take over.
- **Storyteller setup**
  - Game type presets: Classic Fantasy, Sci-Fi, Horror, Cyberpunk and Custom. Stat names
    and the min/max/starting values can all be edited.
  - Resources: Health, Mana, Battery, Ammo and others, plus custom ones. Each has a
    color, a max, and is either renewable or non-renewable. The **Rest** button
    refills every renewable resource.
  - Equipment slots (Weapon, Headgear, Chest Gear, Leg Gear, Shoes) and an optional
    inventory with 1–40 slots.
  - The scene: a background and a table surface, each picked from presets or
    uploaded as an image (shrunk in the browser before upload). Change it any time
    with the **Scene** button at the table. Scene images are sent once on join and
    again only when they change, never with ordinary game updates. The server
    accepts only real JPEGs within size limits, strips their metadata (EXIF/GPS,
    comments) before sharing them, and allows at most 6 scene uploads a minute.
- **Character creation.** A preset portrait, your Discord avatar or an uploaded image.
  Stats within the storyteller's range (0 is allowed by default), with an optional
  "roll for stats" button. Starting resources: setting one to 0 means the character
  doesn't have it, and it's hidden from their seat and sheet. Equipment and inventory.
- **Pocketed items.** Any item can be marked Pocketed. The server never sends
  pocketed items to other players; only the owner and the storyteller see them.
  Owners can pocket or reveal their own items from their sheet at any time.
- **The table**
  - Seats are arranged around the table, each showing a portrait and resource bars.
  - Dice tray: d4 to d100, 1–20 dice, a modifier and an optional label. Dice are
    rolled on the server, so nobody can fake a roll.
  - The storyteller can roll in secret and reveal the result later. Players only
    see "rolls behind the screen".
  - Click any seat to open that character sheet. The storyteller can edit stats,
    resources (current and max), equipment and inventory, add or remove items, or
    remove the character.
  - **Table log:** rolls and every sheet change in one feed, filterable by All,
    Rolls or Changes. Changes are itemized ("Storyteller → Elowen: Health 20 → 15
    / 20 (−5)", "gained Torch ×3"). Lines that would expose a pocketed item are
    marked private and only reach the owner and the storyteller. The log also records
    rests, scene changes and players taking a seat.
  - **Chat:** a message box under the log. Talk to the whole table, or use the
    **To:** picker to message one or more people privately. Messages appear in
    the log under the **Messages** filter. The server sends a private message only
    to its sender and recipients, not even to the storyteller unless they're
    included.
  - **Player controls:** the storyteller decides which parts of their own sheet
    players can change mid-game: resources (current value only, up to their max),
    items, pocketing, stats (within the setup range) and name/portrait. These are
    set during setup and can be changed any time with the **Player controls** button. The
    server enforces them, and every player edit lands in the log.

## How it works

```
client/   React UI (Vite). Authenticates with the Discord Embedded App SDK.
server/   Express + ws. Exchanges the OAuth code and holds one Room per activity
          instance (sdk.instanceId). Validates every action, rolls dice, and
          pushes each member a view of the state (hidden rolls redacted).
shared/   Presets used by both sides (game types, resources, slots, backgrounds).
```

Game state lives in memory. A room is dropped 30 minutes after its last player
leaves, and everything resets when the server restarts. Reconnecting players get
their seat and character back.

## Local development (no Discord needed)

```bash
cp .env.example .env      # DEV_LOGIN=true lets browser tabs join
npm install
npm run dev
```

Open http://localhost:5173 in a few tabs (or windows). Each tab is a separate
person, so you can be the storyteller in one and players in the others.

## Running inside Discord

1. Create an application at https://discord.com/developers/applications.
2. **OAuth2:** copy the Client ID and Client Secret into `.env`. Add the redirect
   `https://127.0.0.1` (the SDK requires one to exist).
   **Bot:** reset the token and copy it into `.env` as `DISCORD_BOT_TOKEN`. The
   server uses it to check that every player is really connected to the activity
   instance they join; without it, Discord players are refused.
3. Start the app with `npm run dev`, then expose the Vite port through a tunnel:
   ```bash
   cloudflared tunnel --url http://localhost:5173
   ```
4. **Activities → URL Mappings:** map `/` to the tunnel host (without `https://`).
5. **Activities → Settings:** enable Activities.
6. In a Discord voice channel, open the Activity launcher and pick your app.
   While it's unverified, only you and the app's testers can see it.

## Production

```bash
npm run build   # builds the client into dist/
npm start       # serves dist/ plus /api and /ws on $PORT
```

Set `DEV_LOGIN=false` in production: opening the app outside Discord then shows
"Open Terrest in Discord" instead of the test login. Point the Activity URL
mapping at your deployed host.

### How players are verified

Discord users never see the test login. When someone joins, the server checks
that their access token was issued to this app (`GET /oauth2/@me`) and that they
are currently connected to the activity instance they named
(`GET /applications/{app_id}/activity-instances/{instance_id}`, cached briefly).
Test logins (`DEV_LOGIN=true`) get tables in a separate namespace, so they can
never join a real Discord table, even with a guessed instance id.

## Ideas for next steps

- Persist rooms (SQLite or Redis) so games survive restarts.
- Mixed dice pools (e.g. `1d20 + 2d6`), advantage/disadvantage, and saved rolls.
