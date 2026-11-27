// There's No Floor - world: blocks, hazards, pickups, effects, clouds, infinity mode
const MATS = {};
function mat(c) { return MATS[c] || (MATS[c] = new THREE.MeshLambertMaterial({ color: c })); }
function mbox(w, h, d, c) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(c));
  m.castShadow = true; m.receiveShadow = true; return m;
}
function at(o, x, y, z) { o.position.set(x, y, z); return o; }
const POWER_INFO = {
  double: { color: 0x4fc3f7, label: '2X', name: 'DOUBLE JUMP', time: 15 },
  speed:  { color: 0xffee58, label: '>>', name: 'SPEED BOOST', time: 10 },
  jump:   { color: 0x66bb6a, label: '^',  name: 'SUPER JUMP',  time: 12 },
  shield: { color: 0xba68c8, label: 'O',  name: 'SHIELD',      time: 0 },
};
const ENDLESS_THEMES = [
  { sky: 0x8fd3ff, side: [0x8d6e63, 0x795548], top: [0x7bd85b, 0x66c94a] },
  { sky: 0xffc8e0, side: [0x9575cd, 0x7e57c2], top: [0xf48fb1, 0xf06292] },
  { sky: 0xffe0a8, side: [0x6d4c41, 0x5d4037], top: [0xffb74d, 0xffa726] },
  { sky: 0xb8f0d8, side: [0x546e7a, 0x455a64], top: [0xe0e0e0, 0xbdbdbd] },
  { sky: 0x9fa8ff, side: [0x37474f, 0x263238], top: [0x4dd0e1, 0x26c6da] },
];

class World {
  constructor(scene) { this.scene = scene; this.root = null; this.endless = false; }

  disposeGroup(group) {
    const shared = new Set(Object.values(MATS));
    group.traverse(o => {
      if (o.geometry) o.geometry.dispose();
      if (o.material && !shared.has(o.material)) {
        if (o.material.map) o.material.map.dispose();
        o.material.dispose();
      }
    });
  }

  clear() {
    if (!this.root) return;
    this.scene.remove(this.root);
    this.disposeGroup(this.root);
    this.root = null;
  }

  resetState() {
    this.clear();
    this.root = new THREE.Group();
    this.scene.add(this.root);
    Object.assign(this, {
      solids: [], movers: [], spikes: [], saws: [], bombs: [], bbombs: [],
      coins: [], checks: [], powers: [], effects: [], blasts: [],
      chunks: [], finish: null, t: 0, endless: false, blockIdx: 0,
    });
  }

  addItem(it, th, parent, bd, chunkId = null) {
    const V = a => new THREE.Vector3(a[0], a[1], a[2]);
    if (it.t === 'block' || it.t === 'move') {
      const ci = this.blockIdx++ % th.side.length;
      const g = this.makeBlock(it.w, it.d, it.c || th.side[ci], th.top[ci % th.top.length]);
      g.position.set(it.x, it.y, it.z); parent.add(g);
      const hw = it.w / 2, hd = it.d / 2;
      const s = {
        x0: it.x - hw, x1: it.x + hw, y0: it.y - 1, y1: it.y, z0: it.z - hd, z1: it.z + hd,
        dx: 0, dy: 0, dz: 0, moving: it.t === 'move', chunkId,
      };
      this.solids.push(s);
      if (it.t === 'move') {
        this.movers.push({
          s, g, hw, hd, a: V([it.x, it.y, it.z]), b: V(it.to),
          period: it.period, phase: it.phase, chunkId,
        });
        if (bd) {
          const e = V(it.to);
          bd.x0 = Math.min(bd.x0, e.x - hw); bd.x1 = Math.max(bd.x1, e.x + hw);
          bd.y0 = Math.min(bd.y0, e.y - 1);  bd.y1 = Math.max(bd.y1, e.y);
          bd.z0 = Math.min(bd.z0, e.z - hd); bd.z1 = Math.max(bd.z1, e.z + hd);
        }
      }
      if (bd) {
        bd.x0 = Math.min(bd.x0, s.x0); bd.x1 = Math.max(bd.x1, s.x1);
        bd.y0 = Math.min(bd.y0, s.y0); bd.y1 = Math.max(bd.y1, s.y1);
        bd.z0 = Math.min(bd.z0, s.z0); bd.z1 = Math.max(bd.z1, s.z1);
      }
    } else if (it.t === 'spike') {
      const g = new THREE.Group();
      g.add(at(mbox(0.96, 0.08, 0.96, 0x546e7a), 0, 0.04, 0));
      for (const [ox, oz] of [[-0.25, -0.25], [0.25, -0.25], [-0.25, 0.25], [0.25, 0.25]]) {
        const c = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.6, 4), mat(0xeceff1));
        c.position.set(ox, 0.38, oz); c.rotation.y = Math.PI / 4; c.castShadow = true; g.add(c);
      }
      g.position.set(it.x, it.y, it.z); parent.add(g);
      this.spikes.push({
        x0: it.x - 0.4, x1: it.x + 0.4, y0: it.y, y1: it.y + 0.5, z0: it.z - 0.4, z1: it.z + 0.4, chunkId,
      });
    } else if (it.t === 'saw') {
      const a = V(it.a), b = V(it.b);
      const d = b.clone().sub(a);
      const axis = it.axis || (Math.abs(d.x) > Math.abs(d.z) ? 'z' : 'x');
      const track = mbox(Math.abs(d.x) + 0.15, Math.abs(d.y) + 0.15, Math.abs(d.z) + 0.15, 0x37474f);
      track.position.copy(a).add(b).multiplyScalar(0.5); parent.add(track);
      const orient = new THREE.Group(), spin = new THREE.Group();
      if (axis === 'z') orient.rotation.x = Math.PI / 2; else orient.rotation.z = Math.PI / 2;
      const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.75, 0.12, 16), mat(0xb0bec5));
      disc.castShadow = true; spin.add(disc);
      spin.add(new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.2, 8), mat(0xd32f2f)));
      for (let i = 0; i < 10; i++) {
        const tooth = mbox(0.22, 0.1, 0.22, 0xeceff1), ang = i / 10 * Math.PI * 2;
        tooth.position.set(Math.cos(ang) * 0.8, 0, Math.sin(ang) * 0.8); tooth.rotation.y = -ang + Math.PI / 4;
        spin.add(tooth);
      }
      orient.add(spin); parent.add(orient);
      this.saws.push({ a, b, g: orient, spin, period: it.period, phase: it.phase || 0, pos: a.clone(), chunkId });
    } else if (it.t === 'bomb') {
      const g = this.makeBomb(0x212121);
      g.position.set(it.x, it.y + 0.4, it.z); parent.add(g);
      this.bombs.push({ g, pos: g.position.clone(), state: 'idle', timer: 0, beep: 0, chunkId });
    } else if (it.t === 'bbomb') {
      const g = this.makeBomb(0xc62828);
      parent.add(g);
      this.bbombs.push({
        g, a: V([it.x, it.y, it.z]), b: it.b ? V(it.b) : null, h: it.h, period: it.period,
        mp: it.mp, pos: new THREE.Vector3(it.x, it.y + 0.4, it.z), gone: 0, tOff: Math.random() * 10, chunkId,
      });
    } else if (it.t === 'coin') {
      const g = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.1, 12),
        new THREE.MeshLambertMaterial({ color: 0xffd54f, emissive: 0x6d4c00 }));
      g.rotation.x = Math.PI / 2; g.castShadow = true;
      const holder = new THREE.Group(); holder.add(g);
      holder.position.set(it.x, it.y + 0.8, it.z); parent.add(holder);
      this.coins.push({ g: holder, pos: holder.position.clone(), taken: false, chunkId });
    } else if (it.t === 'check') {
      const g = new THREE.Group();
      g.add(at(mbox(0.1, 2, 0.1, 0xffffff), 0, 1, 0));
      const flagMat = new THREE.MeshLambertMaterial({ color: 0x9e9e9e });
      const flag = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.45, 0.06), flagMat);
      flag.position.set(0.4, 1.7, 0); flag.castShadow = true; g.add(flag);
      g.position.set(it.x, it.y, it.z); parent.add(g);
      this.checks.push({ pos: new THREE.Vector3(it.x, it.y, it.z), flagMat, active: false, chunkId });
    } else if (it.t === 'power') {
      const info = POWER_INFO[it.kind];
      const g = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 0.6),
        new THREE.MeshLambertMaterial({ map: this.labelTexture(info.label, info.color), emissive: info.color, emissiveIntensity: 0.25 }));
      g.castShadow = true; g.position.set(it.x, it.y + 0.9, it.z); parent.add(g);
      this.powers.push({ g, kind: it.kind, pos: g.position.clone(), timer: 0, chunkId });
    } else if (it.t === 'finish') {
      const g = new THREE.Group();
      const pad = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.1, 1.8),
        new THREE.MeshLambertMaterial({ color: 0xffd54f, emissive: 0x806000 }));
      pad.position.y = 0.05; g.add(pad);
      g.add(at(mbox(0.14, 3.2, 0.14, 0xffffff), -0.8, 1.6, 0));
      for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) {
        const c = mbox(0.3, 0.3, 0.06, (i + j) % 2 ? 0x111111 : 0xffffff);
        c.position.set(-0.6 + i * 0.3, 2.9 - j * 0.3, 0); g.add(c);
      }
      g.position.set(it.x, it.y, it.z); parent.add(g);
      this.finish = { pos: new THREE.Vector3(it.x, it.y, it.z) };
    }
  }

  load(level) {
    this.resetState();
    const bd = { x0: 1e9, x1: -1e9, y0: 1e9, y1: -1e9, z0: 1e9, z1: -1e9 };
    for (const it of level.items) this.addItem(it, level.theme, this.root, bd);
    this.minY = bd.y0;
    this.bounds = bd;
    this.makeClouds(bd);
  }

  // ---------- Infinity Mode (procedural endless course) ----------
  themeAt(z) {
    const idx = Math.floor(Math.max(0, -z) / 70) % ENDLESS_THEMES.length;
    return ENDLESS_THEMES[idx];
  }

  loadEndless() {
    this.resetState();
    this.endless = true;
    this.nextChunkId = 1;
    this.cursor = { x: 0, y: 0, z: 0, w: 5, d: 5, lastCheckZ: 0, lastPowerZ: 0 };

    // Starting safe island
    this.addChunk([B(0, 0, 0, 5, 5)], ENDLESS_THEMES[0]);
    this.updateEndless(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, 0));
    this.makeClouds({ x0: -25, x1: 25, y0: -5, y1: 10, z0: -90, z1: 25 });
  }

  addChunk(items, th) {
    const id = this.nextChunkId++;
    const group = new THREE.Group();
    this.root.add(group);
    const bd = { x0: 1e9, x1: -1e9, y0: 1e9, y1: -1e9, z0: 1e9, z1: -1e9 };
    for (const it of items) this.addItem(it, th, group, bd, id);
    this.chunks.push({ id, group, minY: bd.y0, minZ: bd.z0, maxZ: bd.z1 });
    this.recomputeMinY();
  }

  recomputeMinY() {
    if (!this.chunks.length) { this.minY = -1; return; }
    let m = 1e9;
    for (const ch of this.chunks) if (ch.minY < m) m = ch.minY;
    this.minY = m;
  }

  generateNextChunk() {
    const c = this.cursor;
    const dist = Math.max(0, -c.z);
    const diff = Math.min(1, dist / 280); // ramps smoothly over 280m
    const th = this.themeAt(c.z);
    const rand = (a, b) => a + Math.random() * (b - a);
    const frontZ = c.z - c.d / 2;

    // Periodic safe checkpoint island every ~40m (with occasional power-up)
    if (dist - c.lastCheckZ >= 40) {
      const gap = 1.9;
      const w = 4, d = 4;
      const nx = Math.max(-6, Math.min(6, c.x + Math.max(-2, Math.min(2, -c.x * 0.5))));
      const ny = c.y;
      const nz = frontZ - gap - d / 2;
      const items = [B(nx, ny, nz, w, d), K(nx, ny, nz)];
      if (dist - c.lastPowerZ >= 55 && Math.random() < 0.75) {
        const kinds = ['double', 'speed', 'jump', 'shield'];
        const kind = kinds[Math.floor(Math.random() * kinds.length)];
        items.push(P(nx + (Math.random() < 0.5 ? -1.1 : 1.1), ny, nz - 0.8, kind));
        c.lastPowerZ = dist;
      }
      this.addChunk(items, th);
      Object.assign(c, { x: nx, y: ny, z: nz, w, d, lastCheckZ: -nz });
      return;
    }

    // Choose segment type based on distance reached
    const pool = ['step', 'step', 'step', 'spikes'];
    if (dist >= 20) pool.push('moveZ', 'moveX');
    if (dist >= 35) pool.push('saw', 'saw');
    if (dist >= 50) pool.push('bomb', 'bbomb');
    if (dist >= 90) pool.push('saw', 'spikes', 'bbomb');
    const kind = pool[Math.floor(Math.random() * pool.length)];

    // Height step kept within pleasant [-3, +12] bounds
    const pickDy = () => {
      let dy = 0;
      const r = Math.random();
      if (c.y <= -2) dy = r < 0.65 ? 1 : 0;
      else if (c.y >= 10) dy = r < 0.65 ? -1 : 0;
      else if (r < 0.34) dy = 1;
      else if (r < 0.62) dy = -1;
      return dy;
    };

    const items = [];

    if (kind === 'step') {
      const dy = pickDy();
      const w = Math.round(rand(2.4 - diff * 0.4, 3.6 - diff * 0.5) * 2) / 2;
      const d = Math.round(rand(2.4 - diff * 0.4, 3.6 - diff * 0.5) * 2) / 2;
      const maxGap = dy > 0 ? 2.0 : (dy < 0 ? 2.8 : 2.5);
      const minGap = dy > 0 ? 1.3 : 1.5;
      const gapZ = rand(minGap, minGap + (maxGap - minGap) * (0.45 + 0.55 * diff));

      // Keep lateral meander within [-9, 9] and total jump distance safe
      const drift = c.x > 6 ? -1 : (c.x < -6 ? 1 : (Math.random() < 0.5 ? -1 : 1));
      const maxLateral = Math.min(2.6, (c.w + w) / 2 + 0.6);
      const dx = (Math.random() < 0.65 ? drift * rand(0.8, maxLateral) : 0);
      const nx = Math.max(-9, Math.min(9, Math.round((c.x + dx) * 2) / 2));
      const edgeX = Math.max(0, Math.abs(nx - c.x) - (c.w + w) / 2);
      const safeGapZ = Math.max(1.2, Math.min(gapZ, Math.sqrt(Math.max(1.44, maxGap * maxGap - edgeX * edgeX))));

      const ny = c.y + dy;
      const nz = frontZ - safeGapZ - d / 2;
      items.push(B(nx, ny, nz, w, d));
      if (Math.random() < 0.6) items.push(C(nx, ny + (Math.random() < 0.25 ? 1.2 : 0), nz));
      if (dist - c.lastPowerZ >= 75 && Math.random() < 0.25) {
        const kinds = ['double', 'speed', 'jump', 'shield'];
        items.push(P(nx, ny, nz, kinds[Math.floor(Math.random() * kinds.length)]));
        c.lastPowerZ = dist;
      }
      this.addChunk(items, th);
      Object.assign(c, { x: nx, y: ny, z: nz, w, d });
    } else if (kind === 'spikes') {
      const dy = Math.random() < 0.3 && c.y < 10 ? 1 : 0;
      const w = 3, d = Math.random() < 0.5 ? 6 : 8;
      const gap = dy > 0 ? 1.8 : 2.1;
      const nx = c.x, ny = c.y + dy, nz = frontZ - gap - d / 2;
      items.push(B(nx, ny, nz, w, d));
      if (d === 6) {
        // Jumpable row of spikes right in the middle
        items.push(S(nx - 1, ny, nz), S(nx, ny, nz), S(nx + 1, ny, nz), C(nx, ny + 1.5, nz));
      } else {
        // Two staggered weave rows
        const flip = Math.random() < 0.5 ? 1 : -1;
        items.push(S(nx - flip, ny, nz + 1.5), S(nx, ny, nz + 1.5), C(nx + flip, ny, nz + 1.5));
        items.push(S(nx + flip, ny, nz - 1.5), S(nx, ny, nz - 1.5), C(nx - flip, ny, nz - 1.5));
      }
      this.addChunk(items, th);
      Object.assign(c, { x: nx, y: ny, z: nz, w, d });
    } else if (kind === 'moveZ') {
      const w = 3, d = 3, gap = 1.8;
      const span = rand(4.5, 6.5);
      const nx = c.x, ny = c.y;
      const zA = frontZ - gap - d / 2;
      const zB = zA - span;
      const period = rand(4.2, 5.4) - diff * 0.8;
      items.push(M(nx, ny, zA, w, d, [nx, ny, zB], period, Math.random() * Math.PI * 2));
      items.push(C(nx, ny + 1.2, (zA + zB) / 2));
      this.addChunk(items, th);
      Object.assign(c, { x: nx, y: ny, z: zB, w, d });
    } else if (kind === 'moveX') {
      const w = 3, d = 3, gap = 1.8;
      const dir = c.x > 2 ? -1 : (c.x < -2 ? 1 : (Math.random() < 0.5 ? -1 : 1));
      const span = rand(4, 5.5);
      const xA = c.x, xB = c.x + dir * span;
      const ny = c.y, nz = frontZ - gap - d / 2;
      const period = rand(4.0, 5.2) - diff * 0.7;
      items.push(M(xA, ny, nz, w, d, [xB, ny, nz], period, Math.random() * Math.PI * 2));
      items.push(C((xA + xB) / 2, ny + 1.2, nz));
      this.addChunk(items, th);
      Object.assign(c, { x: xB, y: ny, z: nz, w, d });
    } else if (kind === 'saw') {
      const w = 3, d = diff > 0.45 && Math.random() < 0.5 ? 10 : 7;
      const gap = 2.0;
      const nx = c.x, ny = c.y, nz = frontZ - gap - d / 2;
      const period = Math.max(1.8, 2.8 - diff * 0.7);
      items.push(B(nx, ny, nz, w, d));
      if (d === 7) {
        items.push(SAW([nx - 2.3, ny + 0.5, nz], [nx + 2.3, ny + 0.5, nz], period, Math.random() * 6));
        items.push(C(nx, ny, nz + 1.8), C(nx, ny, nz - 1.8));
      } else {
        items.push(SAW([nx - 2.3, ny + 0.5, nz + 2], [nx + 2.3, ny + 0.5, nz + 2], period, 0));
        items.push(SAW([nx - 2.3, ny + 0.5, nz - 2], [nx + 2.3, ny + 0.5, nz - 2], period, Math.PI));
        items.push(C(nx, ny, nz));
      }
      this.addChunk(items, th);
      Object.assign(c, { x: nx, y: ny, z: nz, w, d });
    } else if (kind === 'bomb') {
      const w = 4, d = 6, gap = 2.0;
      const nx = c.x, ny = c.y, nz = frontZ - gap - d / 2;
      const side = Math.random() < 0.5 ? -1 : 1;
      items.push(B(nx, ny, nz, w, d));
      items.push(BOMB(nx + side * 1.1, ny, nz + 0.6));
      if (diff > 0.4) items.push(BOMB(nx - side * 1.1, ny, nz - 1.4));
      items.push(C(nx, ny, nz));
      this.addChunk(items, th);
      Object.assign(c, { x: nx, y: ny, z: nz, w, d });
    } else if (kind === 'bbomb') {
      const w = 3, d = 6, gap = 2.0;
      const nx = c.x, ny = c.y, nz = frontZ - gap - d / 2;
      items.push(B(nx, ny, nz, w, d));
      if (diff > 0.5 && Math.random() < 0.5) {
        items.push(BB(nx - 1.1, ny, nz, 2.2, 0.9, [nx + 1.1, ny, nz], 3));
      } else {
        items.push(BB(nx, ny, nz, 2.8, Math.max(0.85, 1.25 - diff * 0.25)));
      }
      items.push(C(nx, ny, nz - 1.8));
      this.addChunk(items, th);
      Object.assign(c, { x: nx, y: ny, z: nz, w, d });
    }
  }

  pruneChunksBehind(pruneZ) {
    let removedAny = false;
    const removedIds = new Set();
    for (let i = this.chunks.length - 1; i >= 0; i--) {
      const ch = this.chunks[i];
      if (ch.minZ > pruneZ) {
        removedIds.add(ch.id);
        this.root.remove(ch.group);
        this.disposeGroup(ch.group);
        this.chunks.splice(i, 1);
        removedAny = true;
      }
    }
    if (!removedAny) return;
    const keep = arr => arr.filter(x => !removedIds.has(x.chunkId));
    this.solids = keep(this.solids);
    this.movers = keep(this.movers);
    this.spikes = keep(this.spikes);
    this.saws = keep(this.saws);
    this.bombs = keep(this.bombs);
    this.bbombs = keep(this.bbombs);
    this.coins = keep(this.coins);
    this.checks = keep(this.checks);
    this.powers = keep(this.powers);
    this.recomputeMinY();
  }

  updateEndless(playerPos, respawnPos) {
    if (!this.endless) return;
    // Generate ahead to at least 85 units in front of the player
    const horizonZ = playerPos.z - 85;
    let safety = 0;
    while (this.cursor.z > horizonZ && safety < 24) {
      this.generateNextChunk();
      safety++;
    }
    // Prune chunks well behind both the player and their active checkpoint
    const pruneZ = Math.max(playerPos.z, respawnPos.z) + 28;
    this.pruneChunksBehind(pruneZ);

    // Keep clouds centered around the player as they travel infinitely
    if (this.clouds) {
      this.cloudRange = { x0: playerPos.x - 55, x1: playerPos.x + 55 };
      for (const cl of this.clouds) {
        if (cl.position.z > playerPos.z + 32) {
          cl.position.z = playerPos.z - 85 - Math.random() * 25;
          cl.position.x = playerPos.x + (Math.random() - 0.5) * 100;
          const above = Math.random() < 0.25;
          cl.position.y = above ? playerPos.y + 14 + Math.random() * 14 : playerPos.y - 10 - Math.random() * 26;
        }
      }
    }
  }

  makeBlock(w, d, side, top) {
    const g = new THREE.Group();
    const s = mbox(w, 0.8, d, side); s.position.y = -0.6;
    const t = mbox(w + 0.02, 0.2, d + 0.02, top); t.position.y = -0.1;
    g.add(s, t); return g;
  }

  makeBomb(color) {
    const g = new THREE.Group();
    const m = new THREE.MeshLambertMaterial({ color, emissive: 0x000000 });
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.4, 12, 10), m); body.castShadow = true;
    const cap = mbox(0.16, 0.12, 0.16, 0x616161); cap.position.y = 0.42;
    const fuse = mbox(0.05, 0.2, 0.05, 0x8d6e63); fuse.position.y = 0.56;
    const spark = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1), new THREE.MeshBasicMaterial({ color: 0xffab00 }));
    spark.position.y = 0.7;
    g.add(body, cap, fuse, spark);
    g.userData = { mat: m, spark };
    return g;
  }

  labelTexture(text, color) {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const x = c.getContext('2d');
    x.fillStyle = '#' + color.toString(16).padStart(6, '0'); x.fillRect(0, 0, 64, 64);
    x.strokeStyle = 'rgba(0,0,0,0.35)'; x.lineWidth = 6; x.strokeRect(3, 3, 58, 58);
    x.fillStyle = '#fff'; x.font = 'bold 30px monospace'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText(text, 32, 34);
    const t = new THREE.CanvasTexture(c); t.magFilter = THREE.NearestFilter; return t;
  }

  makeClouds(bd) {
    this.clouds = [];
    const cm = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 });
    const pad = 40;
    this.cloudRange = { x0: bd.x0 - pad, x1: bd.x1 + pad };
    for (let i = 0; i < 45; i++) {
      const g = new THREE.Group();
      const n = 3 + Math.floor(Math.random() * 4);
      for (let j = 0; j < n; j++) {
        const b = new THREE.Mesh(new THREE.BoxGeometry(2 + Math.random() * 4, 1 + Math.random(), 2 + Math.random() * 3), cm);
        b.position.set((Math.random() - 0.5) * 6, Math.random() * 0.8, (Math.random() - 0.5) * 4);
        g.add(b);
      }
      const above = Math.random() < 0.25;
      g.position.set(
        bd.x0 - pad + Math.random() * (bd.x1 - bd.x0 + pad * 2),
        above ? bd.y1 + 15 + Math.random() * 15 : bd.y0 - 8 - Math.random() * 30,
        bd.z0 - pad + Math.random() * (bd.z1 - bd.z0 + pad * 2));
      this.root.add(g); this.clouds.push(g);
    }
  }

  // ---------- Effects ----------
  explosion(pos) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 10),
      new THREE.MeshBasicMaterial({ color: 0xff9800, transparent: true, opacity: 0.9 }));
    m.position.copy(pos); this.root.add(m);
    this.effects.push({ m, life: 0, max: 0.45, type: 'blast' });
    this.burst(pos, 0xff5722, 16, 9);
    this.burst(pos, 0x424242, 8, 6);
  }

  burst(pos, color, n = 12, power = 6) {
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.18, 0.18), new THREE.MeshBasicMaterial({ color }));
      m.position.copy(pos); this.root.add(m);
      const v = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.8 + 0.2, Math.random() - 0.5).normalize().multiplyScalar(power * (0.5 + Math.random() * 0.5));
      this.effects.push({ m, v, life: 0, max: 0.6 + Math.random() * 0.4, type: 'particle' });
    }
  }

  // ---------- Simulation ----------
  step(dt, sound) {
    this.t += dt; const t = this.t;
    this.blasts.length = 0;
    for (const mv of this.movers) {
      const k = (1 - Math.cos((t / mv.period) * Math.PI * 2 + mv.phase)) / 2;
      const old = mv.g.position.clone();
      mv.g.position.lerpVectors(mv.a, mv.b, k);
      const s = mv.s, p = mv.g.position;
      s.dx = p.x - old.x; s.dy = p.y - old.y; s.dz = p.z - old.z;
      s.x0 = p.x - mv.hw; s.x1 = p.x + mv.hw; s.y0 = p.y - 1; s.y1 = p.y; s.z0 = p.z - mv.hd; s.z1 = p.z + mv.hd;
    }
    for (const sw of this.saws) {
      const k = (1 - Math.cos((t / sw.period) * Math.PI * 2 + sw.phase)) / 2;
      sw.pos.lerpVectors(sw.a, sw.b, k); sw.g.position.copy(sw.pos);
      sw.spin.rotation.y += dt * 14;
    }
    for (const bo of this.bombs) {
      if (bo.state === 'lit') {
        bo.timer -= dt; bo.beep -= dt;
        const on = Math.floor(bo.timer * 12) % 2 === 0;
        bo.g.userData.mat.emissive.setHex(on ? 0xff1744 : 0x000000);
        bo.g.scale.setScalar(1 + (1 - bo.timer) * 0.3);
        if (bo.beep <= 0) { sound.fuse(); bo.beep = 0.12; }
        if (bo.timer <= 0) {
          bo.state = 'gone'; bo.timer = 3; bo.g.visible = false;
          this.explosion(bo.pos); this.blasts.push(bo.pos); sound.boom();
        }
      } else if (bo.state === 'gone') {
        bo.timer -= dt;
        if (bo.timer <= 0) {
          bo.state = 'idle'; bo.g.visible = true; bo.g.scale.setScalar(1);
          bo.g.userData.mat.emissive.setHex(0x000000);
        }
      }
      bo.g.userData.spark.visible = Math.random() < 0.7;
    }
    for (const bb of this.bbombs) {
      if (bb.gone > 0) { bb.gone -= dt; bb.g.visible = bb.gone <= 0; if (bb.gone > 0) continue; }
      const tt = t + bb.tOff;
      const ph = (tt / bb.period) % 1;
      const y = bb.a.y + 0.4 + bb.h * Math.sin(ph * Math.PI);
      let x = bb.a.x, z = bb.a.z;
      if (bb.b) {
        const k = (1 - Math.cos((tt / bb.mp) * Math.PI * 2)) / 2;
        x = bb.a.x + (bb.b.x - bb.a.x) * k; z = bb.a.z + (bb.b.z - bb.a.z) * k;
      }
      bb.pos.set(x, y, z); bb.g.position.copy(bb.pos);
      const squash = ph < 0.08 || ph > 0.92;
      bb.g.scale.set(squash ? 1.2 : 1, squash ? 0.75 : 1, squash ? 1.2 : 1);
      bb.g.userData.spark.visible = Math.random() < 0.7;
    }
    for (const c of this.coins) if (!c.taken) { c.g.rotation.y += dt * 3; c.g.position.y = c.pos.y + Math.sin(t * 3 + c.pos.x) * 0.1; }
    for (const p of this.powers) {
      if (p.timer > 0) { p.timer -= dt; if (p.timer <= 0) p.g.visible = true; continue; }
      p.g.rotation.y += dt * 2; p.g.rotation.x = Math.sin(t) * 0.3; p.g.position.y = p.pos.y + Math.sin(t * 2.5) * 0.15;
    }
    for (let i = this.effects.length - 1; i >= 0; i--) {
      const e = this.effects[i]; e.life += dt; const k = e.life / e.max;
      if (e.type === 'blast') { e.m.scale.setScalar(0.4 + k * 2.8); e.m.material.opacity = 0.9 * (1 - k); }
      else { e.v.y -= 20 * dt; e.m.position.addScaledVector(e.v, dt); e.m.scale.setScalar(Math.max(0.01, 1 - k)); }
      if (k >= 1) { this.root.remove(e.m); e.m.geometry.dispose(); e.m.material.dispose(); this.effects.splice(i, 1); }
    }
    const cr = this.cloudRange;
    for (const c of this.clouds) { c.position.x += dt * 0.6; if (c.position.x > cr.x1) c.position.x = cr.x0; }
  }

  // Check player against hazards and pickups. Returns events.
  interact(player, sound) {
    const ev = [];
    const p = player.pos, cy = p.y + 0.8;
    const pb = { x0: p.x - 0.3, x1: p.x + 0.3, y0: p.y, y1: p.y + 1.6, z0: p.z - 0.3, z1: p.z + 0.3 };
    const center = new THREE.Vector3(p.x, cy, p.z);
    const aabb = (a, b) => a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0 && a.z0 < b.z1 && a.z1 > b.z0;
    const sphereBox = (c, r) => {
      const dx = c.x - Math.max(pb.x0, Math.min(c.x, pb.x1));
      const dy = c.y - Math.max(pb.y0, Math.min(c.y, pb.y1));
      const dz = c.z - Math.max(pb.z0, Math.min(c.z, pb.z1));
      return dx * dx + dy * dy + dz * dz < r * r;
    };
    for (const s of this.spikes) if (aabb(pb, s)) { ev.push({ type: 'hurt', src: 'spike' }); break; }
    for (const sw of this.saws) if (sphereBox(sw.pos, 0.7)) { ev.push({ type: 'hurt', src: 'saw' }); break; }
    for (const bb of this.bbombs) {
      if (bb.gone <= 0 && sphereBox(bb.pos, 0.42)) {
        bb.gone = 2; bb.g.visible = false; this.explosion(bb.pos); sound.boom();
        ev.push({ type: 'hurt', src: 'bomb' });
      }
    }
    for (const bo of this.bombs) {
      if (bo.state === 'idle' && bo.pos.distanceTo(center) < 2.2) { bo.state = 'lit'; bo.timer = 1; bo.beep = 0; }
    }
    for (const bl of this.blasts) if (bl.distanceTo(center) < 2.6) ev.push({ type: 'hurt', src: 'bomb' });
    for (const c of this.coins) {
      if (!c.taken && c.g.position.distanceTo(center) < 1.0) {
        c.taken = true; c.g.visible = false; this.burst(c.g.position, 0xffd54f, 8, 4);
        ev.push({ type: 'coin' });
      }
    }
    for (const ck of this.checks) {
      if (!ck.active && Math.abs(ck.pos.x - p.x) < 1.6 && Math.abs(ck.pos.z - p.z) < 1.6 && p.y > ck.pos.y - 0.5 && p.y < ck.pos.y + 2.2) {
        ck.active = true; ck.flagMat.color.setHex(0x66bb6a);
        ev.push({ type: 'check', pos: ck.pos.clone() });
      }
    }
    for (const pw of this.powers) {
      if (pw.timer <= 0 && pw.g.position.distanceTo(center) < 1.0) {
        pw.timer = 10; pw.g.visible = false; this.burst(pw.g.position, POWER_INFO[pw.kind].color, 10, 5);
        ev.push({ type: 'power', kind: pw.kind });
      }
    }
    const f = this.finish;
    if (f && Math.abs(f.pos.x - p.x) < 1.2 && Math.abs(f.pos.z - p.z) < 1.2 && p.y > f.pos.y - 0.5 && p.y < f.pos.y + 3) {
      ev.push({ type: 'finish' });
    }
    return ev;
  }
}
