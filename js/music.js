/* music.js — scene-shaped generative dark-fantasy synth score, pure Web Audio.
   Each vista receives a seeded mode, progression, motif, arrangement, and mix.
   Slow crossfades keep successive worlds from colliding harmonically. */
"use strict";

const Music = (() => {
  let ctx = null;
  let master, compressor, dry, wet, lp, ambienceBus;
  let windGain, rainGain, crackleGain;
  let musicBus = null;
  let muted = false, started = false;
  let scene = null;
  let rng = Math.random;
  let schedTimer = null;

  // musical state
  let rootHz = 82.41;
  let modeName = "aeolian", scaleSemis = [];
  let progression = [], progressionIndex = 0, arcIndex = 0;
  let motif = [], motifTurn = 0, bellIndex = 0;
  let arrangement = null;
  let padNext = 0, leadNext = 0, bellNext = 0;

  const MODES = {
    aeolian: [0, 2, 3, 5, 7, 8, 10],
    dorian: [0, 2, 3, 5, 7, 9, 10],
    phrygian: [0, 1, 3, 5, 7, 8, 10],
  };

  // Four-chord grammars, voiced around a common center so changes move by
  // small intervals instead of jumping randomly around the register.
  const PROGRESSIONS = {
    aeolian: [
      [[0, 3, 7, 12], [-4, 0, 3, 8], [-5, 0, 3, 7], [-2, 2, 5, 10]],
      [[0, 3, 10, 14], [-2, 2, 5, 10], [-4, 0, 3, 8], [0, 5, 7, 12]],
      [[0, 3, 7, 12], [-5, 0, 3, 7], [-4, 0, 3, 8], [-2, 2, 7, 10]],
    ],
    dorian: [
      [[0, 3, 7, 12], [5, 9, 12, 17], [-2, 2, 5, 10], [0, 3, 10, 14]],
      [[0, 3, 7, 14], [-5, 0, 3, 7], [5, 9, 12, 17], [0, 5, 7, 12]],
      [[0, 3, 7, 12], [2, 5, 9, 14], [5, 9, 12, 17], [-2, 2, 7, 10]],
    ],
    phrygian: [
      [[0, 3, 7, 12], [1, 5, 8, 13], [-2, 1, 5, 10], [0, 3, 10, 12]],
      [[0, 3, 7, 13], [-2, 1, 5, 10], [1, 5, 8, 13], [-5, 0, 3, 7]],
      [[0, 3, 7, 12], [1, 5, 8, 12], [-5, 0, 3, 7], [0, 1, 7, 10]],
    ],
  };

  // A slow eight-stage breath gives the score a beginning, bloom, retreat,
  // and return without imposing a conventional beat.
  const ARC = [0.58, 0.72, 0.9, 1, 0.84, 0.66, 0.44, 0.7];

  /* ---------- graph ---------- */
  function init() {
    if (ctx) return;
    ctx = new (window.AudioContext || window.webkitAudioContext)();

    master = ctx.createGain();
    master.gain.value = 0.76;

    compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -18;
    compressor.knee.value = 18;
    compressor.ratio.value = 3;
    compressor.attack.value = 0.025;
    compressor.release.value = 0.45;

    lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 2900;
    lp.Q.value = 0.45;

    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 38;

    const conv = ctx.createConvolver();
    conv.buffer = makeImpulse(4.6, 2.5);

    dry = ctx.createGain(); dry.gain.value = 0.66;
    wet = ctx.createGain(); wet.gain.value = 0.55;
    ambienceBus = ctx.createGain(); ambienceBus.gain.value = 1;

    // Music receives shared tone shaping and reverb; environmental sound stays
    // clearer, but everything passes through the same gentle dynamics stage.
    lp.connect(dry); lp.connect(conv); conv.connect(wet);
    dry.connect(hp); wet.connect(hp); hp.connect(compressor);
    ambienceBus.connect(compressor);
    compressor.connect(master);
    master.connect(ctx.destination);

    buildAmbience();
  }

  function makeImpulse(seconds, decay) {
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++)
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }

  function softenLoopSeam(d, len) {
    // Morph the tail into a reversed copy of the opening. The final samples
    // then meet the first samples at the same values and slopes, removing the
    // broadband impulse otherwise produced by a raw noise-buffer loop.
    const fade = Math.min(Math.floor(ctx.sampleRate * 0.09), Math.floor(len / 5));
    const head = d.slice(0, fade);
    for (let i = 0; i < fade; i++) {
      const t0 = (i + 1) / fade;
      const t = t0 * t0 * (3 - 2 * t0);
      const at = len - fade + i;
      d[at] = d[at] * (1 - t) + head[fade - 1 - i] * t;
    }
  }

  function noiseBuffer(seconds, fn, seamless = false) {
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    fn(d, len);
    if (seamless) softenLoopSeam(d, len);
    return buf;
  }

  function buildAmbience() {
    // Wind: filtered brown noise with an almost imperceptible breathing gust.
    const windBuf = noiseBuffer(4, (d, len) => {
      let last = 0;
      for (let i = 0; i < len; i++) {
        const w = Math.random() * 2 - 1;
        last = (last + 0.02 * w) / 1.02;
        d[i] = last * 3.5;
      }
    }, true);
    const windSrc = ctx.createBufferSource();
    windSrc.buffer = windBuf; windSrc.loop = true;
    const windLp = ctx.createBiquadFilter();
    windLp.type = "lowpass"; windLp.frequency.value = 320;
    windGain = ctx.createGain(); windGain.gain.value = 0;
    const gustLfo = ctx.createOscillator();
    gustLfo.frequency.value = 0.07;
    const gustAmt = ctx.createGain(); gustAmt.gain.value = 90;
    gustLfo.connect(gustAmt); gustAmt.connect(windLp.frequency);
    gustLfo.start();
    windSrc.connect(windLp); windLp.connect(windGain); windGain.connect(ambienceBus);
    windSrc.start();

    // Rain: a soft, wide band rather than a bright digital hiss.
    const rainBuf = noiseBuffer(3, (d, len) => {
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }, true);
    const rainSrc = ctx.createBufferSource();
    rainSrc.buffer = rainBuf; rainSrc.loop = true;
    const rainBp = ctx.createBiquadFilter();
    rainBp.type = "bandpass"; rainBp.frequency.value = 2200; rainBp.Q.value = 0.4;
    rainGain = ctx.createGain(); rainGain.gain.value = 0;
    rainSrc.connect(rainBp); rainBp.connect(rainGain); rainGain.connect(ambienceBus);
    rainSrc.start();

    // Very faint tape hiss. Earlier versions injected single-sample vinyl pops
    // here; those impulses were easily mistaken for audio glitches.
    const crBuf = noiseBuffer(2.7, (d, len) => {
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * 0.006;
    }, true);
    const crSrc = ctx.createBufferSource();
    crSrc.buffer = crBuf; crSrc.loop = true;
    const crHp = ctx.createBiquadFilter();
    crHp.type = "highpass"; crHp.frequency.value = 1400;
    crackleGain = ctx.createGain(); crackleGain.gain.value = 0;
    crSrc.connect(crHp); crHp.connect(crackleGain); crackleGain.connect(ambienceBus);
    crSrc.start();
  }

  /* ---------- scene identity ---------- */
  function weightedPick(srng, pairs) {
    let total = 0;
    for (const [, weight] of pairs) total += weight;
    let roll = srng() * total;
    for (const [value, weight] of pairs) {
      roll -= weight;
      if (roll <= 0) return value;
    }
    return pairs[pairs.length - 1][0];
  }

  function chooseMode(sc, srng) {
    if (sc.darkCastle || sc.weather === "storm")
      return weightedPick(srng, [["phrygian", 56], ["aeolian", 34], ["dorian", 10]]);
    if (["dawn", "morning", "golden"].includes(sc.timeOfDay))
      return weightedPick(srng, [["dorian", 48], ["aeolian", 42], ["phrygian", 10]]);
    if (["swamp", "darkforest"].includes(sc.terrain))
      return weightedPick(srng, [["aeolian", 46], ["phrygian", 42], ["dorian", 12]]);
    return weightedPick(srng, [["aeolian", 52], ["dorian", 30], ["phrygian", 18]]);
  }

  function makeMotif(srng) {
    const length = 3 + Math.floor(srng() * 3);
    let degree = Math.floor(srng() * 4);
    const notes = [];
    for (let i = 0; i < length; i++) {
      notes.push({
        semi: scaleSemis[degree] + 12,
        hold: 1.8 + srng() * 2.8,
        rest: 0.55 + srng() * 1.8,
      });
      const step = [-2, -1, 0, 1, 1, 2][Math.floor(srng() * 6)];
      degree = clamp(degree + step, 0, scaleSemis.length - 1);
    }
    return notes;
  }

  function makeArrangement(sc, srng) {
    const water = sc.hasWater;
    const night = sc.pal.night;
    const snow = sc.weather === "snow" || sc.season === "winter";
    const forest = sc.terrain === "darkforest";
    const storm = sc.weather === "storm";
    const grim = ["dragon", "orcs", "village", "battlefield", "ghosts", "ravens", "volcano", "eruption"].includes(sc.omen);
    const a = {
      padLevel: 1,
      padStep: 16 + srng() * 5,
      padDuration: 22 + srng() * 7,
      padBrightness: 720 + srng() * 260,
      leadLevel: 1,
      leadGap: 30 + srng() * 18,
      leadWave: srng() < 0.64 ? "sawtooth" : "square",
      stereoWidth: 0.28 + srng() * 0.2,
      echo: water ? 0.2 : 0.11,
      wet: water ? 0.65 : 0.55,
      dry: water ? 0.6 : 0.68,
      droneLevel: 1,
      bells: night,
    };
    if (night) {
      a.padBrightness *= 0.72; a.wet += 0.08; a.dry -= 0.06;
      a.leadGap *= 1.16; a.droneLevel *= 1.08;
    }
    if (snow) {
      a.padLevel *= 0.76; a.padStep *= 1.13; a.leadGap *= 1.25;
      a.wet += 0.08; a.bells = true; a.leadWave = "triangle";
    }
    if (forest) {
      a.padBrightness *= 0.67; a.droneLevel *= 1.12;
      a.leadLevel *= 0.82; a.leadGap *= 1.15;
    }
    if (storm) {
      a.padBrightness *= 0.68; a.padLevel *= 1.06;
      a.padStep *= 0.9; a.echo *= 0.65; a.wet += 0.04;
    }
    if (sc.timeOfDay === "dawn" || sc.timeOfDay === "golden") {
      a.padBrightness *= 1.2; a.leadWave = "triangle"; a.leadGap *= 0.9;
    }
    if (grim || sc.darkCastle) {
      a.droneLevel *= 1.1; a.padBrightness *= 0.82; a.leadLevel *= 0.88;
    }
    a.wet = clamp(a.wet, 0.42, 0.76);
    a.dry = clamp(a.dry, 0.5, 0.74);
    return a;
  }

  function transitionMusicBus(now) {
    const oldBus = musicBus;
    musicBus = ctx.createGain();
    musicBus.gain.setValueAtTime(0.0001, now);
    musicBus.gain.linearRampToValueAtTime(1, now + (oldBus ? 6 : 2.5));
    musicBus.connect(lp);
    if (oldBus) {
      oldBus.gain.cancelScheduledValues(now);
      oldBus.gain.setValueAtTime(Math.max(0.0001, oldBus.gain.value), now);
      oldBus.gain.linearRampToValueAtTime(0.0001, now + 6);
      setTimeout(() => {
        try { oldBus.disconnect(); } catch (e) { /* already disconnected */ }
      }, 8500);
    }
  }

  /* ---------- pads: the harmonic heart ---------- */
  function makePanner(pan) {
    if (!ctx.createStereoPanner) return ctx.createGain();
    const p = ctx.createStereoPanner();
    p.pan.value = clamp(pan, -0.8, 0.8);
    return p;
  }

  function playPad(when, semis, dur, intensity) {
    const bus = musicBus;
    const voiceGain = 0.0185 * arrangement.padLevel * intensity;
    for (let note = 0; note < semis.length; note++) {
      const freq = rootHz * Math.pow(2, semis[note] / 12);
      for (let v = 0; v < 2; v++) {
        const osc = ctx.createOscillator();
        osc.type = "sawtooth";
        osc.frequency.value = freq;
        osc.detune.value = v === 0 ? -7 : 7;

        // Very slow pitch wander keeps sustained oscillators from sounding
        // mathematically frozen without creating audible vibrato.
        const drift = ctx.createOscillator();
        drift.frequency.value = 0.025 + rng() * 0.045;
        const driftAmt = ctx.createGain(); driftAmt.gain.value = 1.2 + rng() * 1.8;
        drift.connect(driftAmt); driftAmt.connect(osc.detune);

        const f = ctx.createBiquadFilter();
        f.type = "lowpass"; f.Q.value = 0.65;
        const peak = arrangement.padBrightness * (0.8 + rng() * 0.45);
        f.frequency.setValueAtTime(230, when);
        f.frequency.linearRampToValueAtTime(peak, when + dur * 0.48);
        f.frequency.linearRampToValueAtTime(210, when + dur);
        const filterLfo = ctx.createOscillator();
        filterLfo.frequency.value = 0.045 + rng() * 0.065;
        const filterAmt = ctx.createGain(); filterAmt.gain.value = 85;
        filterLfo.connect(filterAmt); filterAmt.connect(f.frequency);

        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, when);
        g.gain.linearRampToValueAtTime(voiceGain, when + dur * 0.32);
        g.gain.setValueAtTime(voiceGain, when + dur * 0.66);
        g.gain.linearRampToValueAtTime(0.0001, when + dur);

        const side = v === 0 ? -1 : 1;
        const spread = side * arrangement.stereoWidth * (0.55 + note / semis.length * 0.45);
        const pan = makePanner(spread);
        osc.connect(f); f.connect(g); g.connect(pan); pan.connect(bus);
        drift.start(when); filterLfo.start(when); osc.start(when);
        drift.stop(when + dur + 0.3); filterLfo.stop(when + dur + 0.3); osc.stop(when + dur + 0.3);
      }
    }
  }

  /* ---------- recurring melodic motif ---------- */
  function playLeadNote(when, semi, dur, noteIndex) {
    const bus = musicBus;
    const freq = rootHz * Math.pow(2, semi / 12);
    const osc = ctx.createOscillator();
    osc.type = arrangement.leadWave;
    osc.frequency.value = freq;

    const vib = ctx.createOscillator();
    vib.frequency.value = 4.1 + rng() * 1.2;
    const vibAmt = ctx.createGain(); vibAmt.gain.value = 2 + rng() * 3.5;
    vib.connect(vibAmt); vibAmt.connect(osc.detune);

    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = Math.min(1500, arrangement.padBrightness * 1.45);
    f.Q.value = 1;
    const g = ctx.createGain();
    const level = 0.014 * arrangement.leadLevel;
    g.gain.setValueAtTime(0.0001, when);
    g.gain.linearRampToValueAtTime(level, when + Math.min(1.1, dur * 0.3));
    g.gain.setValueAtTime(level, when + dur * 0.62);
    g.gain.linearRampToValueAtTime(0.0001, when + dur);

    const pan = makePanner((noteIndex % 2 ? 1 : -1) * arrangement.stereoWidth * 0.45);
    osc.connect(f); f.connect(g); g.connect(pan); pan.connect(bus);

    // One quiet echo gives water and cavernous scenes extra space without
    // turning the melody into a rhythmic delay pattern.
    if (arrangement.echo > 0) {
      const delay = ctx.createDelay(2);
      delay.delayTime.value = 0.65 + rng() * 0.45;
      const echoGain = ctx.createGain(); echoGain.gain.value = arrangement.echo;
      pan.connect(delay); delay.connect(echoGain); echoGain.connect(bus);
    }

    vib.start(when); osc.start(when);
    vib.stop(when + dur + 0.2); osc.stop(when + dur + 0.2);
  }

  function playMotif(when) {
    let notes = motif.slice();
    if (motifTurn % 3 === 1) notes = notes.slice().reverse();
    const octaveLift = motifTurn % 4 === 3 ? 12 : 0;
    let cursor = when;
    for (let i = 0; i < notes.length; i++) {
      const n = notes[i];
      playLeadNote(cursor, n.semi + octaveLift, n.hold, i);
      cursor += n.hold * 0.7 + n.rest;
    }
    motifTurn++;
    return cursor - when;
  }

  /* ---------- motif-derived bells ---------- */
  function playBell(when, semi) {
    const bus = musicBus;
    const freq = rootHz * Math.pow(2, (semi + 12) / 12);
    const pan = makePanner((bellIndex % 2 ? 1 : -1) * arrangement.stereoWidth * 0.7);
    for (const [mult, amp] of [[1, 0.024], [2.01, 0.008], [3.98, 0.003]]) {
      const osc = ctx.createOscillator();
      osc.type = "sine"; osc.frequency.value = freq * mult;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, when);
      g.gain.linearRampToValueAtTime(amp, when + 0.025);
      g.gain.exponentialRampToValueAtTime(0.0001, when + 4.8);
      osc.connect(g); g.connect(pan);
      osc.start(when); osc.stop(when + 5);
    }
    pan.connect(bus);
  }

  /* ---------- drone ---------- */
  let droneNodes = [];
  function startDrone() {
    stopDrone();
    const bus = musicBus;
    const make = (mult, gainV, type, panV) => {
      const osc = ctx.createOscillator();
      osc.type = type; osc.frequency.value = rootHz * mult;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, ctx.currentTime);
      g.gain.linearRampToValueAtTime(gainV * arrangement.droneLevel, ctx.currentTime + 6);
      const pan = makePanner(panV);
      osc.connect(g); g.connect(pan); pan.connect(bus);
      osc.start();
      droneNodes.push({ osc, g });
    };
    make(0.5, 0.038, "sine", -0.08);                 // sub octave
    make(1, 0.034, "sine", 0.08);                    // tonal root
    make(0.5 * Math.pow(2, 7 / 12), 0.018, "triangle", 0.16);
  }

  function stopDrone() {
    if (!ctx) return;
    for (const n of droneNodes) {
      try {
        n.g.gain.cancelScheduledValues(ctx.currentTime);
        n.g.gain.setValueAtTime(Math.max(0.0001, n.g.gain.value), ctx.currentTime);
        n.g.gain.linearRampToValueAtTime(0.0001, ctx.currentTime + 4);
        n.osc.stop(ctx.currentTime + 4.2);
      } catch (e) { /* already stopped */ }
    }
    droneNodes = [];
  }

  /* ---------- scheduler ---------- */
  function schedule() {
    if (!scene || !arrangement || !musicBus) return;
    const now = ctx.currentTime;
    const ahead = 0.5;

    // Catch up at most two events after a suspended tab; never flood the graph.
    let guard = 0;
    while (now + ahead >= padNext && guard++ < 2) {
      const when = Math.max(padNext, now + 0.03);
      const dur = arrangement.padDuration * (0.9 + rng() * 0.2);
      playPad(when, progression[progressionIndex], dur, ARC[arcIndex]);
      progressionIndex = (progressionIndex + 1) % progression.length;
      arcIndex = (arcIndex + 1) % ARC.length;
      padNext = when + arrangement.padStep * (0.92 + rng() * 0.16);
    }

    if (now + ahead >= leadNext) {
      const when = Math.max(leadNext, now + 0.08);
      const phraseDur = playMotif(when);
      leadNext = when + phraseDur + arrangement.leadGap * (0.8 + rng() * 0.4);
    }

    if (arrangement.bells && now + ahead >= bellNext) {
      const when = Math.max(bellNext, now + 0.06);
      const note = motif[bellIndex % motif.length];
      playBell(when, note.semi);
      bellIndex++;
      bellNext = when + 11 + rng() * 21;
    }
  }

  /* ---------- public ---------- */
  function start(sc) {
    init();
    if (ctx.state === "suspended") ctx.resume();
    started = true;
    setScene(sc);
    if (!schedTimer) schedTimer = setInterval(schedule, 80);
  }

  function setScene(sc) {
    scene = sc;
    if (!ctx) return;
    const srng = mulberry32(sc.seed ^ 0x51ab3d);
    rng = srng;

    modeName = chooseMode(sc, srng);
    scaleSemis = MODES[modeName];
    progression = PROGRESSIONS[modeName][Math.floor(srng() * PROGRESSIONS[modeName].length)];
    motif = makeMotif(srng);
    arrangement = makeArrangement(sc, srng);
    progressionIndex = 0; arcIndex = 0; motifTurn = 0; bellIndex = 0;

    // Deep root between E2 and B2; the sub drone lives one and two octaves down.
    const rootMidi = 40 + Math.floor(srng() * 8);
    rootHz = 440 * Math.pow(2, (rootMidi - 69) / 12);

    const now = ctx.currentTime;
    transitionMusicBus(now);
    padNext = now + 0.5;
    leadNext = now + 15 + srng() * 16;
    bellNext = now + 9 + srng() * 5;
    startDrone();

    // Scene-aware ambience and space.
    const wind = 0.015 + sc.windLevel * (sc.terrain === "darkforest" ? 0.075 : 0.105);
    windGain.gain.cancelScheduledValues(now);
    windGain.gain.setValueAtTime(windGain.gain.value, now);
    windGain.gain.linearRampToValueAtTime(wind, now + 4);
    const rain = sc.weather === "rain" ? 0.022 : sc.weather === "storm" ? 0.038 : 0;
    rainGain.gain.cancelScheduledValues(now);
    rainGain.gain.setValueAtTime(rainGain.gain.value, now);
    rainGain.gain.linearRampToValueAtTime(rain, now + 4);
    const crackle = sc.pal.night ? 0.014 : sc.weather === "rain" ? 0.007 : 0.01;
    crackleGain.gain.cancelScheduledValues(now);
    crackleGain.gain.setValueAtTime(crackleGain.gain.value, now);
    crackleGain.gain.linearRampToValueAtTime(crackle, now + 3);

    dry.gain.cancelScheduledValues(now);
    dry.gain.setValueAtTime(dry.gain.value, now);
    dry.gain.linearRampToValueAtTime(arrangement.dry, now + 5);
    wet.gain.cancelScheduledValues(now);
    wet.gain.setValueAtTime(wet.gain.value, now);
    wet.gain.linearRampToValueAtTime(arrangement.wet, now + 5);
    lp.frequency.cancelScheduledValues(now);
    lp.frequency.setValueAtTime(lp.frequency.value, now);
    lp.frequency.linearRampToValueAtTime(sc.pal.night ? 2250 : sc.weather === "storm" ? 2050 : 2950, now + 4);
  }

  function thunder(delay) {
    if (!ctx || !started || muted) return;
    const when = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(3.5, (d, len) => {
      for (let i = 0; i < len; i++) {
        const env = Math.pow(1 - i / len, 1.6) * (0.6 + 0.4 * Math.sin(i / 3000));
        d[i] = (Math.random() * 2 - 1) * env;
      }
    });
    const f = ctx.createBiquadFilter();
    f.type = "lowpass"; f.frequency.value = 140; f.Q.value = 0.5;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, when);
    g.gain.linearRampToValueAtTime(0.48, when + 0.04);
    src.connect(f); f.connect(g); g.connect(ambienceBus);
    src.start(when);
  }

  function toggleMute() {
    if (!ctx) return true;
    muted = !muted;
    const now = ctx.currentTime;
    master.gain.cancelScheduledValues(now);
    master.gain.setValueAtTime(master.gain.value, now);
    master.gain.linearRampToValueAtTime(muted ? 0.0001 : 0.76, now + 0.45);
    return muted;
  }

  return {
    start, setScene, thunder, toggleMute,
    get started() { return started; },
    get ctx() { return ctx; },
    get master() { return master; },
  };
})();
