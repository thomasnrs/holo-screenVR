import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import selfsigned from 'selfsigned';
import { listWindows, focusWindow, focusCockpit, getStats } from './winfocus.js';

// --- clima (wttr.in) com cache de 15 min ---
let weatherCache = { t: 0, data: null };
async function getWeather() {
  const now = Date.now();
  if (weatherCache.data && now - weatherCache.t < 15 * 60 * 1000) return weatherCache.data;
  try {
    const r = await fetch('https://wttr.in/?format=j1&lang=pt', { signal: AbortSignal.timeout(8000) });
    const j = await r.json();
    const cur = j.current_condition && j.current_condition[0];
    const data = cur ? {
      tempC: cur.temp_C,
      feels: cur.FeelsLikeC,
      humidity: cur.humidity,
      desc: (cur.lang_pt && cur.lang_pt[0] && cur.lang_pt[0].value) || (cur.weatherDesc && cur.weatherDesc[0] && cur.weatherDesc[0].value),
      city: j.nearest_area && j.nearest_area[0] && j.nearest_area[0].areaName[0].value,
    } : null;
    if (data) weatherCache = { t: now, data };
    return data;
  } catch {
    return weatherCache.data;
  }
}

// --- busca no YouTube: raspa o ytInitialData da pagina de resultados (sem API key) ---
async function ytSearch(q) {
  try {
    const r = await fetch('https://www.youtube.com/results?search_query=' + encodeURIComponent(q) + '&hl=pt', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
        'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
      },
      signal: AbortSignal.timeout(9000),
    });
    const html = await r.text();
    const m = html.match(/ytInitialData\s*=\s*(\{.+?\});<\/script>/s);
    if (!m) return [];
    const data = JSON.parse(m[1]);
    const sections = data?.contents?.twoColumnSearchResultsRenderer?.primaryContents
      ?.sectionListRenderer?.contents || [];
    const out = [];
    for (const sec of sections) {
      for (const it of (sec?.itemSectionRenderer?.contents || [])) {
        const v = it.videoRenderer;
        if (v && v.videoId) {
          out.push({
            id: v.videoId,
            title: v.title?.runs?.[0]?.text || v.title?.simpleText || '(sem título)',
            author: v.ownerText?.runs?.[0]?.text || v.longBylineText?.runs?.[0]?.text || '',
            thumb: 'https://i.ytimg.com/vi/' + v.videoId + '/mqdefault.jpg',
          });
        }
        if (out.length >= 8) break;
      }
      if (out.length >= 8) break;
    }
    return out;
  } catch {
    return [];
  }
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PORT = 8443;

// --- descobre o IP da rede local (pra abrir no celular) ---
function lanIp() {
  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const ni of ifaces[name] || []) {
      if (ni.family === 'IPv4' && !ni.internal) return ni.address;
    }
  }
  return '127.0.0.1';
}
const IP = lanIp();

// --- gera certificado self-signed na primeira execucao (HTTPS = sensores no celular) ---
const certDir = path.join(__dirname, 'certs');
const certPath = path.join(certDir, 'cert.pem');
const keyPath = path.join(certDir, 'key.pem');
if (!fs.existsSync(certPath) || !fs.existsSync(keyPath)) {
  fs.mkdirSync(certDir, { recursive: true });
  const pems = selfsigned.generate([{ name: 'commonName', value: IP }], {
    days: 3650,
    keySize: 2048,
    altNames: [
      { type: 2, value: 'localhost' },
      { type: 7, ip: '127.0.0.1' },
      { type: 7, ip: IP },
    ],
  });
  fs.writeFileSync(certPath, pems.cert);
  fs.writeFileSync(keyPath, pems.private);
  console.log('> Certificado self-signed gerado em server/certs/');
}

// --- servidor de arquivos estaticos ---
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.ico': 'image/x-icon',
};
// Mapeia "/" -> pc/  e  "/phone/" -> phone/  (cada um com seus assets).
function resolveFile(urlPath) {
  const clean = decodeURIComponent(urlPath.split('?')[0]);
  if (clean === '/') return path.join(ROOT, 'pc', 'index.html');
  if (clean === '/phone/') return path.join(ROOT, 'phone', 'index.html');

  let base, rel;
  if (clean.startsWith('/phone/')) {
    base = path.join(ROOT, 'phone');
    rel = clean.slice('/phone/'.length);
  } else {
    base = path.join(ROOT, 'pc');
    rel = clean.slice(1);
  }
  const p = path.normalize(path.join(base, rel));
  return p.startsWith(base) ? p : null;
}

const server = https.createServer(
  { cert: fs.readFileSync(certPath), key: fs.readFileSync(keyPath) },
  (req, res) => {
    const urlPath = decodeURIComponent(req.url.split('?')[0]);
    // garante a barra final pra resolver os caminhos relativos do celular
    if (urlPath === '/phone') {
      res.writeHead(301, { Location: '/phone/' });
      res.end();
      return;
    }
    const file = resolveFile(req.url);
    if (!file || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  }
);

// --- relay WebSocket: celular (phone) -> monitor (pc) ---
const wss = new WebSocketServer({ server });
const clients = new Set();
wss.on('connection', (ws) => {
  ws.role = 'unknown';
  clients.add(ws);
  ws.on('message', (data) => {
    const text = data.toString();
    let msg;
    try { msg = JSON.parse(text); } catch { return; }
    if (msg.role) ws.role = msg.role;

    // acoes nativas de foco de janela (qualquer cliente pode disparar)
    if (msg.type === 'listWindows') {
      listWindows().then((list) => {
        if (ws.readyState === 1) ws.send(JSON.stringify({ type: 'windows', list }));
      });
      return;
    }
    if (msg.type === 'focusWindow') { focusWindow(msg.hwnd); return; }
    if (msg.type === 'focusCockpit') { focusCockpit(); return; }
    if (msg.type === 'stats') {
      getStats().then((data) => { if (ws.readyState === 1) ws.send(JSON.stringify({ type: 'stats', data })); });
      return;
    }
    if (msg.type === 'weather') {
      getWeather().then((data) => { if (ws.readyState === 1) ws.send(JSON.stringify({ type: 'weather', data })); });
      return;
    }
    if (msg.type === 'ytsearch') {
      ytSearch(msg.q).then((results) => { if (ws.readyState === 1) ws.send(JSON.stringify({ type: 'ytresults', results })); });
      return;
    }

    // demais mensagens do celular: repassa pro PC
    if (ws.role === 'phone') {
      for (const c of clients) {
        if (c !== ws && c.role === 'pc' && c.readyState === 1) c.send(text);
      }
    }
  });
  ws.on('close', () => clients.delete(ws));
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('\n  Holo-Screens no ar!\n');
  console.log(`  No PC (monitor):  https://localhost:${PORT}/`);
  console.log(`  No celular:       https://${IP}:${PORT}/phone`);
  console.log('\n  Os dois na MESMA rede Wi-Fi. Aceite o aviso de certificado (Avancado > Prosseguir).\n');
});
