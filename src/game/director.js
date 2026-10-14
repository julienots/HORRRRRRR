// Tension director: rare, varied contextual scares, paced with silence and false safety.
// Rules: never during a chase, long cooldowns (50-120 s), no repetition of the same event in a row,
// and the real doll is never teleported in view — her "appearances" use real navigation (Doll.requestStalk).
// Two events are explicit hallucinations (fear-driven): the figure behind a window and the whisper behind you.
import * as THREE from 'three';
import { rand, pick, chance } from '../core/math.js';
import { LEVELS, LEVEL_ORDER, roomAt } from '../world/layout.js';
import { buildDoll } from '../actors/dollModel.js';
import { DollAnimator } from '../actors/dollAnim.js';

export class Director {
  constructor(game) {
    this.game = game;
    this.cooldown = 45;
    this.recent = [];
    this.log = [];
    this.ghost = null;
    this.ghostT = 0;
    this.thunderT = rand(30, 70);
    this.events = {
      doorSlam: () => this.doorSlam(),
      stepsAbove: () => this.stepsAbove(),
      toy: () => this.toy(),
      lightOut: () => this.lightOut(),
      radio: () => this.radio(),
      moveObject: () => this.moveObject(),
      mirror: () => this.mirror(),
      knock: () => this.knock(),
      appliance: () => this.appliance(),
      traces: () => this.traces(),
      stalk: () => this.stalk(),
      windowFigure: () => this.windowFigure(),
      pipes: () => this.pipes(),
      whisper: () => this.whisper(),
    };
  }

  makeGhost() {
    if (this.ghost) return this.ghost;
    const m = buildDoll();
    const a = new DollAnimator(m);
    a.state.action = 'stare';
    a.state.eye = 'aware';
    a.state.glow = 1;
    m.root.visible = false;
    this.game.scene.add(m.root);
    this.ghost = { m, a };
    return this.ghost;
  }

  update(dt) {
    const g = this.game;
    if (g.act < 2 || !g.doll.active) { this.cooldown = Math.max(this.cooldown, 20); }
    this.cooldown -= dt;
    // ambient thunder & lightning
    this.thunderT -= dt;
    if (this.thunderT <= 0) {
      this.thunderT = rand(40, 110);
      g.audio.thunder();
      g.lightning = 0.35;
    }
    if (this.ghostT > 0) {
      this.ghostT -= dt;
      const gh = this.ghost;
      gh.a.state.lookAt = g.camera.position.clone();
      gh.a.state.lookMode = 'creepy';
      gh.m.root.updateMatrixWorld(true);
      gh.a.update(dt, gh.m.root.rotation.y);
      // a hallucination vanishes as soon as you stare at it
      if (this.ghostKind === 'window' && g.isVisibleToPlayer(gh.m.root.position.clone().setY(gh.m.root.position.y + 0.8)) && (this.ghostSeen = (this.ghostSeen || 0) + dt) > 0.35) this.ghostT = 0;
      if (this.ghostT <= 0) { gh.m.root.visible = false; gh.m.root.traverse((o) => o.layers.set(0)); }
    }
    if (this.cooldown > 0) return;
    if (g.doll.state === 'chase' || g.doll.state === 'attack' || g.player.hidden || g.player.dead) return;
    if (g.doll.distToPlayer < 6 && g.doll.state === 'search') return;
    const names = Object.keys(this.events).filter((n) => !this.recent.includes(n));
    for (let tries = 0; tries < 6; tries++) {
      const n = pick(names);
      if (this.events[n]()) {
        this.recent.push(n);
        if (this.recent.length > 5) this.recent.shift();
        this.log.push({ t: +g.time.toFixed(1), event: n });
        this.cooldown = rand(50, 110) / (0.7 + g.act * 0.12);
        return;
      }
    }
    this.cooldown = 8;
  }

  // ---------------------------------------------------------------- events
  doorSlam() {
    const g = this.game, p = g.player;
    const behind = g.house.doors.filter((d) => d.open > 0.9 && !d.locked && d.level === p.level && d.style !== 'hidden' &&
      d.center.distanceTo(p.eyePos) > 2.5 && d.center.distanceTo(p.eyePos) < 9 && !g.isVisibleToPlayer(d.center));
    if (!behind.length) return false;
    const d = pick(behind);
    g.openDoor(d, false, null, false, true);
    g.audio.door(d.center, false, true);
    g.player.fear = Math.min(1, g.player.fear + 0.3);
    g.noise(d.center, 0.35, 'door');
    return true;
  }

  stepsAbove() {
    const g = this.game, p = g.player;
    const i = LEVEL_ORDER.indexOf(p.level);
    if (i >= LEVEL_ORDER.length - 1) return false;
    const pos = p.pos.clone().setY(LEVELS[LEVEL_ORDER[i + 1]] + 0.1).add(new THREE.Vector3(rand(-3, 3), 0, rand(-3, 3)));
    g.audio.footstepsAbove(pos);
    g.ui.subtitle('[Des pas, à l\'étage du dessus]', 3);
    return true;
  }

  toy() {
    const g = this.game, p = g.player;
    const toys = g.content.props.filter((t) => t.kind === 'toy' && t.mesh.position.distanceTo(p.pos) < 12 && !g.isVisibleToPlayer(t.mesh.position));
    if (!toys.length) return false;
    const t = pick(toys);
    g.audio.toySqueak(t.mesh.position);
    g.noise(t.mesh.position, 0.5, 'toy'); // the doll hears it too
    g.ui.subtitle('[Un jouet couine]', 2);
    return true;
  }

  lightOut() {
    const g = this.game, p = g.player;
    if (!g.lights.power) return false;
    const lamps = g.content.lights.filter((l) => l.needsPower && l.on && !l.broken && l.level === p.level && l.pos.distanceTo(p.eyePos) < 9);
    if (!lamps.length) return false;
    const l = pick(lamps);
    l.broken = true;
    g.audio.glass(l.pos);
    g.ui.subtitle('[Une ampoule éclate]', 2);
    p.fear = Math.min(1, p.fear + 0.25);
    return true;
  }

  radio() {
    const g = this.game, p = g.player;
    const r = g.content.fixtures.radio;
    const pos = r.obj.getWorldPosition(new THREE.Vector3());
    if (pos.distanceTo(p.pos) > 16 || g.playerRoom?.id === 'living') return false;
    g.audio.radioVoice(pos);
    g.noise(pos, 0.6, 'radio');
    return true;
  }

  moveObject() {
    const g = this.game, p = g.player;
    const list = (g.content.movables || []).filter((o) => {
      const wp = o.getWorldPosition(new THREE.Vector3());
      return !g.isVisibleToPlayer(wp) && wp.distanceTo(p.pos) < 14 && wp.distanceTo(p.pos) > 3;
    });
    if (!list.length) return false;
    const o = pick(list);
    // turn it to face where the player stands, and nudge it
    const wp = o.getWorldPosition(new THREE.Vector3());
    o.rotation.y = Math.atan2(p.pos.x - wp.x, p.pos.z - wp.z);
    o.position.x += rand(-0.15, 0.15);
    o.updateMatrixWorld(true);
    return true;
  }

  mirror() {
    const g = this.game, p = g.player;
    const m = g.content.fixtures.mirror;
    if (g.playerRoom?.id !== 'bath') return false;
    const toMirror = m.pos.clone().sub(g.camera.position);
    const look = new THREE.Vector3(0, 0, -1).applyQuaternion(g.camera.quaternion);
    if (toMirror.length() > 4 || toMirror.normalize().dot(look) < 0.85) return false;
    // a silhouette right behind the player, visible only in the reflection (layer 2)
    const gh = this.makeGhost();
    const behind = p.pos.clone().addScaledVector(look.setY(0).normalize(), -0.9);
    gh.m.root.position.copy(behind);
    gh.m.root.rotation.y = Math.atan2(p.pos.x - behind.x, p.pos.z - behind.z);
    gh.m.root.traverse((o) => o.layers.set(2));
    gh.m.root.visible = true;
    this.ghostKind = 'mirror';
    this.ghostT = 0.6;
    g.audio.sting();
    p.fear = 1;
    return true;
  }

  knock() {
    const g = this.game, p = g.player;
    const pos = p.pos.clone().add(new THREE.Vector3(rand(-5, 5), 1.2, rand(-5, 5)));
    g.audio.knock(pos);
    g.ui.subtitle('[On frappe… derrière le mur]', 3);
    return true;
  }

  appliance() {
    const g = this.game, p = g.player;
    if (g.lights.power) {
      const w = g.content.fixtures.washer;
      if (w.pos.distanceTo(p.pos) < 20) {
        g.applianceRun = 10;
        g.audio.washer(w.pos, 10);
        g.noise(w.pos, 0.5, 'appliance');
        g.ui.subtitle('[La machine à laver démarre toute seule]', 3);
        return true;
      }
      const tv = g.content.fixtures.tv;
      g.setTV(true, 6);
      g.ui.subtitle('[La télévision s\'allume : de la neige]', 3);
      void tv;
      return true;
    }
    const clk = g.content.fixtures.clock;
    const pos = clk.getWorldPosition(new THREE.Vector3());
    if (pos.distanceTo(p.pos) > 18) return false;
    for (let i = 0; i < 3; i++) g.audio.tone(pos, { freq: 330, type: 'sine', gain: 0.4, d: 1.8, offset: i * 1.6, reverb: 0.9 });
    g.ui.subtitle('[L\'horloge sonne. Elle était arrêtée.]', 3);
    return true;
  }

  traces() {
    const g = this.game, p = g.player;
    // tiny footprints appear in a corridor the player already crossed, leading to a door
    const r = g.playerRoom;
    if (!r || !g.visitedRooms.has(r.id)) return false;
    const pos = p.pos.clone().add(new THREE.Vector3(rand(-2, 2), 0, rand(-2, 2)));
    const behind = new THREE.Vector3(0, 0, 1).applyQuaternion(g.camera.quaternion).setY(0).normalize();
    pos.addScaledVector(behind, 2.5);
    const gr = g.world.groundAt(pos.x, pos.z, p.pos.y + 0.2);
    if (!gr || Math.abs(gr.y - p.pos.y) > 0.2) return false;
    g.spawnFootprints(new THREE.Vector3(pos.x, gr.y, pos.z), Math.random() * Math.PI * 2);
    return true;
  }

  stalk() {
    const g = this.game, p = g.player, d = g.doll;
    if (g.act > 4 || d.state !== 'patrol' || d.distToPlayer < 14) return false;
    // a spot 8-13 m away, on the player's level, in his line of sight
    const look = new THREE.Vector3(0, 0, -1).applyQuaternion(g.camera.quaternion).setY(0).normalize();
    for (let k = 0; k < 12; k++) {
      const dist = rand(8, 13);
      const ang = rand(-0.5, 0.5);
      const dir = look.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), ang);
      const target = p.pos.clone().addScaledVector(dir, dist);
      const node = g.nav.nearest(target, 1.5);
      if (!node || Math.abs(node.y - p.pos.y) > 0.5) continue;
      const pt = new THREE.Vector3(node.x, node.y + 0.8, node.z);
      if (g.world.lineBlocked(g.camera.position, pt)) continue;
      return d.requestStalk(node);
    }
    return false;
  }

  windowFigure() {
    const g = this.game, p = g.player;
    if (p.fear < 0.35) return false;
    const wins = g.house.windows.filter((w) => !w.roller && w.level === p.level && w.group.position.distanceTo(p.pos) < 9 && w.group.position.distanceTo(p.pos) > 2.5 && g.isVisibleToPlayer(w.group.position.clone().setY(w.group.position.y + 0.5)));
    if (!wins.length) return false;
    const w = pick(wins);
    const gh = this.makeGhost();
    const outward = new THREE.Vector3(0, 0, 1).applyQuaternion(w.group.quaternion);
    const toPlayer = p.pos.clone().sub(w.group.position).setY(0);
    if (outward.dot(toPlayer) > 0) outward.negate();
    const pos = w.group.position.clone().addScaledVector(outward, 0.45);
    pos.y = w.baseY + (w.o.y0 ?? 0.9) - 0.6;
    gh.m.root.position.copy(pos);
    gh.m.root.rotation.y = Math.atan2(-outward.x, -outward.z);
    gh.m.root.traverse((o) => o.layers.set(0));
    gh.m.root.visible = true;
    this.ghostKind = 'window';
    this.ghostSeen = 0;
    this.ghostT = 4;
    return true;
  }

  pipes() {
    const g = this.game, p = g.player;
    g.audio.pipes(p.pos.clone().add(new THREE.Vector3(rand(-4, 4), 2.6, rand(-4, 4))));
    g.ui.subtitle('[Les tuyaux cognent dans les murs]', 2.5);
    return true;
  }

  whisper() {
    const g = this.game, p = g.player;
    if (p.fear < 0.4) return false;
    const back = new THREE.Vector3(0, 0, 1).applyQuaternion(g.camera.quaternion).multiplyScalar(0.8);
    g.audio.dollWhisper(g.camera.position.clone().add(back));
    p.fear = Math.min(1, p.fear + 0.2);
    return true;
  }
}

export { roomAt, chance };
