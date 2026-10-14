// Procedural animation for the doll skeleton.
// Locomotion is driven by travelled distance (stride matched -> no foot sliding). Actions blend on top.
// "Stop-motion" stutter makes some movements jerky like an old puppet; the head can turn beyond human limits.
import * as THREE from 'three';
import { clamp, lerp, damp, angleDiff } from '../core/math.js';

const E = new THREE.Euler();
const Q = new THREE.Quaternion();

// stride: distance covered by one full gait cycle (two steps), matched to leg length * amplitude
const GAITS = {
  walk: { amp: 0.42, knee: 0.75, cycle: 0.74, bob: 0.018, arm: 0.18, lean: 0.06 },
  sneak: { amp: 0.32, knee: 0.9, cycle: 0.55, bob: 0.01, arm: 0.05, lean: 0.22 },
  run: { amp: 0.72, knee: 1.35, cycle: 1.15, bob: 0.04, arm: 0.6, lean: 0.38 },
};

function add(p, k, x = 0, y = 0, z = 0, w = 1) {
  const v = p[k] || (p[k] = [0, 0, 0]);
  v[0] += x * w; v[1] += y * w; v[2] += z * w;
}

export class DollAnimator {
  constructor(model) {
    this.m = model;
    this.phase = 0;
    this.t = 0;
    this.loco = 'idle';
    this.locoW = { idle: 1, walk: 0, sneak: 0, run: 0 };
    this.actions = {}; // name -> weight
    this.actionTarget = {};
    this.stutterTimer = 0;
    this.applied = {};
    this.twitch = null;
    this.twitchTimer = 2;
    this.headYaw = 0; this.headPitch = 0; this.headRoll = 0;
    this.eyeAware = 0;
    this.jaw = 0;
    this.hipsDrop = 0;
    this.headTiltNoise = 0;
    this.state = {
      loco: 'idle', speed: 0, moved: 0, action: null, lookAt: null, lookMode: 'normal', eye: 'empty', jaw: 0, stutter: 0.6,
      glow: 0.5, tilt: 0,
    };
  }

  setAction(name) {
    this.state.action = name;
  }

  update(dt, rootYaw) {
    const s = this.state;
    this.t += dt;
    const g = GAITS[s.loco] || GAITS.walk;
    if (s.loco !== 'idle') this.phase += (s.moved / g.cycle) * Math.PI * 2;
    // blend locomotion weights
    for (const k of Object.keys(this.locoW)) this.locoW[k] = damp(this.locoW[k], k === s.loco ? 1 : 0, 8, dt);
    // blend action weights (one active at a time)
    for (const k of new Set([...Object.keys(this.actions), s.action].filter(Boolean))) {
      this.actions[k] = damp(this.actions[k] || 0, k === s.action ? 1 : 0, k === 'attack' ? 14 : 6, dt);
      if (this.actions[k] < 0.001 && k !== s.action) delete this.actions[k];
    }
    // random twitches (a joint jerks for a split second)
    this.twitchTimer -= dt;
    if (this.twitchTimer <= 0) {
      this.twitchTimer = 1.5 + Math.random() * 4;
      const bonesT = ['head', 'neck', 'fingerR1a', 'fingerL2a', 'foreArmL', 'shoulderR', 'head'];
      this.twitch = { bone: bonesT[Math.floor(Math.random() * bonesT.length)], t: 0.12, v: [(Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 0.5] };
    }

    const pose = {};
    this.buildLocomotion(pose);
    this.buildActions(pose);
    if (this.twitch) {
      add(pose, this.twitch.bone, ...this.twitch.v);
      this.twitch.t -= dt;
      if (this.twitch.t <= 0) this.twitch = null;
    }
    this.buildLook(pose, dt, rootYaw);

    // stop-motion stutter: apply the pose only at a low frame rate when stutter is high
    const fps = s.stutter > 0 ? lerp(60, 7, s.stutter) : 60;
    this.stutterTimer -= dt;
    const snap = this.stutterTimer <= 0;
    if (snap) this.stutterTimer = 1 / fps;
    const b = this.m.bones;
    if (snap) {
      for (const [k, bone] of Object.entries(b)) {
        if (k === 'jaw') continue;
        const v = pose[k] || [0, 0, 0];
        E.set(v[0], v[1], v[2], 'YXZ');
        Q.setFromEuler(E);
        bone.quaternion.copy(Q);
      }
      b.hips.position.y = 0.5 + (pose._hipsY || 0);
      b.hips.position.z = pose._hipsZ || 0;
    }
    // face (always smooth)
    this.jaw = damp(this.jaw, s.jaw, 10, dt);
    if (this.m.mouth) this.m.mouth.scale.y = 0.12 + this.jaw * 1.1;
    this.eyeAware = damp(this.eyeAware, s.eye === 'aware' ? 1 : 0, s.eye === 'aware' ? 12 : 1.5, dt);
    for (const e of this.m.eyes) {
      e.lid.rotation.x = lerp(0.15, -0.95, this.eyeAware); // droopy (empty) -> wide open (aware)
      const ps = lerp(0.6, 1.9, this.eyeAware) * (1 + Math.sin(this.t * 1.7 + e.side) * 0.05);
      e.pupil.scale.setScalar(ps);
    }
    const mats = this.m.materials;
    mats.headMat.emissiveIntensity = damp(mats.headMat.emissiveIntensity, s.glow * (0.8 + Math.sin(this.t * 2.3) * 0.2), 4, dt);
    mats.innerMat.emissiveIntensity = mats.headMat.emissiveIntensity * 0.4;
  }

  buildLocomotion(p) {
    const w = this.locoW;
    const ph = this.phase;
    // idle
    if (w.idle > 0.01) {
      const k = w.idle;
      add(p, 'spine', Math.sin(this.t * 0.7) * 0.01, 0, Math.sin(this.t * 0.5) * 0.02, k);
      add(p, 'upperArmL', 0, 0, -0.08, k);
      add(p, 'upperArmR', 0, 0, 0.06, k);
      add(p, 'foreArmR', -0.15, 0, 0, k);
      for (const L of ['L', 'R']) for (let f = 0; f < 4; f++) { add(p, `finger${L}${f}a`, -0.3 - f * 0.05, 0, 0, k); add(p, `finger${L}${f}b`, -0.4, 0, 0, k); }
    }
    for (const mode of ['walk', 'sneak', 'run']) {
      const k = w[mode];
      if (k < 0.01) continue;
      const g = GAITS[mode];
      for (const [L, off] of [['L', 0], ['R', Math.PI]]) {
        const a = ph + off;
        const swing = Math.sin(a);
        add(p, 'thigh' + L, -swing * g.amp - (mode === 'sneak' ? 0.25 : 0), 0, 0, k);
        add(p, 'shin' + L, Math.max(0, Math.cos(a)) * g.knee + (mode === 'sneak' ? 0.35 : 0.05), 0, 0, k);
        add(p, 'foot' + L, -Math.max(0, Math.cos(a)) * g.knee * 0.4 + swing * 0.2, 0, 0, k);
        // arms swing opposite to legs (limp for walk, flailing for run)
        const arm = mode === 'run' ? -0.5 : 0;
        add(p, 'upperArm' + L, arm + swing * g.arm, 0, (L === 'L' ? -1 : 1) * (mode === 'run' ? 0.35 : 0.06), k);
        add(p, 'foreArm' + L, mode === 'run' ? -0.9 : -0.1, 0, 0, k);
        for (let f = 0; f < 4; f++) add(p, `finger${L}${f}a`, mode === 'run' ? 0.1 : -0.2, (f - 1.5) * 0.08 * (mode === 'run' ? 1 : 0), 0, k);
      }
      add(p, 'spine', g.lean, Math.sin(ph) * 0.06, 0, k);
      add(p, 'chest', g.lean * 0.4, -Math.sin(ph) * 0.08, 0, k);
      p._hipsY = (p._hipsY || 0) + (-Math.abs(Math.cos(ph)) * g.bob - (mode === 'sneak' ? 0.07 : mode === 'run' ? 0.03 : 0)) * k;
      add(p, 'hips', 0, Math.sin(ph) * 0.08, Math.sin(ph) * 0.04, k);
      // head stays stabilised, slightly tilted (creepy)
      add(p, 'head', -g.lean * 0.6, 0, 0.22 * (mode === 'run' ? 0.3 : 1), k);
    }
  }

  buildActions(p) {
    const t = this.t;
    for (const [name, k] of Object.entries(this.actions)) {
      if (k < 0.01) continue;
      switch (name) {
        case 'sit':
          add(p, 'thighL', -1.5, 0.12, 0, k); add(p, 'thighR', -1.5, -0.1, 0, k);
          add(p, 'shinL', 1.45, 0, 0, k); add(p, 'shinR', 1.5, 0, 0, k);
          add(p, 'spine', 0.18, 0, 0.05, k);
          add(p, 'head', 0.55, 0.2, 0.35, k);
          add(p, 'upperArmL', -0.35, 0, -0.1, k); add(p, 'upperArmR', -0.4, 0, 0.12, k);
          add(p, 'foreArmL', -0.9, 0, 0, k); add(p, 'foreArmR', -0.8, 0, 0, k);
          p._hipsY = (p._hipsY || 0) - 0.03 * k;
          break;
        case 'search': {
          // crouched, sweeping head in jerky steps
          add(p, 'thighL', -0.9, 0, 0, k); add(p, 'thighR', -0.9, 0, 0, k);
          add(p, 'shinL', 1.5, 0, 0, k); add(p, 'shinR', 1.5, 0, 0, k);
          add(p, 'footL', -0.6, 0, 0, k); add(p, 'footR', -0.6, 0, 0, k);
          add(p, 'spine', 0.45, 0, 0, k);
          add(p, 'head', -0.3, Math.round(Math.sin(t * 0.9) * 3) * 0.35, 0.3, k);
          add(p, 'upperArmL', -0.6, 0, -0.2, k); add(p, 'upperArmR', -0.7, 0, 0.2, k);
          p._hipsY = (p._hipsY || 0) - 0.16 * k;
          break;
        }
        case 'lookUnder':
          add(p, 'thighL', -1.6, 0, 0, k); add(p, 'thighR', -1.6, 0, 0, k);
          add(p, 'shinL', 2.3, 0, 0, k); add(p, 'shinR', 2.3, 0, 0, k);
          add(p, 'spine', 1.0, 0, 0, k); add(p, 'chest', 0.4, 0, 0, k);
          add(p, 'neck', -0.3, 0, 0.6, k); add(p, 'head', -0.4, 0, 1.2, k);
          add(p, 'upperArmL', -1.3, 0, -0.2, k); add(p, 'upperArmR', -1.3, 0, 0.2, k);
          p._hipsY = (p._hipsY || 0) - 0.3 * k;
          break;
        case 'reach':
          add(p, 'upperArmR', -1.45, 0, 0.1, k); add(p, 'foreArmR', -0.1, 0, 0, k);
          for (let f = 0; f < 4; f++) { add(p, `fingerR${f}a`, -0.6, 0, 0, k); add(p, `fingerR${f}b`, -0.8, 0, 0, k); }
          add(p, 'spine', 0.1, -0.15, 0, k);
          break;
        case 'bang':
          // pounding on a locked door
          add(p, 'upperArmR', -2.2 + Math.max(0, Math.sin(t * 9)) * 0.9, 0, 0.2, k);
          add(p, 'upperArmL', -2.2 + Math.max(0, Math.sin(t * 9 + Math.PI)) * 0.9, 0, -0.2, k);
          add(p, 'foreArmL', -0.5, 0, 0, k); add(p, 'foreArmR', -0.5, 0, 0, k);
          add(p, 'head', 0.3, 0, Math.sin(t * 4.5) * 0.3, k);
          break;
        case 'attack':
          add(p, 'upperArmL', -2.7, 0, -0.35, k); add(p, 'upperArmR', -2.7, 0, 0.35, k);
          add(p, 'foreArmL', -0.4, 0, 0, k); add(p, 'foreArmR', -0.4, 0, 0, k);
          for (const L of ['L', 'R']) for (let f = 0; f < 4; f++) { add(p, `finger${L}${f}a`, 0.25, (f - 1.5) * 0.25, 0, k); add(p, `finger${L}${f}b`, -0.9, 0, 0, k); }
          add(p, 'spine', 0.35, 0, 0, k); add(p, 'chest', 0.25, 0, 0, k);
          add(p, 'head', -0.5, 0, 0.15, k);
          p._hipsZ = (p._hipsZ || 0) + 0.12 * k;
          break;
        case 'scare':
          // jumpscare: lunging into the camera, hands reaching for the face, head cocked
          add(p, 'upperArmL', -1.6, 0.2, -0.25, k); add(p, 'upperArmR', -1.55, -0.2, 0.25, k);
          add(p, 'foreArmL', -0.25, 0, 0, k); add(p, 'foreArmR', -0.3, 0, 0, k);
          for (const L of ['L', 'R']) for (let f = 0; f < 4; f++) { add(p, `finger${L}${f}a`, 0.2, (f - 1.5) * 0.3, 0, k); add(p, `finger${L}${f}b`, -0.7, 0, 0, k); }
          add(p, 'spine', 0.2, 0, 0, k);
          add(p, 'head', 0.1, 0, 0.45 + Math.sin(t * 30) * 0.05, k);
          break;
        case 'flinch':
          add(p, 'upperArmR', -2.1, 0.3, -0.5, k); add(p, 'foreArmR', -1.7, 0, 0, k);
          add(p, 'upperArmL', -0.3, 0, -0.5, k);
          add(p, 'head', 0.3, 0.9, 0.2, k);
          add(p, 'spine', -0.25, 0.4, 0, k);
          p._hipsZ = (p._hipsZ || 0) - 0.05 * k;
          break;
        case 'listen':
          add(p, 'head', 0, 0, 0.75, k);
          add(p, 'upperArmR', -0.25, 0, 0.3, k);
          for (let f = 0; f < 4; f++) add(p, `fingerR${f}a`, Math.sin(t * 12 + f) * 0.2, 0, 0, k);
          break;
        case 'stare':
          add(p, 'head', 0, 0, 0.35 + Math.sin(t * 0.3) * 0.1, k);
          break;
        case 'rise':
          add(p, 'spine', 0.9 - Math.min(1, (t % 2)) * 0.9, 0, 0, k);
          break;
        default:
          break;
      }
    }
  }

  buildLook(p, dt, rootYaw) {
    const s = this.state;
    let yaw = 0, pitch = 0;
    if (s.lookAt && s.lookMode !== 'none') {
      const head = this.m.bones.head;
      const hp = head.getWorldPosition(new THREE.Vector3());
      const d = s.lookAt.clone().sub(hp);
      const worldYaw = Math.atan2(d.x, d.z);
      yaw = angleDiff(rootYaw, worldYaw);
      pitch = -Math.atan2(d.y, Math.hypot(d.x, d.z));
      const lim = s.lookMode === 'creepy' ? 2.9 : 1.2;
      yaw = clamp(yaw, -lim, lim);
      pitch = clamp(pitch, -0.9, 0.9);
    }
    // head turns fast in creepy mode (snaps), smooth otherwise
    const speed = s.lookMode === 'creepy' ? 5 : 6;
    this.headYaw = damp(this.headYaw, yaw, speed, dt);
    this.headPitch = damp(this.headPitch, pitch, speed, dt);
    this.headRoll = damp(this.headRoll, s.tilt, 3, dt);
    add(p, 'neck', this.headPitch * 0.3, this.headYaw * 0.35, 0);
    add(p, 'head', this.headPitch * 0.7, this.headYaw * 0.65, this.headRoll);
    // eyes fixate the target
    if (s.lookAt) {
      for (const e of this.m.eyes) {
        const ep = e.group.getWorldPosition(new THREE.Vector3());
        const local = e.group.parent.worldToLocal(s.lookAt.clone());
        const rel = local.sub(e.group.position);
        const ey = clamp(Math.atan2(rel.x, rel.z), -0.5, 0.5);
        const ex = clamp(-Math.atan2(rel.y, Math.hypot(rel.x, rel.z)), -0.4, 0.4);
        const k = 0.3 + this.eyeAware * 0.7; // empty eyes drift instead of fixating
        e.group.rotation.y = lerp(e.side * 0.12 + Math.sin(this.t * 0.4) * 0.1, ey, k);
        e.group.rotation.x = lerp(-0.15, ex, k);
        void ep;
      }
    }
  }
}
