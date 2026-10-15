// Runs every test suite against the real game (dev server) and the production build. Usage: npm test
import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';

mkdirSync('tests/out', { recursive: true });
const build = spawnSync('npx', ['vite', 'build'], { stdio: 'inherit' });
if (build.status !== 0) { console.error('build failed'); process.exit(1); }
const suites = ['t-world.mjs', 't-ai.mjs', 't-story.mjs', 't-ui-build.mjs', 't-touch.mjs'];
let failed = 0;
for (const s of suites) {
  console.log(`\n=== ${s} ===`);
  const r = spawnSync('node', ['tests/' + s], { stdio: 'inherit' });
  if (r.status !== 0) failed++;
}
console.log(failed ? `\n${failed} suite(s) failed` : '\nAll suites passed');
process.exit(failed ? 1 : 0);
