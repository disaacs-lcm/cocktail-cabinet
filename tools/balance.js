#!/usr/bin/env node
/* Balance check: computer vs computer, about 200 games per mode.
 *
 *   npm run balance                      every mode, 200 runs each
 *   node tools/balance.js --runs 50      fewer runs (faster)
 *   node tools/balance.js --only pong    one game
 *   node tools/balance.js --save before  also write tools/results/before.json
 *   node tools/balance.js --compare before   print a before/after table
 *
 * How it works: it loads the real game files in Node (no browser), gives each game a fake
 * `api` with autopilot: true, and steps update() at 60 Hz until the game calls api.end().
 * With autopilot on, the human's side is played by the game's own computer logic tuned to
 * a "typical human" (each game's HUMAN_MODEL constant), and the other side by the normal
 * computer player. So the game rules, physics and AIs are exactly the shipped code.
 * Target: the human side wins 40-60% of games in every mode.
 *
 * Imitation is a chat, so it can't be stepped like this. It's modelled instead: the
 * game's own Bot answers the Judge's real interview questions, with typing times taken
 * from the Bot's typing model, and we count how often the Judge rules "human".
 */
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const { fork } = require('child_process');

const ROOT = path.join(__dirname, '..');
const RESULTS = path.join(__dirname, 'results');
const MODES = [
  ['snake', 'classic'], ['snake', 'flip'],
  ['breakout', 'classic'], ['breakout', 'flip'],
  ['splat', 'classic'], ['splat', 'flip'],
  ['asteroids', 'classic'], ['asteroids', 'flip'],
  ['missile', 'classic'], ['missile', 'flip'],
  ['pong', 'classic'], ['pong', 'flip'],
  ['imitation', 'flip'], ['imitation', 'classic'],
];
const MAX_SECONDS = 1800;   // a game still running after 30 simulated minutes is a draw

// ------------------------------------------------------------------ loading the games
function loadCabinet() {
  global.window = global;
  global.performance = global.performance || { now: () => Date.now() };
  const load = (f) => (0, eval)(fs.readFileSync(path.join(ROOT, f), 'utf8'));
  load('js/cabinet.js');
  for (const g of ['snake', 'breakout', 'splat', 'asteroids', 'missile', 'pong', 'imitation']) load(`js/games/${g}.js`);
  return global.Cab;
}

// ------------------------------------------------------------------ one canvas game
function playOnce(Cab, id, mode) {
  const game = Cab.games.find((g) => g.id === id);
  let result = null;
  const api = {
    W: 800, H: 600, U: Cab.U, D: Cab.D, keys: new Set(),
    mouse: { x: 400, y: 300, down: false, inside: false },
    mode, color: '#fff', level: 1, autopilot: true,
    end: (r) => { if (!result) result = r; }, setHelp() {}, isEnded: () => !!result,
  };
  const inst = game.create(api);
  let t = 0;
  for (; t < MAX_SECONDS && !result; t += 1 / 60) inst.update(1 / 60);
  return { win: result ? result.win : null, secs: t };
}

// ------------------------------------------------------------------ Imitation model
// One interview: the bot (standing in for a person) answers each question; returns
// whether the judge ruled it human.
function interview(Cab, botLevel, round) {
  const { Bot, Judge, buildPlan, strictFor } = Cab.imitationModel;
  const U = Cab.U;
  const bot = new Bot(botLevel, { typing() {}, say() {} });
  const judge = new Judge(strictFor(round));
  const perChar = [95, 160, 210, 240][bot.level - 1];      // same table as Bot.send()
  for (const q of buildPlan(round)) {
    const raw = q.text;
    const t = ' ' + raw.toLowerCase().replace(/[’']/g, '').replace(/\s+/g, ' ').trim() + ' ';
    let reply = bot.respond(t, raw);
    if (Array.isArray(reply)) reply = reply.filter(Boolean).join(' ');
    const text = bot.style(reply).s;
    const typingMs = text.length * perChar * U.rand(0.8, 1.25);
    const latencyMs = U.rand(900, 2600) + (bot.level >= 3 ? U.rand(0, 1800) : 0);
    judge.observe(text, { typingMs, latencyMs, totalMs: latencyMs + typingMs, pasted: false, edits: U.randi(0, 2) }, q);
  }
  return judge.verdict().human;
}

function imitationRuns(Cab, mode, runs) {
  let humanSide = 0;
  for (let i = 0; i < runs; i++) {
    if (mode === 'flip') {
      // Prove it, round 1: a casual chatter (bot level 3 as the stand-in) tries to pass.
      if (interview(Cab, 3, 1)) humanSide++;
    } else {
      // Who's there?: the human side guesses right if the judge-style read catches the
      // computer partner (which starts at level 2).
      if (!interview(Cab, 2, 1)) humanSide++;
    }
  }
  return { human: humanSide, cpu: runs - humanSide, draws: 0, secs: 0, runs };
}

// ------------------------------------------------------------------ worker
if (process.argv[2] === '--worker') {
  const [id, mode, runs] = [process.argv[3], process.argv[4], +process.argv[5]];
  const Cab = loadCabinet();
  if (id === 'imitation') {
    process.send(imitationRuns(Cab, mode, runs));
  } else {
    const r = { human: 0, cpu: 0, draws: 0, secs: 0, runs };
    for (let i = 0; i < runs; i++) {
      const g = playOnce(Cab, id, mode);
      if (g.win === true) r.human++; else if (g.win === false) r.cpu++; else r.draws++;
      r.secs += g.secs;
    }
    process.send(r);
  }
  return;
}

// ------------------------------------------------------------------ main
const args = process.argv.slice(2);
const opt = (name, d) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : d; };
const RUNS = +opt('--runs', 200);
const ONLY = opt('--only', null);
const SAVE = opt('--save', null);
const COMPARE = opt('--compare', null);

const pct = (n, d) => (d ? Math.round((100 * n) / d) : 0);
const label = (id, mode) => {
  const names = { classic: 'classic', flip: 'flipped' };
  return `${id} ${names[mode]}`;
};

async function main() {
  const todo = MODES.filter(([id]) => !ONLY || id === ONLY);
  const cpus = Math.max(1, os.cpus().length - 1);
  // Split each mode's runs into chunks so all cores stay busy.
  const chunks = [];
  for (const [id, mode] of todo) {
    const parts = id === 'imitation' ? 1 : Math.min(cpus, 8);
    for (let p = 0; p < parts; p++) {
      const n = Math.floor(RUNS / parts) + (p < RUNS % parts ? 1 : 0);
      if (n) chunks.push({ id, mode, n });
    }
  }
  const totals = {};
  let next = 0, done = 0;
  const started = Date.now();
  await new Promise((resolve) => {
    const launch = () => {
      if (next >= chunks.length) return;
      const c = chunks[next++];
      const child = fork(__filename, ['--worker', c.id, c.mode, String(c.n)]);
      child.on('message', (r) => {
        const k = `${c.id}/${c.mode}`;
        const t = (totals[k] = totals[k] || { human: 0, cpu: 0, draws: 0, secs: 0, runs: 0 });
        for (const f of ['human', 'cpu', 'draws', 'secs', 'runs']) t[f] += r[f];
      });
      child.on('exit', () => {
        done++;
        if (process.stderr.isTTY) process.stderr.write(`\r  ${done}/${chunks.length} batches done`);
        if (done === chunks.length) resolve(); else launch();
      });
    };
    for (let i = 0; i < cpus; i++) launch();
  });
  process.stderr.write(`\r  finished in ${Math.round((Date.now() - started) / 1000)}s          \n\n`);

  // Table
  const rows = todo.map(([id, mode]) => {
    const t = totals[`${id}/${mode}`];
    const h = pct(t.human, t.runs);
    return { key: `${id}/${mode}`, name: label(id, mode), human: h, cpu: pct(t.cpu, t.runs), draws: pct(t.draws, t.runs),
      avg: t.secs && t.runs ? Math.round(t.secs / t.runs) : null, ok: h >= 40 && h <= 60 };
  });
  console.log('| Mode | Human side wins | Computer wins | Draws | Avg game | In 40–60%? |');
  console.log('|---|---|---|---|---|---|');
  for (const r of rows) console.log(`| ${r.name} | ${r.human}% | ${r.cpu}% | ${r.draws}% | ${r.avg === null ? 'n/a' : r.avg + 's'} | ${r.ok ? 'yes' : 'NO'} |`);
  console.log(`\n${RUNS} runs per mode. Human side = the game's HUMAN_MODEL autopilot.`);

  if (SAVE) {
    fs.mkdirSync(RESULTS, { recursive: true });
    fs.writeFileSync(path.join(RESULTS, `${SAVE}.json`), JSON.stringify({ runs: RUNS, rows }, null, 2));
    console.log(`saved tools/results/${SAVE}.json`);
  }
  if (COMPARE) {
    const before = JSON.parse(fs.readFileSync(path.join(RESULTS, `${COMPARE}.json`), 'utf8'));
    console.log(`\n| Mode | Human side: ${COMPARE} | Human side: now |`);
    console.log('|---|---|---|');
    for (const r of rows) {
      const b = before.rows.find((x) => x.key === r.key);
      console.log(`| ${r.name} | ${b ? b.human + '%' : '–'} | ${r.human}% |`);
    }
  }
}
main();
