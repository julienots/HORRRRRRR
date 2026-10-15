// Brightness check: same scenes at Low quality (phone default), screenshots + mean luminance.
import { withGame } from './harness.mjs';
const tag = process.argv[2] || 'now';
await withGame('bright', async ({ ev, page, boot }) => {
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('superessence.settings.v1', JSON.stringify({ quality: 'low' })); });
  await boot('?touch=1');
  await ev(() => { const S = window.__SE, g = S.game; S.start('normal'); g.director.cooldown = 1e9; g.player.injury.bleeding = false; });
  const lum = async (name) => {
    await page.screenshot({ path: `tests/out/bright-${tag}-${name}.png` });
    return page.evaluate(() => {
      const c = document.getElementById('game');
      window.__SE.render(); const t = document.createElement('canvas'); t.width = 160; t.height = 90;
      const x = t.getContext('2d'); x.drawImage(c, 0, 0, 160, 90);
      const d = x.getImageData(0, 0, 160, 90).data; let s = 0;
      for (let i = 0; i < d.length; i += 4) s += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
      return +(s / (d.length / 4)).toFixed(1);
    });
  };
  const out = {};
  const scene = async (name, f) => { await ev(f); await ev(() => window.__SE.step(6)); out[name] = await lum(name); };
  await scene('wake-room', () => { window.__SE.teleport(20.2, 3, 14.2, 0, -0.1); });
  await scene('corridor-dark', () => { window.__SE.teleport(9.8, 3, 9, -Math.PI / 2, 0); });
  await scene('corridor-flash', () => { const S = window.__SE; S.give('flashlight'); S.game.player.flashOn = true; S.teleport(9.8, 3, 9, -Math.PI / 2, -0.05); });
  await scene('hall-dark', () => { const S = window.__SE; S.game.player.flashOn = false; S.teleport(11, 0, 16.5, 0.2, 0); });
  await scene('cellar-flash', () => { const S = window.__SE; S.game.player.flashOn = true; S.teleport(16, -3, 2, 0.3, -0.1); });
  console.log(tag, JSON.stringify(out));
}, { touch: true, w: 844, h: 390 });
process.exit(0);
