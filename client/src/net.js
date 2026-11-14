// WebSocket link to the game server, with automatic reconnects. `join` is
// re-sent on every reconnect so the server can restore our seat. The table is
// picked in the URL, so the server can route the socket before it opens.
export function connect({ join, onState, onScene, onError, onStatus }) {
  let ws;
  let retries = 0;
  let closed = false;
  let timer;
  let pinger;
  const params = new URLSearchParams({ instance: join.instanceId });
  if (join.devUser) params.set('dev', '1');

  function open() {
    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
    ws = new WebSocket(`${proto}://${window.location.host}/ws?${params}`);
    ws.onopen = () => {
      retries = 0;
      onStatus(true);
      ws.send(JSON.stringify({ type: 'join', ...join }));
      // Keeps idle connections from being dropped by proxies along the way.
      clearInterval(pinger);
      pinger = setInterval(() => ws.readyState === WebSocket.OPEN && ws.send('{"type":"ping"}'), 30_000);
    };
    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.type === 'pong') return;
      if (msg.type === 'state') onState(msg);
      else if (msg.type === 'scene') onScene(msg.scene);
      else if (msg.type === 'error') onError(msg.message);
    };
    ws.onclose = () => {
      clearInterval(pinger);
      onStatus(false);
      if (!closed) timer = setTimeout(open, Math.min(1000 * 2 ** retries++, 10_000));
    };
  }

  open();
  return {
    send(type, payload = {}) {
      if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type, ...payload }));
    },
    close() {
      closed = true;
      clearTimeout(timer);
      clearInterval(pinger);
      ws?.close();
    },
  };
}
