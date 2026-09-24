/* Breakout.
 * Classic: you work the paddle through five walls; the computer builds each wall.
 * Flip (versus): you and the computer each get a wall, side by side. Every 4 bricks you
 *   break pushes a new row down onto your opponent's wall. First to clear their wall wins
 *   the round; lose all balls or let bricks reach the danger line and you lose it.
 *   Best of five. The computer paddle has the same speed cap, predicts the ball the way a
 *   player would, and gets sharper each round.
 */
(function () {
  'use strict';
  const { U, D, W, H } = Cab;
  const PADDLE_Y = H - 40, TOP = 44, BH = 20, HUMAN_MAX_SPEED = 1100;
  const ROW_COLORS = ['#ff4fa3', '#ff8a3d', '#ffd23e', '#5dff9b', '#3ee6ff', '#8d7bff', '#ff5d6c', '#c0ff3e'];

  class Well {
    constructor(x, w, cols, rows, opts = {}) {
      this.x = x; this.w = w; this.cols = cols; this.bw = w / cols;
      this.rows = [];
      for (let r = 0; r < rows; r++) this.rows.push(this.makeRow(opts.tough && r < 2 ? 2 : 1));
      this.paddle = { cx: x + w / 2, w: opts.paddleW || 90, h: 12 };
      this.baseSpeed = opts.speed || 320;
      this.speed = this.baseSpeed;
      this.lives = opts.lives || 3;
      this.broken = 0;
      this.dangerY = PADDLE_Y - 90;
      this.resetBall();
    }
    makeRow(hp = 1) { return new Array(this.cols).fill(hp); }
    resetBall() {
      this.ball = { x: this.paddle.cx, y: PADDLE_Y - 8, vx: 0, vy: 0, r: 7, stuck: true, stuckT: 0 };
    }
    launch() {
      const b = this.ball;
      if (!b.stuck) return;
      const a = U.rand(-0.5, 0.5);
      b.vx = Math.sin(a) * this.speed; b.vy = -Math.cos(a) * this.speed;
      b.stuck = false;
    }
    bricksLeft() { let n = 0; for (const r of this.rows) for (const v of r) if (v) n++; return n; }
    bottomY() {
      for (let r = this.rows.length - 1; r >= 0; r--) if (this.rows[r].some((v) => v)) return TOP + (r + 1) * BH;
      return TOP;
    }
    pushRow() { this.rows.unshift(this.makeRow(1)); }
    trimEmptyTail() { while (this.rows.length && !this.rows[this.rows.length - 1].some((v) => v)) this.rows.pop(); }

    movePaddle(target, maxSpeed, dt) {
      const p = this.paddle;
      const d = U.clamp(target - p.cx, -maxSpeed * dt, maxSpeed * dt);
      p.cx = U.clamp(p.cx + d, this.x + p.w / 2, this.x + this.w - p.w / 2);
      if (this.ball.stuck) this.ball.x = p.cx;
    }

    // Returns 'lost' if the ball fell out, otherwise the number of bricks broken this step.
    step(dt) {
      const b = this.ball;
      if (b.stuck) { b.stuckT += dt; return 0; }
      let broke = 0;
      const n = Math.ceil((Math.hypot(b.vx, b.vy) * dt) / 4);
      const h = dt / n;
      for (let i = 0; i < n; i++) {
        b.x += b.vx * h; b.y += b.vy * h;
        if (b.x - b.r < this.x) { b.x = this.x + b.r; b.vx = Math.abs(b.vx); }
        if (b.x + b.r > this.x + this.w) { b.x = this.x + this.w - b.r; b.vx = -Math.abs(b.vx); }
        if (b.y - b.r < TOP - 14) { b.y = TOP - 14 + b.r; b.vy = Math.abs(b.vy); }
        // paddle
        const p = this.paddle;
        if (b.vy > 0 && b.y + b.r >= PADDLE_Y && b.y + b.r <= PADDLE_Y + p.h + 6 &&
            b.x >= p.cx - p.w / 2 - b.r && b.x <= p.cx + p.w / 2 + b.r) {
          const off = U.clamp((b.x - p.cx) / (p.w / 2), -1, 1);
          const a = off * 1.05; // up to 60 degrees from vertical
          this.speed = Math.min(this.speed * 1.015, this.baseSpeed * 1.6);
          b.vx = Math.sin(a) * this.speed; b.vy = -Math.cos(a) * this.speed;
          b.y = PADDLE_Y - b.r;
        }
        // bricks
        if (this.hitBrick()) broke++;
        if (b.y - b.r > H) return 'lost';
      }
      return broke;
    }

    hitBrick() {
      const b = this.ball;
      const r0 = Math.floor((b.y - b.r - TOP) / BH), r1 = Math.floor((b.y + b.r - TOP) / BH);
      const c0 = Math.floor((b.x - b.r - this.x) / this.bw), c1 = Math.floor((b.x + b.r - this.x) / this.bw);
      for (let r = Math.max(0, r0); r <= r1 && r < this.rows.length; r++) {
        for (let c = Math.max(0, c0); c <= c1 && c < this.cols; c++) {
          if (!this.rows[r][c]) continue;
          const bx = this.x + c * this.bw, by = TOP + r * BH;
          const ox = Math.min(b.x + b.r - bx, bx + this.bw - (b.x - b.r));
          const oy = Math.min(b.y + b.r - by, by + BH - (b.y - b.r));
          if (ox < oy) { b.vx = b.x < bx + this.bw / 2 ? -Math.abs(b.vx) : Math.abs(b.vx); }
          else { b.vy = b.y < by + BH / 2 ? -Math.abs(b.vy) : Math.abs(b.vy); }
          this.rows[r][c]--;
          if (!this.rows[r][c]) { this.broken++; return true; }
          return false;
        }
      }
      return false;
    }

    draw(g, label, color) {
      g.fillStyle = '#0a0916';
      g.fillRect(this.x, TOP - 14, this.w, H - TOP + 14);
      g.strokeStyle = color + '66';
      g.strokeRect(this.x + 0.5, TOP - 13.5, this.w - 1, H - TOP + 13);
      // danger line
      g.strokeStyle = '#ff5d6c55';
      g.setLineDash([6, 6]);
      g.beginPath(); g.moveTo(this.x, this.dangerY); g.lineTo(this.x + this.w, this.dangerY); g.stroke();
      g.setLineDash([]);
      this.rows.forEach((row, r) => row.forEach((v, c) => {
        if (!v) return;
        g.fillStyle = v > 1 ? '#ffffff' : ROW_COLORS[r % ROW_COLORS.length];
        g.fillRect(this.x + c * this.bw + 1, TOP + r * BH + 1, this.bw - 2, BH - 2);
        if (v > 1) { g.fillStyle = ROW_COLORS[r % ROW_COLORS.length]; g.fillRect(this.x + c * this.bw + 4, TOP + r * BH + 4, this.bw - 8, BH - 8); }
      }));
      const p = this.paddle;
      g.save(); D.glow(g, color, 12);
      g.fillStyle = color;
      g.fillRect(p.cx - p.w / 2, PADDLE_Y, p.w, p.h);
      g.fillStyle = '#fff';
      g.beginPath(); g.arc(this.ball.x, this.ball.y, this.ball.r, 0, Math.PI * 2); g.fill();
      g.restore();
      for (let i = 0; i < this.lives; i++) {
        g.fillStyle = color;
        g.beginPath(); g.arc(this.x + 12 + i * 14, H - 12, 4, 0, Math.PI * 2); g.fill();
      }
      if (label) D.text(g, label, this.x + this.w - 8, H - 18, 10, color, 'right');
    }
  }

  // ---------------------------------------------------------------- controllers
  // Where an unobstructed ball ends up after bouncing between two walls at lo and hi.
  function fold(x, lo, hi) {
    const span = hi - lo;
    let m = U.wrap(x - lo, 2 * span);
    if (m > span) m = 2 * span - m;
    return lo + m;
  }

  function humanController(api, mapX) {
    let lastMouseX = api.mouse.x, useMouse = false;
    return {
      update(well, dt) {
        const left = api.keys.has('ArrowLeft') || api.keys.has('KeyA');
        const right = api.keys.has('ArrowRight') || api.keys.has('KeyD');
        if (api.mouse.x !== lastMouseX) { useMouse = true; lastMouseX = api.mouse.x; }
        if (left || right) {
          useMouse = false;
          well.movePaddle(well.paddle.cx + (right ? 1 : -1) * 1000, 650, dt);
        } else if (useMouse) {
          well.movePaddle(mapX(api.mouse.x), HUMAN_MAX_SPEED, dt);
        }
        if (well.ball.stuck && well.ball.stuckT > 3) well.launch();
      },
    };
  }

  // The computer reads the ball the way a player does: where will it cross my paddle line,
  // bouncing off the side walls? It re-reads only every "reaction" interval, adds aim error,
  // and at higher skill tries to angle the ball toward the side with the most bricks left.
  function cpuController(skill) {
    let think = 0, target = null;
    return {
      skill,
      update(well, dt) {
        const b = well.ball, p = well.paddle;
        if (target === null) target = p.cx;
        if (b.stuck) {
          target = well.x + well.w / 2 + Math.sin(performance.now() / 400) * 30;
          if (b.stuckT > 0.9) well.launch();
        } else if ((think -= dt) <= 0) {
          think = U.lerp(0.34, 0.08, skill) + U.rand(0, 0.06);
          if (b.vy > 0) {
            const t = (PADDLE_Y - b.r - b.y) / b.vy;
            let x = b.x + b.vx * t;
            x = fold(x, well.x + b.r, well.x + well.w - b.r); // account for side-wall bounces
            // Aim: hit off-centre toward the fuller half of the wall.
            let aim = U.rand(-0.35, 0.35);
            if (Math.random() < skill) {
              let leftN = 0, rightN = 0;
              for (const row of well.rows) row.forEach((v, c) => { if (v) (c < well.cols / 2 ? leftN++ : rightN++); });
              aim = (rightN > leftN ? 1 : -1) * U.rand(0.25, 0.6);
            }
            const err = U.gauss((1 - skill) * 38 * Math.min(1, t * 1.5));
            target = x - aim * (p.w / 2) + err;
          } else {
            target = U.lerp(well.x + well.w / 2, b.x, 0.5);
          }
        }
        well.movePaddle(target, U.lerp(520, 900, skill), dt);
      },
    };
  }

  Cab.register({
    id: 'breakout',
    name: 'Breakout',
    color: '#ff8a3d',
    blurb: 'Clear the wall with a bouncing ball. Or race a computer paddle, and every brick you break pushes bricks onto its wall.',
    modes: [
      {
        id: 'classic', name: 'Classic',
        you: 'work the paddle',
        cpu: 'builds five walls, each tougher than the last',
        intro: [
          'Mouse or ←/→ to move. Click or Space to launch.',
          'Where the ball hits the paddle sets its angle.',
          'Clear 5 walls to win. More rows, a faster ball and a smaller paddle every level. White bricks take two hits.',
        ],
        help: 'Mouse or ←/→ · Click / Space launches · P pauses',
      },
      {
        id: 'flip', name: 'Versus',
        you: 'left wall',
        cpu: 'plays the right wall against you',
        intro: [
          'Mouse or ←/→ to move your paddle (left). Click or Space to launch.',
          'Every 4 bricks you break drops a new row onto the computer’s wall, and it does the same to you.',
          'Clear your wall first to win the round. You lose it if you drop 3 balls or your bricks cross the red line.',
          'Best of 5. The computer gets sharper each round.',
        ],
        help: 'Mouse or ←/→ · Click / Space launches · P pauses',
      },
    ],

    create(api) {
      return api.mode === 'flip' ? versus(api) : classic(api);
    },
  });

  function classic(api) {
    let level = 1, well, banner = 0, score = 0;
    const human = humanController(api, (x) => x);
    function build() {
      well = new Well(0, W, 12, Math.min(3 + level, 8), {
        speed: 290 + level * 30, paddleW: Math.max(70, 118 - level * 9), tough: level >= 3,
        lives: well ? well.lives + 1 : 3,
      });
      banner = 1.5;
    }
    build();
    return {
      key(code) { if (code === 'Space') well.launch(); },
      pointer(type) { if (type === 'down') well.launch(); },
      update(dt) {
        if (banner > 0) banner -= dt;
        human.update(well, dt);
        const r = well.step(dt);
        if (r === 'lost') {
          well.lives--;
          if (well.lives <= 0) return api.end({ win: false, title: 'Game over', text: `You reached level ${level} with ${score} bricks.` });
          well.speed = well.baseSpeed;
          well.resetBall();
        } else if (r) {
          score += r;
          if (!well.bricksLeft()) {
            if (level >= 5) return api.end({ win: true, title: 'All five walls down!', text: `${score} bricks broken.` });
            level++;
            build();
          }
        }
      },
      draw(g) {
        D.clear(g);
        well.draw(g, '', '#ff8a3d');
        D.hud(g, [`LEVEL ${level}/5`, `BRICKS ${score}`, `BALLS ${well.lives}`]);
        if (banner > 0) D.text(g, `LEVEL ${level}`, W / 2, H / 2, 22, '#ff8a3d', 'center');
        else if (well.ball.stuck) D.text(g, 'CLICK TO LAUNCH', W / 2, H / 2 + 40, 12, '#9c97bd', 'center');
      },
    };
  }

  function versus(api) {
    const GAP = 20, WW = (W - GAP) / 2;
    let round = 0, wins = { you: 0, cpu: 0 }, you, cpu, humanCtl, cpuCtl, pending = { you: 0, cpu: 0 };
    let banner = 0, bannerText = '', between = false, elapsed = 0;

    function newRound() {
      round++;
      elapsed = 0;
      you = new Well(0, WW, 8, 5, { speed: 300, paddleW: 84 });
      cpu = new Well(WW + GAP, WW, 8, 5, { speed: 300, paddleW: 84 });
      humanCtl = humanController(api, (x) => U.lerp(0, WW, x / W));
      cpuCtl = cpuController(Math.min(0.2 + (round - 1) * 0.17, 0.9));
      pending = { you: 0, cpu: 0 };
      banner = 1.6; bannerText = `ROUND ${round}`; between = false;
    }
    newRound();

    function roundOver(youWon, why) {
      wins[youWon ? 'you' : 'cpu']++;
      between = true;
      bannerText = `${youWon ? 'YOU TAKE' : 'CPU TAKES'} ROUND ${round}`;
      banner = 2.2;
      if (wins.you >= 3 || wins.cpu >= 3) {
        const w = wins.you >= 3;
        api.end({ win: w, title: w ? 'You win the match!' : 'The computer wins', text: `${wins.you}–${wins.cpu}. Last round: ${why}.`, delay: 1500 });
      }
    }

    function stepWell(well, other, key) {
      const r = well.step(1 / 60);
      if (r === 'lost') {
        well.lives--;
        well.speed = well.baseSpeed;
        well.resetBall();
        if (well.lives <= 0) return key === 'you' ? roundOver(false, 'you ran out of balls') : roundOver(true, 'the computer ran out of balls');
      } else if (r) {
        pending[key] += r;
        while (pending[key] >= 4) { pending[key] -= 4; other.pushRow(); }
        if (!well.bricksLeft()) return roundOver(key === 'you', key === 'you' ? 'you cleared your wall' : 'the computer cleared its wall');
      }
      well.trimEmptyTail();
      if (well.bottomY() > well.dangerY) return roundOver(key !== 'you', key === 'you' ? 'your bricks crossed the line' : 'its bricks crossed the line');
    }

    return {
      _dbg: () => ({ you, cpu }), // read-only view for the test harness
      key(code) { if (code === 'Space') you.launch(); },
      pointer(type) { if (type === 'down') you.launch(); },
      update(dt) {
        if (banner > 0) { banner -= dt; if (banner <= 0 && between && !api.isEnded()) newRound(); return; }
        if (between) return;
        elapsed += dt;
        // Both balls speed up the longer a round lasts.
        const base = Math.min(300 + elapsed * 4, 520);
        you.baseSpeed = cpu.baseSpeed = base;
        humanCtl.update(you, dt);
        cpuCtl.update(cpu, dt);
        stepWell(you, cpu, 'you');
        if (!between) stepWell(cpu, you, 'cpu');
      },
      draw(g) {
        D.clear(g);
        you.draw(g, 'YOU', '#3ee6ff');
        cpu.draw(g, 'CPU', '#ff8a3d');
        D.hud(g, [`YOU ${wins.you}`, `ROUND ${round} · FIRST TO 3`, `CPU ${wins.cpu}`]);
        if (banner > 0) {
          g.fillStyle = '#000a'; g.fillRect(0, H / 2 - 30, W, 60);
          D.text(g, bannerText, W / 2, H / 2 - 10, 18, '#ffd23e', 'center');
        } else if (you.ball.stuck) D.text(g, 'CLICK TO LAUNCH', WW / 2, H / 2 + 40, 10, '#9c97bd', 'center');
      },
    };
  }
})();
