// Cloudflare Worker entry point.
//
// The Worker answers /api requests, serves the built client from static
// assets, and routes each WebSocket to the TableRoom Durable Object for its
// table. One TableRoom exists per activity instance. It runs the game (see
// rooms.js), stores the state so a table survives restarts and idle periods,
// and uses the WebSocket Hibernation API so it isn't billed while players are
// quiet.
import { DurableObject } from 'cloudflare:workers';
import { UPLOAD_LIMITS } from '../shared/uploads.js';
import {
  INSTANCE_RE, canVerifyInstances, identifyDiscordUser, requireInstanceMember,
} from './discord.js';
import { Room } from './rooms.js';
import { GameError, obj, str } from './validate.js';

// The largest legitimate message is setupGame with an uploaded background and
// table; anything bigger closes the socket unparsed.
const MAX_MESSAGE_CHARS = UPLOAD_LIMITS.background.maxChars + UPLOAD_LIMITS.table.maxChars + 64 * 1024;
// A table is deleted this long after its last player leaves.
const EMPTY_ROOM_TTL_MS = 30 * 60 * 1000;
// Test-login table codes (DevLogin); Discord instance ids use INSTANCE_RE.
const DEV_ROOM_RE = /^[a-z0-9_-]{1,60}$/;
// Clients send this every 30 s to keep the connection alive through proxies.
// The runtime answers it without waking the Durable Object.
const PING = '{"type":"ping"}';
const PONG = '{"type":"pong"}';

const devLoginOn = (env) => env.DEV_LOGIN === 'true';

const SECURITY_HEADERS = { 'X-Content-Type-Options': 'nosniff' };
const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json', ...SECURITY_HEADERS },
});

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    // Older Discord proxy setups prefix requests with /.proxy; accept both forms.
    if (url.pathname.startsWith('/.proxy/')) url.pathname = url.pathname.slice('/.proxy'.length);
    const path = url.pathname;

    if (path === '/api/token') return request.method === 'POST' ? exchangeToken(request, env) : json({ error: 'Use POST' }, 405);
    // Tells the client whether to offer the browser test login outside Discord.
    if (path === '/api/config') return json({ devLogin: devLoginOn(env) });
    if (path === '/api/health') return json({ ok: true });
    if (path.startsWith('/api/')) return json({ error: 'Not found' }, 404);
    if (path === '/ws') return routeSocket(request, env, url);
    return env.ASSETS.fetch(new Request(url, request));
  },
};

async function exchangeToken(request, env) {
  const clientId = env.VITE_DISCORD_CLIENT_ID;
  const clientSecret = env.DISCORD_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    console.warn('Token exchange refused: VITE_DISCORD_CLIENT_ID or DISCORD_CLIENT_SECRET is not set for the Worker.');
    return json({ error: 'Server is missing its Discord credentials' }, 500);
  }
  const raw = await request.text();
  if (raw.length > 16 * 1024) return json({ error: 'Request too large' }, 413);
  let body;
  try { body = JSON.parse(raw); } catch { body = null; }
  const code = str(obj(body).code, 200);
  if (!code) return json({ error: 'No authorization code was sent' }, 400);

  let response;
  let data;
  try {
    response = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId, client_secret: clientSecret, grant_type: 'authorization_code', code,
      }),
    });
    data = await response.json();
  } catch (err) {
    console.warn('Token exchange failed: could not reach Discord.', err);
    return json({ error: 'Server could not reach Discord' }, 502);
  }
  if (!response.ok) {
    console.warn(`Token exchange failed (Discord answered ${response.status}):`, data);
    return json({ error: data.error_description || data.error || 'Token exchange failed' }, 401);
  }
  return json({ access_token: data.access_token });
}

// Test-login tables live under a separate "dev:" name, so a test login can
// never reach a real Discord table, even with a guessed instance id.
function routeSocket(request, env, url) {
  if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
    return new Response('Expected a WebSocket upgrade', { status: 426, headers: SECURITY_HEADERS });
  }
  const instance = url.searchParams.get('instance') || '';
  const dev = url.searchParams.get('dev') === '1';
  if (dev && !devLoginOn(env)) return new Response('Test login is off', { status: 403, headers: SECURITY_HEADERS });
  if (!(dev ? DEV_ROOM_RE : INSTANCE_RE).test(instance)) {
    return new Response('Unknown table', { status: 400, headers: SECURITY_HEADERS });
  }
  const roomKey = dev ? `dev:${instance}` : instance;
  const stub = env.ROOMS.get(env.ROOMS.idFromName(roomKey));
  // Set here, after routing, so a client can't choose it.
  const headers = new Headers(request.headers);
  headers.set('X-Room-Key', roomKey);
  return stub.fetch(new Request(request, { headers }));
}

export class TableRoom extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.room = null;
    this.saved = new Map(); // storage key -> JSON of the value last stored there
    this.joining = new WeakSet(); // sockets whose join is being verified
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair(PING, PONG));
    ctx.blockConcurrencyWhile(() => this.load());
  }

  // Rebuilds the table after the object was evicted or hibernated.
  async load() {
    const meta = await this.ctx.storage.get('meta');
    if (!meta) return;
    const scene = await this.ctx.storage.get('scene');
    const members = await this.ctx.storage.list({ prefix: 'member:' });
    this.room = Room.restore({ meta, scene, members: [...members.values()] });
    this.saved.set('meta', JSON.stringify(meta));
    if (scene !== undefined) this.saved.set('scene', JSON.stringify(scene));
    for (const [key, m] of members) this.saved.set(key, JSON.stringify(m));
    // Sockets survive hibernation; each joined one remembers its user.
    for (const ws of this.ctx.getWebSockets()) {
      const { userId } = ws.deserializeAttachment() ?? {};
      if (userId) this.room.members.get(userId)?.sockets.add(ws);
    }
  }

  // Writes only the parts of the table that changed since the last save.
  async save() {
    // Nothing worth keeping until someone has actually joined.
    if (!this.room || (!this.room.members.size && !this.saved.size)) return;
    const { meta, scene, members } = this.room.serialize();
    const next = new Map([['meta', meta], ...members.map((m) => [`member:${m.id}`, m])]);
    if (scene) next.set('scene', scene);

    const puts = {};
    for (const [key, value] of next) {
      const text = JSON.stringify(value);
      if (this.saved.get(key) !== text) {
        puts[key] = value;
        this.saved.set(key, text);
      }
    }
    const gone = [...this.saved.keys()].filter((key) => !next.has(key));
    for (const key of gone) this.saved.delete(key);
    if (Object.keys(puts).length) await this.ctx.storage.put(puts);
    if (gone.length) await this.ctx.storage.delete(gone);
  }

  async fetch(request) {
    const roomKey = request.headers.get('X-Room-Key');
    this.room ??= new Room(roomKey);
    const { 0: client, 1: server } = new WebSocketPair();
    this.ctx.acceptWebSocket(server);
    // Every socket carries its table's key, so the table can be recreated even
    // if this object slept or the table expired while the socket was open.
    server.serializeAttachment({ roomKey });
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws, raw) {
    if (typeof raw !== 'string') return;
    if (raw.length > MAX_MESSAGE_CHARS) {
      ws.close(1009, 'Message too large');
      return;
    }
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    if (msg?.type === 'ping') return;

    const session = ws.deserializeAttachment() ?? {};
    this.room ??= new Room(session.roomKey);
    if (!session.userId) {
      await this.join(ws, msg, session);
    } else {
      try {
        this.room.handle(session.userId, msg);
      } catch (err) {
        if (err instanceof GameError) sendError(ws, err.message);
        else console.error(err);
      }
    }
    await this.save();
  }

  async join(ws, msg, session) {
    if (msg?.type !== 'join' || this.joining.has(ws)) return;
    this.joining.add(ws);
    try {
      const user = await this.identify(msg);
      if (ws.readyState !== WebSocket.OPEN) return;
      ws.serializeAttachment({ ...session, userId: user.id });
      this.room.connect(user, ws);
      await this.ctx.storage.deleteAlarm();
    } catch (err) {
      sendError(ws, err instanceof GameError ? err.message : 'Could not join the table.');
      if (!(err instanceof GameError)) console.error(err);
      ws.close(1008, 'Join refused');
    } finally {
      this.joining.delete(ws);
    }
  }

  // Discord tables need a token for this app from a user connected to the
  // instance; test tables accept a name while DEV_LOGIN is on.
  async identify(msg) {
    const roomKey = this.room.id;
    if (roomKey.startsWith('dev:')) {
      const dev = obj(msg.devUser);
      const id = str(dev.id, 40);
      const username = str(dev.username, 32);
      if (devLoginOn(this.env) && id && username) return { id: `dev:${id}`, username, avatar: null };
      throw new GameError('Not signed in.');
    }
    if (typeof msg.accessToken !== 'string') throw new GameError('Not signed in.');
    if (!canVerifyInstances(this.env)) console.warn('DISCORD_BOT_TOKEN is not set: refusing Discord players.');
    const user = await identifyDiscordUser(this.env, str(msg.accessToken, 200));
    await requireInstanceMember(this.env, roomKey, user.id);
    return user;
  }

  async webSocketClose(ws, code) {
    try { ws.close(code === 1005 ? 1000 : code, 'Closing'); } catch { /* already closed */ }
    await this.leave(ws);
  }

  async webSocketError(ws) {
    await this.leave(ws);
  }

  async leave(ws) {
    const { userId } = ws.deserializeAttachment() ?? {};
    if (userId && this.room) this.room.disconnect(userId, ws);
    if (!this.room?.hasOnline()) await this.ctx.storage.setAlarm(Date.now() + EMPTY_ROOM_TTL_MS);
    await this.save();
  }

  // The table has been empty for EMPTY_ROOM_TTL_MS: forget it.
  async alarm() {
    if (this.room?.hasOnline()) return;
    await this.ctx.storage.deleteAll();
    this.room = null;
    this.saved.clear();
  }
}

function sendError(ws, message) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'error', message }));
}
