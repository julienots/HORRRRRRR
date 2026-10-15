// Touch controls on an emulated phone (landscape): real touch events on the stick, look area and buttons.
import { withGame } from './harness.mjs';

const r = await withGame('touch', async ({ page, ev, check }) => {
  check('touch controls created on a touch device', await page.evaluate(() => !!document.getElementById('touch') && window.__SE.game.input.touch));
  await page.tap('#mainbuttons [data-act=new]');
  await page.tap('#diffbuttons [data-diff=easy]');
  await ev(() => { const S = window.__SE, g = S.game; g.testMode = true; g.player.wake = 0.01; g.director.cooldown = 1e9; S.give('flashlight'); g.player.flashOn = false; });
  check('new game started by tapping the menu', await ev(() => window.__SE.state() === 'playing' && window.__SE.game.difficulty === 'easy'));
  const frames = (n) => page.evaluate((n) => new Promise((res) => { let k = 0; const f = () => (++k >= n ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);
  // touch helper dispatching real TouchEvents
  await page.evaluate(() => {
    window.TT = (sel, type, x, y, id = 1) => {
      const el = document.querySelector(sel);
      const t = new Touch({ identifier: id, target: el, clientX: x, clientY: y });
      el.dispatchEvent(new TouchEvent(type, { touches: type === 'touchend' ? [] : [t], changedTouches: [t], bubbles: true, cancelable: true }));
    };
  });
  await frames(3);
  const p0 = await ev(() => window.__SE.player().pos);
  const s = await page.evaluate(() => { const r = document.querySelector('#tstick').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  await page.evaluate(({ x, y }) => { TT('#tstick', 'touchstart', x, y); TT('#tstick', 'touchmove', x, y - 50); }, s);
  check('stick sets an analog axis', await ev(() => window.__SE.game.input.axisY < -0.8));
  await frames(25);
  await page.evaluate(({ x, y }) => TT('#tstick', 'touchend', x, y - 50), s);
  const p1 = await ev(() => window.__SE.player().pos);
  check('virtual stick moves the player', Math.hypot(p1[0] - p0[0], p1[2] - p0[2]) > 0.3, { p0, p1 });
  check('releasing the stick stops input', await ev(() => window.__SE.game.input.axisX === 0 && window.__SE.game.input.axisY === 0));
  const yaw0 = await ev(() => window.__SE.game.player.yaw);
  await page.evaluate(() => { TT('#tlook', 'touchstart', 600, 200, 2); TT('#tlook', 'touchmove', 700, 200, 2); });
  await frames(3);
  await page.evaluate(() => TT('#tlook', 'touchend', 700, 200, 2));
  const yaw1 = await ev(() => window.__SE.game.player.yaw);
  check('dragging on the right side turns the view', Math.abs(yaw1 - yaw0) > 0.1, { yaw0, yaw1 });
  await page.evaluate(() => { TT('#touch [data-a=flashlight]', 'touchstart', 0, 0, 3); TT('#touch [data-a=flashlight]', 'touchend', 0, 0, 3); });
  await frames(3);
  check('"Lampe" button toggles the flashlight', await ev(() => window.__SE.player().flashOn));
  await page.evaluate(() => { TT('#touch [data-a=crouch]', 'touchstart', 0, 0, 4); TT('#touch [data-a=crouch]', 'touchend', 0, 0, 4); });
  await frames(3);
  check('"Accroupi" button crouches', await ev(() => window.__SE.player().crouched));
  await page.evaluate(() => TT('#touch [data-a=holdBreath]', 'touchstart', 0, 0, 5));
  await frames(10);
  const holding = await ev(() => window.__SE.player().holding);
  await page.evaluate(() => TT('#touch [data-a=holdBreath]', 'touchend', 0, 0, 5));
  await frames(3);
  check('"Souffle" button holds the breath while pressed', holding && !(await ev(() => window.__SE.player().holding)));
  await page.evaluate(() => TT('#touch [data-ui=inventory]', 'touchstart', 0, 0, 6));
  check('"Sac" button opens the inventory', await page.isVisible('#inventory'));
  await page.tap('#inventory [data-act=close]');
  await page.evaluate(() => TT('#touch [data-ui=pause]', 'touchstart', 0, 0, 7));
  check('pause button pauses', await page.isVisible('#pause'));
  await page.screenshot({ path: 'tests/out/touch-pause.png' });
  await page.tap('#pause [data-act=resume]');
  await frames(2);
  await page.screenshot({ path: 'tests/out/touch-hud.png' });
  check('resume by tapping', await ev(() => window.__SE.state() === 'playing'));
}, { touch: true, w: 844, h: 390, query: '?touch=1' });
process.exit(r.failed ? 1 : 0);
