/* FULL COURT — arena, court, hoops, crowd, jumbotron */
(function () {
  "use strict";
  const BB = (window.BB = window.BB || {});
  const U = BB.util;
  const C = BB.COURT;

  class Arena {
    constructor(scene, renderer) {
      this.scene = scene;
      this.renderer = renderer;
      this.hoops = [];
      this.netPulses = [];
      this.ledTextures = [];
      this.crowd = [];
      this.heads = [];
      this.crowdMesh = null;
      this.headMesh = null;
      this.cheerTimer = 0;
      this.cheerPower = 0;
      this.time = 0;
      this.confetti = null;
      this.boardTexture = null;
      this.boardCanvas = null;
      this.boardKey = "";
      this.lastCrowdUpdate = 0;
      this.buildLights();
      this.buildFloor();
      this.buildCourtLines();
      this.buildHoops();
      this.buildStands();
      this.buildWalls();
      this.buildLedBoards();
      this.buildJumbotron();
      this.buildBenches();
      this.buildDust();
      this.buildConfetti();
    }

    /* ============================ LIGHTS ============================ */
    buildLights() {
      const scene = this.scene;
      scene.background = new THREE.Color(0x04060a);
      scene.fog = new THREE.FogExp2(0x05080e, 0.0095);

      const hemi = new THREE.HemisphereLight(0xb7d8ff, 0x241811, 0.52);
      scene.add(hemi);

      const key = new THREE.DirectionalLight(0xfff2df, 2.15);
      key.position.set(6, 20, 11);
      key.castShadow = true;
      key.shadow.mapSize.set(2048, 2048);
      key.shadow.camera.left = -19;
      key.shadow.camera.right = 19;
      key.shadow.camera.top = 13;
      key.shadow.camera.bottom = -13;
      key.shadow.camera.near = 2;
      key.shadow.camera.far = 45;
      key.shadow.bias = -0.00035;
      key.shadow.normalBias = 0.015;
      key.shadow.radius = 2.5;
      scene.add(key);
      this.keyLight = key;

      const fill = new THREE.DirectionalLight(0x8fbaff, 0.38);
      fill.position.set(-14, 10, -10);
      scene.add(fill);

      const rimLight = new THREE.DirectionalLight(0xffc48f, 0.25);
      rimLight.position.set(0, 4, -16);
      scene.add(rimLight);

      const spotPositions = [
        [-10, 13.5, -8, 0xffe8c4],
        [10, 13.5, -8, 0xe4f1ff],
        [-10, 13.5, 8, 0xe4f1ff],
        [10, 13.5, 8, 0xffe8c4],
      ];
      spotPositions.forEach(([x, y, z, col]) => {
        const sp = new THREE.SpotLight(col, 1.6, 34, 0.75, 0.65, 1.35);
        sp.position.set(x, y, z);
        sp.target.position.set(x * 0.18, 0, z * 0.12);
        scene.add(sp);
        scene.add(sp.target);
      });

      const hoopSpotL = new THREE.PointLight(0x9fd4ff, 0.65, 12, 2);
      hoopSpotL.position.set(-10.8, 6.5, 0);
      scene.add(hoopSpotL);
      const hoopSpotR = new THREE.PointLight(0xffc6c6, 0.55, 12, 2);
      hoopSpotR.position.set(10.8, 6.5, 0);
      scene.add(hoopSpotR);
    }

    /* ============================ FLOOR ============================ */
    buildFloor() {
      const scene = this.scene;

      const surround = new THREE.Mesh(
        new THREE.PlaneGeometry(70, 50),
        new THREE.MeshStandardMaterial({ color: 0x0a0f16, roughness: 0.72, metalness: 0.05 })
      );
      surround.rotation.x = -Math.PI / 2;
      surround.position.y = -0.14;
      surround.receiveShadow = true;
      scene.add(surround);

      // court apron
      const apron = new THREE.Mesh(
        new THREE.BoxGeometry(30.6, 0.16, 17.4),
        new THREE.MeshStandardMaterial({ color: 0x101b29, roughness: 0.55, metalness: 0.1 })
      );
      apron.position.y = -0.085;
      apron.receiveShadow = true;
      scene.add(apron);

      const wood = U.woodCourtTexture();
      const floorMat = new THREE.MeshPhysicalMaterial({
        map: wood,
        color: 0xffffff,
        roughness: 0.34,
        metalness: 0.02,
        clearcoat: 0.55,
        clearcoatRoughness: 0.36,
      });
      const floor = new THREE.Mesh(new THREE.BoxGeometry(28.4, 0.16, 15.4), floorMat);
      floor.position.y = -0.08;
      floor.receiveShadow = true;
      scene.add(floor);

      // subtle inner glow strips around the floor
      const glowMat = new THREE.MeshBasicMaterial({ color: 0x3bbaff, transparent: true, opacity: 0.5 });
      const glowMatRed = new THREE.MeshBasicMaterial({ color: 0xff3344, transparent: true, opacity: 0.5 });
      const stripL = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.02, 15.5), glowMat);
      stripL.position.set(-14.25, 0.012, 0);
      scene.add(stripL);
      const stripR = stripL.clone();
      stripR.material = glowMatRed;
      stripR.position.x = 14.25;
      scene.add(stripR);

      // center logo
      const c = U.canvas(512, 512);
      const ctx = c.getContext("2d");
      ctx.clearRect(0, 0, 512, 512);
      ctx.strokeStyle = "rgba(255,255,255,.35)";
      ctx.lineWidth = 5;
      ctx.beginPath(); ctx.arc(256, 256, 190, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = "rgba(200,255,61,.7)";
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(256, 256, 165, 0, Math.PI * 2); ctx.stroke();
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "rgba(12,18,26,.8)";
      ctx.beginPath(); ctx.arc(256, 256, 150, 0, Math.PI * 2); ctx.fill();
      ctx.font = "700 118px Oswald, Arial Narrow, Arial, sans-serif";
      ctx.fillStyle = "rgba(255,255,255,.9)";
      ctx.fillText("FC", 256, 245);
      ctx.font = "600 25px Barlow, Arial, sans-serif";
      ctx.fillStyle = "rgba(200,255,61,.85)";
      ctx.fillText("NIGHT LEAGUE · 5×5", 256, 330);
      const logoTex = U.texture(c);
      const logo = new THREE.Mesh(
        new THREE.PlaneGeometry(3.05, 3.05),
        new THREE.MeshBasicMaterial({ map: logoTex, transparent: true, opacity: 0.8, depthWrite: false })
      );
      logo.rotation.x = -Math.PI / 2;
      logo.position.y = 0.018;
      scene.add(logo);
    }

    /* ============================ LINES ============================ */
    buildCourtLines() {
      const lineMat = new THREE.MeshStandardMaterial({ color: 0xf4eedb, roughness: 0.5, metalness: 0.02 });
      const lineY = 0.014;
      const addBox = (x1, z1, x2, z2, width = 0.055) => {
        const dx = x2 - x1, dz = z2 - z1;
        const len = Math.hypot(dx, dz);
        const m = new THREE.Mesh(new THREE.BoxGeometry(len, 0.012, width), lineMat);
        m.position.set((x1 + x2) / 2, lineY, (z1 + z2) / 2);
        m.rotation.y = -Math.atan2(dz, dx);
        m.receiveShadow = true;
        this.scene.add(m);
        return m;
      };
      const arc = (cx, cz, radius, a0, a1, width = 0.055, segments = 72) => {
        const pos = [];
        const idx = [];
        for (let i = 0; i <= segments; i++) {
          const a = a0 + (a1 - a0) * (i / segments);
          const ca = Math.cos(a), sa = Math.sin(a);
          const rO = radius + width / 2, rI = radius - width / 2;
          pos.push(cx + ca * rO, lineY, cz + sa * rO);
          pos.push(cx + ca * rI, lineY, cz + sa * rI);
        }
        for (let i = 0; i < segments; i++) {
          const a = i * 2, b = a + 1, c2 = a + 2, d = a + 3;
          idx.push(a, c2, b, b, c2, d);
        }
        const g = new THREE.BufferGeometry();
        g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
        g.setIndex(idx);
        g.computeVertexNormals();
        const m = new THREE.Mesh(g, lineMat);
        m.receiveShadow = true;
        this.scene.add(m);
      };

      // boundary + half court
      addBox(-14, -7.5, 14, -7.5, 0.07);
      addBox(-14, 7.5, 14, 7.5, 0.07);
      addBox(-14, -7.5, -14, 7.5, 0.07);
      addBox(14, -7.5, 14, 7.5, 0.07);
      addBox(0, -7.5, 0, 7.5, 0.06);
      arc(0, 0, C.centerCircle, 0, Math.PI * 2, 0.055, 96);
      // center court inner circle
      arc(0, 0, 0.55, 0, Math.PI * 2, 0.04, 40);

      for (const side of [1, -1]) {
        const hoopX = side * C.rimX;
        const paintMat = new THREE.MeshStandardMaterial({
          color: side > 0 ? 0x0f2b45 : 0x3a1018,
          roughness: 0.5,
          metalness: 0.03,
          transparent: true,
          opacity: 0.9,
        });
        const key = new THREE.Mesh(new THREE.PlaneGeometry(5.8, C.keyHalfW * 2), paintMat);
        key.rotation.x = -Math.PI / 2;
        key.position.set(side * (C.halfL - 2.9), 0.009, 0);
        key.receiveShadow = true;
        this.scene.add(key);

        const baseX = side * C.halfL;
        const ftX = side * C.ftX;
        // key outline
        addBox(baseX, -C.keyHalfW, ftX, -C.keyHalfW, 0.055);
        addBox(baseX, C.keyHalfW, ftX, C.keyHalfW, 0.055);
        addBox(ftX, -C.keyHalfW, ftX, C.keyHalfW, 0.055);
        addBox(baseX, -C.keyHalfW, baseX, C.keyHalfW, 0.055);
        // free throw circle
        arc(ftX, 0, 1.8, 0, Math.PI * 2, 0.05, 64);
        // restricted area arc
        const a0 = side > 0 ? Math.PI * 0.5 : -Math.PI * 0.5;
        const a1 = side > 0 ? Math.PI * 1.5 : Math.PI * 0.5;
        arc(hoopX, 0, 1.25, a0, a1, 0.045, 48);

        // three point line - arc + corner lines
        if (side > 0) {
          arc(hoopX, 0, C.threeRadius, Math.PI - 1.36, Math.PI + 1.36, 0.06, 96);
          addBox(11.01, 6.6, 14, 6.6, 0.06);
          addBox(11.01, -6.6, 14, -6.6, 0.06);
        } else {
          arc(hoopX, 0, C.threeRadius, -1.36, 1.36, 0.06, 96);
          addBox(-11.01, 6.6, -14, 6.6, 0.06);
          addBox(-11.01, -6.6, -14, -6.6, 0.06);
        }

        // lane blocks
        for (let i = 0; i < 4; i++) {
          const x = side * (C.halfL - 1.35 - i * 1.35);
          for (const z of [-C.keyHalfW - 0.22, C.keyHalfW + 0.22]) {
            addBox(x - 0.12, z, x + 0.12, z, 0.07);
          }
        }
      }
    }

    /* ============================ HOOPS ============================ */
    buildHoops() {
      for (const side of [1, -1]) {
        const group = new THREE.Group();
        const backboardMat = new THREE.MeshPhysicalMaterial({
          color: 0xd7ecff,
          transparent: true,
          opacity: 0.24,
          roughness: 0.06,
          metalness: 0.0,
          clearcoat: 1,
          clearcoatRoughness: 0.05,
          side: THREE.DoubleSide,
        });
        const board = new THREE.Mesh(new THREE.BoxGeometry(0.045, 1.05, 1.8), backboardMat);
        board.position.set(side * C.backboardX, 3.425, 0);
        board.castShadow = true;
        group.add(board);

        const frameMat = new THREE.MeshStandardMaterial({ color: 0xe9f3ff, roughness: 0.3, metalness: 0.2 });
        const border = 0.045;
        const addFrame = (w, h, x, y, z) => {
          const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.035), frameMat);
          m.position.set(x, y, z);
          group.add(m);
        };
        const faceX = side * (C.backboardX - 0.032);
        addFrame(0.035, 0.06, faceX, C.backboardBottom + 0.02, 0);
        addFrame(0.035, 0.06, faceX, C.backboardTop - 0.02, 0);
        addFrame(0.035, 1.05, faceX, 3.425, 0.89);
        addFrame(0.035, 1.05, faceX, 3.425, -0.89);
        // target square
        addFrame(0.04, 0.035, faceX, 3.5, 0.3);
        addFrame(0.04, 0.035, faceX, 3.5, -0.3);
        addFrame(0.04, 0.035, faceX, 2.95, 0.3);
        addFrame(0.04, 0.035, faceX, 2.95, -0.3);
        addFrame(0.04, 0.585, faceX, 3.225, 0.3);
        addFrame(0.04, 0.585, faceX, 3.225, -0.3);
        // backboard bottom pad
        const pad = new THREE.Mesh(
          new THREE.BoxGeometry(0.09, 0.1, 1.84),
          new THREE.MeshStandardMaterial({ color: side > 0 ? 0x1c4f77 : 0x6b1a24, roughness: 0.8 })
        );
        pad.position.set(side * C.backboardX, 2.86, 0);
        group.add(pad);

        // rim
        const rim = new THREE.Mesh(
          new THREE.TorusGeometry(C.rimRadius, C.rimTube, 12, 48),
          new THREE.MeshStandardMaterial({ color: 0xff5a12, roughness: 0.28, metalness: 0.72, emissive: 0x3a1000, emissiveIntensity: 0.28 })
        );
        rim.rotation.x = Math.PI / 2;
        rim.position.set(side * C.rimX, C.rimY, 0);
        rim.castShadow = true;
        group.add(rim);

        const connector = new THREE.Mesh(
          new THREE.BoxGeometry(0.34, 0.05, 0.12),
          new THREE.MeshStandardMaterial({ color: 0xd94b0a, roughness: 0.4, metalness: 0.6 })
        );
        connector.position.set(side * (C.backboardX - 0.17), C.rimY, 0);
        group.add(connector);

        // support
        const steel = new THREE.MeshStandardMaterial({ color: 0x222b36, roughness: 0.4, metalness: 0.65 });
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.22, 3.6, 0.28), steel);
        post.position.set(side * 14.05, 1.8, 0);
        post.castShadow = true;
        group.add(post);
        const arm = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.18, 0.32), steel);
        arm.position.set(side * 13.35, 3.63, 0);
        arm.rotation.z = side * 0.05;
        arm.castShadow = true;
        group.add(arm);
        const base = new THREE.Mesh(
          new THREE.BoxGeometry(1.3, 0.45, 1.2),
          new THREE.MeshStandardMaterial({ color: side > 0 ? 0x13364f : 0x4d0f18, roughness: 0.8 })
        );
        base.position.set(side * 14.2, 0.225, 0);
        base.castShadow = true;
        group.add(base);

        this.scene.add(group);

        // net
        const net = this.buildNet(side * C.rimX, C.rimY, 0);
        this.scene.add(net.mesh);

        this.hoops.push({
          side,
          x: side * C.rimX,
          y: C.rimY,
          z: 0,
          rim,
          net,
          group,
          backboardX: side * C.backboardX,
        });
      }
    }

    buildNet(x, y, z) {
      const strands = 12;
      const levels = 6;
      const pts = [];
      const basePts = [];
      const indices = [];
      for (let l = 0; l <= levels; l++) {
        const t = l / levels;
        const radius = U.lerp(C.rimRadius * 0.93, 0.115, t);
        const ly = y - t * 0.46;
        for (let s = 0; s < strands; s++) {
          const a = (s / strands) * Math.PI * 2 + t * 0.16;
          const px = x + Math.cos(a) * radius;
          const pz = z + Math.sin(a) * radius;
          pts.push(px, ly, pz);
          basePts.push(px, ly, pz);
        }
      }
      const idx = (l, s) => l * strands + (s % strands);
      for (let l = 0; l < levels; l++) {
        for (let s = 0; s < strands; s++) {
          indices.push(idx(l, s), idx(l + 1, s));
          indices.push(idx(l, s), idx(l + 1, s + 1));
        }
      }
      // top and bottom rings
      for (let l = 0; l <= levels; l += levels) {
        for (let s = 0; s < strands; s++) indices.push(idx(l, s), idx(l, s + 1));
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
      geo.setIndex(indices);
      const mat = new THREE.LineBasicMaterial({ color: 0xf4f7fa, transparent: true, opacity: 0.65 });
      const mesh = new THREE.LineSegments(geo, mat);
      return { mesh, base: new Float32Array(basePts), pulse: 0, x, y, z };
    }

    rimHit(hoop, power = 0.6) {
      if (!hoop || !hoop.net) return;
      hoop.net.pulse = Math.max(hoop.net.pulse, power);
    }

    /* ============================ STANDS ============================ */
    buildStands() {
      const crowdBodies = [];
      const crowdHeads = [];
      const seats = [];
      const seatMat = new THREE.MeshStandardMaterial({ color: 0x0e1724, roughness: 0.87 });
      const stepMat = new THREE.MeshStandardMaterial({ color: 0x0a0f17, roughness: 0.9 });
      const wallMat = new THREE.MeshStandardMaterial({ color: 0x06090e, roughness: 0.95 });

      const addStand = (originX, originZ, rotY, rows, length, seatSpacing) => {
        const group = new THREE.Group();
        group.position.set(originX, 0, originZ);
        group.rotation.y = rotY;
        for (let r = 0; r < rows; r++) {
          const step = new THREE.Mesh(new THREE.BoxGeometry(length, 0.34, 0.95), stepMat);
          step.position.set(0, 0.17 + r * 0.38, -r * 0.92);
          step.receiveShadow = true;
          group.add(step);
          const riser = new THREE.Mesh(new THREE.BoxGeometry(length, 0.38, 0.08), stepMat);
          riser.position.set(0, 0.18 + r * 0.38 + 0.18, -r * 0.92 + 0.44);
          group.add(riser);
        }
        // back wall
        const back = new THREE.Mesh(new THREE.BoxGeometry(length + 0.6, 3.4, 0.3), wallMat);
        back.position.set(0, 2.1 + rows * 0.2, -rows * 0.92 - 0.4);
        group.add(back);

        const cols = Math.floor(length / seatSpacing) - 2;
        for (let r = 0; r < rows; r++) {
          for (let i = 0; i < cols; i++) {
            const lx = -length / 2 + seatSpacing * 1.5 + i * seatSpacing;
            const ly = 0.36 + r * 0.38;
            const lz = -r * 0.92 - 0.14;
            const empty = Math.random() < 0.11;
            seats.push({ x: lx, y: ly, z: lz, group });
            if (empty) continue;
            const scale = U.rand(0.88, 1.08);
            crowdBodies.push({
              x: lx, y: ly + 0.26, z: lz + 0.05, scale,
              color: Math.random() < 0.38 ? (Math.random() < 0.5 ? 0x163a5c : 0x5c171f) : U.pick([0x1b2432, 0x2a3140, 0x776a58, 0xcfd2d6, 0x1e4968, 0x7e2029, 0x303743]),
              phase: Math.random() * Math.PI * 2,
              group,
            });
            crowdHeads.push({
              x: lx, y: ly + 0.66, z: lz + 0.04, scale: scale,
              color: U.randomSkin(), phase: Math.random() * Math.PI * 2, group,
            });
          }
        }
        this.scene.add(group);
      };

      addStand(0, -8.9, 0, 8, 35, 0.62);
      addStand(0, 8.9, Math.PI, 7, 35, 0.62);
      addStand(-15.4, 0, Math.PI / 2, 6, 18.4, 0.65);
      addStand(15.4, 0, -Math.PI / 2, 6, 18.4, 0.65);

      // seats
      const seatGeo = new THREE.BoxGeometry(0.38, 0.06, 0.34);
      const seatMesh = new THREE.InstancedMesh(seatGeo, seatMat, seats.length);
      const m = new THREE.Matrix4();
      seats.forEach((s, i) => {
        s.group.updateMatrixWorld(true);
        const p = new THREE.Vector3(s.x, s.y + 0.02, s.z);
        s.group.localToWorld(p);
        m.compose(p, new THREE.Quaternion(), new THREE.Vector3(1, 1, 1));
        seatMesh.setMatrixAt(i, m);
      });
      seatMesh.instanceMatrix.needsUpdate = true;
      this.scene.add(seatMesh);

      const crowdMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95 });
      const bodyGeo = new THREE.CapsuleGeometry(0.14, 0.28, 3, 6);
      this.crowdMesh = new THREE.InstancedMesh(bodyGeo, crowdMat, crowdBodies.length);
      const headGeo = new THREE.SphereGeometry(0.115, 7, 6);
      this.headMesh = new THREE.InstancedMesh(headGeo, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 }), crowdHeads.length);
      this.crowdBodies = crowdBodies;
      this.crowdHeads = crowdHeads;

      const q = new THREE.Quaternion();
      crowdBodies.forEach((p, i) => {
        const pos = new THREE.Vector3(p.x, p.y, p.z);
        p.group.localToWorld(pos);
        const sc = new THREE.Vector3(p.scale, p.scale, p.scale);
        m.compose(pos, q, sc);
        this.crowdMesh.setMatrixAt(i, m);
        this.crowdMesh.setColorAt(i, new THREE.Color(p.color));
        p.world = pos;
      });
      crowdHeads.forEach((p, i) => {
        const pos = new THREE.Vector3(p.x, p.y, p.z);
        p.group.localToWorld(pos);
        const sc = new THREE.Vector3(p.scale, p.scale, p.scale);
        m.compose(pos, q, sc);
        this.headMesh.setMatrixAt(i, m);
        this.headMesh.setColorAt(i, new THREE.Color(p.color));
        p.world = pos;
      });
      this.crowdMesh.instanceMatrix.needsUpdate = true;
      this.headMesh.instanceMatrix.needsUpdate = true;
      this.crowdMesh.instanceColor.needsUpdate = true;
      this.headMesh.instanceColor.needsUpdate = true;
      this.scene.add(this.crowdMesh);
      this.scene.add(this.headMesh);
    }

    crowdCheer(power = 1, duration = 2.2) {
      this.cheerPower = Math.max(this.cheerPower, power);
      this.cheerTimer = Math.max(this.cheerTimer, duration);
    }

    /* ============================ WALLS / CEILING ============================ */
    buildWalls() {
      const scene = this.scene;
      const wallMat = new THREE.MeshStandardMaterial({ color: 0x080c12, roughness: 0.93 });
      const wallZ = 14.6, wallX = 22;
      const backN = new THREE.Mesh(new THREE.BoxGeometry(44, 12, 0.6), wallMat);
      backN.position.set(0, 6, -wallZ);
      scene.add(backN);
      const backS = backN.clone();
      backS.position.z = wallZ;
      scene.add(backS);
      const sideL = new THREE.Mesh(new THREE.BoxGeometry(0.6, 12, 29), wallMat);
      sideL.position.set(-wallX, 6, 0);
      scene.add(sideL);
      const sideR = sideL.clone();
      sideR.position.x = wallX;
      scene.add(sideR);

      // ceiling trusses
      const trussMat = new THREE.MeshStandardMaterial({ color: 0x141a22, roughness: 0.55, metalness: 0.55 });
      for (let i = -2; i <= 2; i++) {
        const beam = new THREE.Mesh(new THREE.BoxGeometry(43, 0.28, 0.28), trussMat);
        beam.position.set(0, 14.8, i * 4.6);
        scene.add(beam);
        for (let j = -4; j <= 4; j++) {
          const diag = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 4.2), trussMat);
          diag.position.set(j * 4.4, 14.8, i * 4.6);
          diag.rotation.x = 0.55;
          scene.add(diag);
        }
      }
      for (let i = -3; i <= 3; i++) {
        const beam = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 28), trussMat);
        beam.position.set(i * 6.1, 15.1, 0);
        scene.add(beam);
      }
      const roof = new THREE.Mesh(new THREE.PlaneGeometry(60, 40), new THREE.MeshStandardMaterial({ color: 0x030507, roughness: 1 }));
      roof.rotation.x = Math.PI / 2;
      roof.position.y = 16;
      scene.add(roof);

      // light fixtures
      const fixtureMat = new THREE.MeshStandardMaterial({ color: 0x11161e, roughness: 0.4, metalness: 0.6 });
      const lampMat = new THREE.MeshBasicMaterial({ color: 0xfff0cf });
      [[-10, -8], [10, -8], [-10, 8], [10, 8]].forEach(([x, z]) => {
        const body = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.55, 0.7, 10), fixtureMat);
        body.position.set(x, 13.7, z);
        scene.add(body);
        const lamp = new THREE.Mesh(new THREE.CircleGeometry(0.38, 18), lampMat);
        lamp.rotation.x = Math.PI / 2;
        lamp.position.set(x, 13.32, z);
        scene.add(lamp);
      });

      // light shafts
      const shaftMat = new THREE.MeshBasicMaterial({
        color: 0xcfe8ff, transparent: true, opacity: 0.018, depthWrite: false,
        blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      });
      [[-10, -8], [10, -8], [-10, 8], [10, 8]].forEach(([x, z]) => {
        const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 4.2, 13, 20, 1, true), shaftMat);
        shaft.position.set(x, 6.7, z);
        scene.add(shaft);
      });

      // wall banners
      const bannerData = [
        { text: "FULL COURT", sub: "NIGHT LEAGUE", color: "#c8ff3d", x: -8.5, z: -14.24, rot: 0 },
        { text: "SHARKS", sub: "2 × 2", color: "#35b7ff", x: 8.5, z: -14.24, rot: 0 },
        { text: "TIGERS", sub: "NO MERCY", color: "#ff3b4f", x: -8.5, z: 14.24, rot: Math.PI },
        { text: "ARENA 07", sub: "SELL OUT", color: "#ffd166", x: 8.5, z: 14.24, rot: Math.PI },
      ];
      bannerData.forEach((b) => {
        const cv = U.canvas(512, 1024);
        const ctx = cv.getContext("2d");
        ctx.fillStyle = "rgba(8,12,19,.92)";
        ctx.fillRect(0, 0, 512, 1024);
        ctx.strokeStyle = b.color;
        ctx.lineWidth = 8;
        ctx.strokeRect(18, 18, 476, 988);
        ctx.save();
        ctx.translate(256, 512);
        ctx.rotate(-Math.PI / 2);
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.font = "700 108px Oswald, Arial Narrow, Arial, sans-serif";
        ctx.fillStyle = b.color;
        ctx.fillText(b.text, 0, -10);
        ctx.font = "600 30px Barlow, Arial, sans-serif";
        ctx.fillStyle = "rgba(255,255,255,.5)";
        ctx.fillText(b.sub, 0, 85);
        ctx.restore();
        const tex = U.texture(cv);
        const plane = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 4.8), new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }));
        plane.position.set(b.x, 8.0, b.z);
        plane.rotation.y = b.rot;
        scene.add(plane);
      });

      // overhead haze glows
      const glowCanvas = U.canvas(128, 128);
      const gctx = glowCanvas.getContext("2d");
      const grd = gctx.createRadialGradient(64, 64, 2, 64, 64, 64);
      grd.addColorStop(0, "rgba(150,205,255,.28)");
      grd.addColorStop(1, "rgba(150,205,255,0)");
      gctx.fillStyle = grd;
      gctx.fillRect(0, 0, 128, 128);
      const glowMat = new THREE.SpriteMaterial({
        map: U.texture(glowCanvas, false), transparent: true, depthWrite: false,
        blending: THREE.AdditiveBlending, opacity: 0.6,
      });
      [[-10, 8, -8], [10, 8, -8], [-10, 8, 8], [10, 8, 8]].forEach(([x, y, z]) => {
        const sp = new THREE.Sprite(glowMat);
        sp.position.set(x, y + 4.4, z);
        sp.scale.set(8, 8, 1);
        scene.add(sp);
      });
    }

    /* ============================ LED ============================ */
    buildLedBoards() {
      const cv = U.canvas(2048, 128);
      const ctx = cv.getContext("2d");
      ctx.fillStyle = "#05090f";
      ctx.fillRect(0, 0, 2048, 128);
      ctx.textBaseline = "middle";
      ctx.font = "700 54px Oswald, Arial Narrow, Arial, sans-serif";
      const msg = "FULL COURT  •  NIGHT LEAGUE  •  SHARKS  VS  TIGERS  •  "
        + "2 × 2  •  PLAY HARD  •  ";
      ctx.fillStyle = "#bfefff";
      ctx.fillText(msg + msg, 10, 66);
      ctx.strokeStyle = "rgba(53,183,255,.35)";
      ctx.lineWidth = 3;
      ctx.strokeRect(2, 2, 2044, 124);
      const tex = U.texture(cv);
      tex.wrapS = THREE.RepeatWrapping;
      tex.repeat.x = 2;
      this.ledTextures.push(tex);

      const mat = new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide, toneMapped: false });
      const geo = new THREE.PlaneGeometry(30, 0.62);
      const north = new THREE.Mesh(geo, mat);
      north.position.set(0, 0.55, -8.35);
      this.scene.add(north);
      const south = north.clone();
      south.position.z = 8.35;
      south.rotation.y = Math.PI;
      this.scene.add(south);
      const east = new THREE.Mesh(new THREE.PlaneGeometry(15.6, 0.62), mat);
      east.position.set(15.1, 0.55, 0);
      east.rotation.y = -Math.PI / 2;
      this.scene.add(east);
      const west = east.clone();
      west.position.x = -15.1;
      west.rotation.y = Math.PI / 2;
      this.scene.add(west);

      const baseMat = new THREE.MeshStandardMaterial({ color: 0x05080d, roughness: 0.8 });
      [[0, -8.45, 30.4], [0, 8.45, 30.4], [15.2, 0, 15.8], [-15.2, 0, 15.8]].forEach(([x, z, len], i) => {
        const b = new THREE.Mesh(
          i < 2 ? new THREE.BoxGeometry(len, 0.95, 0.22) : new THREE.BoxGeometry(0.22, 0.95, len),
          baseMat
        );
        b.position.set(x, 0.44, z);
        this.scene.add(b);
      });
      // small LED accents on hoop posts
      const accentMat = new THREE.MeshBasicMaterial({ color: 0xff5722, toneMapped: false });
      const accentL = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.3, 1.1), new THREE.MeshBasicMaterial({ color: 0x35b7ff, toneMapped: false }));
      accentL.position.set(-14.13, 1.2, 0);
      this.scene.add(accentL);
      const accentR = accentL.clone();
      accentR.material = accentMat;
      accentR.position.x = 14.13;
      this.scene.add(accentR);
    }

    /* ============================ JUMBOTRON ============================ */
    buildJumbotron() {
      const group = new THREE.Group();
      const bodyMat = new THREE.MeshStandardMaterial({ color: 0x0c1017, roughness: 0.45, metalness: 0.55 });
      const body = new THREE.Mesh(new THREE.BoxGeometry(3.6, 1.75, 3.6), bodyMat);
      body.castShadow = false;
      group.add(body);

      const cv = U.canvas(768, 384);
      this.boardCanvas = cv;
      const ctx = cv.getContext("2d");
      this.boardCtx = ctx;
      const tex = U.texture(cv);
      this.boardTexture = tex;
      const screenMat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false });
      const screenGeo = new THREE.PlaneGeometry(3.25, 1.4);
      const faces = [
        { p: [0, 0, 1.81], r: [0, 0, 0] },
        { p: [0, 0, -1.81], r: [0, Math.PI, 0] },
        { p: [1.81, 0, 0], r: [0, Math.PI / 2, 0] },
        { p: [-1.81, 0, 0], r: [0, -Math.PI / 2, 0] },
      ];
      faces.forEach((f) => {
        const m = new THREE.Mesh(screenGeo, screenMat);
        m.position.set(f.p[0], f.p[1], f.p[2]);
        m.rotation.set(f.r[0], f.r[1], f.r[2]);
        group.add(m);
      });

      const edge = new THREE.Mesh(
        new THREE.BoxGeometry(3.7, 0.13, 3.7),
        new THREE.MeshBasicMaterial({ color: 0x2ec6ff, toneMapped: false })
      );
      edge.position.y = -0.9;
      group.add(edge);
      const top = new THREE.Mesh(new THREE.BoxGeometry(3.75, 0.1, 3.75), bodyMat);
      top.position.y = 0.925;
      group.add(top);

      // cables
      const cableMat = new THREE.MeshBasicMaterial({ color: 0x0a0d12 });
      [[-1.5, -1.5], [1.5, -1.5], [-1.5, 1.5], [1.5, 1.5]].forEach(([x, z]) => {
        const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 2.6, 4), cableMat);
        cable.position.set(x, 3.2, z);
        group.add(cable);
      });

      group.position.set(0, 10.7, 0);
      this.scene.add(group);
      this.jumbotron = group;
      this.setBoard(0, 0, "2:00", 1, 24, true);
    }

    setBoard(blue, red, clock, quarter, shotClock, force = false) {
      const key = `${blue}|${red}|${clock}|${quarter}|${shotClock}`;
      if (!force && key === this.boardKey) return;
      this.boardKey = key;
      const ctx = this.boardCtx;
      if (!ctx) return;
      const w = 768, h = 384;
      ctx.fillStyle = "#05090f";
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = "rgba(53,183,255,.28)";
      ctx.lineWidth = 4;
      ctx.strokeRect(6, 6, w - 12, h - 12);

      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = "600 27px Barlow, Arial, sans-serif";
      ctx.fillStyle = "rgba(255,255,255,.5)";
      ctx.fillText("F U L L   C O U R T   •   N I G H T   L E A G U E", w / 2, 32);

      ctx.font = "700 48px Oswald, Arial Narrow, Arial, sans-serif";
      ctx.fillStyle = "#7dd4ff";
      ctx.fillText("SHARKS", 150, 100);
      ctx.fillStyle = "#ff8792";
      ctx.fillText("TIGERS", w - 150, 100);

      ctx.font = "700 170px Oswald, Arial Narrow, Arial, sans-serif";
      ctx.fillStyle = "#eaf8ff";
      ctx.fillText(String(blue), 150, 195);
      ctx.fillStyle = "#ffe5e7";
      ctx.fillText(String(red), w - 150, 195);
      ctx.fillStyle = "rgba(255,255,255,.25)";
      ctx.font = "700 80px Oswald, Arial Narrow, Arial, sans-serif";
      ctx.fillText(":", w / 2, 175);

      ctx.font = "700 48px Oswald, Arial Narrow, Arial, sans-serif";
      ctx.fillStyle = "#ffd166";
      ctx.fillText(clock, w / 2, 275);
      ctx.font = "600 23px Barlow, Arial, sans-serif";
      ctx.fillStyle = "rgba(255,255,255,.55)";
      ctx.fillText(`ЧЕТВЕРТЬ ${quarter}   •   ${shotClock} СЕК`, w / 2, 330);
      this.boardTexture.needsUpdate = true;
    }

    /* ============================ BENCHES ============================ */
    buildBenches() {
      const benchMat = new THREE.MeshStandardMaterial({ color: 0x101722, roughness: 0.8 });
      for (const side of [-1, 1]) {
        const bench = new THREE.Group();
        const seat = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.12, 0.55), benchMat);
        seat.position.y = 0.55;
        bench.add(seat);
        for (let i = -2; i <= 2; i++) {
          const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.55, 0.4), benchMat);
          leg.position.set(i * 1.05, 0.27, 0);
          bench.add(leg);
        }
        bench.position.set(-4.5 + side * 2.6, 0, 8.85);
        this.scene.add(bench);

        // sideline decal
        const cv = U.canvas(512, 128);
        const ctx = cv.getContext("2d");
        ctx.fillStyle = "rgba(5,9,15,.86)";
        U.roundRect(ctx, 0, 0, 512, 128, 12);
        ctx.fill();
        ctx.strokeStyle = side < 0 ? "rgba(53,183,255,.5)" : "rgba(255,59,79,.5)";
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.font = "700 48px Oswald, Arial Narrow, Arial, sans-serif";
        ctx.fillStyle = side < 0 ? "#7dd4ff" : "#ff8792";
        ctx.fillText(side < 0 ? "SHARKS  BENCH" : "TIGERS  BENCH", 256, 64);
        const tex = U.texture(cv);
        const plane = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 0.575), new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide }));
        plane.rotation.x = -Math.PI / 2;
        plane.position.set(side * 4.0, 0.02, 8.0);
        this.scene.add(plane);

        // gatorade table
        const tableTop = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.08, 0.6), benchMat);
        tableTop.position.set(side * 4.0, 0.78, 8.95);
        this.scene.add(tableTop);
        const legMat = new THREE.MeshStandardMaterial({ color: 0x171f2a, roughness: 0.6 });
        for (const dx of [-0.65, 0.65]) {
          const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.78, 5), legMat);
          leg.position.set(side * 4.0 + dx, 0.39, 8.95);
          this.scene.add(leg);
        }
        const cupMat = new THREE.MeshStandardMaterial({ color: side < 0 ? 0x2da9ff : 0xff354d, roughness: 0.4, transparent: true, opacity: 0.75 });
        for (let i = 0; i < 5; i++) {
          const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.035, 0.14, 8), cupMat);
          cup.position.set(side * 4.0 + (i - 2) * 0.22, 0.89, 8.95);
          this.scene.add(cup);
        }
      }
    }

    /* ============================ DUST ============================ */
    buildDust() {
      const count = 260;
      const pos = new Float32Array(count * 3);
      this.dustSeeds = [];
      for (let i = 0; i < count; i++) {
        pos[i * 3] = U.rand(-16, 16);
        pos[i * 3 + 1] = U.rand(0.4, 13);
        pos[i * 3 + 2] = U.rand(-9, 9);
        this.dustSeeds.push({ phase: Math.random() * Math.PI * 2, speed: U.rand(0.1, 0.3) });
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      const c = U.canvas(64, 64);
      const ctx = c.getContext("2d");
      const gr = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, "rgba(220,240,255,.8)");
      gr.addColorStop(1, "rgba(220,240,255,0)");
      ctx.fillStyle = gr;
      ctx.fillRect(0, 0, 64, 64);
      const mat = new THREE.PointsMaterial({
        map: U.texture(c, false), size: 0.065, transparent: true, opacity: 0.55,
        depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true,
      });
      this.dust = new THREE.Points(g, mat);
      this.scene.add(this.dust);
    }

    /* ============================ CONFETTI ============================ */
    buildConfetti() {
      const count = 420;
      const geo = new THREE.BufferGeometry();
      const pos = new Float32Array(count * 3);
      const col = new Float32Array(count * 3);
      this.confettiData = [];
      const colors = [new THREE.Color(0x35b7ff), new THREE.Color(0xc8ff3d), new THREE.Color(0xffffff), new THREE.Color(0xffd166), new THREE.Color(0xff3b4f)];
      for (let i = 0; i < count; i++) {
        pos[i * 3] = U.rand(-15, 15);
        pos[i * 3 + 1] = U.rand(8, 16);
        pos[i * 3 + 2] = U.rand(-8, 8);
        const c = U.pick(colors);
        col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
        this.confettiData.push({ vy: U.rand(-0.6, -1.6), vx: U.rand(-0.35, 0.35), vz: U.rand(-0.35, 0.35), spin: U.rand(0.5, 2.5) });
      }
      geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
      const c = U.canvas(64, 64);
      const ctx = c.getContext("2d");
      ctx.fillStyle = "#fff";
      ctx.fillRect(22, 12, 20, 40);
      const mat = new THREE.PointsMaterial({
        map: U.texture(c, false), size: 0.14, vertexColors: true, transparent: true,
        depthWrite: false, opacity: 0.95, sizeAttenuation: true,
      });
      this.confetti = new THREE.Points(geo, mat);
      this.confetti.visible = false;
      this.scene.add(this.confetti);
    }

    celebrate() {
      if (!this.confetti) return;
      this.confetti.visible = true;
      const p = this.confetti.geometry.attributes.position.array;
      const d = this.confettiData;
      for (let i = 0; i < d.length; i++) {
        p[i * 3] = U.rand(-16, 16);
        p[i * 3 + 1] = U.rand(7, 17);
        p[i * 3 + 2] = U.rand(-8, 8);
        d[i].vy = U.rand(-0.7, -1.8);
        d[i].vx = U.rand(-0.4, 0.4);
        d[i].vz = U.rand(-0.4, 0.4);
      }
      this.confetti.geometry.attributes.position.needsUpdate = true;
      this.confettiTimer = 8;
      this.crowdCheer(1.4, 6);
    }

    /* ============================ UPDATE ============================ */
    update(dt, time) {
      this.time = time;

      for (const hoop of this.hoops) {
        const net = hoop.net;
        if (net.pulse > 0.001) {
          net.pulse *= Math.exp(-2.4 * dt);
          const pos = net.mesh.geometry.attributes.position.array;
          const base = net.base;
          for (let i = 0; i < pos.length / 3; i++) {
            const bx = base[i * 3], by = base[i * 3 + 1], bz = base[i * 3 + 2];
            const level = (net.y - by) / 0.46;
            const sway = Math.sin(time * 16 + i * 0.9) * net.pulse * 0.07 * level;
            pos[i * 3] = bx + (bx - net.x) * net.pulse * 0.25 * level + sway;
            pos[i * 3 + 1] = by - net.pulse * 0.02 * level;
            pos[i * 3 + 2] = bz + (bz - net.z) * net.pulse * 0.25 * level + sway * 0.7;
          }
          net.mesh.geometry.attributes.position.needsUpdate = true;
        }
      }

      for (const tex of this.ledTextures) {
        tex.offset.x = (time * 0.035) % 1;
      }

      if (this.dust) {
        const arr = this.dust.geometry.attributes.position.array;
        for (let i = 0; i < this.dustSeeds.length; i++) {
          const s = this.dustSeeds[i];
          arr[i * 3 + 1] += Math.sin(time * s.speed + s.phase) * dt * 0.05;
          arr[i * 3] += Math.cos(time * 0.08 + s.phase) * dt * 0.006;
          if (arr[i * 3 + 1] < 0.3) arr[i * 3 + 1] = 13;
        }
        this.dust.geometry.attributes.position.needsUpdate = true;
      }

      if (this.cheerTimer > 0) {
        this.cheerTimer -= dt;
        this.lastCrowdUpdate += dt;
        if (this.lastCrowdUpdate > 0.062) {
          this.lastCrowdUpdate = 0;
          const m = new THREE.Matrix4();
          const q = new THREE.Quaternion();
          const v = new THREE.Vector3();
          const sc = new THREE.Vector3();
          const power = this.cheerPower * Math.max(0, Math.min(1, this.cheerTimer / 1.4));
          const bodies = this.crowdBodies;
          const heads = this.crowdHeads;
          for (let i = 0; i < bodies.length; i++) {
            const b = bodies[i], h = heads[i];
            const bob = Math.max(0, Math.sin(time * 9 + b.phase)) * 0.13 * power;
            v.set(b.world.x, b.world.y + bob, b.world.z);
            sc.set(b.scale, b.scale, b.scale);
            m.compose(v, q, sc);
            this.crowdMesh.setMatrixAt(i, m);
            v.set(h.world.x, h.world.y + bob, h.world.z);
            sc.set(h.scale, h.scale, h.scale);
            m.compose(v, q, sc);
            this.headMesh.setMatrixAt(i, m);
          }
          this.crowdMesh.instanceMatrix.needsUpdate = true;
          this.headMesh.instanceMatrix.needsUpdate = true;
          if (this.cheerTimer <= 0) this.cheerPower = 0;
        }
      }

      if (this.confetti && this.confetti.visible) {
        const arr = this.confetti.geometry.attributes.position.array;
        let any = false;
        for (let i = 0; i < this.confettiData.length; i++) {
          const c = this.confettiData[i];
          c.vy -= 1.4 * dt;
          c.vx += Math.sin(time * 2 + i) * dt * 0.15;
          arr[i * 3] += c.vx * dt;
          arr[i * 3 + 1] += c.vy * dt;
          arr[i * 3 + 2] += c.vz * dt;
          if (arr[i * 3 + 1] > 0.06) any = true;
          else { arr[i * 3 + 1] = 0.06; c.vy = 0; c.vx *= 0.9; c.vz *= 0.9; }
        }
        this.confetti.geometry.attributes.position.needsUpdate = true;
        this.confettiTimer -= dt;
        if (this.confettiTimer <= 0 && !any) this.confetti.visible = false;
      }
    }
  }

  BB.Arena = Arena;
})();
