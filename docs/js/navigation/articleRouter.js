/* navigation/articleRouter.js — intercepts clicks inside rendered article
 * content, handles link previews (hover on desktop, long-press on touch) and
 * makes sure the browser never leaves the app for an internal link. */

import { Emitter, debounce } from '../core/util.js';
import { getSummary, describeError, articleUrl } from '../api/wikipedia.js';
import { isBlockedNamespace } from './articleParser.js';

const HOVER_DELAY = 320;
const LONG_PRESS_MS = 460;

export class ArticleRouter extends Emitter {
  /**
   * @param {HTMLElement} container element that holds rendered article content
   * @param {object} options
   * @param {() => string} options.getLang
   * @param {(title: string, meta: object) => void} options.onNavigate
   * @param {(title: string) => void} [options.onBlocked]
   * @param {(title: string) => boolean} [options.isVisited]
   * @param {boolean} [options.previews] enable hover/tap previews
   * @param {number} [options.scanScore] fn(title) -> relevance score for the scanner
   */
  constructor(container, options = {}) {
    super();
    this.container = container;
    this.opts = options;
    this.previews = options.previews !== false;
    this.previewEl = null;
    this.previewCache = new Map();
    this._hoverTimer = null;
    this._pressTimer = null;
    this._pressed = null;
    this._longPressFired = false;
    this._scanScores = null;
    this._bound = false;
  }

  get lang() {
    return (typeof this.opts.getLang === 'function' ? this.opts.getLang() : this.opts.getLang) || 'en';
  }

  attach() {
    if (this._bound) return this;
    this._bound = true;
    const c = this.container;
    c.addEventListener('click', this._onClick, true);
    c.addEventListener('pointerdown', this._onPointerDown, true);
    c.addEventListener('pointerup', this._onPointerUp, true);
    c.addEventListener('pointercancel', this._clearPress, true);
    c.addEventListener('pointerover', this._onPointerOver);
    c.addEventListener('pointerout', this._onPointerOut);
    c.addEventListener('focusin', this._onFocusIn);
    c.addEventListener('focusout', this._onFocusOut);
    c.addEventListener('keydown', this._onKeyDown, true);
    c.addEventListener('contextmenu', this._onContextMenu);
    if (typeof window !== 'undefined') {
      window.addEventListener('scroll', this._hidePreview, { passive: true });
      window.addEventListener('resize', this._hidePreview);
    }
    return this;
  }

  detach() {
    if (!this._bound) return this;
    this._bound = false;
    const c = this.container;
    c.removeEventListener('click', this._onClick, true);
    c.removeEventListener('pointerdown', this._onPointerDown, true);
    c.removeEventListener('pointerup', this._onPointerUp, true);
    c.removeEventListener('pointercancel', this._clearPress, true);
    c.removeEventListener('pointerover', this._onPointerOver);
    c.removeEventListener('pointerout', this._onPointerOut);
    c.removeEventListener('focusin', this._onFocusIn);
    c.removeEventListener('focusout', this._onFocusOut);
    c.removeEventListener('keydown', this._onKeyDown, true);
    c.removeEventListener('contextmenu', this._onContextMenu);
    if (typeof window !== 'undefined') {
      window.removeEventListener('scroll', this._hidePreview, { passive: true });
      window.removeEventListener('resize', this._hidePreview);
    }
    this._hidePreview();
    return this;
  }

  /** Adds relevance highlighting (Link scanner power-up). */
  applyScanScores(scores) {
    this.clearScan();
    if (!scores) return;
    this._scanScores = scores;
    const max = Math.max(...scores.values(), 1);
    for (const a of Array.from(this.container.querySelectorAll('a.wsr-link[data-wsr-title]'))) {
      const score = scores.get(a.getAttribute('data-wsr-title')) || 0;
      if (score > 0) {
        a.classList.add('wsr-relevant');
        a.style.setProperty('--wsr-relevance', String(Math.min(1, score / max).toFixed(2)));
      }
    }
  }

  clearScan() {
    this._scanScores = null;
    for (const a of Array.from(this.container.querySelectorAll('a.wsr-relevant'))) {
      a.classList.remove('wsr-relevant');
      a.style.removeProperty('--wsr-relevance');
    }
  }

  /* ---------------------------------------------------------------- */
  /* Click handling                                                    */
  /* ---------------------------------------------------------------- */

  _linkFrom(target) {
    if (!target || typeof target.closest !== 'function') return null;
    const a = target.closest('a');
    if (!a || !this.container.contains(a)) return null;
    return a;
  }

  _onClick = (event) => {
    const a = this._linkFrom(event.target);
    if (!a) return;
    // Long-press preview already handled the gesture — swallow the click.
    if (this._longPressFired) { this._longPressFired = false; event.preventDefault(); event.stopPropagation(); return; }

    if (a.hasAttribute('data-wsr-title')) {
      event.preventDefault();
      event.stopPropagation();
      this._hidePreview();
      const title = a.getAttribute('data-wsr-title');
      const fragment = a.getAttribute('data-wsr-fragment') || null;
      this.opts.onNavigate && this.opts.onNavigate(title, { fragment, element: a });
      return;
    }
    if (a.hasAttribute('data-wsr-blocked')) {
      event.preventDefault();
      event.stopPropagation();
      const raw = a.getAttribute('data-wsr-blocked') || '';
      const ns = a.getAttribute('data-wsr-namespace') || '';
      this.emit('blocked', { title: raw, namespace: ns, element: a });
      this.opts.onBlocked && this.opts.onBlocked(raw, ns);
      return;
    }
    if (a.hasAttribute('data-wsr-external')) {
      event.preventDefault();
      event.stopPropagation();
      const url = a.getAttribute('href') || '';
      this.emit('external', { url });
      this.opts.onExternal && this.opts.onExternal(url);
      return;
    }
    if (a.hasAttribute('data-wsr-anchor')) {
      event.preventDefault();
      const id = a.getAttribute('data-wsr-anchor');
      const target = id ? this.container.querySelector(`[id="${CSS.escape(id)}"]`) : null;
      if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    if (a.hasAttribute('data-wsr-article') || a.closest('[data-wsr-article]')) {
      event.preventDefault();
      this.emit('ui-link', { href: a.getAttribute('href') });
    }
  };

  _onKeyDown = (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const a = this._linkFrom(event.target);
    if (!a) return;
    if (event.target === a || a.contains(event.target)) {
      event.preventDefault();
      a.click();
    }
  };

  _onContextMenu = (event) => {
    const a = this._linkFrom(event.target);
    if (!a) return;
    // Right click / long press on desktop: offer the preview instead of the menu.
    if (a.hasAttribute('data-wsr-title') && this.previews) {
      event.preventDefault();
      this._showPreview(a.getAttribute('data-wsr-title'), a);
    }
  };

  /* ---------------------------------------------------------------- */
  /* Previews                                                          */
  /* ---------------------------------------------------------------- */

  _onPointerOver = (event) => {
    if (!this.previews || this.opts.previews === false) return;
    if (event.pointerType && event.pointerType !== 'mouse') return;
    const a = this._linkFrom(event.target);
    if (!a || !a.hasAttribute('data-wsr-title')) return;
    clearTimeout(this._hoverTimer);
    this._hoverTimer = setTimeout(() => this._showPreview(a.getAttribute('data-wsr-title'), a), HOVER_DELAY);
  };

  _onPointerOut = (event) => {
    clearTimeout(this._hoverTimer);
    const a = this._linkFrom(event.target);
    if (!a) return;
    if (this.previewEl && this.previewEl.contains(event.relatedTarget)) return;
    this._scheduleHide();
  };

  _onFocusIn = (event) => {
    if (!this.previews) return;
    const a = this._linkFrom(event.target);
    if (!a || !a.hasAttribute('data-wsr-title')) return;
    if (event.target === a) this._showPreview(a.getAttribute('data-wsr-title'), a);
  };

  _onFocusOut = () => this._scheduleHide();

  _onPointerDown = (event) => {
    const a = this._linkFrom(event.target);
    if (!a || !a.hasAttribute('data-wsr-title')) return;
    if (event.pointerType === 'mouse') return;
    this._pressed = a;
    this._longPressFired = false;
    this._pressTimer = setTimeout(() => {
      if (!this._pressed) return;
      this._longPressFired = true;
      try { navigator.vibrate && navigator.vibrate(8); } catch { /* noop */ }
      this._showPreview(this._pressed.getAttribute('data-wsr-title'), this._pressed);
    }, LONG_PRESS_MS);
  };

  _onPointerUp = () => { this._clearPress(); };

  _clearPress = () => {
    clearTimeout(this._pressTimer);
    this._pressTimer = null;
    this._pressed = null;
  };

  _scheduleHide = () => {
    clearTimeout(this._hideTimer);
    this._hideTimer = setTimeout(() => this._hidePreview(), 220);
  };

  _hidePreview = () => {
    clearTimeout(this._hideTimer);
    if (this.previewEl) {
      this.previewEl.classList.remove('is-visible');
      const node = this.previewEl;
      this.previewEl = null;
      setTimeout(() => node.remove(), 150);
    }
  };

  async _showPreview(title, anchor) {
    if (!this.previews || this.opts.previews === false) return;
    this._hidePreview();
    const box = document.createElement('div');
    box.className = 'wsr-preview';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-label', title);
    box.innerHTML = `
      <div class="wsr-preview__thumb" aria-hidden="true"></div>
      <div class="wsr-preview__body">
        <strong class="wsr-preview__title"></strong>
        <p class="wsr-preview__desc"></p>
        <p class="wsr-preview__extract"></p>
      </div>`;
    box.querySelector('.wsr-preview__title').textContent = title;
    box.querySelector('.wsr-preview__desc').textContent = '…';
    document.body.appendChild(box);
    this.previewEl = box;
    positionPreview(box, anchor);
    requestAnimationFrame(() => box.classList.add('is-visible'));

    const lang = this.lang;
    const key = `${lang}:${title}`;
    try {
      let summary = this.previewCache.get(key);
      if (!summary) {
        summary = await getSummary(lang, title);
        this.previewCache.set(key, summary);
        if (this.previewCache.size > 80) this.previewCache.delete(this.previewCache.keys().next().value);
      }
      if (this.previewEl !== box) return;
      box.querySelector('.wsr-preview__desc').textContent = summary.description || '';
      box.querySelector('.wsr-preview__extract').textContent = summary.extract ? `${summary.extract.slice(0, 220)}${summary.extract.length > 220 ? '…' : ''}` : '';
      const thumb = box.querySelector('.wsr-preview__thumb');
      if (summary.thumbnail && summary.thumbnail.url) {
        const img = document.createElement('img');
        img.src = summary.thumbnail.url;
        img.alt = '';
        img.loading = 'lazy';
        img.referrerPolicy = 'no-referrer';
        thumb.appendChild(img);
      } else {
        thumb.classList.add('is-empty');
      }
      positionPreview(box, anchor);
    } catch (err) {
      if (this.previewEl !== box) return;
      box.querySelector('.wsr-preview__desc').textContent = describeError(err, (k) => k);
      box.classList.add('is-error');
    }
  }
}

function positionPreview(box, anchor) {
  const rect = anchor.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const width = Math.min(340, vw - 24);
  box.style.width = `${width}px`;
  const boxH = box.offsetHeight || 190;
  let left = Math.min(Math.max(12, rect.left), vw - width - 12);
  let top = rect.bottom + 10;
  if (top + boxH > vh - 12) top = Math.max(12, rect.top - boxH - 10);
  box.style.left = `${Math.round(left)}px`;
  box.style.top = `${Math.round(top)}px`;
}

/** Opens external links without losing the game (new tab, noopener). */
export function openExternal(url) {
  if (!/^https?:\/\//i.test(String(url))) return false;
  window.open(url, '_blank', 'noopener,noreferrer');
  return true;
}

export { isBlockedNamespace, articleUrl };
