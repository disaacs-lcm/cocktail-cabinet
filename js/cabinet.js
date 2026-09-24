/* Cocktail Cabinet runtime.
 *
 * Each game calls Cab.register({ id, name, color, blurb, modes, dom, create }).
 * create(api) returns an instance with any of:
 *   update(dt)            fixed 60 Hz step
 *   draw(g)               render to the 800x600 canvas context
 *   key(code, event)      a key was pressed (held keys live in api.keys)
 *   pointer(type, x, y)   'down' | 'move' | 'up' in canvas coordinates
 *   destroy()             clean up timers, sockets, DOM
 * The instance ends the game with api.end({ win, title, text }).
 */
(function () {
  'use strict';

  const W = 800, H = 600, STEP = 1 / 60;

  const U = {
    clamp: (v, a, b) => (v < a ? a : v > b ? b : v),
    lerp: (a, b, t) => a + (b - a) * t,
    rand: (a = 0, b = 1) => a + Math.random() * (b - a),
    randi: (a, b) => Math.floor(a + Math.random() * (b - a + 1)),
    pick: (arr) => arr[Math.floor(Math.random() * arr.length)],
    dist: (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by),
    wrap: (v, m) => ((v % m) + m) % m,
    angDiff(a, b) {
      let d = b - a;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      return d;
    },
    // Box-Muller normal sample, used for "human-like" aim and timing error.
    gauss(sd = 1) {
      const u = 1 - Math.random(), v = Math.random();
      return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v) * sd;
    },
    shuffle(arr) {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return arr;
    },
    esc: (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
  };

  const D = {
    text(g, str, x, y, size = 14, color = '#ece9ff', align = 'left', font = 'pixel') {
      g.save();
      g.font = font === 'pixel' ? `${size}px "Press Start 2P", monospace` : `600 ${size}px Inter, system-ui, sans-serif`;
      g.fillStyle = color;
      g.textAlign = align;
      g.textBaseline = 'top';
      g.fillText(str, x, y);
      g.restore();
    },
    // A HUD strip across the top: items is an array of strings, spread evenly.
    hud(g, items, color = '#ece9ff') {
      const n = items.length;
      items.forEach((s, i) => {
        const align = n === 1 ? 'center' : i === 0 ? 'left' : i === n - 1 ? 'right' : 'center';
        const x = n === 1 ? W / 2 : i === 0 ? 12 : i === n - 1 ? W - 12 : (W * i) / (n - 1);
        D.text(g, s, x, 10, 11, color, align);
      });
    },
    glow(g, color, blur = 12) { g.shadowColor = color; g.shadowBlur = blur; },
    clear(g, color = '#05040a') { g.fillStyle = color; g.fillRect(0, 0, W, H); },
  };

  const Cab = (window.Cab = { W, H, U, D, games: [] });
  Cab.register = (g) => Cab.games.push(g);

  // ---------------------------------------------------------------- runtime
  let el = {};
  let game = null, mode = null, inst = null, api = null;
  let running = false, paused = false, ended = false;
  let raf = 0, last = 0, acc = 0;
  const keys = new Set();
  const mouse = { x: W / 2, y: H / 2, down: false, inside: false };

  function $(id) { return document.getElementById(id); }

  function boot() {
    el = {
      menu: $('menu'), stage: $('stage'), canvas: $('screen'), overlay: $('overlay'),
      dom: $('dom-layer'), name: $('stage-name'), mode: $('stage-mode'), help: $('help'),
      back: $('btn-back'), pause: $('btn-pause'), bezel: $('bezel'),
    };
    el.g = el.canvas.getContext('2d');
    buildMenu();
    el.back.onclick = () => { location.hash = ''; };
    el.pause.onclick = () => togglePause();

    window.addEventListener('hashchange', route);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', (e) => keys.delete(e.code));
    window.addEventListener('blur', () => { keys.clear(); if (running && !game.dom) setPaused(true); });
    document.addEventListener('visibilitychange', () => { if (document.hidden && running && !game.dom) setPaused(true); });

    const c = el.canvas;
    c.addEventListener('pointerdown', (e) => { c.focus(); c.setPointerCapture(e.pointerId); pointer('down', e); });
    c.addEventListener('pointermove', (e) => pointer('move', e));
    c.addEventListener('pointerup', (e) => pointer('up', e));
    c.addEventListener('pointerleave', () => { mouse.inside = false; });
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    route();
  }

  function buildMenu() {
    el.menu.innerHTML = '<h2 class="select-title">SELECT GAME</h2>';
    Cab.games.forEach((g, i) => {
      const card = document.createElement('article');
      card.className = 'card';
      card.style.setProperty('--c', g.color);
      card.innerHTML = `<span class="card-no">${String(i + 1).padStart(2, '0')}</span><h2>${U.esc(g.name)}</h2><p>${U.esc(g.blurb)}</p><div class="modes"></div>`;
      const modes = card.querySelector('.modes');
      for (const m of g.modes) {
        const b = document.createElement('button');
        b.className = 'mode-btn';
        b.type = 'button';
        b.innerHTML = `<b>${U.esc(m.name)}</b><span><span class="who">YOU</span> ${U.esc(m.you)}</span><span><span class="who">CPU</span> ${U.esc(m.cpu)}</span>`;
        b.onclick = () => { location.hash = `#/${g.id}/${m.id}`; };
        modes.appendChild(b);
      }
      el.menu.appendChild(card);
    });
  }

  function route() {
    const [, id, modeId] = (location.hash || '').split('/');
    const g = Cab.games.find((x) => x.id === id);
    const m = g && (g.modes.find((x) => x.id === modeId) || g.modes[0]);
    stop();
    if (!g) {
      el.stage.hidden = true;
      el.menu.hidden = false;
      document.title = 'Cocktail Cabinet';
      return;
    }
    game = g; mode = m;
    el.menu.hidden = true;
    el.stage.hidden = false;
    el.stage.style.setProperty('--c', g.color);
    el.name.textContent = g.name;
    el.name.style.color = g.color;
    el.mode.textContent = m.name;
    el.help.textContent = m.help || '';
    el.canvas.hidden = !!g.dom;
    el.dom.hidden = !g.dom;
    el.pause.style.visibility = g.dom ? 'hidden' : '';
    document.title = `${g.name} · Cocktail Cabinet`;
    window.scrollTo(0, 0);
    showIntro();
  }

  function showIntro() {
    const other = game.modes.find((x) => x !== mode);
    const bullets = (mode.intro || []).map((s) => `<li>${s}</li>`).join('');
    overlay(`
      <h3 style="color:${game.color}">${U.esc(mode.name)}</h3>
      <p><b style="color:var(--ink)">You:</b> ${U.esc(mode.you)}<br><b style="color:var(--ink)">Computer:</b> ${U.esc(mode.cpu)}</p>
      ${bullets ? `<ul>${bullets}</ul>` : ''}
      <div class="row">
        <button class="btn" data-act="start">Start</button>
        ${other ? `<button class="btn ghost" data-act="swap">Switch sides: ${U.esc(other.name)}</button>` : ''}
      </div>`);
    if (!game.dom) drawAttract();
  }

  function drawAttract() {
    const g = el.g;
    D.clear(g);
    g.strokeStyle = game.color + '33';
    for (let x = 0; x <= W; x += 40) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); }
    for (let y = 0; y <= H; y += 40) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
  }

  function overlay(html) {
    el.overlay.innerHTML = `<div class="box">${html}</div>`;
    el.overlay.hidden = false;
    el.overlay.querySelectorAll('[data-act]').forEach((b) => {
      b.onclick = () => act(b.dataset.act);
    });
    const first = el.overlay.querySelector('button');
    if (first) setTimeout(() => first.focus(), 30);
  }
  function hideOverlay() { el.overlay.hidden = true; el.overlay.innerHTML = ''; }

  function act(a) {
    if (a === 'start' || a === 'again') begin();
    else if (a === 'swap') {
      const other = game.modes.find((x) => x !== mode);
      location.hash = `#/${game.id}/${other.id}`;
    } else if (a === 'menu') location.hash = '';
    else if (a === 'resume') setPaused(false);
  }

  function begin() {
    stop();
    hideOverlay();
    keys.clear();
    ended = false; paused = false;
    el.pause.textContent = 'PAUSE';
    if (game.dom) el.dom.innerHTML = '';
    api = {
      W, H, U, D, keys, mouse,
      mode: mode.id,
      dom: el.dom,
      color: game.color,
      end: (r) => finish(r),
      setHelp: (s) => { el.help.textContent = s; },
      isEnded: () => ended,
    };
    inst = game.create(api) || {};
    running = true;
    last = performance.now();
    acc = 0;
    raf = requestAnimationFrame(frame);
    if (!game.dom) el.canvas.focus();
  }

  function stop() {
    running = false;
    cancelAnimationFrame(raf);
    if (inst && inst.destroy) { try { inst.destroy(); } catch (e) { console.error(e); } }
    inst = null;
    hideOverlay();
  }

  function frame(now) {
    if (!running) return;
    raf = requestAnimationFrame(frame);
    let dt = (now - last) / 1000;
    last = now;
    if (dt > 0.25) dt = 0.25; // tab was asleep; don't fast-forward
    if (!paused && !ended) {
      acc += dt;
      while (acc >= STEP) {
        if (inst.update) inst.update(STEP);
        acc -= STEP;
        if (ended) break;
      }
    }
    if (inst && inst.draw && !game.dom) inst.draw(el.g);
  }

  function finish(r = {}) {
    if (ended) return;
    ended = true;
    const cls = r.win === true ? 'win' : r.win === false ? 'lose' : '';
    const other = game.modes.find((x) => x !== mode);
    setTimeout(() => {
      if (!running) return;
      overlay(`
        <h3 class="${cls}">${U.esc(r.title || 'Game over')}</h3>
        ${r.text ? `<p>${r.text}</p>` : ''}
        <div class="row">
          <button class="btn" data-act="again">Play again</button>
          ${other ? `<button class="btn ghost" data-act="swap">Switch sides</button>` : ''}
          <button class="btn ghost" data-act="menu">Cabinet</button>
        </div>`);
    }, r.delay ?? 700);
  }

  function setPaused(p) {
    if (!running || ended || game.dom) return;
    paused = p;
    el.pause.textContent = p ? 'RESUME' : 'PAUSE';
    if (p) {
      overlay(`<h3>Paused</h3><p>Press P or Esc to resume.</p><div class="row"><button class="btn" data-act="resume">Resume</button><button class="btn ghost" data-act="menu">Cabinet</button></div>`);
    } else {
      hideOverlay();
      last = performance.now();
      el.canvas.focus();
    }
  }
  function togglePause() { setPaused(!paused); }

  function onKeyDown(e) {
    const typing = e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA');
    if (typing || el.stage.hidden) return;
    if (!running) {
      if ((e.code === 'Enter' || e.code === 'Space') && !el.overlay.hidden && document.activeElement === document.body) {
        e.preventDefault();
        el.overlay.querySelector('button')?.click();
      }
      return;
    }
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
    if (e.code === 'KeyP' || e.code === 'Escape') { togglePause(); return; }
    if (paused || ended) return;
    if (!e.repeat) {
      keys.add(e.code);
      if (inst && inst.key) inst.key(e.code, e);
    }
  }

  function pointer(type, e) {
    const r = el.canvas.getBoundingClientRect();
    mouse.x = ((e.clientX - r.left) * W) / r.width;
    mouse.y = ((e.clientY - r.top) * H) / r.height;
    mouse.inside = true;
    if (type === 'down') mouse.down = true;
    if (type === 'up') mouse.down = false;
    mouse.button = e.button;
    mouse.shift = e.shiftKey;
    if (running && !paused && !ended && inst && inst.pointer) inst.pointer(type, mouse.x, mouse.y, e);
  }

  Cab.boot = boot;
})();
