/* storage/achievements.js — definitions + automatic unlocking.
 *
 * Each achievement exposes `check(ctx)` where ctx carries everything about the
 * finished run plus global stats, so unlocking is data-driven and testable.
 */

import { Doc, KEYS } from '../core/store.js';
import { Emitter } from '../core/util.js';
import { levelFromXp } from '../game/scoring.js';

export const ACHIEVEMENTS = [
  {
    id: 'firstRun',
    icon: '🎉',
    tier: 'bronze',
    check: (c) => c.completedRuns >= 1,
    progress: (c) => [c.completedRuns, 1],
  },
  {
    id: 'speedDemon',
    icon: '⚡',
    tier: 'gold',
    check: (c) => c.run.completed && c.run.elapsedMs < 60000,
    progress: (c) => [c.run.completed && c.run.elapsedMs < 60000 ? 1 : 0, 1],
  },
  {
    id: 'minimalist',
    icon: '🪶',
    tier: 'gold',
    check: (c) => c.run.completed && c.run.clicks <= 3,
    progress: (c) => [Math.max(0, 4 - Math.max(c.run.clicks, 1)), 3],
  },
  {
    id: 'marathon',
    icon: '🏃',
    tier: 'silver',
    check: (c) => c.run.completed && c.run.route.length >= 20,
    progress: (c) => [c.run.route.length, 20],
  },
  {
    id: 'noHints',
    icon: '🧘',
    tier: 'silver',
    check: (c) => c.run.completed && c.run.hintsUsed === 0,
    progress: (c) => [c.run.hintsUsed === 0 && c.run.completed ? 1 : 0, 1],
  },
  {
    id: 'explorer',
    icon: '🧭',
    tier: 'silver',
    check: (c) => c.uniqueArticles >= 100,
    progress: (c) => [Math.min(c.uniqueArticles, 100), 100],
  },
  {
    id: 'polyglot',
    icon: '🌍',
    tier: 'gold',
    check: (c) => c.completedLanguages >= 5,
    progress: (c) => [Math.min(c.completedLanguages, 5), 5],
  },
  {
    id: 'perfection',
    icon: '💎',
    tier: 'platinum',
    check: (c) => c.run.completed && c.run.difficulty === 'expert' && c.run.hintsUsed === 0 && c.run.powerupsUsed === 0,
    progress: (c) => [c.run.completed && c.run.difficulty === 'expert' ? 1 : 0, 1],
  },
  {
    id: 'streak',
    icon: '🔥',
    tier: 'gold',
    check: (c) => c.streakCurrent >= 10,
    progress: (c) => [Math.min(c.streakCurrent, 10), 10],
  },
  {
    id: 'daily',
    icon: '📅',
    tier: 'silver',
    check: (c) => c.dailyCompleted >= 7,
    progress: (c) => [Math.min(c.dailyCompleted, 7), 7],
  },
  {
    id: 'chaos',
    icon: '🌀',
    tier: 'silver',
    check: (c) => c.run.completed && c.run.difficulty === 'chaos',
    progress: (c) => [c.run.completed && c.run.difficulty === 'chaos' ? 1 : 0, 1],
  },
  {
    id: 'clickMaster',
    icon: '🖱️',
    tier: 'gold',
    check: (c) => c.run.completed && c.run.mode === 'clickattack' && c.run.clicks <= 5,
    progress: (c) => [c.run.mode === 'clickattack' ? Math.max(0, 6 - Math.max(c.run.clicks, 1)) : 0, 5],
  },
  {
    id: 'timeLord',
    icon: '⏱️',
    tier: 'silver',
    check: (c) => c.run.completed && c.run.mode === 'timeattack',
    progress: (c) => [c.run.completed && c.run.mode === 'timeattack' ? 1 : 0, 1],
  },
  {
    id: 'endless10',
    icon: '♾️',
    tier: 'platinum',
    check: (c) => c.run.mode === 'endless' && (c.run.stages || 0) >= 10,
    progress: (c) => [Math.min(c.run.stages || 0, 10), 10],
  },
  {
    id: 'level5',
    icon: '⭐',
    tier: 'bronze',
    check: (c) => c.level >= 5,
    progress: (c) => [Math.min(c.level, 5), 5],
  },
  {
    id: 'hundredRuns',
    icon: '💯',
    tier: 'platinum',
    check: (c) => c.completedRuns >= 100,
    progress: (c) => [Math.min(c.completedRuns, 100), 100],
  },
  {
    id: 'nightOwl',
    icon: '🦉',
    tier: 'bronze',
    hidden: true,
    check: (c) => {
      if (!c.run.completed) return false;
      const h = new Date(c.run.ts).getHours();
      return h >= 0 && h < 4;
    },
    progress: (c) => [c.run.completed && new Date(c.run.ts).getHours() < 4 ? 1 : 0, 1],
  },
  {
    id: 'bookworm',
    icon: '📚',
    tier: 'bronze',
    check: (c) => c.bookmarks >= 10,
    progress: (c) => [Math.min(c.bookmarks, 10), 10],
  },
  {
    id: 'zeroHintsExpert',
    icon: '🥷',
    tier: 'platinum',
    check: (c) => c.run.completed && c.run.difficulty === 'expert' && c.run.clicks <= 5,
    progress: (c) => [c.run.completed && c.run.difficulty === 'expert' && c.run.clicks <= 5 ? 1 : 0, 1],
  },
];

export const TIER_ORDER = ['bronze', 'silver', 'gold', 'platinum'];

const DEFAULTS = { unlocked: {}, totalUnlocked: 0, totalXpFromAchievements: 0 };
const TIER_XP = { bronze: 25, silver: 50, gold: 90, platinum: 150 };

const emitter = new Emitter();
let doc = null;

export function achievementById(id) {
  return ACHIEVEMENTS.find((a) => a.id === id) || null;
}

export const Achievements = {
  init() {
    doc = new Doc(KEYS.achievements, DEFAULTS, { version: 1 });
    return doc.data;
  },
  get all() { return doc.data; },
  isUnlocked(id) { return Boolean(doc.data.unlocked[id]); },
  unlockedIds() { return Object.keys(doc.data.unlocked); },
  unlockedCount() { return Object.keys(doc.data.unlocked).length; },

  /** Builds the context object used by every check(). */
  buildContext({ run = {}, profile = {}, stats = {}, bookmarks = 0 } = {}) {
    const completedRuns = stats.completedRuns || 0;
    const completedLanguages = Object.entries(stats.perLanguage || {})
      .filter(([, v]) => (v.completed || 0) > 0).length;
    const dailyCompleted = Object.values(stats.daily || {}).filter((d) => d && d.completed).length;
    return {
      run,
      profile,
      stats,
      bookmarks,
      completedRuns,
      completedLanguages,
      dailyCompleted,
      uniqueArticles: (stats.uniqueArticles || []).length,
      streakCurrent: (stats.streak && stats.streak.current) || 0,
      streakLongest: (stats.streak && stats.streak.longest) || 0,
      level: levelFromXp(profile.xp || 0).level,
    };
  },

  /** Returns the list of newly unlocked achievements (and persists them). */
  evaluate(ctx, { now = Date.now() } = {}) {
    const newly = [];
    for (const ach of ACHIEVEMENTS) {
      if (doc.data.unlocked[ach.id]) continue;
      let ok = false;
      try { ok = Boolean(ach.check(ctx)); } catch (err) { console.warn('[achievements] check failed', ach.id, err); }
      if (!ok) continue;
      const xp = TIER_XP[ach.tier] || 25;
      doc.data.unlocked[ach.id] = { at: now, xp };
      doc.data.totalUnlocked = Object.keys(doc.data.unlocked).length;
      doc.data.totalXpFromAchievements += xp;
      newly.push({ ...ach, unlockedAt: now, xp });
    }
    if (newly.length) {
      doc.save();
      for (const a of newly) emitter.emit('unlocked', a);
    }
    return newly;
  },

  progressFor(ach, ctx) {
    try {
      const [cur, target] = ach.progress ? ach.progress(ctx) : [0, 1];
      return { current: Math.min(cur, target), target, ratio: target ? Math.min(1, cur / target) : 0 };
    } catch { return { current: 0, target: 1, ratio: 0 }; }
  },

  reset() {
    doc.reset();
    emitter.emit('reset', {});
  },

  on(fn) { return emitter.on('unlocked', fn); },
  export() { return JSON.parse(JSON.stringify(doc.data)); },
  import(data) {
    doc.data = { ...JSON.parse(JSON.stringify(DEFAULTS)), ...(data || {}) };
    doc.save();
  },
};
