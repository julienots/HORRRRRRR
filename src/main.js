// Entry point: boots the game, runs the loop, exposes a debug/test API (window.__SE).
import * as THREE from 'three';
import { Game } from './game/game.js';
import { latestSave } from './core/save.js';

const game = new Game();
const loadText = document.getElementById('loadtext');
const frame = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));

async function boot() {
  try {
    await game.init(async (msg) => { loadText.textContent = msg; await frame(); });
  } catch (e) {
    loadText.textContent = 'Erreur de chargement : ' + e.message;
    console.error(e);
    return;
  }
  document.getElementById('loading').classList.add('hidden');
  const params = new URLSearchParams(location.search);
  if (params.get('new')) { game.newGame(params.get('new')); history.replaceState(null, '', location.pathname); }
  else if (params.get('load')) { game.continueGame(); history.replaceState(null, '', location.pathname); }
  else game.ui.showMenu(!!latestSave());
  if (game.state === 'playing') {
    // browsers require a click to lock the pointer after a reload
    document.getElementById('clicktoplay').classList.remove('hidden');
    game.state = 'paused';
  }
  window.__SE = makeTestAPI(game);
  let last = performance.now();
  let fpsAcc = 0, fpsN = 0;
  const loop = (now) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    fpsAcc += dt; fpsN++;
    if (fpsAcc > 0.5) { game.fps = fpsN / fpsAcc; fpsAcc = 0; fpsN = 0; }
    if (!game.manualStep) {
      game.update(dt);
      game.render();
    }
    game.input.endFrame();
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

// Automation hooks used by the Playwright test-suite (tests/*.mjs). They drive the real game systems.
function makeTestAPI(g) {
  const V = (a) => new THREE.Vector3(...a);
  return {
    game: g,
    THREE,
    ready: () => g.state !== 'loading',
    start(diff = 'normal') { g.testMode = true; g.newGame(diff); g.state = 'playing'; return g.state; },
    // advance the simulation deterministically by `sec` seconds (fixed dt), rendering once at the end
    step(sec = 1, dt = 1 / 30, render = true) {
      g.manualStep = true;
      const n = Math.round(sec / dt);
      for (let i = 0; i < n; i++) { g.update(dt); g.input.endFrame(); }
      if (render) g.render();
      return g.state;
    },
    resumeLoop() { g.manualStep = false; },
    teleport(x, y, z, yaw = 0, pitch = 0) {
      const p = g.player;
      if (p.hidden) g.exitHide(true);
      p.pos.set(x, y, z); p.yaw = yaw; p.pitch = pitch; p.vel.set(0, 0, 0); p.locked = false; p.wake = 0;
      p.updateCamera(0.016, g.input, false, false);
    },
    look(yaw, pitch = 0) { g.player.yaw = yaw; g.player.pitch = pitch; },
    hold(action, on = true) { g.input.hold(action, on); },
    tap(action) { g.input.tap(action); },
    give(id, n = 1) { if (id === 'flashlight') { g.player.hasFlashlight = true; g.flags.flashlight = true; } else g.inventory[id] = (g.inventory[id] || 0) + n; },
    flag(k, v = true) { g.flags[k] = v; },
    setAct(n) { g.setAct(n); },
    focus() { const f = g.focus; return f ? { kind: f.kind, id: f.id, item: f.item, doc: f.doc, prompt: g.promptFor(f) } : null; },
    interact() { if (g.focus) g.interact(g.focus); return !!g.focus; },
    door(id) { const d = g.house.doors.find((x) => x.id === id); return d && { open: +d.open.toFixed(2), target: d.target, locked: d.locked, lockedInside: d.lockedInside, forced: d.forced, boarded: d.boarded }; },
    useDoor(id) { g.useDoor(g.house.doors.find((x) => x.id === id)); },
    player() {
      const p = g.player;
      return { pos: p.pos.toArray().map((v) => +v.toFixed(2)), level: p.level, room: g.playerRoom?.id, health: +p.health.toFixed(1), stamina: +p.stamina.toFixed(1), fear: +p.fear.toFixed(2), injury: { ...p.injury }, battery: +p.battery.toFixed(1), flashOn: p.flashOn, hidden: p.hidden?.id || null, crouched: p.crouched, dead: p.dead, holding: p.holding, breath: +p.breath.toFixed(2), speed: +p.speedNow.toFixed(2), painRelief: p.painRelief };
    },
    doll() {
      const d = g.doll;
      return { pos: d.pos.toArray().map((v) => +v.toFixed(2)), level: d.level, room: d.room?.id, state: d.state, reason: d.reason, active: d.active, suspicion: +d.suspicion.toFixed(2), seeing: +d.seeing.toFixed(2), dist: +(d.distToPlayer || 0).toFixed(2), aggro: d.aggro, lastNoise: d.debug.lastNoise, checking: d.checkingSpot?.spot.id || null, path: d.path ? d.path.length : 0, knownHide: d.knownHide?.id || null };
    },
    placeDoll(x, y, z, yaw = 0, state = 'patrol') { const d = g.doll; d.active = true; d.aggro = Math.max(d.aggro, 1); d.place(V([x, y, z]), yaw); d.path = null; d.checkingSpot = null; d.suspicion = 0; d.setState(state, 'test'); d.waitT = 0; },
    dollGoTo(x, y, z, mode = 'walk') { return g.doll.goTo(V([x, y, z]), mode); },
    noise(x, y, z, loud, kind = 'test') { g.noise(V([x, y, z]), loud, kind); },
    hide(id) { const s = g.content.hides.find((h) => h.id === id); if (s) g.enterHide(s); return !!s; },
    hides() { return g.content.hides.map((h) => ({ id: h.id, kind: h.kind, room: h.room, pos: h.pos.toArray().map((v) => +v.toFixed(2)) })); },
    exitHide() { g.exitHide(); },
    state: () => g.state,
    flags: () => ({ ...g.flags }),
    inventory: () => ({ ...g.inventory }),
    act: () => g.act,
    objective: () => g.currentObjective(),
    docs: () => [...g.docsRead],
    events: () => g.events.log.slice(-40),
    director: () => g.director.log,
    noises: () => g.noiseLog.slice(-20),
    save: () => g.saveGame(true),
    serialize: () => g.serialize(),
    pickupAll(room) { const list = g.content.interactables.filter((e) => (e.kind === 'pickup' || e.kind === 'doc') && !e.removed && (!room || e.room === room)); for (const e of list) e.kind === 'doc' ? (g.readDoc(e), g.ui.closeDoc()) : g.pickup(e); return list.map((e) => e.item || e.doc); },
    pickups() { return g.content.interactables.filter((e) => (e.kind === 'pickup' || e.kind === 'doc') && !e.removed).map((e) => ({ id: e.id, item: e.item, doc: e.doc, room: e.room, pos: e.obj.getWorldPosition(new THREE.Vector3()).toArray().map((v) => +v.toFixed(2)) })); },
    interactables(kind) { return g.content.interactables.filter((e) => !kind || e.kind === kind).map((e) => ({ id: e.id, kind: e.kind, room: e.room, pos: e.obj.getWorldPosition(new THREE.Vector3()).toArray().map((v) => +v.toFixed(2)) })); },
    interactWith(id) { const e = g.content.interactables.find((x) => x.id === id); if (!e) return false; g.interact(e); return true; },
    useItem: (id) => g.useItem(id),
    render: () => { g.render(); return g.renderer.info.render.calls; },
    perf(frames = 30) {
      const t0 = performance.now();
      for (let i = 0; i < frames; i++) { g.update(1 / 60); g.render(); g.input.endFrame(); }
      const ms = (performance.now() - t0) / frames;
      return { msPerFrame: +ms.toFixed(1), calls: g.renderer.info.render.calls, triangles: g.renderer.info.render.triangles, geometries: g.renderer.info.memory.geometries, textures: g.renderer.info.memory.textures };
    },
    navStats() { return { nodes: g.nav.nodes.length, links: g.nav.nodes.reduce((a, n) => a + n.links.length, 0) / 2 }; },
    path(a, b) { const p = g.nav.path(V(a), V(b), { canPass: g.doll.canPass }); return p ? { n: p.length, len: +g.nav.pathLength(p).toFixed(1) } : null; },
    lineBlocked(a, b) { return !!g.world.lineBlocked(V(a), V(b)); },
    ground(x, z, y) { const r = g.world.groundAt(x, z, y); return r ? +r.y.toFixed(2) : null; },
  };
}

boot();
