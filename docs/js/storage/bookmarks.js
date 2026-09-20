/* storage/bookmarks.js — saved articles, favourite routes, favourite challenges. */

import { Doc, KEYS } from '../core/store.js';
import { Emitter, uid, titleKey, dayKey } from '../core/util.js';

const DEFAULTS = { articles: [], routes: [], challenges: [] };
const emitter = new Emitter();
let doc = null;

export const Bookmarks = {
  init() {
    doc = new Doc(KEYS.bookmarks, DEFAULTS, { version: 1 });
    return doc.data;
  },
  get all() { return doc.data; },
  get articles() { return doc.data.articles; },
  get routes() { return doc.data.routes; },
  get challenges() { return doc.data.challenges; },
  get count() { return doc.data.articles.length + doc.data.routes.length + doc.data.challenges.length; },

  isArticleSaved(lang, title) {
    const key = titleKey(title);
    return doc.data.articles.some((a) => a.lang === lang && titleKey(a.title) === key);
  },

  saveArticle({ lang, title, description = '', thumbnail = null, note = '' }) {
    if (this.isArticleSaved(lang, title)) return false;
    doc.update((d) => {
      d.articles.unshift({ id: uid('art'), lang, title, description, thumbnail, note, ts: Date.now() });
      d.articles = d.articles.slice(0, 300);
    });
    emitter.emit('change', { type: 'articles' });
    emitter.emit('saved', { type: 'article', lang, title });
    return true;
  },

  toggleArticle(article) {
    if (this.isArticleSaved(article.lang, article.title)) {
      this.removeArticle(article.lang, article.title);
      return false;
    }
    this.saveArticle(article);
    return true;
  },

  removeArticle(lang, title) {
    const key = titleKey(title);
    doc.update((d) => { d.articles = d.articles.filter((a) => !(a.lang === lang && titleKey(a.title) === key)); });
    emitter.emit('change', { type: 'articles' });
  },

  saveRoute({ name, lang, start, target, clicks, elapsedMs, route, difficulty, mode, score = 0 }) {
    const existing = doc.data.routes.find((r) => r.lang === lang
      && titleKey(r.start) === titleKey(start) && titleKey(r.target) === titleKey(target)
      && r.clicks === clicks && Math.abs((r.elapsedMs || 0) - (elapsedMs || 0)) < 1500);
    if (existing) return false;
    doc.update((d) => {
      d.routes.unshift({
        id: uid('route'),
        name: name || `${start} → ${target}`,
        lang, start, target, clicks, elapsedMs, route, difficulty, mode, score,
        ts: Date.now(),
      });
      d.routes = d.routes.slice(0, 100);
    });
    emitter.emit('change', { type: 'routes' });
    emitter.emit('saved', { type: 'route' });
    return true;
  },

  removeRoute(id) {
    doc.update((d) => { d.routes = d.routes.filter((r) => r.id !== id); });
    emitter.emit('change', { type: 'routes' });
  },

  saveChallenge({ name, lang, start, target, difficulty, mode = 'custom', timeLimitMs = 0, seed = null, day = null }) {
    const existing = doc.data.challenges.find((c) => c.lang === lang
      && titleKey(c.start) === titleKey(start) && titleKey(c.target) === titleKey(target));
    if (existing) return false;
    doc.update((d) => {
      d.challenges.unshift({
        id: uid('chal'),
        name: name || `${start} → ${target}`,
        lang, start, target, difficulty, mode, timeLimitMs, seed,
        day: day || dayKey(),
        ts: Date.now(),
      });
      d.challenges = d.challenges.slice(0, 100);
    });
    emitter.emit('change', { type: 'challenges' });
    emitter.emit('saved', { type: 'challenge' });
    return true;
  },

  removeChallenge(id) {
    doc.update((d) => { d.challenges = d.challenges.filter((c) => c.id !== id); });
    emitter.emit('change', { type: 'challenges' });
  },

  reset() {
    doc.reset();
    emitter.emit('change', { type: 'all' });
  },

  on(fn) { return emitter.on('change', fn); },
  onSave(fn) { return emitter.on('saved', fn); },
  export() { return JSON.parse(JSON.stringify(doc.data)); },
  import(data) {
    doc.data = { ...JSON.parse(JSON.stringify(DEFAULTS)), ...(data || {}) };
    doc.save();
    emitter.emit('change', { type: 'all' });
  },
};
