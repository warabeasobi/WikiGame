/* api/wikipedia.js — MediaWiki API client.
 *
 * Only the official MediaWiki / Wikimedia REST APIs are used. We never scrape
 * wikipedia.org HTML, and we never send anything but read requests.
 *
 * Design notes:
 *  - Every call goes through `request()` which adds timeouts, retries with
 *    backoff, jitter and a small request queue so we stay polite.
 *  - Responses are cached in memory (LRU) and, when the caller provides a
 *    persistent cache adapter, on disk too (see storage/articleCache.js).
 *  - Errors are typed (`WikiError.code`) so the UI can show something useful.
 */

import { normalizeTitle, titleKey, titleSlug, mulberry32 } from '../core/util.js';

export const LANGUAGES = [
  { code: 'en', label: 'English', native: 'English', flag: '🇬🇧', dir: 'ltr' },
  { code: 'id', label: 'Indonesian', native: 'Bahasa Indonesia', flag: '🇮🇩', dir: 'ltr' },
  { code: 'ja', label: 'Japanese', native: '日本語', flag: '🇯🇵', dir: 'ltr' },
  { code: 'de', label: 'German', native: 'Deutsch', flag: '🇩🇪', dir: 'ltr' },
  { code: 'fr', label: 'French', native: 'Français', flag: '🇫🇷', dir: 'ltr' },
  { code: 'es', label: 'Spanish', native: 'Español', flag: '🇪🇸', dir: 'ltr' },
];

export const LANGUAGE_CODES = LANGUAGES.map((l) => l.code);

export function isSupportedLanguage(code) {
  return LANGUAGE_CODES.includes(String(code || '').toLowerCase());
}

export function languageMeta(code) {
  const c = String(code || 'en').toLowerCase();
  return LANGUAGES.find((l) => l.code === c) || LANGUAGES[0];
}

export const apiBase = (lang) => `https://${lang}.wikipedia.org/w/api.php`;
export const restBase = (lang) => `https://${lang}.wikipedia.org/api/rest_v1`;
export const articleUrl = (lang, title) => `https://${lang}.wikipedia.org/wiki/${titleSlug(title)}`;

export class WikiError extends Error {
  constructor(code, message, extra = {}) {
    super(message || code);
    this.name = 'WikiError';
    this.code = code;
    Object.assign(this, extra);
  }
}

export function describeError(err, t) {
  const code = err && err.code;
  const tr = typeof t === 'function' ? t : (k) => k;
  switch (code) {
    case 'notfound': return tr('error.invalidArticle', { title: err.title || '' });
    case 'offline': return tr('error.offlineArticle');
    case 'timeout': return tr('error.timeout');
    case 'network': return tr('error.network');
    case 'ratelimited': return tr('error.rateLimited');
    case 'unsupported': return tr('error.unsupportedLang');
    default: return (err && err.message) || tr('error.apiFail');
  }
}

/* ------------------------------------------------------------------ */
/* Request plumbing                                                   */
/* ------------------------------------------------------------------ */

const DEFAULT_TIMEOUT = 15000;
const MAX_CONCURRENT = 4;
const REQUEST_CACHE_TTL = 1000 * 60 * 30; // 30 min for API JSON

let active = 0;
const queue = [];

function acquire() {
  if (active < MAX_CONCURRENT) { active += 1; return Promise.resolve(); }
  return new Promise((resolve) => queue.push(resolve));
}

function release() {
  active -= 1;
  const next = queue.shift();
  if (next) { active += 1; next(); }
}

const responseCache = new Map(); // url -> {at, data}

export function clearApiCache() {
  responseCache.clear();
}

/** Core fetch wrapper with timeout + retries. */
export async function request(url, { timeout = DEFAULT_TIMEOUT, retries = 2, accept = 'application/json', cacheTtl = REQUEST_CACHE_TTL, signal } = {}) {
  // Offline short-circuit: cached responses are still served (that is the whole
  // point of the offline article cache), anything else fails loudly.
  const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
  if (cacheTtl > 0) {
    const hit = responseCache.get(url);
    if (hit && Date.now() - hit.at < cacheTtl) return hit.data;
  }
  if (offline) throw new WikiError('offline', 'No network connection');

  let attempt = 0;
  let lastError = null;
  while (attempt <= retries) {
    await acquire();
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), timeout) : null;
    const onAbort = () => controller && controller.abort();
    if (signal && controller) {
      if (signal.aborted) controller.abort();
      else signal.addEventListener('abort', onAbort, { once: true });
    }
    try {
      const res = await fetch(url, {
        method: 'GET',
        headers: {
          Accept: accept,
          // MediaWiki asks for an identifying User-Agent. Browsers ignore this
          // header (it is forbidden), so it only matters for scripts/tests.
          'Api-User-Agent': 'WikipediaSpeedrun/1.0 (client-side game; static site)',
        },
        signal: controller ? controller.signal : undefined,
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
      });
      if (res.status === 429 || res.status === 503) {
        throw new WikiError('ratelimited', `HTTP ${res.status}`);
      }
      if (!res.ok) throw new WikiError('http', `HTTP ${res.status}`, { status: res.status });
      const data = accept.includes('json') ? await res.json() : await res.text();
      if (cacheTtl > 0) responseCache.set(url, { at: Date.now(), data });
      return data;
    } catch (err) {
      lastError = err;
      const aborted = err && (err.name === 'AbortError');
      const code = err instanceof WikiError ? err.code : (aborted ? 'timeout' : 'network');
      if (code === 'offline') throw new WikiError('offline', err.message);
      // Retry on transient problems only.
      if (attempt < retries && (code === 'network' || code === 'timeout' || code === 'ratelimited' || code === 'http')) {
        const backoff = 400 * 2 ** attempt + Math.random() * 250;
        attempt += 1;
        await new Promise((r) => setTimeout(r, backoff));
        continue;
      }
      throw new WikiError(code, err.message || String(err), { cause: err });
    } finally {
      // Exactly one release per attempt — success or failure.
      release();
      if (timer) clearTimeout(timer);
      if (signal && controller) signal.removeEventListener('abort', onAbort);
    }
  }
  throw new WikiError('network', lastError ? lastError.message : 'request failed');
}

/** Builds a MediaWiki action API URL with the anonymous CORS origin marker. */
export function mwUrl(lang, params) {
  if (!isSupportedLanguage(lang)) throw new WikiError('unsupported', `Unsupported language: ${lang}`);
  const usp = new URLSearchParams({ format: 'json', formatversion: '2', origin: '*', ...params });
  return `${apiBase(lang)}?${usp.toString()}`;
}

/* ------------------------------------------------------------------ */
/* Articles                                                           */
/* ------------------------------------------------------------------ */

const articleCache = new Map(); // `${lang}:${key}` -> article
let persistentCache = null;
let articleCacheHits = 0;
let articleCacheMisses = 0;

/** Pluggable persistent cache (storage/articleCache.js). */
export function setPersistentArticleCache(adapter) {
  persistentCache = adapter;
}

export function articleCacheStats() {
  return { memory: articleCache.size, hits: articleCacheHits, misses: articleCacheMisses };
}

const MEMORY_ARTICLE_LIMIT = 40;

function rememberArticle(article) {
  const key = `${article.lang}:${titleKey(article.title)}`;
  if (articleCache.has(key)) articleCache.delete(key);
  articleCache.set(key, article);
  while (articleCache.size > MEMORY_ARTICLE_LIMIT) {
    const oldest = articleCache.keys().next().value;
    articleCache.delete(oldest);
  }
}

/**
 * Fetches a parsed article.
 * Uses action=parse&prop=text|displaytitle|categories|revid (+ properties for
 * description and thumbnail) exactly as specified.
 */
export async function getArticle(lang, title, { force = false, signal } = {}) {
  const clean = normalizeTitle(title);
  if (!clean) throw new WikiError('invalid', 'Empty title');
  if (!isSupportedLanguage(lang)) throw new WikiError('unsupported', `Unsupported language: ${lang}`);
  const key = `${lang}:${titleKey(clean)}`;
  if (!force) {
    const mem = articleCache.get(key);
    if (mem) { articleCacheHits += 1; return mem; }
    if (persistentCache) {
      const stored = await persistentCache.get(key);
      if (stored) {
        articleCacheHits += 1;
        rememberArticle(stored);
        return { ...stored, fromCache: true };
      }
    }
  }
  articleCacheMisses += 1;

  const url = mwUrl(lang, {
    action: 'parse',
    page: clean,
    prop: 'text|displaytitle|categories|revid|properties|langlinks',
    redirects: '1',
    disableeditsection: '1',
    disabletoc: '1',
    disablelimitreport: '1',
    useskin: 'vector',
    mobileformat: '0',
    'redirects': '1',
  });

  const data = await request(url, { signal, cacheTtl: force ? 0 : undefined });
  if (data.error) {
    const info = data.error.info || '';
    if (data.error.code === 'missingtitle' || /does not exist|invalidtitle/i.test(info)) {
      throw new WikiError('notfound', info || 'Article not found', { title: clean });
    }
    throw new WikiError('api', info || data.error.code, { apiCode: data.error.code });
  }
  const parse = data.parse;
  const html = typeof parse?.text === 'string' ? parse.text : parse?.text?.['*'];
  if (!parse || !html) throw new WikiError('notfound', 'Article not found', { title: clean });

  // `formatversion=2` returns maps/strings where v1 returned arrays/objects.
  const props = {};
  const rawProps = parse.properties || {};
  if (Array.isArray(rawProps)) for (const p of rawProps) props[p.name] = p['*'];
  else Object.assign(props, rawProps);

  const article = {
    lang,
    title: parse.title,
    displayTitle: parse.displaytitle || parse.title,
    html,
    pageid: parse.pageid,
    revid: parse.revid,
    categories: (parse.categories || []).map((c) => normalizeTitle(String(c['*'] ?? c.category ?? c.title ?? '').replace(/^[^:]+:/, ''))).filter(Boolean),
    description: props['wikibase-shortdesc'] || props.description || '',
    thumbnail: null,
    fetchedAt: Date.now(),
    url: articleUrl(lang, parse.title),
    fromCache: false,
  };
  rememberArticle(article);
  if (persistentCache) { try { await persistentCache.set(key, article); } catch { /* quota */ } }
  return article;
}

export function getCachedArticle(lang, title) {
  return articleCache.get(`${lang}:${titleKey(title)}`) || null;
}

export function forgetArticle(lang, title) {
  articleCache.delete(`${lang}:${titleKey(title)}`);
}

/* ------------------------------------------------------------------ */
/* Metadata (description / thumbnail / extract)                       */
/* ------------------------------------------------------------------ */

const infoCache = new Map();

/** Batch page info: description, thumbnail, extract, pageprops. */
export async function getPageInfo(lang, titles, { signal } = {}) {
  const list = (Array.isArray(titles) ? titles : [titles]).map(normalizeTitle).filter(Boolean).slice(0, 20);
  if (!list.length) return {};
  const key = `${lang}:${list.map(titleKey).sort().join('|')}`;
  const hit = infoCache.get(key);
  if (hit && Date.now() - hit.at < 600000) return hit.data;

  const url = mwUrl(lang, {
    action: 'query',
    titles: list.join('|'),
    prop: 'pageimages|description|extracts|pageprops|info',
    inprop: 'url',
    exintro: '1',
    explaintext: '1',
    exchars: '280',
    pithumbsize: '480',
    redirects: '1',
  });
  const data = await request(url, { signal });
  const out = {};
  const pages = (data.query && data.query.pages) || [];
  const normalized = new Map();
  for (const n of (data.query && data.query.normalized) || []) normalized.set(titleKey(n.from), n.to);
  const redirects = new Map();
  for (const r of (data.query && data.query.redirects) || []) redirects.set(titleKey(r.from), r.to);

  for (const page of pages) {
    const rec = {
      title: page.title,
      pageid: page.pageid,
      missing: page.missing === true || page.pageid === undefined,
      description: page.description || '',
      extract: page.extract || '',
      thumbnail: page.thumbnail ? { url: page.thumbnail.source, width: page.thumbnail.width, height: page.thumbnail.height } : null,
      url: page.fullurl || articleUrl(lang, page.title),
      wikibase: (page.pageprops && page.pageprops.wikibase_item) || null,
    };
    out[titleKey(page.title)] = rec;
    // also index by the requested title so lookups always succeed
    for (const [from, to] of normalized) if (titleKey(to) === titleKey(page.title)) out[from] = rec;
    for (const [from, to] of redirects) if (titleKey(to) === titleKey(page.title)) out[from] = { ...rec, redirectedTo: page.title };
  }
  infoCache.set(key, { at: Date.now(), data: out });
  return out;
}

export async function getArticleInfo(lang, title, opts) {
  const map = await getPageInfo(lang, [title], opts);
  return map[titleKey(title)] || null;
}

/** Fast summary from the REST API — used for link previews. */
export async function getSummary(lang, title, { signal } = {}) {
  const clean = normalizeTitle(title);
  const key = `summary:${lang}:${titleKey(clean)}`;
  const hit = responseCache.get(key);
  if (hit && Date.now() - hit.at < 600000) return hit.data;
  const url = `${restBase(lang)}/page/summary/${titleSlug(clean)}?redirect=true`;
  const data = await request(url, { signal, cacheTtl: 0 });
  const rec = {
    title: data.title,
    description: data.description || '',
    extract: data.extract || '',
    thumbnail: data.thumbnail ? { url: data.thumbnail.source, width: data.thumbnail.width, height: data.thumbnail.height } : null,
    url: (data.content_urls && data.content_urls.desktop && data.content_urls.desktop.page) || articleUrl(lang, clean),
    type: data.type,
  };
  responseCache.set(key, { at: Date.now(), data: rec });
  return rec;
}

/* ------------------------------------------------------------------ */
/* Discovery: random / popular / search                               */
/* ------------------------------------------------------------------ */

/** Namespace-0 random articles straight from MediaWiki. */
export async function getRandomTitles(lang, count = 10, { signal } = {}) {
  const n = Math.min(20, Math.max(1, count));
  const url = mwUrl(lang, {
    action: 'query',
    list: 'random',
    rnnamespace: '0',
    rnlimit: String(n),
    rnfilterredir: 'nonredirects',
  });
  const data = await request(url, { signal });
  return ((data.query && data.query.random) || []).map((r) => normalizeTitle(r.title));
}

const popularCache = new Map();

/**
 * Local popularity pools (built offline from the official Pageviews API).
 * Loading them is a static-file fetch, so it also works offline once cached.
 */
export async function getPopularTitles(lang, { signal } = {}) {
  if (popularCache.has(lang)) return popularCache.get(lang);
  const url = new URL(`data/popular-${lang}.json`, document.baseURI).toString();
  const data = await request(url, { signal, accept: 'application/json', cacheTtl: 0 });
  const titles = (data.articles || []).map((a) => normalizeTitle(a.t));
  popularCache.set(lang, titles);
  return titles;
}

export function popularTitlesLoaded(lang) {
  return popularCache.has(lang);
}

export function peekPopularTitles(lang) {
  return popularCache.get(lang) || null;
}

/** Full-text search (used by the article picker and the "jump to" field). */
export async function searchArticles(lang, query, { limit = 12, signal } = {}) {
  const q = String(query || '').trim();
  if (!q) return [];
  const url = mwUrl(lang, {
    action: 'query',
    list: 'prefixsearch',
    pssearch: q,
    pslimit: String(Math.min(20, limit)),
    psnamespace: '0',
  });
  const data = await request(url, { signal });
  return ((data.query && data.query.prefixsearch) || []).map((r) => ({ title: normalizeTitle(r.title), pageid: r.pageid }));
}

/** Fuzzy full-text search fallback (typos, partial names). */
export async function searchFullText(lang, query, { limit = 10, signal } = {}) {
  const q = String(query || '').trim();
  if (!q) return [];
  const url = mwUrl(lang, {
    action: 'query',
    list: 'search',
    srsearch: q,
    srlimit: String(Math.min(20, limit)),
    srnamespace: '0',
  });
  const data = await request(url, { signal });
  return ((data.query && data.query.search) || []).map((r) => ({
    title: normalizeTitle(r.title),
    snippet: String(r.snippet || '').replace(/<[^>]+>/g, ''),
  }));
}

/** Resolves any user input (title, slug, URL) to a real article title. */
export async function resolveTitle(lang, input, { signal } = {}) {
  let raw = String(input || '').trim();
  if (!raw) throw new WikiError('invalid', 'Empty title');
  // Accept full URLs and /wiki/ paths.
  const wikiMatch = raw.match(/(?:https?:\/\/[a-z-]+\.wikipedia\.org)?\/wiki\/([^#?]+)/i);
  if (wikiMatch) raw = wikiMatch[1];
  const langMatch = raw.match(/^([a-z]{2})\.wikipedia\.org/i);
  if (langMatch) lang = langMatch[1].toLowerCase();
  const clean = normalizeTitle(raw);
  const url = mwUrl(lang, { action: 'query', titles: clean, redirects: '1', prop: 'info' });
  const data = await request(url, { signal });
  const page = ((data.query && data.query.pages) || [])[0];
  if (!page || page.missing === true || page.pageid === undefined) {
    // fall back to search, so near-misses still work
    const found = await searchFullText(lang, clean, { limit: 1, signal });
    if (found.length) return found[0].title;
    throw new WikiError('notfound', `Article "${clean}" not found`, { title: clean });
  }
  return normalizeTitle(page.title);
}

/* ------------------------------------------------------------------ */
/* Graph helpers (used by hints and the link scanner)                 */
/* ------------------------------------------------------------------ */

/** All article links (namespace 0) on a page. */
export async function getOutgoingLinks(lang, title, { limit = 500, signal } = {}) {
  const clean = normalizeTitle(title);
  const out = [];
  let cont = null;
  do {
    const params = {
      action: 'query',
      titles: clean,
      prop: 'links',
      plnamespace: '0',
      pllimit: String(Math.min(500, limit)),
      redirects: '1',
    };
    if (cont) params.plcontinue = cont;
    const data = await request(mwUrl(lang, params), { signal });
    const page = ((data.query && data.query.pages) || [])[0];
    for (const l of (page && page.links) || []) out.push(normalizeTitle(l.title));
    cont = data.continue && data.continue.plcontinue;
  } while (cont && out.length < limit);
  return out;
}

export async function getBacklinks(lang, title, { limit = 200, signal } = {}) {
  const clean = normalizeTitle(title);
  const data = await request(mwUrl(lang, {
    action: 'query',
    list: 'backlinks',
    bltitle: clean,
    blnamespace: '0',
    bllimit: String(Math.min(500, limit)),
    blfilterredir: 'nonredirects',
  }), { signal });
  return ((data.query && data.query.backlinks) || []).map((b) => normalizeTitle(b.title));
}

export async function getCategories(lang, title, { signal } = {}) {
  const clean = normalizeTitle(title);
  const data = await request(mwUrl(lang, {
    action: 'query',
    titles: clean,
    prop: 'categories',
    cllimit: '60',
    clshow: '!hidden',
    redirects: '1',
  }), { signal });
  const page = ((data.query && data.query.pages) || [])[0];
  return ((page && page.categories) || []).map((c) => normalizeTitle(String(c.title).replace(/^[^:]+:/, '')));
}

/* ------------------------------------------------------------------ */
/* BFS distance (bounded, cached, budgeted)                           */
/* ------------------------------------------------------------------ */

const distanceCache = new Map(); // `${lang}:${a}->${b}` -> number|Infinity

export function cachedDistance(lang, from, to) {
  const key = `${lang}:${titleKey(from)}->${titleKey(to)}`;
  if (distanceCache.has(key)) return distanceCache.get(key);
  const reverse = `${lang}:${titleKey(to)}->${titleKey(from)}`;
  return distanceCache.has(reverse) ? distanceCache.get(reverse) : undefined;
}

/**
 * Breadth-first search from `from` looking for `to`, up to `maxDepth` clicks.
 * Each level costs one API call per visited node, so we keep the frontier
 * tiny (depth 1 = 1 call, depth 2 = 1 + up to 8 calls).
 */
export async function bfsDistance(lang, from, to, { maxDepth = 2, frontier = 8, signal, onProgress } = {}) {
  const start = normalizeTitle(from);
  const goal = normalizeTitle(to);
  if (titleKey(start) === titleKey(goal)) return 0;
  const cached = cachedDistance(lang, start, goal);
  if (cached !== undefined && cached <= maxDepth) return cached;

  let current = [start];
  const seen = new Set([titleKey(start)]);
  const direct = await getOutgoingLinks(lang, start, { limit: 600, signal });
  const directKeys = new Set(direct.map(titleKey));
  distanceCache.set(`${lang}:${titleKey(start)}->${titleKey(goal)}`, directKeys.has(titleKey(goal)) ? 1 : undefined);
  if (directKeys.has(titleKey(goal))) return 1;
  if (maxDepth <= 1) return Infinity;

  let depth = 1;
  while (depth < maxDepth) {
    const next = [];
    for (const node of current) {
      const links = node === start ? direct : await getOutgoingLinks(lang, node, { limit: 250, signal });
      for (const l of links) {
        const k = titleKey(l);
        if (k === titleKey(goal)) { distanceCache.set(`${lang}:${titleKey(start)}->${titleKey(goal)}`, depth + 1); return depth + 1; }
        if (!seen.has(k)) { seen.add(k); next.push(l); }
        if (next.length >= frontier) break;
      }
      if (next.length >= frontier) break;
      if (onProgress) onProgress(depth);
    }
    current = next;
    depth += 1;
    if (!current.length) break;
  }
  return Infinity;
}

/** Links on the current page that point at articles related to the target. */
export function scoreLinksForTarget(links, target, targetInfo = {}) {
  const targetKey = titleKey(target);
  const targetWords = new Set(titleKey(target).split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 3));
  const catWords = new Set();
  for (const c of targetInfo.categories || []) {
    for (const w of titleKey(c).split(/[^\p{L}\p{N}]+/u)) if (w.length > 3) catWords.add(w);
  }
  const descWords = new Set();
  for (const w of titleKey(targetInfo.description || '').split(/[^\p{L}\p{N}]+/u)) if (w.length > 3) descWords.add(w);

  return links.map((link) => {
    const key = titleKey(link);
    let score = 0;
    if (key === targetKey) score += 100;
    if (key.includes(targetKey) || targetKey.includes(key)) score += 25;
    const words = key.split(/[^\p{L}\p{N}]+/u);
    for (const w of words) {
      if (targetWords.has(w)) score += 12;
      if (descWords.has(w)) score += 5;
      if (catWords.has(w)) score += 3;
    }
    return { link, score };
  }).sort((a, b) => b.score - a.score);
}

/* ------------------------------------------------------------------ */
/* Random target generation                                           */
/* ------------------------------------------------------------------ */

const NS0_BLOCK = /^(special|wikipedia|portal|file|category|template|help|talk|user|module|mediawiki|draft|book|timedtext|berkas|istimewa|pembicaraan|pengguna|templat|bantuan|kategori|datei|benutzer|spezial|fichier|utilisateur|catégorie|archivo|usuario|especial|ayuda|plantilla|利用者|特別|ファイル|ノート|wikipedia|wikipédia|wikiproyecto)/i;

export function looksLikeArticle(title) {
  const t = String(title || '');
  if (!t || t.length < 2 || t.length > 90) return false;
  if (t.includes(':')) return false;
  if (NS0_BLOCK.test(t)) return false;
  const low = titleKey(t);
  for (const bad of ['disambiguation', 'daftar', 'begriffsklärung', 'homonymie', 'desambiguación', '曖昧さ回避', 'may refer to', 'can refer to', 'list of', 'lists of', 'index of', 'outline of', 'timeline of', 'glossary of']) {
    if (low.includes(bad)) return false;
  }
  // "Liste der …" / "Lista de …" style list pages.
  if (/^(list|liste|lista|一覧|daftar)\b/i.test(t)) return false;
  return true;
}

/**
 * Picks a random article, preferring the local popularity pool so challenges
 * are always real, playable articles (never a deleted page or a stub).
 */
export async function randomArticle(lang, { seed = null, minPopularIndex = 0, maxPopularIndex = null, signal, allowApi = true } = {}) {
  const rand = seed === null || seed === undefined ? Math.random : mulberry32(seed);
  try {
    const pool = await getPopularTitles(lang, { signal });
    if (pool && pool.length) {
      const hi = Math.min(pool.length, maxPopularIndex ?? pool.length);
      const lo = Math.min(minPopularIndex, Math.max(0, hi - 1));
      const idx = lo + Math.floor(rand() * Math.max(1, hi - lo));
      const title = pool[idx];
      if (looksLikeArticle(title)) return title;
    }
  } catch { /* fall through to the API */ }
  if (!allowApi) return null;
  const titles = await getRandomTitles(lang, 5, { signal });
  const good = titles.find(looksLikeArticle);
  return good || titles[0] || null;
}

export async function randomArticles(lang, count, opts = {}) {
  const out = [];
  const seen = new Set();
  let guard = 0;
  while (out.length < count && guard < count * 6) {
    guard += 1;
    const t = await randomArticle(lang, { ...opts, seed: opts.seed ? opts.seed + guard * 7919 : null });
    if (!t) break;
    const k = titleKey(t);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(t);
  }
  return out;
}
