/* ui/router.js — application shell: navigation, header, bottom nav, theme,
 * offline indicator, lazy screen loading and global error handling.
 */

import { el, $, isOnline, prefersDark, prefersReducedMotion, titleKey } from '../core/util.js';
import { t, setUiLanguage, detectUiLanguage, onLanguageChange, getUiLanguage } from '../core/i18n.js';
import { Settings } from '../storage/settings.js';
import { game } from '../game/gameState.js';
import { getScreen, NAV_ITEMS, hasScreen } from './screens/index.js';
import { notify } from './notifications.js';
import { playSound, unlockAudio } from './sound.js';

/** Screens that are code-split (loaded on first visit). */
const LAZY_SCREENS = {
  stats: () => import('./screens/stats.js'),
  achievements: () => import('./screens/achievements.js'),
  profile: () => import('./screens/profile.js'),
  settings: () => import('./screens/settings.js'),
  bookmarks: () => import('./screens/bookmarks.js'),
  leaderboard: () => import('./screens/leaderboard.js'),
  replay: () => import('./screens/replay.js'),
  results: () => import('./screens/results.js'),
};

export class Router {
  constructor(root) {
    this.root = root;
    this.current = null;
    this.currentId = null;
    this.instances = new Map();
    this.params = {};
    this.history = [];
    this.deferredInstall = null;
    this.wakeLock = null;
    this._beforeUnload = null;
  }

  /* ---------------------------------------------------------------- */
  /* Shell                                                            */
  /* ---------------------------------------------------------------- */

  build() {
    const header = el('header', { class: 'app-header', id: 'app-header' });
    const viewport = el('main', { class: 'app-viewport', id: 'app-viewport', tabindex: '-1' });
    const nav = el('nav', { class: 'app-nav', id: 'app-nav', 'aria-label': 'Main navigation' });
    this.header = header;
    this.viewport = viewport;
    this.nav = nav;
    this.root.append(header, viewport, nav);
    this.renderHeader();
    this.renderNav();
    return this;
  }

  renderHeader() {
    const s = Settings.all;
    this.header.innerHTML = '';
    const backBtn = el('button', {
      class: 'icon-btn app-header__back',
      type: 'button',
      'aria-label': t('common.back'),
      text: '←',
      onClick: () => this.back(),
    });
    const brand = el('button', { class: 'app-header__brand', type: 'button', onClick: () => this.navigate('home') }, [
      el('span', { class: 'app-header__logo', text: '🏁', 'aria-hidden': 'true' }),
      el('span', { class: 'app-header__name', text: t('app.short') }),
    ]);
    const status = el('span', { class: 'app-header__status', id: 'net-status' });
    const themeBtn = el('button', {
      class: 'icon-btn',
      type: 'button',
      title: t('settings.theme'),
      'aria-label': t('settings.theme'),
      text: s.theme === 'dark' ? '🌙' : s.theme === 'light' ? '☀️' : '🖥',
      onClick: () => {
        const order = ['system', 'light', 'dark'];
        const next = order[(order.indexOf(Settings.get('theme')) + 1) % order.length];
        Settings.set({ theme: next });
        this.applyTheme();
        this.renderHeader();
      },
    });
    const langBtn = el('button', {
      class: 'icon-btn app-header__lang',
      type: 'button',
      title: t('settings.uiLanguage'),
      'aria-label': t('settings.uiLanguage'),
      text: getUiLanguage().toUpperCase(),
      onClick: () => {
        const next = getUiLanguage() === 'en' ? 'id' : 'en';
        Settings.set({ uiLanguage: next });
        setUiLanguage(next);
        this.renderHeader();
        this.renderNav();
        this.rerender();
      },
    });
    const installBtn = el('button', {
      class: 'icon-btn app-header__install is-hidden',
      type: 'button',
      title: t('settings.installApp'),
      'aria-label': t('settings.installApp'),
      text: '📲',
      onClick: () => this.promptInstall(),
    });
    this.installBtn = installBtn;

    this.header.append(backBtn, brand, el('div', { class: 'app-header__spacer' }), status, langBtn, themeBtn, installBtn);
    this.updateStatus();
  }

  renderNav() {
    this.nav.innerHTML = '';
    for (const item of NAV_ITEMS) {
      const btn = el('button', {
        class: `app-nav__item ${this.currentId === item.id ? 'is-active' : ''}`,
        type: 'button',
        dataset: { screen: item.id },
        'aria-current': this.currentId === item.id ? 'page' : null,
        onClick: () => this.navigate(item.id),
      }, [
        el('span', { class: 'app-nav__icon', text: item.icon, 'aria-hidden': 'true' }),
        el('span', { class: 'app-nav__label', text: t(item.labelKey) }),
      ]);
      this.nav.appendChild(btn);
    }
  }

  updateStatus() {
    const node = $('#net-status', this.header);
    if (!node) return;
    const online = isOnline();
    node.textContent = online ? '' : `📴 ${t('common.offline')}`;
    node.classList.toggle('is-offline', !online);
    document.body.classList.toggle('is-offline', !online);
  }

  /* ---------------------------------------------------------------- */
  /* Theme / appearance                                               */
  /* ---------------------------------------------------------------- */

  applyTheme() {
    const s = Settings.all;
    const dark = s.theme === 'dark' || (s.theme === 'system' && prefersDark());
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    document.documentElement.dataset.skin = s.skin || 'classic';
    document.documentElement.classList.toggle('no-animations', !s.animations || prefersReducedMotion());
    document.documentElement.classList.toggle('compact-hud', Boolean(s.compactHud));
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', dark ? '#0d1117' : '#f6f7fb');
  }

  /* ---------------------------------------------------------------- */
  /* Navigation                                                       */
  /* ---------------------------------------------------------------- */

  async ensureScreen(id) {
    if (!hasScreen(id)) {
      if (LAZY_SCREENS[id]) {
        await LAZY_SCREENS[id]();
        if (!hasScreen(id)) throw new Error(`Screen "${id}" did not register itself`);
      } else {
        throw new Error(`Unknown screen: ${id}`);
      }
    }
    if (!this.instances.has(id)) {
      const entry = getScreen(id);
      const instance = entry.factory({
        navigate: (target, params) => this.navigate(target, params),
        back: () => this.back(),
        canInstall: () => Boolean(this.deferredInstall),
        install: () => this.promptInstall(),
        params: this.params,
        router: this,
      });
      this.instances.set(id, instance);
    }
    return this.instances.get(id);
  }

  async navigate(id, params = {}, { replace = false } = {}) {
    if (id === this.currentId && !params.force) {
      // Same screen: just refresh it.
      const inst = this.instances.get(id);
      if (inst && inst.onShow) inst.onShow(params);
      this.params = params;
      return;
    }
    let instance;
    try {
      instance = await this.ensureScreen(id);
    } catch (err) {
      console.error('[router] failed to open screen', id, err);
      notify.error(t('error.title'));
      if (id !== 'home') return this.navigate('home');
      return;
    }

    if (this.current && this.current.onHide) {
      try { this.current.onHide(); } catch (err) { console.error(err); }
    }
    if (this.current && this.current.el && this.current.el.parentNode) this.current.el.remove();

    this.history.push({ id: this.currentId, params: this.params });
    if (this.history.length > 40) this.history.shift();
    this.current = instance;
    this.currentId = id;
    this.params = params || {};

    this.viewport.appendChild(instance.el);
    this.viewport.scrollTop = 0;
    if (document.scrollingElement) document.scrollingElement.scrollTop = 0;

    try {
      if (instance.onShow) await instance.onShow(this.params);
    } catch (err) {
      console.error('[router] onShow failed', err);
      notify.error(t('error.title'));
    }

    this.renderNav();
    this.syncHash(id, params);
    this.updateBodyClass();
  }

  back(fallback = 'home') {
    const prev = this.history.pop();
    if (prev && prev.id && prev.id !== this.currentId) return this.navigate(prev.id, prev.params || {});
    if (this.currentId !== fallback) return this.navigate(fallback);
    return null;
  }

  rerender() {
    if (this.currentId) this.navigate(this.currentId, this.params);
  }

  updateBodyClass() {
    document.body.dataset.screen = this.currentId || '';
    document.body.classList.toggle('is-playing', this.currentId === 'game');
    const inGame = this.currentId === 'game';
    this.nav.classList.toggle('is-hidden', inGame);
    this.header.classList.toggle('is-compact', inGame);
  }

  /* ---------------------------------------------------------------- */
  /* Hash routing (deep links / back button)                          */
  /* ---------------------------------------------------------------- */

  syncHash(id, params) {
    try {
      const hash = `#/${id}`;
      if (location.hash !== hash) history.replaceState(null, '', hash);
    } catch { /* ignore */ }
  }

  readHash() {
    const raw = String(location.hash || '').replace(/^#\/?/, '');
    if (!raw) return null;
    const [id] = raw.split('?');
    return hasScreen(id) || LAZY_SCREENS[id] ? id : null;
  }

  /* ---------------------------------------------------------------- */
  /* PWA install                                                      */
  /* ---------------------------------------------------------------- */

  captureInstallPrompt() {
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      this.deferredInstall = e;
      if (this.installBtn) this.installBtn.classList.remove('is-hidden');
    });
    window.addEventListener('appinstalled', () => {
      this.deferredInstall = null;
      if (this.installBtn) this.installBtn.classList.add('is-hidden');
      notify.success(t('home.installed'), { icon: '📲' });
    });
  }

  async promptInstall() {
    if (!this.deferredInstall) {
      notify.info(t('settings.installHint'), { icon: '📲', duration: 6000 });
      return false;
    }
    this.deferredInstall.prompt();
    const choice = await this.deferredInstall.userChoice;
    if (choice && choice.outcome === 'accepted') notify.success(t('home.installed'));
    this.deferredInstall = null;
    if (this.installBtn) this.installBtn.classList.add('is-hidden');
    return choice && choice.outcome === 'accepted';
  }

  /* ---------------------------------------------------------------- */
  /* Global behaviours                                                */
  /* ---------------------------------------------------------------- */

  bindGlobal() {
    window.addEventListener('online', () => { this.updateStatus(); notify.success(t('common.online'), { icon: '🌐', duration: 1800 }); });
    window.addEventListener('offline', () => { this.updateStatus(); notify.warn(t('common.offlineNotice'), { icon: '📴', duration: 5000 }); });

    const mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
    if (mq && mq.addEventListener) mq.addEventListener('change', () => { if (Settings.get('theme') === 'system') this.applyTheme(); });

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        if (Settings.get('autoPauseOnBlur') && game.state.status === 'playing') game.pause();
        this.releaseWakeLock();
      } else {
        this.updateStatus();
        if (this.currentId === 'game') this.requestWakeLock();
      }
    });

    window.addEventListener('hashchange', () => {
      const id = this.readHash();
      if (id && id !== this.currentId) this.navigate(id, {});
    });

    window.addEventListener('keydown', (e) => {
      if (e.target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;
      if (e.altKey && e.key >= '1' && e.key <= '7') {
        const item = NAV_ITEMS[Number(e.key) - 1];
        if (item) { e.preventDefault(); this.navigate(item.id); }
      }
    });

    window.addEventListener('error', (e) => {
      console.error('[window error]', e.error || e.message);
    });
    window.addEventListener('unhandledrejection', (e) => {
      console.error('[unhandled rejection]', e.reason);
    });
  }

  async requestWakeLock() {
    if (!Settings.get('keepScreenAwake') || this.wakeLock) return;
    try {
      if (navigator.wakeLock && navigator.wakeLock.request) {
        this.wakeLock = await navigator.wakeLock.request('screen');
        this.wakeLock.addEventListener('release', () => { this.wakeLock = null; });
      }
    } catch { /* not supported / denied — not fatal */ }
  }

  releaseWakeLock() {
    if (this.wakeLock) {
      try { this.wakeLock.release(); } catch { /* noop */ }
      this.wakeLock = null;
    }
  }

  async start(defaultScreen = 'home') {
    this.build();
    this.captureInstallPrompt();
    this.bindGlobal();
    this.applyTheme();
    setUiLanguage(Settings.get('uiLanguage') || detectUiLanguage());
    onLanguageChange(() => { this.renderNav(); this.renderHeader(); });
    const initial = this.readHash() || defaultScreen;
    await this.navigate(initial, {});
    return this;
  }
}
