/* storage/statistics.js — every number the Statistics screen shows, persisted
 * locally. Also owns streaks and personal bests. */

import { Doc, KEYS } from '../core/store.js';
import { Emitter, dayKey, mean, median, sumBy, titleKey, uid } from '../core/util.js';

export const STATS_VERSION = 2;
const MAX_RUNS = 250;
const MAX_UNIQUE = 6000;

const DEFAULTS = {
  totalRuns: 0,
  completedRuns: 0,
  failedRuns: 0,
  totalPlayMs: 0,
  totalClicks: 0,
  totalHints: 0,
  totalPowerups: 0,
  completedTimeMs: 0,
  completedClicks: 0,
  streak: { current: 0, longest: 0, lastCompletedAt: null, lastDay: null },
  dailyStreak: { current: 0, longest: 0, lastDay: null },
  best: {
    timeMs: null, timeRunId: null,
    clicks: null, clicksRunId: null,
    score: null, scoreRunId: null,
    routeLength: 0,
    fastestLanguage: null,
  },
  extremes: { longestRoute: 0, shortestRoute: null },
  perLanguage: {},   // { en: { runs, completed, bestTimeMs, bestScore, bestClicks } }
  perDifficulty: {}, // { hard: { runs, completed, bestScore, bestTimeMs } }
  perMode: {},       // { daily: { runs, completed, bestTimeMs, bestScore } }
  daily: {},         // { '2026-09-20': { attempts, completed, bestTimeMs, bestClicks, bestScore } }
  uniqueArticles: [],
  recentArticles: [], // [{ title, lang, ts, count }]
  runs: [],           // newest first
  firstPlayedAt: null,
  lastPlayedAt: null,
};

const emitter = new Emitter();
let doc = null;

function ensureBucket(map, key) {
  if (!map[key]) map[key] = { runs: 0, completed: 0, bestTimeMs: null, bestScore: null, bestClicks: null };
  return map[key];
}

function bumpBest(bucket, run) {
  if (!run.completed) return;
  if (bucket.bestTimeMs === null || run.elapsedMs < bucket.bestTimeMs) bucket.bestTimeMs = run.elapsedMs;
  if (bucket.bestScore === null || run.score > bucket.bestScore) bucket.bestScore = run.score;
  if (run.clicks !== undefined && (bucket.bestClicks === null || run.clicks < bucket.bestClicks)) bucket.bestClicks = run.clicks;
}

/** A compact, serialisable record of one run. */
export function buildRunRecord(input) {
  const route = Array.isArray(input.route) ? input.route : [];
  return {
    id: input.id || uid('run'),
    ts: input.ts || Date.now(),
    day: dayKey(input.ts ? new Date(input.ts) : new Date()),
    mode: input.mode || 'quick',
    difficulty: input.difficulty || 'normal',
    lang: input.lang || 'en',
    start: input.start || '',
    target: input.target || '',
    end: input.end || '',
    clicks: Number(input.clicks) || 0,
    invalidClicks: Number(input.invalidClicks) || 0,
    elapsedMs: Math.max(0, Math.round(Number(input.elapsedMs) || 0)),
    frozenMs: Math.max(0, Math.round(Number(input.frozenMs) || 0)),
    hintsUsed: Number(input.hintsUsed) || 0,
    powerupsUsed: Number(input.powerupsUsed) || 0,
    powerups: Array.isArray(input.powerups) ? input.powerups : [],
    score: Math.round(Number(input.score) || 0),
    stars: Number(input.stars) || 0,
    xp: Math.round(Number(input.xp) || 0),
    completed: Boolean(input.completed),
    reason: input.reason || (input.completed ? 'reached' : 'failed'),
    modifiers: Array.isArray(input.modifiers) ? input.modifiers.map((m) => (typeof m === 'string' ? m : m.id)) : [],
    stages: Number(input.stages) || 0,
    daily: Boolean(input.daily),
    route: route.map((step) => ({
      title: typeof step === 'string' ? step : step.title,
      ts: typeof step === 'string' ? null : step.ts || null,
      elapsedMs: typeof step === 'string' ? null : step.elapsedMs ?? null,
      spentMs: typeof step === 'string' ? null : step.spentMs ?? null,
      via: typeof step === 'string' ? null : step.via || 'link',
    })),
  };
}

export const Statistics = {
  init() {
    doc = new Doc(KEYS.statistics, DEFAULTS, { version: STATS_VERSION, migrate: (old) => ({ ...DEFAULTS, ...old }) });
    return doc.data;
  },
  get all() { return doc.data; },

  /** Records a finished (or failed) run and returns comparison info. */
  recordRun(input) {
    const run = buildRunRecord(input);
    const d = doc.data;
    const before = {
      timeMs: d.best.timeMs,
      clicks: d.best.clicks,
      score: d.best.score,
      routeLength: d.best.routeLength,
    };

    d.totalRuns += 1;
    d.totalPlayMs += run.elapsedMs;
    d.totalClicks += run.clicks;
    d.totalHints += run.hintsUsed;
    d.totalPowerups += run.powerupsUsed;
    d.firstPlayedAt = d.firstPlayedAt || run.ts;
    d.lastPlayedAt = run.ts;

    if (run.completed) {
      d.completedRuns += 1;
      d.completedTimeMs += run.elapsedMs;
      d.completedClicks += run.clicks;
      d.streak.current += 1;
      d.streak.lastCompletedAt = run.ts;
      d.streak.lastDay = run.day;
      if (d.streak.current > d.streak.longest) d.streak.longest = d.streak.current;

      if (d.best.timeMs === null || run.elapsedMs < d.best.timeMs) { d.best.timeMs = run.elapsedMs; d.best.timeRunId = run.id; d.best.fastestLanguage = run.lang; }
      if (d.best.clicks === null || run.clicks < d.best.clicks) { d.best.clicks = run.clicks; d.best.clicksRunId = run.id; }
      if (d.best.score === null || run.score > d.best.score) { d.best.score = run.score; d.best.scoreRunId = run.id; }
      const routeLen = run.route.length;
      if (routeLen > d.best.routeLength) d.best.routeLength = routeLen;
      if (routeLen > d.extremes.longestRoute) d.extremes.longestRoute = routeLen;
      if (d.extremes.shortestRoute === null || routeLen < d.extremes.shortestRoute) d.extremes.shortestRoute = routeLen;
    } else {
      d.failedRuns += 1;
      d.streak.current = 0;
    }

    const langBucket = ensureBucket(d.perLanguage, run.lang);
    langBucket.runs += 1;
    if (run.completed) langBucket.completed += 1;
    bumpBest(langBucket, run);

    const diffBucket = ensureBucket(d.perDifficulty, run.difficulty);
    diffBucket.runs += 1;
    if (run.completed) diffBucket.completed += 1;
    bumpBest(diffBucket, run);

    const modeBucket = ensureBucket(d.perMode, run.mode);
    modeBucket.runs += 1;
    if (run.completed) modeBucket.completed += 1;
    bumpBest(modeBucket, run);

    // articles seen (stored as `${lang}:${titleKey}`)
    const seen = new Set(d.uniqueArticles);
    for (const step of run.route) {
      const key = `${run.lang}:${titleKey(step.title)}`;
      if (!seen.has(key)) { seen.add(key); d.uniqueArticles.push(key); }
      const recent = d.recentArticles.find((r) => titleKey(r.title) === titleKey(step.title) && r.lang === run.lang);
      if (recent) { recent.ts = run.ts; recent.count = (recent.count || 1) + 1; }
      else d.recentArticles.unshift({ title: step.title, lang: run.lang, ts: run.ts, count: 1 });
    }
    if (d.uniqueArticles.length > MAX_UNIQUE) d.uniqueArticles = d.uniqueArticles.slice(-MAX_UNIQUE);
    d.recentArticles = d.recentArticles.slice(0, 60);

    d.runs.unshift(run);
    if (d.runs.length > MAX_RUNS) d.runs = d.runs.slice(0, MAX_RUNS);

    doc.save();

    const after = { timeMs: d.best.timeMs, clicks: d.best.clicks, score: d.best.score, routeLength: d.best.routeLength };
    const improved = {
      time: run.completed && (before.timeMs === null || run.elapsedMs < before.timeMs),
      clicks: run.completed && (before.clicks === null || run.clicks < before.clicks),
      score: run.completed && (before.score === null || run.score > before.score),
      routeLength: run.completed && run.route.length > before.routeLength,
    };
    const isFirst = run.completed && before.score === null;

    const comparison = {
      isFirst,
      improved: Object.values(improved).some(Boolean),
      improvedKeys: Object.entries(improved).filter(([, v]) => v).map(([k]) => k),
      previousBest: before,
      personalBest: after,
      previous: before.timeMs === null ? null : { timeMs: before.timeMs, clicks: before.clicks, score: before.score },
    };
    emitter.emit('run', { run, comparison });
    return { run, comparison, improved };
  },

  recordDailyResult(dateKey, patch) {
    const d = doc.data;
    if (!d.daily) d.daily = {};
    const cur = d.daily[dateKey] || { attempts: 0, completed: false, bestTimeMs: null, bestClicks: null, bestScore: null };
    cur.attempts += 1;
    Object.assign(cur, patch, { attempts: cur.attempts });
    d.daily[dateKey] = cur;
    doc.save();
    return cur;
  },

  getDailyResult(dateKey) {
    return (doc.data.daily && doc.data.daily[dateKey]) || null;
  },

  touchDailyStreak(day) {
    const d = doc.data;
    if (d.dailyStreak.lastDay === day) return d.dailyStreak;
    const y = new Date(day);
    y.setDate(y.getDate() - 1);
    const prev = dayKey(y);
    d.dailyStreak.current = d.dailyStreak.lastDay === prev ? d.dailyStreak.current + 1 : 1;
    d.dailyStreak.lastDay = day;
    if (d.dailyStreak.current > d.dailyStreak.longest) d.dailyStreak.longest = d.dailyStreak.current;
    doc.save();
    return d.dailyStreak;
  },

  personalBest({ mode, lang, difficulty } = {}) {
    const runs = doc.data.runs.filter((r) => r.completed
      && (!mode || r.mode === mode)
      && (!lang || r.lang === lang)
      && (!difficulty || r.difficulty === difficulty));
    if (!runs.length) return null;
    return {
      timeMs: Math.min(...runs.map((r) => r.elapsedMs)),
      clicks: Math.min(...runs.map((r) => r.clicks)),
      score: Math.max(...runs.map((r) => r.score)),
      stars: Math.max(...runs.map((r) => r.stars || 0)),
      runs: runs.length,
    };
  },

  bestForChallenge({ lang, start, target }) {
    const runs = doc.data.runs.filter((r) => r.completed && r.lang === lang
      && titleKey(r.start) === titleKey(start) && titleKey(r.target) === titleKey(target));
    if (!runs.length) return null;
    return {
      timeMs: Math.min(...runs.map((r) => r.elapsedMs)),
      clicks: Math.min(...runs.map((r) => r.clicks)),
      score: Math.max(...runs.map((r) => r.score)),
      attempts: runs.length,
    };
  },

  summary() {
    const d = doc.data;
    const completed = d.runs.filter((r) => r.completed);
    const times = completed.map((r) => r.elapsedMs);
    const clicks = completed.map((r) => r.clicks);
    const routes = completed.map((r) => r.route.length);
    const weekAgo = Date.now() - 7 * 86400000;
    return {
      ...d,
      completionRate: d.totalRuns ? d.completedRuns / d.totalRuns : 0,
      averageTimeMs: mean(times),
      medianTimeMs: median(times),
      averageClicks: mean(clicks),
      averageRoute: mean(routes),
      totalUniqueArticles: d.uniqueArticles.length,
      languagesPlayed: Object.keys(d.perLanguage),
      difficultiesPlayed: Object.keys(d.perDifficulty),
      modesPlayed: Object.keys(d.perMode),
      runsThisWeek: d.runs.filter((r) => r.ts >= weekAgo).length,
      completedThisWeek: d.runs.filter((r) => r.ts >= weekAgo && r.completed).length,
      bestStars: completed.reduce((m, r) => Math.max(m, r.stars || 0), 0),
      totalXpEarned: sumBy(d.runs, (r) => r.xp || 0),
    };
  },

  runs({ mode, lang, difficulty, limit = 50, completedOnly = false } = {}) {
    return doc.data.runs
      .filter((r) => (!mode || r.mode === mode)
        && (!lang || r.lang === lang)
        && (!difficulty || r.difficulty === difficulty)
        && (!completedOnly || r.completed))
      .slice(0, limit);
  },

  getRun(id) { return doc.data.runs.find((r) => r.id === id) || null; },

  recentArticles(limit = 20) { return doc.data.recentArticles.slice(0, limit); },

  /** Simple chart-friendly series (oldest → newest). */
  series(metric = 'timeMs', { limit = 30, completedOnly = true } = {}) {
    const runs = doc.data.runs.filter((r) => (completedOnly ? r.completed : true)).slice(0, limit).reverse();
    return runs.map((r) => ({
      ts: r.ts,
      value: metric === 'timeMs' ? r.elapsedMs
        : metric === 'clicks' ? r.clicks
          : metric === 'score' ? r.score
            : metric === 'route' ? r.route.length
              : r.elapsedMs,
      label: r.target || r.mode,
      mode: r.mode,
      difficulty: r.difficulty,
    }));
  },

  reset() {
    doc.reset();
    emitter.emit('reset', {});
    return doc.data;
  },

  on(fn) { return emitter.on('run', fn); },
  export() { return JSON.parse(JSON.stringify(doc.data)); },
  import(data) {
    doc.data = { ...JSON.parse(JSON.stringify(DEFAULTS)), ...(data || {}) };
    doc.save();
    emitter.emit('reset', {});
    return doc.data;
  },
};
