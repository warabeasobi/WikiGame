/* core/store.js — tiny versioned localStorage wrapper with a safe in-memory
 * fallback (private browsing / quota errors) and JSON corruption recovery. */

import { safeJsonParse, deepMerge } from './util.js';

const PREFIX = 'wsr:';
const memory = new Map();
let storageAvailable = null;

function probe() {
  if (storageAvailable !== null) return storageAvailable;
  try {
    const k = `${PREFIX}__probe__`;
    localStorage.setItem(k, '1');
    localStorage.removeItem(k);
    storageAvailable = true;
  } catch {
    storageAvailable = false;
    console.warn('[store] localStorage unavailable : using in-memory storage for this session.');
  }
  return storageAvailable;
}

export function storageWorks() { return probe(); }

export function readRaw(key) {
  if (probe()) {
    try {
      const v = localStorage.getItem(PREFIX + key);
      return v === null ? null : v;
    } catch { return null; }
  }
  return memory.has(key) ? memory.get(key) : null;
}

export function writeRaw(key, value) {
  if (probe()) {
    try {
      localStorage.setItem(PREFIX + key, value);
      return true;
    } catch (err) {
      // Quota exceeded: try to free space by dropping the article cache.
      try {
        for (const k of Object.keys(localStorage)) {
          if (k.startsWith(`${PREFIX}cache:`)) localStorage.removeItem(k);
        }
        localStorage.setItem(PREFIX + key, value);
        return true;
      } catch { console.warn('[store] write failed', err); return false; }
    }
  }
  memory.set(key, value);
  return true;
}

export function removeRaw(key) {
  if (probe()) { try { localStorage.removeItem(PREFIX + key); } catch { /* noop */ } }
  memory.delete(key);
}

export function readJson(key, fallback = null) {
  const raw = readRaw(key);
  if (raw === null) return fallback;
  const parsed = safeJsonParse(raw, undefined);
  if (parsed === undefined) {
    console.warn(`[store] corrupt JSON in "${key}" : falling back to defaults`);
    removeRaw(key);
    return fallback;
  }
  return parsed;
}

export function writeJson(key, value) {
  try {
    return writeRaw(key, JSON.stringify(value));
  } catch (err) {
    console.warn('[store] serialise failed', err);
    return false;
  }
}

/**
 * A versioned document: reads defaults, merges stored values over them,
 * migrates old versions and self-heals corrupted data.
 */
export class Doc {
  constructor(key, defaults, { version = 1, migrate = null } = {}) {
    this.key = key;
    this.defaults = defaults;
    this.version = version;
    this.migrate = migrate;
    this.data = this.load();
  }

  load() {
    const stored = readJson(this.key, null);
    if (!stored || typeof stored !== 'object') return structuredCloneSafe(this.defaults);
    let data = stored;
    if (stored.__v !== undefined && stored.__v !== this.version && this.migrate) {
      try { data = this.migrate(stored, stored.__v, this.version) || stored; }
      catch (err) { console.warn(`[store] migration failed for ${this.key}`, err); data = stored; }
    }
    const merged = deepMerge(structuredCloneSafe(this.defaults), data);
    return merged;
  }

  save() {
    this.data.__v = this.version;
    this.data.__updatedAt = Date.now();
    return writeJson(this.key, this.data);
  }

  set(patch) {
    this.data = deepMerge(this.data, patch);
    return this.save();
  }

  reset() {
    this.data = structuredCloneSafe(this.defaults);
    return this.save();
  }

  /** Mutation helper: mutate then persist. */
  update(fn) {
    const out = fn(this.data);
    if (out && typeof out === 'object') this.data = out;
    this.save();
    return this.data;
  }

  export() { return structuredCloneSafe(this.data); }
}

function structuredCloneSafe(value) {
  try {
    if (typeof structuredClone === 'function') return structuredClone(value);
  } catch { /* fall through */ }
  return JSON.parse(JSON.stringify(value));
}

export const KEYS = {
  settings: 'settings',
  profile: 'profile',
  statistics: 'statistics',
  achievements: 'achievements',
  bookmarks: 'bookmarks',
  history: 'history',
  daily: 'daily',
  leaderboard: 'leaderboard',
  activeRun: 'activeRun',
  articleCache: 'cache',
  meta: 'meta',
};

/** Every namespaced key currently used — handy for export/reset. */
export function allKeys() {
  const keys = new Set(Object.values(KEYS));
  if (probe()) {
    try {
      for (const k of Object.keys(localStorage)) {
        if (k.startsWith(PREFIX)) keys.add(k.slice(PREFIX.length));
      }
    } catch { /* noop */ }
  }
  for (const k of memory.keys()) keys.add(k);
  return [...keys].filter((k) => k !== '__probe__');
}

export function clearAll({ keepArticleCache = false } = {}) {
  for (const key of allKeys()) {
    if (keepArticleCache && key.startsWith('cache:')) continue;
    removeRaw(key);
  }
}

export function estimateStorageBytes() {
  let bytes = 0;
  if (probe()) {
    try {
      for (const k of Object.keys(localStorage)) {
        if (!k.startsWith(PREFIX)) continue;
        bytes += k.length + (localStorage.getItem(k) || '').length;
      }
    } catch { /* noop */ }
  } else {
    for (const [k, v] of memory) bytes += k.length + String(v).length;
  }
  return bytes * 2; // UTF-16
}
