import * as THREE from 'three';
import { createScreens, addScreen, layoutScreens, SCREEN_W } from './scene.js';
import { CameraRig } from './camera-rig.js';
import { captureInto } from './screens.js';
import { connect } from './net.js';
import { createAmbiance } from './ambiance.js';
import { makeWidget, widgetData } from './widgets.js';
import { CSS3DRenderer, CSS3DObject } from 'three/addons/renderers/CSS3DRenderer.js';
import { createFaceTrack } from './facetrack.js';

// --- tela de abertura (splash + carregamento fake) ---
async function runSplash() {
  const splash = document.getElementById('splash');
  if (!splash) return;
  try { document.getElementById('asciiArt').textContent = await (await fetch('ascii.txt')).text(); } catch {}
  const fill = document.getElementById('loadFill');
  const msg = document.getElementById('loadMsg');
  const steps = [
    [18, 'autenticando jhonparkerdev…'],
    [40, 'inicializando holo-deck…'],
    [62, 'calibrando giroscópio…'],
    [84, 'montando telas virtuais…'],
    [100, 'pronto ✓'],
  ];
  let i = 0;
  (function next() {
    if (i >= steps.length) {
      setTimeout(() => { splash.classList.add('hide'); setTimeout(() => splash.remove(), 750); }, 400);
      return;
    }
    const [p, t] = steps[i++];
    fill.style.width = p + '%';
    msg.textContent = t;
    setTimeout(next, 430 + Math.random() * 260);
  })();
}
runSplash();

// --- render ---
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setClearColor(0x000000, 0);
renderer.setSize(innerWidth, innerHeight);
renderer.domElement.style.position = 'fixed';
renderer.domElement.style.inset = '0';
renderer.domElement.style.zIndex = '1';
document.body.appendChild(renderer.domElement);

// camada CSS3D (iframes / web screens) sobre o canvas WebGL
const cssRenderer = new CSS3DRenderer();
cssRenderer.setSize(innerWidth, innerHeight);
cssRenderer.domElement.style.position = 'fixed';
cssRenderer.domElement.style.inset = '0';
cssRenderer.domElement.style.zIndex = '2';
cssRenderer.domElement.style.pointerEvents = 'none'; // começa em modo navegar
document.body.appendChild(cssRenderer.domElement);
const cssScene = new THREE.Scene();

// alterna entre navegar (gira câmera) e interagir (clica nos players/sites)
let interactMode = false;
function setInteract(on) {
  interactMode = on;
  cssRenderer.domElement.style.pointerEvents = on ? 'auto' : 'none';
  document.getElementById('modeTag').textContent = on ? '🖱️ INTERAGIR (Tab volta)' : '🧭 navegar';
  document.getElementById('modeTag').style.color = on ? '#ffd27f' : '#6fa8c8';
}

const scene = new THREE.Scene();

// --- ambiance: temas (fundo + grid) + chuva (visual + som) ---
const ambiance = createAmbiance(scene);

// --- esconder/mostrar HUD (tecla H) ---
let hudVisible = true;
function toggleHud() {
  hudVisible = !hudVisible;
  const d = hudVisible ? '' : 'none';
  document.getElementById('hud').style.display = d;
  document.getElementById('setup').style.display = d;
}

const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.1, 100);
camera.position.set(0, 0, 0);

const screens = createScreens(scene, 4);
const rig = new CameraRig(camera);
const statusEl = document.getElementById('status');
const slotOf = (m) => screens.indexOf(m) + 1;

// --- head tracking pela webcam (modo opcional, tecla F) ---
let face = null;
async function toggleFace() {
  if (face && face.isRunning()) { face.stop(); face = null; rig.mode = 'gyro'; return; }
  face = createFaceTrack({
    gain: 2.6,
    onStatus: (t) => { statusEl.textContent = t; },
    onLook: (yaw, pitch) => {
      rig.mode = 'face';
      rig.yaw = yaw;
      rig.pitch = THREE.MathUtils.clamp(pitch, -1.2, 1.2);
    },
  });
  try {
    await face.start();
  } catch (e) {
    statusEl.textContent = '⚠ rosto: ' + (e.message || 'falha ao iniciar câmera');
    face = null;
  }
}

let windowList = []; // [{ hwnd, title }] do servidor
let pendingYt = null; // busca de youtube pendente: { mesh } ou null

// --- rede ---
const send = connect((msg) => {
  switch (msg.type) {
    case '_open': send({ type: 'listWindows' }); break;
    case 'windows': windowList = msg.list || []; break;
    case 'orient': rig.setOrientation(msg.alpha, msg.beta, msg.gamma, msg.orient); break;
    case 'zoom':
      camera.fov = THREE.MathUtils.clamp(msg.fov, 14, 100);
      camera.updateProjectionMatrix();
      break;
    case 'recenter': rig.recenter(); break;
    case 'mode': rig.mode = msg.mode; break;
    case 'sens': rig.gain = THREE.MathUtils.clamp(msg.value, 1, 5); break;
    case 'enter': enterCenteredScreen(); break;
    case 'stats': widgetData.stats = msg.data; break;
    case 'weather': widgetData.weather = msg.data; break;
    case 'ytresults': openYtPicker(msg.results); break;
  }
});

// --- polling de sistema/clima (so quando existe widget 'system') ---
function hasSystemWidget() { return screens.some((s) => s.userData.widget === 'system'); }
function pollSystem() { if (hasSystemWidget()) send({ type: 'stats' }); }
function pollWeather() { if (hasSystemWidget()) send({ type: 'weather' }); }
setInterval(pollSystem, 4000);
setInterval(pollWeather, 15 * 60 * 1000);

// --- tela central da visao ---
const _fwd = new THREE.Vector3();
function centeredScreen() {
  _fwd.set(0, 0, -1).applyQuaternion(camera.quaternion);
  let best = null, bestDot = -Infinity;
  for (const s of screens) {
    const d = _fwd.dot(s.position.clone().normalize());
    if (d > bestDot) { bestDot = d; best = s; }
  }
  return best;
}

function enterCenteredScreen() {
  const s = centeredScreen();
  if (!s) return;
  if (s.userData.hwnd) {
    send({ type: 'focusWindow', hwnd: s.userData.hwnd });
    statusEl.textContent = 'entrou na tela ' + slotOf(s) + ' · use o celular p/ voltar';
  } else {
    statusEl.textContent = 'tela ' + slotOf(s) + ' sem janela associada (capture no painel)';
  }
}

// --- associacao de janela ---
// --- base CSS3D: anexa um elemento DOM real (iframe/img) no lugar da tela ---
function attachCSS(mesh, element, baseWidthPx = 1024) {
  element.style.pointerEvents = 'auto';
  const cssObj = new CSS3DObject(element);
  const s = SCREEN_W / baseWidthPx;
  cssObj.scale.set(s, s, s);
  cssScene.add(cssObj);
  mesh.visible = false;        // a tela WebGL some; o DOM ocupa o lugar
  mesh.userData.cssObj = cssObj;
}
function detachCSS(mesh) {
  const u = mesh.userData;
  if (u.cssObj) {
    cssScene.remove(u.cssObj);
    if (u.cssObj.element) u.cssObj.element.remove();
    u.cssObj = null;
  }
  mesh.visible = true;
}

// limpa qualquer tipo especial (widget/media/web) antes de aplicar outro
function clearSpecial(mesh) {
  const u = mesh.userData;
  detachCSS(mesh);
  if (u.media && u.media.url && u.media.url.startsWith('blob:')) URL.revokeObjectURL(u.media.url);
  u.web = null;
  u.media = null;
  u.widget = null;
  u.widgetObj = null;
}

function markFilled(mesh, title) {
  clearSpecial(mesh);
  mesh.userData.winTitle = title;
  mesh.userData.needsRecapture = false;
  statusEl.textContent = 'tela ' + slotOf(mesh) + ' → ' + title;
  saveState();
  rebuildPanel();
}

// widgets (relogio, sistema)
function applyWidget(mesh, type) {
  clearSpecial(mesh);
  const w = makeWidget(type);
  mesh.material.map = w.tex;
  mesh.material.needsUpdate = true;
  mesh.userData.widget = type;
  mesh.userData.widgetObj = w;
  mesh.userData.hwnd = null;
}
function addWidget(type) {
  if (screens.length >= MAX_SCREENS) return;
  applyWidget(addScreen(scene, screens), type);
  if (type === 'system') { send({ type: 'stats' }); send({ type: 'weather' }); }
  saveState();
  rebuildPanel();
}

// midia (foto / GIF animado) como <img> DOM real -> GIF anima nativo
function applyMedia(mesh, url) {
  clearSpecial(mesh);
  const img = document.createElement('img');
  if (/^https?:/i.test(url)) img.crossOrigin = 'anonymous';
  img.src = url;
  img.style.cssText = 'width:1024px;height:576px;object-fit:contain;background:#05070d;border:2px solid #1d4a6e;border-radius:4px';
  attachCSS(mesh, img, 1024);
  mesh.userData.media = { url };
  mesh.userData.hwnd = null;
}
function addMedia() {
  if (screens.length >= MAX_SCREENS) return;
  const url = prompt('URL da imagem/GIF (deixe vazio p/ escolher um arquivo):', '');
  if (url === null) return;
  if (url.trim()) { applyMedia(addScreen(scene, screens), url.trim()); saveState(); rebuildPanel(); return; }
  const inp = document.createElement('input');
  inp.type = 'file'; inp.accept = 'image/*';
  inp.onchange = () => {
    if (inp.files[0]) { applyMedia(addScreen(scene, screens), URL.createObjectURL(inp.files[0])); saveState(); rebuildPanel(); }
  };
  inp.click();
}

// web screen / player (iframe vivo e clicavel via CSS3D)
function applyWeb(mesh, url) {
  clearSpecial(mesh);
  const iframe = document.createElement('iframe');
  iframe.src = url;
  iframe.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen; clipboard-write';
  iframe.style.cssText = 'width:1024px;height:576px;border:2px solid #33ddff;background:#05070d;border-radius:4px';
  attachCSS(mesh, iframe, 1024);
  mesh.userData.web = { url };
  mesh.userData.hwnd = null;
}
function addWeb() {
  if (screens.length >= MAX_SCREENS) return;
  const url = prompt('URL do site/dashboard:', 'https://');
  if (!url || !url.trim()) return;
  applyWeb(addScreen(scene, screens), url.trim());
  saveState();
  rebuildPanel();
}

// --- youtube: busca (Invidious no backend) + player embed ---
function ytId(s) {
  const m = s.match(/(?:v=|youtu\.be\/|embed\/|shorts\/)([\w-]{11})/) || s.match(/^([\w-]{11})$/);
  return m ? m[1] : null;
}
function applyYouTube(mesh, id) {
  // autoplay so funciona mudo (politica do navegador); clica no player p/ ativar o som
  applyWeb(mesh, 'https://www.youtube-nocookie.com/embed/' + id + '?autoplay=1&mute=1&rel=0');
}
function addYouTube() {
  if (screens.length >= MAX_SCREENS) return;
  const q = prompt('Pesquisar no YouTube (ou colar URL/ID do vídeo):', '');
  if (!q || !q.trim()) return;
  const id = ytId(q.trim());
  if (id) { applyYouTube(addScreen(scene, screens), id); saveState(); rebuildPanel(); return; }
  pendingYt = { mesh: null };
  statusEl.textContent = 'buscando "' + q.trim() + '"…';
  send({ type: 'ytsearch', q: q.trim() });
}
function researchYt(mesh) {
  const q = prompt('Pesquisar / trocar vídeo (URL, ID ou termo):', '');
  if (!q || !q.trim()) return;
  const id = ytId(q.trim());
  if (id) { applyYouTube(mesh, id); saveState(); rebuildPanel(); return; }
  pendingYt = { mesh };
  statusEl.textContent = 'buscando "' + q.trim() + '"…';
  send({ type: 'ytsearch', q: q.trim() });
}
function openYtPicker(results) {
  if (!results || !results.length) { statusEl.textContent = 'nenhum vídeo encontrado'; pendingYt = null; return; }
  pickerList.innerHTML = '';
  for (const v of results) {
    const b = document.createElement('button');
    b.style.display = 'flex'; b.style.gap = '10px'; b.style.alignItems = 'center';
    const im = document.createElement('img');
    im.src = v.thumb; im.style.width = '120px'; im.style.borderRadius = '4px'; im.style.flex = '0 0 auto';
    const sp = document.createElement('span');
    sp.textContent = v.title + (v.author ? ' — ' + v.author : '');
    b.appendChild(im); b.appendChild(sp);
    b.onclick = () => {
      const mesh = pendingYt && pendingYt.mesh ? pendingYt.mesh : addScreen(scene, screens);
      applyYouTube(mesh, v.id);
      pendingYt = null;
      picker.style.display = 'none';
      saveState();
      rebuildPanel();
    };
    pickerList.appendChild(b);
  }
  picker.querySelector('.title').textContent = 'Escolha o vídeo:';
  picker.style.display = 'flex';
}

// glow ambilight: desenha o conteudo BORRADO e esmaece as bordas com a mascara radial
function updateGlow(mesh) {
  const g = mesh.userData.glow;
  const src = mesh.material.map && mesh.material.map.image;
  if (!g || !src) return;
  const ctx = g.ctx, cw = g.canvas.width, ch = g.canvas.height;
  try {
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, cw, ch);
    ctx.filter = 'blur(9px)';
    ctx.drawImage(src, -cw * 0.1, -ch * 0.1, cw * 1.2, ch * 1.2);
    ctx.filter = 'none';
    ctx.globalCompositeOperation = 'destination-in'; // recorta com as bordas suaves
    ctx.drawImage(g.mask, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    g.tex.needsUpdate = true;
  } catch {}
}

function assignWindow(mesh, label) {
  const norm = (t) => (t || '').toLowerCase();
  const auto = windowList.find((w) => label && (norm(label).includes(norm(w.title)) || norm(w.title).includes(norm(label))));
  if (auto) { mesh.userData.hwnd = auto.hwnd; markFilled(mesh, auto.title); }
  else openPicker(mesh);
}

const picker = document.getElementById('picker');
const pickerList = document.getElementById('pickerList');
function openPicker(mesh) {
  pickerList.innerHTML = '';
  picker.querySelector('.title').textContent = 'Associe esta tela a uma janela (pro controle):';
  for (const w of windowList) {
    const b = document.createElement('button');
    b.textContent = w.title;
    b.onclick = () => { mesh.userData.hwnd = w.hwnd; markFilled(mesh, w.title); picker.style.display = 'none'; };
    pickerList.appendChild(b);
  }
  picker.style.display = 'flex';
}
document.getElementById('pickerCancel').onclick = () => { picker.style.display = 'none'; };

async function captureScreen(mesh) {
  send({ type: 'listWindows' });
  statusEl.textContent = 'escolha a janela para a tela ' + slotOf(mesh) + '…';
  try {
    const label = await captureInto(mesh);
    if (label === null) { statusEl.textContent = 'captura cancelada'; return; }
    assignWindow(mesh, label);
  } catch (e) {
    statusEl.textContent = '⚠ ' + e.message;
    console.error('Falha na captura:', e);
  }
}

// --- painel "Criar / capturar telas" com drag-and-drop pra reordenar ---
const MAX_SCREENS = 8;
const setupBtns = document.getElementById('setupBtns');
let dragIdx = null;

function rebuildPanel() {
  setupBtns.innerHTML = '';
  screens.forEach((mesh, i) => {
    const row = document.createElement('div');
    row.className = 'screenRow';
    row.draggable = true;

    const cap = document.createElement('button');
    cap.className = 'capBtn';
    const ud = mesh.userData;
    if (ud.web) {
      cap.classList.add('filled');
      const isYt = /youtube|youtu\.be/.test(ud.web.url);
      cap.textContent = 'Tela ' + (i + 1) + (isYt ? ' ▶️ youtube' : ' 🌐 web');
      cap.onclick = isYt ? () => researchYt(mesh) : () => captureScreen(mesh);
    } else if (ud.media) {
      cap.classList.add('filled');
      cap.textContent = 'Tela ' + (i + 1) + ' 🖼️ mídia';
      cap.onclick = () => captureScreen(mesh);
    } else if (ud.widget) {
      cap.classList.add('filled');
      const icon = ud.widget === 'system' ? '📊' : '🕒';
      cap.textContent = 'Tela ' + (i + 1) + ' ' + icon + ' ' + ud.widget;
      cap.onclick = () => captureScreen(mesh); // clicar troca o widget por captura
    } else if (ud.hwnd) {
      cap.classList.add('filled');
      cap.textContent = 'Tela ' + (i + 1) + (ud.needsRecapture ? ' 🔁 ' : ' ✓ ') + (ud.winTitle || '');
      cap.onclick = () => captureScreen(mesh);
    } else {
      cap.textContent = 'Tela ' + (i + 1) + ' ▸ capturar';
      cap.onclick = () => captureScreen(mesh);
    }

    const rm = document.createElement('button');
    rm.className = 'rmBtn';
    rm.textContent = '×';
    rm.title = 'remover tela';
    rm.onclick = (e) => { e.stopPropagation(); removeScreenUI(mesh); };

    row.appendChild(cap);
    row.appendChild(rm);

    row.addEventListener('dragstart', () => { dragIdx = i; row.classList.add('dragging'); });
    row.addEventListener('dragend', () => row.classList.remove('dragging'));
    row.addEventListener('dragover', (e) => { e.preventDefault(); row.classList.add('over'); });
    row.addEventListener('dragleave', () => row.classList.remove('over'));
    row.addEventListener('drop', (e) => {
      e.preventDefault();
      if (dragIdx === null || dragIdx === i) { dragIdx = null; return; }
      const tmp = screens[dragIdx]; screens[dragIdx] = screens[i]; screens[i] = tmp; // troca de lugar
      layoutScreens(screens);
      saveState();
      rebuildPanel();
      dragIdx = null;
    });

    setupBtns.appendChild(row);
  });

  if (screens.length < MAX_SCREENS) {
    const add = document.createElement('button');
    add.className = 'addBtn';
    add.textContent = '+ adicionar tela';
    add.onclick = addScreenUI;
    setupBtns.appendChild(add);

    const addClock = document.createElement('button');
    addClock.className = 'addBtn';
    addClock.textContent = '+ relógio 🕒';
    addClock.onclick = () => addWidget('clock');
    setupBtns.appendChild(addClock);

    const addSys = document.createElement('button');
    addSys.className = 'addBtn';
    addSys.textContent = '+ sistema 📊';
    addSys.onclick = () => addWidget('system');
    setupBtns.appendChild(addSys);

    const addMid = document.createElement('button');
    addMid.className = 'addBtn';
    addMid.textContent = '+ mídia 🖼️';
    addMid.onclick = addMedia;
    setupBtns.appendChild(addMid);

    const addYt = document.createElement('button');
    addYt.className = 'addBtn';
    addYt.textContent = '+ youtube ▶️';
    addYt.onclick = addYouTube;
    setupBtns.appendChild(addYt);
  }
}

function addScreenUI() {
  if (screens.length >= MAX_SCREENS) return;
  addScreen(scene, screens);
  saveState();
  rebuildPanel();
}

function removeScreenUI(mesh) {
  if (screens.length <= 1) return;
  const i = screens.indexOf(mesh);
  if (i < 0) return;
  clearSpecial(mesh); // remove iframe/cssObj/blob se houver
  scene.remove(mesh);
  mesh.geometry.dispose();
  mesh.material.dispose();
  screens.splice(i, 1);
  layoutScreens(screens);
  saveState();
  rebuildPanel();
}

// --- persistencia (localStorage): quantidade + associacoes + tema ---
const STORE = 'holo-screens-state';
function saveState() {
  try {
    localStorage.setItem(STORE, JSON.stringify({
      theme: ambiance.index,
      screens: screens.map((m) => {
        const u = m.userData;
        if (u.web) return { web: u.web.url };
        if (u.media) return (u.media.url && !u.media.url.startsWith('blob:')) ? { media: u.media.url } : null;
        if (u.widget) return { widget: u.widget };
        if (u.hwnd) return { hwnd: u.hwnd, title: u.winTitle };
        return null;
      }),
    }));
  } catch {}
}
function loadState() {
  try { return JSON.parse(localStorage.getItem(STORE) || 'null'); } catch { return null; }
}
(function restoreState() {
  const saved = loadState();
  if (saved && typeof saved.theme === 'number') ambiance.setTheme(saved.theme);
  if (saved && Array.isArray(saved.screens)) {
    while (screens.length < saved.screens.length && screens.length < MAX_SCREENS) addScreen(scene, screens);
    while (screens.length > saved.screens.length && screens.length > 1) {
      const m = screens.pop();
      scene.remove(m); m.geometry.dispose(); m.material.dispose();
    }
    saved.screens.forEach((s, i) => {
      if (!s || !screens[i]) return;
      if (s.web) applyWeb(screens[i], s.web);
      else if (s.media) applyMedia(screens[i], s.media);
      else if (s.widget) applyWidget(screens[i], s.widget);
      else if (s.hwnd) {
        screens[i].userData.hwnd = s.hwnd;
        screens[i].userData.winTitle = s.title;
        screens[i].userData.needsRecapture = true; // reclicar p/ reativar o video
      }
    });
    layoutScreens(screens);
  }
  rebuildPanel();
  if (hasSystemWidget()) { send({ type: 'stats' }); send({ type: 'weather' }); }
})();

// --- duplo-clique numa tela = capturar ---
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
renderer.domElement.addEventListener('dblclick', (e) => {
  pointer.x = (e.clientX / innerWidth) * 2 - 1;
  pointer.y = -(e.clientY / innerHeight) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const hit = raycaster.intersectObjects(screens, false)[0];
  if (hit) captureScreen(hit.object);
});

// --- mouse-look (fallback sem celular) ---
let dragging = false, lx = 0, ly = 0;
renderer.domElement.addEventListener('mousedown', (e) => { dragging = true; lx = e.clientX; ly = e.clientY; });
addEventListener('mouseup', () => { dragging = false; });
addEventListener('mousemove', (e) => {
  if (!dragging) return;
  rig.setMouse(e.clientX - lx, e.clientY - ly);
  lx = e.clientX; ly = e.clientY;
});

// --- scroll do mouse = zoom (FOV) ---
renderer.domElement.addEventListener('wheel', (e) => {
  camera.fov = THREE.MathUtils.clamp(camera.fov + e.deltaY * 0.03, 14, 100);
  camera.updateProjectionMatrix();
  e.preventDefault();
}, { passive: false });

// --- teclas ---
addEventListener('keydown', (e) => {
  if (e.key === 'g' || e.key === 'G') {
    rig.mode = rig.mode === 'gyro' ? 'click' : 'gyro';
    statusEl.textContent = 'modo: ' + (rig.mode === 'gyro' ? 'giroscópio' : 'mouse');
  }
  if (e.key === 'r' || e.key === 'R') { rig.recenter(); if (face && face.isRunning()) face.calibrate(); }
  if (e.key === 'f' || e.key === 'F') toggleFace();
  if (e.key === 'h' || e.key === 'H') toggleHud();
  if (e.key === 'b' || e.key === 'B') { statusEl.textContent = 'tema: ' + ambiance.nextTheme(); saveState(); }
  if (e.key === 'c' || e.key === 'C') statusEl.textContent = ambiance.toggleRain() ? 'chuva ligada 🌧️' : 'chuva desligada';
  if (e.key === 'Tab') { e.preventDefault(); setInteract(!interactMode); }
  if (e.key === 'Enter') enterCenteredScreen();
});

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  cssRenderer.setSize(innerWidth, innerHeight);
});

// --- loop ---
function loop() {
  requestAnimationFrame(loop);
  rig.update();
  ambiance.update();
  const c = centeredScreen();
  for (const s of screens) {
    if (s.userData.cssObj) { // mídia/web/youtube: sincroniza o DOM 3D com a posição da tela
      s.userData.cssObj.position.copy(s.position);
      s.userData.cssObj.quaternion.copy(s.quaternion);
      continue;
    }
    if (s.userData.widgetObj) {
      s.userData.widgetObj.draw();
      s.userData.widgetObj.tex.needsUpdate = true;
    }
    updateGlow(s);
    const edge = s.children[0];
    if (edge) edge.material.color.set(s === c ? 0xffd27f : 0x33ddff);
  }
  renderer.render(scene, camera);
  cssRenderer.render(cssScene, camera);
}
loop();
