/* FULL COURT — shared constants, math helpers and procedural textures */
(function () {
  "use strict";
  const BB = (window.BB = window.BB || {});

  BB.COURT = {
    halfL: 14.0,
    halfW: 7.5,
    rimX: 12.425,
    rimY: 3.05,
    rimRadius: 0.2286,
    rimTube: 0.022,
    backboardX: 12.8,
    backboardHalfW: 0.9,
    backboardBottom: 2.9,
    backboardTop: 3.95,
    ballRadius: 0.122,
    threeRadius: 6.75,
    keyHalfW: 2.45,
    ftX: 8.2,
    centerCircle: 1.8,
    playerRadius: 0.36,
  };

  BB.TEAM = {
    blue: {
      name: "SHARKS",
      color: 0x2da9ff,
      deep: 0x073b70,
      accent: 0xe9f8ff,
      trim: 0x0a1d33,
      attackDir: 1,
      hoopX: BB.COURT.rimX,
    },
    red: {
      name: "TIGERS",
      color: 0xff354d,
      deep: 0x5c0714,
      accent: 0xffe6e8,
      trim: 0x25050a,
      attackDir: -1,
      hoopX: -BB.COURT.rimX,
    },
  };

  const U = (BB.util = {});

  U.clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  U.lerp = (a, b, t) => a + (b - a) * t;
  U.invLerp = (a, b, v) => U.clamp((v - a) / (b - a), 0, 1);
  U.smoothstep = (t) => { t = U.clamp(t, 0, 1); return t * t * (3 - 2 * t); };
  U.easeOutCubic = (t) => 1 - Math.pow(1 - U.clamp(t, 0, 1), 3);
  U.easeInOutCubic = (t) => {
    t = U.clamp(t, 0, 1);
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  };
  U.damp = (a, b, lambda, dt) => U.lerp(a, b, 1 - Math.exp(-lambda * dt));
  U.dampVec = (out, target, lambda, dt) => {
    out.x = U.damp(out.x, target.x, lambda, dt);
    out.y = U.damp(out.y, target.y, lambda, dt);
    out.z = U.damp(out.z, target.z, lambda, dt);
    return out;
  };
  U.wrapAngle = (a) => {
    a = (a + Math.PI) % (Math.PI * 2);
    if (a < 0) a += Math.PI * 2;
    return a - Math.PI;
  };
  U.dampAngle = (a, b, lambda, dt) => {
    const d = U.wrapAngle(b - a);
    return a + d * (1 - Math.exp(-lambda * dt));
  };
  U.rand = (a = 0, b = 1) => a + Math.random() * (b - a);
  U.randInt = (a, b) => Math.floor(U.rand(a, b + 1));
  U.chance = (p) => Math.random() < p;
  U.pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  U.dist2D = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
  U.dist2Dxz = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);
  U.dist3D = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
  U.hypot = (a = 0, b = 0) => Math.hypot(a, b);
  U.gaussian = () => {
    let u = 0, v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(Math.PI * 2 * v);
  };
  U.segmentPointDist = (ax, az, bx, bz, px, pz) => {
    const dx = bx - ax, dz = bz - az;
    const l2 = dx * dx + dz * dz;
    if (l2 < 1e-8) return Math.hypot(px - ax, pz - az);
    let t = ((px - ax) * dx + (pz - az) * dz) / l2;
    t = U.clamp(t, 0, 1);
    return Math.hypot(px - (ax + dx * t), pz - (az + dz * t));
  };
  U.formatClock = (sec) => {
    sec = Math.max(0, sec);
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return m + ":" + (s < 10 ? "0" : "") + s;
  };
  U.formatClockTenth = (sec) => {
    sec = Math.max(0, sec);
    if (sec < 60 && sec % 1 > 0.001) {
      const s = Math.floor(sec);
      return "0:" + (s < 10 ? "0" : "") + s + "." + Math.floor((sec % 1) * 10);
    }
    return U.formatClock(sec);
  };
  U.vec = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
  U.horizontal = (v) => new THREE.Vector3(v.x, 0, v.z);
  U.angleTo = (dx, dz) => Math.atan2(dx, dz);

  U.roundRect = (ctx, x, y, w, h, r) => {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  };

  U.canvas = (w, h) => {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    return c;
  };
  U.texture = (canvas, srgb = true) => {
    const t = new THREE.CanvasTexture(canvas);
    if (srgb) t.encoding = THREE.sRGBEncoding;
    t.anisotropy = 8;
    return t;
  };

  /* -------- parquet court texture -------- */
  U.woodCourtTexture = () => {
    const w = 2048, h = 1024;
    const c = U.canvas(w, h);
    const ctx = c.getContext("2d");
    const grad = ctx.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, "#8a5a32");
    grad.addColorStop(0.5, "#a06d3c");
    grad.addColorStop(1, "#7c4c2a");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
    const rowH = 34;
    for (let row = 0; row < h / rowH; row++) {
      const y = row * rowH;
      let x = -((row % 3) * 110);
      while (x < w) {
        const len = 150 + Math.random() * 260;
        const t = Math.random();
        const r = Math.floor(120 + t * 42);
        const g = Math.floor(80 + t * 30);
        const b = Math.floor(44 + t * 22);
        ctx.fillStyle = `rgb(${r},${g},${b})`;
        ctx.fillRect(x + 1, y + 1, len - 2, rowH - 2);
        // grain
        ctx.strokeStyle = `rgba(${r + 20},${g + 14},${b + 6},${0.16 + Math.random() * 0.14})`;
        ctx.lineWidth = 1;
        for (let i = 0; i < 5; i++) {
          const gy = y + 4 + Math.random() * (rowH - 8);
          ctx.beginPath();
          ctx.moveTo(x + 4, gy);
          for (let gx = 0; gx < len; gx += 20) {
            ctx.lineTo(x + 4 + gx, gy + Math.sin(gx * 0.03 + row) * 1.4 + (Math.random() - 0.5) * 1.1);
          }
          ctx.stroke();
        }
        // joints
        ctx.fillStyle = "rgba(30,16,8,.35)";
        ctx.fillRect(x + len - 2, y, 2, rowH);
        x += len;
      }
      ctx.fillStyle = "rgba(26,13,6,.2)";
      ctx.fillRect(0, y, w, 1.5);
    }
    // subtle scuffs
    for (let i = 0; i < 260; i++) {
      ctx.fillStyle = `rgba(30,18,10,${Math.random() * 0.05})`;
      ctx.beginPath();
      ctx.ellipse(Math.random() * w, Math.random() * h, Math.random() * 25, Math.random() * 4, Math.random() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    }
    // darker edges
    const edge = ctx.createLinearGradient(0, 0, 0, h);
    edge.addColorStop(0, "rgba(20,10,4,.25)");
    edge.addColorStop(0.12, "rgba(20,10,4,0)");
    edge.addColorStop(0.88, "rgba(20,10,4,0)");
    edge.addColorStop(1, "rgba(20,10,4,.3)");
    ctx.fillStyle = edge;
    ctx.fillRect(0, 0, w, h);
    const tex = U.texture(c);
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    return tex;
  };

  /* -------- basketball skin -------- */
  U.ballTexture = () => {
    const w = 1024, h = 512;
    const c = U.canvas(w, h);
    const ctx = c.getContext("2d");
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, "#d3702a");
    g.addColorStop(0.45, "#c05a1d");
    g.addColorStop(1, "#a94713");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    // pebble noise
    for (let i = 0; i < 9000; i++) {
      const a = Math.random() * 0.12;
      ctx.fillStyle = Math.random() > 0.5 ? `rgba(255,205,150,${a})` : `rgba(70,25,5,${a})`;
      ctx.beginPath();
      ctx.arc(Math.random() * w, Math.random() * h, Math.random() * 1.8 + 0.3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = "#2a1208";
    ctx.lineWidth = 8;
    ctx.lineCap = "round";
    // equator + vertical seams (u-wrap)
    ctx.beginPath(); ctx.moveTo(0, h / 2); ctx.lineTo(w, h / 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(w * 0.25, 0); ctx.lineTo(w * 0.25, h); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(w * 0.75, 0); ctx.lineTo(w * 0.75, h); ctx.stroke();
    // curved seams
    ctx.beginPath();
    ctx.moveTo(0, h * 0.18);
    ctx.bezierCurveTo(w * 0.22, h * 0.38, w * 0.22, h * 0.62, 0, h * 0.82);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(w, h * 0.18);
    ctx.bezierCurveTo(w * 0.78, h * 0.38, w * 0.78, h * 0.62, w, h * 0.82);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(w * 0.5, h * 0.5 - 6);
    ctx.arc(w * 0.5, h * 0.5, h * 0.32, Math.PI * 0.08, Math.PI * 0.92);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(w * 0.5, h * 0.5 + 6);
    ctx.arc(w * 0.5, h * 0.5, h * 0.32, Math.PI * 1.08, Math.PI * 1.92);
    ctx.stroke();
    // specks and shine
    const sheen = ctx.createRadialGradient(w * 0.34, h * 0.24, 0, w * 0.34, h * 0.24, w * 0.4);
    sheen.addColorStop(0, "rgba(255,225,180,.16)");
    sheen.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = sheen;
    ctx.fillRect(0, 0, w, h);
    return U.texture(c);
  };

  U.numberTexture = (number, color = "#ffffff", outline = "rgba(0,0,0,.35)") => {
    const s = 256;
    const c = U.canvas(s, s);
    const ctx = c.getContext("2d");
    ctx.clearRect(0, 0, s, s);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "700 150px Oswald, Arial Narrow, Arial, sans-serif";
    ctx.lineWidth = 14;
    ctx.strokeStyle = outline;
    ctx.strokeText(String(number), s / 2, s / 2 + 6);
    ctx.fillStyle = color;
    ctx.fillText(String(number), s / 2, s / 2 + 6);
    return U.texture(c);
  };

  U.nameTexture = (name, sub = "", color = "#ffffff", bg = "rgba(0,0,0,0)") => {
    const w = 512, h = 160;
    const c = U.canvas(w, h);
    const ctx = c.getContext("2d");
    ctx.clearRect(0, 0, w, h);
    if (bg !== "rgba(0,0,0,0)") {
      ctx.fillStyle = bg;
      U.roundRect(ctx, 0, 0, w, h, 24);
      ctx.fill();
    }
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "700 70px Oswald, Arial Narrow, Arial, sans-serif";
    ctx.fillStyle = color;
    ctx.fillText(name, w / 2, sub ? h * 0.43 : h / 2);
    if (sub) {
      ctx.font = "600 27px Barlow, Arial, sans-serif";
      ctx.fillStyle = "rgba(255,255,255,.62)";
      ctx.letterSpacing = "4px";
      ctx.fillText(sub, w / 2, h * 0.76);
    }
    return U.texture(c);
  };

  U.labelSprite = (text, sub, color, scale = 1) => {
    const tex = U.nameTexture(text, sub, color);
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: true });
    const sp = new THREE.Sprite(mat);
    sp.scale.set(1.5 * scale, 0.47 * scale, 1);
    sp.center.set(0.5, 0);
    return sp;
  };

  U.envCubeTexture = () => {
    const faces = [];
    for (let i = 0; i < 6; i++) {
      const c = U.canvas(128, 128);
      const ctx = c.getContext("2d");
      let g;
      if (i === 2) {
        g = ctx.createLinearGradient(0, 0, 0, 128);
        g.addColorStop(0, "#dfeaff");
        g.addColorStop(0.4, "#91a6c0");
        g.addColorStop(1, "#2b3442");
      } else if (i === 3) {
        g = ctx.createLinearGradient(0, 0, 0, 128);
        g.addColorStop(0, "#1a1e27");
        g.addColorStop(1, "#05070a");
      } else {
        g = ctx.createLinearGradient(0, 0, 0, 128);
        g.addColorStop(0, "#303a49");
        g.addColorStop(0.55, "#111722");
        g.addColorStop(1, "#070a0f");
        ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 128);
        for (let j = 0; j < 5; j++) {
          const x = Math.random() * 128;
          ctx.fillStyle = "rgba(180,220,255,.2)";
          ctx.fillRect(x, 10 + Math.random() * 35, 2, 40);
        }
      }
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 128, 128);
      faces.push(c);
    }
    const tex = new THREE.CubeTexture(faces);
    tex.encoding = THREE.sRGBEncoding;
    tex.needsUpdate = true;
    return tex;
  };

  /* soft round contact shadow */
  U.shadowTexture = () => {
    const s = 128;
    const c = U.canvas(s, s);
    const ctx = c.getContext("2d");
    const g = ctx.createRadialGradient(s / 2, s / 2, 2, s / 2, s / 2, s / 2);
    g.addColorStop(0, "rgba(0,0,0,.65)");
    g.addColorStop(0.45, "rgba(0,0,0,.34)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
    return U.texture(c, false);
  };

  U.makeStandard = (color, opts = {}) => new THREE.MeshStandardMaterial(Object.assign({
    color,
    roughness: 0.64,
    metalness: 0.02,
  }, opts));

  U.randomSkin = () => U.pick([0xf1c7a5, 0xd9a173, 0xb9784a, 0x8c5232, 0x69391f, 0xf5d2b7, 0xcaa07b]);
  U.randomHair = () => U.pick([0x161311, 0x24160e, 0x0b0a09, 0x4a2a17, 0x181818, 0x342018]);

  U.disposeObject = (obj) => {
    obj.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        mats.forEach((m) => {
          if (m.map) m.map.dispose();
          m.dispose();
        });
      }
    });
  };
})();
