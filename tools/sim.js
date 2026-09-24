// Headless harness: loads the cabinet + canvas games in Node and runs matches with a
// stand-in "human" so we can measure how the computer players do.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.window = global;
global.performance = global.performance || { now: () => Date.now() };
const load = (f) => eval(fs.readFileSync(path.join(ROOT, f), 'utf8'));
load('js/cabinet.js');
for (const g of ['snake', 'breakout', 'splat', 'asteroids', 'missile', 'pong']) load(`js/games/${g}.js`);

// A 2D context that swallows every call.
const ctx = new Proxy({}, {
  get: (t, k) => (k in t ? t[k] : (k === 'createLinearGradient' ? () => ({ addColorStop() {} }) : () => {})),
  set: (t, k, v) => { t[k] = v; return true; },
});

function run(id, mode, seconds, human) {
  const game = Cab.games.find((g) => g.id === id);
  let result = null;
  const api = {
    W: 800, H: 600, U: Cab.U, D: Cab.D, keys: new Set(), mouse: { x: 400, y: 300, down: false, inside: true },
    mode, color: '#fff', end: (r) => { if (!result) result = r; }, setHelp() {}, isEnded: () => !!result,
  };
  const inst = game.create(api);
  let t = 0;
  for (; t < seconds && !result; t += 1 / 60) {
    if (human) human(api, inst, t);
    inst.update(1 / 60);
    if (Math.round(t * 60) % 30 === 0) inst.draw(ctx);
  }
  return { t: +t.toFixed(1), result: result ? `${result.win} | ${result.title} | ${String(result.text).replace(/<[^>]+>/g, '')}` : 'timeout' };
}

const which = process.argv[2] || 'all';
const N = +(process.argv[3] || 5);
const R = Cab.U;
function fold(x, lo, hi) { const span = hi - lo; let m = R.wrap(x - lo, 2 * span); if (m > span) m = 2 * span - m; return lo + m; }

const tests = {
  // Flip: a random-ish human places apples by clicking reachable cells.
  snake_flip: () => run('snake', 'flip', 900, (api, inst, t) => {
    if (Math.random() < 0.02) inst.pointer('down', R.rand(0, 800), R.rand(25, 600));
  }),
  // Trapper: drops apples in cells boxed in by walls/body, preferring far from the head.
  snake_flip_trap: () => run('snake', 'flip', 900, (api, inst, t) => {
    const s = inst._dbg();
    if (s.apple || Math.random() > 0.1) return;
    const occ = new Set(s.snake.map((p) => p.x + ',' + p.y));
    const h = s.snake[0];
    let best = null, bestScore = -1;
    for (let k = 0; k < 250; k++) {
      const x = R.randi(0, 31), y = R.randi(0, 22);
      if (occ.has(x + ',' + y)) continue;
      let walls = 0;
      for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) { const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx > 31 || ny > 22 || occ.has(nx + ',' + ny)) walls++; }
      const score = walls * 10 + (Math.abs(x - h.x) + Math.abs(y - h.y)) / 4;
      if (walls >= 2 && score > bestScore) { bestScore = score; best = { x, y }; }
    }
    if (best) inst.pointer('down', best.x * 25 + 12, 25 + best.y * 25 + 12);
  }),
  snake_classic: () => run('snake', 'classic', 60),
  // Flip: the human wiggles the mouse to pick gap heights.
  splat_flip: () => run('splat', 'flip', 600, (api, inst, t) => {
    api.mouse.y = 300 + Math.sin(t * 1.7) * 260 * Math.sign(Math.sin(t * 0.37));
  }),
  splat_flip_nasty: () => run('splat', 'flip', 600, (api, inst, t) => {
    api.mouse.y = Math.floor(t / 1.2) % 2 ? 0 : 600; // always pick the extreme of the bracket
  }),
  splat_flip_lazy: () => run('splat', 'flip', 600, (api) => { api.mouse.y = 300; }),
  splat_flip_random: () => run('splat', 'flip', 600, (api, inst, t) => { if (Math.random() < 0.01) api.mouse.y = R.rand(0, 600); }),
  splat_classic: () => run('splat', 'classic', 30),
  asteroids_flip: () => run('asteroids', 'flip', 400, (api, inst, t) => {
    if (Math.random() < 0.012) {
      const edge = R.randi(0, 3);
      const x = edge === 0 ? 10 : edge === 1 ? 790 : R.rand(0, 800);
      const y = edge === 2 ? 10 : edge === 3 ? 590 : R.rand(0, 600);
      inst.key('Digit' + R.randi(1, 3));
      inst.pointer('down', x, y);
      inst.pointer('up', 400 + R.rand(-150, 150), 300 + R.rand(-150, 150));
    }
  }),
  // Aims each rock at the ship, full speed, whenever it can afford a large one.
  asteroids_flip_aimed: () => run('asteroids', 'flip', 400, (api, inst, t) => {
    const d = inst._dbg();
    if (d.energy >= 3 && Math.random() < 0.05) {
      const edge = R.randi(0, 3);
      const x = edge === 0 ? 10 : edge === 1 ? 790 : R.rand(0, 800);
      const y = edge === 2 ? 10 : edge === 3 ? 590 : R.rand(0, 600);
      if (Math.hypot(x - d.ship.x, y - d.ship.y) < 180) return;
      inst.key('Digit3');
      inst.pointer('down', x, y);
      const a = Math.atan2(d.ship.y - y, d.ship.x - x);
      inst.pointer('up', x + Math.cos(a) * 300, y + Math.sin(a) * 300);
    }
  }),
  asteroids_classic: () => run('asteroids', 'classic', 60),
  missile_flip: () => run('missile', 'flip', 600, (api, inst, t) => {
    if (Math.random() < 0.03) {
      const x = [150, 225, 300, 500, 575, 650, 50, 400, 750][R.randi(0, 8)];
      const split = Math.random() < 0.3;
      if (split) api.keys.add('ShiftLeft');
      inst.pointer('down', R.rand(0, 800), 20);
      inst.pointer('up', x, 560, { shiftKey: split });
      api.keys.delete('ShiftLeft');
    }
  }),
  // Focus fire: salvo at one living city at a time from spread-out launch points.
  missile_flip_focus: () => run('missile', 'flip', 600, (api, inst, t) => {
    const d = inst._dbg();
    if (d.state !== 'play' || d.budget <= 0 || Math.random() > 0.08) return;
    const alive = d.cities.filter((c) => c.alive);
    if (!alive.length) return;
    const c = alive[0];
    const split = d.budget >= 3 && Math.random() < 0.35;
    if (split) api.keys.add('ShiftLeft');
    inst.pointer('down', R.rand(0, 800), 20);
    inst.pointer('up', c.x, 560, { shiftKey: split });
    api.keys.delete('ShiftLeft');
  }),
  missile_classic: () => run('missile', 'classic', 60),
  pong_flip: () => run('pong', 'flip', 600, (api, inst, t) => {
    api.keys.clear();
    // naive bender: randomly holds a direction for a while
    const ph = Math.floor(t * 1.3);
    if (ph % 3 === 1) api.keys.add('ArrowUp'); else if (ph % 3 === 2) api.keys.add('ArrowDown');
  }),
  // Late bender: when the ball nears a paddle, curve it away from that paddle.
  pong_flip_smart: () => run('pong', 'flip', 600, (api, inst, t) => {
    api.keys.clear();
    const { ball, L, R: Rp } = inst._dbg();
    const p = ball.vx < 0 ? L : Rp;
    const distX = ball.vx < 0 ? ball.x - 46 : 754 - ball.x;
    if (distX < 230 && distX > 20) api.keys.add(ball.y < p.y ? 'ArrowUp' : 'ArrowDown');
  }),
  pong_classic: () => run('pong', 'classic', 600),
  breakout_flip: () => run('breakout', 'flip', 900, (api, inst, t) => { if (Math.random() < 0.01) inst.key('Space'); }),
  // Stand-in human: follows the ball ~0.15 s late with a little wobble.
  breakout_flip_human: (() => { let hist = []; return () => { hist = []; return run('breakout', 'flip', 900, (api, inst, t) => {
    const { you } = inst._dbg();
    hist.push(you.ball.x); if (hist.length > 9) hist.shift();
    api.mouse.x = (hist[0] + Math.sin(t * 3) * 12) * 800 / 390;
    if (you.ball.stuck && Math.random() < 0.02) inst.key('Space');
  }); }; })(),
  pong_classic_human: (() => { let hist = []; return () => { hist = []; return run('pong', 'classic', 900, (api, inst, t) => {
    const { ball } = inst._dbg();
    hist.push(ball.y); if (hist.length > 9) hist.shift();
    api.mouse.y = hist[0] + Math.sin(t * 2) * 20;
    if (t < 0.02) inst.pointer('move', 0, 0);
  }); }; })(),
  breakout_flip_predict: (() => { return () => { let tgt = 195, next = 0, err = 0; return run('breakout', 'flip', 900, (api, inst, t) => {
    const { you } = inst._dbg(); const b = you.ball;
    if (t >= next) {
      next = t + 0.18;
      if (b.vy > 0) { const tt = (560 - 7 - b.y) / b.vy; tgt = fold(b.x + b.vx * tt, 7, 383) + err; }
      else { err = R.gauss(18); }
    }
    api.mouse.x = tgt * 800 / 390;
    if (b.stuck && Math.random() < 0.02) inst.key('Space');
  }); }; })(),
  pong_classic_predict: () => { let tgt = 300, next = 0, err = 0; return run('pong', 'classic', 900, (api, inst, t) => {
    const { ball } = inst._dbg();
    if (t < 0.02) inst.pointer('move', 0, 0);
    if (t >= next) {
      next = t + 0.18;
      if (ball.vx < 0) { const tt = (54 - ball.x) / ball.vx; tgt = fold(ball.y + ball.vy * tt, 44, 582) + err; }
      else err = R.gauss(22);
    }
    api.mouse.y = tgt;
  }); },
  breakout_classic: () => run('breakout', 'classic', 60),
};

for (const [name, fn] of Object.entries(tests)) {
  if (which !== 'all' && !name.startsWith(which)) continue;
  const reps = name.includes('classic') ? 1 : N;
  for (let i = 0; i < reps; i++) {
    try { const r = fn(); console.log(name.padEnd(18), String(r.t).padStart(6) + 's', r.result); }
    catch (e) { console.log(name, 'ERROR', e.stack.split('\n').slice(0, 4).join(' / ')); break; }
  }
}
