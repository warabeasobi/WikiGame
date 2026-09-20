/* core/util.js — dependency-free shared helpers used across the whole app. */

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

/** Tiny hyperscript helper. */
export function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class' || k === 'className') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
    else node.setAttribute(k, v === true ? '' : String(v));
  }
  const list = Array.isArray(children) ? children : [children];
  for (const c of list) {
    if (c === null || c === undefined || c === false) continue;
    node.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return node;
}

export function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function escapeRegExp(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/* ------------------------------------------------------------------ */
/* Titles                                                             */
/* ------------------------------------------------------------------ */

/**
 * Canonicalises a Wikipedia title: URL-decoded, underscores -> spaces,
 * whitespace collapsed, NFC normalised, first letter upper-cased
 * (MediaWiki treats the first character as case-insensitive).
 */
export function normalizeTitle(input) {
  if (input === null || input === undefined) return '';
  let t = String(input);
  try { t = decodeURIComponent(t); } catch { /* keep raw */ }
  t = t.replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
  if (!t) return '';
  t = t.normalize('NFC');
  const first = t[0];
  return first.toLocaleUpperCase() + t.slice(1);
}

/** Case-insensitive comparison key. */
export function titleKey(input) {
  return normalizeTitle(input).toLocaleLowerCase();
}

export function sameTitle(a, b) {
  const na = normalizeTitle(a);
  const nb = normalizeTitle(b);
  return na === nb || na.toLocaleLowerCase() === nb.toLocaleLowerCase();
}

/** Turns a title into the canonical URL slug (spaces -> underscores). */
export function titleSlug(input) {
  return encodeURIComponent(normalizeTitle(input).replace(/ /g, '_'));
}

/** Pretty-prints a title for display (keeps the wiki's own spelling). */
export function displayTitle(input) {
  return normalizeTitle(input);
}

/* ------------------------------------------------------------------ */
/* Formatting                                                         */
/* ------------------------------------------------------------------ */

/** 01:42.34 — stopwatch style, supports hours. */
export function formatTime(ms, { showMs = true } = {}) {
  if (!Number.isFinite(ms)) ms = 0;
  const neg = ms < 0;
  ms = Math.abs(ms);
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const cs = Math.floor((ms % 1000) / 10);
  let out;
  if (h > 0) out = `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  else out = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  if (showMs) out += `.${String(cs).padStart(2, '0')}`;
  return (neg ? '-' : '') + out;
}

/** 1:42 — compact clock for HUD chips. */
export function formatClock(ms) {
  return formatTime(Math.max(0, ms), { showMs: false });
}

export function formatNumber(n, locale) {
  const v = Number(n);
  if (!Number.isFinite(v)) return '0';
  try { return v.toLocaleString(locale || undefined); } catch { return String(v); }
}

export function formatDurationWords(ms) {
  const s = Math.round((ms || 0) / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rs = s % 60;
  if (m < 60) return rs ? `${m}m ${rs}s` : `${m}m`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return rm ? `${h}h ${rm}m` : `${h}h`;
}

export function formatRelative(ts, lang = 'en') {
  if (!ts) return '—';
  const diff = Date.now() - ts;
  const mins = Math.round(diff / 60000);
  const rtf = typeof Intl !== 'undefined' && Intl.RelativeTimeFormat ? new Intl.RelativeTimeFormat(lang, { numeric: 'auto' }) : null;
  const say = (v, unit) => (rtf ? rtf.format(-v, unit) : `${v} ${unit}${v === 1 ? '' : 's'} ago`);
  if (mins < 1) return say(0, 'minute') === '' ? 'just now' : (rtf ? rtf.format(0, 'minute') : 'just now');
  if (mins < 60) return say(mins, 'minute');
  const hours = Math.round(mins / 60);
  if (hours < 24) return say(hours, 'hour');
  const days = Math.round(hours / 24);
  if (days < 30) return say(days, 'day');
  return new Date(ts).toLocaleDateString(lang);
}

export function formatDateKey(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function truncate(str, n = 120) {
  const s = String(str ?? '');
  return s.length <= n ? s : `${s.slice(0, n - 1).trimEnd()}…`;
}

export function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

/* ------------------------------------------------------------------ */
/* Math / RNG                                                         */
/* ------------------------------------------------------------------ */

export const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

export function mean(arr) {
  if (!arr || !arr.length) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

export function median(arr) {
  if (!arr || !arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export function uid(prefix = 'id') {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

/** Deterministic 32-bit string hash (FNV-1a style). */
export function hashString(str) {
  let h = 2166136261 >>> 0;
  const s = String(str);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Seeded PRNG — deterministic across devices. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const pickRandom = (arr, rand = Math.random) => (arr && arr.length ? arr[Math.floor(rand() * arr.length)] : undefined);

export function shuffle(arr, rand = Math.random) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function sample(arr, n, rand = Math.random) {
  return shuffle(arr, rand).slice(0, n);
}

/* ------------------------------------------------------------------ */
/* Time helpers                                                       */
/* ------------------------------------------------------------------ */

/** Local calendar day key: 2026-09-20. */
export function dayKey(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function dayKeyOffset(offsetDays, date = new Date()) {
  const d = new Date(date.getTime());
  d.setDate(d.getDate() + offsetDays);
  return dayKey(d);
}

export function humanDate(key, locale = 'en') {
  const [y, m, d] = String(key).split('-').map(Number);
  if (!y || !m || !d) return String(key);
  try {
    return new Date(y, m - 1, d).toLocaleDateString(locale, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  } catch { return key; }
}

/* ------------------------------------------------------------------ */
/* Functional helpers                                                 */
/* ------------------------------------------------------------------ */

export function debounce(fn, ms = 200) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

export function throttle(fn, ms = 100) {
  let last = 0;
  let timer = null;
  let lastArgs = null;
  return (...args) => {
    const now = Date.now();
    lastArgs = args;
    if (now - last >= ms) { last = now; fn(...args); }
    else if (!timer) {
      timer = setTimeout(() => { timer = null; last = Date.now(); fn(...lastArgs); }, ms - (now - last));
    }
  };
}

export function safeJsonParse(str, fallback = null) {
  try {
    const v = JSON.parse(str);
    return v === null || v === undefined ? fallback : v;
  } catch { return fallback; }
}

export function deepMerge(base, patch) {
  if (Array.isArray(base) || Array.isArray(patch)) return patch === undefined ? base : patch;
  if (typeof base !== 'object' || base === null) return patch === undefined ? base : patch;
  if (typeof patch !== 'object' || patch === null) return base;
  const out = { ...base };
  for (const [k, v] of Object.entries(patch)) out[k] = deepMerge(base[k], v);
  return out;
}

export function sumBy(arr, fn) {
  return (arr || []).reduce((acc, item) => acc + (Number(fn(item)) || 0), 0);
}

export function groupBy(arr, fn) {
  const out = new Map();
  for (const item of arr || []) {
    const k = fn(item);
    if (!out.has(k)) out.set(k, []);
    out.get(k).push(item);
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* DOM / browser                                                      */
/* ------------------------------------------------------------------ */

export class Emitter {
  constructor() { this._handlers = new Map(); }

  on(type, fn) {
    if (!this._handlers.has(type)) this._handlers.set(type, new Set());
    this._handlers.get(type).add(fn);
    return () => this.off(type, fn);
  }

  once(type, fn) {
    const off = this.on(type, (payload) => { off(); fn(payload); });
    return off;
  }

  off(type, fn) {
    const set = this._handlers.get(type);
    if (!set) return;
    if (fn) set.delete(fn);
    else set.clear();
  }

  emit(type, payload) {
    const set = this._handlers.get(type);
    if (set) for (const fn of [...set]) {
      try { fn(payload); } catch (err) { console.error(`[emitter] handler for "${type}" failed`, err); }
    }
    const wildcard = this._handlers.get('*');
    if (wildcard) for (const fn of [...wildcard]) {
      try { fn({ type, payload }); } catch (err) { console.error(err); }
    }
  }
}

export function prefersReducedMotion() {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function prefersDark() {
  return typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches;
}

export function isOnline() {
  return typeof navigator === 'undefined' ? true : navigator.onLine !== false;
}

export async function copyText(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch { /* fall through to legacy path */ }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;top:-1000px;opacity:0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch { return false; }
}

export function downloadFile(filename, content, type = 'application/json') {
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function haptic(ms = 12) {
  try { if (navigator.vibrate) navigator.vibrate(ms); } catch { /* unsupported */ }
}

/** rAF-driven interval that pauses when the tab is hidden. */
export function rafLoop(fn, intervalMs = 100) {
  let raf = 0;
  let last = 0;
  let stopped = false;
  const step = (ts) => {
    if (stopped) return;
    if (!last) last = ts;
    if (ts - last >= intervalMs) { last = ts; fn(ts); }
    raf = requestAnimationFrame(step);
  };
  raf = requestAnimationFrame(step);
  return () => { stopped = true; cancelAnimationFrame(raf); };
}
