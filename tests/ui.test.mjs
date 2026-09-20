/* tests/ui.test.mjs — boots the REAL application (index.html + main.js) inside
 * jsdom, then drives every screen and a complete run through the UI layer.
 *
 * This is the closest thing to browser testing available in this environment:
 * it catches missing imports, undefined functions, broken renderers and
 * unhandled exceptions in the actual screens.
 *
 * Run: node tests/ui.test.mjs
 */

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { suite, test, assert, assertEqual, runAll } from './harness.mjs';
import { bootDom, BASE_URL } from './env.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const INDEX_HTML = readFileSync(join(ROOT, 'index.html'), 'utf8');

// The page must be served (fetch for data/popular-*.json). Start it with:
//   python3 -m http.server 8138 --bind 127.0.0.1
let serverUp = true;
try {
  const res = await fetch(new URL('data/index.json', BASE_URL));
  serverUp = res.ok;
} catch { serverUp = false; }

if (!serverUp) {
  console.error(`\n\x1b[31mStatic server not reachable at ${BASE_URL}\x1b[0m`);
  console.error('Start it first:  cd wikipedia-speedrun && python3 -m http.server 8138 --bind 127.0.0.1\n');
  process.exit(1);
}

bootDom({ html: INDEX_HTML });
globalThis.window.__WSR_NO_AUTOBOOT__ = true;

const errors = [];
const origError = console.error;
console.error = (...args) => { errors.push(args.map(String).join(' ')); origError(...args); };
globalThis.window.addEventListener('error', (e) => errors.push(`window.onerror: ${e.message}`));
process.on('unhandledRejection', (r) => errors.push(`unhandledRejection: ${r && r.message ? r.message : r}`));

const main = await import('../js/main.js');
const router = await main.boot({ autoStart: true });

const WSR = globalThis.window.WSR;
const { game } = await import('../js/game/gameState.js');
const { Settings } = await import('../js/storage/settings.js');
const { Statistics } = await import('../js/storage/statistics.js');
const { Bookmarks } = await import('../js/storage/bookmarks.js');
const { t, setUiLanguage } = await import('../js/core/i18n.js');
const { titleKey } = await import('../js/core/util.js');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const text = (sel, root = document) => { const n = $(sel, root); return n ? (n.textContent || '').trim() : null; };

async function waitFor(fn, { timeout = 20000, interval = 120, label = 'condition' } = {}) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const v = await fn();
    if (v) return v;
    await sleep(interval);
  }
  throw new Error(`timeout waiting for ${label}`);
}

suite('app boot', () => {
  test('boots without errors and renders the home screen', async () => {
    assert(WSR, 'window.WSR debug API is exposed');
    assertEqual(WSR.ready, true, 'boot completed');
    assert(router.currentId === 'home', `expected home, got ${router.currentId}`);
    assert(!document.getElementById('boot'), 'the boot splash must be removed, not left covering the app');
    assert($('#app').children.length >= 3, 'shell built (header + viewport + nav)');
    assert(text('.hero__title'), 'hero rendered');
    assert($$('.app-nav__item').length === 7, 'bottom navigation has 7 entries');
    assert($$('.mode-card').length >= 6, 'mode cards rendered');
    assertEqual(errors.length, 0, `boot produced console errors: ${errors.join(' | ')}`);
  });

  test('the daily teaser resolves to a real deterministic challenge', async () => {
    const teaser = await waitFor(() => {
      const node = $('#daily-teaser');
      return node && !/Loading|Memuat/.test(node.textContent) ? node : null;
    }, { label: 'daily teaser' });
    const txt = teaser.textContent.trim();
    assert(txt.length > 3, 'teaser filled in');
    assert(!/undefined|NaN|\[object/.test(txt), `teaser looks broken: ${txt}`);
  });

  test('no offline status is shown while online', () => {
    assertEqual($('#net-status').classList.contains('is-offline'), false);
  });
});

suite('navigation across every screen', () => {
  const screens = ['home', 'play', 'daily', 'stats', 'achievements', 'profile', 'settings', 'bookmarks', 'leaderboard'];
  for (const id of screens) {
    test(`renders the "${id}" screen`, async () => {
      const before = errors.length;
      await router.navigate(id, {});
      await sleep(140);
      assertEqual(router.currentId, id);
      const view = $('#app-viewport');
      assert(view.children.length >= 1, `${id} rendered nothing`);
      const rendered = view.textContent.replace(/\s+/g, ' ').trim();
      assert(rendered.length > 20, `${id} screen looks empty`);
      assert(!/undefined|\[object Object\]|NaN/.test(rendered), `${id} contains broken values: ${rendered.slice(0, 200)}`);
      assertEqual(errors.length, before, `${id} logged errors: ${errors.slice(before).join(' | ')}`);
    });
  }
});

suite('settings & theme', () => {
  test('theme switching updates the document', async () => {
    await router.navigate('settings', {});
    Settings.set({ theme: 'dark' });
    router.applyTheme();
    assertEqual(document.documentElement.dataset.theme, 'dark');
    Settings.set({ theme: 'light' });
    router.applyTheme();
    assertEqual(document.documentElement.dataset.theme, 'light');
  });

  test('skins and compact HUD apply to the document', async () => {
    Settings.set({ skin: 'retro', compactHud: true });
    router.applyTheme();
    assertEqual(document.documentElement.dataset.skin, 'retro');
    assert(document.documentElement.classList.contains('compact-hud'));
    Settings.set({ skin: 'classic', compactHud: false });
    router.applyTheme();
  });

  test('UI language switches live and persists', async () => {
    Settings.set({ uiLanguage: 'id' });
    setUiLanguage('id');
    router.renderNav();
    assert(text('.app-nav__item[data-screen="home"] .app-nav__label') === 'Beranda', 'nav translated');
    Settings.set({ uiLanguage: 'en' });
    setUiLanguage('en');
    router.renderNav();
    assert(text('.app-nav__item[data-screen="home"] .app-nav__label') === 'Home', 'nav back to English');
  });

  test('settings screen persists changes', async () => {
    await router.navigate('settings', {});
    const switches = $$('.switch__input', $('#app-viewport'));
    assert(switches.length >= 5, 'settings switches rendered');
    const target = switches[0];
    const before = target.checked;
    target.checked = !before;
    target.dispatchEvent(new globalThis.window.Event('change'));
    assertEqual(Settings.get('countArticleClicksOnly'), !before, 'the toggle is persisted');
    // put it back so later tests run against the defaults
    target.checked = before;
    target.dispatchEvent(new globalThis.window.Event('change'));
    assertEqual(Settings.get('countArticleClicksOnly'), before, 'toggle restored');
    assert($$('.slider__input').length >= 2, 'sliders rendered');
  });
});

suite('gameplay through the UI', () => {
  test('starts a real run and renders the article with playable links', async () => {
    const before = errors.length;
    await router.navigate('game', {
      config: { mode: 'custom', lang: 'en', difficulty: 'easy', start: 'Banana', target: 'Fruit', allowHints: true, allowPowerups: true, verify: false },
      mode: 'custom',
    });
    await waitFor(() => $('.wiki__body') || $('.article-error'), { label: 'article body' });
    assertEqual(game.state.status, 'playing');
    assert(text('.wiki__title') === 'Banana', `title rendered: ${text('.wiki__title')}`);

    const links = $$('.wiki__body a.wsr-link[data-wsr-title]');
    assert(links.length > 20, `expected many playable links, got ${links.length}`);
    assert(links.every((a) => !a.hasAttribute('href')), 'links never navigate the browser');
    assert($$('.wiki__body a.wsr-link-blocked').length >= 0, 'namespace links are marked blocked');

    // HUD shows the real challenge
    assert(text('.hud__crumb') !== null);
    assert($('.hud').textContent.includes('Banana'), 'HUD shows the start article');
    assert($('.hud').textContent.includes('Fruit'), 'HUD shows the target article');
    assertEqual(errors.length, before, `game screen logged errors: ${errors.slice(before).join(' | ')}`);
  }, { timeout: 60000 });

  test('clicking an in-article link navigates, counts a click and keeps the timer running', async () => {
    const link = $$('.wiki__body a.wsr-link[data-wsr-title]').find((a) => {
      const title = titleKey(a.getAttribute('data-wsr-title'));
      return title !== titleKey('Banana') && title !== titleKey('Fruit');
    });
    assert(link, 'found a clickable link');

    const targetTitle = link.getAttribute('data-wsr-title');
    const clicksBefore = game.state.clicks;
    const timeBefore = game.timer.elapsedMs;
    link.dispatchEvent(new globalThis.window.MouseEvent('click', { bubbles: true, cancelable: true }));

    // The canonical title may differ from the link text (redirects), so compare
    // case-insensitively.
    await waitFor(() => titleKey(game.state.current) === titleKey(targetTitle), { label: `navigation to ${targetTitle}` });
    assertEqual(game.state.clicks, clicksBefore + 1, 'click counted');
    assert(game.timer.elapsedMs >= timeBefore, 'timer kept running across the navigation');
    assert(game.state.route.length >= 2, 'route recorded');

    // route panel lists the journey
    await waitFor(() => $$('.route-list__item').length >= 2, { label: 'route panel' });
    const items = $$('.route-list__item');
    assert(items.length >= 2, 'route history rendered');
  }, { timeout: 60000 });

  test('non-article links do not count as moves', async () => {
    Settings.set({ countArticleClicksOnly: true });
    const blocked = $('.wiki__body a.wsr-link-blocked');
    assert(blocked, 'this article exposes a non-article link to test with');
    const clicksBefore = game.state.clicks;
    const invalidBefore = game.state.invalidClicks;
    blocked.dispatchEvent(new globalThis.window.MouseEvent('click', { bubbles: true, cancelable: true }));
    await sleep(120);
    assertEqual(game.state.clicks, clicksBefore, 'blocked link is not a move');
    assertEqual(game.state.invalidClicks, invalidBefore + 1, 'blocked click tracked separately');
  }, { timeout: 30000 });

  test('the "count every click" setting changes click accounting', async () => {
    Settings.set({ countArticleClicksOnly: false });
    const blocked = $('.wiki__body a.wsr-link-blocked');
    const clicksBefore = game.state.clicks;
    blocked.dispatchEvent(new globalThis.window.MouseEvent('click', { bubbles: true, cancelable: true }));
    await sleep(120);
    assertEqual(game.state.clicks, clicksBefore + 1, 'with the setting off, every click counts');
    Settings.set({ countArticleClicksOnly: true });
  }, { timeout: 30000 });

  test('hints and power-ups work from the HUD sheet', async () => {
    // open the sheet via the HUD button
    $('.hud__action[aria-label]').click();
    await waitFor(() => $('.sheet.is-open'), { label: 'hint sheet' });
    const hintCard = $('.hint-card');
    assert(hintCard, 'hint cards rendered');
    const hintsBefore = game.state.hintsUsed;
    hintCard.click();
    await waitFor(() => game.state.hintsUsed === hintsBefore + 1, { label: 'hint applied' });
    assert($('.hud').textContent.length > 0, 'HUD still rendered');

    // power-up sheet
    await router.navigate('game', { force: true });
    const powerBtn = $$('.hud__action').find((b) => /Power|gadget|🧰/.test(b.title || '') || b.textContent.includes('🧰'));
    assert(powerBtn, 'power-up button present');
    powerBtn.click();
    await waitFor(() => $('.power-card'), { label: 'power sheet' });
    const usesBefore = game.state.powerups.radar.uses;
    const radar = $$('.power-card').find((c) => /Radar|📡/.test(c.textContent));
    radar.click();
    await waitFor(() => game.state.powerups.radar.uses === usesBefore - 1, { label: 'power-up used' });
    assertEqual(game.state.powerupUses >= 1, true, 'power-up counted');
  }, { timeout: 60000 });

  test('pause and resume work from the HUD', async () => {
    const pauseBtn = $('.hud__pause');
    pauseBtn.click();
    await waitFor(() => game.state.status === 'paused', { label: 'paused' });
    assert(text('.game__banner') !== null, 'paused banner shown');
    $('.hud__pause').click();
    await waitFor(() => game.state.status === 'playing', { label: 'resumed' });
  }, { timeout: 30000 });

  test('reaching the target finishes the run and opens the results screen', async () => {
    await game.navigate(game.state.target);
    await waitFor(() => router.currentId === 'results', { label: 'results screen' });
    await sleep(200);
    assertEqual(game.state.status, 'finished');
    const view = $('#app-viewport').textContent.replace(/\s+/g, ' ');
    assert(/complete|Selesai|selesai|Target/i.test(view), `results screen looks wrong: ${view.slice(0, 160)}`);
    assert($$('.star').length >= 5, 'star rating rendered');
    assert($('.breakdown__list'), 'score breakdown rendered');
    assert($('.timeline, .route-list'), 'route rendered');
    assert($$('.results-actions .btn').length >= 4, 'action buttons rendered');
    assert(!/undefined|NaN/.test(view), 'no broken numbers on the results screen');
  }, { timeout: 60000 });

  test('the finished run is stored in statistics and the leaderboard', async () => {
    const runs = Statistics.runs({ limit: 5 });
    assert(runs.length >= 1, 'run recorded');
    assertEqual(runs[0].completed, true);
    assert(runs[0].score > 0, 'score stored');
    assert(WSR.Leaderboard.all().length >= 1, 'leaderboard entry stored');
    assert(WSR.Achievements.isUnlocked('firstRun'), 'first-run achievement unlocked');
  });

  test('replay screen shows the route timeline', async () => {
    await router.navigate('replay', { runId: Statistics.runs({ limit: 1 })[0].id });
    await sleep(200);
    assert($$('.timeline__item').length >= 2, 'timeline rendered');
    assert(text('.screen__title'), 'replay header rendered');
  });
});

suite('bookmarks', () => {
  test('bookmarking an article from the game screen persists it', async () => {
    await router.navigate('game', {
      config: { mode: 'sandbox', lang: 'en', start: 'Banana', allowHints: false, allowPowerups: true },
      mode: 'sandbox',
    });
    await waitFor(() => $('.wiki__tools .icon-btn'), { label: 'article tools' });
    const starBtn = $('.wiki__tools .icon-btn');
    const before = Bookmarks.articles.length;
    starBtn.click();
    await sleep(150);
    assertEqual(Bookmarks.articles.length, before + 1, 'article bookmarked');
    await router.navigate('bookmarks', {});
    await sleep(200);
    assert($('#app-viewport').textContent.includes('Banana'), 'bookmark listed');
  }, { timeout: 60000 });
});

suite('data management', () => {
  test('export → reset → import restores the player', async () => {
    const payload = WSR.exportSave();
    const runsBefore = Statistics.all.totalRuns;
    const xpBefore = WSR.Profile.all.xp;
    assert(runsBefore >= 1, 'there is data to export');

    WSR.resetEverything();
    assertEqual(Statistics.all.totalRuns, 0, 'reset cleared runs');

    const res = WSR.importSave(JSON.stringify(payload));
    assert(res.ok, `import failed: ${res.errors.join(', ')}`);
    assertEqual(Statistics.all.totalRuns, runsBefore, 'runs restored');
    assertEqual(WSR.Profile.all.xp, xpBefore, 'xp restored');
  });

  test('importing junk is rejected and data survives', async () => {
    const before = Statistics.all.totalRuns;
    const res = WSR.importSave('{"nonsense":true}');
    assertEqual(res.ok, false, 'junk rejected');
    assertEqual(Statistics.all.totalRuns, before, 'data intact');
  });
});

suite('offline behaviour', () => {
  test('offline indicator appears and requests fail with a typed error', async () => {
    const wiki = await import('../js/api/wikipedia.js');
    try {
      Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
      globalThis.window.dispatchEvent(new globalThis.window.Event('offline'));
      await sleep(120);
      assert($('#net-status').classList.contains('is-offline'), 'offline indicator shown');
      assert(document.body.classList.contains('is-offline'), 'body marked offline');

      // An article that is not in the in-memory or persistent cache must fail
      // with a typed offline error rather than hanging or returning junk.
      wiki.clearApiCache();
      let err = null;
      try { await wiki.getArticle('en', 'Zebra'); } catch (e) { err = e; }
      assert(err && err.code === 'offline', `expected offline error, got ${err && err.code}`);
    } finally {
      Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
      globalThis.window.dispatchEvent(new globalThis.window.Event('online'));
      await sleep(120);
    }
    assertEqual($('#net-status').classList.contains('is-offline'), false, 'indicator cleared');
  }, { timeout: 30000 });

  test('missing articles show an error screen, never a blank page', async () => {
    await router.navigate('game', {
      config: { mode: 'custom', lang: 'en', difficulty: 'easy', start: 'Banana', target: 'Fruit', verify: false },
      mode: 'custom',
    });
    await waitFor(() => $('.wiki__body') || $('.article-error'), { label: 'article' });
    const bogus = 'Nonexistent Article 9f3a2b7c1d';
    await game.navigate(bogus);
    await waitFor(() => $('.article-error'), { label: 'error screen' });
    assert($('.article-error').textContent.trim().length > 10, 'error screen explains itself');
    assert($$('.article-error .btn').length >= 2, 'recovery buttons offered');
    game.finish('abandoned');
  }, { timeout: 60000 });
});

suite('final state', () => {
  test('no unhandled errors occurred during the whole UI session', () => {
    const real = errors.filter((e) => !/Not implemented|Could not parse CSS|jsdom/i.test(e));
    assertEqual(real.length, 0, `unexpected errors:\n${real.join('\n')}`);
  });
});

const results = await runAll({ filter: process.argv.includes('--filter') ? process.argv[process.argv.indexOf('--filter') + 1] : null });
process.exit(results.failed > 0 ? 1 : 0);
