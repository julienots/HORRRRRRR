// Visual review: in-game screenshots of key situations (written to tests/out/).
import { withGame } from './harness.mjs';
await withGame('shots', async ({ ev, page }) => {
  const shot = async (name) => { await page.waitForTimeout(200); await page.screenshot({ path: `tests/out/game-${name}.png` }); };
  await shot('menu');
  await ev(() => { const S = window.__SE, g = S.game; S.start('normal'); S.step(0.3); g.director.cooldown = 1e9; g.player.injury.bleeding = false; S.give('flashlight'); g.player.flashOn = true; });
  // flashlight in the dark corridor
  await ev(() => { const S = window.__SE; S.teleport(9.8, 3, 9, -Math.PI / 2, -0.05); S.step(0.5); });
  await shot('corridor-flashlight');
  // the doll seated in the gallery (Act I)
  await ev(() => { const S = window.__SE, g = S.game; g.flags.leftGuest = true; S.teleport(12.2, 3, 15.2, Math.PI * 0.75 + 0.1, -0.25); g.doll.dormantLook = true; S.step(0.6); });
  await shot('gallery-doll-seated');
  // doll chasing in the hall, close
  await ev(() => { const S = window.__SE, g = S.game; g.setAct(3); S.teleport(11, 0, 16.5, 0, 0.0); S.placeDoll(11, 0, 13.2, 0, 'chase'); g.doll.lastKnown = g.player.pos.clone(); g.doll.lastSeenT = g.time; g.doll.attackCD = 99; g.doll.flinchCD = 99; S.step(0.5); });
  await shot('hall-chase');
  // doll walking in the corridor, seen from afar, flashlight
  await ev(() => { const S = window.__SE, g = S.game; S.teleport(16, 0, 17.3, 0, 0); S.placeDoll(16, 0, 10, Math.PI, 'stalk'); g.doll.path = null; g.doll.stalkWatch = -99; S.step(1.2); });
  await shot('corridor-stalk');
  // hiding in a wardrobe, the doll searching outside
  await ev(() => { const S = window.__SE, g = S.game; S.teleport(4.5, 3, 14, 0); S.hide('hide_master_wardrobe'); S.placeDoll(7.5, 3, 12.2, -1.2, 'search'); g.doll.searchEnd = g.time + 99; g.doll.searchPoints = []; g.doll.path = null; g.doll.waitT = 9; S.step(1); });
  await shot('hide-wardrobe');
  await ev(() => { const S = window.__SE, g = S.game; g.exitHide(true); S.teleport(4.5, 3, 14, 0); S.hide('hide_bed_master0'); S.placeDoll(5.5, 3, 15.2, 2.5, 'search'); g.doll.searchEnd = g.time + 99; g.doll.searchPoints = []; g.doll.path = null; g.doll.waitT = 9; S.step(1); });
  await shot('hide-bed');
  // basement with power on
  await ev(() => { const S = window.__SE, g = S.game; g.exitHide(true); g.lights.setPower(true); S.placeDoll(20, 6, -1, 0, 'patrol'); g.doll.active = false; S.teleport(16, -3, 2.0, 0.3, -0.1); S.step(0.5); });
  await shot('cellar-power');
  await ev(() => { const S = window.__SE; S.teleport(13, -3, -4.2, 0, -0.15); S.step(0.5); });
  await shot('ritual');
  await ev(() => { const S = window.__SE; S.teleport(7.5, 3, 9.2, 0.75, -0.1); S.step(0.5); });
  await shot('child-room-power');
  await ev(() => { const S = window.__SE; S.teleport(11.5, 3, 5.6, 0, -0.05); S.step(0.5); });
  await shot('bathroom-mirror');
  await ev(() => { const S = window.__SE; S.teleport(7.5, 0, 16.5, 0.95, -0.12); S.step(0.5); });
  await shot('living-power');
  // UI panels
  await ev(() => { const S = window.__SE, g = S.game; g.lights.setPower(false); S.give('bandage', 2); S.give('battery'); S.give('garageKey'); g.state = 'playing'; g.togglePanel('inventory'); });
  await shot('inventory');
  await ev(() => { const g = window.__SE.game; g.togglePanel('inventory'); g.docsRead.push('augustin'); g.ui.openDoc('augustin'); });
  await shot('document');
  await ev(() => { const g = window.__SE.game; g.ui.closeDoc(); g.state = 'playing'; g.pause(); });
  await shot('pause');
  await ev(() => { const g = window.__SE.game; g.ui.openOptions('#pause'); });
  await shot('options');
  await ev(() => { const S = window.__SE, g = S.game; g.ui.closeSub('#options'); g.resume(); g.state = 'playing'; g.player.health = 5; S.placeDoll(g.player.pos.x, g.player.pos.y, g.player.pos.z - 1, 0, 'chase'); g.doll.active = true; g.doll.lastKnown = g.player.pos.clone(); g.doll.lastSeenT = g.time; g.doll.suspicion = 2; g.doll.attackCD = 0; S.step(1.3); });
  await shot('jumpscare');
  await ev(() => { window.__SE.step(2.5); });
  await shot('death');
});
process.exit(0);
