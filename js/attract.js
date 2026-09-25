/* Attract mode: the little looping demos shown on the cocktail table in the menu.
 * Pure drawing, no game logic. Cab.attract[id](g, t, W, H, color) draws one frame at time t.
 */
(function () {
  'use strict';
  const TAU = Math.PI * 2;
  const fold = (v, lo, hi) => { const s = hi - lo; let m = ((v - lo) % (2 * s) + 2 * s) % (2 * s); return lo + (m > s ? 2 * s - m : m); };
  const glow = (g, c, b) => { g.shadowColor = c; g.shadowBlur = b; };
  const txt = (g, s, x, y, size, c, align = 'center') => {
    g.font = `${size}px "Press Start 2P", monospace`; g.fillStyle = c; g.textAlign = align; g.textBaseline = 'middle'; g.fillText(s, x, y);
  };

  // A point walking around a grid-aligned rectangle, s in pixels along the perimeter.
  function onRect(s, x0, y0, w, h) {
    const p = 2 * (w + h);
    s = ((s % p) + p) % p;
    if (s < w) return [x0 + s, y0];
    if (s < w + h) return [x0 + w, y0 + s - w];
    if (s < 2 * w + h) return [x0 + w - (s - w - h), y0 + h];
    return [x0, y0 + h - (s - 2 * w - h)];
  }

  const A = {
    snake(g, t, W, H, c) {
      const C = 16;
      g.strokeStyle = c + '18';
      for (let x = 0; x < W; x += C) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); }
      for (let y = 0; y < H; y += C) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
      const x0 = C * 5, y0 = C * 5, w = W - C * 10, h = H - C * 10, speed = 140;
      const head = t * speed;
      const [ax, ay] = onRect(Math.floor((head + 260) / 400) * 400 + 140, x0, y0, w, h);
      glow(g, '#ff3b5c', 12); g.fillStyle = '#ff3b5c';
      g.beginPath(); g.arc(ax + C / 2, ay + C / 2, 6, 0, TAU); g.fill();
      glow(g, c, 10);
      for (let i = 18; i >= 0; i--) {
        const [x, y] = onRect(Math.floor((head - i * C) / C) * C, x0, y0, w, h);
        g.fillStyle = i === 0 ? '#e6fff0' : c;
        g.globalAlpha = 1 - i / 26;
        g.fillRect(x + 1, y + 1, C - 2, C - 2);
      }
      g.globalAlpha = 1;
    },

    breakout(g, t, W, H, c) {
      const cols = 10, bw = W / cols, colors = ['#ff2e97', '#ff8a1f', '#ffe74a', '#3dff7a', '#29f3ff'];
      const gone = Math.floor(t * 2) % 60;
      for (let r = 0; r < 5; r++) for (let k = 0; k < cols; k++) {
        const id = (r * 7 + k * 13) % 60;
        if (id < gone) continue;
        g.fillStyle = colors[r];
        g.fillRect(k * bw + 2, 30 + r * 18, bw - 4, 14);
      }
      const bx = fold(t * 210, 8, W - 8), by = fold(t * 170 + 150, 130, H - 34);
      glow(g, c, 12);
      g.fillStyle = c; g.fillRect(Math.max(0, Math.min(W - 70, bx - 35)), H - 26, 70, 9);
      g.fillStyle = '#fff'; g.beginPath(); g.arc(bx, by, 6, 0, TAU); g.fill();
    },

    splat(g, t, W, H, c) {
      const sp = 120, gapH = 110, cw = 50, spacing = 170;
      for (let i = 0; i < 5; i++) {
        const x = W - (((t * sp) + i * spacing) % (spacing * 5)) + 60;
        const n = Math.floor(((t * sp) + i * spacing) / (spacing * 5)) * 5 + i;
        const gy = H / 2 + Math.sin(n * 1.7) * 70;
        g.fillStyle = c + '33'; g.strokeStyle = c; g.lineWidth = 2;
        g.fillRect(x, 0, cw, gy - gapH / 2); g.strokeRect(x, -2, cw, gy - gapH / 2 + 2);
        g.fillRect(x, gy + gapH / 2, cw, H); g.strokeRect(x, gy + gapH / 2, cw, H);
      }
      const y = H / 2 + Math.sin(t * 2.4) * 50 + Math.abs(Math.sin(t * 6)) * -12;
      glow(g, c, 14);
      g.fillStyle = c; g.beginPath(); g.arc(110, y, 11, 0, TAU); g.fill();
      g.fillStyle = '#ff8a1f'; g.beginPath(); g.moveTo(119, y - 2); g.lineTo(129, y + 1); g.lineTo(119, y + 4); g.fill();
    },

    asteroids(g, t, W, H, c) {
      g.strokeStyle = '#d8d0ff'; g.lineWidth = 2;
      for (let i = 0; i < 7; i++) {
        const r = [34, 22, 14][i % 3];
        const x = ((i * 97 + t * (20 + i * 9)) % (W + 80)) - 40, y = ((i * 61 + t * (14 + i * 7) * (i % 2 ? 1 : -1)) % (H + 80) + H + 80) % (H + 80) - 40;
        g.beginPath();
        for (let k = 0; k < 10; k++) {
          const a = t * 0.4 * (i % 2 ? 1 : -1) + (k / 10) * TAU, rr = r * (0.78 + ((i * 7 + k * 3) % 5) * 0.07);
          k ? g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr) : g.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
        }
        g.closePath(); g.stroke();
      }
      const a = t * 1.3;
      g.save(); g.translate(W / 2, H / 2); g.rotate(a); glow(g, c, 10); g.strokeStyle = c;
      g.beginPath(); g.moveTo(14, 0); g.lineTo(-10, -8); g.lineTo(-6, 0); g.lineTo(-10, 8); g.closePath(); g.stroke(); g.restore();
      g.fillStyle = '#fff';
      for (let k = 0; k < 4; k++) {
        const age = (t * 2 + k * 0.25) % 1, ba = a - (age * 1.3) / 2;
        g.fillRect(W / 2 + Math.cos(ba) * age * 200 - 2, H / 2 + Math.sin(ba) * age * 200 - 2, 4, 4);
      }
    },

    missile(g, t, W, H, c) {
      g.fillStyle = '#3b1f2c'; g.fillRect(0, H - 22, W, 22);
      g.fillStyle = '#29f3ff';
      for (let i = 0; i < 6; i++) { const x = 60 + i * 72; g.fillRect(x - 12, H - 32, 7, 10); g.fillRect(x - 4, H - 38, 7, 16); g.fillRect(x + 4, H - 30, 7, 8); }
      for (let i = 0; i < 6; i++) {
        const p = (t * 0.22 + i * 0.17) % 1;
        const sx = 40 + ((i * 131) % (W - 80)), tx = 60 + ((i * 3) % 6) * 72;
        const x = sx + (tx - sx) * Math.min(p, 0.75) / 1, y = (H - 22) * Math.min(p, 0.75);
        g.strokeStyle = c; g.lineWidth = 1.5;
        g.beginPath(); g.moveTo(sx, 0); g.lineTo(x, y); g.stroke();
        if (p > 0.75) {
          const e = (p - 0.75) / 0.25, r = Math.sin(e * Math.PI) * 30;
          g.fillStyle = `hsl(${(t * 600 + i * 50) % 360}, 90%, 62%)`;
          g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
        }
      }
    },

    imitation(g, t, W, H, c) {
      const lines = ['???> hey whats up', 'YOU> are you a bot?', '???> lol no. r u?', 'YOU> ...', '???> thats exactly what', '     a bot would say', 'HUMAN OR AI?'];
      const total = lines.join('').length, shown = Math.floor((t * 12) % (total + 40));
      let left = shown;
      g.font = '14px "Press Start 2P", monospace'; g.textAlign = 'left'; g.textBaseline = 'top';
      lines.forEach((l, i) => {
        if (left <= 0) return;
        const s = l.slice(0, left); left -= l.length;
        const last = i === lines.length - 1;
        g.fillStyle = last ? '#ffe74a' : l.startsWith('YOU') ? '#29f3ff' : c;
        glow(g, g.fillStyle, 8);
        g.fillText(s + (left <= 0 && Math.floor(t * 3) % 2 ? '_' : ''), last ? 110 : 34, 50 + i * 38);
      });
    },

    pong(g, t, W, H, c) {
      g.strokeStyle = c + '66'; g.setLineDash([8, 10]);
      g.beginPath(); g.moveTo(W / 2, 0); g.lineTo(W / 2, H); g.stroke(); g.setLineDash([]);
      const bx = fold(t * 300, 30, W - 30), by = fold(t * 210, 10, H - 10);
      const ly = fold((t - 0.12) * 210, 10, H - 10), ry = fold((t - 0.08) * 210, 10, H - 10);
      glow(g, c, 12);
      g.fillStyle = '#29f3ff'; g.fillRect(16, Math.min(H - 70, Math.max(0, ly - 35)), 9, 70);
      g.fillStyle = '#ff8a1f'; g.fillRect(W - 25, Math.min(H - 70, Math.max(0, ry - 35)), 9, 70);
      g.fillStyle = '#fff'; g.beginPath(); g.arc(bx, by, 7, 0, TAU); g.fill();
    },
  };

  Cab.attract = function draw(id, g, t, W, H, color) {
    g.save();
    g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
    if (A[id]) A[id](g, t, W, H, color);
    g.restore();
    g.save();
    if (Math.floor(t * 1.6) % 2 === 0) { glow(g, '#ffe74a', 10); txt(g, 'PRESS START', W / 2, H - 14, 10, '#ffe74a'); }
    g.restore();
  };
})();
