// First person survivor: movement & collisions, stairs, crouch, lean, sprint/stamina, wounds (limp, bleeding,
// trembling hands), fear, breathing (hold your breath), flashlight with a limited battery, hiding.
import * as THREE from 'three';
import { clamp, lerp, damp, rand } from '../core/math.js';
import { settings } from '../core/settings.js';
import { canvasTexture } from '../render/textures.js';
import { mat } from '../render/materials.js';

const STAND_EYE = 1.62, CROUCH_EYE = 1.02, RADIUS = 0.28;

function flashCookie() {
  return canvasTexture(256, 256, (c, W, H) => {
    const g = c.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, W / 2);
    g.addColorStop(0, 'rgba(255,250,235,1)');
    g.addColorStop(0.18, 'rgba(255,245,225,0.95)');
    g.addColorStop(0.22, 'rgba(200,190,170,0.65)');
    g.addColorStop(0.42, 'rgba(255,240,215,0.75)');
    g.addColorStop(0.5, 'rgba(200,190,175,0.6)');
    g.addColorStop(0.8, 'rgba(150,140,130,0.4)');
    g.addColorStop(1, 'rgba(90,85,80,0.25)');
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    // scratches / dirt on the lens
    c.strokeStyle = 'rgba(0,0,0,0.25)';
    for (let i = 0; i < 18; i++) { c.lineWidth = Math.random() * 2; c.beginPath(); const x = Math.random() * W, y = Math.random() * H; c.moveTo(x, y); c.lineTo(x + (Math.random() - 0.5) * 60, y + (Math.random() - 0.5) * 60); c.stroke(); }
  });
}

export class Player {
  constructor(game) {
    this.game = game;
    this.camera = game.camera;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = 0;
    this.eye = STAND_EYE;
    this.crouched = false;
    this.lean = 0;
    this.bobT = 0;
    this.stepAcc = 0;
    this.lastStepLeft = false;
    this.health = 100;
    this.stamina = 100;
    this.exhausted = false;
    this.fear = 0;
    this.breath = 1; // breath-hold reserve
    this.holding = false;
    this.injury = { leg: 0.55, arm: 0.2, bleeding: true, shock: 0 };
    this.painRelief = 0;
    this.battery = 100;
    this.flashOn = false;
    this.hasFlashlight = false;
    this.hidden = null; // hide spot
    this.hideLook = { yaw: 0, pitch: 0 };
    this.locked = false; // cutscenes / healing
    this.shake = 0;
    this.knock = 0;
    this.speedNow = 0;
    this.dead = false;
    this.bloodTimer = 0;
    this.breathNoiseTimer = 0;
    this.healing = null;
    this.wake = 0;

    // flashlight
    const spot = new THREE.SpotLight(0xfff1d6, 0, 28, 0.6, 0.5, 1.4);
    spot.map = flashCookie();
    spot.castShadow = true;
    spot.shadow.mapSize.set(game.quality.flashShadow, game.quality.flashShadow);
    spot.shadow.bias = -0.0006;
    spot.shadow.normalBias = 0.02;
    spot.shadow.camera.near = 0.15;
    spot.shadow.camera.far = 14;
    this.spot = spot;
    this.spotTarget = new THREE.Object3D();
    game.scene.add(spot, this.spotTarget);
    spot.target = this.spotTarget;
    // faint fill light around the beam so the player sees their surroundings a little
    this.fill = new THREE.PointLight(0xffe8c8, 0, 5, 2);
    game.scene.add(this.fill);
    this.eyeLight = new THREE.PointLight(0x9fb0d0, 0, 9, 1.1);
    game.scene.add(this.eyeLight);

    // view model: hand holding the flashlight
    this.viewModel = new THREE.Group();
    const torch = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.017, 0.16, 12), mat('metalClean'));
    body.rotation.x = Math.PI / 2;
    torch.add(body);
    const head = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.018, 0.045, 14), mat('metalClean'));
    head.rotation.x = Math.PI / 2;
    head.position.z = -0.09;
    torch.add(head);
    this.lens = new THREE.Mesh(new THREE.CircleGeometry(0.023, 16), new THREE.MeshBasicMaterial({ color: 0x222222 }));
    this.lens.position.z = -0.113;
    this.lens.rotation.y = Math.PI;
    torch.add(this.lens);
    const skin = new THREE.MeshStandardMaterial({ color: 0x6e5242, roughness: 0.75 });
    const palm = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.035, 0.085), skin);
    palm.position.set(0.026, -0.006, 0.03);
    palm.rotation.z = -0.4;
    torch.add(palm);
    for (let i = 0; i < 4; i++) {
      const f = new THREE.Mesh(new THREE.TorusGeometry(0.021, 0.0085, 6, 10, Math.PI * 1.15), skin);
      f.rotation.set(0, Math.PI / 2, -0.4);
      f.position.set(0.004, 0.0, 0.0 + i * 0.019 - 0.005);
      torch.add(f);
    }
    const thumb = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.009, 0.045, 6), skin);
    thumb.rotation.set(Math.PI / 2, 0, 0.3);
    thumb.position.set(-0.012, 0.022, -0.01);
    torch.add(thumb);
    const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.3, 12), new THREE.MeshStandardMaterial({ color: 0x2a2a30, roughness: 0.95 }));
    sleeve.rotation.x = Math.PI / 2 - 0.3;
    sleeve.position.set(0.02, -0.06, 0.2);
    torch.add(sleeve);
    // bloody bandage on the wrist when wounded
    this.wristBlood = new THREE.Mesh(new THREE.CylinderGeometry(0.047, 0.047, 0.03, 12), new THREE.MeshStandardMaterial({ color: 0x5a1010, roughness: 0.6 }));
    this.wristBlood.rotation.x = Math.PI / 2 - 0.3;
    this.wristBlood.position.set(0.015, -0.035, 0.08);
    torch.add(this.wristBlood);
    torch.traverse((o) => { if (o.isMesh) { o.renderOrder = 10; o.castShadow = false; } });
    this.viewModel.add(torch);
    this.torch = torch;
    this.viewModel.position.set(0.22, -0.2, -0.38);
    this.viewModel.visible = false;
    this.camera.add(this.viewModel);
  }

  get eyePos() {
    return this.camera.position;
  }

  get level() {
    return this.game.levelOf(this.pos.y);
  }

  spawn(pos, yaw) {
    this.pos.copy(pos);
    this.yaw = yaw;
    this.pitch = 0;
    this.vel.set(0, 0, 0);
  }

  // effective impairment 0..1
  get limp() { return this.injury.leg * (this.painRelief > 0 ? 0.35 : 1); }
  get tremble() { return clamp(this.injury.arm * (this.painRelief > 0 ? 0.3 : 1) + this.fear * 0.6 + (this.exhausted ? 0.3 : 0), 0, 1.5); }

  update(dt, input) {
    const g = this.game;
    if (this.dead) return;
    this.painRelief = Math.max(0, this.painRelief - dt);
    this.injury.shock = Math.max(0, this.injury.shock - dt * 0.35);
    this.shake = Math.max(0, this.shake - dt * 2);
    this.knock = Math.max(0, this.knock - dt * 0.6);

    // ----- look
    const [mdx, mdy] = input.consumeMouse();
    const sens = 0.0022 * settings.sensitivity * (1 - this.injury.shock * 0.3);
    const inv = settings.invertY ? -1 : 1;
    if (this.hidden) {
      this.hideLook.yaw = clamp(this.hideLook.yaw - mdx * sens, -0.9, 0.9);
      this.hideLook.pitch = clamp(this.hideLook.pitch - mdy * sens * inv, -0.5, 0.5);
    } else if (!this.locked) {
      this.yaw -= mdx * sens;
      this.pitch = clamp(this.pitch - mdy * sens * inv, -1.45, 1.45);
    }

    // ----- vitals
    if (this.injury.bleeding) {
      this.health -= dt * 0.18;
      this.bloodTimer -= dt * (this.speedNow > 0.2 ? 1 : 0.25);
      if (this.bloodTimer <= 0) { this.bloodTimer = rand(1.4, 2.4); g.spawnBloodDrop(this.pos); }
    } else if (this.health < 55) this.health += dt * 0.25;
    if (this.health <= 0) { this.health = 0; g.playerDied('blood'); return; }
    // fear decays when nothing threatens
    this.fear = clamp(this.fear - dt * 0.05, 0, 1);

    // ----- healing in progress (stand still)
    if (this.healing) {
      this.healing.t += dt;
      if (this.healing.t >= this.healing.dur) { this.healing.done(); this.healing = null; this.locked = false; }
      else if (input.is('forward') || input.is('back') || input.is('left') || input.is('right')) {
        this.healing = null; this.locked = false; g.ui.toast('Soins interrompus.');
      }
    }

    // ----- breath holding
    const wantHold = input.is('holdBreath') && (this.hidden || this.crouched);
    if (wantHold && this.breath > 0) {
      this.holding = true;
      this.breath -= dt / (7 * (1 - this.fear * 0.4) * (this.exhausted ? 0.6 : 1));
      if (this.breath <= 0) { this.breath = 0; this.holding = false; g.audio.gasp(); g.noise(this.pos, 0.55, 'gasp'); this.breathLockout = 2.5; }
    } else {
      if (this.holding) g.audio.exhale();
      this.holding = false;
      this.breath = Math.min(1, this.breath + dt * 0.18);
    }
    this.breathLockout = Math.max(0, (this.breathLockout || 0) - dt);
    // breathing noise (fear / exhaustion), heard by the doll when she is close
    this.breathNoiseTimer -= dt;
    if (this.breathNoiseTimer <= 0) {
      this.breathNoiseTimer = 1.2;
      const loud = this.holding ? 0 : 0.06 + this.fear * 0.28 + (100 - this.stamina) / 100 * 0.25;
      if (loud > 0.12) g.noise(this.pos.clone().setY(this.pos.y + 1.2), loud, 'breath');
    }

    if (this.hidden) { this.updateHidden(dt); this.updateFlashlight(dt, input); return; }

    // ----- movement
    let mx = 0, mz = 0;
    if (!this.locked) {
      if (input.is('forward')) mz -= 1;
      if (input.is('back')) mz += 1;
      if (input.is('left')) mx -= 1;
      if (input.is('right')) mx += 1;
      if (input.hit('crouch')) this.toggleCrouch();
    }
    if (!this.locked) { mx += input.axisX; mz += input.axisY; }
    const moving = Math.abs(mx) > 0.05 || Math.abs(mz) > 0.05;
    const wantSprint = (input.is('sprint') || input.axisY < -0.95) && moving && mz < 0 && !this.crouched && !this.exhausted;
    let speed = this.crouched ? 0.95 : 1.7;
    if (wantSprint) speed = 3.7;
    speed *= 1 - this.limp * 0.35;
    if (this.health < 30) speed *= 0.85;
    if (this.knock > 0) speed *= 0.4;
    // stamina
    if (wantSprint) {
      this.stamina -= dt * 17 * (1 + this.limp * 0.5);
      if (this.stamina <= 0) { this.stamina = 0; this.exhausted = true; g.audio.pant(); }
    } else {
      this.stamina = Math.min(100, this.stamina + dt * (moving ? 7 : 13) * (1 - this.limp * 0.4));
      if (this.exhausted && this.stamina > 35) this.exhausted = false;
    }
    // panic makes movement imprecise
    if (this.fear > 0.7 && moving) mx += Math.sin(g.time * 7.3) * (this.fear - 0.7) * 0.6;
    const len = Math.max(1, Math.hypot(mx, mz)); // analog stick: partial push = slower
    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    const wx = (mx * cos + mz * sin) / len * speed;
    const wz = (-mx * sin + mz * cos) / len * speed;
    // limp: speed oscillates with the gait
    const limpMod = moving ? 1 - this.limp * 0.45 * Math.max(0, Math.sin(this.bobT * 0.5 * Math.PI * 2)) : 1;
    this.vel.x = damp(this.vel.x, moving ? wx * limpMod : 0, 10, dt);
    this.vel.z = damp(this.vel.z, moving ? wz * limpMod : 0, 10, dt);
    const old = this.pos.clone();
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    const height = this.crouched ? 1.15 : 1.75;
    g.world.collideCylinder(this.pos, RADIUS, this.pos.y, height, (b) => b.kind !== 'prop');
    // ground / stairs
    const gr = g.world.groundAt(this.pos.x, this.pos.z, this.pos.y + 0.05, 0.5);
    if (gr) {
      if (gr.y < this.pos.y - 0.6) { this.pos.x = old.x; this.pos.z = old.z; } // never walk off a ledge
      else this.pos.y = damp(this.pos.y, gr.y, 18, dt);
    } else { this.pos.x = old.x; this.pos.z = old.z; }
    const moved = Math.hypot(this.pos.x - old.x, this.pos.z - old.z);
    this.speedNow = moved / Math.max(dt, 1e-4);
    // footsteps (noise events)
    if (this.speedNow > 0.3) {
      const stride = wantSprint ? 0.85 : this.crouched ? 0.45 : 0.62;
      this.stepAcc += moved;
      this.bobT += moved / stride;
      if (this.stepAcc >= stride) {
        this.stepAcc = 0;
        this.lastStepLeft = !this.lastStepLeft;
        const surface = g.surfaceAt(this.pos);
        let loud = wantSprint ? 0.85 : this.crouched ? 0.1 : 0.32;
        if (surface === 'tile') loud *= 1.2;
        if (surface === 'carpet') loud *= 0.6;
        if (this.lastStepLeft && this.limp > 0.3 && !this.crouched) loud += 0.06; // dragged foot
        g.audio.footstep(surface, loud, this.lastStepLeft, this.limp);
        // old floors creak
        if ((surface === 'wood') && Math.random() < (this.crouched ? 0.03 : 0.07)) { g.audio.creak(this.pos, 0.6); loud = Math.max(loud, 0.5); }
        g.noise(this.pos, loud, wantSprint ? 'run' : 'step');
        if (wantSprint) g.audio.breathRun();
      }
    } else this.stepAcc = 0;
    this.updateCamera(dt, input, moving, wantSprint);
    this.updateFlashlight(dt, input);
  }

  toggleCrouch() {
    if (this.crouched) {
      // can we stand up?
      const top = this.game.world.raycast(new THREE.Vector3(this.pos.x, this.pos.y + 1.0, this.pos.z), new THREE.Vector3(0, 1, 0), 0.8, (b) => b.solid && b.kind !== 'prop');
      if (top.box) return;
    }
    this.crouched = !this.crouched;
  }

  updateCamera(dt, input, moving, sprint) {
    const g = this.game;
    this.eye = damp(this.eye, this.crouched ? CROUCH_EYE : STAND_EYE - this.knock * 1.2, 10, dt);
    // lean (blocked by walls)
    let leanT = 0;
    if (!this.locked) { if (input.is('leanLeft')) leanT = -1; if (input.is('leanRight')) leanT = 1; }
    this.lean = damp(this.lean, leanT, 9, dt);
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    let leanDist = this.lean * 0.38;
    if (Math.abs(leanDist) > 0.01) {
      const o = new THREE.Vector3(this.pos.x, this.pos.y + this.eye, this.pos.z);
      const r = g.world.raycast(o, right.clone().multiplyScalar(Math.sign(leanDist)), Math.abs(leanDist) + 0.2, (b) => b.solid);
      leanDist = Math.sign(leanDist) * Math.max(0, Math.min(Math.abs(leanDist), r.t - 0.2));
    }
    // head bob: vertical + lateral, limp makes it asymmetric
    const bobAmp = settings.headBob * (moving ? (sprint ? 0.055 : 0.03) : 0);
    const ph = this.bobT * Math.PI;
    let bobY = Math.abs(Math.sin(ph)) * bobAmp;
    const limpDip = this.limp * settings.headBob * (moving ? 0.07 : 0) * Math.max(0, Math.sin(ph)) * (Math.sin(ph * 0.5) > 0 ? 1 : 0.2);
    const bobX = Math.sin(ph * 0.5) * bobAmp * 0.6;
    // breathing / idle sway, stronger with fear & exhaustion
    const t = g.time;
    const breathAmp = (0.004 + this.fear * 0.006 + (1 - this.stamina / 100) * 0.008) * (this.holding ? 0.2 : 1);
    const swayY = Math.sin(t * (1.2 + this.fear * 1.5)) * breathAmp;
    // shake (hits) + panic jitter
    const sh = (this.shake + this.injury.shock * 0.3) * 0.04;
    const cam = this.camera;
    cam.position.set(
      this.pos.x + right.x * (leanDist + bobX) + (Math.random() - 0.5) * sh,
      this.pos.y + this.eye + bobY - limpDip + swayY + (Math.random() - 0.5) * sh,
      this.pos.z + right.z * (leanDist + bobX) + (Math.random() - 0.5) * sh,
    );
    cam.rotation.order = 'YXZ';
    const tremble = this.tremble;
    cam.rotation.set(
      this.pitch + Math.sin(t * 13) * 0.0015 * tremble,
      this.yaw + Math.sin(t * 11) * 0.0012 * tremble,
      -this.lean * 0.12 + Math.sin(this.bobT * Math.PI * 0.5) * 0.004 * settings.headBob + this.knock * 0.6,
    );
    const fov = settings.fov + (sprint ? 4 : 0) - this.fear * 3;
    if (Math.abs(cam.fov - fov) > 0.05) { cam.fov = damp(cam.fov, fov, 4, dt); cam.updateProjectionMatrix(); }
  }

  updateHidden(dt) {
    const s = this.hidden;
    const cam = this.camera;
    const baseYaw = Math.atan2(s.front.x, s.front.z) + Math.PI; // camera looks along -z
    cam.position.set(s.pos.x, s.pos.y + s.eye, s.pos.z);
    if (s.kind === 'wardrobe') cam.position.addScaledVector(s.front, 0.12);
    cam.rotation.order = 'YXZ';
    const fearShake = this.fear * 0.004 * (this.holding ? 0.3 : 1);
    cam.rotation.set(this.hideLook.pitch + Math.sin(this.game.time * 9) * fearShake, baseYaw + this.hideLook.yaw, 0);
    this.pos.set(s.pos.x, s.pos.y, s.pos.z);
  }

  updateFlashlight(dt, input) {
    const g = this.game;
    if (this.hasFlashlight && input.hit('flashlight') && !this.locked) {
      if (this.battery > 0) { this.flashOn = !this.flashOn; g.audio.click(); }
      else { g.audio.click(); g.ui.toast('Les piles sont mortes.'); }
    }
    if (this.flashOn) {
      this.battery -= dt * 0.38;
      if (this.battery <= 0) { this.battery = 0; this.flashOn = false; g.ui.toast('La lampe s\'éteint. Il te faut des piles.'); }
    }
    let k = this.flashOn ? 1 : 0;
    if (this.flashOn && this.battery < 20) {
      // dying batteries: brown-outs
      this._flk = (this._flk || 0) - dt;
      if (this._flk <= 0) { this._flk = rand(0.05, 0.4); this._flv = Math.random() < 0.25 ? rand(0, 0.3) : rand(0.5, 0.9); }
      k *= this._flv;
    }
    const cam = this.camera;
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    // the beam lags slightly behind the view and trembles with the hand
    const tr = this.tremble;
    const t = g.time;
    this._beam = this._beam || dir.clone();
    this._beam.lerp(dir, 1 - Math.exp(-14 * dt)).normalize();
    const wob = new THREE.Vector3(Math.sin(t * 17) * 0.012 * tr, Math.sin(t * 13 + 1) * 0.012 * tr, 0).applyQuaternion(cam.quaternion);
    const beam = this._beam.clone().add(wob).normalize();
    // the beam starts at the lens, in front of the torch (so the hand is never lit by its own light)
    const origin = cam.position.clone()
      .add(new THREE.Vector3(0.22, -0.2, -0.53).applyQuaternion(cam.quaternion));
    this.spot.position.copy(origin);
    this.spotTarget.position.copy(origin).addScaledVector(beam, 5);
    this.spot.intensity = k * 150 * (0.55 + 0.45 * Math.min(1, this.battery / 40));
    this.fill.position.copy(origin).addScaledVector(beam, 1.2);
    this.fill.intensity = k * 1.2;
    // soft light around the player (eyes used to the dark): keeps the surroundings readable without the torch
    this.eyeLight.position.copy(cam.position);
    this.eyeLight.intensity = 1.7;
    this.lens.material.color.setScalar(k > 0 ? 0.8 : 0.13);
    // view model
    this.viewModel.visible = this.hasFlashlight && !this.hidden;
    const vm = this.viewModel;
    const bob = Math.sin(this.bobT * Math.PI) * 0.01 * settings.headBob;
    vm.position.set(0.22 + Math.sin(t * 11) * 0.003 * tr, -0.2 + bob - (this.healing ? 0.2 : 0), -0.38);
    vm.rotation.set(Math.sin(t * 13) * 0.02 * tr, Math.sin(t * 9) * 0.02 * tr, 0);
    this.wristBlood.visible = this.injury.arm > 0.15;
    this.flashDir = beam;
  }

  // Is the flashlight beam pointing at a world point (for the doll's light reaction and visibility)?
  beamHits(p, maxDist = 20) {
    if (!this.flashOn) return 0;
    const to = p.clone().sub(this.spot.position);
    const d = to.length();
    if (d > maxDist) return 0;
    const cos = to.normalize().dot(this.flashDir || new THREE.Vector3(0, 0, -1));
    return cos > Math.cos(0.42) ? (1 - d / maxDist) : 0;
  }

  hit(damage, from) {
    const g = this.game;
    if (this.healing) { this.healing = null; this.locked = false; g.ui.toast('Soins interrompus.'); }
    this.health -= damage;
    this.shake = 1.5;
    this.injury.shock = 1;
    this.knock = 0.6;
    this.fear = 1;
    if (Math.random() < 0.6) this.injury.leg = Math.min(1, this.injury.leg + 0.2);
    else this.injury.arm = Math.min(1, this.injury.arm + 0.3);
    this.injury.bleeding = true;
    if (from) {
      const away = this.pos.clone().sub(from).setY(0).normalize();
      this.pos.addScaledVector(away, 0.6);
      g.world.collideCylinder(this.pos, RADIUS, this.pos.y, 1.7);
    }
    if (this.health <= 0) g.playerDied('doll');
  }
}

export { lerp };
