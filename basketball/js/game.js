/* FULL COURT — core scene, UI, input and game loop */
(function () {
  "use strict";
  const BB = (window.BB = window.BB || {});
  const U = BB.util;
  const C = BB.COURT;

  const QUARTER_LENGTH = 120;
  const OT_LENGTH = 60;

  class Game {
    constructor() {
      this.canvas = document.getElementById("scene");
      this.state = "menu";
      this.paused = false;
      this.elapsed = 0;
      this.difficulty = "pro";
      try {
        const saved = localStorage.getItem("fullcourt_difficulty");
        if (saved && ["rookie", "pro", "legend"].includes(saved)) this.difficulty = saved;
        const snd = localStorage.getItem("fullcourt_sound");
        if (snd === "off") this.muted = true;
      } catch (e) { /* file:// privacy mode */ }
      this.keys = new Set();
      this.cameraMode = 0;
      this.shake = 0;
      this.helpReturn = null;
      this.countdownTimer = 0;
      this.lastCount = 4;
      this.bannerTimerId = null;
      this.arenaClockTimer = 0;
      this.lastHud = {};
      this.tipTime = 0;
      this.tipPlayerA = null;
      this.tipPlayerB = null;
      this.inbounder = null;
      this.inboundReceiver = null;
      this.inboundReceiveSpot = null;
      this.charge = null;
      this.interceptIntent = 0;
      this.shotInAir = false;
      this.clockExpired = false;
      this.quarter = 1;
      this.gameClock = QUARTER_LENGTH;
      this.shotClock = 24;
      this.scores = { blue: 0, red: 0 };
      this.teamFouls = { blue: 0, red: 0 };
      this.possession = "blue";
      this.players = [];
      this.playerById = {};
      this.teams = { blue: [], red: [] };
      this.stats = {};
      this.ais = [];
      this.aiByPlayer = {};
      this.ft = null;
      this.freeThrows = null;
      this.deadTimer = 0;
      this.deadCallback = null;
      this.quarterTimer = 0;
      this.menuTime = 0;
      this.camLook = new THREE.Vector3(0, 1.4, 0);
      this.camTarget = new THREE.Vector3(0, 8.0, 13.0);
      this._tmpDir = new THREE.Vector3();
      this._tmpRight = new THREE.Vector3();
      this._tmpVec = new THREE.Vector3();
      this._prevBallPos = new THREE.Vector3();

      this.setupRenderer();
      this.setupWorld();
      this.initUI();
      this.bindEvents();
      this.bindInput();
      this.setupMenuScene();
      this.hideLoadingSoon();
      this.clock = new THREE.Clock();
      this.loop = this.loop.bind(this);
      requestAnimationFrame(this.loop);
    }

    /* ============================ BOOT ============================ */
    setupRenderer() {
      this.renderer = new THREE.WebGLRenderer({
        canvas: this.canvas,
        antialias: true,
        alpha: false,
        powerPreference: "high-performance",
      });
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.8));
      this.renderer.setSize(window.innerWidth, window.innerHeight, false);
      this.renderer.outputEncoding = THREE.sRGBEncoding;
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = 1.12;
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      this.renderer.physicallyCorrectLights = false;

      this.scene = new THREE.Scene();
      this.scene.environment = U.envCubeTexture();
      this.camera = new THREE.PerspectiveCamera(48, window.innerWidth / window.innerHeight, 0.1, 120);
      this.camera.position.set(-2, 6.8, 12.9);
      this.camera.lookAt(0, 1.3, 0);
    }

    setupWorld() {
      this.audio = new BB.Audio();
      this.arena = new BB.Arena(this.scene, this.renderer);
      this.ball = new BB.Ball(this.scene);
      this.createPlayers();
      this.buildStats();
    }

    createPlayers() {
      const defs = [
        { id: "user", team: "blue", name: "ВЫ", shortName: "YOU", number: 1, role: "защитник", isUser: true, slot: 0 },
        { id: "kai", team: "blue", name: "КАЙ", shortName: "KAI", number: 7, role: "форвард", slot: 1 },
        { id: "trey", team: "blue", name: "ТРЕЙ", shortName: "TREY", number: 11, role: "разыгрывающий", slot: 2 },
        { id: "bron", team: "blue", name: "БРОН", shortName: "BRON", number: 23, role: "мощный форвард", slot: 3 },
        { id: "zev", team: "blue", name: "ЗЕВ", shortName: "ZEV", number: 33, role: "центр", slot: 4 },
        { id: "drake", team: "red", name: "ДРЕЙК", shortName: "DRAKE", number: 3, role: "защитник", slot: 0 },
        { id: "milo", team: "red", name: "МИЛО", shortName: "MILO", number: 9, role: "центр", slot: 3 },
        { id: "vega", team: "red", name: "ВЕГА", shortName: "VEGA", number: 5, role: "снайпер", slot: 1 },
        { id: "rok", team: "red", name: "РОК", shortName: "ROK", number: 21, role: "форвард", slot: 2 },
        { id: "grom", team: "red", name: "ГРОМ", shortName: "GROM", number: 44, role: "центр", slot: 4 },
      ];
      for (const d of defs) {
        const p = new BB.Player(this.scene, Object.assign({ x: 0, z: 0 }, d));
        p.slot = d.slot || 0;
        this.players.push(p);
        this.playerById[p.id] = p;
        this.teams[p.team].push(p);
      }
      this.user = this.playerById.user;
      this.kai = this.playerById.kai;
      this.trey = this.playerById.trey;
      this.bron = this.playerById.bron;
      this.zev = this.playerById.zev;
      this.drake = this.playerById.drake;
      this.milo = this.playerById.milo;
      this.vega = this.playerById.vega;
      this.rok = this.playerById.rok;
      this.grom = this.playerById.grom;
      this.ais = this.players.filter((p) => !p.isUser).map((p) => {
        const ai = new BB.AI(p, this, this.difficulty);
        this.aiByPlayer[p.id] = ai;
        return ai;
      });
    }

    buildStats() {
      this.stats = {};
      for (const p of this.players) {
        this.stats[p.id] = {
          pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, to: 0, pf: 0,
          fgm: 0, fga: 0, tpm: 0, tpa: 0, ftm: 0, fta: 0,
        };
      }
    }

    hideLoadingSoon() {
      const fill = document.getElementById("loading-fill");
      const note = document.getElementById("loading-note");
      if (fill) fill.style.width = "100%";
      if (note) note.textContent = "паркет готов";
      setTimeout(() => {
        const loading = document.getElementById("loading");
        if (loading) loading.classList.add("is-hidden");
      }, 500);
    }

    /* ============================ UI ============================ */
    initUI() {
      this.ui = {
        menu: document.getElementById("menu"),
        hud: document.getElementById("hud"),
        pause: document.getElementById("pause"),
        help: document.getElementById("help"),
        quarter: document.getElementById("quarter"),
        gameover: document.getElementById("gameover"),
        countdown: document.getElementById("countdown"),
        countdownNum: document.querySelector("#countdown span"),
        tipoffPrompt: document.getElementById("tipoff-prompt"),
        ftPanel: document.getElementById("ft-panel"),
        ftScore: document.getElementById("ft-score"),
        shotMeter: document.getElementById("shot-meter"),
        meterFill: document.getElementById("meter-fill"),
        meterMarker: document.getElementById("meter-marker"),
        meterZone: document.getElementById("meter-zone"),
        meterTip: document.getElementById("meter-tip"),
        context: document.getElementById("context"),
        contextTitle: document.getElementById("context-title"),
        contextSub: document.getElementById("context-sub"),
        hint: document.getElementById("hint"),
        hintText: document.getElementById("hint-text"),
        banner: document.getElementById("banner"),
        bannerTitle: document.getElementById("banner-title"),
        bannerSub: document.getElementById("banner-sub"),
        feed: document.getElementById("event-feed"),
        possession: document.getElementById("possession-chip"),
        staminaFill: document.getElementById("stamina-fill"),
        staminaLabel: document.getElementById("stamina-label"),
        staminaBar: document.getElementById("stamina-bar"),
        shotClock: document.getElementById("shot-clock"),
        shotClockNum: document.querySelector("#shot-clock span"),
        clock: document.getElementById("game-clock"),
        scoreBlue: document.getElementById("score-blue"),
        scoreRed: document.getElementById("score-red"),
        period: document.getElementById("period-label"),
        quarterTitle: document.getElementById("quarter-title"),
        quarterBlue: document.getElementById("quarter-blue"),
        quarterRed: document.getElementById("quarter-red"),
        quarterCount: document.getElementById("quarter-count"),
        radar: document.getElementById("radar"),
        flash: document.getElementById("flash"),
        soundBtn: document.getElementById("sound-toggle"),
        goTitle: document.getElementById("go-title"),
        goKicker: document.getElementById("go-kicker"),
        goBlue: document.getElementById("go-blue"),
        goRed: document.getElementById("go-red"),
        goStats: document.getElementById("go-stats"),
      };
      this.radarCtx = this.ui.radar.getContext("2d");
      this.ui.soundBtn.classList.toggle("is-muted", !!this.muted);
      document.querySelectorAll(".diff-btn").forEach((b) => {
        b.classList.toggle("is-active", b.dataset.diff === this.difficulty);
        b.addEventListener("click", () => this.setDifficulty(b.dataset.diff));
      });
    }

    bindEvents() {
      document.getElementById("btn-start").addEventListener("click", () => {
        this.ensureAudio();
        this.startGame();
      });
      document.getElementById("btn-help").addEventListener("click", () => {
        this.ensureAudio();
        this.openHelp("menu");
      });
      document.getElementById("btn-help-close").addEventListener("click", () => this.closeHelp());
      document.getElementById("btn-pause").addEventListener("click", () => this.pauseGame());
      document.getElementById("btn-cam").addEventListener("click", () => this.toggleCamera());
      document.getElementById("btn-resume").addEventListener("click", () => this.resumeGame());
      document.getElementById("btn-restart").addEventListener("click", () => this.restartGame());
      document.getElementById("btn-quit").addEventListener("click", () => this.quitToMenu());
      document.getElementById("btn-again").addEventListener("click", () => this.restartGame());
      document.getElementById("btn-go-menu").addEventListener("click", () => this.quitToMenu());
      document.getElementById("sound-toggle").addEventListener("click", () => this.toggleSound());
      window.addEventListener("resize", () => this.onResize());
      document.addEventListener("visibilitychange", () => {
        if (document.hidden && ["live", "inbound", "freethrow", "tipoff"].includes(this.state) && !this.paused) {
          this.pauseGame();
        }
      });
      document.fonts.ready.then(() => {
        if (this.arena) this.arena.setBoard(this.scores.blue, this.scores.red, U.formatClock(this.gameClock), this.quarter, Math.ceil(this.shotClock), true);
      });
    }

    bindInput() {
      const block = ["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"];
      window.addEventListener("keydown", (e) => {
        if (block.includes(e.code)) e.preventDefault();
        if (e.repeat) return;
        this.ensureAudio();
        this.keys.add(e.code);
        this.onKeyDown(e.code);
      });
      window.addEventListener("keyup", (e) => {
        this.keys.delete(e.code);
        if (e.code === "KeyJ") this.onShootKeyUp();
      });
      window.addEventListener("blur", () => {
        this.keys.clear();
        if (["live", "inbound", "freethrow", "tipoff"].includes(this.state) && !this.paused && !document.getElementById("help").classList.contains("is-hidden")) {
          // help overlay manages its own pause
        }
      });
    }

    onKeyDown(code) {
      if (code === "KeyM") { this.toggleSound(); return; }
      if (code === "KeyC" && ["live", "inbound", "freethrow", "tipoff", "dead"].includes(this.state)) {
        this.toggleCamera();
        return;
      }
      if (code === "Escape" || code === "KeyP") {
        if (!this.ui.help.classList.contains("is-hidden")) { this.closeHelp(); return; }
        if (this.state === "gameover" || this.state === "menu") return;
        if (this.paused) this.resumeGame(); else this.pauseGame();
        return;
      }
      if (!this.ui.help.classList.contains("is-hidden")) return;
      if (this.state === "menu") {
        if (code === "Enter" || code === "Space") this.startGame();
        if (code === "KeyH") this.openHelp("menu");
        return;
      }
      if (this.paused) return;
      if (this.state === "gameover") return;

      if (code === "KeyJ") this.onShootKeyDown();
      else if (code === "KeyK") this.onPassKey();
      else if (code === "KeyL") this.onStealKey();
      else if (code === "Space") this.onJumpKey();
      else if (code === "KeyQ") this.onTrickKey("crossover");
      else if (code === "KeyE") this.onTrickKey("spin");
      else if (code === "KeyH") this.openHelp("game");
    }

    ensureAudio() {
      this.audio.init();
      if (this.audio.ready) this.audio.setMuted(!!this.muted);
    }

    setDifficulty(name) {
      if (!["rookie", "pro", "legend"].includes(name)) return;
      this.difficulty = name;
      this.ais.forEach((ai) => ai.setDifficulty(name));
      document.querySelectorAll(".diff-btn").forEach((b) => b.classList.toggle("is-active", b.dataset.diff === name));
      try { localStorage.setItem("fullcourt_difficulty", name); } catch (e) { /* ignore */ }
      this.audio.ui();
    }

    toggleSound() {
      this.muted = !this.muted;
      this.ensureAudio();
      this.audio.setMuted(this.muted);
      this.ui.soundBtn.classList.toggle("is-muted", this.muted);
      try { localStorage.setItem("fullcourt_sound", this.muted ? "off" : "on"); } catch (e) { /* ignore */ }
    }

    openHelp(from) {
      this.helpReturn = from;
      if (from === "game") {
        this.helpWasLive = !this.paused;
        this.paused = true;
      } else if (from === "pause") {
        this.ui.pause.classList.add("is-hidden");
      }
      this.ui.help.classList.remove("is-hidden");
      this.audio.ui();
    }

    closeHelp() {
      this.ui.help.classList.add("is-hidden");
      this.audio.ui();
      if (this.helpReturn === "game") {
        if (this.helpWasLive) this.paused = false;
      } else if (this.helpReturn === "pause") {
        this.ui.pause.classList.remove("is-hidden");
      }
      this.helpReturn = null;
    }

    pauseGame() {
      if (!["live", "inbound", "freethrow", "tipoff", "dead", "countdown"].includes(this.state) || this.paused) return;
      this.paused = true;
      this.keys.clear();
      this.ui.pause.classList.remove("is-hidden");
      this.audio.ui();
    }

    resumeGame() {
      if (!this.paused) return;
      this.paused = false;
      this.ui.pause.classList.add("is-hidden");
      this.keys.clear();
      this.audio.resume();
      this.audio.ui();
    }

    restartGame() {
      this.paused = false;
      this.ui.pause.classList.add("is-hidden");
      this.ui.gameover.classList.add("is-hidden");
      this.startGame();
    }

    quitToMenu() {
      this.paused = false;
      this.ui.pause.classList.add("is-hidden");
      this.ui.gameover.classList.add("is-hidden");
      this.ui.quarter.classList.add("is-hidden");
      this.ui.help.classList.add("is-hidden");
      this.ui.hud.classList.add("is-hidden");
      this.ui.menu.classList.remove("is-hidden");
      this.hideContext();
      this.charge = null;
      this.state = "menu";
      this.setupMenuScene();
    }

    toggleCamera() {
      this.cameraMode = (this.cameraMode + 1) % 2;
      this.feed(this.cameraMode === 0 ? "КАМЕРА: ТРАНСЛЯЦИЯ" : "КАМЕРА: НИЗКАЯ", "is-warn");
      this.audio.ui();
    }

    /* ============================ FLOW ============================ */
    setupMenuScene() {
      this.state = "menu";
      this.paused = false;
      this.ball.reset();
      this.ball.mesh.visible = true;
      this.ball.shadow.visible = true;
      const spots = [
        [this.user, -3.3, 1.6, 0.25],
        [this.kai, -0.5, -2.7, 0.45],
        [this.trey, -6.2, -2.5, 0.18],
        [this.bron, -8.5, 0.8, 0.32],
        [this.zev, -6.4, 4.1, 0.06],
        [this.drake, 3.1, 2.4, -0.25],
        [this.milo, 6.0, -1.6, 0.1],
        [this.vega, 1.4, -3.4, -0.32],
        [this.rok, 7.6, 3.4, -0.2],
        [this.grom, 9.0, -3.4, -0.08],
      ];
      for (const [p, x, z, face] of spots) {
        p.stamina = 100;
        p.reset(x, z, face);
        p.marker.visible = false;
        p.label.visible = false;
        p.blob.visible = true;
        p.hasBall = false;
        p.lookTarget.set(0, 1.1, 0);
        p.targetFacing = face;
      }
      this.ball.reset();
      this.ball.giveTo(this.user);
      this.ball.mesh.visible = true;
      this.ball.shadow.visible = true;
      this.user.marker.visible = false;
      this.ui.hud.classList.add("is-hidden");
      this.ui.menu.classList.remove("is-hidden");
      this.ui.pause.classList.add("is-hidden");
      this.ui.gameover.classList.add("is-hidden");
      this.ui.quarter.classList.add("is-hidden");
      this.ui.help.classList.add("is-hidden");
      this.ui.countdown.classList.add("is-hidden");
      this.ui.banner.classList.add("is-hidden");
      this.ui.feed.innerHTML = "";
      this.ui.ftPanel.classList.add("is-hidden");
      this.ui.shotMeter.classList.add("is-hidden");
      this.ui.tipoffPrompt.classList.add("is-hidden");
      this.menuTime = 0;
      this.cameraMode = 0;
      this.scores.blue = this.scores.red = 0;
      this.quarter = 1;
      this.gameClock = QUARTER_LENGTH;
      this.shotClock = 24;
      this.arena.setBoard(0, 0, "2:00", 1, 24, true);
    }

    startGame() {
      this.ensureAudio();
      this.audio.resume();
      this.ui.menu.classList.add("is-hidden");
      this.ui.hud.classList.remove("is-hidden");
      this.ui.help.classList.add("is-hidden");
      this.ui.gameover.classList.add("is-hidden");
      this.ui.quarter.classList.add("is-hidden");
      this.ui.pause.classList.add("is-hidden");
      this.resetMatch();
      this.startCountdown();
    }

    resetMatch() {
      this.scores.blue = 0;
      this.scores.red = 0;
      this.teamFouls.blue = 0;
      this.teamFouls.red = 0;
      this.quarter = 1;
      this.gameClock = QUARTER_LENGTH;
      this.shotClock = 24;
      this.possession = "blue";
      this.buildStats();
      this.ball.reset();
      this.ball.mesh.visible = false;
      this.ball.shadow.visible = false;
      this.ft = null;
      this.freeThrows = null;
      this.charge = null;
      this.inbounder = null;
      this.inboundReceiver = null;
      this.inboundReceiveSpot = null;
      this.shotInAir = false;
      this.clockExpired = false;
      this.interceptIntent = 0;
      this.deadTimer = 0;
      this.deadCallback = null;
      this.quarterTimer = 0;
      this.lastPass = null;
      this.lastBasket = null;
      this.tipTime = 0;
      this.tipPlayerA = this.user;
      this.tipPlayerB = this.drake;
      this.ui.feed.innerHTML = "";
      this.ui.banner.classList.add("is-hidden");
      this.ui.ftPanel.classList.add("is-hidden");
      this.ui.shotMeter.classList.add("is-hidden");
      this.ui.tipoffPrompt.classList.add("is-hidden");
      for (const p of this.players) {
        p.stamina = 100;
        p.reset(0, 0, p.team === "blue" ? Math.PI / 2 : -Math.PI / 2);
        p.marker.visible = true;
        p.label.visible = true;
        p.shotPending = null;
        p.hasBall = false;
        p.action = null;
        p.stunTimer = 0;
        p.defender = null;
      }
      this.user.marker.visible = true;
      this.ais.forEach((ai) => {
        ai.think = Math.random() * 0.4;
        ai.stealCd = 1 + Math.random();
        ai.jumpCd = 0;
        ai.trickCd = 1.5 + Math.random();
        ai.cutCd = 2 + Math.random() * 2;
        ai.spot.set(0, 0, 0);
      });
      this.updateScoreUI(true);
      this.arena.setBoard(0, 0, U.formatClock(this.gameClock), 1, 24, true);
      this.ui.possession.textContent = "ВАШ МЯЧ";
      this.ui.possession.classList.remove("is-red");
      this.placeForCountdown();
    }

    placeForCountdown() {
      const blue = [
        [-1.0, 0],
        [-4.4, 4.2],
        [-4.8, -3.9],
        [-7.9, 1.7],
        [-8.8, -1.8],
      ];
      const red = [
        [1.0, 0],
        [4.4, -4.2],
        [4.8, 3.9],
        [7.9, -1.7],
        [8.8, 1.8],
      ];
      this.teams.blue.forEach((p, i) => {
        const s = blue[i] || blue[blue.length - 1];
        this.softResetPlayer(p, s[0], s[1], Math.PI / 2);
        p.lookTarget.set(0, 2.4, 0);
      });
      this.teams.red.forEach((p, i) => {
        const s = red[i] || red[red.length - 1];
        this.softResetPlayer(p, s[0], s[1], -Math.PI / 2);
        p.lookTarget.set(0, 2.4, 0);
      });
      this.ball.reset();
      this.ball.mesh.visible = false;
      this.ball.shadow.visible = false;
    }

    startCountdown() {
      this.state = "countdown";
      this.countdownTimer = 3.0;
      this.lastCount = 4;
      this.ui.countdown.classList.remove("is-hidden");
      this.showCountdownNumber(3);
      this.audio.countdown(3);
      this.updateScoreUI(true);
    }

    showCountdownNumber(n) {
      const span = this.ui.countdownNum;
      if (!span) return;
      span.textContent = String(n);
      span.style.animation = "none";
      void span.offsetWidth;
      span.style.animation = "";
    }

    updateCountdown(dt) {
      this.updatePlayersIdle(dt);
      this.countdownTimer -= dt;
      const n = Math.max(1, Math.ceil(this.countdownTimer));
      if (n !== this.lastCount && this.countdownTimer > 0) {
        this.lastCount = n;
        this.showCountdownNumber(n);
        this.audio.countdown(n);
      }
      if (this.countdownTimer <= 0) {
        this.ui.countdown.classList.add("is-hidden");
        this.startTipoff();
      }
    }

    updateMenu(dt) {
      this.menuTime += dt;
      this.updatePlayersIdle(dt);
      this.user.dribblePhase += dt * 0.4;
      this.camera.position.set(
        -1.4 + Math.sin(this.menuTime * 0.16) * 2.4,
        6.0 + Math.sin(this.menuTime * 0.23) * 0.4,
        12.7 + Math.cos(this.menuTime * 0.16) * 0.8
      );
      this.camLook.set(0.6 + Math.sin(this.menuTime * 0.08) * 0.5, 1.35, 0);
      this.camera.lookAt(this.camLook);
    }

    updatePlayersIdle(dt) {
      for (const p of this.players) {
        p.setInput(0, 0, false);
        if (this.state === "menu") {
          p.lookTarget.set(0, 1.15, 0);
        } else {
          p.lookTarget.copy(this.ball.mesh.position);
        }
        p.update(dt, this.elapsed, this);
      }
      if (this.ball.state !== "dead") this.ball.update(dt, this);
    }

    /* ============================ LOOP / CAMERA ============================ */
    loop() {
      requestAnimationFrame(this.loop);
      const dt = Math.min(this.clock.getDelta(), 0.05);
      this.elapsed += dt;
      if (!this.paused) {
        this.arena.update(dt, this.elapsed);
        this.update(dt);
      }
      this.renderer.render(this.scene, this.camera);
    }

    update(dt) {
      if (this.state === "menu") {
        this.updateMenu(dt);
      } else if (this.state === "countdown") {
        this.updateCountdown(dt);
      } else if (this.state === "tipoff") {
        this.updateTipoff(dt);
      } else if (this.state === "live") {
        this.updateLive(dt);
      } else if (this.state === "inbound") {
        this.updateInbound(dt);
      } else if (this.state === "freethrow") {
        this.updateFreeThrow(dt);
      } else if (this.state === "dead") {
        this.updateDead(dt);
      } else if (this.state === "quarter") {
        this.updateQuarter(dt);
      } else if (this.state === "gameover") {
        this.updateGameOver(dt);
      }
      this.updateCamera(dt);
      this.updateHud(dt);
    }

    updateCamera(dt) {
      if (this.state === "menu") return;
      const b = this.ball.mesh.position;
      let target = this.camTarget;
      let look = this.camLook;
      if (this.state === "gameover") {
        const t = this.elapsed;
        target.set(Math.sin(t * 0.12) * 4.5, 6.4, 11.9 + Math.cos(t * 0.12) * 1.0);
        look.set(0, 1.6, 0);
      } else if (this.state === "quarter") {
        target.set(0.5, 7.0, 12.9);
        look.set(0, 1.8, 0);
      } else if (this.state === "freethrow" && this.ft) {
        const sx = this.ft.shooter.root.position.x;
        target.set(U.clamp(sx * 0.55, -6.5, 6.5), 7.2, 12.9);
        look.set(sx * 0.72, 1.8, 0);
      } else if (this.state === "tipoff") {
        target.set(0, 7.2, 12.4);
        look.set(0, 2.3, 0);
      } else {
        let focusX = b.x;
        if (this.state === "inbound" && this.inbounder) {
          focusX = (b.x + this.inboundReceiver.root.position.x * 0.35) * 0.6;
        }
        const tx = U.clamp(focusX * 0.55, -7.8, 7.8);
        if (this.cameraMode === 0) {
          target.set(tx, 8.0, 13.0);
          look.set(U.clamp(focusX * 0.62, -8.5, 8.5), 1.55, 0);
        } else {
          target.set(tx * 1.06, 6.2, 12.5);
          look.set(U.clamp(focusX * 0.68, -9, 9), 1.7, 0);
        }
      }
      const lam = this.state === "menu" ? 100 : (this.state === "tipoff" || this.state === "freethrow" ? 3.2 : 4.2);
      this.camera.position.x = U.damp(this.camera.position.x, target.x, lam, dt);
      this.camera.position.y = U.damp(this.camera.position.y, target.y, lam, dt);
      this.camera.position.z = U.damp(this.camera.position.z, target.z, lam, dt);
      this.camLook.x = U.damp(this.camLook.x, look.x, lam + 1, dt);
      this.camLook.y = U.damp(this.camLook.y, look.y, lam + 1, dt);
      this.camLook.z = U.damp(this.camLook.z, look.z, lam + 1, dt);
      const shake = this.shake;
      if (shake > 0.001) {
        this.camera.position.x += U.rand(-shake, shake);
        this.camera.position.y += U.rand(-shake, shake) * 0.7;
        this.camera.position.z += U.rand(-shake, shake) * 0.45;
        this.shake *= Math.exp(-7 * dt);
      }
      this.camera.lookAt(this.camLook);
    }

    addShake(v) {
      this.shake = Math.max(this.shake, v);
    }

    onResize() {
      const w = window.innerWidth, h = window.innerHeight;
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.8));
      this.renderer.setSize(w, h, false);
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
    }

    /* ============================ HUD ============================ */
    updateScoreUI(force = false) {
      const s = this.scores;
      this.setText(this.ui.scoreBlue, String(s.blue));
      this.setText(this.ui.scoreRed, String(s.red));
      this.setText(this.ui.clock, U.formatClockTenth(this.gameClock));
      this.setText(this.ui.shotClockNum, String(Math.max(0, Math.ceil(this.shotClock))));
      const q = this.quarter;
      this.setText(this.ui.period, q <= 4 ? `${q}-Я ЧЕТВЕРТЬ` : `ОВЕРТАЙМ ${q - 4}`);
      this.ui.shotClock.classList.toggle("is-low", this.shotClock <= 5 && this.state === "live");
      this.ui.possession.textContent = this.possession === "blue" ? "ВАШ МЯЧ" : "МЯЧ СОПЕРНИКА";
      this.ui.possession.classList.toggle("is-red", this.possession === "red");
      this.arenaClockTimer -= 1;
      if (this.arenaClockTimer <= 0 || force) {
        this.arenaClockTimer = 12;
        if (this.arena) this.arena.setBoard(s.blue, s.red, U.formatClock(this.gameClock), this.quarter, Math.max(0, Math.ceil(this.shotClock)), force);
      }
    }

    setText(el, text) {
      if (el && el.textContent !== text) el.textContent = text;
    }

    updateHud(dt) {
      if (this.state === "menu") return;
      this.updateScoreUI(false);
      const p = this.user;
      const st = Math.round(p.stamina);
      this.ui.staminaLabel.textContent = String(st);
      this.ui.staminaFill.style.transform = `scaleX(${U.clamp(p.stamina / 100, 0, 1)})`;
      this.ui.staminaBar.style.setProperty("--v", `${st}%`);
      this.updateRadar();

      // shot meter
      if (this.charge && this.charge.active) {
        this.ui.shotMeter.classList.remove("is-hidden");
        const power = this.charge.power;
        this.ui.meterFill.style.width = `${power * 100}%`;
        this.ui.meterMarker.style.left = `${power * 100}%`;
        const win = this.greenWindowFor
          ? this.greenWindowFor(this.user, { freeThrow: !!this.charge.freeThrow })
          : { min: 0.63, max: 0.69, width: 0.06 };
        if (this.ui.meterZone) {
          this.ui.meterZone.style.left = `${win.min * 100}%`;
          this.ui.meterZone.style.width = `${win.width * 100}%`;
        }
        const green = power >= win.min && power <= win.max;
        this.ui.shotMeter.classList.toggle("is-good", green);
        this.ui.meterTip.textContent = green
          ? "ИДЕАЛЬНЫЙ ВЫПУСК — шанс выше, но не 100%"
          : power > win.max
            ? "поздно — бросок уплывёт"
            : "отпусти в зелёной зоне";
      } else {
        this.ui.shotMeter.classList.add("is-hidden");
      }

      // free throws
      if (this.state === "freethrow" && this.ft) {
        this.ui.ftPanel.classList.remove("is-hidden");
        const attempt = this.ft.total - this.ft.remaining + 1;
        this.setText(this.ui.ftScore, `${Math.min(attempt, this.ft.total)} / ${this.ft.total}`);
      } else {
        this.ui.ftPanel.classList.add("is-hidden");
      }

      // tipoff prompt
      this.ui.tipoffPrompt.classList.toggle("is-hidden", this.state !== "tipoff");

      this.updateHints();
    }

    updateHints() {
      const p = this.user;
      let hintKey = "WASD", hintText = "движение";
      if (this.state === "tipoff") {
        hintKey = "SPACE";
        hintText = "выпрыгни за мяч";
      } else if (this.state === "inbound") {
        if (this.inbounder === p) { hintKey = "K"; hintText = "вброс из-за линии"; }
        else {
          hintKey = "K";
          hintText = this.inbounder && this.inbounder.team !== p.team ? "перехвати передачу" : "откройся под пас";
        }
      } else if (this.state === "freethrow" && this.ft) {
        if (this.ft.shooter === p && this.ft.phase === "ready") { hintKey = "J"; hintText = "удерживай и отпусти в зелёной зоне"; }
        else { hintKey = "·"; hintText = "штрафной бросок"; }
      } else if (this.state === "live") {
        if (p.hasBall) {
          hintKey = "J";
          hintText = this.charge && this.charge.active ? "отпусти для броска" : "бросок · K пас · Q/E трюки";
        } else if (this.ball.holder && this.ball.holder.team === p.team && !this.ball.holder.isUser) {
          hintKey = "K";
          hintText = "попросить мяч";
        } else if (this.ball.state === "shot" || this.ball.state === "pass") {
          hintKey = "SPACE";
          hintText = "прыжок на подбор / блок";
        } else if (this.ball.holder) {
          hintKey = "L";
          hintText = "отбор · SPACE прыжок";
        } else {
          hintKey = "WASD";
          hintText = "беги за мячом";
        }
      } else if (this.state === "dead") {
        hintKey = "·";
        hintText = "свисток";
      } else {
        hintKey = "WASD";
        hintText = "движение";
      }
      if (this.ui.hintText.textContent !== hintText) this.ui.hintText.textContent = hintText;
      const keyEl = this.ui.hint.querySelector(".hint-key");
      if (keyEl && keyEl.textContent !== hintKey) keyEl.textContent = hintKey;

      // contextual prompt
      let ctxTitle = "", ctxSub = "";
      if (this.state === "live") {
        if (p.hasBall) {
          const mate = this.bestPassTarget ? this.bestPassTarget(p, { preferForward: true }) : this.teammateOf(p);
          if (mate) {
            const mateDef = this.nearestOpponentTo(mate);
            const open = !mateDef || U.dist2D(mate.root.position, mateDef.root.position) > 1.8;
            ctxTitle = "ПАС ПАРТНЁРУ";
            ctxSub = open ? "нажми K — " + mate.shortName + " открыт" : "нажми K — пас на ход";
          }
        } else if (this.ball.holder && this.ball.holder.team === p.team && !this.ball.holder.isUser) {
          const myDef = this.nearestOpponentTo(p);
          const open = !myDef || U.dist2D(p.root.position, myDef.root.position) > 1.55;
          if (open) { ctxTitle = "ЗАПРОСИТЬ МЯЧ"; ctxSub = "нажми K — партнёр ищет тебя"; }
        } else if (this.ball.holder && this.ball.holder.team === "red") {
          const d = U.dist2D(p.root.position, this.ball.holder.root.position);
          if (d < 1.7) { ctxTitle = "ОТБОР"; ctxSub = "нажми L"; }
        } else if (this.ball.state === "pass" || this.ball.state === "shot") {
          ctxTitle = this.ball.state === "pass" ? "ПЕРЕХВАТ" : "БЛОК / ПОДБОР";
          ctxSub = "SPACE или L";
        }
      } else if (this.state === "inbound" && this.inbounder === p) {
        ctxTitle = "ВБРОС"; ctxSub = "K — передать партнёру · 5 секунд";
      } else if (this.state === "freethrow" && this.ft && this.ft.shooter === p && this.ft.phase === "ready") {
        ctxTitle = "ШТРАФНОЙ"; ctxSub = "J — бросок";
      }
      if (ctxTitle) this.showContext(ctxTitle, ctxSub); else this.hideContext();
    }

    showContext(title, sub) {
      if (this.ui.contextTitle.textContent !== title) this.ui.contextTitle.textContent = title;
      if (this.ui.contextSub.textContent !== sub) this.ui.contextSub.textContent = sub;
      this.ui.context.classList.remove("is-hidden");
    }

    hideContext() {
      this.ui.context.classList.add("is-hidden");
    }

    updateRadar() {
      const ctx = this.radarCtx;
      const W = 220, H = 130;
      ctx.clearRect(0, 0, W, H);
      const mx = 12, my = 12;
      const sx = (W - mx * 2) / (C.halfL * 2);
      const sz = (H - my * 2) / (C.halfW * 2);
      const X = (x) => mx + (x + C.halfL) * sx;
      const Z = (z) => my + (z + C.halfW) * sz;
      ctx.fillStyle = "rgba(9,16,26,.85)";
      ctx.fillRect(mx, my, W - mx * 2, H - my * 2);
      ctx.strokeStyle = "rgba(255,255,255,.2)";
      ctx.lineWidth = 1;
      ctx.strokeRect(mx, my, W - mx * 2, H - my * 2);
      ctx.beginPath();
      ctx.moveTo(W / 2, my); ctx.lineTo(W / 2, H - my);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(W / 2, H / 2, 10, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = "rgba(53,183,255,.12)";
      ctx.fillRect(mx, (H - 30) / 2, 15, 30);
      ctx.fillStyle = "rgba(255,59,79,.12)";
      ctx.fillRect(W - mx - 15, (H - 30) / 2, 15, 30);
      for (const hoop of [{ x: -C.rimX, c: "#ff5a4f" }, { x: C.rimX, c: "#35b7ff" }]) {
        ctx.fillStyle = hoop.c;
        ctx.beginPath();
        ctx.arc(X(hoop.x), Z(0), 2.4, 0, Math.PI * 2);
        ctx.fill();
      }
      for (const p of this.players) {
        const px = X(p.root.position.x);
        const pz = Z(p.root.position.z);
        const col = p.team === "blue" ? "#35b7ff" : "#ff3b4f";
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.arc(px, pz, p.isUser ? 4.2 : 3.2, 0, Math.PI * 2);
        ctx.fill();
        if (p.isUser) {
          ctx.strokeStyle = "rgba(200,255,61,.9)";
          ctx.lineWidth = 1.6;
          ctx.beginPath();
          ctx.arc(px, pz, 6.5, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
      if (this.ball.mesh.visible) {
        ctx.fillStyle = "#ff9f43";
        ctx.beginPath();
        ctx.arc(X(this.ball.mesh.position.x), Z(this.ball.mesh.position.z), 2.7, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "rgba(255,159,67,.55)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(X(this.ball.mesh.position.x), Z(this.ball.mesh.position.z), 5.5, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    feed(text, cls = "") {
      const el = document.createElement("div");
      el.className = "feed-item " + cls;
      el.innerHTML = text;
      this.ui.feed.prepend(el);
      while (this.ui.feed.children.length > 4) this.ui.feed.lastChild.remove();
      setTimeout(() => {
        el.style.transition = "opacity .3s";
        el.style.opacity = "0";
        setTimeout(() => el.remove(), 320);
      }, 3200);
    }

    showBanner(title, sub, cls = "", dur = 1.9) {
      const b = this.ui.banner;
      b.classList.add("is-hidden");
      clearTimeout(this.bannerTimerId);
      this.ui.bannerTitle.textContent = title;
      this.ui.bannerSub.textContent = sub || "";
      b.className = "banner " + cls;
      void b.offsetWidth;
      b.classList.remove("is-hidden");
      this.bannerTimerId = setTimeout(() => b.classList.add("is-hidden"), dur * 1000);
    }

    flash() {
      const f = this.ui.flash;
      f.classList.remove("pop");
      void f.offsetWidth;
      f.classList.add("pop");
    }

    statOf(player) {
      return this.stats[player.id];
    }

    placePlayer(p, x, z, face) {
      p.root.position.set(x, 0, z);
      p.vel.set(0, 0, 0);
      p.speed = 0;
      p.jumpY = 0;
      p.jumpVel = 0;
      p.grounded = true;
      p.stunned = 0;
      p.action = null;
      p.actionTime = 0;
      p.shotPending = null;
      p.hasBall = false;
      p.targetFacing = face;
      p.facing = face;
      p.root.rotation.y = face;
      p.root.position.y = 0;
    }

    softResetPlayer(p, x, z, face) {
      this.placePlayer(p, x, z, face);
      p.marker.position.set(x, 0.026, z);
      p.label.position.set(x, 2.3, z);
      p.blob.position.set(x, 0.022, z);
    }

    getOpponentTeam(team) {
      return team === "blue" ? "red" : "blue";
    }

    /* ============================ GAME OVER ============================ */
    updateGameOver(dt) {
      this.updatePlayersIdle(dt);
      for (const p of this.players) {
        if (this.winner === "blue") {
          if (p.team === "blue" && !p.isAction("celebrate")) p.playAction("celebrate", 10, { loop: true });
          if (p.team === "red" && !p.isAction("dejected")) p.playAction("dejected", 10, { loop: true });
        } else {
          if (p.team === "red" && !p.isAction("celebrate")) p.playAction("celebrate", 10, { loop: true });
          if (p.team === "blue" && !p.isAction("dejected")) p.playAction("dejected", 10, { loop: true });
        }
      }
    }

    showGameOver() {
      if (this.state === "gameover") return;
      this.state = "gameover";
      this.paused = false;
      this.ball.mesh.visible = false;
      this.ball.shadow.visible = false;
      this.charge = null;
      this.ui.hud.classList.add("is-hidden");
      this.ui.shotMeter.classList.add("is-hidden");
      this.ui.ftPanel.classList.add("is-hidden");
      this.ui.tipoffPrompt.classList.add("is-hidden");
      this.hideContext();
      this.winner = this.scores.blue > this.scores.red ? "blue" : "red";
      this.ui.goTitle.textContent = this.winner === "blue" ? "ПОБЕДА" : "ПОРАЖЕНИЕ";
      this.ui.goTitle.classList.toggle("is-loss", this.winner !== "blue");
      this.ui.goKicker.textContent = this.winner === "blue" ? "ФИНАЛЬНЫЙ СВИСТОК · SHARKS" : "ФИНАЛЬНЫЙ СВИСТОК · TIGERS";
      this.ui.goBlue.textContent = String(this.scores.blue);
      this.ui.goRed.textContent = String(this.scores.red);
      const mvps = [...this.players].sort((a, b) => this.stats[b.id].pts - this.stats[a.id].pts);
      const mvp = mvps[0];
      const rows = [];
      for (const p of this.players) {
        const s = this.stats[p.id];
        rows.push(`<div class="go-stat-row"><span>${p.team === "blue" ? "▲" : "▼"} ${p.name} · ${s.pts} очк</span><b>${s.reb} подб · ${s.ast} пас · ${s.stl} отб · ${s.blk} блок</b></div>`);
      }
      rows.push(`<div class="go-stat-row"><span>ЛУЧШИЙ ИГРОК</span><b>${mvp.name} · ${this.stats[mvp.id].pts} очк</b></div>`);
      this.ui.goStats.innerHTML = rows.join("");
      this.ui.gameover.classList.remove("is-hidden");
      this.audio.buzzer();
      this.audio.cheer(1.2, 4);
      if (this.winner === "blue") this.arena.celebrate();
      this.arena.crowdCheer(1.2, 5);
      this.flash();
    }
  }

  BB.Game = Game;
  BB.QUARTER_LENGTH = QUARTER_LENGTH;
  BB.OT_LENGTH = OT_LENGTH;
})();
