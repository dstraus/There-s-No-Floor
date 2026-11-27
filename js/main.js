// There's No Floor - game loop, states, camera, HUD and menus
(() => {
  const $ = id => document.getElementById(id);
  const canvas = $('game');

  // ---------- Renderer / scene ----------
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(65, 1, 0.1, 300);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8899bb, 0.75));
  const sun = new THREE.DirectionalLight(0xffffff, 0.8);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -18, right: 18, top: 18, bottom: -18, near: 1, far: 70 });
  sun.shadow.camera.updateProjectionMatrix();
  scene.add(sun, sun.target);

  function resize() {
    renderer.setSize(innerWidth, innerHeight, false);
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
  }
  addEventListener('resize', resize); resize();

  const world = new World(scene);
  const player = new Player(scene);

  // ---------- Save data ----------
  const save = {
    get unlocked() { return Math.max(1, +localStorage.getItem('tnf_unlocked') || 1); },
    set unlocked(v) { localStorage.setItem('tnf_unlocked', v); },
    best(i) { const v = localStorage.getItem('tnf_best_' + i); return v === null ? null : +v; },
    coins(i) { return +localStorage.getItem('tnf_coins_' + i) || 0; },
    get endlessBest() { return +localStorage.getItem('tnf_endless_best') || 0; },
    set endlessBest(v) { localStorage.setItem('tnf_endless_best', v); },
  };

  // ---------- State ----------
  const MAX_LIVES = 10;
  let state = 'menu', mode = 'level', li = 0, time = 0, lives = MAX_LIVES, coins = 0;
  let distance = 0, nextMilestone = 100, runStartBest = 0, passedRecord = false, lastSkyHex = '';
  let respawn = new THREE.Vector3(), invuln = 0, deadT = 0, hadLock = false, hudCache = '';
  let yaw = 0, pitch = 0.35;
  const camT = new THREE.Vector3();
  const skyTarget = new THREE.Color();
  const powers = { double: 0, speed: 0, jump: 0, shield: false };

  Input.init(canvas, { canLook: () => state === 'playing' });
  if (Input.isTouch) document.body.classList.add('touch');

  // ---------- UI helpers ----------
  const screens = ['menu', 'levels', 'pause', 'complete', 'gameover'];
  function show(name) {
    for (const s of screens) $(s).classList.toggle('hidden', s !== name);
    const inGame = state === 'playing' || state === 'paused';
    $('hud').classList.toggle('hidden', !inGame && state !== 'complete');
    $('touch').classList.toggle('hidden', !(Input.isTouch && state === 'playing'));
  }
  let toastT = 0;
  function toast(msg) { $('toast').textContent = msg; $('toast').classList.add('show'); toastT = 1.6; }
  function flash(color) {
    const f = $('flash'); f.style.transition = 'none'; f.style.background = color; f.style.opacity = '0.45';
    requestAnimationFrame(() => { f.style.transition = 'opacity 0.5s'; f.style.opacity = '0'; });
  }
  function fmt(t) {
    const m = Math.floor(t / 60), s = t - m * 60;
    return `${m}:${s < 10 ? '0' : ''}${s.toFixed(2)}`;
  }
  function refreshToggles() {
    document.querySelectorAll('.tg-music').forEach(b => { b.textContent = 'MUSIC: ' + (Sound.musicOn ? 'ON' : 'OFF'); b.classList.toggle('off', !Sound.musicOn); });
    document.querySelectorAll('.tg-sfx').forEach(b => { b.textContent = 'SFX: ' + (Sound.sfxOn ? 'ON' : 'OFF'); b.classList.toggle('off', !Sound.sfxOn); });
  }
  function refreshMenu() {
    const best = save.endlessBest;
    $('btn-endless').innerHTML = best > 0
      ? `INFINITY<span class="btn-sub">BEST: ${best}m</span>`
      : 'INFINITY';
  }
  function buildLevelGrid() {
    const grid = $('level-grid'); grid.innerHTML = '';
    LEVELS.forEach((lv, i) => {
      const locked = i >= save.unlocked, best = save.best(i);
      const total = lv.items.filter(it => it.t === 'coin').length;
      const b = document.createElement('button');
      b.className = 'lvl' + (locked ? ' locked' : '');
      b.innerHTML = `<div class="n">${i + 1}. ${lv.name.toUpperCase()}</div><div class="d">${locked ? 'LOCKED' :
        `BEST: ${best === null ? '--' : fmt(best)}<br>COINS: ${save.coins(i)}/${total}`}</div>`;
      if (!locked) b.onclick = () => { Sound.init(); Sound.click(); startLevel(i); };
      grid.appendChild(b);
    });
  }

  // ---------- Level flow ----------
  function setSky(hex) {
    scene.background = new THREE.Color(hex);
    scene.fog = new THREE.Fog(hex, 35, 110);
    lastSkyHex = hex.toString(16).padStart(6, '0');
    document.body.style.background = '#' + lastSkyHex;
  }

  function loadScenery(i) {
    const lv = LEVELS[i];
    world.load(lv);
    setSky(lv.sky);
    respawn.set(lv.start[0], lv.start[1], lv.start[2]);
    player.reset(respawn); player.group.visible = true;
    camT.copy(respawn);
  }

  function startLevel(i) {
    mode = 'level'; li = i; loadScenery(i);
    time = 0; lives = MAX_LIVES; coins = 0; distance = 0; invuln = 0; deadT = 0;
    Object.assign(powers, { double: 0, speed: 0, jump: 0, shield: false });
    yaw = 0; pitch = 0.35; hudCache = '';
    state = 'playing'; show(null);
    Input.resetTouch();
    Sound.init(); Sound.startMusic(true);
    toast(`LEVEL ${i + 1}: ${LEVELS[i].name.toUpperCase()}`);
  }

  function startEndless() {
    mode = 'endless';
    world.loadEndless();
    setSky(ENDLESS_THEMES[0].sky);
    respawn.set(0, 0, 0);
    player.reset(respawn); player.group.visible = true;
    camT.copy(respawn);
    time = 0; lives = MAX_LIVES; coins = 0; distance = 0; nextMilestone = 100;
    runStartBest = save.endlessBest; passedRecord = false; invuln = 0; deadT = 0;
    Object.assign(powers, { double: 0, speed: 0, jump: 0, shield: false });
    yaw = 0; pitch = 0.35; hudCache = '';
    state = 'playing'; show(null);
    Input.resetTouch();
    Sound.init(); Sound.startMusic(true);
    toast('INFINITY MODE!');
  }

  function restartCurrent() {
    if (mode === 'endless') startEndless(); else startLevel(li);
  }

  function pause() {
    if (state !== 'playing') return;
    state = 'paused'; Input.resetTouch(); Sound.pauseMusic(); show('pause');
    if (document.pointerLockElement) document.exitPointerLock();
  }
  function resume() {
    if (state !== 'paused') return;
    state = 'playing'; show(null); Sound.init(); Sound.resumeMusic();
  }

  function hurt(src) {
    if (state !== 'playing' || deadT > 0 || invuln > 0) return;
    if (powers.shield && src !== 'fall') {
      powers.shield = false; invuln = 1.5; player.vel.y = 9;
      Sound.shield(); flash('#ce93d8'); toast('SHIELD BROKEN!');
      return;
    }
    lives--; deadT = 1.0;
    player.group.visible = false;
    world.burst(player.pos.clone().add(new THREE.Vector3(0, 0.8, 0)), 0xff7043, 22, 7);
    Sound.death(); flash('#ff1744');
  }

  function respawnPlayer() {
    if (lives <= 0) {
      state = 'gameover'; Sound.stopMusic(); Sound.gameover();
      const goStats = $('gameover-stats');
      if (mode === 'endless') {
        const newBest = distance > runStartBest && distance > 0;
        if (distance > save.endlessBest) save.endlessBest = distance;
        goStats.innerHTML =
          `DISTANCE: ${distance}m ${newBest ? '<span class="new">NEW BEST!</span>' : ''}<br>` +
          `BEST: ${save.endlessBest}m<br>` +
          `<span class="gold">COINS: ${coins}</span><br>TIME: ${fmt(time)}`;
        goStats.classList.remove('hidden');
      } else {
        goStats.classList.add('hidden');
      }
      show('gameover');
      if (document.pointerLockElement) document.exitPointerLock();
      return;
    }
    player.reset(respawn); player.group.visible = true;
    powers.double = powers.speed = powers.jump = 0;
    invuln = 1.2;
  }

  function finishLevel() {
    state = 'complete'; Sound.stopMusic(); Sound.win(); flash('#ffffff');
    player.vel.x = player.vel.z = 0; player.onGround = true;
    if (document.pointerLockElement) document.exitPointerLock();
    const prev = save.best(li), total = world.coins.length;
    const newBest = prev === null || time < prev;
    if (newBest) localStorage.setItem('tnf_best_' + li, time.toFixed(3));
    if (coins > save.coins(li)) localStorage.setItem('tnf_coins_' + li, coins);
    if (save.unlocked < li + 2) save.unlocked = Math.min(LEVELS.length, li + 2);
    const last = li === LEVELS.length - 1;
    $('btn-next').classList.toggle('hidden', last);
    $('complete-stats').innerHTML =
      `TIME: ${fmt(time)} ${newBest ? '<span class="new">NEW BEST!</span>' : ''}<br>` +
      `BEST: ${fmt(newBest ? time : prev)}<br>` +
      `<span class="gold">COINS: ${coins}/${total}</span><br>LIVES LEFT: ${lives}` +
      (last ? '<br><span class="new">YOU BEAT THE GAME!</span>' : '');
    setTimeout(() => { if (state === 'complete') show('complete'); }, 900);
  }

  function toMenu() {
    state = 'menu'; Sound.stopMusic();
    loadScenery(Math.min(save.unlocked, LEVELS.length) - 1);
    refreshMenu();
    show('menu');
  }

  // ---------- Buttons ----------
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    try { Sound.init(); } catch (err) { /* ignore */ }
    const act = b.dataset.act;
    if (act === 'sfx') {
      Sound.setSfx(!Sound.sfxOn);
      refreshToggles();
      if (Sound.sfxOn) try { Sound.click(); } catch (err) { /* ignore */ }
      return;
    }
    try { Sound.click(); } catch (err) { /* ignore */ }
    switch (act) {
      case 'play': startLevel(Math.min(save.unlocked, LEVELS.length) - 1); break;
      case 'endless': startEndless(); break;
      case 'levels': buildLevelGrid(); show('levels'); break;
      case 'menu': toMenu(); break;
      case 'pause': pause(); break;
      case 'resume': resume(); break;
      case 'restart': restartCurrent(); break;
      case 'next': startLevel(Math.min(li + 1, LEVELS.length - 1)); break;
      case 'music': Sound.setMusic(!Sound.musicOn); refreshToggles(); break;
    }
  });
  addEventListener('keydown', e => {
    if (e.code === 'Escape' || e.code === 'KeyP') { if (state === 'playing') pause(); else if (state === 'paused') resume(); }
    if (e.code === 'Enter' && state === 'complete' && li < LEVELS.length - 1) startLevel(li + 1);
    if (e.code === 'KeyR' && (state === 'gameover' || state === 'paused')) restartCurrent();
  });
  document.addEventListener('pointerlockchange', () => {
    if (document.pointerLockElement === canvas) hadLock = true;
    else if (hadLock && state === 'playing') { hadLock = false; pause(); }
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });

  // ---------- HUD ----------
  function updateHUD() {
    const chips = [];
    for (const k of ['double', 'speed', 'jump']) if (powers[k] > 0) chips.push([k, `${POWER_INFO[k].name} ${Math.ceil(powers[k])}s`]);
    if (powers.shield) chips.push(['shield', 'SHIELD']);
    const best = mode === 'endless' ? Math.max(distance, save.endlessBest) : 0;
    const key = `${mode}|${li}|${lives}|${coins}|${best}|${chips.map(c => c[1]).join()}`;
    $('hud-time').textContent = mode === 'endless' ? `${distance}m` : fmt(time);
    if (key === hudCache) return; hudCache = key;
    $('hud-level').textContent = mode === 'endless' ? `INF BEST ${best}m` : `LV ${li + 1}`;
    const pips = Array.from({ length: MAX_LIVES }, (_, idx) =>
      `<span class="pip${idx < lives ? ' on' : ''}"></span>`
    ).join('');
    $('hud-lives').innerHTML = `LIVES ${lives} <span class="life-bar">${pips}</span>`;
    $('hud-coins').textContent = mode === 'endless' ? `COINS ${coins}` : `COINS ${coins}/${world.coins.length}`;
    $('hud-powers').innerHTML = chips.map(([k, t]) =>
      `<div class="chip" style="background:#${POWER_INFO[k].color.toString(16).padStart(6, '0')}">${t}</div>`).join('');
  }

  // ---------- Main loop ----------
  let last = performance.now();
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    Input.update();

    if (state === 'playing') {
      const l = Input.consumeLook();
      yaw -= l.x; pitch = Math.max(-0.25, Math.min(1.2, pitch + l.y));

      world.step(dt, Sound);
      if (deadT > 0) {
        deadT -= dt; if (deadT <= 0) respawnPlayer();
      } else {
        time += dt;
        const evs = player.update(dt, world.solids, Input, yaw, powers);
        for (const e of evs) { if (e === 'jump') Sound.jump(); else if (e === 'djump') Sound.djump(); }
        for (const e of world.interact(player, Sound)) {
          if (e.type === 'hurt') hurt(e.src);
          else if (e.type === 'coin') { coins++; Sound.coin(); }
          else if (e.type === 'check') { respawn.copy(e.pos); Sound.check(); toast('CHECKPOINT!'); }
          else if (e.type === 'power') {
            const info = POWER_INFO[e.kind];
            if (e.kind === 'shield') powers.shield = true; else powers[e.kind] = info.time;
            Sound.power(); toast(info.name + '!'); flash('#' + info.color.toString(16).padStart(6, '0'));
          } else if (e.type === 'finish' && state === 'playing') finishLevel();
        }
        if (state === 'playing' && player.pos.y < world.minY - 18) hurt('fall');
        if (mode === 'endless' && state === 'playing') {
          world.updateEndless(player.pos, respawn);
          const curDist = Math.max(0, Math.floor(-player.pos.z));
          if (curDist > distance) {
            distance = curDist;
            if (distance > save.endlessBest) save.endlessBest = distance;
            if (!passedRecord && runStartBest > 0 && distance > runStartBest) {
              passedRecord = true;
              toast('NEW BEST DISTANCE!');
            }
            if (distance >= nextMilestone) {
              toast(`${nextMilestone}M REACHED!`);
              nextMilestone += 100;
            }
          }
          skyTarget.setHex(world.themeAt(player.pos.z).sky);
          scene.background.lerp(skyTarget, 1 - Math.exp(-1.5 * dt));
          scene.fog.color.copy(scene.background);
          const hex = scene.background.getHexString();
          if (hex !== lastSkyHex) { lastSkyHex = hex; document.body.style.background = '#' + hex; }
        }
        for (const k of ['double', 'speed', 'jump']) powers[k] = Math.max(0, powers[k] - dt);
        if (invuln > 0) invuln -= dt;
        player.group.visible = invuln > 0 ? Math.floor(invuln * 12) % 2 === 0 : true;
        player.shield.visible = powers.shield;
        if (player.shield.visible) player.shield.rotation.y += dt * 2;
      }
      updateHUD();
    } else if (state === 'menu' || state === 'levels') {
      world.step(dt, { fuse() {}, boom() {} });
      yaw += dt * 0.15; pitch = 0.45;
    } else if (state === 'complete') {
      world.step(dt, Sound);
      player.animate(dt); yaw += dt * 0.4;
    }
    Input.endFrame();

    if (toastT > 0) { toastT -= dt; if (toastT <= 0) $('toast').classList.remove('show'); }

    // Camera follow (orbit around the player)
    const target = player.pos.clone(); target.y += 1.2;
    if (state !== 'playing' || deadT <= 0) camT.lerp(target, 1 - Math.exp(-10 * dt));
    const camDist = state === 'menu' || state === 'levels' ? 10 : 7;
    camera.position.set(
      camT.x + Math.sin(yaw) * Math.cos(pitch) * camDist,
      camT.y + Math.sin(pitch) * camDist,
      camT.z + Math.cos(yaw) * Math.cos(pitch) * camDist);
    camera.lookAt(camT);

    // Shadow light follows the player
    sun.position.set(camT.x + 8, camT.y + 18, camT.z + 6);
    sun.target.position.copy(camT);

    renderer.render(scene, camera);
  }

  refreshToggles();
  toMenu();
  requestAnimationFrame(frame);
})();
