/* FULL COURT — team AI for offense, defense, rebounds and inbounding */
(function () {
  "use strict";
  const BB = (window.BB = window.BB || {});
  const U = BB.util;
  const C = BB.COURT;

  const DIFFICULTY = {
    rookie: { reaction: 0.58, shot: 0.79, pass: 0.56, steal: 0.32, contest: 0.45, speed: 0.95, mistake: 0.22 },
    pro: { reaction: 0.4, shot: 0.9, pass: 0.76, steal: 0.5, contest: 0.72, speed: 1.0, mistake: 0.11 },
    legend: { reaction: 0.26, shot: 1.0, pass: 0.92, steal: 0.68, contest: 0.92, speed: 1.04, mistake: 0.045 },
  };

  /* One permanent point per role: everyone stays spaced instead of
     drifting into the same area. Distance is measured from the hoop. */
  const HOME_SPOTS = [
    { d: 8.2, z: 0.0 },    // top of the key
    { d: 6.3, z: 4.7 },    // right wing
    { d: 6.3, z: -4.7 },   // left wing
    { d: 3.0, z: 4.4 },    // short corner
    { d: 1.8, z: -1.6 },   // paint
  ];

  class AI {
    constructor(player, game, difficulty) {
      this.p = player;
      this.game = game;
      this.diffName = difficulty || "pro";
      this.diff = DIFFICULTY[this.diffName] || DIFFICULTY.pro;
      this.think = Math.random() * 0.4;
      this.stealCd = 0.8 + Math.random() * 1.5;
      this.jumpCd = 0;
      this.trickCd = 1.5 + Math.random();
      this.cutCd = 2 + Math.random() * 3;
      this.cutTimer = 0;
      this.cutTarget = new THREE.Vector3();
      this.slot = (player.slot || 0) % HOME_SPOTS.length;
      this.spacingTimer = 0;
      this.spot = new THREE.Vector3();
      this.target = new THREE.Vector3();
      this.reboundDelay = 0;
      this.shotReacted = false;
      this.contestTried = false;
      this.passReacted = false;
      this.inboundWait = 0.8 + Math.random() * 1.1;
      this.lastMan = null;
      this._v = new THREE.Vector3();
      this._v2 = new THREE.Vector3();
    }

    setDifficulty(name) {
      this.diffName = name;
      this.diff = DIFFICULTY[name] || DIFFICULTY.pro;
    }

    clampTarget(t) {
      t.x = U.clamp(t.x, -13.3, 13.3);
      t.z = U.clamp(t.z, -6.85, 6.85);
      return t;
    }

    moveTo(x, z, sprint = false, stopDist = 0.12) {
      const p = this.p;
      const dx = x - p.root.position.x;
      const dz = z - p.root.position.z;
      const d = Math.hypot(dx, dz);
      if (d < stopDist) {
        p.setInput(0, 0, false);
        return d;
      }
      const arrive = U.clamp(d / 1.1, 0.25, 1);
      p.setInput((dx / d) * arrive, (dz / d) * arrive, sprint);
      return d;
    }

    face(x, z) {
      this.p.targetFacing = Math.atan2(x - this.p.root.position.x, z - this.p.root.position.z);
    }

    update(dt) {
      const p = this.p;
      const g = this.game;
      p.lookTarget.copy(g.ball.mesh.position);
      this.think -= dt;
      this.stealCd -= dt;
      this.jumpCd -= dt;
      this.trickCd -= dt;
      this.cutCd -= dt;
      this.spacingTimer -= dt;
      if (this.inboundWait > 0) this.inboundWait -= dt;

      if (!g || g.paused || p.stunned > 0) {
        p.setInput(0, 0, false);
        return;
      }
      if (g.state === "live") {
        this.updateLive(dt);
      } else if (g.state === "inbound") {
        this.updateInbound(dt);
      } else if (g.state === "tipoff") {
        this.updateTipoff(dt);
      } else if (g.state === "freethrow") {
        p.setInput(0, 0, false);
        p.targetFacing = p.team === "blue" ? Math.PI / 2 : -Math.PI / 2;
      } else {
        p.setInput(0, 0, false);
      }
    }

    /* ============================ LIVE ============================ */
    updateLive(dt) {
      const g = this.game;
      const p = this.p;
      const b = g.ball;

      if (b.state === "pass") {
        if (b.pass && b.pass.team === p.team) {
          if (b.pass.receiver === p) {
            const target = this._v.copy(b.pass.target);
            this.moveTo(target.x, target.z, true, 0.3);
            this.face(b.mesh.position.x, b.mesh.position.z);
          } else {
            this.offBall(dt);
          }
        } else {
          this.defendPass(dt);
        }
        return;
      }

      if (b.state === "shot") {
        this.rebound(dt);
        return;
      }

      if (b.state === "loose") {
        this.chaseLoose(dt);
        return;
      }

      const handler = b.holder;
      if (handler === p) {
        this.withBall(dt);
      } else if (handler && handler.team === p.team) {
        this.offBall(dt);
      } else {
        this.defend(dt);
      }
    }

    /* ============================ OFFENSE ============================ */
    withBall(dt) {
      const p = this.p;
      const g = this.game;
      if (!p.hasBall || g.ball.holder !== p) return;
      if (p.action && ["shoot", "pass", "dunk", "layup", "stumble"].includes(p.action.type)) return;
      if (p.shotPending) return;

      const hoop = g.hoopFor(p.team);
      const defs = g.opponentsOf(p);
      let nearest = null, nearDist = 99;
      for (const d of defs) {
        const dd = U.dist2D(p.root.position, d.root.position);
        if (dd < nearDist) { nearDist = dd; nearest = d; }
      }
      const distHoop = Math.hypot(p.root.position.x - hoop.x, p.root.position.z - hoop.z);
      const shotClock = g.shotClock;
      const pressured = nearDist < 1.25;
      const open = nearDist > 2.05;

      this.face(hoop.x, hoop.z);

      if (this.think <= 0) {
        this.think = this.diff.reaction * U.rand(0.75, 1.3);
        const teammate = g.bestPassTarget(p);
        const teammateDef = teammate ? g.nearestOpponentTo(teammate) : null;
        const mateOpen =
          teammate && (!teammateDef || U.dist2D(teammate.root.position, teammateDef.root.position) > 1.9);
        // late clock — must shoot
        const late = shotClock < 4.2;
        let shootChance = 0;
        if (distHoop < 2.4) shootChance = 0.72;
        else if (distHoop < 4.4) shootChance = open ? 0.44 : 0.23;
        else if (distHoop < 6.6) shootChance = open ? 0.24 : 0.1;
        else shootChance = open ? 0.115 : 0.045;
        shootChance *= (0.86 + this.diff.shot * 0.24);
        if (late) shootChance = 0.95;

        if (shotClock < 11 && g.gameClock < 7) shootChance += 0.12;

        // pass out of pressure
        if (teammate && pressured && !late && Math.random() < this.diff.pass * 0.55) {
          const mateDist = U.dist2D(teammate.root.position, hoop);
          const mateDef = g.nearestOpponentTo(teammate);
          const mateOpenness = mateDef ? U.dist2D(teammate.root.position, mateDef.root.position) : 5;
          if (mateOpenness > 1.5 || mateDist < 4) {
            if (g.aiPass(p, teammate)) return;
          }
        }

        // shoot decision
        if (Math.random() < shootChance) {
          const quality = this.computeShotQuality(nearDist, distHoop, open, pressured);
          if (g.aiShoot(p, quality)) return;
        }

        // pass to open teammate in the flow
        if (teammate && !pressured && Math.random() < this.diff.pass * 0.16) {
          const mateDef = g.nearestOpponentTo(teammate);
          if (!mateDef || U.dist2D(teammate.root.position, mateDef.root.position) > 2.2) {
            if (g.aiPass(p, teammate)) return;
          }
        }

        // trick / create separation
        if (pressured && this.trickCd <= 0 && Math.random() < 0.6) {
          if (g.aiTrick(p)) this.trickCd = 2.3 + Math.random() * 1.8;
        }
      }

      // movement: attack the rim / probe
      let targetX, targetZ;
      const side = p.root.position.z >= 0 ? 1 : -1;
      if (distHoop > 6.2) {
        const lane = (p.root.position.z > 1.2 ? 1 : p.root.position.z < -1.2 ? -1 : side);
        targetX = hoop.x - Math.sign(hoop.x) * U.rand(5.4, 6.8);
        targetZ = lane * U.rand(1.2, 3.8);
      } else if (distHoop > 3.0) {
        targetX = hoop.x - Math.sign(hoop.x) * U.rand(2.6, 4.4);
        targetZ = p.root.position.z * 0.65 + (nearest ? (nearest.root.position.z > p.root.position.z ? -1 : 1) * 0.9 : 0);
      } else {
        targetX = hoop.x - Math.sign(hoop.x) * 1.0;
        targetZ = U.clamp(p.root.position.z * 0.5, -1.8, 1.8);
      }
      if (nearest && nearDist < 1.55) {
        // veer away from the defender while driving
        targetZ += (p.root.position.z >= nearest.root.position.z ? 1 : -1) * 0.85;
      }
      const sprint = distHoop < 7.2 || pressured;
      this.moveTo(U.clamp(targetX, -13.2, 13.2), U.clamp(targetZ, -6.7, 6.7), sprint, 0.25);
    }

    computeShotQuality(nearDist, distHoop, open, pressured) {
      const p = this.p;
      const base = distHoop > C.threeRadius ? p.ratings.three : p.ratings.shoot;
      let q = base * (0.82 + this.diff.shot * 0.26);
      q -= U.clamp((2.2 - nearDist) / 2.2, 0, 1) * 0.22;
      q -= p.speed * 0.016;
      if (pressured) q -= 0.05;
      q += (open ? 0.05 : 0);
      q += U.rand(-0.09, 0.09);
      return U.clamp(q, 0.12, 0.97);
    }

    offBall(dt) {
      const p = this.p;
      const g = this.game;
      const handler = g.ball.holder;
      if (!handler) { p.setInput(0, 0, false); return; }
      const hoop = g.hoopFor(p.team);
      const attack = Math.sign(hoop.x) || 1;
      const def = g.nearestOpponentTo(p);
      const defDist = def ? U.dist2D(p.root.position, def.root.position) : 9;
      const handlerPos = handler.root.position;

      // Every player owns one spot and returns to it instead of crowding
      // the ball or a teammate.
      const home = HOME_SPOTS[this.slot] || HOME_SPOTS[0];
      const mirror = p.team === "blue" ? 1 : -1;
      let targetX = U.clamp(hoop.x - attack * home.d, -13.1, 13.1);
      let targetZ = U.clamp(home.z * mirror, -6.6, 6.6);

      // Occasional backdoor cut when the defender denies the spot.
      if (this.cutCd <= 0 && def && defDist < 1.4 && Math.random() < 0.5) {
        this.cutCd = 4 + Math.random() * 4;
        this.cutTarget.set(
          hoop.x - attack * 1.05,
          0,
          U.clamp(home.z * mirror * 0.3 + U.rand(-0.8, 0.8), -1.8, 1.8)
        );
        this.cutTimer = 1.2;
      }
      if (this.cutTimer > 0) {
        this.cutTimer -= dt;
        targetX = this.cutTarget.x;
        targetZ = this.cutTarget.z;
      }

      const target = this.spot.set(targetX, 0, targetZ);
      const distToSpot = U.dist2D(p.root.position, target);
      const sprint = distToSpot > 2.2 || this.cutTimer > 0;
      this.moveTo(target.x, target.z, sprint, 0.3);
      if (distToSpot < 0.85) {
        this.face(handlerPos.x, handlerPos.z);
        if (p.action && p.action.type === "receive") return;
      }
    }

    /* ============================ DEFENSE ============================ */
    defend(dt) {
      const p = this.p;
      const g = this.game;
      const handler = g.ball.holder;
      if (!handler) { p.setInput(0, 0, false); return; }
      const assignment = g.defensiveAssignment(p);
      const ownHoopX = p.team === "blue" ? -C.rimX : C.rimX;

      if (assignment === handler || !assignment) {
        this.onBallDefense(dt, handler, ownHoopX);
      } else {
        this.offBallDefense(dt, assignment, ownHoopX, handler);
      }
    }

    onBallDefense(dt, handler, ownHoopX) {
      const p = this.p;
      const g = this.game;
      const hx = handler.root.position.x;
      const hz = handler.root.position.z;
      let vx = ownHoopX - hx;
      let vz = -hz;
      const len = Math.hypot(vx, vz) || 1;
      vx /= len; vz /= len;
      const dist = U.dist2D(p.root.position, handler.root.position);
      // stay between handler and own basket, but not inside the rim
      const guardDist = U.clamp(1.05 + (handler.speed > 2 ? 0.18 : 0), 0.95, 1.35);
      let tx = hx + vx * guardDist;
      let tz = hz + vz * guardDist;
      const ownHoopDist = Math.abs(hx - ownHoopX);
      if (ownHoopDist < 2.2) {
        tx = U.lerp(tx, hx, 0.35);
        tz = U.lerp(tz, hz, 0.35);
      }
      // if beaten, recover to the basket side
      const behind = (hx - p.root.position.x) * vx + (hz - p.root.position.z) * vz;
      const sprint = dist > 1.6 || (behind < -0.2 && dist > 1);
      this.moveTo(U.clamp(tx, -13.2, 13.2), U.clamp(tz, -6.8, 6.8), sprint, 0.14);
      this.face(hx, hz);

      // steal attempts
      if (dist < 1.25 && this.stealCd <= 0) {
        if (Math.random() < 0.55 * this.diff.steal) {
          g.aiSteal(p, handler);
          this.stealCd = 1.8 + Math.random() * 2.0;
        } else {
          this.stealCd = 0.65;
        }
      }

      // contest a shot wind-up
      if ((handler.action && (handler.action.type === "charge" || handler.shotPending)) && dist < 2.2 && this.jumpCd <= 0) {
        this.jumpCd = 1.2;
        if (Math.random() < this.diff.contest * 0.85) {
          g.aiContest(p, handler);
        }
      }
      // if the shot is already in the air nearby, go for the block
      if (g.ball.state === "shot" && g.ball.shot && g.ball.shot.shooter !== p) {
        const bd = U.dist2D(p.root.position, g.ball.mesh.position);
        if (bd < 1.8 && g.ball.mesh.position.y > 2.2 && this.jumpCd <= 0) {
          this.jumpCd = 1.4;
          g.aiContest(p, handler);
        }
      }
    }

    offBallDefense(dt, man, ownHoopX, handler) {
      const p = this.p;
      const g = this.game;
      const mx = man.root.position.x;
      const mz = man.root.position.z;
      let vx = ownHoopX - mx, vz = -mz;
      const len = Math.hypot(vx, vz) || 1;
      vx /= len; vz /= len;
      let tx = mx + vx * 1.45;
      let tz = mz + vz * 1.45;
      // shade ball-side
      const bx = handler.root.position.x, bz = handler.root.position.z;
      let sx = bx - mx, sz = bz - mz;
      const sl = Math.hypot(sx, sz) || 1;
      tx += (sx / sl) * 0.35;
      tz += (sz / sl) * 0.35;

      // help in the paint if the handler is deep
      const handlerHoopDist = Math.hypot(handler.root.position.x - ownHoopX, handler.root.position.z);
      if (handlerHoopDist < 3.2 && U.dist2D(p.root.position, handler.root.position) > 2) {
        tx = U.lerp(tx, handler.root.position.x, 0.42);
        tz = U.lerp(tz, handler.root.position.z, 0.42);
      }
      const distMan = U.dist2D(p.root.position, man.root.position);
      const sprint = distMan > 2.3;
      this.moveTo(U.clamp(tx, -13.2, 13.2), U.clamp(tz, -6.8, 6.8), sprint, 0.2);
      // face between man and ball
      this.face((man.root.position.x + bx) * 0.5, (man.root.position.z + bz) * 0.5);

      // deny the pass with a late jump if the lane is close
      if (g.ball.state === "pass" && g.ball.pass && g.ball.pass.team !== p.team) {
        const ball = g.ball.mesh.position;
        if (U.dist2D(p.root.position, ball) < 1.4 && this.jumpCd <= 0) {
          this.jumpCd = 1.5;
          g.aiContest(p, man);
        }
      }
    }

    defendPass(dt) {
      const p = this.p;
      const g = this.game;
      const pass = g.ball.pass;
      if (!pass) { this.defend(dt); return; }
      const a = pass.passer.root.position;
      const b = pass.receiver.root.position;
      const bp = g.ball.mesh.position;
      // move into the lane between passer and receiver
      let t = ((bp.x - a.x) * (b.x - a.x) + (bp.z - a.z) * (b.z - a.z)) / (Math.pow(b.x - a.x, 2) + Math.pow(b.z - a.z, 2) + 0.001);
      t = U.clamp(t, 0.1, 0.95);
      const lx = U.lerp(a.x, b.x, t);
      const lz = U.lerp(a.z, b.z, t);
      const distLine = U.segmentPointDist(a.x, a.z, b.x, b.z, p.root.position.x, p.root.position.z);
      if (distLine < 2.4) {
        this.moveTo(lx, lz, true, 0.25);
        this.face(bp.x, bp.z);
        if (U.dist2D(p.root.position, bp) < 1.35 && this.jumpCd <= 0 && bp.y < 2.8) {
          this.jumpCd = 1.1;
          g.aiContest(p, pass.passer);
        }
      } else {
        this.defend(dt);
      }
    }

    rebound(dt) {
      const p = this.p;
      const g = this.game;
      const b = g.ball;
      if (b.state !== "shot" || !b.shot) {
        this.chaseLoose(dt);
        return;
      }
      const shot = b.shot;
      const hoop = { x: shot.team === "blue" ? C.rimX : -C.rimX };
      let targetX, targetZ;
      const ballPos = b.mesh.position;
      if (ballPos.y > 1.4 && b.vel.y < 1.2) {
        let t = 0;
        let y = ballPos.y;
        let vy = b.vel.y;
        while (y > 1.2 && t < 3) { t += 0.04; vy -= 9.81 * 0.04; y += vy * 0.04; }
        targetX = ballPos.x + b.vel.x * t * 0.8;
        targetZ = ballPos.z + b.vel.z * t * 0.8;
      } else {
        const dir = p.team === "blue" ? 1 : -1;
        targetX = hoop.x - dir * 1.3;
        targetZ = U.rand(-1.4, 1.4);
      }
      this.moveTo(U.clamp(targetX, -13.2, 13.2), U.clamp(targetZ, -6.8, 6.8), true, 0.2);
      this.face(ballPos.x, ballPos.z);
      if (this.jumpCd <= 0) {
        const dist = U.dist2D(p.root.position, ballPos);
        const reach = p.getReachY();
        if (dist < 1.35 && ballPos.y > 1.7 && ballPos.y < reach + 0.55) {
          this.jumpCd = 0.9;
          g.aiJump(p, "rebound");
        }
      }
    }

    chaseLoose(dt) {
      const p = this.p;
      const g = this.game;
      const b = g.ball.mesh.position;
      if (!g.ball.mesh.visible) { p.setInput(0, 0, false); return; }
      let tx = b.x, tz = b.z;
      if (g.ball.vel.y !== 0 || b.y > 0.5) {
        let t = 0, y = b.y, vy = g.ball.vel.y;
        while (y > 0.7 && t < 2) { t += 0.05; vy -= 9.81 * 0.05; y += vy * 0.05; }
        tx = b.x + g.ball.vel.x * t * 0.55;
        tz = b.z + g.ball.vel.z * t * 0.55;
      }
      this.moveTo(U.clamp(tx, -13.3, 13.3), U.clamp(tz, -6.9, 6.9), true, 0.15);
      this.face(b.x, b.z);
      if (this.jumpCd <= 0) {
        const d = U.dist2D(p.root.position, b);
        if (d < 1.3 && b.y > 1.5 && b.y < p.getReachY() + 0.4) {
          this.jumpCd = 0.7;
          g.aiJump(p, "rebound");
        }
      }
    }

    /* ============================ INBOUND / TIP ============================ */
    updateInbound(dt) {
      const p = this.p;
      const g = this.game;
      if (g.inbounder === p) {
        p.setInput(0, 0, false);
        const hoop = g.hoopFor(p.team);
        this.face(hoop.x, hoop.z);
        if (this.inboundWait <= 0) {
          g.aiInboundPass(p);
          this.inboundWait = 1.2;
        }
        return;
      }
      if (g.inbounder && g.inbounder.team === p.team) {
        // receiver: get open inside the line
        const target = g.inboundReceiver === p ? g.inboundReceiveSpot : this.spot;
        if (target) {
          this.moveTo(target.x, target.z, true, 0.2);
          const ballPos = g.ball.mesh.position;
          this.face(ballPos.x, ballPos.z);
        } else {
          p.setInput(0, 0, false);
        }
      } else {
        // defend the inbound: stay attached to the assigned man, deny the primary lane
        const recv = g.inboundReceiver;
        const man = g.defensiveAssignment(p);
        const ownHoopX = p.team === "blue" ? -C.rimX : C.rimX;
        if (man && man !== g.inbounder && man !== p) {
          const mx = man.root.position.x;
          const mz = man.root.position.z;
          let vx = ownHoopX - mx;
          let vz = -mz;
          const l = Math.hypot(vx, vz) || 1;
          this.moveTo(mx + (vx / l) * 1.3, mz + (vz / l) * 1.3, true, 0.16);
        } else if (recv) {
          const bx = g.inbounder ? g.inbounder.root.position.x : 0;
          const bz = g.inbounder ? g.inbounder.root.position.z : 0;
          const lx = (recv.root.position.x + bx) * 0.5;
          const lz = (recv.root.position.z + bz) * 0.5;
          const dLine = U.segmentPointDist(
            bx,
            bz,
            recv.root.position.x,
            recv.root.position.z,
            p.root.position.x,
            p.root.position.z
          );
          if (dLine < 2.2) {
            this.moveTo(lx, lz, true, 0.1);
          } else {
            let vx = ownHoopX - recv.root.position.x;
            let vz = -recv.root.position.z;
            const l = Math.hypot(vx, vz) || 1;
            this.moveTo(
              recv.root.position.x + (vx / l) * 1.2,
              recv.root.position.z + (vz / l) * 1.2,
              true,
              0.15
            );
          }
        }
        this.face(g.ball.mesh.position.x, g.ball.mesh.position.z);
        if (
          g.ball.state === "pass" &&
          this.jumpCd <= 0 &&
          U.dist2D(p.root.position, g.ball.mesh.position) < 1.4
        ) {
          this.jumpCd = 1.4;
          g.aiContest(p, g.inbounder);
        }
      }
    }

    updateTipoff(dt) {
      const p = this.p;
      const g = this.game;
      const ball = g.ball.mesh.position;
      p.lookTarget.copy(ball);
      this.face(ball.x, ball.z);
      if (p === g.tipPlayerA || p === g.tipPlayerB) {
        p.setInput(0, 0, false);
        if (g.tipTime > 0.5 && this.jumpCd <= 0) {
          this.jumpCd = 2;
          p.doJump(1);
          p.playAction("block", 0.7);
        }
      } else {
        p.setInput(0, 0, false);
      }
    }
  }

  BB.AI = AI;
  BB.AI_DIFFICULTY = DIFFICULTY;
})();
