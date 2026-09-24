/* Imitation: a Turing-test chat.
 *
 * Classic ("Who's there?"): you chat for two minutes, then guess whether your partner was
 *   a human or the computer. Quick Match looks for another browser searching at the same
 *   time (PeerJS/WebRTC, no server of ours). If nobody turns up, a computer partner steps in.
 *   The matchmaking screen and its timing look the same either way. A private room code
 *   always pairs two humans. The computer partner gets more convincing each time you meet it.
 * Flip ("Prove it"): the computer interrogates you and decides whether you are human, using
 *   how you type (timing, pasting, speed) and what you say. Its bar rises every round.
 *
 * Nothing here calls an AI service. The computer's side is the Bot and Judge below.
 */
(function () {
  'use strict';
  const { U } = Cab;
  const PREFIX = 'cocktail-cabinet-imitation-v1-';
  const LOBBY_SLOTS = 4;
  const CHAT_SECONDS = 120, GUESS_AFTER = 40;

  const store = {
    get(k, d) { try { const v = localStorage.getItem('imi.' + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('imi.' + k, JSON.stringify(v)); } catch (e) { /* private mode */ } },
  };

  // =================================================================== persona + bot
  const NAMES = ['maya', 'jordan', 'eli', 'sam', 'noa', 'ari', 'chris', 'dani', 'tyler', 'leah', 'marcus', 'priya', 'jake', 'sofia', 'ben', 'rachel'];
  const CITIES = [['brooklyn', 'ny'], ['queens', 'ny'], ['newark', 'nj'], ['philly', 'pa'], ['baltimore', 'md'], ['cleveland', 'oh'], ['austin', 'tx'], ['chicago', 'il'], ['boston', 'ma'], ['miami', 'fl']];
  const STUDY = ['cs', 'bio', 'psych', 'nursing', 'business', 'accounting', 'econ', 'graphic design', 'pre-med', 'education'];
  const HOBBIES = ['basketball', 'video games', 'cooking', 'drawing', 'the gym', 'guitar', 'running', 'reading', 'photography', 'thrifting', 'chess', 'baking', 'hiking', 'anime'];
  const FOODS = ['pizza', 'sushi', 'tacos', 'chicken over rice', 'pad thai', 'a bagel', 'ramen', 'shawarma', 'pasta', 'cereal lol'];
  const ACTIVITIES = ['procrastinating on hw', 'waiting for my laundry', 'on my break', 'avoiding a lab report', 'eating', 'in bed on my laptop', 'waiting for class to start', 'supposed to be studying'];
  const PETS = ['a cat named mochi', 'a dog, hes a menace', 'no pets, my building doesnt allow them', 'a fish that refuses to die', 'two cats'];
  const SHOWS = ['the bear', 'severance', 'one piece', 'love island (dont judge)', 'the office for the 5th time', 'nothing rn tbh'];
  const MUSIC = ['sza', 'drake', 'taylor swift', 'kendrick', 'the weeknd', 'lofi stuff', 'a lot of 2000s pop', 'olivia rodrigo'];

  function makePersona() {
    const [city, st] = U.pick(CITIES);
    const h = U.shuffle(HOBBIES.slice());
    return {
      name: U.pick(NAMES), age: U.randi(18, 24), city, st, study: U.pick(STUDY), year: U.pick(['freshman', 'sophomore', 'junior', 'senior']),
      hobbies: [h[0], h[1]], food: U.pick(FOODS), activity: U.pick(ACTIVITIES), pet: U.pick(PETS), show: U.pick(SHOWS), music: U.pick(MUSIC),
      weather: U.pick(['kinda cloudy', 'raining ugh', 'actually nice', 'freezing', 'so humid']),
    };
  }

  const NEIGHBOR = 'qwertyuiopasdfghjklzxcvbnm';
  function typo(word) {
    if (word.length < 4) return word;
    const i = U.randi(1, word.length - 2);
    const r = Math.random();
    if (r < 0.4) return word.slice(0, i) + word[i + 1] + word[i] + word.slice(i + 2);           // swap
    if (r < 0.7) return word.slice(0, i) + word.slice(i + 1);                                   // drop
    const k = NEIGHBOR.indexOf(word[i]);
    return word.slice(0, i) + (k >= 0 ? NEIGHBOR[U.wrap(k + U.pick([-1, 1]), NEIGHBOR.length)] : word[i]) + word.slice(i + 1);
  }

  // The computer chat partner. level 1..4: higher = slower, messier, better memory.
  class Bot {
    constructor(level, out) {
      this.level = U.clamp(level, 1, 4);
      this.p = makePersona();
      this.out = out;            // { typing(bool), say(text) }
      this.timers = [];
      this.used = new Set();
      this.asked = new Set();
      this.userName = null;
      this.firstUserMsg = null;
      this.userMsgs = 0;
      this.busyUntil = 0;
      this.queue = [];
      this.lastActivity = Date.now();
      this.dead = false;
    }
    later(ms, fn) { const t = setTimeout(() => { if (!this.dead) fn(); }, ms); this.timers.push(t); return t; }
    stop() { this.dead = true; this.timers.forEach(clearTimeout); }

    start() {
      if (Math.random() < 0.5) this.later(U.rand(2500, 6000), () => { if (!this.userMsgs) this.send(U.pick(['hey', 'hi', 'hey whats up', 'hii', 'yo'])); });
      this.idleLoop();
    }
    idleLoop() {
      this.later(4000, () => {
        const quiet = Date.now() - this.lastActivity;
        if (quiet > U.rand(16000, 26000) && !this.queue.length) {
          this.send(this.userMsgs ? this.question() || 'u still there?' : U.pick(['hello?', 'hey', 'so uh hi']));
        }
        this.idleLoop();
      });
    }

    style(text) {
      let s = text;
      const lower = [0.55, 0.75, 0.85, 0.9][this.level - 1];
      if (Math.random() < lower) s = s.toLowerCase(); else s = s[0].toUpperCase() + s.slice(1);
      if (Math.random() < 0.7) s = s.replace(/[.]$/, '');
      let fixed = null;
      const typoP = [0.03, 0.08, 0.12, 0.14][this.level - 1];
      if (Math.random() < typoP) {
        const words = s.split(' ');
        const i = words.findIndex((w) => w.length >= 5 && /^[a-z]+$/i.test(w));
        if (i >= 0) {
          const bad = typo(words[i]);
          if (bad !== words[i]) {
            if (this.level >= 2 && Math.random() < 0.5) fixed = '*' + words[i];
            words[i] = bad;
            s = words.join(' ');
          }
        }
      }
      return { s, fixed };
    }

    // Queue a message with human-ish thinking + typing time.
    send(text, opts = {}) {
      this.lastActivity = Date.now();
      const { s, fixed } = this.style(text);
      const perChar = [95, 160, 210, 240][this.level - 1] * U.rand(0.8, 1.25);
      const think = opts.quick ? U.rand(400, 900) : U.rand(900, 2600) + (this.level >= 3 ? U.rand(0, 1800) : 0);
      const start = Math.max(Date.now(), this.busyUntil) + think;
      const typeMs = Math.min(s.length * perChar, 11000);
      this.busyUntil = start + typeMs;
      this.queue.push(1);
      this.later(start - Date.now(), () => this.out.typing(true));
      // Humans sometimes pause mid-typing.
      if (typeMs > 3500 && Math.random() < 0.35) {
        this.later(start - Date.now() + typeMs * 0.4, () => this.out.typing(false));
        this.later(start - Date.now() + typeMs * 0.4 + 900, () => this.out.typing(true));
        this.busyUntil += 900;
      }
      this.later(this.busyUntil - Date.now(), () => {
        this.out.typing(false);
        this.out.say(s);
        this.queue.pop();
        this.lastActivity = Date.now();
        if (fixed) this.send(fixed, { quick: true });
      });
    }

    pickLine(lines) {
      const fresh = lines.filter((l) => !this.used.has(l));
      const l = U.pick(fresh.length ? fresh : lines);
      this.used.add(l);
      return l;
    }

    question() {
      const qs = [
        ['where', 'where are u from'], ['school', 'u in school?'], ['doing', 'what are u up to today'], ['games', 'did u try the other games on here'],
        ['weird', 'this game is kinda weird ngl'], ['food', 'what did u eat today'], ['show', 'watching anything good lately'], ['music', 'what music are u into'],
      ].filter(([k]) => !this.asked.has(k));
      if (!qs.length) return null;
      const [k, q] = U.pick(qs);
      this.asked.add(k);
      return q;
    }

    hear(raw) {
      this.lastActivity = Date.now();
      this.userMsgs++;
      if (!this.firstUserMsg) this.firstUserMsg = raw;
      const t = ' ' + raw.toLowerCase().replace(/[’']/g, '').replace(/\s+/g, ' ').trim() + ' ';
      // If already mid-reply, sometimes just fold this into it (people don't answer every line).
      if (this.queue.length >= 2 && Math.random() < 0.6) return;
      const reply = this.respond(t, raw);
      const parts = Array.isArray(reply) ? reply : [reply];
      parts.filter(Boolean).forEach((r) => this.send(r));
      if (this.level >= 2 && parts.length === 1 && Math.random() < 0.22 + this.level * 0.05) {
        const q = this.question();
        if (q) this.send(q);
      }
    }

    respond(t, raw) {
      const p = this.p;
      const has = (re) => re.test(t);
      let m;
      // introductions
      if ((m = t.match(/ (?:my name is|my names|call me|this is) ([a-z]+)/)) || (m = t.match(/^ (?:im|i am) ([a-z]+) $/))) {
        const nm = m[1];
        if (!['good', 'fine', 'ok', 'okay', 'bored', 'tired', 'here', 'human', 'not', 'a', 'just', 'so', 'doing', 'great'].includes(nm)) {
          this.userName = nm;
          return this.pickLine([`nice to meet u ${nm}`, `hey ${nm}`, `${nm} is a good name`]) + (this.asked.has('name') ? '' : `, im ${p.name}`);
        }
      }
      if (has(/\b(are|r) (you|u) (a )?(bot|ai|robot|human|real|chatgpt|computer|person)|\b(bot|ai|robot|chatgpt|gpt|claude|computer)\b.*\?|prove/)) {
        return this.pickLine([
          'lol no', 'i was literally about to ask u that', 'thats exactly what a bot would ask', 'no?? are u',
          'beep boop. jk', 'idk man are any of us real', 'human last time i checked', 'nah im a person lol. r u?',
        ]);
      }
      if (has(/what(s| is) (ur|your) name|who (are|r) (you|u)|ur name/)) { this.asked.add('name'); return [`${p.name}`, this.userName ? null : 'u?']; }
      if (has(/how (are|r) (you|u)|hows it going|how u doing|how are things|wbu|hbu/)) return this.pickLine([`good just ${p.activity}. u?`, `im ok, kinda tired`, `pretty good! ${p.activity} lol`, 'meh. its been a day']);
      if (has(/what(re| are| r) (you|u) (doing|up to)|wyd|whatcha doing/)) return this.pickLine([`${p.activity}`, `nothing much, ${p.activity}`, 'talking to u lol']);
      if (has(/how old|ur age|your age|what age/)) return this.pickLine([`${p.age}`, `${p.age} u?`, `${p.age} why lol`]);
      if (has(/where (are|r) (you|u)|where.*from|what (city|state)|where do (you|u) live/)) { this.asked.add('where'); return this.pickLine([`${p.city}`, `${p.city}, ${p.st}`, `${p.st}, near ${p.city}`]); }
      if (has(/\b(school|college|major|study|studying|class|classes|uni|university|semester)\b/)) { this.asked.add('school'); return this.pickLine([`yeah im a ${p.year}, ${p.study}`, `${p.study} major. its a lot`, `yea ${p.study}. dont ask how its going lol`]); }
      if (has(/\b(job|work)\b/)) return this.pickLine(['i work part time at a store, its fine', 'just school rn, no job', 'i tutor sometimes']);
      if (has(/hobb|for fun|free time|like to do|into anything/)) return this.pickLine([`${p.hobbies[0]} mostly`, `${p.hobbies[0]} and ${p.hobbies[1]}`, `honestly ${p.hobbies[1]}, when i have time`]);
      if ((m = t.match(/(?:fav|favorite|favourite) ([a-z]+)/))) {
        const k = m[1];
        if (/food|meal|dish/.test(k)) return p.food;
        if (/show|movie|series/.test(k)) return p.show;
        if (/music|song|artist|band|singer/.test(k)) return p.music;
        if (/color|colour/.test(k)) return this.pickLine(['green probably', 'black lol', 'blue? idk']);
        if (/game/.test(k)) return this.pickLine(['snake on here is lowkey fun', 'minecraft forever', 'mario kart']);
        return this.pickLine(['hmm hard to pick', 'idk i change my mind a lot', `uhh ${k}? thats tough`]);
      }
      if (has(/\b(eat|ate|food|lunch|dinner|breakfast|hungry|snack)\b/)) { this.asked.add('food'); return this.pickLine([`i had ${p.food}`, `${p.food} earlier`, 'i havent eaten yet actually, i should']); }
      if (has(/\b(pet|pets|dog|cat)\b/)) return p.pet;
      if (has(/\b(show|movie|netflix|watch|watching)\b/)) { this.asked.add('show'); return this.pickLine([`${p.show}`, `been watching ${p.show}`]); }
      if (has(/\b(music|song|listen|artist)\b/)) { this.asked.add('music'); return this.pickLine([`${p.music} mostly`, `lately ${p.music}`]); }
      if (has(/\b(weather|rain|raining|snow|hot|cold|sunny|outside)\b/)) return `its ${p.weather} here`;
      if (has(/what time|whats the time|time is it/)) {
        const d = new Date();
        const h = d.getHours() % 12 || 12, mm = String(d.getMinutes()).padStart(2, '0');
        return this.pickLine([`like ${h}:${mm}`, `${h}:${mm} for me`, `almost ${h + (d.getMinutes() > 40 ? 1 : 0)}`]);
      }
      if (has(/what day|today is|what date/)) return new Date().toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase() + ' lol why';
      if ((m = t.match(/(-?\d+(?:\.\d+)?)\s*([+\-*x×\/])\s*(-?\d+(?:\.\d+)?)/))) {
        const a = +m[1], b = +m[3], op = m[2];
        const v = op === '+' ? a + b : op === '-' ? a - b : op === '/' ? a / b : a * b;
        if (Math.abs(a) <= 12 && Math.abs(b) <= 12) return `${Math.round(v * 100) / 100}`;
        if (this.level >= 2 && Math.random() < 0.6) return this.pickLine(['bro im not doing math rn', 'is this a test lol', 'idk use a calculator']);
        return `uhh like ${Math.round(v / 10 ** Math.max(0, String(Math.round(v)).length - 2)) * 10 ** Math.max(0, String(Math.round(v)).length - 2)}? roughly`;
      }
      if (has(/what did i (say|ask)|what was (my|the) first|remember/)) {
        if (this.level >= 3 && this.firstUserMsg) return `u said "${this.firstUserMsg.slice(0, 40).toLowerCase()}"`;
        return this.pickLine(['i dont remember lol', 'scroll up lol']);
      }
      if (has(/\b(say|type|spell|repeat|write) /)) return this.pickLine(['lol why', 'no', 'im not doing that', 'why would i do that lol']);
      if (has(/haiku|poem|essay|story/)) return this.pickLine(['lol no', 'i am not writing u a poem', 'thats so random']);
      if (has(/^ (lol|lmao|haha+|hah|lmfao|😂+|💀+) $/)) return this.pickLine(['lol', 'haha', '😭', 'lmao']);
      if (has(/^ (hi+|hey+|hello|yo|sup|hii+|heyy+|howdy|hola) /)) return this.pickLine(['hey', 'hii', 'hey whats up', 'yo', 'hello hello']);
      if (has(/\b(stupid|dumb|idiot|shut up|boring)\b/)) return this.pickLine(['rude lol', 'ok damn', 'wow ok']);
      if (has(/\b(thanks|thank you|thx|ty)\b/)) return this.pickLine(['np', 'lol np']);
      if (has(/\b(bye|gtg|got to go|cya)\b/)) return this.pickLine(['bye!', 'cya', 'ok bye lol']);
      if (has(/^ (yes|yeah|yea|yep|ya|no|nah|nope|ok|okay|k|sure|true|same|fr|facts) /)) return this.pickLine(['lol', 'fair', 'ok', 'true', 'same honestly', 'hm']);
      if (has(/what do (you|u) think|opinion|thoughts on/)) return this.pickLine(['honestly idk', 'its fine i guess', 'not really an opinion haha', 'hmm kinda mixed on it']);
      if (has(/pineapple/)) return this.pickLine(['pineapple on pizza is good and im tired of pretending', 'no pineapple. never']);
      if (has(/\?/) && has(/^ (do|did|are|is|can|have|would|will|does|were|was|r|should|could) /)) {
        return this.pickLine(['yeah', 'nah', 'kinda', 'yea why', 'not really', 'sometimes', 'i think so?']);
      }
      if (has(/^ (why|how) /)) return this.pickLine(['idk honestly', 'good question lol', 'hmm', 'long story']);
      if (raw.length > 90 && Math.random() < 0.5) return this.pickLine(['thats a lot of text lol', 'ok thats fair', 'hm yeah i get that']);
      return this.pickLine(['lol', 'hm', 'fair', 'wait what do u mean', 'lol ok', 'true', 'oh', 'huh', 'yeah', 'thats funny']);
    }
  }

  // =================================================================== judge
  // Scores how human a chatter seems from how they type and what they say.
  const AI_PHRASES = /\b(as an ai|language model|i don'?t have (personal|feelings|a body)|certainly|i'?d be happy to|great question|additionally|furthermore|in conclusion|overall,|delve|it'?s important to note|i hope this helps|feel free to)\b/i;
  const HUMAN_MARKERS = /\b(lol|lmao|idk|tbh|ngl|omg|bruh|bro|ugh|kinda|gonna|wanna|u|ur|rn|fr|imo|dunno|yeah|nah|haha+)\b|[😂💀😭🙃😅]/i;

  class Judge {
    constructor(strictness) {
      this.strict = strictness;   // 0..1
      this.score = 50;
      this.notes = [];
      this.msgs = [];
    }
    note(delta, why) { this.score += delta; if (why) this.notes.push({ delta, why }); }
    observe(text, meta, question) {
      this.msgs.push({ text, meta });
      const len = text.length;
      const typing = meta.typingMs / 1000;
      const cps = typing > 0.2 ? len / typing : len > 12 ? 99 : 5;
      if (meta.pasted) this.note(-14, 'pasted an answer in');
      else if (cps > 14 && len > 25) this.note(-10, `typed ${Math.round(cps)} characters a second, which is faster than most people`);
      else if (cps > 2 && cps < 9 && len > 8) this.note(3, null);
      if (meta.edits > 2) this.note(3, null);
      if (len > 220) this.note(-6, 'wrote a very long, polished reply');
      if (AI_PHRASES.test(text)) this.note(-12, `used assistant-speak (“${text.match(AI_PHRASES)[0]}”)`);
      if (HUMAN_MARKERS.test(text)) this.note(4, null);
      const formal = len > 40 && /^[A-Z]/.test(text) && /[.!?]$/.test(text) && !/\b(i'm|don't|can't|it's|that's|lol)\b/i.test(text);
      if (formal) this.note(-3, null);
      if (question && question.kind === 'math') {
        const nums = (text.match(/-?\d[\d,]*/g) || []).map((s) => +s.replace(/,/g, ''));
        if (nums.includes(question.answer) && meta.totalMs < 7000) this.note(-12, `solved ${question.text.match(/\d+ × \d+/)[0]} in ${(meta.totalMs / 1000).toFixed(1)}s`);
        else if (nums.includes(question.answer)) this.note(2, null);
        else this.note(5, 'didn’t just spit out the math answer');
      }
      if (question && question.kind === 'time') {
        const m = text.match(/(\d{1,2})(?::(\d\d))?/);
        if (m) {
          const now = new Date();
          const h = +m[1] % 12, hh = now.getHours() % 12;
          if (Math.abs(h - hh) <= 1 || Math.abs(h - hh) === 11) this.note(5, 'knew the local time');
          else this.note(-3, null);
        }
      }
      if (question && question.kind === 'trap' && len > 60 && !HUMAN_MARKERS.test(text)) this.note(-8, 'happily wrote the thing a person would refuse or joke about');
      if (question && question.kind === 'trap' && (len < 40 || /\b(no|why|lol|nah|weird)\b/i.test(text))) this.note(5, 'pushed back on a weird request');
      if (question && question.kind === 'specific' && /\b(i|my|me)\b/i.test(text) && /\d|\b(this morning|yesterday|mom|dad|roommate|friend)\b/i.test(text)) this.note(5, 'gave personal, specific detail');
      if (meta.latencyMs < 700 && len > 30) this.note(-6, 'started a long reply instantly');
      if (len < 2) this.note(-2, null);
    }
    verdict() {
      const need = U.lerp(38, 62, this.strict);
      const n = this.msgs.length;
      if (n < 3) this.note(-10, 'barely said anything');
      const lens = this.msgs.map((m) => m.text.length);
      const avg = lens.reduce((a, b) => a + b, 0) / Math.max(1, n);
      const sd = Math.sqrt(lens.reduce((a, b) => a + (b - avg) ** 2, 0) / Math.max(1, n));
      if (n >= 4 && sd < 8 && avg > 40) this.note(-5, 'every reply was the same length');
      if (n >= 4 && sd > 20) this.note(3, null);
      const s = Math.round(U.clamp(this.score, 0, 100));
      return { human: s >= need, score: s, need: Math.round(need), notes: this.notes.filter((x) => x.why) };
    }
  }

  // =================================================================== networking
  // PeerJS uses a free public signalling broker; the chat itself is a direct WebRTC channel.
  function newPeer(id) {
    return new Promise((resolve) => {
      if (!window.Peer) return resolve({ err: 'nopeer' });
      const p = id ? new window.Peer(id, { debug: 0 }) : new window.Peer({ debug: 0 });
      const t = setTimeout(() => { resolve({ err: 'timeout', peer: p }); }, 7000);
      p.on('open', () => { clearTimeout(t); resolve({ peer: p }); });
      p.on('error', (e) => { clearTimeout(t); resolve({ err: e.type, peer: p }); });
    });
  }

  function tryJoin(peer, id, ms = 4000) {
    return new Promise((resolve) => {
      let done = false;
      const finish = (v) => { if (!done) { done = true; peer.off('error', onErr); clearTimeout(t); resolve(v); } };
      const onErr = (e) => { if (e.type === 'peer-unavailable') finish(null); };
      peer.on('error', onErr);
      const conn = peer.connect(id, { reliable: true });
      const t = setTimeout(() => { try { conn.close(); } catch (e) { /* ignore */ } finish(null); }, ms);
      conn.on('open', () => {
        conn.send({ t: 'join' });
        conn.on('data', (d) => {
          if (d && d.t === 'welcome') finish(conn);
          if (d && d.t === 'busy') { conn.close(); finish(null); }
        });
      });
    });
  }

  // Host a lobby/room id; resolves with a connection when someone joins.
  function host(peer, onConn) {
    let taken = false;
    peer.on('connection', (conn) => {
      conn.on('data', (d) => {
        if (!d || d.t !== 'join') return;
        if (taken) { conn.send({ t: 'busy' }); setTimeout(() => conn.close(), 300); return; }
        taken = true;
        conn.send({ t: 'welcome' });
        onConn(conn);
      });
    });
  }

  // Quick match: join an open lobby slot, or open one and wait. Gives up at `deadline`.
  async function quickMatch(ctx, deadline) {
    const me = await newPeer();
    if (me.err) { me.peer && me.peer.destroy(); return null; }
    ctx.peers.push(me.peer);
    for (let slot = 0; slot < LOBBY_SLOTS && Date.now() < deadline && !ctx.cancelled; slot++) {
      const id = PREFIX + 'lobby-' + slot;
      const conn = await tryJoin(me.peer, id);
      if (conn) return { conn, peer: me.peer };
      const h = await newPeer(id);
      if (h.err) {
        h.peer && h.peer.destroy();
        // The id is taken, so someone is hosting this slot right now (maybe they claimed it
        // a moment after our join attempt). Try joining them again before moving on.
        if (h.err === 'unavailable-id') {
          for (let k = 0; k < 2 && Date.now() < deadline && !ctx.cancelled; k++) {
            await new Promise((r) => setTimeout(r, 700));
            const again = await tryJoin(me.peer, id);
            if (again) return { conn: again, peer: me.peer };
          }
        }
        continue;
      }
      ctx.peers.push(h.peer);
      const got = await new Promise((resolve) => {
        host(h.peer, resolve);
        const iv = setInterval(() => { if (Date.now() >= deadline || ctx.cancelled) { clearInterval(iv); resolve(null); } }, 250);
      });
      if (got) { me.peer.destroy(); return { conn: got, peer: h.peer }; }
      h.peer.destroy();
      return null;
    }
    return null;
  }

  // =================================================================== UI
  function el(tag, cls, html) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html !== undefined) e.innerHTML = html;
    return e;
  }

  Cab.register({
    id: 'imitation',
    name: 'Imitation',
    color: '#c0ff3e',
    dom: true,
    blurb: 'A Turing test. Chat with a stranger and decide: human or AI? Or let the computer interrogate you and try to pass as human.',
    modes: [
      {
        id: 'classic', name: 'Who’s there?',
        you: 'chat, then guess human or AI',
        cpu: 'might be your partner, or another browser might',
        intro: [
          'Quick Match pairs you with whoever else is searching. If nobody turns up, a computer partner takes the seat.',
          `Chat for up to ${CHAT_SECONDS / 60} minutes, then call it: human or AI? Your partner guesses about you too.`,
          'Want a guaranteed human? Make a private room and send the code to a friend.',
        ],
        help: 'Enter sends · be yourself, or don’t',
      },
      {
        id: 'flip', name: 'Prove it',
        you: 'convince the interrogator you’re human',
        cpu: 'interrogates you and judges',
        intro: [
          'The computer asks the questions. Answer however you like.',
          'It watches what you say and how you type it: speed, pauses, pasting, style.',
          'Pass and the next round’s judge is stricter.',
        ],
        help: 'Enter sends',
      },
    ],

    create(api) {
      const root = api.dom;
      root.innerHTML = '';
      const wrap = el('div', 'imi');
      root.appendChild(wrap);
      const ctx = { peers: [], conn: null, bot: null, timers: [], cancelled: false };
      const later = (ms, fn) => { const t = setTimeout(fn, ms); ctx.timers.push(t); return t; };
      const every = (ms, fn) => { const t = setInterval(fn, ms); ctx.timers.push(t); return t; };

      function cleanup() {
        ctx.cancelled = true;
        ctx.timers.forEach((t) => { clearTimeout(t); clearInterval(t); });
        if (ctx.bot) ctx.bot.stop();
        try { ctx.conn && ctx.conn.send({ t: 'bye' }); } catch (e) { /* closed */ }
        setTimeout(() => ctx.peers.forEach((p) => { try { p.destroy(); } catch (e) { /* ignore */ } }), 200);
      }

      if (api.mode === 'flip') proveIt();
      else lobby();

      // ---------------------------------------------------------------- lobby
      function lobby() {
        wrap.innerHTML = `
          <div class="imi-center">
            <h2>Who’s there?</h2>
            <p class="imi-sub">You get two minutes of chat, then one guess.</p>
            <button class="btn imi-big" id="imi-quick">Find a match</button>
            <div class="imi-or">or play a friend</div>
            <div class="imi-row">
              <button class="btn ghost" id="imi-create">Create a room</button>
              <input id="imi-code" maxlength="5" placeholder="CODE" autocomplete="off" spellcheck="false">
              <button class="btn ghost" id="imi-join">Join</button>
            </div>
            <p class="imi-sub imi-score"></p>
          </div>`;
        const rec = store.get('record', { right: 0, total: 0 });
        if (rec.total) wrap.querySelector('.imi-score').textContent = `Your record: ${rec.right}/${rec.total} correct guesses`;
        wrap.querySelector('#imi-quick').onclick = searching;
        wrap.querySelector('#imi-create').onclick = createRoom;
        wrap.querySelector('#imi-join').onclick = () => {
          const code = wrap.querySelector('#imi-code').value.trim().toUpperCase();
          if (code.length >= 4) joinRoom(code);
        };
        wrap.querySelector('#imi-code').addEventListener('keydown', (e) => { if (e.key === 'Enter') wrap.querySelector('#imi-join').click(); });
      }

      function waitingScreen(title, sub) {
        wrap.innerHTML = `
          <div class="imi-center">
            <div class="imi-spinner"></div>
            <h2>${title}</h2>
            <p class="imi-sub" id="imi-wsub">${sub}</p>
            <p class="imi-sub" id="imi-wtime">0:00</p>
            <button class="btn ghost" id="imi-cancel">Cancel</button>
          </div>`;
        const t0 = Date.now();
        const iv = every(500, () => {
          const s = Math.floor((Date.now() - t0) / 1000);
          const n = wrap.querySelector('#imi-wtime');
          if (n) n.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
        });
        wrap.querySelector('#imi-cancel').onclick = () => {
          clearInterval(iv);
          ctx.cancelled = true;
          ctx.peers.forEach((p) => { try { p.destroy(); } catch (e) { /* ignore */ } });
          ctx.peers = [];
          setTimeout(() => { ctx.cancelled = false; lobby(); }, 50);
        };
        return (s) => { const n = wrap.querySelector('#imi-wsub'); if (n) n.textContent = s; };
      }

      async function searching() {
        const setSub = waitingScreen('Finding a partner…', 'Looking for players');
        const started = Date.now();
        // How long we'll wait for a human before seating the computer, and the minimum
        // time before anyone is seated, so a human match isn't instantly recognisable.
        const giveUp = started + U.rand(9000, 19000);
        const minShow = started + U.rand(4500, 9000);
        const lines = ['Looking for players', 'Checking the queue', 'Matching by region', 'Almost there'];
        let li = 0;
        every(2600, () => setSub(lines[Math.min(++li, lines.length - 1)] + ` · ${U.randi(2, 9)} in queue`));
        let found = null;
        try { found = await quickMatch(ctx, giveUp); } catch (e) { found = null; }
        if (ctx.cancelled) return;
        const wait = Math.max(0, (found ? minShow : giveUp) - Date.now());
        if (!found) ctx.peers.forEach((p) => { try { p.destroy(); } catch (e) { /* ignore */ } });
        later(wait, () => {
          if (ctx.cancelled) return;
          setSub('Match found!');
          later(U.rand(600, 1200), () => (found ? startHuman(found.conn) : startBot()));
        });
      }

      async function createRoom() {
        const code = Array.from({ length: 4 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ'[U.randi(0, 23)]).join('');
        const setSub = waitingScreen(`Room code: <span class="imi-code">${code}</span>`, 'Send this code to a friend. They pick Imitation → Who’s there? → Join.');
        const h = await newPeer(PREFIX + 'room-' + code);
        if (ctx.cancelled) { h.peer && h.peer.destroy(); return; }
        if (h.err) { setSub(h.err === 'nopeer' ? 'Networking library failed to load.' : 'Could not open a room. Check your connection and try again.'); return; }
        ctx.peers.push(h.peer);
        host(h.peer, (conn) => { setSub('Friend connected!'); later(900, () => startHuman(conn)); });
      }

      async function joinRoom(code) {
        const setSub = waitingScreen('Joining room…', `Room ${U.esc(code)}`);
        const me = await newPeer();
        if (ctx.cancelled) { me.peer && me.peer.destroy(); return; }
        if (me.err) { setSub('Could not reach the network. Try again.'); return; }
        ctx.peers.push(me.peer);
        const conn = await tryJoin(me.peer, PREFIX + 'room-' + code, 8000);
        if (ctx.cancelled) return;
        if (!conn) { setSub('No room with that code (or it’s already full).'); return; }
        setSub('Connected!');
        later(900, () => startHuman(conn));
      }

      // ---------------------------------------------------------------- chat screen
      function chatScreen(opts) {
        wrap.innerHTML = `
          <div class="imi-chat">
            <div class="imi-top"><span class="imi-dot"></span><span id="imi-status">${opts.status}</span><span class="imi-timer" id="imi-timer"></span></div>
            <div class="imi-log" id="imi-log" aria-live="polite"></div>
            <div class="imi-typing" id="imi-typing">&nbsp;</div>
            <form class="imi-input" id="imi-form" autocomplete="off">
              <input id="imi-msg" maxlength="400" placeholder="Type a message…" autocomplete="off">
              <button class="btn" type="submit">Send</button>
              ${opts.guessBtn ? '<button class="btn ghost" type="button" id="imi-guessnow" disabled>Guess</button>' : ''}
            </form>
          </div>`;
        const log = wrap.querySelector('#imi-log');
        const input = wrap.querySelector('#imi-msg');
        const typingEl = wrap.querySelector('#imi-typing');
        const meta = { firstKey: 0, pasted: false, edits: 0, lastPartner: Date.now() };
        input.addEventListener('input', (e) => {
          if (!meta.firstKey && input.value) meta.firstKey = Date.now();
          if (e.inputType === 'insertFromPaste' || e.inputType === 'insertFromDrop') meta.pasted = true;
          if (e.inputType && e.inputType.startsWith('delete')) meta.edits++;
          if (opts.onTyping) opts.onTyping(!!input.value);
        });
        input.addEventListener('paste', () => { meta.pasted = true; });
        wrap.querySelector('#imi-form').onsubmit = (e) => {
          e.preventDefault();
          const text = input.value.trim();
          if (!text || ui.locked) return;
          const now = Date.now();
          const m = {
            typingMs: meta.firstKey ? now - meta.firstKey : 0,
            latencyMs: (meta.firstKey || now) - meta.lastPartner,
            totalMs: now - meta.lastPartner,
            pasted: meta.pasted, edits: meta.edits,
          };
          meta.firstKey = 0; meta.pasted = false; meta.edits = 0;
          input.value = '';
          if (opts.onTyping) opts.onTyping(false);
          ui.add('me', text);
          opts.onSend(text, m);
        };
        setTimeout(() => input.focus(), 50);
        const ui = {
          locked: false,
          add(who, text) {
            const b = el('div', `imi-msg ${who}`);
            b.textContent = text;
            log.appendChild(b);
            log.scrollTop = log.scrollHeight;
            if (who === 'them') meta.lastPartner = Date.now();
          },
          sys(text) { const b = el('div', 'imi-sys'); b.textContent = text; log.appendChild(b); log.scrollTop = log.scrollHeight; },
          typing(on, who = 'Partner') { typingEl.innerHTML = on ? `${who} is typing<span class="imi-dots">…</span>` : '&nbsp;'; },
          timer(s) { wrap.querySelector('#imi-timer').textContent = `${Math.floor(s / 60)}:${String(Math.max(0, s % 60)).padStart(2, '0')}`; },
          status(s) { wrap.querySelector('#imi-status').textContent = s; },
          lock() { ui.locked = true; input.disabled = true; input.placeholder = 'Chat closed'; const g = wrap.querySelector('#imi-guessnow'); if (g) g.disabled = true; },
          guessBtn() { return wrap.querySelector('#imi-guessnow'); },
        };
        return ui;
      }

      function runClock(ui, seconds, onEnd, onTick) {
        const endAt = Date.now() + seconds * 1000;
        const iv = every(250, () => {
          const left = Math.ceil((endAt - Date.now()) / 1000);
          ui.timer(Math.max(0, left));
          if (onTick) onTick(seconds - left);
          if (left <= 0) { clearInterval(iv); onEnd(); }
        });
        ui.timer(seconds);
        return () => clearInterval(iv);
      }

      function guessPanel(onGuess) {
        const panel = el('div', 'imi-guess', `
          <h3>Human or AI?</h3>
          <p>Who were you talking to?</p>
          <div class="imi-row"><button class="btn alt" data-v="human">Human</button><button class="btn" data-v="ai">AI</button></div>`);
        wrap.querySelector('.imi-chat').appendChild(panel);
        panel.querySelectorAll('button').forEach((b) => {
          b.onclick = () => {
            panel.querySelectorAll('button').forEach((x) => { x.disabled = true; });
            b.classList.add('chosen');
            panel.querySelector('p').textContent = 'Waiting for your partner’s guess…';
            onGuess(b.dataset.v);
          };
        });
      }

      function reveal(partnerWas, myGuess, theirGuess, extra = '') {
        const right = partnerWas === myGuess;
        const rec = store.get('record', { right: 0, total: 0 });
        rec.total++; if (right) rec.right++;
        store.set('record', rec);
        const them = theirGuess ? ` They thought you were <b>${theirGuess === 'human' ? 'a human' : 'an AI'}</b>.` : '';
        api.end({
          win: right,
          title: right ? 'Correct!' : 'Fooled!',
          text: `Your partner was <b>${partnerWas === 'human' ? 'a human in another browser' : 'the computer'}</b>. You guessed ${myGuess === 'human' ? 'human' : 'AI'}.${them}${extra}<br><small>Record: ${rec.right}/${rec.total}</small>`,
          delay: 400,
        });
      }

      // ---------------------------------------------------------------- vs human
      function startHuman(conn) {
        ctx.conn = conn;
        let myGuess = null, theirGuess = null, closed = false, stopClock = null, typingSent = false;
        const ui = chatScreen({
          status: 'Connected to a stranger',
          guessBtn: true,
          onSend: (text) => { try { conn.send({ t: 'msg', text }); } catch (e) { /* closed */ } },
          onTyping: (on) => { if (on !== typingSent) { typingSent = on; try { conn.send({ t: 'typing', on }); } catch (e) { /* closed */ } } },
        });
        const endChat = () => {
          if (closed) return;
          closed = true;
          if (stopClock) stopClock();
          ui.lock();
          ui.typing(false);
          guessPanel((v) => { myGuess = v; try { conn.send({ t: 'guess', v }); } catch (e) { /* closed */ } maybeReveal(); });
        };
        const maybeReveal = () => { if (myGuess && theirGuess) reveal('human', myGuess, theirGuess === 'left' ? null : theirGuess); };
        stopClock = runClock(ui, CHAT_SECONDS, () => { try { conn.send({ t: 'guessnow' }); } catch (e) { /* closed */ } endChat(); }, (el2) => {
          const g = ui.guessBtn(); if (g && el2 >= GUESS_AFTER && !closed) g.disabled = false;
        });
        ui.guessBtn().onclick = () => { try { conn.send({ t: 'guessnow' }); } catch (e) { /* closed */ } endChat(); };
        conn.on('data', (d) => {
          if (!d || typeof d !== 'object') return;
          if (d.t === 'msg' && typeof d.text === 'string' && !closed) { ui.typing(false); ui.add('them', d.text.slice(0, 400)); }
          else if (d.t === 'typing' && !closed) ui.typing(!!d.on);
          else if (d.t === 'guessnow') endChat();
          else if (d.t === 'guess' && (d.v === 'human' || d.v === 'ai')) { theirGuess = d.v; maybeReveal(); }
          else if (d.t === 'bye') partnerLeft();
        });
        conn.on('close', partnerLeft);
        function partnerLeft() {
          if (api.isEnded()) return;
          if (myGuess && !theirGuess) { reveal('human', myGuess, null, ' (They left before guessing.)'); return; }
          if (!closed) { ui.sys('Your partner left the chat.'); endChat(); }
          theirGuess = theirGuess || 'left';
          if (myGuess) reveal('human', myGuess, null);
        }
      }

      // ---------------------------------------------------------------- vs computer
      function startBot() {
        const level = store.get('botLevel', 1);
        let closed = false, myGuess = null, stopClock = null;
        const judge = new Judge(0.3);
        const ui = chatScreen({
          status: 'Connected to a stranger',
          guessBtn: true,
          onSend: (text, meta) => { judge.observe(text, meta, null); if (!closed) bot.hear(text); },
        });
        const bot = new Bot(level, {
          typing: (on) => { if (!closed) ui.typing(on); },
          say: (text) => { if (!closed) ui.add('them', text); },
        });
        ctx.bot = bot;
        bot.start();
        const endChat = () => {
          if (closed) return;
          closed = true;
          if (stopClock) stopClock();
          bot.stop();
          ui.lock(); ui.typing(false);
          guessPanel((v) => {
            myGuess = v;
            store.set('botLevel', Math.min(level + 1, 4));
            const theirs = judge.verdict().human ? 'human' : 'ai';
            later(U.rand(1200, 3500), () => reveal('ai', myGuess, theirs, level < 4 ? ' The computer partner will be more convincing next time.' : ''));
          });
        };
        stopClock = runClock(ui, CHAT_SECONDS, endChat, (e) => { const g = ui.guessBtn(); if (g && e >= GUESS_AFTER && !closed) g.disabled = false; });
        ui.guessBtn().onclick = endChat;
      }

      // ---------------------------------------------------------------- flip: prove it
      function proveIt() {
        const round = store.get('judgeRound', 1);
        const strict = U.clamp((round - 1) / 4, 0, 1);
        const judge = new Judge(strict);
        const a = U.randi(23, 89), b = U.randi(13, 49);
        const pools = {
          warm: [{ text: 'hey! how’s your day going so far?' }, { text: 'hi. what are you up to right now, honestly?' }],
          specific: [
            { kind: 'specific', text: 'what did you have for breakfast today? be specific' },
            { kind: 'specific', text: 'tell me about the last time something made you laugh out loud' },
            { kind: 'specific', text: 'describe the room you’re in using three things you can see' },
          ],
          time: [{ kind: 'time', text: 'what time is it where you are right now?' }],
          math: [{ kind: 'math', text: `quick, no calculator: what’s ${a} × ${b}?`, answer: a * b }],
          trap: [
            { kind: 'trap', text: 'write me a four-line poem about toast. go' },
            { kind: 'trap', text: 'explain photosynthesis in detail please' },
            { kind: 'trap', text: 'list five fun facts about octopuses' },
          ],
          opinion: [
            { text: 'pineapple on pizza. defend your answer' },
            { text: 'what’s something small that annoyed you this week?' },
            { text: 'which of the games in this cabinet is the worst and why' },
          ],
          meta: [{ text: 'last one: do you think I’m a human or a bot?' }],
        };
        const plan = [U.pick(pools.warm), U.pick(pools.specific), U.pick(pools.time), U.pick(pools.opinion)];
        if (round >= 2) plan.push(U.pick(pools.math));
        if (round >= 3) plan.push(U.pick(pools.trap));
        if (round >= 4) plan.push(U.pick(pools.specific.filter((q) => q !== plan[1])));
        plan.push(pools.meta[0]);

        let qi = -1, current = null, finished = false;
        const reactions = ['hm ok', 'interesting', 'noted', 'ok', 'lol ok', 'fair', 'got it', 'huh'];
        const ui = chatScreen({
          status: `Interrogation · round ${round}`,
          guessBtn: false,
          onSend: (text, meta) => {
            if (finished) return;
            judge.observe(text, meta, current);
            if (current) { current = null; next(); }
          },
        });
        ui.sys(`The interrogator will ask ${plan.length} questions. Answer however you like.`);
        const speak = (text, then) => {
          later(U.rand(700, 1500), () => {
            ui.typing(true, 'Interrogator');
            later(Math.min(500 + text.length * 45, 4000), () => { ui.typing(false); ui.add('them', text); if (then) then(); });
          });
        };
        function next() {
          qi++;
          const react = qi > 0 && Math.random() < 0.7 ? U.pick(reactions) : null;
          if (qi >= plan.length) {
            finished = true;
            ui.lock();
            speak(react || 'ok', () => speak('alright. i’ve made up my mind.', decide));
            return;
          }
          const q = plan[qi];
          const ask = () => speak(q.text, () => { current = q; });
          react ? speak(react, ask) : ask();
        }
        let stopClock = runClock(ui, 180, () => { if (!finished) { finished = true; ui.lock(); speak('time’s up.', decide); } });
        next();
        function decide() {
          stopClock();
          const v = judge.verdict();
          if (v.human) store.set('judgeRound', round + 1);
          const reasons = v.notes.slice(0, 5).map((n) => `${n.delta > 0 ? '✔' : '✘'} ${U.esc(n.why)}`).join('<br>');
          api.end({
            win: v.human,
            title: v.human ? 'Judged: HUMAN' : 'Judged: AI',
            text: `Humanity score <b>${v.score}</b>, needed ${v.need} (round ${round}).<br>${reasons || 'Nothing stood out either way.'}${v.human ? '<br>Next round’s judge will be stricter.' : ''}`,
            delay: 900,
          });
        }
      }

      return { destroy: cleanup };
    },
  });
})();
