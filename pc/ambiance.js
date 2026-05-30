import * as THREE from 'three';

// Temas: fundo (CSS) + cor do grid do chao.
const THEMES = [
  { name: 'Espaço',     bg: 'radial-gradient(circle at 50% 30%, #0c2238 0%, #05070d 70%)', grid: [0x0a2a44, 0x0a1a2a] },
  { name: 'Noite',      bg: 'linear-gradient(180deg, #02030a, #060a1a, #0a0f24)',           grid: [0x10204a, 0x0a1430] },
  { name: 'Madrugada',  bg: 'linear-gradient(180deg, #0a0a2a, #1a1a4a, #2a2a6a)',           grid: [0x3a3a8a, 0x1a1a4a] },
  { name: 'Amanhecer',  bg: 'linear-gradient(180deg, #2a1a4a, #7a4a6a, #ffb07a)',           grid: [0x9a5a7a, 0x4a2a4a] },
  { name: 'Dia',        bg: 'linear-gradient(180deg, #6db3ff, #a9d6ff, #eaf6ff)',           grid: [0x88aacc, 0x6688aa] },
  { name: 'Tarde',      bg: 'linear-gradient(180deg, #ffb35a, #ff8a6a, #b86a9a)',           grid: [0xb86a9a, 0x6a3a5a] },
  { name: 'Pôr do sol', bg: 'linear-gradient(180deg, #2a1030, #8a2a5a, #ff7e5f)',           grid: [0x8a2a5a, 0x4a1a2a] },
  { name: 'Aurora',     bg: 'linear-gradient(180deg, #021018, #0a3a4a, #1affc8, #0a3a4a)',  grid: [0x1affc8, 0x0a4a4a] },
  { name: 'Neon',       bg: 'linear-gradient(160deg, #0a001a, #ff00cc, #3300ff)',           grid: [0xff00cc, 0x3300ff] },
  { name: 'Vaporwave',  bg: 'linear-gradient(180deg, #2b1055, #7597de, #ff6ad5)',           grid: [0xff6ad5, 0x7597de] },
  { name: 'Cyberpunk',  bg: 'linear-gradient(160deg, #05010f, #1a0030, #00fff0)',           grid: [0x00fff0, 0xaa00ff] },
  { name: 'Floresta',   bg: 'linear-gradient(180deg, #001a12, #003a26, #0a5a3a)',           grid: [0x1a8a5a, 0x0a4a2a] },
  { name: 'Oceano',     bg: 'linear-gradient(180deg, #001028, #003a5a, #0077aa)',           grid: [0x0099cc, 0x004466] },
  { name: 'Lava',       bg: 'linear-gradient(180deg, #1a0000, #5a0a00, #ff4400)',           grid: [0xff4400, 0x6a1a00] },
  { name: 'Rosa',       bg: 'linear-gradient(180deg, #1a0010, #4a0a2a, #ff5a8a)',           grid: [0xff5a8a, 0x6a1a3a] },
  { name: 'Matrix',     bg: 'linear-gradient(180deg, #000800, #001a00, #003300)',           grid: [0x00ff44, 0x004411] },
  { name: 'Gelo',       bg: 'linear-gradient(180deg, #0a2a3a, #2a6a8a, #bfe9ff)',           grid: [0x7ad6ff, 0x2a6a8a] },
  { name: 'Preto',      bg: '#000000',                                                       grid: [0x222222, 0x111111] },
  { name: 'Branco',     bg: 'linear-gradient(180deg, #ffffff, #e8eef5, #dde7f0)',           grid: [0xb0c0d0, 0x90a0b0] },
];

export function createAmbiance(scene) {
  // ---- tema (fundo + grid) ----
  let gridRef = null;
  let themeIndex = 0;
  function applyTheme(i) {
    themeIndex = ((i % THEMES.length) + THEMES.length) % THEMES.length;
    const t = THEMES[themeIndex];
    document.body.style.background = t.bg;
    if (gridRef) { scene.remove(gridRef); gridRef.geometry.dispose(); gridRef.material.dispose(); }
    gridRef = new THREE.GridHelper(60, 60, t.grid[0], t.grid[1]);
    gridRef.position.y = -2.6;
    scene.add(gridRef);
    return t.name;
  }
  applyTheme(0);

  // ---- chuva (partículas) ----
  const N = 5000;
  const pos = new Float32Array(N * 3);
  const vel = new Float32Array(N);
  for (let k = 0; k < N; k++) {
    pos[k * 3 + 0] = (Math.random() - 0.5) * 70;
    pos[k * 3 + 1] = Math.random() * 45 - 5;
    pos[k * 3 + 2] = (Math.random() - 0.5) * 70;
    vel[k] = 0.35 + Math.random() * 0.6;
  }
  const rainGeo = new THREE.BufferGeometry();
  rainGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const rain = new THREE.Points(rainGeo, new THREE.PointsMaterial({
    color: 0x9fc8ff, size: 0.07, transparent: true, opacity: 0.55, depthWrite: false,
  }));
  rain.visible = false;
  scene.add(rain);

  // ---- som de chuva (ruído marrom filtrado, sem arquivo) ----
  let audioCtx = null, rainSrc = null, rainGain = null;
  function startRainSound() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const buf = audioCtx.createBuffer(1, audioCtx.sampleRate * 2, audioCtx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < d.length; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02;
      d[i] = last * 3.2;
    }
    rainSrc = audioCtx.createBufferSource();
    rainSrc.buffer = buf; rainSrc.loop = true;
    const hp = audioCtx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 420;
    const lp = audioCtx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2300;
    rainGain = audioCtx.createGain(); rainGain.gain.value = 0;
    rainSrc.connect(hp); hp.connect(lp); lp.connect(rainGain); rainGain.connect(audioCtx.destination);
    rainSrc.start();
    rainGain.gain.linearRampToValueAtTime(0.28, audioCtx.currentTime + 1);
  }
  function stopRainSound() {
    if (!rainGain || !audioCtx) return;
    rainGain.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 0.6);
    const s = rainSrc; rainSrc = null;
    setTimeout(() => { try { s && s.stop(); } catch {} }, 800);
  }

  let rainOn = false;
  function toggleRain() {
    rainOn = !rainOn;
    rain.visible = rainOn;
    if (rainOn) startRainSound(); else stopRainSound();
    return rainOn;
  }

  function update() {
    if (!rainOn) return;
    const p = rainGeo.attributes.position.array;
    for (let k = 0; k < N; k++) {
      p[k * 3 + 1] -= vel[k];
      if (p[k * 3 + 1] < -5) p[k * 3 + 1] = 40;
    }
    rainGeo.attributes.position.needsUpdate = true;
  }

  return {
    nextTheme: () => applyTheme(themeIndex + 1),
    prevTheme: () => applyTheme(themeIndex - 1),
    setTheme: (i) => applyTheme(i),
    get index() { return themeIndex; },
    toggleRain,
    update,
  };
}
