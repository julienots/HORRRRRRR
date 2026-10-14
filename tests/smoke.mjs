// Smoke test: boots the real game, starts a new game, steps the simulation and checks for errors.
import { startServer, launch } from './util.mjs';
const srv = await startServer(5195);
const { browser, page, errors } = await launch(960, 540);
let ok = true;
try {
  await page.goto(srv.url + '/');
  await page.waitForFunction(() => window.__SE && window.__SE.ready(), null, { timeout: 120000 });
  console.log('booted, state', await page.evaluate(() => window.__SE.state()));
  console.log(await page.evaluate(() => { const S = window.__SE; S.start('normal'); S.step(6); return { st: S.state(), p: S.player(), d: S.doll(), nav: S.navStats(), obj: S.objective() }; }));
  await page.screenshot({ path: 'tests/out/smoke-wake.png' });
  console.log(await page.evaluate(() => window.__SE.perf(10)));
} catch (e) { ok = false; console.log('FAIL', e); }
finally {
  if (errors.length) { console.log('ERRORS:\n' + errors.slice(0, 20).join('\n')); }
  await browser.close(); srv.stop();
}
process.exit(ok && !errors.filter(e=>!e.includes('404')&&!e.includes('fonts.g')).length ? 0 : 1);
