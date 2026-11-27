# There's No Floor

A 3D block-style parkour game for the browser (phone and PC). Jump across floating blocks and dodge spikes, bombs, moving saws and bouncing bombs. There is no floor, so if you fall you lose a life.

## Run

ES modules aren't used, but browsers still block some features on `file://`, so serve the folder:

```bash
python -m http.server 8000
```

Then open <http://localhost:8000>.

Three.js (r149) loads from `js/vendor/three.min.js` if that file exists, otherwise from the jsDelivr CDN. To play offline, download it once:

```bash
mkdir -p js/vendor && curl -L -o js/vendor/three.min.js https://cdn.jsdelivr.net/npm/three@0.149.0/build/three.min.js
```

## Controls

| PC | Touch |
|----|-------|
| WASD / arrows: move | Left half of the screen: virtual joystick |
| Space: jump (hold for a higher jump) | JUMP button |
| Mouse (click to lock) or Q/E: camera | Drag on the right half: camera |
| Esc / P: pause, R: restart (paused or game over) | II button: pause |

## Features

- 5 handmade levels: First Steps, Spike Garden, Saw Mill, Boom Town, The Gauntlet. Finishing a level unlocks the next one.
- Infinity Mode: an endless procedurally generated parkour course with escalating hazards, changing biomes, checkpoints, and distance tracking (with your best distance saved in `localStorage`).
- Hazards: spikes, proximity bombs (1 s fuse after you get close), moving saws, bouncing bombs (some also slide side to side).
- Moving platforms, checkpoints, coins, 10 lives per attempt, a timer, and best time and coin records saved in `localStorage`.
- Power-ups: Double Jump (15 s), Speed Boost (10 s), Super Jump (12 s), Shield (blocks one hit, but not falling).
- Procedural chiptune music and sound effects (Web Audio), with toggles in the menu and pause screen.

## Files

| File | Purpose |
|------|---------|
| `index.html` | Page, HUD, menus, touch controls |
| `css/style.css` | Pixel-style UI |
| `js/audio.js` | `Sound`: sound effects and music sequencer |
| `js/input.js` | `Input`: keyboard, mouse, touch joystick and camera |
| `js/levels.js` | `LEVELS` data and helper builders (`B`, `M`, `S`, `SAW`, `BOMB`, `BB`, ...) |
| `js/player.js` | `Player`: blocky model and physics (coyote time, jump buffer, platform riding) |
| `js/world.js` | `World`: builds levels, simulates hazards, pickups, effects, clouds |
| `js/main.js` | Game loop, state machine, camera, HUD, saving |

## Adding a level

Add an entry to `LEVELS` in `js/levels.js`. Forward is `-Z`. For blocks, `y` is the top surface. The player jumps about 2 blocks high and 4 blocks far, so keep gaps at 3 or less (2.5 when jumping up a block).
