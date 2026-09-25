/* Splat (a Flappy-style game).
 * Classic: you flap; the computer lays out the columns.
 * Flip:    you lay out each column's gap; the computer flaps through.
 * Either way, every gap is placed within what the physics can actually reach (computed
 * by simulating the bird), so no layout is impossible. The course tightens as it goes:
 * narrower gaps, faster scrolling, bigger jumps between gaps.
 * The computer flapper only presses "flap". It sees the world ~67 ms late (a human-ish
 * reaction time) and misjudges its aim slightly, so tight courses can beat it.
 */
(function () {
  'use strict';
  const { U, D, W, H } = Cab;
  const G = 1500, FLAP = -440, BX = 180, BR = 13;
  const CW = 70, SPACING = 270, GROUND = H - 40, CEIL = 34;
  const GOAL = 40;
  const REACTION_FRAMES = 4, FLAP_COOLDOWN = 0.1;

  // How far can the bird climb in t seconds if it flaps at every peak?
  function climb(t) {
    let y = 0, vy = 0, best = 0;
    for (let s = 0; s < t; s += 1 / 60) {
      if (vy >= 0) vy = FLAP;
      vy += G / 60; y += vy / 60;
      best = Math.min(best, y);
    }
    return -y;
  }

  function course(passed) {
    const k = Math.min(passed / 30, 1);             // 0 -> 1 over 30 columns
    return {
      speed: U.lerp(170, 290, k),
      gap: U.lerp(185, 122, k),
      reach: U.lerp(0.45, 1, k),                     // fraction of the physical limit allowed
    };
  }

  // The legal range for the next gap centre given the previous one.
  function allowedRange(prevY, passed) {
    const c = course(passed);
    const t = (SPACING - CW - BR * 2) / c.speed;
    const up = (climb(t) * 0.8 + c.gap * 0.3) * c.reach;
    const down = up * 1.3;
    const lo = Math.max(CEIL + c.gap / 2 + 16, prevY - up);
    const hi = Math.min(GROUND - c.gap / 2 - 16, prevY + down);
    return { lo, hi, gap: c.gap };
  }

  function circleRect(cx, cy, r, x, y, w, h) {
    const nx = U.clamp(cx, x, x + w), ny = U.clamp(cy, y, y + h);
    return (cx - nx) ** 2 + (cy - ny) ** 2 < r * r;
  }

  // ---------------------------------------------------------------- computer flapper
  // A look-ahead player. Each frame it takes what it saw REACTION_FRAMES ago, projects that
  // to the present, and simulates the real physics for 0.7 s twice: "flap now" versus
  // "wait", each followed by its normal habit (flap once you sink below your aim point).
  // It chooses the option that keeps the most clearance from pipes and ground.
  // Its flaws: reaction lag, misjudging each gap by a few pixels, and occasional
  // hesitation. Tight gaps after big swings at speed are where those flaws bite.
  function aiFlapper(skill) {
    const history = [];
    const misjudge = new WeakMap();   // column -> how many px off its read of that gap is
    let cooldown = 0;
    const HORIZON = 42;               // frames (0.7 s)

    function rollout(y, vy, cd, cols, speed, flapNow) {
      if (flapNow) { vy = FLAP; cd = FLAP_COOLDOWN; }
      let margin = 60;
      const xs = cols.map((c) => c.x);
      for (let f = 0; f < HORIZON; f++) {
        const next = cols.find((c, i) => xs[i] + CW > BX - BR);
        const aim = next ? next.aim : H / 2;
        if (f > 0 && cd <= 0 && y > aim && vy > -30) { vy = FLAP; cd = FLAP_COOLDOWN; }
        vy += G / 60; y += vy / 60; cd -= 1 / 60;
        if (y < CEIL + BR) { y = CEIL + BR; vy = Math.max(0, vy); }
        if (y + BR >= GROUND) return f - HORIZON - 1;    // crashing later beats crashing sooner
        for (let i = 0; i < cols.length; i++) {
          xs[i] -= speed / 60;
          if (xs[i] > BX + BR || xs[i] + CW < BX - BR) continue;
          const m = Math.min(y - BR - cols[i].top, cols[i].bot - (y + BR));
          if (m < 0) return f - HORIZON - 1;
          margin = Math.min(margin, m);
        }
      }
      return margin;
    }

    return {
      decide(world, dt) {
        history.push({
          y: world.bird.y, vy: world.bird.vy, speed: world.speed,
          cols: world.columns.map((c) => {
            if (!misjudge.has(c)) misjudge.set(c, U.gauss(U.lerp(9, 4, skill)));
            const e = misjudge.get(c);
            return { x: c.x, top: c.gapY - c.gap / 2 + e, bot: c.gapY + c.gap / 2 + e, aim: c.gapY + c.gap * 0.22 + e };
          }),
        });
        if (history.length > REACTION_FRAMES + 1) history.shift();
        cooldown -= dt;
        if (history.length <= REACTION_FRAMES || cooldown > 0) return false;
        if (Math.random() < U.lerp(0.14, 0.05, skill)) return false;   // a moment's hesitation
        // Project the stale view forward to "now" using the physics it knows.
        const seen = history[0], lag = REACTION_FRAMES / 60;
        let y = seen.y, vy = seen.vy;
        for (let i = 0; i < REACTION_FRAMES; i++) { vy += G / 60; y += vy / 60; }
        const cols = seen.cols.map((c) => ({ ...c, x: c.x - seen.speed * lag }));
        const wait = rollout(y, vy, cooldown, cols, seen.speed, false);
        const flap = rollout(y, vy, cooldown, cols, seen.speed, true);
        // Default to its habit; override only when the look-ahead clearly disagrees.
        const next = cols.find((c) => c.x + CW > BX - BR);
        const habit = y > (next ? next.aim : H / 2) && vy > -30;
        const go = habit ? !(wait > flap + 3) : wait < 0 ? flap > wait : flap > wait + 3;
        if (go) cooldown = FLAP_COOLDOWN;
        return go;
      },
    };
  }

  // ---------------------------------------------------------------- game
  Cab.register({
    id: 'splat',
    name: 'Splat',
    color: '#ffd23e',
    blurb: 'Flap through the gaps without going splat. Or design the gauntlet and watch the computer try to thread it.',
    modes: [
      {
        id: 'classic', name: 'Classic',
        you: 'flap the bird',
        cpu: 'lays out the columns',
        intro: [
          'Space, ↑ or click to flap.',
          `Pass ${GOAL} columns to win. Gaps narrow, and the course speeds up and swings harder as you go.`,
        ],
        help: 'Space / ↑ / click to flap · P pauses',
      },
      {
        id: 'flip', name: 'Flipped',
        you: 'lay out the columns',
        cpu: 'flaps the bird',
        intro: [
          'Move the mouse (or ↑/↓) to set the next gap. It locks when the column enters.',
          'The gap must stay inside the bracket: what a bird can physically reach.',
          `Splat the bird before it clears ${GOAL} columns. Your bracket widens and the gaps narrow as it goes.`,
        ],
        help: 'Mouse / ↑↓ positions the next gap · P pauses',
      },
    ],

    create(api) {
      const flip = api.mode === 'flip';
      const bird = { y: H / 2 - 40, vy: 0, rot: 0 };
      const columns = [];
      const ai = flip ? aiFlapper(0.35) : null;
      let passed = 0, started = !!flip, dead = false, deadT = 0, t = 0;
      let lastGapY = H / 2 - 20, nextX = W + 60;
      let ghostY = lastGapY, keyGhost = false;
      const particles = [];

      function flap() {
        if (dead) return;
        started = true;
        bird.vy = FLAP;
      }

      function cpuGap(range) {
        // Swing within the allowed range, favouring bigger swings as the course goes on.
        const k = Math.min(passed / 30, 1);
        const mid = (range.lo + range.hi) / 2;
        const far = Math.random() < 0.5 ? range.lo : range.hi;
        return U.clamp(U.lerp(mid, far, U.rand(0.15, 0.4 + 0.45 * k)) + U.gauss(10), range.lo, range.hi);
      }

      function spawn() {
        const range = allowedRange(lastGapY, passed + columns.length);
        let y;
        if (flip) y = U.clamp(ghostY, range.lo, range.hi);
        else y = columns.length === 0 && passed === 0 ? lastGapY : cpuGap(range);
        columns.push({ x: W, gapY: y, gap: range.gap, passed: false });
        lastGapY = y;
      }

      function splat(why) {
        if (dead) return;
        dead = true;
        for (let i = 0; i < 30; i++) particles.push({ x: BX, y: bird.y, vx: U.rand(-220, 220), vy: U.rand(-300, 80), l: U.rand(0.5, 1.1) });
        if (flip) api.end({ win: true, title: 'Splat! You win', text: `The computer ${why} after ${passed} columns.`, delay: 1100 });
        else api.end({ win: false, title: 'Splat!', text: `You ${why} after ${passed} columns.`, delay: 1100 });
      }

      return {
        _dbg: () => ({ bird, columns }), // read-only view for the test harness
        key(code) {
          if (!flip && (code === 'Space' || code === 'ArrowUp' || code === 'KeyW')) flap();
        },
        pointer(type) {
          if (!flip && type === 'down') flap();
          if (flip && type === 'move') keyGhost = false;
        },
        update(dt) {
          t += dt;
          for (const p of particles) { p.vy += G * dt * 0.6; p.x += p.vx * dt; p.y += p.vy * dt; p.l -= dt; }
          if (dead) { deadT += dt; bird.vy += G * dt; bird.y = Math.min(bird.y + bird.vy * dt, GROUND - BR); return; }
          if (!started) { bird.y = H / 2 - 40 + Math.sin(t * 4) * 8; return; }

          const c = course(passed);
          // Ghost position for the human's next gap.
          if (flip) {
            const up = api.keys.has('ArrowUp') || api.keys.has('KeyW');
            const dn = api.keys.has('ArrowDown') || api.keys.has('KeyS');
            if (up || dn) { keyGhost = true; ghostY += (dn ? 1 : -1) * 320 * dt; }
            else if (!keyGhost && api.mouse.inside) ghostY = api.mouse.y;
            const r = allowedRange(lastGapY, passed + columns.length);
            ghostY = U.clamp(ghostY, r.lo, r.hi);
            if (ai.decide({ bird, columns, speed: c.speed }, dt)) bird.vy = FLAP;
          }

          bird.vy += G * dt;
          bird.y += bird.vy * dt;
          bird.rot = U.clamp(bird.vy / 600, -0.6, 1.2);
          if (bird.y < CEIL + BR) { bird.y = CEIL + BR; bird.vy = Math.max(0, bird.vy); }

          nextX -= c.speed * dt;
          for (const col of columns) col.x -= c.speed * dt;
          if (nextX <= W) { spawn(); nextX += SPACING; }
          while (columns.length && columns[0].x < -CW) columns.shift();

          for (const col of columns) {
            const top = col.gapY - col.gap / 2, bot = col.gapY + col.gap / 2;
            if (circleRect(BX, bird.y, BR - 1, col.x, 0, CW, top) || circleRect(BX, bird.y, BR - 1, col.x, bot, CW, GROUND - bot)) {
              return splat('hit a column');
            }
            if (!col.passed && col.x + CW < BX - BR) {
              col.passed = true;
              passed++;
              if (passed >= GOAL) {
                return flip
                  ? api.end({ win: false, title: 'The bird made it', text: `It threaded all ${GOAL} columns. Big swings right after a narrow gap are its weak spot.` })
                  : api.end({ win: true, title: 'You made it!', text: `All ${GOAL} columns cleared.` });
              }
            }
          }
          if (bird.y + BR >= GROUND) splat('hit the ground');
        },
        draw(g) {
          const sky = g.createLinearGradient(0, 0, 0, H);
          sky.addColorStop(0, '#120c2c'); sky.addColorStop(1, '#2a1438');
          g.fillStyle = sky; g.fillRect(0, 0, W, H);
          // city silhouette parallax
          g.fillStyle = '#1b1336';
          for (let i = 0; i < 14; i++) {
            const x = U.wrap(i * 70 - t * 20, W + 70) - 70;
            const h = 40 + ((i * 53) % 90);
            g.fillRect(x, GROUND - h, 56, h);
          }
          // columns
          for (const col of columns) drawColumn(g, col.x, col.gapY, col.gap, '#ffd23e', 1);
          // ghost + bracket for the human designer
          if (flip && !dead) {
            const r = allowedRange(lastGapY, passed + columns.length);
            g.fillStyle = '#3ee6ff22';
            g.fillRect(W - 26, r.lo - r.gap / 2, 22, r.hi - r.lo + r.gap);
            g.strokeStyle = '#3ee6ff';
            g.strokeRect(W - 26.5, r.lo - 0.5, 22, r.hi - r.lo + 1);
            const into = U.clamp((W - nextX + SPACING) / SPACING, 0, 1);
            drawColumn(g, W - 26, ghostY, r.gap, '#3ee6ff', 0.35 + 0.4 * into, 22);
          }
          // ground
          g.fillStyle = '#35204f'; g.fillRect(0, GROUND, W, H - GROUND);
          g.fillStyle = '#ffd23e44';
          for (let x = -U.wrap(t * course(passed).speed, 40); x < W; x += 40) g.fillRect(x, GROUND, 20, 4);
          // bird
          if (!dead || deadT < 0.1) {
            g.save();
            g.translate(BX, bird.y); g.rotate(bird.rot);
            D.glow(g, '#ffd23e', 14);
            g.fillStyle = '#ffd23e';
            g.beginPath(); g.arc(0, 0, BR, 0, Math.PI * 2); g.fill();
            g.shadowBlur = 0;
            g.fillStyle = '#ff8a3d';
            g.beginPath(); g.moveTo(BR - 2, -2); g.lineTo(BR + 9, 2); g.lineTo(BR - 2, 6); g.fill();
            g.fillStyle = '#fff'; g.beginPath(); g.arc(5, -5, 4, 0, Math.PI * 2); g.fill();
            g.fillStyle = '#000'; g.beginPath(); g.arc(6, -5, 2, 0, Math.PI * 2); g.fill();
            g.fillStyle = '#ffe98a';
            const flapPh = bird.vy < 0 ? -1 : 1;
            g.beginPath(); g.ellipse(-4, 2, 8, 4 + flapPh * 2, -0.3 * flapPh, 0, Math.PI * 2); g.fill();
            g.restore();
          }
          for (const p of particles) if (p.l > 0) { g.fillStyle = '#ffd23e'; g.fillRect(p.x, p.y, 4, 4); }
          g.fillStyle = '#0d0b18cc'; g.fillRect(0, 0, W, CEIL - 4);
          const cc = course(passed);
          D.hud(g, [`COLUMNS ${passed}/${GOAL}`, `GAP ${cc.gap | 0}px`, `SPEED ${cc.speed | 0}`]);
          if (!started) D.text(g, 'SPACE OR CLICK TO FLAP', W / 2, H / 2 + 30, 14, '#ffd23e', 'center');
        },
      };
    },
  });

  function drawColumn(g, x, gapY, gap, color, alpha, w = CW) {
    const top = gapY - gap / 2, bot = gapY + gap / 2;
    g.save();
    g.globalAlpha = alpha;
    g.fillStyle = color + '33';
    g.strokeStyle = color;
    g.lineWidth = 2;
    g.fillRect(x, 0, w, top); g.strokeRect(x + 1, -2, w - 2, top + 1);
    g.fillRect(x, bot, w, GROUND - bot); g.strokeRect(x + 1, bot, w - 2, GROUND - bot + 2);
    g.fillStyle = color;
    g.fillRect(x - 4, top - 12, w + 8, 12);
    g.fillRect(x - 4, bot, w + 8, 12);
    g.restore();
  }
})();
