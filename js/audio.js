// There's No Floor - procedural audio (sound effects + chiptune music)
const Sound = (() => {
  let ctx = null, master, sfx, music, noiseBuf;
  let musicOn = localStorage.getItem('tnf_music') !== '0';
  let sfxOn = localStorage.getItem('tnf_sfx') !== '0';
  let playing = false, step = 0, nextTime = 0, timer = null;
  const MUSIC_VOL = 0.22;
  const mtof = m => 440 * Math.pow(2, (m - 69) / 12);

  function init() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = 0.6; master.connect(ctx.destination);
    sfx = ctx.createGain(); sfx.gain.value = sfxOn ? 1 : 0; sfx.connect(master);
    music = ctx.createGain(); music.gain.value = musicOn ? MUSIC_VOL : 0; music.connect(master);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }

  // f: frequency, dur: seconds, at: absolute audio time (defaults to now)
  function tone(f, dur, type = 'square', vol = 0.2, slide = 0, at = null, dest = null) {
    if (!ctx) return;
    const t = at === null ? ctx.currentTime : at;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest || sfx);
    o.start(t); o.stop(t + dur + 0.05);
  }

  function noise(dur, vol = 0.3, freq = 1000, at = null, dest = null) {
    if (!ctx) return;
    const t = at === null ? ctx.currentTime : at;
    const s = ctx.createBufferSource(); s.buffer = noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(freq, t);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(dest || sfx);
    s.start(t); s.stop(t + dur + 0.05);
  }

  const later = d => (ctx ? ctx.currentTime + d : 0);

  // ---------- Sound effects ----------
  const fx = {
    jump()   { tone(320, 0.15, 'square', 0.15, 640); },
    djump()  { tone(520, 0.16, 'square', 0.15, 1000); },
    coin()   { tone(988, 0.08, 'square', 0.15); tone(1319, 0.25, 'square', 0.15, 0, later(0.08)); },
    death()  { tone(440, 0.6, 'sawtooth', 0.2, 55); noise(0.3, 0.2, 1500); },
    boom()   { noise(0.7, 0.6, 700); tone(140, 0.5, 'sine', 0.6, 30); },
    fuse()   { tone(1400, 0.03, 'square', 0.05); },
    check()  { [523, 659, 784, 1047].forEach((n, i) => tone(n, 0.15, 'square', 0.13, 0, later(i * 0.07))); },
    power()  { [392, 523, 659, 784, 1047].forEach((n, i) => tone(n, 0.12, 'triangle', 0.25, 0, later(i * 0.05))); },
    shield() { tone(900, 0.3, 'triangle', 0.25, 200); noise(0.2, 0.15, 3000); },
    click()  { tone(660, 0.05, 'square', 0.1); },
    win() {
      const notes = [523, 659, 784, 1047, 784, 1047, 1319];
      notes.forEach((n, i) => tone(n, i === notes.length - 1 ? 0.6 : 0.14, 'square', 0.14, 0, later(i * 0.11)));
    },
    gameover() { [392, 330, 262, 196].forEach((n, i) => tone(n, 0.3, 'triangle', 0.3, 0, later(i * 0.22))); },
  };

  // ---------- Music (C - Am - F - G chiptune loop) ----------
  const BPM = 150, STEP = 60 / BPM / 4;
  const CHORDS = [[48, 60, 64, 67], [45, 57, 60, 64], [41, 57, 60, 65], [43, 59, 62, 67]];
  const ARP = [1, 2, 3, 2, 1, 3, 2, 3, 1, 2, 3, 2, 3, 2, 1, 2];
  const MEL = [
    72, 0, 0, 0, 76, 0, 79, 0, 0, 0, 76, 0, 72, 0, 0, 0,
    69, 0, 0, 0, 72, 0, 76, 0, 0, 0, 74, 0, 72, 0, 0, 0,
    72, 0, 0, 0, 69, 0, 72, 0, 77, 0, 0, 0, 76, 0, 74, 0,
    74, 0, 0, 0, 71, 0, 74, 0, 79, 0, 0, 0, 77, 0, 74, 0,
  ];

  function playStep(s, t) {
    const bar = Math.floor(s / 16) % 4, i = s % 16, ch = CHORDS[bar];
    if (i % 2 === 0) tone(mtof(ch[0] - 12 + (i % 4 === 2 ? 12 : 0)), STEP * 1.6, 'triangle', 0.5, 0, t, music);
    tone(mtof(ch[ARP[i]] + 12), STEP * 0.9, 'square', 0.07, 0, t, music);
    if (i % 4 === 2) noise(0.04, 0.12, 9000, t, music);
    if (i % 8 === 0) tone(150, 0.12, 'sine', 0.6, 40, t, music);
    const m = MEL[s % 64];
    if (s >= 64 && m) tone(mtof(m), STEP * 1.8, 'square', 0.09, 0, t, music);
  }

  function schedule() {
    while (nextTime < ctx.currentTime + 0.15) {
      playStep(step, nextTime);
      nextTime += STEP;
      step = (step + 1) % 128;
    }
  }

  function startMusic() {
    init();
    if (!ctx || playing) return;
    playing = true; step = 0; nextTime = ctx.currentTime + 0.05;
    timer = setInterval(schedule, 25);
  }
  function stopMusic() { playing = false; clearInterval(timer); }

  function setMusic(on) {
    musicOn = on; localStorage.setItem('tnf_music', on ? '1' : '0');
    if (music) music.gain.value = on ? MUSIC_VOL : 0;
  }
  function setSfx(on) {
    sfxOn = on; localStorage.setItem('tnf_sfx', on ? '1' : '0');
    if (sfx) sfx.gain.value = on ? 1 : 0;
  }

  return Object.assign(fx, {
    init, startMusic, stopMusic, setMusic, setSfx,
    get musicOn() { return musicOn; }, get sfxOn() { return sfxOn; },
  });
})();
