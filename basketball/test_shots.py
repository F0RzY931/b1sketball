from selenium import webdriver
from selenium.webdriver.edge.options import Options
import time, json

opts = Options()
opts.add_argument("--headless=new")
opts.add_argument("--disable-gpu")
opts.add_argument("--window-size=1280,900")
d = webdriver.Edge(options=opts)
d.get("http://127.0.0.1:8422/?t=" + str(time.time()))
for _ in range(20):
    time.sleep(0.5)
    if d.execute_script("return !!window.game"):
        break

d.execute_script("window.game.difficulty='rookie'; window.game.startGame();")
time.sleep(4.2)

# Put the game into a controlled live state for headless shot simulation.
d.execute_script(r"""
window.simShots = function (spec) {
  const g = window.game;
  const p = g.user;
  const hoop = g.hoopFor(p.team);
  const old = {
    paused: g.paused,
    state: g.state,
    ais: g.ais,
    hud: g.updateHud,
    cam: g.updateCamera,
    deadTimer: g.deadTimer,
    deadCallback: g.deadCallback,
    gameClock: g.gameClock,
    shotClock: g.shotClock,
    quarter: g.quarter,
  };
  g.paused = true;
  g.updateHud = function () {};
  g.updateCamera = function () {};
  g.ais = [];
  g.state = "live";
  g.possession = "blue";
  g.gameClock = 120;
  g.shotClock = 24;
  g.quarter = 1;
  g.deadTimer = 0;
  g.deadCallback = null;
  g.ft = null;
  g.freeThrows = null;
  // Move every non-user player out of the play and keep them from
  // intercepting or grabbing rebounds during the sample.
  for (const q of g.players) {
    q.stunned = q === p ? 0 : 9999;
    q.setInput(0, 0, false);
    if (q !== p) {
      q.root.position.set(-hoop.x * 0.55, 0, q.root.position.z >= 0 ? 6.4 : -6.4);
      q.hasBall = false;
    }
  }
  const results = [];
  for (const s of spec) {
    let made = 0;
    let rim = 0;
    let blocked = 0;
    let chanceSum = 0;
    let flagMade = 0;
    let flagMissed = 0;
    let luckMade = 0;
    let bothMissed = 0;
    for (let n = 0; n < s.n; n++) {
      p.root.position.set(hoop.x - s.dist, 0, 0);
      p.speed = 0;
      p.stamina = 100;
      p.hasBall = false;
      p.shotPending = false;
      p.action = null;
      p.stunTimer = 0;
      p.jumpY = 0;
      g.ball.reset();
      g.ball.giveTo(p);
      g.state = "live";
      g.possession = "blue";
      g.gameClock = 120;
      g.shotClock = 24;
      g.shotInAir = false;
      g.reboundActive = false;
      g.lastShotInfo = null;
      g.pendingShots = {};
      g.deadTimer = 0;
      g.deadCallback = null;
      const power = s.power === "green"
        ? g.greenWindowFor(p, { freeThrow: !!s.freeThrow }).center
        : s.power;
      const info = g.evaluateShot(p, power, {
        freeThrow: !!s.freeThrow,
        aiQuality: s.aiQuality,
      });
      chanceSum += info.makeChance;
      const before = g.scores.blue;
      const launched = g.launchShot(p, info, { freeThrow: !!s.freeThrow });
      if (!launched) { results.push({ error: "launch failed", s }); break; }
      const flag = !!(g.ball.shot && g.ball.shot.make);
      let steps = 0;
      while (g.ball.state === "shot" && steps < 360) {
        g.elapsed += 1 / 60;
        g.update(1 / 60);
        steps++;
      }
      const scored = g.scores.blue > before;
      if (scored) made++;
      if (scored && flag) flagMade++;
      else if (scored) luckMade++;
      else if (flag) flagMissed++;
      else bothMissed++;
      if (g.ball.shot && g.ball.shot.rimHit) rim++;
      if (g.ball.shot && g.ball.shot.blocker) blocked++;
    }
    results.push({
      dist: s.dist, type: s.type || null, power: s.power, n: s.n,
      made, pct: +(made / s.n).toFixed(3), rim, blocked,
      avgChance: +(chanceSum / s.n).toFixed(3),
      flagMade, flagMissed, luckMade, bothMissed,
    });
  }
  // restore
  g.paused = old.paused;
  g.state = old.state;
  g.ais = old.ais;
  g.updateHud = old.hud;
  g.updateCamera = old.cam;
  g.deadTimer = old.deadTimer;
  g.deadCallback = old.deadCallback;
  g.gameClock = old.gameClock;
  g.shotClock = old.shotClock;
  g.quarter = old.quarter;
  return JSON.stringify(results);
};
""")

spec = [
    {"dist": 2.5, "power": "green", "n": 100},
    {"dist": 4.0, "power": "green", "n": 100},
    {"dist": 5.5, "power": "green", "n": 100},
    {"dist": 6.75, "power": "green", "n": 100},
    {"dist": 9.5, "power": "green", "n": 100},
    {"dist": 4.0, "power": 0.54, "n": 100},
    {"dist": 6.75, "power": "green", "n": 100, "freeThrow": True, "aiQuality": 1.0},
]
res = d.execute_script("return window.simShots(arguments[0])", spec)
print(json.dumps(json.loads(res), ensure_ascii=False, indent=2))
d.quit()
