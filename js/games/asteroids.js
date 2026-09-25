/* Asteroids.
 * Classic: you fly the ship; the computer sends the asteroids, aiming harder each wave.
 * Flip:    the computer flies the ship; you launch asteroids from the screen edge with an
 *          energy budget. Survive a 35 s wave and your budget, regen and max speed go up.
 * The computer pilot uses the same rotate / thrust / fire controls and limits as you. It
 * predicts collisions, leads its shots and dodges, with aim wobble and a short reaction.
 */
(function () {
  'use strict';
  const { U, D, W, H } = Cab;
  const SHIP_R = 12, TURN = 4.2, THRUST = 260, DRAG = 0.45, MAX_V = 330;
  const BULLET_V = 520, BULLET_LIFE = 0.85, FIRE_CD = 0.22, MAX_BULLETS = 5;
  const SIZES = { 3: 44, 2: 24, 1: 13 };
  const COST = { 3: 3, 2: 2, 1: 1 };
  const MAX_ROCK_V = { 1: 190, 2: 150 };
  const MASS = { 3: 7, 2: 3, 1: 1 };           // a big rock is 7 hits' worth once it splits
  const WAVE_LEN = 35, FLIP_WAVES = 6, CLASSIC_WAVES = 6, EDGE = 56;

  const wd = (d, m) => { d = U.wrap(d + m / 2, m) - m / 2; return d; }; // shortest wrapped delta

  function makeRock(x, y, vx, vy, size) {
    const verts = [];
    const n = 9 + size * 2;
    for (let i = 0; i < n; i++) verts.push(U.rand(0.72, 1.12));
    return { x, y, vx, vy, size, r: SIZES[size], rot: U.rand(0, 6.28), spin: U.rand(-1, 1), verts };
  }

  function newShip() {
    return { x: W / 2, y: H / 2, vx: 0, vy: 0, a: -Math.PI / 2, cd: 0, inv: 2.5, thrusting: false, alive: true, respawn: 0 };
  }

  // ---------------------------------------------------------------- computer pilot
  // Every "think" (~0.1 s, a human-ish decision rate) the pilot asks: if I hold these
  // controls for a moment and then coast, how close do I come to any rock over the next
  // 1.2 s? It simulates the same ship physics against every rock's straight-line path.
  // If its hunting move keeps a safe margin it hunts (leads its shots, with aim wobble);
  // otherwise it takes whichever turn/thrust combination leaves the most room.
  function clearance(ship, rocks, turn, thrust) {
    let x = ship.x, y = ship.y, vx = ship.vx, vy = ship.vy, a = ship.a, worst = 999;
    const rs = rocks.map((r) => ({ x: r.x, y: r.y, vx: r.vx, vy: r.vy, r: r.r }));
    const dt = 1 / 30;
    for (let t = 0; t < 1.2; t += dt) {
      if (t < 0.35) {
        a += turn * TURN * dt;
        if (thrust) { vx += Math.cos(a) * THRUST * dt; vy += Math.sin(a) * THRUST * dt; }
      }
      vx *= 1 - DRAG * dt; vy *= 1 - DRAG * dt;
      const sp = Math.hypot(vx, vy);
      if (sp > MAX_V) { vx *= MAX_V / sp; vy *= MAX_V / sp; }
      x += vx * dt; y += vy * dt;
      for (const r of rs) {
        r.x += r.vx * dt; r.y += r.vy * dt;
        const d = Math.hypot(wd(r.x - x, W), wd(r.y - y, H)) - r.r * 0.9 - SHIP_R * 0.8;
        worst = Math.min(worst, d + t * 30); // near-term danger counts more
      }
    }
    return worst;
  }

  function aiPilot(skill) {
    let think = 0, aimNoise = 0, targetRock = null, plan = { turn: 0, thrust: false, fire: false };
    const SAFE = 36;
    return {
      plan(ship, rocks, dt) {
        think -= dt;
        // Trigger finger, checked every frame: fire if the nose is on any rock's lead point.
        plan.fire = false;
        for (const r of rocks) {
          const d = Math.hypot(wd(r.x - ship.x, W), wd(r.y - ship.y, H));
          if (d > BULLET_V * BULLET_LIFE * 0.95) continue;
          const tol = Math.atan2(r.r * 0.7, d);
          if (Math.abs(U.angDiff(ship.a, leadAngle(ship, r) + (r === targetRock ? aimNoise : 0))) < tol) { plan.fire = true; break; }
        }
        if (think > 0) return plan;
        think = U.lerp(0.14, 0.07, skill) + U.rand(0, 0.03);

        // Hunting move: turn toward the lead point on the easiest rock that isn't too close.
        if (!targetRock || !rocks.includes(targetRock) || Math.random() < 0.08) {
          let best = Infinity;
          targetRock = null;
          for (const r of rocks) {
            const px = wd(r.x - ship.x, W), py = wd(r.y - ship.y, H);
            const dist = Math.hypot(px, py);
            const cost = dist / 300 + Math.abs(U.angDiff(ship.a, Math.atan2(py, px))) / TURN + (dist < r.r + 70 ? 2 : 0);
            if (cost < best) { best = cost; targetRock = r; }
          }
          aimNoise = U.gauss(U.lerp(0.09, 0.03, skill));
        }
        let hunt = { turn: 0, thrust: false };
        const speed = Math.hypot(ship.vx, ship.vy);
        if (targetRock) {
          const want = leadAngle(ship, targetRock) + aimNoise;
          const diff = U.angDiff(ship.a, want);
          hunt.turn = Math.abs(diff) < 0.03 ? 0 : Math.sign(diff) * Math.min(1, Math.abs(diff) / (TURN * 0.1));
        }
        if (speed > 160) {                                       // bleed off speed
          const back = Math.atan2(-ship.vy, -ship.vx);
          hunt.turn = Math.sign(U.angDiff(ship.a, back));
          hunt.thrust = Math.abs(U.angDiff(ship.a, back)) < 0.5;
        }
        if (clearance(ship, rocks, hunt.turn, hunt.thrust) > SAFE) {
          plan.turn = hunt.turn; plan.thrust = hunt.thrust;
          return plan;
        }
        // Danger: pick the control combination that leaves the most room.
        let best = -Infinity;
        for (const turn of [-1, 0, 1]) {
          for (const thrust of [false, true]) {
            const c = clearance(ship, rocks, turn, thrust) + U.gauss(U.lerp(8, 2, skill));
            if (c > best) { best = c; plan.turn = turn; plan.thrust = thrust; }
          }
        }
        return plan;
      },
    };
  }

  // Angle to shoot so the bullet meets the rock (ship frame, bullet inherits ship velocity).
  function leadAngle(ship, r) {
    const px = wd(r.x - ship.x, W), py = wd(r.y - ship.y, H);
    const vx = r.vx, vy = r.vy; // bullets carry ship velocity, so relative motion is just the rock's
    const a = vx * vx + vy * vy - BULLET_V * BULLET_V;
    const b = 2 * (px * vx + py * vy);
    const c = px * px + py * py;
    const disc = b * b - 4 * a * c;
    let t = Math.hypot(px, py) / BULLET_V;
    if (disc >= 0) {
      const t1 = (-b - Math.sqrt(disc)) / (2 * a), t2 = (-b + Math.sqrt(disc)) / (2 * a);
      t = Math.min(...[t1, t2].filter((x) => x > 0), t);
    }
    return Math.atan2(py + vy * t, px + vx * t);
  }

  // ---------------------------------------------------------------- game
  Cab.register({
    id: 'asteroids',
    name: 'Asteroids',
    color: '#3ee6ff',
    blurb: 'Blast rocks, don’t get hit. Or throw the rocks yourself at a computer pilot that dodges and shoots back.',
    modes: [
      {
        id: 'classic', name: 'Classic',
        you: 'fly the ship',
        cpu: 'throws asteroids at you, aiming better each wave',
        intro: [
          '← → rotate, ↑ thrust, Space fires. The screen edges wrap.',
          `Clear ${CLASSIC_WAVES} waves to win. You have 3 ships.`,
        ],
        help: '←/→ rotate · ↑ thrust · Space fire · P pauses',
      },
      {
        id: 'flip', name: 'Flipped',
        you: 'launch the asteroids',
        cpu: 'flies the ship',
        intro: [
          'Press near a screen edge and drag inward to aim. Release to launch. Longer drags are faster.',
          'Keys 1 / 2 / 3 pick the rock size (costs 1 / 2 / 3 energy). Energy refills over time.',
          `Destroy the ship 3 times before it survives ${FLIP_WAVES} waves of ${WAVE_LEN}s. Each wave gives you more energy and faster rocks.`,
        ],
        help: 'Drag from an edge to launch · 1/2/3 rock size · P pauses',
      },
    ],

    create(api) {
      const flip = api.mode === 'flip';
      let ship = newShip();
      const rocks = [], bullets = [], sparks = [];
      const pilot = flip ? aiPilot(0.45) : null;
      let lives = 3, wave = 1, waveT = 0, score = 0, banner = 1.6, bannerText = 'WAVE 1';
      // flip state
      let energy = 4, size = 3, drag = null, msg = '', msgT = 0;
      const maxEnergy = () => 4 + wave * 2;
      const regen = () => 0.45 + wave * 0.3;
      const maxRockV = () => 70 + wave * 22;
      const maxMass = () => 14 + wave * 7;

      function say(m) { msg = m; msgT = 1.4; }
      function boom(x, y, n, color) {
        for (let i = 0; i < n; i++) {
          const a = U.rand(0, 6.28), v = U.rand(40, 220);
          sparks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, l: U.rand(0.3, 0.8), color });
        }
      }

      // Classic: the computer's rock-thrower.
      function cpuWave() {
        const n = 1 + Math.ceil(wave * 0.8);
        for (let i = 0; i < n; i++) cpuThrow(3);
      }
      function cpuThrow(sz) {
        let x, y;
        do {
          if (Math.random() < 0.5) { x = U.rand(0, W); y = Math.random() < 0.5 ? 0 : H; }
          else { x = Math.random() < 0.5 ? 0 : W; y = U.rand(0, H); }
        } while (U.dist(x, y, ship.x, ship.y) < 250);
        const spread = U.lerp(1.0, 0.35, (wave - 1) / (CLASSIC_WAVES - 1));
        const a = Math.atan2(wd(ship.y - y, H), wd(ship.x - x, W)) + U.rand(-spread, spread);
        const v = U.rand(40, 60) + wave * 10;
        rocks.push(makeRock(x, y, Math.cos(a) * v, Math.sin(a) * v, sz));
      }
      if (!flip) cpuWave();

      function fire() {
        if (!ship.alive || ship.cd > 0 || bullets.length >= MAX_BULLETS) return;
        ship.cd = FIRE_CD;
        bullets.push({
          x: ship.x + Math.cos(ship.a) * SHIP_R, y: ship.y + Math.sin(ship.a) * SHIP_R,
          vx: ship.vx + Math.cos(ship.a) * BULLET_V, vy: ship.vy + Math.sin(ship.a) * BULLET_V, l: BULLET_LIFE,
        });
      }

      function hitRock(i) {
        const r = rocks[i];
        rocks.splice(i, 1);
        boom(r.x, r.y, 6 + r.size * 4, '#9c97bd');
        score += (4 - r.size) * 20;
        if (r.size > 1) {
          for (let k = 0; k < 2; k++) {
            const a = U.rand(0, 6.28), v = Math.min(Math.hypot(r.vx, r.vy) * 0.8 + 45, MAX_ROCK_V[r.size - 1]);
            rocks.push(makeRock(r.x, r.y, r.vx * 0.4 + Math.cos(a) * v, r.vy * 0.4 + Math.sin(a) * v, r.size - 1));
          }
        }
      }

      function shipDies() {
        boom(ship.x, ship.y, 40, flip ? '#ff8a3d' : '#3ee6ff');
        ship.alive = false;
        ship.respawn = 2;
        lives--;
        if (lives <= 0) {
          if (flip) api.end({ win: true, title: 'Ship destroyed. You win!', text: `You took down the pilot in wave ${wave}.`, delay: 1200 });
          else api.end({ win: false, title: 'Game over', text: `You reached wave ${wave} with ${score} points.`, delay: 1200 });
        }
      }

      function launchHuman(x0, y0, x1, y1) {
        const len = Math.hypot(x1 - x0, y1 - y0);
        if (COST[size] > energy) return say('Not enough energy');
        const mass = rocks.reduce((m, r) => m + MASS[r.size], 0);
        if (mass + MASS[size] > maxMass()) return say('Sky’s full: wait for the pilot to clear some');
        if (U.dist(x0, y0, ship.x, ship.y) < 170) return say('Too close to the ship');
        const v = U.clamp(len * 1.2, 35, maxRockV());
        const a = len < 8 ? Math.atan2(ship.y - y0, ship.x - x0) + U.rand(-0.6, 0.6) : Math.atan2(y1 - y0, x1 - x0);
        energy -= COST[size];
        rocks.push(makeRock(x0, y0, Math.cos(a) * v, Math.sin(a) * v, size));
      }

      function onEdge(x, y) { return x < EDGE || y < EDGE || x > W - EDGE || y > H - EDGE; }

      return {
        _dbg: () => ({ ship, rocks, energy }), // read-only view for the test harness
        key(code) {
          if (!flip && code === 'Space') fire();
          if (flip && ['Digit1', 'Digit2', 'Digit3'].includes(code)) size = +code.slice(-1);
        },
        pointer(type, x, y) {
          if (!flip) return;
          if (type === 'down') {
            if (!onEdge(x, y)) { say('Start your throw near an edge'); return; }
            drag = { x0: x, y0: y };
          } else if (type === 'up' && drag) {
            launchHuman(drag.x0, drag.y0, x, y);
            drag = null;
          }
        },
        update(dt) {
          if (banner > 0) banner -= dt;
          if (msgT > 0) msgT -= dt;
          // --- ship controls (human or computer, same limits)
          if (ship.alive) {
            let turn = 0, thrust = false, wantFire = false;
            if (flip) {
              const p = pilot.plan(ship, rocks, dt);
              turn = p.turn; thrust = p.thrust; wantFire = p.fire;
            } else {
              if (api.keys.has('ArrowLeft') || api.keys.has('KeyA')) turn -= 1;
              if (api.keys.has('ArrowRight') || api.keys.has('KeyD')) turn += 1;
              thrust = api.keys.has('ArrowUp') || api.keys.has('KeyW');
              wantFire = api.keys.has('Space') && ship.cd <= 0 && bullets.length === 0; // hold = slow auto-fire
            }
            ship.a += U.clamp(turn, -1, 1) * TURN * dt;
            ship.thrusting = thrust;
            if (thrust) { ship.vx += Math.cos(ship.a) * THRUST * dt; ship.vy += Math.sin(ship.a) * THRUST * dt; }
            ship.vx *= 1 - DRAG * dt; ship.vy *= 1 - DRAG * dt;
            const sp = Math.hypot(ship.vx, ship.vy);
            if (sp > MAX_V) { ship.vx *= MAX_V / sp; ship.vy *= MAX_V / sp; }
            ship.x = U.wrap(ship.x + ship.vx * dt, W); ship.y = U.wrap(ship.y + ship.vy * dt, H);
            ship.cd -= dt; ship.inv -= dt;
            if (wantFire) fire();
          } else if (lives > 0) {
            ship.respawn -= dt;
            const clear = rocks.every((r) => U.dist(r.x, r.y, W / 2, H / 2) > r.r + 110);
            if (ship.respawn <= 0 && (clear || ship.respawn < -3)) ship = newShip();
          }
          // --- rocks, bullets
          for (const r of rocks) { r.x = U.wrap(r.x + r.vx * dt, W); r.y = U.wrap(r.y + r.vy * dt, H); r.rot += r.spin * dt; }
          for (let i = bullets.length - 1; i >= 0; i--) {
            const b = bullets[i];
            b.x = U.wrap(b.x + b.vx * dt, W); b.y = U.wrap(b.y + b.vy * dt, H); b.l -= dt;
            let hit = false;
            for (let k = rocks.length - 1; k >= 0; k--) {
              const r = rocks[k];
              if (Math.hypot(wd(r.x - b.x, W), wd(r.y - b.y, H)) < r.r) { hitRock(k); hit = true; break; }
            }
            if (hit || b.l <= 0) bullets.splice(i, 1);
          }
          if (ship.alive && ship.inv <= 0) {
            for (const r of rocks) {
              if (Math.hypot(wd(r.x - ship.x, W), wd(r.y - ship.y, H)) < r.r * 0.9 + SHIP_R * 0.8) { shipDies(); break; }
            }
          }
          for (const s of sparks) { s.x += s.vx * dt; s.y += s.vy * dt; s.l -= dt; }
          for (let i = sparks.length - 1; i >= 0; i--) if (sparks[i].l <= 0) sparks.splice(i, 1);
          if (api.isEnded()) return;

          // --- waves
          if (flip) {
            energy = Math.min(maxEnergy(), energy + regen() * dt);
            waveT += dt;
            if (waveT >= WAVE_LEN) {
              if (wave >= FLIP_WAVES) return api.end({ win: false, title: 'The pilot survived', text: `It lasted all ${FLIP_WAVES} waves with ${lives} ship${lives === 1 ? '' : 's'} left and scored ${score}. Try crossfire: two rocks from opposite edges at once.` });
              wave++; waveT = 0; banner = 1.6; bannerText = `WAVE ${wave}`;
            }
          } else if (!rocks.length && ship.alive) {
            if (wave >= CLASSIC_WAVES) return api.end({ win: true, title: 'Sector cleared!', text: `All ${CLASSIC_WAVES} waves cleared with ${score} points.` });
            wave++; banner = 1.6; bannerText = `WAVE ${wave}`;
            cpuWave();
          }
        },
        draw(g) {
          D.clear(g, '#03030a');
          g.fillStyle = '#ffffff22';
          for (let i = 0; i < 60; i++) g.fillRect((i * 137) % W, (i * 71) % H, 2, 2);
          if (flip) {
            g.strokeStyle = '#3ee6ff22';
            g.lineWidth = EDGE * 2;
            g.strokeRect(0, 0, W, H);
            g.lineWidth = 1;
          }
          g.lineWidth = 2;
          // rocks
          g.strokeStyle = '#c9c4ec';
          for (const r of rocks) {
            for (const [ox, oy] of [[0, 0], [W, 0], [-W, 0], [0, H], [0, -H]]) {
              const x = r.x + ox, y = r.y + oy;
              if (x < -r.r * 1.2 || x > W + r.r * 1.2 || y < -r.r * 1.2 || y > H + r.r * 1.2) continue;
              g.beginPath();
              r.verts.forEach((k, i) => {
                const a = r.rot + (i / r.verts.length) * Math.PI * 2;
                const px = x + Math.cos(a) * r.r * k, py = y + Math.sin(a) * r.r * k;
                i ? g.lineTo(px, py) : g.moveTo(px, py);
              });
              g.closePath(); g.stroke();
            }
          }
          // ship
          if (ship.alive && (ship.inv <= 0 || Math.floor(ship.inv * 10) % 2 === 0)) {
            const col = flip ? '#ff8a3d' : '#3ee6ff';
            g.save();
            g.translate(ship.x, ship.y); g.rotate(ship.a);
            D.glow(g, col, 10);
            g.strokeStyle = col;
            g.beginPath(); g.moveTo(SHIP_R + 4, 0); g.lineTo(-SHIP_R, -SHIP_R * 0.75); g.lineTo(-SHIP_R * 0.6, 0); g.lineTo(-SHIP_R, SHIP_R * 0.75); g.closePath(); g.stroke();
            if (ship.thrusting && Math.random() < 0.8) {
              g.strokeStyle = '#ffd23e';
              g.beginPath(); g.moveTo(-SHIP_R * 0.7, -5); g.lineTo(-SHIP_R - U.rand(6, 14), 0); g.lineTo(-SHIP_R * 0.7, 5); g.stroke();
            }
            g.restore();
          }
          g.fillStyle = '#fff';
          for (const b of bullets) g.fillRect(b.x - 2, b.y - 2, 4, 4);
          for (const s of sparks) { g.fillStyle = s.color; g.globalAlpha = Math.max(0, s.l); g.fillRect(s.x, s.y, 2, 2); }
          g.globalAlpha = 1;
          // drag preview
          if (flip && drag) {
            const mx = api.mouse.x, my = api.mouse.y;
            const len = Math.hypot(mx - drag.x0, my - drag.y0);
            const v = U.clamp(len * 1.2, 35, maxRockV());
            g.strokeStyle = COST[size] <= energy ? '#3ee6ff' : '#ff5d6c';
            g.setLineDash([5, 5]);
            g.beginPath(); g.arc(drag.x0, drag.y0, SIZES[size], 0, Math.PI * 2); g.stroke();
            g.beginPath(); g.moveTo(drag.x0, drag.y0);
            const a = Math.atan2(my - drag.y0, mx - drag.x0);
            g.lineTo(drag.x0 + Math.cos(a) * v * 1.5, drag.y0 + Math.sin(a) * v * 1.5); g.stroke();
            g.setLineDash([]);
          }
          // HUD
          const livesStr = 'x' + Math.max(0, lives);
          if (flip) {
            D.hud(g, [`WAVE ${wave}/${FLIP_WAVES}  ${Math.ceil(WAVE_LEN - waveT)}s`, `ROCK SIZE ${size}`, `SHIP ${livesStr}`]);
            const e = energy / maxEnergy();
            g.fillStyle = '#222'; g.fillRect(250, 30, 300, 6);
            g.fillStyle = '#3ee6ff'; g.fillRect(250, 30, 300 * e, 6);
            D.text(g, `ENERGY ${energy.toFixed(1)}`, W / 2, 42, 9, '#3ee6ff', 'center');
          } else {
            D.hud(g, [`WAVE ${wave}/${CLASSIC_WAVES}`, `SCORE ${score}`, `SHIPS ${livesStr}`]);
          }
          if (banner > 0) D.text(g, bannerText, W / 2, H / 2 - 60, 20, '#3ee6ff', 'center');
          if (msgT > 0) D.text(g, msg, W / 2, H - 40, 11, '#ffd23e', 'center');
        },
      };
    },
  });
})();
