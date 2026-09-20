/* tests/run.mjs — test entry point.
 *
 *   npm test                     unit + integration (live Wikipedia API)
 *   npm test -- --filter timer   only tests matching a string
 *   npm test -- --offline        skip network tests
 *   npm test -- --with-ui        also run the full jsdom UI suite
 *                                (needs a static server, see tests/ui.test.mjs)
 */

import { runAll } from './harness.mjs';

const args = process.argv.slice(2);
const filterIdx = args.indexOf('--filter');
const filter = filterIdx >= 0 ? args[filterIdx + 1] : null;
if (args.includes('--offline')) process.env.WSR_SKIP_NETWORK = '1';

await import('./unit.test.mjs');
await import('./app.test.mjs');

if (args.includes('--with-ui')) {
  console.log('\n\x1b[1m— UI suite (spawns its own process, needs a static server) —\x1b[0m');
  const { spawnSync } = await import('node:child_process');
  const res = spawnSync(process.execPath, ['tests/ui.test.mjs', ...(filter ? ['--filter', filter] : [])], { stdio: 'inherit' });
  if (res.status !== 0) {
    console.error('\x1b[31mUI suite failed\x1b[0m');
    process.exit(1);
  }
  process.exit(0);
}

const results = await runAll({ filter });
process.exit(results.failed > 0 ? 1 : 0);
