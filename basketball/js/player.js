/* FULL COURT — articulated players, procedural rigs and animation */
(function () {
  "use strict";
  const BB = (window.BB = window.BB || {});
  const U = BB.util;
  const C = BB.COURT;

  const LOOKS = {
    user: {
      skin: 0xdcae86, hair: 0x1b1512, hairStyle: "fade", beard: false, headband: true,
      sleeve: false, wristband: true, height: 1.92, shoe: 0xf2f6fa, accent: 0x35b7ff,
    },
    kai: {
      skin: 0x8b5738, hair: 0x0c0b0a, hairStyle: "short", beard: true, headband: false,
      sleeve: true, wristband: false, height: 1.98, shoe: 0x11151c, accent: 0x8fe1ff,
    },
    drake: {
      skin: 0xb97c50, hair: 0x20140d, hairStyle: "buzz", beard: false, headband: false,
      sleeve: false, wristband: true, height: 1.88, shoe: 0x1a0a0d, accent: 0xff5f70,
    },
    milo: {
      skin: 0x6a3b21, hair: 0x0a0908, hairStyle: "short", beard: true, headband: true,
      sleeve: true, wristband: true, height: 2.03, shoe: 0x2a0b10, accent: 0xffb0b6,
    },
    trey: {
      skin: 0xc98b5e, hair: 0x120d0a, hairStyle: "short", beard: true, headband: true,
      sleeve: true, wristband: false, height: 1.9, shoe: 0xeff6ff, accent: 0x8fe1ff,
    },
    bron: {
      skin: 0x7a4529, hair: 0x0a0807, hairStyle: "buzz", beard: true, headband: false,
      sleeve: false, wristband: true, height: 2.01, shoe: 0x10141c, accent: 0x9fe8ff,
    },
    zev: {
      skin: 0x5b3520, hair: 0x0a0908, hairStyle: "short", beard: true, headband: true,
      sleeve: true, wristband: true, height: 2.08, shoe: 0x0a1624, accent: 0xc8f4ff,
    },
    vega: {
      skin: 0xd3a077, hair: 0x2b1a10, hairStyle: "fade", beard: false, headband: true,
      sleeve: false, wristband: true, height: 1.94, shoe: 0xf5f7fa, accent: 0xff5f70,
    },
    rok: {
      skin: 0x8c5232, hair: 0x161311, hairStyle: "buzz", beard: true, headband: false,
      sleeve: true, wristband: false, height: 2.0, shoe: 0x1a0a0d, accent: 0xffb0b6,
    },
    grom: {
      skin: 0x4a2a17, hair: 0x0b0a09, hairStyle: "short", beard: true, headband: true,
      sleeve: true, wristband: true, height: 2.11, shoe: 0x2a0b10, accent: 0xffd0d4,
    },
  };

  const RATINGS = {
    user: { speed: 4.55, sprint: 6.25, shoot: 0.82, three: 0.79, handle: 0.84, defense: 0.78, steal: 0.74, block: 0.58, pass: 0.84, dunk: 0.76, stamina: 100 },
    kai: { speed: 4.2, sprint: 5.8, shoot: 0.88, three: 0.9, handle: 0.72, defense: 0.72, steal: 0.62, block: 0.64, pass: 0.82, dunk: 0.7, stamina: 100 },
    trey: { speed: 4.5, sprint: 6.15, shoot: 0.8, three: 0.83, handle: 0.88, defense: 0.72, steal: 0.7, block: 0.45, pass: 0.9, dunk: 0.55, stamina: 100 },
    bron: { speed: 4.1, sprint: 5.7, shoot: 0.74, three: 0.62, handle: 0.68, defense: 0.84, steal: 0.66, block: 0.78, pass: 0.68, dunk: 0.88, stamina: 100 },
    zev: { speed: 3.65, sprint: 5.0, shoot: 0.66, three: 0.42, handle: 0.55, defense: 0.92, steal: 0.58, block: 0.95, pass: 0.62, dunk: 0.97, stamina: 100 },
    drake: { speed: 4.4, sprint: 6.0, shoot: 0.82, three: 0.78, handle: 0.86, defense: 0.84, steal: 0.86, block: 0.52, pass: 0.8, dunk: 0.68, stamina: 100 },
    milo: { speed: 3.75, sprint: 5.1, shoot: 0.7, three: 0.5, handle: 0.6, defense: 0.9, steal: 0.62, block: 0.92, pass: 0.7, dunk: 0.95, stamina: 100 },
    vega: { speed: 4.35, sprint: 5.95, shoot: 0.86, three: 0.88, handle: 0.8, defense: 0.7, steal: 0.68, block: 0.48, pass: 0.8, dunk: 0.62, stamina: 100 },
    rok: { speed: 4.15, sprint: 5.75, shoot: 0.78, three: 0.7, handle: 0.7, defense: 0.82, steal: 0.72, block: 0.76, pass: 0.7, dunk: 0.85, stamina: 100 },
    grom: { speed: 3.55, sprint: 4.9, shoot: 0.6, three: 0.38, handle: 0.52, defense: 0.94, steal: 0.55, block: 0.98, pass: 0.58, dunk: 0.98, stamina: 100 },
  };

  class Player {
    constructor(scene, opts) {
      this.scene = scene;
      this.id = opts.id;
      this.team = opts.team;
      this.isUser = !!opts.isUser;
      this.name = opts.name;
      this.shortName = opts.shortName || opts.name;
      this.number = opts.number;
      this.role = opts.role || "игрок";
      this.teamConf = BB.TEAM[this.team];
      this.look = Object.assign({}, LOOKS[opts.id] || LOOKS.user, opts.look || {});
      this.ratings = Object.assign({}, RATINGS[opts.id] || RATINGS.user, opts.ratings || {});
      this.baseSpeed = this.ratings.speed;
      this.baseSprint = this.ratings.sprint;
      this.heightScale = this.look.height / 1.92;

      this.vel = new THREE.Vector3();
      this.input = { x: 0, z: 0, sprint: false };
      this.facing = this.team === "blue" ? Math.PI / 2 : -Math.PI / 2;
      this.targetFacing = this.facing;
      this.speed = 0;
      this.stamina = 100;
      this.stunned = 0;
      this.jumpY = 0;
      this.jumpVel = 0;
      this.grounded = true;
      this.hasBall = false;
      this.runPhase = Math.random() * Math.PI * 2;
      this.dribblePhase = Math.random();
      this.dribbleSide = 1;
      this.dribbleLift = 0;
      this.dribbleCrossoverT = 0;
      this.spinT = 0;
      this.spinDur = 0.001;
      this.spinOffset = 0;
      this.action = null;
      this.actionTime = 0;
      this.lastStepPhase = 0;
      this.celebrate = false;
      this.lookTarget = new THREE.Vector3();
      this.markerPulse = Math.random() * Math.PI * 2;
      this.footstepAcc = 0;

      this.root = new THREE.Group();
      this.root.name = "player_" + this.id;
      this.root.position.set(opts.x || 0, 0, opts.z || 0);
      this.root.rotation.y = this.facing;
      this.root.scale.setScalar(this.heightScale);
      scene.add(this.root);

      this.buildModel();
      this.buildMarker();
      this.reset(opts.x || 0, opts.z || 0, this.facing);
    }

    /* ============================ MODEL ============================ */
    buildModel() {
      const team = this.teamConf;
      const look = this.look;
      const skinMat = new THREE.MeshStandardMaterial({ color: look.skin, roughness: 0.6, metalness: 0.01 });
      const skinDeepMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(look.skin).multiplyScalar(0.84), roughness: 0.66 });
      const jerseyMat = new THREE.MeshStandardMaterial({ color: team.color, roughness: 0.58, metalness: 0.03 });
      const jerseyDeepMat = new THREE.MeshStandardMaterial({ color: team.deep, roughness: 0.62 });
      const accentMat = new THREE.MeshStandardMaterial({ color: team.accent, roughness: 0.52 });
      const shortMat = new THREE.MeshStandardMaterial({ color: team.color, roughness: 0.6 });
      const shortDeepMat = new THREE.MeshStandardMaterial({ color: team.deep, roughness: 0.64 });
      const sockMat = new THREE.MeshStandardMaterial({ color: 0xf5f7fa, roughness: 0.85 });
      const shoeMat = new THREE.MeshStandardMaterial({ color: look.shoe, roughness: 0.42, metalness: 0.06 });
      const shoeAccentMat = new THREE.MeshStandardMaterial({ color: look.accent, roughness: 0.38 });
      const soleMat = new THREE.MeshStandardMaterial({ color: 0xe8edf3, roughness: 0.6 });
      const hairMat = new THREE.MeshStandardMaterial({ color: look.hair, roughness: 0.92 });
      const darkMat = new THREE.MeshStandardMaterial({ color: 0x0b0c0e, roughness: 0.62 });
      this.mats = { skinMat, skinDeepMat, jerseyMat, jerseyDeepMat, accentMat, shortMat, shortDeepMat, sockMat, shoeMat, shoeAccentMat, soleMat, hairMat, darkMat };

      const hips = new THREE.Group();
      hips.position.y = 1.0;
      this.root.add(hips);
      this.hips = hips;

      // pelvis / shorts
      const pelvis = new THREE.Mesh(new THREE.CylinderGeometry(0.195, 0.225, 0.27, 14), shortMat);
      pelvis.scale.z = 0.72;
      pelvis.position.y = -0.055;
      pelvis.castShadow = true;
      hips.add(pelvis);
      const waistband = new THREE.Mesh(new THREE.CylinderGeometry(0.203, 0.203, 0.035, 14), accentMat);
      waistband.scale.z = 0.72;
      waistband.position.y = 0.078;
      hips.add(waistband);

      // torso
      const torso = new THREE.Group();
      hips.add(torso);
      this.torso = torso;

      const chest = new THREE.Mesh(new THREE.CylinderGeometry(0.223, 0.168, 0.48, 16, 4), jerseyMat);
      chest.scale.z = 0.64;
      chest.position.y = 0.31;
      chest.castShadow = true;
      torso.add(chest);

      const upperChest = new THREE.Mesh(new THREE.SphereGeometry(0.218, 14, 9), jerseyMat);
      upperChest.scale.set(1, 0.62, 0.68);
      upperChest.position.y = 0.535;
      upperChest.castShadow = true;
      torso.add(upperChest);

      // jersey details
      const hem = new THREE.Mesh(new THREE.CylinderGeometry(0.171, 0.171, 0.028, 16), accentMat);
      hem.scale.z = 0.66;
      hem.position.y = 0.083;
      torso.add(hem);

      for (const sx of [-1, 1]) {
        const sideStripe = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.43, 0.018), accentMat);
        sideStripe.position.set(sx * 0.219, 0.31, 0);
        sideStripe.rotation.z = sx * 0.03;
        torso.add(sideStripe);
        const strap = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.025, 0.25), jerseyMat);
        strap.position.set(sx * 0.155, 0.57, 0);
        strap.rotation.z = sx * -0.12;
        torso.add(strap);
      }

      // jersey numbers
      const numTex = U.numberTexture(this.number, "#f6fbff", "rgba(0,0,0,.28)");
      const numMat = new THREE.MeshBasicMaterial({ map: numTex, transparent: true, depthWrite: false, toneMapped: false });
      const frontNum = new THREE.Mesh(new THREE.PlaneGeometry(0.15, 0.15), numMat);
      frontNum.position.set(0, 0.34, 0.143);
      torso.add(frontNum);
      const backNum = new THREE.Mesh(new THREE.PlaneGeometry(0.185, 0.185), numMat);
      backNum.position.set(0, 0.34, -0.143);
      backNum.rotation.y = Math.PI;
      torso.add(backNum);

      const nameTex = U.nameTexture(this.shortName, "", "#f6fbff");
      const namePlane = new THREE.Mesh(new THREE.PlaneGeometry(0.25, 0.078), new THREE.MeshBasicMaterial({ map: nameTex, transparent: true, depthWrite: false, toneMapped: false }));
      namePlane.position.set(0, 0.475, -0.145);
      namePlane.rotation.y = Math.PI;
      torso.add(namePlane);

      // neck + head
      const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.1, 10), skinMat);
      neck.position.y = 0.62;
      neck.castShadow = true;
      torso.add(neck);

      const head = new THREE.Group();
      head.position.y = 0.725;
      torso.add(head);
      this.head = head;

      const skull = new THREE.Mesh(new THREE.SphereGeometry(0.142, 20, 16), skinMat);
      skull.scale.set(1, 1.09, 1.02);
      skull.castShadow = true;
      head.add(skull);

      const earGeo = new THREE.SphereGeometry(0.033, 8, 6);
      for (const sx of [-1, 1]) {
        const ear = new THREE.Mesh(earGeo, skinDeepMat);
        ear.scale.set(0.55, 1, 0.72);
        ear.position.set(sx * 0.139, 0.0, 0.005);
        head.add(ear);
      }

      // eyes
      const eyeWhiteMat = new THREE.MeshStandardMaterial({ color: 0xf3f5f5, roughness: 0.4 });
      const pupilMat = new THREE.MeshStandardMaterial({ color: 0x1a1512, roughness: 0.3 });
      for (const sx of [-1, 1]) {
        const eye = new THREE.Mesh(new THREE.SphereGeometry(0.017, 8, 6), eyeWhiteMat);
        eye.scale.set(1.15, 0.7, 0.55);
        eye.position.set(sx * 0.052, 0.023, 0.132);
        head.add(eye);
        const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.0075, 6, 4), pupilMat);
        pupil.position.set(sx * 0.052, 0.023, 0.146);
        head.add(pupil);
        const brow = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.009, 0.008), hairMat);
        brow.position.set(sx * 0.052, 0.056, 0.136);
        brow.rotation.z = sx * -0.15;
        head.add(brow);
      }
      // nose
      const nose = new THREE.Mesh(new THREE.ConeGeometry(0.017, 0.045, 7), skinDeepMat);
      nose.rotation.x = Math.PI / 2;
      nose.position.set(0, -0.005, 0.147);
      head.add(nose);
      // mouth
      const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.046, 0.008, 0.008), new THREE.MeshStandardMaterial({ color: 0x522f29, roughness: 0.8 }));
      mouth.position.set(0, -0.058, 0.132);
      head.add(mouth);

      // hair
      const hairCap = new THREE.Mesh(
        new THREE.SphereGeometry(0.147, 18, 12, 0, Math.PI * 2, 0, look.hairStyle === "buzz" ? 1.18 : 1.35),
        hairMat
      );
      hairCap.scale.set(1.015, 1.1, 1.04);
      hairCap.position.y = 0.012;
      hairCap.castShadow = true;
      head.add(hairCap);
      if (look.hairStyle === "fade") {
        const fade = new THREE.Mesh(new THREE.SphereGeometry(0.146, 16, 10, 0, Math.PI * 2, 0.65, 0.65), new THREE.MeshStandardMaterial({ color: new THREE.Color(look.hair).multiplyScalar(0.7), roughness: 0.95 }));
        fade.scale.set(1.01, 1.07, 1.03);
        fade.position.y = 0.013;
        head.add(fade);
      }
      if (look.beard) {
        const beard = new THREE.Mesh(
          new THREE.SphereGeometry(0.145, 16, 12, 0, Math.PI * 2, Math.PI * 0.63, Math.PI * 0.24),
          new THREE.MeshStandardMaterial({ color: new THREE.Color(look.hair).multiplyScalar(0.86), roughness: 0.95 })
        );
        beard.scale.set(1.0, 1.06, 1.02);
        beard.position.set(0, 0.004, 0.006);
        head.add(beard);
      }
      if (look.headband) {
        const band = new THREE.Mesh(new THREE.TorusGeometry(0.143, 0.012, 6, 24), accentMat);
        band.rotation.x = Math.PI / 2;
        band.position.y = 0.058;
        band.scale.z = 0.96;
        head.add(band);
      }

      // arms
      const armGeo = new THREE.CapsuleGeometry(0.056, 0.17, 4, 8);
      const foreGeo = new THREE.CapsuleGeometry(0.047, 0.15, 4, 8);
      const handGeo = new THREE.SphereGeometry(0.055, 10, 8);
      this.arms = {};
      for (const side of ["L", "R"]) {
        const sx = side === "L" ? -1 : 1;
        const shoulder = new THREE.Group();
        shoulder.position.set(sx * 0.275, 0.525, 0);
        torso.add(shoulder);

        const cap = new THREE.Mesh(new THREE.SphereGeometry(0.085, 10, 8), jerseyMat);
        cap.scale.set(1, 0.85, 0.92);
        cap.castShadow = true;
        shoulder.add(cap);

        const upper = new THREE.Mesh(armGeo, skinMat);
        upper.position.y = -0.155;
        upper.castShadow = true;
        shoulder.add(upper);

        if (look.sleeve && side === "L") {
          const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.057, 0.055, 0.19, 10), darkMat);
          sleeve.position.y = -0.13;
          shoulder.add(sleeve);
        }

        const elbow = new THREE.Group();
        elbow.position.y = -0.3;
        shoulder.add(elbow);

        const fore = new THREE.Mesh(foreGeo, skinMat);
        fore.position.y = -0.135;
        fore.castShadow = true;
        elbow.add(fore);

        if (look.wristband) {
          const wrist = new THREE.Mesh(new THREE.CylinderGeometry(0.049, 0.047, 0.052, 10), side === "R" ? accentMat : jerseyDeepMat);
          wrist.position.y = -0.24;
          elbow.add(wrist);
        }

        const hand = new THREE.Mesh(handGeo, skinMat);
        hand.scale.set(0.85, 1.05, 0.8);
        hand.position.y = -0.292;
        hand.castShadow = true;
        elbow.add(hand);
        const handAnchor = new THREE.Object3D();
        handAnchor.position.y = -0.31;
        elbow.add(handAnchor);

        this.arms[side] = { shoulder, elbow, hand, handAnchor, sx };
      }
      this.shoulderL = this.arms.L.shoulder;
      this.shoulderR = this.arms.R.shoulder;
      this.elbowL = this.arms.L.elbow;
      this.elbowR = this.arms.R.elbow;
      this.handR = this.arms.R.handAnchor;

      // legs
      this.legs = {};
      const thighGeo = new THREE.CapsuleGeometry(0.075, 0.34, 4, 8);
      const shinGeo = new THREE.CapsuleGeometry(0.06, 0.29, 4, 8);
      for (const side of ["L", "R"]) {
        const sx = side === "L" ? -1 : 1;
        const thigh = new THREE.Group();
        thigh.position.set(sx * 0.115, -0.02, 0);
        hips.add(thigh);

        const shortsLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.105, 0.098, 0.23, 10), shortMat);
        shortsLeg.scale.z = 0.84;
        shortsLeg.position.y = -0.095;
        shortsLeg.castShadow = true;
        thigh.add(shortsLeg);
        const shortStripe = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.2, 0.02), accentMat);
        shortStripe.position.set(sx * 0.095, -0.09, 0.02);
        thigh.add(shortStripe);

        const leg = new THREE.Mesh(thighGeo, skinMat);
        leg.position.y = -0.24;
        leg.castShadow = true;
        thigh.add(leg);

        const knee = new THREE.Group();
        knee.position.y = -0.47;
        thigh.add(knee);

        const shin = new THREE.Mesh(shinGeo, skinMat);
        shin.position.y = -0.19;
        shin.castShadow = true;
        knee.add(shin);

        const sock = new THREE.Mesh(new THREE.CylinderGeometry(0.064, 0.06, 0.16, 10), sockMat);
        sock.position.y = -0.35;
        knee.add(sock);

        const ankle = new THREE.Group();
        ankle.position.y = -0.44;
        knee.add(ankle);

        const sole = new THREE.Mesh(new THREE.BoxGeometry(0.115, 0.032, 0.29), soleMat);
        sole.position.set(0, 0.016, 0.055);
        sole.castShadow = true;
        ankle.add(sole);

        const shoe = new THREE.Mesh(new THREE.CapsuleGeometry(0.062, 0.14, 4, 10), shoeMat);
        shoe.rotation.x = Math.PI / 2;
        shoe.scale.set(1, 0.78, 0.9);
        shoe.position.set(0, 0.075, 0.05);
        shoe.castShadow = true;
        ankle.add(shoe);

        const toeCap = new THREE.Mesh(new THREE.SphereGeometry(0.063, 10, 7), shoeMat);
        toeCap.scale.set(0.85, 0.62, 1.15);
        toeCap.position.set(0, 0.062, 0.155);
        ankle.add(toeCap);

        const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.126, 0.018, 0.09), shoeAccentMat);
        stripe.position.set(0, 0.083, 0.045);
        ankle.add(stripe);

        this.legs[side] = { thigh, knee, ankle, sx };
      }
      this.thighL = this.legs.L.thigh;
      this.thighR = this.legs.R.thigh;
      this.kneeL = this.legs.L.knee;
      this.kneeR = this.legs.R.knee;
      this.ankleL = this.legs.L.ankle;
      this.ankleR = this.legs.R.ankle;

      this.root.traverse((o) => {
        if (o.isMesh) {
          o.castShadow = true;
          o.receiveShadow = false;
        }
      });
    }

    buildMarker() {
      const team = this.teamConf;
      const ringMat = new THREE.MeshBasicMaterial({
        color: this.isUser ? 0xc8ff3d : team.color,
        transparent: true, opacity: this.isUser ? 0.8 : 0.25, depthWrite: false, side: THREE.DoubleSide,
      });
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.38, 0.48, 32), ringMat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.026;
      this.scene.add(ring);
      this.marker = ring;

      const sub = this.isUser ? "ВЫ" : (this.team === "blue" ? "ПАРТНЁР" : "СОПЕРНИК");
      const label = U.labelSprite(this.isUser ? "ВЫ" : this.shortName, "", this.isUser ? "#c8ff3d" : (this.team === "blue" ? "#8fe1ff" : "#ff9aa4"), this.isUser ? 1.15 : 1.0);
      label.position.set(this.root.position.x, 2.35, this.root.position.z);
      this.scene.add(label);
      this.label = label;

      const c = U.canvas(128, 128);
      const ctx = c.getContext("2d");
      const g = ctx.createRadialGradient(64, 64, 4, 64, 64, 64);
      g.addColorStop(0, "rgba(0,0,0,.52)");
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 128, 128);
      const shadow = new THREE.Mesh(
        new THREE.PlaneGeometry(1.35, 1.35),
        new THREE.MeshBasicMaterial({ map: U.texture(c, false), transparent: true, depthWrite: false, opacity: 0.68 })
      );
      shadow.rotation.x = -Math.PI / 2;
      shadow.position.y = 0.022;
      this.scene.add(shadow);
      this.blob = shadow;
    }

    /* ============================ ACTIONS ============================ */
    reset(x, z, facing) {
      this.root.position.set(x, 0, z);
      this.vel.set(0, 0, 0);
      this.speed = 0;
      this.facing = facing;
      this.targetFacing = facing;
      this.root.rotation.y = facing;
      this.jumpY = 0;
      this.jumpVel = 0;
      this.grounded = true;
      this.stunned = 0;
      this.hasBall = false;
      this.action = null;
      this.actionTime = 0;
      this.stamina = Math.min(100, this.stamina + 25);
      this.celebrate = false;
      this.dribblePhase = 0;
      this.dribbleSide = 1;
      this.dribbleCrossoverT = 0;
      this.spinT = 0;
      this.spinOffset = 0;
      this.root.visible = true;
      this.marker.visible = true;
      this.label.visible = true;
      this.blob.visible = true;
      this.updateVisual(0, 0, true);
    }

    playAction(type, dur = 0.5, opts = {}) {
      this.action = {
        type, dur, t: 0, loop: !!opts.loop, blend: opts.blend || 1, data: opts.data || null,
      };
      this.actionTime = 0;
    }

    cancelAction() {
      this.action = null;
      this.actionTime = 0;
    }

    isAction(type) {
      return this.action && this.action.type === type;
    }

    isBusy() {
      if (!this.action || this.action.loop) return false;
      return ["shoot", "dunk", "layup", "pass", "steal", "block", "stumble", "foul", "receive", "freeThrow"].includes(this.action.type);
    }

    getActionPhase() {
      if (!this.action || this.action.dur <= 0) return 0;
      return U.clamp(this.action.t / this.action.dur, 0, 1);
    }

    applyStun(dur) {
      this.stunned = Math.max(this.stunned, dur);
      this.playAction("stumble", dur, {});
    }

    doJump(power = 1) {
      if (!this.grounded) return false;
      this.jumpVel = 4.5 * power;
      this.grounded = false;
      return true;
    }

    setInput(x, z, sprint) {
      this.input.x = x;
      this.input.z = z;
      this.input.sprint = !!sprint;
    }

    faceToward(x, z, lambda = 10, dt = 0.016) {
      const dx = x - this.root.position.x;
      const dz = z - this.root.position.z;
      if (Math.abs(dx) + Math.abs(dz) < 0.001) return;
      this.targetFacing = Math.atan2(dx, dz);
    }

    getForward(out = new THREE.Vector3()) {
      return out.set(Math.sin(this.facing), 0, Math.cos(this.facing));
    }

    getRight(out = new THREE.Vector3()) {
      return out.set(Math.cos(this.facing), 0, -Math.sin(this.facing));
    }

    getChest(out = new THREE.Vector3()) {
      const f = this.getForward(new THREE.Vector3());
      out.set(
        this.root.position.x + f.x * 0.23,
        1.32 + this.jumpY + this.root.position.y,
        this.root.position.z + f.z * 0.23
      );
      return out;
    }

    getReleasePoint(out = new THREE.Vector3()) {
      const f = this.getForward(new THREE.Vector3());
      out.set(
        this.root.position.x + f.x * 0.24,
        2.18 + this.jumpY,
        this.root.position.z + f.z * 0.24
      );
      return out;
    }

    getReachY() {
      return 2.45 * this.heightScale + this.jumpY;
    }

    /* ============================ UPDATE ============================ */
    update(dt, time, game) {
      if (this.stunned > 0) this.stunned = Math.max(0, this.stunned - dt);

      this.dribblePhase += dt * (this.hasBall && this.grounded ? (4.8 + this.speed * 1.05) : 0);
      if (this.dribbleCrossoverT > 0) this.dribbleCrossoverT = Math.max(0, this.dribbleCrossoverT - dt * 3.2);
      if (this.spinT > 0) {
        this.spinT = Math.max(0, this.spinT - dt);
        const prog = 1 - this.spinT / this.spinDur;
        this.spinOffset = Math.sin(U.clamp(prog, 0, 1) * Math.PI) * Math.PI * 2;
      } else {
        this.spinOffset = 0;
      }
      if (this.hasBall) {
        this.dribbleLift = Math.abs(Math.sin(this.dribblePhase));
      } else {
        this.dribbleLift = U.damp(this.dribbleLift, 0, 6, dt);
      }

      let moveX = this.input.x;
      let moveZ = this.input.z;
      const im = Math.hypot(moveX, moveZ);
      if (im > 1) { moveX /= im; moveZ /= im; }
      const wantsMove = this.stunned <= 0 && im > 0.04;
      const onGround = this.grounded;
      let actionSlow = 1;
      if (this.action) {
        const t = this.action.type;
        if (t === "shoot" || t === "dunk" || t === "layup" || t === "freeThrow" || t === "stumble" || t === "foul") actionSlow = 0.12;
        else if (t === "pass" || t === "steal" || t === "block") actionSlow = 0.55;
        else if (t === "charge") actionSlow = 0.62;
        else if (t === "receive") actionSlow = 0.8;
      }
      const sprint = this.input.sprint && this.stamina > 4 && wantsMove;
      let maxSpeed = (sprint ? this.baseSprint : this.baseSpeed) * this.heightScale * actionSlow;
      if (this.hasBall) maxSpeed *= 0.93;
      if (this.stamina < 22) maxSpeed *= 0.8;
      const accel = onGround ? 15 : 4.5;
      const desiredX = wantsMove ? moveX * maxSpeed : 0;
      const desiredZ = wantsMove ? moveZ * maxSpeed : 0;
      this.vel.x = U.damp(this.vel.x, desiredX, wantsMove ? accel : 12, dt);
      this.vel.z = U.damp(this.vel.z, desiredZ, wantsMove ? accel : 12, dt);
      if (this.stunned > 0) {
        this.vel.x = U.damp(this.vel.x, 0, 6, dt);
        this.vel.z = U.damp(this.vel.z, 0, 6, dt);
      }
      this.root.position.x += this.vel.x * dt;
      this.root.position.z += this.vel.z * dt;
      this.speed = Math.hypot(this.vel.x, this.vel.z);

      // stamina
      const staminaRate = this.ratings.stamina;
      if (sprint && this.speed > 1.2) this.stamina = Math.max(0, this.stamina - dt * (7.5 * (100 / staminaRate)));
      else this.stamina = Math.min(100, this.stamina + dt * (sprint ? 1.5 : 6.5));
      if (this.isUser) this.stamina = U.clamp(this.stamina, 0, 100);

      // jump physics
      if (!this.grounded) {
        this.jumpVel -= 12.8 * dt;
        this.jumpY += this.jumpVel * dt;
        if (this.jumpY <= 0) {
          this.jumpY = 0;
          this.jumpVel = 0;
          this.grounded = true;
          if (game && game.audio) game.audio.sneaker();
        }
      }

      if (wantsMove && onGround) {
        this.targetFacing = Math.atan2(moveX, moveZ);
      }
      this.facing = U.dampAngle(this.facing, this.targetFacing, this.isUser ? 14 : 10, dt);
      this.root.rotation.y = this.facing + this.spinOffset;

      if (wantsMove && onGround) {
        const prev = this.runPhase;
        this.runPhase += dt * (5.2 + this.speed * 1.45);
        if (Math.floor(prev / Math.PI) !== Math.floor(this.runPhase / Math.PI) && this.speed > 1.8) {
          if (game && game.audio) game.audio.sneaker();
        }
      } else {
        this.runPhase = U.damp(this.runPhase, Math.round(this.runPhase / Math.PI) * Math.PI, 5, dt);
      }

      if (this.action) {
        this.action.t += dt;
        if (!this.action.loop && this.action.t >= this.action.dur) {
          this.action = null;
        }
      }

      this.root.position.y = this.jumpY;
      this.updateVisual(dt, time, false);
    }

    updateVisual(dt, time, instant) {
      const spdNorm = U.clamp(this.speed / 5.8, 0, 1);
      const p = this.poseTargets(time, spdNorm);
      const lambda = instant ? 1000 : 13;
      const d = (cur, target, l = lambda) => U.damp(cur, target, l, dt || 0.016);

      this.hips.position.y = d(this.hips.position.y, p.hipsY);
      this.hips.rotation.z = d(this.hips.rotation.z, p.hipsZ);
      this.torso.rotation.x = d(this.torso.rotation.x, p.torsoX);
      this.torso.rotation.y = d(this.torso.rotation.y, p.torsoY);
      this.torso.rotation.z = d(this.torso.rotation.z, p.torsoZ);
      this.head.rotation.x = d(this.head.rotation.x, p.headX);
      this.head.rotation.y = d(this.head.rotation.y, p.headY);
      this.head.rotation.z = d(this.head.rotation.z, p.headZ);

      this.shoulderL.rotation.x = d(this.shoulderL.rotation.x, p.shLx);
      this.shoulderL.rotation.y = d(this.shoulderL.rotation.y, p.shLy);
      this.shoulderL.rotation.z = d(this.shoulderL.rotation.z, p.shLz);
      this.elbowL.rotation.x = d(this.elbowL.rotation.x, p.elLx);
      this.elbowL.rotation.z = d(this.elbowL.rotation.z, p.elLz || 0);
      this.shoulderR.rotation.x = d(this.shoulderR.rotation.x, p.shRx);
      this.shoulderR.rotation.y = d(this.shoulderR.rotation.y, p.shRy);
      this.shoulderR.rotation.z = d(this.shoulderR.rotation.z, p.shRz);
      this.elbowR.rotation.x = d(this.elbowR.rotation.x, p.elRx);
      this.elbowR.rotation.z = d(this.elbowR.rotation.z, p.elRz || 0);

      this.thighL.rotation.x = d(this.thighL.rotation.x, p.thLx);
      this.thighL.rotation.z = d(this.thighL.rotation.z, p.thLz || 0);
      this.thighR.rotation.x = d(this.thighR.rotation.x, p.thRx);
      this.thighR.rotation.z = d(this.thighR.rotation.z, p.thRz || 0);
      this.kneeL.rotation.x = d(this.kneeL.rotation.x, p.knLx);
      this.kneeR.rotation.x = d(this.kneeR.rotation.x, p.knRx);
      this.ankleL.rotation.x = d(this.ankleL.rotation.x, p.anLx);
      this.ankleR.rotation.x = d(this.ankleR.rotation.x, p.anRx);

      // marker + label + blob
      this.marker.position.x = this.root.position.x;
      this.marker.position.z = this.root.position.z;
      this.markerPulse += (dt || 0.016) * 2.4;
      const vis = this.isUser ? 0.55 + Math.sin(this.markerPulse) * 0.22 : 0.16;
      this.marker.material.opacity = vis;
      this.marker.visible = !this.hasBall || this.stunned > 0 ? true : this.isUser ? true : true;
      this.label.position.set(this.root.position.x, 2.3 + this.jumpY, this.root.position.z);
      this.label.material.opacity = U.clamp((2.3 - 2.3) + 1, 0, 1);
      this.blob.position.x = this.root.position.x;
      this.blob.position.z = this.root.position.z;
      const air = U.clamp(this.jumpY / 1.2, 0, 1);
      this.blob.material.opacity = 0.62 * (1 - air * 0.65);
      this.blob.scale.setScalar(1 - air * 0.22);
      this.blob.visible = true;
    }

    poseTargets(time, spdNorm) {
      const p = {
        hipsY: 1.0,
        hipsZ: 0,
        torsoX: 0.01,
        torsoY: 0,
        torsoZ: 0,
        headX: 0,
        headY: 0,
        headZ: 0,
        shLx: 0.03,
        shLy: 0,
        shLz: -0.09,
        elLx: 0.14,
        elLz: 0,
        shRx: 0.03,
        shRy: 0,
        shRz: 0.09,
        elRx: 0.14,
        elRz: 0,
        thLx: -0.01,
        thLz: -0.015,
        thRx: -0.01,
        thRz: 0.015,
        knLx: 0.03,
        knRx: 0.03,
        anLx: 0,
        anRx: 0,
      };
      const moving = this.speed > 0.35;
      const run = Math.sin(this.runPhase);
      const run2 = Math.sin(this.runPhase * 2);
      const breathe = Math.sin(time * 2.1 + this.number) * 0.006;
      p.hipsY = 1.0 + breathe;
      p.headX = 0.01;

      if (moving) {
        const n = spdNorm;
        p.torsoX = 0.11 * n + 0.02;
        p.headX = -0.08 * n;
        p.hipsY += Math.abs(run2) * 0.032 * n;
        p.hipsZ = -run * 0.035 * n;
        p.shLx = run * 0.78 * n;
        p.shRx = -run * 0.78 * n;
        p.shLz = -0.1;
        p.shRz = 0.1;
        p.elLx = 0.25 + 0.62 * n;
        p.elRx = 0.25 + 0.62 * n;
        p.thLx = -run * 0.82 * n;
        p.thRx = run * 0.82 * n;
        p.knLx = 0.12 + Math.max(0, run) * 1.25 * n;
        p.knRx = 0.12 + Math.max(0, -run) * 1.25 * n;
        p.anLx = -Math.max(0, -run) * 0.2 * n;
        p.anRx = -Math.max(0, run) * 0.2 * n;
      } else {
        const idle = Math.sin(time * 1.8 + this.number * 0.8);
        p.torsoX = 0.025 + idle * 0.008;
        p.shLz = -0.13;
        p.shRz = 0.13;
        p.elLx = 0.24;
        p.elRx = 0.24;
        p.knLx = 0.045;
        p.knRx = 0.045;
      }

      // dribbling overlay
      if (this.hasBall) {
        const lift = this.dribbleLift;
        const crossover = this.dribbleCrossoverT || 0;
        const side = this.dribbleSide || 1;
        p.torsoY = -0.12 * side + (crossover * 0.5);
        p.shRz = 0.22 + (side > 0 ? 0.05 : 0.4);
        p.shRx = -0.18 - (1 - lift) * 0.35;
        p.elRx = 0.35 + lift * 0.28;
        p.shLx = -0.32;
        p.shLz = -0.42;
        p.elLx = 0.95;
        if (moving) {
          p.shRx += run * 0.22;
          p.shLx += -run * 0.28;
          p.elLx = 0.8;
        }
      }

      if (!this.grounded) {
        const airT = U.clamp(this.jumpY / 0.8, 0, 1);
        p.thLx = -0.35 * airT;
        p.thRx = -0.12 * airT;
        p.knLx = 0.8 * airT;
        p.knRx = 0.35 * airT;
        p.anLx = -0.3 * airT;
        p.anRx = -0.15 * airT;
        p.torsoX = 0.08;
        if (!this.action || !["shoot", "dunk", "layup", "block", "rebound"].includes(this.action.type)) {
          p.shLx = -0.4;
          p.shRx = -0.4;
          p.shLz = -0.55;
          p.shRz = 0.55;
        }
      }

      if (this.action) {
        this.applyActionPose(p, time, spdNorm);
      }

      // subtle look-at-ball head tracking
      if (!this.action && this.speed < 1.2) {
        const dx = this.lookTarget.x - this.root.position.x;
        const dz = this.lookTarget.z - this.root.position.z;
        if (Math.abs(dx) + Math.abs(dz) > 0.1) {
          let a = Math.atan2(dx, dz) - this.facing;
          a = U.wrapAngle(a);
          p.headY = U.clamp(a, -0.55, 0.55) * 0.65;
          p.headX += U.clamp((this.lookTarget.y - 1.7) * 0.15, -0.25, 0.3);
        }
      }
      return p;
    }

    applyActionPose(p, time, spdNorm) {
      const a = this.action;
      const t = U.clamp(a.t / Math.max(0.0001, a.dur), 0, 1);
      const type = a.type;
      const ease = U.smoothstep;

      if (type === "charge") {
        const w = ease(U.clamp(a.t * 2.6, 0, 1));
        p.torsoX = 0.02;
        p.shRx = U.lerp(p.shRx, -2.35, w);
        p.shRz = U.lerp(p.shRz, 0.16, w);
        p.elRx = U.lerp(p.elRx, -0.35, w);
        p.shLx = U.lerp(p.shLx, -2.1, w);
        p.shLz = U.lerp(p.shLz, -0.28, w);
        p.elLx = U.lerp(p.elLx, -0.5, w);
        p.knLx = U.lerp(p.knLx, 0.55, w);
        p.knRx = U.lerp(p.knRx, 0.42, w);
        p.hipsY = U.lerp(p.hipsY, 0.94, w);
        p.headX = -0.05;
      } else if (type === "shoot" || type === "freeThrow") {
        const wind = ease(U.clamp(t / 0.38, 0, 1));
        const release = ease(U.clamp((t - 0.32) / 0.3, 0, 1));
        const follow = ease(U.clamp((t - 0.55) / 0.35, 0, 1));
        p.shRx = -2.2 - release * 0.28;
        p.shRz = 0.15;
        p.elRx = -0.3 + follow * -0.18;
        p.shLx = -2.05 - release * 0.22;
        p.shLz = -0.26;
        p.elLx = -0.42;
        p.knLx = 0.62 - release * 0.55;
        p.knRx = 0.45 - release * 0.4;
        p.hipsY = 0.945 + release * 0.03;
        p.torsoX = 0.03;
        p.headX = -0.05 - release * 0.05;
        if (type === "freeThrow") {
          p.shRx = -2.1 - release * 0.2;
          p.shLx = -1.95;
        }
      } else if (type === "dunk" || type === "layup") {
        const wind = ease(U.clamp(t / 0.35, 0, 1));
        const smash = ease(U.clamp((t - 0.42) / 0.3, 0, 1));
        const land = ease(U.clamp((t - 0.72) / 0.28, 0, 1));
        if (type === "dunk") {
          p.shRx = U.lerp(-0.4, -3.1, wind) + smash * 0.35;
          p.shRz = 0.12;
          p.elRx = U.lerp(0.3, -0.1, wind);
          p.shLx = -0.5;
          p.shLz = -0.55;
          p.elLx = 0.8;
          p.torsoX = 0.16 - smash * 0.2;
          p.knLx = 1.1 * (1 - smash);
          p.knRx = 0.9 * (1 - smash);
          p.headX = 0.15 - smash * 0.35;
        } else {
          p.shRx = U.lerp(-0.4, -2.7, wind);
          p.shRz = 0.22;
          p.elRx = U.lerp(0.3, 0.1, wind);
          p.shLx = -0.9;
          p.shLz = -0.5;
          p.elLx = 0.9;
          p.torsoX = 0.1;
          p.knLx = 0.8;
          p.knRx = 0.55;
          p.thRx = -0.55;
        }
        if (land > 0) {
          p.torsoX += land * 0.15;
          p.knLx += land * 0.3;
          p.knRx += land * 0.25;
        }
      } else if (type === "pass") {
        const ext = ease(U.clamp(t / 0.3, 0, 1));
        const ret = ease(U.clamp((t - 0.45) / 0.55, 0, 1));
        p.shLx = U.lerp(-0.6, -1.5, ext) + ret * 0.6;
        p.shRx = U.lerp(-0.6, -1.5, ext) + ret * 0.6;
        p.shLz = -0.2;
        p.shRz = 0.2;
        p.elLx = U.lerp(1.1, 0.1, ext) + ret * 0.8;
        p.elRx = U.lerp(1.1, 0.1, ext) + ret * 0.8;
        p.torsoX = 0.16 * ext;
        p.torsoY = 0;
        p.knLx = 0.18;
        p.knRx = 0.18;
      } else if (type === "steal") {
        const swipe = Math.sin(U.clamp(t, 0, 1) * Math.PI);
        p.torsoY = -0.35 * swipe;
        p.torsoX = 0.15;
        p.shRx = U.lerp(-0.2, -1.45, swipe);
        p.shRz = 0.2 + swipe * 0.6;
        p.elRx = 0.2 + swipe * 0.2;
        p.shLx = -0.2;
        p.shLz = -0.5;
        p.elLx = 0.6;
        p.thLx = -0.18;
        p.knLx = 0.35;
      } else if (type === "block" || type === "rebound") {
        const up = ease(U.clamp(t / 0.22, 0, 1));
        p.shLx = U.lerp(-0.3, -3.02, up);
        p.shRx = p.shLx;
        p.shLz = -0.22;
        p.shRz = 0.22;
        p.elLx = U.lerp(0.4, 0.02, up);
        p.elRx = p.elLx;
        p.torsoX = 0.03;
        p.headX = -0.2;
        p.knLx = U.lerp(0.4, 0.15, up);
        p.knRx = p.knLx;
      } else if (type === "receive") {
        const w = Math.sin(t * Math.PI);
        p.shLx = -0.95 * w - 0.15;
        p.shRx = p.shLx;
        p.shLz = -0.35;
        p.shRz = 0.35;
        p.elLx = 0.5 + w * 0.4;
        p.elRx = p.elLx;
        p.torsoX = 0.1;
      } else if (type === "inbound") {
        p.shLx = -0.78;
        p.shRx = -0.78;
        p.shLz = -0.2;
        p.shRz = 0.2;
        p.elLx = 0.9;
        p.elRx = 0.9;
        p.torsoX = 0.05;
      } else if (type === "stumble") {
        const w = Math.sin(t * Math.PI * 2.5) * (1 - t);
        p.torsoX = -0.22 * (1 - t) + 0.1;
        p.torsoY = w * 0.35;
        p.torsoZ = w * 0.15;
        p.shLx = -0.5 + w * 0.8;
        p.shRx = 0.3 - w * 0.8;
        p.shLz = -0.7;
        p.shRz = 0.7;
        p.elLx = 0.9;
        p.elRx = 0.9;
        p.headX = -0.1;
        p.headZ = w * 0.2;
        p.knLx = 0.5 + w * 0.2;
        p.knRx = 0.5 - w * 0.2;
        p.hipsY = 0.94;
      } else if (type === "foul") {
        const w = ease(U.clamp(t * 2, 0, 1));
        p.shLx = -2.4 * w;
        p.shRx = -2.4 * w;
        p.shLz = -0.3;
        p.shRz = 0.3;
        p.elLx = 0.2;
        p.elRx = 0.2;
        p.headX = -0.15;
        p.torsoX = -0.05;
      } else if (type === "celebrate") {
        const pump = Math.sin(time * 8) * 0.15;
        p.shLx = -2.8 + pump;
        p.shRx = -2.8 - pump;
        p.shLz = -0.35;
        p.shRz = 0.35;
        p.elLx = 0.2;
        p.elRx = 0.2;
        p.headX = -0.15;
        p.hipsZ = Math.sin(time * 4) * 0.035;
      } else if (type === "dejected") {
        p.torsoX = 0.25;
        p.headX = 0.32;
        p.shLx = 0.1;
        p.shRx = 0.1;
        p.shLz = -0.05;
        p.shRz = 0.05;
        p.elLx = 0.1;
        p.elRx = 0.1;
        p.knLx = 0.12;
        p.knRx = 0.12;
        p.hipsY = 0.97;
      }
    }
  }

  BB.Player = Player;
  BB.PLAYER_LOOKS = LOOKS;
  BB.PLAYER_RATINGS = RATINGS;
})();
