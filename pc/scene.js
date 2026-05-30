import * as THREE from 'three';

const W = 4.6, H = 2.59;        // 16:9
export const SCREEN_W = W, SCREEN_H = H;
const RADIUS = 6.2;            // distancia (menor = preview maior)
const STEP = 0.78;            // angulo (rad) ENTRE telas — fixo, entao nunca sobrepoe
const GW = 160, GH = 90;       // resolucao do canvas de glow

// Mascara radial (centro opaco -> bordas transparentes) pra suavizar o glow.
let _glowMask = null;
function glowMask() {
  if (_glowMask) return _glowMask;
  const m = document.createElement('canvas');
  m.width = GW; m.height = GH;
  const c = m.getContext('2d');
  const r = Math.max(GW, GH) * 0.5;
  const g = c.createRadialGradient(GW / 2, GH / 2, r * 0.1, GW / 2, GH / 2, r);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.5, 'rgba(255,255,255,0.85)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = g; c.fillRect(0, 0, GW, GH);
  _glowMask = m;
  return m;
}

// Cria N telas dispostas num arco ao redor da camera (na origem).
export function createScreens(scene, count = 4) {
  const screens = [];
  for (let i = 0; i < count; i++) addScreen(scene, screens);
  return screens;
}

// Adiciona uma tela nova e reposiciona todas.
export function addScreen(scene, screens) {
  const geo = new THREE.PlaneGeometry(W, H);
  const tex = placeholderTexture(screens.length + 1);
  const mat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.userData = { baseTex: tex };

  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(geo),
    new THREE.LineBasicMaterial({ color: 0x33ddff })
  );
  mesh.add(edges); // children[0] = borda

  // glow ambilight: copia borrada do conteudo, com bordas esmaecidas, atras da tela
  const gc = document.createElement('canvas');
  gc.width = GW; gc.height = GH;
  const gtex = new THREE.CanvasTexture(gc);
  gtex.colorSpace = THREE.SRGBColorSpace;
  const glow = new THREE.Mesh(
    new THREE.PlaneGeometry(W * 1.9, H * 1.9),
    new THREE.MeshBasicMaterial({
      map: gtex, transparent: true, opacity: 0.85,
      blending: THREE.AdditiveBlending, depthWrite: false,
    })
  );
  glow.position.z = -0.05; // atras da tela
  mesh.add(glow); // children[1] = glow
  mesh.userData.glow = { canvas: gc, ctx: gc.getContext('2d'), tex: gtex, mask: glowMask() };

  scene.add(mesh);
  screens.push(mesh);
  layoutScreens(screens);
  return mesh;
}

// Reposiciona a lista de telas no arco (ordem do array = ordem da esquerda p/ direita).
export function layoutScreens(screens) {
  const n = screens.length;
  const start = -((n - 1) / 2) * STEP; // centraliza o leque na "frente"
  for (let i = 0; i < n; i++) {
    const angle = start + i * STEP;
    const m = screens[i];
    m.position.set(Math.sin(angle) * RADIUS, 0, -Math.cos(angle) * RADIUS);
    m.lookAt(0, 0, 0);
    m.userData.slot = i;
  }
}

function placeholderTexture(n) {
  const c = document.createElement('canvas');
  c.width = 960; c.height = 540;
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 960, 540);
  g.addColorStop(0, '#0b1e3a');
  g.addColorStop(1, '#10324f');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 960, 540);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = '#33ddff';
  ctx.font = 'bold 200px system-ui, sans-serif';
  ctx.fillText(String(n), 480, 250);
  ctx.font = '38px system-ui, sans-serif';
  ctx.fillStyle = '#9fd8ff';
  ctx.fillText('capturar no painel ▸', 480, 430);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
