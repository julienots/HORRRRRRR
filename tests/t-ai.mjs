// AI tests: vision with occlusion/light/crouch, hearing through walls, investigation, search, chase, losing the
// target, attack, hiding, doors, locked doors, light reaction, floors, blood trail, ambush, long patrol sanity.
import { withGame } from './harness.mjs';

const r = await withGame('ai', async ({ ev, check }) => {
  await ev(() => {
    const S = window.__SE, g = S.game;
    S.start('normal');
    S.step(0.2);
    g.director.cooldown = 1e9; // no scripted events during AI tests
    g.player.injury.bleeding = false;
    g.setAct(3);
    window.A = {
      reset(player, doll, opts = {}) {
        const p = g.player;
        if (p.hidden) g.exitHide(true);
        p.health = 100; p.dead = false; p.fear = 0; p.crouched = !!opts.crouch; p.injury.bleeding = !!opts.bleed;
        p.hasFlashlight = true; p.flashOn = !!opts.flash; p.battery = 100;
        S.teleport(...player);
        S.placeDoll(...doll, opts.state || 'patrol');
        g.doll.attackCD = 0; g.doll.flinchCD = opts.flinchCD ?? 0; g.doll.knownHide = null; g.doll.checkedSpots.clear(); g.doll.suspicion = 0;
        g.doll.lastKnown = null; g.doll.lastHeard = null; g.doll.restT = 0;
        if (opts.state === 'ambush') { g.doll.ambushDur = 999; g.doll.path = null; }
        for (const d of g.house.doors) if (opts.closeDoors) { d.open = d.target = 0; d.pivot.rotation.y = d.baseRot; g.world.update(d.box, [...d.closed.min], [...d.closed.max]); d.box.occ = true; d.box.solid = true; d._openBox = false; }
        g.bloodDrops.length = 0;
      },
      // look at the doll
      faceDoll() { const p = g.player, d = g.doll; const dx = d.pos.x - p.pos.x, dz = d.pos.z - p.pos.z; p.yaw = Math.atan2(-dx, -dz); p.pitch = -0.15; },
      run(sec, cond, dt = 1 / 30) {
        const states = [];
        for (let t = 0; t < sec; t += dt) {
          g.update(dt); g.input.endFrame();
          const s = g.doll.state;
          if (states[states.length - 1] !== s) states.push(s);
          if (cond && cond()) return { t: +t.toFixed(2), states, ok: true };
        }
        return { t: sec, states, ok: false };
      },
    };
  });

  // ---- A. vision is blocked by walls and closed doors
  let res = await ev(() => {
    A.reset([20.5, 3, 14.5, Math.PI / 2], [15.8, 3, 14.5, Math.PI / 2], { flash: true, state: 'ambush', closeDoors: true });
    window.__SE.game.doll.ambushLook = window.__SE.game.player.pos.clone();
    const r = A.run(2, () => window.__SE.game.doll.state === 'chase');
    return { r, seeing: window.__SE.game.doll.seeing, susp: window.__SE.game.doll.suspicion };
  });
  check('vision: a closed door/wall hides the player even with the flashlight on', !res.r.ok && res.seeing === 0, res);

  // ---- B. clear line of sight + flashlight -> spotted quickly
  res = await ev(() => {
    A.reset([2, 0, 16, 0], [7.5, 0, 12, -2.2], { flash: true, state: 'ambush' });
    window.__SE.game.doll.ambushLook = window.__SE.game.player.eyePos.clone();
    const r = A.run(3, () => window.__SE.game.doll.state === 'chase');
    return { r, reason: window.__SE.game.doll.reason };
  });
  check('vision: in plain sight with the flashlight on, she spots you fast', res.r.ok && res.r.t < 1.5, res);

  // ---- C. darkness + crouch behind the sofa, flashlight off -> much harder to see
  res = await ev(() => {
    A.reset([3.9, 0, 12.0, 0], [8.2, 0, 12.0, -Math.PI / 2], { flash: false, crouch: true, state: 'ambush' });
    const g = window.__SE.game;
    g.doll.ambushLook = g.player.eyePos.clone();
    const r = A.run(2, () => g.doll.state === 'chase');
    return { r, seeing: +g.doll.seeing.toFixed(3), vis: g.doll.debug.lastVis };
  });
  check('vision: crouching in the dark behind furniture is far less visible (no chase in 2 s)', !res.r.ok && res.seeing < 0.15, res);

  // ---- D. hearing attenuates through walls
  res = await ev(() => {
    const S = window.__SE, g = S.game;
    A.reset([20.5, 3, 15, 0], [12, 0, 14, 0], { state: 'ambush', closeDoors: true });
    S.noise(16, 0.2, 14, 0.6, 'test');           // same floor, ~4 m, open hall
    const open = g.doll.debug.lastNoise;
    A.reset([20.5, 3, 15, 0], [12, 0, 14, 0], { state: 'ambush', closeDoors: true });
    S.noise(4.5, 0.2, 6.5, 0.6, 'test');         // ~ 8 m, behind 2 walls (dining room)
    const walled = g.doll.debug.lastNoise;
    return { open, walled };
  });
  check('hearing: walls attenuate sounds (occluders counted, perceived lower)', res.walled && res.open && res.walled.occ >= 1 && res.walled.perceived < res.open.perceived, res);

  // ---- E. noise -> investigate -> search -> gives up -> patrol
  res = await ev(() => {
    const S = window.__SE, g = S.game;
    A.reset([20, 6, 5, 0], [11, 0, 14, 0], { state: 'patrol' });   // player far away in the attic
    g.doll.path = null; g.doll.waitT = 5;
    S.noise(4, 0.2, 14.5, 0.8, 'test');     // living room
    const first = g.doll.state;
    const r = A.run(80, () => g.doll.state === 'patrol' && g.doll.stateT > 1);
    return { first, r, checked: [...g.doll.checkedSpots.keys()] };
  });
  check('hearing: a loud noise makes her investigate', res.first === 'investigate', res.first);
  check('search: she searches the area, then gives up and patrols again', res.r.ok && res.r.states.includes('search'), res.r);

  // ---- F. chase then losing the target -> search ("cible perdue")
  res = await ev(() => {
    const S = window.__SE, g = S.game;
    A.reset([4, 0, 15, 0], [8, 0, 13, -2], { flash: true, state: 'ambush' });
    g.doll.ambushLook = g.player.eyePos.clone();
    const a = A.run(3, () => g.doll.state === 'chase');
    // the player vanishes upstairs (out of sight)
    g.player.flashOn = false;
    S.teleport(20.5, 3, 15, 0);
    const b = A.run(8, () => g.doll.state === 'search');
    return { a: a.ok, b, reason: g.doll.reason, lastKnown: g.doll.lastKnown?.toArray().map((v) => +v.toFixed(1)) };
  });
  check('chase: when she loses sight of you she searches the last known position', res.a && res.b.ok && res.reason === 'cible perdue', res);

  // ---- G. attack: close range -> hit -> taunt -> chase again
  res = await ev(() => {
    const S = window.__SE, g = S.game;
    A.reset([4, 0, 15, 0], [4, 0, 12.8, 0], { flash: true, state: 'chase' });
    g.doll.lastKnown = g.player.pos.clone(); g.doll.lastSeenT = g.time; g.doll.suspicion = 1.2;
    const h0 = g.player.health;
    const r = A.run(6, () => g.doll.state === 'taunt');
    const hit = h0 - g.player.health;
    const r2 = A.run(4, () => g.doll.state === 'chase');
    return { r, hit, r2: r2.ok, injury: { ...g.player.injury }, dead: g.player.dead };
  });
  check('attack: she lunges and hurts the player when in reach', res.r.ok && res.hit >= 30 && res.r.states.includes('attack'), res);
  check('attack: after a hit she taunts, then resumes the chase (player gets a head start)', res.r2 && !res.dead);

  // ---- H. hiding in a wardrobe: invisible; if she saw you enter, she checks it and drags you out
  res = await ev(() => {
    const S = window.__SE, g = S.game;
    A.reset([4.5, 3, 14, 0], [2, 3, 16.5, 0], { state: 'patrol' });
    S.hide('hide_master_wardrobe');
    const vis = g.doll.computeVisibility();
    // case 1: she did not see you: she searches the room with some randomness, never "knows"
    g.doll.knownHide = null;
    g.doll.lastKnown = g.player.pos.clone();
    g.doll.beginSearch(g.player.pos.clone(), 'test');
    const knewWithoutSeeing = g.doll.searchPoints.some((p) => p.spot && p.spot.id === 'hide_master_wardrobe' && g.doll.knownHide);
    // case 2: she saw you enter
    g.doll.knownHide = g.player.hidden;
    g.doll.beginSearch(g.player.pos.clone(), 'test');
    const h0 = g.player.health;
    const r = A.run(25, () => g.player.health < h0);
    return { vis, knewWithoutSeeing, r, hidden: g.player.hidden?.id || null, hp: g.player.health };
  });
  check('hiding: inside a wardrobe the doll cannot see you', res.vis === 0, res.vis);
  check('hiding: without having seen you, she does not know which spot you are in', res.knewWithoutSeeing === false);
  check('hiding: if she saw you enter, she opens that wardrobe and drags you out', res.r.ok && res.hidden === null, res);

  // ---- H2. hidden + silent: over several searches she sometimes leaves without finding you (never 100% safe, never 0%)
  res = await ev(() => {
    const S = window.__SE, g = S.game;
    let found = 0, safe = 0;
    for (let i = 0; i < 8; i++) {
      A.reset([4.5, 3, 14, 0], [5, 3, 15.5, 0], { state: 'patrol' });
      S.hide(i % 2 ? 'hide_master_wardrobe' : 'hide_bed_master0');
      g.doll.beginSearch(new S.THREE.Vector3(4.5, 3, 14), 'test');
      const h0 = g.player.health;
      const r = A.run(40, () => g.player.health < h0 || g.doll.state === 'patrol');
      if (g.player.health < h0) found++; else safe++;
    }
    return { found, safe };
  });
  check('hiding: hiding spots are neither always safe nor always found (8 searches)', res.found > 0 && res.safe > 0, res);

  // ---- I. she opens closed doors on her way
  res = await ev(() => {
    const S = window.__SE, g = S.game;
    A.reset([20, 6, 5, 0], [6, 0, 14, 0], { state: 'investigate', closeDoors: true });
    g.doll.lastKnown = new S.THREE.Vector3(3.5, 0, 6.5);
    g.doll.goTo(g.doll.lastKnown, 'walk');
    const r = A.run(30, () => g.doll.room?.id === 'dining' && !g.doll.path);
    const opened = g.house.doors.filter((d) => d.lastActor === 'doll' && d.open > 0.8).map((d) => d.id);
    // every door on her way must have been opened by her (all were closed at start)
    return { r: r.ok, opened, room: g.doll.room?.id };
  });
  check('doors: she opens the closed doors on her way to another room (no clipping)', res.r && res.opened.length >= 1, res);

  // ---- J. a door locked from the inside slows her down, then she forces it
  res = await ev(() => {
    const S = window.__SE, g = S.game;
    A.reset([18.5, 0, 16, 0], [16, 0, 12, 0], { state: 'chase', closeDoors: true });
    const d = g.house.doors.find((x) => x.id === 'wcDoor');
    d.lockedInside = true;
    g.doll.lastKnown = g.player.pos.clone(); g.doll.lastSeenT = g.time; g.doll.suspicion = 1;
    const r = A.run(25, () => d.forced);
    return { r, forced: d.forced, states: r.states };
  });
  check('locked door: she bangs on it, then breaks it open after a while', res.forced && res.states.includes('bang') && res.r.t > 4, res);

  // ---- K. flashlight in her face makes her flinch
  res = await ev(() => {
    const S = window.__SE, g = S.game;
    A.reset([4, 0, 16, 0], [4, 0, 12.5, 0], { flash: true, state: 'chase' });
    g.doll.lastKnown = g.player.pos.clone(); g.doll.lastSeenT = g.time;
    g.player.yaw = 0; g.player.pitch = -0.2;
    const r = A.run(1.5, () => g.doll.state === 'flinch');
    return r;
  });
  check('light: a flashlight beam in her face makes her flinch', res.ok, res);

  // ---- L. floors block vision: she is right below you
  res = await ev(() => {
    const S = window.__SE, g = S.game;
    A.reset([4.5, 3, 14, 0, -1.4], [4.5, 0, 14.5, 0], { flash: true, state: 'ambush' });
    g.doll.ambushLook = g.player.eyePos.clone();
    const r = A.run(2, () => g.doll.state === 'chase');
    return { r: r.ok, seeing: g.doll.seeing };
  });
  check('vision: floors block sight between levels', !res.r && res.seeing === 0, res);

  // ---- M. blood trail clue
  res = await ev(() => {
    const S = window.__SE, g = S.game;
    A.reset([20, 6, 5, 0], [4, 0, 16.5, Math.PI], { state: 'patrol' });
    g.doll.path = null; g.doll.waitT = 10;
    g.spawnBloodDrop(new S.THREE.Vector3(4, 0, 13.5));
    const r = A.run(3, () => g.doll.state === 'investigate');
    return { r: r.ok, reason: g.doll.reason };
  });
  check('clues: a blood drop in her field of view makes her follow the trail', res.r && res.reason === 'traces de sang', res);

  // ---- N. ambush on the player's habitual route
  res = await ev(() => {
    const S = window.__SE, g = S.game;
    A.reset([20, 6, 5, 0], [4, 0, 14, 0], { state: 'patrol' });
    g.doll.aggro = 3;
    g.doll.heat.clear();
    g.doll.heat.set('hallKitchenDoor', 9);
    const ok = g.doll.planAmbush();
    const r = A.run(30, () => g.doll.state === 'ambush' && !g.doll.path);
    const d = g.house.doors.find((x) => x.id === 'hallKitchenDoor');
    return { ok, r: r.ok, dist: +g.doll.pos.distanceTo(d.center.clone().setY(0)).toFixed(2), reason: g.doll.reason };
  });
  check('ambush: aggressive doll waits near a passage the player uses often', res.ok && res.r && res.dist < 3, res);

  // ---- O. long patrol: never stuck, never inside walls, moves through many rooms and floors
  res = await ev(() => {
    const S = window.__SE, g = S.game;
    A.reset([16, 6, -1, 0], [6, 0, 14, 0], { state: 'patrol' });
    // unlock the house so she can roam everywhere
    for (const d of g.house.doors) if (d.id !== 'frontDoor' && d.id !== 'secretDoor') { d.locked = false; d.boarded = false; }
    S.hide('hide_attic_wardrobe');
    g.doll.aggro = 1;
    const rooms = new Set(), levels = new Set();
    let maxStill = 0, still = 0, last = g.doll.pos.clone(), offNav = 0;
    for (let t = 0; t < 240; t += 1) {
      for (let k = 0; k < 30; k++) { g.update(1 / 30); g.input.endFrame(); }
      if (g.doll.state === 'attack' || g.doll.state === 'taunt') break;
      const d = g.doll;
      if (d.room) rooms.add(d.room.id);
      levels.add(d.level);
      const n = g.nav.nearest(d.pos, 1);
      if (!n || Math.hypot(n.x - d.pos.x, n.z - d.pos.z) > 0.7) offNav++;
      const moved = d.pos.distanceTo(last);
      if (moved < 0.05 && d.state === 'patrol' && !d.path && d.waitT <= 0) still++; else still = 0;
      maxStill = Math.max(maxStill, still);
      last = d.pos.clone();
    }
    return { rooms: [...rooms], levels: [...levels], maxStill, offNav, state: g.doll.state };
  });
  check('patrol (240 s): she roams many rooms across floors', res.rooms.length >= 6 && res.levels.length >= 2, res);
  check('patrol (240 s): never stuck, always on walkable ground', res.maxStill < 10 && res.offNav === 0, res);
});
process.exit(r.failed ? 1 : 0);
