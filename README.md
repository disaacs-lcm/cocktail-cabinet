# Cocktail Cabinet

Seven two-sided arcade games plus an original eighth, **P(DOOM)**, on one static page. In the seven classics a human or the computer can take either side.

Plain HTML, CSS and JavaScript. No build step, no server code, no API keys.

| Game | Classic | Flipped |
|---|---|---|
| Snake | You steer. The computer places apples in harder spots as you level up. | You place apples. The computer steers, and it has to eat before its hunger runs out. |
| Breakout | You work the paddle through five walls. | **Versus:** you race a computer paddle. Bricks you break push rows onto its wall. |
| Splat | You flap. The computer lays out the columns. | You lay out the columns. The computer flaps through them. |
| Asteroids | You fly. The computer throws asteroids. | The computer flies. You throw asteroids from the edges. |
| Missile Command | You defend. The computer attacks. | You attack with a missile budget. The computer manages the batteries. |
| Imitation | Chat, then guess: human or AI? You're matched with another browser, or with the computer. | The computer interrogates you and judges whether you're human. |
| Pong (our pick) | You play a paddle against the computer. | **Ball Bender:** the computer plays both paddles. You curve the ball past them. |

## P(DOOM): the original game

You're a doomer in a hoodie, brawling through the AI models (ChatGPT, Gemini, Copilot, Llama, Grok, Claude) and then AGI. Source: `js/games/pdoom.js`.

- **One meter instead of two health bars.** P(DOOM) starts each fight at 50%. Your hits push it down, theirs push it up. 0% wins the fight, 100% loses it, and when the 60 s clock ends, whichever side of 50% it's on decides.
- **Every opponent fights with its model's quirk:**

  | Opponent | Quirk |
  |---|---|
  | ChatGPT | Hallucinates fake attacks |
  | Gemini | Sends a twin in behind you |
  | Copilot | Autocompletes your last three attacks back at you |
  | Llama | Forgets to block after 4 blocked hits (short context) |
  | Grok | Rushes wildly |
  | Claude | Won't engage while you're aggressive |
  | AGI | Patches your favourite move until you switch it up |

  A "model card" before each fight explains how to beat it.
- **Pick up and play:** punch, kick, block, and three on-screen combos (↓→P, ←→K, PPK). Click or tap a combo card to fire it. Fill HOPE, then Z+X for the OFF SWITCH super. Mashing wins the early fights; later fights punish it (blocks, counters, a combo breaker).
- **Phones:** the cabinet's control panel turns into a gamepad (d-pad, buttons, combo buttons).
- **Modes:** Arcade (7 fights, 3 continues, high score saved) and Training (pick any opponent, no clock).
- Drawn on a 200×150 canvas scaled 4× for real pixels. Parody: not affiliated with OpenAI, Google, Microsoft, Meta, xAI or Anthropic.

## How the computer plays

No computer player cheats. Each one uses the same controls, physics and limits as a human, and has human-like flaws:

- **Snake** runs a shortest-path search to the apple and checks it won't box itself in. If the path is unsafe it circles, until hunger forces a risk.
- **Breakout / Pong paddles** predict where the ball crosses the paddle line, bounces included. Each ball gets one misjudgement, sized by the skill level, and the paddle has a speed cap.
- **Splat** only presses "flap". It sees the world 4 frames (67 ms) late, simulates flap-now against wait for 0.7 s ahead, misjudges each gap by a few pixels, and sometimes hesitates.
- **Asteroids pilot** gets the same rotate/thrust/fire controls. Every tenth of a second it simulates its options against every rock's path. It dodges when a move gets too close, and otherwise hunts with lead-aimed shots and some aim wobble.
- **Missile Command defender** notices missiles after a 0.35–0.65 s reaction, computes intercept points, and misses by a few pixels. It fires at about human click speed and has limited ammo.
- **Imitation** runs locally (`js/games/imitation.js`). The bot has a persona, types at a human pace, and makes typos. The judge scores typing speed, pasting, phrasing and trap answers. No AI service is called.

Difficulty ramps in every mode: faster, tighter, or more budget for the attacker.

## Sound and help

Every game has sound effects, generated in code with the Web Audio API in `js/sound.js` (no audio files). **SOUND** button or **M** mutes; the choice is remembered. **HOW TO PLAY** button or **H** reopens the instructions mid-game (canvas games pause).

## Testing aids: jump to a late level

Add `?level=N` to the address, before the `#`. A red **TEST LEVEL N** tag shows in the top-left corner while it's on.

| Game | What `?level=N` does | Example |
|---|---|---|
| Snake | starts as if 5×(N−1) apples were eaten (snake grown, speed and hunger to match) | `/?level=6#/snake/flip` |
| Breakout | Classic: starts at wall N (max 5). Versus: starts at round N | `/?level=5#/breakout/classic` |
| Splat | starts 5×(N−1) columns into the course | `/?level=5#/splat/classic` |
| Asteroids | starts at wave N | `/?level=5#/asteroids/classic` |
| Missile Command | starts at wave N (max 7) | `/?level=6#/missile/classic` |
| Pong | serves each rally 80×(N−1) px/s faster | `/?level=5#/pong/classic` |
| Imitation | Who's there?: bot level N (max 4). Prove it: judge round N | `/?level=4#/imitation/flip` |
| P(DOOM) | starts at fight N (7 = AGI) | `/?level=7#/pdoom/arcade` |

Remove `?level=N` (or use `?level=1`) for normal play.

## Balance check: `npm run balance`

```bash
npm run balance                                   # every mode, 200 games each (~20 s)
node tools/balance.js --runs 400 --only splat     # one game, more runs
node tools/balance.js --save after --compare before
```

`tools/balance.js` loads the real game files in Node and plays each mode computer vs computer. Every game has an `autopilot` switch (off in the browser) that lets the computer also play the human's side, using a **`HUMAN_MODEL`** constant at the top of each game file: the game's own AI with human limits. The script reports how often that "human side" wins. The target is 40–60%.

The human models are assumptions, so they're listed here plainly:

| Game | Human model |
|---|---|
| Snake | Pathfinding steering that skips its safety check 30% of the time and turns one cell late, more often at speed. Placer: waits 1.5 s, then picks an awkward, trap-ish cell. |
| Breakout | The computer's paddle controller at skill 0.45 (reaction ~0.2 s, aim error ~20 px). |
| Splat | The look-ahead flapper with a 150 ms reaction, its sloppiest aim, and taps that land 0–50 ms late. Placer: the classic layout style. |
| Asteroids | The computer pilot at its sloppiest, deciding at most every 0.25 s. Thrower: a big rock aimed at the ship every ~2.2 s. |
| Missile Command | The computer's battery commander with 0.5–0.9 s reaction, 22 px aim error and 0.4–0.6 s between clicks. Attacker: a launch every ~0.9 s at a random city, 30% splitters. |
| Pong | A computer paddle at skill 0.55. Bender: curves away from the oncoming paddle just outside the no-bend zone. |
| Imitation | Prove it: the game's own chat bot (level 3, relaxed typing, no pasting) answering the judge's real questions. Who's there?: the same interview, judged on the computer partner. |

Results: **before** is the first run (200 games per mode, Part 1 settings, first-draft human models); **after** is the shipped settings (400 games per mode). Some of the change comes from making the human models more human (several first drafts reacted instantly or never mis-timed a move), and the rest from tuning game parameters. Each game's commit message says which was which.

| Mode | Human side: before | Human side: after |
|---|---|---|
| Snake classic | 100% | 55% |
| Snake flipped | 1% | 55% |
| Breakout classic | 100% | 52% |
| Breakout versus | 53% | 46% |
| Splat classic | 100% | 50% |
| Splat flipped | 30% | 58% |
| Asteroids classic | 100% | 49% |
| Asteroids flipped | 84% | 46% |
| Missile Command classic | 100% | 56% |
| Missile Command flipped | 100% | 54% |
| Pong classic | 37% | 48% |
| Pong Ball Bender | 37% | 50% |
| Imitation: Prove it | 100% | 48% |
| Imitation: Who's there? | 0% | 54% |

Results wobble by a few points between runs. The numbers are only as good as the human models: they say the two sides are matched, not that a real person will find a game fair. That still needs playtesting by hand.

The older Wave 1 harness (`node tools/sim.js all 5`) plays scripted stand-in humans against the computer and is kept for reference.

## Two-browser play (Imitation)

Imitation uses [PeerJS](https://peerjs.com/) (WebRTC) through PeerJS's free public broker. The chat goes directly between the two browsers, and nothing runs on a server of ours.

- **Quick Match** looks for another browser searching at the same time. If nobody turns up within 9–19 s, a computer partner takes the seat. Matches never connect instantly, and a human match looks exactly like a bot match.
- **Private room** gives a 4-letter code for a guaranteed human match.

## Run locally

```bash
python3 -m http.server 8765
```

Then open http://localhost:8765.

## Deploy

`netlify.toml` publishes the repo root with no build. Connect the GitHub repo in Netlify (continuous deployment on every push), then add the custom domain under **Domain management**.
