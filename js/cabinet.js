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

  // ---------------------------------------------------------------- menu: the cocktail table
  // Pick a game on the reel; its attract demo plays on the table. Then pick a seat:
  // the near seat (P1) is the classic side, the far seat (P2) is the flipped side.
  const menu = { sel: 0, raf: 0, t0: 0, far: false };

  function buildMenu() {
    el.menu.innerHTML = `
      <h2 class="select-title"><span>PICK A GAME &middot; PICK A SIDE</span></h2>
      <div class="reel">
        <button class="reel-arrow" type="button" data-dir="-1" aria-label="Previous game">&#9664;</button>
        <div class="reel-track" role="tablist" aria-label="Games"></div>
        <button class="reel-arrow" type="button" data-dir="1" aria-label="Next game">&#9654;</button>
      </div>
      <div class="table-scene">
        <button class="seat seat-p1" type="button" data-seat="0"></button>
        <div class="cocktail" aria-hidden="true">
          <div class="cocktail-glass">
            <canvas id="attract" width="480" height="360"></canvas>
            <div class="attract-title"></div>
            <div class="crt"></div>
            <div class="glare"></div>
          </div>
          <span class="coin-slot"><span>25&cent;</span></span>
        </div>
        <button class="seat seat-p2" type="button" data-seat="1"></button>
      </div>
      <p class="menu-blurb" aria-live="polite"></p>
      <p class="menu-keys">&larr; &rarr; CHANGE GAME &middot; ENTER SIT AT P1 (CLASSIC) &middot; SHIFT+ENTER SIT AT P2 (FLIPPED)</p>`;
    const track = el.menu.querySelector('.reel-track');
    Cab.games.forEach((g, i) => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'chip';
      chip.setAttribute('role', 'tab');
      chip.style.setProperty('--c', g.color);
      chip.dataset.name = g.name;                      // printed on the cartridge label (CSS)
      chip.setAttribute('aria-label', g.name);
      chip.innerHTML = `<span>${String(i + 1).padStart(2, '0')}</span>`;
      chip.onclick = () => selectGame(i);
      track.appendChild(chip);
    });
    el.menu.querySelectorAll('.reel-arrow').forEach((b) => { b.onclick = () => selectGame(menu.sel + +b.dataset.dir); });
    el.menu.querySelectorAll('.seat').forEach((b) => {
      b.onclick = () => sit(+b.dataset.seat);
      // Reaching for the far seat turns the table to face that side.
      if (b.dataset.seat === '1') {
        const turn = (on) => { menu.far = on; el.menu.querySelector('.cocktail').classList.toggle('turned', on); };
        b.addEventListener('pointerenter', () => turn(true));
        b.addEventListener('pointerleave', () => turn(false));
        b.addEventListener('focus', () => turn(true));
        b.addEventListener('blur', () => turn(false));
      }
    });
    // Swipe the table to spin the reel on touch screens.
    const table = el.menu.querySelector('.cocktail');
    let sx = null;
    table.addEventListener('pointerdown', (e) => { sx = e.clientX; });
    table.addEventListener('pointerup', (e) => {
      if (sx !== null && Math.abs(e.clientX - sx) > 40) selectGame(menu.sel + (e.clientX < sx ? 1 : -1));
      sx = null;
    });
    el.attract = $('attract').getContext('2d');
    let saved = 0;
    try { saved = +sessionStorage.getItem('cab.sel') || 0; } catch (e) { /* storage blocked */ }
    selectGame(saved, true);
  }

  function selectGame(i, instant) {
    const n = Cab.games.length;
    menu.sel = ((i % n) + n) % n;
    try { sessionStorage.setItem('cab.sel', menu.sel); } catch (e) { /* storage blocked */ }
    const g = Cab.games[menu.sel];
    el.menu.style.setProperty('--c', g.color);
    el.menu.querySelectorAll('.chip').forEach((c, k) => {
      c.classList.toggle('on', k === menu.sel);
      c.setAttribute('aria-selected', k === menu.sel);
      if (k === menu.sel && !el.menu.hidden) c.scrollIntoView({ block: 'nearest', inline: 'center', behavior: instant ? 'auto' : 'smooth' });
    });
    el.menu.querySelector('.attract-title').textContent = g.name;
    el.menu.querySelector('.menu-blurb').textContent = g.blurb;
    g.modes.forEach((m, k) => {
      const seat = el.menu.querySelector(`[data-seat="${k}"]`);
      seat.innerHTML = `
        <span class="seat-in">
          <i class="screw tl"></i><i class="screw tr"></i><i class="screw bl"></i><i class="screw br"></i>
          <span class="seat-card">
            <span class="seat-tag">${k === 0 ? 'PLAYER 1 SIDE' : 'PLAYER 2 SIDE'} &middot; ${k === 0 ? 'CLASSIC' : 'FLIPPED'}</span>
            <b>${U.esc(m.name)}</b>
            <span><em>YOU</em> ${U.esc(m.you)}</span>
            <span><em>CPU</em> ${U.esc(m.cpu)}</span>
          </span>
          <span class="seat-hw"><span class="stick"></span><span class="seat-go">SIT HERE</span><span class="buttons"><i></i><i></i></span></span>
        </span>`;
      seat.setAttribute('aria-label', `${g.name}, ${m.name}: you ${m.you}; computer ${m.cpu}`);
    });
    // A quick screen "channel change" when switching games.
    const glass = el.menu.querySelector('.cocktail-glass');
    glass.classList.remove('switch'); void glass.offsetWidth; glass.classList.add('switch');
    menu.t0 = performance.now();
  }

  function sit(k) {
    const g = Cab.games[menu.sel];
    location.hash = `#/${g.id}/${g.modes[k].id}`;
  }

  function attractLoop(now) {
    menu.raf = requestAnimationFrame(attractLoop);
    const g = Cab.games[menu.sel];
    Cab.attract(g.id, el.attract, (now - menu.t0) / 1000, 480, 360, g.color);
  }
  function startAttract() { cancelAnimationFrame(menu.raf); if (Cab.attract) menu.raf = requestAnimationFrame(attractLoop); }
  function stopAttract() { cancelAnimationFrame(menu.raf); }

  function menuKey(e) {
    if (e.code === 'ArrowLeft') { e.preventDefault(); selectGame(menu.sel - 1); }
    else if (e.code === 'ArrowRight') { e.preventDefault(); selectGame(menu.sel + 1); }
    else if (e.code === 'Enter' && !e.target.closest('button')) { e.preventDefault(); sit(e.shiftKey ? 1 : 0); }
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
      selectGame(menu.sel, true);
      startAttract();
      return;
    }
    stopAttract();
    menu.sel = Cab.games.indexOf(g);
    try { sessionStorage.setItem('cab.sel', menu.sel); } catch (e) { /* storage blocked */ }
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
    if (typing) return;
    if (el.stage.hidden) { menuKey(e); return; }
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
