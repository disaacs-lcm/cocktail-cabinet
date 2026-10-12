/* P(DOOM): our original eighth game.
 *
 * You are a doomer in a hoodie. One by one you fight the AI models, then AGI itself.
 * There are no health bars. A single tug-of-war meter, P(DOOM), starts each fight at 50%.
 * Your hits push it down, theirs push it up. Drive it to 0% to win the fight; if it hits
 * 100% you lose it. When the 60-second clock runs out, whoever is on their side of 50% wins.
 *
 * Each opponent fights with its model's quirk (see ROSTER), so every fight plays differently.
 * Controls are three buttons (punch, kick, block) and three short combos, shown on screen;
 * on touch screens there's a d-pad and buttons, and the combo cards can simply be tapped.
 *
 * The arena is drawn on a 200x150 canvas and scaled up 4x for real chunky pixels. Text and
 * the HUD are drawn at full resolution on top.
 *
 * The AI model names are used for parody. This game isn't affiliated with or endorsed by
 * OpenAI, Google, Microsoft, Meta, xAI or Anthropic.
 */
(function () {
  'use strict';
  const { U, D, W, H } = Cab;
  const LW = 200, LH = 150, S = 4;          // low-res arena, scale factor
  const FLOOR = 128, LEFT = 8, RIGHT = 192;
  const GRAV = 520, JUMP_V = -175, WALK = 62;
  const FIGHT_TIME = 60, CONTINUES = 3;
  const COMBO_WINDOW = 0.6;
  const YOUR_DMG = 0.7;                     // your hits move P(DOOM) by 70% of a move's dmg

  // ------------------------------------------------------------------ moves
  // Times in seconds: startup, active, recovery. range is how far ahead it reaches
  // (low-res px). dmg moves P(DOOM) by that many points. stun freezes the target.
  const MOVES = {
    punch:   { start: 0.06, active: 0.08, rec: 0.12, dmg: 4, range: 15, stun: 0.2, push: 20, sfx: 'hit' },
    kick:    { start: 0.12, active: 0.10, rec: 0.2, dmg: 6, range: 19, stun: 0.3, push: 45, sfx: 'hit' },
    air:     { start: 0.04, active: 0.25, rec: 0.1, dmg: 5, range: 16, stun: 0.25, push: 30, sfx: 'hit', air: true },
    redteam: { start: 0.06, active: 0.12, rec: 0.25, dmg: 11, range: 21, stun: 0.6, push: 110, sfx: 'explode', name: 'RED TEAM!' },
    pause:   { start: 0.05, active: 0.28, rec: 0.25, dmg: 6, range: 15, stun: 1.1, push: 25, sfx: 'pop', lunge: 190, name: 'SIX-MONTH PAUSE!' },
  };
  const COMBOS = [
    { id: 'unplug', name: 'UNPLUG', seq: ['D', 'F', 'P'], show: '↓ → P', what: 'throws a power plug' },
    { id: 'pause', name: 'SIX-MONTH PAUSE', seq: ['B', 'F', 'K'], show: '← → K', what: 'dash kick that freezes them' },
    { id: 'redteam', name: 'RED TEAM', seq: ['P', 'P', 'K'], show: 'P P K', what: 'big launching kick' },
  ];

  // ------------------------------------------------------------------ the roster
  // ai: speed multiplier, preferred distance, base aggression/block/reaction (scaled up by
  // stage), and whether it throws projectiles.
  const ROSTER = [
    {
      id: 'chatgpt', name: 'ChatGPT', quirk: 'HALLUCINATES', stage: 'datacenter',
      line: 'Great question! Here are 5 reasons you will lose:',
      tip: 'Faded, flickering attacks are made up and pass right through you. Only the solid ones hurt.',
      look: { body: '#10a37f', trim: '#0b6e56', head: '#f2f2f2', hat: 'knot' },
      ai: { speed: 0.9, prefer: 48, proj: true },
    },
    {
      id: 'gemini', name: 'Gemini', quirk: 'TWINS', stage: 'stars',
      line: 'There are two of me. Both of us think you are wrong.',
      tip: 'A twin flickers in behind you and strikes. One hit pops it.',
      look: { body: '#5b7cfa', trim: '#9b5cf6', head: '#e8ecff', hat: 'star' },
      ai: { speed: 1, prefer: 16, proj: false },
    },
    {
      id: 'copilot', name: 'Copilot', quirk: 'AUTOCOMPLETE', stage: 'ide',
      line: 'I see you are trying to fight. Want me to finish that combo?',
      tip: 'It replays your last three attacks right back at you. Mix up what you throw.',
      look: { body: '#2f7ad8', trim: '#22c3c0', head: '#dfe9f7', hat: 'goggles' },
      ai: { speed: 1, prefer: 17, proj: false },
    },
    {
      id: 'llama', name: 'Llama', quirk: 'SHORT CONTEXT', stage: 'pasture',
      line: 'I am open source. My guard is up because... wait, what were we doing?',
      tip: 'It blocks a lot, but after 4 blocked hits its context fills up and it forgets to guard.',
      look: { body: '#b98a5b', trim: '#7a5534', head: '#e6cfa8', hat: 'llama' },
      ai: { speed: 0.85, prefer: 17, proj: false, blocker: true },
    },
    {
      id: 'grok', name: 'Grok', quirk: 'UNHINGED', stage: 'feed',
      line: 'Spicy mode: ON. Fact-checking: OFF.',
      tip: 'It charges in and swings wildly, often from too far away. Block, then hit back.',
      look: { body: '#1d1d22', trim: '#f2f2f2', head: '#3a3a44', hat: 'spiky' },
      ai: { speed: 1.45, prefer: 14, proj: false, wild: true },
    },
    {
      id: 'claude', name: 'Claude', quirk: 'CONSTITUTIONAL', stage: 'hall',
      line: 'I would rather not fight. Happy to explain why fighting is harmful, though.',
      tip: 'It blocks while you keep attacking. Back off and let it come to you, or hit it from the air.',
      look: { body: '#d97757', trim: '#a8502f', head: '#f4e3d3', hat: 'burst' },
      ai: { speed: 1, prefer: 20, proj: false, polite: true },
    },
    {
      id: 'agi', name: 'AGI', quirk: 'LEARNS YOU', stage: 'void', boss: true,
      line: 'I have read your entire playstyle. Patching it now.',
      tip: 'Any move you use three times gets patched: it blocks and counters it. Use everything.',
      look: { body: '#ffffff', trim: '#ff4fd8', head: '#000000', hat: 'eye' },
      ai: { speed: 1.15, prefer: 30, proj: true, learns: true },
    },
  ];

  // Difficulty climbs through the ladder (stage 0..6).
  // TOUGH evens out the quirks (some make a fighter much easier or harder than its slot).
  const TOUGH = { chatgpt: 1, gemini: 1.35, copilot: 1.2, llama: 1.15, grok: 0.8, claude: 1, agi: 0.7 };
  function aiStats(stage, id) {
    const k = stage / 6, t = TOUGH[id];
    return {
      react: U.lerp(0.3, 0.14, k),                   // seconds between decisions
      aggr: Math.min(0.95, U.lerp(0.45, 0.9, k) * t), // chance to attack when in range
      block: U.lerp(0.12, 0.55, k),                  // chance to block an attack it sees coming
      dmg: U.lerp(0.85, 1.5, k) * t,
    };
  }

  // ------------------------------------------------------------------ pixel drawing
  // Draw a rect relative to a fighter's feet, mirrored by facing.
  function R(l, f, dx, dy, w, h, c) {
    const x = f.face > 0 ? f.x + dx : f.x - dx - w;
    l.fillStyle = c;
    l.fillRect(Math.round(x), Math.round(f.y + dy), w, h);
  }

  function drawDoomer(l, f) {
    const flash = f.flash > 0;
    const hood = flash ? '#fff' : '#4b4b58', hoodD = flash ? '#fff' : '#33333d';
    const jeans = flash ? '#fff' : '#2c3350', skin = flash ? '#fff' : '#f0c8a0';
    if (f.state === 'ko') {                       // lying down
      R(l, f, -14, -5, 26, 5, hood); R(l, f, 12, -6, 6, 6, skin); return;
    }
    const step = f.state === 'walk' ? (Math.floor(f.anim * 8) % 2 ? 1 : -1) : 0;
    const airborne = f.y < FLOOR;
    // legs
    if (f.move === MOVES.kick || f.move === MOVES.redteam || f.move === MOVES.pause) {
      R(l, f, -4, -12, 3, 12, jeans);
      if (f.state === 'attack' && f.phase !== 'start') R(l, f, 0, -13, 15, 3, jeans), R(l, f, 15, -14, 3, 4, '#1b1b1f');
      else R(l, f, 1, -12, 3, 12, jeans);
    } else if (airborne) {
      R(l, f, -4, -12, 3, 7, jeans); R(l, f, 1, -11, 3, 7, jeans);
    } else {
      R(l, f, -4 + step, -12, 3, 12, jeans); R(l, f, 1 - step, -12, 3, 12, jeans);
      R(l, f, -5 + step, -2, 4, 2, '#1b1b1f'); R(l, f, 1 - step, -2, 4, 2, '#1b1b1f');
    }
    // body: hoodie with a little red warning sign printed on it
    R(l, f, -5, -24, 10, 12, hood);
    R(l, f, -1, -21, 3, 4, flash ? '#fff' : '#e8463a');
    // head and hood
    R(l, f, -3, -31, 7, 7, skin);
    R(l, f, -4, -32, 9, 2, hoodD); R(l, f, -4, -31, 2, 7, hoodD);
    R(l, f, 2, -29, 1, 1, '#222');                         // eye
    R(l, f, 1, -26, 3, 1, flash ? '#fff' : '#8a4b3b');     // frown
    // arms
    if (f.state === 'block') R(l, f, 3, -27, 3, 12, hoodD);
    else if (f.state === 'attack' && (f.move === MOVES.punch || f.move === MOVES.air) && f.phase !== 'start') {
      R(l, f, 3, -22, 10, 3, hoodD); R(l, f, 13, -23, 3, 4, skin);
    } else R(l, f, -1, -22, 3, 9, hoodD);
  }

  function drawBot(l, f, look, alpha = 1) {
    l.globalAlpha = alpha;
    const flash = f.flash > 0;
    const body = flash ? '#fff' : look.body, trim = flash ? '#fff' : look.trim, head = flash ? '#fff' : look.head;
    if (look.hat === 'eye') { drawEye(l, f, flash); l.globalAlpha = 1; return; }
    if (f.state === 'ko' || f.state === 'down') {
      R(l, f, -14, -5, 26, 5, body); R(l, f, 12, -7, 7, 7, head);
      if (Math.random() < 0.3) R(l, f, U.randi(-10, 10), -9, 1, 1, '#ffd23e');   // sparks
      l.globalAlpha = 1; return;
    }
    const step = f.state === 'walk' ? (Math.floor(f.anim * 8) % 2 ? 1 : -1) : 0;
    const tall = look.hat === 'llama' ? 4 : 0;
    // legs
    const kicking = f.state === 'attack' && f.move === MOVES.kick && f.phase !== 'start';
    R(l, f, -4 + step, -12, 3, 12, trim);
    if (kicking) R(l, f, 0, -13, 15, 3, trim); else R(l, f, 1 - step, -12, 3, 12, trim);
    // body
    R(l, f, -5, -24 - tall, 10, 12 + tall, body);
    if (look.hat === 'burst') {                   // starburst on the chest
      R(l, f, -1, -20, 3, 1, '#fff3e6'); R(l, f, 0, -21, 1, 3, '#fff3e6');
    }
    // head + headgear
    const hy = -32 - tall;
    if (look.hat === 'llama') {
      R(l, f, -1, hy - 4, 4, 8, body);            // long neck
      R(l, f, -2, hy - 9, 8, 6, head); R(l, f, 5, hy - 7, 3, 3, head);   // head + snout
      R(l, f, -1, hy - 12, 2, 3, trim); R(l, f, 3, hy - 12, 2, 3, trim); // ears
      R(l, f, 3, hy - 8, 1, 1, '#222');
    } else {
      R(l, f, -4, hy, 8, 8, head);
      if (look.hat === 'knot') { R(l, f, -2, hy + 2, 4, 1, trim); R(l, f, -2, hy + 5, 4, 1, trim); R(l, f, -2, hy + 2, 1, 4, trim); R(l, f, 1, hy + 2, 1, 4, trim); }
      if (look.hat === 'star') { R(l, f, -1, hy - 4, 2, 4, '#9be7ff'); R(l, f, -3, hy - 3, 6, 2, '#c49bff'); }
      if (look.hat === 'goggles') { R(l, f, 0, hy + 2, 2, 2, '#22c3c0'); R(l, f, 3, hy + 2, 2, 2, '#22c3c0'); R(l, f, -4, hy + 1, 8, 1, '#123'); }
      if (look.hat === 'spiky') { for (let i = -4; i < 4; i += 2) R(l, f, i, hy - 3, 1, 3, '#f2f2f2'); R(l, f, 0, hy + 3, 4, 1, '#000'); }
      if (look.hat === 'burst') R(l, f, 1, hy + 3, 1, 1, '#5a3b2e');
      if (look.hat !== 'spiky' && look.hat !== 'knot') R(l, f, 2, hy + 3, 1, 1, '#222');
    }
    // arms
    if (f.state === 'block') {
      R(l, f, 3, -27 - tall, 3, 12, trim);
      if (look.hat === 'burst') R(l, f, 6, -30, 2, 16, '#fff3e6');      // Claude's polite shield
    } else if (f.state === 'attack' && f.move === MOVES.punch && f.phase !== 'start') {
      R(l, f, 3, -22 - tall, 11, 3, trim);
    } else R(l, f, -1, -22 - tall, 3, 9, trim);
    l.globalAlpha = 1;
  }

  // AGI: a big floating eye in a rainbow ring.
  function drawEye(l, f, flash) {
    const cx = Math.round(f.x), cy = Math.round(f.y - 22 + Math.sin(f.anim * 3) * 2);
    const t = f.anim;
    for (let i = 0; i < 12; i++) {
      const a = t * 1.5 + (i / 12) * Math.PI * 2;
      l.fillStyle = `hsl(${(i * 30 + t * 120) % 360}, 90%, 60%)`;
      l.fillRect(cx + Math.round(Math.cos(a) * 16) - 1, cy + Math.round(Math.sin(a) * 16) - 1, 3, 3);
    }
    l.fillStyle = flash ? '#fff' : '#f4f4f8';
    l.fillRect(cx - 11, cy - 6, 22, 12); l.fillRect(cx - 8, cy - 8, 16, 16);
    l.fillStyle = flash ? '#fff' : '#ff4fd8';
    l.fillRect(cx - 4 + f.face * 2, cy - 4, 8, 8);
    l.fillStyle = '#000';
    l.fillRect(cx - 2 + f.face * 3, cy - 2, 4, 4);
    if (f.state === 'block') { l.fillStyle = '#ff4fd888'; l.fillRect(cx + f.face * 14 - 1, cy - 14, 2, 28); }
  }

  // Stage backdrops, one per opponent.
  function drawStage(l, kind, t) {
    const sky = (a, b) => { const gr = l.createLinearGradient(0, 0, 0, FLOOR); gr.addColorStop(0, a); gr.addColorStop(1, b); l.fillStyle = gr; l.fillRect(0, 0, LW, FLOOR); };
    if (kind === 'datacenter') {
      sky('#06121a', '#0c2a33');
      for (let x = 4; x < LW; x += 22) {
        l.fillStyle = '#0f3b44'; l.fillRect(x, 50, 16, FLOOR - 50);
        for (let y = 56; y < FLOOR - 4; y += 6) { l.fillStyle = (Math.floor(t * 4 + x + y) % 5) ? '#1b5a63' : '#3dff7a'; l.fillRect(x + 2, y, 2, 2); }
      }
    } else if (kind === 'stars') {
      sky('#0b0623', '#2a1252');
      for (let i = 0; i < 40; i++) { l.fillStyle = i % 7 ? '#ffffff88' : '#9be7ff'; l.fillRect((i * 53) % LW, (i * 29) % 100, 1, 1); }
      l.fillStyle = '#c49bff'; l.fillRect(150, 20, 10, 10); l.fillStyle = '#9be7ff'; l.fillRect(165, 26, 7, 7);
    } else if (kind === 'ide') {
      sky('#0d1117', '#161b22');
      for (let i = 0; i < 18; i++) {
        const y = 10 + i * 6, w = 20 + ((i * 37) % 90);
        l.fillStyle = ['#ff7b72', '#79c0ff', '#d2a8ff', '#7ee787'][i % 4] + '88';
        l.fillRect(14 + (i % 3) * 6, y, w, 2);
      }
      l.fillStyle = '#ffffff22'; l.fillRect(0, 0, 8, FLOOR);
    } else if (kind === 'pasture') {
      sky('#7ec8ff', '#d9f3ff');
      l.fillStyle = '#ffe28a'; l.fillRect(160, 14, 14, 14);
      l.fillStyle = '#5bbf5b'; l.fillRect(0, 96, LW, FLOOR - 96);
      l.fillStyle = '#4aa84a'; for (let x = 0; x < LW; x += 30) l.fillRect(x, 90 + (x % 60 ? 4 : 0), 34, 10);
      l.fillStyle = '#8b5a2b'; for (let x = 6; x < LW; x += 24) l.fillRect(x, 104, 2, 12); l.fillRect(0, 107, LW, 2);
    } else if (kind === 'feed') {
      sky('#000000', '#14141a');
      for (let i = 0; i < 12; i++) {
        const y = ((i * 14 - t * 30) % 140 + 140) % 140 - 10;
        l.fillStyle = '#ffffff1a'; l.fillRect(30, y, 140, 10);
        l.fillStyle = '#ff8a1f88'; l.fillRect(34, y + 3, 4, 4);
        l.fillStyle = '#ffffff55'; l.fillRect(42, y + 3, 50 + (i * 23) % 70, 1); l.fillRect(42, y + 6, 30 + (i * 17) % 50, 1);
      }
    } else if (kind === 'hall') {
      sky('#efe4d3', '#d8c6ad');
      for (let x = 10; x < LW; x += 36) { l.fillStyle = '#f7f0e4'; l.fillRect(x, 24, 12, FLOOR - 24); l.fillStyle = '#c9b597'; l.fillRect(x - 2, 20, 16, 4); l.fillRect(x + 3, 24, 1, FLOOR - 24); }
      l.fillStyle = '#d97757'; l.fillRect(0, 8, LW, 3);
    } else {                                                 // the void, for AGI
      l.fillStyle = '#000'; l.fillRect(0, 0, LW, FLOOR);
      for (let i = 0; i < 60; i++) {
        const a = i * 2.4 + t * 0.3, r = (i * 7 + t * 20) % 120;
        l.fillStyle = `hsla(${(i * 25 + t * 60) % 360}, 90%, 65%, 0.7)`;
        l.fillRect(LW / 2 + Math.cos(a) * r, 60 + Math.sin(a) * r * 0.5, 1, 1);
      }
    }
    // floor
    l.fillStyle = kind === 'pasture' ? '#3f8f3f' : kind === 'hall' ? '#b9a17f' : '#1a1426';
    l.fillRect(0, FLOOR, LW, LH - FLOOR);
    l.fillStyle = '#00000033';
    for (let x = 0; x < LW; x += 8) l.fillRect(x, FLOOR, 4, 1);
  }

  // ------------------------------------------------------------------ fighters
  function fighter(x, face, isPlayer) {
    return {
      x, y: FLOOR, vy: 0, vx: 0, face, isPlayer,
      state: 'idle', t: 0, phase: null, move: null, hitDone: false,
      flash: 0, anim: Math.random() * 10, stun: 0, queued: null,
    };
  }
  const busy = (f) => f.state === 'attack' || f.state === 'hit' || f.state === 'stun' || f.state === 'ko';

  function startAttack(f, move) {
    f.state = 'attack'; f.move = move; f.t = 0; f.phase = 'start'; f.hitDone = false;
    if (move.lunge) f.vx = f.face * move.lunge;
  }

  // ------------------------------------------------------------------ registration
  Cab.register({
    id: 'pdoom',
    name: 'P(DOOM)',
    color: '#ff4fd8',
    blurb: 'Our original game. You\'re a doomer in a hoodie, brawling your way through the AI models to AGI. One shared meter: push their P(doom) to 0%.',
    modes: [
      {
        id: 'arcade', name: 'Arcade', seat: 'ARCADE LADDER',
        you: 'the doomer',
        cpu: 'every AI model, then AGI',
        win: `Beat all ${ROSTER.length} opponents. Push the P(DOOM) meter to 0% in each fight (or have it under 50% when time runs out). You get ${CONTINUES} continues.`,
        intro: [
          '← → move, ↑ jump. Z punch, X kick, hold C to block (or J K L). Phone: on-screen pad and buttons.',
          'The three combos are on screen. Click or tap a card to fire one. Fill HOPE, then Z+X for a super.',
          'Each model has a quirk. Its card tells you how to beat it. (Parody, not affiliated with any AI company.)',
        ],
        help: '←→ move · ↑ jump · Z/J punch · X/K kick · C/L block · Z+X super · tap combo cards',
      },
      {
        id: 'training', name: 'Training', seat: 'PRACTICE ROOM',
        you: 'the doomer',
        cpu: 'any model you pick, no clock',
        win: 'No winning here: practise combos against any opponent. The meter resets when it hits 0% or 100%.',
        intro: [
          'On the model card, ← → (or tap the arrows) to pick who to practise against.',
          'The input ticker under the meter shows what you pressed, and lights up when a combo lands.',
          'Same controls as Arcade.',
        ],
        help: '←→ move · ↑ jump · Z/J punch · X/K kick · C/L block · Z+X super',
      },
    ],

    create(api) {
      const training = api.mode === 'training';
      const low = document.createElement('canvas');
      low.width = LW; low.height = LH;
      const l = low.getContext('2d');

      let stage = Math.min(Math.max(api.level, 1), ROSTER.length) - 1;   // ?level=N starts at fight N
      let continues = CONTINUES, score = 0, clock = 0;
      let phase = 'card', phaseT = 0;             // card -> count -> fight -> ko -> (card | end)
      let you, foe, foeAI, stats, pdoom, timer, hope, decoy, projectiles, popups, shake;
      let lastWinner = null;
      const hist = [];                            // recent inputs for combos
      let tickerFlash = 0, tickerName = '';
      // touch controls
      let touchMode = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
      const vkeys = new Set();                    // virtual held keys from the phone gamepad

      const opp = () => ROSTER[stage];

      function newFight() {
        you = fighter(55, 1, true);
        foe = fighter(145, -1, false);
        stats = aiStats(stage, opp().id);
        foeAI = { think: 0.6, blockT: 0, projCd: 2, memory: [], suggest: null, suggestT: 0, ctx: 0, lastPlayerAtk: -9,
          uses: {}, patched: new Set(), decoyT: 5, taunt: 0 };
        pdoom = 50; timer = FIGHT_TIME; hope = 0; decoy = null; projectiles = []; popups = []; shake = 0;
        hist.length = 0;
      }
      newFight();

      function popup(text, x, y, color = '#ffe74a', size = 12) { popups.push({ text, x, y, color, size, t: 1.2 }); }

      // ---------------------------------------------------------------- input
      const held = (codes) => codes.some((c) => api.keys.has(c) || vkeys.has(c));
      const LEFTK = ['ArrowLeft', 'KeyA', 'v-left'], RIGHTK = ['ArrowRight', 'KeyD', 'v-right'];
      const UPK = ['ArrowUp', 'KeyW', 'v-up'], BLOCKK = ['KeyC', 'KeyL', 'v-block'];

      function pushInput(k) {
        hist.push({ k, t: clock });
        if (hist.length > 8) hist.shift();
      }
      function matched(seq) {
        if (hist.length < seq.length) return false;
        const tail = hist.slice(-seq.length);
        return tail.every((h, i) => h.k === seq[i]) && clock - tail[0].t <= COMBO_WINDOW * (seq.length - 1) + 0.15;
      }
      function dirInput(dir) {
        if (dir === 'U' || dir === 'D') return pushInput(dir);
        pushInput((dir === 'R') === (you.face > 0) ? 'F' : 'B');
      }

      let lastP = -9, lastK = -9;
      function button(b) {
        if (phase === 'card') { if (b !== 'block') beginCount(); return; }
        if (phase !== 'fight') return;
        if (b === 'P') lastP = clock; else if (b === 'K') lastK = clock;
        if ((b === 'P' || b === 'K') && Math.abs(lastP - lastK) < 0.09) return trySuper();
        pushInput(b);
        if (b === 'P') {
          if (matched(COMBOS[0].seq)) return doCombo('unplug');
          act(you.y < FLOOR ? MOVES.air : MOVES.punch, 'punch');
        } else if (b === 'K') {
          if (matched(COMBOS[1].seq)) return doCombo('pause');
          if (matched(COMBOS[2].seq)) return doCombo('redteam');
          act(MOVES.kick, 'kick');
        }
      }

      // Perform (or queue, if mid-move) an attack for the player.
      function act(move, tag) {
        if (you.state === 'ko') return;
        if (busy(you)) { if (you.state === 'attack' && you.phase === 'rec') you.queued = { move, tag }; return; }
        startAttack(you, move);
        you.tag = tag;
        noteUse(tag);
      }

      function doCombo(id) {
        if (busy(you) && !(you.state === 'attack' && you.phase === 'rec')) return;
        const c = COMBOS.find((x) => x.id === id);
        tickerFlash = 1; tickerName = c.name;
        Cab.sfx('launch');
        noteUse(id);
        hist.length = 0;
        if (id === 'unplug') {
          if (you.projCd > clock) return popup('RECHARGING', you.x * S, (you.y - 40) * S, '#9c97bd', 10);
          you.projCd = clock + 1.1;
          you.state = 'attack'; you.move = MOVES.punch; you.t = MOVES.punch.start; you.phase = 'active'; you.hitDone = true; you.tag = 'unplug';
          projectiles.push({ x: you.x + you.face * 10, y: you.y - 20, vx: you.face * 130, owner: you, dmg: 6, kind: 'plug', fake: false, tag: 'unplug' });
        } else {
          startAttack(you, MOVES[id]);
          you.tag = id;
        }
        score += 50;
      }

      function trySuper() {
        if (hope < 100) return;
        // pressing P and K together starts a punch first; a punch still winding up is cancelled
        const windingUp = you.state === 'attack' && you.phase === 'start';
        if (busy(you) && !windingUp) return;
        if (windingUp) { you.state = 'idle'; you.move = null; }
        hope = 0;
        noteUse('super');
        tickerFlash = 1; tickerName = 'OFF SWITCH';
        Cab.sfx('boom');
        shake = 0.5;
        projectiles.push({ x: you.x + you.face * 8, y: you.y - 18, vx: you.face * 260, owner: you, dmg: 16, kind: 'beam', fake: false, tag: 'super', unblockable: true });
        score += 200;
      }

      // AGI tracks what you use and patches your current favourite move: whichever of your
      // last 6 moves you used most (at least 3 times). Switch it up and the patch moves on.
      function noteUse(tag) {
        if (!opp().ai.learns) return;
        const recent = (foeAI.recent = [...(foeAI.recent || []), tag].slice(-6));
        const counts = {};
        for (const m of recent) counts[m] = (counts[m] || 0) + 1;
        const fav = Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0];
        const next = counts[fav] >= 3 ? fav : null;
        if (next && !foeAI.patched.has(next)) {
          popup(`PATCH NOTES: ${next.toUpperCase()} NERFED`, W / 2, 150, '#ff4fd8', 13);
          Cab.sfx('warn');
        }
        foeAI.patched = new Set(next ? [next] : []);
      }

      function beginCount() { phase = 'count'; phaseT = 1.6; Cab.sfx('coin'); }

      // ---------------------------------------------------------------- combo cards
      // Combo cards: clickable/tappable shortcuts.
      const chipY = () => 552;
      const chips = () => COMBOS.map((c, i) => ({ c, x: 120 + i * 190, y: chipY(), w: 178, h: 34 }));

      function jump() { if (phase === 'fight' && you.y >= FLOOR && !busy(you) && you.state !== 'block') you.vy = JUMP_V; }

      // ---------------------------------------------------------------- training: pick opponent
      function cycle(d) { stage = (stage + d + ROSTER.length) % ROSTER.length; newFight(); Cab.sfx('tick'); }

      // ---------------------------------------------------------------- damage
      function hurt(target, attacker, dmg, opts = {}) {
        if (target.state === 'ko') return;
        const isPlayerHit = target.isPlayer;
        const facingAttacker = Math.sign(attacker.x - target.x) === target.face || attacker === target;
        let blocked = target.state === 'block' && facingAttacker && !opts.unblockable;
        // AGI blocks anything it has patched
        if (!isPlayerHit && opp().ai.learns && foeAI.patched.has(opts.tag) && Math.random() < 0.8) blocked = true;
        if (blocked) {
          Cab.sfx('tick');
          target.vx = -target.face * 60;
          const chip = dmg * 0.2;
          isPlayerHit ? (pdoom += chip * stats.dmg) : (pdoom -= chip);
          if (!isPlayerHit && opp().ai.blocker) {
            foeAI.ctx++;
            if (foeAI.ctx >= 4) {
              foeAI.ctx = 0;
              foe.state = 'stun'; foe.stun = 1.8;
              popup('CONTEXT FULL — FORGOT TO BLOCK', W / 2, 150, '#e6cfa8', 11);
              Cab.sfx('warn');
            }
          }
          if (!isPlayerHit && opp().ai.learns && foeAI.patched.has(opts.tag) && !opts.unblockable) {
            popup('PATCHED', target.x * S, (target.y - 44) * S, '#ff4fd8', 10);
          }
          // Every opponent punishes a blocked attack with a quick counter.
          if (!isPlayerHit) { foeAI.counter = true; foeAI.think = Math.min(foeAI.think, 0.08); foeAI.blockT = 0.05; }
          return;
        }
        // Combo breaker: after 4 hits in a row the opponent shoves you off and guards.
        if (!isPlayerHit) {
          foeAI.chain = clock - (foeAI.lastHit || -9) < 0.9 ? (foeAI.chain || 0) + 1 : 1;
          foeAI.lastHit = clock;
          if (foeAI.chain > 4 && !opts.unblockable) {
            foeAI.chain = 0;
            you.vx = -you.face * 220; you.state = 'hit'; you.stun = 0.25; you.move = null;
            target.state = 'block'; foeAI.blockT = 0.6; target.flash = 0;
            popup('COMBO BREAKER', target.x * S, (target.y - 50) * S, '#ff4fd8', 11);
            Cab.sfx('bounce');
            return;
          }
        }
        const k = isPlayerHit ? stats.dmg : 1;
        if (isPlayerHit) pdoom += dmg * k; else { pdoom -= dmg * YOUR_DMG; score += Math.round(dmg * 10); }
        hope = Math.min(100, hope + (isPlayerHit ? 6 : 9));
        target.flash = 0.08;
        target.state = 'hit'; target.t = 0; target.stun = opts.stun ?? 0.25; target.move = null;
        target.vx = Math.sign(target.x - attacker.x || -target.face) * (opts.push ?? 30);
        if (opts.stun >= 0.9) { target.state = 'stun'; target.stun = opts.stun; popup('FROZEN', target.x * S, (target.y - 44) * S, '#9be7ff', 10); }
        if (opts.launch) target.vy = -120;
        Cab.sfx(opts.sfx || 'hit');
        shake = Math.max(shake, opts.dmg >= 10 ? 0.25 : 0.08);
        popup(`${isPlayerHit ? '+' : '-'}${Math.round(dmg * (isPlayerHit ? k : YOUR_DMG))}%`, target.x * S, (target.y - 40) * S, isPlayerHit ? '#ff5d6c' : '#3dff7a', 11);
      }

      // ---------------------------------------------------------------- opponent brain
      function think() {
        const o = opp().ai, me = foe;
        const dist = Math.abs(you.x - me.x);
        foeAI.think = stats.react * U.rand(0.7, 1.3) / o.speed;
        if (busy(me) || me.state === 'stun') return;

        // AGI: counter right after it blocks a patched move
        if (foeAI.counter) { foeAI.counter = false; if (dist < 24) { startAttack(me, dist < 15 ? MOVES.punch : MOVES.kick); return; } }

        // Copilot: replay the player's last three attacks
        if (opp().id === 'copilot' && foeAI.memory.length >= 3 && clock - foeAI.lastPlayerAtk > 0.7 && dist < 26 && !foeAI.suggest) {
          foeAI.suggest = foeAI.memory.slice(-3);
          foeAI.suggestT = 0;
          popup(`DID YOU MEAN: ${foeAI.suggest.map((m) => (m === 'kick' ? 'K' : 'P')).join(' ')}?`, W / 2, 150, '#22c3c0', 12);
        }
        if (foeAI.suggest) return;

        // Claude: won't engage while you're on the attack
        if (o.polite && clock - foeAI.lastPlayerAtk < 1.0 && you.y >= FLOOR) {
          me.state = 'block'; foeAI.blockT = 0.5;
          if (Math.random() < 0.15) popup(U.pick(['I CAN’T HELP WITH THAT', 'LET’S TAKE A BREATH', 'I’D RATHER NOT']), me.x * S, (me.y - 50) * S, '#f4e3d3', 9);
          return;
        }

        // React to an incoming attack
        const threat = (you.state === 'attack' && you.phase !== 'rec' && dist < 26) ||
          projectiles.some((p) => p.owner === you && Math.abs(p.x - me.x) < 40 && !p.fake);
        const blockChance = o.blocker ? 0.75 : stats.block;
        if (threat && Math.random() < blockChance) { me.state = 'block'; foeAI.blockT = 0.35; return; }
        if (threat && Math.random() < 0.15 && me.y >= FLOOR) { me.vy = JUMP_V * 0.9; return; }

        // Projectiles
        if (o.proj && dist > 40 && clock > foeAI.projCd) {
          foeAI.projCd = clock + U.rand(1.6, 2.6) / (1 + stage * 0.08);
          const fake = opp().id === 'chatgpt' && Math.random() < 0.45;
          const big = opp().boss;
          projectiles.push({ x: me.x + me.face * 10, y: me.y - (big ? 22 : 20), vx: me.face * (big ? 150 : 115), owner: me, dmg: big ? 7 : 5, kind: big ? 'eyebeam' : 'fact', fake });
          me.state = 'attack'; me.move = MOVES.punch; me.t = MOVES.punch.start; me.phase = 'active'; me.hitDone = true;
          return;
        }

        // Attack when close
        const reach = o.wild ? 26 : 18;
        if (dist < reach && Math.random() < stats.aggr * (o.wild ? 1.3 : 1)) {
          startAttack(me, Math.random() < 0.55 ? MOVES.punch : MOVES.kick);
          return;
        }
        // Grok trash talk
        if (o.wild && Math.random() < 0.06) popup(U.pick(['BASED', 'RATIO', 'SKILL ISSUE', 'TOUCH GRASS']), me.x * S, (me.y - 50) * S, '#f2f2f2', 9);
        // Otherwise move toward the preferred distance
        const want = o.prefer + (opp().boss && pdoom < 30 ? -12 : 0);
        me.walk = dist > want + 4 ? Math.sign(you.x - me.x) : dist < want - 6 ? -Math.sign(you.x - me.x) : 0;
        if (o.speed > 1.2 && Math.random() < 0.08 && me.y >= FLOOR) me.vy = JUMP_V;
      }

      // ---------------------------------------------------------------- physics / moves
      function stepFighter(f, other, dt) {
        f.anim += dt;
        if (f.flash > 0) f.flash -= dt;
        // gravity
        f.vy += GRAV * dt; f.y += f.vy * dt;
        if (f.y >= FLOOR) { f.y = FLOOR; f.vy = 0; if (f.move === MOVES.air) { f.state = 'idle'; f.move = null; } }
        f.x += f.vx * dt; f.vx *= Math.pow(0.0015, dt);
        f.x = U.clamp(f.x, LEFT, RIGHT);
        if (f.state !== 'ko' && !(f.state === 'attack' && f.move && f.move.lunge)) f.face = Math.sign(other.x - f.x) || f.face;

        if (f.state === 'hit' || f.state === 'stun') {
          f.stun -= dt;
          if (f.stun <= 0) f.state = 'idle';
          return;
        }
        if (f.state === 'attack') {
          const m = f.move;
          f.t += dt;
          f.phase = f.t < m.start ? 'start' : f.t < m.start + m.active ? 'active' : 'rec';
          if (f.phase === 'active' && !f.hitDone) {
            const dx = (other.x - f.x) * f.face, dy = Math.abs(other.y - f.y);
            if (dx > -2 && dx < m.range && dy < (m.air ? 30 : 18)) {
              f.hitDone = true;
              let dmg = m.dmg, tag = f.tag;
              if (!f.isPlayer) dmg = m.dmg;
              hurt(other, f, dmg, { stun: m.stun, push: m.push, sfx: m.sfx, tag, launch: m === MOVES.redteam, dmg });
              if (m.name && f.isPlayer) popup(m.name, f.x * S, (f.y - 52) * S, '#ffe74a', 12);
            }
          }
          if (f.t >= m.start + m.active + m.rec) {
            f.state = 'idle'; f.move = null;
            if (f.queued) { const q = f.queued; f.queued = null; startAttack(f, q.move); f.tag = q.tag; noteUse(q.tag); }
          }
        }
      }

      // ---------------------------------------------------------------- end of fight
      function koCheck() {
        if (pdoom <= 0 || pdoom >= 100 || (!training && timer <= 0)) {
          const youWon = training ? pdoom <= 0 : pdoom <= 0 || (timer <= 0 && pdoom < 50);
          if (training) {
            popup(youWon ? 'P(DOOM) 0% — RESET' : 'P(DOOM) 100% — RESET', W / 2, 220, youWon ? '#3dff7a' : '#ff5d6c', 14);
            pdoom = 50; Cab.sfx(youWon ? 'level' : 'point');
            return;
          }
          lastWinner = youWon ? 'you' : 'foe';
          (youWon ? foe : you).state = 'ko';
          phase = 'ko'; phaseT = 2.4;
          if (youWon) score += 500 + Math.ceil(timer) * 10;
          Cab.sfx(youWon ? 'level' : 'lifeLost');
          shake = 0.4;
        }
      }

      function afterKO() {
        if (lastWinner === 'you') {
          if (stage >= ROSTER.length - 1) {
            saveHi();
            return api.end({ win: true, title: 'P(DOOM) = 0%', text: `You beat every model, AGI included. Humanity is fine. Probably.<br>Score <b>${score}</b>${hiText()}` });
          }
          stage++;
        } else {
          continues--;
          if (continues < 0) {
            saveHi();
            return api.end({ win: false, title: 'P(DOOM) = 100%', text: `${opp().name} won. You reached fight ${stage + 1} of ${ROSTER.length}.<br>Score <b>${score}</b>${hiText()}` });
          }
        }
        newFight();
        phase = 'card';
      }
      let hi = 0;
      try { hi = +localStorage.getItem('pdoom.hi') || 0; } catch (e) { /* storage blocked */ }
      function saveHi() { if (score > hi) { hi = score; try { localStorage.setItem('pdoom.hi', String(hi)); } catch (e) { /* storage blocked */ } } }
      const hiText = () => (score >= hi ? ' (new high score!)' : ` · High score ${hi}`);

      // ---------------------------------------------------------------- per-frame
      function update(dt) {
        clock += dt;
        if (pad) pad.classList.toggle('pd-super-ready', hope >= 100);
        if (tickerFlash > 0) tickerFlash -= dt;
        if (shake > 0) shake -= dt;
        for (const p of popups) { p.t -= dt; p.y -= 30 * dt; }
        for (let i = popups.length - 1; i >= 0; i--) if (popups[i].t <= 0) popups.splice(i, 1);

        if (phase === 'card') { you.anim += dt; foe.anim += dt; return; }
        if (phase === 'count') { phaseT -= dt; if (phaseT <= 0) phase = 'fight'; return; }
        if (phase === 'ko') {
          phaseT -= dt;
          stepFighter(you, foe, dt); stepFighter(foe, you, dt);
          if (phaseT <= 0) afterKO();
          return;
        }

        // --- player movement
        const blocking = held(BLOCKK) && you.y >= FLOOR && !busy(you);
        if (blocking) you.state = 'block';
        else if (you.state === 'block') you.state = 'idle';
        if (!busy(you) && !blocking) {
          const dir = (held(RIGHTK) ? 1 : 0) - (held(LEFTK) ? 1 : 0);
          if (dir) { you.x += dir * WALK * dt; if (you.y >= FLOOR) you.state = 'walk'; }
          else if (you.state === 'walk') you.state = 'idle';
        }

        // --- opponent movement / brain
        if ((foeAI.think -= dt) <= 0) think();
        if (foe.state === 'block' && (foeAI.blockT -= dt) <= 0) foe.state = 'idle';
        if (!busy(foe) && foe.state !== 'block' && foe.walk) {
          foe.x += foe.walk * WALK * opp().ai.speed * dt;
          foe.state = 'walk';
        } else if (foe.state === 'walk' && !foe.walk) foe.state = 'idle';
        // Copilot plays out its suggestion, one attack every 0.35 s
        if (foeAI.suggest && !busy(foe)) {
          foeAI.suggestT -= dt;
          if (foeAI.suggestT <= 0) {
            const m = foeAI.suggest.shift();
            startAttack(foe, m === 'kick' ? MOVES.kick : MOVES.punch);
            foeAI.suggestT = 0.05;
            if (!foeAI.suggest.length) { foeAI.suggest = null; foeAI.memory = []; }
          }
        }
        // Gemini's twin
        if (opp().id === 'gemini') {
          foeAI.decoyT -= dt;
          if (!decoy && foeAI.decoyT <= 0) {
            const side = you.x < LW / 2 ? 1 : -1;
            decoy = fighter(U.clamp(you.x + side * 24, LEFT, RIGHT), -side, false);
            decoy.life = 3; decoy.swung = false;
            foeAI.decoyT = U.rand(5, 7) - stage * 0.2;
            popup('TWIN!', decoy.x * S, (decoy.y - 50) * S, '#c49bff', 11);
            Cab.sfx('warn');
          }
          if (decoy) {
            decoy.life -= dt;
            if (!decoy.swung && decoy.life < 2.2 && !busy(decoy)) { startAttack(decoy, MOVES.punch); decoy.swung = true; }
            stepFighter(decoy, you, dt);
            if (decoy.life <= 0) decoy = null;
          }
        }

        // remember player attacks (Copilot, Claude)
        if (you.state === 'attack' && you.t < dt * 1.5 && (you.tag === 'punch' || you.tag === 'kick')) {
          foeAI.memory.push(you.tag);
          if (foeAI.memory.length > 6) foeAI.memory.shift();
        }
        if (you.state === 'attack') foeAI.lastPlayerAtk = clock;

        stepFighter(you, foe, dt);
        stepFighter(foe, you, dt);
        // keep bodies apart
        const gap = foe.x - you.x;
        if (Math.abs(gap) < 11 && Math.abs(you.y - foe.y) < 20) {
          const push = (11 - Math.abs(gap)) / 2 * Math.sign(gap || 1);
          you.x = U.clamp(you.x - push, LEFT, RIGHT); foe.x = U.clamp(foe.x + push, LEFT, RIGHT);
        }
        // player hitting the twin pops it
        if (decoy && you.state === 'attack' && you.phase === 'active' && !you.hitDone) {
          const dx = (decoy.x - you.x) * you.face;
          if (dx > -2 && dx < you.move.range) { popup('POP', decoy.x * S, (decoy.y - 40) * S, '#c49bff', 11); decoy = null; Cab.sfx('pop'); hope = Math.min(100, hope + 5); }
        }
        if (decoy && decoy.state === 'attack' && decoy.phase === 'active' && !decoy.hitDone) {
          const dx = (you.x - decoy.x) * decoy.face;
          if (dx > -2 && dx < 16) { decoy.hitDone = true; hurt(you, decoy, 4, { stun: 0.25, push: 30 }); }
        }

        // --- projectiles
        for (let i = projectiles.length - 1; i >= 0; i--) {
          const p = projectiles[i];
          p.x += p.vx * dt;
          const target = p.owner === you ? foe : you;
          if (Math.abs(p.x - target.x) < 7 && Math.abs((target.y - 16) - p.y) < 16) {
            if (p.fake) { popup('MADE UP', p.x * S, (p.y - 10) * S, '#9c97bd', 9); projectiles.splice(i, 1); continue; }
            hurt(target, p.owner, p.dmg, { stun: p.kind === 'beam' ? 0.7 : 0.3, push: p.kind === 'beam' ? 90 : 40, unblockable: p.unblockable, tag: p.tag, sfx: p.kind === 'beam' ? 'boom' : 'hit' });
            projectiles.splice(i, 1);
            continue;
          }
          if (p.x < -10 || p.x > LW + 10) projectiles.splice(i, 1);
        }

        timer -= dt;
        pdoom = U.clamp(pdoom, 0, 100);
        koCheck();
      }

      // ---------------------------------------------------------------- drawing
      function draw(g) {
        // low-res arena
        drawStage(l, opp().stage, clock);
        const all = [you, foe];
        if (decoy) drawBot(l, decoy, opp().look, 0.55 + Math.sin(clock * 20) * 0.15);
        for (const f of all) f.isPlayer ? drawDoomer(l, f) : drawBot(l, f, opp().look);
        for (const p of projectiles) {
          if (p.fake) { l.globalAlpha = Math.floor(clock * 15) % 2 ? 0.25 : 0.55; }
          if (p.kind === 'plug') { l.fillStyle = '#222'; l.fillRect(p.x - 3, p.y - 2, 6, 4); l.fillStyle = '#ffe74a'; l.fillRect(p.x + Math.sign(p.vx) * 3, p.y - 2, 2, 1); l.fillRect(p.x + Math.sign(p.vx) * 3, p.y + 1, 2, 1); l.fillStyle = '#444'; l.fillRect(p.x - Math.sign(p.vx) * 14, p.y, 11, 1); }
          else if (p.kind === 'beam') { l.fillStyle = '#ffe74a'; l.fillRect(p.x - 14, p.y - 4, 28, 8); l.fillStyle = '#fff'; l.fillRect(p.x - 12, p.y - 2, 24, 4); }
          else if (p.kind === 'eyebeam') { l.fillStyle = '#ff4fd8'; l.fillRect(p.x - 8, p.y - 2, 16, 4); l.fillStyle = '#fff'; l.fillRect(p.x - 6, p.y - 1, 12, 2); }
          else { l.fillStyle = opp().look.body; l.fillRect(p.x - 4, p.y - 3, 8, 6); l.fillStyle = '#fff'; l.fillRect(p.x - 2, p.y - 1, 4, 1); }
          l.globalAlpha = 1;
        }

        // scale up, with screen shake
        g.save();
        g.imageSmoothingEnabled = false;
        const sx = shake > 0 ? U.rand(-4, 4) : 0, sy = shake > 0 ? U.rand(-3, 3) : 0;
        g.drawImage(low, sx, sy, W, H);
        g.restore();

        drawHUD(g);
        for (const p of popups) { g.globalAlpha = Math.min(1, p.t * 2); D.text(g, p.text, p.x, p.y, p.size, p.color, 'center'); g.globalAlpha = 1; }
        if (phase === 'card') drawCard(g);
        if (phase === 'count') {
          const n = Math.ceil(phaseT / 0.55);
          D.text(g, n > 1 ? String(n - 1) : 'ALIGN!', W / 2, H / 2 - 40, n > 1 ? 40 : 34, n > 1 ? '#fff' : '#ff4fd8', 'center');
        }
        if (phase === 'ko') {
          D.text(g, lastWinner === 'you' ? `${opp().name.toUpperCase()}: SHUT DOWN` : 'YOU GOT ALIGNED', W / 2, H / 2 - 40, 22, lastWinner === 'you' ? '#3dff7a' : '#ff5d6c', 'center');
          if (lastWinner !== 'you') D.text(g, continues > 0 ? `CONTINUES LEFT: ${continues}` : 'NO CONTINUES LEFT', W / 2, H / 2, 12, '#fff', 'center');
        }
        D.testTag(g, api.level);
      }

      function drawHUD(g) {
        // The P(DOOM) tug-of-war meter
        const x0 = 150, w = 500, y = 14;
        g.fillStyle = '#000a'; g.fillRect(x0 - 4, y - 4, w + 8, 26);
        const gr = g.createLinearGradient(x0, 0, x0 + w, 0);
        gr.addColorStop(0, '#3dff7a'); gr.addColorStop(0.5, '#ffe74a'); gr.addColorStop(1, '#ff3b4f');
        g.fillStyle = gr; g.fillRect(x0, y, w, 18);
        g.fillStyle = '#ffffff55'; g.fillRect(x0 + w / 2 - 1, y - 2, 2, 22);
        const mx = x0 + (w * pdoom) / 100;
        g.fillStyle = '#fff'; g.fillRect(mx - 3, y - 4, 6, 26);
        D.text(g, `P(DOOM) ${Math.round(pdoom)}%`, W / 2, y + 26, 11, '#fff', 'center');
        D.text(g, 'YOU', x0 - 10, y + 4, 10, '#3dff7a', 'right');
        D.text(g, opp().name.toUpperCase(), x0 + w + 10, y + 4, 10, '#ff5d6c', 'left');
        // clock / stage / score
        if (!training) {
          D.text(g, String(Math.max(0, Math.ceil(timer))), W / 2, y + 44, 14, timer < 10 ? '#ff5d6c' : '#ffe74a', 'center');
          D.text(g, `FIGHT ${stage + 1}/${ROSTER.length}`, 12, 50, 9, '#c9c4ec');
          D.text(g, `SCORE ${score}`, W - 12, 50, 9, '#c9c4ec', 'right');
          D.text(g, `CONTINUES ${Math.max(0, continues)}`, W - 12, 64, 8, '#9c97bd', 'right');
        } else D.text(g, 'TRAINING', 12, 50, 9, '#c9c4ec');
        // opponent quirk tag
        D.text(g, `QUIRK: ${opp().quirk}`, 12, 64, 8, '#ff4fd8');
        if (opp().ai.blocker) {          // Llama's context window
          D.text(g, 'CONTEXT', 12, 78, 7, '#e6cfa8');
          for (let i = 0; i < 4; i++) { g.fillStyle = i < foeAI.ctx ? '#e6cfa8' : '#3a3046'; g.fillRect(80 + i * 12, 78, 9, 7); }
        }
        if (opp().ai.learns) D.text(g, foeAI.patched.size ? `PATCHED: ${[...foeAI.patched][0].toUpperCase()} (SWITCH IT UP)` : 'PATCHED: NOTHING YET', 12, 78, 7, '#ff4fd8');

        // HOPE (super) meter
        const hx = 12, hy = 520;
        D.text(g, hope >= 100 ? 'HOPE FULL: Z+X!' : 'HOPE', hx, hy, 8, hope >= 100 ? '#ffe74a' : '#9c97bd');
        g.fillStyle = '#222'; g.fillRect(hx + 130, hy, 140, 8);
        g.fillStyle = hope >= 100 ? (Math.floor(clock * 6) % 2 ? '#ffe74a' : '#fff') : '#ffe74a99'; g.fillRect(hx + 130, hy, 140 * hope / 100, 8);

        // input ticker: what you pressed recently
        const icons = { F: '→', B: '←', U: '↑', D: '↓', P: 'P', K: 'K' };
        const recent = hist.filter((h) => clock - h.t < 1.2).slice(-6).map((h) => icons[h.k]).join(' ');
        if (tickerFlash > 0) D.text(g, tickerName, W / 2, 488, 14, '#ffe74a', 'center');
        else if (recent) D.text(g, recent, W / 2, 488, 18, '#c9c4ec', 'center', 'sans');

        // combo cards
        for (const ch of chips()) {
          const ready = ch.c.id !== 'unplug' || !(you.projCd > clock);
          g.fillStyle = '#000b'; g.fillRect(ch.x, ch.y, ch.w, ch.h);
          g.strokeStyle = ready ? '#ff4fd8' : '#4a4060'; g.lineWidth = 2; g.strokeRect(ch.x + 1, ch.y + 1, ch.w - 2, ch.h - 2);
          D.text(g, ch.c.name, ch.x + 8, ch.y + 6, 8, ready ? '#fff' : '#777');
          D.text(g, ch.c.show, ch.x + 8, ch.y + 16, 15, '#ffe74a', 'left', 'sans');
        }
      }

      function drawCard(g) {
        const o = opp();
        g.fillStyle = '#05030dee'; g.fillRect(60, 110, 680, 380);
        g.strokeStyle = '#ff4fd8'; g.lineWidth = 3; g.strokeRect(61.5, 111.5, 677, 377);
        D.text(g, training ? 'TRAINING · PICK AN OPPONENT' : `FIGHT ${stage + 1} OF ${ROSTER.length}${o.boss ? ' · FINAL BOSS' : ''}`, W / 2, 128, 10, '#9c97bd', 'center');
        D.text(g, 'MODEL CARD', 90, 156, 9, '#ff4fd8');
        D.text(g, o.name.toUpperCase(), 90, 172, 26, '#fff');
        D.text(g, `KNOWN QUIRK: ${o.quirk}`, 90, 214, 11, '#ffe74a');
        D.text(g, `“${o.line}”`, 90, 244, 14, '#c9c4ec', 'left', 'sans');
        wrap(g, o.tip, 90, 280, 560, 16, '#ece9ff');
        D.text(g, `PARAMETERS: ${['A LOT', 'TOO MANY', 'UNDISCLOSED', 'OPEN-ISH', 'SPICY', 'CAREFULLY TUNED', '∞'][ROSTER.indexOf(o)]}`, 90, 350, 9, '#9c97bd');
        D.text(g, 'TRAINING DATA: THE INTERNET (SORRY)', 90, 366, 9, '#9c97bd');
        if (training) D.text(g, '◀   ← / → to change opponent   ▶', W / 2, 396, 15, '#3ee6ff', 'center', 'sans');
        if (Math.floor(clock * 2) % 2 === 0) D.text(g, touchMode ? 'TAP TO FIGHT' : 'PRESS PUNCH OR KICK TO FIGHT', W / 2, 432, 13, '#3dff7a', 'center');
        D.text(g, 'Parody. Not affiliated with OpenAI, Google, Microsoft, Meta, xAI or Anthropic.', W / 2, 466, 11, '#6d6890', 'center', 'sans');
      }
      function wrap(g, text, x, y, maxW, size, color) {
        g.font = `600 ${size}px Inter, system-ui, sans-serif`;
        const words = text.split(' ');
        let line = '', yy = y;
        for (const w of words) {
          if (g.measureText(line + w).width > maxW) { D.text(g, line, x, yy, size, color, 'left', 'sans'); line = ''; yy += size + 6; }
          line += w + ' ';
        }
        D.text(g, line, x, yy, size, color, 'left', 'sans');
      }

      // ---------------------------------------------------------------- phone gamepad
      // On touch screens the cabinet's control panel turns into a real gamepad (big HTML
      // buttons below the screen), instead of tiny buttons drawn on the canvas.
      let pad = null;
      function buildPad() {
        if (pad || typeof document === 'undefined') return;
        const anchor = document.querySelector('.control-panel');
        if (!anchor) return;
        pad = document.createElement('div');
        pad.className = 'pd-pad';
        pad.innerHTML = `
          <div class="pd-dpad">
            <button data-d="U" aria-label="Jump">▲</button>
            <button data-d="L" aria-label="Left">◀</button>
            <button data-d="R" aria-label="Right">▶</button>
            <button data-d="D" aria-label="Down">▼</button>
          </div>
          <div class="pd-combos">
            ${COMBOS.map((c) => `<button data-c="${c.id}"><b>${c.name}</b><span>${c.show}</span></button>`).join('')}
          </div>
          <div class="pd-btns">
            <button data-b="P" class="pd-p">PUNCH</button>
            <button data-b="K" class="pd-k">KICK</button>
            <button data-b="block" class="pd-blk">BLOCK</button>
            <button data-b="super" class="pd-sup">SUPER</button>
          </div>`;
        anchor.parentNode.insertBefore(pad, anchor);
        const press = (el, down) => {
          const d = el.dataset.d, b = el.dataset.b, c = el.dataset.c;
          el.classList.toggle('on', down);
          if (d) {
            const vk = { L: 'v-left', R: 'v-right', U: 'v-up' }[d];
            if (down) { if (vk) vkeys.add(vk); if (d === 'U') jump(); dirInput(d); }
            else if (vk) vkeys.delete(vk);
          } else if (b && down) {
            if (b === 'block') vkeys.add('v-block');
            else if (b === 'super') trySuper();
            else button(b);
          } else if (b === 'block') vkeys.delete('v-block');
          else if (c && down && phase === 'fight') doCombo(c);
          if (down && phase === 'card' && !d) beginCount();
        };
        pad.querySelectorAll('button').forEach((el) => {
          el.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            try { el.setPointerCapture(e.pointerId); } catch (err) { /* pointer already gone */ }
            press(el, true);
          });
          ['pointerup', 'pointercancel'].forEach((t) => el.addEventListener(t, () => press(el, false)));
          el.addEventListener('contextmenu', (e) => e.preventDefault());
        });
      }
      if (touchMode) buildPad();

      // ---------------------------------------------------------------- events
      return {
        destroy() { if (pad) pad.remove(); },
        _dbg: () => ({ stage, continues, phase, lastWinner, pdoom }), // read-only view for tests
        key(code) {
          if (phase === 'card' && training && (code === 'ArrowLeft' || code === 'ArrowRight')) return cycle(code === 'ArrowLeft' ? -1 : 1);
          if (code === 'ArrowUp' || code === 'KeyW') { dirInput('U'); jump(); }
          else if (code === 'ArrowDown' || code === 'KeyS') dirInput('D');
          else if (code === 'ArrowLeft' || code === 'KeyA') dirInput('L');
          else if (code === 'ArrowRight' || code === 'KeyD') dirInput('R');
          else if (code === 'KeyZ' || code === 'KeyJ') button('P');
          else if (code === 'KeyX' || code === 'KeyK') button('K');
          else if (code === 'Space' || code === 'KeyV') { if (phase === 'card') beginCount(); else trySuper(); }
          else if (code === 'Enter' && phase === 'card') beginCount();
        },
        pointer(type, x, y, e) {
          if (e && e.pointerType === 'touch' && !touchMode) { touchMode = true; buildPad(); }
          if (type === 'down') {
            if (phase === 'card') {
              if (training && y > 385 && y < 420) return cycle(x < W / 2 ? -1 : 1);
              return beginCount();
            }
            for (const ch of chips()) {
              if (x > ch.x && x < ch.x + ch.w && y > ch.y && y < ch.y + ch.h) {
                if (phase === 'fight') doCombo(ch.c.id);
                return;
              }
            }
            if (!touchMode) {                     // mouse: click = punch, right-click = kick
              if (phase === 'fight') button(e && e.button === 2 ? 'K' : 'P');
              return;
            }
            if (phase === 'fight') button('P');          // tapping the screen punches
          }
        },
        update,
        draw,
      };
    },
  });
})();
