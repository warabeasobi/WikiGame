/* game/gameState.js — the run engine.
 *
 * Owns the whole lifecycle of a run: challenge, timer, navigation, clicks,
 * route history, hints, power-ups, scoring, persistence, statistics,
 * achievements, XP and the local leaderboard. The UI only reads state and
 * calls these methods — it never computes game logic itself.
 */

import { Emitter, titleKey, normalizeTitle, clamp, uid, dayKey, titleSlug } from '../core/util.js';
import { getArticle, getPageInfo, getOutgoingLinks, scoreLinksForTarget, describeError, WikiError, articleUrl } from '../api/wikipedia.js';
import { GameTimer } from './timer.js';
import { computeScore, computeRating, computeXp, levelFromXp } from './scoring.js';
import { difficultyConfig, buildRunRules, rollModifiers, nextEndlessTarget, endlessDifficultyForStage } from './difficulty.js';
import { challengeForMode, dailySeedString, challengeKey } from './challenges.js';
import { buildHint, radarClue, cleanCategories } from './hints.js';
import { initialPowerupState, powerupById, FREEZE_MS } from './powerups.js';
import { Settings } from '../storage/settings.js';
import { Statistics } from '../storage/statistics.js';
import { Achievements } from '../storage/achievements.js';
import { Profile } from '../storage/profile.js';
import { Bookmarks } from '../storage/bookmarks.js';
import { Leaderboard } from '../storage/leaderboard.js';
import { writeJson, readJson, removeRaw } from '../core/store.js';
import { KEYS } from '../core/store.js';

export const RUN_STATES = ['idle', 'loading', 'playing', 'paused', 'finished'];

export class GameSession extends Emitter {
  constructor() {
    super();
    this.state = this._blankState();
    this.timer = new GameTimer({ tickMs: 100 });
    this.article = null;
    this.targetInfo = null;
    this._abort = null;
    this._navigating = false;
    this._pendingPowerup = null;
    this._boundTimer = false;
    this._articleTimes = new Map();
    this._startedAt = null;
  }

  _blankState() {
    return {
      status: 'idle',
      mode: 'quick',
      lang: 'en',
      difficulty: 'normal',
      rules: buildRunRules({ mode: 'quick', difficulty: 'normal' }),
      challenge: null,
      current: null,
      target: null,
      start: null,
      clicks: 0,
      invalidClicks: 0,
      route: [],
      hintsUsed: 0,
      hintTypesUsed: [],
      powerups: initialPowerupState('quick'),
      powerupUses: 0,
      stages: 0,
      endlessStage: 1,
      modifiers: [],
      streakBefore: 0,
      timer: { elapsedMs: 0, running: false, mode: 'stopwatch', limitMs: 0, frozen: false, progress: 0, remainingMs: 0 },
      effects: { doubleVision: false, scanner: false },
      dailyDateKey: null,
      seedString: null,
      error: null,
      loading: false,
      lastHint: null,
      lastRadar: null,
      blockedMessage: null,
      startedAt: null,
      pausedAt: null,
    };
  }

  /* ---------------------------------------------------------------- */
  /* Lifecycle                                                        */
  /* ---------------------------------------------------------------- */

  async start(config = {}) {
    this.abort();
    const settings = Settings.all;
    const mode = config.mode || settings.lastMode || 'quick';
    const lang = config.lang || settings.language || 'en';
    const difficulty = config.difficulty || settings.difficulty || 'normal';

    const modifiers = config.modifiers || rollModifiers(difficulty, Math.random);
    let timeLimitMs = config.timeLimitMs !== undefined && config.timeLimitMs !== null
      ? config.timeLimitMs
      : (config.timeLimitMinutes ? config.timeLimitMinutes * 60000 : this._defaultTimeLimit(mode, difficulty, settings));

    const rules = buildRunRules({
      mode,
      difficulty,
      language: lang,
      timeLimitMs: timeLimitMs || 0,
      allowHints: config.allowHints !== undefined ? config.allowHints : true,
      allowPowerups: config.allowPowerups !== undefined ? config.allowPowerups : (settings.powerupsEnabled !== false),
      modifiers,
      seed: config.seed ?? null,
    });

    this.state = this._blankState();
    this.state.status = 'loading';
    this.state.mode = mode;
    this.state.lang = lang;
    this.state.difficulty = difficulty;
    this.state.rules = rules;
    this.state.modifiers = modifiers;
    this.state.streakBefore = Statistics.all.streak.current || 0;
    this.state.powerups = initialPowerupState(mode, { freezeUses: rules.freezeUses });
    this.state.startedAt = Date.now();
    this._startedAt = Date.now();
    this.state.dailyDateKey = mode === 'daily' ? dayKey() : null;
    this.targetInfo = null;
    this._articleTimes = new Map();
    this.emitState();

    let challenge;
    try {
      challenge = await challengeForMode({
        mode,
        lang,
        difficulty,
        seed: config.seed ?? null,
        start: config.start ?? null,
        target: config.target ?? null,
        timeLimitMs: timeLimitMs || null,
        signal: this._signal(),
        verify: config.verify !== false,
      });
    } catch (err) {
      this.state.status = 'idle';
      this.state.error = { code: err.code || 'challenge', message: err.message };
      this.emit('error', { error: err, phase: 'challenge' });
      this.emitState();
      throw err;
    }

    this.state.challenge = challenge;
    this.state.start = challenge.start;
    this.state.target = challenge.target;
    this.state.difficulty = challenge.difficulty || difficulty;
    if (mode === 'daily') {
      this.state.seedString = challenge.seedString || dailySeedString(challenge.dateKey, lang);
    }

    this.timer = new GameTimer({
      mode: rules.countdown && rules.timeLimitMs ? 'countdown' : 'stopwatch',
      limitMs: rules.timeLimitMs || 0,
      tickMs: 100,
    });
    this._bindTimer();

    await this.loadArticle(challenge.start, { count: false, via: 'start' });
    this.state.status = 'playing';
    this.emitState();
    // The clock starts the moment the player can move.
    this.timer.start();
    this.saveActiveRun();
    this.emit('started', this.snapshot());
    return this.snapshot();
  }

  _defaultTimeLimit(mode, difficulty, settings) {
    if (mode === 'sandbox' || mode === 'clickattack' || mode === 'custom' || mode === 'endless') return 0;
    if (settings.timerStyle === 'stopwatch') return 0;
    return difficultyConfig(difficulty).timeLimit * 1000;
  }

  _bindTimer() {
    this.timer.off('tick');
    this.timer.off('warning');
    this.timer.off('expired');
    this.timer.off('freeze');
    this.timer.off('unfreeze');
    this.timer.on('tick', (snap) => {
      this.state.timer = { ...snap, progress: this.timer.progress, remainingMs: this.timer.remainingMs };
      this.emit('tick', this.state.timer);
    });
    this.timer.on('warning', ({ remainingMs, mark }) => {
      this.emit('warning', { remainingMs, mark });
    });
    this.timer.on('expired', () => { this.finish('timeout'); });
    this.timer.on('freeze', ({ ms }) => this.emit('freeze', { ms }));
    this.timer.on('unfreeze', () => this.emit('unfreeze', {}));
  }

  _signal() {
    if (!this._abort) this._abort = new AbortController();
    return this._abort.signal;
  }

  abort() {
    if (this._abort) {
      try { this._abort.abort(); } catch { /* noop */ }
      this._abort = null;
    }
  }

  /* ---------------------------------------------------------------- */
  /* Navigation                                                       */
  /* ---------------------------------------------------------------- */

  get isPlaying() { return this.state.status === 'playing'; }

  async loadArticle(title, { count = false, via = 'link', force = false } = {}) {
    const lang = this.state.lang;
    const clean = normalizeTitle(title);
    this.state.loading = true;
    this.state.error = null;
    this.emit('loading', { title: clean });
    this.emitState();

    let article;
    try {
      article = await getArticle(lang, clean, { force, signal: this._signal() });
    } catch (err) {
      this.state.loading = false;
      this.state.error = { code: err.code || 'error', message: err.message, title: clean };
      this.emit('error', { error: err, phase: 'article', title: clean });
      this.emitState();
      return null;
    }

    const previous = this.state.current;
    const now = this.timer.elapsedMs;
    const prevStep = this.state.route[this.state.route.length - 1];
    if (prevStep && prevStep.elapsedMs !== null) prevStep.spentMs = Math.max(0, now - prevStep.elapsedMs);

    this.article = article;
    this.state.loading = false;
    this.state.current = article.title;
    this.state.error = null;

    // Redirects: the API may return a different canonical title.
    const redirected = titleKey(article.title) !== titleKey(clean);

    if (count) {
      this.state.clicks += 1;
      const step = {
        title: article.title,
        requested: clean,
        ts: Date.now(),
        elapsedMs: now,
        spentMs: null,
        via,
        redirectedFrom: redirected ? clean : null,
      };
      this.state.route.push(step);
      this._articleTimes.set(titleKey(article.title), now);
      if (this.state.route.length === 1) this.state.start = this.state.route[0].title;
      this.emit('navigate', { article, step, clicks: this.state.clicks });
      this.saveActiveRun();
    } else if (this.state.route.length === 0) {
      this.state.route.push({
        title: article.title,
        requested: clean,
        ts: Date.now(),
        elapsedMs: now,
        spentMs: null,
        via: 'start',
        redirectedFrom: redirected ? clean : null,
      });
      this.state.start = article.title;
      if (this.state.mode === 'sandbox' && !this.state.target) this.state.target = null;
    }

    this.emit('article', { article, previous });
    this.emitState();

    if (this.state.status === 'playing' || this.state.status === 'paused') this._checkCompletion(article);
    return article;
  }

  /** Player-driven navigation: the only thing that counts as a move. */
  async navigate(title, { via = 'link' } = {}) {
    if (!this.isPlaying && this.state.status !== 'paused') return null;
    if (this._navigating) return null;
    const lang = this.state.lang;
    this._navigating = true;
    try {
      const clean = normalizeTitle(title);
      if (this.state.current && titleKey(clean) === titleKey(this.state.current)) return null;
      const article = await this.loadArticle(clean, { count: true, via });
      if (!article) return null;
      // click cap modifier
      if (this.state.rules.clickCap && this.state.clicks > this.state.rules.clickCap) {
        this.finish('clickcap');
        return article;
      }
      return article;
    } finally {
      this._navigating = false;
    }
  }

  /** Non-article link clicked — tracked, but never a move. */
  registerBlockedClick(title, namespace) {
    this.state.invalidClicks += 1;
    if (!Settings.get('countArticleClicksOnly')) this.state.clicks += 1;
    this.emit('blocked', { title, namespace, invalidClicks: this.state.invalidClicks });
    this.emitState();
  }

  registerInvalidClick(reason = 'invalid') {
    this.state.invalidClicks += 1;
    this.emit('blocked', { reason, invalidClicks: this.state.invalidClicks });
    this.emitState();
  }

  /** Backtrack power-up: step back one article for free. */
  async backtrack() {
    if (this.state.route.length < 2) return false;
    this.state.route.pop();
    const prev = this.state.route[this.state.route.length - 1];
    const article = await this.loadArticle(prev.title, { count: false, via: 'backtrack' });
    if (article) this.emit('backtrack', { article });
    return Boolean(article);
  }

  _checkCompletion(article) {
    const target = this.state.target;
    if (!target) return;
    if (titleKey(article.title) === titleKey(target) || (article.redirectedFrom && titleKey(article.redirectedFrom) === titleKey(target))) {
      if (this.state.mode === 'endless') this._endlessStageComplete();
      else this.finish('reached');
    }
  }

  /* ---------------------------------------------------------------- */
  /* Endless                                                          */
  /* ---------------------------------------------------------------- */

  async _endlessStageComplete() {
    this.state.stages += 1;
    const stage = this.state.stages + 1;
    this.state.endlessStage = stage;
    this.emit('stage', { stage, target: this.state.target });
    try {
      const next = await nextEndlessTarget({
        lang: this.state.lang,
        stage,
        currentTitle: this.state.current,
        exclude: this.state.route.map((r) => r.title),
        signal: this._signal(),
        seed: this.state.challenge && this.state.challenge.seed,
      });
      this.state.target = next.target;
      this.state.difficulty = next.difficulty;
      this.state.rules = { ...this.state.rules, difficulty: next.difficulty };
      this.targetInfo = null;
      this.emit('newtarget', { target: next.target, stage, difficulty: next.difficulty });
      this.emitState();
      this.saveActiveRun();
    } catch (err) {
      this.emit('error', { error: err, phase: 'endless' });
      this.finish('error');
    }
  }

  /* ---------------------------------------------------------------- */
  /* Timer controls                                                   */
  /* ---------------------------------------------------------------- */

  pause() {
    if (this.state.status !== 'playing') return false;
    this.timer.pause();
    this.state.status = 'paused';
    this.state.pausedAt = Date.now();
    this.emitState();
    this.saveActiveRun();
    return true;
  }

  resume() {
    if (this.state.status !== 'paused') return false;
    this.timer.resume();
    this.state.status = 'playing';
    this.state.pausedAt = null;
    this.emitState();
    return true;
  }

  togglePause() {
    return this.state.status === 'paused' ? this.resume() : this.pause();
  }

  addTime(ms) {
    this.timer.addTime(ms);
    this.emitState();
  }

  /* ---------------------------------------------------------------- */
  /* Hints                                                            */
  /* ---------------------------------------------------------------- */

  canUseHint() {
    if (!this.state.rules.allowHints) return { ok: false, reason: 'disabled' };
    if (this.state.hintsUsed >= 9) return { ok: false, reason: 'exhausted' };
    return { ok: true };
  }

  /**
   * @param {'topic'|'bridge'|'distance'} type
   * @returns {Promise<{ok:boolean, text:string, textKey?:string, data?:object, cost?:object, reason?:string}>}
   */
  async useHint(type = 'topic') {
    const allowed = this.canUseHint();
    if (!allowed.ok) {
      const text = allowed.reason === 'disabled'
        ? 'Hints are disabled in this mode'
        : 'No hints left for this run';
      return { ok: false, reason: allowed.reason, text };
    }
    const settings = Settings.all;
    const cost = {
      seconds: Number(settings.hintPenaltySeconds) || 0,
      clicks: Number(settings.hintPenaltyClicks) || 0,
    };

    const targetInfo = await this.getTargetInfo();
    let hint;
    try {
      hint = await buildHint({
        type,
        lang: this.state.lang,
        current: this.state.current,
        target: this.state.target,
        targetInfo,
        signal: this._signal(),
      });
    } catch (err) {
      return { ok: false, reason: 'error', text: describeError(err, (k) => k) };
    }

    this.state.hintsUsed += 1;
    if (!this.state.hintTypesUsed.includes(type)) this.state.hintTypesUsed.push(type);
    if (cost.seconds) this.timer.addTime(cost.seconds * 1000);
    if (cost.clicks) this.state.clicks += cost.clicks;
    this.state.lastHint = { ...hint, cost, at: Date.now(), index: this.state.hintsUsed };

    this.emit('hint', this.state.lastHint);
    this.emitState();
    this.saveActiveRun();
    return { ok: true, ...hint, cost };
  }

  async getTargetInfo() {
    if (this.targetInfo || !this.state.target) return this.targetInfo;
    try {
      const map = await getPageInfo(this.state.lang, [this.state.target], { signal: this._signal() });
      const info = map[titleKey(this.state.target)] || Object.values(map)[0] || {};
      let categories = info.categories;
      if (!categories) {
        try {
          const art = await getArticle(this.state.lang, this.state.target, { signal: this._signal() });
          categories = art.categories;
        } catch { categories = []; }
      }
      this.targetInfo = { ...info, categories: categories || [] };
    } catch {
      this.targetInfo = { categories: [], description: '', extract: '' };
    }
    return this.targetInfo;
  }

  /* ---------------------------------------------------------------- */
  /* Power-ups                                                        */
  /* ---------------------------------------------------------------- */

  canUsePowerup(id) {
    const p = this.state.powerups[id];
    if (!p) return { ok: false, reason: 'unknown' };
    if (!p.allowed || !this.state.rules.allowPowerups) return { ok: false, reason: 'disabled' };
    if (p.uses <= 0) return { ok: false, reason: 'exhausted' };
    return { ok: true };
  }

  async usePowerup(id) {
    const check = this.canUsePowerup(id);
    if (!check.ok) {
      this.emit('powerup-denied', { id, reason: check.reason });
      return { ok: false, reason: check.reason };
    }
    const def = powerupById(id);
    const p = this.state.powerups[id];
    p.uses -= 1;
    p.usedCount += 1;
    this.state.powerupUses += 1;

    let result = { ok: true, id, icon: def.icon };
    switch (id) {
      case 'freeze': {
        this.timer.freeze(FREEZE_MS);
        result.message = `Timer frozen for ${Math.round(FREEZE_MS / 1000)} seconds`;
        break;
      }
      case 'radar': {
        const info = await this.getTargetInfo();
        const clue = radarClue(info);
        this.state.lastRadar = { ...clue, at: Date.now() };
        result.message = clue.data && clue.data.clue ? `The target is about: ${clue.data.clue}` : 'No clue available for this target.';
        result.clue = clue;
        break;
      }
      case 'scanner': {
        const info = await this.getTargetInfo();
        const links = await getOutgoingLinks(this.state.lang, this.state.current, { limit: 500, signal: this._signal() });
        const ranked = scoreLinksForTarget(links, this.state.target, info);
        const scores = new Map(ranked.map((r) => [r.link, r.score]));
        const hits = ranked.filter((r) => r.score > 0).length;
        this.state.effects.scanner = true;
        this.emit('scan', { scores, hits });
        result.message = hits ? `${hits} link(s) look relevant` : 'No obviously relevant links found';
        result.scores = scores;
        break;
      }
      case 'doubleVision': {
        p.activeUntil = Date.now() + (def.durationMs || 30000);
        this.state.effects.doubleVision = true;
        result.message = 'Extra context shown';
        setTimeout(() => {
          this.state.effects.doubleVision = false;
          this.emitState();
        }, def.durationMs || 30000);
        break;
      }
      case 'backtrack': {
        const ok = await this.backtrack();
        result.ok = ok;
        result.message = ok ? 'Backtracked one article' : 'Nothing to backtrack to';
        if (!ok) { p.uses += 1; this.state.powerupUses -= 1; p.usedCount -= 1; }
        break;
      }
      default:
        break;
    }

    this.emit('powerup', result);
    this.emitState();
    this.saveActiveRun();
    return result;
  }

  /* ---------------------------------------------------------------- */
  /* Finishing                                                        */
  /* ---------------------------------------------------------------- */

  finish(reason = 'reached') {
    if (this.state.status === 'finished' || this.state.status === 'idle') return this.lastResult || null;
    const completed = reason === 'reached';
    this.timer.stop();
    this.state.status = 'finished';

    // Close out the last route step's dwell time.
    const lastStep = this.state.route[this.state.route.length - 1];
    if (lastStep && lastStep.elapsedMs !== null) lastStep.spentMs = Math.max(0, this.timer.elapsedMs - lastStep.elapsedMs);

    const elapsedMs = Math.round(this.timer.elapsedMs);
    const rules = this.state.rules;
    const scoreResult = computeScore({
      mode: this.state.mode,
      difficulty: this.state.difficulty,
      elapsedMs,
      clicks: this.state.clicks,
      hintsUsed: this.state.hintsUsed,
      powerupsUsed: this.state.powerupUses,
      streak: this.state.streakBefore,
      timeLimitMs: this.state.timer.limitMs,
      stages: this.state.stages,
      parClicks: rules.parClicks,
      parSeconds: rules.parSeconds,
      completed,
    });
    const rating = computeRating({
      difficulty: this.state.difficulty,
      elapsedMs,
      clicks: this.state.clicks,
      hintsUsed: this.state.hintsUsed,
      powerupsUsed: this.state.powerupUses,
      parClicks: rules.parClicks,
      parSeconds: rules.parSeconds,
      mode: this.state.mode,
      completed,
    }, scoreResult);

    const xpResult = computeXp({
      mode: this.state.mode,
      difficulty: this.state.difficulty,
      elapsedMs,
      clicks: this.state.clicks,
      hintsUsed: this.state.hintsUsed,
      powerupsUsed: this.state.powerupUses,
      streak: this.state.streakBefore,
      stages: this.state.stages,
      parClicks: rules.parClicks,
      parSeconds: rules.parSeconds,
      completed,
    }, scoreResult);

    const runInput = {
      mode: this.state.mode,
      difficulty: this.state.difficulty,
      lang: this.state.lang,
      start: this.state.start,
      target: this.state.target,
      end: this.state.current,
      clicks: this.state.clicks,
      invalidClicks: this.state.invalidClicks,
      elapsedMs,
      frozenMs: this.timer.frozenMs,
      hintsUsed: this.state.hintsUsed,
      powerupsUsed: this.state.powerupUses,
      powerups: Object.entries(this.state.powerups).filter(([, v]) => v.usedCount > 0).map(([k, v]) => `${k}×${v.usedCount}`),
      score: scoreResult.total,
      stars: rating.stars,
      xp: xpResult.total,
      completed,
      reason,
      modifiers: this.state.modifiers,
      stages: this.state.stages,
      daily: this.state.mode === 'daily',
      route: this.state.route.map((s) => ({ title: s.title, ts: s.ts, elapsedMs: s.elapsedMs, spentMs: s.spentMs, via: s.via })),
    };

    const { run, comparison } = Statistics.recordRun(runInput);

    // Daily bookkeeping
    let dailyStreak = null;
    if (this.state.mode === 'daily' && this.state.dailyDateKey) {
      Statistics.recordDailyResult(this.state.dailyDateKey, {
        completed,
        lang: this.state.lang,
        start: this.state.start,
        target: this.state.target,
        bestTimeMs: completed ? elapsedMs : null,
        bestClicks: completed ? this.state.clicks : null,
        bestScore: completed ? scoreResult.total : null,
        lastAt: Date.now(),
      });
      if (completed) dailyStreak = Statistics.touchDailyStreak(this.state.dailyDateKey);
    }

    // XP + achievements
    const xpAdded = Profile.addXp(xpResult.total, { reason: this.state.mode });
    const ctx = Achievements.buildContext({
      run,
      profile: Profile.all,
      stats: Statistics.all,
      bookmarks: Bookmarks.articles.length,
    });
    let unlocked = Achievements.evaluate(ctx);
    if (unlocked.length) {
      const bonusXp = unlocked.reduce((a, u) => a + (u.xp || 0), 0);
      if (bonusXp) Profile.addXp(bonusXp, { reason: 'achievement' });
      // second pass: achievements that depend on the new level
      unlocked = unlocked.concat(Achievements.evaluate(Achievements.buildContext({
        run, profile: Profile.all, stats: Statistics.all, bookmarks: Bookmarks.articles.length,
      })));
    }

    // Local leaderboard
    const entry = Leaderboard.entryFromRun(run, {
      playerName: Profile.all.name,
      challengeKey: challengeKey({ lang: this.state.lang, start: this.state.start, target: this.state.target }),
    });
    Leaderboard.submit(entry).catch(() => {});

    removeRaw(KEYS.activeRun);

    const result = {
      run,
      reason,
      completed,
      score: scoreResult,
      rating,
      xp: xpResult,
      xpAdded,
      comparison,
      achievements: unlocked,
      dailyStreak,
      entry,
      level: Profile.progress,
      statsSummary: Statistics.summary(),
    };
    this.lastResult = result;
    this.emit('ended', result);
    this.emitState();
    return result;
  }

  abandon() {
    if (this.state.status === 'idle' || this.state.status === 'finished') return null;
    return this.finish('abandoned');
  }

  /** Sandbox has no target, so "finishing" just means stopping the session. */
  endSandbox() {
    this.timer.stop();
    this.state.status = 'finished';
    removeRaw(KEYS.activeRun);
    this.emit('ended', { run: null, completed: false, sandbox: true, reason: 'sandbox' });
    return { sandbox: true };
  }

  /* ---------------------------------------------------------------- */
  /* Persistence of the active run                                    */
  /* ---------------------------------------------------------------- */

  snapshot() {
    return {
      ...this.state,
      timer: { ...this.state.timer, elapsedMs: Math.round(this.timer.elapsedMs) },
      articleTitle: this.article ? this.article.title : null,
    };
  }

  saveActiveRun() {
    if (this.state.status !== 'playing' && this.state.status !== 'paused') return;
    const payload = {
      savedAt: Date.now(),
      mode: this.state.mode,
      lang: this.state.lang,
      difficulty: this.state.difficulty,
      rules: this.state.rules,
      challenge: this.state.challenge,
      start: this.state.start,
      target: this.state.target,
      current: this.state.current,
      clicks: this.state.clicks,
      invalidClicks: this.state.invalidClicks,
      route: this.state.route,
      hintsUsed: this.state.hintsUsed,
      hintTypesUsed: this.state.hintTypesUsed,
      powerups: this.state.powerups,
      powerupUses: this.state.powerupUses,
      stages: this.state.stages,
      endlessStage: this.state.endlessStage,
      modifiers: this.state.modifiers,
      streakBefore: this.state.streakBefore,
      dailyDateKey: this.state.dailyDateKey,
      seedString: this.state.seedString,
      elapsedMs: Math.round(this.timer.elapsedMs),
      frozenMs: this.timer.frozenMs,
      startedAt: this.state.startedAt,
    };
    writeJson(KEYS.activeRun, payload);
  }

  static hasSavedRun() {
    const data = readJson(KEYS.activeRun, null);
    return Boolean(data && data.mode && data.start && data.target !== undefined);
  }

  static savedRunInfo() {
    const data = readJson(KEYS.activeRun, null);
    if (!data) return null;
    return {
      mode: data.mode,
      lang: data.lang,
      difficulty: data.difficulty,
      start: data.start,
      target: data.target,
      clicks: data.clicks,
      elapsedMs: data.elapsedMs,
      savedAt: data.savedAt,
    };
  }

  /** Restores a saved run (used by the "Continue run" card). */
  async restore(saved = null) {
    const data = saved || readJson(KEYS.activeRun, null);
    if (!data) return null;
    this.abort();
    this.state = { ...this._blankState(), ...data };
    this.state.status = 'paused';
    this.state.loading = false;
    this.state.error = null;
    this.targetInfo = null;
    this._articleTimes = new Map();

    this.timer = new GameTimer({
      mode: this.state.timer && this.state.timer.mode ? this.state.timer.mode : (this.state.rules.countdown ? 'countdown' : 'stopwatch'),
      limitMs: this.state.rules.timeLimitMs || 0,
      tickMs: 100,
    });
    this.timer._accumulated = data.elapsedMs || 0;
    this._bindTimer();

    const article = await this.loadArticle(data.current || data.start, { count: false, via: 'restore' });
    if (!article) return null;
    this.state.status = 'paused';
    this.emitState();
    this.emit('restored', this.snapshot());
    return this.snapshot();
  }

  static clearSavedRun() {
    removeRaw(KEYS.activeRun);
  }

  /* ---------------------------------------------------------------- */
  /* Misc helpers used by the UI                                      */
  /* ---------------------------------------------------------------- */

  emitState() {
    this.emit('state', this.snapshot());
  }

  routeWithDwell() {
    const now = this.state.status === 'playing' ? this.timer.elapsedMs : this.state.timer.elapsedMs;
    return this.state.route.map((step, i) => {
      const isLast = i === this.state.route.length - 1;
      const spent = isLast && this.state.status === 'playing' ? Math.max(0, now - step.elapsedMs) : (step.spentMs ?? null);
      return { ...step, index: i, spentMs: spent, url: articleUrl(this.state.lang, step.title) };
    });
  }

  timeOnCurrentArticle() {
    if (!this.state.route.length) return 0;
    const last = this.state.route[this.state.route.length - 1];
    return Math.max(0, this.timer.elapsedMs - last.elapsedMs);
  }

  visitedKeys() {
    return new Set(this.state.route.map((s) => titleKey(s.title)));
  }

  async retryArticle(title) {
    return this.loadArticle(title, { count: false, via: 'retry', force: true });
  }

  progressLabel() {
    if (this.state.mode === 'endless') return `Stage ${this.state.endlessStage}`;
    if (this.state.mode === 'sandbox') return 'Sandbox';
    return null;
  }
}

export const game = new GameSession();
export { describeError, WikiError, levelFromXp, cleanCategories };
