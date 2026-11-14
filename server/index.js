import express from 'express';
import fs from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { UPLOAD_LIMITS } from '../shared/uploads.js';
import { canVerifyInstances, identifyDiscordUser, requireInstanceMember } from './discord.js';
import { RoomManager } from './rooms.js';
import { GameError, obj, str } from './validate.js';

const PORT = Number(process.env.PORT) || 3001;
const CLIENT_ID = process.env.VITE_DISCORD_CLIENT_ID;
const CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;
// Lets plain browser tabs join without Discord, for local testing only.
const DEV_LOGIN = process.env.DEV_LOGIN === 'true';

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '16kb' }));
// Browsers must treat every response as the type it claims, never sniff it.
app.use((_req, res, next) => {
  res.set('X-Content-Type-Options', 'nosniff');
  next();
});

// Older Discord proxy setups prefix requests with /.proxy; accept both forms.
app.use((req, _res, next) => {
  if (req.url.startsWith('/.proxy/')) req.url = req.url.slice('/.proxy'.length);
  next();
});

app.post('/api/token', async (req, res) => {
  const code = str(obj(req.body).code, 200);
  if (!CLIENT_ID || !CLIENT_SECRET) {
    console.warn('Token exchange refused: VITE_DISCORD_CLIENT_ID or DISCORD_CLIENT_SECRET is not set for the server.');
    return res.status(500).json({ error: 'Server is missing its Discord credentials' });
  }
  if (!code) return res.status(400).json({ error: 'No authorization code was sent' });
  let response;
  let data;
  try {
    response = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        grant_type: 'authorization_code',
        code,
      }),
    });
    data = await response.json();
  } catch (err) {
    console.warn('Token exchange failed: could not reach Discord.', err);
    return res.status(502).json({ error: 'Server could not reach Discord' });
  }
  if (!response.ok) {
    console.warn(`Token exchange failed (Discord answered ${response.status}):`, data);
    return res.status(401).json({ error: data.error_description || data.error || 'Token exchange failed' });
  }
  res.json({ access_token: data.access_token });
});

app.get('/api/health', (_req, res) => res.json({ ok: true }));
// Tells the client whether to offer the browser test login outside Discord.
app.get('/api/config', (_req, res) => res.json({ devLogin: DEV_LOGIN }));

const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.use((req, res, next) => (req.method === 'GET' && !req.path.startsWith('/api')
    ? res.sendFile(path.join(dist, 'index.html'))
    : next()));
}

const server = createServer(app);
// The largest legitimate message is setupGame with an uploaded background and
// table; anything bigger is refused before it is parsed.
const MAX_MESSAGE_BYTES = UPLOAD_LIMITS.background.maxChars + UPLOAD_LIMITS.table.maxChars + 64 * 1024;
const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_MESSAGE_BYTES });
const rooms = new RoomManager();

server.on('upgrade', (req, socket, head) => {
  const url = req.url.replace(/^\/\.proxy/, '');
  if (!url.startsWith('/ws')) return socket.destroy();
  wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
});

// Returns the user and the key of the room they may join. Discord users must
// be connected to the activity instance they name. Test logins get rooms in a
// separate "dev:" namespace, so they can never reach a real Discord table.
async function identify(msg, instanceId) {
  if (typeof msg.accessToken === 'string') {
    const user = await identifyDiscordUser(str(msg.accessToken, 200));
    await requireInstanceMember(instanceId, user.id);
    return { user, roomKey: instanceId };
  }
  if (DEV_LOGIN) {
    const dev = obj(msg.devUser);
    const id = str(dev.id, 40);
    const username = str(dev.username, 32);
    if (id && username) return { user: { id: `dev:${id}`, username, avatar: null }, roomKey: `dev:${instanceId}` };
  }
  throw new GameError('Not signed in.');
}

const sendError = (ws, message) => ws.readyState === 1 && ws.send(JSON.stringify({ type: 'error', message }));

wss.on('connection', (ws) => {
  let session = null; // { room, userId } once joined
  let joining = false;
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });

  ws.on('message', async (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    if (!session) {
      if (msg?.type !== 'join' || joining) return;
      joining = true;
      try {
        const instanceId = str(msg.instanceId, 100);
        if (!instanceId) throw new GameError('Missing activity instance.');
        const { user, roomKey } = await identify(msg, instanceId);
        if (ws.readyState !== 1) return;
        session = { room: rooms.get(roomKey), userId: user.id };
        session.room.connect(user, ws);
      } catch (err) {
        sendError(ws, err instanceof GameError ? err.message : 'Could not join the table.');
        if (!(err instanceof GameError)) console.error(err);
        ws.close();
      }
      return;
    }

    try {
      session.room.handle(session.userId, msg);
    } catch (err) {
      if (err instanceof GameError) sendError(ws, err.message);
      else console.error(err);
    }
  });

  ws.on('close', () => session?.room.disconnect(session.userId, ws));
});

// Drop sockets that stopped answering pings (closed laptops, dropped Wi-Fi).
setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) { ws.terminate(); continue; }
    ws.isAlive = false;
    ws.ping();
  }
}, 30_000).unref();

server.listen(PORT, () => {
  console.log(`Terrest server listening on http://localhost:${PORT}`);
  if (DEV_LOGIN) console.log('DEV_LOGIN is on: browser tabs can join without Discord.');
  if (!canVerifyInstances) {
    console.warn('DISCORD_BOT_TOKEN (or VITE_DISCORD_CLIENT_ID) is not set: Discord players will be refused, '
      + 'because the server cannot check they belong to the activity instance.');
  }
});
