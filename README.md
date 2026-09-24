# Cocktail Cabinet

Seven arcade games on one static page. In every game a human or the computer can take either side.

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

## How the computer plays

No computer player cheats. Each one uses the same controls, physics and limits as a human, and has human-like flaws:

- **Snake** runs a shortest-path search to the apple and checks it won't box itself in. If the path is unsafe it circles, until hunger forces a risk.
- **Breakout / Pong paddles** predict where the ball crosses the paddle line, bounces included. Each ball gets one misjudgement, sized by the skill level, and the paddle has a speed cap.
- **Splat** only presses "flap". It sees the world 4 frames (67 ms) late, simulates flap-now against wait for 0.7 s ahead, misjudges each gap by a few pixels, and sometimes hesitates.
- **Asteroids pilot** gets the same rotate/thrust/fire controls. Every tenth of a second it simulates its options against every rock's path. It dodges when a move gets too close, and otherwise hunts with lead-aimed shots and some aim wobble.
- **Missile Command defender** notices missiles after a 0.3–0.55 s reaction, computes intercept points, and misses by a few pixels. It fires at about human click speed and has limited ammo.
- **Imitation** runs locally (`js/games/imitation.js`). The bot has a persona, types at a human pace, and makes typos. The judge scores typing speed, pasting, phrasing and trap answers. No AI service is called.

Difficulty ramps in every mode: faster, tighter, or more budget for the attacker. Balance was tuned with a headless harness that plays thousands of simulated seconds:

```bash
node tools/sim.js all 5          # every game, 5 runs each
node tools/sim.js splat_flip 8   # just one scenario
```

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
