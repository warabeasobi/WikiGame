/* game/scoring.js — transparent, non-trivial scoring + star rating + XP.
 *
 * Score model (all constants are exported so the results screen can explain
 * exactly where every point came from):
 *
 *   base            1000
 *   difficulty      + 600 * difficultyMultiplier
 *   speed           + 700 * clamp((parTime - time) / parTime, -1, 1.5)
 *   clicks          + 700 * clamp((parClicks - clicks) / parClicks, -1, 1.5)
 *   hints           - 250 * hintsUsed
 *   power-ups       - 90  * powerupsUsed
 *   streak          + 35  * min(streak, 10)
 *   countdown rush  - 220 * (elapsed / timeLimit)        (time-limited modes only)
 *   mode multiplier x modeMultiplier                     (daily/time attack pay more)
 *
 * A perfect Expert run therefore lands far above a sloppy Easy run, and the
 * breakdown always adds up to the total shown on the results screen.
 */

import { clamp } from '../core/util.js';
import { difficultyConfig } from './difficulty.js';

export const SCORING = {
  base: 1000,
  difficultyWeight: 600,
  speedWeight: 700,
  clickWeight: 700,
  hintPenalty: 250,
  powerupPenalty: 90,
  streakWeight: 35,
  streakCap: 10,
  rushWeight: 220,
};

export const MODE_MULTIPLIERS = {
  quick: 1,
  custom: 1,
  daily: 1.15,
  timeattack: 1.1,
  clickattack: 1.15,
  endless: 1.2,
  sandbox: 0,
};

export const MODE_LABELS = {
  quick: 'Quick play',
  custom: 'Custom run',
  daily: 'Daily challenge',
  timeattack: 'Time attack',
  clickattack: 'Click attack',
  endless: 'Endless',
  sandbox: 'Sandbox',
};

export const MODE_LABEL_KEYS = {
  quick: 'modes.quick',
  custom: 'modes.custom',
  daily: 'modes.daily',
  timeattack: 'modes.timeattack',
  clickattack: 'modes.clickattack',
  endless: 'modes.endless',
  sandbox: 'modes.sandbox',
};

export function modeMultiplier(mode) {
  return MODE_MULTIPLIERS[mode] ?? 1;
}

/**
 * @param {object} run
 * @param {string} run.mode
 * @param {string} run.difficulty
 * @param {number} run.elapsedMs      measured elapsed time (penalties included)
 * @param {number} run.clicks         article-to-article navigations
 * @param {number} run.hintsUsed
 * @param {number} run.powerupsUsed
 * @param {number} run.streak         streak *before* this run
 * @param {number} [run.timeLimitMs]  countdown length, 0 for stopwatch
 * @param {number} [run.stages]       endless stages cleared
 * @param {boolean} run.completed
 */
export function computeScore(run) {
  const cfg = difficultyConfig(run.difficulty);
  const mode = run.mode || 'quick';
  const mult = modeMultiplier(mode);
  const parClicks = Math.max(1, run.parClicks || cfg.parClicks);
  const parMs = Math.max(15000, (run.parSeconds || cfg.parSeconds) * 1000);
  const elapsed = Math.max(0, run.elapsedMs || 0);
  const clicks = Math.max(0, run.clicks || 0);
  const hints = Math.max(0, run.hintsUsed || 0);
  const powerups = Math.max(0, run.powerupsUsed || 0);
  const streak = Math.max(0, run.streak || 0);

  const breakdown = [];
  const push = (key, label, value, detail) => breakdown.push({ key, label, value: Math.round(value), detail });

  push('base', 'results.base', SCORING.base);
  push('difficulty', 'results.difficultyBonus', SCORING.difficultyWeight * cfg.scoreMultiplier, cfg.label);

  const speedRatio = clamp((parMs - elapsed) / parMs, -1, 1.5);
  push('speed', 'results.timeBonus', SCORING.speedWeight * speedRatio * cfg.scoreMultiplier, `${(elapsed / 1000).toFixed(1)}s vs par ${(parMs / 1000).toFixed(0)}s`);

  const clickRatio = clamp((parClicks - clicks) / parClicks, -1, 1.5);
  push('clicks', 'results.clickBonus', SCORING.clickWeight * clickRatio * cfg.scoreMultiplier, `${clicks} vs par ${parClicks}`);

  if (hints) push('hints', 'results.hintPenalty', -SCORING.hintPenalty * hints, `×${hints}`);
  if (powerups) push('powerups', 'results.powerupPenalty', -SCORING.powerupPenalty * powerups, `×${powerups}`);
  if (streak) push('streak', 'results.streakBonus', SCORING.streakWeight * Math.min(streak, SCORING.streakCap), `×${Math.min(streak, SCORING.streakCap)}`);

  if (run.timeLimitMs && run.completed) {
    const rush = SCORING.rushWeight * clamp(elapsed / run.timeLimitMs, 0, 1.2);
    if (rush > 0) push('rush', 'results.timePenalty', -rush, `${(elapsed / 1000).toFixed(0)}s of ${(run.timeLimitMs / 1000).toFixed(0)}s`);
  }

  if (run.stages && run.stages > 0) push('stages', 'endless.reached', run.stages * 180, `×${run.stages}`);

  const raw = breakdown.reduce((acc, b) => acc + b.value, 0);
  const completedFactor = run.completed ? 1 : 0;
  const total = Math.max(0, Math.round(raw * mult * completedFactor));

  const perfect = parMs * 0.55;
  return {
    total,
    breakdown,
    multiplier: mult,
    completed: Boolean(run.completed),
    par: { clicks: parClicks, ms: parMs },
    ratioToPar: { time: elapsed / parMs, clicks: clicks / parClicks },
    maxReference: referenceMax({ ...run, parClicks, parSeconds: parMs / 1000 }),
    perfectMs: perfect,
  };
}

/** Roughly the best score obtainable for these parameters — used for stars. */
export function referenceMax(run) {
  const cfg = difficultyConfig(run.difficulty);
  const mult = modeMultiplier(run.mode);
  const parClicks = Math.max(1, run.parClicks || cfg.parClicks);
  const parMs = Math.max(15000, (run.parSeconds || cfg.parSeconds) * 1000);
  const best = SCORING.base
    + SCORING.difficultyWeight * cfg.scoreMultiplier
    + SCORING.speedWeight * 1.5 * cfg.scoreMultiplier
    + SCORING.clickWeight * 1.5 * cfg.scoreMultiplier
    + SCORING.streakWeight * SCORING.streakCap
    + (run.stages ? run.stages * 180 : 0);
  return Math.round(best * mult);
}

/** 0–5 stars from objective metrics. */
export function computeRating(run, scoreResult) {
  if (!run.completed) return { stars: 0, label: 'Failed', labelKey: 'results.failedTitle' };
  const cfg = difficultyConfig(run.difficulty);
  const parClicks = Math.max(1, run.parClicks || cfg.parClicks);
  const parMs = Math.max(15000, (run.parSeconds || cfg.parSeconds) * 1000);

  // Component ratios: 1 = at par, 0 = twice par.
  const timeScore = clamp(2 - (run.elapsedMs / parMs), 0, 1.2);
  const clickScore = clamp(2 - (run.clicks / parClicks), 0, 1.2);
  const cleanScore = clamp(1 - 0.18 * (run.hintsUsed || 0) - 0.08 * (run.powerupsUsed || 0), 0, 1);

  const composite = (timeScore * 0.4 + clickScore * 0.4 + cleanScore * 0.2) / 1.2;
  let stars = Math.round(composite * 5);
  if (run.clicks === 0) stars = Math.min(stars, 4);
  stars = clamp(stars, 1, 5);
  if (run.difficulty === 'chaos' && stars < 5) stars = Math.min(5, stars + 1);

  const labels = ['', 'Rough', 'Decent', 'Solid', 'Great', 'Flawless'];
  return { stars, label: labels[stars], labelKey: null, composite };
}

/* ------------------------------------------------------------------ */
/* XP + levels (cosmetic progression only)                            */
/* ------------------------------------------------------------------ */

export const XP_RULES = {
  base: 45,
  perDifficulty: 40,
  speedBonusMax: 60,
  clickBonusMax: 60,
  hintPenalty: 12,
  powerupPenalty: 4,
  streakBonus: 6,
  streakCap: 12,
  dailyBonus: 40,
  endlessStage: 25,
};

export function computeXp(run, scoreResult) {
  const cfg = difficultyConfig(run.difficulty);
  if (run.mode === 'sandbox' || !run.completed) return { total: 0, parts: [] };
  const parts = [];
  const add = (key, value) => parts.push({ key, value: Math.round(value) });

  add('base', XP_RULES.base);
  add('difficulty', XP_RULES.perDifficulty * cfg.xpMultiplier);

  const parMs = Math.max(15000, (run.parSeconds || cfg.parSeconds) * 1000);
  const speedRatio = clamp((parMs - run.elapsedMs) / parMs, 0, 1);
  add('speed', XP_RULES.speedBonusMax * speedRatio);

  const parClicks = Math.max(1, run.parClicks || cfg.parClicks);
  const clickRatio = clamp((parClicks - run.clicks) / parClicks, 0, 1);
  add('clicks', XP_RULES.clickBonusMax * clickRatio);

  add('streak', XP_RULES.streakBonus * Math.min(run.streak || 0, XP_RULES.streakCap));
  if (run.mode === 'daily') add('daily', XP_RULES.dailyBonus);
  if (run.mode === 'endless' && run.stages) add('stages', XP_RULES.endlessStage * run.stages);
  if (run.hintsUsed) add('hints', -XP_RULES.hintPenalty * run.hintsUsed);
  if (run.powerupsUsed) add('powerups', -XP_RULES.powerupPenalty * run.powerupsUsed);

  const total = Math.max(5, Math.round(parts.reduce((a, p) => a + p.value, 0)));
  return { total, parts };
}

/** Cumulative XP needed to reach `level`. Gentle curve: 120 * n^1.35. */
export function xpForLevel(level) {
  if (level <= 1) return 0;
  return Math.round(120 * Math.pow(level - 1, 1.35));
}

export function levelFromXp(xp) {
  const total = Math.max(0, xp || 0);
  let level = 1;
  while (level < 200 && total >= xpForLevel(level + 1)) level += 1;
  const currentFloor = xpForLevel(level);
  const nextFloor = xpForLevel(level + 1);
  const span = Math.max(1, nextFloor - currentFloor);
  const into = total - currentFloor;
  return {
    level,
    xp: total,
    intoLevel: into,
    levelSpan: span,
    toNext: Math.max(0, nextFloor - total),
    progress: clamp(into / span, 0, 1),
  };
}

export const COSMETICS = [
  { id: 'avatar-default', type: 'avatar', label: 'Explorer', emoji: '🧭', level: 1 },
  { id: 'avatar-owl', type: 'avatar', label: 'Night owl', emoji: '🦉', level: 2 },
  { id: 'theme-sunset', type: 'accent', label: 'Sunset accent', color: '#ff7b72', level: 3 },
  { id: 'avatar-rocket', type: 'avatar', label: 'Speedster', emoji: '🚀', level: 4 },
  { id: 'accent-mint', type: 'accent', label: 'Mint accent', color: '#3fb950', level: 5 },
  { id: 'avatar-dragon', type: 'avatar', label: 'Chaos dragon', emoji: '🐉', level: 7 },
  { id: 'accent-violet', type: 'accent', label: 'Violet accent', color: '#a371f7', level: 9 },
  { id: 'avatar-crown', type: 'avatar', label: 'Champion', emoji: '👑', level: 12 },
  { id: 'accent-gold', type: 'accent', label: 'Gold accent', color: '#e3b341', level: 15 },
];

export function unlockedCosmetics(level) {
  return COSMETICS.filter((c) => c.level <= level);
}

export function nextCosmetic(level) {
  return COSMETICS.find((c) => c.level > level) || null;
}
