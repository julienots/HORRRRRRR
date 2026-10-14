import { startServer, launch } from './util.mjs';
const srv = await startServer(5199);
const { browser, page, errors } = await launch(960, 540);
try {
  await page.goto(srv.url + '/tests/pages/house.html');
  await page.waitForFunction(() => window.__ready, null, { timeout: 120000 });
  console.log(await page.evaluate(() => window.__info));
  const views = JSON.parse(process.argv[2] || '[]');
  for (const [name, x, y, z, yaw, pitch, amb] of views) {
    const calls = await page.evaluate(([x, y, z, yaw, pitch, amb]) => window.view(x, y, z, yaw, pitch, amb), [x, y, z, yaw, pitch, amb]);
    await page.screenshot({ path: `tests/out/${name}.png` });
    console.log(name, 'calls', calls);
  }
} finally {
  if (errors.length) console.log('ERRORS:\n' + errors.join('\n'));
  await browser.close(); srv.stop();
}
process.exit(0);
