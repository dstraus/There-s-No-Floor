// There's No Floor - world: blocks, hazards, pickups, effects, clouds
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

class World {
  constructor(scene) { this.scene = scene; this.root = null; }

  clear() {
    if (!this.root) return;
    this.scene.remove(this.root);
    this.root.traverse(o => { if (o.geometry) o.geometry.dispose(); });
    this.root = null;
  }

  load(level) {
    this.clear();
    this.root = new THREE.Group(); this.scene.add(this.root);
    Object.assign(this, { solids: [], movers: [], spikes: [], saws: [], bombs: [], bbombs: [],
      coins: [], checks: [], powers: [], effects: [], blasts: [], finish: null, t: 0 });
    const th = level.theme; let bi = 0;
    const bd = { x0: 1e9, x1: -1e9, y0: 1e9, y1: -1e9, z0: 1e9, z1: -1e9 };
    const V = a => new THREE.Vector3(a[0], a[1], a[2]);

    for (const it of level.items) {
      if (it.t === 'block' || it.t === 'move') {
        const ci = bi++ % th.side.length;
        const g = this.makeBlock(it.w, it.d, it.c || th.side[ci], th.top[ci % th.top.length]);
        g.position.set(it.x, it.y, it.z); this.root.add(g);
        const hw = it.w / 2, hd = it.d / 2;
        const s = { x0: it.x - hw, x1: it.x + hw, y0: it.y - 1, y1: it.y, z0: it.z - hd, z1: it.z + hd,
                    dx: 0, dy: 0, dz: 0, moving: it.t === 'move' };
        this.solids.push(s);
        if (it.t === 'move') {
          this.movers.push({ s, g, hw, hd, a: V([it.x, it.y, it.z]), b: V(it.to), period: it.period, phase: it.phase });
          const e = V(it.to);
          bd.x0 = Math.min(bd.x0, e.x); bd.x1 = Math.max(bd.x1, e.x); bd.z0 = Math.min(bd.z0, e.z); bd.z1 = Math.max(bd.z1, e.z);
        }
        bd.x0 = Math.min(bd.x0, s.x0); bd.x1 = Math.max(bd.x1, s.x1); bd.y0 = Math.min(bd.y0, s.y0);
        bd.y1 = Math.max(bd.y1, s.y1); bd.z0 = Math.min(bd.z0, s.z0); bd.z1 = Math.max(bd.z1, s.z1);
      } else if (it.t === 'spike') {
        const g = new THREE.Group();
        g.add(at(mbox(0.96, 0.08, 0.96, 0x546e7a), 0, 0.04, 0));
        for (const [ox, oz] of [[-0.25, -0.25], [0.25, -0.25], [-0.25, 0.25], [0.25, 0.25]]) {
          const c = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.6, 4), mat(0xeceff1));
          c.position.set(ox, 0.38, oz); c.rotation.y = Math.PI / 4; c.castShadow = true; g.add(c);
        }
        g.position.set(it.x, it.y, it.z); this.root.add(g);
        this.spikes.push({ x0: it.x - 0.4, x1: it.x + 0.4, y0: it.y, y1: it.y + 0.5, z0: it.z - 0.4, z1: it.z + 0.4 });
      } else if (it.t === 'saw') {
        const a = V(it.a), b = V(it.b);
        const d = b.clone().sub(a);
        const axis = it.axis || (Math.abs(d.x) > Math.abs(d.z) ? 'z' : 'x');
        const track = mbox(Math.abs(d.x) + 0.15, Math.abs(d.y) + 0.15, Math.abs(d.z) + 0.15, 0x37474f);
        track.position.copy(a).add(b).multiplyScalar(0.5); this.root.add(track);
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
        orient.add(spin); this.root.add(orient);
        this.saws.push({ a, b, g: orient, spin, period: it.period, phase: it.phase, pos: a.clone() });
      } else if (it.t === 'bomb') {
        const g = this.makeBomb(0x212121);
        g.position.set(it.x, it.y + 0.4, it.z); this.root.add(g);
        this.bombs.push({ g, pos: g.position.clone(), state: 'idle', timer: 0, beep: 0 });
      } else if (it.t === 'bbomb') {
        const g = this.makeBomb(0xc62828);
        this.root.add(g);
        this.bbombs.push({ g, a: V([it.x, it.y, it.z]), b: it.b ? V(it.b) : null, h: it.h, period: it.period,
          mp: it.mp, pos: new THREE.Vector3(it.x, it.y + 0.4, it.z), gone: 0, tOff: Math.random() * 10 });
      } else if (it.t === 'coin') {
        const g = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.1, 12),
          new THREE.MeshLambertMaterial({ color: 0xffd54f, emissive: 0x6d4c00 }));
        g.rotation.x = Math.PI / 2; g.castShadow = true;
        const holder = new THREE.Group(); holder.add(g);
        holder.position.set(it.x, it.y + 0.8, it.z); this.root.add(holder);
        this.coins.push({ g: holder, pos: holder.position.clone(), taken: false });
      } else if (it.t === 'check') {
        const g = new THREE.Group();
        g.add(at(mbox(0.1, 2, 0.1, 0xffffff), 0, 1, 0));
        const flagMat = new THREE.MeshLambertMaterial({ color: 0x9e9e9e });
        const flag = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.45, 0.06), flagMat);
        flag.position.set(0.4, 1.7, 0); flag.castShadow = true; g.add(flag);
        g.position.set(it.x, it.y, it.z); this.root.add(g);
        this.checks.push({ pos: new THREE.Vector3(it.x, it.y, it.z), flagMat, active: false });
      } else if (it.t === 'power') {
        const info = POWER_INFO[it.kind];
        const g = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 0.6),
          new THREE.MeshLambertMaterial({ map: this.labelTexture(info.label, info.color), emissive: info.color, emissiveIntensity: 0.25 }));
        g.castShadow = true; g.position.set(it.x, it.y + 0.9, it.z); this.root.add(g);
        this.powers.push({ g, kind: it.kind, pos: g.position.clone(), timer: 0 });
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
        g.position.set(it.x, it.y, it.z); this.root.add(g);
        this.finish = { pos: new THREE.Vector3(it.x, it.y, it.z) };
      }
    }
    this.minY = bd.y0;
    this.bounds = bd;
    this.makeClouds(bd);
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
      if (!ck.active && Math.abs(ck.pos.x - p.x) < 1.3 && Math.abs(ck.pos.z - p.z) < 1.3 && p.y > ck.pos.y - 0.5 && p.y < ck.pos.y + 2) {
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
