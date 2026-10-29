/* FULL COURT — basketball physics, rim and backboard collisions */
(function () {
  "use strict";
  const BB = (window.BB = window.BB || {});
  const U = BB.util;
  const C = BB.COURT;
  const GRAVITY = 9.81;

  class Ball {
    constructor(scene) {
      this.scene = scene;
      const geo = new THREE.SphereGeometry(C.ballRadius, 32, 24);
      const tex = U.ballTexture();
      tex.anisotropy = 8;
      const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.46, metalness: 0.02, envMapIntensity: 0.5 });
      this.mesh = new THREE.Mesh(geo, mat);
      this.mesh.castShadow = true;
      this.mesh.receiveShadow = true;
      scene.add(this.mesh);

      this.vel = new THREE.Vector3();
      this.prev = new THREE.Vector3();
      this.holder = null;
      this.state = "dead";
      this.shot = null;
      this.pass = null;
      this.scored = false;
      this.lastTouch = null;
      this.lastRim = -10;
      this.lastBoard = -10;
      this.floorHits = 0;
      this.time = 0;
      this.rotationAxis = new THREE.Vector3(1, 0, 0);
      this.mesh.visible = false;

      const c = U.canvas(128, 128);
      const ctx = c.getContext("2d");
      const g = ctx.createRadialGradient(64, 64, 4, 64, 64, 64);
      g.addColorStop(0, "rgba(0,0,0,.55)");
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 128, 128);
      this.shadow = new THREE.Mesh(
        new THREE.PlaneGeometry(0.55, 0.55),
        new THREE.MeshBasicMaterial({ map: U.texture(c, false), transparent: true, depthWrite: false, opacity: 0.5 })
      );
      this.shadow.rotation.x = -Math.PI / 2;
      this.shadow.position.y = 0.024;
      this.shadow.visible = false;
      scene.add(this.shadow);
    }

    reset() {
      this.vel.set(0, 0, 0);
      this.holder = null;
      this.state = "dead";
      this.shot = null;
      this.pass = null;
      this.scored = false;
      this.floorHits = 0;
      this.mesh.visible = false;
      this.shadow.visible = false;
    }

    place(x, y, z, visible = true) {
      this.mesh.position.set(x, y, z);
      this.prev.copy(this.mesh.position);
      this.vel.set(0, 0, 0);
      this.mesh.visible = visible;
      this.shadow.visible = visible;
      this.shadow.position.set(x, 0.024, z);
    }

    giveTo(player) {
      if (this.holder && this.holder !== player) this.holder.hasBall = false;
      this.holder = player;
      player.hasBall = true;
      this.state = "held";
      this.shot = null;
      this.pass = null;
      this.scored = false;
      this.floorHits = 0;
      this.vel.set(0, 0, 0);
      this.mesh.visible = true;
      this.shadow.visible = true;
      this.lastTouch = player;
      this.placeAtHand();
    }

    placeAtHand() {
      const p = this.holder;
      if (!p) return;
      const f = p.getForward(new THREE.Vector3());
      const r = p.getRight(new THREE.Vector3());
      const x = p.root.position.x + f.x * 0.22 + r.x * 0.2;
      const z = p.root.position.z + f.z * 0.22 + r.z * 0.2;
      const y = 1.25 + p.jumpY;
      this.mesh.position.set(x, y, z);
    }

    drop(player, vx = 0, vy = 0, vz = 0) {
      if (this.holder) this.holder.hasBall = false;
      this.holder = null;
      this.state = "loose";
      this.shot = null;
      this.pass = null;
      this.vel.set(vx, vy, vz);
      this.prev.copy(this.mesh.position);
      this.mesh.visible = true;
      this.shadow.visible = true;
      this.scored = false;
      this.floorHits = 0;
      this.lastTouch = player || this.lastTouch;
    }

    shoot(player, target, opts = {}) {
      if (this.holder) this.holder.hasBall = false;
      this.holder = null;
      this.state = "shot";
      this.scored = false;
      this.floorHits = 0;
      this.shot = Object.assign({
        shooter: player,
        team: player.team,
        target,
        points: 2,
        freeThrow: false,
        dunk: false,
        quality: 0.5,
        startTime: this.time,
        rimHit: false,
        boardHit: false,
        blocker: null,
      }, opts);
      this.mesh.visible = true;
      this.shadow.visible = true;
      this.lastTouch = player;
    }

    passTo(passer, receiver, target, velocity, opts = {}) {
      if (this.holder) this.holder.hasBall = false;
      this.holder = null;
      this.state = "pass";
      this.scored = false;
      this.floorHits = 0;
      this.vel.copy(velocity);
      this.pass = Object.assign({
        passer,
        receiver,
        team: passer.team,
        target: target.clone(),
        inbound: false,
        assistCandidate: true,
        startTime: this.time,
        interceptedBy: null,
      }, opts);
      this.mesh.visible = true;
      this.shadow.visible = true;
      this.lastTouch = passer;
      this.prev.copy(this.mesh.position);
    }

    setLoosePosition(x, y, z) {
      this.holder = null;
      this.state = "loose";
      this.mesh.position.set(x, y, z);
      this.prev.copy(this.mesh.position);
      this.vel.set(0, 0, 0);
      this.mesh.visible = true;
      this.shadow.visible = true;
    }

    update(dt, game) {
      this.time += dt;
      if (this.state === "held") {
        this.updateHeld(dt, game);
        return;
      }
      if (this.state === "dead") {
        this.shadow.visible = false;
        return;
      }

      const steps = Math.min(5, Math.max(1, Math.ceil(dt / 0.008)));
      const h = dt / steps;
      for (let s = 0; s < steps; s++) {
        this.prev.copy(this.mesh.position);
        this.vel.y -= GRAVITY * h;
        this.vel.multiplyScalar(1 - 0.018 * h);
        this.mesh.position.addScaledVector(this.vel, h);
        this.applyRimMagnet(h);
        this.collideFloor(h, game);
        this.collideBackboard(h, game);
        this.collideRim(h, game);
        this.checkScore(game);
        if (this.state !== "shot" && this.state !== "pass" && this.state !== "loose") break;
      }

      this.spinBall(dt);
      this.updateShadow();
      if (game) game.checkBallBounds(this);
    }

    updateHeld(dt, game) {
      if (!this.holder) return;
      const p = this.holder;
      const f = p.getForward(new THREE.Vector3());
      const r = p.getRight(new THREE.Vector3());
      if (p.action && p.action.type === "charge") {
        const charge = U.clamp(p.action.t * 1.1, 0, 1);
        const x = p.root.position.x + f.x * 0.2;
        const z = p.root.position.z + f.z * 0.2;
        const y = 1.62 + charge * 0.38 + p.jumpY;
        this.mesh.position.set(x, y, z);
        this.mesh.rotation.y += dt * 1.2;
      } else if (p.action && ["shoot", "freeThrow"].includes(p.action.type)) {
        const t = p.getActionPhase();
        const lift = U.smoothstep(U.clamp(t / 0.45, 0, 1));
        this.mesh.position.set(
          p.root.position.x + f.x * 0.22,
          1.95 + lift * 0.28 + p.jumpY,
          p.root.position.z + f.z * 0.22
        );
      } else if (p.action && ["pass", "inbound"].includes(p.action.type)) {
        const t = p.getActionPhase();
        const ext = U.smoothstep(U.clamp(t / 0.3, 0, 1));
        this.mesh.position.set(
          p.root.position.x + f.x * (0.2 + ext * 0.18),
          1.3 + p.jumpY,
          p.root.position.z + f.z * (0.2 + ext * 0.18)
        );
      } else if (p.action && p.action.type === "dunk") {
        const t = p.getActionPhase();
        this.mesh.position.set(
          p.root.position.x + f.x * 0.35,
          2.0 + U.smoothstep(t) * 0.75 + p.jumpY,
          p.root.position.z + f.z * 0.35
        );
      } else if (p.action && p.action.type === "layup") {
        this.mesh.position.set(
          p.root.position.x + f.x * 0.28,
          1.8 + p.jumpY,
          p.root.position.z + f.z * 0.28
        );
      } else {
        // live dribble — ball bounces off the parquet
        const speed = p.speed;
        const lift = Math.abs(Math.sin(p.dribblePhase));
        const dribbleHeight = 0.82 - U.clamp(speed, 0, 6) * 0.035;
        const y = C.ballRadius + lift * dribbleHeight;
        const side = p.dribbleSide || 1;
        const cross = p.dribbleCrossoverT || 0;
        const offset = 0.31 + cross * 0.32;
        this.mesh.position.set(
          p.root.position.x + f.x * (0.2 + cross * 0.12) + r.x * side * offset,
          y + p.jumpY,
          p.root.position.z + f.z * (0.2 + cross * 0.12) + r.z * side * offset
        );
        this.mesh.rotation.x += dt * (4 + speed);
        this.mesh.rotation.z += dt * 1.5;
      }
      this.shadow.visible = true;
      this.updateShadow();
      this.mesh.rotation.y += dt * 0.8;
    }

    spinBall(dt) {
      const sp = this.vel.length();
      if (sp > 0.05) {
        const axis = this.rotationAxis.copy(this.vel).cross(new THREE.Vector3(0, 1, 0));
        if (axis.lengthSq() < 0.0001) axis.set(1, 0, 0);
        axis.normalize();
        const angle = (sp / C.ballRadius) * dt * 0.55;
        const q = new THREE.Quaternion().setFromAxisAngle(axis, angle);
        this.mesh.quaternion.premultiply(q);
      }
    }

  /* Slight rim gravity for layups: pulls near-miss trajectories a little
     toward the hoop so close releases can still drop in. Jumps and threes
     get no help — a missed release must miss honestly. Makes are already
     aimed at dead centre, so skip them too. */
    applyRimMagnet(h) {
      if (this.state !== "shot" || !this.shot) return;
      if (this.shot.rimHit || this.shot.dunk || this.shot.make) return;
      if (!this.shot.layup) return;
      const pos = this.mesh.position;
      const hoopX = this.shot.team === "blue" ? C.rimX : -C.rimX;
      const dx = hoopX - pos.x;
      const dz = -pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 0.01 || dist > 1.5) return;
      if (pos.y < C.rimY - 0.35 || pos.y > C.rimY + 2.2) return;
      if (this.vel.y > 0.6) return;
      const near = 1 - dist / 1.5;
      const strength = (0.35 + 1.8 * near) * (this.shot.green ? 1.15 : 1);
      this.vel.x += (dx / dist) * strength * h;
      this.vel.z += (dz / dist) * strength * h;
    }

    collideFloor(h, game) {
      const pos = this.mesh.position;
      if (pos.y - C.ballRadius <= 0.001) {
        pos.y = C.ballRadius;
        if (this.vel.y < -0.35) {
          const impact = -this.vel.y;
          this.vel.y = -this.vel.y * 0.74;
          this.vel.x *= 0.965;
          this.vel.z *= 0.965;
          if (impact > 0.8) {
            if (game && game.audio) game.audio.dribble(U.clamp(impact / 5, 0.25, 1.1));
            if (game && game.arena) {
              // net/rim already handled; floor doesn't need crowd reaction
            }
          }
          this.floorHits++;
          if (this.state === "shot") {
            this.state = "loose";
            this.shot = null;
          } else if (this.state === "pass") {
            this.state = "loose";
            this.pass = null;
          }
        } else {
          this.vel.y = 0;
          this.vel.x *= 0.92;
          this.vel.z *= 0.92;
          if (Math.hypot(this.vel.x, this.vel.z) < 0.04) this.vel.set(0, 0, 0);
        }
      }
    }

    collideBackboard(h, game) {
      const pos = this.mesh.position;
      if (pos.y < C.backboardBottom - C.ballRadius || pos.y > C.backboardTop + C.ballRadius) return;
      if (Math.abs(pos.z) > C.backboardHalfW + C.ballRadius) return;
      for (const side of [1, -1]) {
        const bx = side * C.backboardX;
        const front = bx - side * 0.0225;
        const dist = Math.abs(pos.x - front);
        if (dist > 0.6 || pos.x * side > (C.backboardX + 0.5) * side) continue;
        const approaching = side > 0 ? this.vel.x > 0 : this.vel.x < 0;
        const nearFront = side > 0 ? pos.x > front - C.ballRadius - 0.02 && pos.x < front + 0.2 : pos.x < front + C.ballRadius + 0.02 && pos.x > front - 0.2;
        if (approaching && nearFront) {
          pos.x = front - side * (C.ballRadius + 0.002);
          this.vel.x *= -0.58;
          this.vel.y *= 0.9;
          this.vel.z *= 0.9;
          if (this.time - this.lastBoard > 0.12) {
            this.lastBoard = this.time;
            if (game) {
              if (game.audio) game.audio.backboard(0.9);
              if (game.arena) game.arena.rimHit(side > 0 ? game.arena.hoops[0] : game.arena.hoops[1], 0.3);
            }
          }
        }
      }
    }

    collideRim(h, game) {
      const pos = this.mesh.position;
      for (const hoop of [{ x: C.rimX, z: 0 }, { x: -C.rimX, z: 0 }]) {
        const dx = pos.x - hoop.x;
        const dz = pos.z - hoop.z;
        const hd = Math.hypot(dx, dz);
        if (hd > C.rimRadius + C.ballRadius + 0.25) continue;
        if (Math.abs(pos.y - C.rimY) > C.rimRadius * 1.9 + C.ballRadius) continue;
        let nx, nz;
        if (hd < 0.0001) { nx = 1; nz = 0; } else { nx = dx / hd; nz = dz / hd; }
        const rimPt = new THREE.Vector3(hoop.x + nx * C.rimRadius, C.rimY, hoop.z + nz * C.rimRadius);
        const diff = new THREE.Vector3().subVectors(pos, rimPt);
        const d = diff.length();
        const minD = C.ballRadius + C.rimTube;
        if (d < minD && d > 0.0001) {
          const normal = diff.multiplyScalar(1 / d);
          pos.addScaledVector(normal, minD - d);
          const vn = this.vel.dot(normal);
          if (vn < 0) {
            this.vel.addScaledVector(normal, -vn * 1.52);
            this.vel.multiplyScalar(0.9);
            if (this.time - this.lastRim > 0.1) {
              this.lastRim = this.time;
              if (game) {
                if (game.audio) game.audio.rim(0.9);
                if (game.arena) {
                  const hoopObj = hoop.x > 0 ? game.arena.hoops[0] : game.arena.hoops[1];
                  game.arena.rimHit(hoopObj, 0.75);
                }
              }
              if (this.shot) this.shot.rimHit = true;
            }
          }
        }
      }
    }

    checkScore(game) {
      if (this.scored) return;
      if (this.vel.y > 0) return;
      const pos = this.mesh.position;
      const prevY = this.prev.y;
      if (!(prevY > C.rimY - 0.01 && pos.y <= C.rimY + 0.02)) return;
      if (pos.y < C.rimY - 0.35) return;
      for (const hoop of [{ side: 1, x: C.rimX }, { side: -1, x: -C.rimX }]) {
        const hd = Math.hypot(pos.x - hoop.x, pos.z);
        if (hd < C.rimRadius - 0.025) {
          this.scored = true;
          if (game) game.onHoopScore(hoop, this);
          return;
        }
      }
    }

    updateShadow() {
      if (!this.mesh.visible) { this.shadow.visible = false; return; }
      const pos = this.mesh.position;
      this.shadow.position.x = pos.x;
      this.shadow.position.z = pos.z;
      const h = U.clamp(pos.y / 4.5, 0, 1);
      this.shadow.material.opacity = 0.52 * (1 - h * 0.75);
      const s = 1 - h * 0.45;
      this.shadow.scale.set(s, s, s);
      this.shadow.visible = pos.y < 8;
    }

    get pos() {
      return this.mesh.position;
    }
  }

  BB.Ball = Ball;
})();
