// Controle do celular: le giroscopio + toques e envia ao PC via WebSocket.
const $ = (id) => document.getElementById(id);
const setStatus = (t) => { $('status').textContent = t; };

const url = (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host;
let ws;
function open() {
  ws = new WebSocket(url);
  ws.onopen = () => { ws.send(JSON.stringify({ role: 'phone' })); setStatus('conectado'); };
  ws.onerror = () => ws.close();
  ws.onclose = () => { setStatus('reconectando…'); setTimeout(open, 1000); };
}
open();
function send(obj) {
  if (ws && ws.readyState === 1) ws.send(JSON.stringify({ role: 'phone', ...obj }));
}

// --- giroscopio (limitado a ~30Hz) ---
let lastSent = 0;
function onOrient(e) {
  const now = performance.now();
  if (now - lastSent < 33) return;
  lastSent = now;
  const orient = (screen.orientation && screen.orientation.angle) || window.orientation || 0;
  send({ type: 'orient', alpha: e.alpha, beta: e.beta, gamma: e.gamma, orient });
}

$('start').addEventListener('click', async () => {
  // iOS 13+ exige permissao explicita via gesto
  if (typeof DeviceOrientationEvent !== 'undefined' &&
      typeof DeviceOrientationEvent.requestPermission === 'function') {
    try {
      const p = await DeviceOrientationEvent.requestPermission();
      if (p !== 'granted') { setStatus('permissão de sensores negada'); return; }
    } catch { setStatus('erro ao pedir permissão'); return; }
  }
  window.addEventListener('deviceorientation', onOrient);
  setStatus('sensores ativos');
  $('start').style.display = 'none';
  $('bar').style.display = 'flex';
  $('bar2').style.display = 'flex';
  $('sens').style.display = 'block';
});

// entrar na tela central (traz a janela real pra frente) / voltar ao cockpit 3D
$('enter').addEventListener('click', () => send({ type: 'enter' }));
$('cockpit').addEventListener('click', () => send({ type: 'focusCockpit' }));

// sensibilidade (ganho de rotacao da camera)
$('sensRange').addEventListener('input', (e) => {
  const v = parseFloat(e.target.value);
  $('sensVal').textContent = v.toFixed(1);
  send({ type: 'sens', value: v });
});

$('recenter').addEventListener('click', () => send({ type: 'recenter' }));

let mode = 'gyro';
$('mode').addEventListener('click', () => {
  mode = mode === 'gyro' ? 'click' : 'gyro';
  send({ type: 'mode', mode });
  $('mode').textContent = 'Modo: ' + (mode === 'gyro' ? 'Giroscópio' : 'Mouse');
});

// --- pinca = zoom (ajusta o FOV da camera no PC) ---
let fov = 70;
let pinchStart = null;
const pad = $('pad');
pad.addEventListener('touchmove', (e) => {
  if (e.touches.length === 2) {
    const d = Math.hypot(
      e.touches[0].clientX - e.touches[1].clientX,
      e.touches[0].clientY - e.touches[1].clientY
    );
    if (pinchStart === null) { pinchStart = d; return; }
    fov = Math.max(14, Math.min(100, fov + (pinchStart - d) * 0.1));
    pinchStart = d;
    send({ type: 'zoom', fov });
  }
  e.preventDefault();
}, { passive: false });
pad.addEventListener('touchend', () => { pinchStart = null; });
