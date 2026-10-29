/* FULL COURT — gameplay: possession, shooting, passing, defense, rules and periods */
(function () {
  "use strict";
  const BB = window.BB;
  const U = BB.util;
  const C = BB.COURT;
  const P = BB.Game.prototype;

  const QUARTER_LENGTH = BB.QUARTER_LENGTH || 120;
  const OT_LENGTH = BB.OT_LENGTH || 60;
  const GRAVITY = 9.81;
  const AIR_DRAG = 0.018; // must match the drag in ball.js

  const otherTeam = (t) => (t === "blue" ? "red" : "blue");
  const teamLabel = (t) => (BB.TEAM[t] ? BB.TEAM[t].name : t.toUpperCase());

  /* ============================================================
     SHARED HELPERS
     ============================================================ */

  P.ballisticVel = function (from, to, flight) {
    const t = Math.max(0.08, flight);
    return new THREE.Vector3(
      (to.x - from.x) / t,
      (to.y - from.y + 0.5 * GRAVITY * t * t) / t,
      (to.z - from.z) / t
    );
  };

  /* Solve a drag-compensated arc that reaches the goal at rim height with
     the requested downward entry slope. Aiming with the plain ballistic
     formula falls short because the ball loses speed to air drag, so the
     shot clips the front iron; this solver accounts for that loss. */
  P.arcShot = function (release, goal, opts = {}) {
    const entrySlope = opts.entrySlope != null ? opts.entrySlope : 1.12;
    // The discrete physics drops the ball a few centimetres short of the
    // analytic solution; lead the crossing point so it lands dead centre.
    const lead = opts.lead != null ? opts.lead : 0.03;
    const rawDx = goal.x - release.x;
    const rawDz = goal.z - release.z;
    const rawDist = Math.hypot(rawDx, rawDz);
    const targetX = rawDist > 0.06 ? goal.x + (rawDx / rawDist) * lead : goal.x;
    const targetZ = rawDist > 0.06 ? goal.z + (rawDz / rawDist) * lead : goal.z;
    const dx = targetX - release.x;
    const dz = targetZ - release.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.06) {
      return {
        target: goal.clone(),
        flight: 0.8,
        velocity: new THREE.Vector3(0, 4.4, 0),
      };
    }
    const rise = goal.y - release.y;
    const slopeAt = (t) => {
      const e = Math.exp(-AIR_DRAG * t);
      const f = 1 - e;
      return (
        (GRAVITY * f) / (AIR_DRAG * AIR_DRAG * e) -
        rise -
        (GRAVITY / AIR_DRAG) * t
      ) / dist;
    };

    // The slope curve falls and then rises again; take the last crossing so
    // the shot uses the high-arc (descending into the hoop) solution.
    let flight = null;
    let prev = slopeAt(0.2);
    for (let t = 0.22; t <= 5.0; t += 0.02) {
      const cur = slopeAt(t);
      if ((prev - entrySlope) * (cur - entrySlope) <= 0) flight = t;
      prev = cur;
    }
    if (flight == null) {
      flight = Math.sqrt(
        Math.max(0.09, (2 * (dist * entrySlope + rise)) / GRAVITY)
      );
    } else {
      let lo = Math.max(0.05, flight - 0.03);
      let hi = flight + 0.03;
      for (let i = 0; i < 32; i++) {
        const mid = (lo + hi) * 0.5;
        if (slopeAt(mid) < entrySlope) lo = mid;
        else hi = mid;
      }
      flight = (lo + hi) * 0.5;
    }

    const decay = Math.exp(-AIR_DRAG * flight);
    const flow = 1 - decay;
    const scale = AIR_DRAG / flow;
    return {
      target: new THREE.Vector3(targetX, goal.y, targetZ),
      flight,
      velocity: new THREE.Vector3(
        dx * scale,
        (rise + (GRAVITY / AIR_DRAG) * flight) * scale - GRAVITY / AIR_DRAG,
        dz * scale
      ),
    };
  };

  P.isFrontcourt = function (team, x) {
    return team === "blue" ? x > 0.12 : x < -0.12;
  };

  P.setPossession = function (team, shotClock = 24, frontcourt = false) {
    this.possession = team;
    this.shotClock = shotClock;
    this.frontcourt = !!frontcourt;
    this.backcourtTimer = frontcourt ? 0 : 8;
    this.backcourtWarned = false;
    this.lastPass = null;
  };

  P.resetGameplayState = function () {
    this.charge = null;
    this.inbounder = null;
    this.inboundReceiver = null;
    this.inboundReceiveSpot = null;
    this.inboundSpot = null;
    this.inboundTimer = 0;
    this.inboundPassed = false;
    this.inboundRequest = false;
    this.ft = null;
    this.deadTimer = 0;
    this.deadCallback = null;
    this.reboundActive = false;
    this.reboundShotTeam = null;
    this.lastShotTeam = null;
    this.lastShotInfo = null;
    this.lastPass = null;
    this.shotInAir = false;
    this.pendingShots = {};
    this.trickCooldowns = {};
    this.userStealCd = 0;
    this.userTrickCd = 0;
    this.userPassCd = 0;
    this.interceptIntent = 0;
    this.interceptTimer = 0;
    this.userJumpHadBall = false;
    this.travelPending = false;
    this.frontcourt = false;
    this.backcourtTimer = 8;
    this.backcourtWarned = false;
    this.defAssign = {};
    this.driveFoulCd = 0;
    this.outOfBoundsPending = false;
    this.outSpot = null;
    this.dribbleSoundTimer = 0;
    this.shotClock = 24;
    this.clockExpired = false;
    this.matchOver = false;
    this.quarterTimer = 0;
    this.quarterPending = null;
    this.nextQuarter = 1;
    this.ui.shotMeter.classList.add("is-hidden");
    this.ui.ftPanel.classList.add("is-hidden");
    this.ui.tipoffPrompt.classList.add("is-hidden");
    this.hideContext();
    for (const p of this.players) {
      p.shotPending = false;
      p.tipTapped = false;
      p.stunTimer = 0;
    }
  };

  P.handPoint = function (player, out) {
    out = out || new THREE.Vector3();
    const f = player.getForward(new THREE.Vector3());
    const up = player.jumpY > 0.12;
    out.set(
      player.root.position.x + f.x * 0.23,
      (up ? 2.16 : 1.46) + player.jumpY,
      player.root.position.z + f.z * 0.23
    );
    return out;
  };

  P.updatePendingShots = function (dt) {
    if (!this.pendingShots) this.pendingShots = {};
    for (const id in this.pendingShots) {
      this.pendingShots[id] -= dt;
      if (this.pendingShots[id] <= 0) {
        delete this.pendingShots[id];
        const p = this.playerById[id];
        if (p) p.shotPending = false;
      }
    }
  };

  P.clearShotPending = function () {
    this.pendingShots = {};
    for (const p of this.players) p.shotPending = false;
  };

  /* ============================================================
     TIPOFF
     ============================================================ */

  P.startTipoff = function () {
    this.resetGameplayState();
    this.state = "tipoff";
    this.tipTime = 0;
    this.tipDone = false;
    this.tipWinner = null;
    this.tipPlayerA = this.user;
    this.tipPlayerB = this.drake;
    this.clockExpired = false;
    this.backcourtTimer = 8;
    this.frontcourt = false;
    this.setPossession("blue", 24, false);
    this.shotClock = 24;

    const blueSpots = [
      [-0.95, 0],
      [-4.9, 3.9],
      [-5.3, -3.8],
      [-8.3, 1.7],
      [-8.9, -1.5],
    ];
    const redSpots = [
      [0.95, 0],
      [4.9, -3.9],
      [5.3, 3.8],
      [8.3, -1.7],
      [8.9, 1.5],
    ];
    this.teams.blue.forEach((p, i) => {
      const s = blueSpots[i] || blueSpots[blueSpots.length - 1];
      this.softResetPlayer(p, s[0], s[1], Math.PI / 2);
      p.lookTarget.set(0, 2.9, 0);
      p.targetFacing = Math.PI / 2;
    });
    this.teams.red.forEach((p, i) => {
      const s = redSpots[i] || redSpots[redSpots.length - 1];
      this.softResetPlayer(p, s[0], s[1], -Math.PI / 2);
      p.lookTarget.set(0, 2.9, 0);
      p.targetFacing = -Math.PI / 2;
    });

    this.ball.reset();
    this.ball.state = "dead";
    this.ball.mesh.visible = true;
    this.ball.shadow.visible = true;
    this.ball.mesh.position.set(0, 2.92, 0);
    this.ball.prev.copy(this.ball.mesh.position);
    this.ball.shadow.position.set(0, 0.024, 0);
    this.ball.lastTouch = null;

    for (const ai of this.ais) {
      ai.jumpCd = 0;
      ai.stealCd = 1 + Math.random();
      ai.trickCd = 1.5 + Math.random();
      ai.cutCd = 2 + Math.random() * 2;
      ai.inboundWait = 1;
      ai.spot.set(0, 0, 0);
      if (ai.cutTimer === undefined) ai.cutTimer = 0;
    }

    this.ui.tipoffPrompt.classList.remove("is-hidden");
    this.ui.shotMeter.classList.add("is-hidden");
    this.ui.ftPanel.classList.add("is-hidden");
    this.hideContext();
    this.feed("СПОРНЫЙ БРОСОК · ИГРА НАЧАЛАСЬ", "is-warn");
    this.updateScoreUI(true);
    if (this.arena) {
      this.arena.setBoard(0, 0, U.formatClock(this.gameClock), this.quarter, 24, true);
    }
  };

  P.updateTipoff = function (dt) {
    this.tipTime += dt;
    const ball = this.ball;
    const rise = Math.min(1, this.tipTime * 1.25);
    const y = 2.58 + rise * 0.42 + Math.sin(this.tipTime * 2.2) * 0.025;
    ball.mesh.position.set(0, y, 0);
    ball.shadow.visible = true;
    ball.shadow.position.set(0, 0.024, 0);
    ball.mesh.rotation.y += dt * 1.8;

    this.user.setInput(0, 0, false);
    this.user.lookTarget.copy(ball.mesh.position);
    this.user.targetFacing = Math.atan2(-this.user.root.position.x, -this.user.root.position.z);
    this.drake.lookTarget.copy(ball.mesh.position);
    this.drake.targetFacing = Math.atan2(-this.drake.root.position.x, -this.drake.root.position.z);

    for (const ai of this.ais) ai.update(dt);
    for (const p of this.players) p.update(dt, this.elapsed, this);

    if (this.tipDone) return;
    for (const p of [this.user, this.drake]) {
      if (p.jumpY > 0.16 && !p.tipTapped && this.tipReach(p)) {
        p.tipTapped = true;
        this.resolveTipoff(p);
        return;
      }
    }
    if (this.tipTime > 2.85) {
      this.tipDone = true;
      this.state = "live";
      this.ball.state = "loose";
      this.ball.prev.copy(this.ball.mesh.position);
      this.ball.vel.set(U.rand(-0.9, 0.9), -0.5, U.rand(-0.9, 0.9));
      this.ball.mesh.visible = true;
      this.ball.shadow.visible = true;
      this.ui.tipoffPrompt.classList.add("is-hidden");
      this.showBanner("МЯЧ ЖИВОЙ", "никто не дотянулся", "is-warn", 1.6);
      this.feed("СПОРНЫЙ БРОСОК · БЕЗ КОНТРОЛЯ", "");
      this.setPossession("blue", 24, false);
    }
  };

  P.tipReach = function (p) {
    const b = this.ball.mesh.position;
    const hd = Math.hypot(p.root.position.x - b.x, p.root.position.z - b.z);
    return hd < 1.3 && b.y < p.getReachY() + 0.38 && b.y > 1.85;
  };

  P.resolveTipoff = function (winner) {
    this.tipDone = true;
    this.tipWinner = winner;
    this.state = "live";
    this.setPossession(winner.team, 24, false);
    this.backcourtTimer = 8;
    this.frontcourt = false;
    const mate = this.bestPassTarget(winner) || this.teammateOf(winner);
    if (mate) {
      const target = mate.getChest(new THREE.Vector3());
      target.y += 0.3;
      const from = this.ball.mesh.position.clone();
      const dist = Math.hypot(target.x - from.x, target.z - from.z);
      const flight = U.clamp(0.4 + dist * 0.055, 0.5, 0.95);
      const vel = this.ballisticVel(from, target, flight);
      this.ball.passTo(winner, mate, target, vel, { assistCandidate: false, tip: true });
      this.ball.mesh.visible = true;
      this.ball.shadow.visible = true;
    }
    winner.playAction("block", 0.55);
    this.ui.tipoffPrompt.classList.add("is-hidden");
    this.showBanner(
      winner.isUser ? "СПОРНЫЙ ЗА ВАМИ" : "СПОРНЫЙ У СОПЕРНИКА",
      teamLabel(winner.team),
      winner.isUser ? "is-good" : "is-bad",
      1.8
    );
    this.feed(`СПОРНЫЙ БРОСОК · ${winner.name.toUpperCase()}`, winner.isUser ? "is-score" : "is-warn");
    this.audio.cheer(0.6, 1.4);
    this.updateScoreUI(true);
  };

  /* ============================================================
     SHOOTING
     ============================================================ */

  /* The green release window is intentionally narrow and gets narrower
     as the shot gets longer. Hitting it is rewarded by make chance, not
     by widening the bar. */
  P.greenWindowFor = function (player, opts = {}) {
    const hoop = this.hoopFor(player.team);
    const dist = Math.hypot(player.root.position.x - hoop.x, player.root.position.z - hoop.z);
    const t = U.clamp((dist - 2.2) / 6.5, 0, 1);
    let width = opts.freeThrow ? 0.085 : U.lerp(0.08, 0.034, t);
    if (!opts.freeThrow && dist > C.threeRadius) width *= 0.8;
    const diffScale = this.difficulty === "rookie" ? 1.22 : this.difficulty === "legend" ? 0.8 : 1;
    width *= diffScale;
    const center = opts.freeThrow ? 0.64 : 0.66;
    const min = U.clamp(center - width * 0.5, 0.03, 0.95);
    const max = U.clamp(center + width * 0.5, min + 0.012, 0.97);
    return { min, max, width: max - min, center };
  };

  P.isGreenTiming = function (power, window) {
    const w = window || this.greenWindowFor(this.user);
    return power >= w.min && power <= w.max;
  };

  P.timingQuality = function (power, window) {
    const w = window || this.greenWindowFor(this.user);
    if (power >= w.min && power <= w.max) return 1;
    const d = power < w.min ? w.min - power : power - w.max;
    // One window width outside the green zone is already a mediocre
    // release; two widths out it is a brick.
    const span = Math.max(0.012, w.width * 2.4);
    return U.clamp(1 - d / span, 0.04, 1);
  };

  P.evaluateShot = function (player, power, opts = {}) {
    const hoop = this.hoopFor(player.team);
    const px = player.root.position.x;
    const pz = player.root.position.z;
    const dist = Math.hypot(px - hoop.x, pz - hoop.z);
    const three = dist > C.threeRadius - 0.05;
    let type = opts.type;
    if (!type) type = dist < 1.55 ? "dunk" : dist < 3.35 ? "layup" : "jump";
    if (opts.freeThrow) type = "freeThrow";

    const window = this.greenWindowFor(player, { freeThrow: type === "freeThrow" });
    const green = opts.aiQuality == null && this.isGreenTiming(power, window);
    const timing = opts.aiQuality != null ? 1 : this.timingQuality(power, window);
    let q;
    if (opts.aiQuality != null) {
      q = opts.aiQuality;
    } else {
      const base =
        type === "dunk" ? 0.92 :
        type === "layup" ? 0.78 :
        three ? player.ratings.three : player.ratings.shoot;
      q = base * (0.62 + 0.44 * timing);
    }
    q *= 0.9 + 0.1 * U.clamp(player.stamina / 100, 0, 1);
    if (player.speed > 2.0) q -= type === "jump" ? 0.05 : 0.02;

    let contest = 0;
    if (type !== "freeThrow") {
      for (const d of this.opponentsOf(player)) {
        const dd = Math.hypot(d.root.position.x - px, d.root.position.z - pz);
        if (dd < 2.7) {
          const close = (2.7 - dd) / 2.7;
          const air = d.jumpY > 0.22 ? 1.35 : 0.85;
          contest += close * air * (0.05 + d.ratings.block * 0.08);
        }
      }
      q -= U.clamp(contest, 0, 0.3);
    }
    if (this.state === "live" && this.shotClock < 3.2) q -= 0.02;
    q = U.clamp(q, 0.04, 0.985);

    const points = type === "freeThrow" ? 1 : three ? 3 : 2;
    // Base make chance is deliberately conservative. A normal release is
    // supposed to miss regularly; only a green release earns a big boost.
    const range = U.clamp((dist - 2.4) / 7.5, 0, 1);
    let chance;
    if (type === "dunk") chance = 0.84 - contest * 0.85;
    else if (type === "layup") chance = 0.12 + q * 0.58;
    else if (type === "freeThrow") chance = 0.16 + q * 0.64;
    else chance = 0.05 + q * 0.48 - range * 0.06;
    // A release outside the green window is a bad release: the further
    // the timing is from the window, the closer the make chance gets to
    // zero. Close attempts forgive the timing more than jumpers.
    if (!green && opts.aiQuality == null && timing < 1) {
      let factor;
      if (type === "dunk") factor = 0.35 + 0.65 * timing;
      else if (type === "layup") factor = 0.12 + 0.88 * Math.pow(timing, 2.2);
      else factor = 0.05 + 0.95 * Math.pow(timing, 3.6);
      chance *= factor;
    }
    // Green release is the reward: the bar stays small, but the shot
    // gets a much bigger make chance (contests still matter). The reward
    // also falls with distance, so deep greens are not automatic.
    if (green) {
      let floor;
      if (type === "dunk") floor = 0.88;
      else if (type === "layup") floor = 0.72;
      else if (type === "freeThrow") floor = 0.8;
      else floor = 0.64 - range * 0.16;
      chance = Math.max(chance, floor - contest * 0.4) + 0.015;
    }
    chance = U.clamp(chance, 0.02, 0.92);

    return { hoop, dist, three, type, quality: q, points, makeChance: chance, contest, green };
  };

  P.launchShot = function (player, info, opts = {}) {
    if (!player.hasBall || this.ball.holder !== player) return false;
    const ball = this.ball;
    const release = player.getReleasePoint(new THREE.Vector3());
    release.y += 0.03;
    ball.mesh.position.copy(release);
    ball.prev.copy(release);
    ball.mesh.visible = true;
    ball.shadow.visible = true;

    const hoop = info.hoop;
    // Where the descending arc should cross rim height. Makes aim at the
    // middle of the cylinder; misses aim outside the iron.
    const goal = new THREE.Vector3(hoop.x, C.rimY, hoop.z);
    const make = Math.random() < info.makeChance;
    if (make) {
      goal.x += U.rand(-0.018, 0.018);
      goal.z += U.rand(-0.018, 0.018);
    } else {
      const ang = Math.random() * Math.PI * 2;
      const off = C.rimRadius * 0.85 + U.rand(0.12, 0.44);
      goal.x += Math.cos(ang) * off;
      goal.z += Math.sin(ang) * off;
      if (Math.random() < 0.35) goal.x -= Math.sign(hoop.x) * U.rand(0.08, 0.38);
    }

    const arc =
      info.type === "dunk"
        ? this.arcShot(release, goal, { entrySlope: 1.5 })
        : info.type === "layup"
        ? this.arcShot(release, goal, { entrySlope: 1.25 })
        : info.type === "freeThrow"
        ? this.arcShot(release, goal, { entrySlope: 1.05 })
        : this.arcShot(release, goal, { entrySlope: 1.1 });
    ball.vel.copy(arc.velocity);
    ball.shoot(player, arc.target, {
      points: info.points,
      freeThrow: !!opts.freeThrow,
      dunk: info.type === "dunk",
      layup: info.type === "layup",
      quality: info.quality,
      green: !!info.green,
      make: make,
    });

    if (info.type === "dunk") {
      if (player.grounded) player.doJump(1);
      player.playAction("dunk", 0.85);
    } else if (info.type === "layup") {
      if (player.grounded) player.doJump(0.65);
      player.playAction("layup", 0.72);
    } else if (info.type === "freeThrow") {
      player.playAction("freeThrow", 0.9);
    } else {
      player.playAction("shoot", 0.55);
    }

    player.shotPending = true;
    this.pendingShots[player.id] = 0.72;
    if (!opts.freeThrow) {
      this.stats[player.id].fga++;
      if (info.points === 3) this.stats[player.id].tpa++;
    }
    this.shotInAir = true;
    this.lastShotTeam = player.team;
    this.lastShotInfo = info;
    this.reboundActive = false;
    this.charge = null;
    if (player === this.user) this.userJumpHadBall = false;
    return true;
  };

  /* AI jumpers leave the hand instantly, so the old aiContest check could
     never see the shooter still holding the ball. Roll the contact on the
     gather instead: a nearby defender can bump the shooter into free throws. */
  P.aiShootingFoul = function (shooter) {
    if (!shooter || shooter.isUser || this.state !== "live") return false;
    let best = null;
    let bestD = 1.35;
    for (const d of this.opponentsOf(shooter)) {
      if (d.stunned > 0.2) continue;
      const dd = U.dist2D(d.root.position, shooter.root.position);
      if (dd < bestD) {
        bestD = dd;
        best = d;
      }
    }
    if (!best) return false;
    const base =
      this.difficulty === "legend" ? 0.24 : this.difficulty === "rookie" ? 0.34 : 0.29;
    const chance = U.clamp(base + best.ratings.defense * 0.12, 0.2, 0.45);
    if (Math.random() >= chance) return false;
    this.commitFoul(best, shooter, {
      shooting: true,
      ftCount: this.foulShotCount(shooter),
    });
    return true;
  };

  P.aiShoot = function (player, quality) {
    if (this.state !== "live" || !player.hasBall || this.ball.holder !== player) return false;
    if (player.isBusy() || player.shotPending) return false;
    // Do not let the AI settle for a heave from its own backcourt while the
    // shot clock is still comfortable; only bail out when time is expiring.
    const hoop = this.hoopFor(player.team);
    const shotDist = Math.hypot(player.root.position.x - hoop.x, player.root.position.z - hoop.z);
    if (shotDist > 11.5 && this.shotClock > 3.2) return false;
    if (this.aiShootingFoul(player)) return true;
    const info = this.evaluateShot(player, 0.72, { aiQuality: quality });
    return this.launchShot(player, info);
  };

  P.onShootKeyDown = function () {
    if (this.paused || this.state === "menu" || this.state === "quarter" || this.state === "gameover") return;
    if (this.state === "freethrow") {
      if (this.ft && this.ft.shooter === this.user && this.ft.phase === "ready" && !(this.charge && this.charge.active)) {
        this.charge = { owner: this.user, active: true, power: 0, freeThrow: true, duration: 1.12 };
        this.user.playAction("charge", 30, { loop: true });
        this.audio.ui();
      }
      return;
    }
    if (this.state !== "live") return;
    const p = this.user;
    if (!p.hasBall || this.ball.holder !== p) return;
    if (p.isBusy()) return;
    if (this.charge && this.charge.active) return;
    this.charge = { owner: p, active: true, power: 0, freeThrow: false, duration: 1.2 };
    p.playAction("charge", 30, { loop: true });
    this.audio.ui();
  };

  P.onShootKeyUp = function () {
    const ch = this.charge;
    if (!ch || !ch.active) return;
    if (ch.freeThrow) {
      if (this.state !== "freethrow" || !this.ft || this.ft.shooter !== this.user || this.ft.phase !== "ready") {
        this.cancelCharge();
        return;
      }
      const quality = 0.3 + 0.7 * this.timingQuality(
        ch.power,
        this.greenWindowFor(this.user, { freeThrow: true })
      );
      this.charge = null;
      this.launchFreeThrow(this.user, quality);
      return;
    }
    if (this.state !== "live" || !this.user.hasBall) {
      this.cancelCharge();
      return;
    }
    const info = this.evaluateShot(this.user, ch.power);
    this.charge = null;
    if (this.user.action && this.user.action.type === "charge") this.user.cancelAction();
    this.launchShot(this.user, info);
  };

  P.cancelCharge = function () {
    this.charge = null;
    if (this.user.action && this.user.action.type === "charge") this.user.cancelAction();
  };

  P.updateCharge = function (dt) {
    const ch = this.charge;
    if (!ch || !ch.active) return;
    ch.power = U.clamp(ch.power + dt / (ch.duration || 1.05), 0, 1);
    if (!ch.freeThrow && (!this.user.hasBall || this.ball.holder !== this.user)) {
      this.cancelCharge();
    }
  };

  /* ============================================================
     INPUT / PLAYER MOVEMENT
     ============================================================ */

  P.applyUserInput = function (dt) {
    const p = this.user;
    if (!p || p.stunned > 0) {
      if (p) p.setInput(0, 0, false);
      return;
    }
    const k = this.keys;
    let mx = 0, mz = 0;
    if (k.has("KeyW") || k.has("ArrowUp")) mz += 1;
    if (k.has("KeyS") || k.has("ArrowDown")) mz -= 1;
    if (k.has("KeyD") || k.has("ArrowRight")) mx += 1;
    if (k.has("KeyA") || k.has("ArrowLeft")) mx -= 1;
    if (mx === 0 && mz === 0) {
      p.setInput(0, 0, false);
      return;
    }
    const fwd = new THREE.Vector3();
    this.camera.getWorldDirection(fwd);
    fwd.y = 0;
    if (fwd.lengthSq() < 0.0001) fwd.set(0, 0, -1);
    else fwd.normalize();
    const right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0)).normalize();
    const wx = fwd.x * mz + right.x * mx;
    const wz = fwd.z * mz + right.z * mx;
    const len = Math.hypot(wx, wz) || 1;
    p.setInput(wx / len, wz / len, k.has("ShiftLeft") || k.has("ShiftRight"));
  };

  P.clampToCourt = function (p) {
    if (this.state === "inbound" && p === this.inbounder) return;
    const m = 0.38;
    p.root.position.x = U.clamp(p.root.position.x, -C.halfL + m, C.halfL - m);
    p.root.position.z = U.clamp(p.root.position.z, -C.halfW + m, C.halfW - m);
  };

  P.resolvePlayerCollisions = function () {
    const arr = this.players;
    for (let i = 0; i < arr.length; i++) {
      for (let j = i + 1; j < arr.length; j++) {
        const a = arr[i], b = arr[j];
        if (a.jumpY > 1.15 && b.jumpY > 1.15) continue;
        let dx = b.root.position.x - a.root.position.x;
        let dz = b.root.position.z - a.root.position.z;
        const d = Math.hypot(dx, dz);
        const min = 0.66;
        if (d > 0.0001 && d < min) {
          const push = (min - d) * 0.5;
          dx /= d;
          dz /= d;
          a.root.position.x -= dx * push;
          a.root.position.z -= dz * push;
          b.root.position.x += dx * push;
          b.root.position.z += dz * push;
        }
      }
    }
    for (const p of arr) this.clampToCourt(p);
  };

  P.updateDribbleAudio = function (dt) {
    this.dribbleSoundTimer = (this.dribbleSoundTimer || 0) - dt;
    const b = this.ball;
    const holder = b.holder;
    if (b.state !== "held" || !holder || !holder.grounded) return;
    const act = holder.action && holder.action.type;
    if (act && ["charge", "shoot", "freeThrow", "pass", "inbound", "dunk", "layup"].includes(act)) return;
    if (this.dribbleSoundTimer <= 0 && Math.abs(Math.sin(holder.dribblePhase)) < 0.17) {
      this.audio.dribble(0.6);
      this.dribbleSoundTimer = 0.17;
    }
  };

  P.checkTravel = function () {
    if (!this.userJumpHadBall) return;
    if (!this.user.hasBall) {
      this.userJumpHadBall = false;
      return;
    }
    if (this.user.grounded && this.user.jumpY <= 0.002) {
      this.userJumpHadBall = false;
      this.travelViolation();
    }
  };

  P.travelViolation = function () {
    if (this.state !== "live") return;
    this.audio.whistle(false);
    this.audio.ooh(0.6);
    this.stats[this.user.id].to++;
    this.feed("ПРОБЕЖКА · " + this.user.name, "is-warn");
    this.showBanner("ПРОБЕЖКА", "мяч сопернику", "is-warn", 1.4);
    this.user.setInput(0, 0, false);
    this.ball.reset();
    this.beginDead(0.85, () => {
      if (this.clockExpired) this.endQuarter();
      else this.startInbound(otherTeam(this.user.team), this.nearestInboundSpot(this.user.root.position));
    });
  };

  /* ============================================================
     CLOCKS / LIVE LOOP
     ============================================================ */

  P.updateGameClocks = function (dt) {
    this.updateActionTimers(dt);
    if (this.gameClock > 0) {
      this.gameClock = Math.max(0, this.gameClock - dt);
      if (this.gameClock <= 0) this.clockExpired = true;
    }
    const controlled = this.ball.state === "held" || this.ball.state === "pass";
    if (!this.clockExpired && controlled) {
      this.shotClock = Math.max(0, this.shotClock - dt);
      if (this.shotClock <= 0) {
        this.shotClockViolation();
        return;
      }
    }
    if (!this.clockExpired && !this.frontcourt && this.backcourtTimer > 0 && controlled) {
      this.backcourtTimer = Math.max(0, this.backcourtTimer - dt);
      const bx = this.ball.mesh.position.x;
      if (this.isFrontcourt(this.possession, bx)) {
        this.frontcourt = true;
        this.backcourtTimer = 0;
        this.backcourtWarned = false;
      } else {
        if (this.backcourtTimer <= 2.4 && !this.backcourtWarned) {
          this.backcourtWarned = true;
          this.feed("8 СЕКУНД · НАДО ПЕРЕЙТИ ЦЕНТР", "is-warn");
        }
        if (this.backcourtTimer <= 0) {
          this.backcourtViolation();
        }
      }
    }
  };

  P.shotClockViolation = function () {
    if (this.state !== "live") return;
    const team = this.possession;
    const holder = this.ball.holder;
    this.stats[holder ? holder.id : ""] && holder && this.stats[holder.id].to++;
    this.audio.whistle(false);
    this.audio.ooh(0.7);
    this.feed("НАРУШЕНИЕ · 24 СЕКУНДЫ", "is-warn");
    this.showBanner("24 СЕКУНДЫ", teamLabel(team) + " теряет мяч", "is-warn", 1.5);
    this.ball.reset();
    this.cancelCharge();
    this.clearShotPending();
    this.beginDead(0.9, () => {
      if (this.clockExpired) this.endQuarter();
      else this.startInbound(otherTeam(team), this.nearestInboundSpot(this.ball.mesh.position));
    });
  };

  P.backcourtViolation = function () {
    if (this.state !== "live") return;
    const team = this.possession;
    const holder = this.ball.holder;
    if (holder) this.stats[holder.id].to++;
    this.audio.whistle(false);
    this.audio.ooh(0.7);
    this.feed("НАРУШЕНИЕ · 8 СЕКУНД", "is-warn");
    this.showBanner("8 СЕКУНД", "не перешли центр", "is-warn", 1.5);
    this.ball.reset();
    this.cancelCharge();
    this.clearShotPending();
    this.beginDead(0.9, () => {
      if (this.clockExpired) this.endQuarter();
      else this.startInbound(otherTeam(team), { x: 0, z: C.halfW + 0.6 });
    });
  };

  P.updateLive = function (dt) {
    this.updateGameClocks(dt);
    if (this.state !== "live") return;

    this.applyUserInput(dt);
    this.updateDefensiveAssignments();
    for (const ai of this.ais) ai.update(dt);
    for (const p of this.players) p.update(dt, this.elapsed, this);

    this.resolvePlayerCollisions();
    this.checkDriveFouls(dt);
    if (this.state !== "live") return;
    this.updatePendingShots(dt);
    this.updateCharge(dt);

    this.ball.update(dt, this);
    if (this.state !== "live") return;

    this.checkShotOutcome();
    this.updateBallContact(dt);
    if (this.state !== "live") return;

    this.updateDribbleAudio(dt);
    this.checkTravel();
    if (this.state !== "live") return;

    if (this.gameClock <= 0 && this.ball.state !== "shot") {
      this.endQuarter();
    }
  };

  /* ============================================================
     BALL CONTACT / SCORING
     ============================================================ */

  P.updateActionTimers = function (dt) {
    this.userStealCd = Math.max(0, (this.userStealCd || 0) - dt);
    this.userTrickCd = Math.max(0, (this.userTrickCd || 0) - dt);
    this.userPassCd = Math.max(0, (this.userPassCd || 0) - dt);
    if (this.interceptTimer > 0) {
      this.interceptTimer -= dt;
      if (this.interceptTimer <= 0) this.interceptIntent = 0;
    }
    if (this.trickCooldowns) {
      for (const id in this.trickCooldowns) {
        this.trickCooldowns[id] -= dt;
        if (this.trickCooldowns[id] <= 0) delete this.trickCooldowns[id];
      }
    }
  };

  P.checkShotOutcome = function () {
    if (!this.shotInAir) return;
    if (this.ball.state === "held") {
      this.shotInAir = false;
      this.reboundActive = false;
      this.lastShotInfo = null;
    } else if (this.ball.state === "loose") {
      this.shotInAir = false;
      this.reboundActive = true;
      this.reboundShotTeam = this.lastShotTeam || this.possession;
      this.lastShotInfo = null;
    }
  };

  P.updateBallContact = function (dt) {
    if (this.state !== "live") return;
    const b = this.ball;
    if (b.state === "pass") {
      this.resolvePass(dt);
      return;
    }
    if (b.state === "shot") {
      this.updateShotFlight(dt);
      if (b.state === "shot" && b.shot && b.shot.rimHit && b.vel.y < 0.9) {
        this.tryLoosePickup(dt, true);
      }
      return;
    }
    if (b.state === "loose") {
      this.tryLoosePickup(dt, false);
    }
  };

  P.resolvePass = function (dt) {
    const b = this.ball;
    const pass = b.pass;
    if (!pass || b.state !== "pass") return;
    const bp = b.mesh.position;
    const recv = pass.receiver;
    if (recv && recv.stunned <= 0) {
      const hd = Math.hypot(recv.root.position.x - bp.x, recv.root.position.z - bp.z);
      const hand = this.handPoint(recv);
      const dy = Math.abs(hand.y - bp.y);
      const rad = pass.inbound ? 1.2 : 1.16;
      if (hd < rad && dy < 1.4) {
        this.catchPass(pass, recv, false);
        return;
      }
    }
    for (const d of this.opponentsOf(pass.passer)) {
      if (!d || d.stunned > 0.5) continue;
      const hd = Math.hypot(d.root.position.x - bp.x, d.root.position.z - bp.z);
      let rad = pass.inbound ? 0.9 : 0.78;
      if (d.isUser && this.interceptIntent > 0) rad += 0.55;
      if (d.action && (d.action.type === "block" || d.action.type === "steal")) rad += 0.18;
      const hand = this.handPoint(d);
      const dy = Math.abs(hand.y - bp.y);
      if (hd < rad && dy < 1.45) {
        this.catchPass(pass, d, true);
        return;
      }
    }
  };

  P.catchPass = function (pass, player, intercepted) {
    if (!pass || this.ball.state !== "pass") return;
    const passer = pass.passer;
    const wasInbound = !!pass.inbound;
    this.ball.giveTo(player);
    player.playAction("receive", 0.28);
    this.audio.catchBall();

    if (intercepted) {
      this.stats[player.id].stl++;
      if (passer) this.stats[passer.id].to++;
      const fc = this.isFrontcourt(player.team, this.ball.mesh.position.x);
      this.setPossession(player.team, 24, fc);
      this.audio.steal();
      this.showBanner(
        wasInbound ? "ПЕРЕХВАТ ВБРАСЫВАНИЯ" : "ПЕРЕХВАТ",
        player.name.toUpperCase(),
        player.team === "blue" ? "is-good" : "is-bad",
        1.6
      );
      this.feed(
        (wasInbound ? "ПЕРЕХВАТ ВБРАСЫВАНИЯ · " : "ПЕРЕХВАТ · ") + player.name,
        player.team === "blue" ? "is-score" : "is-warn"
      );
      this.addShake(0.06);
    } else {
      const fc = this.isFrontcourt(player.team, this.ball.mesh.position.x);
      if (player.team !== this.possession) this.setPossession(player.team, 24, fc);
      if (pass.assistCandidate && passer && passer.team === player.team) {
        this.lastPass = { passer: passer, receiver: player, time: this.elapsed };
      } else {
        this.lastPass = null;
      }
    }

    this.charge = null;
    this.interceptIntent = 0;
    this.interceptTimer = 0;
    this.clearShotPending();
    if (wasInbound) this.endInbound();
  };

  P.tryLoosePickup = function (dt, rimRebound) {
    const b = this.ball;
    const bp = b.mesh.position;
    if (!b.mesh.visible) return;
    if (rimRebound) {
      if (!(b.state === "shot" && b.shot && b.shot.rimHit)) return;
    } else if (b.state !== "loose") {
      return;
    }
    let best = null;
    let bestD = 99;
    for (const p of this.players) {
      if (p.stunned > 0.4) continue;
      const hd = Math.hypot(p.root.position.x - bp.x, p.root.position.z - bp.z);
      const reach = p.getReachY() + 0.18;
      if (hd < 0.84 && bp.y <= reach && bp.y > 0.01 && hd < bestD) {
        best = p;
        bestD = hd;
      }
    }
    if (!best) return;

    const wasShot = this.shotInAir || this.reboundActive || (rimRebound && b.state === "shot");
    const shotTeam = this.lastShotTeam || this.possession;
    this.ball.giveTo(best);
    best.playAction("receive", 0.25);
    this.audio.catchBall();

    if (wasShot) {
      this.stats[best.id].reb++;
      this.reboundActive = false;
      this.lastShotInfo = null;
      this.shotInAir = false;
      const off = best.team === shotTeam;
      const fc = this.isFrontcourt(best.team, this.ball.mesh.position.x);
      this.setPossession(best.team, off ? 14 : 24, fc);
      this.feed(
        "ПОДБОР · " + best.name + (off ? " · АТАКА" : ""),
        best.isUser ? "is-score" : ""
      );
    } else {
      if (best.team !== this.possession) {
        const fc = this.isFrontcourt(best.team, this.ball.mesh.position.x);
        this.setPossession(best.team, 24, fc);
      }
      this.feed("МЯЧ У " + best.name, best.isUser ? "is-score" : "");
    }
    this.lastPass = null;
    this.charge = null;
    this.interceptIntent = 0;
    this.clearShotPending();
    if (this.state === "inbound") this.endInbound();
  };

  P.updateShotFlight = function () {
    const b = this.ball;
    if (b.state !== "shot" || !b.shot) return;
    const bp = b.mesh.position;
    for (const d of this.players) {
      if (b.state !== "shot" || !b.shot) return;
      if (d === b.shot.shooter) continue;
      if (d.team === b.shot.team) continue;
      if (d.stunned > 0.5 || d.jumpY < 0.14) continue;
      if (d.blockedShot === b.shot) continue;
      const hand = this.handPoint(d);
      const dist = Math.hypot(hand.x - bp.x, hand.y - bp.y, hand.z - bp.z);
      if (dist < 0.78) {
        d.blockedShot = b.shot;
        const chance = U.clamp(0.04 + d.ratings.block * 0.26 + (d.jumpY > 0.42 ? 0.04 : 0), 0.06, 0.36);
        if (Math.random() < chance) {
          this.performBlock(d, b.shot);
        } else {
          d.playAction("block", 0.3);
        }
      }
    }
  };

  P.performBlock = function (defender, shot) {
    const b = this.ball;
    if (!shot || !shot.shooter || b.state !== "shot" || shot.blocker) return false;
    const shotTeam = shot.team;
    const hoopX = shotTeam === "blue" ? C.rimX : -C.rimX;
    const away = Math.sign(b.mesh.position.x - hoopX) || -Math.sign(hoopX);
    const vx = away * U.rand(1.4, 4.2) + U.rand(-1.2, 1.2);
    const vy = U.rand(0.6, 2.8);
    const vz = U.rand(-2.8, 2.8);

    this.stats[defender.id].blk++;
    this.shotInAir = false;
    this.reboundActive = true;
    this.reboundShotTeam = shotTeam;
    this.lastShotInfo = null;
    this.ball.drop(defender, vx, vy, vz);
    this.ball.lastTouch = defender;
    this.audio.block();
    this.addShake(0.09);
    this.showBanner(
      "БЛОК",
      defender.shortName.toUpperCase() + " · " + teamLabel(defender.team),
      defender.team === "blue" ? "is-good" : "is-bad",
      1.5
    );
    this.feed("БЛОК · " + defender.name, defender.team === "blue" ? "is-score" : "is-warn");
    return true;
  };

  P.addBasket = function (scorer, team, points, opts = {}) {
    const st = this.stats[scorer.id];
    if (!st) return;
    st.pts += points;
    if (opts.freeThrow) {
      st.ftm++;
    } else if (!opts.loose) {
      st.fgm++;
      if (points === 3) st.tpm++;
    }
    this.scores[team] += points;
    this.updateScoreUI(true);
  };

  P.onHoopScore = function (hoop, ball) {
    if (!["live", "inbound", "freethrow"].includes(this.state)) return;
    const hoopTeam = hoop.side > 0 ? "blue" : "red";
    const shot = ball.shot;
    let scorer = null;
    let team = null;
    let points = 2;
    let freeThrow = false;
    let isThree = false;
    let isDunk = false;
    let isLayup = false;
    let loose = false;

    if (shot) {
      scorer = shot.shooter;
      team = shot.team;
      freeThrow = !!shot.freeThrow;
      points = freeThrow ? 1 : shot.points;
      isThree = points === 3;
      isDunk = !!shot.dunk;
      isLayup = !!shot.layup;
      if (team !== hoopTeam) {
        this.audio.ooh(0.8);
        this.feed("СВОЁ КОЛЬЦО · ОЧКИ НЕ НАЧИСЛЕНЫ", "is-warn");
        this.showBanner("СВОЁ КОЛЬЦО", "очки не начислены", "is-warn", 1.5);
        ball.state = "loose";
        ball.shot = null;
        ball.vel.set(0, -1.6, 0.2);
        this.shotInAir = false;
        this.reboundActive = true;
        this.reboundShotTeam = team;
        this.clearShotPending();
        return;
      }
    } else {
      const last = ball.lastTouch;
      if (!last || last.team !== hoopTeam) {
        ball.scored = true;
        this.audio.ooh(0.5);
        this.feed("МЯЧ В КОЛЬЦЕ · БЕЗ ОЧКОВ", "is-warn");
        return;
      }
      scorer = last;
      team = last.team;
      points = 2;
      loose = true;
    }

    const hoopObj = this.arena.hoops[hoop.side > 0 ? 0 : 1];
    if (hoopObj) this.arena.rimHit(hoopObj, 1.1);

    if (freeThrow) {
      this.addBasket(scorer, team, 1, { freeThrow: true });
      ball.state = "loose";
      ball.shot = null;
      ball.vel.set(0, -1.3, 0.1);
      this.shotInAir = false;
      this.reboundActive = false;
      this.lastShotInfo = null;
      this.audio.swish();
      this.audio.cheer(0.7, 1.4);
      this.clearShotPending();
      if (this.ft) {
        this.handleFreeThrowResult(true);
      } else {
        const side = hoopTeam === "blue" ? 1 : -1;
        this.beginDead(0.9, () => {
          if (this.clockExpired) this.endQuarter();
          else this.startInbound(otherTeam(team), { x: side * (C.halfL + 0.55), z: 0 });
        });
      }
      return;
    }

    this.addBasket(scorer, team, points, { loose: loose });
    if (this.lastPass && this.lastPass.passer && this.lastPass.passer !== scorer) {
      if (this.lastPass.passer.team === team && this.elapsed - this.lastPass.time < 6) {
        this.stats[this.lastPass.passer.id].ast++;
        this.feed("АССИСТ · " + this.lastPass.passer.name, "is-score");
      }
    }
    this.lastPass = null;

    if (isDunk) {
      if (this.audio.dunk) this.audio.dunk();
      this.showBanner("ДАНК", scorer.shortName.toUpperCase() + " · " + teamLabel(team), "is-good", 1.8);
      this.addShake(0.16);
    } else if (isThree) {
      this.showBanner("ТРЁХОЧКОВЫЙ", teamLabel(team) + " · +3", "is-good", 1.8);
    } else if (isLayup) {
      this.showBanner("ЛЭЙ-АП", teamLabel(team) + " · +2", "is-good", 1.6);
    } else {
      this.showBanner("ОЧКИ", scorer.shortName.toUpperCase() + " · +" + points, "is-good", 1.6);
    }
    this.audio.swish();
    this.audio.scoreStinger(isThree);
    this.arena.crowdCheer(isThree ? 1.2 : 0.9, 2.6);
    this.flash();
    this.addShake(isThree ? 0.12 : 0.07);
    this.feed(
      (isThree ? "ТРЁХОЧКОВЫЙ · " : isDunk ? "ДАНК · " : "ОЧКИ · ") + scorer.name + " +" + points,
      team === "blue" ? "is-score" : "is-warn"
    );

    ball.state = "loose";
    ball.shot = null;
    ball.vel.set(0, -1.2, 0.1);
    this.shotInAir = false;
    this.reboundActive = false;
    this.lastShotInfo = null;
    this.shotClock = 24;
    this.clearShotPending();
    this.updateScoreUI(true);

    const side = hoopTeam === "blue" ? 1 : -1;
    this.beginDead(1.2, () => {
      if (this.clockExpired) this.endQuarter();
      else this.startInbound(otherTeam(team), { x: side * (C.halfL + 0.55), z: U.rand(-2.4, 2.4) });
    });
  };

  P.nearestInboundSpot = function (point) {
    const x = point ? point.x : 0;
    const z = point ? point.z : 0;
    const dx = C.halfL - Math.abs(x);
    const dz = C.halfW - Math.abs(z);
    if (dz <= dx) {
      return { x: U.clamp(x, -12.4, 12.4), z: Math.sign(z || 1) * (C.halfW + 0.55) };
    }
    return { x: Math.sign(x || 1) * (C.halfL + 0.55), z: U.clamp(z, -5.4, 5.4) };
  };

  P.checkBallBounds = function (ball) {
    if (!ball || !ball.mesh || !ball.mesh.visible) return;
    if (!["live", "inbound", "freethrow"].includes(this.state)) return;
    if (this.outOfBoundsPending) return;
    const p = ball.mesh.position;
    // An inbound pass starts outside the sideline/baseline. Do not whistle
    // it out before it has actually crossed into the court.
    if (ball.pass && ball.pass.inbound && !ball.pass.enteredCourt) {
      if (Math.abs(p.x) <= C.halfL - 0.05 && Math.abs(p.z) <= C.halfW - 0.05) {
        ball.pass.enteredCourt = true;
      } else {
        return;
      }
    }
    const overX = Math.abs(p.x) - C.halfL;
    const overZ = Math.abs(p.z) - C.halfW;
    const out =
      (overX > 0.22 || overZ > 0.22) &&
      (p.y < C.rimY + 1.1 || overX > 3.5 || overZ > 1.8);
    if (!out) return;

    let spot;
    if (overX > overZ) {
      spot = { x: Math.sign(p.x) * (C.halfL + 0.55), z: U.clamp(p.z, -5.4, 5.4) };
    } else {
      spot = { x: U.clamp(p.x, -12.4, 12.4), z: Math.sign(p.z || 1) * (C.halfW + 0.55) };
    }

    if (this.state === "freethrow" && this.ft && this.ft.phase === "flight") {
      ball.state = "dead";
      ball.place(spot.x, C.ballRadius, spot.z);
      this.handleFreeThrowResult(false, { outOfBounds: true, spot: spot });
      return;
    }

    const last = ball.lastTouch || this.ball.holder;
    const lastTeam = last ? last.team : this.possession;
    const newTeam = otherTeam(lastTeam);
    this.outOfBoundsPending = true;
    this.outSpot = spot;
    this.audio.whistle(false);
    this.audio.ooh(0.45);
    this.feed("АУТ · МЯЧ У " + teamLabel(newTeam), "is-warn");
    this.showBanner("АУТ", teamLabel(newTeam) + " · ВБРАСЫВАНИЕ", "is-warn", 1.3);
    this.shotInAir = false;
    this.reboundActive = false;
    this.lastShotInfo = null;
    this.cancelCharge();
    this.clearShotPending();
    if (this.state === "inbound") {
      this.inbounder = null;
      this.inboundReceiver = null;
      this.inboundReceiveSpot = null;
      this.inboundPassed = false;
      this.inboundTimer = 0;
    }
    ball.state = "dead";
    ball.place(spot.x, C.ballRadius, spot.z);
    ball.shadow.visible = true;
    this.beginDead(0.85, () => {
      this.outOfBoundsPending = false;
      if (this.clockExpired) this.endQuarter();
      else this.startInbound(newTeam, spot);
    });
  };

  /* ============================================================
     PASSING
     ============================================================ */

  /* Pick the most useful teammate: open, in a clear lane, moving toward the rim. */
  P.bestPassTarget = function (passer, opts = {}) {
    if (!passer) return null;
    const mates = (this.teams[passer.team] || []).filter((p) => p !== passer);
    if (!mates.length) return null;
    const hoop = this.hoopFor(passer.team);
    const attack = Math.sign(hoop.x) || 1;
    const foes = this.opponentsOf(passer);
    let best = null;
    let bestScore = -Infinity;
    for (const mate of mates) {
      const dist = U.dist2D(passer.root.position, mate.root.position);
      let openDist = 9;
      for (const d of foes) {
        openDist = Math.min(openDist, U.dist2D(mate.root.position, d.root.position));
      }
      const lane = this.passLaneClear(passer, mate.root.position, foes);
      const progress = (mate.root.position.x - passer.root.position.x) * attack;
      const forwardSpeed = mate.vel.x * attack + mate.vel.z * 0.2;
      let score =
        openDist * 1.15 +
        (lane ? 1.55 : -1.15) -
        Math.max(0, dist - 8.5) * 0.22 +
        progress * 0.16 +
        forwardSpeed * 0.18;
      if (dist < 1.7) score -= 2.4;
      if (mate.isUser && forwardSpeed > 0.6) score += 1.15;
      if (mate.isUser) score += 0.25;
      if (opts.preferForward) score += progress * 0.18 + forwardSpeed * 0.22;
      score += U.rand(0, 0.08);
      if (score > bestScore) {
        bestScore = score;
        best = mate;
      }
    }
    return best;
  };

  P.makePass = function (passer, receiver, opts = {}) {
    if (!passer || !receiver) return false;
    if (!passer.hasBall || this.ball.holder !== passer) return false;
    if (this.state !== "live" && this.state !== "inbound") return false;
    if (passer.stunned > 0.3) return false;
    if (passer.action && !passer.action.loop) {
      if (["shoot", "dunk", "layup", "freeThrow", "stumble", "foul", "pass", "inbound"].includes(passer.action.type)) return false;
    }
    const target = receiver.getChest(new THREE.Vector3());
    const from = this.ball.mesh.position.clone();
    const baseDist = Math.hypot(target.x - from.x, target.z - from.z);
    const lane = this.passLaneClear(passer, { x: target.x, z: target.z }, this.opponentsOf(passer));
    const lob = opts.lob || !lane;
    const flight = U.clamp(0.33 + baseDist * 0.033 + (lob ? 0.2 : 0), 0.37, 1.1);
    // Lead the receiver: the ball travels to where he will be, not where he was.
    const leadScale = opts.lead != null ? opts.lead : opts.inbound ? 0.5 : 0.96;
    let leadX = receiver.vel.x * flight * leadScale;
    let leadZ = receiver.vel.z * flight * leadScale;
    const leadLen = Math.hypot(leadX, leadZ);
    if (leadLen > 4.6) {
      leadX = (leadX / leadLen) * 4.6;
      leadZ = (leadZ / leadLen) * 4.6;
    }
    target.x = U.clamp(target.x + leadX, -13.2, 13.2);
    target.z = U.clamp(target.z + leadZ, -6.9, 6.9);
    const vel = this.ballisticVel(from, target, flight);
    this.ball.passTo(passer, receiver, target, vel, {
      assistCandidate: opts.assistCandidate !== false,
      inbound: !!opts.inbound,
    });
    this.ball.mesh.visible = true;
    this.ball.shadow.visible = true;
    passer.playAction(opts.inbound ? "inbound" : "pass", opts.inbound ? 0.5 : 0.4);
    this.audio.pass();
    this.charge = null;
    if (passer === this.user) this.userJumpHadBall = false;
    this.lastPass = null;
    return true;
  };

  P.onPassKey = function () {
    if (this.paused) return;
    if (this.state === "inbound") {
      if (this.inbounder === this.user) {
        if (!this.inboundPassed) this.inboundPass(this.user, this.inboundReceiver);
      } else if (this.inboundReceiver === this.user && !this.inboundPassed) {
        this.inboundRequest = true;
        this.feed("ВЫ ПРОСИТЕ МЯЧ", "");
      }
      return;
    }
    if (this.state !== "live") return;
    const p = this.user;
    if (p.hasBall && this.ball.holder === p) {
      if (this.charge) this.cancelCharge();
      const mate = this.bestPassTarget(p, { preferForward: true }) || this.teammateOf(p);
      if (mate) this.makePass(p, mate, {});
      return;
    }
    const holder = this.ball.holder;
    if (holder && holder.team === p.team && !holder.isUser) {
      const def = this.nearestOpponentTo(p);
      const open = !def || U.dist2D(p.root.position, def.root.position) > 1.55;
      const lane = this.passLaneClear(holder, p.root.position, this.opponentsOf(holder));
      if (open || lane || Math.random() < 0.55) {
        if (this.aiPass(holder, p, { forced: true })) {
          this.feed("ВЫ ПРОСИТЕ МЯЧ · ПАС НА ХОД", "is-score");
        }
      } else {
        this.feed(holder.shortName + " НЕ ВИДИТ ПАСА", "is-warn");
      }
    }
  };

  P.aiPass = function (passer, receiver, opts = {}) {
    if (!passer || !receiver) return false;
    if (!passer.hasBall || this.ball.holder !== passer) return false;
    if (this.state !== "live") return false;
    if (passer.isBusy() && !opts.forced) return false;
    const lane = this.passLaneClear(passer, receiver.root.position, this.opponentsOf(passer));
    if (!lane && !opts.forced && Math.random() > 0.3) return false;
    return this.makePass(passer, receiver, { assistCandidate: true, lob: !lane });
  };

  P.passLaneClear = function (passer, target, defenders) {
    if (!passer || !target) return false;
    const list = defenders && defenders.length ? defenders : this.opponentsOf(passer);
    const ax = passer.root.position.x;
    const az = passer.root.position.z;
    let tx;
    let tz;
    if (target.x !== undefined && target.z !== undefined) {
      tx = target.x;
      tz = target.z;
    } else if (target.root) {
      tx = target.root.position.x;
      tz = target.root.position.z;
    } else if (target.position) {
      tx = target.position.x;
      tz = target.position.z;
    } else {
      return false;
    }
    for (const d of list) {
      if (!d || d.stunned > 0.5) continue;
      const dd = U.segmentPointDist(ax, az, tx, tz, d.root.position.x, d.root.position.z);
      const r = 0.52 + d.ratings.defense * 0.22;
      if (dd < r) return false;
    }
    return true;
  };

  /* ============================================================
     STEALS / BLOCKS / TRICKS
     ============================================================ */

  P.attemptSteal = function (defender, handler, opts = {}) {
    if (this.state !== "live" || !handler) return false;
    if (!handler.hasBall || this.ball.holder !== handler) return false;
    if (defender === handler || defender.team === handler.team) return false;
    if (defender.stunned > 0.2) return false;
    const d = U.dist2D(defender.root.position, handler.root.position);
    if (d > 1.75) return false;

    defender.playAction("steal", 0.42);
    const chance = U.clamp(
      0.17 + (defender.ratings.steal - handler.ratings.handle * 0.52) * 0.6,
      0.08,
      0.55
    );
    if (Math.random() < chance) {
      this.ball.giveTo(defender);
      this.stats[defender.id].stl++;
      this.stats[handler.id].to++;
      handler.applyStun(0.22);
      const fc = this.isFrontcourt(defender.team, this.ball.mesh.position.x);
      this.setPossession(defender.team, 24, fc);
      this.audio.steal();
      this.addShake(0.05);
      this.showBanner(
        "ОТБОР",
        defender.name.toUpperCase(),
        defender.team === "blue" ? "is-good" : "is-bad",
        1.4
      );
      this.feed("ОТБОР · " + defender.name, defender.team === "blue" ? "is-score" : "is-warn");
      this.cancelCharge();
      this.interceptIntent = 0;
      return true;
    }
    if (Math.random() < 0.28) {
      this.commitFoul(defender, handler, { shooting: false });
    }
    return false;
  };

  P.tryDeflect = function () {
    const p = this.user;
    const b = this.ball;
    if (b.state === "pass" && b.pass && b.pass.team !== p.team) {
      this.interceptIntent = 0.9;
      this.interceptTimer = 0.9;
      if (p.grounded) p.doJump(0.95);
      p.playAction("block", 0.4);
      this.userStealCd = 0.5;
      return;
    }
    if (b.state === "shot" && b.shot && b.shot.team !== p.team) {
      const hand = this.handPoint(p);
      const bp = b.mesh.position;
      const dist = Math.hypot(hand.x - bp.x, hand.y - bp.y, hand.z - bp.z);
      if (p.grounded) p.doJump(1);
      p.playAction("block", 0.5);
      if (dist < 1.35) this.performBlock(p, b.shot);
      this.userStealCd = 0.5;
      return;
    }
    if (b.state === "loose") {
      if (p.grounded) p.doJump(0.9);
      p.playAction("rebound", 0.5);
      this.userStealCd = 0.45;
    }
  };

  P.onStealKey = function () {
    if (this.paused) return;
    if (this.state === "inbound") {
      if (this.inbounder === this.user) return;
      // read the inbound play: jump the lane before the pass leaves the hands
      this.interceptIntent = 1.1;
      this.interceptTimer = 2.4;
      if (this.user.grounded) this.user.doJump(0.9);
      this.user.playAction("block", 0.45);
      this.userStealCd = 0.4;
      return;
    }
    if (this.state !== "live") return;
    if (this.userStealCd > 0) return;
    const p = this.user;
    const b = this.ball;
    if (b.holder && b.holder.team !== p.team) {
      if (this.attemptSteal(p, b.holder)) this.userStealCd = 0.55;
      else this.userStealCd = 0.45;
      return;
    }
    if (b.state === "pass" || (b.state === "shot" && b.shot && b.shot.team !== p.team)) {
      this.tryDeflect();
      return;
    }
    if (b.state === "loose") {
      this.tryDeflect();
    }
  };

  P.onJumpKey = function () {
    if (this.paused) return;
    if (this.state === "tipoff") {
      if (this.user.grounded) {
        this.user.doJump(1);
        this.user.playAction("block", 0.5);
      }
      return;
    }
    if (this.state === "inbound") {
      if (this.inbounder === this.user) return;
      if (this.user.grounded) {
        this.user.doJump(1);
        this.user.playAction(this.ball.state === "pass" ? "block" : "rebound", 0.5);
      }
      return;
    }
    if (this.state !== "live") return;
    const p = this.user;
    if (!p.grounded || p.stunned > 0) return;
    p.doJump(1);
    if (p.hasBall) {
      this.userJumpHadBall = true;
      return;
    }
    const b = this.ball;
    if (b.state === "shot") p.playAction("block", 0.55);
    else if (b.state === "pass") p.playAction("block", 0.45);
    else p.playAction("rebound", 0.5);
  };

  P.onTrickKey = function (type) {
    if (this.paused || this.state !== "live") return;
    if (this.userTrickCd > 0) return;
    if (!this.user.hasBall || this.ball.holder !== this.user) return;
    if (this.charge && this.charge.active) return;
    if (this.performTrick(this.user, type)) this.userTrickCd = 0.95;
  };

  P.performTrick = function (player, type) {
    if (!player || !player.hasBall || this.ball.holder !== player) return false;
    if (this.state !== "live" || player.stunned > 0.2 || !player.grounded) return false;
    if (this.charge && this.charge.active) return false;
    const cd = this.trickCooldowns[player.id] || 0;
    if (cd > 0) return false;
    this.trickCooldowns[player.id] = type === "spin" ? 1.25 : 1.0;

    const right = player.getRight(new THREE.Vector3());
    const fwd = player.getForward(new THREE.Vector3());
    if (type === "spin") {
      player.spinDur = 0.5;
      player.spinT = 0.5;
      player.vel.x += fwd.x * 2.5;
      player.vel.z += fwd.z * 2.5;
      player.dribbleCrossoverT = Math.max(player.dribbleCrossoverT, 0.35);
    } else {
      player.dribbleCrossoverT = 1;
      player.dribbleSide = -(player.dribbleSide || 1);
      player.vel.x += right.x * 3.1 * player.dribbleSide;
      player.vel.z += right.z * 3.1 * player.dribbleSide;
    }
    player.stamina = Math.max(0, player.stamina - 3.5);
    this.audio.sneaker();

    let best = null;
    let bestD = 1.7;
    for (const d of this.opponentsOf(player)) {
      const dd = U.dist2D(player.root.position, d.root.position);
      if (dd < bestD) {
        bestD = dd;
        best = d;
      }
    }
    if (best && best.stunned <= 0) {
      const chance = U.clamp(
        0.16 + player.ratings.handle * 0.3 - best.ratings.defense * 0.18,
        0.08,
        0.55
      );
      if (Math.random() < chance) {
        best.applyStun(0.75);
        best.playAction("stumble", 0.8);
        this.audio.ooh(0.7);
        this.feed("КРОССОВЕР · " + player.name + " СЛОМАЛ ЗАЩИТНИКА", player.team === "blue" ? "is-score" : "is-warn");
        this.addShake(0.05);
      }
    }
    return true;
  };

  P.aiSteal = function (defender, handler) {
    return this.attemptSteal(defender, handler, { ai: true });
  };

  P.foulShotCount = function (player) {
    const hoop = this.hoopFor(player.team);
    const d = Math.hypot(player.root.position.x - hoop.x, player.root.position.z - hoop.z);
    return d > C.threeRadius ? 3 : 2;
  };

  P.aiContest = function (defender, shooter) {
    if (!defender || !shooter || this.state !== "live") return;
    if (defender.grounded) defender.doJump(1);
    defender.playAction("block", 0.55);
    const dd = U.dist2D(defender.root.position, shooter.root.position);
    const foulChance =
      this.difficulty === "legend" ? 0.28 : this.difficulty === "rookie" ? 0.18 : 0.24;
    if (dd < 1.15 && this.ball.holder === shooter && Math.random() < foulChance) {
      this.commitFoul(defender, shooter, {
        shooting: true,
        ftCount: this.foulShotCount(shooter),
      });
    }
  };

  P.aiJump = function (player, reason) {
    if (!player || !player.grounded) return;
    player.doJump(1);
    player.playAction(reason === "rebound" ? "rebound" : "block", 0.55);
  };

  /* ============================================================
     AI INTERFACE
     ============================================================ */

  P.hoopFor = function (team) {
    const side = team === "blue" ? 1 : -1;
    return { x: side * C.rimX, z: 0, y: C.rimY, side: side };
  };

  P.opponentsOf = function (player) {
    const t = otherTeam(player.team);
    return this.teams[t] || [];
  };

  P.teammateOf = function (player) {
    const arr = this.teams[player.team] || [];
    return arr.find((p) => p !== player) || null;
  };

  P.nearestOpponentTo = function (player) {
    const foes = this.opponentsOf(player);
    let best = null;
    let bd = Infinity;
    for (const f of foes) {
      const d = U.dist2D(player.root.position, f.root.position);
      if (d < bd) {
        bd = d;
        best = f;
      }
    }
    return best;
  };

  P.updateDefensiveAssignments = function () {
    if (!this.defAssign) this.defAssign = {};
    for (const team of ["blue", "red"]) {
      const defenders = this.teams[team] || [];
      const attackers = this.teams[otherTeam(team)] || [];
      if (!defenders.length || !attackers.length) continue;

      const attackerIds = new Set(attackers.map((a) => a.id));
      const usedDef = new Set();
      const takenAtk = new Set();

      // Keep the existing matchup: a defender stays glued to his own man.
      for (const d of defenders) {
        const id = this.defAssign[d.id];
        if (!id || !attackerIds.has(id) || takenAtk.has(id)) {
          delete this.defAssign[d.id];
          continue;
        }
        usedDef.add(d.id);
        takenAtk.add(id);
      }

      // Make sure the ball handler is picked up, without re-shuffling everyone.
      const handler = this.ball.holder;
      let handlerAssigned = handler ? takenAtk.has(handler.id) : false;
      if (handler && attackerIds.has(handler.id) && !handlerAssigned) {
        let onBall = null;
        let bd = Infinity;
        for (const d of defenders) {
          if (usedDef.has(d.id) || d.stunned > 0.5) continue;
          const dd = U.dist2D(d.root.position, handler.root.position);
          if (dd < bd) { bd = dd; onBall = d; }
        }
        if (!onBall) {
          // All defenders are matched; the closest one switches onto the ball.
          for (const d of defenders) {
            if (d.stunned > 0.5) continue;
            const dd = U.dist2D(d.root.position, handler.root.position);
            if (dd < bd) { bd = dd; onBall = d; }
          }
          if (onBall) {
            const old = this.defAssign[onBall.id];
            if (old) takenAtk.delete(old);
          }
        }
        if (onBall) {
          this.defAssign[onBall.id] = handler.id;
          usedDef.add(onBall.id);
          takenAtk.add(handler.id);
        }
      }

      // Fill only the remaining slots by proximity.
      const pairs = [];
      for (const d of defenders) {
        if (usedDef.has(d.id)) continue;
        for (const a of attackers) {
          if (takenAtk.has(a.id)) continue;
          pairs.push({ d, a, dist: U.dist2D(d.root.position, a.root.position) });
        }
      }
      pairs.sort((a, b) => a.dist - b.dist);
      for (const pair of pairs) {
        if (usedDef.has(pair.d.id) || takenAtk.has(pair.a.id)) continue;
        this.defAssign[pair.d.id] = pair.a.id;
        usedDef.add(pair.d.id);
        takenAtk.add(pair.a.id);
      }
      for (const d of defenders) {
        if (this.defAssign[d.id]) continue;
        let best = attackers[0];
        let bd = Infinity;
        for (const a of attackers) {
          const dd = U.dist2D(d.root.position, a.root.position);
          if (dd < bd) {
            bd = dd;
            best = a;
          }
        }
        if (best) this.defAssign[d.id] = best.id;
      }
    }
  };

  P.defensiveAssignment = function (defender) {
    const foes = this.opponentsOf(defender);
    if (!foes.length) return null;
    const assignedId = this.defAssign && this.defAssign[defender.id];
    if (assignedId && this.playerById[assignedId]) return this.playerById[assignedId];
    const handler = this.ball.holder;
    if (handler && handler.team !== defender.team) return handler;
    return this.nearestOpponentTo(defender);
  };

  /* Contact on a drive: the user draws plenty of shooting fouls at the rim. */
  P.checkDriveFouls = function (dt) {
    this.driveFoulCd = Math.max(0, (this.driveFoulCd || 0) - dt);
    if (this.driveFoulCd > 0 || this.state !== "live") return;
    const holder = this.ball.holder;
    if (!holder || !holder.isUser || holder.stunned > 0.3) return;
    if (holder.speed < 2.5) return;
    const hoop = this.hoopFor(holder.team);
    const towardHoop =
      (hoop.x - holder.root.position.x) * holder.vel.x +
      (hoop.z - holder.root.position.z) * holder.vel.z;
    if (towardHoop <= 0) return;
    for (const d of this.opponentsOf(holder)) {
      if (d.stunned > 0) continue;
      const dd = U.dist2D(d.root.position, holder.root.position);
      if (dd < 0.9) {
        const chance = dt * (0.55 + d.ratings.defense * 0.5);
        if (Math.random() < chance) {
          const distHoop = Math.hypot(
            holder.root.position.x - hoop.x,
            holder.root.position.z - hoop.z
          );
          const shooting = distHoop < 6.6;
          this.driveFoulCd = 2.1;
          this.commitFoul(d, holder, { shooting, ftCount: shooting ? 2 : 0 });
          return;
        }
      }
    }
  };

  P.aiTrick = function (player) {
    if (!player || player !== this.ball.holder) return false;
    return this.performTrick(player, Math.random() < 0.6 ? "crossover" : "spin");
  };

  /* ============================================================
     DEAD BALL / INBOUNDS
     ============================================================ */

  const quarterName = (q) =>
    q <= 4
      ? ["1-Я ЧЕТВЕРТЬ", "2-Я ЧЕТВЕРТЬ", "3-Я ЧЕТВЕРТЬ", "4-Я ЧЕТВЕРТЬ"][q - 1]
      : "ОВЕРТАЙМ " + (q - 4);

  P.beginDead = function (dur, cb) {
    if (["menu", "gameover", "quarter"].includes(this.state)) return;
    this.state = "dead";
    this.deadTimer = Math.max(0.12, dur || 0.8);
    this.deadCallback = cb || null;
    this.cancelCharge();
    this.ui.shotMeter.classList.add("is-hidden");
    this.hideContext();
  };

  P.updateDead = function (dt) {
    this.updateActionTimers(dt);
    this.updatePlayersIdle(dt);
    this.deadTimer -= dt;
    if (this.deadTimer > 0) return;
    const cb = this.deadCallback;
    this.deadCallback = null;
    if (cb) cb();
    else if (this.state === "dead") this.state = "live";
  };

  P.pickInbounder = function (team, spot) {
    const roster = this.teams[team] || [];
    let best = null;
    let bestD = Infinity;
    for (const p of roster) {
      if (p.stunned > 0.4) continue;
      const d = U.dist2Dxz(p.root.position.x, p.root.position.z, spot.x, spot.z);
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
    return best || roster[0] || null;
  };

  P.findInboundReceiveSpot = function (team, spot) {
    const guards = this.teams[otherTeam(team)] || [];
    const baseline = Math.abs(spot.x) > C.halfL + 0.1;
    const candidates = [];
    if (baseline) {
      const ix = Math.sign(spot.x) * (C.halfL - U.rand(2.9, 4.2));
      for (const oz of [-2.6, 0, 2.6]) {
        candidates.push({ x: ix, z: U.clamp(spot.z + oz, -6.7, 6.7) });
      }
      candidates.push({
        x: Math.sign(spot.x) * (C.halfL - 5.6),
        z: U.clamp(spot.z * 0.55, -4.2, 4.2),
      });
    } else {
      const iz = Math.sign(spot.z) * (C.halfW - U.rand(2.5, 3.5));
      for (const ox of [-2.8, 0, 2.8]) {
        candidates.push({ x: U.clamp(spot.x + ox, -12.6, 12.6), z: iz });
      }
      candidates.push({
        x: U.clamp(spot.x * 0.6, -7, 7),
        z: Math.sign(spot.z) * (C.halfW - 5.0),
      });
    }

    let best = candidates[0];
    let bestScore = -Infinity;
    for (const c of candidates) {
      let openDist = 9;
      for (const g of guards) {
        openDist = Math.min(openDist, U.dist2Dxz(c.x, c.z, g.root.position.x, g.root.position.z));
      }
      const travel = U.dist2Dxz(c.x, c.z, spot.x, spot.z);
      const score = openDist * 1.7 - Math.max(0, travel - 5.2) * 0.45 + U.rand(0, 0.45);
      if (score > bestScore) {
        bestScore = score;
        best = c;
      }
    }
    return {
      x: U.clamp(best.x, -12.85, 12.85),
      z: U.clamp(best.z, -6.9, 6.9),
    };
  };

  P.pickInboundReceiver = function (team, inbounder) {
    let best = null;
    let bestScore = -Infinity;
    for (const p of this.teams[team] || []) {
      if (p === inbounder || p.stunned > 0.4) continue;
      const score =
        (p.ratings.handle || 0.6) * 1.1 +
        (p.ratings.pass || 0.6) * 0.35 +
        (p.isUser ? 0.55 : 0) +
        U.rand(0, 0.35);
      if (score > bestScore) {
        bestScore = score;
        best = p;
      }
    }
    return best || this.teammateOf(inbounder);
  };

  P.inboundSpacingSpots = function (team, point) {
    const dir = team === "blue" ? 1 : -1;
    const spots = [
      { x: point.x + dir * 3.4, z: -4.4 },
      { x: point.x + dir * 3.4, z: 4.4 },
      { x: point.x + dir * 6.6, z: -1.9 },
      { x: point.x + dir * 6.6, z: 1.9 },
      { x: point.x + dir * 9.6, z: 0 },
    ];
    for (const s of spots) {
      s.x = U.clamp(s.x, -13.1, 13.1);
      s.z = U.clamp(s.z, -6.7, 6.7);
    }
    return spots;
  };

  P.startInbound = function (team, spot) {
    if (this.state === "menu" || this.state === "gameover") return;
    if (this.clockExpired) {
      this.endQuarter();
      return;
    }
    const roster = this.teams[team] || [];
    if (!roster.length) return;
    const point = spot ? { x: spot.x, z: spot.z } : { x: 0, z: C.halfW + 0.55 };
    const inbounder = this.pickInbounder(team, point);
    const receiver = this.pickInboundReceiver(team, inbounder);
    if (!inbounder || !receiver) return;

    this.state = "inbound";
    this.cancelCharge();
    this.charge = null;
    this.ft = null;
    this.freeThrows = null;
    this.deadCallback = null;
    this.deadTimer = 0;
    this.lastPass = null;
    this.shotInAir = false;
    this.reboundActive = false;
    this.lastShotInfo = null;
    this.outOfBoundsPending = false;
    this.outSpot = null;
    this.inboundRequest = false;
    this.inboundPassed = false;
    this.inboundTimer = 5.0;
    this.interceptIntent = 0;
    this.interceptTimer = 0;
    this.userJumpHadBall = false;
    this.travelPending = false;
    this.clearShotPending();

    this.inbounder = inbounder;
    this.inboundReceiver = receiver;
    this.inboundReceiveSpot = this.findInboundReceiveSpot(team, point);

    const recv = this.inboundReceiveSpot;
    const faceIn = Math.atan2(recv.x - point.x, recv.z - point.z);
    this.softResetPlayer(inbounder, point.x, point.z, faceIn);
    this.softResetPlayer(
      receiver,
      recv.x,
      recv.z,
      Math.atan2(point.x - recv.x, point.z - recv.z)
    );

    const offense = (this.teams[team] || []).filter((p) => p !== inbounder && p !== receiver);
    const spacing = this.inboundSpacingSpots(team, point);
    spacing.sort(
      (a, b) =>
        U.dist2Dxz(b.x, b.z, recv.x, recv.z) - U.dist2Dxz(a.x, a.z, recv.x, recv.z)
    );
    offense.forEach((p, i) => {
      const s = spacing[i] || spacing[spacing.length - 1];
      this.softResetPlayer(p, s.x, s.z, Math.atan2(point.x - s.x, point.z - s.z));
      p.lookTarget.set(point.x, 1.6, point.z);
      const ai = this.aiByPlayer[p.id];
      if (ai) ai.spot.set(s.x, 0, s.z);
    });

    const defenders = this.teams[otherTeam(team)] || [];
    const attackers = this.teams[team] || [];
    const dPairs = [];
    for (const d of defenders) {
      for (const a of attackers) {
        dPairs.push({ d, a, dist: U.dist2D(d.root.position, a.root.position) });
      }
    }
    dPairs.sort((a, b) => a.dist - b.dist);
    const marks = new Map();
    const usedD = new Set();
    const usedA = new Set();
    for (const pair of dPairs) {
      if (usedD.has(pair.d.id) || usedA.has(pair.a.id)) continue;
      marks.set(pair.d, pair.a);
      usedD.add(pair.d.id);
      usedA.add(pair.a.id);
    }
    const defHoopX = team === "blue" ? -C.rimX : C.rimX;
    for (const d of defenders) {
      const man = marks.get(d) || receiver;
      let x, z;
      if (man === inbounder) {
        const dx = recv.x - point.x;
        const dz = recv.z - point.z;
        const l = Math.hypot(dx, dz) || 1;
        x = point.x + (dx / l) * 1.5;
        z = point.z + (dz / l) * 1.5;
      } else {
        let vx = defHoopX - man.root.position.x;
        let vz = -man.root.position.z;
        const l = Math.hypot(vx, vz) || 1;
        x = man.root.position.x + (vx / l) * 1.35;
        z = man.root.position.z + (vz / l) * 1.35;
      }
      x = U.clamp(x, -13.15, 13.15);
      z = U.clamp(z, -6.8, 6.8);
      this.softResetPlayer(d, x, z, Math.atan2(point.x - x, point.z - z));
      d.lookTarget.set(point.x, 1.6, point.z);
    }

    this.ball.reset();
    this.ball.giveTo(inbounder);
    inbounder.playAction("inbound", 30, { loop: true });
    this.ball.mesh.visible = true;
    this.ball.shadow.visible = true;
    this.ball.lastTouch = inbounder;
    inbounder.lookTarget.set(recv.x, 1.5, recv.z);
    receiver.lookTarget.copy(this.ball.mesh.position);

    for (const p of this.players) p.setInput(0, 0, false);
    for (const ai of this.ais) {
      if (ai.p === inbounder) ai.inboundWait = 1.15 + Math.random() * 0.95;
    }

    const front = this.isFrontcourt(team, point.x);
    this.setPossession(team, front ? 14 : 24, front);
    this.shotClock = front ? 14 : 24;

    this.ui.ftPanel.classList.add("is-hidden");
    this.ui.shotMeter.classList.add("is-hidden");
    this.ui.tipoffPrompt.classList.add("is-hidden");
    this.hideContext();
    this.updateScoreUI(true);
    this.feed("ВБРАСЫВАНИЕ · " + teamLabel(team) + " · " + inbounder.name, "");
  };

  P.updateInbound = function (dt) {
    this.updateActionTimers(dt);
    if (this.inboundRequest && this.inbounder && this.inbounder !== this.user) {
      const ai = this.aiByPlayer[this.inbounder.id];
      if (ai) ai.inboundWait = Math.min(ai.inboundWait, 0.22);
      this.inboundRequest = false;
    }

    if (this.inbounder === this.user) {
      this.user.setInput(0, 0, false);
    } else {
      this.applyUserInput(dt);
    }
    this.updateDefensiveAssignments();
    for (const ai of this.ais) ai.update(dt);
    if (this.state !== "inbound") return;
    for (const p of this.players) p.update(dt, this.elapsed, this);
    this.resolvePlayerCollisions();
    this.ball.update(dt, this);
    if (this.state !== "inbound") return;

    if (this.inboundPassed) return;
    this.inboundTimer -= dt;
    if (this.inboundTimer > 0) return;

    const team = this.inbounder ? this.inbounder.team : this.possession;
    const spot = this.inbounder
      ? { x: this.inbounder.root.position.x, z: this.inbounder.root.position.z }
      : { x: 0, z: C.halfW + 0.55 };
    this.audio.whistle(true);
    this.audio.ooh(0.55);
    this.feed("НАРУШЕНИЕ · 5 СЕКУНД НА ВБРОС", "is-warn");
    this.showBanner("5 СЕКУНД", teamLabel(team) + " · мяч сопернику", "is-warn", 1.5);
    this.beginDead(0.85, () => {
      if (this.clockExpired) this.endQuarter();
      else this.startInbound(otherTeam(team), spot);
    });
  };

  P.inboundPass = function (passer, receiver) {
    if (this.state !== "inbound" || !passer || this.inbounder !== passer || this.inboundPassed) return false;
    const target = receiver || this.inboundReceiver;
    if (!target || target.stunned > 0.5) return false;
    if (!this.makePass(passer, target, { inbound: true, assistCandidate: false })) return false;

    this.inboundPassed = true;
    this.inboundTimer = 0;
    const front = this.isFrontcourt(passer.team, target.root.position.x);
    this.setPossession(passer.team, front ? 14 : 24, front);
    this.state = "live";
    this.feed("ВБРАСЫВАНИЕ · " + passer.name, "");
    return true;
  };

  P.endInbound = function () {
    this.inbounder = null;
    this.inboundReceiver = null;
    this.inboundReceiveSpot = null;
    this.inboundTimer = 0;
    this.inboundPassed = false;
    this.inboundRequest = false;
    if (this.state === "inbound") this.state = "live";
  };

  P.aiInboundPass = function (passer) {
    if (this.state !== "inbound" || !passer || this.inbounder !== passer || this.inboundPassed) return false;
    const receiver = this.inboundReceiver;
    if (!receiver || receiver.stunned > 0.5) return false;
    return this.inboundPass(passer, receiver);
  };

  /* ============================================================
     FOULS / FREE THROWS
     ============================================================ */

  P.commitFoul = function (defender, victim, opts = {}) {
    if (this.state !== "live") return false;
    if (!defender || !victim || defender === victim || defender.team === victim.team) return false;

    this.teamFouls[defender.team] = (this.teamFouls[defender.team] || 0) + 1;
    const ds = this.stats[defender.id];
    if (ds) ds.pf++;
    const teamFouls = this.teamFouls[defender.team];
    const bonus = teamFouls >= 5;
    const shots = opts.shooting
      ? Math.max(2, opts.ftCount || this.foulShotCount(victim))
      : bonus
        ? 2
        : 0;

    this.cancelCharge();
    this.clearShotPending();
    this.shotInAir = false;
    this.reboundActive = false;
    this.lastShotInfo = null;
    this.lastPass = null;
    this.outOfBoundsPending = false;
    this.interceptIntent = 0;
    this.ball.reset();

    defender.playAction("foul", 0.7);
    if (!opts.shooting) victim.playAction("stumble", 0.48);
    this.audio.foul();
    this.addShake(0.04);
    this.feed(
      "ФОЛ · " + defender.name + " · " + teamFouls + "-й командный",
      defender.team === "blue" ? "is-warn" : ""
    );

    if (shots > 0) {
      this.showBanner(
        "ФОЛ",
        victim.shortName.toUpperCase() + " · " + shots + " ШТРАФН" + (shots === 2 ? "ЫХ" : "ЫХ"),
        "is-warn",
        1.5
      );
      this.beginDead(0.95, () => this.startFreeThrows(victim, shots));
    } else {
      this.showBanner(
        "ФОЛ",
        teamLabel(victim.team) + " · ВБРАСЫВАНИЕ",
        "is-warn",
        1.4
      );
      const spot = this.nearestInboundSpot(victim.root.position);
      this.beginDead(0.95, () => {
        if (this.clockExpired) this.endQuarter();
        else this.startInbound(victim.team, spot);
      });
    }
    return true;
  };

  P.aiFreeThrowQuality = function (shooter) {
    const bonus =
      this.difficulty === "legend" ? 0.055 :
      this.difficulty === "rookie" ? -0.055 : 0;
    return U.clamp(
      0.46 + shooter.ratings.shoot * 0.45 + bonus + U.rand(-0.05, 0.05),
      0.35,
      0.97
    );
  };

  P.startFreeThrows = function (shooter, count) {
    if (!shooter || this.state === "gameover") return;
    const total = Math.max(1, count || 2);
    this.cancelCharge();
    this.charge = null;
    this.deadCallback = null;
    this.deadTimer = 0;
    this.inbounder = null;
    this.inboundReceiver = null;
    this.inboundReceiveSpot = null;
    this.inboundPassed = false;
    this.inboundRequest = false;
    this.outOfBoundsPending = false;
    this.lastPass = null;
    this.shotInAir = false;
    this.reboundActive = false;
    this.lastShotInfo = null;
    this.interceptIntent = 0;
    this.interceptTimer = 0;
    this.userJumpHadBall = false;
    this.clearShotPending();
    this.ft = {
      shooter,
      total,
      remaining: total,
      made: 0,
      phase: "setup",
      setupTimer: 0.95,
      aiTimer: 0,
      readyTimer: 0,
      holdTimer: 0,
      flightTimer: 0,
    };
    this.freeThrows = this.ft;
    this.possession = shooter.team;
    this.frontcourt = true;
    this.backcourtTimer = 0;
    this.shotClock = 24;
    this.state = "freethrow";
    this.setupFreeThrowAttempt();
    this.feed(
      "ШТРАФНЫЕ · " + shooter.name + " · " + total,
      shooter.team === "blue" ? "" : "is-warn"
    );
    this.showBanner(
      "ШТРАФНЫЕ",
      shooter.shortName.toUpperCase() + " · " + total,
      "is-warn",
      1.6
    );
    this.updateScoreUI(true);
  };

  P.setupFreeThrowAttempt = function () {
    const ft = this.ft;
    if (!ft) return;
    const shooter = ft.shooter;
    const dir = shooter.team === "blue" ? 1 : -1;
    const face = dir > 0 ? Math.PI / 2 : -Math.PI / 2;
    const baseX = dir * C.ftX;

    this.state = "freethrow";
    this.cancelCharge();
    this.charge = null;
    this.shotInAir = false;
    this.reboundActive = false;
    this.lastShotInfo = null;
    this.outOfBoundsPending = false;
    this.interceptIntent = 0;
    this.interceptTimer = 0;
    this.clearShotPending();
    ft.phase = "setup";
    ft.setupTimer = 0.9;
    ft.aiTimer = 0;
    ft.readyTimer = 0;
    ft.holdTimer = 0;
    ft.flightTimer = 0;

    this.ball.reset();
    this.softResetPlayer(shooter, baseX, 0, face);

    // Four teammates spread outside the lane.
    const mateSpots = [
      { x: baseX + dir * 1.7, z: -2.7 },
      { x: baseX + dir * 1.7, z: 2.7 },
      { x: baseX + dir * 3.6, z: -1.1 },
      { x: baseX + dir * 3.6, z: 1.1 },
    ];
    const mates = (this.teams[shooter.team] || []).filter((p) => p !== shooter);
    mates.forEach((p, i) => {
      const s = mateSpots[i] || mateSpots[mateSpots.length - 1];
      this.softResetPlayer(
        p,
        U.clamp(s.x, -13.1, 13.1),
        U.clamp(s.z, -6.7, 6.7),
        face
      );
      p.lookTarget.set(this.hoopFor(shooter.team).x, C.rimY, 0);
    });

    // Defenders stay close, but never directly in the shooter's line to the rim.
    const defenders = this.opponentsOf(shooter);
    const defSpots = [
      { x: baseX - dir * 0.4, z: -1.6 },
      { x: baseX - dir * 0.4, z: 1.6 },
      { x: baseX - dir * 1.6, z: 0 },
      { x: baseX + dir * 0.5, z: -2.9 },
      { x: baseX + dir * 0.5, z: 2.9 },
    ];
    defenders.forEach((d, i) => {
      const s = defSpots[i] || defSpots[defSpots.length - 1];
      this.softResetPlayer(
        d,
        U.clamp(s.x, -13.1, 13.1),
        U.clamp(s.z, -6.7, 6.7),
        -face
      );
      d.lookTarget.set(baseX, 1.55, 0);
    });

    this.ball.giveTo(shooter);
    this.ball.mesh.visible = true;
    this.ball.shadow.visible = true;
    shooter.playAction("inbound", 30, { loop: true });
    shooter.lookTarget.set(this.hoopFor(shooter.team).x, C.rimY, 0);
    for (const p of this.players) p.setInput(0, 0, false);

    this.possession = shooter.team;
    this.shotClock = 24;
    this.ui.shotMeter.classList.add("is-hidden");
    this.ui.tipoffPrompt.classList.add("is-hidden");
    this.hideContext();
    this.updateScoreUI(true);
  };

  P.launchFreeThrow = function (shooter, quality) {
    const ft = this.ft;
    if (this.state !== "freethrow" || !ft || ft.shooter !== shooter || ft.phase !== "ready") return false;
    if (!shooter.hasBall || this.ball.holder !== shooter) return false;
    const q = U.clamp(quality == null ? 0.72 : quality, 0.08, 1);
    const info = this.evaluateShot(shooter, 0.72, { freeThrow: true, aiQuality: q });
    this.cancelCharge();
    this.charge = null;
    const launched = this.launchShot(shooter, info, { freeThrow: true });
    if (!launched) return false;
    const st = this.stats[shooter.id];
    if (st) st.fta++;
    ft.phase = "flight";
    ft.flightTimer = 0;
    ft.aiTimer = 0;
    return true;
  };

  P.updateFreeThrow = function (dt) {
    const ft = this.ft;
    if (!ft) {
      this.state = "live";
      return;
    }
    this.updateActionTimers(dt);
    this.updateCharge(dt);

    if (ft.phase === "setup") {
      ft.setupTimer -= dt;
      if (ft.setupTimer <= 0) {
        ft.phase = "ready";
        ft.readyTimer = 0;
        ft.holdTimer = 0;
        ft.aiTimer = U.rand(0.65, 1.35);
        this.audio.ui();
      }
    } else if (ft.phase === "ready") {
      if (ft.shooter === this.user) {
        if (this.charge && this.charge.active) {
          ft.readyTimer = 0;
          if (this.charge.power >= 0.995) ft.holdTimer += dt;
          else ft.holdTimer = 0;
          if (ft.holdTimer > 2.4) {
            this.cancelCharge();
            this.launchFreeThrow(this.user, 0.52);
          }
        } else {
          ft.holdTimer = 0;
          ft.readyTimer += dt;
          if (ft.readyTimer > 13) this.launchFreeThrow(this.user, 0.5);
        }
      } else {
        ft.aiTimer -= dt;
        if (ft.aiTimer <= 0) {
          this.launchFreeThrow(ft.shooter, this.aiFreeThrowQuality(ft.shooter));
        }
      }
    }

    this.updatePlayersIdle(dt);
    if (this.state !== "freethrow" || !this.ft || this.ft !== ft) return;

    if (ft.phase === "flight") {
      ft.flightTimer += dt;
      if (this.ball.state === "loose") {
        this.handleFreeThrowResult(false);
      } else if (ft.flightTimer > 4.5) {
        this.ball.reset();
        this.handleFreeThrowResult(false);
      }
    }
  };

  P.handleFreeThrowResult = function (made, opts = {}) {
    const ft = this.ft;
    if (!ft || ft.phase !== "flight") return;
    const shooter = ft.shooter;
    ft.phase = "reset";
    ft.remaining--;
    if (made) {
      ft.made++;
      this.showBanner(
        "ШТРАФНОЙ ЗАБИТ",
        shooter.shortName.toUpperCase() + " · " + ft.made + "/" + ft.total,
        "is-good",
        1.15
      );
    } else {
      this.audio.ooh(0.4);
      this.feed("ПРОМАХ · " + shooter.name, shooter.team === "blue" ? "is-warn" : "");
      this.showBanner(
        "ПРОМАХ",
        shooter.shortName.toUpperCase() + " · ШТРАФНОЙ",
        "is-warn",
        1.1
      );
    }
    this.clearShotPending();
    this.shotInAir = false;
    this.reboundActive = false;
    this.lastShotInfo = null;
    if (this.ball.shot) this.ball.shot = null;

    if (ft.remaining > 0) {
      this.beginDead(1.0, () => {
        if (this.ft) this.setupFreeThrowAttempt();
      });
      return;
    }

    const team = shooter.team;
    const spot = {
      x: (team === "blue" ? 1 : -1) * (C.halfL + 0.55),
      z: U.rand(-2.4, 2.4),
    };
    this.ft = null;
    this.freeThrows = null;
    this.beginDead(1.05, () => {
      if (this.clockExpired) this.endQuarter();
      else this.startInbound(otherTeam(team), spot);
    });
  };

  /* ============================================================
     QUARTERS / OVERTIME / GAME OVER
     ============================================================ */

  P.endQuarter = function () {
    if (["menu", "gameover", "quarter"].includes(this.state)) return;
    const q = this.quarter;
    const tied = this.scores.blue === this.scores.red;
    const final = q >= 4 && !tied;

    this.state = "quarter";
    this.gameClock = 0;
    this.clockExpired = true;
    this.cancelCharge();
    this.charge = null;
    this.clearShotPending();
    this.inbounder = null;
    this.inboundReceiver = null;
    this.inboundReceiveSpot = null;
    this.inboundPassed = false;
    this.inboundTimer = 0;
    this.inboundRequest = false;
    this.outOfBoundsPending = false;
    this.shotInAir = false;
    this.reboundActive = false;
    this.lastShotInfo = null;
    this.deadCallback = null;
    this.deadTimer = 0;
    this.interceptIntent = 0;
    this.interceptTimer = 0;
    this.ball.reset();
    this.ball.mesh.visible = false;
    this.ball.shadow.visible = false;
    for (const p of this.players) p.setInput(0, 0, false);

    this.audio.buzzer();
    this.ui.shotMeter.classList.add("is-hidden");
    this.ui.ftPanel.classList.add("is-hidden");
    this.ui.tipoffPrompt.classList.add("is-hidden");
    this.hideContext();

    const title = this.ui.quarterTitle;
    const blue = this.ui.quarterBlue;
    const red = this.ui.quarterRed;
    const count = this.ui.quarterCount;
    const note = document.getElementById("quarter-note");
    const kicker = this.ui.quarter.querySelector(".overlay-kicker");
    if (title) title.textContent = final ? "ФИНАЛЬНЫЙ СВИСТОК" : quarterName(q);
    if (blue) blue.textContent = String(this.scores.blue);
    if (red) red.textContent = String(this.scores.red);
    if (kicker) {
      kicker.textContent = final
        ? "МАТЧ ЗАВЕРШЁН"
        : q > 4
          ? "КОНЕЦ ОВЕРТАЙМА"
          : "КОНЕЦ ЧЕТВЕРТИ";
    }
    if (note) {
      note.textContent = final
        ? "ИТОГОВЫЙ СЧЁТ"
        : q >= 4
          ? "СЛЕДУЮЩИЙ ОВЕРТАЙМ ЧЕРЕЗ"
          : "СЛЕДУЮЩАЯ ЧЕТВЕРТЬ ЧЕРЕЗ";
    }

    if (final) {
      this.matchOver = true;
      this.quarterPending = "final";
      this.quarterTimer = 3.1;
      if (count) count.textContent = "·";
    } else {
      this.matchOver = false;
      this.quarterPending = "next";
      this.quarterTimer = 3.2;
      if (count) count.textContent = "3";
    }

    if (this.arena) {
      this.arena.setBoard(this.scores.blue, this.scores.red, "0:00", q, 24, true);
    }
    this.ui.quarter.classList.remove("is-hidden");
    this.feed(
      (final ? "ФИНАЛЬНЫЙ СВИСТОК · " : q > 4 ? "КОНЕЦ ОВЕРТАЙМА · " : "КОНЕЦ ЧЕТВЕРТИ · ") +
        this.scores.blue + " : " + this.scores.red,
      "is-warn"
    );
    this.updateScoreUI(true);
  };

  P.updateQuarter = function (dt) {
    this.updatePlayersIdle(dt);
    this.updateActionTimers(dt);
    if (this.quarterTimer > 0) {
      this.quarterTimer -= dt;
      if (this.quarterPending === "next" && this.ui.quarterCount) {
        const n = Math.min(3, Math.max(1, Math.ceil(this.quarterTimer)));
        const txt = String(n);
        if (this.ui.quarterCount.textContent !== txt) this.ui.quarterCount.textContent = txt;
      }
    }
    if (this.quarterTimer > 0) return;

    const pending = this.quarterPending;
    this.quarterPending = null;
    this.quarterTimer = 0;
    if (pending === "final") {
      this.ui.quarter.classList.add("is-hidden");
      this.showGameOver();
    } else {
      this.startNextQuarter();
    }
  };

  P.startNextQuarter = function () {
    this.quarter += 1;
    const ot = this.quarter > 4;
    this.ui.quarter.classList.add("is-hidden");
    this.state = "dead";
    this.gameClock = ot ? OT_LENGTH : QUARTER_LENGTH;
    this.shotClock = 24;
    this.clockExpired = false;
    this.teamFouls = { blue: 0, red: 0 };
    this.quarterTimer = 0;
    this.quarterPending = null;
    this.matchOver = false;
    this.resetGameplayState();
    this.ball.reset();
    for (const p of this.players) {
      p.stamina = Math.min(100, p.stamina + (ot ? 12 : 18));
      p.setInput(0, 0, false);
    }

    const team = this.quarter % 2 === 1 ? "blue" : "red";
    this.startInbound(team, { x: 0, z: C.halfW + 0.55 });
    this.updateScoreUI(true);
    if (this.arena) {
      this.arena.setBoard(
        this.scores.blue,
        this.scores.red,
        U.formatClock(this.gameClock),
        this.quarter,
        24,
        true
      );
    }
    this.showBanner(
      quarterName(this.quarter),
      ot ? "ДОПОЛНИТЕЛЬНОЕ ВРЕМЯ" : "МАТЧ ПРОДОЛЖАЕТСЯ",
      "",
      1.7
    );
    this.feed("СТАРТ · " + quarterName(this.quarter), "is-warn");
    this.audio.ui();
  };
})();
