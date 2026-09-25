/* Missile Command.
 * Classic: you defend six cities with three batteries; the computer attacks.
 * Flip:    you attack. Each wave you get a missile budget. Drag down from the sky to aim,
 *          or click a target to launch from a random point. Shift-drag fires a splitter
 *          (wave 2+). The computer runs the batteries under the same rules: finite ammo,
 *          the same interceptor speeds and blast radius. It has to notice each missile,
 *          work out an intercept point, and live with its own aim error.
 * Both directions: 7 waves; attacks get faster, bigger and start splitting.
 */
(function () {
  'use strict';
  const { U, D, W, H } = Cab;
  const GROUND = H - 34;
  const CITY_X = [150, 225, 300, 500, 575, 650];
  const BAT_X = [50, 400, 750];
  const BAT_SPEED = [420, 620, 420];     // centre battery is faster, as in the original
  const AMMO = 10, BLAST_R = 40, CHAIN_R = 20, WAVES = 7;

  function blastRadius(e) {
    const T = e.t;
    if (T < 0.45) return e.maxR * (T / 0.45);
    if (T < 0.7) return e.maxR;
    return Math.max(0, e.maxR * (1 - (T - 0.7) / 0.35));
  }

  // ---------------------------------------------------------------- computer defender
  function aiDefender() {
    const noticed = new Map();   // missile -> time noticed
    const assigned = new Map();  // missile -> time we expect it to be dead
    let cd = 0, clock = 0;
    return {
      update(dt, world, fireAt) {
        clock += dt;
        cd -= dt;
        const { missiles, batteries, cities, explosions } = world;
        const ammoLeft = batteries.reduce((n, b) => n + (b.alive ? b.ammo : 0), 0);
        for (const m of missiles) if (!noticed.has(m)) noticed.set(m, clock + U.rand(0.35, 0.65)); // reaction time
        for (const k of [...noticed.keys()]) if (!missiles.includes(k)) { noticed.delete(k); assigned.delete(k); }
        if (cd > 0) return;

        // Rank threats by how soon they land; skip rubble targets when ammo is short.
        const threats = missiles
          .filter((m) => clock >= noticed.get(m) && !(assigned.get(m) > clock))
          .filter((m) => !willBeCaught(m, explosions))
          .map((m) => ({ m, eta: Math.hypot(m.tx - m.x, m.ty - m.y) / m.v, worth: targetWorth(m, cities, batteries) }))
          .filter((t) => t.worth > 0 || ammoLeft > missiles.length * 1.5)
          .sort((a, b) => (a.eta - a.worth * 1.5) - (b.eta - b.worth * 1.5));

        for (const t of threats) {
          const plan = bestShot(t.m, batteries);
          if (!plan) continue;
          const ex = plan.x + U.gauss(15), ey = plan.y + U.gauss(15);
          if (fireAt(plan.bat, ex, ey)) {
            assigned.set(t.m, clock + plan.T + 0.9);
            cd = U.rand(0.3, 0.45);   // about as fast as a person can aim and click
            // A single blast often covers neighbours too, so mark nearby missiles as handled.
            for (const o of missiles) {
              if (o === t.m) continue;
              const p = posAt(o, plan.T);
              if (U.dist(p.x, p.y, plan.x, plan.y) < BLAST_R * 0.6) assigned.set(o, clock + plan.T + 0.9);
            }
            return;
          }
        }
      },
    };
  }
  function posAt(m, T) {
    const d = Math.hypot(m.tx - m.x, m.ty - m.y) || 1;
    const s = Math.min(m.v * T, d);
    return { x: m.x + ((m.tx - m.x) / d) * s, y: m.y + ((m.ty - m.y) / d) * s };
  }
  function willBeCaught(m, explosions) {
    return explosions.some((e) => e.friendly && e.t < 0.6 && U.dist(e.x, e.y, m.x, m.y) < e.maxR + m.v * 0.3);
  }
  function targetWorth(m, cities, batteries) {
    for (const c of cities) if (Math.abs(c.x - m.tx) < 30) return c.alive ? 2 : 0;
    for (const b of batteries) if (Math.abs(b.x - m.tx) < 30) return b.alive ? 1.2 : 0;
    return 0;
  }
  // Iterate the intercept: aim where the missile will be when our blast has grown enough.
  function bestShot(m, batteries) {
    let best = null;
    batteries.forEach((b, i) => {
      if (!b.alive || b.ammo <= 0) return;
      let T = 0, p = { x: m.x, y: m.y };
      for (let k = 0; k < 6; k++) {
        p = posAt(m, T);
        T = U.dist(b.x, GROUND - 14, p.x, p.y) / BAT_SPEED[i] + 0.18;
      }
      if (p.y > GROUND - 50) return;               // too low to catch safely
      if (!best || T < best.T) best = { bat: i, x: p.x, y: p.y, T };
    });
    return best;
  }

  // ---------------------------------------------------------------- game
  Cab.register({
    id: 'missile',
    name: 'Missile Command',
    color: '#ff5d6c',
    blurb: 'Defend six cities from the sky. Or be the sky: spend a missile budget and get past a computer that manages its ammo.',
    modes: [
      {
        id: 'classic', name: 'Classic',
        you: 'command the three batteries',
        cpu: 'attacks your cities',
        intro: [
          'Click where you want an interceptor to explode. The nearest battery with ammo fires.',
          'Blasts destroy missiles, and a destroyed missile blows up too, so blasts can chain.',
          `Survive ${WAVES} waves with at least one city. Attacks get faster, and from wave 3 missiles split.`,
        ],
        help: 'Click to fire · P pauses',
      },
      {
        id: 'flip', name: 'Flipped',
        you: 'launch the attack',
        cpu: 'commands the batteries',
        intro: [
          'Drag from the sky down to a target to launch a missile, or just click a target for a random launch point.',
          'From wave 2, hold Shift while releasing to fire a splitter (costs 3). It breaks into three halfway down.',
          `Destroy all six cities within ${WAVES} waves. You get more missiles and faster warheads every wave. Its batteries are rebuilt each wave, but cities are not.`,
        ],
        help: 'Drag from the sky to aim · click = random launch · Shift = splitter · P pauses',
      },
    ],

    create(api) {
      const flip = api.mode === 'flip';
      const cities = CITY_X.map((x) => ({ x, alive: true }));
      const batteries = BAT_X.map((x) => ({ x, alive: true, ammo: AMMO }));
      const missiles = [], interceptors = [], explosions = [], trails = [];
      const defender = flip ? aiDefender() : null;
      let wave = 0, waveT = 0, state = 'intro', stateT = 1.4, score = 0;
      let schedule = [], budget = 0, launchCd = 0, drag = null, msg = '', msgT = 0;
      const WAVE_TIME = 28;

      const mSpeed = () => (flip ? 52 + wave * 16 : 40 + wave * 10);
      const splitOK = () => (flip ? wave >= 2 : wave >= 3);
      function say(m) { msg = m; msgT = 1.5; }

      function startWave() {
        wave++;
        waveT = 0;
        state = 'play';
        for (const b of batteries) { b.alive = true; b.ammo = AMMO; }
        if (flip) budget = 13 + (wave - 1) * 6;
        else {
          // The computer attacker's plan for this wave: a list of launch times.
          const n = 7 + Math.round(wave * 2.5);
          schedule = [];
          for (let i = 0; i < n; i++) schedule.push(U.rand(0.5, 14 + wave * 1.5));
          schedule.sort((a, b) => a - b);
        }
      }

      function structures() {
        return [...cities.filter((c) => c.alive), ...batteries.filter((b) => b.alive)];
      }

      function launch(ox, tx, split) {
        const m = { ox, oy: 0, x: ox, y: 0, tx, ty: GROUND, v: mSpeed() * U.rand(0.9, 1.1), split, splitY: U.rand(H * 0.35, H * 0.5) };
        missiles.push(m);
      }

      function cpuAttack() {
        const targets = structures();
        if (!targets.length) return;
        const t = Math.random() < 0.72 && cities.some((c) => c.alive) ? U.pick(cities.filter((c) => c.alive)) : U.pick(targets);
        const split = splitOK() && Math.random() < 0.15 + wave * 0.04;
        launch(U.rand(20, W - 20), t.x + U.rand(-12, 12), split);
      }

      // Fire an interceptor from battery i toward (x, y). Returns true if it fired.
      function fire(i, x, y) {
        const b = batteries[i];
        if (!b.alive || b.ammo <= 0 || y > GROUND - 20) return false;
        b.ammo--;
        interceptors.push({ ox: b.x, oy: GROUND - 14, x: b.x, y: GROUND - 14, tx: x, ty: y, v: BAT_SPEED[i] });
        return true;
      }
      function humanFire(x, y) {
        const order = [0, 1, 2].filter((i) => batteries[i].alive && batteries[i].ammo > 0).sort((a, b) => Math.abs(BAT_X[a] - x) - Math.abs(BAT_X[b] - x));
        if (!order.length) return say('Out of ammo!');
        fire(order[0], x, y);
      }

      function humanLaunch(x0, y0, x1, split) {
        if (state !== 'play') return;
        if (launchCd > 0) return;
        const cost = split ? 3 : 1;
        if (split && !splitOK()) return say('Splitters unlock in wave 2');
        if (budget < cost) return say(budget ? 'Not enough for a splitter' : 'Out of missiles this wave');
        budget -= cost;
        launchCd = 0.2;
        const ox = y0 < 90 ? x0 : U.rand(20, W - 20);
        launch(U.clamp(ox, 10, W - 10), U.clamp(x1, 10, W - 10), split);
      }

      function detonate(x, y, friendly, maxR) {
        explosions.push({ x, y, t: 0, maxR, friendly });
      }

      function groundHit(m) {
        detonate(m.tx, GROUND - 4, false, 30);
        for (const c of cities) if (c.alive && Math.abs(c.x - m.tx) < 28) { c.alive = false; if (flip) score += 100; }
        for (const b of batteries) if (b.alive && Math.abs(b.x - m.tx) < 26) { b.alive = false; b.ammo = 0; }
      }

      function endCheck() {
        const alive = cities.filter((c) => c.alive).length;
        if (!alive) {
          if (flip) api.end({ win: true, title: 'All cities down. You win!', text: `The attack broke through in wave ${wave}.`, delay: 1400 });
          else api.end({ win: false, title: 'The end', text: `Your last city fell in wave ${wave}. Score ${score}.`, delay: 1400 });
          return true;
        }
        return false;
      }

      return {
        _dbg: () => ({ cities, batteries, missiles, budget, state }), // read-only view for the test harness
        pointer(type, x, y, e) {
          if (!flip) { if (type === 'down' && state === 'play') humanFire(x, y); return; }
          if (type === 'down') drag = { x0: x, y0: y };
          else if (type === 'up' && drag) {
            humanLaunch(drag.x0, drag.y0, x, api.keys.has('ShiftLeft') || api.keys.has('ShiftRight') || (e && e.shiftKey));
            drag = null;
          }
        },
        update(dt) {
          if (msgT > 0) msgT -= dt;
          launchCd -= dt;
          if (state !== 'play') {
            stateT -= dt;
            if (stateT <= 0) startWave();
          } else {
            waveT += dt;
            if (flip) defender.update(dt, { missiles, batteries, cities, explosions }, fire);
            else while (schedule.length && schedule[0] <= waveT) { schedule.shift(); cpuAttack(); }
          }

          // enemy missiles
          for (let i = missiles.length - 1; i >= 0; i--) {
            const m = missiles[i];
            const d = Math.hypot(m.tx - m.x, m.ty - m.y);
            const step = m.v * dt;
            if (d <= step) { missiles.splice(i, 1); trails.push({ ...m, fade: 1 }); groundHit(m); continue; }
            m.x += ((m.tx - m.x) / d) * step; m.y += ((m.ty - m.y) / d) * step;
            if (m.split && m.y >= m.splitY) {
              missiles.splice(i, 1);
              trails.push({ ...m, fade: 1 });
              for (const off of [-95, 0, 95]) {
                const tx = U.clamp(m.tx + off, 20, W - 20);
                missiles.push({ ox: m.x, oy: m.y, x: m.x, y: m.y, tx, ty: GROUND, v: m.v, split: false });
              }
            }
          }
          // interceptors
          for (let i = interceptors.length - 1; i >= 0; i--) {
            const c = interceptors[i];
            const d = Math.hypot(c.tx - c.x, c.ty - c.y), step = c.v * dt;
            if (d <= step) { interceptors.splice(i, 1); detonate(c.tx, c.ty, true, BLAST_R); continue; }
            c.x += ((c.tx - c.x) / d) * step; c.y += ((c.ty - c.y) / d) * step;
          }
          // explosions kill missiles (and chain)
          for (const e of explosions) {
            e.t += dt;
            if (!e.friendly) continue;
            const r = blastRadius(e);
            for (let i = missiles.length - 1; i >= 0; i--) {
              const m = missiles[i];
              if (U.dist(m.x, m.y, e.x, e.y) < r) {
                missiles.splice(i, 1);
                trails.push({ ...m, fade: 1 });
                if (!flip) score += 25;
                detonate(m.x, m.y, true, CHAIN_R);
              }
            }
          }
          for (let i = explosions.length - 1; i >= 0; i--) if (explosions[i].t > 1.05) explosions.splice(i, 1);
          for (let i = trails.length - 1; i >= 0; i--) { trails[i].fade -= dt * 0.8; if (trails[i].fade <= 0) trails.splice(i, 1); }

          if (endCheck()) return;

          // wave end
          if (state === 'play') {
            const attackerDone = flip ? (budget <= 0 || waveT > WAVE_TIME) : !schedule.length;
            if (attackerDone && !missiles.length && !explosions.length) {
              if (wave >= WAVES) {
                const alive = cities.filter((c) => c.alive).length;
                return flip
                  ? api.end({ win: false, title: 'The defence held', text: `${alive} cit${alive === 1 ? 'y' : 'ies'} survived all ${WAVES} waves. Try saturating one battery’s side, or splitting low.` })
                  : api.end({ win: true, title: 'You held the line!', text: `${alive} cit${alive === 1 ? 'y' : 'ies'} survived. Score ${score + alive * 100}.` });
              }
              if (!flip) score += cities.filter((c) => c.alive).length * 50 + batteries.reduce((n, b) => n + b.ammo * 5, 0);
              state = 'break'; stateT = 2;
            }
          }
        },
        draw(g) {
          const sky = g.createLinearGradient(0, 0, 0, H);
          sky.addColorStop(0, '#05030d'); sky.addColorStop(1, '#1d0b22');
          g.fillStyle = sky; g.fillRect(0, 0, W, H);
          if (flip) { g.fillStyle = '#ff5d6c14'; g.fillRect(0, 0, W, 90); }
          // ground
          g.fillStyle = '#3b1f2c'; g.fillRect(0, GROUND, W, H - GROUND);
          // cities
          for (const c of cities) {
            if (c.alive) {
              g.fillStyle = '#3ee6ff';
              g.fillRect(c.x - 18, GROUND - 10, 8, 10); g.fillRect(c.x - 9, GROUND - 18, 8, 18);
              g.fillRect(c.x, GROUND - 13, 7, 13); g.fillRect(c.x + 8, GROUND - 8, 9, 8);
            } else {
              g.fillStyle = '#5a2a33'; g.fillRect(c.x - 16, GROUND - 4, 32, 4);
            }
          }
          // batteries
          batteries.forEach((b) => {
            g.fillStyle = b.alive ? '#ffd23e' : '#5a2a33';
            g.beginPath(); g.moveTo(b.x - 24, GROUND); g.lineTo(b.x, GROUND - 22); g.lineTo(b.x + 24, GROUND); g.fill();
            D.text(g, b.alive ? String(b.ammo) : 'X', b.x, GROUND + 10, 10, b.alive ? '#ffd23e' : '#ff5d6c', 'center');
          });
          // trails & missiles
          g.lineWidth = 1.5;
          for (const t of trails) { g.strokeStyle = `rgba(255,93,108,${0.5 * t.fade})`; g.beginPath(); g.moveTo(t.ox, t.oy); g.lineTo(t.x, t.y); g.stroke(); }
          for (const m of missiles) {
            g.strokeStyle = m.split ? '#ff8a3d' : '#ff5d6c';
            g.beginPath(); g.moveTo(m.ox, m.oy); g.lineTo(m.x, m.y); g.stroke();
            g.fillStyle = '#fff'; g.fillRect(m.x - 1.5, m.y - 1.5, 3, 3);
          }
          for (const c of interceptors) {
            g.strokeStyle = '#5dff9b';
            g.beginPath(); g.moveTo(c.ox, c.oy); g.lineTo(c.x, c.y); g.stroke();
            g.strokeStyle = '#5dff9b88';
            g.beginPath(); g.moveTo(c.tx - 4, c.ty - 4); g.lineTo(c.tx + 4, c.ty + 4); g.moveTo(c.tx + 4, c.ty - 4); g.lineTo(c.tx - 4, c.ty + 4); g.stroke();
          }
          for (const e of explosions) {
            const r = blastRadius(e);
            if (r <= 0) continue;
            g.fillStyle = e.friendly ? `hsl(${(e.t * 900) % 360}, 90%, 65%)` : '#ff8a3d';
            g.globalAlpha = 0.85;
            g.beginPath(); g.arc(e.x, e.y, r, 0, Math.PI * 2); g.fill();
            g.globalAlpha = 1;
          }
          // aim helpers
          if (flip && drag) {
            const split = api.keys.has('ShiftLeft') || api.keys.has('ShiftRight');
            g.strokeStyle = split ? '#ff8a3d' : '#ff5d6c';
            g.setLineDash([4, 6]);
            g.beginPath();
            g.moveTo(drag.y0 < 90 ? drag.x0 : api.mouse.x, drag.y0 < 90 ? 0 : 0);
            g.lineTo(api.mouse.x, GROUND);
            g.stroke();
            g.setLineDash([]);
          }
          if (!flip && api.mouse.inside) {
            g.strokeStyle = '#5dff9b';
            g.beginPath(); g.arc(api.mouse.x, api.mouse.y, 8, 0, Math.PI * 2); g.stroke();
          }
          const alive = cities.filter((c) => c.alive).length;
          if (flip) {
            D.hud(g, [`WAVE ${Math.max(wave, 1)}/${WAVES}`, `MISSILES ${budget}`, `CITIES ${alive}`]);
            if (state === 'play') D.text(g, `${Math.max(0, Math.ceil(WAVE_TIME - waveT))}s`, W / 2, 28, 10, '#9c97bd', 'center');
            D.text(g, 'LAUNCH ZONE', 10, 76, 8, '#ff5d6c88');
          } else {
            D.hud(g, [`WAVE ${Math.max(wave, 1)}/${WAVES}`, `SCORE ${score}`, `CITIES ${alive}`]);
          }
          if (state !== 'play') D.text(g, `WAVE ${wave + 1}`, W / 2, H / 2 - 40, 20, '#ff5d6c', 'center');
          if (msgT > 0) D.text(g, msg, W / 2, H / 2, 12, '#ffd23e', 'center');
        },
      };
    },
  });
})();
