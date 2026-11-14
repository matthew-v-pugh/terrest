// WebSocket link to the game server, with automatic reconnects. `join` is
// re-sent on every reconnect so the server can restore our seat.
export function connect({ join, onState, onScene, onError, onStatus }) {
  let ws;
  let retries = 0;
  let closed = false;
  let timer;

  function open() {
    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
    ws = new WebSocket(`${proto}://${window.location.host}/ws`);
    ws.onopen = () => {
      retries = 0;
      onStatus(true);
      ws.send(JSON.stringify({ type: 'join', ...join }));
    };
    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.type === 'state') onState(msg);
      else if (msg.type === 'scene') onScene(msg.scene);
      else if (msg.type === 'error') onError(msg.message);
    };
    ws.onclose = () => {
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
      ws?.close();
    },
  };
}
