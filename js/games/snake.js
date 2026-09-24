/* Snake.
 * Classic: you steer, the computer places apples (more awkward spots as you level up).
 * Flip:    you place apples, the computer steers. It must reach each apple before it
 *          starves, and the time it gets shrinks every apple, so it has to take risks.
 */
(function () {
  'use strict';
  const { U, D, W, H } = Cab;
  const C = 25, GW = 32, GH = 23, OY = 25;       // 32x23 cells under a 25px HUD
  const GROW = 2;                                // segments gained per apple
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const idx = (x, y) => y * GW + x;
  const inb = (x, y) => x >= 0 && y >= 0 && x < GW && y < GH;
  const CLASSIC_GOAL = 40, FLIP_GOAL = 30;

  // ------------------------------------------------------------ grid helpers
  function bodyGrid(snake, tailMoves) {
    const g = new Uint8Array(GW * GH);
    const n = tailMoves ? snake.length - 1 : snake.length;
    for (let i = 0; i < n; i++) g[idx(snake[i].x, snake[i].y)] = 1;
    return g;
  }

  // Shortest path from (sx,sy) to goal. The goal itself may be a blocked cell (used to
  // find a route to our own tail). Returns the list of cells after the start, or null.
  function bfs(sx, sy, blocked, goal) {
    const start = idx(sx, sy), target = idx(goal.x, goal.y);
    const prev = new Int32Array(GW * GH).fill(-1);
    const seen = new Uint8Array(GW * GH);
    const q = [start];
    seen[start] = 1;
    for (let h = 0; h < q.length; h++) {
      const c = q[h];
      if (c === target && c !== start) {
        const path = [];
        for (let k = c; k !== start; k = prev[k]) path.push({ x: k % GW, y: (k / GW) | 0 });
        return path.reverse();
      }
      const x = c % GW, y = (c / GW) | 0;
      for (const [dx, dy] of DIRS) {
        const nx = x + dx, ny = y + dy;
        if (!inb(nx, ny)) continue;
        const n = idx(nx, ny);
        if (seen[n] || (blocked[n] && n !== target)) continue;
        seen[n] = 1; prev[n] = c; q.push(n);
      }
    }
    return null;
  }

  function flood(sx, sy, blocked) {
    const seen = new Uint8Array(GW * GH);
    const q = [idx(sx, sy)];
    seen[q[0]] = 1;
    for (let h = 0; h < q.length; h++) {
      const x = q[h] % GW, y = (q[h] / GW) | 0;
      for (const [dx, dy] of DIRS) {
        const nx = x + dx, ny = y + dy;
        if (!inb(nx, ny)) continue;
        const n = idx(nx, ny);
        if (seen[n] || blocked[n]) continue;
        seen[n] = 1; q.push(n);
      }
    }
    return q; // includes the start cell
  }

  // Move a (virtual or real) snake one cell. Same rule for human and computer.
  function advance(s, cell) {
    s.snake.unshift({ x: cell.x, y: cell.y });
    let ate = false;
    if (s.apple && cell.x === s.apple.x && cell.y === s.apple.y) { s.grow += GROW; ate = true; }
    if (s.grow > 0) s.grow--; else s.snake.pop();
    return ate;
  }

  function legal(s, x, y) {
    if (!inb(x, y)) return false;
    const blocked = bodyGrid(s.snake, s.grow === 0);
    return !blocked[idx(x, y)];
  }

  function cloneState(s) {
    return { snake: s.snake.map((p) => ({ x: p.x, y: p.y })), grow: s.grow, apple: s.apple };
  }

  // ------------------------------------------------------------ snake AI
  // Plan: shortest path to the apple, but only if after eating it can still reach its own
  // tail (i.e. it won't have boxed itself in). If that's unsafe it stalls by chasing its
  // tail, unless hunger forces it to commit to the risky path.
  function tailReachableAfter(s, path) {
    const v = cloneState(s);
    for (const c of path) advance(v, c);
    v.apple = null;
    const head = v.snake[0], tail = v.snake[v.snake.length - 1];
    const blocked = bodyGrid(v.snake, v.grow === 0);
    return !!bfs(head.x, head.y, blocked, tail);
  }

  function neighbours(s) {
    const head = s.snake[0];
    return DIRS.map(([dx, dy]) => ({ x: head.x + dx, y: head.y + dy })).filter((c) => legal(s, c.x, c.y));
  }

  function stallMove(s) {
    let best = null, bestLen = -1;
    for (const c of neighbours(s)) {
      if (s.apple && c.x === s.apple.x && c.y === s.apple.y) continue;
      const v = cloneState(s);
      advance(v, c);
      const tail = v.snake[v.snake.length - 1];
      const p = bfs(c.x, c.y, bodyGrid(v.snake, v.grow === 0), tail);
      if (p && p.length > bestLen) { bestLen = p.length; best = c; }
    }
    if (best) return best;
    // No route to the tail from anywhere: pick the move with the most room.
    let most = -1;
    for (const c of neighbours(s)) {
      const v = cloneState(s);
      advance(v, c);
      const room = flood(c.x, c.y, bodyGrid(v.snake, true)).length;
      if (room > most) { most = room; best = c; }
    }
    return best;
  }

  function aiMove(s) {
    const head = s.snake[0];
    if (s.apple) {
      const path = bfs(head.x, head.y, bodyGrid(s.snake, s.grow === 0), s.apple);
      if (path) {
        const desperate = s.hunger - path.length <= 3;
        if (desperate || tailReachableAfter(s, path)) return path[0];
      }
    }
    return stallMove(s); // may be null => nowhere to go, it will crash
  }

  // ------------------------------------------------------------ CPU apple placer (classic)
  function reachableEmpty(s) {
    const head = s.snake[0];
    const cells = flood(head.x, head.y, bodyGrid(s.snake, true)).slice(1);
    return cells.map((c) => ({ x: c % GW, y: (c / GW) | 0 }));
  }

  function awkwardness(s, c) {
    const blocked = bodyGrid(s.snake, false);
    let n = 0;
    for (const [dx, dy] of DIRS) {
      const x = c.x + dx, y = c.y + dy;
      if (!inb(x, y) || blocked[idx(x, y)]) n++;
    }
    return n;
  }

  function cpuPlace(s, level) {
    const cells = reachableEmpty(s);
    if (!cells.length) return null;
    const head = s.snake[0];
    // Level 1 is uniform random; each level samples more cells and keeps the nastiest.
    const k = Math.min(1 + (level - 1) * 2, 11);
    let best = null, bestScore = -Infinity;
    for (let i = 0; i < k; i++) {
      const c = U.pick(cells);
      const d = Math.abs(c.x - head.x) + Math.abs(c.y - head.y);
      if (d < 3) continue;
      const score = awkwardness(s, c) * 3 + Math.min(d, 30) / 6 + Math.random();
      if (score > bestScore) { bestScore = score; best = c; }
    }
    return best || U.pick(cells);
  }

  // ------------------------------------------------------------ game
  Cab.register({
    id: 'snake',
    name: 'Snake',
    color: '#5dff9b',
    blurb: 'Eat, grow, don’t bite yourself. Or place the apples and try to trap a snake that plans its own route.',
    modes: [
      {
        id: 'classic', name: 'Classic',
        you: 'steer the snake',
        cpu: 'places the apples, nastier each level',
        intro: [
          'Arrow keys or WASD to turn.',
          `Eat ${CLASSIC_GOAL} apples to win. Walls and your own body are deadly.`,
          'Every 5 apples: faster snake, and the computer hides apples in tighter spots.',
        ],
        help: 'Arrows / WASD steer · P pauses',
      },
      {
        id: 'flip', name: 'Flipped',
        you: 'place the apples',
        cpu: 'steers the snake',
        intro: [
          'Click an empty cell to drop the next apple. It must be reachable.',
          'The snake has to eat before its hunger bar empties, and the bar gets shorter every apple.',
          `You win if the snake crashes or starves before eating ${FLIP_GOAL}. If you wait 6s, an apple is dropped at random.`,
        ],
        help: 'Click a cell to place the apple · P pauses',
      },
    ],

    create(api) {
      const flip = api.mode === 'flip';
      const s = {
        snake: [{ x: 7, y: 11 }, { x: 6, y: 11 }, { x: 5, y: 11 }, { x: 4, y: 11 }],
        dir: { x: 1, y: 0 },
        grow: 0,
        apple: null,
        hunger: Infinity,
        hungerMax: 1,
      };
      const queue = [];
      let eaten = 0, acc = 0, ready = 1.2, dead = false, flash = '', flashT = 0;
      let waitT = 0;            // flip: how long the human has been choosing
      let aiLabel = '';

      const level = () => Math.floor(eaten / 5) + 1;
      const rate = () => flip ? Math.min(7 + eaten * 0.25, 13) : Math.min(7 + eaten * 0.3, 16);

      function say(msg) { flash = msg; flashT = 1.6; }

      function placeApple(c, byHuman) {
        s.apple = c;
        waitT = 0;
        if (flip) {
          // Hunger: shortest distance plus some slack. Slack shrinks from 30 to 6 moves.
          const head = s.snake[0];
          const p = bfs(head.x, head.y, bodyGrid(s.snake, s.grow === 0), c);
          const slack = Math.max(6, 30 - eaten);
          s.hungerMax = s.hunger = (p ? p.length : 20) + slack;
          if (!byHuman) say('Too slow — random apple');
        }
      }

      if (!flip) placeApple(cpuPlace(s, 1));

      function tryHumanPlace(x, y) {
        const cx = Math.floor(x / C), cy = Math.floor((y - OY) / C);
        if (!inb(cx, cy) || s.apple) return;
        if (bodyGrid(s.snake, false)[idx(cx, cy)]) return say('That cell is snake');
        const head = s.snake[0];
        if (!bfs(head.x, head.y, bodyGrid(s.snake, true), { x: cx, y: cy })) return say('Unreachable — pick another cell');
        placeApple({ x: cx, y: cy }, true);
      }

      function step() {
        let next;
        if (flip) {
          next = aiMove(s);
          if (!next) { die('The snake boxed itself in'); return; }
          const head = s.snake[0];
          s.dir = { x: next.x - head.x, y: next.y - head.y };
          aiLabel = s.apple ? 'hunting' : 'circling';
        } else {
          while (queue.length) {
            const d = queue.shift();
            if (d.x !== -s.dir.x || d.y !== -s.dir.y) { s.dir = d; break; }
          }
          const head = s.snake[0];
          next = { x: head.x + s.dir.x, y: head.y + s.dir.y };
        }
        if (!legal(s, next.x, next.y)) {
          die(inb(next.x, next.y) ? 'Bit its own tail' : 'Hit the wall');
          return;
        }
        const ate = advance(s, next);
        if (ate) {
          eaten++;
          s.apple = null;
          s.hunger = Infinity;
          if (!flip && eaten >= CLASSIC_GOAL) return api.end({ win: true, title: 'You win!', text: `${CLASSIC_GOAL} apples eaten at length ${s.snake.length}.` });
          if (flip && eaten >= FLIP_GOAL) return api.end({ win: false, title: 'The snake wins', text: `It ate all ${FLIP_GOAL} apples. Try luring it into a dead end when its hunger is short.` });
          if (eaten % 5 === 0) say(`Level ${level()}`);
          if (!flip) {
            const c = cpuPlace(s, level());
            if (!c) return api.end({ win: true, title: 'Board full!', text: 'There is nowhere left to put an apple.' });
            placeApple(c);
          }
        } else if (flip && s.apple) {
          s.hunger--;
          if (s.hunger <= 0) {
            dead = true;
            return api.end({ win: true, title: 'You win — it starved!', text: `The snake ate ${eaten} of ${FLIP_GOAL} apples.` });
          }
        }
      }

      function die(why) {
        dead = true;
        if (flip) api.end({ win: true, title: 'You win — splat!', text: `${why} after ${eaten} apples.` });
        else api.end({ win: false, title: 'Game over', text: `${why}. You ate ${eaten} apples (level ${level()}).` });
      }

      return {
        _dbg: () => s, // read-only view for the test harness
        key(code) {
          const map = { ArrowUp: [0, -1], KeyW: [0, -1], ArrowDown: [0, 1], KeyS: [0, 1], ArrowLeft: [-1, 0], KeyA: [-1, 0], ArrowRight: [1, 0], KeyD: [1, 0] };
          if (flip || !map[code]) return;
          const [x, y] = map[code];
          const lastD = queue.length ? queue[queue.length - 1] : s.dir;
          if ((x === lastD.x && y === lastD.y) || (x === -lastD.x && y === -lastD.y)) return;
          if (queue.length < 3) queue.push({ x, y });
        },
        pointer(type, x, y) {
          if (flip && type === 'down') tryHumanPlace(x, y);
        },
        update(dt) {
          if (flashT > 0) flashT -= dt;
          if (dead) return;
          if (ready > 0) { ready -= dt; return; }
          if (flip && !s.apple) {
            waitT += dt;
            if (waitT > 6) {
              const cells = reachableEmpty(s).filter((c) => Math.abs(c.x - s.snake[0].x) + Math.abs(c.y - s.snake[0].y) > 3);
              if (cells.length) placeApple(U.pick(cells), false);
            }
          }
          acc += dt;
          const t = 1 / rate();
          while (acc >= t && !api.isEnded()) { acc -= t; step(); }
        },
        draw(g) {
          D.clear(g, '#070a08');
          // board
          for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) {
            if ((x + y) % 2) { g.fillStyle = '#0b120d'; g.fillRect(x * C, OY + y * C, C, C); }
          }
          // hover preview (flip)
          if (flip && !s.apple && api.mouse.inside) {
            const cx = Math.floor(api.mouse.x / C), cy = Math.floor((api.mouse.y - OY) / C);
            if (inb(cx, cy)) {
              g.fillStyle = '#ff5d6c44';
              g.fillRect(cx * C, OY + cy * C, C, C);
            }
          }
          // apple
          if (s.apple) {
            const ax = s.apple.x * C + C / 2, ay = OY + s.apple.y * C + C / 2;
            g.save(); D.glow(g, '#ff3b5c', 14);
            g.fillStyle = '#ff3b5c';
            g.beginPath(); g.arc(ax, ay + 1, C * 0.36, 0, Math.PI * 2); g.fill();
            g.restore();
            g.fillStyle = '#5dff9b';
            g.fillRect(ax, ay - C * 0.45, 3, 6);
          }
          // snake
          const n = s.snake.length;
          s.snake.forEach((p, i) => {
            const t = i / Math.max(1, n - 1);
            g.fillStyle = i === 0 ? '#b8ffd2' : `hsl(${145 - t * 30}, 85%, ${58 - t * 22}%)`;
            const pad = i === 0 ? 1 : 2;
            g.fillRect(p.x * C + pad, OY + p.y * C + pad, C - pad * 2, C - pad * 2);
          });
          const hd = s.snake[0];
          g.fillStyle = '#05140a';
          const ex = hd.x * C + C / 2 + s.dir.x * 4, ey = OY + hd.y * C + C / 2 + s.dir.y * 4;
          const px = -s.dir.y, py = s.dir.x; // perpendicular to heading
          g.fillRect(ex + px * 5 - 2, ey + py * 5 - 2, 4, 4);
          g.fillRect(ex - px * 5 - 2, ey - py * 5 - 2, 4, 4);

          // HUD
          g.fillStyle = '#0d0b18'; g.fillRect(0, 0, W, OY);
          if (flip) {
            D.hud(g, [`APPLES ${eaten}/${FLIP_GOAL}  LEN ${n}`, '', s.apple ? `SNAKE: ${aiLabel.toUpperCase()}` : `DROP AN APPLE ${Math.max(0, 6 - waitT).toFixed(0)}s`]);
            if (s.apple && isFinite(s.hunger)) {
              const f = s.hunger / s.hungerMax;
              g.fillStyle = '#222';
              g.fillRect(300, 11, 200, 6);
              g.fillStyle = f > 0.35 ? '#ffd23e' : '#ff5d6c';
              g.fillRect(300, 11, 200 * f, 6);
            }
          } else {
            D.hud(g, [`APPLES ${eaten}/${CLASSIC_GOAL}`, `LEVEL ${level()}`, `LEN ${n}`]);
          }
          if (ready > 0) D.text(g, 'READY', W / 2, H / 2 - 10, 20, '#5dff9b', 'center');
          if (flashT > 0) D.text(g, flash, W / 2, 50, 12, '#ffd23e', 'center');
        },
      };
    },
  });
})();
