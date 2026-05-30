import * as THREE from 'three';

// Dados externos que os widgets leem (preenchidos pelo main via WebSocket).
export const widgetData = { stats: null, weather: null };

const WIDGETS = {
  clock(ctx, w, h) {
    const d = new Date();
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    const ss = String(d.getSeconds()).padStart(2, '0');
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#0a0f1e'); g.addColorStop(1, '#0e1830');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.shadowColor = '#33ddff'; ctx.shadowBlur = 35;
    ctx.fillStyle = '#33ddff';
    ctx.font = 'bold 210px ui-monospace, Consolas, monospace';
    ctx.fillText(hh + ':' + mm, w / 2, h / 2 - 20);
    ctx.shadowBlur = 0;
    ctx.font = '64px ui-monospace, monospace'; ctx.fillStyle = '#6fa8c8';
    ctx.fillText(ss, w / 2, h / 2 + 130);
    ctx.font = '38px system-ui, sans-serif'; ctx.fillStyle = '#9fd8ff';
    const date = d.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });
    ctx.fillText(date, w / 2, h - 64);
  },

  system(ctx, w, h) {
    ctx.fillStyle = '#0a0f1e'; ctx.fillRect(0, 0, w, h);
    const s = widgetData.stats;
    const wx = widgetData.weather;
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#9fd8ff'; ctx.font = 'bold 48px system-ui, sans-serif';
    ctx.fillText('SISTEMA', 60, 56);

    const ramPct = s && s.ramTotal ? Math.round((s.ramUsed / s.ramTotal) * 100) : null;
    const bars = [
      ['CPU', s ? s.cpu : null, '#33ddff'],
      ['GPU', s ? s.gpu : null, '#66ffcc'],
      ['RAM', ramPct, '#ffb35a'],
    ];
    let y = 130;
    const bx = 210, bw = 560, bh = 42;
    for (const [label, val, color] of bars) {
      ctx.fillStyle = '#cdeeff'; ctx.font = '36px ui-monospace, monospace';
      ctx.fillText(label, 60, y + bh / 2);
      ctx.fillStyle = '#10243a'; ctx.fillRect(bx, y, bw, bh);
      const p = val == null ? 0 : Math.max(0, Math.min(100, val));
      ctx.fillStyle = color; ctx.fillRect(bx, y, (bw * p) / 100, bh);
      ctx.fillStyle = '#eaf6ff'; ctx.textAlign = 'right';
      ctx.fillText(val == null ? '—' : val + '%', w - 60, y + bh / 2);
      ctx.textAlign = 'left';
      y += 78;
    }
    if (s && s.ramTotal) {
      ctx.fillStyle = '#6fa8c8'; ctx.font = '28px ui-monospace, monospace';
      ctx.fillText(s.ramUsed + ' / ' + s.ramTotal + ' GB', bx, y + 6);
    }
    ctx.fillStyle = '#9fd8ff'; ctx.font = '34px system-ui, sans-serif';
    if (wx) {
      ctx.fillText((wx.city ? wx.city + '  ' : '') + wx.tempC + '°C · ' + (wx.desc || ''), 60, h - 50);
    } else {
      ctx.fillStyle = '#456'; ctx.fillText('clima carregando…', 60, h - 50);
    }
  },
};

export function makeWidget(type) {
  const canvas = document.createElement('canvas');
  canvas.width = 960; canvas.height = 540;
  const ctx = canvas.getContext('2d');
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const draw = () => { if (WIDGETS[type]) WIDGETS[type](ctx, canvas.width, canvas.height); };
  draw();
  return { type, canvas, ctx, tex, draw };
}
