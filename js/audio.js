// There's No Floor - procedural audio (sound effects + chiptune music)
const Sound = (() => {
  let ctx = null, master = null, compressor = null, sfx = null, music = null, musicFilter = null, noiseBuf = null;
  let unlocked = false;

  function readPref(key, fallback = true) {
    try {
      const v = localStorage.getItem(key);
      return v === null ? fallback : v !== '0';
    } catch (e) {
      return fallback;
    }
  }
  function writePref(key, on) {
    try { localStorage.setItem(key, on ? '1' : '0'); } catch (e) { /* ignore */ }
  }

  let musicOn = readPref('tnf_music', true);
  let sfxOn = readPref('tnf_sfx', true);
  let playing = false, paused = false, step = 0, nextTime = 0, timer = null;

  const MASTER_VOL = 0.9;
  const MUSIC_VOL = 0.58;
  const SFX_VOL = 1.0;
  const mtof = m => 440 * Math.pow(2, (m - 69) / 12);

  function setGainSmooth(node, target, tau = 0.015) {
    if (!ctx || !node) return;
    const now = ctx.currentTime;
    node.gain.cancelScheduledValues(now);
    node.gain.setTargetAtTime(target, now, tau);
  }

  function init() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;

    if (!ctx) {
      ctx = new AC();

      compressor = ctx.createDynamicsCompressor();
      compressor.threshold.value = -10;
      compressor.knee.value = 14;
      compressor.ratio.value = 6;
      compressor.attack.value = 0.003;
      compressor.release.value = 0.12;

      master = ctx.createGain();
      master.gain.value = MASTER_VOL;
      compressor.connect(master);
      master.connect(ctx.destination);

      sfx = ctx.createGain();
      sfx.gain.value = sfxOn ? SFX_VOL : 0;
      sfx.connect(compressor);

      music = ctx.createGain();
      music.gain.value = musicOn ? MUSIC_VOL : 0;

      musicFilter = ctx.createBiquadFilter();
      musicFilter.type = 'lowpass';
      musicFilter.frequency.value = 4600;
      musicFilter.Q.value = 0.6;
      musicFilter.connect(music);
      music.connect(compressor);

      // 2-second white noise buffer (looped when needed)
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;

      ctx.onstatechange = () => {
        if (ctx && ctx.state === 'running' && playing && !paused) {
          nextTime = 0;
          schedule();
        }
      };
    }

    if (ctx.state !== 'running') {
      const p = ctx.resume();
      if (p && p.catch) p.catch(() => {});
    }

    // Play a silent 1-sample buffer once to unlock Web Audio on iOS/Safari
    if (!unlocked && ctx) {
      unlocked = true;
      try {
        const b = ctx.createBuffer(1, 1, ctx.sampleRate);
        const s = ctx.createBufferSource();
        s.buffer = b;
        s.connect(ctx.destination);
        s.start(0);
      } catch (e) { /* ignore */ }
    }

    return ctx;
  }

  // Unlock audio automatically on the first user gesture anywhere on the page
  ['pointerdown', 'touchstart', 'keydown'].forEach(ev => {
    window.addEventListener(ev, () => {
      if (!ctx || ctx.state !== 'running') init();
    }, { passive: true });
  });

  function readyForSfx() {
    if (!sfxOn) return false;
    if (!ctx || ctx.state !== 'running') init();
    return !!ctx;
  }

  // Clean synth tone with attack + sustain + release so notes have full body without clicking
  function tone(f, dur, type = 'square', vol = 0.35, slide = 0, at = null, dest = null, sustain = 0.45) {
    if (!ctx || !f || f <= 0 || !dur || dur <= 0) return;
    const now = ctx.currentTime;
    const t = at === null || at === undefined ? now : Math.max(now, at);
    const d = Math.max(0.015, dur);
    const atk = Math.min(0.005, d * 0.2);
    const holdEnd = t + Math.max(atk + 0.002, d * Math.min(0.85, Math.max(0.1, sustain)));

    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(Math.max(20, f), t);
    if (slide > 0) o.frequency.exponentialRampToValueAtTime(Math.max(20, slide), t + d);

    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + atk);
    g.gain.setValueAtTime(vol, holdEnd);
    g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    g.gain.linearRampToValueAtTime(0, t + d + 0.008);

    o.connect(g);
    g.connect(dest || sfx);
    o.start(t);
    o.stop(t + d + 0.015);
    o.onended = () => { o.disconnect(); g.disconnect(); };
  }

  function noise(dur, vol = 0.35, freq = 1000, at = null, dest = null, filterType = 'lowpass', freqEnd = 0, q = 1) {
    if (!ctx || !noiseBuf || !dur || dur <= 0) return;
    const now = ctx.currentTime;
    const t = at === null || at === undefined ? now : Math.max(now, at);
    const d = Math.max(0.012, dur);
    const atk = Math.min(0.003, d * 0.2);

    const s = ctx.createBufferSource();
    s.buffer = noiseBuf;
    s.loop = true;

    const flt = ctx.createBiquadFilter();
    flt.type = filterType;
    flt.Q.value = q;
    flt.frequency.setValueAtTime(Math.max(40, freq), t);
    if (freqEnd > 0) flt.frequency.exponentialRampToValueAtTime(Math.max(40, freqEnd), t + d);

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + atk);
    g.gain.setValueAtTime(vol * 0.8, t + Math.max(atk + 0.001, d * 0.25));
    g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    g.gain.linearRampToValueAtTime(0, t + d + 0.008);

    s.connect(flt);
    flt.connect(g);
    g.connect(dest || sfx);
    s.start(t, Math.random());
    s.stop(t + d + 0.015);
    s.onended = () => { s.disconnect(); flt.disconnect(); g.disconnect(); };
  }

  const later = d => (ctx ? ctx.currentTime + d : 0);

  // ---------- Sound effects ----------
  const fx = {
    jump() {
      if (!readyForSfx()) return;
      tone(280, 0.14, 'triangle', 0.48, 640, null, sfx, 0.35);
      tone(280, 0.12, 'square', 0.18, 600, null, sfx, 0.3);
    },
    djump() {
      if (!readyForSfx()) return;
      tone(460, 0.15, 'triangle', 0.48, 980, null, sfx, 0.35);
      tone(580, 0.12, 'square', 0.18, 1080, null, sfx, 0.3);
      tone(1175, 0.1, 'sine', 0.28, 1397, later(0.05), sfx, 0.4);
    },
    coin() {
      if (!readyForSfx()) return;
      tone(988, 0.075, 'square', 0.24, 0, null, sfx, 0.55);
      tone(988, 0.075, 'triangle', 0.32, 0, null, sfx, 0.55);
      tone(1319, 0.26, 'square', 0.24, 0, later(0.075), sfx, 0.45);
      tone(1319, 0.26, 'triangle', 0.32, 0, later(0.075), sfx, 0.45);
    },
    death() {
      if (!readyForSfx()) return;
      tone(420, 0.22, 'sawtooth', 0.34, 190, null, sfx, 0.4);
      tone(210, 0.42, 'sawtooth', 0.34, 65, later(0.16), sfx, 0.4);
      noise(0.26, 0.34, 1200, null, sfx, 'lowpass', 240);
    },
    boom() {
      if (!readyForSfx()) return;
      noise(0.58, 0.65, 800, null, sfx, 'lowpass', 110);
      tone(145, 0.45, 'sine', 0.72, 32, null, sfx, 0.35);
      tone(95, 0.35, 'triangle', 0.45, 28, null, sfx, 0.3);
    },
    fuse() {
      if (!readyForSfx()) return;
      tone(1320, 0.04, 'triangle', 0.26, 1580, null, sfx, 0.4);
    },
    check() {
      if (!readyForSfx()) return;
      [523.25, 659.25, 783.99, 1046.5].forEach((n, i) => {
        const at = later(i * 0.065);
        tone(n, 0.2, 'triangle', 0.42, 0, at, sfx, 0.5);
        tone(n, 0.16, 'square', 0.18, 0, at, sfx, 0.45);
      });
    },
    power() {
      if (!readyForSfx()) return;
      [392, 523.25, 659.25, 783.99, 1046.5].forEach((n, i) => {
        const at = later(i * 0.055);
        tone(n, 0.18, 'triangle', 0.45, 0, at, sfx, 0.5);
        tone(n * 2, 0.12, 'sine', 0.2, 0, at, sfx, 0.4);
      });
    },
    shield() {
      if (!readyForSfx()) return;
      tone(1040, 0.28, 'triangle', 0.44, 260, null, sfx, 0.35);
      noise(0.24, 0.36, 3200, null, sfx, 'bandpass', 1200, 2);
    },
    click() {
      if (!readyForSfx()) return;
      tone(700, 0.045, 'triangle', 0.34, 880, null, sfx, 0.4);
      tone(700, 0.035, 'square', 0.12, 860, null, sfx, 0.35);
    },
    win() {
      if (!readyForSfx()) return;
      const notes = [523.25, 659.25, 783.99, 1046.5, 783.99, 1046.5, 1318.51];
      notes.forEach((n, i) => {
        const last = i === notes.length - 1;
        const at = later(i * 0.11);
        tone(n, last ? 0.68 : 0.14, 'square', 0.22, 0, at, sfx, 0.55);
        tone(n, last ? 0.68 : 0.14, 'triangle', 0.34, 0, at, sfx, 0.55);
      });
      const fin = later((notes.length - 1) * 0.11);
      tone(261.63, 0.68, 'triangle', 0.4, 0, fin, sfx, 0.55);
      tone(523.25, 0.68, 'triangle', 0.26, 0, fin, sfx, 0.55);
      tone(783.99, 0.68, 'triangle', 0.22, 0, fin, sfx, 0.55);
    },
    gameover() {
      if (!readyForSfx()) return;
      const notes = [392, 369.99, 349.23, 329.63, 261.63];
      const times = [0, 0.2, 0.4, 0.6, 0.85];
      notes.forEach((n, i) => {
        const last = i === notes.length - 1;
        const at = later(times[i]);
        tone(n, last ? 0.68 : 0.23, 'triangle', 0.48, last ? n * 0.96 : 0, at, sfx, 0.55);
        tone(n * 0.5, last ? 0.68 : 0.21, 'sine', 0.32, 0, at, sfx, 0.55);
      });
    },
  };

  // ---------- Music (upbeat 8-bar C-major chiptune parkour loop) ----------
  const BPM = 136;
  const STEP = 60 / BPM / 4; // 16th-note duration (~0.1103s)

  // 8 bars: C - G - Am - F - C - G - F - G
  // Each chord: [bassRoot, bassFifth, triadLow, triadMid, triadHigh]
  const CHORDS = [
    [48, 55, 60, 64, 67], // C
    [43, 50, 59, 62, 67], // G
    [45, 52, 57, 60, 64], // Am
    [41, 48, 57, 60, 65], // F
    [48, 55, 60, 64, 67], // C
    [43, 50, 59, 62, 67], // G
    [41, 48, 57, 60, 65], // F
    [43, 50, 59, 62, 67], // G
  ];

  // Mid-register accompaniment arpeggio indices into chord[2..4]
  const ARP = [2, 3, 4, 3, 2, 4, 3, 4];

  // 128-step lead melody (MIDI notes, 0 = rest)
  const MEL = [
    // Bar 0 (C)
    76, 0, 79, 0, 84, 0, 79, 0, 76, 0, 74, 0, 72, 0, 74, 0,
    // Bar 1 (G)
    74, 0, 79, 0, 79, 0, 76, 0, 74, 0, 0, 0, 71, 0, 74, 0,
    // Bar 2 (Am)
    72, 0, 76, 0, 81, 0, 79, 0, 76, 0, 74, 0, 72, 0, 0, 0,
    // Bar 3 (F)
    69, 0, 72, 0, 77, 0, 76, 0, 74, 0, 72, 0, 74, 0, 0, 0,
    // Bar 4 (C)
    76, 0, 79, 0, 84, 0, 83, 0, 84, 0, 79, 0, 76, 0, 72, 0,
    // Bar 5 (G)
    74, 0, 79, 0, 83, 0, 81, 0, 79, 0, 76, 0, 74, 0, 0, 0,
    // Bar 6 (F)
    77, 0, 76, 0, 74, 0, 72, 0, 74, 0, 76, 0, 77, 0, 79, 0,
    // Bar 7 (G)
    79, 0, 76, 0, 74, 0, 71, 0, 74, 0, 76, 0, 74, 0, 0, 0,
  ];

  function playStep(s, t) {
    const bar = Math.floor(s / 16) % CHORDS.length;
    const i = s % 16;
    const ch = CHORDS[bar];

    // Bouncy audible bass (8th notes, root / fifth / octave)
    if (i % 2 === 0) {
      const bassMidi = (i % 8 === 4) ? ch[1] : (i % 4 === 2 ? ch[0] + 12 : ch[0]);
      tone(mtof(bassMidi), STEP * 1.7, 'triangle', 0.46, 0, t, musicFilter, 0.55);
    }

    // Soft mid-register harmonic arpeggio on 8th notes (sits cleanly beneath the melody)
    if (i % 2 === 0) {
      const arpNote = ch[ARP[(i >> 1) % ARP.length]];
      tone(mtof(arpNote), STEP * 1.5, 'triangle', 0.18, 0, t, musicFilter, 0.45);
    }

    // Lead melody
    const m = MEL[s % MEL.length];
    if (m) {
      const nextRest = !MEL[(s + 1) % MEL.length];
      const dur = STEP * (nextRest ? 1.85 : 0.95);
      tone(mtof(m), dur, 'square', 0.22, 0, t, musicFilter, 0.55);
      tone(mtof(m), dur, 'triangle', 0.16, 0, t, musicFilter, 0.55);
    }

    // Drums: kick on 1 & 3 (plus upbeat pickup on turnaround bars)
    if (i === 0 || i === 8 || ((bar === 3 || bar === 7) && i === 14)) {
      tone(150, 0.12, 'sine', 0.55, 44, t, music, 0.25);
    }
    // Snare on 2 & 4
    if (i === 4 || i === 12) {
      noise(0.095, 0.24, 2200, t, music, 'bandpass', 0, 1.2);
      tone(195, 0.065, 'triangle', 0.22, 110, t, music, 0.25);
    }
    // Crisp high-passed 8th-note hi-hat with accented off-beats
    if (i % 2 === 0) {
      const accent = i % 4 === 2 ? 0.14 : 0.07;
      noise(0.035, accent, 7800, t, music, 'highpass', 0, 0.8);
    }
  }

  function schedule() {
    if (!playing || paused || !ctx || ctx.state !== 'running') return;
    if (!musicOn) {
      nextTime = 0;
      return;
    }

    const now = ctx.currentTime;
    if (nextTime === 0 || nextTime < now - 0.12) {
      nextTime = now + 0.05;
    }

    let safety = 0;
    while (nextTime < now + 0.16 && safety < 8) {
      playStep(step, nextTime);
      nextTime += STEP;
      step = (step + 1) % MEL.length;
      safety++;
    }
  }

  function ensureTimer() {
    if (timer) clearInterval(timer);
    timer = setInterval(schedule, 25);
  }

  function startMusic(reset = true) {
    init();
    if (!ctx) return;
    if (reset) step = 0;
    playing = true;
    paused = false;
    nextTime = 0;
    setGainSmooth(music, musicOn ? MUSIC_VOL : 0, 0.015);
    ensureTimer();
    schedule();
  }

  function pauseMusic() {
    if (!playing) return;
    paused = true;
    clearInterval(timer);
    timer = null;
    setGainSmooth(music, 0, 0.015);
  }

  function resumeMusic() {
    if (!playing) return;
    init();
    paused = false;
    nextTime = 0;
    setGainSmooth(music, musicOn ? MUSIC_VOL : 0, 0.015);
    ensureTimer();
    schedule();
  }

  function stopMusic() {
    playing = false;
    paused = false;
    step = 0;
    nextTime = 0;
    clearInterval(timer);
    timer = null;
    setGainSmooth(music, 0, 0.015);
  }

  function setMusic(on) {
    musicOn = !!on;
    writePref('tnf_music', musicOn);
    if (ctx && music) {
      setGainSmooth(music, musicOn && playing && !paused ? MUSIC_VOL : 0, 0.015);
    }
    if (musicOn && playing && !paused) {
      nextTime = 0;
      ensureTimer();
      schedule();
    }
  }

  function setSfx(on) {
    sfxOn = !!on;
    writePref('tnf_sfx', sfxOn);
    if (ctx && sfx) {
      setGainSmooth(sfx, sfxOn ? SFX_VOL : 0, 0.004);
    }
  }

  // Expose live getters via Object.defineProperties (Object.assign would freeze them!)
  const api = Object.assign({}, fx, {
    init, startMusic, pauseMusic, resumeMusic, stopMusic, setMusic, setSfx,
  });
  Object.defineProperties(api, {
    musicOn: { get() { return musicOn; }, enumerable: true },
    sfxOn: { get() { return sfxOn; }, enumerable: true },
  });
  return api;
})();
