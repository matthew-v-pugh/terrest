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
server/   A Cloudflare Worker (worker.js). It exchanges the OAuth code, serves
          the built client, and routes each WebSocket to a TableRoom Durable
          Object: one per activity instance (sdk.instanceId). rooms.js holds
          the game itself: it validates every action, rolls dice, and pushes
          each member a view of the state (hidden rolls and private chat redacted).
shared/   Presets used by both sides (game types, resources, slots, backgrounds).
```

Each table is stored in its Durable Object, so games survive deploys, restarts
and quiet spells. The object hibernates while nobody is sending anything, so idle
tables cost nothing. A table is deleted 30 minutes after its last player leaves.
Reconnecting players get their seat and character back.

## Local development (no Discord needed)

```bash
cp .env.example .env      # DEV_LOGIN=true lets browser tabs join
npm install
npm run dev               # Vite on :5173, the Worker (wrangler dev) on :8787
```

Open http://localhost:5173 in a few tabs (or windows). Each tab is a separate
person, so you can be the storyteller in one and players in the others.
`wrangler dev` reads the same `.env` and keeps local tables in `.wrangler/state`.
`npm run preview` builds the client and serves everything from the Worker on :8787,
as production does.

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
   Or deploy it (below) and use the `workers.dev` address.
4. **Activities → URL Mappings:** map `/` to the tunnel or Worker host (without `https://`).
5. **Activities → Settings:** enable Activities.
6. In a Discord voice channel, open the Activity launcher and pick your app.
   While it's unverified, only you and the app's testers can see it.

## Deploying to Cloudflare (free plan)

Cloudflare builds and deploys from GitHub on every push.

1. In the Cloudflare dashboard: **Workers & Pages → Create → Import a repository**,
   and pick this repo. Keep the Worker name `terrest` (it must match `name` in
   `wrangler.jsonc`).
   - Production branch: the branch you deploy from (e.g. `cloudflare-workers`).
   - Build command: `npm run build`. Deploy command: `npx wrangler deploy`.
   - Build variables: `VITE_DISCORD_CLIENT_ID` (the client bundle needs it).
2. After the first deploy, open the Worker's **Settings → Variables and Secrets** and add:
   - `VITE_DISCORD_CLIENT_ID` as text.
   - `DISCORD_CLIENT_SECRET` and `DISCORD_BOT_TOKEN` as secrets.

   `keep_vars` in `wrangler.jsonc` stops later deploys from erasing them.
3. In the Discord Developer Portal, map `/` to `terrest.<your-subdomain>.workers.dev`.

`DEV_LOGIN` is `false` in production (set in `wrangler.jsonc`): opening the app
outside Discord shows "Open Terrest in Discord" instead of the test login. To
deploy from your own machine instead, run `npx wrangler login` once, then `npm run deploy`.

The free plan has daily limits on requests and Durable Object usage. Past a
limit, requests fail until the next day (00:00 UTC) instead of being billed.

### How players are verified

Discord users never see the test login. When someone joins, the server checks
that their access token was issued to this app (`GET /oauth2/@me`) and that they
are currently connected to the activity instance they named
(`GET /applications/{app_id}/activity-instances/{instance_id}`, cached briefly).
Test logins (`DEV_LOGIN=true`) get tables in a separate namespace, so they can
never join a real Discord table, even with a guessed instance id.

## Ideas for next steps

- Mixed dice pools (e.g. `1d20 + 2d6`), advantage/disadvantage, and saved rolls.
