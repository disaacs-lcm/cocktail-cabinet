/* Pong (our seventh game).
 * Classic: you play the left paddle against a computer paddle.
 * Flip ("Ball Bender"): the computer plays BOTH paddles; you control the ball's curve with
 *   a limited spin meter. Bend it past a paddle to score. If the paddles keep up a rally
 *   of 6 returns, they score instead.
 * Computer paddles read the ball like a player: where does it cross my line (with wall
 * bounces)? They play at one steady skill all game. They re-read the ball only every
 * REACTION seconds, misjudge each incoming ball by a random amount, and have a top
 * speed. They cannot see a bend coming.
 * The ball speeds up steadily (a little per hit and a little per second) up to MAX_SPEED.
 */
(function () {
  'use strict';
  const { U, D, W, H } = Cab;
  const PW = 12, PH = 90, PX = 34, BR = 8, TOP = 36, BOT = H - 24;
  const TO = 7, RALLY_HOLD = 6;
  const START_SPEED = 330, MAX_SPEED = 820;
  const SPEED_PER_HIT = 14, SPEED_PER_SEC = 6;     // ~30 returns from serve speed to the cap
  // Ball Bender limits: how hard and how long you can curve, and the no-bend zone in
  // front of each paddle (so you can't bend the ball at the last instant).
  const BEND_ACCEL = 950, BEND_DRAIN = 1.0, BEND_REFILL = 0.25, BEND_CAP = 1.0, NO_BEND = 110;
  // Autopilot only (Node balance runs): a typical human paddle is modelled by cpuPaddle
  // at this skill; a human bender starts curving once the ball is past the no-bend zone,
  // away from the paddle it's heading toward, after a short reaction.
  const HUMAN_MODEL = { skill: 0.55, readError: 40, bendReach: 260, bendReaction: 0.15 };
  // Computer paddle settings per mode (see cpuPaddle).
  const CPU = {
    classic: { skill: 0.55, readError: 40 },
    flip:    { skill: 0.37, readError: 52 },
  };

  function fold(y, lo, hi) {
    const span = hi - lo;
    let m = U.wrap(y - lo, 2 * span);
    if (m > span) m = 2 * span - m;
    return lo + m;
  }

  // skill 0..1 sets reaction time and paddle speed; readError is how badly it misjudges
  // each ball at skill 0 (px, one standard deviation).
  function cpuPaddle(side, readError) {
    let think = 0, target = (TOP + BOT) / 2, wasComing = false, misread = 0, aimOff = 0;
    return {
      update(p, ball, skill, dt) {
        const coming = side === 'left' ? ball.vx < 0 : ball.vx > 0;
        // (reaction: the paddle only re-reads the ball every `think` seconds)
        if (coming && !wasComing) {
          // One read per incoming ball, the way a player commits: a misjudgement that
          // doesn't vanish as the ball arrives, plus an off-centre hit to angle the return.
          misread = U.gauss((1 - skill) * readError + Math.max(0, ball.speed - 560) * 0.06); // fast balls are harder to read
          aimOff = U.rand(-0.3, 0.3) * PH * skill;
        }
        wasComing = coming;
        if ((think -= dt) <= 0) {
          think = U.lerp(0.24, 0.08, skill) + U.rand(0, 0.04);
          if (coming) {
            const lineX = side === 'left' ? PX + PW + BR : W - PX - PW - BR;
            const t = (lineX - ball.x) / ball.vx;
            const y = fold(ball.y + ball.vy * t, TOP + BR, BOT - BR);
            target = y + misread + aimOff;
          } else {
            target = U.lerp((TOP + BOT) / 2, ball.y, 0.3);
          }
        }
        const maxV = U.lerp(340, 680, skill);
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
        cpu: 'plays the right paddle',
        win: `First to ${TO} points.`,
        intro: [
          'W/S or ↑/↓, or move the mouse. Where the ball hits your paddle sets its angle.',
          'The ball speeds up a little with every hit (watch the SPEED gauge). Long rallies get fast.',
          'Hit with the edge of your paddle for a sharp angle the computer may misjudge.',
        ],
        help: 'W/S · ↑/↓ · mouse · P pauses',
      },
      {
        id: 'flip', name: 'Ball Bender',
        you: 'curve the ball',
        cpu: 'plays both paddles',
        win: `Get the ball past a paddle ${TO} times before the paddles hold ${TO} rallies.`,
        intro: [
          'Hold ↑/↓ (or hold the mouse button above or below the ball) to bend its path. This drains your SPIN meter, which refills slowly.',
          'You can\'t bend inside the shaded zone in front of each paddle, so start your curve early.',
          `Every ${RALLY_HOLD} returns in a row scores a point for the paddles.`,
        ],
        help: 'Hold ↑/↓ or hold the mouse to bend · P pauses',
      },
    ],

    create(api) {
      const flip = api.mode === 'flip';
      const L = { y: (TOP + BOT) / 2 }, R = { y: (TOP + BOT) / 2 };
      const cfg = flip ? CPU.flip : CPU.classic;
      const auto = api.autopilot;
      const cpuL = cpuPaddle('left', flip ? cfg.readError : HUMAN_MODEL.readError), cpuR = cpuPaddle('right', cfg.readError);
      // ?level=N serves N-1 steps faster (+80 px/s each) to test fast rallies
      const serveSpeed = Math.min(START_SPEED + (api.level - 1) * 80, MAX_SPEED);
      let bendWait = 0;
      const ball = { x: W / 2, y: (TOP + BOT) / 2, vx: 0, vy: 0, speed: 0 };
      let you = 0, cpu = 0, serveT = 1.2, rally = 0, meter = 1, bending = 0, useMouse = false;
      let flash = '', flashT = 0;
      const skill = () => cfg.skill;   // steady all game: no easy start, no unbeatable finish

      function serve(dir) {
        ball.x = W / 2; ball.y = U.rand(TOP + 80, BOT - 80);
        ball.speed = serveSpeed;
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
        Cab.sfx(humanScored ? 'score' : 'point');
        serveT = 1;
        ball.vx = ball.vy = 0;
        ball.x = W / 2;
      }

      function bounce(p, dir) {
        const off = U.clamp((ball.y - p.y) / (PH / 2), -1, 1);
        ball.speed = Math.min(ball.speed + SPEED_PER_HIT, MAX_SPEED);
        const a = off * 0.95;
        ball.vx = Math.cos(a) * ball.speed * dir; ball.vy = Math.sin(a) * ball.speed;
        rally++;
        Cab.sfx('bounce');
      }

      // Re-aim the ball's velocity at its current speed, keeping its direction.
      function setSpeed(v) {
        const cur = Math.hypot(ball.vx, ball.vy) || 1;
        ball.speed = v;
        ball.vx *= v / cur; ball.vy *= v / cur;
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
          else if (auto) cpuL.update(L, ball, HUMAN_MODEL.skill, dt);
          else {
            const up = api.keys.has('KeyW') || api.keys.has('ArrowUp');
            const dn = api.keys.has('KeyS') || api.keys.has('ArrowDown');
            if (up || dn) { useMouse = false; L.y += (dn ? 1 : -1) * 520 * dt; }
            else if (useMouse) L.y += U.clamp(api.mouse.y - L.y, -900 * dt, 900 * dt);
            L.y = U.clamp(L.y, TOP + PH / 2, BOT - PH / 2);
          }
          cpuR.update(R, ball, s, dt);

          // --- gradual speed-up during a rally
          setSpeed(Math.min(ball.speed + SPEED_PER_SEC * dt, MAX_SPEED));

          // --- bending (flip)
          bending = 0;
          if (flip) {
            let want = 0;
            if (api.keys.has('ArrowUp') || api.keys.has('KeyW')) want = -1;
            else if (api.keys.has('ArrowDown') || api.keys.has('KeyS')) want = 1;
            else if (api.mouse.down) want = api.mouse.y < ball.y - 10 ? -1 : api.mouse.y > ball.y + 10 ? 1 : 0;
            if (auto) {
              // bend away from the paddle the ball is heading toward, once inside reach
              const p = ball.vx < 0 ? L : R;
              const dist = ball.vx < 0 ? ball.x - (PX + PW) : (W - PX - PW) - ball.x;
              const inReach = dist > NO_BEND && dist < NO_BEND + HUMAN_MODEL.bendReach;
              bendWait = inReach ? bendWait + dt : 0;
              want = inReach && bendWait > HUMAN_MODEL.bendReaction ? (ball.y < p.y ? -1 : 1) : 0;
            }
            const inZone = ball.x < PX + PW + NO_BEND || ball.x > W - PX - PW - NO_BEND;
            if (want && meter > 0 && !inZone) {
              bending = want;
              ball.vy += bending * BEND_ACCEL * dt;
              meter = Math.max(0, meter - dt * BEND_DRAIN);
              const cap = Math.abs(ball.vx) * BEND_CAP;
              ball.vy = U.clamp(ball.vy, -cap, cap);
            } else if (!want) {
              meter = Math.min(1, meter + dt * BEND_REFILL);
            }
          }

          // --- ball
          const n = Math.ceil((Math.hypot(ball.vx, ball.vy) * dt) / 5);
          for (let i = 0; i < n; i++) {
            ball.x += (ball.vx * dt) / n; ball.y += (ball.vy * dt) / n;
            if (ball.y < TOP + BR) { ball.y = TOP + BR; ball.vy = Math.abs(ball.vy); Cab.sfx('tick'); }
            if (ball.y > BOT - BR) { ball.y = BOT - BR; ball.vy = -Math.abs(ball.vy); Cab.sfx('tick'); }
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
          if (flip) {
            // the no-bend zones
            g.fillStyle = '#ff5d6c14';
            g.fillRect(0, TOP, PX + PW + NO_BEND, BOT - TOP);
            g.fillRect(W - PX - PW - NO_BEND, TOP, PX + PW + NO_BEND, BOT - TOP);
          }
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
            D.text(g, 'SPIN', W / 2 - 108, 25, 8, '#ffd23e', 'right');
            g.fillStyle = '#222'; g.fillRect(W / 2 - 100, 26, 200, 5);
            g.fillStyle = meter > 0.2 ? '#ffd23e' : '#ff5d6c'; g.fillRect(W / 2 - 100, 26, 200 * meter, 5);
          } else {
            D.hud(g, [`YOU ${you}`, `FIRST TO ${TO}`, `CPU ${cpu}`]);
          }
          D.testTag(g, api.level);
          // speed gauge, bottom centre
          const sf = (ball.speed - START_SPEED) / (MAX_SPEED - START_SPEED);
          D.text(g, 'SPEED', W / 2 - 68, H - 6 - 8, 8, '#9c97bd', 'right');
          g.fillStyle = '#222'; g.fillRect(W / 2 - 60, H - 14, 120, 5);
          g.fillStyle = sf > 0.75 ? '#ff5d6c' : '#8d7bff'; g.fillRect(W / 2 - 60, H - 14, 120 * U.clamp(sf, 0, 1), 5);
          if (flashT > 0) D.text(g, flash, W / 2, H / 2 - 10, 14, '#ffd23e', 'center');
        },
      };
    },
  });
})();
