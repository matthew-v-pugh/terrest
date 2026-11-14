// Verifies that someone joining a room is a real Discord user, signed in to
// this app, and currently connected to the activity instance they claim.
// `env` holds the Worker's variables and secrets.
import { GameError } from './validate.js';

const API = 'https://discord.com/api/v10';

export const canVerifyInstances = (env) => !!(env.VITE_DISCORD_CLIENT_ID && env.DISCORD_BOT_TOKEN);

// Discord instance ids are short opaque strings; anything else is refused
// before it gets near a URL.
export const INSTANCE_RE = /^[A-Za-z0-9_-]{1,100}$/;
// A cached member list is trusted for this long before it is refetched.
const CACHE_TTL_MS = 30_000;
// Refetch at most this often per instance, so repeated join attempts from
// someone who isn't in the instance can't hammer Discord's API.
const MIN_REFETCH_MS = 2_000;

const instances = new Map(); // instanceId -> { users: Set, at, pending }

async function discordGet(path, authorization) {
  let res;
  try {
    res = await fetch(`${API}${path}`, { headers: { Authorization: authorization } });
  } catch {
    throw new GameError('The server could not reach Discord. Try again in a moment.');
  }
  if (res.status === 429) throw new GameError('Discord is busy. Try again in a moment.');
  return res;
}

// Resolves an OAuth access token to its user, and checks the token was issued
// to this app (a token from some other app would otherwise pass as "signed in").
export async function identifyDiscordUser(env, accessToken) {
  const CLIENT_ID = env.VITE_DISCORD_CLIENT_ID;
  if (!CLIENT_ID) throw new GameError('The server is missing its Discord client ID.');
  const res = await discordGet('/oauth2/@me', `Bearer ${accessToken}`);
  if (!res.ok) throw new GameError('Discord sign-in failed.');
  const info = await res.json().catch(() => null);
  const u = info?.user;
  if (info?.application?.id !== CLIENT_ID || typeof u?.id !== 'string') throw new GameError('Discord sign-in failed.');
  return { id: u.id, username: u.global_name || u.username, avatar: u.avatar ?? null };
}

async function fetchInstanceUsers(env, instanceId) {
  const CLIENT_ID = env.VITE_DISCORD_CLIENT_ID;
  const res = await discordGet(
    `/applications/${CLIENT_ID}/activity-instances/${encodeURIComponent(instanceId)}`,
    `Bot ${env.DISCORD_BOT_TOKEN}`,
  );
  if (res.status === 404) return new Set();
  if (!res.ok) {
    console.warn(`Activity instance lookup failed (Discord answered ${res.status}). Check DISCORD_BOT_TOKEN.`);
    throw new GameError('The server could not check this activity with Discord.');
  }
  const data = await res.json().catch(() => null);
  if (data?.application_id !== CLIENT_ID || !Array.isArray(data.users)) return new Set();
  return new Set(data.users.map(String));
}

function pruneCache(now) {
  for (const [id, entry] of instances) {
    if (!entry.pending && now - entry.at > 5 * 60_000) instances.delete(id);
  }
}

// Throws unless `userId` is currently connected to the activity instance.
export async function requireInstanceMember(env, instanceId, userId) {
  if (!canVerifyInstances(env)) {
    throw new GameError('The server is not set up to verify Discord players (DISCORD_BOT_TOKEN is missing).');
  }
  if (!INSTANCE_RE.test(instanceId)) throw new GameError('Unknown activity instance.');

  const now = Date.now();
  let entry = instances.get(instanceId);
  if (entry?.users.has(userId) && now - entry.at < CACHE_TTL_MS) return;

  // Someone new may have just joined the activity, so refetch, unless a fetch
  // is already running or one finished very recently.
  if (!entry?.pending && !(entry && now - entry.at < MIN_REFETCH_MS)) {
    pruneCache(now);
    const pending = fetchInstanceUsers(env, instanceId);
    entry = { users: entry?.users ?? new Set(), at: entry?.at ?? 0, pending };
    instances.set(instanceId, entry);
    try {
      entry.users = await pending;
      entry.at = Date.now();
    } finally {
      entry.pending = null;
    }
  } else if (entry?.pending) {
    await entry.pending.catch(() => {});
  }

  if (!instances.get(instanceId)?.users.has(userId)) {
    throw new GameError("You aren't in this activity. Launch Terrest from a Discord voice channel to join.");
  }
}
