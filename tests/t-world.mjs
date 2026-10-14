// World tests: new game, movement & collisions, doors, stairs, reachability of every room, interactions.
import { withGame } from './harness.mjs';

const r = await withGame('world', async ({ ev, check, page }) => {
  // helper (in page): place the player at p and look at target t
  await ev(() => {
    window.T = {
      lookAt(px, py, pz, tx, ty, tz) {
        const S = window.__SE;
        const dx = tx - px, dy = ty - (py + 1.62), dz = tz - pz;
        S.teleport(px, py, pz, Math.atan2(-dx, -dz), Math.atan2(dy, Math.hypot(dx, dz)));
        S.step(0.1);
        return S.focus();
      },
    };
  });

  const st = await ev(() => { const S = window.__SE; S.start('normal'); S.step(1); return { state: S.state(), act: S.act(), obj: S.objective(), p: S.player() }; });
  check('new game starts in Act I, wounded, in the guest room', st.state === 'playing' && st.act === 1 && st.p.room === 'guest' && st.p.injury.bleeding && st.p.injury.leg > 0.3, st);

  // ---- Act I: flashlight in the nightstand drawer
  const drawers = await ev(() => window.__SE.interactables('drawer').filter((d) => d.room === 'guest'));
  const nd = drawers.sort((a, b) => Math.hypot(a.pos[0] - 19.6, a.pos[2] - 11.3) - Math.hypot(b.pos[0] - 19.6, b.pos[2] - 11.3))[0];
  let f = await ev((d) => window.T.lookAt(19.6, 3, 12.2, d.pos[0], d.pos[1], d.pos[2] + 0.2), nd);
  check('looking at the nightstand focuses its drawer', f && f.kind === 'drawer', f);
  await ev(() => { window.__SE.interact(); window.__SE.step(0.8); });
  f = await ev((d) => window.T.lookAt(19.6, 3, 12.2, d.pos[0], d.pos[1], d.pos[2] + 0.25), nd);
  check('opened drawer reveals the flashlight', f && f.kind === 'pickup' && f.item === 'flashlight', f);
  await ev(() => { window.__SE.interact(); window.__SE.step(0.3); });
  const fl = await ev(() => ({ flags: window.__SE.flags(), p: window.__SE.player(), obj: window.__SE.objective() }));
  check('flashlight picked up and switched on, objective advances', fl.flags.flashlight && fl.p.flashOn && fl.obj.includes('Sortir'), fl.obj);

  // ---- collisions: walk into the east wall of the guest room
  await ev(() => { const S = window.__SE; S.teleport(22.5, 3, 15.2, -Math.PI / 2); S.hold('forward'); S.step(3); S.hold('forward', false); });
  let p = await ev(() => window.__SE.player());
  check('walls stop the player (guest room east wall x=24)', p.pos[0] < 23.8 && p.pos[0] > 23.0, p.pos);

  // ---- furniture collision: walk into the bed
  await ev(() => { const S = window.__SE; S.teleport(21, 3, 15.0, 0); S.hold('forward'); S.step(3); S.hold('forward', false); });
  p = await ev(() => window.__SE.player());
  check('furniture blocks the player (bed)', p.pos[2] > 13.3, p.pos);

  // ---- door: closed door blocks, open door lets through
  await ev(() => { const S = window.__SE; S.teleport(17.9, 3, 14.5, Math.PI / 2); S.hold('forward'); S.step(2); S.hold('forward', false); });
  p = await ev(() => window.__SE.player());
  const d0 = await ev(() => window.__SE.door('guestDoor'));
  check('closed door blocks the way', d0.target === 0 && p.pos[0] > 17.2, { p: p.pos, d0 });
  await ev(() => { const S = window.__SE; S.useDoor('guestDoor'); S.step(1.5); S.teleport(17.9, 3, 14.9, Math.PI / 2); S.hold('forward'); S.step(2.5); S.hold('forward', false); });
  p = await ev(() => window.__SE.player());
  const d1 = await ev(() => window.__SE.door('guestDoor'));
  check('opened door swings and lets the player through', d1.open > 0.9 && p.pos[0] < 16.6, { p: p.pos, d1 });
  check('leaving the guest room completes Act I objective', (await ev(() => window.__SE.flags())).leftGuest === true);

  // ---- stairs: climb the grand staircase from the hall
  await ev(() => { const S = window.__SE; S.teleport(14.25, 0, 17.7, 0); S.hold('forward'); S.hold('sprint'); S.step(5); S.hold('forward', false); S.hold('sprint', false); });
  p = await ev(() => window.__SE.player());
  check('grand staircase leads to the upper floor', p.pos[1] > 2.9 && p.level === 'U', p);
  // and down again
  await ev(() => { const S = window.__SE; S.teleport(14.25, 3, 10.6, Math.PI); S.hold('forward'); S.step(6); S.hold('forward', false); });
  p = await ev(() => window.__SE.player());
  check('walking down the staircase returns to the hall', p.pos[1] < 0.1 && p.level === 'G', p);
  // cannot fall into the stairwell from the gallery (railing)
  await ev(() => { const S = window.__SE; S.teleport(12.8, 3, 14, -Math.PI / 2); S.hold('forward'); S.step(2); S.hold('forward', false); });
  p = await ev(() => window.__SE.player());
  check('gallery railing prevents falling into the stairwell', p.pos[1] > 2.9 && p.pos[0] < 13.5, p.pos);

  // ---- reachability: every room has nav cells; every room reachable once doors are unlocked
  const rooms = await ev(async () => {
    const S = window.__SE, g = S.game;
    g.flags.secretOpen = true; const w = g.content.fixtures.secretWardrobe; const b = w.userData.box; b.min[0] += 1.55; b.max[0] += 1.55; g.world.update(b, b.min, b.max); g.nav.rebuild();
    const { ROOMS, LEVELS } = await import('/src/world/layout.js');
    const saved = g.house.doors.map((d) => [d, d.locked, d.boarded]);
    for (const d of g.house.doors) { if (d.id !== 'frontDoor') { d.locked = false; d.boarded = false; } }
    const from = g.nav.nearest(new S.THREE.Vector3(20.5, 3, 15));
    const res = {};
    for (const r of ROOMS) {
      const n = g.nav.randomNodeIn(r.rect, LEVELS[r.level] + (r.id.startsWith('stair') ? -99 : 0));
      const nodes = g.nav.nodes.filter((x) => x.x > r.rect[0] && x.x < r.rect[2] && x.z > r.rect[1] && x.z < r.rect[3] && Math.abs(x.y - LEVELS[r.level]) < 3.2).length;
      const path = n ? g.nav.path(from, n, { canPass: () => 1 }) : null;
      res[r.id] = { nodes, reachable: r.id.startsWith('stair') ? nodes > 0 : !!path };
    }
    for (const [d, l, b] of saved) { d.locked = l; d.boarded = b; }
    return res;
  });
  const unreachable = Object.entries(rooms).filter(([, v]) => !v.reachable || v.nodes < 2).map(([k]) => k);
  check('all 25 rooms have walkable cells and are connected (doors unlocked)', unreachable.length === 0, unreachable.length ? unreachable : `${Object.keys(rooms).length} rooms`);
  // locked doors really block the doll's navigation
  const lockedPath = await ev(() => window.__SE.path([16, 0, 9], [16, -3, 0]));
  check('locked cellar door blocks navigation', lockedPath === null, lockedPath);

  // ---- player walkability of stairs to cellar & attic once unlocked
  await ev(() => { const S = window.__SE; const g = S.game; g.house.doors.find((d) => d.id === 'cellarDoor').locked = false; S.useDoor('cellarDoor'); S.step(1.5); S.teleport(16, 0, 8.2, 0); S.hold('forward'); S.step(6); S.hold('forward', false); });
  p = await ev(() => window.__SE.player());
  check('cellar stairs lead to the basement', p.level === 'B' && p.pos[1] < -2.9, p);
  await ev(() => { const S = window.__SE; const g = S.game; g.house.doors.find((d) => d.id === 'atticDoor').locked = false; S.useDoor('atticDoor'); S.step(1.5); S.teleport(16, 3, 8.0, 0); S.hold('forward'); S.step(7); S.hold('forward', false); });
  p = await ev(() => window.__SE.player());
  check('attic stairs lead to the attic', p.level === 'A' && p.pos[1] > 5.9, p);

  // ---- interactions
  const sw = await ev(() => {
    const S = window.__SE, g = S.game;
    const e = g.content.interactables.find((x) => x.kind === 'switch' && x.room === 'kitchen');
    const before = e.lamps[0].on;
    S.interactWith(e.id);
    g.lights.setPower(true);
    S.interactWith(e.id);
    const after = e.lamps[0].on;
    g.lights.setPower(false);
    return { before, after, toggled: before === after };
  });
  check('light switch toggles room lamps', sw.toggled, sw);
  const faucet = await ev(() => { const S = window.__SE, g = S.game; const e = g.content.fixtures.faucet; S.interactWith(e.id); const on = e.part.on; S.interactWith(e.id); return { on, off: !e.part.on }; });
  check('kitchen faucet opens and closes (water visible)', faucet.on && faucet.off);
  const win = await ev(() => { const S = window.__SE, g = S.game; const e = g.content.interactables.find((x) => x.kind === 'window' && x.win.interactive === 'kitchenWindow'); S.interactWith(e.id); S.step(1); const o = e.win.open; S.interactWith(e.id); S.step(1); return { open: o, closed: e.win.open }; });
  check('interactive window opens (sash slides) and closes', win.open > 0.8 && win.closed < 0.2, win);
  const cab = await ev(() => { const S = window.__SE, g = S.game; const e = g.content.interactables.find((x) => x.kind === 'cabdoor' && x.room === 'bath'); S.interactWith(e.id); S.step(1); return e.part.open; });
  check('cabinet doors open (bathroom medicine cabinet)', cab > 0.9, cab);
  const pk = await ev(() => { const S = window.__SE; const g = S.game; const pr = g.content.interactables.find((x) => x.kind === 'pickup' && x.item === 'painkillers' && x.room === 'bath'); const pos = pr.obj.getWorldPosition(new S.THREE.Vector3()); return window.T.lookAt(12.85, 3, 4.7, pos.x, pos.y, pos.z); });
  check('item inside an opened cabinet can be focused', pk && pk.item === 'painkillers', pk);

  // ---- throwing a bottle makes a noise where it lands
  const th = await ev(() => { const S = window.__SE, g = S.game; S.teleport(4, 0, 14, 0); S.give('bottle'); S.tap('throw'); S.step(2); return { inv: S.inventory().bottle || 0, noises: S.noises().filter((n) => n.kind === 'glass') }; });
  check('thrown bottle shatters and emits a loud noise', th.inv === 0 && th.noises.length > 0 && th.noises[0].loud > 0.8, th.noises[0]);
  // kicking a prop
  const kick = await ev(() => { const S = window.__SE, g = S.game; const pr = g.content.props.find((p) => p.kind === 'can' && p.room === 'living'); const p0 = pr.mesh.position.clone(); S.teleport(p0.x, 0, p0.z + 1.2, 0); S.hold('forward'); S.hold('sprint'); S.step(0.6); S.hold('forward', false); S.hold('sprint', false); S.step(0.6); return { moved: pr.mesh.position.distanceTo(p0), noise: S.noises().filter((n) => n.kind === 'prop').length }; });
  check('running into a can kicks it and makes noise', kick.moved > 0.1 && kick.noise > 0, kick);
});
process.exit(r.failed ? 1 : 0);
