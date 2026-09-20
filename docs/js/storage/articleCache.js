/* storage/articleCache.js — persistent (localStorage) cache of recent Wikipedia
 * articles so revisiting them is instant and works offline.
 *
 * Also tracks which articles are cached so the UI can be honest about what is
 * available offline.
 */

import { KEYS, readRaw, writeRaw, removeRaw } from '../core/store.js';
import { safeJsonParse, titleKey } from '../core/util.js';

const INDEX_KEY = `${KEYS.articleCache}:index`;
const ENTRY_PREFIX = `${KEYS.articleCache}:a:`;

let limit = 40;
let enabled = true;
let index = null; // [{ key, lang, title, at, bytes }]

function loadIndex() {
  if (index) return index;
  const raw = readRaw(INDEX_KEY);
  const parsed = safeJsonParse(raw, []);
  index = Array.isArray(parsed) ? parsed : [];
  return index;
}

function saveIndex() {
  writeRaw(INDEX_KEY, JSON.stringify(index.slice(0, 400)));
}

function entryKey(lang, title) {
  return `${lang}:${titleKey(title)}`;
}

export const ArticleCache = {
  configure({ limit: newLimit = limit, enabled: newEnabled = enabled } = {}) {
    limit = Math.max(0, Number(newLimit) || 0);
    enabled = Boolean(newEnabled);
    this.prune();
  },

  isEnabled() { return enabled; },

  get(key) {
    if (!enabled) return null;
    const raw = readRaw(ENTRY_PREFIX + key);
    if (!raw) return null;
    const data = safeJsonParse(raw, null);
    if (!data || !data.title || !data.html) return null;
    return { ...data, fromCache: true };
  },

  async set(key, article) {
    if (!enabled || limit <= 0) return;
    const payload = {
      lang: article.lang,
      title: article.title,
      displayTitle: article.displayTitle,
      html: article.html,
      pageid: article.pageid,
      revid: article.revid,
      categories: article.categories,
      description: article.description,
      thumbnail: article.thumbnail,
      url: article.url,
      fetchedAt: article.fetchedAt || Date.now(),
    };
    let serialised;
    try { serialised = JSON.stringify(payload); } catch { return; }
    // Very large articles (Einstein-scale) are skipped to protect the quota.
    if (serialised.length > 900000) return;
    writeRaw(ENTRY_PREFIX + key, serialised);
    const idx = loadIndex();
    const existing = idx.find((e) => e.key === key);
    if (existing) { existing.at = Date.now(); existing.bytes = serialised.length; }
    else idx.unshift({ key, lang: article.lang, title: article.title, at: Date.now(), bytes: serialised.length });
    this.prune();
  },

  has(lang, title) {
    const key = entryKey(lang, title);
    return loadIndex().some((e) => e.key === key);
  },

  list() {
    return loadIndex().slice().sort((a, b) => b.at - a.at);
  },

  count() { return loadIndex().length; },

  bytes() {
    return loadIndex().reduce((acc, e) => acc + (e.bytes || 0), 0);
  },

  remove(lang, title) {
    const key = entryKey(lang, title);
    removeRaw(ENTRY_PREFIX + key);
    index = loadIndex().filter((e) => e.key !== key);
    saveIndex();
  },

  prune() {
    const idx = loadIndex();
    if (idx.length <= limit) { saveIndex(); return; }
    const sorted = idx.slice().sort((a, b) => b.at - a.at);
    const keep = sorted.slice(0, limit);
    const drop = sorted.slice(limit);
    for (const e of drop) removeRaw(ENTRY_PREFIX + e.key);
    index = keep;
    saveIndex();
  },

  clear() {
    const idx = loadIndex();
    for (const e of idx) removeRaw(ENTRY_PREFIX + e.key);
    removeRaw(INDEX_KEY);
    index = [];
  },
};
