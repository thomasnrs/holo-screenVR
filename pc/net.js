// Cliente WebSocket do PC. Registra-se como 'pc', recebe mensagens e expoe um send().
export function connect(onMessage) {
  const url = (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host;
  let ws;
  function open() {
    ws = new WebSocket(url);
    ws.onopen = () => {
      ws.send(JSON.stringify({ role: 'pc' }));
      onMessage({ type: '_open' }); // sinaliza (re)conexao
    };
    ws.onmessage = (e) => {
      try { onMessage(JSON.parse(e.data)); } catch {}
    };
    ws.onerror = () => ws.close();
    ws.onclose = () => setTimeout(open, 1000);
  }
  open();
  return (obj) => { if (ws && ws.readyState === 1) ws.send(JSON.stringify(obj)); };
}
