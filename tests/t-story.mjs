// Progression tests: full playthrough through the 6 acts using the real interaction code, the three endings,
// save/load, death, wounds & healing, director events and performance.
import { withGame } from './harness.mjs';

const r = await withGame('story', async ({ ev, check, boot, page }) => {
  const defineP = () => {
    const S = window.__SE, g = S.game;
    window.P = {
      take(item, room) {
        const e = g.content.interactables.find((x) => (x.item === item || x.doc === item) && !x.removed && (!room || x.room === room));
        if (!e) return false;
        if (e.drawer) e.drawer.target = e.drawer.open = 1;
        g.interact(e);
        if (g.ui.readerOpen) g.ui.closeDoc();
        g.state = 'playing';
        return true;
      },
      run(sec) { for (let t = 0; t < sec; t += 1 / 30) { g.update(1 / 30); g.input.endFrame(); } },
      calm() { const d = g.doll; if (d.active) { d.place(new S.THREE.Vector3(23, 6, -1.5), 0); d.setState('retreat', 'test'); d.path = null; d.suspicion = 0; d.lastKnown = null; } g.player.health = 100; g.player.injury.bleeding = false; },
    };
  };
  await ev(defineP);

  // ---------------- Act I -> II
  let s = await ev(() => {
    const S = window.__SE, g = S.game;
    S.start('normal'); S.step(0.5);
    g.director.cooldown = 1e9;
    P.take('flashlight');
    S.useDoor('guestDoor'); P.run(1.5);
    S.teleport(15.6, 3, 13.6, 0);
    // look at the doll sitting on the gallery chair
    const d = g.doll; const dx = d.pos.x - 15.6, dz = d.pos.z - 13.6;
    S.look(Math.atan2(-dx, -dz), -0.25);
    P.run(4);
    const lookedBack = d.dormantLook;
    S.look(Math.atan2(dx, dz), 0); // look away
    P.run(1);
    return { act: g.act, active: d.active, lookedBack, dstate: d.state, obj: S.objective() };
  });
  check('Act I: the doll on the chair slowly turns her head while you look at her', s.lookedBack, s);
  check('Act II: when you look away she is gone (awake, moving through the house)', s.act === 2 && s.active && s.dstate !== 'dormant', s);

  // ---------------- Act II: the front door, the letter, the garage key
  s = await ev(() => {
    const S = window.__SE, g = S.game;
    P.calm();
    P.take('letter', 'hall');
    S.useDoor('frontDoor');
    const o1 = S.objective();
    P.take('garageKey');
    return { act: g.act, o1, o2: S.objective(), clues: g.clues.length };
  });
  check('Act II: front door explains what is needed (power + key)', s.o1.includes('garage') || s.o1.includes('clé') || s.o1.includes('courant'), s.o1);
  check('Act III starts when the garage key is found', s.act === 3 && s.o2.toLowerCase().includes('garage'), s);

  // ---------------- Act III: garage -> crowbar -> boarded office
  s = await ev(() => {
    const S = window.__SE, g = S.game;
    P.calm();
    S.useDoor('garageDoor'); P.run(1);
    const garage = S.door('garageDoor');
    P.take('crowbar');
    const o = S.objective();
    S.useDoor('officeDoor');
    P.run(3);
    return { garage, o, office: S.door('officeDoor'), act: g.act };
  });
  check('garage key unlocks the garage', s.garage.locked === false && s.garage.target === 1, s.garage);
  check('crowbar tears the boards off the office door (Act IV)', s.office.boarded === false && s.act === 4, s);

  // ---------------- Act IV: secrets
  s = await ev(() => {
    const S = window.__SE, g = S.game;
    P.calm();
    P.take('atticKey'); P.take('augustin');
    S.interactWith(g.content.fixtures.recorder.id); P.run(6); if (g.ui.readerOpen) g.ui.closeDoc(); g.state = 'playing';
    S.useDoor('atticDoor'); P.run(1);
    P.take('fuse'); P.take('rustyKey'); P.take('newspaper');
    P.take('windingKey'); P.take('marthe1');
    S.interactWith(g.content.fixtures.musicBox.id);
    const noise = S.noises().filter((n) => n.kind === 'music').length;
    P.run(12);
    const sec = S.door('secretDoor');
    P.calm();
    P.take('cellarKey'); P.take('workshop');
    return { noise, secret: g.flags.secretOpen, sec, inv: S.inventory(), docs: S.docs(), obj: S.objective() };
  });
  check('music box plays (loud, the doll can hear it) and reveals the secret passage', s.noise > 0 && s.secret && s.sec.open > 0.8 && s.sec.locked === false, s);
  check('documents and audio log collected in Act IV', s.docs.length >= 6, s.docs);
  check('atelier holds the cellar key', s.inv.cellarKey === 1, s.inv);
  const walkSecret = await ev(() => {
    const S = window.__SE;
    S.teleport(4.5, 3, 5.0, 0); S.hold('forward'); S.step(3); S.hold('forward', false);
    return S.player();
  });
  check('the secret passage is walkable (child room -> atelier)', walkSecret.room === 'atelier', walkSecret.pos);

  // ---------------- Act V: cellar, ritual room, power
  s = await ev(() => {
    const S = window.__SE, g = S.game;
    P.calm();
    S.useDoor('cellarDoor'); P.run(1);
    const act5 = g.act;
    S.useDoor('ritualDoor'); P.run(1);
    P.take('heart'); P.take('frontKey'); P.take('last');
    P.calm();
    S.interactWith(g.content.fixtures.fuseBox.id);
    P.run(0.5);
    return { act5, act6: g.act, power: g.lights.power, flags: S.flags(), obj: S.objective() };
  });
  check('Act V starts at the cellar; the rusty key opens the sealed room', s.act5 === 5 && s.flags.ritualOpen, s);
  check('Act VI: the fuse restores the power (lights, magnetic lock)', s.act6 === 6 && s.power && s.flags.power, s);

  // ---------------- burn the heart, escape -> LIBÉRATION
  s = await ev(() => {
    const S = window.__SE, g = S.game;
    P.calm();
    P.take('lighter');
    S.interactWith(g.content.fixtures.fireplace.id);
    P.run(3.5);
    const destroyed = !!g.doll.destroyed;
    S.useDoor('frontDoor');
    P.run(0.2);
    return { destroyed, state: g.state, ending: g.endingId };
  });
  check('burning the porcelain heart in the fireplace destroys the doll', s.destroyed, s);
  check('ending LIBÉRATION when escaping after burning the heart', s.state === 'ending' && s.ending === 'liberation', s);
  await page.waitForTimeout(1500);
  check('ending screen is displayed', await page.evaluate(() => !document.getElementById('ending').classList.contains('hidden')));

  // ---------------- other endings
  for (const [docs, expected] of [[4, 'survivor'], [1, 'follows']]) {
    await boot();
    await ev(defineP);
    const e = await ev((docs) => {
      const S = window.__SE, g = S.game;
      S.start('normal'); S.step(0.2);
      g.flags.power = true; g.lights.setPower(true);
      g.inventory.frontKey = 1;
      g.docsRead = ['letter', 'marthe1', 'augustin', 'newspaper', 'workshop'].slice(0, docs);
      S.useDoor('frontDoor');
      return g.endingId;
    }, docs);
    check(`ending ${expected.toUpperCase()} (${docs} documents, heart not burned)`, e === expected, e);
  }

  // ---------------- save / load
  await boot();
  await ev(defineP);
  const saved = await ev(() => {
    localStorage.clear();
    const S = window.__SE, g = S.game;
    S.start('nightmare'); S.step(0.3);
    g.director.cooldown = 1e9;
    P.take('flashlight'); P.take('bandage', 'guest');
    g.setAct(3);
    S.useDoor('guestDoor'); P.run(1.2);
    S.teleport(11, 0, 15, 1.2);
    g.player.health = 63; g.player.battery = 42;
    g.doll.place(new S.THREE.Vector3(20, 6, -1), 0);
    S.save();
    return { pos: S.player().pos, act: g.act, inv: S.inventory(), guest: S.door('guestDoor'), picked: g.picked.size };
  });
  await boot('?load=manual');
  await ev(defineP);
  const loaded = await ev(() => {
    const S = window.__SE, g = S.game;
    return { pos: S.player().pos, act: g.act, inv: S.inventory(), guest: S.door('guestDoor'), health: g.player.health, battery: g.player.battery, diff: g.difficulty, pickedStillInWorld: g.content.interactables.filter((e) => g.picked.has(e.id) && !e.removed).length, picked: g.picked.size, state: g.state };
  });
  check('load restores act, difficulty, inventory, health, battery', loaded.act === 3 && loaded.diff === 'nightmare' && loaded.inv.bandage === 1 && Math.round(loaded.health) === 63 && Math.round(loaded.battery) === 42, loaded);
  check('load restores player position and door states', Math.abs(loaded.pos[0] - 11) < 0.1 && Math.abs(loaded.pos[2] - 15) < 0.1 && loaded.guest.target === 1, { saved, loaded });
  check('load removes items already picked up', loaded.picked === saved.picked && loaded.pickedStillInWorld === 0, loaded);
  check('after a reload the game waits for a click (pointer lock)', loaded.state === 'paused');

  // ---------------- death
  const death = await ev(() => {
    const S = window.__SE, g = S.game;
    g.testMode = true; g.state = 'playing';
    g.player.health = 15;
    S.placeDoll(g.player.pos.x, g.player.pos.y, g.player.pos.z - 1.0, 0, 'chase');
    g.doll.lastKnown = g.player.pos.clone(); g.doll.lastSeenT = g.time; g.doll.suspicion = 1.2;
    P.run(5);
    return { dead: g.player.dead, state: g.state };
  });
  await page.waitForTimeout(300);
  check('death: when health reaches zero, jumpscare then death screen', death.dead && death.state === 'dead' && await page.evaluate(() => !document.getElementById('death').classList.contains('hidden')), death);

  // ---------------- wounds, healing, stamina, limp
  await boot();
  await ev(defineP);
  const w = await ev(() => {
    const S = window.__SE, g = S.game, p = g.player;
    S.start('normal'); S.step(0.2);
    g.director.cooldown = 1e9;
    const h0 = p.health;
    P.run(20);
    const bled = h0 - p.health;
    const drops = g.bloodDrops.length;
    S.give('bandage', 1);
    S.useItem('bandage');
    P.run(4);
    const after = { bleeding: p.injury.bleeding, health: p.health, inv: S.inventory().bandage || 0 };
    // limp speed comparison
    const speed = (leg) => { p.injury.leg = leg; S.teleport(4, 0, 17, -Math.PI / 2); S.hold('forward'); P.run(1.5); const x0 = p.pos.x; P.run(1); S.hold('forward', false); return p.pos.x - x0; };
    const healthy = speed(0), hurt = speed(0.9);
    // stamina drains when sprinting
    p.stamina = 100; S.teleport(4, 0, 17, -Math.PI / 2); S.hold('forward'); S.hold('sprint'); P.run(2); S.hold('forward', false); S.hold('sprint', false);
    const stam = p.stamina;
    S.give('painkillers'); S.useItem('painkillers');
    const relief = p.painRelief;
    p.hasFlashlight = true; p.battery = 5; S.give('battery'); S.useItem('battery');
    // breath holding while crouched
    p.crouched = true; S.hold('holdBreath'); P.run(2); const holding = p.holding, breath = p.breath; P.run(8); const gasped = S.noises().some((n) => n.kind === 'gasp'); S.hold('holdBreath', false);
    return { bled, drops, after, healthy, hurt, stam, relief, battery: p.battery, holding, breath, gasped };
  });
  check('bleeding drains health and leaves blood drops', w.bled > 2 && w.drops >= 2, w);
  check('bandage (3 s, stand still) stops the bleeding and heals', w.after.bleeding === false && w.after.inv === 0, w.after);
  check('a wounded leg slows the player down (limp)', w.hurt < w.healthy * 0.85, { healthy: w.healthy, hurt: w.hurt });
  check('sprinting drains stamina', w.stam < 80, w.stam);
  check('painkillers and batteries work', w.relief > 100 && w.battery === 100, w);
  check('holding breath works, and running out of breath makes you gasp (noise)', w.holding && w.breath < 0.9 && w.gasped, w);

  // ---------------- director events (each one fired in a context where it applies)
  const dir = await ev(() => {
    const S = window.__SE, g = S.game;
    g.setAct(3);
    P.calm();
    const out = {};
    const tryEv = (name, setup) => { if (setup) setup(); try { out[name] = g.director.events[name](); } catch (e) { out[name] = 'ERR ' + e.message; } P.run(0.5); };
    tryEv('doorSlam', () => { S.useDoor('serviceDoor'); P.run(1.5); S.teleport(16, 0, 13.5, 0); });
    tryEv('stepsAbove', () => S.teleport(11, 0, 15, 0));
    tryEv('toy', () => S.teleport(4.5, 3, 12.5, Math.PI));
    tryEv('lightOut', () => { g.lights.setPower(true); S.teleport(11, 0, 15, 0); });
    tryEv('radio', () => S.teleport(11, 0, 15, 0));
    tryEv('moveObject', () => S.teleport(13, 3, 9, -Math.PI / 2));
    tryEv('mirror', () => { S.teleport(11.5, 3, 5.2, 0, 0); });
    tryEv('knock', () => S.teleport(11, 0, 15, 0));
    tryEv('appliance', () => S.teleport(21, 0, 12, 0));
    tryEv('traces', () => S.teleport(16, 0, 12, 0));
    tryEv('pipes', () => S.teleport(11, 0, 15, 0));
    tryEv('stalk', () => { S.teleport(16, 0, 17.5, 0); g.doll.place(new S.THREE.Vector3(4, 3, 6), 0); g.doll.setState('patrol', 't'); g.doll.distToPlayer = 20; });
    g.player.fear = 0.8;
    tryEv('whisper', () => S.teleport(11, 0, 15, 0));
    tryEv('windowFigure', () => { S.teleport(2.2, 0, 16.5, 0, 0); g.player.fear = 0.8; });
    g.lights.setPower(false);
    return out;
  });
  const fired = Object.entries(dir).filter(([, v]) => v === true).map(([k]) => k);
  const errs = Object.entries(dir).filter(([, v]) => typeof v === 'string');
  check('director: scare events run without errors', errs.length === 0, errs);
  check('director: every event fires in its context', fired.length === 14, { fired: fired.length, dir });

  // ---------------- performance snapshot (software renderer in CI!)
  const perf = await ev(() => {
    const S = window.__SE;
    const out = {};
    for (const [name, pos] of Object.entries({ hall: [11, 0, 16, 0.3], gallery: [12, 3, 17, 0.2], kitchen: [13, 0, 9, 0.6], cellar: [16, -3, 2, 0.4] })) {
      S.teleport(...pos);
      out[name] = S.perf(5);
    }
    return out;
  });
  const maxCalls = Math.max(...Object.values(perf).map((p) => p.calls));
  check('performance: draw calls per frame stay reasonable (< 700 incl. shadows & post)', maxCalls < 700, perf);
});
process.exit(r.failed ? 1 : 0);
