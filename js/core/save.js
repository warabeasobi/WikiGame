/* core/save.js — export / import / reset of the complete local save file.
 *
 * The exported JSON is versioned and validated on import: unknown fields are
 * ignored, wrong types are rejected, and a malformed file never corrupts the
 * player's existing data.
 */

import { readJson, writeJson, allKeys, readRaw, writeRaw, removeRaw, KEYS } from './store.js';
import { Settings } from '../storage/settings.js';
import { Statistics } from '../storage/statistics.js';
import { Achievements } from '../storage/achievements.js';
import { Profile } from '../storage/profile.js';
import { Bookmarks } from '../storage/bookmarks.js';
import { Leaderboard } from '../storage/leaderboard.js';
import { ArticleCache } from '../storage/articleCache.js';
import { safeJsonParse } from './util.js';

export const SCHEMA_VERSION = '1.0.0';
export const APP_ID = 'wikipedia-speedrun';

export function exportSave({ includeArticleCache = false } = {}) {
  return {
    app: APP_ID,
    version: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    data: {
      settings: Settings.export(),
      profile: Profile.export(),
      statistics: Statistics.export(),
      achievements: Achievements.export(),
      bookmarks: Bookmarks.export(),
      leaderboard: Leaderboard.export(),
    },
    meta: {
      articleCacheEntries: includeArticleCache ? ArticleCache.list() : undefined,
      keys: allKeys(),
    },
  };
}

const VALIDATORS = {
  settings: (v) => v && typeof v === 'object' && !Array.isArray(v),
  profile: (v) => v && typeof v === 'object' && typeof (v.xp ?? 0) === 'number',
  statistics: (v) => v && typeof v === 'object' && Array.isArray(v.runs || []),
  achievements: (v) => v && typeof v === 'object' && (v.unlocked === undefined || typeof v.unlocked === 'object'),
  bookmarks: (v) => v && typeof v === 'object',
  leaderboard: (v) => v && typeof v === 'object',
};

/** Validates a parsed save object without applying it. */
export function validateSave(payload) {
  const errors = [];
  if (!payload || typeof payload !== 'object') return { ok: false, errors: ['not an object'] };
  if (payload.app && payload.app !== APP_ID) errors.push(`unexpected app id: ${payload.app}`);
  const data = payload.data || payload;
  if (!data || typeof data !== 'object') errors.push('missing data section');
  else {
    for (const [key, validate] of Object.entries(VALIDATORS)) {
      if (data[key] === undefined) continue;
      if (!validate(data[key])) errors.push(`invalid "${key}"`);
    }
    const known = Object.keys(VALIDATORS);
    if (!known.some((k) => data[k] !== undefined)) errors.push('no known sections found');
  }
  return { ok: errors.length === 0, errors, data };
}

/**
 * Applies a save payload. Returns { ok, errors, applied }.
 * Invalid payloads are rejected before anything is written.
 */
export function importSave(textOrObject) {
  const payload = typeof textOrObject === 'string' ? safeJsonParse(textOrObject, null) : textOrObject;
  const check = validateSave(payload);
  if (!check.ok) return { ok: false, errors: check.errors, applied: [] };
  const data = check.data;
  const applied = [];
  try {
    if (data.settings) { Settings.import(data.settings); applied.push('settings'); }
    if (data.profile) { Profile.import(data.profile); applied.push('profile'); }
    if (data.statistics) { Statistics.import(data.statistics); applied.push('statistics'); }
    if (data.achievements) { Achievements.import(data.achievements); applied.push('achievements'); }
    if (data.bookmarks) { Bookmarks.import(data.bookmarks); applied.push('bookmarks'); }
    if (data.leaderboard) { Leaderboard.import(data.leaderboard); applied.push('leaderboard'); }
  } catch (err) {
    return { ok: false, errors: [err.message], applied };
  }
  return { ok: true, errors: [], applied };
}

export function resetEverything({ keepSettings = false } = {}) {
  const keep = keepSettings ? { ...Settings.export() } : null;
  Statistics.reset();
  Achievements.reset();
  Profile.reset();
  Bookmarks.reset();
  Leaderboard.clear();
  ArticleCache.clear();
  removeRaw(KEYS.activeRun);
  if (!keepSettings) Settings.reset();
  else Settings.import(keep);
  return true;
}

/** Backup of the raw localStorage keys (debug / manual recovery). */
export function exportRawKeys() {
  const out = {};
  for (const key of allKeys()) {
    const raw = readRaw(key);
    if (raw !== null) out[key] = raw;
  }
  return out;
}

export function importRawKeys(map) {
  if (!map || typeof map !== 'object') return false;
  for (const [key, value] of Object.entries(map)) {
    if (typeof value !== 'string') continue;
    writeRaw(key, value);
  }
  return true;
}

export { readJson, writeJson };
