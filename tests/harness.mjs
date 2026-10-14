// Tiny test harness: named checks with PASS/FAIL, shared browser page running the real game.
import { startServer, launch } from './util.mjs';

export async function withGame(name, fn, { port = 5190 + Math.floor(Math.random() * 100), w = 960, h = 540, mode = 'dev' } = {}) {
  const srv = await startServer(port, mode);
  const { browser, page, errors } = await launch(w, h);
  const results = [];
  const check = (label, cond, detail = '') => {
    results.push({ label, ok: !!cond, detail });
    console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${detail !== '' ? '  — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : ''}`);
  };
  const ev = (f, arg) => page.evaluate(f, arg);
  const boot = async (query = '') => {
    await page.goto(srv.url + '/' + query);
    await page.waitForFunction(() => window.__SE && window.__SE.ready(), null, { timeout: 120000 });
  };
  let crashed = null;
  try {
    await boot();
    await fn({ page, ev, check, boot, srv });
  } catch (e) {
    crashed = e;
    console.log('CRASH', e);
  } finally {
    const real = errors.filter((e) => !e.includes('404') && !e.includes('fonts.g') && !e.includes('net::ERR'));
    check(`[${name}] no runtime errors`, real.length === 0, real.slice(0, 5).join(' | '));
    await browser.close();
    srv.stop();
  }
  const failed = results.filter((r) => !r.ok).length + (crashed ? 1 : 0);
  console.log(`\n${name}: ${results.length - failed}/${results.length} passed${crashed ? ' (crashed)' : ''}`);
  return { results, failed };
}
