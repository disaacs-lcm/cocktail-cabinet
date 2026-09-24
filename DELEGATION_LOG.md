# Delegation log

A record of what I asked Claude (Claude Code, Opus 5.5) to do, what it produced, and how the result was checked.
Entries marked **(me)** are for my own checks. Fill them in before submitting.

---

### 1. Build the cabinet
**Asked:** I pasted the Wave 1 assignment and chose: project folder `Cocktail Cabinet`; Pong as the seventh game; Imitation as a Turing-test chat; Missile Command flipped so the human attacks.

**Produced:**
- A shared runtime (`js/cabinet.js`): menu, routing, a fixed 60 Hz loop, input, and pause/end screens.
- One file per game in `js/games/`, each with a classic and a flipped mode.
- A computer player for every side, using the same controls and physics as a human.

**Verified by Claude:**
- `node --check` on every file.
- A headless harness (`tools/sim.js`) that runs each game in Node with stand-in "humans" and reports who won and when.

### 2. Balance: "never trivial, never impossible"
**Asked:** Tune every flipped mode so both sides can win.

**Found and fixed by simulating (numbers from `tools/sim.js`):**

| Game | Problem found | Fix | Result after |
|---|---|---|---|
| Splat | The bird died by column 2 against extreme layouts. The planner kept putting off its flap. | Replaced the heuristic with a look-ahead planner: 67 ms lag, per-gap misjudgement, a habit-first decision. | A lazy human loses. Deliberate big swings win at columns 18–36. |
| Asteroids | The pilot died in waves 1–2. Rocks piled up to 35 on screen. | A pilot that simulates its options before moving; a cap on fragment speeds; a limit on rock mass for the human. | An aimed-throwing human wins in waves 3–6. Random throwing sometimes loses. |
| Missile Command | The defence never lost a city. | Human reaction and aim error for the defender, a smaller chain blast, bigger budgets and faster warheads. | The attacker wins about 50–80% of games, usually in wave 6–7. |
| Pong (Ball Bender) | Swung from 0–7 losses to 7–0 wins. | The paddle commits to one misread per ball; starting skill tuned. | A smart bender wins about half the time. |
| Snake | — | — | Random apples: the snake wins. Trapping apples: the human wins about 2 of 3. |
| Breakout Versus | — | — | A predicting stand-in wins some matches 3–1 and loses others 2–3. |

### 3. Two-browser Imitation
**Produced:** Matchmaking over PeerJS: lobby slots, private room codes, and a bot fallback behind the same "searching" screen with a minimum wait.

**Bug found:** When two tabs searched at once, they claimed different lobby slots and never met.

**Fix:** If a slot's ID is already taken, retry joining it before moving on.

**Verified by Claude:** Two browser tabs matched each other. A message typed in one appeared in the other. The guess and reveal worked on both sides. A lone tab fell back to the bot. The "Prove it" judge flagged pasted, assistant-style answers.

### 4. (me) Hands-on playtest
- [ ] Played every mode on both sides; notes:
- [ ] Imitation between two different computers/phones:
- [ ] Anything I changed afterwards:

### 5. (me) Deploy
- [ ] GitHub repo created and pushed:
- [ ] Netlify site connected to the repo (auto-deploys on push):
- [ ] Custom domain / subdomain added and HTTPS working:
- [ ] Opened the site in a private window, not signed in:
