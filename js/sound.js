/* Sound effects, generated in code with the Web Audio API (no audio files).
 *
 * Games call Cab.sfx('name'). Each effect is a short recipe of tones (an oscillator whose
 * pitch can slide) and noise bursts (random samples through a filter), each with a quick
 * volume envelope so it starts and stops cleanly.
 * The browser only allows audio after a click or key press, so the AudioContext is created
 * lazily on first use. Muting is remembered in localStorage.
 */
(function () {
  'use strict';
  let ctx = null, master = null;
  let muted = false;
  try { muted = localStorage.getItem('cab.muted') === '1'; } catch (e) { /* storage blocked */ }
  const lastPlayed = {};

  function audio() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.22;
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  // An oscillator note. freq slides to `to` (if given) over its duration.
  function tone({ freq = 440, to = null, type = 'square', dur = 0.1, vol = 0.5, delay = 0 }) {
    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator(), env = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (to) osc.frequency.exponentialRampToValueAtTime(to, t0 + dur);
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.exponentialRampToValueAtTime(vol, t0 + 0.005);
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(env).connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  // A burst of filtered white noise: explosions, crashes, thuds.
  function noise({ dur = 0.3, vol = 0.6, cutoff = 1200, delay = 0 }) {
    const t0 = ctx.currentTime + delay;
    const len = Math.ceil(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(cutoff, t0);
    filter.frequency.exponentialRampToValueAtTime(80, t0 + dur);
    const env = ctx.createGain();
    env.gain.setValueAtTime(vol, t0);
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filter).connect(env).connect(master);
    src.start(t0);
  }

  const notes = (list, type = 'square', step = 0.09, vol = 0.4) =>
    list.forEach((f, i) => tone({ freq: f, type, dur: step * 1.1, vol, delay: i * step }));

  // The cabinet's sound palette.
  const SFX = {
    tick:    () => tone({ freq: 1200, dur: 0.025, vol: 0.15 }),                         // UI move
    click:   () => tone({ freq: 700, dur: 0.04, vol: 0.25, type: 'triangle' }),          // UI press
    coin:    () => notes([988, 1319], 'square', 0.07, 0.3),                              // start a game
    bounce:  () => tone({ freq: 330, dur: 0.05, vol: 0.35, type: 'triangle' }),          // paddle, wall
    hit:     () => tone({ freq: 520, to: 260, dur: 0.07, vol: 0.3 }),                    // brick, target
    score:   () => notes([660, 990], 'square', 0.07, 0.3),                               // a point for you
    point:   () => notes([392, 262], 'triangle', 0.1, 0.35),                             // a point against you
    eat:     () => tone({ freq: 500, to: 900, dur: 0.07, vol: 0.3 }),
    flap:    () => tone({ freq: 260, to: 520, dur: 0.06, vol: 0.18, type: 'triangle' }),
    shoot:   () => tone({ freq: 1100, to: 220, dur: 0.08, vol: 0.18 }),
    launch:  () => tone({ freq: 180, to: 520, dur: 0.18, vol: 0.25, type: 'sawtooth' }),
    place:   () => tone({ freq: 440, to: 660, dur: 0.06, vol: 0.25, type: 'triangle' }),
    pop:     () => noise({ dur: 0.15, vol: 0.4, cutoff: 2500 }),                         // small explosion
    explode: () => noise({ dur: 0.45, vol: 0.6, cutoff: 1400 }),
    boom:    () => { noise({ dur: 0.9, vol: 0.8, cutoff: 700 }); tone({ freq: 120, to: 40, dur: 0.6, vol: 0.4, type: 'sine' }); },
    lifeLost:() => tone({ freq: 440, to: 90, dur: 0.45, vol: 0.35, type: 'sawtooth' }),
    warn:    () => notes([220, 220], 'square', 0.12, 0.25),
    error:   () => tone({ freq: 140, dur: 0.12, vol: 0.3, type: 'square' }),
    level:   () => notes([523, 659, 784], 'square', 0.08, 0.3),
    win:     () => notes([523, 659, 784, 1047, 784, 1047], 'square', 0.1, 0.35),
    lose:    () => notes([392, 330, 262, 196], 'triangle', 0.16, 0.4),
    msgIn:   () => tone({ freq: 880, dur: 0.06, vol: 0.2, type: 'sine' }),
    msgOut:  () => tone({ freq: 620, dur: 0.04, vol: 0.15, type: 'sine' }),
  };

  // Play an effect. Repeats of the same effect within 40 ms are dropped so busy moments
  // (ten bricks in a frame) don't turn into a wall of noise.
  Cab.sfx = function (name) {
    if (muted || !SFX[name]) return;
    const now = performance.now();
    if (now - (lastPlayed[name] || 0) < 40) return;
    lastPlayed[name] = now;
    if (!audio()) return;
    try { SFX[name](); } catch (e) { /* audio is optional */ }
  };

  Cab.sound = {
    isMuted: () => muted,
    toggle() {
      muted = !muted;
      try { localStorage.setItem('cab.muted', muted ? '1' : '0'); } catch (e) { /* storage blocked */ }
      if (!muted) Cab.sfx('click');
      return muted;
    },
    unlock() { if (!muted) audio(); },
  };
})();
