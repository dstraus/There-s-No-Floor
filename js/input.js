// There's No Floor - input (keyboard + mouse, touch joystick or virtual arrow keys + camera drag + jump button)
const Input = (() => {
  const keys = {};
  const st = { move: { x: 0, y: 0 }, jumpHeld: false, jumpPressed: false, isTouch: false };
  const look = { x: 0, y: 0 };
  const MOUSE_SENS = 0.0025, TOUCH_SENS = 0.007, DRAG_SENS = 0.006;
  const JOY_RADIUS = 50;

  let touchMode = 'joystick';
  try {
    if (localStorage.getItem('tnf_touch_mode') === 'arrows') touchMode = 'arrows';
  } catch (e) { /* ignore */ }

  let joy = { id: null, ox: 0, oy: 0, x: 0, y: 0 };
  let lookTouch = { id: null, x: 0, y: 0 };
  let mouseDrag = null;
  let dpadMouseDir = null;
  const dpadTouches = new Map();
  const dpadState = { up: false, down: false, left: false, right: false };
  let canvas, opts, joyBase, joyKnob, joyHint, dpadEl, dpadBtns = {};

  function pressJump() { if (!st.jumpHeld) st.jumpPressed = true; st.jumpHeld = true; }
  function releaseJump() { st.jumpHeld = false; }

  function applyTouchModeUI() {
    const arrows = touchMode === 'arrows';
    if (dpadEl) dpadEl.classList.toggle('hidden', !arrows);
    if (joyHint) joyHint.classList.toggle('hidden', arrows);
    if (arrows && joyBase) {
      joy = { id: null, ox: 0, oy: 0, x: 0, y: 0 };
      joyBase.classList.remove('active');
    }
    if (!arrows) clearDpad();
  }

  function setTouchMode(mode) {
    touchMode = mode === 'arrows' ? 'arrows' : 'joystick';
    try { localStorage.setItem('tnf_touch_mode', touchMode); } catch (e) { /* ignore */ }
    applyTouchModeUI();
  }

  const DIR_MAP = {
    up: ['up'], down: ['down'], left: ['left'], right: ['right'],
    'up-left': ['up', 'left'], 'up-right': ['up', 'right'],
    'down-left': ['down', 'left'], 'down-right': ['down', 'right'],
  };

  function keyAtPoint(x, y) {
    const el = document.elementFromPoint(x, y);
    const btn = el && el.closest ? el.closest('.dpad-btn') : null;
    if (btn && btn.dataset.dir && DIR_MAP[btn.dataset.dir]) return btn.dataset.dir;
    if (!dpadEl) return null;
    const r = dpadEl.getBoundingClientRect();
    if (x < r.left - 12 || x > r.right + 12 || y < r.top - 12 || y > r.bottom + 12) return null;
    const nx = (x - (r.left + r.width / 2)) / (r.width / 2);
    const ny = (y - (r.top + r.height / 2)) / (r.height / 2);
    if (Math.hypot(nx, ny) < 0.22) return null;
    const deg = Math.atan2(ny, nx) * 180 / Math.PI; // -180..180 (0=right, -90=up, 90=down)
    if (deg >= -22.5 && deg < 22.5) return 'right';
    if (deg >= 22.5 && deg < 67.5) return 'down-right';
    if (deg >= 67.5 && deg < 112.5) return 'down';
    if (deg >= 112.5 && deg < 157.5) return 'down-left';
    if (deg >= 157.5 || deg < -157.5) return 'left';
    if (deg >= -157.5 && deg < -112.5) return 'up-left';
    if (deg >= -112.5 && deg < -67.5) return 'up';
    return 'up-right';
  }

  function syncDpad() {
    dpadState.up = dpadState.down = dpadState.left = dpadState.right = false;
    const activeKeys = new Set();
    for (const k of dpadTouches.values()) {
      if (k && DIR_MAP[k]) {
        activeKeys.add(k);
        for (const d of DIR_MAP[k]) dpadState[d] = true;
      }
    }
    if (dpadMouseDir && DIR_MAP[dpadMouseDir]) {
      activeKeys.add(dpadMouseDir);
      for (const d of DIR_MAP[dpadMouseDir]) dpadState[d] = true;
    }
    for (const k in dpadBtns) {
      dpadBtns[k].classList.toggle('active', activeKeys.has(k));
    }
  }

  function clearDpad() {
    dpadTouches.clear();
    dpadMouseDir = null;
    syncDpad();
  }

  function init(cv, options) {
    canvas = cv; opts = options;
    st.isTouch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
    joyBase = document.getElementById('joy-base');
    joyKnob = document.getElementById('joy-knob');
    joyHint = document.getElementById('joy-hint');
    dpadEl = document.getElementById('dpad');
    dpadBtns = {};
    if (dpadEl) {
      dpadEl.querySelectorAll('.dpad-btn').forEach(b => { dpadBtns[b.dataset.dir] = b; });
    }
    applyTouchModeUI();

    addEventListener('keydown', e => {
      keys[e.code] = true;
      if (e.code === 'Space') { pressJump(); e.preventDefault(); }
    });
    addEventListener('keyup', e => {
      keys[e.code] = false;
      if (e.code === 'Space') releaseJump();
    });
    addEventListener('blur', () => { for (const k in keys) keys[k] = false; clearDpad(); releaseJump(); });

    // Mouse: pointer lock when available, drag-to-look as fallback
    canvas.addEventListener('mousedown', e => {
      if (!opts.canLook()) return;
      if (canvas.requestPointerLock && !document.pointerLockElement) {
        try { canvas.requestPointerLock(); } catch (err) { /* ignore */ }
      }
      mouseDrag = { x: e.clientX, y: e.clientY };
    });
    addEventListener('mouseup', () => { mouseDrag = null; dpadMouseDir = null; syncDpad(); });
    addEventListener('mousemove', e => {
      if (document.pointerLockElement === canvas) {
        look.x += e.movementX * MOUSE_SENS; look.y += e.movementY * MOUSE_SENS;
      } else if (mouseDrag) {
        look.x += (e.clientX - mouseDrag.x) * DRAG_SENS; look.y += (e.clientY - mouseDrag.y) * DRAG_SENS;
        mouseDrag = { x: e.clientX, y: e.clientY };
      }
    });

    // Touch: joystick mode -> left half = joystick, right half = camera; arrows mode -> canvas drags = camera
    const opt = { passive: false };
    canvas.addEventListener('touchstart', e => {
      e.preventDefault();
      if (!opts.canLook()) return;
      for (const t of e.changedTouches) {
        if (touchMode === 'joystick' && t.clientX < innerWidth / 2 && joy.id === null) {
          joy = { id: t.identifier, ox: t.clientX, oy: t.clientY, x: 0, y: 0 };
          joyBase.style.left = t.clientX + 'px'; joyBase.style.top = t.clientY + 'px';
          joyBase.classList.add('active');
          joyKnob.style.transform = 'translate(-50%,-50%)';
        } else if (lookTouch.id === null) {
          lookTouch = { id: t.identifier, x: t.clientX, y: t.clientY };
        }
      }
    }, opt);
    canvas.addEventListener('touchmove', e => {
      e.preventDefault();
      for (const t of e.changedTouches) {
        if (t.identifier === joy.id) {
          let dx = t.clientX - joy.ox, dy = t.clientY - joy.oy;
          const len = Math.hypot(dx, dy);
          if (len > JOY_RADIUS) { dx *= JOY_RADIUS / len; dy *= JOY_RADIUS / len; }
          joy.x = dx / JOY_RADIUS; joy.y = dy / JOY_RADIUS;
          joyKnob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
        } else if (t.identifier === lookTouch.id) {
          look.x += (t.clientX - lookTouch.x) * TOUCH_SENS;
          look.y += (t.clientY - lookTouch.y) * TOUCH_SENS;
          lookTouch.x = t.clientX; lookTouch.y = t.clientY;
        }
      }
    }, opt);
    const end = e => {
      for (const t of e.changedTouches) {
        if (t.identifier === joy.id) { joy = { id: null, ox: 0, oy: 0, x: 0, y: 0 }; joyBase.classList.remove('active'); }
        if (t.identifier === lookTouch.id) lookTouch.id = null;
      }
    };
    canvas.addEventListener('touchend', end);
    canvas.addEventListener('touchcancel', end);

    // Virtual D-pad (arrow keys) touch + mouse support with thumb-slide & diagonals
    if (dpadEl) {
      const updateDpadTouch = e => {
        e.preventDefault();
        e.stopPropagation();
        if (!opts.canLook()) return;
        for (const t of e.changedTouches) {
          dpadTouches.set(t.identifier, keyAtPoint(t.clientX, t.clientY));
        }
        syncDpad();
      };
      const endDpadTouch = e => {
        e.preventDefault();
        e.stopPropagation();
        for (const t of e.changedTouches) dpadTouches.delete(t.identifier);
        syncDpad();
      };
      dpadEl.addEventListener('touchstart', updateDpadTouch, opt);
      dpadEl.addEventListener('touchmove', updateDpadTouch, opt);
      dpadEl.addEventListener('touchend', endDpadTouch, opt);
      dpadEl.addEventListener('touchcancel', endDpadTouch, opt);
      dpadEl.addEventListener('mousedown', e => {
        const b = e.target.closest('.dpad-btn');
        if (!b || !opts.canLook()) return;
        e.preventDefault();
        dpadMouseDir = b.dataset.dir;
        syncDpad();
      });
    }

    const jb = document.getElementById('btn-jump');
    jb.addEventListener('touchstart', e => { e.preventDefault(); pressJump(); }, opt);
    jb.addEventListener('touchend', e => { e.preventDefault(); releaseJump(); }, opt);
    jb.addEventListener('touchcancel', e => { e.preventDefault(); releaseJump(); }, opt);
    jb.addEventListener('mousedown', pressJump);
    jb.addEventListener('mouseup', releaseJump);
  }

  // Call once per frame before reading move
  function update() {
    if (joy.id !== null) {
      st.move.x = joy.x; st.move.y = -joy.y;
    } else {
      const k = c => (keys[c] ? 1 : 0);
      st.move.x = ((k('KeyD') || k('ArrowRight') || dpadState.right) ? 1 : 0) - ((k('KeyA') || k('ArrowLeft') || dpadState.left) ? 1 : 0);
      st.move.y = ((k('KeyW') || k('ArrowUp') || dpadState.up) ? 1 : 0) - ((k('KeyS') || k('ArrowDown') || dpadState.down) ? 1 : 0);
    }
    // Q/E rotate camera with the keyboard
    look.x += ((keys.KeyE ? 1 : 0) - (keys.KeyQ ? 1 : 0)) * 0.04;
  }

  function consumeLook() { const l = { x: look.x, y: look.y }; look.x = 0; look.y = 0; return l; }
  function endFrame() { st.jumpPressed = false; }
  function resetTouch() {
    joy = { id: null, ox: 0, oy: 0, x: 0, y: 0 }; lookTouch.id = null;
    if (joyBase) joyBase.classList.remove('active');
    clearDpad();
    releaseJump();
  }

  const api = Object.assign(st, { init, update, consumeLook, endFrame, resetTouch, setTouchMode, keys });
  Object.defineProperty(api, 'touchMode', { get() { return touchMode; }, enumerable: true });
  return api;
})();
