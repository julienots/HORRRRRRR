// The doll: hunting AI + body. States:
// dormant, patrol, suspicious, investigate, search, chase, attack, taunt, ambush, stalk, bang (locked door),
// flinch (light in the face), checkHide (opening a wardrobe / looking under a bed), retreat.
// Perception: vision (cone, occlusion, light level at the player, crouching, distance) and hearing
// (loudness, distance, walls/floors in between). Every detection has a cause the player can understand.
import * as THREE from 'three';
import { buildDoll } from './dollModel.js';
import { DollAnimator } from './dollAnim.js';
import { clamp, angleDiff, damp, rand, chance, pick } from '../core/math.js';
import { ROOMS, LEVELS, roomAt } from '../world/layout.js';

const EYE_H = 0.95;
const V = (x, y, z) => new THREE.Vector3(x, y, z);

export class Doll {
  constructor(game) {
    this.game = game;
    this.model = buildDoll();
    this.anim = new DollAnimator(this.model);
    this.root = this.model.root;
    game.scene.add(this.root);
    this.pos = new THREE.Vector3();
    this.yaw = 0;
    this.state = 'dormant';
    this.stateT = 0;
    this.path = null;
    this.pathI = 0;
    this.goal = null;
    this.speed = 0;
    this.suspicion = 0;
    this.lastKnown = null; // where she believes the player is
    this.lastSeenT = -999;
    this.lastHeard = null;
    this.searchPoints = [];
    this.checkedSpots = new Map(); // spotId -> time
    this.roomVisit = new Map(); // roomId -> time
    this.doorMemory = new Map();
    this.lightMemory = new Map();
    this.heat = new Map(); // door id -> player passages (for ambushes)
    this.knownHide = null; // spot she saw the player enter
    this.waitT = 0;
    this.flinchCD = 0;
    this.attackCD = 0;
    this.seeing = 0; // 0..1 how well she sees the player right now
    this.seenByPlayer = false;
    this.unseenT = 0;
    this.stepAcc = 0;
    this.doorWait = null;
    this.reason = '';
    this.aggro = 0;
    this.debug = { lastNoise: null, lastVis: 0 };
    this.giggleT = 10;
    this.creakT = 3;
    this.restT = 0;
    this.active = false;
    this.root.visible = true;
  }

  get level() { return this.game.levelOf(this.pos.y + 0.2); }
  get room() { return roomAt(this.pos.x, this.pos.y + 0.2, this.pos.z); }
  get eye() { return V(this.pos.x, this.pos.y + EYE_H, this.pos.z); }
  get diff() { return this.game.diff; }

  place(pos, yaw) {
    this.pos.copy(pos);
    this.yaw = yaw;
    this.path = null;
    this.syncRoot();
  }

  syncRoot() {
    this.root.position.copy(this.pos);
    this.root.rotation.y = this.yaw;
    this.root.updateMatrixWorld(true);
  }

  setState(s, reason = '') {
    if (this.state !== s) {
      this.prev = this.state;
      this.state = s;
      this.stateT = 0;
      this.reason = reason;
      this.game.events.emit('doll:state', { state: s, reason });
    }
  }

  // ------------------------------------------------------------------ perception
  // returns visibility 0..1 of the player for the doll (and why)
  computeVisibility() {
    const g = this.game, p = g.player;
    if (p.dead) return 0;
    const eye = this.eye;
    const head = V(p.pos.x, p.pos.y + (p.hidden ? p.hidden.eye : p.eye) - 0.1, p.pos.z);
    const torso = V(p.pos.x, p.pos.y + (p.crouched ? 0.6 : 1.0), p.pos.z);
    const d = eye.distanceTo(head);
    const range = 16 * this.diff.sight;
    if (d > range) return 0;
    // field of view: 130deg, close range 360 (she "feels" you right behind her)
    const to = head.clone().sub(eye).setY(0).normalize();
    const facing = V(Math.sin(this.yaw + this.anim.headYaw), 0, Math.cos(this.yaw + this.anim.headYaw));
    const cos = to.dot(facing);
    if (cos < Math.cos(1.15) && d > 1.3) return 0;
    if (p.hidden) {
      if (p.hidden.kind === 'wardrobe') return 0;
      // under a bed: visible only from low angles, close, when she looks
      if (d > 2.6 || !(this.state === 'search' || this.state === 'checkHide')) return 0;
    }
    const blocked = (a) => g.world.lineBlocked(eye, a, (b) => b.kind !== 'prop');
    const hb = blocked(head), tb = blocked(torso);
    if (hb && tb) return 0;
    let vis = hb || tb ? 0.55 : 1;
    // low furniture between (sofa, bed, table) hides a crouched player
    if (p.crouched) {
      const low = g.world.lineBlocked(eye, torso, (b) => b.kind === 'furniture') || this.lowCover(eye, torso);
      if (low) vis *= 0.25;
      vis *= 0.6;
    }
    // lighting: flashlight makes you a beacon, darkness hides you
    let light = 0.22;
    if (p.flashOn) light = 1;
    else {
      const ll = g.lights.lightLevelAt(head, g.world);
      light = clamp(0.2 + ll * 1.6, 0.2, 1);
    }
    vis *= light;
    if (p.speedNow > 2.5) vis *= 1.25;
    if (p.hidden && p.hidden.kind === 'bed') vis *= 0.5;
    // distance falloff
    vis *= clamp(1.25 - d / range, 0, 1);
    this.debug.lastVis = vis;
    return clamp(vis, 0, 1);
  }

  lowCover(a, b) {
    const list = this.game.world._boxesAlong(a.x, a.z, b.x, b.z);
    const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z, len = Math.hypot(dx, dy, dz);
    for (const box of list) {
      if (box.kind !== 'furniture' || !box.low) continue;
      const t = this.game.world.constructor.rayBox(a.x, a.y, a.z, dx / len, dy / len, dz / len, box, len);
      if (t >= 0 && t < len - 0.2) return true;
    }
    return false;
  }

  // noise event from the world
  hear(pos, loud, kind) {
    if (!this.active || this.state === 'dormant') return;
    const g = this.game;
    const d = pos.distanceTo(this.eye);
    const radius = loud * 22 * this.diff.hearing * (1 + this.aggro * 0.06);
    if (d > radius) return;
    const occ = g.world.countOccluders(this.eye, pos, 5);
    let perceived = (1 - d / radius) * Math.pow(0.5, occ);
    if (this.state === 'chase') perceived *= 1.5;
    this.debug.lastNoise = { kind, loud, d: +d.toFixed(1), occ, perceived: +perceived.toFixed(2) };
    if (perceived < 0.08) return;
    // uncertain localisation: the weaker the sound, the bigger the error
    const err = (1 - Math.min(1, perceived * 1.5)) * 3;
    const guess = pos.clone().add(V(rand(-err, err), 0, rand(-err, err)));
    this.lastHeard = { pos: guess, t: g.time, perceived, kind };
    if (this.state === 'chase' || this.state === 'attack') {
      if (perceived > 0.2 && g.time - this.lastSeenT > 0.5) this.lastKnown = pos.clone();
      return;
    }
    if (this.state === 'flinch' || this.state === 'bang') return;
    this.suspicion = Math.min(1.2, this.suspicion + perceived * 0.9);
    // noise from a hiding spot she is close to: she will check it
    const p = g.player;
    if (p.hidden && pos.distanceTo(p.hidden.pos) < 1.6 && perceived > 0.2) this.suspectSpot = p.hidden;
    if (perceived > 0.45 || this.suspicion > 0.6) {
      this.lastKnown = guess;
      this.beginInvestigate(perceived > 0.6 && this.aggro >= 2 ? 'fast' : 'walk', `bruit (${kindLabel(kind)})`);
    } else if (this.state === 'patrol' || this.state === 'ambush' || this.state === 'stalk') {
      this.lookToward = guess;
      this.setState('suspicious', `bruit (${kindLabel(kind)})`);
    }
  }

  // ------------------------------------------------------------------ movement helpers
  canPass = (door) => {
    if (door.forced) return 1;
    if (door.locked && door.locked !== false && !door.lockedInside) return Infinity;
    if (door.boarded) return Infinity;
    if (door.lockedInside) return 6; // she will force it
    return door.open > 0.8 ? 1 : 1.6;
  };

  goTo(target, speedMode = 'walk') {
    const g = this.game;
    const from = g.nav.nearest(this.pos, 2.5);
    const to = target.id !== undefined ? target : g.nav.nearest(target, 3);
    if (!from || !to) { this.path = null; return false; }
    const path = g.nav.path(from, to, { canPass: this.canPass });
    if (!path) { this.path = null; return false; }
    this.path = path;
    this.pathI = 1;
    this.goal = to;
    this.speedMode = speedMode;
    return true;
  }

  // follow the current path; returns true when arrived
  followPath(dt) {
    const g = this.game;
    if (!this.path) return true;
    if (this.pathI >= this.path.length) { this.path = null; return true; }
    let node = this.path[this.pathI];
    // doors on the way
    const prevNode = this.path[this.pathI - 1];
    const link = prevNode && prevNode.links.find((l) => l.to === node);
    const door = link && link.door;
    if (door && door.open < 0.85 && !door.forced) {
      const dd = Math.hypot(door.center.x - this.pos.x, door.center.z - this.pos.z);
      if (dd < 1.4) {
        if (door.lockedInside && !door.forced) { this.bangDoor(door); return false; }
        if (door.locked && !door.forced) { this.path = null; return true; }
        if (!this.doorWait) {
          this.doorWait = { door, t: 0 };
          this.anim.state.action = 'reach';
        }
        this.doorWait.t += dt;
        this.speed = 0;
        this.faceTo(door.center, dt, 8);
        if (this.doorWait.t > (this.state === 'chase' ? 0.35 : 0.8)) {
          g.openDoor(door, true, this.pos);
          this.memorizeDoor(door);
          this.doorWait = null;
          this.anim.state.action = null;
        }
        return false;
      }
    }
    const spd = this.currentSpeed();
    const dx = node.x - this.pos.x, dz = node.z - this.pos.z;
    const dist = Math.hypot(dx, dz);
    // look ahead: skip nodes when the next one is close and in line
    if (dist < 0.3 || (dist < 0.6 && this.pathI < this.path.length - 1)) {
      this.pathI++;
      if (this.pathI >= this.path.length) { this.path = null; return true; }
      node = this.path[this.pathI];
    }
    const tx = node.x - this.pos.x, tz = node.z - this.pos.z;
    const tl = Math.hypot(tx, tz) || 1;
    const desiredYaw = Math.atan2(tx, tz);
    this.yaw += angleDiff(this.yaw, desiredYaw) * Math.min(1, dt * (this.state === 'chase' ? 12 : 6));
    const step = Math.min(tl, spd * dt);
    this.pos.x += (tx / tl) * step;
    this.pos.z += (tz / tl) * step;
    // height follows the walkable region of the node (stairs)
    const gr = g.world.groundAt(this.pos.x, this.pos.z, node.y + 0.3, 0.6);
    this.pos.y = damp(this.pos.y, gr ? gr.y : node.y, 20, dt);
    this.speed = step / Math.max(dt, 1e-4);
    this.moved = step;
    return false;
  }

  currentSpeed() {
    const a = this.aggro;
    const s = this.diff.speed;
    // she is faster when nobody is watching her (and far from the player)
    const unseenBoost = !this.seenByPlayer && this.unseenT > 2 && this.distToPlayer > 11 && this.state !== 'chase' ? 2.0 : 1;
    switch (this.speedMode) {
      case 'run': return (3.15 + a * 0.12) * s;
      case 'fast': return (1.7 + a * 0.1) * s * unseenBoost;
      case 'sneak': return 0.75 * s * unseenBoost;
      default: return (0.95 + a * 0.08) * s * unseenBoost;
    }
  }

  faceTo(p, dt, rate = 6) {
    const desired = Math.atan2(p.x - this.pos.x, p.z - this.pos.z);
    this.yaw += angleDiff(this.yaw, desired) * Math.min(1, dt * rate);
  }

  memorizeDoor(d) { this.doorMemory.set(d.id, d.open > 0.5); }

  // ------------------------------------------------------------------ high level behaviours
  beginInvestigate(mode, reason) {
    if (!this.lastKnown) return;
    this.setState('investigate', reason);
    this.goTo(this.lastKnown, mode);
  }

  beginSearch(center, reason = 'recherche') {
    const g = this.game;
    this.setState('search', reason);
    this.searchCenter = center.clone();
    this.searchEnd = g.time + rand(18, 30) * this.diff.searchTime * (1 + this.aggro * 0.1);
    // candidate points: around the center, plus hide spots of the nearby rooms
    this.searchPoints = [];
    const room = roomAt(center.x, center.y + 0.2, center.z);
    const spots = g.content.hides.filter((h) => h.pos.distanceTo(center) < 9 && Math.abs(h.pos.y - center.y) < 1.5);
    // weight: distance to where she heard / saw, and whether she saw the player enter
    spots.sort((a, b) => a.pos.distanceTo(center) - b.pos.distanceTo(center));
    const checks = Math.min(spots.length, Math.round(1 + this.aggro * 0.7 + this.diff.checkChance));
    for (let i = 0; i < spots.length && this.searchPoints.length < checks; i++) {
      const s = spots[i];
      const recently = this.checkedSpots.get(s.id);
      if (recently && g.time - recently < 25 && s !== this.knownHide && s !== this.suspectSpot) continue;
      if (s === this.knownHide || s === this.suspectSpot || chance(this.diff.checkChance * (i === 0 ? 1 : 0.65))) this.searchPoints.push({ spot: s });
    }
    if (this.knownHide) this.searchPoints.unshift({ spot: this.knownHide });
    for (let i = 0; i < 2; i++) {
      const n = room ? g.nav.randomNodeIn(room.rect, center.y) : null;
      if (n) this.searchPoints.splice(Math.floor(Math.random() * (this.searchPoints.length + 1)), 0, { node: n });
    }
    this.nextSearchPoint();
  }

  nextSearchPoint() {
    const sp = this.searchPoints.shift();
    if (!sp) { this.path = null; this.waitT = rand(1.5, 3); return false; }
    this.currentSP = sp;
    if (sp.spot) this.goTo(sp.spot.checkPos, 'walk');
    else this.goTo(sp.node, 'walk');
    return true;
  }

  pickPatrolTarget() {
    const g = this.game;
    const now = g.time;
    // candidate rooms: accessible ones; prefer rooms not visited recently, and (with aggression) near the player
    const p = g.player;
    let best = null, bestScore = -Infinity;
    for (const r of ROOMS) {
      if (r.id.startsWith('stair')) continue;
      const n = g.nav.randomNodeIn(r.rect, LEVELS[r.level]);
      if (!n) continue;
      const last = this.roomVisit.get(r.id) ?? -999;
      const since = Math.min(120, now - last);
      const dPlayer = Math.hypot(n.x - p.pos.x, n.z - p.pos.z) + Math.abs(n.y - p.pos.y) * 3;
      const dSelf = Math.hypot(n.x - this.pos.x, n.z - this.pos.z) + Math.abs(n.y - this.pos.y) * 3;
      let score = since * 0.5 - dSelf * 0.3 + Math.random() * 25;
      score += (this.aggro * 4) * (1 / (1 + dPlayer * 0.12)) * 10;
      if (this.restT > 0) score += dPlayer * 2; // calm phase: stay away from the player
      if (score > bestScore && this.reachable(n)) { bestScore = score; best = { room: r, node: n }; }
    }
    return best;
  }

  reachable(n) {
    const from = this.game.nav.nearest(this.pos, 2.5);
    if (!from) return false;
    const p = this.game.nav.path(from, n, { canPass: this.canPass });
    return !!p;
  }

  bangDoor(door) {
    if (this.state !== 'bang') {
      this.bangTarget = door;
      this.bangT = 0;
      this.bangDur = rand(7, 12) * this.diff.lockTime / (1 + this.aggro * 0.15);
      this.setState('bang', 'porte verrouillée');
    }
  }

  // ------------------------------------------------------------------ main update
  update(dt) {
    const g = this.game;
    const p = g.player;
    this.stateT += dt;
    this.flinchCD -= dt;
    this.attackCD -= dt;
    this.restT -= dt;
    this.moved = 0;
    this.speed = 0;
    const toPlayer = p.pos.clone().sub(this.pos);
    this.distToPlayer = Math.hypot(toPlayer.x, toPlayer.z) + Math.abs(toPlayer.y) * 2;

    // is the player looking at her?
    this.seenByPlayer = g.isVisibleToPlayer(this.eye.clone().setY(this.pos.y + 0.6));
    this.unseenT = this.seenByPlayer ? 0 : this.unseenT + dt;

    if (this.state !== 'dormant' && this.active) this.perceive(dt);
    this.think(dt);
    this.animate(dt);
    this.sounds(dt);
    this.syncRoot();
    // room bookkeeping
    const r = this.room;
    if (r) this.roomVisit.set(r.id, g.time);
  }

  perceive(dt) {
    const g = this.game, p = g.player;
    // vision
    const vis = this.computeVisibility();
    this.seeing = vis;
    if (vis > 0.02) {
      const close = this.distToPlayer < 2.2 && vis > 0.25;
      const rate = (1.8 + this.aggro * 0.35) * vis * (close ? 6 : 1) * (this.state === 'search' || this.state === 'investigate' ? 1.6 : 1);
      this.suspicion = Math.min(1.5, this.suspicion + rate * dt);
      if (this.suspicion >= 1) {
        if (this.state !== 'chase' && this.state !== 'attack' && this.state !== 'taunt') {
          this.setState('chase', vis > 0.5 ? 'te voit' : 'silhouette aperçue');
          g.onSpotted(this.reason);
        }
        this.lastKnown = p.pos.clone();
        this.lastSeenT = g.time;
        this.playerVel = p.vel.clone();
        if (p.hidden && vis > 0) this.knownHide = p.hidden;
      } else if (this.suspicion > 0.35 && ['patrol', 'stalk', 'ambush', 'suspicious'].includes(this.state)) {
        this.lastKnown = p.pos.clone();
        this.beginInvestigate('walk', 'mouvement aperçu');
      }
    } else {
      const decay = this.state === 'chase' ? 0.05 : 0.12;
      this.suspicion = Math.max(0, this.suspicion - dt * decay);
    }
    // the player hides while she watches
    if (p.justHid && vis > 0.15) { this.knownHide = p.justHid; }
    // flashlight in her face
    if (p.flashOn && this.flinchCD <= 0 && this.distToPlayer < 7) {
      const faceP = this.eye;
      if (p.beamHits(faceP, 9) > 0.15 && !g.world.lineBlocked(p.eyePos, faceP, (b) => b.kind !== 'prop')) {
        this.flinchCD = 9;
        this.lastKnown = p.pos.clone();
        this.lastSeenT = g.time;
        this.suspicion = 1.2;
        this.afterFlinch = 'chase';
        this.setState('flinch', 'lumière dans les yeux');
        g.audio.dollShriek(this.eye);
      }
    }
    // clues: blood drops, doors she remembers closed, lights switched on
    this.clueT = (this.clueT || 0) - dt;
    if (this.clueT <= 0 && ['patrol', 'search', 'ambush'].includes(this.state)) {
      this.clueT = 0.5;
      this.lookForClues();
    }
  }

  lookForClues() {
    const g = this.game;
    const eye = this.eye;
    const fwd = V(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    const visible = (pt, maxD) => {
      const d = pt.distanceTo(eye);
      if (d > maxD) return false;
      const to = pt.clone().sub(eye).setY(0).normalize();
      if (to.dot(fwd) < 0.3) return false;
      return !g.world.lineBlocked(eye, pt, (b) => b.kind !== 'prop');
    };
    if (g.settings.bloodTrail) {
      let freshest = null;
      for (const b of g.bloodDrops) {
        if (b.seen || g.time - b.t > 90) continue;
        if (visible(b.pos.clone().setY(b.pos.y + 0.05), 6)) { if (!freshest || b.t > freshest.t) freshest = b; }
      }
      if (freshest) {
        freshest.seen = true;
        // follow the trail: the most recent drop near this one
        const next = g.bloodDrops.filter((b) => b.t > freshest.t).sort((a, b) => a.t - b.t)[0] || freshest;
        this.lastKnown = next.pos.clone();
        this.beginInvestigate('walk', 'traces de sang');
        return;
      }
    }
    for (const d of g.house.doors) {
      if (d.level !== this.level || d.style === 'hidden') continue;
      const remembered = this.doorMemory.get(d.id);
      const isOpen = d.open > 0.5;
      if (!visible(d.center, 10)) continue;
      if (remembered !== undefined && remembered !== isOpen && d.lastActor === 'player' && g.time - d.lastActT < 60) {
        this.memorizeDoor(d);
        this.lastKnown = d.center.clone().setY(d.baseY);
        this.beginInvestigate('walk', 'porte déplacée');
        return;
      }
      this.memorizeDoor(d);
    }
    const r = this.room;
    if (r && g.lights.power) {
      const lit = g.content.lights.some((l) => l.room === r.id && l.needsPower && l.on && !l.broken);
      const remembered = this.lightMemory.get(r.id);
      if (remembered === false && lit && g.lastSwitch && g.lastSwitch.room === r.id && g.time - g.lastSwitch.t < 90) {
        this.lightMemory.set(r.id, lit);
        this.lastKnown = g.lastSwitch.pos.clone();
        this.beginInvestigate('walk', 'lumière allumée');
        return;
      }
      this.lightMemory.set(r.id, lit);
    }
  }

  think(dt) {
    const g = this.game, p = g.player;
    const st = this.state;
    const A = this.anim.state;
    A.action = this.doorWait ? 'reach' : null;
    A.lookMode = 'normal';
    A.eye = 'empty';
    A.jaw = 0;
    A.tilt = 0;
    A.lookAt = null;
    A.glow = 0.45;
    switch (st) {
      case 'dormant':
        A.action = 'sit';
        A.stutter = 0;
        if (this.dormantLook) { A.lookAt = p.eyePos.clone(); A.lookMode = 'creepy'; A.eye = 'aware'; }
        break;

      case 'patrol': {
        A.stutter = 0.55;
        if (!this.path) {
          if (this.waitT > 0) {
            this.waitT -= dt;
            A.lookAt = this.eye.add(V(Math.sin(this.yaw + Math.sin(g.time * 0.8) * 1.3), 0, Math.cos(this.yaw + Math.sin(g.time * 0.8) * 1.3)));
            A.tilt = 0.3;
            // occasionally peek into a hiding spot of the room
            if (this.waitT <= 0 && chance(0.15 * this.aggro)) {
              const r = this.room;
              const spot = r && g.content.hides.find((h) => h.room === r.id && (!this.checkedSpots.get(h.id) || g.time - this.checkedSpots.get(h.id) > 60));
              if (spot) { this.currentSP = { spot }; this.goTo(spot.checkPos, 'walk'); this.setState('search', 'ronde'); this.searchEnd = g.time + 12; this.searchPoints = []; }
            }
          } else {
            // ambush instead of patrolling when aggressive enough and she knows the player's habits
            if (this.aggro >= 2.5 && chance(0.25) && this.planAmbush()) break;
            const t = this.pickPatrolTarget();
            if (t) this.goTo(t.node, this.aggro >= 3 ? 'sneak' : 'walk');
            this.waitT = rand(2, 5);
          }
        } else if (this.followPath(dt)) {
          this.waitT = rand(2, 5);
        }
        break;
      }

      case 'suspicious': {
        // stop, turn the head toward the noise, listen
        A.action = 'listen';
        A.stutter = 0.2;
        A.lookAt = this.lookToward || this.lastHeard?.pos;
        A.lookMode = 'creepy';
        A.eye = 'aware';
        if (A.lookAt) this.faceTo(A.lookAt, dt, 2);
        if (this.stateT > rand(1.4, 2.2)) {
          if (this.suspicion > 0.25 && this.lastHeard) { this.lastKnown = this.lastHeard.pos; this.beginInvestigate('walk', 'vérifie le bruit'); }
          else this.setState('patrol', 'rien');
        }
        break;
      }

      case 'investigate': {
        A.stutter = 0.3;
        A.eye = 'aware';
        A.glow = 0.6;
        A.lookAt = this.lastKnown ? this.lastKnown.clone().setY(this.lastKnown.y + 1) : null;
        if (this.followPath(dt) || !this.path) this.beginSearch(this.lastKnown || this.pos, 'fouille la zone');
        break;
      }

      case 'search': {
        A.stutter = 0.5;
        A.eye = 'aware';
        A.glow = 0.55;
        if (this.checkingSpot) { this.updateCheckSpot(dt); break; }
        if (this.path) {
          if (this.followPath(dt)) {
            if (this.currentSP && this.currentSP.spot) { this.startCheckSpot(this.currentSP.spot); break; }
            this.waitT = rand(1.5, 3);
          }
        } else if (this.waitT > 0) {
          this.waitT -= dt;
          A.action = 'search';
          A.lookAt = this.eye.add(V(Math.sin(g.time * 1.3) * 2, -0.4, Math.cos(g.time * 1.3) * 2));
          if (chance(dt * 0.3)) g.audio.dollWhisper(this.eye);
        } else if (!this.nextSearchPoint()) {
          // nothing left
        }
        if (g.time > this.searchEnd && !this.checkingSpot) {
          this.knownHide = null;
          this.suspectSpot = null;
          this.suspicion = 0.2;
          this.restT = rand(25, 45) / (1 + this.aggro * 0.2);
          this.setState('patrol', 'abandonne');
          this.path = null;
          this.waitT = 1;
        }
        break;
      }

      case 'chase': {
        A.stutter = 0;
        A.eye = 'aware';
        A.lookAt = p.eyePos.clone();
        A.lookMode = 'creepy';
        A.glow = 1;
        A.jaw = 0.35;
        const sees = this.seeing > 0.05;
        if (sees) { this.lastKnown = p.pos.clone(); this.lastSeenT = g.time; }
        // player hid in front of her
        if (p.hidden && this.knownHide === p.hidden) {
          this.startCheckSpot(p.hidden, true);
          this.setState('search', 'tu t\'es caché sous ses yeux');
          this.searchEnd = g.time + 15;
          break;
        }
        const lostFor = g.time - this.lastSeenT;
        // repath regularly toward the player (or the last known position)
        this.repathT = (this.repathT || 0) - dt;
        if (this.repathT <= 0 || !this.path) {
          this.repathT = 0.35;
          let target = this.lastKnown || p.pos;
          if (lostFor > 0.6 && this.playerVel) target = target.clone().addScaledVector(this.playerVel, 1.0); // anticipate
          this.goTo(target, 'run');
        }
        this.followPath(dt);
        if (sees && this.distToPlayer < 1.15 && this.attackCD <= 0 && !p.hidden) {
          this.setState('attack', 'à portée');
          this.attackHit = false;
        } else if (lostFor > 2.2 && (!this.path || this.distToPlayer > 3)) {
          // lost the target: search where she last saw you
          this.beginSearch(this.lastKnown || this.pos, 'cible perdue');
          g.onLostTarget();
        }
        break;
      }

      case 'attack': {
        A.action = 'attack';
        A.stutter = 0;
        A.eye = 'aware';
        A.jaw = 1;
        A.glow = 1.4;
        A.lookAt = p.eyePos.clone();
        A.lookMode = 'creepy';
        this.faceTo(p.pos, dt, 14);
        if (!this.attackHit && this.stateT > 0.45) {
          this.attackHit = true;
          if (this.distToPlayer < 1.6 && !p.hidden && !g.world.lineBlocked(this.eye, p.eyePos, (b) => b.kind !== 'prop')) {
            g.dollHitsPlayer(this);
          }
        }
        if (this.stateT > 0.9) {
          this.attackCD = 2.5;
          if (!p.dead) { this.setState('taunt', 'te laisse fuir'); }
        }
        break;
      }

      case 'taunt': {
        // after a hit: she stands still, tilts her head and giggles, giving the player a head start
        A.action = 'stare';
        A.stutter = 0.7;
        A.eye = 'aware';
        A.lookAt = p.eyePos.clone();
        A.lookMode = 'creepy';
        A.tilt = 0.6;
        A.jaw = 0.2;
        if (this.stateT < 0.05) g.audio.giggle(this.eye);
        if (this.stateT > 2.6) { this.setState('chase', 'reprend la chasse'); this.lastSeenT = g.time; }
        break;
      }

      case 'checkHide':
        this.updateCheckSpot(dt);
        break;

      case 'bang': {
        A.action = 'bang';
        A.stutter = 0.1;
        A.eye = 'aware';
        A.glow = 1;
        A.jaw = 0.5;
        const d = this.bangTarget;
        this.faceTo(d.center, dt, 6);
        this.bangT += dt;
        this.bangSnd = (this.bangSnd || 0) - dt;
        if (this.bangSnd <= 0) { this.bangSnd = rand(0.35, 0.7); g.audio.doorBang(d.center); g.shakeIfNear(d.center, 0.25); }
        if (this.bangT > this.bangDur) {
          d.forced = true;
          d.lockedInside = false;
          g.openDoor(d, true, this.pos, true);
          g.audio.doorBreak(d.center);
          this.setState(this.lastKnown ? 'chase' : 'search', 'a forcé la porte');
          if (this.state === 'search') this.beginSearch(d.center);
          this.lastSeenT = g.time;
          this.path = null;
        }
        break;
      }

      case 'flinch':
        A.action = 'flinch';
        A.stutter = 0;
        A.eye = 'aware';
        A.jaw = 0.8;
        A.glow = 1.5;
        if (this.stateT > 1.3) { this.setState(this.afterFlinch || 'chase', 'se remet de la lumière'); this.lastSeenT = g.time; }
        break;

      case 'ambush': {
        A.stutter = 0.7;
        if (this.path) { this.followPath(dt); break; }
        // crouched low in the dark, perfectly still, until she sees you
        A.action = this.seenByPlayer ? 'stare' : 'search';
        A.eye = this.seeing > 0 ? 'aware' : 'empty';
        A.lookAt = this.ambushLook || null;
        A.tilt = 0.4;
        A.glow = 0.15;
        if (this.stateT > this.ambushDur) { this.setState('patrol', 'fin d\'embuscade'); this.waitT = 0; }
        break;
      }

      case 'stalk': {
        // a scripted "presence": she goes where the player can see her, watches, then leaves
        A.stutter = 0.8;
        A.lookAt = p.eyePos.clone();
        A.lookMode = 'creepy';
        A.eye = 'aware';
        A.tilt = 0.5;
        if (this.path) { this.followPath(dt); this.stalkWatch = 0; break; }
        A.action = 'stare';
        this.faceTo(p.pos, dt, 2);
        this.stalkWatch = (this.stalkWatch || 0) + dt;
        const tooClose = this.distToPlayer < 6;
        if (this.stalkWatch > (this.seenByPlayer ? 2.5 : 9) || tooClose) {
          this.restT = 30;
          this.setState('retreat', 'disparaît');
          const t = this.pickPatrolTarget();
          if (t) this.goTo(t.node, 'fast');
        }
        break;
      }

      case 'retreat':
        A.stutter = 0.6;
        if (this.followPath(dt) || !this.path) { this.setState('patrol', 'reprend sa ronde'); this.waitT = rand(3, 6); }
        break;
      default:
        break;
    }
  }

  planAmbush() {
    const g = this.game;
    // most used door by the player, not in his current view and not too close to him
    let best = null, bestN = 2;
    for (const [id, n] of this.heat) {
      const d = g.house.doors.find((x) => x.id === id);
      if (!d || d.locked || d.boarded) continue;
      if (d.center.distanceTo(g.player.pos) < 8) continue;
      if (n > bestN) { bestN = n; best = d; }
    }
    if (!best) return false;
    // hide in a dark corner next to the door
    const node = g.nav.nearest(best.center.clone().add(V(rand(-1.5, 1.5), -1, rand(-1.5, 1.5))), 2);
    if (!node || !this.goTo(node, 'sneak')) return false;
    this.ambushLook = best.center.clone();
    this.ambushDur = rand(20, 40);
    this.setState('ambush', 'guette un passage fréquent');
    return true;
  }

  // director: show herself at a distance
  requestStalk(pos) {
    if (!['patrol', 'retreat'].includes(this.state)) return false;
    if (!this.goTo(pos, 'fast')) return false;
    this.setState('stalk', 'apparition');
    return true;
  }

  startCheckSpot(spot, sure = false) {
    this.checkingSpot = { spot, t: 0, sure, phase: 'approach' };
    this.goTo(spot.checkPos, 'walk');
    if (this.state !== 'search') this.setState('checkHide', 'vérifie une cachette');
  }

  updateCheckSpot(dt) {
    const g = this.game, p = g.player;
    const c = this.checkingSpot;
    const A = this.anim.state;
    A.eye = 'aware';
    A.glow = 0.8;
    if (!c) { this.setState('search'); return; }
    if (c.phase === 'approach') {
      if (this.path && !this.followPath(dt)) return;
      c.phase = 'open';
      c.t = 0;
    }
    c.t += dt;
    this.faceTo(c.spot.pos, dt, 6);
    A.lookAt = c.spot.pos.clone().setY(c.spot.pos.y + (c.spot.kind === 'bed' ? 0.2 : 1.3));
    A.lookMode = 'creepy';
    if (c.spot.kind === 'bed') A.action = 'lookUnder';
    else A.action = 'reach';
    if (c.phase === 'open' && c.t > 0.7) {
      c.phase = 'look';
      if (c.spot.kind === 'wardrobe') g.openHideDoors(c.spot, true);
      g.audio.cabinet(c.spot.pos, true);
    }
    if (c.phase === 'look' && c.t > 1.4) {
      c.phase = 'done';
      this.checkedSpots.set(c.spot.id, g.time);
      if (p.hidden === c.spot) {
        // found!
        this.checkingSpot = null;
        this.knownHide = null;
        g.playerFoundInHiding(this, c.spot);
        this.setState('attack', 'cachette découverte');
        this.attackHit = false;
        return;
      }
    }
    if (c.phase === 'done' && c.t > 2.2) {
      if (c.spot.kind === 'wardrobe' && chance(0.5)) g.openHideDoors(c.spot, false);
      this.checkingSpot = null;
      this.currentSP = null;
      if (this.state === 'checkHide') this.setState('search');
      this.waitT = rand(0.5, 1.5);
    }
  }

  animate(dt) {
    const A = this.anim.state;
    A.moved = this.moved;
    const sp = this.speed;
    A.loco = sp < 0.05 ? 'idle' : this.speedMode === 'run' ? 'run' : this.speedMode === 'sneak' ? 'sneak' : 'walk';
    if (this.state === 'dormant' || this.state === 'attack' || this.state === 'flinch') A.loco = 'idle';
    this.anim.update(dt, this.yaw);
  }

  sounds(dt) {
    const g = this.game;
    if (this.state === 'dormant') return;
    const fast = this.unseenT > 2 && !this.seenByPlayer && this.distToPlayer > 11;
    if (this.moved > 0 && !fast) {
      this.stepAcc += this.moved;
      const stride = this.speedMode === 'run' ? 0.55 : 0.37;
      if (this.stepAcc > stride) {
        this.stepAcc = 0;
        const surface = g.surfaceAt(this.pos);
        g.audio.dollStep(this.pos, this.speedMode === 'run' ? 1 : this.speedMode === 'sneak' ? 0.25 : 0.55, surface);
      }
    }
    // mechanical joint creaks, giggles, whispers: her signature, irregular so she can't be located precisely
    this.creakT -= dt;
    if (this.creakT <= 0) {
      this.creakT = rand(2.5, 7) / (this.state === 'chase' ? 2.5 : 1);
      if (this.distToPlayer < 18) g.audio.dollJoint(this.eye, this.state === 'chase' ? 1 : 0.6);
    }
    this.giggleT -= dt;
    if (this.giggleT <= 0) {
      this.giggleT = rand(14, 35);
      if (this.distToPlayer < 16 && this.state !== 'ambush') {
        if (this.state === 'patrol') g.audio.dollHum(this.eye);
        else if (this.state === 'search') g.audio.dollWhisper(this.eye);
        else g.audio.giggle(this.eye);
      }
    }
  }

  // ------------------------------------------------------------------ save
  serialize() {
    return { pos: this.pos.toArray(), yaw: this.yaw, state: this.state === 'attack' || this.state === 'taunt' ? 'search' : this.state, active: this.active, aggro: this.aggro, suspicion: this.suspicion };
  }

  restore(s) {
    this.place(new THREE.Vector3().fromArray(s.pos), s.yaw);
    this.active = s.active;
    this.aggro = s.aggro;
    this.suspicion = 0;
    this.path = null;
    this.checkingSpot = null;
    this.state = 'none';
    this.setState(s.state === 'dormant' ? 'dormant' : 'patrol', 'chargement');
    this.waitT = 2;
  }
}

function kindLabel(k) {
  return { step: 'pas', run: 'course', door: 'porte', breath: 'respiration', gasp: 'souffle', throw: 'objet lancé', prop: 'objet renversé', music: 'boîte à musique', drawer: 'tiroir', cabinet: 'placard', window: 'fenêtre', item: 'objet', creak: 'parquet', faucet: 'robinet', tv: 'télévision', radio: 'radio', toy: 'jouet', glass: 'verre brisé', hide: 'cachette', switch: 'interrupteur', boards: 'planches arrachées' }[k] || k;
}
export { kindLabel };
