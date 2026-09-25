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

### 4. GitHub and a Netlify walkthrough
**Asked:** Walk me through deploying on Netlify, on a subdomain. My main site's DNS is on Cloudflare. Then I gave Claude the repo address `git@github.com:disaacs-lcm/cocktail-cabinet.git`.

**Produced:**
- A step-by-step guide: create the Netlify project from the GitHub repo; add the subdomain in Netlify; add a CNAME record in Cloudflare pointing to the `netlify.app` address; set it to DNS only (grey cloud) so Netlify can issue the HTTPS certificate.
- The push to GitHub. The plain `git@github.com` address was refused, because this Mac has no default GitHub key. Claude found the `githublcm` alias in `~/.ssh/config`, switched the remote to it, and pushed.

**Verified by Claude:** `ssh -T githublcm` answered as `disaacs-lcm`. The push succeeded. `git ls-remote` over plain HTTPS, with no login, showed the repo is public.

### 5. 80s arcade restyle
**Asked:** Make it look like an 80s arcade.

**Produced:** A lit marquee with a chrome-sunset logo, pixel and terminal fonts, a CRT screen with scanlines and flicker, a control panel under the screen, and a green-phosphor terminal look for Imitation.

**Verified by Claude:** Screenshots of the menu and a live game in the browser.

### 6. Question: does it use Claude in the backend?
**Answer:** No. Claude searched the site code for `anthropic`, `claude`, API keys and network calls. The only outside requests are the fonts, the PeerJS script, and PeerJS's connection broker for Imitation. Every computer player, including Imitation's bot and judge, is JavaScript running in the player's browser. The only match for "claude" is a pattern that lets the bot deflect "are you claude?".

### 7. Nerf the computer
**Asked:** The CPU is too good in a lot of games (not Imitation). Nerf it a little.

**Produced:** Smaller, human-like handicaps:
- **Snake:** about 1 time in 8 it skips its safety check, and it gets less time to reach each apple.
- **Breakout and Pong:** paddles misjudge the ball more, move slower, and gain skill more slowly.
- **Splat:** the bird misjudges gaps more and hesitates more often.
- **Asteroids:** the pilot takes closer calls and aims worse.
- **Missile Command:** the defender reacts slower, aims worse and fires slower.
- **Classic modes:** the computer's attacks and layouts are gentler.

**Verified by Claude (`tools/sim.js`, human wins out of runs):**

| Scenario | Human wins |
|---|---|
| Asteroids, random throws | 5/6 |
| Asteroids, aimed throws | 6/6 |
| Breakout Versus, predicting player | 4/6 |
| Missile Command, random attack | 6/6 |
| Missile Command, focused attack | 5/6 |
| Pong Ball Bender, random bending | 1/6 |
| Pong Ball Bender, well-timed bending | 6/6 |
| Snake, random apples | 0/6 |
| Snake, trapping apples | 3/6 |
| Splat, lazy layout | 0/6 |
| Splat, extreme layout | 6/6 |

So planned play usually wins, and careless play can still lose.

### 8. A menu that isn't a grid of tiles
**Asked:** Make the interface a lot more innovative than a bunch of tiles, and push each change so it deploys.

**Produced:** The menu is now a cocktail table.
- A reel of games across the top.
- A live attract-mode demo of the selected game on the table's screen (`js/attract.js`).
- Two seats at the ends. Player 1's end is the classic mode. Player 2's end is the flipped mode, and its panel reads upside down (like the far side of a real cocktail table) until you reach for it, when the table turns to face that side.
- Arrow keys, Enter / Shift+Enter, and swipe on phones.

**Bug found and fixed:** a seat label was drawn huge because a more specific CSS rule overrode its size.

**Verified by Claude:** Screenshots at desktop and phone width. Selecting games and the table turn both worked. No sideways scroll on phones and no console errors.

### 9. Make it look like a physical object
**Asked:** Make it look more like a physical object instead of a digital page.

**Produced:**
- A dim arcade room with patterned carpet and ceiling spotlights.
- Walnut laminate, colored plastic edging, and a brushed-aluminium marquee frame with screws.
- Glass glare and cast shadows.
- Paper instruction cards, domed buttons and ball-top joysticks, game cartridges in a rack, and a coin door with flashing INSERT COIN lamps.

**Fixed after review:** the grain texture made the paper cards look dirty, and "SIT HERE" wrapped onto two lines.

**Verified by Claude:** Screenshots of the menu, a game screen and the coin door at laptop size.

### 10. Cartridge art
**Asked:** Make little graphics for the cartridges.

**Produced:** A 16×10 pixel-art picture on each cartridge label, stored as text grids in `js/attract.js` (one letter per pixel), plus a paper number tag. Claude also moved the Breakout demo's bricks down, because they sat under the title.

**Verified by Claude:** A screenshot of the reel with all the art, and no console errors.

### 11. (me) Hands-on playtest
- [ ] Played every mode on both sides; notes:
- [ ] Imitation between two different computers/phones:
- [ ] Anything I changed afterwards:

### 12. (me) Deploy
- [x] GitHub repo created by me; Claude pushed it (see 4): https://github.com/disaacs-lcm/cocktail-cabinet
- [ ] Netlify site connected to the repo (auto-deploys on push):
- [ ] Custom domain / subdomain added and HTTPS working:
- [ ] Opened the site in a private window, not signed in:
