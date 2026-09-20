/* tests/debug-ui.mjs — focused debugging of click navigation through the UI. */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bootDom } from './env.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
bootDom({ html: readFileSync(join(ROOT, 'index.html'), 'utf8') });
globalThis.window.__WSR_NO_AUTOBOOT__ = true;

const main = await import('../js/main.js');
const router = await main.boot({ autoStart: true });
const { game } = await import('../js/game/gameState.js');
const { titleKey } = await import('../js/core/util.js');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

game.on('navigate', ({ step }) => console.log('EVENT navigate ->', step.title, 'clicks', game.state.clicks));
game.on('article', ({ article }) => console.log('EVENT article ->', article.title));
game.on('error', (e) => console.log('EVENT error', e.phase, e.error && e.error.message));

await router.navigate('game', {
  config: { mode: 'custom', lang: 'en', difficulty: 'easy', start: 'Banana', target: 'Fruit', verify: false },
  mode: 'custom',
});
for (let i = 0; i < 60 && !$('.wiki__body'); i++) await sleep(200);
console.log('title:', $('.wiki__title') && $('.wiki__title').textContent);
const links = $$('.wiki__body a.wsr-link[data-wsr-title]');
console.log('playable links:', links.length);
const link = links.find((a) => {
  const t = titleKey(a.getAttribute('data-wsr-title'));
  return t !== titleKey('Banana') && t !== titleKey('Fruit');
});
console.log('clicking:', link.getAttribute('data-wsr-title'));
link.dispatchEvent(new globalThis.window.MouseEvent('click', { bubbles: true, cancelable: true }));
for (let i = 0; i < 40; i++) {
  await sleep(250);
  if (game.state.clicks > 0) break;
}
console.log('after click: current =', game.state.current, '| clicks =', game.state.clicks, '| route =', game.state.route.map((r) => r.title));
console.log('wiki title now:', $('.wiki__title') && $('.wiki__title').textContent);
process.exit(0);
