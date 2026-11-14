import { DiscordSDK } from '@discord/embedded-app-sdk';

// Discord launches activities with frame_id in the query string; without it we
// are in a plain browser tab and fall back to the local test login.
export const inDiscord = new URLSearchParams(window.location.search).has('frame_id');

export async function authenticateDiscord() {
  const clientId = import.meta.env.VITE_DISCORD_CLIENT_ID;
  const sdk = new DiscordSDK(clientId);
  await sdk.ready();

  const { code } = await sdk.commands.authorize({
    client_id: clientId,
    response_type: 'code',
    state: '',
    prompt: 'none',
    scope: ['identify'],
  });

  const res = await fetch('/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  });
  if (!res.ok) {
    // Pass on the server's reason (or the HTTP status, if the request never
    // reached it) so failures can be told apart.
    const detail = await res.json().then((d) => d.error).catch(() => null);
    throw new Error(`Could not exchange the Discord authorization code (${detail || `HTTP ${res.status}`}).`);
  }
  const { access_token: accessToken } = await res.json();

  await sdk.commands.authenticate({ access_token: accessToken });
  return { instanceId: sdk.instanceId, accessToken };
}

export function discordAvatarUrl(member) {
  return member?.avatar && !member.id.startsWith('dev:')
    ? `https://cdn.discordapp.com/avatars/${member.id}/${member.avatar}.png?size=128`
    : null;
}
