/* tests/app.test.mjs — integration tests against the REAL Wikipedia API using
 * a jsdom DOM, driving the same modules the browser runs.
 *
 * Network tests are skipped automatically when WSR_SKIP_NETWORK=1 or when the
 * API is unreachable.
 */

import { suite, test, assert, assertEqual, assertDeepEqual } from './harness.mjs';
import { bootDom } from './env.mjs';

const dom = bootDom();
const SKIP_NET = process.env.WSR_SKIP_NETWORK === '1';

const { parseArticleHtml, parseWikiHref, isBlockedNamespace, sanitizeTree } = await import('../js/navigation/articleParser.js');
const wiki = await import('../js/api/wikipedia.js');
const { game, RUN_STATES } = await import('../js/game/gameState.js');
const { Settings } = await import('../js/storage/settings.js');
const { Statistics } = await import('../js/storage/statistics.js');
const { Achievements } = await import('../js/storage/achievements.js');
const { Profile } = await import('../js/storage/profile.js');
const { Bookmarks } = await import('../js/storage/bookmarks.js');
const { Leaderboard } = await import('../js/storage/leaderboard.js');
const { ArticleCache } = await import('../js/storage/articleCache.js');
const save = await import('../js/core/save.js');
const { dailyChallenge, dailyDifficulty, dailySeedString } = await import('../js/game/challenges.js');
const { computeScore } = await import('../js/game/scoring.js');
const { titleKey } = await import('../js/core/util.js');

/* --- boot the persistence layer exactly like main.js does -------------- */
Settings.init();
Statistics.init();
Achievements.init();
Profile.init();
Bookmarks.init();
Leaderboard.init();
ArticleCache.configure({ enabled: false, limit: 0 });
wiki.setPersistentArticleCache(ArticleCache);

async function apiReachable() {
  if (SKIP_NET) return false;
  try {
    await wiki.searchArticles('en', 'Albert Einstein', { limit: 1 });
    return true;
  } catch {
    return false;
  }
}
const ONLINE = await apiReachable();
const netTest = (name, fn, opts = {}) => test(name, fn, { ...opts, skip: !ONLINE });

/* ================================================================== */
/* Pure parsing (no network)                                          */
/* ================================================================== */

suite('articleParser — link detection', () => {
  test('recognises article links and normalises them', () => {
    const a = parseWikiHref('/wiki/Albert_Einstein', 'en');
    assert(a && a.title === 'Albert Einstein', 'slug should normalise');
    assert(!a.blocked, 'namespace 0 is playable');
    const b = parseWikiHref('https://en.wikipedia.org/wiki/Banana', 'en');
    assert(b && b.title === 'Banana');
    const c = parseWikiHref('/wiki/Kota_Bandung#Sejarah', 'id');
    assert(c.title === 'Kota Bandung', 'fragment stripped');
    assertEqual(c.fragment, 'Sejarah');
  });

  test('blocks non-article namespaces in every supported language', () => {
    for (const t of ['Special:Search', 'File:Example.jpg', 'Category:Physics', 'Template:Infobox', 'Help:Contents', 'Talk:Main Page', 'User:Foo', 'Wikipedia:About', 'Portal:Science', 'Istimewa:Pencarian', 'Berkas:Gambar.jpg', 'Kategori:Fisika', '特別:検索', 'Spezial:Suche', 'Spécial:Recherche', 'Especial:Búsqueda']) {
      assert(isBlockedNamespace(t), `${t} must be blocked`);
    }
    assert(!isBlockedNamespace('Albert Einstein'));
    assert(!isBlockedNamespace('Kota Bandung'));
  });

  test('rejects dangerous and non-wiki links', () => {
    for (const href of ['javascript:alert(1)', 'data:text/html,<script>', 'mailto:a@b.c', '#cite_note-1', 'https://example.com/wiki/X', '/w/index.php?title=X']) {
      const parsed = parseWikiHref(href, 'en');
      if (href === '#cite_note-1') assert(parsed === null, 'anchors are not article links');
      else assert(parsed === null || parsed.blocked || !parsed.sameLang, `${href} must not be a playable link`);
    }
  });

  test('sanitises hostile HTML', () => {
    const hostile = `<div class="mw-parser-output">
      <script>window.__pwned = true;</script>
      <img src="x" onerror="window.__pwned = true" onload="alert(1)">
      <a href="javascript:alert(2)" onclick="alert(3)">bad</a>
      <a href="/wiki/Good_Article">good</a>
      <iframe src="https://evil.example"></iframe>
      <style>body{display:none}</style>
      <a href="https://evil.example/steal">ext</a>
      <form action="/steal"><input name="x"></form>
    </div>`;
    const { fragment, links } = parseArticleHtml(hostile, { lang: 'en' });
    // <script> elements themselves are removed; only the inert text remains.
    assertEqual(fragment.querySelectorAll('script').length, 0, 'script elements removed');
    assertEqual(fragment.querySelectorAll('iframe, style, form, input').length, 0, 'active elements removed');
    const html = fragment.querySelector('div').outerHTML;
    assert(!/onerror|onload|onclick/i.test(html), 'event handlers removed');
    assert(!/href="javascript:/i.test(html), 'javascript: URLs removed from hrefs');
    assertEqual(links.length, 1);
    assertEqual(links[0].title, 'Good Article');
    assert(!globalThis.window.__pwned, 'no script executed');
  });
});

/* ================================================================== */
/* Wikipedia API                                                      */
/* ================================================================== */

suite('Wikipedia API', () => {
  netTest('loads and parses a real article with action=parse', async () => {
    const article = await wiki.getArticle('en', 'Albert Einstein');
    assertEqual(article.title, 'Albert Einstein');
    assert(article.html.length > 5000, 'html present');
    assert(article.pageid > 0);
    assert(article.categories.length > 5, 'categories present');
    assert(article.url.includes('en.wikipedia.org/wiki/'));
    const parsed = parseArticleHtml(article.html, { lang: 'en' });
    assert(parsed.links.length > 100, `expected many links, got ${parsed.links.length}`);
    assert(parsed.blockedCount >= 0);
    // every playable link must be a real article title (namespace 0)
    assert(parsed.links.every((l) => !isBlockedNamespace(l.title)), 'no namespaced links survive');
    assert(parsed.links.every((l) => l.title.length > 0 && !l.title.startsWith('#')), 'titles are clean');
  });

  netTest('reports missing articles with a typed error', async () => {
    let err = null;
    try {
      await wiki.getArticle('en', 'This Article Definitely Does Not Exist 9f3a2b');
    } catch (e) { err = e; }
    assert(err, 'expected an error');
    assertEqual(err.code, 'notfound');
  });

  netTest('resolves slugs, redirects and full URLs', async () => {
    assertEqual(await wiki.resolveTitle('en', 'albert_einstein'), 'Albert Einstein');
    const viaUrl = await wiki.resolveTitle('en', 'https://en.wikipedia.org/wiki/Banana');
    assertEqual(viaUrl, 'Banana');
    const redirect = await wiki.resolveTitle('en', 'USA');
    assert(redirect === 'United States' || redirect.length > 0, `redirect resolved to ${redirect}`);
  });

  netTest('searches, lists links and reads page info', async () => {
    const results = await wiki.searchArticles('en', 'Albert Ein', { limit: 5 });
    assert(results.length > 0);
    assert(results.some((r) => r.title === 'Albert Einstein'));

    const links = await wiki.getOutgoingLinks('en', 'Banana', { limit: 100 });
    assert(links.length > 10, `expected links, got ${links.length}`);

    const info = await wiki.getPageInfo('en', ['Banana']);
    const rec = info[titleKey('Banana')];
    assert(rec && rec.pageid > 0);
    assert(typeof rec.extract === 'string');
  });

  netTest('supports every advertised language endpoint', async () => {
    for (const lang of wiki.LANGUAGE_CODES) {
      const titles = await wiki.getRandomTitles(lang, 2);
      assert(titles.length > 0, `${lang} returned no random titles`);
      assert(wiki.isSupportedLanguage(lang));
    }
  }, { timeout: 60000 });

  netTest('rejects unsupported languages', async () => {
    let err = null;
    try { await wiki.getRandomTitles('xx', 1); } catch (e) { err = e; }
    assert(err && err.code === 'unsupported');
  });

  test('pool contains only playable, real articles', async () => {
    const pool = await wiki.getPopularTitles('en');
    assert(pool.length > 500, `pool too small: ${pool.length}`);
    const bad = pool.filter((t) => !wiki.looksLikeArticle(t));
    assert(bad.length <= pool.length * 0.03, `too many list-like titles: ${bad.slice(0, 6).join(', ')}`);
  });

  test('offline requests fail with a typed offline error', async () => {
    const original = navigator.onLine;
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
    let err = null;
    try { await wiki.getArticle('en', 'Banana', { force: true }); } catch (e) { err = e; }
    Object.defineProperty(navigator, 'onLine', { value: original, configurable: true });
    assert(err, 'expected an offline error');
    assertEqual(err.code, 'offline');
  });
});

/* ================================================================== */
/* Full game loop                                                     */
/* ================================================================== */

suite('game engine — full run', () => {
  netTest('plays a complete run: navigate, count clicks, reach target, score, save', async () => {
    const before = Statistics.summary();
    const events = { navigate: 0, ended: null, state: 0 };
    const offs = [
      game.on('navigate', () => { events.navigate += 1; }),
      game.on('ended', (r) => { events.ended = r; }),
      game.on('state', () => { events.state += 1; }),
    ];

    await game.start({ mode: 'custom', lang: 'en', start: 'Banana', target: 'Fruit', difficulty: 'easy', allowHints: true, allowPowerups: true, verify: false });
    assertEqual(game.state.status, 'playing');
    assertEqual(game.state.current, 'Banana');
    assertEqual(game.state.route.length, 1, 'start article is on the route');
    assertEqual(game.state.clicks, 0, 'loading the start article is not a click');

    // pick a genuine in-article link to travel through
    const parsed = parseArticleHtml(game.article.html, { lang: 'en' });
    const hop = parsed.links.find((l) => titleKey(l.title) !== titleKey('Banana') && titleKey(l.title) !== titleKey('Fruit'));
    assert(hop, 'article should expose at least one link');

    const timerBefore = game.timer.elapsedMs;
    await new Promise((r) => setTimeout(r, 260));
    await game.navigate(hop.title);
    assertEqual(game.state.current, hop.title, 'navigated to the clicked link');
    assertEqual(game.state.clicks, 1, 'one click counted');
    assertEqual(game.state.route.length, 2);
    assert(game.timer.elapsedMs > timerBefore, 'timer keeps running across navigation');
    assertEqual(events.navigate, 1);

    // non-article clicks never count as moves
    game.registerBlockedClick('Category:Food', 'Category');
    assertEqual(game.state.clicks, 1, 'blocked click must not count');
    assertEqual(game.state.invalidClicks, 1);

    // hints cost time and are recorded
    const hint = await game.useHint('topic');
    assert(hint.ok, `hint failed: ${hint.text}`);
    assertEqual(game.state.hintsUsed, 1);
    assert(game.timer.elapsedMs >= 5000 - 200, 'hint penalty applied to the clock');

    // power-ups
    const radar = await game.usePowerup('radar');
    assert(radar.ok, 'radar should work');
    assertEqual(game.state.powerupUses, 1);
    assertEqual(game.state.powerups.radar.uses, 2, 'uses decremented');

    // reach the target
    await game.navigate('Fruit');
    assertEqual(game.state.current, 'Fruit');
    assertEqual(game.state.status, 'finished', 'run finished on reaching the target');
    assert(events.ended, 'ended event fired');

    const result = events.ended;
    assert(result.completed, 'run marked completed');
    assert(result.score.total > 0, 'score computed');
    assert(result.rating.stars >= 1 && result.rating.stars <= 5);
    assert(result.xp.total > 0, 'xp awarded');
    assertEqual(result.run.target, 'Fruit');
    assertEqual(result.run.clicks, 2);

    const after = Statistics.summary();
    assertEqual(after.totalRuns, before.totalRuns + 1, 'statistics recorded the run');
    assertEqual(after.completedRuns, before.completedRuns + 1);
    assert(after.streak.current >= 1, 'streak increased');
    assert(Statistics.runs({ limit: 1 })[0].id === result.run.id, 'run is in history');
    assert(Leaderboard.all().some((e) => e.runId === result.run.id), 'leaderboard entry created');
    assertEqual(Achievements.isUnlocked('firstRun'), true, 'FIRST RUN achievement unlocked');
    assert(Profile.all.xp > 0, 'xp persisted to the profile');
    assert(!game.constructor.hasSavedRun(), 'active-run snapshot cleared after finishing');
    offs.forEach((off) => off());
  }, { timeout: 90000 });

  netTest('failed runs are recorded separately and reset the streak', async () => {
    const before = Statistics.summary();
    await game.start({ mode: 'timeattack', lang: 'en', start: 'Banana', target: 'Fruit', difficulty: 'easy', timeLimitMs: 60000, verify: false });
    assertEqual(game.state.timer.limitMs, 60000);
    assertEqual(game.timer.mode, 'countdown');
    game.finish('timeout');
    const after = Statistics.summary();
    assertEqual(after.failedRuns, before.failedRuns + 1);
    assertEqual(after.streak.current, 0, 'streak resets on failure');
    assertEqual(after.totalRuns, before.totalRuns + 1);
  }, { timeout: 60000 });

  netTest('pause/resume keeps elapsed time honest', async () => {
    await game.start({ mode: 'sandbox', lang: 'en', start: 'Banana', verify: false });
    await new Promise((r) => setTimeout(r, 120));
    game.pause();
    const paused = game.timer.elapsedMs;
    assertEqual(game.state.status, 'paused');
    await new Promise((r) => setTimeout(r, 250));
    assert(Math.abs(game.timer.elapsedMs - paused) < 40, 'clock frozen while paused');
    game.resume();
    assertEqual(game.state.status, 'playing');
    await new Promise((r) => setTimeout(r, 120));
    assert(game.timer.elapsedMs > paused + 80, 'clock resumes');
    game.endSandbox();
  }, { timeout: 60000 });

  netTest('backtrack returns to the previous article without a click', async () => {
    await game.start({ mode: 'custom', lang: 'en', start: 'Banana', target: 'Fruit', difficulty: 'easy', verify: false });
    await game.navigate('Fruit'); // ends the run, so use a fresh one below
    const result = game.lastResult;
    assert(result.completed);

    await game.start({ mode: 'custom', lang: 'en', start: 'Banana', target: 'Fruit', difficulty: 'easy', verify: false });
    const parsed = parseArticleHtml(game.article.html, { lang: 'en' });
    const hop = parsed.links.find((l) => titleKey(l.title) !== titleKey('Banana') && titleKey(l.title) !== titleKey('Fruit'));
    await game.navigate(hop.title);
    const clicksAfterHop = game.state.clicks;
    const ok = await game.backtrack();
    assert(ok, 'backtrack succeeded');
    assertEqual(game.state.current, 'Banana');
    assertEqual(game.state.clicks, clicksAfterHop, 'backtrack does not add a click');
    assertEqual(game.state.route.length, 1, 'route trimmed');
    game.finish('abandoned');
  }, { timeout: 90000 });

  netTest('active run survives a reload (snapshot + restore)', async () => {
    await game.start({ mode: 'custom', lang: 'en', start: 'Banana', target: 'Fruit', difficulty: 'normal', verify: false });
    await new Promise((r) => setTimeout(r, 150));
    game.saveActiveRun();
    assert(game.constructor.hasSavedRun(), 'snapshot written');
    const info = game.constructor.savedRunInfo();
    assertEqual(info.start, 'Banana');

    // simulate a page reload: new engine instance, same localStorage
    const { GameSession } = await import('../js/game/gameState.js');
    const fresh = new GameSession();
    const restored = await fresh.restore();
    assert(restored, 'restore succeeded');
    assertEqual(fresh.state.status, 'paused');
    assertEqual(fresh.state.current, 'Banana');
    assertEqual(fresh.state.clicks, game.state.clicks);
    assert(Math.abs(fresh.timer.elapsedMs - game.timer.elapsedMs) < 400, 'elapsed time restored');
    fresh.finish('abandoned');
  }, { timeout: 90000 });
});

/* ================================================================== */
/* Modes, daily determinism, scoring, data                            */
/* ================================================================== */

suite('modes & determinism', () => {
  test('daily challenge is deterministic for a date+language', async () => {
    const a = await dailyChallenge({ dateKey: '2026-09-20', lang: 'en', verify: false });
    const b = await dailyChallenge({ dateKey: '2026-09-20', lang: 'en', verify: false });
    assertEqual(a.start, b.start);
    assertEqual(a.target, b.target);
    assertEqual(a.seed, b.seed);
    assertEqual(a.difficulty, b.difficulty);
    assertEqual(a.seedString, b.seedString);
    const other = await dailyChallenge({ dateKey: '2026-09-21', lang: 'en', verify: false });
    assert(a.seed !== other.seed, 'different day ⇒ different seed');
    assertEqual(dailySeedString('2026-09-20', 'en'), a.seedString);
    assert(dailyDifficulty('2026-09-20', 'en') === a.difficulty);
  }, { timeout: 60000 });

  test('daily start and target differ and are real titles', async () => {
    const ch = await dailyChallenge({ dateKey: '2026-09-20', lang: 'id', verify: false });
    assert(ch.start && ch.target);
    assert(titleKey(ch.start) !== titleKey(ch.target));
    assert(!ch.start.includes(':') && !ch.target.includes(':'));
  }, { timeout: 60000 });

  test('every difficulty produces a playable challenge', async () => {
    for (const difficulty of ['easy', 'normal', 'hard', 'expert', 'chaos']) {
      const ch = await dailyChallenge({ dateKey: '2026-09-20', lang: 'en', difficulty, verify: false });
      assert(ch.start && ch.target, `${difficulty} produced no challenge`);
      assert(titleKey(ch.start) !== titleKey(ch.target), `${difficulty} start == target`);
    }
  }, { timeout: 90000 });
});

suite('scoring & progression', () => {
  test('score breakdown is internally consistent and non-trivial', () => {
    const run = { mode: 'quick', difficulty: 'hard', elapsedMs: 95000, clicks: 6, hintsUsed: 1, powerupsUsed: 0, streak: 3, completed: true, parClicks: 7, parSeconds: 330 };
    const r = computeScore(run);
    const sum = r.breakdown.reduce((a, b) => a + b.value, 0);
    assert(Math.abs(r.total - Math.round(sum * r.multiplier)) <= 1, 'breakdown must sum to the total');
    assert(r.breakdown.some((b) => b.value < 0), 'hint penalty present');
    assert(r.total > 1000, 'a good run should score well');
    assert(r.maxReference > r.total, 'reference max is above the achieved score');
  });
});

suite('save data', () => {
  test('export → wipe → import round-trips everything', async () => {
    const payload = save.exportSave();
    assertEqual(payload.app, 'wikipedia-speedrun');
    assert(payload.data.statistics.runs.length >= 1, 'runs exported');
    const snapshot = {
      xp: Profile.all.xp,
      totalRuns: Statistics.all.totalRuns,
      unlocked: Achievements.unlockedCount(),
      settings: Settings.get('difficulty'),
    };

    save.resetEverything();
    assertEqual(Statistics.all.totalRuns, 0, 'data wiped');
    assertEqual(Profile.all.xp, 0);

    const result = save.importSave(JSON.stringify(payload));
    assert(result.ok, `import failed: ${result.errors.join(', ')}`);
    assertEqual(Statistics.all.totalRuns, snapshot.totalRuns, 'runs restored');
    assertEqual(Profile.all.xp, snapshot.xp, 'xp restored');
    assertEqual(Achievements.unlockedCount(), snapshot.unlocked, 'achievements restored');
    assertEqual(Settings.get('difficulty'), snapshot.settings, 'settings restored');
  });

  test('malformed imports are rejected without corrupting data', () => {
    const before = Statistics.all.totalRuns;
    for (const bad of ['not json at all', '{"data":{"statistics":"nope"}}', '[]', '{"app":"other-app"}']) {
      const res = save.importSave(bad);
      if (res.ok) {
        // A valid object without sections must not be accepted silently.
        assert(false, `should have rejected: ${bad}`);
      }
    }
    assertEqual(Statistics.all.totalRuns, before, 'existing data untouched');
  });

  test('corrupted localStorage is repaired on load', () => {
    localStorage.setItem('wsr:settings', '{broken json');
    const reinitialised = Settings.init();
    assert(typeof reinitialised.difficulty === 'string', 'settings recovered');
    assertEqual(reinitialised.difficulty, Settings.get('difficulty'), 'a consistent value is returned');
  });
});

/* ================================================================== */
/* Daily result bookkeeping                                           */
/* ================================================================== */

suite('daily bookkeeping', () => {
  netTest('completing a daily run records the day and the daily streak', async () => {
    const { dailyChallenge: dc } = await import('../js/game/challenges.js');
    const ch = await dc({ dateKey: '2026-09-20', lang: 'en', verify: false });
    await game.start({
      mode: 'daily', lang: 'en', difficulty: ch.difficulty,
      start: ch.start, target: ch.target, seed: ch.seed, verify: false,
      allowHints: true, allowPowerups: true,
    });
    await game.navigate(ch.target);
    assertEqual(game.state.status, 'finished');
    const day = Statistics.getDailyResult('2026-09-20');
    assert(day, 'daily result stored');
    assert(day.completed, 'marked completed');
    assert(day.bestTimeMs > 0);
    assert(day.bestClicks >= 0);
    assert(day.attempts >= 1);
    const streak = Statistics.all.dailyStreak;
    assert(streak.current >= 1, 'daily streak started');
  }, { timeout: 90000 });
});

export { dom };
