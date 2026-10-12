# Improvement log: Wave 1 (submitted Oct 5) to Wave 2

Site: https://games.applycider.com
Repo: https://github.com/disaacs-lcm/cocktail-cabinet

## Every game

- **Sound.** Added sound effects to all eight games: hits, scoring, explosions, win and lose jingles. Every sound is generated in code with the Web Audio API (`js/sound.js`), with no audio files or CDNs.
- **Mute.** A SOUND ON/OFF button, or the M key. The choice is remembered between visits.
- **How to play / how to win.** Every mode's intro card now starts with a HOW TO WIN line. A HOW TO PLAY button (or the H key) reopens the instructions mid-game, pausing it.
- **Resources on screen.** Anything you're waiting on is now shown: Pong's SPEED gauge and SPIN meter, Breakout's SPEED gauges and NEXT ROW pips, Missile Command's RELOAD bar, Asteroids' SKY meter. Splat, Snake and Imitation already showed theirs.
- **Testing shortcut.** Add `?level=N` to the URL to jump straight to level, wave or fight N, e.g. `games.applycider.com/?level=6#/missile/classic`. A red TEST LEVEL tag shows while it's on. Documented in the README.
- **Balance check.** `npm run balance` runs every mode computer vs. computer, 200 games each by default, using the real game code. Each game's "human" side is played by its own AI with human limits (reaction time, aim error, late taps). I tuned every mode to 40–60%. Results over 400 games per mode, human side wins before → after:
  - Snake: 100% → 55% classic, 1% → 55% flipped
  - Breakout: 100% → 52% classic, 53% → 46% versus
  - Splat: 100% → 50% classic, 30% → 58% flipped
  - Asteroids: 100% → 49% classic, 84% → 46% flipped
  - Missile Command: 100% → 56% classic, 100% → 54% flipped
  - Pong: 37% → 48% classic, 37% → 50% Ball Bender
  - Imitation: 100% → 48% Prove it, 0% → 54% Who's there?

  Part of that change came from making the human models more human (the first drafts reacted instantly), and part from tuning the games.

## Pong
- The computer used to start at skill 0.45 and climb to 0.9 as points were scored, so it lost early and became unbeatable late. It now plays at one steady skill all game (0.55 in Classic, 0.37 in Ball Bender), with a reaction delay and a misjudgement on each ball.
- The ball now speeds up steadily, +14 px/s per hit and +6 px/s per second, up to 820. Before, it multiplied by 1.04 per hit and capped at 760 after about 20 returns. There's a SPEED gauge on screen.
- Ball Bender's curve exploit is limited: a weaker bend, a SPIN meter that drains faster and refills slower, a lower cap on how sharp a curve can get, and shaded no-bend zones in front of each paddle.
- Sounds for paddle hits, walls and points.

## Snake
- Sounds for eating, placing apples, invalid placements, level-ups, a low-hunger warning and crashes.
- Controls unchanged: the input buffer, 180° reversal blocking and WASD support were already in Wave 1.
- Flipped mode: the snake's hunger is now based on straight-line distance. Hiding an apple behind the snake's own body is now a real trap; before, hunger counted the detour, so traps never worked. The computer snake also plays more cautiously.

## Breakout
- The ball now visibly speeds up while it stays in play (+10 px/s every second, up to 2× its start speed). Each wall has a SPEED gauge; losing a ball resets the speed.
- Versus shows NEXT ROW pips: how close each side is to dropping a row on the other.
- Classic was nearly impossible to lose, with games averaging 13 minutes. Now the ball starts at 290 + 40 per level, and the paddle starts at 132 px and shrinks 10 px per wall. The Versus computer starts at skill 0.2 (was 0.12).
- Sounds for paddle hits, bricks, lost balls, pushed rows and new levels or rounds.

## Splat
- Each mode now has its own difficulty curve.
  - Classic: gaps narrow from 200 to 133 px (Wave 1 went down to 122), top speed 250 (was 290), a gentler ramp over 40 columns, and a 30-column goal (was 40).
  - Flipped: the computer bird plays at its sloppiest skill (was 0.25), and your gap bracket starts wider.
- Fixed a bug: the computer flapper ignored the flaps it had made during its reaction delay.
- Sounds for flapping, placing gaps, passing columns, milestones and crashes.

## Missile Command
- Classic gets 15 shots per battery (was 10), and every surviving battery regains 1 shot every 6 seconds during a wave, shown by a RELOAD bar.
- Smoother ramp: missile speed grows +7 per wave (was +10), each wave adds 3.75 missiles, launches are spread over a longer window, and splitting missiles start at wave 4 (was 3) and are rarer.
- Flipped: your missile budget grows by 2.25 per wave (was 6), so the computer's defence can hold.
- Sounds for firing, launches, blasts, lost cities, splits and new waves.

## Asteroids
- Holding Space now auto-fires at the normal rate. Before, it only fired when no bullets were on screen, which made holding the trigger feel broken.
- You earn a ship back for each cleared wave, up to 5, and the hitbox is a little more forgiving (the same rule applies to the computer pilot).
- Classic: rocks start slower and are aimed less precisely at you. Each wave sends 1 + 2.7 × wave big rocks.
- Flipped: a SKY meter shows how much more rock you can throw. The computer pilot is sharper (skill 0.6, was 0.45), and your energy refills more slowly.
- Sounds for shooting, rocks breaking, crashes, launches and new waves.

## Imitation
- Round 1 is harder.
  - Who's there?: the computer partner starts at level 2 of 4 (was 1), so it's more convincing from the first chat.
  - Prove it: the judge now needs a humanity score of 81 in round 1, rising to 87 (it was 38, rising to 62). The quick-math question is asked from round 1.
- Sounds for messages in and out, and for match found.

## New: P(DOOM), the original eighth game
- A pixel-art brawler. You're a doomer in a hoodie fighting the AI models (ChatGPT, Gemini, Copilot, Llama, Grok, Claude) and then AGI.
- One shared tug-of-war meter, P(DOOM), replaces the usual two health bars. It starts at 50%; push it to 0% to win the fight, and if it hits 100% you lose.
- Each opponent fights with its model's quirk, explained on a "model card" before the fight:
  - ChatGPT hallucinates fake attacks.
  - Gemini sends a twin in behind you.
  - Copilot autocompletes your last combo back at you.
  - Llama's short context window makes it forget to block after 4 blocked hits.
  - Grok rushes wildly.
  - Claude won't engage while you're aggressive.
  - AGI patches your favourite move.
- Easy to pick up: punch, kick and block, plus three combos shown on screen (↓→P, ←→K, PPK) that can also be clicked or tapped. Landing hits fills HOPE for a super. Later fights block, counter and break combos, so mashing stops working.
- On phones, the cabinet's control panel becomes a gamepad: d-pad, four buttons and three combo buttons.
- Arcade mode (7 fights, 3 continues, saved high score) and Training mode (any opponent, no clock).
- A parody disclaimer: not affiliated with any of the AI companies.

## Also since Oct 5
- Oct 7: the Pong computer paddle got faster reactions and a tighter read of the ball; that was replaced by the steady-skill rework above.
- The menu shows 8 cartridges, including pixel art for P(DOOM), and the marquee reads "8 GAMES".
