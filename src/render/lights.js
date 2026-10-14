// Light manager: the house has ~70 light sources (lamps, candles, moonlight, fire...). Only a fixed pool of
// real PointLights is used; each frame they are assigned to the most relevant sources near the player.
// Keeping the pool size constant avoids shader recompilations.
import * as THREE from 'three';
import { rand } from '../core/math.js';

export class LightManager {
  constructor(scene, sources, quality) {
    this.sources = sources;
    this.power = false;
    this.pool = [];
    for (let i = 0; i < quality.pool; i++) {
      const l = new THREE.PointLight(0xffffff, 0, 8, 2);
      if (i < quality.pointShadows) {
        l.castShadow = true;
        l.shadow.mapSize.set(512, 512);
        l.shadow.bias = -0.004;
        l.shadow.radius = 3;
        l.shadow.camera.near = 0.1;
      }
      scene.add(l);
      this.pool.push(l);
    }
    // very low ambient so pitch black areas are still slightly readable
    this.hemi = new THREE.HemisphereLight(0x52648a, 0x1a120c, 0.11);
    scene.add(this.hemi);
    this.t = 0;
    this.scale = 2.3; // candela multiplier (tuned visually)
    this.assignTimer = 0;
    this.assigned = [];
    for (const s of sources) s.current = 0;
  }

  setPower(on) {
    this.power = on;
  }

  isLit(s) {
    if (s.broken) return false;
    if (s.needsPower && !this.power) return false;
    return s.on;
  }

  // Light level (0..~1) at a world point from the sources (no occlusion), used by the doll's vision.
  lightLevelAt(p, world) {
    let sum = 0;
    for (const s of this.sources) {
      if (!s.current || s.current < 0.05) continue;
      const d = s.pos.distanceTo(p);
      if (d > s.range) continue;
      const k = s.current * Math.pow(1 - d / s.range, 2) / 4;
      if (k < 0.01) continue;
      if (world && world.lineBlocked(s.pos, p, (b) => b.kind !== 'furniture')) continue;
      sum += k;
    }
    return sum;
  }

  update(dt, playerPos, playerLevel) {
    this.t += dt;
    for (const s of this.sources) {
      let target = this.isLit(s) ? s.base : 0;
      if (target > 0 && s.flicker) {
        // organic flicker: slow wobble + random dropouts
        s._ft = (s._ft || 0) - dt;
        if (s._ft <= 0) { s._ft = rand(0.03, 0.25); s._fv = Math.random() < s.flicker * 0.25 ? rand(0.05, 0.4) : rand(1 - s.flicker * 0.4, 1); }
        target *= s._fv ?? 1;
      }
      s.current = target;
      if (s.bulbM) {
        if (s.bulbM.emissiveIntensity !== undefined) s.bulbM.emissiveIntensity = s.kind === 'lantern' ? 0.2 + target * 0.5 : target > 0 ? 0.8 * (target / s.base) : 0;
      }
      if (s.flame) s.flame.visible = target > 0;
    }
    this.assignTimer -= dt;
    if (this.assignTimer <= 0) {
      this.assignTimer = 0.2;
      const cand = [];
      for (const s of this.sources) {
        if (!this.isLit(s)) continue;
        if (s.level !== playerLevel && !(s.kind === 'ceiling' && Math.abs(s.pos.y - playerPos.y) < 3.5 && s.pos.distanceTo(playerPos) < 7)) continue;
        const d = s.pos.distanceTo(playerPos);
        if (d > s.range + 9) continue;
        cand.push({ s, score: s.base / (1 + d * d * 0.15) });
      }
      cand.sort((a, b) => b.score - a.score);
      this.assigned = cand.slice(0, this.pool.length).map((c) => c.s);
      // shadow casting lights go to the strongest (first) sources
    }
    for (let i = 0; i < this.pool.length; i++) {
      const l = this.pool[i];
      const s = this.assigned[i];
      if (!s) { l.intensity = 0; continue; }
      l.position.copy(s.pos);
      l.color.copy(s.color);
      l.distance = s.range;
      l.intensity = s.current * this.scale;
    }
  }
}
