/* Pong (our seventh game).
 * Classic: you play the left paddle against a computer paddle that sharpens every point.
 * Flip ("Ball Bender"): the computer plays BOTH paddles; you control the ball's curve with
 *   a limited spin meter. Bend it past a paddle to score. If the paddles keep up a rally
 *   of 6 returns, they score instead. The paddles improve every point.
 * Computer paddles read the ball like a player: where does it cross my line (with wall
 * bounces)? They re-read on a reaction timer, have a speed cap and aim error, and cannot
 * see a bend coming.
 */
(function () {
  'use strict';
  const { U, D, W, H } = Cab;
  const PW = 12, PH = 90, PX = 34, BR = 8, TOP = 36, BOT = H - 10;
  const TO = 7, RALLY_HOLD = 6;

  function fold(y, lo, hi) {
    const span = hi - lo;
    let m = U.wrap(y - lo, 2 * span);
    if (m > span) m = 2 * span - m;
    return lo + m;
  }

  function cpuPaddle(side) {
    let think = 0, target = (TOP + BOT) / 2, wasComing = false, misread = 0, aimOff = 0;
    return {
      update(p, ball, skill, dt) {
        const coming = side === 'left' ? ball.vx < 0 : ball.vx > 0;
        if (coming && !wasComing) {
          // One read per incoming ball, the way a player commits: a misjudgement that
          // doesn't vanish as the ball arrives, plus an off-centre hit to angle the return.
          misread = U.gauss((1 - skill) * 42);
          aimOff = U.rand(-0.3, 0.3) * PH * skill;
        }
        wasComing = coming;
        if ((think -= dt) <= 0) {
          think = U.lerp(0.32, 0.06, skill) + U.rand(0, 0.05);
          if (coming) {
            const lineX = side === 'left' ? PX + PW + BR : W - PX - PW - BR;
            const t = (lineX - ball.x) / ball.vx;
            const y = fold(ball.y + ball.vy * t, TOP + BR, BOT - BR);
            target = y + misread + aimOff;
          } else {
            target = U.lerp((TOP + BOT) / 2, ball.y, 0.3);
          }
        }
        const maxV = U.lerp(260, 640, skill);
        p.y += U.clamp(target - p.y, -maxV * dt, maxV * dt);
        p.y = U.clamp(p.y, TOP + PH / 2, BOT - PH / 2);
      },
    };
  }

  Cab.register({
    id: 'pong',
    name: 'Pong',
    color: '#8d7bff',
    blurb: 'Our pick. Classic paddle duel, plus a flip where you are the ball, curving it past two computer paddles.',
    modes: [
      {
        id: 'classic', name: 'Classic',
        you: 'play the left paddle',
        cpu: 'plays the right paddle, sharper every point',
        intro: [
          'W/S or ↑/↓, or move the mouse. Where the ball hits your paddle sets its angle.',
          `First to ${TO}. The ball speeds up during a rally.`,
        ],
        help: 'W/S · ↑/↓ · mouse · P pauses',
      },
      {
        id: 'flip', name: 'Ball Bender',
        you: 'curve the ball',
        cpu: 'plays both paddles',
        intro: [
          'Hold ↑/↓ (or hold the mouse button above or below the ball) to bend its path. This drains your spin meter.',
          `Get the ball past either paddle to score. A rally of ${RALLY_HOLD} returns scores for the paddles.`,
          `First to ${TO}. The paddles get quicker and smarter every point.`,
        ],
        help: 'Hold ↑/↓ or hold the mouse to bend · P pauses',
      },
    ],

    create(api) {
      const flip = api.mode === 'flip';
      const L = { y: (TOP + BOT) / 2 }, R = { y: (TOP + BOT) / 2 };
      const cpuL = cpuPaddle('left'), cpuR = cpuPaddle('right');
      const ball = { x: W / 2, y: (TOP + BOT) / 2, vx: 0, vy: 0, speed: 0 };
      let you = 0, cpu = 0, serveT = 1.2, rally = 0, meter = 1, bending = 0, useMouse = false;
      let flash = '', flashT = 0;
      const skill = () => (flip ? Math.min(0.2 + (you + cpu) * 0.06, 0.9) : Math.min(0.28 + (you + cpu) * 0.06, 0.9));

      function serve(dir) {
        ball.x = W / 2; ball.y = U.rand(TOP + 80, BOT - 80);
        ball.speed = flip ? 360 + (you + cpu) * 8 : 340;
        const a = U.rand(-0.45, 0.45);
        ball.vx = Math.cos(a) * ball.speed * dir; ball.vy = Math.sin(a) * ball.speed;
        rally = 0;
      }

      function point(humanScored, why) {
        humanScored ? you++ : cpu++;
        flash = why; flashT = 1.2;
        if (you >= TO || cpu >= TO) {
          const w = you >= TO;
          api.end({ win: w, title: w ? 'You win!' : 'The computer wins', text: `${you} – ${cpu}` });
          return;
        }
        serveT = 1;
        ball.vx = ball.vy = 0;
        ball.x = W / 2;
      }

      function bounce(p, dir) {
        const off = U.clamp((ball.y - p.y) / (PH / 2), -1, 1);
        ball.speed = Math.min(ball.speed * 1.04, 760);
        const a = off * 0.95;
        ball.vx = Math.cos(a) * ball.speed * dir; ball.vy = Math.sin(a) * ball.speed;
        rally++;
      }

      return {
        _dbg: () => ({ ball, L, R, you, cpu, rally }), // read-only view for the test harness
        pointer(type) { if (type === 'move') useMouse = true; },
        update(dt) {
          if (flashT > 0) flashT -= dt;
          if (serveT > 0) {
            serveT -= dt;
            if (serveT <= 0) serve(Math.random() < 0.5 ? -1 : 1);
            return;
          }
          const s = skill();
          // --- left paddle
          if (flip) cpuL.update(L, ball, s, dt);
          else {
            const up = api.keys.has('KeyW') || api.keys.has('ArrowUp');
            const dn = api.keys.has('KeyS') || api.keys.has('ArrowDown');
            if (up || dn) { useMouse = false; L.y += (dn ? 1 : -1) * 520 * dt; }
            else if (useMouse) L.y += U.clamp(api.mouse.y - L.y, -900 * dt, 900 * dt);
            L.y = U.clamp(L.y, TOP + PH / 2, BOT - PH / 2);
          }
          cpuR.update(R, ball, s, dt);

          // --- bending (flip)
          bending = 0;
          if (flip) {
            if (api.keys.has('ArrowUp') || api.keys.has('KeyW')) bending = -1;
            else if (api.keys.has('ArrowDown') || api.keys.has('KeyS')) bending = 1;
            else if (api.mouse.down) bending = api.mouse.y < ball.y - 10 ? -1 : api.mouse.y > ball.y + 10 ? 1 : 0;
            if (bending && meter > 0) {
              ball.vy += bending * 1300 * dt;
              meter = Math.max(0, meter - dt * 0.8);
              const cap = Math.abs(ball.vx) * 1.2;
              ball.vy = U.clamp(ball.vy, -cap, cap);
            } else {
              bending = 0;
              meter = Math.min(1, meter + dt * 0.35);
            }
          }

          // --- ball
          const n = Math.ceil((Math.hypot(ball.vx, ball.vy) * dt) / 5);
          for (let i = 0; i < n; i++) {
            ball.x += (ball.vx * dt) / n; ball.y += (ball.vy * dt) / n;
            if (ball.y < TOP + BR) { ball.y = TOP + BR; ball.vy = Math.abs(ball.vy); }
            if (ball.y > BOT - BR) { ball.y = BOT - BR; ball.vy = -Math.abs(ball.vy); }
            if (ball.vx < 0 && ball.x - BR <= PX + PW && ball.x - BR >= PX - 6 && Math.abs(ball.y - L.y) <= PH / 2 + BR) {
              ball.x = PX + PW + BR; bounce(L, 1);
            }
            if (ball.vx > 0 && ball.x + BR >= W - PX - PW && ball.x + BR <= W - PX + 6 && Math.abs(ball.y - R.y) <= PH / 2 + BR) {
              ball.x = W - PX - PW - BR; bounce(R, -1);
            }
          }
          if (flip && rally >= RALLY_HOLD) return point(false, 'PADDLES HELD THE RALLY');
          if (ball.x < -BR) return point(flip, flip ? 'BENT PAST THE LEFT PADDLE!' : 'CPU SCORES');
          if (ball.x > W + BR) return point(true, flip ? 'BENT PAST THE RIGHT PADDLE!' : 'YOU SCORE');
        },
        draw(g) {
          D.clear(g, '#07061a');
          g.strokeStyle = '#8d7bff44';
          g.setLineDash([10, 12]);
          g.beginPath(); g.moveTo(W / 2, TOP); g.lineTo(W / 2, BOT); g.stroke();
          g.setLineDash([]);
          g.fillStyle = '#8d7bff22'; g.fillRect(0, TOP - 4, W, 2); g.fillRect(0, BOT + 2, W, 2);
          D.text(g, String(flip ? cpu : you), W / 2 - 60, 60, 36, '#8d7bff55', 'right');
          D.text(g, String(flip ? you : cpu), W / 2 + 60, 60, 36, '#8d7bff55', 'left');
          g.save(); D.glow(g, '#8d7bff', 14);
          g.fillStyle = flip ? '#ff8a3d' : '#3ee6ff';
          g.fillRect(PX, L.y - PH / 2, PW, PH);
          g.fillStyle = '#ff8a3d';
          g.fillRect(W - PX - PW, R.y - PH / 2, PW, PH);
          g.fillStyle = bending ? '#ffd23e' : '#fff';
          if (bending) D.glow(g, '#ffd23e', 24);
          g.beginPath(); g.arc(ball.x, ball.y, BR, 0, Math.PI * 2); g.fill();
          g.restore();
          if (flip) {
            D.hud(g, [`PADDLES ${cpu}`, `RALLY ${rally}/${RALLY_HOLD}`, `YOU ${you}`]);
            g.fillStyle = '#222'; g.fillRect(W / 2 - 100, 26, 200, 5);
            g.fillStyle = meter > 0.2 ? '#ffd23e' : '#ff5d6c'; g.fillRect(W / 2 - 100, 26, 200 * meter, 5);
          } else {
            D.hud(g, [`YOU ${you}`, `FIRST TO ${TO}`, `CPU ${cpu}`]);
          }
          if (flashT > 0) D.text(g, flash, W / 2, H / 2 - 10, 14, '#ffd23e', 'center');
        },
      };
    },
  });
})();
