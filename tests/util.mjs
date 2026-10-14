// Shared helpers for the Playwright test scripts.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';

export const CHROME = process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

export async function startServer(port = 5199, mode = 'dev') {
  const args = mode === 'preview' ? ['vite', 'preview', '--port', String(port), '--strictPort', '--host', '127.0.0.1'] : ['vite', '--port', String(port), '--strictPort', '--host', '127.0.0.1'];
  const proc = spawn('npx', args, { stdio: ['ignore', 'pipe', 'pipe'], detached: true });
  await new Promise((res, rej) => {
    const to = setTimeout(() => rej(new Error('vite did not start')), 30000);
    proc.stdout.on('data', (d) => { if (String(d).includes('Local')) { clearTimeout(to); res(); } });
    proc.stderr.on('data', (d) => process.stderr.write(d));
  });
  return { url: `http://127.0.0.1:${port}`, stop: () => { try { process.kill(-proc.pid, 'SIGTERM'); } catch { /* already gone */ } } };
}

export async function launch(w = 1280, h = 720) {
  const browser = await chromium.launch({
    executablePath: CHROME,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'],
  });
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e.stack || e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  return { browser, page, errors };
}
