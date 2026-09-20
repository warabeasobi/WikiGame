/* tests/unit.test.mjs — pure logic: utils, timer, scoring, difficulty, storage. */

import { suite, test, assert, assertEqual, assertClose, assertDeepEqual, assertThrows } from './harness.mjs';
import { bootDom } from './env.mjs';

bootDom();

const util = await import('../js/core/util.js');
const { GameTimer } = await import('../js/game/timer.js');
const scoring = await import('../js/game/scoring.js');
const difficulty = await import('../js/game/difficulty.js');
const store = await import('../js/core/store.js');
const i18n = await import('../js/core/i18n.js');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

suite('util', () => {
  test('normalizeTitle handles slugs, spaces and case', () => {
    assertEqual(util.normalizeTitle('albert_einstein'), 'Albert einstein');
    assertEqual(util.normalizeTitle('  albert   einstein  '), 'Albert einstein');
    assertEqual(util.normalizeTitle('Albert_Einstein'), 'Albert Einstein');
    assertEqual(util.normalizeTitle('Albert%20Einstein'), 'Albert Einstein');
    assertEqual(util.normalizeTitle('kota%20bandung'), 'Kota bandung');
    assertEqual(util.normalizeTitle(''), '');
    assertEqual(util.normalizeTitle(null), '');
  });

  test('titleKey and sameTitle are case-insensitive', () => {
    assertEqual(util.titleKey('Albert_Einstein'), 'albert einstein');
    assert(util.sameTitle('albert einstein', 'Albert_Einstein'));
    assert(!util.sameTitle('Albert Einstein', 'Albert Einsteins'));
  });

  test('formatTime renders mm:ss.cc and h:mm:ss', () => {
    assertEqual(util.formatTime(102340), '01:42.34');
    assertEqual(util.formatTime(3723000), '1:02:03.00');
    assertEqual(util.formatTime(3723000, { showMs: false }), '1:02:03');
    assertEqual(util.formatTime(0), '00:00.00');
    assertEqual(util.formatClock(102340), '01:42');
  });

  test('dayKey is a local calendar date', () => {
    assertEqual(util.dayKey(new Date(2026, 8, 20, 23, 59)), '2026-09-20');
    assertEqual(util.dayKeyOffset(1, new Date(2026, 8, 20)), '2026-09-21');
  });

  test('seeded RNG is deterministic', () => {
    const a = util.mulberry32(42);
    const b = util.mulberry32(42);
    const seqA = [a(), a(), a()];
    const seqB = [b(), b(), b()];
    assertDeepEqual(seqA, seqB);
    assert(seqA[0] !== util.mulberry32(43)());
  });

  test('deepMerge merges nested objects', () => {
    const out = util.deepMerge({ a: 1, b: { c: 2, d: 3 } }, { b: { c: 9 } });
    assertDeepEqual(out, { a: 1, b: { c: 9, d: 3 } });
  });

  test('Emitter on/off/emit', () => {
    const e = new util.Emitter();
    let count = 0;
    const off = e.on('x', () => { count += 1; });
    e.emit('x');
    e.emit('x');
    off();
    e.emit('x');
    assertEqual(count, 2);
  });

  test('escapeHtml neutralises markup', () => {
    assertEqual(util.escapeHtml('<script>"x"</script>'), '&lt;script&gt;&quot;x&quot;&lt;/script&gt;');
  });
});

suite('timer', () => {
  test('measures real elapsed time (not tick counting)', async () => {
    const t = new GameTimer({ mode: 'stopwatch' });
    t.start();
    await sleep(320);
    const elapsed = t.elapsedMs;
    assert(elapsed >= 300 && elapsed < 500, `expected ~320ms, got ${elapsed}`);
    t.stop();
  });

  test('pause excludes paused time', async () => {
    const t = new GameTimer();
    t.start();
    await sleep(150);
    t.pause();
    const afterPause = t.elapsedMs;
    await sleep(200);
    assertClose(t.elapsedMs, afterPause, 5, 'elapsed should not grow while paused');
    t.resume();
    await sleep(120);
    const total = t.elapsedMs;
    assert(total > 240 && total < 400, `expected ~270ms, got ${total}`);
    t.stop();
  });

  test('addTime applies penalties', async () => {
    const t = new GameTimer();
    t.start();
    await sleep(60);
    t.addTime(5000);
    assert(t.elapsedMs >= 5000, 'penalty applied');
    t.stop();
  });

  test('countdown expires and emits once', async () => {
    const t = new GameTimer({ mode: 'countdown', limitMs: 250, tickMs: 20 });
    let expired = 0;
    t.on('expired', () => { expired += 1; });
    t.start();
    await sleep(500);
    assertEqual(expired, 1);
    assertEqual(t.remainingMs, 0);
    assert(t.expired);
    assert(!t.running);
  });

  test('freeze stops the clock', async () => {
    const t = new GameTimer();
    t.start();
    await sleep(80);
    t.freeze(300);
    const before = t.elapsedMs;
    await sleep(200);
    assert(t.frozen, 'should report frozen');
    assertClose(t.elapsedMs, before, 40, 'frozen clock should not advance');
    t.unfreeze();
    t.stop();
  });

  test('reset clears everything', async () => {
    const t = new GameTimer();
    t.start();
    await sleep(60);
    t.reset();
    assert(t.elapsedMs < 30, `expected ~0, got ${t.elapsedMs}`);
    assert(!t.expired);
  });
});

suite('scoring', () => {
  const baseRun = {
    mode: 'quick',
    difficulty: 'normal',
    elapsedMs: 120000,
    clicks: 5,
    hintsUsed: 0,
    powerupsUsed: 0,
    streak: 0,
    timeLimitMs: 0,
    completed: true,
  };

  test('breakdown adds up to the total', () => {
    const r = scoring.computeScore(baseRun);
    const sum = r.breakdown.reduce((a, b) => a + b.value, 0);
    assertClose(r.total, Math.round(sum * r.multiplier), 2, 'total must equal the breakdown');
    // base + difficulty + speed + clicks are always shown; penalties only when used.
    assert(r.breakdown.length >= 4, `expected at least 4 rows, got ${r.breakdown.length}`);
    const hinted = scoring.computeScore({ ...baseRun, hintsUsed: 1, powerupsUsed: 1, streak: 2, timeLimitMs: 300000 });
    assert(hinted.breakdown.length >= 8, 'penalties and streak appear when relevant');
  });

  test('faster runs score higher', () => {
    const fast = scoring.computeScore({ ...baseRun, elapsedMs: 60000 });
    const slow = scoring.computeScore({ ...baseRun, elapsedMs: 300000 });
    assert(fast.total > slow.total, `${fast.total} should beat ${slow.total}`);
  });

  test('fewer clicks score higher', () => {
    const few = scoring.computeScore({ ...baseRun, clicks: 3 });
    const many = scoring.computeScore({ ...baseRun, clicks: 14 });
    assert(few.total > many.total);
  });

  test('harder difficulties score higher for the same run', () => {
    const easy = scoring.computeScore({ ...baseRun, difficulty: 'easy' });
    const expert = scoring.computeScore({ ...baseRun, difficulty: 'expert' });
    assert(expert.total > easy.total, `${expert.total} should beat ${easy.total}`);
  });

  test('hints and power-ups cost points', () => {
    const clean = scoring.computeScore(baseRun);
    const hinted = scoring.computeScore({ ...baseRun, hintsUsed: 3, powerupsUsed: 2 });
    assert(hinted.total < clean.total);
    assert(hinted.breakdown.some((b) => b.key === 'hints' && b.value < 0));
  });

  test('failed runs score zero', () => {
    assertEqual(scoring.computeScore({ ...baseRun, completed: false }).total, 0);
    assertEqual(scoring.computeXp({ ...baseRun, completed: false }).total, 0);
  });

  test('sandbox earns nothing', () => {
    assertEqual(scoring.computeScore({ ...baseRun, mode: 'sandbox' }).total, 0);
  });

  test('star rating is bounded and rewards better runs', () => {
    const great = scoring.computeRating(baseRun, null);
    const bad = scoring.computeRating({ ...baseRun, elapsedMs: 900000, clicks: 40 }, null);
    assert(great.stars >= 1 && great.stars <= 5, `stars out of range: ${great.stars}`);
    assert(bad.stars >= 1 && bad.stars <= 5);
    assert(great.stars > bad.stars, `${great.stars} should beat ${bad.stars}`);
    assertEqual(scoring.computeRating({ ...baseRun, completed: false }, null).stars, 0);
  });

  test('XP grows with difficulty and levels are monotonic', () => {
    const easy = scoring.computeXp({ ...baseRun, difficulty: 'easy' }, null);
    const hard = scoring.computeXp({ ...baseRun, difficulty: 'hard' }, null);
    assert(hard.total > easy.total);
    const l1 = scoring.levelFromXp(0);
    const l5 = scoring.levelFromXp(scoring.xpForLevel(5));
    assertEqual(l1.level, 1);
    assertEqual(l5.level, 5);
    assert(scoring.xpForLevel(6) > scoring.xpForLevel(5));
    assert(scoring.unlockedCosmetics(5).length > scoring.unlockedCosmetics(1).length);
  });
});

suite('difficulty', () => {
  test('configs exist for every difficulty and escalate', () => {
    const ids = ['easy', 'normal', 'hard', 'expert', 'chaos'];
    for (const id of ids) assert(difficulty.difficultyConfig(id).id === id);
    const easy = difficulty.difficultyConfig('easy');
    const expert = difficulty.difficultyConfig('expert');
    assert(expert.parClicks > easy.parClicks);
    assert(expert.scoreMultiplier > easy.scoreMultiplier);
    assert(expert.pool[0] > easy.pool[0], 'expert pool should sample deeper articles');
  });

  test('unknown difficulty falls back to normal', () => {
    assertEqual(difficulty.difficultyConfig('nope').id, 'normal');
  });

  test('modifiers mutate rules', () => {
    const rules = difficulty.buildRunRules({ mode: 'quick', difficulty: 'chaos', timeLimitMs: 300000 });
    const withMods = difficulty.applyModifiers(rules, [
      { id: 'half-time', apply: (o) => ({ ...o, timeScale: 0.5 }) },
      { id: 'no-hints', apply: (o) => ({ ...o, allowHints: false }) },
    ]);
    assertEqual(withMods.timeScale, 0.5);
    assertEqual(withMods.allowHints, false);
    const scaled = difficulty.buildRunRules({ mode: 'quick', difficulty: 'chaos', timeLimitMs: 300000, modifiers: [{ id: 'half-time', apply: (o) => ({ ...o, timeScale: 0.5 }) }] });
    assertEqual(scaled.timeLimitMs, 150000);
  });

  test('sandbox removes scoring and timers', () => {
    const rules = difficulty.buildRunRules({ mode: 'sandbox', difficulty: 'normal', timeLimitMs: 60000 });
    assertEqual(rules.countdown, false);
    assertEqual(rules.scoreMultiplier, 0);
  });

  test('endless difficulty ramps up', () => {
    const seq = [1, 3, 5, 8, 12].map((s) => difficulty.endlessDifficultyForStage(s));
    assertEqual(seq[0], 'easy');
    assert(seq[seq.length - 1] === 'expert' || seq[seq.length - 1] === 'chaos');
  });
});

suite('storage', () => {
  test('Doc persists, merges defaults and resets', () => {
    const doc = new store.Doc('test:doc', { a: 1, nested: { x: true, y: false } });
    doc.set({ nested: { y: true } });
    const reloaded = new store.Doc('test:doc', { a: 1, nested: { x: true, y: false } });
    assertEqual(reloaded.data.a, 1);
    assertEqual(reloaded.data.nested.y, true);
    assertEqual(reloaded.data.nested.x, true);
    reloaded.reset();
    assertEqual(reloaded.data.nested.y, false);
  });

  test('corrupt JSON falls back to defaults instead of crashing', () => {
    store.writeRaw('test:corrupt', '{not json');
    const doc = new store.Doc('test:corrupt', { ok: true });
    assertEqual(doc.data.ok, true);
  });

  test('clearAll removes namespaced keys', () => {
    store.writeJson('test:gone', { a: 1 });
    store.clearAll();
    assertEqual(store.readJson('test:gone', null), null);
  });
});

suite('i18n', () => {
  test('english and indonesian dictionaries stay in sync', () => {
    const { missingInTarget, extraInTarget } = i18n.missingKeys('id');
    assertEqual(missingInTarget.length, 0, `id is missing keys: ${missingInTarget.slice(0, 8).join(', ')}`);
    assertEqual(extraInTarget.length, 0, `id has unknown keys: ${extraInTarget.slice(0, 8).join(', ')}`);
  });

  test('t() interpolates and falls back', () => {
    i18n.setUiLanguage('en');
    assertEqual(i18n.t('game.hintCost', { cost: '+5s' }), 'Cost: +5s');
    assertEqual(i18n.t('does.not.exist'), 'does.not.exist');
    i18n.setUiLanguage('id');
    assertEqual(i18n.t('nav.home'), 'Beranda');
    i18n.setUiLanguage('en');
  });

  test('language detection prefers supported locales', () => {
    assertEqual(i18n.detectUiLanguage({ languages: ['id-ID', 'en-US'] }), 'id');
    assertEqual(i18n.detectUiLanguage({ languages: ['pt-BR'] }), 'en');
  });
});
