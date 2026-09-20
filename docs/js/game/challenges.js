/* game/challenges.js — deterministic challenge generation (daily) plus custom
 * and mode-specific challenge builders.
 *
 * The daily challenge is derived from (date, language, difficulty) with a
 * seeded PRNG and a shared local popularity pool, so every player gets exactly
 * the same start/target article for a given day — no server required.
 */

import { hashString, mulberry32, dayKey, titleKey } from '../core/util.js';
import { generateChallenge, difficultyConfig } from './difficulty.js';
import { getPopularTitles, resolveTitle, randomArticle, isSupportedLanguage } from '../api/wikipedia.js';

export const DAILY_EPOCH = '2026-01-01';
export const DAILY_VERSION = 'v1';
const DAILY_DIFFICULTY_CYCLE = ['easy', 'normal', 'normal', 'hard', 'hard', 'expert', 'normal'];

/** Deterministic 32-bit seed for a given day + language. */
export function dailySeed(dateKey = dayKey(), lang = 'en', { difficulty = null } = {}) {
  return hashString(`${DAILY_VERSION}|${dateKey}|${lang}|${difficulty || 'auto'}`);
}

/** Which difficulty today's challenge uses (stable per day). */
export function dailyDifficulty(dateKey = dayKey(), lang = 'en') {
  const h = hashString(`${DAILY_VERSION}|difficulty|${dateKey}|${lang}`);
  return DAILY_DIFFICULTY_CYCLE[h % DAILY_DIFFICULTY_CYCLE.length];
}

export function dailySeedString(dateKey = dayKey(), lang = 'en') {
  return `${dateKey}-${lang}-${DAILY_VERSION}-${(dailySeed(dateKey, lang) % 100000).toString(36).toUpperCase().padStart(4, '0')}`;
}

/**
 * Builds today's challenge. Deterministic: the same date+language always yields
 * the same start/target pair.
 */
export async function dailyChallenge({ dateKey = dayKey(), lang = 'en', signal, difficulty = null, verify = true } = {}) {
  if (!isSupportedLanguage(lang)) throw new Error(`Unsupported language: ${lang}`);
  const diff = difficulty || dailyDifficulty(dateKey, lang);
  const seed = dailySeed(dateKey, lang, { difficulty: diff });
  // Make sure the shared popularity pool is loaded so seeding is identical
  // everywhere (it is a static file, so this is offline-friendly too).
  try { await getPopularTitles(lang, { signal }); } catch { /* fall back to the API */ }
  const challenge = await generateChallenge({ lang, difficulty: diff, seed, mode: 'daily', signal, verify });
  return {
    ...challenge,
    dateKey,
    seed,
    seedString: dailySeedString(dateKey, lang),
    difficulty: diff,
    mode: 'daily',
  };
}

/** Builds a challenge for any mode from a config object. */
export async function challengeForMode({
  mode = 'quick',
  lang = 'en',
  difficulty = 'normal',
  seed = null,
  start = null,
  target = null,
  timeLimitMs = null,
  signal,
  verify = true,
} = {}) {
  if (!isSupportedLanguage(lang)) throw new Error(`Unsupported language: ${lang}`);

  if (mode === 'daily') return dailyChallenge({ dateKey: dayKey(), lang, signal, difficulty: null, verify });

  if (mode === 'sandbox') {
    const startTitle = start ? await resolveTitle(lang, start, { signal }) : await randomArticle(lang, { signal });
    return { mode, lang, difficulty: 'normal', start: startTitle, target: null, seed: null, generatedAt: Date.now() };
  }

  if (mode === 'custom') {
    if (!start || !target) throw new Error('Custom runs need both a start and a target article');
    const [startTitle, targetTitle] = await Promise.all([
      resolveTitle(lang, start, { signal }),
      resolveTitle(lang, target, { signal }),
    ]);
    if (titleKey(startTitle) === titleKey(targetTitle)) throw new Error('same-article');
    return {
      mode, lang, difficulty, start: startTitle, target: targetTitle,
      seed: seed === null ? null : seed >>> 0, generatedAt: Date.now(), timeLimitMs,
    };
  }

  if (mode === 'endless') {
    const startTitle = start ? await resolveTitle(lang, start, { signal }) : await randomArticle(lang, { signal });
    const first = await generateChallenge({ lang, difficulty: 'easy', seed, mode: 'endless', signal, verify });
    return {
      mode, lang, difficulty: 'easy', start: startTitle, target: first.target,
      seed: seed === null ? null : seed >>> 0, generatedAt: Date.now(), endless: true,
    };
  }

  // quick / timeattack / clickattack
  return generateChallenge({ lang, difficulty, seed, mode, signal, verify, timeLimitMs });
}

export const TIME_ATTACK_OPTIONS = [
  { minutes: 1, ms: 60000, labelKey: 'timeattack.min1' },
  { minutes: 3, ms: 180000, labelKey: 'timeattack.min3' },
  { minutes: 5, ms: 300000, labelKey: 'timeattack.min5' },
  { minutes: 10, ms: 600000, labelKey: 'timeattack.min10' },
];

/** Time limit used when a mode/difficulty does not specify one. */
export function defaultTimeLimit({ mode, difficulty, timerStyle = 'auto' }) {
  const cfg = difficultyConfig(difficulty);
  if (mode === 'sandbox' || mode === 'clickattack' || mode === 'custom') return 0;
  if (mode === 'endless') return 0; // endless uses per-stage deadlines
  if (timerStyle === 'stopwatch') return 0;
  return cfg.timeLimit * 1000;
}

/** Formats a challenge for sharing / bookmarks. */
export function challengeToString({ lang, start, target, difficulty, mode, seed }) {
  return [lang, mode, difficulty, start, target, seed ?? ''].join('|');
}

export function challengeKey({ lang, start, target }) {
  return `${lang}:${titleKey(start)}->${titleKey(target)}`;
}

/** Yesterday's (or any past) challenge — used by the Daily screen archive. */
export async function pastDailyChallenges({ days = 14, lang = 'en', today = dayKey(), signal } = {}) {
  const out = [];
  const base = new Date(`${today}T12:00:00`);
  for (let i = 1; i <= days; i++) {
    const d = new Date(base.getTime());
    d.setDate(d.getDate() - i);
    const dateKey = dayKey(d);
    try {
      const ch = await dailyChallenge({ dateKey, lang, signal, verify: false });
      out.push({ ...ch, past: true });
    } catch (err) {
      out.push({ dateKey, lang, error: err.message });
    }
  }
  return out;
}

/** Lightweight deterministic shuffle helper for future modes. */
export function seededShuffle(arr, seed) {
  const rand = mulberry32(seed >>> 0);
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
