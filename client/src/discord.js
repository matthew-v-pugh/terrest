import { DiscordSDK } from '@discord/embedded-app-sdk';

// Discord launches activities with frame_id in the query string; without it we
// are in a plain browser tab and fall back to the local test login.
export const inDiscord = new URLSearchParams(window.location.search).has('frame_id');

// The SDK waits forever if Discord never answers (for example when the client
// ID is wrong), so each step gets a deadline and a message saying what failed.
function withTimeout(promise, ms, message) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(message)), ms); }),
  ]).finally(() => clearTimeout(timer));
}

export async function authenticateDiscord() {
  const clientId = import.meta.env.VITE_DISCORD_CLIENT_ID;
  // Baked in at build time: on Cloudflare it comes from the build variables.
  if (!/^\d{17,20}$/.test(clientId || '')) {
    throw new Error('This build has no valid Discord client ID. Set the VITE_DISCORD_CLIENT_ID build variable and rebuild.');
  }
  const sdk = new DiscordSDK(clientId);
  await withTimeout(sdk.ready(), 15_000,
    "Discord didn't accept the connection. Check that VITE_DISCORD_CLIENT_ID matches this app's Client ID, then rebuild.");

  // No deadline here: Discord may be showing the player a consent prompt.
  const { code } = await sdk.commands.authorize({
    client_id: clientId,
    response_type: 'code',
    state: '',
    prompt: 'none',
    scope: ['identify'],
  });

  const res = await withTimeout(fetch('/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  }), 15_000, "The game server didn't answer. Check that Discord's URL mapping points at the deployed Worker.");
  if (!res.ok) {
    // Pass on the server's reason (or the HTTP status, if the request never
    // reached it) so failures can be told apart.
    const detail = await res.json().then((d) => d.error).catch(() => null);
    throw new Error(`Could not exchange the Discord authorization code (${detail || `HTTP ${res.status}`}).`);
  }
  const { access_token: accessToken } = await res.json();

  await withTimeout(sdk.commands.authenticate({ access_token: accessToken }), 15_000,
    "Discord didn't confirm the sign-in. Try relaunching the activity.");
  return { instanceId: sdk.instanceId, accessToken };
}

export function discordAvatarUrl(member) {
  return member?.avatar && !member.id.startsWith('dev:')
    ? `https://cdn.discordapp.com/avatars/${member.id}/${member.avatar}.png?size=128`
    : null;
}
