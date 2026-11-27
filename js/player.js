// There's No Floor - blocky player character + platformer physics
class Player {
  constructor(scene) {
    this.HW = 0.3;    // half width of collision box
    this.H = 1.6;     // height of collision box (pos is at the feet)
    this.G = 32;      // gravity
    this.JUMP = 11.5; // jump velocity
    this.SPEED = 6.5; // run speed

    this.group = new THREE.Group();
    const box = (w, h, d, c, x, y, z) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ color: c }));
      m.position.set(x, y, z); m.castShadow = true; return m;
    };
    const SHIRT = 0xff7043, PANTS = 0x3949ab, SKIN = 0xffcc80;
    this.legL = new THREE.Group(); this.legL.position.set(-0.13, 0.7, 0);
    this.legL.add(box(0.22, 0.7, 0.26, PANTS, 0, -0.35, 0));
    this.legR = new THREE.Group(); this.legR.position.set(0.13, 0.7, 0);
    this.legR.add(box(0.22, 0.7, 0.26, PANTS, 0, -0.35, 0));
    this.armL = new THREE.Group(); this.armL.position.set(-0.34, 1.25, 0);
    this.armL.add(box(0.16, 0.55, 0.2, SHIRT, 0, -0.25, 0), box(0.16, 0.1, 0.2, SKIN, 0, -0.55, 0));
    this.armR = new THREE.Group(); this.armR.position.set(0.34, 1.25, 0);
    this.armR.add(box(0.16, 0.55, 0.2, SHIRT, 0, -0.25, 0), box(0.16, 0.1, 0.2, SKIN, 0, -0.55, 0));
    this.group.add(
      this.legL, this.legR, this.armL, this.armR,
      box(0.52, 0.6, 0.3, SHIRT, 0, 1.0, 0),
      box(0.44, 0.44, 0.44, SKIN, 0, 1.52, 0),
      box(0.46, 0.12, 0.46, 0x5d4037, 0, 1.76, 0),
      box(0.46, 0.2, 0.1, 0x5d4037, 0, 1.64, -0.19),
      box(0.08, 0.1, 0.02, 0x222222, -0.1, 1.55, 0.225),
      box(0.08, 0.1, 0.02, 0x222222, 0.1, 1.55, 0.225),
    );
    this.shield = new THREE.Mesh(
      new THREE.SphereGeometry(1.05, 16, 12),
      new THREE.MeshBasicMaterial({ color: 0xce93d8, transparent: true, opacity: 0.28, depthWrite: false })
    );
    this.shield.position.y = 0.8; this.shield.visible = false;
    this.group.add(this.shield);
    scene.add(this.group);

    // Crisp drop shadow projected straight down onto the platform below
    this.dropShadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.42, 20),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.42, depthWrite: false })
    );
    this.dropShadow.rotation.x = -Math.PI / 2;
    this.dropShadow.visible = false;
    scene.add(this.dropShadow);

    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.facing = 0; this.walk = 0;
    this.reset(new THREE.Vector3());
  }

  reset(p) {
    this.pos.copy(p); this.vel.set(0, 0, 0);
    this.ground = null; this.onGround = false;
    this.coyote = 0; this.jumpBuffer = 0; this.airJumps = 0; this.jumping = false;
    this.group.position.copy(p);
  }

  overlaps(s) {
    const p = this.pos, hw = this.HW, e = 0.0001;
    return p.x - hw < s.x1 - e && p.x + hw > s.x0 + e &&
           p.y < s.y1 - e && p.y + this.H > s.y0 + e &&
           p.z - hw < s.z1 - e && p.z + hw > s.z0 + e;
  }

  // Returns list of events ('jump', 'djump', 'bounce')
  update(dt, solids, input, yaw, powers) {
    const events = [];
    const speed = this.SPEED * (powers.speed > 0 ? 1.6 : 1);
    const jumpV = this.JUMP * (powers.jump > 0 ? 1.35 : 1);

    // Ride moving platforms
    if (this.ground && this.ground.moving) {
      this.pos.x += this.ground.dx; this.pos.y += this.ground.dy; this.pos.z += this.ground.dz;
    }

    // Camera-relative movement direction
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw);
    let dx = fx * input.move.y + rx * input.move.x, dz = fz * input.move.y + rz * input.move.x;
    const len = Math.hypot(dx, dz);
    if (len > 1) { dx /= len; dz /= len; }
    const accel = (this.onGround ? 60 : (input.isTouch ? 45 : 30)) * dt;
    const approach = (v, t) => (v < t ? Math.min(v + accel, t) : Math.max(v - accel, t));
    this.vel.x = approach(this.vel.x, dx * speed);
    this.vel.z = approach(this.vel.z, dz * speed);

    // Jumping: coyote time + jump buffer + optional double jump (more forgiving on touch)
    const coyoteMax = input.isTouch ? 0.18 : 0.1;
    const bufferMax = input.isTouch ? 0.18 : 0.12;
    this.coyote = this.onGround ? coyoteMax : this.coyote - dt;
    this.jumpBuffer = input.jumpPressed ? bufferMax : this.jumpBuffer - dt;
    if (this.onGround) this.airJumps = 1;
    if (this.jumpBuffer > 0) {
      if (this.coyote > 0) {
        this.vel.y = jumpV; this.coyote = 0; this.jumpBuffer = 0; this.jumping = true;
        this.onGround = false; this.ground = null; events.push('jump');
      } else if (powers.double > 0 && this.airJumps > 0) {
        this.vel.y = jumpV * 0.95; this.airJumps--; this.jumpBuffer = 0; this.jumping = true;
        events.push('djump');
      }
    }
    // Variable jump height on keyboard; full jump on quick touch taps so mobile taps clear gaps
    if (this.jumping && !input.jumpHeld && this.vel.y > 0) {
      if (!input.lastJumpTouch) this.vel.y *= 0.5;
      this.jumping = false;
    }
    if (this.vel.y <= 0) this.jumping = false;

    // Integrate in small sub-steps for stable collisions
    const steps = Math.max(1, Math.ceil(dt / (1 / 120)));
    const h = dt / steps;
    let landed = null;
    for (let i = 0; i < steps; i++) {
      this.vel.y = Math.max(this.vel.y - this.G * h, -30);
      // Y axis
      const prevY = this.pos.y;
      this.pos.y += this.vel.y * h;
      let hitGround = null;
      for (const s of solids) {
        if (!this.overlaps(s)) continue;
        if (this.vel.y <= 0 && prevY >= s.y1 - 0.08 - Math.max(0, s.dy)) {
          this.pos.y = s.y1; this.vel.y = 0; hitGround = s;
        } else if (this.vel.y > 0 && prevY + this.H <= s.y0 + 0.08) {
          this.pos.y = s.y0 - this.H; this.vel.y = 0;
        }
      }
      if (hitGround) landed = hitGround;
      // X and Z axes (with ledge-grab forgiveness on touch)
      for (const ax of ['x', 'z']) {
        this.pos[ax] += this.vel[ax] * h;
        for (const s of solids) {
          if (!this.overlaps(s)) continue;
          const lip = s.y1 - this.pos.y;
          if (input.isTouch && lip > 0 && lip <= 0.3 && this.vel.y <= 3.5) {
            const oldY = this.pos.y;
            this.pos.y = s.y1;
            let blocked = false;
            for (const other of solids) {
              if (other !== s && this.overlaps(other)) { blocked = true; break; }
            }
            if (!blocked) {
              this.vel.y = Math.max(0, this.vel.y);
              landed = s;
              continue;
            }
            this.pos.y = oldY;
          }
          const lo = ax === 'x' ? s.x0 : s.z0, hi = ax === 'x' ? s.x1 : s.z1;
          this.pos[ax] = this.pos[ax] < (lo + hi) / 2 ? lo - this.HW - 0.001 : hi + this.HW + 0.001;
          this.vel[ax] = 0;
        }
      }
    }
    this.onGround = !!landed;
    this.ground = landed;

    this.animate(dt);
    this.updateShadow(solids, true);
    return events;
  }

  updateShadow(solids, show = true) {
    if (!show || !solids) { this.dropShadow.visible = false; return; }
    const p = this.pos;
    let bestY = -Infinity;
    for (const s of solids) {
      if (p.x >= s.x0 && p.x <= s.x1 && p.z >= s.z0 && p.z <= s.z1 && s.y1 <= p.y + 0.12) {
        if (s.y1 > bestY) bestY = s.y1;
      }
    }
    if (bestY === -Infinity) {
      this.dropShadow.visible = false;
      return;
    }
    const height = Math.max(0, p.y - bestY);
    this.dropShadow.visible = true;
    this.dropShadow.position.set(p.x, bestY + 0.02, p.z);
    const scale = Math.max(0.55, 1 - height * 0.075);
    this.dropShadow.scale.setScalar(scale);
    this.dropShadow.material.opacity = Math.max(0.18, 0.44 - height * 0.035);
  }

  animate(dt) {
    this.group.position.copy(this.pos);
    const hs = Math.hypot(this.vel.x, this.vel.z);
    if (hs > 0.5) {
      const target = Math.atan2(this.vel.x, this.vel.z);
      let diff = target - this.facing;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      this.facing += diff * Math.min(1, dt * 14);
    }
    this.group.rotation.y = this.facing;
    if (this.onGround) {
      this.walk += hs * dt * 2.2;
      const a = Math.sin(this.walk) * Math.min(1, hs / 5) * 0.9;
      this.legL.rotation.x = a; this.legR.rotation.x = -a;
      this.armL.rotation.x = -a; this.armR.rotation.x = a;
    } else {
      this.legL.rotation.x = 0.5; this.legR.rotation.x = -0.3;
      this.armL.rotation.x = -2.6; this.armR.rotation.x = -2.6;
    }
  }
}
