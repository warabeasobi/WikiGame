/* game/difficulty.js — difficulty levels drive challenge generation, par values
 * and scoring multipliers. Difficulty is data, not decoration. */

import { clamp, mulberry32, titleKey } from '../core/util.js';
import { randomArticle, getPopularTitles, peekPopularTitles, bfsDistance, looksLikeArticle } from '../api/wikipedia.js';

/**
 * `pool`: [lo, hi] slice of the local popularity ranking to sample from.
 * `parClicks`: expected number of clicks for a good run at this difficulty.
 * `parSeconds`: expected completion time in seconds.
 * `timeLimit`: default countdown for time-limited modes (seconds, 0 = none).
 */
export const DIFFICULTIES = [
  {
    id: 'easy',
    nameKey: 'difficulty.easy',
    label: 'Easy',
    emoji: '🌱',
    accent: '#3fb950',
    pool: [0, 0.18],
    parClicks: 3,
    parSeconds: 120,
    timeLimit: 300,
    scoreMultiplier: 0.8,
    xpMultiplier: 0.8,
    maxPathLength: 3,
    blurbKey: 'difficulty.easyDesc',
    blurb: 'Famous articles, short paths, generous timer.',
  },
  {
    id: 'normal',
    nameKey: 'difficulty.normal',
    label: 'Normal',
    emoji: '🎯',
    accent: '#4c8dff',
    pool: [0, 1],
    parClicks: 5,
    parSeconds: 210,
    timeLimit: 300,
    scoreMultiplier: 1,
    xpMultiplier: 1,
    maxPathLength: 5,
    blurbKey: 'difficulty.normalDesc',
    blurb: 'Random articles, balanced timer.',
  },
  {
    id: 'hard',
    nameKey: 'difficulty.hard',
    label: 'Hard',
    emoji: '🔥',
    accent: '#f0883e',
    pool: [0.22, 1],
    parClicks: 7,
    parSeconds: 330,
    timeLimit: 300,
    scoreMultiplier: 1.35,
    xpMultiplier: 1.35,
    maxPathLength: 7,
    blurbKey: 'difficulty.hardDesc',
    blurb: 'Less obvious connections, longer paths, less time.',
  },
  {
    id: 'expert',
    nameKey: 'difficulty.expert',
    label: 'Expert',
    emoji: '💀',
    accent: '#f85149',
    pool: [0.45, 1],
    parClicks: 9,
    parSeconds: 420,
    timeLimit: 300,
    scoreMultiplier: 1.75,
    xpMultiplier: 1.7,
    maxPathLength: 9,
    blurbKey: 'difficulty.expertDesc',
    blurb: 'Obscure articles, long routes, strict timer.',
  },
  {
    id: 'chaos',
    nameKey: 'difficulty.chaos',
    label: 'Chaos',
    emoji: '🌀',
    accent: '#a371f7',
    pool: [0.3, 1],
    parClicks: 8,
    parSeconds: 360,
    timeLimit: 300,
    scoreMultiplier: 1.6,
    xpMultiplier: 1.6,
    maxPathLength: 8,
    blurbKey: 'difficulty.chaosDesc',
    blurb: 'Random hard articles plus a random modifier.',
  },
];

export const DIFFICULTY_IDS = DIFFICULTIES.map((d) => d.id);

export function difficultyConfig(id) {
  const key = String(id || 'normal').toLowerCase();
  return DIFFICULTIES.find((d) => d.id === key) || DIFFICULTIES[1];
}

export function difficultyLabel(id) {
  const cfg = difficultyConfig(id);
  return cfg.label;
}

/** Random modifiers — only Chaos (or explicitly enabled runs) use these. */
export const MODIFIERS = [
  { id: 'no-hints', label: 'Blind run', desc: 'Hints are disabled.', icon: '🚫', apply: (o) => ({ ...o, allowHints: false }) },
  { id: 'no-powerups', label: 'No gadgets', desc: 'Power-ups are disabled.', icon: '🧰', apply: (o) => ({ ...o, allowPowerups: false }) },
  { id: 'click-cap', label: 'Tight leash', desc: 'Finish within 12 clicks.', icon: '⛓️', apply: (o) => ({ ...o, clickCap: 12 }) },
  { id: 'half-time', label: 'Half time', desc: 'The countdown is halved.', icon: '⏳', apply: (o) => ({ ...o, timeScale: 0.5 }) },
  { id: 'one-freeze', label: 'Single freeze', desc: 'Time freeze can only be used once.', icon: '🧊', apply: (o) => ({ ...o, freezeUses: 1 }) },
  { id: 'blind-links', label: 'Blind links', desc: 'Link previews are disabled.', icon: '🙈', apply: (o) => ({ ...o, previewsDisabled: true }) },
  { id: 'long-road', label: 'Long road', desc: 'Par is raised — expect a longer route.', icon: '🛣️', apply: (o) => ({ ...o, parClicksBonus: 3 }) },
];

export function rollModifiers(difficultyId, rand = Math.random) {
  if (difficultyId !== 'chaos') return [];
  const count = rand() < 0.55 ? 1 : 2;
  const pool = [...MODIFIERS];
  const chosen = [];
  for (let i = 0; i < count && pool.length; i++) {
    const idx = Math.floor(rand() * pool.length);
    chosen.push(pool.splice(idx, 1)[0]);
  }
  return chosen;
}

export function applyModifiers(baseOptions, modifiers) {
  return (modifiers || []).reduce((acc, m) => m.apply(acc), baseOptions);
}

/**
 * The set of rules a run starts with, derived from mode + difficulty + user
 * choices. Everything the game needs to know about a challenge lives here.
 */
export function buildRunRules({ mode = 'quick', difficulty = 'normal', language = 'en', timeLimitMs = null, allowHints = true, allowPowerups = true, modifiers = [], seed = null } = {}) {
  const cfg = difficultyConfig(difficulty);
  const base = {
    mode,
    difficulty: cfg.id,
    language,
    allowHints,
    allowPowerups,
    modifiers,
    clickCap: null,
    previewsDisabled: false,
    freezeUses: 3,
    parClicks: cfg.parClicks,
    parSeconds: cfg.parSeconds,
    timeScale: 1,
    countdown: Boolean(timeLimitMs),
    timeLimitMs: timeLimitMs || 0,
    scoreMultiplier: cfg.scoreMultiplier,
    xpMultiplier: cfg.xpMultiplier,
    seed,
  };
  const withMods = applyModifiers(base, modifiers);
  if (withMods.timeScale !== 1 && withMods.timeLimitMs) withMods.timeLimitMs = Math.round(withMods.timeLimitMs * withMods.timeScale);
  if (withMods.parClicksBonus) withMods.parClicks += withMods.parClicksBonus;
  if (mode === 'sandbox') {
    withMods.countdown = false;
    withMods.timeLimitMs = 0;
    withMods.scoreMultiplier = 0;
    withMods.xpMultiplier = 0;
  }
  return withMods;
}

/* ------------------------------------------------------------------ */
/* Challenge generation                                               */
/* ------------------------------------------------------------------ */

function poolSlice(lang, difficultyId) {
  const cfg = difficultyConfig(difficultyId);
  const pool = peekPopularTitles(lang) || [];
  if (!pool.length) return { pool: [], lo: 0, hi: 0 };
  const lo = Math.floor(cfg.pool[0] * pool.length);
  const hi = Math.max(lo + 10, Math.floor(cfg.pool[1] * pool.length));
  return { pool, lo, hi: Math.min(hi, pool.length) };
}

/** Deterministically pick a title from the local pool for a seeded run. */
export async function pickPooledTitle(lang, difficultyId, rand, { exclude = [], signal } = {}) {
  const excludeKeys = new Set(exclude.map(titleKey));
  try {
    const { pool, lo, hi } = poolSlice(lang, difficultyId);
    if (pool.length) {
      for (let attempt = 0; attempt < 40; attempt++) {
        const idx = lo + Math.floor(rand() * Math.max(1, hi - lo));
        const title = pool[idx];
        if (!title) continue;
        if (excludeKeys.has(titleKey(title))) continue;
        if (!looksLikeArticle(title)) continue;
        return title;
      }
    }
  } catch { /* fall back below */ }
  const fallback = await randomArticle(lang, { seed: Math.floor(rand() * 2 ** 31), signal });
  if (!fallback || excludeKeys.has(titleKey(fallback))) return fallback;
  return fallback;
}

/**
 * Builds a full challenge: a start article and a target article that is
 * actually reachable and not trivially identical.
 *
 * `verify` performs a bounded BFS (a couple of API calls) so we never hand the
 * player an impossible puzzle. Offline or on API failure we fall back to the
 * deterministic pool choice instead of failing the run.
 */
export async function generateChallenge({
  lang = 'en',
  difficulty = 'normal',
  seed = null,
  mode = 'quick',
  signal,
  verify = true,
  exclude = [],
  timeLimitMs = null,
} = {}) {
  const rand = mulberry32(seed === null || seed === undefined ? Math.floor(Math.random() * 2 ** 31) : seed >>> 0);
  const cfg = difficultyConfig(difficulty);
  const start = await pickPooledTitle(lang, difficulty, rand, { exclude, signal });
  if (!start) throw new Error('Could not pick a start article');

  let target = null;
  const attempts = verify ? 6 : 3;
  for (let i = 0; i < attempts; i++) {
    const candidate = await pickPooledTitle(lang, difficulty, rand, { exclude: [...exclude, start], signal });
    if (!candidate) continue;
    if (titleKey(candidate) === titleKey(start)) continue;
    if (!verify) { target = candidate; break; }
    try {
      const distance = await bfsDistance(lang, start, candidate, {
        maxDepth: Math.min(3, cfg.maxPathLength),
        frontier: 10,
        signal,
      });
      if (distance >= 1 && distance <= cfg.maxPathLength) { target = candidate; break; }
      // Unknown (offline / API hiccup): accept the candidate rather than loop forever.
      if (!Number.isFinite(distance) && i >= 2) { target = candidate; break; }
    } catch {
      if (i >= 1) { target = candidate; break; }
    }
  }
  if (!target) target = await pickPooledTitle(lang, difficulty, rand, { exclude: [start], signal });

  return {
    mode,
    lang,
    difficulty: cfg.id,
    start,
    target,
    seed: seed === null || seed === undefined ? null : (seed >>> 0),
    generatedAt: Date.now(),
    timeLimitMs,
  };
}

/** Endless mode: successive targets that get harder as stages go up. */
export function endlessDifficultyForStage(stage) {
  if (stage <= 2) return 'easy';
  if (stage <= 4) return 'normal';
  if (stage <= 7) return 'hard';
  if (stage <= 10) return 'expert';
  return 'chaos';
}

export async function nextEndlessTarget({ lang, stage, currentTitle, exclude = [], signal, seed = null }) {
  const difficulty = endlessDifficultyForStage(stage);
  const rand = mulberry32((seed === null ? Math.floor(Math.random() * 2 ** 31) : seed >>> 0) + stage * 104729);
  const target = await pickPooledTitle(lang, difficulty, rand, { exclude: [...exclude, currentTitle], signal });
  return { target, difficulty };
}

export function difficultySummary(id) {
  const cfg = difficultyConfig(id);
  return {
    id: cfg.id,
    label: cfg.label,
    emoji: cfg.emoji,
    accent: cfg.accent,
    blurb: cfg.blurb,
    parClicks: cfg.parClicks,
    parSeconds: cfg.parSeconds,
  };
}
