// Audio engine: Web Audio with HRTF 3D panning and wall occlusion (low-pass + attenuation per wall).
// All sounds are synthesised procedurally (the project had no audio files): footsteps per surface, creaks,
// doors, the doll's porcelain clicks / joints / giggles / whispers / humming, heartbeat, breathing,
// ambient wind & rain, pipes, thunder, and a dynamic music layer that rises during chases.
import * as THREE from 'three';
import { settings } from '../core/settings.js';
import { rand, clamp, pick } from '../core/math.js';

const LULLABY = [0, 3, 7, 3, 5, 2, 0, -2, 0, 3, 7, 10, 8, 7, 5, 3]; // minor, music box

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.ready = false;
    this.loops = new Map();
    this.world = null;
    this.listenerPos = new THREE.Vector3();
    this.muted = false;
    this.subtitle = null;
  }

  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    const c = this.ctx;
    this.master = c.createGain();
    this.comp = c.createDynamicsCompressor();
    this.master.connect(this.comp).connect(c.destination);
    this.sfx = c.createGain(); this.sfx.connect(this.master);
    this.music = c.createGain(); this.music.connect(this.master);
    this.amb = c.createGain(); this.amb.connect(this.master);
    // shared reverb (house acoustics)
    this.reverb = c.createConvolver();
    this.reverb.buffer = this.impulse(2.2, 2.5);
    this.revGain = c.createGain(); this.revGain.gain.value = 0.25;
    this.reverb.connect(this.revGain).connect(this.sfx);
    this.noiseBuf = this.makeNoise(4);
    this.brownBuf = this.makeBrown(6);
    this.applyVolumes();
    this.ready = true;
    this.startAmbience();
  }

  applyVolumes() {
    if (!this.ctx) return;
    this.master.gain.value = settings.master;
    this.music.gain.value = settings.music * 0.7;
    this.sfx.gain.value = settings.sfx;
    this.amb.gain.value = settings.sfx * 0.6;
  }

  makeNoise(sec) {
    const c = this.ctx, b = c.createBuffer(1, c.sampleRate * sec, c.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }

  makeBrown(sec) {
    const c = this.ctx, b = c.createBuffer(1, c.sampleRate * sec, c.sampleRate);
    const d = b.getChannelData(0);
    let last = 0;
    for (let i = 0; i < d.length; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = last * 3.5; }
    return b;
  }

  impulse(sec, decay) {
    const c = this.ctx, len = c.sampleRate * sec, b = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = b.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return b;
  }

  get now() { return this.ctx.currentTime; }

  // ------------------------------------------------------------- routing helpers
  out(pos, gain = 1, opts = {}) {
    // returns an input node; handles panning, occlusion and reverb send
    const c = this.ctx;
    const g = c.createGain();
    g.gain.value = gain;
    if (!pos) {
      g.connect(opts.bus || this.sfx);
      if (opts.reverb) { const s = c.createGain(); s.gain.value = opts.reverb; g.connect(s).connect(this.reverb); }
      return g;
    }
    const p = c.createPanner();
    p.panningModel = 'HRTF';
    p.distanceModel = 'inverse';
    p.refDistance = opts.ref || 1.2;
    p.rolloffFactor = opts.rolloff || 1.3;
    p.maxDistance = 60;
    p.positionX.value = pos.x; p.positionY.value = pos.y; p.positionZ.value = pos.z;
    let n = 0;
    if (this.world) n = this.world.countOccluders(this.listenerPos, pos, 4);
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = Math.max(350, 18000 * Math.pow(0.28, n));
    g.gain.value = gain * Math.pow(0.55, n);
    g.connect(lp).connect(p).connect(opts.bus || this.sfx);
    const send = c.createGain();
    send.gain.value = (opts.reverb ?? 0.3) + n * 0.1;
    p.connect(send).connect(this.reverb);
    return g;
  }

  noiseSrc(buf = this.noiseBuf, loop = false) {
    const s = this.ctx.createBufferSource();
    s.buffer = buf;
    s.loop = loop;
    return s;
  }

  env(gainNode, t0, a, peak, d, sus = 0, r = 0.05) {
    const g = gainNode.gain;
    g.setValueAtTime(0.0001, t0);
    g.linearRampToValueAtTime(peak, t0 + a);
    g.exponentialRampToValueAtTime(Math.max(0.0001, sus || 0.0001), t0 + a + d);
    if (sus) g.exponentialRampToValueAtTime(0.0001, t0 + a + d + r);
  }

  // filtered noise burst
  burst(pos, { gain = 0.5, freq = 1000, q = 1, type = 'bandpass', a = 0.002, d = 0.12, offset = 0, reverb } = {}) {
    if (!this.ready) return;
    const c = this.ctx, t = this.now + offset;
    const s = this.noiseSrc();
    const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = c.createGain();
    this.env(g, t, a, 1, d);
    s.connect(f).connect(g).connect(this.out(pos, gain, { reverb }));
    s.start(t, Math.random() * 3);
    s.stop(t + a + d + 0.1);
  }

  tone(pos, { freq = 440, type = 'sine', gain = 0.3, a = 0.005, d = 0.4, offset = 0, bend = 0, reverb, detune = 0, bus } = {}) {
    if (!this.ready) return;
    const c = this.ctx, t = this.now + offset;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (bend) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * bend), t + a + d);
    o.detune.value = detune;
    const g = c.createGain();
    this.env(g, t, a, 1, d);
    o.connect(g).connect(this.out(pos, gain, { reverb, bus }));
    o.start(t);
    o.stop(t + a + d + 0.1);
  }

  // ------------------------------------------------------------- player sounds
  footstep(surface, loud, left, limp) {
    if (!this.ready) return;
    const base = { wood: 180, tile: 900, concrete: 600, carpet: 140 }[surface] || 200;
    const g = 0.15 + loud * 0.45;
    this.burst(null, { gain: g, freq: base * rand(0.8, 1.2), q: 1.2, d: surface === 'tile' ? 0.05 : 0.09, reverb: 0.25 });
    this.tone(null, { freq: rand(55, 75), gain: g * 0.6, d: 0.08, type: 'sine' });
    if (left && limp > 0.3) {
      // injured leg drags
      this.burst(null, { gain: 0.08 * limp, freq: 2500, q: 0.6, a: 0.05, d: 0.25, offset: 0.05 });
    }
  }

  creak(pos, k = 0.6) {
    if (!this.ready) return;
    const c = this.ctx, t = this.now;
    const o = c.createOscillator(); o.type = 'sawtooth';
    const f0 = rand(90, 160);
    o.frequency.setValueAtTime(f0, t);
    o.frequency.linearRampToValueAtTime(f0 * rand(0.6, 1.5), t + 0.4);
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = rand(600, 1200); bp.Q.value = 8;
    const am = c.createGain(); // stick-slip modulation
    const lfo = c.createOscillator(); lfo.frequency.value = rand(18, 40);
    const lg = c.createGain(); lg.gain.value = 0.5;
    lfo.connect(lg).connect(am.gain);
    am.gain.value = 0.5;
    const g = c.createGain(); this.env(g, t, 0.05, 1, 0.45);
    o.connect(bp).connect(am).connect(g).connect(this.out(pos, 0.35 * k));
    o.start(t); lfo.start(t); o.stop(t + 0.6); lfo.stop(t + 0.6);
  }

  click() { this.burst(null, { gain: 0.25, freq: 3000, q: 4, d: 0.02 }); this.burst(null, { gain: 0.15, freq: 1500, q: 3, d: 0.02, offset: 0.06 }); }
  pickup() { this.burst(null, { gain: 0.2, freq: 1800, q: 2, d: 0.05 }); this.tone(null, { freq: 660, gain: 0.04, d: 0.25, type: 'triangle' }); }
  paper() { for (let i = 0; i < 3; i++) this.burst(null, { gain: 0.12, freq: 4000, q: 0.5, a: 0.02, d: 0.12, offset: i * 0.08 }); }
  gasp() { this.burst(null, { gain: 0.6, freq: 900, q: 1.5, a: 0.03, d: 0.45 }); this.burst(null, { gain: 0.3, freq: 1600, q: 2, a: 0.05, d: 0.3, offset: 0.5 }); }
  exhale() { this.burst(null, { gain: 0.12, freq: 700, q: 0.8, a: 0.15, d: 0.6 }); }
  pant() { for (let i = 0; i < 4; i++) this.burst(null, { gain: 0.2, freq: 800, q: 1, a: 0.05, d: 0.2, offset: i * 0.35 }); }
  breathRun() { if (Math.random() < 0.5) this.burst(null, { gain: 0.08, freq: 900, q: 1, a: 0.04, d: 0.18 }); }
  hurt() { this.tone(null, { freq: 220, type: 'sawtooth', gain: 0.25, d: 0.4, bend: 0.6 }); this.burst(null, { gain: 0.7, freq: 300, q: 0.7, d: 0.25 }); }
  bandage() { for (let i = 0; i < 6; i++) this.burst(null, { gain: 0.1, freq: 2500, q: 0.8, a: 0.1, d: 0.25, offset: i * 0.4 }); }
  pills() { for (let i = 0; i < 5; i++) this.burst(null, { gain: 0.15, freq: 3500, q: 6, d: 0.03, offset: i * 0.05 + Math.random() * 0.03 }); }

  // ------------------------------------------------------------- house sounds
  door(pos, open, slam = false) {
    if (!this.ready) return;
    if (slam) {
      this.burst(pos, { gain: 1.2, freq: 160, q: 0.7, d: 0.4, reverb: 0.7 });
      this.tone(pos, { freq: 60, gain: 0.8, d: 0.4 });
      return;
    }
    // hinge creak
    const c = this.ctx, t = this.now;
    const o = c.createOscillator(); o.type = 'sawtooth';
    const f0 = rand(300, 500);
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f0 * (open ? rand(1.3, 2.2) : rand(0.5, 0.8)), t + 0.7);
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1400; bp.Q.value = 12;
    const g = c.createGain(); this.env(g, t, 0.08, 1, 0.75);
    o.connect(bp).connect(g).connect(this.out(pos, 0.25));
    o.start(t); o.stop(t + 1);
    if (!open) this.burst(pos, { gain: 0.6, freq: 250, q: 1, d: 0.15, offset: 0.65 });
    else this.burst(pos, { gain: 0.25, freq: 1800, q: 3, d: 0.05 }); // latch
  }
  doorLocked(pos) { for (let i = 0; i < 3; i++) this.burst(pos, { gain: 0.4, freq: 900, q: 3, d: 0.05, offset: i * 0.12 }); }
  unlock(pos) { this.burst(pos, { gain: 0.4, freq: 2200, q: 4, d: 0.04 }); this.burst(pos, { gain: 0.5, freq: 900, q: 2, d: 0.08, offset: 0.25 }); }
  doorBang(pos) { this.burst(pos, { gain: 1.2, freq: 140, q: 0.9, d: 0.25, reverb: 0.6 }); this.tone(pos, { freq: 70, gain: 0.7, d: 0.2 }); }
  doorBreak(pos) { this.burst(pos, { gain: 1.5, freq: 400, q: 0.5, d: 0.8, reverb: 0.8 }); for (let i = 0; i < 6; i++) this.burst(pos, { gain: 0.5, freq: rand(1500, 4000), q: 2, d: 0.08, offset: 0.05 + i * 0.07 }); }
  boards(pos) { for (let i = 0; i < 4; i++) { this.creak(pos, 1); this.burst(pos, { gain: 0.9, freq: rand(300, 900), q: 1, d: 0.2, offset: i * 0.35 }); } }
  cabinet(pos, open) { this.creak(pos, 0.5); this.burst(pos, { gain: 0.35, freq: open ? 700 : 300, q: 1.5, d: 0.1, offset: open ? 0 : 0.2 }); }
  drawer(pos, open) { this.burst(pos, { gain: 0.3, freq: 450, q: 0.8, a: 0.05, d: 0.3 }); if (!open) this.burst(pos, { gain: 0.4, freq: 250, q: 1, d: 0.06, offset: 0.3 }); }
  switchClick(pos) { this.burst(pos, { gain: 0.35, freq: 2500, q: 5, d: 0.02 }); }
  glass(pos) { for (let i = 0; i < 9; i++) this.tone(pos, { freq: rand(2500, 7000), type: 'triangle', gain: 0.12, d: rand(0.05, 0.3), offset: Math.random() * 0.08 }); this.burst(pos, { gain: 0.8, freq: 4000, q: 0.7, d: 0.25, reverb: 0.6 }); }
  thud(pos, k = 0.5) { this.burst(pos, { gain: k, freq: 200, q: 1, d: 0.15 }); this.tone(pos, { freq: 80, gain: k * 0.5, d: 0.12 }); }
  canRoll(pos) { for (let i = 0; i < 5; i++) this.tone(pos, { freq: rand(900, 1600), type: 'triangle', gain: 0.08, d: 0.05, offset: i * 0.09 }); }
  toySqueak(pos) { this.tone(pos, { freq: 1100, type: 'square', gain: 0.12, d: 0.25, bend: 0.6, reverb: 0.5 }); }
  powerOn() { this.tone(null, { freq: 50, type: 'sawtooth', gain: 0.4, a: 0.5, d: 3, bend: 1.2 }); this.burst(null, { gain: 1.2, freq: 120, q: 0.6, d: 0.6, reverb: 1 }); }
  fuse(pos) { this.burst(pos, { gain: 0.6, freq: 3000, q: 2, d: 0.08 }); this.burst(pos, { gain: 0.6, freq: 1000, q: 2, d: 0.1, offset: 0.2 }); }
  sting() { // jumpscare stinger
    if (!this.ready) return;
    for (const f of [110, 116.5, 164.8, 233]) this.tone(null, { freq: f, type: 'sawtooth', gain: 0.22, a: 0.01, d: 1.6, bend: 0.9, bus: this.music, detune: rand(-30, 30) });
    this.burst(null, { gain: 1.1, freq: 2000, q: 0.4, a: 0.005, d: 1.0, reverb: 0.8 });
  }
  thunder() {
    if (!this.ready) return;
    const c = this.ctx, t = this.now;
    const s = this.noiseSrc(this.brownBuf);
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 300;
    const g = c.createGain(); this.env(g, t, 0.3, 1, 4.5);
    s.connect(lp).connect(g).connect(this.out(null, 0.9, { bus: this.amb }));
    s.start(t); s.stop(t + 5);
  }
  pipes(pos) { for (let i = 0; i < rand(3, 7); i++) this.tone(pos, { freq: rand(140, 220), type: 'triangle', gain: 0.15, d: 0.2, offset: i * rand(0.2, 0.5), reverb: 0.8 }); }
  knock(pos) { for (let i = 0; i < 3; i++) this.burst(pos, { gain: 0.9, freq: 220, q: 1, d: 0.12, offset: i * 0.55, reverb: 0.7 }); }
  footstepsAbove(pos) { for (let i = 0; i < 8; i++) { this.burst(pos.clone().add(new THREE.Vector3(i * 0.5, 0, 0)), { gain: 0.6, freq: 160, q: 1, d: 0.1, offset: i * 0.45 }); } }

  // ------------------------------------------------------------- the doll
  dollStep(pos, k, surface) {
    // hard porcelain/wood heels: a dry tick + soft fabric swish
    const f = surface === 'tile' ? 3200 : surface === 'concrete' ? 2400 : 1800;
    this.burst(pos, { gain: 0.3 * k + 0.05, freq: f * rand(0.85, 1.15), q: 6, d: 0.025 });
    this.burst(pos, { gain: 0.06 * k, freq: 5000, q: 0.5, a: 0.03, d: 0.12 });
  }
  dollJoint(pos, k = 0.6) {
    // ratcheting ball joints
    const n = Math.floor(rand(3, 8));
    for (let i = 0; i < n; i++) this.burst(pos, { gain: 0.18 * k, freq: rand(1200, 2600), q: 9, d: 0.012, offset: i * rand(0.02, 0.05) });
    if (Math.random() < 0.4) this.tone(pos, { freq: rand(400, 700), type: 'sawtooth', gain: 0.03 * k, d: 0.3, bend: 0.7 });
  }
  giggle(pos) {
    if (!this.ready) return;
    // child-like giggle: short voiced pulses through vowel formants, pitch falling
    const c = this.ctx;
    const n = Math.floor(rand(4, 7));
    for (let i = 0; i < n; i++) {
      const t = this.now + i * rand(0.11, 0.16);
      const o = c.createOscillator(); o.type = 'sawtooth';
      const f = rand(420, 520) * (1 - i * 0.04);
      o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f * 0.85, t + 0.1);
      const f1 = c.createBiquadFilter(); f1.type = 'bandpass'; f1.frequency.value = 900; f1.Q.value = 6;
      const f2 = c.createBiquadFilter(); f2.type = 'bandpass'; f2.frequency.value = 2600; f2.Q.value = 8;
      const g = c.createGain(); this.env(g, t, 0.01, 1, 0.1);
      const mix = this.out(pos, 0.5, { reverb: 0.6 });
      o.connect(f1).connect(g); o.connect(f2).connect(g); g.connect(mix);
      o.start(t); o.stop(t + 0.15);
    }
    this.showSub('[Un rire d\'enfant]', 2);
  }
  dollWhisper(pos) {
    if (!this.ready) return;
    const c = this.ctx, t = this.now;
    const s = this.noiseSrc();
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 5;
    bp.frequency.setValueAtTime(1200, t);
    for (let i = 0; i < 10; i++) bp.frequency.linearRampToValueAtTime(rand(700, 2800), t + i * 0.15);
    const g = c.createGain(); g.gain.setValueAtTime(0, t);
    for (let i = 0; i < 10; i++) g.gain.linearRampToValueAtTime(Math.random() < 0.3 ? 0.05 : rand(0.4, 1), t + i * 0.15);
    g.gain.linearRampToValueAtTime(0, t + 1.6);
    s.connect(bp).connect(g).connect(this.out(pos, 0.45, { reverb: 0.5 }));
    s.start(t, Math.random()); s.stop(t + 1.7);
    this.showSub(pick(['[Chuchotement] « …où es-tu… »', '[Chuchotement] « …un cœur… »', '[Chuchotement] « …je t\'entends… »', '[Chuchotement] « …joue avec moi… »']), 2.5);
  }
  dollHum(pos) {
    if (!this.ready) return;
    const c = this.ctx;
    for (let i = 0; i < 7; i++) {
      const t = this.now + i * 0.42;
      const o = c.createOscillator(); o.type = 'triangle';
      o.frequency.value = 330 * Math.pow(2, LULLABY[i] / 12) * rand(0.98, 1.0);
      const vib = c.createOscillator(); vib.frequency.value = 5.5;
      const vg = c.createGain(); vg.gain.value = 6;
      vib.connect(vg).connect(o.frequency);
      const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1400;
      const g = c.createGain(); this.env(g, t, 0.08, 1, 0.38);
      o.connect(f).connect(g).connect(this.out(pos, 0.12, { reverb: 0.7 }));
      o.start(t); vib.start(t); o.stop(t + 0.5); vib.stop(t + 0.5);
    }
    this.showSub('[Quelqu\'un fredonne une berceuse]', 3);
  }
  dollShriek(pos) {
    this.tone(pos, { freq: 1300, type: 'sawtooth', gain: 0.35, a: 0.01, d: 0.6, bend: 0.5, reverb: 0.7 });
    this.tone(pos, { freq: 1370, type: 'square', gain: 0.15, a: 0.01, d: 0.5, bend: 0.55 });
    this.showSub('[Un cri strident]', 1.5);
  }
  musicBox(pos, dur = 8) {
    if (!this.ready) return;
    for (let i = 0; i < dur / 0.33; i++) {
      const n = LULLABY[i % LULLABY.length];
      const f = 880 * Math.pow(2, n / 12) * (1 - i * 0.002);
      this.tone(pos, { freq: f, type: 'sine', gain: 0.22, a: 0.002, d: 0.6, offset: i * 0.33 * (1 + i * 0.004), reverb: 0.6 });
      this.tone(pos, { freq: f * 2.01, type: 'sine', gain: 0.05, a: 0.002, d: 0.3, offset: i * 0.33 * (1 + i * 0.004) });
    }
  }
  radioVoice(pos) {
    if (!this.ready) return;
    const c = this.ctx, t = this.now;
    // static
    const s = this.noiseSrc();
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2000; bp.Q.value = 0.8;
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.5, t + 0.1); g.gain.linearRampToValueAtTime(0.2, t + 5); g.gain.linearRampToValueAtTime(0.0001, t + 6);
    s.connect(bp).connect(g).connect(this.out(pos, 0.5));
    s.start(t); s.stop(t + 6);
    // distorted, ring-modulated voice-like formants
    for (let i = 0; i < 14; i++) {
      const tt = t + 0.6 + i * 0.28;
      const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = rand(95, 130);
      const rm = c.createGain(); const mod = c.createOscillator(); mod.frequency.value = 30; mod.connect(rm.gain);
      const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = rand(500, 1800); f.Q.value = 5;
      const gg = c.createGain(); this.env(gg, tt, 0.02, 1, 0.22);
      o.connect(rm).connect(f).connect(gg).connect(this.out(pos, 0.5));
      o.start(tt); mod.start(tt); o.stop(tt + 0.3); mod.stop(tt + 0.3);
    }
    this.showSub('[Radio, voix déformée] « …ne… reste pas… elle… compte jusqu\'à dix… »', 5);
  }
  tvStatic(pos, dur = 6) {
    if (!this.ready) return;
    const c = this.ctx, t = this.now;
    const s = this.noiseSrc(this.noiseBuf, true);
    const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 900;
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.4, t + 0.05); g.gain.setValueAtTime(0.4, t + dur - 0.3); g.gain.linearRampToValueAtTime(0.0001, t + dur);
    s.connect(hp).connect(g).connect(this.out(pos, 0.6));
    s.start(t); s.stop(t + dur);
  }
  washer(pos, dur = 10) {
    if (!this.ready) return;
    const c = this.ctx, t = this.now;
    const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(30, t); o.frequency.linearRampToValueAtTime(70, t + 3);
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 300;
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.6, t + 2); g.gain.setValueAtTime(0.6, t + dur - 1); g.gain.linearRampToValueAtTime(0.0001, t + dur);
    o.connect(lp).connect(g).connect(this.out(pos, 0.6));
    o.start(t); o.stop(t + dur);
    for (let i = 0; i < dur * 2; i++) this.thud(pos, 0.2);
  }
  tapeRecorder(pos) {
    this.burst(pos, { gain: 0.4, freq: 2000, q: 3, d: 0.05 });
    this.radioVoice(pos);
  }

  // ------------------------------------------------------------- loops
  loop(id, make) {
    if (!this.ready || this.loops.has(id)) return this.loops.get(id);
    const l = make();
    this.loops.set(id, l);
    return l;
  }
  stopLoop(id, fade = 0.5) {
    const l = this.loops.get(id);
    if (!l) return;
    const t = this.now;
    l.gain.gain.cancelScheduledValues(t);
    l.gain.gain.setValueAtTime(l.gain.gain.value, t);
    l.gain.gain.linearRampToValueAtTime(0.0001, t + fade);
    for (const s of l.sources) try { s.stop(t + fade + 0.05); } catch { /* */ }
    this.loops.delete(id);
  }

  startAmbience() {
    const c = this.ctx;
    // wind + rain outside
    this.loop('wind', () => {
      const s = this.noiseSrc(this.brownBuf, true);
      const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 500;
      const lfo = c.createOscillator(); lfo.frequency.value = 0.07;
      const lg = c.createGain(); lg.gain.value = 250;
      lfo.connect(lg).connect(lp.frequency);
      const g = c.createGain(); g.gain.value = 0.35;
      s.connect(lp).connect(g).connect(this.amb);
      s.start(); lfo.start();
      return { gain: g, sources: [s, lfo] };
    });
    this.loop('rain', () => {
      const s = this.noiseSrc(this.noiseBuf, true);
      const bp = c.createBiquadFilter(); bp.type = 'highpass'; bp.frequency.value = 2500;
      const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 6000;
      const g = c.createGain(); g.gain.value = 0.05;
      s.connect(bp).connect(lp).connect(g).connect(this.amb);
      s.start();
      return { gain: g, sources: [s] };
    });
    // low house drone (music bus)
    this.loop('drone', () => {
      const o1 = c.createOscillator(); o1.type = 'sine'; o1.frequency.value = 43.65;
      const o2 = c.createOscillator(); o2.type = 'sine'; o2.frequency.value = 46.25; // beating minor second
      const o3 = c.createOscillator(); o3.type = 'triangle'; o3.frequency.value = 87.3;
      const g = c.createGain(); g.gain.value = 0.12;
      const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 220;
      o1.connect(g); o2.connect(g); o3.connect(lp).connect(g);
      g.connect(this.music);
      o1.start(); o2.start(); o3.start();
      return { gain: g, sources: [o1, o2, o3] };
    });
    // chase layer (silent until a chase)
    this.loop('chase', () => {
      const g = c.createGain(); g.gain.value = 0.0001;
      const srcs = [];
      for (const [f, type] of [[110, 'sawtooth'], [116.54, 'sawtooth'], [155.56, 'sawtooth'], [55, 'square']]) {
        const o = c.createOscillator(); o.type = type; o.frequency.value = f;
        const lfo = c.createOscillator(); lfo.frequency.value = rand(4, 7);
        const lg = c.createGain(); lg.gain.value = f * 0.01;
        lfo.connect(lg).connect(o.frequency);
        const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900;
        const og = c.createGain(); og.gain.value = 0.12;
        o.connect(lp).connect(og).connect(g);
        o.start(); lfo.start();
        srcs.push(o, lfo);
      }
      g.connect(this.music);
      return { gain: g, sources: srcs };
    });
    // heartbeat (2D), rate & level driven by fear
    this.heart = { t: 0 };
  }

  // per frame: listener + dynamic layers
  update(dt, camera, state) {
    if (!this.ready) return;
    const c = this.ctx, L = c.listener;
    const p = camera.position;
    this.listenerPos.copy(p);
    const f = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    const u = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
    if (L.positionX) {
      L.positionX.value = p.x; L.positionY.value = p.y; L.positionZ.value = p.z;
      L.forwardX.value = f.x; L.forwardY.value = f.y; L.forwardZ.value = f.z;
      L.upX.value = u.x; L.upY.value = u.y; L.upZ.value = u.z;
    } else {
      L.setPosition(p.x, p.y, p.z);
      L.setOrientation(f.x, f.y, f.z, u.x, u.y, u.z);
    }
    const t = this.now;
    const chase = this.loops.get('chase');
    if (chase) chase.gain.gain.setTargetAtTime(Math.max(0.0001, state.chase * 0.55), t, state.chase > 0 ? 0.3 : 2.5);
    const drone = this.loops.get('drone');
    if (drone) drone.gain.gain.setTargetAtTime(0.06 + state.tension * 0.14, t, 1.5);
    const rain = this.loops.get('rain');
    if (rain) rain.gain.gain.setTargetAtTime(state.indoorDepth > 0 ? 0.02 : 0.06, t, 1);
    // heartbeat
    const fear = state.fear;
    if (fear > 0.3) {
      this.heart.t -= dt;
      if (this.heart.t <= 0) {
        const bpm = 60 + fear * 90;
        this.heart.t = 60 / bpm;
        const k = (fear - 0.3) * 0.9;
        this.tone(null, { freq: 55, type: 'sine', gain: 0.5 * k, a: 0.005, d: 0.12 });
        this.tone(null, { freq: 48, type: 'sine', gain: 0.35 * k, a: 0.005, d: 0.14, offset: 0.16 });
      }
    }
  }

  showSub(text, dur) {
    if (this.onSubtitle) this.onSubtitle(text, dur);
  }
}
