import { withGame } from './harness.mjs';
await withGame('dbg', async ({ ev }) => {
  console.log(JSON.stringify(await ev(() => {
    const S = window.__SE, g = S.game;
    S.start('normal'); S.step(0.2); S.teleport(11, 0, 16, 0.3); S.step(0.1);
    const cats = {};
    const add = (k, cast) => { cats[k] = cats[k] || [0, 0]; cats[k][0]++; if (cast) cats[k][1]++; };
    g.scene.traverseVisible((o) => {
      if (!o.isMesh && !o.isPoints) return;
      let p = o, cat = 'other';
      while (p) {
        if (p.userData.merged || o.userData.merged) { cat = 'merged-level'; }
        if (p.userData.moving) { cat = 'moving'; break; }
        if (p.userData.keep) { cat = 'keep'; break; }
        if (p.name === 'Doll') { cat = 'doll'; break; }
        if (p.name && p.name.startsWith('level_')) { cat = cat === 'merged-level' ? cat : 'level-unmerged:' + (o.material.name || o.material.type); break; }
        p = p.parent;
      }
      add(cat, o.castShadow);
    });
    return cats;
  })));
});
process.exit(0);
