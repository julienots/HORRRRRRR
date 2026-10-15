// Game orchestrator: world, player, doll, interactions, story/acts, director, save/load, endings.
import * as THREE from 'three';
import { settings, QUALITY, DIFFICULTY, saveSettings } from '../core/settings.js';
import { Input } from '../core/input.js';
import { writeSave, readSave, latestSave } from '../core/save.js';
import { clamp, rand, damp } from '../core/math.js';
import { configureTextures, canvasTexture } from '../render/textures.js';
import { createRenderer, createComposer } from '../render/renderer.js';
import { LightManager } from '../render/lights.js';
import { mergeStatic } from '../render/optimize.js';
import { DustParticles } from '../render/particles.js';
import { CollisionWorld } from '../world/collision.js';
import { buildHouse } from '../world/builder.js';
import { furnish } from '../world/furnish.js';
import { NavGrid } from '../world/nav.js';
import { LEVELS, roomAt, roomById, levelOfY } from '../world/layout.js';
import { Player } from '../actors/player.js';
import { Doll } from '../actors/doll.js';
import { AudioEngine } from '../audio/audio.js';
import { UI, $, keyName } from '../ui/ui.js';
import { setupTouch } from '../ui/touch.js';
import { Director } from './director.js';
import { ITEMS } from './items.js';
import { ACTS, OBJECTIVES, DOCUMENTS, SUBTITLES, ENDINGS } from './story.js';

class Events {
  constructor() { this.h = {}; this.log = []; }
  on(n, f) { (this.h[n] ||= []).push(f); }
  emit(n, d) { this.log.push({ n, d }); if (this.log.length > 200) this.log.shift(); for (const f of this.h[n] || []) f(d); }
}

const SURFACE = {
  floorOak: 'wood', floorDark: 'wood', floorNursery: 'wood', floorAttic: 'wood', tileKitchen: 'tile', tileBath: 'tile',
  concrete: 'concrete', concreteWet: 'concrete',
};

export class Game {
  constructor() {
    this.state = 'loading';
    this.time = 0;
    this.events = new Events();
    this.settings = settings;
    this.inventory = {};
    this.flags = {};
    this.docsRead = [];
    this.clues = [];
    this.objectiveLog = [];
    this.picked = new Set();
    this.bloodDrops = [];
    this.footprints = [];
    this.visitedRooms = new Set();
    this.act = 1;
    this.lightning = 0;
    this.applianceRun = 0;
    this.thrown = [];
    this.noiseLog = [];
    this.debugOn = false;
    this.stats = { start: 0, hits: 0, hides: 0, spotted: 0 };
  }

  // =================================================================== boot
  async init(progress = () => {}) {
    const q = (this.quality = QUALITY[settings.quality] || QUALITY.medium);
    configureTextures(q.tex, q.aniso);
    const canvas = document.getElementById('game');
    this.renderer = createRenderer(canvas, q);
    this.renderer.info.autoReset = false;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x000000);
    this.scene.fog = new THREE.FogExp2(0x050505, 0.045);
    this.camera = new THREE.PerspectiveCamera(settings.fov, window.innerWidth / window.innerHeight, 0.05, 80);
    this.scene.add(this.camera);
    this.input = new Input(canvas);
    this.audio = new AudioEngine();
    this.ui = new UI(this);
    this.audio.onSubtitle = (t, d) => this.ui.subtitle(t, d);
    await progress('Construction de la maison…');
    this.world = new CollisionWorld();
    this.house = buildHouse(this.scene, this.world);
    await progress('Aménagement des pièces…');
    this.content = furnish(this.house.levels, this.world);
    for (const k of Object.keys(this.house.levels)) mergeStatic(this.house.levels[k]);
    this.audio.world = this.world;
    await progress('Éclairage…');
    this.lights = new LightManager(this.scene, this.content.lights, q);
    this.dust = new DustParticles(this.scene, q.dust);
    await progress('Navigation de la poupée…');
    this.nav = new NavGrid(this.world, this.house.doors);
    await progress('Elle se réveille…');
    this.player = new Player(this);
    this.doll = new Doll(this);
    this.director = new Director(this);
    const post = createComposer(this.renderer, this.scene, this.camera, q);
    this.post = post;
    // mirror reflection camera also sees layer 2 (silhouette only visible in the mirror)
    const refl = this.content.fixtures.mirror.reflector;
    refl.getReflectionCamera(this.camera).layers.enable(2);
    this.registerDoorsAndWindows();
    // tell the player why the doll reacts (readable stealth)
    this.events.on('doll:state', ({ state, reason }) => {
      if (this.state !== 'playing' || !this.doll.active) return;
      if ((state === 'investigate' || state === 'suspicious') && this.doll.distToPlayer < 20 && /bruit|lumière|porte|sang|mouvement/.test(reason)) {
        this.ui.subtitle(`[Elle a remarqué quelque chose : ${reason}]`, 2.5);
      }
      if (state === 'bang') this.ui.subtitle('[Elle tambourine contre la porte verrouillée]', 3);
      if (state === 'checkHide' || (state === 'search' && reason === 'tu t\'es caché sous ses yeux')) this.ui.subtitle('[Elle t\'a vu te cacher]', 2.5);
    });
    window.addEventListener('resize', () => this.onResize());
    document.addEventListener('keydown', (e) => this.onKey(e));
    document.addEventListener('pointerlockchange', () => {
      if (!this.input.locked && this.state === 'playing' && !this.testMode) this.pause();
    });
    setupTouch(this);
    this.applySettings();
    // pre-compile shaders
    this.renderer.compile(this.scene, this.camera);
    this.state = 'menu';
  }

  registerDoorsAndWindows() {
    for (const d of this.house.doors) {
      const e = { id: 'door_' + d.id, kind: 'door', obj: d.pivot, door: d, level: d.level, enabled: true };
      this.content.interactables.push(e);
      if (d.planks) this.content.interactables.push({ id: 'planks_' + d.id, kind: 'door', obj: d.planks, door: d, level: d.level, enabled: true });
    }
    for (const w of this.house.windows) {
      if (w.roller) continue;
      this.content.interactables.push({ id: 'win_' + (w.interactive || Math.random()), kind: 'window', obj: w.group, win: w, level: w.level, enabled: true });
    }
  }

  onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.post.resize();
  }

  applySettings(key) {
    const h = this.post?.horror?.uniforms;
    if (h) {
      h.grain.value = settings.filmGrain ? 0.045 : 0;
      h.chroma.value = settings.chromatic ? 1 : 0;
      h.exposure.value = settings.brightness;
    }
    if (this.camera) { this.camera.fov = settings.fov; this.camera.updateProjectionMatrix(); }
    this.audio?.applyVolumes();
    if (key === 'quality') this.ui.toast('La qualité sera appliquée au prochain chargement de partie.');
  }

  get diff() { return DIFFICULTY[this.difficulty || 'normal']; }
  levelOf(y) { return levelOfY(y); }
  get playerRoom() { return this.player ? roomAt(this.player.pos.x, this.player.pos.y + 0.2, this.player.pos.z) : null; }

  surfaceAt(p) {
    const r = roomAt(p.x, p.y + 0.2, p.z);
    if (!r) return 'wood';
    // rugs: quieter
    return SURFACE[r.floor] || 'wood';
  }

  // =================================================================== game flow
  newGame(diff) {
    if (this.started) { location.href = location.pathname + '?new=' + diff; return; }
    this.started = true;
    this.difficulty = diff;
    this.audio.init();
    this.resetWorldState();
    const sp = this.content.fixtures.spawn;
    this.player.spawn(sp.pos, 0);
    // the doll sits on the chair in the gallery, lifeless
    const seat = this.content.fixtures.dollSeat;
    this.doll.place(seat.pos.clone().setY(LEVELS.U + 0.47 - 0.5 + 0.03), seat.yaw);
    this.doll.setState('dormant');
    this.doll.active = false;
    this.stats.start = performance.now();
    this.startPlaying();
    this.wakeUp();
  }

  continueGame() {
    const s = latestSave();
    if (!s) return;
    if (this.started) { location.href = location.pathname + '?load=' + s.slot; return; }
    this.started = true;
    this.audio.init();
    this.applySave(s.data);
    this.startPlaying();
    this.ui.toast('Partie chargée.');
  }

  loadGame() {
    const s = latestSave();
    if (!s) { this.ui.toast('Aucune sauvegarde.'); return; }
    location.href = location.pathname + '?load=' + s.slot;
  }

  quitToMenu() {
    if (this.started) { location.href = location.pathname; return; }
    this.ui.showMenu(!!latestSave());
  }

  startPlaying() {
    this.ui.show('#menu', false);
    this.ui.show('#hud');
    this.state = 'playing';
    if (!this.input.touch) this.input.requestLock();
    this.updateObjective(true);
  }

  pause() {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.input.releaseLock();
    this.ui.show('#pause');
    const chasing = this.doll.state === 'chase' || this.doll.state === 'attack';
    $('#pause [data-act=save]').disabled = chasing || this.player.dead;
    $('#pausenote').textContent = chasing ? 'Impossible de sauvegarder pendant une poursuite.' : '';
  }

  resume() {
    for (const s of ['#pause', '#options', '#controls', '#inventory', '#journal', '#clicktoplay']) this.ui.show(s, false);
    this.state = 'playing';
    if (!this.input.touch) this.input.requestLock();
  }

  togglePanel(name) {
    const id = '#' + name;
    if (this.state === 'panel' && this.ui.openPanel === name) {
      this.ui.show(id, false);
      this.ui.openPanel = null;
      this.resume();
      return;
    }
    if (this.state !== 'playing') return;
    this.state = 'panel';
    this.ui.openPanel = name;
    this.input.releaseLock();
    this.ui.show(id);
    if (name === 'inventory') this.ui.renderInventory();
    else this.ui.renderJournal('obj');
  }

  onKey(e) {
    if (this.state === 'loading' || this.state === 'menu') return;
    if (e.code === 'Escape') {
      if (this.ui.readerOpen) { this.ui.closeDoc(); return; }
      if (this.state === 'playing') { this.pause(); return; }
      if (this.state === 'panel') { this.togglePanel(this.ui.openPanel); return; }
      if (this.state === 'paused') { this.resume(); return; }
    }
    if (e.code === 'F3') { this.debugOn = !this.debugOn; if (!this.debugOn) this.ui.debug(''); e.preventDefault(); }
    if (this.ui.readerOpen && (e.code === settings.bindings.interact)) { this.ui.closeDoc(); return; }
    if (e.code === settings.bindings.inventory && (this.state === 'playing' || (this.state === 'panel' && this.ui.openPanel === 'inventory'))) { this.togglePanel('inventory'); e.preventDefault(); }
    if (e.code === settings.bindings.journal && (this.state === 'playing' || (this.state === 'panel' && this.ui.openPanel === 'journal'))) this.togglePanel('journal');
  }

  wakeUp() {
    const p = this.player;
    p.locked = true;
    p.wake = 1;
    p.pitch = -1.2;
    this.ui.actCard(ACTS[0].title, ACTS[0].sub);
    setTimeout(() => this.ui.subtitle(SUBTITLES.wake, 4), 2500);
  }

  // =================================================================== world state
  resetWorldState() {
    this.inventory = {};
    this.flags = {};
    this.act = 1;
    this.lights.setPower(false);
  }

  setAct(n) {
    if (n <= this.act) return;
    this.act = n;
    const a = ACTS[n - 1];
    this.ui.actCard(a.title, a.sub);
    this.doll.aggro = [0, 1, 2, 2.6, 3.2, 4.2][n - 1] * this.diff.aggro;
    this.events.emit('act', n);
    this.updateObjective(true);
    if (this.state === 'playing') this.saveGame(false);
  }

  currentObjective() {
    const f = this.flags, inv = this.inventory;
    if (!f.flashlight) return OBJECTIVES.wake;
    if (!f.leftGuest) return OBJECTIVES.leaveRoom;
    if (f.power) {
      if (inv.heart && !f.heartBurned && inv.lighter !== undefined) return OBJECTIVES.escape + ' ' + OBJECTIVES.burn;
      if (!inv.frontKey) return OBJECTIVES.ritual;
      return OBJECTIVES.escape;
    }
    if (f.cellarOpen) return f.ritualOpen ? OBJECTIVES.power : OBJECTIVES.power + ' Et ouvrir la pièce scellée (clé rouillée).';
    if (inv.cellarKey) return OBJECTIVES.cellar;
    if (f.atticOpen && !f.secretOpen) return OBJECTIVES.secret;
    if (f.officeOpen && !f.atticOpen) return OBJECTIVES.attic;
    if (inv.crowbar && !f.officeOpen) return OBJECTIVES.office;
    if (f.garageOpen && !inv.crowbar) return OBJECTIVES.openGarage;
    if (inv.garageKey && !f.garageOpen) return 'Ouvrir le garage (couloir de service, rez-de-chaussée).';
    if (f.frontSeen) return OBJECTIVES.garage;
    return OBJECTIVES.findExit;
  }

  updateObjective(show = false) {
    const o = this.currentObjective();
    if (this.objectiveLog[this.objectiveLog.length - 1] !== o) { this.objectiveLog.push(o); show = true; }
    if (show) this.ui.objective(o);
  }

  addClue(t) { if (!this.clues.includes(t)) { this.clues.push(t); } }

  // =================================================================== helpers used by actors
  noise(pos, loud, kind) {
    this.noiseLog.push({ t: +this.time.toFixed(2), kind, loud: +loud.toFixed(2), pos: pos.toArray().map((v) => +v.toFixed(1)) });
    if (this.noiseLog.length > 60) this.noiseLog.shift();
    this.doll.hear(pos, loud, kind);
  }

  isVisibleToPlayer(p) {
    const cam = this.camera;
    const v = p.clone().project(cam);
    if (v.z > 1 || v.z < -1 || Math.abs(v.x) > 1 || Math.abs(v.y) > 1) return false;
    if (cam.position.distanceTo(p) > 30) return false;
    return !this.world.lineBlocked(cam.position, p, (b) => b.kind !== 'prop');
  }

  openDoor(d, open, actorPos, forced = false, slam = false) {
    const target = open ? 1 : 0;
    if (d.target === target && !forced) return;
    d.target = target;
    d.speed = slam ? 4 : forced ? 3 : 1.4;
    d.lastActor = actorPos && actorPos === this.player.pos ? 'player' : actorPos ? 'doll' : 'house';
    d.lastActT = this.time;
    if (!slam) this.audio.door(d.center, open);
  }

  openHideDoors(spot, open) {
    for (const cd of spot.doors) cd.target = open ? 1 : 0;
  }

  shakeIfNear(pos, k) {
    const d = pos.distanceTo(this.player.pos);
    if (d < 6) this.player.shake = Math.max(this.player.shake, k * (1 - d / 6) * 2);
  }

  spawnBloodDrop(pos) {
    const gr = this.world.groundAt(pos.x, pos.z, pos.y + 0.2);
    if (!gr) return;
    if (!this._bloodMat) {
      this._bloodTex = canvasTexture(64, 64, (c) => {
        c.fillStyle = 'rgba(70,5,5,0.95)';
        c.beginPath(); c.arc(32, 32, 14, 0, Math.PI * 2); c.fill();
        for (let i = 0; i < 6; i++) { c.beginPath(); c.arc(32 + (Math.random() - 0.5) * 40, 32 + (Math.random() - 0.5) * 40, 2 + Math.random() * 4, 0, Math.PI * 2); c.fill(); }
      });
      this._bloodMat = new THREE.MeshStandardMaterial({ map: this._bloodTex, transparent: true, depthWrite: false, roughness: 0.2, polygonOffset: true, polygonOffsetFactor: -3 });
    }
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.16), this._bloodMat);
    m.rotation.x = -Math.PI / 2;
    m.rotation.z = Math.random() * 6;
    m.position.set(pos.x + rand(-0.15, 0.15), gr.y + 0.006, pos.z + rand(-0.15, 0.15));
    this.scene.add(m);
    this.bloodDrops.push({ pos: m.position.clone(), t: this.time, mesh: m, seen: false });
    if (this.bloodDrops.length > 70) { const o = this.bloodDrops.shift(); this.scene.remove(o.mesh); }
  }

  spawnFootprints(pos, yaw) {
    if (!this._fpMat) {
      const tex = canvasTexture(128, 256, (c) => {
        c.fillStyle = 'rgba(25,18,12,0.8)';
        for (let i = 0; i < 6; i++) {
          const y = 240 - i * 42, x = 64 + (i % 2 ? 14 : -14);
          c.beginPath(); c.ellipse(x, y, 6, 11, 0, 0, Math.PI * 2); c.fill();
          for (let t = 0; t < 4; t++) { c.beginPath(); c.arc(x - 5 + t * 3.4, y - 14, 1.8, 0, Math.PI * 2); c.fill(); }
        }
      });
      this._fpMat = new THREE.MeshStandardMaterial({ map: tex, transparent: true, depthWrite: false, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -3 });
    }
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 1.6), this._fpMat);
    m.rotation.set(-Math.PI / 2, 0, yaw);
    m.position.set(pos.x, pos.y + 0.007, pos.z);
    this.scene.add(m);
    this.footprints.push(m);
  }

  setTV(on, dur = 0) {
    const tv = this.content.fixtures.tv;
    tv.on = on;
    tv.screen.material.emissiveIntensity = on ? 0.8 : 0;
    if (on) {
      const pos = tv.obj.getWorldPosition(new THREE.Vector3()).setY(tv.obj.position.y + 0.8);
      this.audio.tvStatic(pos, dur || 6);
      this.noise(pos, 0.55, 'tv');
      if (!this._tvTex) {
        this._tvCanvas = document.createElement('canvas');
        this._tvCanvas.width = 64; this._tvCanvas.height = 48;
        this._tvTex = new THREE.CanvasTexture(this._tvCanvas);
        tv.screen.material.emissiveMap = this._tvTex;
        tv.screen.material.needsUpdate = true;
      }
      this.tvOff = this.time + (dur || 6);
    }
  }

  // =================================================================== doll interactions with the player
  onSpotted(reason) {
    this.stats.spotted++;
    this.audio.sting();
    this.player.fear = 1;
    if (this.debugOn) this.ui.toast('Repéré : ' + reason, 2);
    else this.ui.subtitle(reason === 'te voit' ? '[Elle t\'a vu]' : '[Elle t\'a repéré : ' + reason + ']', 2);
  }

  onLostTarget() {
    this.ui.subtitle('[Elle a perdu ta trace… pour l\'instant]', 3);
  }

  dollHitsPlayer(doll) {
    const p = this.player;
    this.stats.hits++;
    this.audio.hurt();
    this.audio.sting();
    p.hit(this.diff.dmg, doll.pos);
    this.flashRed();
    if (!p.dead) this.ui.subtitle('Cours !', 2);
  }

  playerFoundInHiding(doll, spot) {
    this.ui.subtitle(SUBTITLES.hideFound, 2);
    this.exitHide(true);
    this.audio.sting();
  }

  flashRed() {
    const f = $('#flash');
    f.style.background = '#400';
    f.style.opacity = 0.6;
    setTimeout(() => { f.style.opacity = 0; }, 160);
  }

  playerDied(cause) {
    const p = this.player;
    if (p.dead) return;
    p.dead = true;
    p.health = 0;
    this.state = 'dying';
    this.dyingT = 0;
    this.deathCause = cause;
    if (p.hidden) this.exitHide(true);
    // jumpscare: her face, right in front of you
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion).setY(0).normalize();
    const d = this.doll;
    if (cause === 'doll') {
      d.pos.copy(this.camera.position).addScaledVector(fwd, 0.55);
      d.pos.y = this.camera.position.y - 0.95;
      d.yaw = Math.atan2(-fwd.x, -fwd.z);
      d.setState('attack', 'mise à mort');
      d.syncRoot();
      // her face lit from below by the golden Essence + your dropped flashlight
      if (!this.scareLight) { this.scareLight = new THREE.PointLight(0xffb060, 0, 2.5, 2); this.scene.add(this.scareLight); }
      this.scareLight.position.copy(this.camera.position).addScaledVector(fwd, 0.25).add(new THREE.Vector3(0, -0.35, 0));
      this.scareLight.intensity = 0.7;
    }
    this.audio.sting();
    this.audio.hurt();
    this.input.releaseLock();
  }

  // =================================================================== interactions
  findInteractable() {
    const cam = this.camera;
    const origin = cam.position;
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    const ray = new THREE.Ray(origin, dir);
    const box = new THREE.Box3();
    const hitP = new THREE.Vector3();
    let best = null, bestT = 2.3, bestRaw = 9;
    let container = null, containerT = 9;
    for (const e of this.content.interactables) {
      if (!e.enabled || e.removed) continue;
      if (e.drawer && e.drawer.open < 0.6) continue; // item inside a closed drawer
      if (e.level && e.level !== this.player.level && !(e.kind === 'door')) continue;
      const wp = e.obj.getWorldPosition(hitP);
      if (wp.distanceTo(origin) > 4.5) continue;
      box.setFromObject(e.obj);
      if (box.isEmpty()) continue;
      // tiny items get a slightly bigger hit box
      const size = box.getSize(new THREE.Vector3());
      if (size.x < 0.15 || size.y < 0.15 || size.z < 0.15) box.expandByScalar(0.05);
      const hit = ray.intersectBox(box, hitP);
      if (!hit) continue;
      let t = hit.distanceTo(origin);
      if (box.containsPoint(origin)) t = 0.3;
      // remember the nearest closed container (drawer / cabinet door) along the ray
      if ((e.kind === 'cabdoor' || e.kind === 'drawer') && e.part.open < 0.5 && t < containerT) { containerT = t; container = e; }
      // pickups win over the furniture that contains them
      const prio = e.kind === 'pickup' || e.kind === 'doc' ? -0.25 : e.kind === 'switch' ? -0.15 : 0;
      if (t + prio < bestT) {
        // walls in between?
        const wall = this.world.raycast(origin, dir, t, (b) => (b.kind === 'wall' || b.kind === 'slab' || (b.kind === 'door' && b.ref !== e.door)) && b.enabled);
        if (wall.box && wall.t < t - 0.08) continue;
        bestT = t + prio;
        bestRaw = t;
        best = e;
      }
    }
    // an item behind a closed cabinet door cannot be taken through the door
    if (best && (best.kind === 'pickup' || best.kind === 'doc') && container && containerT < bestRaw - 0.02) return container;
    return best;
  }

  promptFor(e) {
    const k = (a) => `<kbd>${keyName(settings.bindings[a])}</kbd>`;
    const inv = this.inventory, f = this.flags;
    switch (e.kind) {
      case 'door': {
        const d = e.door;
        if (d.id === 'frontDoor') return `${k('interact')}Porte d'entrée`;
        if (d.boarded) return inv.crowbar ? `${k('interact')}Arracher les planches` : `${k('interact')}Porte condamnée`;
        if (d.locked && d.locked !== 'special') return inv[d.locked] ? `${k('interact')}Déverrouiller (${ITEMS[d.locked].name})` : `${k('interact')}Verrouillée`;
        if (d.locked === 'special') return d.style === 'hidden' ? '' : `${k('interact')}Verrouillée`;
        let s = `${k('interact')}${d.target > 0.5 ? 'Fermer' : 'Ouvrir'}`;
        if (d.lockable && d.target < 0.5 && this.playerInsideLockable(d)) s += ` &nbsp; ${k('lock')}${d.lockedInside ? 'Déverrouiller' : 'Verrouiller'}`;
        return s;
      }
      case 'drawer': return `${k('interact')}${e.part.target > 0.5 ? 'Fermer le tiroir' : 'Ouvrir le tiroir'}`;
      case 'cabdoor': return `${k('interact')}${e.part.target > 0.5 ? 'Fermer' : 'Ouvrir'}`;
      case 'pickup': return `${k('interact')}Prendre : ${ITEMS[e.item]?.name || e.item}`;
      case 'doc': return `${k('interact')}Lire : ${DOCUMENTS[e.doc].title}`;
      case 'hide': return `${k('interact')}Se cacher ${e.spot.kind === 'bed' ? 'sous le lit' : 'dans l\'armoire'}`;
      case 'switch': return this.lights.power ? `${k('interact')}Interrupteur` : `${k('interact')}Interrupteur (pas de courant)`;
      case 'faucet': return `${k('interact')}${e.part.on ? 'Fermer' : 'Ouvrir'} le robinet`;
      case 'window': return e.win.interactive ? `${k('interact')}${e.win.target > 0.5 ? 'Fermer' : 'Ouvrir'} la fenêtre` : `${k('interact')}Regarder dehors`;
      case 'musicbox': return f.secretOpen ? '' : inv.windingKey ? `${k('interact')}Remonter la boîte à musique` : `${k('interact')}Boîte à musique (il manque la clé)`;
      case 'fusebox': return f.power ? '' : inv.fuse ? `${k('interact')}Installer le fusible` : `${k('interact')}Tableau électrique`;
      case 'fireplace': return inv.heart && inv.lighter ? `${k('interact')}Brûler le cœur de porcelaine` : inv.lighter && !f.fire ? `${k('interact')}Allumer un feu` : `${k('interact')}Cheminée`;
      case 'tv': return `${k('interact')}Télévision`;
      case 'radio': return `${k('interact')}Radio`;
      case 'recorder': return `${k('interact')}Écouter la bande`;
      case 'examine': return `${k('interact')}Examiner`;
      default: return '';
    }
  }

  playerInsideLockable(d) {
    // the player is on the side of the small room (WC / bathroom)
    const room = this.playerRoom;
    return room && (room.id === 'wc' || room.id === 'bath');
  }

  interact(e) {
    const p = this.player, inv = this.inventory, f = this.flags;
    const pos = e.obj.getWorldPosition(new THREE.Vector3());
    switch (e.kind) {
      case 'door': return this.useDoor(e.door);
      case 'drawer': {
        e.part.target = e.part.target > 0.5 ? 0 : 1;
        this.audio.drawer(pos, e.part.target > 0.5);
        this.noise(pos, 0.2, 'drawer');
        break;
      }
      case 'cabdoor': {
        e.part.target = e.part.target > 0.5 ? 0 : 1;
        this.audio.cabinet(pos, e.part.target > 0.5);
        this.noise(pos, 0.2, 'cabinet');
        break;
      }
      case 'pickup': return this.pickup(e);
      case 'doc': return this.readDoc(e);
      case 'hide': return this.enterHide(e.spot);
      case 'switch': {
        this.audio.switchClick(pos);
        e.toggle.rotation.x = e.toggle.rotation.x ? 0 : 0.5;
        const on = !e.lamps[0].on;
        for (const l of e.lamps) l.on = on;
        if (!this.lights.power) { this.ui.toast('Rien ne se passe. Pas de courant.'); break; }
        this.lastSwitch = { room: e.room, t: this.time, pos: pos.clone() };
        this.noise(pos, 0.12, 'switch');
        break;
      }
      case 'faucet': {
        e.part.on = !e.part.on;
        e.part.water.visible = e.part.on;
        if (e.part.on) this.audio.loop('faucet', () => {
          const c = this.audio.ctx;
          const s = this.audio.noiseSrc(this.audio.noiseBuf, true);
          const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1800; bp.Q.value = 0.6;
          const gn = c.createGain(); gn.gain.value = 0.3;
          s.connect(bp).connect(gn).connect(this.audio.out(pos, 1));
          s.start();
          return { gain: gn, sources: [s] };
        });
        else this.audio.stopLoop('faucet');
        this.noise(pos, 0.35, 'faucet');
        break;
      }
      case 'window': {
        const w = e.win;
        if (!w.interactive) { this.ui.toast('Des barreaux. Et derrière, la pluie et la nuit.'); break; }
        w.target = w.target > 0.5 ? 0 : 1;
        this.audio.creak(pos, 0.8);
        this.noise(pos, 0.3, 'window');
        if (w.target > 0.5) this.ui.toast('L\'air glacé entre. Les barreaux, eux, ne bougent pas.');
        break;
      }
      case 'musicbox': {
        if (f.secretOpen || f.musicPlaying) break;
        if (!inv.windingKey) { this.ui.toast('Il manque la clé pour la remonter.'); this.addClue('La boîte à musique de la chambre d\'enfant a besoin d\'une clé de remontage.'); break; }
        f.musicPlaying = true;
        this.audio.musicBox(pos, 9);
        e.part.lid.rotation.x = -1.2;
        e.part.dancer.visible = true;
        this.noise(pos, 1.0, 'music');
        this.ui.subtitle('[La berceuse résonne dans toute la maison…]', 4);
        this.timer(4.5, () => this.noise(pos, 0.9, 'music'));
        this.timer(9, () => this.openSecret());
        break;
      }
      case 'fusebox': {
        if (f.power) break;
        if (!inv.fuse) { this.ui.toast('Un fusible manque. Le levier est bloqué.'); this.addClue('Le tableau électrique de la chaufferie a besoin d\'un fusible.'); break; }
        this.consume('fuse');
        this.audio.fuse(pos);
        e.part.lever.rotation.x = -1.2;
        this.restorePower(pos);
        break;
      }
      case 'fireplace': return this.useFireplace(e);
      case 'tv': {
        if (!this.lights.power) { this.ui.toast('L\'écran reste noir. Pas de courant.'); break; }
        this.setTV(!this.content.fixtures.tv.on, 8);
        break;
      }
      case 'radio': {
        this.audio.radioVoice(pos);
        this.noise(pos, 0.6, 'radio');
        break;
      }
      case 'recorder': {
        this.audio.tapeRecorder(pos);
        this.noise(pos, 0.45, 'radio');
        if (!this.docsRead.includes('tape')) this.docsRead.push('tape');
        this.addClue('Elle ne voit pas dans le noir complet, mais elle entend tout. Elle ouvre les cachettes proches d\'où elle t\'a entendu.');
        this.timer(5.5, () => this.ui.openDoc('tape'));
        break;
      }
      case 'examine': this.ui.toast(e.text, 5); break;
      default: break;
    }
    this.updateObjective();
  }

  timer(sec, fn) { (this._timers ||= []).push({ t: this.time + sec, fn }); }

  consume(id) { addInv(this, id, -1); }

  useDoor(d) {
    const inv = this.inventory, f = this.flags;
    if (d.id === 'frontDoor') return this.tryFrontDoor(d);
    if (d.boarded) {
      if (!inv.crowbar) { this.ui.subtitle(SUBTITLES.boarded, 3); this.addClue('Le bureau de l\'étage est condamné par des planches. Il faudrait un pied-de-biche.'); return; }
      this.startAction('Arracher les planches…', 2.2, () => {
        d.boarded = false;
        d.locked = false;
        d.planks.visible = false;
        this.content.interactables.forEach((e) => { if (e.obj === d.planks) e.removed = true; });
        this.audio.boards(d.center);
        this.noise(d.center, 0.85, 'boards');
        f.officeOpen = true;
        this.setAct(4);
      });
      this.audio.creak(d.center, 1);
      return;
    }
    if (d.locked && d.locked !== 'special') {
      if (inv[d.locked]) {
        this.audio.unlock(d.center);
        this.ui.toast(`Tu utilises : ${ITEMS[d.locked].name}.`);
        const key = d.locked;
        d.locked = false;
        if (key === 'garageKey') f.garageOpen = true;
        if (key === 'atticKey') f.atticOpen = true;
        if (key === 'cellarKey') { f.cellarOpen = true; this.setAct(5); }
        if (key === 'rustyKey') f.ritualOpen = true;
        this.openDoor(d, true, this.player.pos);
        this.noise(d.center, 0.3, 'door');
        this.updateObjective();
      } else {
        this.audio.doorLocked(d.center);
        this.noise(d.center, 0.2, 'door');
        this.ui.subtitle(SUBTITLES.doorLocked, 2);
        const hint = { garageKey: 'Le garage est fermé à clé.', cellarKey: 'La porte de la cave est fermée à clé.', atticKey: 'La porte du grenier est fermée à clé.', rustyKey: 'Une pièce scellée au sous-sol. Une serrure rouillée.' }[d.locked];
        if (hint) this.addClue(hint);
      }
      return;
    }
    if (d.locked === 'special') return;
    if (d.lockedInside && !d.forced) { this.ui.toast('Tu l\'as verrouillée. [' + keyName(settings.bindings.lock) + '] pour déverrouiller.'); return; }
    const open = d.target < 0.5;
    this.openDoor(d, open, this.player.pos);
    // opening quickly while running is louder
    this.noise(d.center, this.player.speedNow > 2.5 ? 0.6 : 0.28, 'door');
    this.heatDoor(d);
  }

  heatDoor(d) {
    this.doll.heat.set(d.id, (this.doll.heat.get(d.id) || 0) + 1);
  }

  toggleLock(d) {
    if (!d.lockable || d.target > 0.5 || d.forced) return;
    d.lockedInside = !d.lockedInside;
    this.audio.unlock(d.center);
    this.ui.toast(d.lockedInside ? 'Verrouillé. Ça ne la retiendra pas éternellement.' : 'Déverrouillé.');
    this.noise(d.center, 0.15, 'door');
  }

  tryFrontDoor(d) {
    const f = this.flags, inv = this.inventory;
    f.frontSeen = true;
    this.addClue('La porte d\'entrée a un verrou magnétique (il faut le courant) et une serrure (il faut sa clé).');
    if (!f.power) { this.audio.doorLocked(d.center); this.ui.subtitle(SUBTITLES.frontNoPower, 4); if (this.act < 2) this.setAct(2); this.updateObjective(); return; }
    if (!inv.frontKey) { this.audio.doorLocked(d.center); this.ui.subtitle(SUBTITLES.frontNoKey, 3); return; }
    this.audio.unlock(d.center);
    d.locked = false;
    this.openDoor(d, true, this.player.pos);
    this.ending();
  }

  pickup(e) {
    const id = e.item;
    this.audio.pickup();
    this.removeInteractable(e);
    this.picked.add(e.id);
    if (id === 'flashlight') {
      this.player.hasFlashlight = true;
      this.player.flashOn = true;
      this.flags.flashlight = true;
      this.ui.toast('Lampe torche. [F] pour l\'allumer / l\'éteindre.', 4);
    } else {
      addInv(this, id, 1);
      this.ui.toast(`Ramassé : ${ITEMS[id].name}`, 2.5);
    }
    if (id === 'garageKey') this.setAct(3);
    if (id === 'heart') {
      this.flags.heartTaken = true;
      this.ui.subtitle(SUBTITLES.heartTaken, 3);
      this.content.fixtures.heartLight.on = false;
      this.content.fixtures.heartLight.base = 0;
      // she feels it: she knows where you are
      this.doll.lastKnown = this.player.pos.clone();
      this.doll.suspicion = 1;
      if (this.doll.active && this.doll.state !== 'chase') this.doll.beginInvestigate('fast', 'son cœur a été pris');
      this.audio.dollShriek(this.doll.eye);
    }
    if (id === 'frontKey') this.addClue('Tu as la clé de la porte d\'entrée.');
    this.noise(this.player.pos, 0.1, 'item');
    this.updateObjective();
  }

  removeInteractable(e) {
    e.removed = true;
    e.enabled = false;
    if (e.model && e.model.parent) e.model.parent.remove(e.model);
    if (e.prop) { e.prop.removed = true; }
  }

  readDoc(e) {
    this.audio.paper();
    this.removeInteractable(e);
    this.picked.add(e.id);
    if (!this.docsRead.includes(e.doc)) this.docsRead.push(e.doc);
    this.ui.openDoc(e.doc);
    this.state = 'reading';
    this.input.releaseLock();
    if (e.doc === 'letter') { this.flags.frontSeen = true; this.addClue('Le courant se rétablit à la chaufferie, au sous-sol.'); }
    if (e.doc === 'marthe1') this.addClue('La clé de la boîte à musique est dans le buffet de la salle à manger.');
    if (e.doc === 'augustin') this.addClue('Elle tourne la tête vers le moindre bruit. Elle déteste la lumière dans les yeux.');
    if (e.doc === 'workshop') this.addClue('Seul le feu peut détruire le cœur. La clé rouillée est au grenier, près de la lucarne.');
    if (e.doc === 'last') this.addClue('La clé de l\'entrée est sur l\'autel de la pièce scellée.');
  }

  onReaderClosed() {
    if (this.state === 'reading') { this.state = 'playing'; this.input.requestLock(); this.updateObjective(); }
  }

  openSecret() {
    const f = this.flags;
    f.secretOpen = true;
    f.musicPlaying = false;
    const w = this.content.fixtures.secretWardrobe;
    this.secretSlide = { obj: w, from: w.position.x, to: w.position.x + 1.55, t: 0 };
    if (w.userData.box) w.userData.box.enabled = false;
    this.audio.creak(w.position, 1);
    this.audio.thud(w.position, 0.8);
    this.noise(w.position, 0.6, 'prop');
    const d = this.house.doors.find((x) => x.id === 'secretDoor');
    d.locked = false;
    this.timer(1.6, () => {
      this.openDoor(d, true, null, true);
      // move the wardrobe's collision box
      const b = w.userData.box;
      if (b) { b.min[0] += 1.55; b.max[0] += 1.55; this.world.update(b, b.min, b.max); b.enabled = true; }
      this.nav.rebuild();
    });
    this.ui.subtitle(SUBTITLES.secret, 3);
    this.updateObjective(true);
  }

  restorePower(pos) {
    const f = this.flags;
    f.power = true;
    this.lights.setPower(true);
    this.audio.powerOn();
    this.ui.subtitle(SUBTITLES.powerOn, 4);
    this.noise(pos, 1.0, 'power');
    this.content.fixtures.fuseBox.part.lamp.material.emissive.setHex(0x22ff44);
    this.content.fixtures.fuseBox.part.lamp.material.emissiveIntensity = 2;
    // the house wakes up: TV, radio, washing machine all at once
    this.timer(1.5, () => this.setTV(true, 10));
    this.setAct(6);
    this.doll.lastKnown = pos.clone();
    if (this.doll.active && this.doll.state !== 'chase') this.doll.beginInvestigate('fast', 'le courant est revenu');
  }

  useFireplace(e) {
    const f = this.flags, inv = this.inventory;
    const fl = e.light;
    if (inv.heart && inv.lighter) {
      this.startAction('Brûler le cœur…', 3, () => {
        addInv(this, 'heart', -1);
        f.heartBurned = true;
        f.fire = true;
        fl.on = true;
        this.audio.dollShriek(this.doll.eye);
        this.ui.subtitle(SUBTITLES.heartBurned, 5);
        this.destroyDoll();
        this.updateObjective(true);
      });
      return;
    }
    if (inv.lighter && !f.fire) {
      f.fire = true;
      fl.on = true;
      this.ui.toast('Le feu prend. La chaleur, enfin.');
      this.noise(e.obj.position, 0.3, 'fire');
      return;
    }
    this.ui.toast(f.fire ? 'Le feu crépite.' : 'Une cheminée. Il faudrait de quoi allumer un feu.');
  }

  destroyDoll() {
    const d = this.doll;
    d.active = false;
    d.destroyed = true;
    d.setState('dormant', 'détruite');
    d.anim.state.glow = 0;
    d.model.materials.headMat.emissiveIntensity = 0;
    d.model.materials.innerMat.emissiveIntensity = 0;
    this.audio.stopLoop('chase');
  }

  startAction(label, dur, done) {
    const p = this.player;
    p.healing = { label, dur, t: 0, done };
    p.locked = true;
  }

  useItem(id) {
    const p = this.player;
    if (!this.inventory[id]) return;
    if (id === 'bandage') {
      if (!p.injury.bleeding && p.health > 90) { this.ui.toast('Tu n\'en as pas besoin pour l\'instant.'); return; }
      if (this.state === 'panel') this.togglePanel('inventory');
      this.audio.bandage();
      this.noise(p.pos, 0.1, 'item');
      this.startAction('Bander la plaie… (reste immobile)', 3.2, () => {
        addInv(this, 'bandage', -1);
        p.injury.bleeding = false;
        p.health = Math.min(100, p.health + 30);
        p.injury.leg = Math.max(0.15, p.injury.leg - 0.25);
        p.injury.arm = Math.max(0, p.injury.arm - 0.2);
        this.ui.toast('Le saignement s\'est arrêté.');
      });
    } else if (id === 'painkillers') {
      addInv(this, 'painkillers', -1);
      this.audio.pills();
      p.painRelief = 120;
      p.fear = Math.max(0, p.fear - 0.3);
      this.ui.toast('La douleur s\'estompe. Les mains tremblent moins.');
    } else if (id === 'battery') {
      if (!p.hasFlashlight) return;
      addInv(this, 'battery', -1);
      p.battery = 100;
      this.audio.click();
      this.ui.toast('Piles neuves.');
    }
    this.updateObjective();
  }

  // =================================================================== hiding
  enterHide(spot) {
    const p = this.player;
    if (p.hidden) return;
    this.hideAnim = { spot, t: 0, from: this.camera.position.clone() };
    p.hidden = spot;
    p.justHid = spot;
    p.flashOn = false;
    p.crouched = false;
    this.stats.hides++;
    this.timer(1.0, () => { p.justHid = null; });
    if (spot.kind === 'wardrobe') {
      this.openHideDoors(spot, true);
      this.timer(0.6, () => this.openHideDoors(spot, false));
      this.audio.cabinet(spot.pos, true);
      // the old wood may creak
      const creak = Math.random() < 0.4;
      if (creak) this.audio.creak(spot.pos, 0.8);
      this.noise(spot.pos.clone().setY(spot.pos.y + 1), creak ? 0.4 : 0.2, 'hide');
    } else {
      this.noise(spot.pos, 0.18, 'hide');
      this.audio.burst(spot.pos, { gain: 0.2, freq: 600, q: 0.6, a: 0.05, d: 0.4 });
    }
    this.post.horror.uniforms.hidden.value = spot.kind === 'wardrobe' ? 1 : 0;
  }

  exitHide(forced = false) {
    const p = this.player;
    const s = p.hidden;
    if (!s) return;
    p.hidden = null;
    p.pos.copy(s.exit);
    const gr = this.world.groundAt(s.exit.x, s.exit.z, s.exit.y + 0.3);
    if (gr) p.pos.y = gr.y;
    p.yaw = Math.atan2(-s.front.x, -s.front.z) + Math.PI;
    p.pitch = 0;
    this.world.collideCylinder(p.pos, 0.28, p.pos.y, 1.7);
    this.post.horror.uniforms.hidden.value = 0;
    if (s.kind === 'wardrobe') {
      this.openHideDoors(s, true);
      this.timer(0.8, () => this.openHideDoors(s, false));
      this.audio.cabinet(s.pos, true);
    }
    // sneaking out (crouch held) is quieter
    const quiet = this.input.is('crouch');
    if (!forced) this.noise(s.pos, quiet ? 0.08 : 0.3, 'hide');
    if (quiet) p.crouched = true;
  }

  // =================================================================== throwing
  throwBottle() {
    const p = this.player;
    if (!this.inventory.bottle || p.hidden || p.locked) return;
    addInv(this, 'bottle', -1);
    const m = new THREE.Group();
    m.add(new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.22, 10), new THREE.MeshPhysicalMaterial({ color: 0x1f4a22, roughness: 0.05, transparent: true, opacity: 0.8 })));
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
    m.position.copy(this.camera.position).addScaledVector(dir, 0.4);
    this.scene.add(m);
    this.thrown.push({ mesh: m, vel: dir.multiplyScalar(9).add(new THREE.Vector3(0, 2.2, 0)), t: 0 });
    this.audio.burst(null, { gain: 0.2, freq: 900, q: 0.5, a: 0.02, d: 0.2 });
  }

  updateThrown(dt) {
    for (const b of this.thrown) {
      if (b.done) continue;
      b.t += dt;
      b.vel.y -= 9.8 * dt;
      const from = b.mesh.position.clone();
      const step = b.vel.clone().multiplyScalar(dt);
      const len = step.length();
      const hit = this.world.raycast(from, step.clone().normalize(), len + 0.05, (bx) => bx.solid || bx.kind === 'slab');
      const gr = this.world.groundAt(from.x, from.z, from.y + 0.1, 0.1);
      b.mesh.position.add(step);
      b.mesh.rotation.x += dt * 12;
      if (hit.box || (gr && b.mesh.position.y <= gr.y + 0.05) || b.t > 4) {
        b.done = true;
        const p = hit.box ? from.addScaledVector(step.normalize(), hit.t) : b.mesh.position;
        this.audio.glass(p);
        this.noise(p, 0.95, 'glass');
        this.scene.remove(b.mesh);
      }
    }
    this.thrown = this.thrown.filter((b) => !b.done);
  }

  // =================================================================== props (kickable)
  updateProps(dt) {
    const p = this.player;
    for (const pr of this.content.props) {
      if (pr.removed || pr.level !== p.level) continue;
      const m = pr.mesh;
      const dx = m.position.x - p.pos.x, dz = m.position.z - p.pos.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.38 && p.speedNow > 0.4 && pr.cooldown <= 0 && !p.hidden) {
        const k = Math.min(1, p.speedNow / 3);
        pr.vel.set(dx / d * (1 + k * 2.5), 0, dz / d * (1 + k * 2.5));
        pr.cooldown = 0.6;
        if (!pr.fallen) { pr.fallen = true; m.rotation.z = Math.PI / 2; }
        const loud = 0.25 + k * 0.45;
        if (pr.kind === 'bottle') this.audio.glass(m.position.clone()); else if (pr.kind === 'can') this.audio.canRoll(m.position.clone()); else this.audio.toySqueak(m.position.clone());
        this.noise(m.position.clone(), pr.kind === 'bottle' ? loud + 0.2 : loud, 'prop');
        if (pr.kind === 'bottle') { pr.broken = true; if (pr.pickup) pr.pickup.enabled = false; }
      }
      pr.cooldown -= dt;
      if (pr.vel.lengthSq() > 0.0004) {
        m.position.addScaledVector(pr.vel, dt);
        m.rotation.y += pr.vel.length() * dt * 4;
        const v = new THREE.Vector3(m.position.x, 0, m.position.z);
        this.world.collideCylinder(v, 0.08, m.position.y, 0.3, (b) => b.kind === 'wall' || b.kind === 'furniture' || b.kind === 'door');
        if (v.x !== m.position.x || v.z !== m.position.z) { pr.vel.multiplyScalar(-0.3); m.position.x = v.x; m.position.z = v.z; }
        pr.vel.multiplyScalar(Math.exp(-3 * dt));
        if (pr.onShelf) { pr.onShelf = false; m.position.y = pr.baseY; }
      }
    }
  }

  // =================================================================== save / load
  serialize() {
    const p = this.player;
    return {
      difficulty: this.difficulty, act: this.act, time: this.time, flags: { ...this.flags, musicPlaying: false },
      inventory: { ...this.inventory }, docsRead: [...this.docsRead], clues: [...this.clues], objectiveLog: [...this.objectiveLog],
      picked: [...this.picked], visited: [...this.visitedRooms], power: this.lights.power,
      player: {
        pos: p.pos.toArray(), yaw: p.yaw, pitch: p.pitch, health: p.health, stamina: p.stamina, injury: { ...p.injury },
        battery: p.battery, flashOn: p.flashOn, hasFlashlight: p.hasFlashlight, painRelief: p.painRelief, fear: p.fear,
      },
      doll: this.doll.serialize(), dollDestroyed: !!this.doll.destroyed,
      doors: this.house.doors.map((d) => ({ id: d.id, open: d.target, locked: d.locked, lockedInside: d.lockedInside, forced: d.forced, boarded: d.boarded })),
      lights: this.content.lights.map((l) => ({ id: l.id, on: l.on, broken: l.broken })),
      stats: this.stats, played: this.time,
    };
  }

  saveGame(manual) {
    if (this.player.dead) return;
    if (manual && (this.doll.state === 'chase' || this.doll.state === 'attack')) { this.ui.toast('Impossible : elle te poursuit.'); return; }
    const ok = writeSave(manual ? 'manual' : 'auto', this.serialize());
    this.ui.toast(ok ? (manual ? 'Partie sauvegardée.' : 'Sauvegarde automatique.') : 'Échec de la sauvegarde.', 2);
  }

  applySave(s) {
    this.difficulty = s.difficulty;
    this.act = s.act;
    this.time = s.time || 0;
    this.flags = { ...s.flags };
    this.inventory = { ...s.inventory };
    this.docsRead = [...s.docsRead];
    this.clues = [...s.clues];
    this.objectiveLog = [...s.objectiveLog];
    this.visitedRooms = new Set(s.visited || []);
    this.stats = s.stats || this.stats;
    this.lights.setPower(!!s.power);
    for (const id of s.picked) {
      const e = this.content.interactables.find((x) => x.id === id);
      if (e) this.removeInteractable(e);
      this.picked.add(id);
    }
    for (const ds of s.doors) {
      const d = this.house.doors.find((x) => x.id === ds.id);
      if (!d) continue;
      d.locked = ds.locked; d.lockedInside = ds.lockedInside; d.forced = ds.forced; d.boarded = ds.boarded;
      d.target = d.open = ds.open;
      if (!d.boarded && d.planks) { d.planks.visible = false; this.content.interactables.forEach((e) => { if (e.obj === d.planks) e.removed = true; }); }
    }
    for (const ls of s.lights) {
      const l = this.content.lights.find((x) => x.id === ls.id);
      if (l) { l.on = ls.on; l.broken = ls.broken; }
    }
    if (this.flags.secretOpen) {
      const w = this.content.fixtures.secretWardrobe;
      w.position.x += 1.55;
      const b = w.userData.box;
      if (b) { b.min[0] += 1.55; b.max[0] += 1.55; this.world.update(b, b.min, b.max); }
      this.nav.rebuild();
      const mb = this.content.fixtures.musicBox;
      mb.part.lid.rotation.x = -1.2; mb.part.dancer.visible = true;
    }
    if (this.flags.power) {
      this.content.fixtures.fuseBox.part.lever.rotation.x = -1.2;
      this.content.fixtures.fuseBox.part.lamp.material.emissive.setHex(0x22ff44);
    }
    if (this.flags.heartTaken) { this.content.fixtures.heartLight.on = false; }
    if (this.flags.fire) this.content.fixtures.fireplace.light.on = true;
    const p = this.player, ps = s.player;
    p.pos.fromArray(ps.pos); p.yaw = ps.yaw; p.pitch = ps.pitch; p.health = ps.health; p.stamina = ps.stamina;
    p.injury = { ...ps.injury }; p.battery = ps.battery; p.flashOn = ps.flashOn; p.hasFlashlight = ps.hasFlashlight;
    p.painRelief = ps.painRelief; p.fear = ps.fear || 0;
    this.doll.restore(s.doll);
    this.doll.aggro = [0, 1, 2, 2.6, 3.2, 4.2][this.act - 1] * this.diff.aggro;
    if (s.dollDestroyed) this.destroyDoll();
    // the doll never restarts right next to the player
    if (this.doll.active && this.doll.pos.distanceTo(p.pos) < 10) {
      const far = this.nav.nodes.filter((n) => Math.hypot(n.x - p.pos.x, n.z - p.pos.z) + Math.abs(n.y - p.pos.y) * 3 > 14);
      const n = far[Math.floor(Math.random() * far.length)];
      if (n) this.doll.place(new THREE.Vector3(n.x, n.y, n.z), 0);
    }
  }

  ending() {
    const f = this.flags;
    let id = 'follows';
    if (f.heartBurned) id = 'liberation';
    else if (this.docsRead.filter((d) => d !== 'tape').length >= 4) id = 'survivor';
    this.endingId = id;
    this.state = 'ending';
    this.input.releaseLock();
    const E = ENDINGS[id];
    const mins = Math.floor(this.time / 60), secs = Math.floor(this.time % 60);
    $('#endtitle').textContent = E.title;
    $('#endtext').textContent = E.text;
    $('#endstats').textContent = `Temps : ${mins} min ${secs} s · Documents : ${this.docsRead.length}/${Object.keys(DOCUMENTS).length} · Fois repéré : ${this.stats.spotted} · Blessures : ${this.stats.hits} · Difficulté : ${this.diff.label}`;
    const fl = $('#flash');
    fl.style.background = '#000';
    fl.style.opacity = 1;
    setTimeout(() => { this.ui.show('#hud', false); this.ui.show('#ending'); fl.style.opacity = 0; }, 1200);
    this.events.emit('ending', id);
  }

  // =================================================================== main loop
  update(dt) {
    const p = this.player, inp = this.input;
    if (this.state === 'dying') {
      this.dyingT += dt;
      this.doll.anim.state.action = this.deathCause === 'doll' ? 'scare' : 'attack';
      this.doll.anim.state.stutter = 0;
      this.doll.anim.state.eye = 'aware';
      this.doll.anim.state.jaw = 1;
      this.doll.anim.state.glow = 2;
      this.doll.anim.state.lookAt = this.camera.position.clone();
      this.doll.anim.update(dt, this.doll.yaw);
      this.post.horror.uniforms.shock.value = 1;
      this.post.horror.uniforms.fade.value = clamp((this.dyingT - 1.2) / 1.2, 0, 1);
      if (this.dyingT > 2.6 && this.state === 'dying') {
        this.state = 'dead';
        this.ui.show('#hud', false);
        this.ui.show('#death');
        $('#deathcause').textContent = this.deathCause === 'blood' ? 'Tu as perdu trop de sang. Pense à te bander.' : 'Elle t\'a attrapé. Écoute-la venir, cache-toi, et ne la laisse pas te voir.';
        $('#death [data-act=load]').disabled = !latestSave();
      }
      return;
    }
    if (this.state !== 'playing') return;
    this.time += dt;
    // timers
    if (this._timers) {
      const due = this._timers.filter((t) => t.t <= this.time);
      this._timers = this._timers.filter((t) => t.t > this.time);
      for (const t of due) t.fn();
    }
    // wake-up intro: getting up from the floor
    if (p.wake > 0) {
      p.wake -= dt / 4.5;
      p.pitch = damp(p.pitch, 0, 1.2, dt);
      p.knock = Math.max(p.knock, p.wake * 0.9);
      if (p.wake <= 0) { p.locked = false; p.wake = 0; }
    }

    // ---- player actions
    if (!p.locked || p.hidden) {
      if (inp.hit('interact')) {
        if (p.hidden) this.exitHide();
        else if (this.focus) this.interact(this.focus);
      }
      if (inp.hit('lock') && this.focus?.kind === 'door') this.toggleLock(this.focus.door);
      if (inp.hit('throw')) this.throwBottle();
      if (inp.hit('heal')) this.useItem('bandage');
      if (inp.hit('objectives')) this.updateObjective(true);
    }
    p.update(dt, inp);
    this.camera.updateMatrixWorld();
    this.focus = p.hidden || p.locked ? null : this.findInteractable();
    this.ui.prompt(this.focus ? this.promptFor(this.focus) : '');

    // ---- rooms & story triggers
    const room = this.playerRoom;
    if (room) {
      if (!this.visitedRooms.has(room.id)) this.visitedRooms.add(room.id);
      if (room.id !== 'guest' && this.flags.flashlight && !this.flags.leftGuest) {
        this.flags.leftGuest = true;
        this.updateObjective(true);
      }
      this.scene.fog.density = damp(this.scene.fog.density, 0.03 + (room.fog || 0) * 0.05, 1, dt);
    }
    this.updateDollAwakening(dt);

    // ---- world
    if (this.doll.active || this.doll.state === 'dormant') this.doll.update(dt);
    this.updateDoors(dt);
    this.updateFurnitureParts(dt);
    this.updateProps(dt);
    this.updateThrown(dt);
    this.director.update(dt);
    this.updateFear(dt);
    this.lights.update(dt, p.pos, p.level);
    this.updateAnimatedFixtures(dt);
    this.updateVisibility();
    // hiding transition
    if (this.hideAnim) { this.hideAnim.t += dt; if (this.hideAnim.t > 0.6) this.hideAnim = null; }

    // ---- post fx
    const h = this.post.horror.uniforms;
    h.time.value = this.time;
    h.fear.value = p.fear;
    h.damage.value = clamp(1 - p.health / 100, 0, 1) * 0.9 + (p.injury.bleeding ? 0.1 : 0);
    h.shock.value = Math.max(p.injury.shock * 0.8, this.doll.state === 'attack' ? 0.4 : 0);
    h.fade.value = p.wake > 0 ? clamp(p.wake * 1.4 - 0.4, 0, 1) : 0;
    this.lightning = Math.max(0, this.lightning - dt);
    // eye adaptation: in darkness (no flashlight) the eye slowly opens up so the house stays readable
    this.adaptT = (this.adaptT || 0) - dt;
    if (this.adaptT <= 0) {
      this.adaptT = 0.25;
      const ll = this.lights.lightLevelAt(this.camera.position, null);
      this.adaptTarget = p.flashOn ? 1.05 : 1 + 1.1 * (1 - clamp(ll * 2.5, 0, 1)) + (p.hidden ? 0.4 : 0);
    }
    this.adapt = damp(this.adapt || 1, this.adaptTarget || 1, this.adaptTarget > (this.adapt || 1) ? 0.5 : 3, dt);
    h.exposure.value = settings.brightness * this.adapt * (1 + (this.lightning > 0.25 ? 1.5 : 0));
    this.dust.update(dt, this.camera.position, p.spot, p.flashOn);
    const d = this.doll;
    this.audio.update(dt, this.camera, {
      chase: d.state === 'chase' || d.state === 'attack' ? 1 : d.state === 'search' && d.distToPlayer < 10 ? 0.25 : 0,
      tension: clamp(p.fear + (d.active ? 0.2 : 0), 0, 1),
      fear: p.fear,
      indoorDepth: p.level === 'B' ? 1 : 0,
    });
    this.ui.update(dt);
    if (this.debugOn) this.ui.debug(this.debugText());
  }

  updateDollAwakening(dt) {
    const d = this.doll, p = this.player, f = this.flags;
    if (d.state !== 'dormant' || d.destroyed) return;
    const seatHead = d.eye;
    const visible = this.isVisibleToPlayer(seatHead);
    if (visible && f.leftGuest && seatHead.distanceTo(p.eyePos) < 12) {
      if (!f.sawDoll) { f.sawDoll = true; this.sawDollT = this.time; p.fear = Math.min(1, p.fear + 0.3); }
      // she slowly turns her head toward you while you look...
      if (this.time - this.sawDollT > 2.5 && !d.dormantLook) { d.dormantLook = true; this.audio.dollJoint(seatHead, 1); this.ui.subtitle(SUBTITLES.firstSighting, 4); }
    }
    // ...and the moment you look away, she is gone
    if ((f.sawDoll && !visible && this.time - this.sawDollT > 3) || (f.leftGuest && this.time > (this.leftT ||= this.time) + 75)) {
      d.dormantLook = false;
      d.active = true;
      d.aggro = this.diff.aggro;
      d.setState('retreat', 'réveil');
      d.graceT = 25; // the first encounter is a presence, not a chase
      const far = this.nav.nodes.filter((n) => Math.abs(n.y - LEVELS.G) < 0.1 && Math.hypot(n.x - 4, n.z - 6) < 3);
      const n = far[Math.floor(Math.random() * far.length)];
      // she leaves through the gallery and the stairs (real path), faster while unseen
      if (n) d.goTo(n, 'fast');
      this.audio.dollJoint(seatHead, 1);
      this.audio.giggle(seatHead);
      this.setAct(2);
    }
  }

  updateDoors(dt) {
    for (const d of this.house.doors) {
      if (Math.abs(d.open - d.target) > 0.001) {
        d.open += Math.sign(d.target - d.open) * Math.min(Math.abs(d.target - d.open), dt * d.speed);
        d.pivot.rotation.y = d.baseRot + d.swing * (Math.PI / 2) * 0.97 * d.open;
        const isOpen = d.open > 0.85;
        const b = d.box;
        if (isOpen && !d._openBox) { this.world.update(b, [...d.openBox.min], [...d.openBox.max]); b.occ = false; d._openBox = true; }
        else if (!isOpen && d._openBox) { this.world.update(b, [...d.closed.min], [...d.closed.max]); b.occ = true; d._openBox = false; }
        // partially open: let the player squeeze through but block sight partially
        b.solid = d.open < 0.15 || isOpen;
      }
    }
    for (const w of this.house.windows) {
      if (!w.sash) continue;
      w.open = damp(w.open, w.target, 4, dt);
      w.sash.position.y = w.open * (w.h / 2 - 0.05);
    }
  }

  updateFurnitureParts(dt) {
    for (const e of this.content.interactables) {
      const pt = e.part;
      if (!pt) continue;
      if (e.kind === 'drawer') {
        pt.open = damp(pt.open, pt.target, 10, dt);
        pt.group.position.z = pt.closedZ + (pt.openZ - pt.closedZ) * pt.open;
      }
    }
    // cabinet doors (also wardrobe doors used by hide spots)
    const seen = this._cab || (this._cab = new Set());
    seen.clear();
    for (const e of this.content.interactables) {
      const list = e.kind === 'cabdoor' ? [e.part] : e.kind === 'hide' ? e.spot.doors : [];
      for (const cd of list) {
        if (seen.has(cd)) continue;
        seen.add(cd);
        cd.open = damp(cd.open, cd.target, 8, dt);
        cd.pivot.rotation.y = -cd.hingeSide * cd.open * cd.max;
      }
    }
    if (this.secretSlide) {
      const s = this.secretSlide;
      s.t = Math.min(1, s.t + dt / 1.5);
      s.obj.position.x = s.from + (s.to - s.from) * s.t;
      s.obj.updateMatrixWorld(true);
      if (s.t >= 1) this.secretSlide = null;
    }
  }

  updateAnimatedFixtures(dt) {
    for (const a of this.content.animated) {
      if (a.type === 'pendulum') a.mesh.rotation.z = Math.sin(this.time * 2.2) * (this.lights.power ? 0.25 : 0.0);
      if (a.type === 'flame') { a.mesh.scale.x = 1 + Math.sin(this.time * 23 + a.mesh.id) * 0.15; }
    }
    const tv = this.content.fixtures.tv;
    if (tv.on) {
      if (this._tvCanvas) {
        const c = this._tvCanvas.getContext('2d');
        const img = c.createImageData(64, 48);
        for (let i = 0; i < img.data.length; i += 4) { const v = Math.random() * 255; img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255; }
        c.putImageData(img, 0, 0);
        this._tvTex.needsUpdate = true;
      }
      if (this.time > this.tvOff) this.setTV(false);
    }
    if (this.applianceRun > 0) {
      this.applianceRun -= dt;
      const w = this.content.fixtures.washer;
      w.drum.rotation.z += dt * 12;
      w.obj.position.x = w.pos.x + Math.sin(this.time * 40) * 0.004;
    }
    const mb = this.content.fixtures.musicBox;
    if (this.flags.musicPlaying) mb.part.dancer.rotation.y += dt * 2;
    const horse = this.content.fixtures.horse;
    if (horse) horse.userData.parts.rock.rotation.x = Math.sin(this.time * 1.3) * (this.horseRock || 0);
  }

  updateFear(dt) {
    const p = this.player, d = this.doll;
    if (!d.active) return;
    let target = 0;
    if (d.seenByPlayer && d.distToPlayer < 15) target = 0.5 + (1 - d.distToPlayer / 15) * 0.5;
    if (d.state === 'chase') target = Math.max(target, 0.9);
    if (d.distToPlayer < 5) target = Math.max(target, 0.6);
    if (d.state === 'search' && d.distToPlayer < 8) target = Math.max(target, 0.55);
    if (target > p.fear) p.fear = Math.min(1, p.fear + dt * 0.8 * (target - p.fear) * 3);
  }

  // only render the player's floor and its neighbours; the mirror only when in the bathroom
  updateVisibility() {
    const order = ['B', 'G', 'U', 'A'];
    const p = this.player.pos;
    const lv = this.player.level;
    // a neighbouring floor is only rendered when it can actually be seen: from the stairwells and the
    // hall / gallery (which overlook each other through the grand staircase)
    const near = (x, z, r) => Math.hypot(p.x - x, p.z - z) < r;
    const show = new Set([lv]);
    const inHallArea = p.x > 8.5 && p.x < 17.5 && p.z > 9.5 && p.z < 18.5;
    const nearCellar = near(16, 5, 4.5);
    if (lv === 'G') { if (inHallArea) show.add('U'); if (nearCellar) show.add('B'); }
    if (lv === 'U') { if (inHallArea) show.add('G'); if (nearCellar) show.add('A'); }
    if (lv === 'B') { if (nearCellar || (p.x > 14 && p.x < 18 && p.z > 0)) show.add('G'); }
    if (lv === 'A') { if (near(16, 5, 5)) show.add('U'); }
    // on the stairs themselves both floors are needed
    if (p.x > 13.4 && p.x < 15.1 && p.z > 10.8 && p.z < 17.2) { show.add('G'); show.add('U'); }
    if (p.x > 14.9 && p.x < 17.1 && p.z > 2.8 && p.z < 7.2) { if (p.y < 0.2) { show.add('B'); show.add('G'); } else { show.add('U'); show.add('A'); } }
    for (const [k, g] of Object.entries(this.house.levels)) g.visible = show.has(k);
    this.doll.root.visible = show.has(this.doll.level);
    this.visibleLevels = show;
    this.content.fixtures.mirror.reflector.visible = this.playerRoom?.id === 'bath';
    void order;
  }

  render() {
    if (this.state === 'loading') return;
    this.renderer.info.reset();
    this.post.composer.render();
  }

  debugText() {
    const d = this.doll, p = this.player;
    return `FPS ${this.fps?.toFixed(0)}  calls ${this.renderer.info.render.calls}  tris ${(this.renderer.info.render.triangles / 1000).toFixed(0)}k
ACTE ${this.act}  pièce ${this.playerRoom?.name || '?'}  niveau ${p.level}
Poupée: ${d.state} (${d.reason})  aggro ${d.aggro.toFixed(1)}  suspicion ${d.suspicion.toFixed(2)}  voit ${d.seeing.toFixed(2)}  dist ${d.distToPlayer?.toFixed(1)}
  pièce ${d.room?.name || '?'}  vue par toi ${d.seenByPlayer}  dernier bruit ${JSON.stringify(d.debug.lastNoise)}
Joueur: santé ${p.health.toFixed(0)}  endurance ${p.stamina.toFixed(0)}  peur ${p.fear.toFixed(2)}  jambe ${p.injury.leg.toFixed(2)}  bras ${p.injury.arm.toFixed(2)}  saigne ${p.injury.bleeding}`;
  }
}

function addInv(game, id, n) {
  game.inventory[id] = (game.inventory[id] || 0) + n;
  if (game.inventory[id] <= 0) delete game.inventory[id];
}

export { addInv, saveSettings, readSave };
