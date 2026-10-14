import { startServer, launch } from './util.mjs';
const srv = await startServer(5196);
const { browser, page, errors } = await launch(720, 720);
try {
  await page.goto(srv.url + '/tests/pages/doll.html');
  await page.waitForFunction(() => window.__ready, null, { timeout: 60000 });
  const shots = {
    face: { cam: [0.05, 0.9, 0.42], look: [0, 0.88, 0], lookAt: [0.05, 0.9, 0.42] },
    full: { cam: [0.6, 0.7, 2.0], look: [0, 0.5, 0], lookAt: [0.6, 0.7, 2.0] },
    walk: { cam: [1.8, 0.6, 0.6], look: [0, 0.45, 0], loco: 'walk', steps: 23, lookAt: [1.8, 0.6, 0.6] },
    attack: { cam: [0.4, 0.8, 1.6], look: [0, 0.6, 0], action: 'attack', jaw: 1, lookAt: [0.4, 0.8, 1.6] },
    under: { cam: [1.5, 0.5, 0.8], look: [0, 0.3, 0], action: 'lookUnder', lookAt: [1.5, 0.1, 0.8] },
    sit: { cam: [0.3, 0.7, 1.4], look: [0, 0.4, 0], action: 'sit', eye: 'empty' },
    back: { cam: [0.4, 0.9, -1.4], look: [0, 0.8, 0], lookAt: [0.4, 0.9, -1.4], yaw: 0 },
  };
  for (const [name, o] of Object.entries(shots)) {
    await page.evaluate((o) => window.show(o), o);
    await page.screenshot({ path: `tests/out/doll-${name}.png` });
  }
} finally {
  if (errors.length) console.log('ERRORS:\n' + errors.join('\n'));
  await browser.close(); srv.stop();
}
process.exit(0);
