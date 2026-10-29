/* FULL COURT — procedural WebAudio arena soundscape */
(function () {
  "use strict";
  const BB = (window.BB = window.BB || {});

  class AudioEngine {
    constructor() {
      this.ctx = null;
      this.master = null;
      this.crowdGain = null;
      this.crowdFilter = null;
      this.muted = false;
      this.ready = false;
      this.noiseBuf = null;
      this.crowdTarget = 0.032;
      this.lastDribble = 0;
    }

    init() {
      if (this.ctx) {
        if (this.ctx.state === "suspended") this.ctx.resume();
        return;
      }
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.85;
      this.master.connect(this.ctx.destination);
      this.noiseBuf = this.makeNoise(2.5);
      this.buildCrowd();
      this.ready = true;
    }

    resume() {
      if (this.ctx && this.ctx.state === "suspended") this.ctx.resume();
    }

    makeNoise(seconds) {
      const rate = this.ctx.sampleRate;
      const len = Math.floor(rate * seconds);
      const buf = this.ctx.createBuffer(1, len, rate);
      const data = buf.getChannelData(0);
      let last = 0;
      for (let i = 0; i < len; i++) {
        const white = Math.random() * 2 - 1;
        last = last * 0.72 + white * 0.28;
        data[i] = last;
      }
      return buf;
    }

    buildCrowd() {
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuf;
      src.loop = true;
      this.crowdFilter = this.ctx.createBiquadFilter();
      this.crowdFilter.type = "bandpass";
      this.crowdFilter.frequency.value = 620;
      this.crowdFilter.Q.value = 0.48;
      this.crowdGain = this.ctx.createGain();
      this.crowdGain.gain.value = 0;
      const lp = this.ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 1800;
      src.connect(this.crowdFilter).connect(lp).connect(this.crowdGain).connect(this.master);
      src.start();

      const src2 = this.ctx.createBufferSource();
      src2.buffer = this.noiseBuf;
      src2.loop = true;
      const lp2 = this.ctx.createBiquadFilter();
      lp2.type = "lowpass";
      lp2.frequency.value = 170;
      const g2 = this.ctx.createGain();
      g2.gain.value = 0.12;
      src2.connect(lp2).connect(g2).connect(this.crowdGain);
      src2.start();

      this.crowdGain.gain.linearRampToValueAtTime(this.crowdTarget, this.ctx.currentTime + 2.2);

      const hum = this.ctx.createOscillator();
      const humGain = this.ctx.createGain();
      hum.type = "sine";
      hum.frequency.value = 51;
      humGain.gain.value = 0.013;
      hum.connect(humGain).connect(this.master);
      hum.start();
    }

    setMuted(m) {
      this.muted = m;
      if (!this.master) return;
      this.master.gain.cancelScheduledValues(this.ctx.currentTime);
      this.master.gain.linearRampToValueAtTime(m ? 0 : 0.85, this.ctx.currentTime + 0.15);
    }

    noiseBurst({ dur = 0.18, type = "highpass", freq = 800, q = 0.8, gain = 0.12, to = null, delay = 0 }) {
      if (!this.ready) return;
      const t = this.ctx.currentTime + delay;
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuf;
      const f = this.ctx.createBiquadFilter();
      f.type = type;
      f.frequency.setValueAtTime(freq, t);
      if (to) f.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + dur);
      f.Q.value = q;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(gain, t + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(f).connect(g).connect(this.master);
      src.start(t);
      src.stop(t + dur + 0.02);
    }

    tone({ freq = 440, to = null, dur = 0.2, type = "sine", gain = 0.1, delay = 0, attack = 0.005 }) {
      if (!this.ready) return;
      const t = this.ctx.currentTime + delay;
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = type;
      o.frequency.setValueAtTime(freq, t);
      if (to) o.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(gain, t + attack);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(this.master);
      o.start(t);
      o.stop(t + dur + 0.03);
    }

    dribble(intensity = 1) {
      if (!this.ready) return;
      const now = this.ctx.currentTime;
      if (now - this.lastDribble < 0.14) return;
      this.lastDribble = now;
      this.tone({ freq: 115, to: 48, dur: 0.1, type: "sine", gain: 0.12 * intensity });
      this.noiseBurst({ dur: 0.05, type: "lowpass", freq: 420, gain: 0.035 * intensity });
    }

    sneaker() {
      this.noiseBurst({ dur: 0.09, type: "highpass", freq: 2200, q: 1.5, gain: 0.018 });
    }

    rim(force = 1) {
      if (!this.ready) return;
      this.tone({ freq: 620, to: 380, dur: 0.32, type: "triangle", gain: 0.11 * force });
      this.tone({ freq: 1180, to: 900, dur: 0.18, type: "sine", gain: 0.05 * force });
      this.noiseBurst({ dur: 0.08, type: "bandpass", freq: 1800, q: 2, gain: 0.04 * force });
    }

    backboard(force = 1) {
      this.tone({ freq: 160, to: 90, dur: 0.18, type: "sine", gain: 0.13 * force });
      this.noiseBurst({ dur: 0.1, type: "lowpass", freq: 900, gain: 0.07 * force });
    }

    swish() {
      this.noiseBurst({ dur: 0.3, type: "bandpass", freq: 3200, q: 1.4, gain: 0.09, to: 1400 });
    }

    pass() {
      this.noiseBurst({ dur: 0.18, type: "bandpass", freq: 900, q: 0.9, gain: 0.045, to: 2200 });
    }

    catchBall() {
      this.tone({ freq: 150, to: 90, dur: 0.08, type: "sine", gain: 0.07 });
    }

    whistle(long = false) {
      if (!this.ready) return;
      const t = this.ctx.currentTime;
      const dur = long ? 0.75 : 0.42;
      [2350, 2910].forEach((f, i) => {
        const o = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        const lfo = this.ctx.createOscillator();
        const lg = this.ctx.createGain();
        o.type = "triangle";
        o.frequency.value = f;
        lfo.frequency.value = 27 + i * 4;
        lg.gain.value = 35;
        lfo.connect(lg).connect(o.frequency);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.055, t + 0.02);
        g.gain.setValueAtTime(0.055, t + dur * 0.7);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        o.connect(g).connect(this.master);
        o.start(t); lfo.start(t);
        o.stop(t + dur + 0.02); lfo.stop(t + dur + 0.02);
      });
    }

    buzzer() {
      if (!this.ready) return;
      [185, 192, 370].forEach((f, i) => {
        this.tone({ freq: f, dur: 0.88, type: i === 2 ? "sawtooth" : "square", gain: 0.035, attack: 0.01 });
      });
      this.noiseBurst({ dur: 0.4, type: "lowpass", freq: 700, gain: 0.03 });
    }

    cheer(power = 1, dur = 2.2) {
      if (!this.ready || !this.crowdGain) return;
      const t = this.ctx.currentTime;
      this.crowdGain.gain.cancelScheduledValues(t);
      this.crowdGain.gain.setValueAtTime(Math.max(0.032, this.crowdGain.gain.value), t);
      this.crowdGain.gain.linearRampToValueAtTime(0.05 + 0.1 * power, t + 0.22);
      this.crowdGain.gain.exponentialRampToValueAtTime(0.032, t + dur);
      this.crowdFilter.frequency.cancelScheduledValues(t);
      this.crowdFilter.frequency.setValueAtTime(620, t);
      this.crowdFilter.frequency.linearRampToValueAtTime(950, t + 0.25);
      this.crowdFilter.frequency.linearRampToValueAtTime(620, t + dur);
      this.noiseBurst({ dur: 0.7, type: "bandpass", freq: 800, q: 0.7, gain: 0.035 * power });
    }

    ooh(power = 1) {
      if (!this.ready) return;
      const t = this.ctx.currentTime;
      this.crowdGain.gain.cancelScheduledValues(t);
      this.crowdGain.gain.setValueAtTime(this.crowdGain.gain.value, t);
      this.crowdGain.gain.linearRampToValueAtTime(0.075 * power, t + 0.08);
      this.crowdGain.gain.exponentialRampToValueAtTime(0.032, t + 1.2);
      this.noiseBurst({ dur: 0.45, type: "bandpass", freq: 500, q: 1.1, gain: 0.03 * power, to: 900 });
    }

    scoreStinger(three = false) {
      const notes = three ? [523.25, 659.25, 783.99, 1046.5] : [392, 523.25, 659.25];
      notes.forEach((f, i) => this.tone({ freq: f, dur: 0.3, type: "triangle", gain: 0.055, delay: 0.05 + i * 0.075 }));
      this.cheer(three ? 1.2 : 0.9, three ? 2.8 : 2.1);
    }

    steal() {
      this.noiseBurst({ dur: 0.14, type: "highpass", freq: 1500, gain: 0.07, to: 3400 });
      this.tone({ freq: 200, to: 120, dur: 0.1, type: "square", gain: 0.045 });
      this.ooh(0.8);
    }

    block() {
      this.tone({ freq: 90, to: 45, dur: 0.25, type: "sine", gain: 0.16 });
      this.noiseBurst({ dur: 0.16, type: "lowpass", freq: 1100, gain: 0.09 });
      this.cheer(1, 2.0);
    }

    dunk() {
      this.tone({ freq: 105, to: 48, dur: 0.32, type: "sine", gain: 0.2 });
      this.rim(1.4);
      this.cheer(1.4, 3);
    }

    foul() {
      this.whistle(false);
      this.ooh(0.7);
    }

    ui() {
      this.tone({ freq: 760, dur: 0.06, type: "sine", gain: 0.035 });
    }

    countdown(n) {
      this.tone({ freq: n === 0 ? 740 : 440, dur: 0.12, type: "triangle", gain: 0.06 });
    }
  }

  BB.Audio = AudioEngine;
})();
